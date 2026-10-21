/*
 * DesignByYou — Phase 3.3 · Persistent, editable garment typography.
 * Pure data helpers. Rasterized PNG remains the existing 2D/3D rendering format.
 * Only known-safe canvas font families are allowed in saved text metadata.
 */
export const GARMENT_TEXT_FONTS = Object.freeze([
  "Arial", "Verdana", "Georgia", "Tahoma", "Trebuchet MS",
  "Times New Roman", "Courier New", "Impact", "sans-serif", "serif", "monospace",
]);

export const DEFAULT_GARMENT_TEXT_STYLE = Object.freeze({
  color: "#111111", fontFamily: "Arial", fontSize: 190,
  fontWeight: 700, fontStyle: "normal", align: "center", letterSpacing: 0,
});

const clamp = (value, low, high, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(low, Math.min(high, n)) : fallback;
};

export function sanitizeGarmentText(value) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 60);
}

export function normalizeGarmentTextStyle(input = {}) {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const defaults = DEFAULT_GARMENT_TEXT_STYLE;
  const color = typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color)
    ? raw.color.toLowerCase() : defaults.color;
  return {
    color,
    fontFamily: GARMENT_TEXT_FONTS.includes(raw.fontFamily) ? raw.fontFamily : defaults.fontFamily,
    fontSize: clamp(raw.fontSize, 40, 240, defaults.fontSize),
    fontWeight: [400, 500, 600, 700, 800, 900].includes(Number(raw.fontWeight))
      ? Number(raw.fontWeight) : defaults.fontWeight,
    fontStyle: raw.fontStyle === "italic" ? "italic" : "normal",
    align: ["left", "center", "right"].includes(raw.align) ? raw.align : defaults.align,
    letterSpacing: clamp(raw.letterSpacing, -8, 24, defaults.letterSpacing),
  };
}

/**
 * Build a replacement for one text layer, without altering position/scale/rotation,
 * identity, opacity, or unrelated layers. The caller renders the PNG once and
 * commits the entire region stack in one Undo step.
 */
export function restyleGarmentTextLayer(layer, changes, imageRenderer) {
  if (!layer || typeof imageRenderer !== "function") return null;
  const text = sanitizeGarmentText(changes?.text ?? layer.text);
  if (!text) return null;
  const textStyle = normalizeGarmentTextStyle({
    ...normalizeGarmentTextStyle(layer.textStyle), ...(changes?.textStyle || {}),
  });
  const source = imageRenderer(text, textStyle);
  if (typeof source !== "string" || !source.startsWith("data:image/png;base64,")) return null;
  return { ...layer, text, textStyle, source };
}
