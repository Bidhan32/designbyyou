/*
 * DesignByYou 3D Studio V3 — Phase 3.4
 * Portable, image-independent fabric pattern settings shared by 2D and 3D.
 * Existing designs with no Phase 3.4 fields keep the original repeat behavior.
 */
export const GARMENT_PATTERN_DEFAULTS = Object.freeze({
  scale: 1, rotation: 0, offsetX: 0, offsetY: 0,
  opacity: 1, fit: "cover",
  spacingX: 0, spacingY: 0, alignment: "top-left", layout: "grid",
});

export const GARMENT_PATTERN_ALIGNMENT = Object.freeze([
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "center", label: "Center" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
]);

export const GARMENT_PATTERN_LAYOUTS = Object.freeze([
  { value: "grid", label: "Straight repeat" },
  { value: "brick", label: "Half-drop / brick" },
]);

export const GARMENT_PATTERN_PRESETS = Object.freeze([
  { id: "classic", label: "Classic", settings: {scale: 1, spacingX: 0, spacingY: 0, rotation: 0, layout: "grid"}},
  { id: "micro", label: "Micro print", settings: {scale: 0.35, spacingX: 0, spacingY: 0, rotation: 0, layout: "grid"}},
  { id: "bold", label: "Large print", settings: {scale: 1.8, spacingX: 0, spacingY: 0, rotation: 0, layout: "grid"}},
  { id: "airy", label: "Spaced", settings: {scale: 0.75, spacingX: 0.6, spacingY: 0.6, rotation: 0, layout: "grid"}},
  { id: "brick", label: "Staggered", settings: {scale: 0.8, spacingX: 0.1, spacingY: 0.1, rotation: 0, layout: "brick"}},
  { id: "diagonal", label: "Diagonal", settings: {scale: 0.8, spacingX: 0.1, spacingY: 0.1, rotation: 45, layout: "grid"}},
]);

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export function normalizeGarmentPatternSettings(raw = {}) {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const alignment = GARMENT_PATTERN_ALIGNMENT.some((item) => item.value === value.alignment)
    ? value.alignment : GARMENT_PATTERN_DEFAULTS.alignment;
  const layout = GARMENT_PATTERN_LAYOUTS.some((item) => item.value === value.layout)
    ? value.layout : GARMENT_PATTERN_DEFAULTS.layout;
  return {
    scale: clamp(value.scale, 0.05, 12, 1),
    rotation: clamp(value.rotation, -3600, 3600, 0),
    offsetX: clamp(value.offsetX, -2000, 2000, 0),
    offsetY: clamp(value.offsetY, -2000, 2000, 0),
    opacity: clamp(value.opacity, 0, 1, 1),
    fit: ["contain", "cover", "fill"].includes(value.fit) ? value.fit : "cover",
    spacingX: clamp(value.spacingX, 0, 1.5, 0),
    spacingY: clamp(value.spacingY, 0, 1.5, 0),
    alignment, layout,
  };
}

export function useGarmentPatternPreset(current, presetId) {
  const preset = GARMENT_PATTERN_PRESETS.find((item) => item.id === presetId);
  if (!preset) return normalizeGarmentPatternSettings(current);
  // Preserve saved color-independent positioning, alignment, fitting and opacity.
  return normalizeGarmentPatternSettings({ ...current, ...preset.settings });
}

/** Calculates repeat geometry independently of DOM/Canvas, so it is testable. */
export function calculatePatternTile({ scale, spacingX, spacingY, layout }, unitW, unitH,
    canvasW, canvasH) {
  const s = normalizeGarmentPatternSettings({scale, spacingX, spacingY, layout});
  const brick = s.layout === "brick";
  // Brick layouts require a 2-by-2 tile. Enforce a 2048-pixel upper bound
  // per edge to avoid allocating 4096² canvases (64 MB each) during edits.
  const maxStride = brick ? 1024 : 2048;
  const motifW = Math.round(Math.max(8, Math.min(1024, maxStride / (1 + s.spacingX),
    84 * s.scale * canvasW / Math.max(1, unitW))));
  const motifH = Math.round(Math.max(8, Math.min(1024, maxStride / (1 + s.spacingY),
    84 * s.scale * canvasH / Math.max(1, unitH))));
  const strideW = Math.round(Math.max(8, Math.min(maxStride, motifW * (1 + s.spacingX))));
  const strideH = Math.round(Math.max(8, Math.min(maxStride, motifH * (1 + s.spacingY))));
  return { motifW, motifH, strideW, strideH, brick,
    tileW: strideW * (brick ? 2 : 1),
    tileH: strideH * (brick ? 2 : 1) };
}
