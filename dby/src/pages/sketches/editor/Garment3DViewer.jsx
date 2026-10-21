/*
 * DesignByYou — 3D Garment Studio V3, Phase 2.2
 * Five-garment 3D editor: universal batch colours, direct placement and artwork transform handles.
 * Preserves the existing 2D metadata / editable artwork callbacks.
 */
import React, {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  getClothingTemplateArtworkBox,
  getClothingTemplateColourRegions,
} from "../templates/ClothingTemplates";
import {
  collectRegionLocalBounds,
  createRegionTexture,
  createTextArtwork,
  flattenRegionArtworkStack,
  isGarmentRegion,
  projectRegionUv,
  normalizeRegionArtworkStack,
} from "./Garment3DTextures";

const MODEL_URL = "/models/garments/DBY_Realistic_TShirt_8Regions.glb";
const DEFAULT_COLOUR = "#ffffff";
const GARMENT_MODEL_URLS = Object.freeze({
  tshirt: MODEL_URL,
  hoodie: "/models/garments/DBY_Hoodie_Sketchfab_15Regions_BETA.glb",
  skirt: "/models/garments/DBY_Aline_Skirt_8Regions_BETA.glb",
  pants: "/models/garments/DBY_CargoPants_10Regions_BETA.glb",
  shirt: "/models/garments/DBY_ButtonUpShirt_11Regions_BETA.glb",
});
const VIEWS = Object.freeze([
  { id: "perspective", label: "3/4" },
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
]);
const CAMERAS = Object.freeze({
  perspective: [3.3, 1.5, 5.1],
  front: [0, 0, 5.4],
  back: [0, 0, -5.4],
  left: [-5.4, 0, 0],
  right: [5.4, 0, 0],
});
const SWATCHES = Object.freeze([
  "#ffffff",
  "#111111",
  "#475569",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#a16207",
]);
const HEX_COLOUR = /^#[\da-f]{6}$/i;
const safeColour = (value) =>
  HEX_COLOUR.test(String(value || ""))
    ? String(value).toLowerCase()
    : DEFAULT_COLOUR;
const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, Number(value) || 0));
const BTN =
  "rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40";
const FIELD =
  "min-w-0 w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-100";

// A projected 3D region uses normalized UVs (left→right, bottom→top).
// Existing SVG artwork uses center-relative region-box units (X→right, Y→down).
// Since projectRegionUv already mirrors back regions, we use the UV unchanged.
export function projectedUvToArtworkOffset(uv, artworkBox) {
  if (!uv || !artworkBox || !Number.isFinite(uv.x) || !Number.isFinite(uv.y))
    return null;
  const u = Math.max(0, Math.min(1, uv.x));
  const v = Math.max(0, Math.min(1, uv.y));
  return {
    offsetX: Math.round((u - 0.5) * artworkBox.width * 10) / 10,
    offsetY: Math.round((0.5 - v) * artworkBox.height * 10) / 10,
  };
}

// Locate the saved artwork centre on the visible region mesh. The existing
// planar UVs are retained: the handle is a visual guide, not a 3D decal.
// We prefer the outer-facing triangle when a region has front/back surfaces.
function findRegionUvPosition(meshes, u, v, modelRoot, backFacing) {
  if (!modelRoot || !meshes?.length) return null;
  modelRoot.updateWorldMatrix(true, true);
  let chosen = null;
  let bestDepth = backFacing ? Infinity : -Infinity;
  let backup = null;
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const position = geometry?.getAttribute("position");
    const uv = geometry?.getAttribute("uv");
    if (!position || !uv) continue;
    const index = geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const ai = index ? index.getX(i) : i;
      const bi = index ? index.getX(i + 1) : i + 1;
      const ci = index ? index.getX(i + 2) : i + 2;
      const ax = uv.getX(ai),
        ay = uv.getY(ai);
      const bx = uv.getX(bi),
        by = uv.getY(bi);
      const cx = uv.getX(ci),
        cy = uv.getY(ci);
      const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(denom) < 1e-12) continue;
      const wa = ((by - cy) * (u - cx) + (cx - bx) * (v - cy)) / denom;
      const wb = ((cy - ay) * (u - cx) + (ax - cx) * (v - cy)) / denom;
      const wc = 1 - wa - wb;
      if (wa < -0.001 || wb < -0.001 || wc < -0.001) continue;
      const point = new THREE.Vector3(
        wa * position.getX(ai) +
          wb * position.getX(bi) +
          wc * position.getX(ci),
        wa * position.getY(ai) +
          wb * position.getY(bi) +
          wc * position.getY(ci),
        wa * position.getZ(ai) +
          wb * position.getZ(bi) +
          wc * position.getZ(ci),
      );
      mesh.localToWorld(point);
      modelRoot.worldToLocal(point);
      if (
        (backFacing && point.z < bestDepth) ||
        (!backFacing && point.z > bestDepth)
      ) {
        chosen = point;
        bestDepth = point.z;
      }
    }
    if (!backup) {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (geometry.boundingBox) {
        const p = geometry.boundingBox.getCenter(new THREE.Vector3());
        mesh.localToWorld(p);
        modelRoot.worldToLocal(p);
        backup = p;
      }
    }
  }
  const result = chosen || backup;
  if (!result) return null;
  result.z += backFacing ? -0.02 : 0.02;
  return [result.x, result.y, result.z];
}

function replaceArtworkLayer(stack, layerId, kind, updates) {
  if (kind === "pattern") {
    return {
      ...stack,
      pattern:
        stack.pattern?.id === layerId
          ? { ...stack.pattern, ...updates }
          : stack.pattern,
    };
  }
  if (kind === "logo") {
    return {
      ...stack,
      logos: stack.logos.map((item) =>
        item.id === layerId ? { ...item, ...updates } : item,
      ),
    };
  }
  if (kind === "text") {
    return {
      ...stack,
      texts: stack.texts.map((item) =>
        item.id === layerId ? { ...item, ...updates } : item,
      ),
    };
  }
  return stack;
}

