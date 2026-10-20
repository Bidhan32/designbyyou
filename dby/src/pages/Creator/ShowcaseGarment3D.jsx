"use strict";

/*
 * DesignByYou — Showcase read-only 3D garment preview.
 * Does not read or mutate private Fashion Editor projects.
 * Accepts only the sanitized preview_3d object from getShowcaseItem.
 */
import React, {
  Component, Suspense, useEffect, useMemo, useRef, useState,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

const GARMENT_MODELS = Object.freeze({
  tshirt: Object.freeze({
    label: "T-Shirt",
    url: "/models/garments/DBY_Realistic_TShirt_8Regions.glb",
    regions: Object.freeze([
      "frontBody", "backBody", "frontLeftSleeve", "frontRightSleeve",
      "backLeftSleeve", "backRightSleeve", "frontCollar", "backCollar",
    ]),
  }),
  hoodie: Object.freeze({
    label: "Hoodie",
    url: "/models/garments/DBY_Hoodie_Sketchfab_15Regions_BETA.glb",
    regions: Object.freeze([
      "frontBody", "backBody", "frontLeftSleeve", "frontRightSleeve",
      "backLeftSleeve", "backRightSleeve", "frontHood", "backHood",
      "frontPocket", "frontHem", "backHem", "frontLeftCuff",
      "frontRightCuff", "backLeftCuff", "backRightCuff",
    ]),
  }),
});

const CAMERA_POSITIONS = Object.freeze({
  perspective: [3.3, 1.5, 5.1],
  front: [0, 0, 5.4],
  back: [0, 0, -5.4],
  left: [-5.4, 0, 0],
  right: [5.4, 0, 0],
});
const COLOUR_RE = /^#[0-9a-f]{6}$/i;
const safeColour = (colour) =>
  typeof colour === "string" && COLOUR_RE.test(colour) ? colour : "#ffffff";

function projectedUv(geometry, regionId, bounds) {
  const owned = geometry.clone();
  const positions = owned.getAttribute("position");
  if (!positions) return owned;
  const width = Math.max(1e-6, bounds.max.x - bounds.min.x);
  const height = Math.max(1e-6, bounds.max.y - bounds.min.y);
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i += 1) {
    const x = (positions.getX(i) - bounds.min.x) / width;
    const y = (positions.getY(i) - bounds.min.y) / height;
    uv[2 * i] = regionId.startsWith("back") ? 1 - x : x;
    uv[2 * i + 1] = y;
  }
  owned.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return owned;
}

function collectBounds(meshes) {
  const box = new THREE.Box3();
  for (const mesh of meshes) {
    if (!mesh.geometry.getAttribute("position")) continue;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox);
  }
  return box;
}

function readOverlay(source) {
  return new Promise((resolve, reject) => {
    if (typeof source !== "string" ||
        !/^data:image\/(png|jpe?g|webp);base64,/i.test(source)) {
      reject(new Error("Unsupported published artwork preview."));
      return;
    }
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Published artwork could not be decoded."));
    image.src = source;
  });
}

async function makeTexture(source, colour) {
  const image = await readOverlay(source);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.min(1024, image.naturalWidth || image.width));
  canvas.height = Math.max(1, Math.min(1024, image.naturalHeight || image.height));
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Unable to render published garment texture.");
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
}

function PublishedGarment({ preview, configuration }) {
  const { scene } = useGLTF(configuration.url);
  const { invalidate } = useThree();

  const prepared = useMemo(() => {
    const instance = scene.clone(true);
    const regions = new Map();
    const materials = new Map();
    const geometriesOwned = [];
    const materialsOwned = [];
    const textures = new Map();

    function visit(node, parentRegion = null) {
      const id = configuration.regions.includes(node.name) ? node.name : parentRegion;
      if (node.isMesh) {
        if (id) {
          const meshes = regions.get(id) || [];
          meshes.push(node);
          regions.set(id, meshes);
        }
        const originals = Array.isArray(node.material) ? node.material : [node.material];
        const owned = originals.map((mat) => {
          const material = mat.clone();
          material.side = THREE.DoubleSide;
          if ("metalness" in material) material.metalness = 0;
          if ("roughness" in material) material.roughness = 0.86;
          materialsOwned.push(material);
          return material;
        });
        node.material = Array.isArray(node.material) ? owned : owned[0];
        if (id) materials.set(id, [...(materials.get(id) || []), ...owned]);
      }
      node.children.forEach((child) => visit(child, id));
    }
    visit(instance);
    for (const [regionId, meshes] of regions) {
      const bounds = collectBounds(meshes);
      if (bounds.isEmpty()) continue;
      for (const mesh of meshes) {
        mesh.geometry = projectedUv(mesh.geometry, regionId, bounds);
        geometriesOwned.push(mesh.geometry);
      }
    }
    instance.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(instance);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    instance.position.sub(center);
    const scale = 2.65 / Math.max(size.x, size.y, size.z, 0.001);
    return { instance, scale, materials, materialsOwned, geometriesOwned, textures };
  }, [scene, configuration]);

  useEffect(() => {
    let active = true;
    // Preview data never contains editing layers: only final flattened artwork.
    const tasks = configuration.regions.map(async (id) => {
      const mats = prepared.materials.get(id) || [];
      if (!mats.length) return;
      const colour = safeColour(preview.colours?.[id]);
      const source = preview.artwork?.[id]?.source;
      let texture = null;
      if (source) {
        try {
          texture = await makeTexture(source, colour);
        } catch (error) {
          console.warn("3D artwork preview skipped for", id, error?.message);
        }
      }
      if (!active) {
        texture?.dispose();
        return;
      }
      const previous = prepared.textures.get(id);
      for (const mat of mats) {
        mat.map = texture;
        mat.color?.set(texture ? "#ffffff" : colour);
        mat.needsUpdate = true;
      }
      if (texture) prepared.textures.set(id, texture);
      else prepared.textures.delete(id);
      if (previous && previous !== texture) previous.dispose();
      invalidate();
    });
    void Promise.all(tasks);
    return () => { active = false; };
  }, [prepared, preview, configuration, invalidate]);

  useEffect(() => () => {
    prepared.textures.forEach((texture) => texture.dispose());
    prepared.geometriesOwned.forEach((geometry) => geometry.dispose());
    prepared.materialsOwned.forEach((material) => material.dispose());
  }, [prepared]);

  return <group scale={prepared.scale}><primitive object={prepared.instance} dispose={null}/></group>;
}

