/*
 * DesignByYou — T-Shirt + Hoodie Studio | 2D / 3D Artwork V2 (Hoodie beta)
 * Reuses metadata.clothingColours and metadata.clothingArtwork from FashionEditor.
 * The 3D model is loaded only when the editor opens 3D mode.
 */
import React, {
  Component, Suspense, useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { getClothingTemplateColourRegions } from "../templates/ClothingTemplates";
import {
  collectRegionLocalBounds, createRegionTexture, createTextArtwork,
  isGarmentRegion, projectRegionUv, normalizeRegionArtworkStack,
} from "./Garment3DTextures";

const MODEL_URL = "/models/garments/DBY_Realistic_TShirt_8Regions.glb";
const DEFAULT_COLOUR = "#ffffff";
const GARMENT_MODEL_URLS = Object.freeze({
  tshirt: MODEL_URL,
  hoodie: "/models/garments/DBY_Hoodie_Sketchfab_15Regions_BETA.glb",
});

const VIEWS = Object.freeze([
  { id: "perspective", label: "3/4" }, { id: "front", label: "Front" },
  { id: "back", label: "Back" }, { id: "left", label: "Left" },
  { id: "right", label: "Right" },
]);
const CAMERAS = Object.freeze({
  perspective: [3.3, 1.5, 5.1], front: [0, 0, 5.4],
  back: [0, 0, -5.4], left: [-5.4, 0, 0], right: [5.4, 0, 0],
});
const HEX_COLOUR = /^#[\da-f]{6}$/i;
const safeColour = (value) => HEX_COLOUR.test(String(value || "")) ? value : DEFAULT_COLOUR;
const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0));