function Model({
  modelUrl,
  templateId,
  regions,
  colours,
  artwork,
  wireframe,
  selectedRegions,
  onRegionClick,
  placementMode,
  placementRegionId,
  onPlacementStart,
  onPlacementMove,
  onPlacementEnd,
  onPlacementCancel,
  onError,
  transformMode = false,
  transformEntry = null,
  onTransformStart = null,
  onTransformMove = null,
  onTransformEnd = null,
  onTransformCancel = null,
}) {
  const { scene } = useGLTF(modelUrl);
  const { invalidate } = useThree();
  const modelRootRef = useRef(null);
  const [handlePosition, setHandlePosition] = useState(null);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const prepared = useMemo(() => {
    // useGLTF caches the source: never alter the cached geometry/materials.
    const instance = scene.clone(true);
    const meshesByRegion = new Map();
    const materialsByRegion = new Map();
    const ownedGeometries = [];
    const ownedMaterials = [];
    const activeTextures = new Map();
    const appliedConfig = new Map();
    const initialEmissive = new Map();

    const visit = (node, inheritedRegion = null) => {
      const regionId = isGarmentRegion(node.name, templateId)
        ? node.name
        : inheritedRegion;
      if (node.isMesh) {
        if (regionId) {
          const meshes = meshesByRegion.get(regionId) || [];
          meshes.push(node);
          meshesByRegion.set(regionId, meshes);
        }
        const originalMaterials = Array.isArray(node.material)
          ? node.material
          : [node.material];
        const ownMaterials = originalMaterials.map((original) => {
          const material = original.clone();
          material.side = THREE.DoubleSide;
          if ("roughness" in material) material.roughness = 0.86;
          if ("metalness" in material) material.metalness = 0;
          if (material.emissive)
            initialEmissive.set(material, {
              colour: material.emissive.clone(),
              intensity: material.emissiveIntensity,
            });
          ownedMaterials.push(material);
          return material;
        });
        node.material = Array.isArray(node.material)
          ? ownMaterials
          : ownMaterials[0];
        node.castShadow = false;
        node.receiveShadow = false;
        if (regionId) {
          materialsByRegion.set(regionId, [
            ...(materialsByRegion.get(regionId) || []),
            ...ownMaterials,
          ]);
        }
      }
      node.children.forEach((child) => visit(child, regionId));
    };
    visit(instance);

    meshesByRegion.forEach((meshes, regionId) => {
      const bounds = collectRegionLocalBounds(meshes);
      if (bounds.isEmpty()) return;
      meshes.forEach((mesh) => {
        mesh.geometry = projectRegionUv(mesh.geometry, regionId, bounds);
        ownedGeometries.push(mesh.geometry);
      });
    });

    instance.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(instance);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 2.65 / Math.max(size.x, size.y, size.z, 0.001);
    instance.position.sub(center);
    return {
      instance,
      scale,
      meshesByRegion,
      materialsByRegion,
      ownedGeometries,
      ownedMaterials,
      initialEmissive,
      activeTextures,
      appliedConfig,
    };
  }, [scene, templateId]);

  useEffect(() => {
    let cancelled = false;
    const tasks = regions.map(async ({ id }) => {
      const materials = prepared.materialsByRegion.get(id) || [];
      if (!materials.length) return;
      const colour = safeColour(colours?.[id]);
      const entry = artwork?.[id];
      const config = {
        colour,
        source: entry?.source || "",
        type: entry?.type || "",
        scale: entry?.scale,
        rotation: entry?.rotation,
        offsetX: entry?.offsetX,
        offsetY: entry?.offsetY,
        opacity: entry?.opacity,
        fit: entry?.fit,
      };
      const previous = prepared.appliedConfig.get(id);
      if (
        previous &&
        Object.keys(config).every((key) =>
          Object.is(previous[key], config[key]),
        )
      )
        return;
      let nextMap = null;
      if (entry?.source) {
        try {
          nextMap = await createRegionTexture(templateId, id, colour, entry);
        } catch (error) {
          onErrorRef.current?.(error);
        }
      }
      if (cancelled) {
        nextMap?.dispose();
        return;
      }
      const previousMap = prepared.activeTextures.get(id);
      for (const material of materials) {
        material.map = nextMap;
        material.color?.set(nextMap ? "#ffffff" : colour);
        material.needsUpdate = true;
      }
      if (nextMap) prepared.activeTextures.set(id, nextMap);
      else prepared.activeTextures.delete(id);
      prepared.appliedConfig.set(id, config);
      if (previousMap && previousMap !== nextMap) previousMap.dispose();
      invalidate();
    });
    void Promise.all(tasks);
    return () => {
      cancelled = true;
    };
  }, [prepared, colours, artwork, invalidate, regions, templateId]);

  // The gizmo follows the selected artwork position in projected-UV space.
  // Recalculate on position/selection changes, not continuously during scaling.
  useEffect(() => {
    if (!transformMode || !transformEntry || !modelRootRef.current) {
      setHandlePosition(null);
      return;
    }
    const box = getClothingTemplateArtworkBox(
      templateId,
      transformEntry.regionId,
    );
    if (!box) {
      setHandlePosition(null);
      return;
    }
    // Repeating fabric patterns have no single visible logo centre.
    const isPattern = transformEntry.kind === "pattern";
    const u = isPattern
      ? 0.5
      : clamp(0.5 + (Number(transformEntry.offsetX) || 0) / box.width, 0, 1);
    const v = isPattern
      ? 0.5
      : clamp(0.5 - (Number(transformEntry.offsetY) || 0) / box.height, 0, 1);
    setHandlePosition(
      findRegionUvPosition(
        prepared.meshesByRegion.get(transformEntry.regionId),
        u,
        v,
        modelRootRef.current,
        transformEntry.regionId.startsWith("back"),
      ),
    );
  }, [
    prepared,
    templateId,
    transformMode,
    transformEntry?.regionId,
    transformEntry?.offsetX,
    transformEntry?.offsetY,
    transformEntry?.kind,
  ]);

  // Selection visualization uses emissive tint; it never modifies saved colors.
  useEffect(() => {
    const selected = new Set(selectedRegions);
    prepared.materialsByRegion.forEach((materials, regionId) => {
      for (const material of materials) {
        if (!material.emissive) continue;
        const initial = prepared.initialEmissive.get(material);
        if (selected.has(regionId)) {
          material.emissive.set("#6d28d9");
          material.emissiveIntensity = 0.23;
        } else if (initial) {
          material.emissive.copy(initial.colour);
          material.emissiveIntensity = initial.intensity;
        }
      }
    });
    invalidate();
  }, [prepared, selectedRegions, invalidate]);

  useEffect(() => {
    prepared.ownedMaterials.forEach((material) => {
      if ("wireframe" in material) {
        material.wireframe = wireframe;
        material.needsUpdate = true;
      }
    });
    invalidate();
  }, [prepared, wireframe, invalidate]);

  useEffect(
    () => () => {
      prepared.activeTextures.forEach((texture) => texture.dispose());
      prepared.ownedGeometries.forEach((geometry) => geometry.dispose());
      prepared.ownedMaterials.forEach((material) => material.dispose());
    },
    [prepared],
  );

  const findRegionHit = useCallback(
    (event, onlyRegion = null) => {
      // Decorative details can overlap the fabric. Choose the closest intersection
      // with an editable fabric region; never place artwork onto decorations.
      const hits =
        Array.isArray(event.intersections) && event.intersections.length
          ? event.intersections
          : [event];
      for (const hit of hits) {
        let target = hit.object;
        while (target && target !== prepared.instance) {
          if (isGarmentRegion(target.name, templateId)) {
            if (!onlyRegion || target.name === onlyRegion) {
              return {
                regionId: target.name,
                uv: hit.uv ? { x: hit.uv.x, y: hit.uv.y } : null,
              };
            }
            break;
          }
          target = target.parent;
        }
      }
      return null;
    },
    [prepared, templateId],
  );

  const handleClick = useCallback(
    (event) => {
      if (placementMode || !onRegionClick) return;
      const hit = findRegionHit(event);
      if (!hit) return;
      event.stopPropagation();
      const native = event.nativeEvent || event.sourceEvent || {};
      onRegionClick(
        hit.regionId,
        Boolean(native.shiftKey || native.ctrlKey || native.metaKey),
      );
    },
    [onRegionClick, placementMode, findRegionHit],
  );

  const handlePointerDown = useCallback(
    (event) => {
      if (!placementMode) return;
      const hit = findRegionHit(event, placementRegionId);
      if (!hit?.uv) return;
      event.stopPropagation();
      // R3F pointer capture keeps the drag active when the cursor leaves the mesh.
      try {
        event.target.setPointerCapture(event.pointerId);
      } catch {
        /* best effort */
      }
      onPlacementStart?.(hit.uv);
    },
    [placementMode, placementRegionId, findRegionHit, onPlacementStart],
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (!placementMode) return;
      const hit = findRegionHit(event, placementRegionId);
      if (hit?.uv) onPlacementMove?.(hit.uv);
    },
    [placementMode, placementRegionId, findRegionHit, onPlacementMove],
  );

  const handlePointerUp = useCallback(
    (event) => {
      if (!placementMode) return;
      event.stopPropagation();
      const hit = findRegionHit(event, placementRegionId);
      if (hit?.uv) onPlacementMove?.(hit.uv);
      try {
        event.target.releasePointerCapture(event.pointerId);
      } catch {
        /* no capture */
      }
      onPlacementEnd?.();
    },
    [
      placementMode,
      placementRegionId,
      findRegionHit,
      onPlacementMove,
      onPlacementEnd,
    ],
  );

  const handlePointerCancel = useCallback(
    (event) => {
      if (!placementMode) return;
      try {
        event.target.releasePointerCapture(event.pointerId);
      } catch {
        /* no capture */
      }
      onPlacementCancel?.();
    },
    [placementMode, onPlacementCancel],
  );

  const gizmoSize = clamp(
    110 * (Number(transformEntry?.scale) || 0.45),
    42,
    205,
  );
  return (
    <group ref={modelRootRef} scale={prepared.scale}>
      <primitive
        object={prepared.instance}
        dispose={null}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
      {transformMode && handlePosition && transformEntry && (
        <Html
          position={handlePosition}
          center
          zIndexRange={[100, 10]}
          style={{
            pointerEvents: "auto",
            userSelect: "none",
            touchAction: "none",
          }}
        >
          <div
            role="group"
            aria-label="3D logo or text transform handles"
            className="relative rounded border-2 border-dashed border-cyan-300 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(0,0,0,0.8)]"
            style={{ width: gizmoSize, height: gizmoSize, touchAction: "none" }}
          >
            <span className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-950/90 px-1.5 py-0.5 text-[10px] text-cyan-200">
              {Math.round(transformEntry.rotation || 0)}° ·{" "}
              {(transformEntry.scale || 0.45).toFixed(2)}×
            </span>
            <button
              type="button"
              title="Drag horizontally to rotate"
              aria-label="Drag to rotate artwork"
              onPointerDown={(event) => {
                event.stopPropagation();
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                onTransformStart?.("rotate", event.clientX, event.clientY);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.stopPropagation();
                  onTransformMove?.(event.clientX, event.clientY);
                }
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.stopPropagation();
                  event.currentTarget.releasePointerCapture(event.pointerId);
                  onTransformEnd?.();
                }
              }}
              onPointerCancel={(event) => {
                event.stopPropagation();
                onTransformCancel?.();
              }}
              className="absolute -right-4 -top-5 flex h-9 w-9 cursor-ew-resize items-center justify-center rounded-full border-2 border-cyan-200 bg-slate-900 text-lg text-white shadow-lg"
            >
              ↻
            </button>
            <button
              type="button"
              title="Drag diagonally to resize"
              aria-label="Drag to resize artwork"
              onPointerDown={(event) => {
                event.stopPropagation();
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                onTransformStart?.("resize", event.clientX, event.clientY);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.stopPropagation();
                  onTransformMove?.(event.clientX, event.clientY);
                }
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.stopPropagation();
                  event.currentTarget.releasePointerCapture(event.pointerId);
                  onTransformEnd?.();
                }
              }}
              onPointerCancel={(event) => {
                event.stopPropagation();
                onTransformCancel?.();
              }}
              className="absolute -bottom-4 -right-4 flex h-9 w-9 cursor-nwse-resize items-center justify-center rounded-full border-2 border-cyan-200 bg-slate-900 text-lg text-white shadow-lg"
            >
              ↘
            </button>
          </div>
        </Html>
      )}
    </group>
  );
}

