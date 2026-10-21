/*
 * DesignByYou | Garment3DTextures.js
 * 2D template artwork -> fabric textures for T-shirt, Hoodie, Skirt, Pants and Shirt (beta)
 *
 * This model uses separated front/back meshes. For V1 we generate stable
 * planar UV coordinates on cloned geometry (never on useGLTF's cache).
 * This preserves garment folds, but is NOT a full production UV unwrap.
 */

import * as THREE from "three";
import { normalizeGarmentTextStyle, sanitizeGarmentText } from "./GarmentTextArtwork";
import { normalizeGarmentPatternSettings, calculatePatternTile } from "./GarmentPatternStudio";
import { getClothingTemplateArtworkBox, getClothingTemplateColourRegions } from "../templates/ClothingTemplates";

const MAX_CANVAS_EDGE = 1024;
const MAX_LAYERS = 24;
// Region IDs are sourced from the 2D template; keep them as the source of truth.
// Calling isGarmentRegion(id) without a template retains legacy T-shirt behavior.
const REGION_IDS_BY_TEMPLATE = new Map();
function regionIdsFor(templateId) {
  const id = String(templateId || "tshirt");
  if (id !== "tshirt" && id !== "hoodie" && id !== "skirt" && id !== "pants" && id !== "shirt" && id !== "dress") return new Set();
  if (!REGION_IDS_BY_TEMPLATE.has(id)) {
    REGION_IDS_BY_TEMPLATE.set(id, new Set(
      getClothingTemplateColourRegions(id).map((region) => region.id),
    ));
  }
  return REGION_IDS_BY_TEMPLATE.get(id);
}

const clamp = (value, low, high, fallback = low) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(low, Math.min(high, n)) : fallback;
};

export function isGarmentRegion(value, templateId = "tshirt") {
  return regionIdsFor(templateId).has(value);
}

function isBackRegion(regionId) {
  return regionId.startsWith("back");
}

/**
 * Clone geometry and replace its UVs with a front-facing planar projection.
 * Reverses X on back meshes so artwork reads correctly from the back camera.
 * One geometry/mesh may appear multiple times due to GLB primitive splitting.
 */
export function projectRegionUv(geometry, regionId, bounds) {
  const owned = geometry.clone();
  const positions = owned.getAttribute("position");
  if (!positions) return owned;
  const min = bounds.min;
  const max = bounds.max;
  const width = Math.max(1e-6, max.x - min.x);
  const height = Math.max(1e-6, max.y - min.y);
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const u = (x - min.x) / width;
    uv[i * 2] = isBackRegion(regionId) ? 1 - u : u;
    uv[i * 2 + 1] = (y - min.y) / height;
  }
  owned.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return owned;
}

/**
 * Estimate common projection extents from geometry positions. Each primitive
 * in a region must use the same bounds so graphics cross primitives cleanly.
 */
export function collectRegionLocalBounds(regionMeshes) {
  const bounds = new THREE.Box3();
  for (const mesh of regionMeshes) {
    const position = mesh.geometry.getAttribute("position");
    if (!position) continue;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    bounds.union(mesh.geometry.boundingBox);
  }
  return bounds;
}

function loadLocalImage(source) {
  return new Promise((resolve, reject) => {
    if (typeof source !== "string" || !/^data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]/i.test(source)) {
      reject(new Error("Artwork is not an embedded image data URL."));
      return;
    }
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to decode garment artwork."));
    image.src = source;
  });
}

function drawImageFit(ctx, image, x, y, width, height, fit = "contain") {
  const iw = Math.max(1, image.naturalWidth || image.width);
  const ih = Math.max(1, image.naturalHeight || image.height);
  if (fit === "fill") {
    ctx.drawImage(image, x, y, width, height);
    return;
  }
  if (fit === "cover") {
    const scale = Math.max(width / iw, height / ih);
    const sw = width / scale;
    const sh = height / scale;
    ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, width, height);
    return;
  }
  const scale = Math.min(width / iw, height / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}

function paintGraphic(ctx, image, entry, unitsW, unitsH, pixelsPerX, pixelsPerY) {
  const scale = clamp(entry.scale, 0.05, 12, 1);
  const opacity = clamp(entry.opacity, 0, 1, 1);
  const angle = (clamp(entry.rotation, -3600, 3600, 0) * Math.PI) / 180;
  const offsetX = clamp(entry.offsetX, -2000, 2000, 0) * pixelsPerX;
  const offsetY = clamp(entry.offsetY, -2000, 2000, 0) * pixelsPerY;
  const frameW = unitsW * pixelsPerX * scale;
  const frameH = unitsH * pixelsPerY * scale;
  const cx = (unitsW * pixelsPerX) / 2 + offsetX;
  const cy = (unitsH * pixelsPerY) / 2 + offsetY;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.globalAlpha = opacity;
  // SVG artwork clips to the garment region; planar UVs restrict this image
  // to the region's fabric. Within that region, cover clips to the frame.
  if (entry.fit === "cover") {
    ctx.beginPath();
    ctx.rect(-frameW / 2, -frameH / 2, frameW, frameH);
    ctx.clip();
  }
  drawImageFit(ctx, image, -frameW / 2, -frameH / 2, frameW, frameH, entry.fit);
  ctx.restore();
}