function ReadonlyCamera({ view, resetKey }) {
  const controls = useRef(null);
  const { camera, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(...(CAMERA_POSITIONS[view] || CAMERA_POSITIONS.perspective));
    camera.lookAt(0, 0, 0);
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
    invalidate();
  }, [view, resetKey, camera, invalidate]);
  return (
    <OrbitControls
      ref={controls} makeDefault enableDamping dampingFactor={0.08}
      enablePan={false} minDistance={2.3} maxDistance={13}
      minPolarAngle={0.08} maxPolarAngle={Math.PI - 0.08}
    />
  );
}

class PreviewErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: false };
  }
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error) { console.error("3D Showcase preview failed:", error); }
  render() {
    if (this.state.error) {
      return <div role="status" className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">This 3D preview is temporarily unavailable. The 2D images are still available.</div>;
    }
    return this.props.children;
  }
}

export default function ShowcaseGarment3D({ preview }) {
  const [view, setView] = useState("perspective");
  const [resetKey, setResetKey] = useState(0);
  const options = [
    { id: "perspective", label: "3/4" }, { id: "front", label: "Front" },
    { id: "back", label: "Back" }, { id: "left", label: "Left" },
    { id: "right", label: "Right" },
  ];
  const model = typeof preview?.model === "string" ? preview.model : "";
  const configuration = Object.hasOwn(GARMENT_MODELS, model)
    ? GARMENT_MODELS[model] : null;
  if (!configuration) return null;
  return (
    <section className="flex h-full min-h-0 w-full flex-col bg-gradient-to-b from-slate-200 via-slate-100 to-slate-300 dark:from-slate-700 dark:via-slate-800 dark:to-slate-950" aria-label={`Read-only interactive 3D ${configuration.label} preview`}>
      <div className="relative min-h-0 flex-1">
        <PreviewErrorBoundary key={configuration.url}>
          <Canvas
            dpr={[1, 1.5]} frameloop="demand"
            camera={{ position: CAMERA_POSITIONS.perspective, fov: 35, near: 0.1, far: 80 }}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
            style={{ width: "100%", height: "100%" }}
          >
            <ambientLight intensity={1.4}/>
            <hemisphereLight args={["#ffffff", "#475569", 1.4]}/>
            <directionalLight position={[4, 6, 6]} intensity={2.5}/>
            <directionalLight position={[-5, 2, -4]} intensity={1.5}/>
            <Suspense fallback={<Html center><div className="rounded-md bg-black/80 px-4 py-2 text-xs text-white">Loading 3D {configuration.label}…</div></Html>}>
              <PublishedGarment key={configuration.url} preview={preview} configuration={configuration}/>
            </Suspense>
            <ReadonlyCamera view={view} resetKey={resetKey}/>
          </Canvas>
        </PreviewErrorBoundary>
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/70 px-3 py-1.5 text-[11px] text-white">{configuration.label} · Drag to rotate · Scroll to zoom · Preview only</span>
      </div>
      <nav className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-black/10 bg-slate-950/95 p-3" aria-label="3D garment camera controls">
        {options.map(({ id, label }) => (
          <button key={id} type="button" aria-pressed={view === id}
            onClick={() => { setView(id); setResetKey((n) => n + 1); }}
            className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${view === id ? "border-[#D4AF37] bg-[#D4AF37] text-black" : "border-white/20 bg-slate-800 text-white hover:bg-slate-700"}`}>
            {label}
          </button>
        ))}
      </nav>
      {preview.model === "hoodie" && (
        <p className="shrink-0 bg-slate-950 px-3 pb-2 text-center text-[10px] text-slate-400">
          Modified 3D hoodie model by{" "}
          <a
            href="https://sketchfab.com/3d-models/hoodie-97611a53e3b846f69e0655b210f72b2f"
            target="_blank" rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-white"
          >
            Virtual Pandora (Sketchfab)
          </a>
          {" · "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank" rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-white"
          >
            CC BY 4.0
          </a>
        </p>
      )}
    </section>
  );
}