function CameraControls({
  view,
  revision,
  placementMode = false,
  transformMode = false,
}) {
  const controls = useRef(null);
  const { camera, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(...(CAMERAS[view] || CAMERAS.perspective));
    camera.lookAt(0, 0, 0);
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
    invalidate();
  }, [camera, invalidate, view, revision]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enabled={!placementMode && !transformMode}
      enablePan={false}
      minDistance={2.3}
      maxDistance={13}
      minPolarAngle={0.08}
      maxPolarAngle={Math.PI - 0.08}
    />
  );
}

class ViewerErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    this.props.onError?.(error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-red-200"
      >
        <strong>3D model could not be loaded.</strong>
        <span className="text-xs">
          Check the garment GLB under public/models/garments.
        </span>
        <span className="break-all text-xs">
          {String(this.state.error?.message || "Unknown error")}
        </span>
      </div>
    );
  }
}

/**
 * Compatible with existing FashionEditor bridge:
 *  onColourChange(regionId, hex)
 *  onMultiRegionColourChange(regionIds, hex) — added in V3
 *  onArtworkChange(regionId, stack, label)
 *  onArtworkUpload(regionId, type, file)
 */
export default function Garment3DViewer({
  templateId = "tshirt",
  colours = {},
  artwork = {},
  artworkLayers = {},
  onColourChange = null,
  onMultiRegionColourChange = null,
  onArtworkChange = null,
  onArtworkUpload = null,
  disabled = false,
  modelUrl = null,
  className = "",
  onError = null,
}) {
  const supported = Object.hasOwn(GARMENT_MODEL_URLS, templateId);
  const resolvedModelUrl =
    modelUrl || GARMENT_MODEL_URLS[templateId] || MODEL_URL;
  const regions = useMemo(
    () => (supported ? getClothingTemplateColourRegions(templateId) : []),
    [templateId, supported],
  );
  const garmentLabel =
    templateId === "hoodie"
      ? "Hoodie"
      : templateId === "skirt"
        ? "Skirt"
        : templateId === "pants"
          ? "Pants"
          : templateId === "shirt"
            ? "Button-Up Shirt"
            : "T-Shirt";

  const [view, setView] = useState("perspective");
  const [revision, setRevision] = useState(0);
  const [wireframe, setWireframe] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState(() =>
    regions[0] ? [regions[0].id] : [],
  );
  const [selectedRegion, setSelectedRegion] = useState(
    () => regions[0]?.id || "frontBody",
  );
  const [multiSelect, setMultiSelect] = useState(true);
  const [paintColour, setPaintColour] = useState("#111111");
  const [activeTab, setActiveTab] = useState("graphic");
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [textValue, setTextValue] = useState("DesignByYou");
  const [textColour, setTextColour] = useState("#111111");
  const [busy, setBusy] = useState(false);
  const [placementMode, setPlacementMode] = useState(false);
  const [placementDraft, setPlacementDraft] = useState(null);
  const [draftArtwork, setDraftArtwork] = useState(null);
  const [transformMode, setTransformMode] = useState(false);
  const [transformDraft, setTransformDraft] = useState(null);
  const transformRef = useRef(null);
  const [placementSaving, setPlacementSaving] = useState(false);
  const placementRef = useRef(null);
  const previewTickRef = useRef(0);
  const [temporaryColours, setTemporaryColours] = useState({});
  const inputRef = useRef(null);
  const artworkSectionRef = useRef(null);
  const controlsRef = useRef(null);

  useEffect(() => {
    setTemporaryColours({});
    setSelectedRegions(regions[0] ? [regions[0].id] : []);
    setSelectedRegion(regions[0]?.id || "frontBody");
    setView("perspective");
  }, [templateId, regions]);
  useEffect(() => {
    setSelectedLayerId("");
  }, [selectedRegion]);
  useEffect(() => {
    // Switching artwork layers must never keep a previous layer's active drag.
    placementRef.current = null;
    setPlacementDraft(null);
    setDraftArtwork(null);
    setPlacementMode(false);
    transformRef.current = null;
    setTransformDraft(null);
    setTransformMode(false);
  }, [selectedLayerId]);
  // A placement is scoped to one saved region and one layer, never a whole garment.
  useEffect(() => {
    placementRef.current = null;
    setPlacementDraft(null);
    setDraftArtwork(null);
    setPlacementMode(false);
    transformRef.current = null;
    setTransformDraft(null);
    setTransformMode(false);
  }, [templateId, selectedRegion]);

  useEffect(() => {
    if (!placementMode && !transformMode) return undefined;
    const onEscape = (event) => {
      if (event.key !== "Escape") return;
      placementRef.current = null;
      setPlacementDraft(null);
      setDraftArtwork(null);
      setPlacementMode(false);
      transformRef.current = null;
      setTransformDraft(null);
      setTransformMode(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [placementMode, transformMode]);

  const regionIds = useMemo(
    () => new Set(regions.map((region) => region.id)),
    [regions],
  );
  const resolvedColours = useMemo(
    () => ({ ...colours, ...temporaryColours }),
    [colours, temporaryColours],
  );
  const selectedRegionNames = regions.filter((region) =>
    selectedRegions.includes(region.id),
  );
  const groups = useMemo(() => {
    const entries = new Map();
    for (const region of regions) {
      const key = region.group || "other";
      if (!entries.has(key)) entries.set(key, []);
      entries.get(key).push(region.id);
    }
    return [...entries.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([key, ids]) => ({
        key,
        label: key
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        ids,
      }));
  }, [regions]);

  const selectRegion = useCallback(
    (regionId, multiKey = false) => {
      if (!regionIds.has(regionId)) return;
      setSelectedRegion(regionId);
      setSelectedRegions((current) => {
        if (!multiSelect && !multiKey) return [regionId];
        return current.includes(regionId)
          ? current.filter((id) => id !== regionId)
          : [...current, regionId];
      });
    },
    [regionIds, multiSelect],
  );

  const selectSet = useCallback(
    (ids) => {
      const validIds = [...new Set(ids)].filter((id) => regionIds.has(id));
      setSelectedRegions(validIds);
      if (validIds.length) setSelectedRegion(validIds[0]);
    },
    [regionIds],
  );

  const canBatchSave = typeof onMultiRegionColourChange === "function";
  const canSingleSave = typeof onColourChange === "function";
  const canApplyColour =
    supported &&
    !disabled &&
    selectedRegions.length > 0 &&
    (canBatchSave || (selectedRegions.length === 1 && canSingleSave));
  const applyColour = useCallback(() => {
    if (!canApplyColour) return;
    const ids = selectedRegions.filter((id) => regionIds.has(id));
    if (!ids.length) return;
    const hex = safeColour(paintColour);
    if (canBatchSave) onMultiRegionColourChange(ids, hex);
    else if (canSingleSave && ids.length === 1) onColourChange(ids[0], hex);
  }, [
    canApplyColour,
    selectedRegions,
    regionIds,
    paintColour,
    canBatchSave,
    onMultiRegionColourChange,
    canSingleSave,
    onColourChange,
  ]);

  // Artwork remains targeted at ONE region in Phase 1. Multi-region graphics
  // and drag-to-place are intentionally reserved for later phases.
  const legacyEntry = artwork?.[selectedRegion] || null;
  const hasStack = Object.prototype.hasOwnProperty.call(
    artworkLayers || {},
    selectedRegion,
  );
  const stack = normalizeRegionArtworkStack(
    artworkLayers?.[selectedRegion],
    hasStack ? null : legacyEntry,
  );
  const layers = [
    ...(stack.pattern
      ? [{ ...stack.pattern, kind: "pattern", name: "Fabric Pattern" }]
      : []),
    ...stack.logos.map((item, index) => ({
      ...item,
      kind: "logo",
      name: `Logo / Image ${index + 1}`,
    })),
    ...stack.texts.map((item, index) => ({
      ...item,
      kind: "text",
      name: item.text ? `Text: ${item.text}` : `Text ${index + 1}`,
    })),
  ];
  const entry =
    layers.find((item) => item.id === selectedLayerId) ||
    layers[layers.length - 1] ||
    null;
  const hasArtworkBridge = typeof onArtworkChange === "function";
  const hasUploadBridge = typeof onArtworkUpload === "function";
  const editable = supported && !disabled && hasArtworkBridge;
  const canPlaceArtwork =
    editable &&
    !placementSaving &&
    !busy &&
    (entry?.kind === "logo" ||
      entry?.kind === "text" ||
      entry?.kind === "pattern");

  const normalizeCurrentStack = useCallback(
    (regionId) => {
      const hasSavedStack = Object.prototype.hasOwnProperty.call(
        artworkLayers || {},
        regionId,
      );
      return normalizeRegionArtworkStack(
        artworkLayers?.[regionId],
        hasSavedStack ? null : artwork?.[regionId],
      );
    },
    [artworkLayers, artwork],
  );

  const endPlacementPreview = useCallback(() => {
    placementRef.current = null;
    setPlacementDraft(null);
    setDraftArtwork(null);
  }, []);

  const startPlacement = useCallback(
    (uv) => {
      if (!canPlaceArtwork) return;
      const box = getClothingTemplateArtworkBox(templateId, selectedRegion);
      const offset = projectedUvToArtworkOffset(uv, box);
      if (!offset) return;
      const next = {
        ...offset,
        regionId: selectedRegion,
        layerId: entry.id,
        kind: entry.kind,
      };
      placementRef.current = next;
      previewTickRef.current = 0;
      setPlacementDraft(next);
    },
    [canPlaceArtwork, templateId, selectedRegion, entry],
  );

  const movePlacement = useCallback(
    (uv) => {
      const current = placementRef.current;
      if (!current || !canPlaceArtwork) return;
      const box = getClothingTemplateArtworkBox(templateId, current.regionId);
      const offset = projectedUvToArtworkOffset(uv, box);
      if (!offset) return;
      const next = { ...current, ...offset };
      placementRef.current = next;
      // The pointer stays smooth; texture generation is bounded to roughly 10fps.
      const now = Date.now();
      if (now - previewTickRef.current >= 95) {
        previewTickRef.current = now;
        setPlacementDraft(next);
      }
    },
    [canPlaceArtwork, templateId],
  );

  const finishPlacement = useCallback(async () => {
    const position = placementRef.current;
    if (!position || !canPlaceArtwork) return;
    placementRef.current = null;
    setPlacementDraft(position);
    const savedStack = normalizeCurrentStack(position.regionId);
    const changed = replaceArtworkLayer(
      savedStack,
      position.layerId,
      position.kind,
      {
        offsetX: position.offsetX,
        offsetY: position.offsetY,
      },
    );
    setPlacementSaving(true);
    try {
      const saved = await onArtworkChange(
        position.regionId,
        changed,
        `Place 3D ${position.kind} on ${position.regionId}`,
      );
      if (saved === false)
        onError?.(new Error("Artwork placement was not saved."));
    } catch (error) {
      onError?.(error);
    } finally {
      // The saved stack is the source of truth; draft is never serialized.
      endPlacementPreview();
      setPlacementSaving(false);
    }
  }, [
    canPlaceArtwork,
    normalizeCurrentStack,
    onArtworkChange,
    onError,
    endPlacementPreview,
  ]);

  const startTransform = useCallback(
    (mode, clientX, clientY) => {
      if (!transformMode || !canPlaceArtwork || !entry || transformRef.current)
        return;
      const data = {
        regionId: selectedRegion,
        layerId: entry.id,
        kind: entry.kind,
        mode,
        startX: clientX,
        startY: clientY,
        initialScale: clamp(Number(entry.scale ?? 0.45), 0.05, 3),
        initialRotation: clamp(Number(entry.rotation ?? 0), -180, 180),
        scale: clamp(Number(entry.scale ?? 0.45), 0.05, 3),
        rotation: clamp(Number(entry.rotation ?? 0), -180, 180),
      };
      transformRef.current = data;
      previewTickRef.current = 0;
      setTransformDraft(data);
    },
    [transformMode, canPlaceArtwork, entry, selectedRegion],
  );

  const moveTransform = useCallback(
    (clientX, clientY) => {
      const current = transformRef.current;
      if (!current || !transformMode) return;
      const deltaX = clientX - current.startX;
      const deltaY = clientY - current.startY;
      const next = {
        ...current,
        scale:
          current.mode === "resize"
            ? Math.round(
                clamp(
                  current.initialScale * (1 + (deltaX + deltaY) / 180),
                  0.05,
                  3,
                ) * 1000,
              ) / 1000
            : current.scale,
        rotation:
          current.mode === "rotate"
            ? Math.round(
                clamp(current.initialRotation + deltaX * 0.85, -180, 180) * 10,
              ) / 10
            : current.rotation,
      };
      transformRef.current = next;
      if (Date.now() - previewTickRef.current >= 95) {
        previewTickRef.current = Date.now();
        setTransformDraft(next);
      }
    },
    [transformMode],
  );

  const cancelTransform = useCallback(() => {
    transformRef.current = null;
    setTransformDraft(null);
    setDraftArtwork(null);
  }, []);

  const finishTransform = useCallback(async () => {
    const result = transformRef.current;
    if (!result || !canPlaceArtwork || placementSaving) return;
    transformRef.current = null;
    setTransformDraft(result);
    const changes =
      result.mode === "resize"
        ? { scale: result.scale }
        : { rotation: result.rotation };
    const unchanged =
      result.mode === "resize"
        ? result.scale === result.initialScale
        : result.rotation === result.initialRotation;
    if (unchanged) {
      cancelTransform();
      return;
    }
    const nextStack = replaceArtworkLayer(
      normalizeCurrentStack(result.regionId),
      result.layerId,
      result.kind,
      changes,
    );
    setPlacementSaving(true);
    try {
      const saved = await onArtworkChange(
        result.regionId,
        nextStack,
        `${result.mode === "resize" ? "Resize" : "Rotate"} 3D ${result.kind} on ${result.regionId}`,
      );
      if (saved === false)
        onError?.(new Error("The artwork transform could not be saved."));
    } catch (error) {
      onError?.(error);
    } finally {
      cancelTransform();
      setPlacementSaving(false);
    }
  }, [
    canPlaceArtwork,
    placementSaving,
    cancelTransform,
    normalizeCurrentStack,
    onArtworkChange,
    onError,
  ]);

  // Preview the layered composition in its real projected region while dragging.
  // This leaves the saved 2D object untouched until pointer-up (one Undo step).
  useEffect(() => {
    const activeDraft = transformDraft || placementDraft;
    if (!activeDraft) return undefined;
    let cancelled = false;
    const regionId = activeDraft.regionId;
    const timer = setTimeout(async () => {
      try {
        const next = replaceArtworkLayer(
          normalizeCurrentStack(regionId),
          activeDraft.layerId,
          activeDraft.kind,
          transformDraft
            ? transformDraft.mode === "resize"
              ? { scale: activeDraft.scale }
              : { rotation: activeDraft.rotation }
            : { offsetX: activeDraft.offsetX, offsetY: activeDraft.offsetY },
        );
        const rendered = await flattenRegionArtworkStack(
          templateId,
          regionId,
          next,
        );
        if (!cancelled) setDraftArtwork({ regionId, entry: rendered });
      } catch (error) {
        if (!cancelled) onError?.(error);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    placementDraft,
    transformDraft,
    templateId,
    normalizeCurrentStack,
    onError,
  ]);

  const artworkForModel = useMemo(() => {
    if (!draftArtwork || draftArtwork.regionId !== selectedRegion)
      return artwork;
    return { ...artwork, [draftArtwork.regionId]: draftArtwork.entry };
  }, [artwork, draftArtwork, selectedRegion]);
  const artworkUnavailableReason = !supported
    ? "Select a supported T-Shirt, Hoodie, Skirt, Pants, or Shirt template in 2D first."
    : disabled
      ? "This garment or layer is locked, hidden, or not editable. Unlock it in Layers."
      : !hasArtworkBridge || !hasUploadBridge
        ? "3D artwork isn't connected to FashionEditor.jsx. Update the Fashion Editor artwork bridge."
        : "";

  const chooseView = (id) => {
    setView(id);
    setRevision((n) => n + 1);
  };
  const updateArtwork = (nextStack, label) => {
    if (!editable) return;
    void Promise.resolve(
      onArtworkChange(selectedRegion, nextStack, label),
    ).catch((error) => onError?.(error));
  };
  const changeSetting = (key, value) => {
    if (
      !entry ||
      !editable ||
      placementSaving ||
      placementRef.current ||
      transformRef.current
    )
      return;
    const changed = { ...entry, [key]: value };
    if (entry.kind === "pattern")
      updateArtwork({ ...stack, pattern: changed }, "Adjust fabric pattern");
    else if (entry.kind === "logo")
      updateArtwork(
        {
          ...stack,
          logos: stack.logos.map((item) =>
            item.id === entry.id ? changed : item,
          ),
        },
        "Adjust garment logo",
      );
    else
      updateArtwork(
        {
          ...stack,
          texts: stack.texts.map((item) =>
            item.id === entry.id ? changed : item,
          ),
        },
        "Adjust garment text",
      );
  };
  const removeSelectedLayer = () => {
    if (
      !entry ||
      !editable ||
      placementSaving ||
      placementRef.current ||
      transformRef.current
    )
      return;
    setPlacementMode(false);
    if (entry.kind === "pattern")
      updateArtwork({ ...stack, pattern: null }, "Remove garment pattern");
    else if (entry.kind === "logo")
      updateArtwork(
        { ...stack, logos: stack.logos.filter((item) => item.id !== entry.id) },
        "Remove garment logo",
      );
    else
      updateArtwork(
        { ...stack, texts: stack.texts.filter((item) => item.id !== entry.id) },
        "Remove garment text",
      );
    setSelectedLayerId("");
  };
  const handleUpload = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (
      !file ||
      disabled ||
      !supported ||
      typeof onArtworkUpload !== "function"
    )
      return;
    setBusy(true);
    try {
      const wasSaved = await onArtworkUpload(
        selectedRegion,
        activeTab === "pattern" ? "pattern" : "image",
        file,
      );
      if (wasSaved) setSelectedLayerId("");
    } catch (error) {
      onError?.(error);
    } finally {
      setBusy(false);
    }
  };
  const addText = async () => {
    if (!editable || busy || stack.texts.length >= 24) return;
    const png = createTextArtwork(textValue, textColour);
    if (!png) return;
    const newLayer = {
      id:
        globalThis.crypto?.randomUUID?.() ||
        `txt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: "image",
      source: png,
      text: textValue.trim(),
      scale: 0.45,
      rotation: 0,
      offsetX: 0,
      offsetY: 0,
      opacity: 1,
      fit: "contain",
    };
    setBusy(true);
    try {
      const saved = await onArtworkChange(
        selectedRegion,
        { ...stack, texts: [...stack.texts, newLayer] },
        "Add garment text",
      );
      if (saved) setSelectedLayerId(newLayer.id);
    } catch (error) {
      onError?.(error);
    } finally {
      setBusy(false);
    }
  };
  const clearRegionArtwork = () => {
    if (
      !editable ||
      busy ||
      placementSaving ||
      placementRef.current ||
      transformRef.current ||
      layers.length === 0
    )
      return;
    if (
      !window.confirm(
        `Clear all logos, text, and patterns from ${selectedRegion}? You can Undo this.`,
      )
    )
      return;
    setPlacementMode(false);
    updateArtwork(
      { pattern: null, logos: [], texts: [] },
      "Clear all 3D region artwork",
    );
    setSelectedLayerId("");
  };
  const resetSelectedPosition = () => {
    if (!canPlaceArtwork) return;
    endPlacementPreview();
    setPlacementMode(false);
    updateArtwork(
      replaceArtworkLayer(stack, entry.id, entry.kind, {
        offsetX: 0,
        offsetY: 0,
      }),
      "Reset 3D artwork position",
    );
  };
  const togglePlacement = () => {
    if (!canPlaceArtwork || transformRef.current) return;
    setTransformMode(false);
    cancelTransform();
    endPlacementPreview();
    setSelectedRegions([selectedRegion]);
    setPlacementMode((old) => !old);
  };
  const toggleTransform = () => {
    if (!canPlaceArtwork || placementRef.current || transformRef.current)
      return;
    endPlacementPreview();
    cancelTransform();
    setPlacementMode(false);
    setSelectedRegions([selectedRegion]);
    setTransformMode((current) => !current);
  };
  const visualTransformEntry =
    transformDraft && transformDraft.layerId === entry?.id
      ? { ...entry, ...transformDraft, regionId: selectedRegion }
      : entry
        ? { ...entry, regionId: selectedRegion }
        : null;
  const scrollToArtwork = () => {
    if (!artworkSectionRef.current || !controlsRef.current) return;
    artworkSectionRef.current.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  };

  return (
    <section
      className={`flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-900 text-slate-100 ${className}`}
      aria-label="DesignByYou 3D garment studio"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-700 bg-slate-950 px-3 py-2">
        <div>
          <strong className="text-xs">
            3D Garment Studio{" "}
            <span className="ml-2 rounded bg-violet-950 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
              V3
            </span>
          </strong>
          <p className="text-[11px] text-slate-400">
            {supported
              ? `${garmentLabel} · ${regions.length} editable regions`
              : "Select a supported garment in 2D"}
          </p>
        </div>
        {supported && (
          <div className="flex items-center gap-2">
            <button type="button" className={BTN} onClick={scrollToArtwork}>
              Graphics &amp; text
            </button>
            <button
              type="button"
              aria-pressed={wireframe}
              className={BTN}
              onClick={() => setWireframe((old) => !old)}
            >
              Wireframe {wireframe ? "On" : "Off"}
            </button>
          </div>
        )}
      </header>
      {!supported ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-slate-300">
          Switch to 2D, select a T-Shirt, Hoodie, Skirt, Pants, or Shirt, then
          return to 3D.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* On desktop, properties are on the LEFT. On mobile, model comes first. */}
          <aside
            ref={controlsRef}
            aria-label="3D garment properties"
            className="order-2 min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain border-t border-slate-700 bg-slate-950 px-3 pb-8 pt-3 lg:order-1 lg:w-[315px] lg:min-w-[285px] lg:max-w-[360px] lg:flex-none lg:border-r lg:border-t-0"
            style={{ scrollbarWidth: "thin" }}
          >
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-xs uppercase tracking-wide text-slate-200">
                  Select garment regions
                </strong>
                <span className="rounded-full border border-violet-600/60 bg-violet-900/30 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                  {selectedRegions.length} selected
                </span>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={multiSelect}
                  onChange={(event) => setMultiSelect(event.target.checked)}
                  className="accent-violet-500"
                />
                Multi-select on model click
              </label>
              <p className="text-[10px] leading-relaxed text-slate-400">
                Click a garment area to select it. When multi-select is enabled,
                clicks add or remove areas. Hold Shift to multi-select at any
                time.
              </p>
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="Quick garment region selections"
              >
                <button
                  type="button"
                  className={BTN}
                  onClick={() => selectSet(regions.map((region) => region.id))}
                >
                  All
                </button>
                <button
                  type="button"
                  className={BTN}
                  onClick={() =>
                    selectSet(
                      regions
                        .filter((region) => region.view === "front")
                        .map((region) => region.id),
                    )
                  }
                >
                  Front
                </button>
                <button
                  type="button"
                  className={BTN}
                  onClick={() =>
                    selectSet(
                      regions
                        .filter((region) => region.view === "back")
                        .map((region) => region.id),
                    )
                  }
                >
                  Back
                </button>
                <button
                  type="button"
                  className={BTN}
                  onClick={() => selectSet([])}
                >
                  Clear
                </button>
              </div>
              {groups.length > 0 && (
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="Select regions by garment part"
                >
                  {groups.map(({ key, label, ids }) => (
                    <button
                      type="button"
                      key={key}
                      className={BTN}
                      onClick={() => selectSet(ids)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {regions.map((region) => (
                  <label
                    key={region.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-[10px] ${selectedRegions.includes(region.id) ? "border-violet-500 bg-violet-950/50 text-white" : "border-slate-800 bg-slate-900 text-slate-300"}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRegions.includes(region.id)}
                      onChange={() => selectRegion(region.id, true)}
                      className="shrink-0 accent-violet-500"
                      aria-label={`Select ${region.label}`}
                    />
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-white/30"
                      style={{
                        background: safeColour(resolvedColours[region.id]),
                      }}
                    />
                    <span className="min-w-0 truncate" title={region.label}>
                      {region.label}
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className="mt-4 space-y-3 border-t border-slate-800 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-xs uppercase tracking-wide text-slate-200">
                  Region color
                </strong>
                <span className="text-[10px] text-slate-400">
                  {selectedRegions.length
                    ? `${selectedRegions.length} areas`
                    : "Select a region"}
                </span>
              </div>
              {selectedRegionNames.length > 0 && (
                <p className="text-[10px] leading-relaxed text-slate-400">
                  Apply one color to{" "}
                  {selectedRegionNames.length === 1
                    ? selectedRegionNames[0].label
                    : `${selectedRegionNames.length} selected areas`}
                  .
                </p>
              )}
              <div
                className="grid grid-cols-6 gap-2"
                role="group"
                aria-label="Fabric color presets"
              >
                {SWATCHES.map((swatch) => (
                  <button
                    type="button"
                    key={swatch}
                    onClick={() => setPaintColour(swatch)}
                    aria-label={`Choose color ${swatch}`}
                    aria-pressed={safeColour(paintColour) === swatch}
                    className={`aspect-square min-h-7 rounded-lg border-2 ${safeColour(paintColour) === swatch ? "border-violet-400 ring-1 ring-violet-400" : "border-slate-600"}`}
                    style={{ background: swatch }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Custom garment color"
                  value={safeColour(paintColour)}
                  onChange={(event) => setPaintColour(event.target.value)}
                  className="h-9 w-11 shrink-0 cursor-pointer rounded border border-slate-600 bg-transparent"
                  disabled={disabled}
                />
                <input
                  aria-label="Selected color hex"
                  className={FIELD}
                  value={paintColour}
                  maxLength={7}
                  onChange={(event) => setPaintColour(event.target.value)}
                />
              </div>
              <button
                type="button"
                className={`${BTN} w-full border-violet-600 bg-violet-700 font-semibold text-white hover:bg-violet-600`}
                disabled={!canApplyColour || !HEX_COLOUR.test(paintColour)}
                onClick={applyColour}
              >
                Apply to {selectedRegions.length} region
                {selectedRegions.length === 1 ? "" : "s"}
              </button>
              {!canBatchSave && selectedRegions.length > 1 && (
                <p className="text-[10px] text-amber-300">
                  Multi-region saving requires the updated FashionEditor.jsx
                  bridge.
                </p>
              )}
            </section>

            <section
              ref={artworkSectionRef}
              className="mt-4 space-y-3 border-t border-slate-800 pt-4"
            >
              <div className="space-y-1">
                <strong className="text-xs uppercase tracking-wide text-slate-200">
                  Graphics · Text · Fabric prints
                </strong>
                <p className="text-[10px] text-slate-400">
                  Colors support multiple regions. Logos and text can be moved
                  directly on their own 3D panel.
                </p>
              </div>
              {artworkUnavailableReason && (
                <p
                  role="status"
                  className="rounded-md border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200"
                >
                  {artworkUnavailableReason}
                </p>
              )}
              <label className="block space-y-1 text-[10px] text-slate-400">
                Artwork target region
                <select
                  className={FIELD}
                  value={selectedRegion}
                  onChange={(event) => setSelectedRegion(event.target.value)}
                >
                  {regions.map(({ id, label }) => (
                    <option value={id} key={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="Artwork type"
              >
                {[
                  { id: "graphic", label: "Logo / Image" },
                  { id: "pattern", label: "Fabric Pattern" },
                  { id: "text", label: "Text" },
                ].map(({ id, label }) => (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={activeTab === id}
                    onClick={() => setActiveTab(id)}
                    className={`${BTN} ${activeTab === id ? "border-violet-400 bg-violet-700 text-white" : ""}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {activeTab === "text" ? (
                <div className="space-y-2">
                  <label className="block space-y-1 text-[10px] text-slate-400">
                    Garment text
                    <input
                      className={FIELD}
                      maxLength={60}
                      value={textValue}
                      onChange={(event) => setTextValue(event.target.value)}
                      placeholder="Enter text"
                      disabled={!editable}
                    />
                  </label>
                  <div className="flex items-end gap-2">
                    <label className="space-y-1 text-[10px] text-slate-400">
                      Text color
                      <input
                        type="color"
                        aria-label="Text color"
                        value={textColour}
                        onChange={(event) => setTextColour(event.target.value)}
                        className="block h-8 w-9 rounded border border-slate-600"
                        disabled={!editable}
                      />
                    </label>
                    <button
                      type="button"
                      className={BTN}
                      disabled={
                        !editable ||
                        busy ||
                        stack.texts.length >= 24 ||
                        !textValue.trim()
                      }
                      onClick={addText}
                    >
                      Place Text
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={handleUpload}
                  />
                  <button
                    type="button"
                    className={BTN}
                    disabled={!editable || busy || !hasUploadBridge}
                    onClick={() => inputRef.current?.click()}
                  >
                    {busy
                      ? "Importing…"
                      : activeTab === "pattern"
                        ? "Upload Pattern"
                        : "Upload Logo / Image"}
                  </button>
                  <p className="text-[10px] text-slate-500">
                    PNG, JPG, WebP, SVG · uses secure 2D asset import
                  </p>
                </div>
              )}
              <div className="space-y-2 border-t border-slate-800 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-[11px] uppercase tracking-wide text-slate-300">
                    Layer stack · {layers.length} item
                    {layers.length === 1 ? "" : "s"}
                  </strong>
                  <button
                    type="button"
                    className={`${BTN} border-red-900/70 text-red-200`}
                    disabled={
                      !editable ||
                      busy ||
                      placementSaving ||
                      layers.length === 0
                    }
                    onClick={clearRegionArtwork}
                    title="Remove all artwork only from this region (undoable)"
                  >
                    Clear region
                  </button>
                </div>
                {layers.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    No artwork on this region yet.
                  </p>
                ) : (
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Select garment artwork layer"
                  >
                    {layers.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        aria-pressed={entry?.id === item.id}
                        onClick={() => setSelectedLayerId(item.id)}
                        className={`${BTN} max-w-full truncate ${entry?.id === item.id ? "border-violet-400 bg-violet-700 text-white" : ""}`}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                )}
                {entry && (
                  <div className="space-y-2 rounded-lg border border-violet-800/60 bg-violet-950/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-[11px] text-violet-200">
                        3D{" "}
                        {entry.kind === "pattern"
                          ? "fabric pattern"
                          : entry.kind}{" "}
                        controls
                      </strong>
                      <span className="text-[10px] text-slate-400">
                        {placementSaving
                          ? "Saving…"
                          : placementMode
                            ? "Move mode"
                            : "Ready"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={!canPlaceArtwork}
                        onClick={togglePlacement}
                        aria-pressed={placementMode}
                        className={`${BTN} w-full ${placementMode ? "border-violet-400 bg-violet-700 text-white" : "border-violet-600"}`}
                      >
                        {placementMode ? "Finish moving" : "Move on 3D"}
                      </button>
                      <button
                        type="button"
                        disabled={!canPlaceArtwork}
                        onClick={toggleTransform}
                        aria-pressed={transformMode}
                        className={`${BTN} ${transformMode ? "border-cyan-300 bg-cyan-800 text-white" : "border-cyan-700"}`}
                      >
                        {transformMode ? "Finish transform" : "Resize / Rotate"}
                      </button>
                    </div>
                    <p className="text-[10px] leading-4 text-slate-300">
                      {placementMode
                        ? `Click or drag on ${regions.find((r) => r.id === selectedRegion)?.label || selectedRegion} to ${entry.kind === "pattern" ? "shift the pattern repeat" : "place artwork"}. Orbit is paused. Press Esc to exit.`
                        : transformMode
                          ? `Drag cyan ↘ to ${entry.kind === "pattern" ? "change pattern repeat size" : "resize"}, or ↻ horizontally to rotate. The outline is an approximate surface guide. Release to save once.`
                          : "Choose Move for position or Resize / Rotate for interactive model handles. Pattern controls edit the fabric repeat, not a standalone logo."}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className={BTN}
                        disabled={!canPlaceArtwork}
                        onClick={resetSelectedPosition}
                      >
                        Center artwork
                      </button>
                      <button
                        type="button"
                        className={BTN}
                        disabled={!canPlaceArtwork}
                        onClick={() =>
                          changeSetting(
                            "scale",
                            clamp(Number(entry.scale ?? 0.45) - 0.1, 0.05, 3),
                          )
                        }
                      >
                        Size −
                      </button>
                      <button
                        type="button"
                        className={BTN}
                        disabled={!canPlaceArtwork}
                        onClick={() =>
                          changeSetting(
                            "scale",
                            clamp(Number(entry.scale ?? 0.45) + 0.1, 0.05, 3),
                          )
                        }
                      >
                        Size +
                      </button>
                      <button
                        type="button"
                        className={BTN}
                        disabled={!canPlaceArtwork}
                        onClick={() =>
                          changeSetting(
                            "rotation",
                            clamp(Number(entry.rotation || 0) - 15, -180, 180),
                          )
                        }
                      >
                        ↶ 15°
                      </button>
                      <button
                        type="button"
                        className={BTN}
                        disabled={!canPlaceArtwork}
                        onClick={() =>
                          changeSetting(
                            "rotation",
                            clamp(Number(entry.rotation || 0) + 15, -180, 180),
                          )
                        }
                      >
                        ↷ 15°
                      </button>
                    </div>
                  </div>
                )}
                {entry && (
                  <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-200">
                        Edit {entry.name}
                      </span>
                      <button
                        type="button"
                        className={BTN}
                        disabled={
                          !editable ||
                          busy ||
                          placementSaving ||
                          Boolean(placementRef.current) ||
                          Boolean(transformRef.current)
                        }
                        onClick={removeSelectedLayer}
                      >
                        Remove layer
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {
                          key: "scale",
                          name:
                            entry.kind === "pattern"
                              ? "Repeat size"
                              : "Graphic size",
                          min: 0.05,
                          max: 3,
                          step: 0.05,
                        },
                        {
                          key: "rotation",
                          name: "Rotation",
                          min: -180,
                          max: 180,
                          step: 1,
                        },
                        {
                          key: "offsetX",
                          name: "Horizontal",
                          min: -120,
                          max: 120,
                          step: 1,
                        },
                        {
                          key: "offsetY",
                          name: "Vertical",
                          min: -120,
                          max: 120,
                          step: 1,
                        },
                        {
                          key: "opacity",
                          name: "Opacity",
                          min: 0,
                          max: 1,
                          step: 0.05,
                        },
                      ].map(({ key, name, min, max, step }) => (
                        <label
                          key={key}
                          className="space-y-1 text-[10px] text-slate-400"
                        >
                          {name}:{" "}
                          {Number(
                            entry[key] ??
                              (key === "scale" || key === "opacity" ? 1 : 0),
                          ).toFixed(key === "opacity" ? 2 : 1)}
                          <input
                            type="range"
                            className="block w-full accent-violet-500"
                            min={min}
                            max={max}
                            step={step}
                            value={clamp(
                              entry[key] ??
                                (key === "scale" || key === "opacity" ? 1 : 0),
                              min,
                              max,
                            )}
                            disabled={!editable || busy || placementSaving}
                            onChange={(event) =>
                              changeSetting(key, Number(event.target.value))
                            }
                          />
                        </label>
                      ))}
                      <label className="space-y-1 text-[10px] text-slate-400">
                        Image fitting
                        <select
                          className={FIELD}
                          value={entry.fit || "contain"}
                          disabled={!editable || busy}
                          onChange={(event) =>
                            changeSetting("fit", event.target.value)
                          }
                        >
                          <option value="contain">Contain</option>
                          <option value="cover">Cover</option>
                          <option value="fill">Stretch</option>
                        </select>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </aside>

          <div className="relative order-1 flex h-[clamp(255px,44dvh,520px)] shrink-0 flex-col bg-gradient-to-b from-slate-700 via-slate-800 to-slate-950 lg:order-2 lg:h-auto lg:min-h-0 lg:min-w-0 lg:flex-1">
            <div className="relative min-h-0 flex-1">
              <ViewerErrorBoundary key={resolvedModelUrl} onError={onError}>
                <Canvas
                  dpr={[1, 1.5]}
                  frameloop="demand"
                  camera={{
                    position: CAMERAS.perspective,
                    fov: 35,
                    near: 0.1,
                    far: 80,
                  }}
                  gl={{
                    alpha: true,
                    antialias: true,
                    powerPreference: "high-performance",
                  }}
                  style={{ height: "100%", width: "100%" }}
                >
                  <ambientLight intensity={1.4} />
                  <hemisphereLight args={["#ffffff", "#475569", 1.4]} />
                  <directionalLight position={[4, 6, 6]} intensity={2.5} />
                  <directionalLight position={[-5, 2, -4]} intensity={1.5} />
                  <Suspense
                    fallback={
                      <Html center>
                        <div className="rounded bg-slate-950 px-4 py-3 text-xs">
                          Loading garment…
                        </div>
                      </Html>
                    }
                  >
                    <Model
                      modelUrl={resolvedModelUrl}
                      templateId={templateId}
                      regions={regions}
                      colours={resolvedColours}
                      artwork={artworkForModel}
                      wireframe={wireframe}
                      selectedRegions={selectedRegions}
                      onRegionClick={selectRegion}
                      onError={onError}
                      placementMode={placementMode && canPlaceArtwork}
                      placementRegionId={selectedRegion}
                      onPlacementStart={startPlacement}
                      onPlacementMove={movePlacement}
                      onPlacementEnd={finishPlacement}
                      onPlacementCancel={endPlacementPreview}
                      transformMode={transformMode && canPlaceArtwork}
                      transformEntry={visualTransformEntry}
                      onTransformStart={startTransform}
                      onTransformMove={moveTransform}
                      onTransformEnd={finishTransform}
                      onTransformCancel={cancelTransform}
                    />
                  </Suspense>
                  <CameraControls
                    view={view}
                    revision={revision}
                    placementMode={placementMode && canPlaceArtwork}
                    transformMode={transformMode && canPlaceArtwork}
                  />
                </Canvas>
              </ViewerErrorBoundary>
              <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-slate-700/60 bg-slate-950/85 px-3 py-2 text-[10px] text-slate-200">
                <div className="font-semibold">
                  {selectedRegions.length} area
                  {selectedRegions.length === 1 ? "" : "s"} selected
                </div>
                <div className="mt-1 text-slate-400">
                  {placementMode
                    ? "Click or drag: place logo/text · Orbit paused"
                    : transformMode
                      ? "Drag cyan handles to resize or rotate · Orbit paused"
                      : "Click: select · Drag: orbit · Scroll: zoom"}
                </div>
                {placementDraft && (
                  <div className="mt-1 font-mono text-violet-200">
                    X {placementDraft.offsetX.toFixed(0)} · Y{" "}
                    {placementDraft.offsetY.toFixed(0)}
                  </div>
                )}
                {transformDraft && (
                  <div className="mt-1 font-mono text-cyan-200">
                    Size {transformDraft.scale.toFixed(2)}× · Angle{" "}
                    {transformDraft.rotation.toFixed(0)}°
                  </div>
                )}
              </div>
              <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-slate-950/80 px-2 py-1 text-[10px] text-slate-400">
                {placementMode || transformMode
                  ? "Release handle to save as one Undo action"
                  : "Selection glow is preview-only"}
              </span>
            </div>
            <nav
              className="flex shrink-0 flex-wrap justify-center gap-1 border-t border-slate-700 bg-slate-950/95 p-2"
              aria-label="3D camera views"
            >
              {VIEWS.map(({ id, label }) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={view === id}
                  onClick={() => chooseView(id)}
                  className={`${BTN} ${view === id ? "border-violet-400 bg-violet-700 text-white" : ""}`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}
    </section>
  );
}