function paintPattern(ctx, image, entry, canvas, unitW, unitH) {
  const settings = normalizeGarmentPatternSettings(entry);
  const dimensions = calculatePatternTile(settings, unitW, unitH, canvas.width, canvas.height);
  const { motifW, motifH, strideW, strideH, tileW, tileH, brick } = dimensions;
  const tile = document.createElement("canvas");
  tile.width = tileW;
  tile.height = tileH;
  const tileCtx = tile.getContext("2d");
  if (!tileCtx) return;
  tileCtx.imageSmoothingEnabled = true;
  tileCtx.imageSmoothingQuality = "high";
  // Repeat motif with transparent, editable gaps. Two rows create a seamless
  // half-drop brick layout; negative columns fill both tile wrap edges.
  const rows = brick ? 2 : 1;
  for (let row = 0; row < rows; row += 1) {
    const xShift = brick && row % 2 ? strideW / 2 : 0;
    const fromCol = brick ? -1 : 0;
    const toCol = brick ? 3 : 1;
    for (let col = fromCol; col < toCol; col += 1) {
      const x = col * strideW + xShift;
      if (x >= tileW || x + motifW <= 0) continue;
      drawImageFit(tileCtx, image, x, row * strideH, motifW, motifH, settings.fit);
    }
  }
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;

  const dx = settings.offsetX * canvas.width / unitW;
  const dy = settings.offsetY * canvas.height / unitH;
  const xSide = settings.alignment.includes("right") ? "right"
    : settings.alignment === "center" ? "center" : "left";
  const ySide = settings.alignment.startsWith("bottom") ? "bottom"
    : settings.alignment === "center" ? "center" : "top";
  const anchorX = xSide === "right" ? canvas.width - motifW
    : xSide === "center" ? (canvas.width - motifW) / 2 : 0;
  const anchorY = ySide === "bottom" ? canvas.height - motifH
    : ySide === "center" ? (canvas.height - motifH) / 2 : 0;

  ctx.save();
  ctx.globalAlpha = settings.opacity;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(settings.rotation * Math.PI / 180);
  ctx.translate(-canvas.width / 2 + dx + anchorX, -canvas.height / 2 + dy + anchorY);
  ctx.fillStyle = pattern;
  // Cover every rotated viewport corner while keeping the actual GPU texture
  // bounded to MAX_CANVAS_EDGE. We do not resize/rewrite uploaded source images.
  const pad = Math.hypot(canvas.width, canvas.height) + Math.abs(dx) + Math.abs(dy) + Math.max(tileW, tileH);
  ctx.fillRect(-pad, -pad, canvas.width + pad * 2, canvas.height + pad * 2);
  ctx.restore();
}

/**
 * Build an opaque region texture: cloth base color then artwork. The material
 * must be white when applying this map to avoid tinting logos and text.
 * `artwork` uses the same metadata.clothingArtwork entries as the 2D SVG.
 */