function Model({ modelUrl, templateId, regions, colours, artwork, wireframe, onError }) {
  const { scene } = useGLTF(modelUrl);
  const { invalidate } = useThree();
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const prepared = useMemo(() => {
    // GLTFLoader caches the source scene. Own all geometry and materials here.
    const instance = scene.clone(true);
    const meshesByRegion = new Map();
    const materialsByRegion = new Map();
    const ownedGeometries = [];
    const ownedMaterials = [];
    const activeTextures = new Map();
    const appliedConfig = new Map();

    const visit = (node, inheritedRegion = null) => {
      const regionId = isGarmentRegion(node.name, templateId) ? node.name : inheritedRegion;
      if (node.isMesh) {
        if (regionId) {
          const meshes = meshesByRegion.get(regionId) || [];
          meshes.push(node);
          meshesByRegion.set(regionId, meshes);
        }
        const originalMaterials = Array.isArray(node.material) ? node.material : [node.material];
        const ownMaterials = originalMaterials.map((original) => {
          const mat = original.clone();
          mat.side = THREE.DoubleSide;
          if ("roughness" in mat) mat.roughness = 0.86;
          if ("metalness" in mat) mat.metalness = 0;
          ownedMaterials.push(mat);
          return mat;
        });
        node.material = Array.isArray(node.material) ? ownMaterials : ownMaterials[0];
        node.castShadow = false;
        node.receiveShadow = false;
        if (regionId) {
          const mats = materialsByRegion.get(regionId) || [];
          materialsByRegion.set(regionId, mats.concat(ownMaterials));
        }
      }
      node.children.forEach((child) => visit(child, regionId));
    };
    visit(instance);

    // Each material region uses shared normalized projected UV coordinates.
    // Do not rewrite GLB source geometry or materials.
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
    return { instance, scale, materialsByRegion, ownedGeometries, ownedMaterials, activeTextures, appliedConfig };
  }, [scene, templateId]);

  useEffect(() => {
    let cancelled = false;
    const tasks = regions.map(async ({ id }) => {
      const materials = prepared.materialsByRegion.get(id) || [];
      if (!materials.length) return;
      const colour = safeColour(colours?.[id]);
      const entry = artwork?.[id];
      const config = {
        colour, source: entry?.source || "", type: entry?.type || "",
        scale: entry?.scale, rotation: entry?.rotation,
        offsetX: entry?.offsetX, offsetY: entry?.offsetY,
        opacity: entry?.opacity, fit: entry?.fit,
      };
      const previous = prepared.appliedConfig.get(id);
      if (previous && Object.keys(config).every((key) => Object.is(previous[key], config[key]))) {
        return; // Don't decode/rebuild unchanged textures when another region changes.
      }
      let nextMap = null;
      if (entry?.source) {
        try {
          nextMap = await createRegionTexture(templateId, id, colour, entry);
        } catch (error) {
          // A malformed image should not crash the 3D studio.
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
    return () => { cancelled = true; };
  }, [prepared, colours, artwork, invalidate, regions, templateId]);

  useEffect(() => {
    prepared.ownedMaterials.forEach((material) => {
      if ("wireframe" in material) {
        material.wireframe = wireframe;
        material.needsUpdate = true;
      }
    });
    invalidate();
  }, [prepared, wireframe, invalidate]);

  useEffect(() => () => {
    prepared.activeTextures.forEach((texture) => texture.dispose());
    prepared.ownedGeometries.forEach((geometry) => geometry.dispose());
    prepared.ownedMaterials.forEach((material) => material.dispose());
  }, [prepared]);

  return <group scale={prepared.scale}><primitive object={prepared.instance} dispose={null} /></group>;
}

function CameraControls({ view, revision }) {
  const controls = useRef(null);
  const { camera, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(...(CAMERAS[view] || CAMERAS.perspective));
    camera.lookAt(0, 0, 0);
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
    invalidate();
  }, [camera, invalidate, view, revision]);
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08}
    enablePan={false} minDistance={2.3} maxDistance={13}
    minPolarAngle={0.08} maxPolarAngle={Math.PI - 0.08} />;
}

class ViewerErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { this.props.onError?.(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-red-200">
      <strong>3D model could not be loaded.</strong>
      <span className="text-xs">Check the garment GLB under public/models/garments.</span>
      <span className="break-all text-xs">{String(this.state.error?.message || "Unknown error")}</span>
    </div>;
  }
}

const BTN = "rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40";
const FIELD = "min-w-0 w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-100";

/**
 * Props:
 *  artwork: metadata.clothingArtwork normalized through ClothingTemplates.js
 *  onArtworkChange(regionId, stack, label): saves layered artwork and flattened 2D preview
 *  onArtworkUpload(regionId, type, file): parent's secure loadImageAsset(file)
 *  onColourChange(regionId, hex): existing 2D garment colour handler
 */
export default function Garment3DViewer({
  templateId = "tshirt", colours = {}, artwork = {}, artworkLayers = {}, onColourChange = null,
  onArtworkChange = null, onArtworkUpload = null, disabled = false,
  modelUrl = null, className = "", onError = null,
}) {
  const supported = Object.hasOwn(GARMENT_MODEL_URLS, templateId);
  const resolvedModelUrl = modelUrl || GARMENT_MODEL_URLS[templateId] || MODEL_URL;
  const regions = useMemo(() =>
    supported ? getClothingTemplateColourRegions(templateId) : [], [templateId, supported]);
  const garmentLabel = templateId === "hoodie" ? "Hoodie" : "T-Shirt";
  const [view, setView] = useState("perspective");
  const [revision, setRevision] = useState(0);
  const [wireframe, setWireframe] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState("frontBody");
  const [activeTab, setActiveTab] = useState("graphic");
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [textValue, setTextValue] = useState("DesignByYou");
  const [textColour, setTextColour] = useState("#111111");
  const [busy, setBusy] = useState(false);
  const [temporaryColours, setTemporaryColours] = useState({});
  const inputRef = useRef(null);
  const controlsRef = useRef(null);
  const artworkSectionRef = useRef(null);

  const scrollToArtwork = useCallback(() => {
    const scroller = controlsRef.current;
    const section = artworkSectionRef.current;
    if (!scroller || !section) return;
    // Scroll only inside the garment controls; don't move the 2D editor.
    const delta = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: "smooth" });
  }, []);

  const resolvedColours = useMemo(() => ({ ...colours, ...temporaryColours }), [colours, temporaryColours]);
  const legacyEntry = artwork?.[selectedRegion] || null;
  const hasStack = Object.prototype.hasOwnProperty.call(artworkLayers || {}, selectedRegion);
  const stack = normalizeRegionArtworkStack(
    artworkLayers?.[selectedRegion], hasStack ? null : legacyEntry,
  );
  const layers = [
    ...(stack.pattern ? [{ ...stack.pattern, kind: "pattern", name: "Fabric Pattern" }] : []),
    ...stack.logos.map((item, index) => ({ ...item, kind: "logo", name: `Logo / Image ${index + 1}` })),
    ...stack.texts.map((item, index) => ({ ...item, kind: "text", name: item.text ? `Text: ${item.text}` : `Text ${index + 1}` })),
  ];
  const entry = layers.find((item) => item.id === selectedLayerId) || layers[layers.length - 1] || null;
  const hasArtworkBridge = typeof onArtworkChange === "function";
  const hasUploadBridge = typeof onArtworkUpload === "function";
  const editable = supported && !disabled && hasArtworkBridge;
  // Distinguish a locked garment from an editor still using the older
  // 2D/3D integration. Previously both cases simply said "Select a garment".
  const artworkUnavailableReason = !supported
    ? "Select a supported T-Shirt or Hoodie template in 2D first."
    : disabled
      ? "This garment or its layer is locked, hidden, or not editable. Unlock it in Layers."
      : !hasArtworkBridge || !hasUploadBridge
        ? "3D artwork isn't connected to FashionEditor.jsx. Install the updated FashionEditor.jsx from this package."
        : "";
  useEffect(() => { setTemporaryColours({}); setSelectedRegion(regions[0]?.id || "frontBody"); }, [templateId, regions]);
  useEffect(() => { setSelectedLayerId(""); }, [selectedRegion]);

  const changeColour = useCallback((regionId, hex) => {
    if (!supported || disabled || !isGarmentRegion(regionId, templateId)) return;
    const value = safeColour(hex);
    if (typeof onColourChange === "function") onColourChange(regionId, value);
    else setTemporaryColours((old) => ({ ...old, [regionId]: value }));
  }, [supported, disabled, onColourChange, templateId]);

  const chooseView = (id) => { setView(id); setRevision((n) => n + 1); };
  const updateArtwork = (nextStack, label) => {
    if (!editable) return;
    void Promise.resolve(onArtworkChange(selectedRegion, nextStack, label)).catch((error) => onError?.(error));
  };
  const changeSetting = (key, value) => {
    if (!entry || !editable) return;
    const changed = { ...entry, [key]: value };
    if (entry.kind === "pattern") updateArtwork({ ...stack, pattern: changed }, "Adjust fabric pattern");
    else if (entry.kind === "logo") updateArtwork({ ...stack, logos: stack.logos.map((item) => item.id === entry.id ? changed : item) }, "Adjust garment logo");
    else updateArtwork({ ...stack, texts: stack.texts.map((item) => item.id === entry.id ? changed : item) }, "Adjust garment text");
  };
  const removeSelectedLayer = () => {
    if (!entry || !editable) return;
    if (entry.kind === "pattern") updateArtwork({ ...stack, pattern: null }, "Remove garment pattern");
    else if (entry.kind === "logo") updateArtwork({ ...stack, logos: stack.logos.filter((item) => item.id !== entry.id) }, "Remove garment logo");
    else updateArtwork({ ...stack, texts: stack.texts.filter((item) => item.id !== entry.id) }, "Remove garment text");
    setSelectedLayerId("");
  };
  const handleUpload = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file || disabled || !supported || typeof onArtworkUpload !== "function") return;
    setBusy(true);
    try {
      const wasSaved = await onArtworkUpload(selectedRegion, activeTab === "pattern" ? "pattern" : "image", file);
      if (wasSaved) setSelectedLayerId(""); // select the newest layer
    } catch (error) { onError?.(error); }
    finally { setBusy(false); }
  };
  const addText = async () => {
    if (!editable || busy || stack.texts.length >= 24) return;
    const png = createTextArtwork(textValue, textColour);
    if (!png) return;
    const newLayer = {
      id: globalThis.crypto?.randomUUID?.() || `txt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: "image", source: png, text: textValue.trim(), scale: 0.45,
      rotation: 0, offsetX: 0, offsetY: 0, opacity: 1, fit: "contain",
    };
    setBusy(true);
    try {
      const saved = await onArtworkChange(selectedRegion,
        { ...stack, texts: [...stack.texts, newLayer] }, "Add garment text");
      if (saved) setSelectedLayerId(newLayer.id);
    } catch (error) { onError?.(error); }
    finally { setBusy(false); }
  };

  return (
    <section className={`flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-900 text-slate-100 ${className}`} aria-label="DesignByYou 3D garment studio">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-700 bg-slate-950 px-3 py-2">
        <div>
          <strong className="text-xs">3D Garment Studio</strong>
          <p className="text-[11px] text-slate-400">{supported ? `${garmentLabel} · synchronized graphics and prints` : "Select a supported 2D garment to preview it here"}</p>
        </div>
        {supported && <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BTN} onClick={scrollToArtwork} title="Jump to logo upload, text and fabric pattern controls">
            Logos &amp; patterns ↓
          </button>
          <button type="button" aria-pressed={wireframe} className={BTN} onClick={() => setWireframe((n) => !n)}>
            Wireframe: {wireframe ? "On" : "Off"}
          </button>
        </div>}
      </header>
      {!supported ? <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-slate-300">
        Switch to 2D, select a T-Shirt or Hoodie template, then return to 3D.
      </div> : <>
        <div className="relative h-[clamp(165px,30dvh,300px)] shrink-0 bg-gradient-to-b from-slate-700 via-slate-800 to-slate-950">
          <ViewerErrorBoundary key={resolvedModelUrl} onError={onError}>
            <Canvas dpr={[1, 1.5]} frameloop="demand" camera={{ position: CAMERAS.perspective, fov: 35, near: 0.1, far: 80 }} gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }} style={{ height: "100%", width: "100%" }}>
              <ambientLight intensity={1.4}/><hemisphereLight args={["#ffffff", "#475569", 1.4]} />
              <directionalLight position={[4, 6, 6]} intensity={2.5}/>
              <directionalLight position={[-5, 2, -4]} intensity={1.5}/>
              <Suspense fallback={<Html center><div className="rounded bg-slate-950 px-4 py-3 text-xs">Loading garment…</div></Html>}>
                <Model modelUrl={resolvedModelUrl} templateId={templateId} regions={regions} colours={resolvedColours} artwork={artwork} wireframe={wireframe} onError={onError} />
              </Suspense>
              <CameraControls view={view} revision={revision}/>
            </Canvas>
          </ViewerErrorBoundary>
          <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-slate-950/85 px-2 py-1 text-[10px]">Drag: rotate · Scroll: zoom</span>
        </div>
        <nav className="flex shrink-0 flex-wrap justify-center gap-1 border-t border-slate-700 bg-slate-950 p-2" aria-label="3D camera views">
          {VIEWS.map(({ id, label }) => <button type="button" key={id} aria-pressed={view === id} onClick={() => chooseView(id)} className={`${BTN} ${view === id ? "border-violet-400 bg-violet-700 text-white" : ""}`}>{label}</button>)}
        </nav>
        <div
          ref={controlsRef}
          role="region"
          aria-label="Garment color, logo upload, text and fabric pattern controls"
          tabIndex={0}
          className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain border-t border-slate-700 bg-slate-950 px-3 pb-10 pt-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#64748b #020617" }}
        >
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <strong className="text-[11px] uppercase tracking-wide text-slate-300">Garment colors</strong>
              <span className="text-[10px] text-slate-500">{onColourChange ? "Synced with 2D" : "Preview-only colors"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {regions.map(({ id, label }) => <label key={id} className="flex min-w-0 items-center gap-2 text-[10px] text-slate-300">
                <input type="color" value={safeColour(resolvedColours?.[id])} onChange={(e) => changeColour(id, e.target.value)} disabled={disabled} aria-label={`Color of ${label}`} className="h-7 w-8 shrink-0 cursor-pointer rounded border border-slate-600 bg-transparent disabled:opacity-40" />
                <span className="min-w-0 truncate" title={label}>{label}</span>
              </label>)}
            </div>
          </div>
          <div ref={artworkSectionRef} className="scroll-mt-3 border-t border-slate-700 pt-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <strong className="text-[11px] uppercase tracking-wide text-slate-300">Graphics · Text · Fabric prints</strong>
              <span className="text-[10px] text-slate-500">{editable && hasUploadBridge ? "Updates both 2D and 3D" : "Artwork editing unavailable"}</span>
            </div>
            {artworkUnavailableReason && <p role="status" className="mb-2 rounded-md border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200">{artworkUnavailableReason}</p>}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
              <label className="space-y-1 text-[10px] text-slate-400">Garment region
                <select className={FIELD} value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)}>
                  {regions.map(({ id, label }) => <option value={id} key={id}>{label}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-1.5" role="group" aria-label="Artwork type">
                {[{ id: "graphic", label: "Logo / Image" }, { id: "pattern", label: "Fabric Pattern" }, { id: "text", label: "Text" }].map(({ id, label }) =>
                  <button type="button" key={id} aria-pressed={activeTab === id} onClick={() => setActiveTab(id)} className={`${BTN} ${activeTab === id ? "border-violet-400 bg-violet-700 text-white" : ""}`}>{label}</button>)}
              </div>
            </div>
            {activeTab === "text" ? <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="min-w-[190px] flex-1 space-y-1 text-[10px] text-slate-400">Garment text
                <input className={FIELD} maxLength={60} value={textValue} onChange={(e) => setTextValue(e.target.value)} placeholder="Enter text" disabled={!editable}/>
              </label>
              <label className="space-y-1 text-[10px] text-slate-400">Text color
                <input type="color" aria-label="Text color" value={textColour} onChange={(e) => setTextColour(e.target.value)} className="block h-8 w-9 rounded border border-slate-600" disabled={!editable}/>
              </label>
              <button type="button" className={BTN} disabled={!editable || busy || stack.texts.length >= 24 || !textValue.trim()} onClick={addText}>Place Text</button>
            </div> : <div className="mt-2 flex flex-wrap items-center gap-2">
              <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleUpload}/>
              <button type="button" className={BTN} disabled={!editable || busy || !hasUploadBridge} onClick={() => inputRef.current?.click()}>{busy ? "Importing…" : activeTab === "pattern" ? "Upload Pattern" : "Upload Logo / Image"}</button>
              <span className="text-[10px] text-slate-500">PNG, JPG, WebP, SVG · uses existing secure 2D import</span>
            </div>}
            <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-[11px] uppercase tracking-wide text-slate-300">Layer stack · {layers.length} item{layers.length === 1 ? "" : "s"}</strong>
                <span className="text-[10px] text-slate-400">Base color → Pattern → Logos → Text</span>
              </div>
              {layers.length === 0 ? (
                <p className="text-[11px] text-slate-500">No artwork on this region. Upload a pattern, then add as many logos and text layers as you need.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Select garment artwork layer">
                  {layers.map((item) => <button type="button" key={item.id}
                    aria-pressed={entry?.id === item.id}
                    onClick={() => setSelectedLayerId(item.id)}
                    className={`${BTN} max-w-[220px] truncate ${entry?.id === item.id ? "border-violet-400 bg-violet-700 text-white" : ""}`}>
                    {item.name}
                  </button>)}
                </div>
              )}
              {entry && <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">Edit {entry.name}</span>
                  <button type="button" className={BTN} disabled={!editable || busy} onClick={removeSelectedLayer}>Remove this layer</button>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                  {[{ key: "scale", name: entry.kind === "pattern" ? "Repeat size" : "Graphic size", min: 0.05, max: 3, step: 0.05 },
                    { key: "rotation", name: "Rotation", min: -180, max: 180, step: 1 },
                    { key: "offsetX", name: "Horizontal", min: -120, max: 120, step: 1 },
                    { key: "offsetY", name: "Vertical", min: -120, max: 120, step: 1 },
                    { key: "opacity", name: "Opacity", min: 0, max: 1, step: 0.05 }].map(({ key, name, min, max, step }) =>
                      <label key={key} className="space-y-1 text-[10px] text-slate-400">{name}: {Number(entry[key] ?? (key === "scale" || key === "opacity" ? 1 : 0)).toFixed(key === "opacity" ? 2 : 1)}
                        <input type="range" className="block w-full accent-violet-500" min={min} max={max} step={step}
                          value={clamp(entry[key] ?? (key === "scale" || key === "opacity" ? 1 : 0), min, max)}
                          disabled={!editable || busy} onChange={(e) => changeSetting(key, Number(e.target.value))}/>
                      </label>)}
                  <label className="space-y-1 text-[10px] text-slate-400">Image fitting
                    <select className={FIELD} value={entry.fit || "contain"} disabled={!editable || busy} onChange={(e) => changeSetting("fit", e.target.value)}>
                      <option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Stretch</option>
                    </select>
                  </label>
                </div>
              </div>}
            </div>
          </div>
        </div>
      </>}
    </section>
  );
}