export async function createRegionTexture(templateId, regionId, clothColour, entry) {
  if (!isGarmentRegion(regionId, templateId) || !entry?.source) return null;
  const box = getClothingTemplateArtworkBox(templateId, regionId);
  if (!box) return null;
  const image = await loadLocalImage(entry.source);
  const unitW = Math.max(1, box.width);
  const unitH = Math.max(1, box.height);
  const scale = Math.min(MAX_CANVAS_EDGE / unitW, MAX_CANVAS_EDGE / unitH);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(128, Math.round(unitW * scale));
  canvas.height = Math.max(128, Math.round(unitH * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot create a garment artwork texture.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(clothColour || "") ? clothColour : "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (entry.type === "pattern") {
    paintPattern(ctx, image, entry, canvas, unitW, unitH);
  } else {
    paintGraphic(ctx, image, entry, unitW, unitH, canvas.width / unitW, canvas.height / unitH);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
}


/**
 * Version 2 saved artwork. The 2D SVG engine still reads one flattened PNG
 * per region; the editable pattern/logo/text layers live in object metadata.
 * This function is deliberately pure, so older saved garments remain readable.
 */
export function normalizeRegionArtworkStack(value, legacyEntry = null) {
  const empty = { pattern: null, logos: [], texts: [] };
  if (value && typeof value === "object" && !Array.isArray(value) &&
      (Object.hasOwn(value, "pattern") || Array.isArray(value.logos) || Array.isArray(value.texts))) {
    const sanitise = (entry, prefix) => {
      if (!entry || typeof entry !== "object" ||
          typeof entry.source !== "string" ||
          !/^data:image\/(png|jpe?g|webp|gif|svg\+xml)(?:;[^,]*)?,/i.test(entry.source)) return null;
      return {
        id: String(entry.id || `${prefix}-${Date.now()}`).slice(0, 100),
        type: prefix === "pattern" ? "pattern" : "image",
        source: entry.source,
        text: typeof entry.text === "string" ? sanitizeGarmentText(entry.text) : undefined,
        ...(prefix === "text" && typeof entry.text === "string" && entry.text.trim()
          ? { textStyle: entry.textStyle ? normalizeGarmentTextStyle(entry.textStyle) : undefined }
          : {}),
        scale: clamp(entry.scale, 0.05, 12, prefix === "pattern" ? 1 : 0.45),
        rotation: clamp(entry.rotation, -3600, 3600, 0),
        offsetX: clamp(entry.offsetX, -2000, 2000, 0),
        offsetY: clamp(entry.offsetY, -2000, 2000, 0),
        opacity: clamp(entry.opacity, 0, 1, 1),
        fit: ["contain", "cover", "fill"].includes(entry.fit)
          ? entry.fit : (prefix === "pattern" ? "cover" : "contain"),
        ...(prefix === "pattern" ? (() => {
          const settings = normalizeGarmentPatternSettings(entry);
          return { spacingX: settings.spacingX, spacingY: settings.spacingY,
            alignment: settings.alignment, layout: settings.layout };
        })() : {}),
      };
    };
    return {
      pattern: sanitise(value.pattern, "pattern"),
      logos: (Array.isArray(value.logos) ? value.logos : []).slice(0, MAX_LAYERS)
        .map((item) => sanitise(item, "logo")).filter(Boolean),
      texts: (Array.isArray(value.texts) ? value.texts : []).slice(0, MAX_LAYERS)
        .map((item) => sanitise(item, "text")).filter(Boolean),
    };
  }
  // Transparently migrate existing single-entry designs on first 3D edit.
  if (legacyEntry?.source) {
    const old = { ...legacyEntry, id: `legacy-${legacyEntry.type === "pattern" ? "pattern" : "logo"}` };
    return legacyEntry.type === "pattern" ? { ...empty, pattern: old } : { ...empty, logos: [old] };
  }
  return empty;
}

/**
 * Flattens one region's editable stack to a transparent PNG for the unchanged
 * clothing SVG renderer. The very same composition is used in the 3D viewer.
 * No base color is baked in, so recoloring remains independent of artwork.
 */
export async function flattenRegionArtworkStack(templateId, regionId, input) {
  if (!isGarmentRegion(regionId, templateId)) return null;
  const box = getClothingTemplateArtworkBox(templateId, regionId);
  if (!box) return null;
  const stack = normalizeRegionArtworkStack(input);
  const entries = [stack.pattern, ...stack.logos, ...stack.texts].filter(Boolean);
  if (!entries.length) return null;
  const unitW = Math.max(1, box.width);
  const unitH = Math.max(1, box.height);
  const scale = Math.min(MAX_CANVAS_EDGE / unitW, MAX_CANVAS_EDGE / unitH);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(128, Math.round(unitW * scale));
  canvas.height = Math.max(128, Math.round(unitH * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot compose garment artwork layers.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (stack.pattern) {
    paintPattern(ctx, await loadLocalImage(stack.pattern.source), stack.pattern, canvas, unitW, unitH);
  }
  for (const item of [...stack.logos, ...stack.texts]) {
    paintGraphic(ctx, await loadLocalImage(item.source), item, unitW, unitH,
      canvas.width / unitW, canvas.height / unitH);
  }
  return {
    type: "image", source: canvas.toDataURL("image/png"),
    scale: 1, rotation: 0, offsetX: 0, offsetY: 0,
    opacity: 1, fit: "fill",
  };
}

/** Render a portable PNG from editable text metadata.
 * Compatible with the original createTextArtwork(text, "#111111") API.
 * An explicit style object adds font, weight, size, spacing, alignment and color.
 */
export function createTextArtwork(text, colorOrStyle = "#111111") {
  const clean = sanitizeGarmentText(text);
  if (!clean) return null;
  const options = typeof colorOrStyle === "string"
    ? { color: colorOrStyle } : colorOrStyle;
  const style = normalizeGarmentTextStyle(options);
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = style.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const glyphs = Array.from(clean);
  let fontSize = style.fontSize;
  const assignFont = () => {
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px "${style.fontFamily}", sans-serif`;
  };
  const measure = () => glyphs.reduce((w, glyph) => w + ctx.measureText(glyph).width, 0)
    + Math.max(0, glyphs.length - 1) * style.letterSpacing;
  assignFont();
  while (fontSize > 18 && measure() > 940) {
    fontSize -= 2;
    assignFont();
  }
  const renderedWidth = measure();
  const x = style.align === "left" ? 42 : style.align === "right"
    ? canvas.width - 42 - renderedWidth : (canvas.width - renderedWidth) / 2;
  let cursor = x;
  for (const glyph of glyphs) {
    ctx.fillText(glyph, cursor, 166);
    cursor += ctx.measureText(glyph).width + style.letterSpacing;
  }
  return canvas.toDataURL("image/png");
}
