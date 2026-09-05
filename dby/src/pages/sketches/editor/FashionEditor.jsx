/*
=========================================================
FashionVision Professional Editor
Responsive Main Fashion Editor
Version 3.7.0 — Creator Showcase Share
=========================================================
*/

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useNavigate, useParams } from "react-router-dom";

import API from "/src/api/axios";

import EditorCanvas from "./EditorCanvas";

import ImageTool, {
  IMAGE_FILE_ACCEPT,
  loadImageAsset,
} from "../tools/ImageTool";

import ClothingTool from "../tools/ClothingTool";

import {
  CLOTHING_TEMPLATES,
  CLOTHING_ARTWORK_DEFAULTS,
  CLOTHING_ARTWORK_TYPES,
  createClothingTemplateFile,
  createClothingTemplatePreview,
  createClothingTemplateMetadata,
  getClothingTemplateColourRegions,
  getClothingTemplateDefaultColours,
  getClothingTemplateViews,
  getClothingTemplateArtworkRegions,
  isDualViewClothingTemplate,
  normaliseClothingTemplateArtwork,
} from "../templates/ClothingTemplates";

import PatternTool, {
  PATTERN_FILE_ACCEPT,
  PATTERN_REPEAT_MODES,
  loadPatternAsset,
} from "../tools/PatternTool";

import PatternMaskTool, {
  createPatternMaskUpdates,
  createPatternMaskRemovalUpdates,
  hasPatternMask,
} from "../tools/PatternMaskTool";

import {
  BRUSH_PRESETS,
  DEFAULT_BRUSH_PRESET_ID,
  createBrushSettingsFromPreset,
  getBrushPreset,
} from "../brushes/BrushPresets";

import {
  BLEND_MODES,
  EDITOR_TOOLS,
  OBJECT_TYPES,
  useFashionEditorStore,
} from "../useFashionEditorStore";

/*=========================================================
Constants
=========================================================*/

const DEFAULT_COLOURS = Object.freeze([
  "#111111",
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#78716c",
]);

const CLOTHING_VIEW_LABELS = Object.freeze({
  front: "Front",
  back: "Back",
  other: "Other",
});

const CLOTHING_GROUP_LABELS = Object.freeze({
  body: "Body",
  bodice: "Bodice",
  skirt: "Skirt",
  sleeves: "Sleeves",
  collar: "Collars",
  neckline: "Necklines",
  hood: "Hood",
  hem: "Hems",
  cuffs: "Cuffs",
  waist: "Waist",
  legs: "Legs",
  pockets: "Pockets",
  panels: "Panels",
  details: "Details",
});

const CLOTHING_ARTWORK_FIT_OPTIONS = Object.freeze([
  {
    value: "contain",
    label: "Contain",
  },
  {
    value: "cover",
    label: "Cover",
  },
  {
    value: "fill",
    label: "Stretch",
  },
]);

const CLOTHING_ARTWORK_TYPE_LABELS = Object.freeze({
  [CLOTHING_ARTWORK_TYPES.IMAGE]: "Graphic",
  [CLOTHING_ARTWORK_TYPES.PATTERN]: "Pattern",
});

const AI_FASHION_ENDPOINT = "/ai-fashion/render";

const AI_FASHION_DEFAULT_STYLE =
  "premium realistic fashion product photography";

const AI_FASHION_DEFAULT_NOTES =
  "Preserve the exact visible silhouette, proportions, colors, graphics, text, pattern placement and construction details from the supplied editor design.";

const AI_FASHION_CLOTHING_NOTES =
  "Treat the supplied garment board as a strict technical fashion reference. Preserve the exact garment silhouette, neckline, sleeve shape, hem, proportions, panel construction, colors, color blocking, graphics, logos, text and pattern placement. Do not redesign, simplify, replace or invent garment details. Only add realistic fabric texture, stitching, seams, folds, material depth, shadows and professional studio lighting.";

const AI_FASHION_DUAL_VIEW_NOTES = [
  "The supplied reference is one clean technical fashion board containing two separate views of the same garment.",
  "LEFT SIDE IS THE FRONT VIEW. RIGHT SIDE IS THE BACK VIEW.",
  "Generate one realistic product image containing BOTH views side by side in that same left-to-right order.",
  "Preserve the front and back independently. Do not merge the two views and do not copy artwork from one side to the other.",
  "Keep every front graphic, logo, text element, color block and pattern only where it appears on the front reference.",
  "Keep every back graphic, logo, text element, color block and pattern only where it appears on the back reference.",
  "Do not remove the back artwork. Do not replace either side's artwork with invented artwork.",
  "Preserve the exact silhouette, neckline, sleeve shape, hem, proportions, panel construction, seam layout and colors of both views.",
  "Only convert the flat fashion board into a believable manufactured garment by adding realistic fabric texture, stitching, seams, folds, material depth, shadows and professional studio lighting.",
  "Faithfulness to the supplied front and back design is more important than creative reinterpretation.",
].join(" ");

const AI_FASHION_CAPTURE_MAX_DIMENSION = 1536;

const LINE_STYLE_OPTIONS = Object.freeze([
  {
    id: "solid",
    label: "Solid",
    dash: [],
  },
  {
    id: "dashed",
    label: "Dashed",
    dash: [14, 10],
  },
  {
    id: "dotted",
    label: "Dotted",
    dash: [2, 8],
  },
  {
    id: "dash-dot",
    label: "Dash Dot",
    dash: [14, 8, 2, 8],
  },
]);

const LINE_CAP_OPTIONS = Object.freeze([
  {
    id: "round",
    label: "Round",
  },
  {
    id: "butt",
    label: "Butt",
  },
  {
    id: "square",
    label: "Square",
  },
]);

const SHAPE_TYPE_OPTIONS = Object.freeze([
  {
    id: "rectangle",
    label: "Rectangle",
  },
  {
    id: "ellipse",
    label: "Ellipse",
  },
  {
    id: "circle",
    label: "Circle",
  },
  {
    id: "triangle",
    label: "Triangle",
  },
  {
    id: "polygon",
    label: "Polygon",
  },
]);

const TEXT_FONT_OPTIONS = Object.freeze([
  "Arial",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Comic Sans MS",
  "Impact",
]);

const TEXT_WEIGHT_OPTIONS = Object.freeze([
  {
    value: 300,
    label: "Light",
  },
  {
    value: 400,
    label: "Regular",
  },
  {
    value: 500,
    label: "Medium",
  },
  {
    value: 600,
    label: "Semi Bold",
  },
  {
    value: 700,
    label: "Bold",
  },
  {
    value: 800,
    label: "Extra Bold",
  },
  {
    value: 900,
    label: "Black",
  },
]);

const TEXT_ALIGN_OPTIONS = Object.freeze([
  {
    value: "left",
    label: "Left",
  },
  {
    value: "center",
    label: "Center",
  },
  {
    value: "right",
    label: "Right",
  },
  {
    value: "justify",
    label: "Justify",
  },
]);

const TEXT_VERTICAL_ALIGN_OPTIONS = Object.freeze([
  {
    value: "top",
    label: "Top",
  },
  {
    value: "middle",
    label: "Middle",
  },
  {
    value: "bottom",
    label: "Bottom",
  },
]);

const DEFAULT_TEXT_SETTINGS = Object.freeze({
  content: "Text",
  text: "Text",
  value: "Text",
  fontFamily: "Arial",
  fontSize: 32,
  fontWeight: 400,
  fontStyle: "normal",
  textDecoration: "",
  align: "left",
  verticalAlign: "top",
  lineHeight: 1.2,
  letterSpacing: 0,
  fill: "#111111",
  color: "#111111",
  opacity: 1,
  width: 240,
  height: 64,
  wrap: "word",
  padding: 0,
});

const IMAGE_FIT_OPTIONS = Object.freeze([
  {
    value: "contain",
    label: "Contain",
  },
  {
    value: "cover",
    label: "Cover",
  },
  {
    value: "fill",
    label: "Stretch",
  },
]);

const DEFAULT_IMAGE_SETTINGS = Object.freeze({
  opacity: 1,
  fit: "contain",
  preserveAspectRatio: true,
  cornerRadius: 0,
  imageSmoothingEnabled: true,
});

const PATTERN_REPEAT_OPTIONS = Object.freeze([
  {
    value: PATTERN_REPEAT_MODES.REPEAT,
    label: "Repeat",
  },
  {
    value: PATTERN_REPEAT_MODES.REPEAT_X,
    label: "Repeat X",
  },
  {
    value: PATTERN_REPEAT_MODES.REPEAT_Y,
    label: "Repeat Y",
  },
  {
    value: PATTERN_REPEAT_MODES.NO_REPEAT,
    label: "No Repeat",
  },
]);

const DEFAULT_PATTERN_SETTINGS = Object.freeze({
  repeat: PATTERN_REPEAT_MODES.REPEAT,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  offsetX: 0,
  offsetY: 0,
  imageSmoothingEnabled: true,
  clipToBounds: true,
  background: "transparent",
});

/*=========================================================
Creator Cloud Project Configuration
=========================================================*/

const CREATOR_EDITOR_ENDPOINT = "/creators/editor-projects";

const CREATOR_EDITOR_ROUTE = "/creator/fashion-editor";

const CREATOR_SHOWCASE_ROUTE = "/creator/showcase";

const SHOWCASE_CATEGORIES_ENDPOINT = "/creators/studio/categories";

const SHOWCASE_DISCOVERY_ENDPOINT = "/creator-showcase/discovery";

const SHOWCASE_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;

const SHOWCASE_MAX_TITLE_LENGTH = 120;

const SHOWCASE_MAX_DESCRIPTION_LENGTH = 3000;

const SHOWCASE_MAX_TAG_LENGTH = 30;

const SHOWCASE_MAX_TAGS = 12;

const SHOWCASE_FORMAT_OPTIONS = Object.freeze([
  {
    value: "sketch",
    label: "Fashion Sketch",
  },
  {
    value: "3d_garment",
    label: "3D Garment",
  },
  {
    value: "tech_pack",
    label: "Technical Design",
  },
]);

const INITIAL_SHOWCASE_SHARE_FORM = Object.freeze({
  title: "",
  description: "",
  format: "sketch",
  category_id: "",
  style_term_id: "",
  garment_term_id: "",
  occasion_term_ids: [],
  allow_remix: true,
});

const TOOL_DEFINITIONS = Object.freeze([
  {
    id: EDITOR_TOOLS.SELECT,
    label: "Select",
    shortcut: "V",
    symbol: "V",
    enabled: true,
  },
  {
    id: EDITOR_TOOLS.PENCIL,
    label: "Pencil",
    shortcut: "P",
    symbol: "P",
    enabled: true,
  },
  {
    id: EDITOR_TOOLS.ERASER,
    label: "Eraser",
    shortcut: "E",
    symbol: "E",
    enabled: true,
  },
  {
    id: EDITOR_TOOLS.PAN,
    label: "Pan",
    shortcut: "H",
    symbol: "H",
    enabled: true,
  },
  {
    id: EDITOR_TOOLS.BRUSH,
    label: "Brush",
    shortcut: "B",
    symbol: "B",
    enabled: true,
  },
  {
    id: EDITOR_TOOLS.LINE,
    label: "Line",
    shortcut: "L",
    symbol: "L",
    enabled: true,
  },
  {
    id: EDITOR_TOOLS.SHAPE,
    label: "Shape",
    shortcut: "S",
    symbol: "S",
    enabled: true,
  },
  {
    id: EDITOR_TOOLS.CLOTHING,
    label: "Clothing",
    shortcut: "C",
    symbol: "C",
    enabled: true,
  },
  {
    id: EDITOR_TOOLS.FILL,
    label: "Fill",
    shortcut: "F",
    symbol: "F",
    enabled: true,
  },
  {
    id: EDITOR_TOOLS.TEXT,
    label: "Text",
    shortcut: "T",
    symbol: "T",
    enabled: true,
  },
  {
    id: EDITOR_TOOLS.IMAGE,
    label: "Image",
    shortcut: "I",
    symbol: "I",
    enabled: true,
  },
  {
    id: EDITOR_TOOLS.PATTERN,
    label: "Pattern",
    shortcut: "R",
    symbol: "R",
    enabled: true,
  },
  {
    id: EDITOR_TOOLS.PATTERN_MASK,
    label: "Pattern Mask",
    shortcut: "M",
    symbol: "M",
    enabled: true,
  },
]);

const SYMMETRY_MODE_OPTIONS = Object.freeze([
  {
    value: "vertical",
    label: "Vertical",
    shortLabel: "V",
  },
  {
    value: "horizontal",
    label: "Horizontal",
    shortLabel: "H",
  },
  {
    value: "four-way",
    label: "Four Way",
    shortLabel: "4",
  },
]);

const SYMMETRY_TOOL_OPTIONS = Object.freeze([
  {
    id: EDITOR_TOOLS.PENCIL,
    label: "Pencil",
    settingKey: "mirrorPencil",
    available: true,
  },
  {
    id: EDITOR_TOOLS.BRUSH,
    label: "Brush",
    settingKey: "mirrorBrush",
    available: true,
  },
  {
    id: EDITOR_TOOLS.LINE,
    label: "Line",
    settingKey: "mirrorLine",
    available: true,
  },
  {
    id: EDITOR_TOOLS.SHAPE,
    label: "Shape",
    settingKey: "mirrorShape",
    available: true,
  },
  {
    id: EDITOR_TOOLS.ERASER,
    label: "Eraser",
    settingKey: "mirrorEraser",
    available: false,
  },
]);

const DEFAULT_SYMMETRY_GUIDE_COLOUR = "#8b5cf6";

/*=========================================================
Helpers
=========================================================*/

function numberOr(value, fallback = 0) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, numberOr(value, minimum)));
}

function normaliseSymmetryMode(mode) {
  const requested = typeof mode === "string" ? mode.trim().toLowerCase() : "";

  return SYMMETRY_MODE_OPTIONS.some((option) => option.value === requested)
    ? requested
    : "vertical";
}

function createDefaultSymmetrySettings(documentData = null) {
  const width = Math.max(1, numberOr(documentData?.width, 1200));

  const height = Math.max(1, numberOr(documentData?.height, 1600));

  return {
    enabled: false,

    mode: "vertical",

    axisX: width / 2,

    axisY: height / 2,

    showGuide: true,

    guideColor: DEFAULT_SYMMETRY_GUIDE_COLOUR,

    guideOpacity: 0.85,

    guideWidth: 1,

    guideDash: [10, 8],

    snapToAxis: false,

    mirrorPencil: true,

    mirrorBrush: true,

    mirrorLine: true,

    mirrorShape: true,

    mirrorEraser: false,

    linkedMirrors: false,
  };
}

function getSymmetryModeLabel(mode) {
  return (
    SYMMETRY_MODE_OPTIONS.find(
      (option) => option.value === normaliseSymmetryMode(mode),
    )?.label || "Vertical"
  );
}

function resolveImageFitMode(object) {
  const requested = (
    object?.fit ||
    object?.imageFit ||
    object?.objectFit ||
    object?.style?.fit ||
    object?.style?.imageFit ||
    object?.style?.objectFit ||
    ""
  )
    .toString()
    .trim()
    .toLowerCase();

  if (
    requested === "contain" ||
    requested === "cover" ||
    requested === "fill"
  ) {
    return requested;
  }

  return object?.preserveAspectRatio === false ||
    object?.style?.preserveAspectRatio === false
    ? "fill"
    : "contain";
}

function resolvePatternRepeatMode(object) {
  const requested = (
    object?.repeat ||
    object?.repeatMode ||
    object?.patternRepeat ||
    object?.style?.repeat ||
    object?.style?.repeatMode ||
    object?.style?.patternRepeat ||
    PATTERN_REPEAT_MODES.REPEAT
  )
    .toString()
    .trim()
    .toLowerCase();

  return PATTERN_REPEAT_OPTIONS.some((option) => option.value === requested)
    ? requested
    : PATTERN_REPEAT_MODES.REPEAT;
}

function resolvePatternScaleX(object) {
  return clamp(
    object?.patternScaleX ??
      object?.style?.patternScaleX ??
      object?.patternScale ??
      object?.style?.patternScale ??
      1,
    0.02,
    50,
  );
}

function resolvePatternScaleY(object) {
  return clamp(
    object?.patternScaleY ??
      object?.style?.patternScaleY ??
      object?.patternScale ??
      object?.style?.patternScale ??
      1,
    0.02,
    50,
  );
}

function normalisePatternBackground(value) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : "transparent";
}

function getLineStyleId(dash) {
  if (!Array.isArray(dash) || dash.length === 0) {
    return "solid";
  }

  const normalizedDash = dash.map((value) => numberOr(value, 0));

  const match = LINE_STYLE_OPTIONS.find(
    (option) =>
      option.dash.length === normalizedDash.length &&
      option.dash.every((value, index) => value === normalizedDash[index]),
  );

  return match?.id || "solid";
}

function getLineStyle(dash) {
  const styleId = getLineStyleId(dash);

  return (
    LINE_STYLE_OPTIONS.find((option) => option.id === styleId) ||
    LINE_STYLE_OPTIONS[0]
  );
}

function createSafeFilename(value, fallback = "fashion-design") {
  const text = typeof value === "string" ? value.trim() : "";

  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || fallback;
}

function downloadTextFile(filename, content, mimeType = "application/json") {
  const blob = new Blob([content], {
    type: `${mimeType};charset=utf-8`,
  });

  const url = URL.createObjectURL(blob);

  const anchor = globalThis.document.createElement("a");

  anchor.href = url;

  anchor.download = filename;

  globalThis.document.body.appendChild(anchor);

  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
}

function downloadDataUrl(filename, dataUrl) {
  const anchor = globalThis.document.createElement("a");

  anchor.href = dataUrl;

  anchor.download = filename;

  globalThis.document.body.appendChild(anchor);

  anchor.click();
  anchor.remove();
}

function rasterizeImageSourceToPngDataUrl(
  source,
  {
    maxDimension = AI_FASHION_CAPTURE_MAX_DIMENSION,
    background = "#ffffff",
  } = {},
) {
  const safeSource = typeof source === "string" ? source.trim() : "";

  if (!safeSource) {
    return Promise.reject(new Error("The garment reference image is empty."));
  }

  return new Promise((resolve, reject) => {
    const image = new globalThis.Image();

    image.decoding = "async";

    image.onload = () => {
      try {
        const sourceWidth = Math.max(
          1,
          numberOr(image.naturalWidth || image.width, 1),
        );

        const sourceHeight = Math.max(
          1,
          numberOr(image.naturalHeight || image.height, 1),
        );

        const safeMaximum = Math.max(
          256,
          numberOr(maxDimension, AI_FASHION_CAPTURE_MAX_DIMENSION),
        );

        const scale = Math.min(
          1,
          safeMaximum / Math.max(sourceWidth, sourceHeight),
        );

        const outputWidth = Math.max(1, Math.round(sourceWidth * scale));

        const outputHeight = Math.max(1, Math.round(sourceHeight * scale));

        const canvas = globalThis.document.createElement("canvas");

        canvas.width = outputWidth;
        canvas.height = outputHeight;

        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("The browser could not prepare the garment image.");
        }

        context.fillStyle = background;
        context.fillRect(0, 0, outputWidth, outputHeight);

        context.imageSmoothingEnabled = true;

        if ("imageSmoothingQuality" in context) {
          context.imageSmoothingQuality = "high";
        }

        context.drawImage(image, 0, 0, outputWidth, outputHeight);

        resolve(canvas.toDataURL("image/png", 1));
      } catch (error) {
        reject(error);
      }
    };

    image.onerror = () => {
      reject(new Error("The garment reference image could not be prepared."));
    };

    image.src = safeSource;
  });
}

function getApiErrorMessage(error, fallbackMessage) {
  if (
    error?.code === "ERR_CANCELED" ||
    error?.name === "CanceledError" ||
    error?.name === "AbortError"
  ) {
    return "";
  }

  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallbackMessage
  );
}

function extractApiRecord(response) {
  return response?.data?.data || null;
}

function parseStoredProjectData(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function isPositiveProjectId(value) {
  return /^[1-9]\d*$/.test(String(value || "").trim());
}

function cleanShowcaseText(value, fallback = "") {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function normalizeShowcaseCategoriesResponse(response) {
  const raw = Array.isArray(response?.data?.data)
    ? response.data.data
    : Array.isArray(response?.data?.categories)
      ? response.data.categories
      : [];

  const result = [];

  const seen = new Set();

  for (const item of raw) {
    const id = cleanShowcaseText(item?.id);

    const name = cleanShowcaseText(item?.name);

    if (!id || !name || seen.has(id)) {
      continue;
    }

    seen.add(id);

    result.push({
      id,
      name,
      slug: cleanShowcaseText(item?.slug) || null,
      description: cleanShowcaseText(item?.description) || null,
      sort_order: Number.isFinite(Number(item?.sort_order))
        ? Number(item.sort_order)
        : 0,
    });
  }

  return result;
}

function normalizeShowcaseDiscoveryTerm(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const id = cleanShowcaseText(item.id);

  const name = cleanShowcaseText(item.name);

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    slug: cleanShowcaseText(item.slug) || null,
    search_term: cleanShowcaseText(item.search_term, name),
    emoji: cleanShowcaseText(item.emoji) || null,
    description: cleanShowcaseText(item.description) || null,
    sort_order: Number.isFinite(Number(item.sort_order))
      ? Number(item.sort_order)
      : 0,
  };
}

function normalizeShowcaseDiscoveryArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const result = [];

  const seen = new Set();

  for (const item of value) {
    const normalized = normalizeShowcaseDiscoveryTerm(item);

    if (!normalized || seen.has(normalized.id)) {
      continue;
    }

    seen.add(normalized.id);

    result.push(normalized);
  }

  return result;
}

function normalizeShowcaseDiscoveryResponse(response) {
  const data = response?.data?.data || {};

  return {
    styles: normalizeShowcaseDiscoveryArray(data.styles),
    garments: normalizeShowcaseDiscoveryArray(data.garments),
    occasions: normalizeShowcaseDiscoveryArray(data.occasions),
  };
}

function normalizeShowcaseTag(value) {
  return cleanShowcaseText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, SHOWCASE_MAX_TAG_LENGTH);
}

function uniqueShowcaseTags(values) {
  const result = [];

  const seen = new Set();

  for (const value of values) {
    const tag = normalizeShowcaseTag(value);

    if (!tag || seen.has(tag)) {
      continue;
    }

    seen.add(tag);
    result.push(tag);

    if (result.length >= SHOWCASE_MAX_TAGS) {
      break;
    }
  }

  return result;
}

function createFileFromDataUrl(
  dataUrl,
  filename = "fashion-editor-showcase.png",
) {
  const source = String(dataUrl || "").trim();

  const match = source.match(/^data:([^;,]+)(;base64)?,(.*)$/s);

  if (!match) {
    throw new Error("The Showcase preview is not a valid image.");
  }

  const mimeType = String(match[1] || "image/png").toLowerCase();

  const encoded = match[3] || "";

  let byteString;

  try {
    byteString = match[2] ? window.atob(encoded) : decodeURIComponent(encoded);
  } catch {
    throw new Error("The Showcase preview could not be decoded.");
  }

  const bytes = new Uint8Array(byteString.length);

  for (let index = 0; index < byteString.length; index += 1) {
    bytes[index] = byteString.charCodeAt(index);
  }

  const file = new File([bytes], filename, {
    type: mimeType,
  });

  if (file.size <= 0) {
    throw new Error("The Showcase preview is empty.");
  }

  return file;
}

function getFirstChild(node) {
  const children = node?.getChildren?.();

  if (!children) {
    return null;
  }

  if (typeof children.toArray === "function") {
    return children.toArray()[0] || null;
  }

  try {
    return Array.from(children)[0] || null;
  } catch {
    return null;
  }
}

function getClothingRegionView(region) {
  const explicitView = String(region?.view || "")
    .trim()
    .toLowerCase();

  if (explicitView === "front" || explicitView === "back") {
    return explicitView;
  }

  const regionId = String(region?.id || "");

  if (/^front[A-Z]/.test(regionId)) {
    return "front";
  }

  if (/^back[A-Z]/.test(regionId)) {
    return "back";
  }

  return "other";
}

function getPairedClothingRegionId(regionId, targetView) {
  const id = String(regionId || "").trim();
  const target = String(targetView || "")
    .trim()
    .toLowerCase();

  if (!id || (target !== "front" && target !== "back")) {
    return "";
  }

  if (/^front[A-Z]/.test(id)) {
    const suffix = id.slice("front".length);

    return target === "front" ? id : `back${suffix}`;
  }

  if (/^back[A-Z]/.test(id)) {
    const suffix = id.slice("back".length);

    return target === "back" ? id : `front${suffix}`;
  }

  return "";
}

function getClothingGroupLabel(groupId) {
  const normalized = String(groupId || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return "Regions";
  }

  return (
    CLOTHING_GROUP_LABELS[normalized] ||
    normalized
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

/*=========================================================
Media Query Hook
=========================================================*/

function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return undefined;
    }

    const mediaQuery = window.matchMedia(query);

    const updateMatch = () => {
      setMatches(mediaQuery.matches);
    };

    updateMatch();

    mediaQuery.addEventListener?.("change", updateMatch);

    return () => {
      mediaQuery.removeEventListener?.("change", updateMatch);
    };
  }, [query]);

  return matches;
}

/*=========================================================
Reusable Components
=========================================================*/

function HeaderButton({
  children,
  onClick,
  disabled = false,
  active = false,
  title = "",
  className = "",
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition",
        active
          ? "border-violet-500 bg-violet-500 text-white"
          : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500 hover:bg-slate-700",
        disabled
          ? "cursor-not-allowed opacity-40 hover:border-slate-700 hover:bg-slate-800"
          : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
}

function ToolButton({ tool, active, onClick, horizontal = false }) {
  return (
    <button
      type="button"
      disabled={!tool.enabled}
      onClick={() => {
        if (tool.enabled) {
          onClick(tool.id);
        }
      }}
      title={
        tool.enabled
          ? `${tool.label} (${tool.shortcut})`
          : `${tool.label} — coming soon`
      }
      aria-pressed={active}
      className={[
        "group shrink-0 rounded-xl border transition",
        horizontal
          ? "flex h-14 min-w-[58px] flex-col items-center justify-center px-2"
          : "flex h-14 w-14 flex-col items-center justify-center",
        active
          ? "border-violet-500 bg-violet-500 text-white shadow-lg shadow-violet-950/40"
          : "border-transparent bg-slate-900 text-slate-400 hover:border-slate-700 hover:bg-slate-800 hover:text-white",
        !tool.enabled
          ? "cursor-not-allowed opacity-35 hover:border-transparent hover:bg-slate-900 hover:text-slate-400"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="text-sm font-black">{tool.symbol}</span>

      <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider">
        {tool.label}
      </span>
    </button>
  );
}

function PanelSection({ title, children, action = null }) {
  return (
    <section className="border-b border-slate-800 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
          {title}
        </h3>

        {action}
      </div>

      {children}
    </section>
  );
}

function SliderField({
  label,
  value,
  minimum,
  maximum,
  step = 1,
  suffix = "",
  onChange,
  onStart = null,
  onEnd = null,
  disabled = false,
}) {
  return (
    <label
      className={["block", disabled ? "opacity-50" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-slate-300">{label}</span>

        <span className="min-w-12 text-right text-xs font-semibold text-slate-100">
          {value}
          {suffix}
        </span>
      </div>

      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
        onPointerDown={onStart}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
        onBlur={onEnd}
        className="h-1.5 w-full cursor-pointer accent-violet-500 disabled:cursor-not-allowed"
      />
    </label>
  );
}

function LayerNameField({ layer, renameLayer }) {
  const [name, setName] = useState(layer.name);

  useEffect(() => {
    setName(layer.name);
  }, [layer.id, layer.name]);

  const commitName = useCallback(() => {
    const cleanedName = name.trim();

    if (!cleanedName) {
      setName(layer.name);

      return;
    }

    if (cleanedName !== layer.name) {
      renameLayer(layer.id, cleanedName);
    }
  }, [name, layer.id, layer.name, renameLayer]);

  return (
    <input
      value={name}
      onChange={(event) => {
        setName(event.target.value);
      }}
      onBlur={commitName}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }

        if (event.key === "Escape") {
          setName(layer.name);

          event.currentTarget.blur();
        }
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      className="min-w-0 flex-1 border-none bg-transparent text-xs font-semibold text-slate-200 outline-none"
    />
  );
}

function DocumentNameField({ documentData, setDocumentName }) {
  const [name, setName] = useState(documentData.name);

  useEffect(() => {
    setName(documentData.name);
  }, [documentData.id, documentData.name]);

  const commitName = useCallback(() => {
    const cleanedName = name.trim();

    if (!cleanedName) {
      setName(documentData.name);

      return;
    }

    if (cleanedName !== documentData.name) {
      setDocumentName(cleanedName);
    }
  }, [name, documentData.name, setDocumentName]);

  return (
    <input
      value={name}
      onChange={(event) => {
        setName(event.target.value);
      }}
      onBlur={commitName}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }

        if (event.key === "Escape") {
          setName(documentData.name);

          event.currentTarget.blur();
        }
      }}
      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-semibold text-slate-200 outline-none transition hover:border-slate-700 focus:border-violet-500 focus:bg-slate-900 sm:text-sm"
      aria-label="Document name"
    />
  );
}

/*=========================================================
Fashion Editor
=========================================================*/

function FashionEditor() {
  const navigate = useNavigate();

  const { projectId: routeProjectId } = useParams();

  const stageRef = useRef(null);

  const fileInputRef = useRef(null);

  const imageFileInputRef = useRef(null);

  const imageInputModeRef = useRef({
    mode: "place",

    objectId: null,
  });

  const clothingArtworkFileInputRef = useRef(null);

  const clothingArtworkInputModeRef = useRef({
    regionId: null,

    type: CLOTHING_ARTWORK_TYPES.IMAGE,
  });

  const patternFileInputRef = useRef(null);

  const patternInputModeRef = useRef({
    mode: "place",

    objectId: null,

    objectIds: [],
  });

  const toastTimerRef = useRef(null);

  const projectLoadControllerRef = useRef(null);

  const projectSaveControllerRef = useRef(null);

  const showcaseMetadataControllerRef = useRef(null);

  const showcaseShareControllerRef = useRef(null);

  const aiFashionControllerRef = useRef(null);

  const saveInFlightRef = useRef(false);

  const skipNextRouteLoadRef = useRef(null);

  const isDesktopPanel = useMediaQuery("(min-width: 1280px)");

  /*=====================================================
    Store State
    =====================================================*/

  const documentData = useFashionEditorStore((state) => state.document);

  const layers = useFashionEditorStore((state) => state.layers);

  const objects = useFashionEditorStore((state) => state.objects);

  const activeLayerId = useFashionEditorStore((state) => state.activeLayerId);

  const selectedObjectIds = useFashionEditorStore(
    (state) => state.selectedObjectIds,
  );

  const activeTool = useFashionEditorStore((state) => state.activeTool);

  const storedSymmetry = useFashionEditorStore((state) => state.symmetry);

  const symmetry = useMemo(
    () => ({
      ...createDefaultSymmetrySettings(documentData),

      ...(storedSymmetry || {}),

      mode: normaliseSymmetryMode(storedSymmetry?.mode),
    }),
    [storedSymmetry, documentData.width, documentData.height],
  );

  const brush = useFashionEditorStore((state) => state.brush);

  const shape = useFashionEditorStore((state) => state.shape);

  const storedTextSettings = useFashionEditorStore((state) => state.text);

  const textSettings = useMemo(
    () => ({
      ...DEFAULT_TEXT_SETTINGS,
      ...(storedTextSettings || {}),
    }),
    [storedTextSettings],
  );

  const storedImageSettings = useFashionEditorStore((state) => state.image);

  const imageSettings = useMemo(
    () => ({
      ...DEFAULT_IMAGE_SETTINGS,
      ...(storedImageSettings || {}),
    }),
    [storedImageSettings],
  );

  const storedPatternSettings = useFashionEditorStore((state) => state.pattern);

  const patternSettings = useMemo(
    () => ({
      ...DEFAULT_PATTERN_SETTINGS,
      ...(storedPatternSettings || {}),
    }),
    [storedPatternSettings],
  );

  const eraser = useFashionEditorStore((state) => state.eraser);

  const colours = useFashionEditorStore((state) => state.colors);

  const viewport = useFashionEditorStore((state) => state.viewport);

  const ui = useFashionEditorStore((state) => state.ui);

  const history = useFashionEditorStore((state) => state.history);

  const persistence = useFashionEditorStore((state) => state.persistence);

  /*=====================================================
    Store Actions
    =====================================================*/

  const setActiveTool = useFashionEditorStore((state) => state.setActiveTool);

  const newDocument = useFashionEditorStore((state) => state.newDocument);

  const setDocumentName = useFashionEditorStore(
    (state) => state.setDocumentName,
  );

  const setDocumentBackground = useFashionEditorStore(
    (state) => state.setDocumentBackground,
  );

  const getProjectData = useFashionEditorStore((state) => state.getProjectData);

  const loadProject = useFashionEditorStore((state) => state.loadProject);

  const markSaved = useFashionEditorStore((state) => state.markSaved);

  const setSaving = useFashionEditorStore((state) => state.setSaving);

  const setSaveError = useFashionEditorStore((state) => state.setSaveError);

  const undo = useFashionEditorStore((state) => state.undo);

  const redo = useFashionEditorStore((state) => state.redo);

  const setBrushSettings = useFashionEditorStore(
    (state) => state.setBrushSettings,
  );

  const setShapeSettings = useFashionEditorStore(
    (state) => state.setShapeSettings,
  );

  const setTextSettingsAction = useFashionEditorStore(
    (state) => state.setTextSettings,
  );

  const setImageSettingsAction = useFashionEditorStore(
    (state) => state.setImageSettings,
  );

  const setPatternSettingsAction = useFashionEditorStore(
    (state) => state.setPatternSettings,
  );

  const updateObject = useFashionEditorStore((state) => state.updateObject);

  const updateObjects = useFashionEditorStore((state) => state.updateObjects);

  const setEraserSize = useFashionEditorStore((state) => state.setEraserSize);

  const setEraserMode = useFashionEditorStore((state) => state.setEraserMode);

  const setPrimaryColor = useFashionEditorStore(
    (state) => state.setPrimaryColor,
  );

  const setSecondaryColor = useFashionEditorStore(
    (state) => state.setSecondaryColor,
  );

  const swapColors = useFashionEditorStore((state) => state.swapColors);

  const addLayer = useFashionEditorStore((state) => state.addLayer);

  const setActiveLayer = useFashionEditorStore((state) => state.setActiveLayer);

  const renameLayer = useFashionEditorStore((state) => state.renameLayer);

  const toggleLayerVisibility = useFashionEditorStore(
    (state) => state.toggleLayerVisibility,
  );

  const toggleLayerLock = useFashionEditorStore(
    (state) => state.toggleLayerLock,
  );

  const setLayerOpacity = useFashionEditorStore(
    (state) => state.setLayerOpacity,
  );

  const setLayerBlendMode = useFashionEditorStore(
    (state) => state.setLayerBlendMode,
  );

  const moveLayer = useFashionEditorStore((state) => state.moveLayer);

  const duplicateLayer = useFashionEditorStore((state) => state.duplicateLayer);

  const deleteLayer = useFashionEditorStore((state) => state.deleteLayer);

  const deleteObjects = useFashionEditorStore((state) => state.deleteObjects);

  const duplicateObjects = useFashionEditorStore(
    (state) => state.duplicateObjects,
  );

  const zoomIn = useFashionEditorStore((state) => state.zoomIn);

  const zoomOut = useFashionEditorStore((state) => state.zoomOut);

  const fitDocumentToViewport = useFashionEditorStore(
    (state) => state.fitDocumentToViewport,
  );

  const toggleGrid = useFashionEditorStore((state) => state.toggleGrid);

  const setUiState = useFashionEditorStore((state) => state.setUiState);

  const toggleSymmetryAction = useFashionEditorStore(
    (state) => state.toggleSymmetry,
  );

  const setSymmetrySettingsAction = useFashionEditorStore(
    (state) => state.setSymmetrySettings,
  );

  const setSymmetryModeAction = useFashionEditorStore(
    (state) => state.setSymmetryMode,
  );

  const centerSymmetryAxesAction = useFashionEditorStore(
    (state) => state.centerSymmetryAxes,
  );

  const setSymmetryToolEnabledAction = useFashionEditorStore(
    (state) => state.setSymmetryToolEnabled,
  );

  const resetSymmetrySettingsAction = useFashionEditorStore(
    (state) => state.resetSymmetrySettings,
  );

  const beginHistoryTransaction = useFashionEditorStore(
    (state) => state.beginHistoryTransaction,
  );

  const commitHistoryTransaction = useFashionEditorStore(
    (state) => state.commitHistoryTransaction,
  );

  /*=====================================================
    Local State
    =====================================================*/

  const [panelDrawerOpen, setPanelDrawerOpen] = useState(false);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [pointerInformation, setPointerInformation] = useState(null);

  const [toast, setToast] = useState(null);

  const [editorError, setEditorError] = useState(null);

  const [exporting, setExporting] = useState(false);

  const [aiFashionGenerating, setAiFashionGenerating] = useState(false);

  const [aiFashionSaving, setAiFashionSaving] = useState(false);

  const [aiFashionPreviewOpen, setAiFashionPreviewOpen] = useState(false);

  const [aiFashionResult, setAiFashionResult] = useState(null);

  const [aiFashionError, setAiFashionError] = useState("");

  const [imageImporting, setImageImporting] = useState(false);

  const [clothingImporting, setClothingImporting] = useState(false);

  const [clothingArtworkImporting, setClothingArtworkImporting] =
    useState(false);

  const [clothingArtworkRegionId, setClothingArtworkRegionId] = useState("");

  const [patternImporting, setPatternImporting] = useState(false);

  const [cloudProjectId, setCloudProjectId] = useState(
    isPositiveProjectId(routeProjectId) ? String(routeProjectId) : null,
  );

  const [cloudProjectVersion, setCloudProjectVersion] = useState(null);

  const [projectLoading, setProjectLoading] = useState(Boolean(routeProjectId));

  const [projectSaving, setProjectSaving] = useState(false);

  const [showcaseShareOpen, setShowcaseShareOpen] = useState(false);

  const [showcaseSharing, setShowcaseSharing] = useState(false);

  const [showcaseUploadProgress, setShowcaseUploadProgress] = useState(0);

  const [showcaseShareError, setShowcaseShareError] = useState("");

  const [showcasePreviewDataUrl, setShowcasePreviewDataUrl] = useState("");

  const [showcaseMetadataLoading, setShowcaseMetadataLoading] = useState(false);

  const [showcaseMetadataError, setShowcaseMetadataError] = useState("");

  const [showcaseCategories, setShowcaseCategories] = useState([]);

  const [showcaseDiscovery, setShowcaseDiscovery] = useState({
    styles: [],
    garments: [],
    occasions: [],
  });

  const [showcaseShareForm, setShowcaseShareForm] = useState(() => ({
    ...INITIAL_SHOWCASE_SHARE_FORM,
    occasion_term_ids: [],
  }));

  const [showcaseTags, setShowcaseTags] = useState([]);

  const [showcaseTagInput, setShowcaseTagInput] = useState("");

  /*=====================================================
    Derived State
    =====================================================*/

  const rightPanelTab = ui.rightPanelTab || "layers";

  const activeLayer = useMemo(
    () => layers.find((layer) => layer.id === activeLayerId) || null,
    [layers, activeLayerId],
  );

  const selectedObjects = useMemo(
    () =>
      selectedObjectIds.map((objectId) => objects[objectId]).filter(Boolean),
    [selectedObjectIds, objects],
  );

  const selectedImageObject = useMemo(
    () =>
      selectedObjects.length === 1 &&
      selectedObjects[0]?.type === OBJECT_TYPES.IMAGE
        ? selectedObjects[0]
        : null,
    [selectedObjects],
  );

  const selectedImageLayer = useMemo(
    () =>
      selectedImageObject
        ? layers.find((layer) => layer.id === selectedImageObject.layerId) ||
          null
        : null,
    [layers, selectedImageObject],
  );

  const selectedImageLocked = Boolean(
    selectedImageObject &&
    (selectedImageObject.locked ||
      selectedImageObject.visible === false ||
      !selectedImageLayer ||
      selectedImageLayer.locked ||
      selectedImageLayer.visible === false),
  );

  const selectedImageFit = resolveImageFitMode(selectedImageObject);

  const selectedImageWidth = Math.max(
    1,
    numberOr(selectedImageObject?.width, 1),
  );

  const selectedImageHeight = Math.max(
    1,
    numberOr(selectedImageObject?.height, 1),
  );

  const selectedImageOpacity = Math.round(
    clamp(
      selectedImageObject?.opacity ?? selectedImageObject?.style?.opacity ?? 1,
      0,
      1,
    ) * 100,
  );

  const selectedImageCornerRadius = Math.max(
    0,
    numberOr(
      selectedImageObject?.cornerRadius ??
        selectedImageObject?.style?.cornerRadius,
      0,
    ),
  );

  const selectedImageSmoothing =
    (selectedImageObject?.imageSmoothingEnabled ??
      selectedImageObject?.style?.imageSmoothingEnabled ??
      true) !== false;

  /*
  =========================================================
  Selected Clothing Template

  Clothing templates are stored as normal IMAGE objects so
  they keep all existing selection, transform, layer, save
  and export behaviour.

  New clothing objects are identified by their metadata once
  colours are edited. Existing/default objects can also be
  recognised by the built-in template filename.
  =========================================================
  */

  const selectedClothingTemplate = useMemo(() => {
    if (!selectedImageObject) {
      return null;
    }

    const metadata =
      selectedImageObject.metadata &&
      typeof selectedImageObject.metadata === "object"
        ? selectedImageObject.metadata
        : {};

    const explicitTemplateId = String(metadata.clothingTemplateId || "").trim();

    if (explicitTemplateId) {
      const explicitTemplate =
        CLOTHING_TEMPLATES.find(
          (template) => template.id === explicitTemplateId,
        ) || null;

      if (explicitTemplate) {
        return explicitTemplate;
      }
    }

    const fileName = String(
      selectedImageObject.fileName || metadata.originalFileName || "",
    )
      .trim()
      .toLowerCase();

    if (!fileName) {
      return null;
    }

    return (
      CLOTHING_TEMPLATES.find(
        (template) =>
          String(template.fileName || "")
            .trim()
            .toLowerCase() === fileName,
      ) || null
    );
  }, [selectedImageObject]);

  const selectedClothingColourRegions = useMemo(
    () =>
      selectedClothingTemplate
        ? getClothingTemplateColourRegions(selectedClothingTemplate)
        : [],
    [selectedClothingTemplate],
  );

  const selectedClothingColours = useMemo(() => {
    if (!selectedClothingTemplate) {
      return {};
    }

    const defaults = getClothingTemplateDefaultColours(
      selectedClothingTemplate,
    );

    const storedColours =
      selectedImageObject?.metadata?.clothingColours &&
      typeof selectedImageObject.metadata.clothingColours === "object"
        ? selectedImageObject.metadata.clothingColours
        : {};

    return {
      ...defaults,
      ...storedColours,
    };
  }, [selectedClothingTemplate, selectedImageObject]);

  const selectedClothingEditable = Boolean(
    selectedClothingTemplate?.editableColours === true &&
    selectedClothingColourRegions.length > 0,
  );

  const selectedClothingViews = useMemo(
    () =>
      selectedClothingTemplate
        ? getClothingTemplateViews(selectedClothingTemplate)
        : [],
    [selectedClothingTemplate],
  );

  const selectedClothingDualView = Boolean(
    selectedClothingTemplate &&
    isDualViewClothingTemplate(selectedClothingTemplate),
  );

  const selectedClothingRegionsByView = useMemo(() => {
    const grouped = {
      front: [],
      back: [],
      other: [],
    };

    selectedClothingColourRegions.forEach((region) => {
      const view = getClothingRegionView(region);

      grouped[view].push(region);
    });

    return grouped;
  }, [selectedClothingColourRegions]);

  const selectedClothingRegionGroups = useMemo(() => {
    const groups = new Map();

    selectedClothingColourRegions.forEach((region) => {
      const groupId = String(region?.group || "")
        .trim()
        .toLowerCase();

      if (!groupId) {
        return;
      }

      if (!groups.has(groupId)) {
        groups.set(groupId, []);
      }

      groups.get(groupId).push(region);
    });

    return [...groups.entries()]
      .map(([id, regions]) => ({
        id,
        label: getClothingGroupLabel(id),
        regions,
      }))
      .filter((group) => group.regions.length > 1);
  }, [selectedClothingColourRegions]);

  const selectedClothingPairedRegionCount = useMemo(() => {
    const regionIds = new Set(
      selectedClothingColourRegions.map((region) => region.id),
    );

    return selectedClothingColourRegions.filter((region) => {
      if (getClothingRegionView(region) !== "front") {
        return false;
      }

      const pairedId = getPairedClothingRegionId(region.id, "back");

      return Boolean(pairedId && regionIds.has(pairedId));
    }).length;
  }, [selectedClothingColourRegions]);

  const selectedClothingArtworkRegions = useMemo(
    () =>
      selectedClothingTemplate
        ? getClothingTemplateArtworkRegions(selectedClothingTemplate)
        : [],
    [selectedClothingTemplate],
  );

  const selectedClothingArtworkEditable = Boolean(
    selectedClothingTemplate?.editableArtwork === true &&
    selectedClothingArtworkRegions.length > 0,
  );

  const selectedClothingArtwork = useMemo(() => {
    if (!selectedClothingTemplate) {
      return {};
    }

    const storedArtwork =
      selectedImageObject?.metadata?.clothingArtwork &&
      typeof selectedImageObject.metadata.clothingArtwork === "object" &&
      !Array.isArray(selectedImageObject.metadata.clothingArtwork)
        ? selectedImageObject.metadata.clothingArtwork
        : {};

    return normaliseClothingTemplateArtwork(
      selectedClothingTemplate,
      storedArtwork,
    );
  }, [selectedClothingTemplate, selectedImageObject]);

  const selectedClothingArtworkRegionId = useMemo(() => {
    const requested = String(clothingArtworkRegionId || "").trim();

    if (
      requested &&
      selectedClothingArtworkRegions.some((region) => region.id === requested)
    ) {
      return requested;
    }

    return (
      selectedClothingArtworkRegions.find(
        (region) =>
          getClothingRegionView(region) === "front" &&
          ["body", "bodice", "skirt", "legs", "panels"].includes(
            String(region.group || "")
              .trim()
              .toLowerCase(),
          ),
      )?.id ||
      selectedClothingArtworkRegions.find(
        (region) => getClothingRegionView(region) === "front",
      )?.id ||
      selectedClothingArtworkRegions[0]?.id ||
      ""
    );
  }, [clothingArtworkRegionId, selectedClothingArtworkRegions]);

  const selectedClothingArtworkRegion = useMemo(
    () =>
      selectedClothingArtworkRegions.find(
        (region) => region.id === selectedClothingArtworkRegionId,
      ) || null,
    [selectedClothingArtworkRegions, selectedClothingArtworkRegionId],
  );

  const selectedClothingArtworkEntry = selectedClothingArtworkRegionId
    ? selectedClothingArtwork[selectedClothingArtworkRegionId] || null
    : null;

  const selectedClothingArtworkPairedRegionId = useMemo(() => {
    if (!selectedClothingArtworkRegion) {
      return "";
    }

    const currentView = getClothingRegionView(selectedClothingArtworkRegion);

    if (currentView !== "front" && currentView !== "back") {
      return "";
    }

    const targetView = currentView === "front" ? "back" : "front";

    const pairedId = getPairedClothingRegionId(
      selectedClothingArtworkRegion.id,
      targetView,
    );

    return selectedClothingArtworkRegions.some(
      (region) => region.id === pairedId,
    )
      ? pairedId
      : "";
  }, [selectedClothingArtworkRegion, selectedClothingArtworkRegions]);

  const selectedPatternObject = useMemo(
    () =>
      selectedObjects.length === 1 &&
      selectedObjects[0]?.type === OBJECT_TYPES.PATTERN
        ? selectedObjects[0]
        : null,
    [selectedObjects],
  );

  const selectedPatternLayer = useMemo(
    () =>
      selectedPatternObject
        ? layers.find((layer) => layer.id === selectedPatternObject.layerId) ||
          null
        : null,
    [layers, selectedPatternObject],
  );

  const selectedPatternLocked = Boolean(
    selectedPatternObject &&
    (selectedPatternObject.locked ||
      selectedPatternObject.visible === false ||
      !selectedPatternLayer ||
      selectedPatternLayer.locked ||
      selectedPatternLayer.visible === false),
  );

  const selectedPatternWidth = Math.max(
    1,
    numberOr(selectedPatternObject?.width, 1),
  );

  const selectedPatternHeight = Math.max(
    1,
    numberOr(selectedPatternObject?.height, 1),
  );

  const selectedPatternRepeat = resolvePatternRepeatMode(selectedPatternObject);

  const selectedPatternScaleX = resolvePatternScaleX(selectedPatternObject);

  const selectedPatternScaleY = resolvePatternScaleY(selectedPatternObject);

  const selectedPatternRotation = Math.round(
    numberOr(
      selectedPatternObject?.patternRotation ??
        selectedPatternObject?.style?.patternRotation,
      0,
    ),
  );

  const selectedPatternOpacity = Math.round(
    clamp(
      selectedPatternObject?.patternOpacity ??
        selectedPatternObject?.opacity ??
        selectedPatternObject?.style?.patternOpacity ??
        selectedPatternObject?.style?.opacity ??
        1,
      0,
      1,
    ) * 100,
  );

  const selectedPatternOffsetX = numberOr(
    selectedPatternObject?.patternOffsetX ??
      selectedPatternObject?.style?.patternOffsetX,
    0,
  );

  const selectedPatternOffsetY = numberOr(
    selectedPatternObject?.patternOffsetY ??
      selectedPatternObject?.style?.patternOffsetY,
    0,
  );

  const selectedPatternCornerRadius = Math.max(
    0,
    numberOr(
      selectedPatternObject?.cornerRadius ??
        selectedPatternObject?.style?.cornerRadius,
      0,
    ),
  );

  const selectedPatternSmoothing =
    (selectedPatternObject?.imageSmoothingEnabled ??
      selectedPatternObject?.style?.imageSmoothingEnabled ??
      true) !== false;

  const selectedPatternBackground = normalisePatternBackground(
    selectedPatternObject?.background ??
      selectedPatternObject?.style?.background,
  );

  const selectedShapeObjects = useMemo(
    () =>
      selectedObjects.filter((object) => object?.type === OBJECT_TYPES.SHAPE),
    [selectedObjects],
  );

  const selectedMaskedShapeIds = useMemo(
    () =>
      selectedShapeObjects
        .filter((object) => hasPatternMask(object))
        .map((object) => object.id),
    [selectedShapeObjects],
  );

  const selectedPatternMaskShape = useMemo(
    () =>
      selectedObjects.length === 1 &&
      selectedObjects[0]?.type === OBJECT_TYPES.SHAPE
        ? selectedObjects[0]
        : null,
    [selectedObjects],
  );

  const selectedPatternMaskLayer = useMemo(
    () =>
      selectedPatternMaskShape
        ? layers.find(
            (layer) => layer.id === selectedPatternMaskShape.layerId,
          ) || null
        : null,
    [layers, selectedPatternMaskShape],
  );

  const selectedPatternMaskLocked = Boolean(
    selectedPatternMaskShape &&
    (selectedPatternMaskShape.locked ||
      selectedPatternMaskShape.visible === false ||
      !selectedPatternMaskLayer ||
      selectedPatternMaskLayer.locked ||
      selectedPatternMaskLayer.visible === false),
  );

  const selectedPatternMaskActive = hasPatternMask(selectedPatternMaskShape);

  const selectedPatternMaskRepeat = resolvePatternRepeatMode(
    selectedPatternMaskShape,
  );

  const selectedPatternMaskScaleX = resolvePatternScaleX(
    selectedPatternMaskShape,
  );

  const selectedPatternMaskScaleY = resolvePatternScaleY(
    selectedPatternMaskShape,
  );

  const selectedPatternMaskRotation = Math.round(
    numberOr(
      selectedPatternMaskShape?.patternRotation ??
        selectedPatternMaskShape?.style?.patternRotation,
      0,
    ),
  );

  const selectedPatternMaskOpacity = Math.round(
    clamp(
      selectedPatternMaskShape?.patternOpacity ??
        selectedPatternMaskShape?.fillOpacity ??
        selectedPatternMaskShape?.style?.patternOpacity ??
        selectedPatternMaskShape?.style?.fillOpacity ??
        1,
      0,
      1,
    ) * 100,
  );

  const selectedPatternMaskOffsetX = numberOr(
    selectedPatternMaskShape?.patternOffsetX ??
      selectedPatternMaskShape?.style?.patternOffsetX,
    0,
  );

  const selectedPatternMaskOffsetY = numberOr(
    selectedPatternMaskShape?.patternOffsetY ??
      selectedPatternMaskShape?.style?.patternOffsetY,
    0,
  );

  const selectedPatternMaskSmoothing =
    (selectedPatternMaskShape?.imageSmoothingEnabled ??
      selectedPatternMaskShape?.style?.imageSmoothingEnabled ??
      true) !== false;

  const selectedPatternMaskBackground = normalisePatternBackground(
    selectedPatternMaskShape?.patternBackground ??
      selectedPatternMaskShape?.style?.patternBackground,
  );

  const displayedLayers = useMemo(() => [...layers].reverse(), [layers]);

  const objectCount = Object.keys(objects).length;

  const canUndo = history.past.length > 0 || Boolean(history.transaction);

  const canRedo = history.future.length > 0;

  const zoomPercentage = Math.round(viewport.zoom * 100);

  const activeToolDefinition = TOOL_DEFINITIONS.find(
    (tool) => tool.id === activeTool,
  );

  const activeBrushPreset = useMemo(
    () => getBrushPreset(brush.presetId || DEFAULT_BRUSH_PRESET_ID),
    [brush.presetId],
  );

  const activeLineStyle = useMemo(
    () => getLineStyle(shape?.dash),
    [shape?.dash],
  );

  const activeShapeType = SHAPE_TYPE_OPTIONS.some(
    (option) => option.id === shape?.shapeType,
  )
    ? shape.shapeType
    : "rectangle";

  const activeSymmetryTool =
    SYMMETRY_TOOL_OPTIONS.find(
      (option) => option.id === activeTool && option.available,
    ) || null;

  const activeSymmetryToolEnabled = activeSymmetryTool
    ? symmetry[activeSymmetryTool.settingKey] !== false
    : false;

  const symmetryModeLabel = getSymmetryModeLabel(symmetry.mode);

  const selectedShowcaseCategory = useMemo(
    () =>
      showcaseCategories.find(
        (category) => category.id === showcaseShareForm.category_id,
      ) || null,
    [showcaseCategories, showcaseShareForm.category_id],
  );

  const selectedShowcaseStyle = useMemo(
    () =>
      showcaseDiscovery.styles.find(
        (style) => style.id === showcaseShareForm.style_term_id,
      ) || null,
    [showcaseDiscovery.styles, showcaseShareForm.style_term_id],
  );

  const selectedShowcaseGarment = useMemo(
    () =>
      showcaseDiscovery.garments.find(
        (garment) => garment.id === showcaseShareForm.garment_term_id,
      ) || null,
    [showcaseDiscovery.garments, showcaseShareForm.garment_term_id],
  );

  const selectedShowcaseOccasions = useMemo(() => {
    const selectedIds = new Set(
      Array.isArray(showcaseShareForm.occasion_term_ids)
        ? showcaseShareForm.occasion_term_ids
        : [],
    );

    return showcaseDiscovery.occasions.filter((occasion) =>
      selectedIds.has(occasion.id),
    );
  }, [showcaseDiscovery.occasions, showcaseShareForm.occasion_term_ids]);

  const selectedShowcaseTermIds = useMemo(() => {
    const ids = [];

    if (selectedShowcaseStyle?.id) {
      ids.push(selectedShowcaseStyle.id);
    }

    if (selectedShowcaseGarment?.id) {
      ids.push(selectedShowcaseGarment.id);
    }

    selectedShowcaseOccasions.forEach((occasion) => {
      if (occasion?.id) {
        ids.push(occasion.id);
      }
    });

    return [...new Set(ids)];
  }, [
    selectedShowcaseStyle,
    selectedShowcaseGarment,
    selectedShowcaseOccasions,
  ]);

  const showcaseMetadataReady = Boolean(
    showcaseCategories.length > 0 &&
    showcaseDiscovery.styles.length > 0 &&
    showcaseDiscovery.garments.length > 0,
  );

  /*=====================================================
    Responsive UI Effects
    =====================================================*/

  useEffect(() => {
    if (isDesktopPanel) {
      setPanelDrawerOpen(false);
      setMobileMenuOpen(false);
    }
  }, [isDesktopPanel]);

  useEffect(() => {
    if (!panelDrawerOpen && !mobileMenuOpen) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      setPanelDrawerOpen(false);

      setMobileMenuOpen(false);
    };

    window.addEventListener("keydown", handleEscape, true);

    return () => {
      window.removeEventListener("keydown", handleEscape, true);
    };
  }, [panelDrawerOpen, mobileMenuOpen]);

  /*=====================================================
    Toast
    =====================================================*/

  const showToast = useCallback((message, type = "success") => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    setToast({
      message,
      type,
    });

    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      projectLoadControllerRef.current?.abort();
      projectSaveControllerRef.current?.abort();
      showcaseMetadataControllerRef.current?.abort();
      showcaseShareControllerRef.current?.abort();
    };
  }, []);

  /*=====================================================
    Unsaved Work Protection
    =====================================================*/

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!persistence.dirty) {
        return;
      }

      event.preventDefault();

      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [persistence.dirty]);

  /*=====================================================
    Document Operations
    =====================================================*/

  const confirmReplaceDocument = useCallback(() => {
    if (!persistence.dirty) {
      return true;
    }

    return window.confirm(
      "This design has unsaved changes. Continue and discard them?",
    );
  }, [persistence.dirty]);

  const fitCanvas = useCallback(() => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    fitDocumentToViewport(stage.width(), stage.height(), 48);
  }, [fitDocumentToViewport]);

  const handleNewDocument = useCallback(() => {
    setMobileMenuOpen(false);

    if (!confirmReplaceDocument()) {
      return;
    }

    projectLoadControllerRef.current?.abort();
    projectSaveControllerRef.current?.abort();
    newDocument();

    setCloudProjectId(null);
    setCloudProjectVersion(null);
    setProjectLoading(false);
    setProjectSaving(false);
    navigate(CREATOR_EDITOR_ROUTE, {
      replace: true,
    });

    window.requestAnimationFrame(fitCanvas);

    showToast("New design created.");
  }, [confirmReplaceDocument, newDocument, navigate, fitCanvas, showToast]);

  const handleOpenProject = useCallback(() => {
    setMobileMenuOpen(false);

    if (!confirmReplaceDocument()) {
      return;
    }

    fileInputRef.current?.click();
  }, [confirmReplaceDocument]);

  const handleProjectFileChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0];

      event.target.value = "";

      if (!file) {
        return;
      }

      try {
        const textContent = await file.text();

        const project = JSON.parse(textContent);

        loadProject(project);

        setCloudProjectId(null);
        setCloudProjectVersion(null);
        navigate(CREATOR_EDITOR_ROUTE, {
          replace: true,
        });

        window.requestAnimationFrame(fitCanvas);

        setEditorError(null);

        showToast("Local project opened. Save to create a cloud project.");
      } catch (error) {
        console.error(error);

        setEditorError(error);

        showToast("The project file could not be opened.", "error");
      }
    },
    [loadProject, navigate, fitCanvas, showToast],
  );

  const handleSaveProject = useCallback(
    async (projectOverride = null, options = {}) => {
      setMobileMenuOpen(false);

      if (saveInFlightRef.current || projectLoading) {
        return null;
      }

      const silent = Boolean(options?.silent);

      const isProjectData =
        projectOverride &&
        typeof projectOverride === "object" &&
        projectOverride.document &&
        projectOverride.layers;

      const project = isProjectData ? projectOverride : getProjectData();

      const title = String(
        project?.document?.name ||
          documentData.name ||
          "Untitled Fashion Design",
      )
        .trim()
        .slice(0, 120);

      if (!title) {
        const error = new Error("A project title is required before saving.");

        setSaveError(error);
        setEditorError(error);

        if (!silent) {
          showToast(error.message, "error");
        }

        return null;
      }

      saveInFlightRef.current = true;

      projectSaveControllerRef.current?.abort();

      const abortController = new AbortController();

      projectSaveControllerRef.current = abortController;

      setProjectSaving(true);
      setSaving?.(true);

      try {
        let response;

        if (cloudProjectId) {
          response = await API.put(
            `${CREATOR_EDITOR_ENDPOINT}/${encodeURIComponent(cloudProjectId)}`,
            {
              title,
              project_data: project,
              ...(cloudProjectVersion
                ? {
                    expected_version: cloudProjectVersion,
                  }
                : {}),
            },
            {
              signal: abortController.signal,
            },
          );
        } else {
          response = await API.post(
            CREATOR_EDITOR_ENDPOINT,
            {
              title,
              project_data: project,
            },
            {
              signal: abortController.signal,
            },
          );
        }

        const savedRecord = extractApiRecord(response);

        const savedProjectId = String(savedRecord?.id || "").trim();

        if (!isPositiveProjectId(savedProjectId)) {
          throw new Error("The server did not return a valid project ID.");
        }

        const savedVersion = Number(savedRecord?.version);

        setCloudProjectId(savedProjectId);

        setCloudProjectVersion(
          Number.isInteger(savedVersion) && savedVersion > 0
            ? savedVersion
            : cloudProjectVersion || 1,
        );

        markSaved();

        setEditorError(null);

        if (
          !cloudProjectId ||
          String(routeProjectId || "") !== savedProjectId
        ) {
          skipNextRouteLoadRef.current = savedProjectId;

          navigate(
            `${CREATOR_EDITOR_ROUTE}/${encodeURIComponent(savedProjectId)}`,
            {
              replace: true,
            },
          );
        }

        if (!silent) {
          showToast(
            cloudProjectId
              ? "Project saved to cloud."
              : "Cloud project created.",
          );
        }

        return savedRecord;
      } catch (error) {
        const message = getApiErrorMessage(
          error,
          "The Fashion Editor project could not be saved.",
        );

        if (!message) {
          return null;
        }

        const normalizedError = new Error(message);

        normalizedError.status = error?.response?.status;

        setSaveError(normalizedError);
        setEditorError(normalizedError);

        if (!silent) {
          showToast(message, "error");
        }

        return null;
      } finally {
        projectSaveControllerRef.current = null;
        saveInFlightRef.current = false;
        setProjectSaving(false);
        setSaving?.(false);
      }
    },
    [
      projectLoading,
      getProjectData,
      documentData.name,
      cloudProjectId,
      cloudProjectVersion,
      routeProjectId,
      setSaving,
      setSaveError,
      markSaved,
      navigate,
      showToast,
    ],
  );

  const handleDownloadProject = useCallback(() => {
    setMobileMenuOpen(false);

    try {
      const project = getProjectData();

      const filename = `${createSafeFilename(
        project.document?.name,
      )}.fashion.json`;

      downloadTextFile(filename, JSON.stringify(project, null, 2));

      showToast("Project file downloaded.");
    } catch (error) {
      console.error(error);

      setEditorError(error);

      showToast("Project file could not be downloaded.", "error");
    }
  }, [getProjectData, showToast]);


  const handleOpenCreatorShowcase = useCallback(() => {
  setMobileMenuOpen(false);

  if (persistence.dirty) {
    const confirmed = window.confirm(
      "This design has unsaved changes. Leave the Fashion Editor and open the Creator Showcase?",
    );

    if (!confirmed) {
      return;
    }
  }

  navigate(CREATOR_SHOWCASE_ROUTE);
}, [persistence.dirty, navigate]);

  /*=====================================================
    Cloud Project Loading
    =====================================================*/

  useEffect(() => {
    const requestedProjectId = String(routeProjectId || "").trim();

    if (!requestedProjectId) {
      setProjectLoading(false);
      return undefined;
    }

    if (!isPositiveProjectId(requestedProjectId)) {
      const error = new Error("The Fashion Editor project ID is invalid.");

      setEditorError(error);
      setProjectLoading(false);
      showToast(error.message, "error");

      return undefined;
    }

    if (skipNextRouteLoadRef.current === requestedProjectId) {
      skipNextRouteLoadRef.current = null;
      setProjectLoading(false);
      return undefined;
    }

    projectLoadControllerRef.current?.abort();

    const abortController = new AbortController();

    projectLoadControllerRef.current = abortController;

    let active = true;

    const loadCloudProject = async () => {
      setProjectLoading(true);
      setEditorError(null);

      try {
        const response = await API.get(
          `${CREATOR_EDITOR_ENDPOINT}/${encodeURIComponent(requestedProjectId)}`,
          {
            signal: abortController.signal,
          },
        );

        if (!active) {
          return;
        }

        const projectRecord = extractApiRecord(response);

        const projectData = parseStoredProjectData(projectRecord?.project_data);

        if (!projectData) {
          throw new Error("The saved project contains invalid editor data.");
        }

        loadProject(projectData);

        setCloudProjectId(String(projectRecord.id));

        const loadedVersion = Number(projectRecord.version);

        setCloudProjectVersion(
          Number.isInteger(loadedVersion) && loadedVersion > 0
            ? loadedVersion
            : 1,
        );

        window.requestAnimationFrame(fitCanvas);

        showToast("Cloud project loaded.");
      } catch (error) {
        if (!active) {
          return;
        }

        const message = getApiErrorMessage(
          error,
          "The Fashion Editor project could not be loaded.",
        );

        if (!message) {
          return;
        }

        const normalizedError = new Error(message);

        setEditorError(normalizedError);
        showToast(message, "error");
      } finally {
        if (active) {
          setProjectLoading(false);
        }
      }
    };

    void loadCloudProject();

    return () => {
      active = false;
      abortController.abort();
    };
  }, [routeProjectId, loadProject, fitCanvas, showToast]);

  /*=====================================================
    AI Fashion Request Cleanup
    =====================================================*/

  useEffect(() => {
    return () => {
      aiFashionControllerRef.current?.abort();
    };
  }, []);

  /*=====================================================
    PNG Export
    =====================================================*/

  const captureStagePngDataUrl = useCallback(
    ({ pixelRatio = 1 } = {}) => {
      const stage = stageRef.current;

      if (!stage) {
        throw new Error("The editor canvas is not ready.");
      }

      const backgroundLayer = stage.findOne(".fashion-editor-background-layer");

      const artworkLayer = stage.findOne(".fashion-editor-artwork-layer");

      const interactionLayer = stage.findOne(
        ".fashion-editor-interaction-layer",
      );

      const transformer = stage.findOne(
        ".fashion-editor-selection-transformer",
      );

      const backgroundGroup = getFirstChild(backgroundLayer);

      const artworkGroup = getFirstChild(artworkLayer);

      const originalStageSize = {
        width: stage.width(),
        height: stage.height(),
      };

      const originalBackgroundTransform = backgroundGroup
        ? {
            x: backgroundGroup.x(),
            y: backgroundGroup.y(),
            scaleX: backgroundGroup.scaleX(),
            scaleY: backgroundGroup.scaleY(),
          }
        : null;

      const originalArtworkTransform = artworkGroup
        ? {
            x: artworkGroup.x(),
            y: artworkGroup.y(),
            scaleX: artworkGroup.scaleX(),
            scaleY: artworkGroup.scaleY(),
          }
        : null;

      const interactionWasVisible = interactionLayer?.visible?.() ?? true;

      const transformerWasVisible = transformer?.visible?.() ?? false;

      try {
        interactionLayer?.visible(false);

        transformer?.visible(false);

        backgroundGroup?.setAttrs({
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
        });

        artworkGroup?.setAttrs({
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
        });

        stage.size({
          width: documentData.width,
          height: documentData.height,
        });

        stage.batchDraw();

        return stage.toDataURL({
          x: 0,
          y: 0,
          width: documentData.width,
          height: documentData.height,
          pixelRatio,
          mimeType: "image/png",
          quality: 1,
        });
      } finally {
        if (originalBackgroundTransform) {
          backgroundGroup?.setAttrs(originalBackgroundTransform);
        }

        if (originalArtworkTransform) {
          artworkGroup?.setAttrs(originalArtworkTransform);
        }

        interactionLayer?.visible(interactionWasVisible);

        transformer?.visible(transformerWasVisible);

        stage.size(originalStageSize);

        stage.batchDraw();
      }
    },
    [documentData.width, documentData.height],
  );

  const handleExportPng = useCallback(() => {
    setMobileMenuOpen(false);

    if (exporting) {
      return;
    }

    setExporting(true);

    try {
      const dataUrl = captureStagePngDataUrl({
        pixelRatio: 1,
      });

      downloadDataUrl(`${createSafeFilename(documentData.name)}.png`, dataUrl);

      showToast("PNG exported.");
    } catch (error) {
      console.error(error);

      setEditorError(error);

      showToast("PNG export failed.", "error");
    } finally {
      setExporting(false);
    }
  }, [exporting, captureStagePngDataUrl, documentData.name, showToast]);

  /*=====================================================
    Share to Creator Showcase

    Fashion Editor owns its own Showcase publishing flow.
    It never routes through CreatorUpload.

    Workflow:

    1. Open the in-editor Share modal.
    2. Load Creator Showcase classification metadata.
    3. Save the private cloud project first.
    4. Capture a rendered preview from the current editor.
    5. POST directly to:
       /creators/editor-projects/:projectId/share
    6. Keep the Creator inside Fashion Editor.
    =====================================================*/

  const loadShowcaseMetadata = useCallback(async () => {
    showcaseMetadataControllerRef.current?.abort();

    const abortController = new AbortController();

    showcaseMetadataControllerRef.current = abortController;

    setShowcaseMetadataLoading(true);
    setShowcaseMetadataError("");

    try {
      const [categoriesResponse, discoveryResponse] = await Promise.all([
        API.get(SHOWCASE_CATEGORIES_ENDPOINT, {
          signal: abortController.signal,
        }),
        API.get(SHOWCASE_DISCOVERY_ENDPOINT, {
          signal: abortController.signal,
        }),
      ]);

      const loadedCategories =
        normalizeShowcaseCategoriesResponse(categoriesResponse);

      const loadedDiscovery =
        normalizeShowcaseDiscoveryResponse(discoveryResponse);

      if (loadedCategories.length === 0) {
        throw new Error(
          "No active creative categories are currently available.",
        );
      }

      if (
        loadedDiscovery.styles.length === 0 ||
        loadedDiscovery.garments.length === 0
      ) {
        throw new Error("Showcase discovery options are incomplete.");
      }

      setShowcaseCategories(loadedCategories);
      setShowcaseDiscovery(loadedDiscovery);

      setShowcaseShareForm((current) => {
        const categoryStillExists = loadedCategories.some(
          (category) => category.id === current.category_id,
        );

        const styleStillExists = loadedDiscovery.styles.some(
          (style) => style.id === current.style_term_id,
        );

        const garmentStillExists = loadedDiscovery.garments.some(
          (garment) => garment.id === current.garment_term_id,
        );

        const validOccasionIds = new Set(
          loadedDiscovery.occasions.map((occasion) => occasion.id),
        );

        return {
          ...current,
          category_id: categoryStillExists ? current.category_id : "",
          style_term_id: styleStillExists ? current.style_term_id : "",
          garment_term_id: garmentStillExists ? current.garment_term_id : "",
          occasion_term_ids: Array.isArray(current.occasion_term_ids)
            ? current.occasion_term_ids.filter((id) => validOccasionIds.has(id))
            : [],
        };
      });
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        "Showcase classification options could not be loaded.",
      );

      if (!message) {
        return;
      }

      setShowcaseCategories([]);
      setShowcaseDiscovery({
        styles: [],
        garments: [],
        occasions: [],
      });
      setShowcaseMetadataError(message);
    } finally {
      if (showcaseMetadataControllerRef.current === abortController) {
        showcaseMetadataControllerRef.current = null;
        setShowcaseMetadataLoading(false);
      }
    }
  }, []);

  const handleShowcaseFormChange = useCallback((field, value) => {
    setShowcaseShareForm((current) => ({
      ...current,
      [field]: value,
    }));

    setShowcaseShareError("");
  }, []);

  const handleToggleShowcaseOccasion = useCallback((occasionId) => {
    const safeId = String(occasionId || "").trim();

    if (!safeId) {
      return;
    }

    setShowcaseShareForm((current) => {
      const currentIds = Array.isArray(current.occasion_term_ids)
        ? current.occasion_term_ids
        : [];

      return {
        ...current,
        occasion_term_ids: currentIds.includes(safeId)
          ? currentIds.filter((id) => id !== safeId)
          : [...currentIds, safeId],
      };
    });

    setShowcaseShareError("");
  }, []);

  const handleAddShowcaseTag = useCallback(() => {
    const tag = normalizeShowcaseTag(showcaseTagInput);

    if (!tag) {
      setShowcaseTagInput("");
      return;
    }

    if (showcaseTags.includes(tag)) {
      setShowcaseTagInput("");
      return;
    }

    if (showcaseTags.length >= SHOWCASE_MAX_TAGS) {
      setShowcaseShareError(
        `You can add up to ${SHOWCASE_MAX_TAGS} Showcase tags.`,
      );
      return;
    }

    setShowcaseTags((current) => uniqueShowcaseTags([...current, tag]));
    setShowcaseTagInput("");
    setShowcaseShareError("");
  }, [showcaseTagInput, showcaseTags]);

  const handleShowcaseTagKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        handleAddShowcaseTag();
        return;
      }

      if (
        event.key === "Backspace" &&
        !showcaseTagInput &&
        showcaseTags.length > 0
      ) {
        setShowcaseTags((current) => current.slice(0, -1));
      }
    },
    [handleAddShowcaseTag, showcaseTagInput, showcaseTags.length],
  );

  const captureShowcasePreviewAsset = useCallback(() => {
    const largestDocumentDimension = Math.max(
      1,
      numberOr(documentData.width, 1),
      numberOr(documentData.height, 1),
    );

    let pixelRatio = clamp(1536 / largestDocumentDimension, 0.1, 1);

    let lastFile = null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const dataUrl = captureStagePngDataUrl({
        pixelRatio,
      });

      const file = createFileFromDataUrl(
        dataUrl,
        `${createSafeFilename(showcaseShareForm.title || documentData.name)}-showcase.png`,
      );

      lastFile = file;

      if (file.size <= SHOWCASE_PREVIEW_MAX_BYTES) {
        return {
          file,
          dataUrl,
        };
      }

      pixelRatio = Math.max(0.06, pixelRatio * 0.72);
    }

    throw new Error(
      lastFile
        ? `The Showcase preview is ${(lastFile.size / 1024 / 1024).toFixed(2)} MB. Reduce the canvas complexity and try again.`
        : "The Showcase preview could not be prepared.",
    );
  }, [
    captureStagePngDataUrl,
    documentData.width,
    documentData.height,
    documentData.name,
    showcaseShareForm.title,
  ]);

  const handleOpenShowcaseShare = useCallback(() => {
    setMobileMenuOpen(false);

    if (
      showcaseSharing ||
      projectLoading ||
      projectSaving ||
      saveInFlightRef.current
    ) {
      return;
    }

    if (objectCount <= 0) {
      showToast(
        "Add something to the canvas before sharing this design.",
        "error",
      );
      return;
    }

    try {
      const largestDocumentDimension = Math.max(
        1,
        numberOr(documentData.width, 1),
        numberOr(documentData.height, 1),
      );

      const previewPixelRatio = clamp(960 / largestDocumentDimension, 0.08, 1);

      const previewDataUrl = captureStagePngDataUrl({
        pixelRatio: previewPixelRatio,
      });

      setShowcasePreviewDataUrl(previewDataUrl);
    } catch (error) {
      console.error(error);
      setShowcasePreviewDataUrl("");
    }

    setShowcaseShareForm({
      ...INITIAL_SHOWCASE_SHARE_FORM,
      title: String(documentData.name || "Untitled Fashion Design")
        .trim()
        .slice(0, SHOWCASE_MAX_TITLE_LENGTH),
      occasion_term_ids: [],
      allow_remix: true,
    });

    setShowcaseTags([]);
    setShowcaseTagInput("");
    setShowcaseShareError("");
    setShowcaseUploadProgress(0);
    setShowcaseShareOpen(true);

    void loadShowcaseMetadata();
  }, [
    showcaseSharing,
    projectLoading,
    projectSaving,
    objectCount,
    documentData.width,
    documentData.height,
    documentData.name,
    captureStagePngDataUrl,
    loadShowcaseMetadata,
    showToast,
  ]);

  const handleCloseShowcaseShare = useCallback(() => {
    if (showcaseSharing) {
      return;
    }

    showcaseMetadataControllerRef.current?.abort();
    showcaseMetadataControllerRef.current = null;

    setShowcaseShareOpen(false);
    setShowcaseShareError("");
    setShowcaseUploadProgress(0);
    setShowcaseMetadataLoading(false);
    setShowcasePreviewDataUrl("");
  }, [showcaseSharing]);

  useEffect(() => {
    if (!showcaseShareOpen) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key !== "Escape" || showcaseSharing) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleCloseShowcaseShare();
    };

    window.addEventListener("keydown", handleEscape, true);

    return () => {
      window.removeEventListener("keydown", handleEscape, true);
    };
  }, [showcaseShareOpen, showcaseSharing, handleCloseShowcaseShare]);

  const handleShareToShowcase = useCallback(
    async (event) => {
      event?.preventDefault?.();

      if (
        showcaseSharing ||
        projectLoading ||
        projectSaving ||
        saveInFlightRef.current
      ) {
        return;
      }

      setShowcaseShareError("");

      if (objectCount <= 0) {
        setShowcaseShareError(
          "Add something to the canvas before sharing this design.",
        );
        return;
      }

      const title = cleanShowcaseText(showcaseShareForm.title);

      if (title.length < 2) {
        setShowcaseShareError("Title must contain at least 2 characters.");
        return;
      }

      if (title.length > SHOWCASE_MAX_TITLE_LENGTH) {
        setShowcaseShareError(
          `Title must not exceed ${SHOWCASE_MAX_TITLE_LENGTH} characters.`,
        );
        return;
      }

      const description = String(showcaseShareForm.description || "").trim();

      if (description.length < 10) {
        setShowcaseShareError(
          "Description must contain at least 10 characters.",
        );
        return;
      }

      if (description.length > SHOWCASE_MAX_DESCRIPTION_LENGTH) {
        setShowcaseShareError(
          `Description must not exceed ${SHOWCASE_MAX_DESCRIPTION_LENGTH} characters.`,
        );
        return;
      }

      if (showcaseMetadataLoading) {
        setShowcaseShareError("Showcase options are still loading.");
        return;
      }

      if (showcaseMetadataError || !showcaseMetadataReady) {
        setShowcaseShareError(
          showcaseMetadataError ||
            "Showcase classification options are currently unavailable.",
        );
        return;
      }

      const categoryId = cleanShowcaseText(showcaseShareForm.category_id);

      if (!categoryId || !selectedShowcaseCategory) {
        setShowcaseShareError("Select a creative category.");
        return;
      }

      if (!selectedShowcaseStyle) {
        setShowcaseShareError("Select a Showcase style.");
        return;
      }

      if (!selectedShowcaseGarment) {
        setShowcaseShareError("Select a garment type.");
        return;
      }

      if (selectedShowcaseTermIds.length < 2) {
        setShowcaseShareError("Select a Showcase style and garment type.");
        return;
      }

      const finalTags = uniqueShowcaseTags([...showcaseTags, showcaseTagInput]);

      setShowcaseSharing(true);
      setShowcaseUploadProgress(0);

      try {
        const savedRecord = await handleSaveProject(null, {
          silent: true,
        });

        const savedProjectId = String(savedRecord?.id || "").trim();

        if (!isPositiveProjectId(savedProjectId)) {
          throw new Error(
            "The Fashion Editor project could not be saved before sharing.",
          );
        }

        const previewAsset = captureShowcasePreviewAsset();

        if (!previewAsset?.file) {
          throw new Error("The Showcase preview could not be prepared.");
        }

        setShowcasePreviewDataUrl(previewAsset.dataUrl);

        const formData = new FormData();

        formData.append("preview", previewAsset.file);
        formData.append("title", title);
        formData.append("description", description);
        formData.append("style_category", selectedShowcaseStyle.name);
        formData.append("format", showcaseShareForm.format || "sketch");
        formData.append("category_id", categoryId);
        formData.append(
          "showcase_term_ids",
          JSON.stringify(selectedShowcaseTermIds),
        );
        formData.append("tags", JSON.stringify(finalTags));
        formData.append(
          "allow_remix",
          showcaseShareForm.allow_remix ? "true" : "false",
        );

        showcaseShareControllerRef.current?.abort();

        const abortController = new AbortController();

        showcaseShareControllerRef.current = abortController;

        await API.post(
          `${CREATOR_EDITOR_ENDPOINT}/${encodeURIComponent(savedProjectId)}/share`,
          formData,
          {
            signal: abortController.signal,
            onUploadProgress: (progressEvent) => {
              const total = Number(progressEvent.total || 0);
              const loaded = Number(progressEvent.loaded || 0);

              if (total <= 0) {
                return;
              }

              setShowcaseUploadProgress(
                Math.min(100, Math.round((loaded / total) * 100)),
              );
            },
          },
        );

        setShowcaseTags(finalTags);
        setShowcaseTagInput("");
        setShowcaseUploadProgress(100);
        setShowcaseShareError("");
        setShowcaseShareOpen(false);
        setEditorError(null);

        showToast("Design shared to the Creator Showcase.");
      } catch (error) {
        const message = getApiErrorMessage(
          error,
          "This Fashion Editor design could not be shared to the Showcase.",
        );

        if (!message) {
          return;
        }

        console.error(error);
        setShowcaseUploadProgress(0);
        setShowcaseShareError(message);
        showToast("Showcase share failed.", "error");
      } finally {
        showcaseShareControllerRef.current = null;
        setShowcaseSharing(false);
      }
    },
    [
      showcaseSharing,
      projectLoading,
      projectSaving,
      objectCount,
      showcaseShareForm,
      showcaseMetadataLoading,
      showcaseMetadataError,
      showcaseMetadataReady,
      selectedShowcaseCategory,
      selectedShowcaseStyle,
      selectedShowcaseGarment,
      selectedShowcaseTermIds,
      showcaseTags,
      showcaseTagInput,
      handleSaveProject,
      captureShowcasePreviewAsset,
      showToast,
    ],
  );

  /*=====================================================
    AI Realistic Fashion Preview
    =====================================================*/

  const handleGenerateAiFashionPreview = useCallback(async () => {
    setMobileMenuOpen(false);

    if (aiFashionGenerating) {
      setAiFashionPreviewOpen(true);
      return;
    }

    if (objectCount <= 0) {
      const message =
        "Add a sketch, drawing, image or clothing template before generating an AI preview.";

      setAiFashionPreviewOpen(true);
      setAiFashionError(message);
      showToast(message, "error");
      return;
    }

    aiFashionControllerRef.current?.abort();

    const abortController = new AbortController();

    aiFashionControllerRef.current = abortController;

    setAiFashionPreviewOpen(true);
    setAiFashionGenerating(true);
    setAiFashionError("");

    try {
      /*
      =====================================================
      AI input selection

      When an editable clothing template is selected, do not
      send the whole editor page. Regenerate the garment's
      own clean SVG from its current colours + region artwork,
      rasterize that board to PNG, and send it as the strict
      AI reference. This keeps front + back together in one
      paid generation while removing unrelated canvas space.

      Freehand sketches, drawings and ordinary images continue
      to use the clean stage capture fallback.
      =====================================================
      */

      let imageDataUrl = "";

      let inputMode = "canvas";

      if (selectedClothingTemplate) {
        const cleanClothingSource = createClothingTemplatePreview(
          selectedClothingTemplate,
          selectedClothingColours,
          selectedClothingArtwork,
        );

        if (cleanClothingSource) {
          imageDataUrl = await rasterizeImageSourceToPngDataUrl(
            cleanClothingSource,
            {
              maxDimension: AI_FASHION_CAPTURE_MAX_DIMENSION,
              background: "#ffffff",
            },
          );

          inputMode = "clean-garment";
        }
      }

      if (!imageDataUrl) {
        const largestDocumentDimension = Math.max(
          numberOr(documentData.width, 1),
          numberOr(documentData.height, 1),
        );

        const capturePixelRatio = clamp(
          AI_FASHION_CAPTURE_MAX_DIMENSION / largestDocumentDimension,
          0.1,
          1,
        );

        imageDataUrl = captureStagePngDataUrl({
          pixelRatio: capturePixelRatio,
        });
      }

      const garmentType =
        selectedClothingTemplate?.label || "fashion garment or accessory";

      const view = selectedClothingDualView ? "front-back" : "front";

      const designNotes = selectedClothingDualView
        ? AI_FASHION_DUAL_VIEW_NOTES
        : selectedClothingTemplate
          ? AI_FASHION_CLOTHING_NOTES
          : AI_FASHION_DEFAULT_NOTES;

      const response = await API.post(
        AI_FASHION_ENDPOINT,
        {
          imageDataUrl,
          garmentType,
          material: "",
          style: AI_FASHION_DEFAULT_STYLE,
          designNotes,
          view,
          background: "studio",
          preserveGraphics: true,
          preserveText: true,
          aspectRatio: "1:1",
          outputFormat: "png",
        },
        {
          signal: abortController.signal,
          timeout: 90000,
        },
      );

      const generatedData = response?.data?.data;

      const generatedImageUrl = String(generatedData?.image?.url || "").trim();

      if (!generatedImageUrl) {
        throw new Error(
          "The AI provider completed the request but did not return an image.",
        );
      }

      setAiFashionResult({
        requestId: generatedData?.requestId || null,
        model: generatedData?.model || null,
        imageUrl: generatedImageUrl,
        width: numberOr(generatedData?.image?.width, null),
        height: numberOr(generatedData?.image?.height, null),
        garmentType: generatedData?.garmentType || garmentType,
        view: generatedData?.view || view,
        inputMode,
      });

      setAiFashionError("");
      setEditorError(null);

      showToast(
        inputMode === "clean-garment"
          ? "AI preview generated from the clean garment design."
          : "AI realistic fashion preview generated.",
      );
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        "The AI fashion preview could not be generated.",
      );

      if (!message) {
        return;
      }

      console.error(error);

      setAiFashionError(message);
      showToast(message, "error");
    } finally {
      if (aiFashionControllerRef.current === abortController) {
        aiFashionControllerRef.current = null;
      }

      setAiFashionGenerating(false);
    }
  }, [
    aiFashionGenerating,
    objectCount,
    documentData.width,
    documentData.height,
    captureStagePngDataUrl,
    selectedClothingTemplate,
    selectedClothingDualView,
    selectedClothingColours,
    selectedClothingArtwork,
    showToast,
  ]);

  const handleOpenAiFashionImage = useCallback(() => {
    const imageUrl = String(aiFashionResult?.imageUrl || "").trim();

    if (!imageUrl) {
      return;
    }

    window.open(imageUrl, "_blank", "noopener,noreferrer");
  }, [aiFashionResult]);

  const handleSaveAiFashionImage = useCallback(async () => {
    const imageUrl = String(aiFashionResult?.imageUrl || "").trim();

    if (!imageUrl || aiFashionSaving) {
      return;
    }

    setAiFashionSaving(true);

    try {
      const response = await fetch(imageUrl, {
        method: "GET",
        mode: "cors",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          `The generated image could not be downloaded (${response.status}).`,
        );
      }

      const blob = await response.blob();

      const mimeType = String(blob.type || "").toLowerCase();

      const extension = mimeType.includes("jpeg")
        ? "jpg"
        : mimeType.includes("webp")
          ? "webp"
          : "png";

      const objectUrl = URL.createObjectURL(blob);

      const anchor = globalThis.document.createElement("a");

      anchor.href = objectUrl;

      anchor.download = `${createSafeFilename(
        documentData.name,
      )}-ai-realistic-preview.${extension}`;

      globalThis.document.body.appendChild(anchor);

      anchor.click();
      anchor.remove();

      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 1000);

      showToast("AI image saved to your device.");
    } catch (error) {
      console.error(error);

      showToast(
        "Direct download was blocked. Opening the full image so you can save it.",
        "error",
      );

      window.open(imageUrl, "_blank", "noopener,noreferrer");
    } finally {
      setAiFashionSaving(false);
    }
  }, [aiFashionResult, aiFashionSaving, documentData.name, showToast]);

  const handleOpenOrGenerateAiFashionPreview = useCallback(() => {
    setMobileMenuOpen(false);
    setAiFashionPreviewOpen(true);

    if (aiFashionGenerating || aiFashionResult?.imageUrl) {
      return;
    }

    void handleGenerateAiFashionPreview();
  }, [aiFashionGenerating, aiFashionResult, handleGenerateAiFashionPreview]);

  /*=====================================================
    Layer Helpers
    =====================================================*/

  const handleMoveLayerUp = useCallback(
    (layerId) => {
      const index = layers.findIndex((layer) => layer.id === layerId);

      if (index < 0 || index >= layers.length - 1) {
        return;
      }

      moveLayer(layerId, index + 1);
    },
    [layers, moveLayer],
  );

  const handleMoveLayerDown = useCallback(
    (layerId) => {
      const index = layers.findIndex((layer) => layer.id === layerId);

      if (index <= 0) {
        return;
      }

      moveLayer(layerId, index - 1);
    },
    [layers, moveLayer],
  );

  const handleDeleteActiveLayer = useCallback(() => {
    if (!activeLayer || layers.length <= 1) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${activeLayer.name}" and all objects inside it?`,
    );

    if (!confirmed) {
      return;
    }

    deleteLayer(activeLayer.id);
  }, [activeLayer, layers.length, deleteLayer]);

  const handleBrushPresetChange = useCallback(
    (presetId) => {
      const nextSettings = createBrushSettingsFromPreset(presetId, {
        ...brush,

        color: colours.primary,
      });

      setBrushSettings(nextSettings);
    },
    [brush, colours.primary, setBrushSettings],
  );

  const handleFillColourChange = useCallback(
    (colour) => {
      if (typeof colour !== "string" || !colour) {
        return;
      }

      setShapeSettings({
        fill: colour,

        fillType: "solid",
      });

      setPrimaryColor(colour);
    },
    [setShapeSettings, setPrimaryColor],
  );

  const updateTextSettings = useCallback(
    (updates) => {
      const safeUpdates = updates && typeof updates === "object" ? updates : {};

      if (typeof setTextSettingsAction === "function") {
        setTextSettingsAction(safeUpdates);

        return;
      }

      /*
                Compatibility fallback for stores created before
                setTextSettings was added. TextTool reads state.text,
                so this keeps the UI functional immediately.
                */

      useFashionEditorStore.setState((state) => ({
        text: {
          ...DEFAULT_TEXT_SETTINGS,
          ...(state.text || {}),
          ...safeUpdates,
        },
      }));
    },
    [setTextSettingsAction],
  );

  const handleTextContentChange = useCallback(
    (value) => {
      const content = typeof value === "string" ? value : "";

      updateTextSettings({
        content,
        text: content,
        value: content,
      });
    },
    [updateTextSettings],
  );

  const handleTextColourChange = useCallback(
    (colour) => {
      if (typeof colour !== "string" || !colour) {
        return;
      }

      updateTextSettings({
        fill: colour,
        color: colour,
      });

      setPrimaryColor(colour);
    },
    [updateTextSettings, setPrimaryColor],
  );

  const updateImageSettings = useCallback(
    (updates) => {
      const safeUpdates = updates && typeof updates === "object" ? updates : {};

      if (typeof setImageSettingsAction === "function") {
        setImageSettingsAction(safeUpdates);

        return;
      }

      useFashionEditorStore.setState((state) => ({
        image: {
          ...DEFAULT_IMAGE_SETTINGS,
          ...(state.image || {}),
          ...safeUpdates,
        },
      }));
    },
    [setImageSettingsAction],
  );

  const handleChooseImage = useCallback((mode = "place", objectId = null) => {
    imageInputModeRef.current = {
      mode,
      objectId,
    };

    imageFileInputRef.current?.click();
  }, []);

  const updateSelectedImage = useCallback(
    (updates, label = "Update image") => {
      if (!selectedImageObject?.id || typeof updateObject !== "function") {
        return false;
      }

      const state = useFashionEditorStore.getState();

      const currentObject = state.objects[selectedImageObject.id];

      const currentLayer = state.layers.find(
        (layer) => layer.id === currentObject?.layerId,
      );

      if (
        !currentObject ||
        currentObject.type !== OBJECT_TYPES.IMAGE ||
        currentObject.locked ||
        currentObject.visible === false ||
        !currentLayer ||
        currentLayer.locked ||
        currentLayer.visible === false
      ) {
        return false;
      }

      const requestedUpdates =
        updates && typeof updates === "object" ? updates : {};

      const nextX = numberOr(requestedUpdates.x ?? currentObject.x, 0);

      const nextY = numberOr(requestedUpdates.y ?? currentObject.y, 0);

      const nextWidth = Math.max(
        1,
        numberOr(requestedUpdates.width ?? currentObject.width, 1),
      );

      const nextHeight = Math.max(
        1,
        numberOr(requestedUpdates.height ?? currentObject.height, 1),
      );

      const nextStyle = requestedUpdates.style
        ? {
            ...(currentObject.style || {}),
            ...requestedUpdates.style,
          }
        : currentObject.style;

      const nextGeometry = {
        ...(currentObject.geometry || {}),

        x: nextX,

        y: nextY,

        width: nextWidth,

        height: nextHeight,

        left: nextX,

        top: nextY,

        right: nextX + nextWidth,

        bottom: nextY + nextHeight,

        center: {
          x: nextX + nextWidth / 2,

          y: nextY + nextHeight / 2,
        },

        aspectRatio: nextWidth / Math.max(1, nextHeight),

        boundingBox: {
          ...(currentObject.geometry?.boundingBox || {}),

          x: nextX,

          y: nextY,

          width: nextWidth,

          height: nextHeight,

          minX: nextX,

          minY: nextY,

          maxX: nextX + nextWidth,

          maxY: nextY + nextHeight,
        },
      };

      updateObject(
        currentObject.id,
        {
          ...requestedUpdates,

          ...(nextStyle
            ? {
                style: nextStyle,
              }
            : {}),

          geometry: nextGeometry,

          updatedAt: new Date().toISOString(),
        },
        label,
      );

      return true;
    },
    [selectedImageObject?.id, updateObject],
  );

  const handleSelectedImageFitChange = useCallback(
    (fit) => {
      const safeFit = ["contain", "cover", "fill"].includes(fit)
        ? fit
        : "contain";

      const preserveAspectRatio = safeFit !== "fill";

      updateSelectedImage(
        {
          fit: safeFit,

          imageFit: safeFit,

          objectFit: safeFit,

          preserveAspectRatio,

          style: {
            fit: safeFit,

            imageFit: safeFit,

            objectFit: safeFit,

            preserveAspectRatio,
          },
        },
        "Change image fit",
      );
    },
    [updateSelectedImage],
  );

  const handleSelectedImageDimensionChange = useCallback(
    (dimension, requestedValue) => {
      if (!selectedImageObject) {
        return;
      }

      const value = clamp(requestedValue, 1, 100000);

      const currentWidth = Math.max(1, numberOr(selectedImageObject.width, 1));

      const currentHeight = Math.max(
        1,
        numberOr(selectedImageObject.height, 1),
      );

      const naturalWidth = Math.max(
        1,
        numberOr(
          selectedImageObject.naturalWidth ||
            selectedImageObject.metadata?.originalWidth,
          currentWidth,
        ),
      );

      const naturalHeight = Math.max(
        1,
        numberOr(
          selectedImageObject.naturalHeight ||
            selectedImageObject.metadata?.originalHeight,
          currentHeight,
        ),
      );

      const ratio = naturalWidth / naturalHeight;

      const preserve =
        selectedImageFit !== "fill" &&
        selectedImageObject.preserveAspectRatio !== false;

      const updates =
        dimension === "width"
          ? {
              width: value,

              ...(preserve
                ? {
                    height: value / ratio,
                  }
                : {}),
            }
          : {
              height: value,

              ...(preserve
                ? {
                    width: value * ratio,
                  }
                : {}),
            };

      updateSelectedImage(updates, "Resize image");
    },
    [selectedImageObject, selectedImageFit, updateSelectedImage],
  );

  const handleResetSelectedImageSize = useCallback(() => {
    if (!selectedImageObject) {
      return;
    }

    const naturalWidth = Math.max(
      1,
      numberOr(
        selectedImageObject.naturalWidth ||
          selectedImageObject.metadata?.originalWidth,
        selectedImageWidth,
      ),
    );

    const naturalHeight = Math.max(
      1,
      numberOr(
        selectedImageObject.naturalHeight ||
          selectedImageObject.metadata?.originalHeight,
        selectedImageHeight,
      ),
    );

    updateSelectedImage(
      {
        width: naturalWidth,

        height: naturalHeight,
      },
      "Reset image size",
    );
  }, [
    selectedImageObject,
    selectedImageWidth,
    selectedImageHeight,
    updateSelectedImage,
  ]);

  const handleFitSelectedImageToDocument = useCallback(() => {
    if (!selectedImageObject) {
      return;
    }

    const naturalWidth = Math.max(
      1,
      numberOr(
        selectedImageObject.naturalWidth ||
          selectedImageObject.metadata?.originalWidth,
        selectedImageWidth,
      ),
    );

    const naturalHeight = Math.max(
      1,
      numberOr(
        selectedImageObject.naturalHeight ||
          selectedImageObject.metadata?.originalHeight,
        selectedImageHeight,
      ),
    );

    const maximumWidth = Math.max(1, numberOr(documentData.width, 1200) * 0.8);

    const maximumHeight = Math.max(
      1,
      numberOr(documentData.height, 1600) * 0.8,
    );

    const scale = Math.min(
      maximumWidth / naturalWidth,

      maximumHeight / naturalHeight,
    );

    const width = naturalWidth * scale;

    const height = naturalHeight * scale;

    updateSelectedImage(
      {
        x: (documentData.width - width) / 2,

        y: (documentData.height - height) / 2,

        width,

        height,

        fit: "contain",

        imageFit: "contain",

        objectFit: "contain",

        preserveAspectRatio: true,

        style: {
          fit: "contain",

          imageFit: "contain",

          objectFit: "contain",

          preserveAspectRatio: true,
        },
      },
      "Fit image to document",
    );
  }, [
    selectedImageObject,
    selectedImageWidth,
    selectedImageHeight,
    documentData.width,
    documentData.height,
    updateSelectedImage,
  ]);

  const handleImageFileChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0] || null;

      event.target.value = "";

      if (!file) {
        return;
      }

      const inputMode = {
        ...imageInputModeRef.current,
      };

      imageInputModeRef.current = {
        mode: "place",

        objectId: null,
      };

      setImageImporting(true);

      try {
        const asset = await loadImageAsset(file);

        if (inputMode.mode === "replace" && inputMode.objectId) {
          const state = useFashionEditorStore.getState();

          const currentObject = state.objects[inputMode.objectId];

          const currentLayer = state.layers.find(
            (layer) => layer.id === currentObject?.layerId,
          );

          if (
            !currentObject ||
            currentObject.type !== OBJECT_TYPES.IMAGE ||
            currentObject.locked ||
            !currentLayer ||
            currentLayer.locked
          ) {
            throw new Error("The selected image cannot be replaced.");
          }

          updateObject(
            currentObject.id,
            {
              src: asset.dataUrl,

              source: asset.dataUrl,

              dataUrl: asset.dataUrl,

              imageSource: asset.dataUrl,

              assetId: asset.id,

              fileName: asset.fileName,

              mimeType: asset.mimeType,

              fileSize: asset.fileSize,

              naturalWidth: asset.naturalWidth,

              naturalHeight: asset.naturalHeight,

              aspectRatio: asset.aspectRatio,

              metadata: {
                ...(currentObject.metadata || {}),

                originalFileName: asset.fileName,

                originalMimeType: asset.mimeType,

                originalWidth: asset.naturalWidth,

                originalHeight: asset.naturalHeight,

                importedAt: asset.importedAt,

                replacedAt: new Date().toISOString(),
              },

              updatedAt: new Date().toISOString(),
            },
            "Replace image",
          );

          showToast("Image replaced.");

          return;
        }

        await ImageTool.queueAsset(asset);

        setActiveTool(EDITOR_TOOLS.IMAGE);

        setUiState({
          rightPanelTab: "properties",
        });

        showToast("Image ready. Click the canvas to place it.");
      } catch (error) {
        console.error(error);

        setEditorError(error);

        showToast(
          error?.message || "The image could not be imported.",
          "error",
        );
      } finally {
        setImageImporting(false);
      }
    },
    [updateObject, setActiveTool, setUiState, showToast],
  );

  const handleChooseClothingTemplate = useCallback(
    async (template) => {
      if (
        clothingImporting ||
        !template ||
        !activeLayer ||
        activeLayer.locked ||
        activeLayer.visible === false
      ) {
        return;
      }

      setClothingImporting(true);

      try {
        const file = createClothingTemplateFile(template);

        const asset = await loadImageAsset(file);

        await ClothingTool.queueAsset(asset);

        setActiveTool(EDITOR_TOOLS.CLOTHING);

        setUiState({
          rightPanelTab: "properties",
        });

        showToast(
          `${template.label} front + back ready. Click the canvas to place it.`,
        );
      } catch (error) {
        console.error(error);

        setEditorError(error);

        showToast(
          error?.message || "The clothing template could not be loaded.",
          "error",
        );
      } finally {
        setClothingImporting(false);
      }
    },
    [clothingImporting, activeLayer, setActiveTool, setUiState, showToast],
  );

  /*
  =========================================================
  Selected Clothing Colour Editing
  =========================================================
  */

  const applySelectedClothingColours = useCallback(
    (requestedColours, label = "Change clothing colours") => {
      if (
        !selectedImageObject ||
        selectedImageLocked ||
        !selectedClothingTemplate ||
        !selectedClothingEditable
      ) {
        return false;
      }

      const defaults = getClothingTemplateDefaultColours(
        selectedClothingTemplate,
      );

      const requested =
        requestedColours &&
        typeof requestedColours === "object" &&
        !Array.isArray(requestedColours)
          ? requestedColours
          : {};

      /*
      Persist only colour keys defined by the current template.
      This also cleans legacy single-view keys when an older
      project is edited with the dual-view templates.
      */

      const nextColours = selectedClothingColourRegions.reduce(
        (result, region) => {
          const regionId = region.id;

          result[regionId] =
            requested[regionId] ||
            selectedClothingColours[regionId] ||
            defaults[regionId] ||
            "#ffffff";

          return result;
        },
        {},
      );

      const nextDataUrl = createClothingTemplatePreview(
        selectedClothingTemplate,
        nextColours,
        selectedClothingArtwork,
      );

      if (!nextDataUrl) {
        showToast("The clothing colours could not be updated.", "error");

        return false;
      }

      const clothingMetadata =
        createClothingTemplateMetadata(
          selectedClothingTemplate,
          nextColours,
          selectedClothingArtwork,
        ) || {};

      updateSelectedImage(
        {
          src: nextDataUrl,

          source: nextDataUrl,

          dataUrl: nextDataUrl,

          imageSource: nextDataUrl,

          fileName: selectedClothingTemplate.fileName,

          mimeType: "image/svg+xml",

          metadata: {
            ...(selectedImageObject.metadata || {}),

            ...clothingMetadata,

            clothingColours: nextColours,

            clothingDualView: selectedClothingTemplate.dualView === true,

            clothingViews: selectedClothingViews,

            clothingUpdatedAt: new Date().toISOString(),
          },
        },
        label,
      );

      return true;
    },
    [
      selectedImageObject,
      selectedImageLocked,
      selectedClothingTemplate,
      selectedClothingEditable,
      selectedClothingColourRegions,
      selectedClothingColours,
      selectedClothingViews,
      selectedClothingArtwork,
      updateSelectedImage,
      showToast,
    ],
  );

  const handleSelectedClothingColourChange = useCallback(
    (regionId, colour) => {
      if (
        !selectedClothingEditable ||
        typeof regionId !== "string" ||
        !/^#[0-9a-f]{6}$/i.test(String(colour || ""))
      ) {
        return;
      }

      const region = selectedClothingColourRegions.find(
        (item) => item.id === regionId,
      );

      if (!region) {
        return;
      }

      const safeColour = String(colour).toLowerCase();

      const changed = applySelectedClothingColours(
        {
          [regionId]: safeColour,
        },
        `Change ${region.label} colour`,
      );

      if (changed) {
        setPrimaryColor(safeColour);
      }
    },
    [
      selectedClothingEditable,
      selectedClothingColourRegions,
      applySelectedClothingColours,
      setPrimaryColor,
    ],
  );

  const handleMatchSelectedClothingGroup = useCallback(
    (groupId) => {
      if (!selectedClothingEditable) {
        return;
      }

      const normalizedGroupId = String(groupId || "")
        .trim()
        .toLowerCase();

      const groupRegions = selectedClothingColourRegions.filter(
        (region) =>
          String(region?.group || "")
            .trim()
            .toLowerCase() === normalizedGroupId,
      );

      if (groupRegions.length < 2) {
        return;
      }

      const sourceRegion =
        groupRegions.find(
          (region) => getClothingRegionView(region) === "front",
        ) || groupRegions[0];

      const sourceColour =
        selectedClothingColours[sourceRegion.id] || "#ffffff";

      const updates = groupRegions.reduce((result, region) => {
        result[region.id] = sourceColour;

        return result;
      }, {});

      applySelectedClothingColours(
        updates,
        `Match ${getClothingGroupLabel(normalizedGroupId)} colours`,
      );
    },
    [
      selectedClothingEditable,
      selectedClothingColourRegions,
      selectedClothingColours,
      applySelectedClothingColours,
    ],
  );

  const handleCopySelectedClothingView = useCallback(
    (sourceView, targetView) => {
      if (!selectedClothingEditable || sourceView === targetView) {
        return;
      }

      const normalizedSource = String(sourceView || "")
        .trim()
        .toLowerCase();

      const normalizedTarget = String(targetView || "")
        .trim()
        .toLowerCase();

      if (
        !["front", "back"].includes(normalizedSource) ||
        !["front", "back"].includes(normalizedTarget)
      ) {
        return;
      }

      const regionIds = new Set(
        selectedClothingColourRegions.map((region) => region.id),
      );

      const updates = {};

      selectedClothingColourRegions.forEach((region) => {
        if (getClothingRegionView(region) !== normalizedSource) {
          return;
        }

        const pairedId = getPairedClothingRegionId(region.id, normalizedTarget);

        if (!pairedId || !regionIds.has(pairedId)) {
          return;
        }

        updates[pairedId] = selectedClothingColours[region.id] || "#ffffff";
      });

      if (Object.keys(updates).length === 0) {
        showToast(
          `No matching ${normalizedTarget} regions are available for this garment.`,
          "error",
        );

        return;
      }

      applySelectedClothingColours(
        updates,
        `Copy ${CLOTHING_VIEW_LABELS[normalizedSource]} colours to ${CLOTHING_VIEW_LABELS[normalizedTarget]}`,
      );
    },
    [
      selectedClothingEditable,
      selectedClothingColourRegions,
      selectedClothingColours,
      applySelectedClothingColours,
      showToast,
    ],
  );

  const handleApplyPrimaryToSelectedClothingView = useCallback(
    (view) => {
      if (!selectedClothingEditable) {
        return;
      }

      const normalizedView = String(view || "")
        .trim()
        .toLowerCase();

      if (!["front", "back"].includes(normalizedView)) {
        return;
      }

      const viewRegions = selectedClothingColourRegions.filter(
        (region) => getClothingRegionView(region) === normalizedView,
      );

      if (viewRegions.length === 0) {
        return;
      }

      const primaryColour = /^#[0-9a-f]{6}$/i.test(
        String(colours.primary || ""),
      )
        ? String(colours.primary).toLowerCase()
        : "#111111";

      const updates = viewRegions.reduce((result, region) => {
        result[region.id] = primaryColour;

        return result;
      }, {});

      applySelectedClothingColours(
        updates,
        `Apply primary colour to ${CLOTHING_VIEW_LABELS[normalizedView]}`,
      );
    },
    [
      selectedClothingEditable,
      selectedClothingColourRegions,
      colours.primary,
      applySelectedClothingColours,
    ],
  );

  const handleResetSelectedClothingColours = useCallback(() => {
    if (!selectedClothingEditable || !selectedClothingTemplate) {
      return;
    }

    applySelectedClothingColours(
      getClothingTemplateDefaultColours(selectedClothingTemplate),
      "Reset clothing colours",
    );
  }, [
    selectedClothingEditable,
    selectedClothingTemplate,
    applySelectedClothingColours,
  ]);

  /*
  =========================================================
  Selected Clothing Region Artwork
  =========================================================

  Clothing artwork remains inside the garment IMAGE object.
  The SVG template clips graphics and patterns to the chosen
  construction region, so existing canvas transforms, cloud
  persistence and PNG export continue to work normally.
  =========================================================
  */

  const applySelectedClothingArtwork = useCallback(
    (requestedArtwork, label = "Update garment artwork") => {
      if (
        !selectedImageObject ||
        selectedImageLocked ||
        !selectedClothingTemplate ||
        !selectedClothingArtworkEditable
      ) {
        return false;
      }

      const nextArtwork = normaliseClothingTemplateArtwork(
        selectedClothingTemplate,
        requestedArtwork,
      );

      const nextDataUrl = createClothingTemplatePreview(
        selectedClothingTemplate,
        selectedClothingColours,
        nextArtwork,
      );

      if (!nextDataUrl) {
        showToast("The garment artwork could not be updated.", "error");

        return false;
      }

      const clothingMetadata =
        createClothingTemplateMetadata(
          selectedClothingTemplate,
          selectedClothingColours,
          nextArtwork,
        ) || {};

      updateSelectedImage(
        {
          src: nextDataUrl,

          source: nextDataUrl,

          dataUrl: nextDataUrl,

          imageSource: nextDataUrl,

          fileName: selectedClothingTemplate.fileName,

          mimeType: "image/svg+xml",

          metadata: {
            ...(selectedImageObject.metadata || {}),

            ...clothingMetadata,

            clothingColours: selectedClothingColours,

            clothingArtwork: nextArtwork,

            clothingDualView: selectedClothingTemplate.dualView === true,

            clothingViews: selectedClothingViews,

            clothingUpdatedAt: new Date().toISOString(),
          },
        },
        label,
      );

      return true;
    },
    [
      selectedImageObject,
      selectedImageLocked,
      selectedClothingTemplate,
      selectedClothingArtworkEditable,
      selectedClothingColours,
      selectedClothingViews,
      updateSelectedImage,
      showToast,
    ],
  );

  const handleChooseClothingArtwork = useCallback(
    (type) => {
      if (
        !selectedClothingArtworkEditable ||
        !selectedClothingArtworkRegionId ||
        selectedImageLocked ||
        clothingArtworkImporting
      ) {
        return;
      }

      const safeType =
        type === CLOTHING_ARTWORK_TYPES.PATTERN
          ? CLOTHING_ARTWORK_TYPES.PATTERN
          : CLOTHING_ARTWORK_TYPES.IMAGE;

      clothingArtworkInputModeRef.current = {
        regionId: selectedClothingArtworkRegionId,

        type: safeType,
      };

      clothingArtworkFileInputRef.current?.click();
    },
    [
      selectedClothingArtworkEditable,
      selectedClothingArtworkRegionId,
      selectedImageLocked,
      clothingArtworkImporting,
    ],
  );

  const handleClothingArtworkFileChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0] || null;

      event.target.value = "";

      if (!file) {
        return;
      }

      const inputMode = {
        ...clothingArtworkInputModeRef.current,
      };

      clothingArtworkInputModeRef.current = {
        regionId: null,

        type: CLOTHING_ARTWORK_TYPES.IMAGE,
      };

      if (
        !selectedClothingTemplate ||
        !selectedClothingArtworkEditable ||
        !inputMode.regionId ||
        !selectedClothingArtworkRegions.some(
          (region) => region.id === inputMode.regionId,
        )
      ) {
        showToast("Choose a valid garment region first.", "error");

        return;
      }

      setClothingArtworkImporting(true);

      try {
        /*
        Reuse the editor's existing image loader so SVG uploads are
        sanitized and all artwork becomes a portable data URL.
        */

        const asset = await loadImageAsset(file);

        const previousEntry =
          selectedClothingArtwork[inputMode.regionId] || null;

        const safeType =
          inputMode.type === CLOTHING_ARTWORK_TYPES.PATTERN
            ? CLOTHING_ARTWORK_TYPES.PATTERN
            : CLOTHING_ARTWORK_TYPES.IMAGE;

        const nextEntry = {
          ...CLOTHING_ARTWORK_DEFAULTS,

          ...(previousEntry || {}),

          type: safeType,

          source: asset.dataUrl,

          fit:
            previousEntry?.type === safeType && previousEntry?.fit
              ? previousEntry.fit
              : safeType === CLOTHING_ARTWORK_TYPES.PATTERN
                ? "cover"
                : "contain",
        };

        const nextArtwork = {
          ...selectedClothingArtwork,

          [inputMode.regionId]: nextEntry,
        };

        const region =
          selectedClothingArtworkRegions.find(
            (item) => item.id === inputMode.regionId,
          ) || null;

        const changed = applySelectedClothingArtwork(
          nextArtwork,
          `Add ${safeType === CLOTHING_ARTWORK_TYPES.PATTERN ? "pattern" : "graphic"} to ${region?.label || "garment region"}`,
        );

        if (changed) {
          setClothingArtworkRegionId(inputMode.regionId);

          showToast(
            `${safeType === CLOTHING_ARTWORK_TYPES.PATTERN ? "Pattern" : "Graphic"} added to ${region?.label || "garment region"}.`,
          );
        }
      } catch (error) {
        console.error(error);

        setEditorError(error);

        showToast(
          error?.message || "The garment artwork could not be imported.",
          "error",
        );
      } finally {
        setClothingArtworkImporting(false);
      }
    },
    [
      selectedClothingTemplate,
      selectedClothingArtworkEditable,
      selectedClothingArtworkRegions,
      selectedClothingArtwork,
      applySelectedClothingArtwork,
      showToast,
    ],
  );

  const handleSelectedClothingArtworkSettingChange = useCallback(
    (key, value) => {
      if (
        !selectedClothingArtworkEntry ||
        !selectedClothingArtworkRegionId ||
        selectedImageLocked
      ) {
        return;
      }

      const updates = {};

      if (key === "scale") {
        updates.scale = clamp(value, 0.05, 12);
      } else if (key === "rotation") {
        updates.rotation = clamp(value, -3600, 3600);
      } else if (key === "offsetX") {
        updates.offsetX = clamp(value, -2000, 2000);
      } else if (key === "offsetY") {
        updates.offsetY = clamp(value, -2000, 2000);
      } else if (key === "opacity") {
        updates.opacity = clamp(value, 0, 1);
      } else if (key === "fit") {
        updates.fit = ["contain", "cover", "fill"].includes(value)
          ? value
          : "contain";
      } else if (key === "type") {
        updates.type =
          value === CLOTHING_ARTWORK_TYPES.PATTERN
            ? CLOTHING_ARTWORK_TYPES.PATTERN
            : CLOTHING_ARTWORK_TYPES.IMAGE;
      } else {
        return;
      }

      const nextArtwork = {
        ...selectedClothingArtwork,

        [selectedClothingArtworkRegionId]: {
          ...selectedClothingArtworkEntry,
          ...updates,
        },
      };

      applySelectedClothingArtwork(
        nextArtwork,
        `Adjust ${selectedClothingArtworkRegion?.label || "garment"} artwork`,
      );
    },
    [
      selectedClothingArtworkEntry,
      selectedClothingArtworkRegionId,
      selectedClothingArtworkRegion,
      selectedClothingArtwork,
      selectedImageLocked,
      applySelectedClothingArtwork,
    ],
  );

  const handleResetSelectedClothingArtworkTransform = useCallback(() => {
    if (
      !selectedClothingArtworkEntry ||
      !selectedClothingArtworkRegionId ||
      selectedImageLocked
    ) {
      return;
    }

    const nextArtwork = {
      ...selectedClothingArtwork,

      [selectedClothingArtworkRegionId]: {
        ...selectedClothingArtworkEntry,

        scale: 1,

        rotation: 0,

        offsetX: 0,

        offsetY: 0,

        opacity: 1,

        fit:
          selectedClothingArtworkEntry.type === CLOTHING_ARTWORK_TYPES.PATTERN
            ? "cover"
            : "contain",
      },
    };

    applySelectedClothingArtwork(
      nextArtwork,
      `Reset ${selectedClothingArtworkRegion?.label || "garment"} artwork`,
    );
  }, [
    selectedClothingArtworkEntry,
    selectedClothingArtworkRegionId,
    selectedClothingArtworkRegion,
    selectedClothingArtwork,
    selectedImageLocked,
    applySelectedClothingArtwork,
  ]);

  const handleRemoveSelectedClothingArtwork = useCallback(() => {
    if (
      !selectedClothingArtworkEntry ||
      !selectedClothingArtworkRegionId ||
      selectedImageLocked
    ) {
      return;
    }

    const nextArtwork = {
      ...selectedClothingArtwork,
    };

    delete nextArtwork[selectedClothingArtworkRegionId];

    const changed = applySelectedClothingArtwork(
      nextArtwork,
      `Remove ${selectedClothingArtworkRegion?.label || "garment"} artwork`,
    );

    if (changed) {
      showToast("Artwork removed from garment region.");
    }
  }, [
    selectedClothingArtworkEntry,
    selectedClothingArtworkRegionId,
    selectedClothingArtworkRegion,
    selectedClothingArtwork,
    selectedImageLocked,
    applySelectedClothingArtwork,
    showToast,
  ]);

  const handleCopySelectedClothingArtworkToPairedRegion = useCallback(() => {
    if (
      !selectedClothingArtworkEntry ||
      !selectedClothingArtworkPairedRegionId ||
      selectedImageLocked
    ) {
      return;
    }

    const pairedRegion =
      selectedClothingArtworkRegions.find(
        (region) => region.id === selectedClothingArtworkPairedRegionId,
      ) || null;

    const nextArtwork = {
      ...selectedClothingArtwork,

      [selectedClothingArtworkPairedRegionId]: {
        ...selectedClothingArtworkEntry,
      },
    };

    const changed = applySelectedClothingArtwork(
      nextArtwork,
      `Copy artwork to ${pairedRegion?.label || "paired garment region"}`,
    );

    if (changed) {
      showToast(`Artwork copied to ${pairedRegion?.label || "paired region"}.`);
    }
  }, [
    selectedClothingArtworkEntry,
    selectedClothingArtworkPairedRegionId,
    selectedClothingArtworkRegions,
    selectedClothingArtwork,
    selectedImageLocked,
    applySelectedClothingArtwork,
    showToast,
  ]);

  const updatePatternSettings = useCallback(
    (updates) => {
      const safeUpdates = updates && typeof updates === "object" ? updates : {};

      if (typeof setPatternSettingsAction === "function") {
        setPatternSettingsAction(safeUpdates);

        return;
      }

      useFashionEditorStore.setState((state) => ({
        pattern: {
          ...DEFAULT_PATTERN_SETTINGS,
          ...(state.pattern || {}),
          ...safeUpdates,
        },
      }));
    },
    [setPatternSettingsAction],
  );

  const handleChoosePattern = useCallback(
    (mode = "place", objectId = null, objectIds = []) => {
      patternInputModeRef.current = {
        mode,
        objectId,

        objectIds: Array.isArray(objectIds) ? [...objectIds] : [],
      };

      patternFileInputRef.current?.click();
    },
    [],
  );

  const updateSelectedPattern = useCallback(
    (updates, label = "Update pattern") => {
      if (!selectedPatternObject?.id || typeof updateObject !== "function") {
        return false;
      }

      const state = useFashionEditorStore.getState();

      const currentObject = state.objects[selectedPatternObject.id];

      const currentLayer = state.layers.find(
        (layer) => layer.id === currentObject?.layerId,
      );

      if (
        !currentObject ||
        currentObject.type !== OBJECT_TYPES.PATTERN ||
        currentObject.locked ||
        currentObject.visible === false ||
        !currentLayer ||
        currentLayer.locked ||
        currentLayer.visible === false
      ) {
        return false;
      }

      const requestedUpdates =
        updates && typeof updates === "object" ? updates : {};

      const nextX = numberOr(requestedUpdates.x ?? currentObject.x, 0);

      const nextY = numberOr(requestedUpdates.y ?? currentObject.y, 0);

      const nextWidth = Math.max(
        1,
        numberOr(requestedUpdates.width ?? currentObject.width, 1),
      );

      const nextHeight = Math.max(
        1,
        numberOr(requestedUpdates.height ?? currentObject.height, 1),
      );

      const nextStyle = requestedUpdates.style
        ? {
            ...(currentObject.style || {}),
            ...requestedUpdates.style,
          }
        : currentObject.style;

      const nextGeometry = {
        ...(currentObject.geometry || {}),

        x: nextX,

        y: nextY,

        width: nextWidth,

        height: nextHeight,

        left: nextX,

        top: nextY,

        right: nextX + nextWidth,

        bottom: nextY + nextHeight,

        center: {
          x: nextX + nextWidth / 2,

          y: nextY + nextHeight / 2,
        },

        aspectRatio: nextWidth / Math.max(1, nextHeight),

        boundingBox: {
          ...(currentObject.geometry?.boundingBox || {}),

          x: nextX,

          y: nextY,

          width: nextWidth,

          height: nextHeight,

          minX: nextX,

          minY: nextY,

          maxX: nextX + nextWidth,

          maxY: nextY + nextHeight,
        },
      };

      updateObject(
        currentObject.id,
        {
          ...requestedUpdates,

          ...(nextStyle
            ? {
                style: nextStyle,
              }
            : {}),

          geometry: nextGeometry,

          updatedAt: new Date().toISOString(),
        },
        label,
      );

      return true;
    },
    [selectedPatternObject?.id, updateObject],
  );

  const handleSelectedPatternDimensionChange = useCallback(
    (dimension, requestedValue) => {
      const value = clamp(requestedValue, 1, 100000);

      updateSelectedPattern(
        {
          [dimension]: value,
        },
        "Resize pattern",
      );
    },
    [updateSelectedPattern],
  );

  const handleSelectedPatternRepeatChange = useCallback(
    (repeat) => {
      const safeRepeat = PATTERN_REPEAT_OPTIONS.some(
        (option) => option.value === repeat,
      )
        ? repeat
        : PATTERN_REPEAT_MODES.REPEAT;

      updateSelectedPattern(
        {
          repeat: safeRepeat,

          repeatMode: safeRepeat,

          patternRepeat: safeRepeat,

          style: {
            repeat: safeRepeat,

            repeatMode: safeRepeat,

            patternRepeat: safeRepeat,
          },
        },
        "Change pattern repeat",
      );
    },
    [updateSelectedPattern],
  );

  const handleFitSelectedPatternToDocument = useCallback(() => {
    updateSelectedPattern(
      {
        x: 0,

        y: 0,

        width: Math.max(1, numberOr(documentData.width, 1200)),

        height: Math.max(1, numberOr(documentData.height, 1600)),
      },
      "Fit pattern to document",
    );
  }, [documentData.width, documentData.height, updateSelectedPattern]);

  const resolveCurrentPatternMaskSettings = useCallback(() => {
    const repeat = resolvePatternRepeatMode(patternSettings);

    const scale = clamp(patternSettings.scale ?? 1, 0.02, 50);

    return {
      repeat,

      scale,

      scaleX: clamp(patternSettings.scaleX ?? scale, 0.02, 50),

      scaleY: clamp(patternSettings.scaleY ?? scale, 0.02, 50),

      rotation: numberOr(patternSettings.rotation, 0),

      opacity: clamp(patternSettings.opacity, 0, 1),

      offsetX: numberOr(patternSettings.offsetX, 0),

      offsetY: numberOr(patternSettings.offsetY, 0),

      imageSmoothingEnabled: patternSettings.imageSmoothingEnabled !== false,

      background: normalisePatternBackground(patternSettings.background),
    };
  }, [patternSettings]);

  const applyPatternMaskAssetToObjects = useCallback(
    (asset, requestedObjectIds, label = "Apply pattern to shape") => {
      const state = useFashionEditorStore.getState();

      const editableShapeIds = [
        ...new Set(
          (Array.isArray(requestedObjectIds) ? requestedObjectIds : []).filter(
            Boolean,
          ),
        ),
      ].filter((objectId) => {
        const object = state.objects[objectId];

        const layer = state.layers.find((item) => item.id === object?.layerId);

        return Boolean(
          object &&
          object.type === OBJECT_TYPES.SHAPE &&
          object.closed !== false &&
          object.visible !== false &&
          !object.locked &&
          layer &&
          layer.visible !== false &&
          !layer.locked,
        );
      });

      if (editableShapeIds.length === 0) {
        throw new Error("Select at least one unlocked closed shape.");
      }

      const settings = resolveCurrentPatternMaskSettings();

      if (typeof updateObjects === "function") {
        updateObjects(
          editableShapeIds,
          (currentObject) =>
            createPatternMaskUpdates(currentObject, asset, settings),
          label,
        );
      } else {
        beginHistoryTransaction?.(label);

        try {
          editableShapeIds.forEach((objectId) => {
            const currentObject =
              useFashionEditorStore.getState().objects[objectId];

            if (!currentObject) {
              return;
            }

            updateObject?.(
              objectId,
              createPatternMaskUpdates(currentObject, asset, settings),
              label,
            );
          });

          commitHistoryTransaction?.();
        } catch (error) {
          useFashionEditorStore.getState().cancelHistoryTransaction?.();

          throw error;
        }
      }

      return editableShapeIds;
    },
    [
      resolveCurrentPatternMaskSettings,
      updateObjects,
      updateObject,
      beginHistoryTransaction,
      commitHistoryTransaction,
    ],
  );

  const removePatternMasksFromObjects = useCallback(
    (requestedObjectIds, label = "Remove pattern from shape") => {
      const state = useFashionEditorStore.getState();

      const removableIds = [
        ...new Set(
          (Array.isArray(requestedObjectIds) ? requestedObjectIds : []).filter(
            Boolean,
          ),
        ),
      ].filter((objectId) => {
        const object = state.objects[objectId];

        const layer = state.layers.find((item) => item.id === object?.layerId);

        return Boolean(
          object &&
          object.type === OBJECT_TYPES.SHAPE &&
          hasPatternMask(object) &&
          object.visible !== false &&
          !object.locked &&
          layer &&
          layer.visible !== false &&
          !layer.locked,
        );
      });

      if (removableIds.length === 0) {
        return [];
      }

      if (typeof updateObjects === "function") {
        updateObjects(
          removableIds,
          (currentObject) => createPatternMaskRemovalUpdates(currentObject),
          label,
        );
      } else {
        beginHistoryTransaction?.(label);

        try {
          removableIds.forEach((objectId) => {
            const currentObject =
              useFashionEditorStore.getState().objects[objectId];

            if (!currentObject) {
              return;
            }

            updateObject?.(
              objectId,
              createPatternMaskRemovalUpdates(currentObject),
              label,
            );
          });

          commitHistoryTransaction?.();
        } catch (error) {
          useFashionEditorStore.getState().cancelHistoryTransaction?.();

          throw error;
        }
      }

      return removableIds;
    },
    [
      updateObjects,
      updateObject,
      beginHistoryTransaction,
      commitHistoryTransaction,
    ],
  );

  const updateSelectedPatternMask = useCallback(
    (updates, label = "Update shape pattern") => {
      if (
        !selectedPatternMaskShape?.id ||
        !selectedPatternMaskActive ||
        typeof updateObject !== "function"
      ) {
        return false;
      }

      const state = useFashionEditorStore.getState();

      const currentObject = state.objects[selectedPatternMaskShape.id];

      const currentLayer = state.layers.find(
        (layer) => layer.id === currentObject?.layerId,
      );

      if (
        !currentObject ||
        currentObject.type !== OBJECT_TYPES.SHAPE ||
        currentObject.locked ||
        currentObject.visible === false ||
        !currentLayer ||
        currentLayer.locked ||
        currentLayer.visible === false
      ) {
        return false;
      }

      const requestedUpdates =
        updates && typeof updates === "object" ? updates : {};

      const nextStyle = requestedUpdates.style
        ? {
            ...(currentObject.style || {}),
            ...requestedUpdates.style,
          }
        : currentObject.style;

      updateObject(
        currentObject.id,
        {
          ...requestedUpdates,

          ...(nextStyle
            ? {
                style: nextStyle,
              }
            : {}),

          updatedAt: new Date().toISOString(),
        },
        label,
      );

      return true;
    },
    [selectedPatternMaskShape?.id, selectedPatternMaskActive, updateObject],
  );

  const handlePatternFileChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0] || null;

      event.target.value = "";

      if (!file) {
        return;
      }

      const inputMode = {
        ...patternInputModeRef.current,
      };

      patternInputModeRef.current = {
        mode: "place",

        objectId: null,

        objectIds: [],
      };

      setPatternImporting(true);

      try {
        const asset = await loadPatternAsset(file);

        if (inputMode.mode === "mask-selection") {
          const targetIds = inputMode.objectIds?.length
            ? inputMode.objectIds
            : selectedObjectIds;

          const appliedIds = applyPatternMaskAssetToObjects(
            asset,
            targetIds,
            "Apply pattern to shape",
          );

          setActiveTool(EDITOR_TOOLS.SELECT);

          setUiState({
            rightPanelTab: "properties",
          });

          showToast(
            `Pattern applied to ${appliedIds.length} shape${appliedIds.length === 1 ? "" : "s"}.`,
          );

          return;
        }

        if (inputMode.mode === "mask") {
          await PatternMaskTool.queueAsset(asset);

          setActiveTool(EDITOR_TOOLS.PATTERN_MASK);

          setUiState({
            rightPanelTab: "properties",
          });

          showToast("Pattern ready. Click a closed shape to apply it.");

          return;
        }

        if (inputMode.mode === "replace" && inputMode.objectId) {
          const state = useFashionEditorStore.getState();

          const currentObject = state.objects[inputMode.objectId];

          const currentLayer = state.layers.find(
            (layer) => layer.id === currentObject?.layerId,
          );

          if (
            !currentObject ||
            currentObject.type !== OBJECT_TYPES.PATTERN ||
            currentObject.locked ||
            currentObject.visible === false ||
            !currentLayer ||
            currentLayer.locked ||
            currentLayer.visible === false
          ) {
            throw new Error("The selected pattern cannot be replaced.");
          }

          const scaleX = resolvePatternScaleX(currentObject);

          const scaleY = resolvePatternScaleY(currentObject);

          updateObject(
            currentObject.id,
            {
              src: asset.dataUrl,

              source: asset.dataUrl,

              dataUrl: asset.dataUrl,

              patternSource: asset.dataUrl,

              imageSource: asset.dataUrl,

              assetId: asset.id,

              fileName: asset.fileName,

              mimeType: asset.mimeType,

              fileSize: asset.fileSize,

              naturalWidth: asset.naturalWidth,

              naturalHeight: asset.naturalHeight,

              aspectRatio: asset.aspectRatio,

              tileWidth: asset.naturalWidth * scaleX,

              tileHeight: asset.naturalHeight * scaleY,

              style: {
                ...(currentObject.style || {}),

                tileWidth: asset.naturalWidth * scaleX,

                tileHeight: asset.naturalHeight * scaleY,
              },

              metadata: {
                ...(currentObject.metadata || {}),

                originalFileName: asset.fileName,

                originalMimeType: asset.mimeType,

                originalWidth: asset.naturalWidth,

                originalHeight: asset.naturalHeight,

                importedAt: asset.importedAt,

                replacedAt: new Date().toISOString(),
              },

              updatedAt: new Date().toISOString(),
            },
            "Replace pattern",
          );

          showToast("Pattern texture replaced.");

          return;
        }

        await PatternTool.queueAsset(asset);

        setActiveTool(EDITOR_TOOLS.PATTERN);

        setUiState({
          rightPanelTab: "properties",
        });

        showToast("Pattern ready. Drag on the canvas to place it.");
      } catch (error) {
        console.error(error);

        setEditorError(error);

        showToast(
          error?.message || "The pattern could not be imported.",
          "error",
        );
      } finally {
        setPatternImporting(false);
      }
    },
    [
      selectedObjectIds,
      applyPatternMaskAssetToObjects,
      updateObject,
      setActiveTool,
      setUiState,
      showToast,
    ],
  );

  /*=====================================================
    Symmetry
    =====================================================*/

  const updateSymmetrySettings = useCallback(
    (updates) => {
      const safeUpdates = updates && typeof updates === "object" ? updates : {};

      if (typeof setSymmetrySettingsAction === "function") {
        setSymmetrySettingsAction(safeUpdates);

        return;
      }

      /*
                Compatibility fallback for stores created before
                the symmetry actions were added.
                */

      useFashionEditorStore.setState((state) => ({
        symmetry: {
          ...createDefaultSymmetrySettings(state.document),

          ...(state.symmetry || {}),

          ...safeUpdates,

          mode: normaliseSymmetryMode(safeUpdates.mode ?? state.symmetry?.mode),
        },
      }));
    },
    [setSymmetrySettingsAction],
  );

  const handleToggleSymmetry = useCallback(() => {
    if (typeof toggleSymmetryAction === "function") {
      toggleSymmetryAction();

      return;
    }

    updateSymmetrySettings({
      enabled: !symmetry.enabled,
    });
  }, [toggleSymmetryAction, updateSymmetrySettings, symmetry.enabled]);

  const handleSetSymmetryMode = useCallback(
    (mode) => {
      const safeMode = normaliseSymmetryMode(mode);

      if (typeof setSymmetryModeAction === "function") {
        setSymmetryModeAction(safeMode);

        return;
      }

      updateSymmetrySettings({
        mode: safeMode,
      });
    },
    [setSymmetryModeAction, updateSymmetrySettings],
  );

  const handleCenterSymmetryAxes = useCallback(() => {
    if (typeof centerSymmetryAxesAction === "function") {
      centerSymmetryAxesAction();

      return;
    }

    updateSymmetrySettings({
      axisX: Math.max(1, numberOr(documentData.width, 1200)) / 2,

      axisY: Math.max(1, numberOr(documentData.height, 1600)) / 2,
    });
  }, [
    centerSymmetryAxesAction,
    updateSymmetrySettings,
    documentData.width,
    documentData.height,
  ]);

  const handleSetSymmetryToolEnabled = useCallback(
    (toolId, enabled) => {
      const toolDefinition = SYMMETRY_TOOL_OPTIONS.find(
        (option) => option.id === toolId,
      );

      if (!toolDefinition || !toolDefinition.available) {
        return;
      }

      if (typeof setSymmetryToolEnabledAction === "function") {
        setSymmetryToolEnabledAction(toolId, Boolean(enabled));

        return;
      }

      updateSymmetrySettings({
        [toolDefinition.settingKey]: Boolean(enabled),
      });
    },
    [setSymmetryToolEnabledAction, updateSymmetrySettings],
  );

  const handleResetSymmetry = useCallback(() => {
    if (typeof resetSymmetrySettingsAction === "function") {
      resetSymmetrySettingsAction();

      return;
    }

    useFashionEditorStore.setState((state) => ({
      symmetry: createDefaultSymmetrySettings(state.document),
    }));
  }, [resetSymmetrySettingsAction]);

  const openSymmetryProperties = useCallback(() => {
    setUiState({
      rightPanelTab: "properties",

      rightPanelOpen: true,
    });

    if (!isDesktopPanel) {
      setPanelDrawerOpen(true);
    }
  }, [setUiState, isDesktopPanel]);

  /*=====================================================
    Right Panel Content
    =====================================================*/

  const rightPanelContent = (
    <>
      <div className="flex h-12 shrink-0 items-center border-b border-slate-800 bg-slate-950">
        <button
          type="button"
          onClick={() => {
            setUiState({
              rightPanelTab: "layers",
            });
          }}
          className={[
            "h-full flex-1 border-b-2 text-[10px] font-bold uppercase tracking-[0.16em] transition",
            rightPanelTab === "layers"
              ? "border-violet-500 text-white"
              : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Layers
        </button>

        <button
          type="button"
          onClick={() => {
            setUiState({
              rightPanelTab: "properties",
            });
          }}
          className={[
            "h-full flex-1 border-b-2 text-[10px] font-bold uppercase tracking-[0.16em] transition",
            rightPanelTab === "properties"
              ? "border-violet-500 text-white"
              : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Properties
        </button>

        {!isDesktopPanel && (
          <button
            type="button"
            onClick={() => {
              setPanelDrawerOpen(false);
            }}
            title="Close panel"
            className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-lg text-slate-300 hover:bg-slate-800"
          >
            ×
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {rightPanelTab === "layers" && (
          <>
            <PanelSection
              title="Layers"
              action={
                <button
                  type="button"
                  onClick={() => addLayer()}
                  className="rounded-md bg-violet-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-violet-400"
                >
                  + Add
                </button>
              }
            >
              <div className="space-y-2">
                {displayedLayers.map((layer) => {
                  const actualIndex = layers.findIndex(
                    (item) => item.id === layer.id,
                  );

                  const active = layer.id === activeLayerId;

                  return (
                    <div
                      key={layer.id}
                      onClick={() => {
                        setActiveLayer(layer.id);
                      }}
                      className={[
                        "cursor-pointer rounded-xl border p-2 transition",
                        active
                          ? "border-violet-500 bg-violet-500/10"
                          : "border-slate-800 bg-slate-900 hover:border-slate-700",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          title={layer.visible ? "Hide layer" : "Show layer"}
                          onClick={(event) => {
                            event.stopPropagation();

                            toggleLayerVisibility(layer.id);
                          }}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
                        >
                          {layer.visible ? "◉" : "○"}
                        </button>

                        <LayerNameField
                          layer={layer}
                          renameLayer={renameLayer}
                        />

                        <button
                          type="button"
                          title={layer.locked ? "Unlock layer" : "Lock layer"}
                          onClick={(event) => {
                            event.stopPropagation();

                            toggleLayerLock(layer.id);
                          }}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
                        >
                          {layer.locked ? "■" : "□"}
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between pl-11 text-[10px] text-slate-500">
                        <span>
                          {layer.objectIds.length} object
                          {layer.objectIds.length === 1 ? "" : "s"}
                        </span>

                        <span>{Math.round(layer.opacity * 100)}%</span>
                      </div>

                      {active && (
                        <div className="mt-3 grid grid-cols-4 gap-1.5">
                          <button
                            type="button"
                            disabled={actualIndex >= layers.length - 1}
                            onClick={(event) => {
                              event.stopPropagation();

                              handleMoveLayerUp(layer.id);
                            }}
                            className="min-h-9 rounded-md bg-slate-800 py-1.5 text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-30"
                          >
                            Up
                          </button>

                          <button
                            type="button"
                            disabled={actualIndex <= 0}
                            onClick={(event) => {
                              event.stopPropagation();

                              handleMoveLayerDown(layer.id);
                            }}
                            className="min-h-9 rounded-md bg-slate-800 py-1.5 text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-30"
                          >
                            Down
                          </button>

                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();

                              duplicateLayer(layer.id);
                            }}
                            className="min-h-9 rounded-md bg-slate-800 py-1.5 text-[10px] text-slate-300 hover:bg-slate-700"
                          >
                            Copy
                          </button>

                          <button
                            type="button"
                            disabled={layers.length <= 1}
                            onClick={(event) => {
                              event.stopPropagation();

                              handleDeleteActiveLayer();
                            }}
                            className="min-h-9 rounded-md bg-red-950/60 py-1.5 text-[10px] text-red-300 hover:bg-red-900 disabled:opacity-30"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </PanelSection>

            {activeLayer && (
              <PanelSection title="Layer Settings">
                <div className="space-y-5">
                  <SliderField
                    label="Opacity"
                    value={Math.round(activeLayer.opacity * 100)}
                    minimum={0}
                    maximum={100}
                    suffix="%"
                    onStart={() => {
                      beginHistoryTransaction("Change layer opacity");
                    }}
                    onEnd={() => {
                      commitHistoryTransaction();
                    }}
                    onChange={(value) => {
                      setLayerOpacity(activeLayer.id, value / 100);
                    }}
                  />

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-300">
                      Blend mode
                    </span>

                    <select
                      value={activeLayer.blendMode}
                      onChange={(event) => {
                        setLayerBlendMode(activeLayer.id, event.target.value);
                      }}
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                    >
                      {BLEND_MODES.map((blendMode) => (
                        <option key={blendMode} value={blendMode}>
                          {blendMode}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </PanelSection>
            )}
          </>
        )}

        {rightPanelTab === "properties" && (
          <>
            <PanelSection
              title="Symmetry"
              action={
                <button
                  type="button"
                  onClick={handleToggleSymmetry}
                  aria-pressed={Boolean(symmetry.enabled)}
                  className={[
                    "rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide transition",
                    symmetry.enabled
                      ? "border-violet-400 bg-violet-500 text-white"
                      : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-white",
                  ].join(" ")}
                >
                  {symmetry.enabled ? "On" : "Off"}
                </button>
              }
            >
              <div className="space-y-5">
                <div>
                  <span className="mb-2 block text-xs font-medium text-slate-300">
                    Mirror mode
                  </span>

                  <div className="grid grid-cols-3 gap-2">
                    {SYMMETRY_MODE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          handleSetSymmetryMode(option.value);
                        }}
                        aria-pressed={symmetry.mode === option.value}
                        className={[
                          "min-h-11 rounded-lg border px-2 py-2 text-[10px] font-bold uppercase tracking-wide transition",
                          symmetry.mode === option.value
                            ? "border-violet-500 bg-violet-500/20 text-violet-200"
                            : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-white",
                        ].join(" ")}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {(symmetry.mode === "vertical" ||
                  symmetry.mode === "four-way") && (
                  <SliderField
                    label="Vertical axis"
                    value={Math.round(
                      clamp(symmetry.axisX, 0, documentData.width),
                    )}
                    minimum={0}
                    maximum={Math.max(1, numberOr(documentData.width, 1200))}
                    step={1}
                    suffix="px"
                    onChange={(value) => {
                      updateSymmetrySettings({
                        axisX: value,
                      });
                    }}
                  />
                )}

                {(symmetry.mode === "horizontal" ||
                  symmetry.mode === "four-way") && (
                  <SliderField
                    label="Horizontal axis"
                    value={Math.round(
                      clamp(symmetry.axisY, 0, documentData.height),
                    )}
                    minimum={0}
                    maximum={Math.max(1, numberOr(documentData.height, 1600))}
                    step={1}
                    suffix="px"
                    onChange={(value) => {
                      updateSymmetrySettings({
                        axisY: value,
                      });
                    }}
                  />
                )}

                <button
                  type="button"
                  onClick={handleCenterSymmetryAxes}
                  className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                >
                  Center symmetry axes
                </button>

                <div className="space-y-2">
                  <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                    <span className="text-xs font-medium text-slate-300">
                      Show guide
                    </span>

                    <input
                      type="checkbox"
                      checked={symmetry.showGuide !== false}
                      onChange={(event) => {
                        updateSymmetrySettings({
                          showGuide: event.target.checked,
                        });
                      }}
                      className="h-4 w-4 accent-violet-500"
                    />
                  </label>

                  <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                    <span className="text-xs font-medium text-slate-300">
                      Snap near axis
                    </span>

                    <input
                      type="checkbox"
                      checked={symmetry.snapToAxis === true}
                      onChange={(event) => {
                        updateSymmetrySettings({
                          snapToAxis: event.target.checked,
                        });
                      }}
                      className="h-4 w-4 accent-violet-500"
                    />
                  </label>

                  <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                    <span className="text-xs font-medium text-slate-300">
                      Link mirrored copies
                    </span>

                    <input
                      type="checkbox"
                      checked={symmetry.linkedMirrors === true}
                      onChange={(event) => {
                        updateSymmetrySettings({
                          linkedMirrors: event.target.checked,
                        });
                      }}
                      className="h-4 w-4 accent-violet-500"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-[1fr_72px] items-center gap-3">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-300">
                      Guide colour
                    </span>

                    <input
                      type="color"
                      value={
                        symmetry.guideColor || DEFAULT_SYMMETRY_GUIDE_COLOUR
                      }
                      onChange={(event) => {
                        updateSymmetrySettings({
                          guideColor: event.target.value,
                        });
                      }}
                      className="h-11 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-1"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-300">
                      Opacity
                    </span>

                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round(
                        clamp(symmetry.guideOpacity, 0, 1) * 100,
                      )}
                      onChange={(event) => {
                        updateSymmetrySettings({
                          guideOpacity: clamp(
                            Number(event.target.value) / 100,
                            0,
                            1,
                          ),
                        });
                      }}
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200 outline-none focus:border-violet-500"
                    />
                  </label>
                </div>

                <div>
                  <span className="mb-2 block text-xs font-medium text-slate-300">
                    Mirrored tools
                  </span>

                  <div className="grid grid-cols-2 gap-2">
                    {SYMMETRY_TOOL_OPTIONS.map((option) => {
                      const available = option.available;

                      const enabled = symmetry[option.settingKey] !== false;

                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={!available}
                          onClick={() => {
                            handleSetSymmetryToolEnabled(option.id, !enabled);
                          }}
                          aria-pressed={available && enabled}
                          title={
                            available
                              ? `Toggle ${option.label} symmetry`
                              : "Mirrored erasing will be added when EraserTool is integrated."
                          }
                          className={[
                            "min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                            available && enabled
                              ? "border-violet-500 bg-violet-500/15 text-violet-200"
                              : "border-slate-700 bg-slate-900 text-slate-400",
                            available
                              ? "hover:border-slate-500 hover:text-white"
                              : "cursor-not-allowed opacity-40",
                          ].join(" ")}
                        >
                          {option.label}
                          {!available ? " · Next" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={openSymmetryProperties}
                    className="min-h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                  >
                    Keep panel open
                  </button>

                  <button
                    type="button"
                    onClick={handleResetSymmetry}
                    className="min-h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-400 hover:border-slate-500 hover:text-white"
                  >
                    Reset
                  </button>
                </div>

                <p className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-[10px] leading-relaxed text-slate-500">
                  Symmetry currently works with Pencil, Brush, Line and Shape.
                  Turn it on, choose a mode, then draw on the canvas.
                </p>
              </div>
            </PanelSection>

            {activeTool === EDITOR_TOOLS.PENCIL && (
              <PanelSection title="Pencil">
                <div className="space-y-5">
                  <SliderField
                    label="Size"
                    value={brush.size}
                    minimum={0.25}
                    maximum={100}
                    step={0.25}
                    suffix="px"
                    onChange={(value) => {
                      setBrushSettings({
                        size: value,
                      });
                    }}
                  />

                  <SliderField
                    label="Opacity"
                    value={Math.round(brush.opacity * 100)}
                    minimum={1}
                    maximum={100}
                    suffix="%"
                    onChange={(value) => {
                      setBrushSettings({
                        opacity: value / 100,
                      });
                    }}
                  />

                  <SliderField
                    label="Smoothing"
                    value={Math.round(brush.smoothing * 100)}
                    minimum={0}
                    maximum={100}
                    suffix="%"
                    onChange={(value) => {
                      setBrushSettings({
                        smoothing: value / 100,
                      });
                    }}
                  />

                  <SliderField
                    label="Streamline"
                    value={Math.round(brush.streamline * 100)}
                    minimum={0}
                    maximum={100}
                    suffix="%"
                    onChange={(value) => {
                      setBrushSettings({
                        streamline: value / 100,
                      });
                    }}
                  />

                  <label className="flex min-h-11 items-center justify-between gap-4 text-xs text-slate-300">
                    Pressure enabled
                    <input
                      type="checkbox"
                      checked={brush.pressureEnabled}
                      onChange={(event) => {
                        setBrushSettings({
                          pressureEnabled: event.target.checked,
                        });
                      }}
                      className="h-5 w-5 accent-violet-500"
                    />
                  </label>

                  <label className="flex min-h-11 items-center justify-between gap-4 text-xs text-slate-300">
                    Simulate pressure
                    <input
                      type="checkbox"
                      checked={brush.simulatePressure}
                      onChange={(event) => {
                        setBrushSettings({
                          simulatePressure: event.target.checked,
                        });
                      }}
                      className="h-5 w-5 accent-violet-500"
                    />
                  </label>
                </div>
              </PanelSection>
            )}

            {activeTool === EDITOR_TOOLS.BRUSH && (
              <PanelSection title="Professional Brush">
                <div className="space-y-5">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-300">
                      Brush preset
                    </span>

                    <select
                      value={activeBrushPreset?.id || DEFAULT_BRUSH_PRESET_ID}
                      onChange={(event) => {
                        handleBrushPresetChange(event.target.value);
                      }}
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                    >
                      {BRUSH_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {activeBrushPreset && (
                    <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">
                            {activeBrushPreset.name}
                          </p>

                          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                            {activeBrushPreset.description}
                          </p>
                        </div>

                        <span className="shrink-0 rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-violet-200">
                          {activeBrushPreset.renderMode}
                        </span>
                      </div>

                      <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {activeBrushPreset.category}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-xs font-medium text-slate-300">
                      Presets
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      {BRUSH_PRESETS.map((preset) => {
                        const selected = preset.id === activeBrushPreset?.id;

                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              handleBrushPresetChange(preset.id);
                            }}
                            className={[
                              "min-h-14 rounded-lg border px-3 py-2 text-left transition",
                              selected
                                ? "border-violet-500 bg-violet-500 text-white"
                                : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:bg-slate-800",
                            ].join(" ")}
                          >
                            <span className="block text-[11px] font-semibold">
                              {preset.name}
                            </span>

                            <span
                              className={[
                                "mt-1 block text-[9px] uppercase tracking-wide",
                                selected ? "text-violet-100" : "text-slate-500",
                              ].join(" ")}
                            >
                              {preset.renderMode}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <SliderField
                    label="Size"
                    value={numberOr(brush.size, activeBrushPreset?.size || 4)}
                    minimum={numberOr(brush.minimumSize, 0.25)}
                    maximum={numberOr(brush.maximumSize, 300)}
                    step={0.25}
                    suffix="px"
                    onChange={(value) => {
                      setBrushSettings({
                        size: value,
                      });
                    }}
                  />

                  <SliderField
                    label="Opacity"
                    value={Math.round(numberOr(brush.opacity, 1) * 100)}
                    minimum={1}
                    maximum={100}
                    suffix="%"
                    onChange={(value) => {
                      setBrushSettings({
                        opacity: value / 100,
                      });
                    }}
                  />

                  <SliderField
                    label="Flow"
                    value={Math.round(numberOr(brush.flow, 1) * 100)}
                    minimum={1}
                    maximum={100}
                    suffix="%"
                    onChange={(value) => {
                      setBrushSettings({
                        flow: value / 100,
                      });
                    }}
                  />

                  <SliderField
                    label="Smoothing"
                    value={Math.round(numberOr(brush.smoothing, 0.5) * 100)}
                    minimum={0}
                    maximum={100}
                    suffix="%"
                    onChange={(value) => {
                      setBrushSettings({
                        smoothing: value / 100,
                      });
                    }}
                  />

                  <SliderField
                    label="Streamline"
                    value={Math.round(numberOr(brush.streamline, 0.5) * 100)}
                    minimum={0}
                    maximum={100}
                    suffix="%"
                    onChange={(value) => {
                      setBrushSettings({
                        streamline: value / 100,
                      });
                    }}
                  />

                  <SliderField
                    label="Thinning"
                    value={Math.round(numberOr(brush.thinning, 0) * 100)}
                    minimum={-100}
                    maximum={100}
                    suffix="%"
                    onChange={(value) => {
                      setBrushSettings({
                        thinning: value / 100,
                      });
                    }}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-300">
                        Start taper
                      </span>

                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={numberOr(brush.taperStart, 0)}
                        onChange={(event) => {
                          setBrushSettings({
                            taperStart: Math.max(
                              0,
                              Number(event.target.value) || 0,
                            ),
                          });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-300">
                        End taper
                      </span>

                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={numberOr(brush.taperEnd, 0)}
                        onChange={(event) => {
                          setBrushSettings({
                            taperEnd: Math.max(
                              0,
                              Number(event.target.value) || 0,
                            ),
                          });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                      />
                    </label>
                  </div>

                  <label className="flex min-h-11 items-center justify-between gap-4 text-xs text-slate-300">
                    Pressure enabled
                    <input
                      type="checkbox"
                      checked={brush.pressureEnabled !== false}
                      onChange={(event) => {
                        setBrushSettings({
                          pressureEnabled: event.target.checked,
                        });
                      }}
                      className="h-5 w-5 accent-violet-500"
                    />
                  </label>

                  <label className="flex min-h-11 items-center justify-between gap-4 text-xs text-slate-300">
                    Simulate pressure
                    <input
                      type="checkbox"
                      checked={brush.simulatePressure !== false}
                      onChange={(event) => {
                        setBrushSettings({
                          simulatePressure: event.target.checked,
                        });
                      }}
                      className="h-5 w-5 accent-violet-500"
                    />
                  </label>
                </div>
              </PanelSection>
            )}

            {activeTool === EDITOR_TOOLS.SHAPE && (
              <PanelSection title="Shape">
                <div className="space-y-5">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-300">
                      Shape type
                    </span>

                    <select
                      value={activeShapeType}
                      onChange={(event) => {
                        const nextShapeType = event.target.value;

                        setShapeSettings({
                          shapeType: nextShapeType,
                        });
                      }}
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                    >
                      {SHAPE_TYPE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-300">
                        Stroke colour
                      </span>

                      <input
                        type="color"
                        value={shape?.stroke || colours.primary}
                        onChange={(event) => {
                          const nextColour = event.target.value;

                          setShapeSettings({
                            stroke: nextColour,
                          });

                          setPrimaryColor(nextColour);
                        }}
                        className="h-11 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-1"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-300">
                        Fill mode
                      </span>

                      <select
                        value={shape?.fillType || "none"}
                        onChange={(event) => {
                          setShapeSettings({
                            fillType: event.target.value,
                          });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                      >
                        <option value="none">No fill</option>

                        <option value="solid">Solid</option>
                      </select>
                    </label>
                  </div>

                  <SliderField
                    label="Stroke width"
                    value={numberOr(shape?.strokeWidth, 3)}
                    minimum={0}
                    maximum={200}
                    step={0.25}
                    suffix="px"
                    onChange={(value) => {
                      setShapeSettings({
                        strokeWidth: value,
                      });
                    }}
                  />

                  <SliderField
                    label="Stroke opacity"
                    value={Math.round(numberOr(shape?.strokeOpacity, 1) * 100)}
                    minimum={0}
                    maximum={100}
                    suffix="%"
                    onChange={(value) => {
                      setShapeSettings({
                        strokeOpacity: value / 100,
                      });
                    }}
                  />

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-300">
                      Border style
                    </span>

                    <select
                      value={activeLineStyle.id}
                      onChange={(event) => {
                        const selectedStyle =
                          LINE_STYLE_OPTIONS.find(
                            (option) => option.id === event.target.value,
                          ) || LINE_STYLE_OPTIONS[0];

                        setShapeSettings({
                          dash: [...selectedStyle.dash],
                        });
                      }}
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                    >
                      {LINE_STYLE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {shape?.fillType === "solid" && (
                    <>
                      <label className="block">
                        <span className="mb-2 block text-xs font-medium text-slate-300">
                          Fill colour
                        </span>

                        <input
                          type="color"
                          value={shape?.fill || colours.secondary}
                          onChange={(event) => {
                            const nextColour = event.target.value;

                            setShapeSettings({
                              fill: nextColour,
                            });

                            setSecondaryColor(nextColour);
                          }}
                          className="h-11 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-1"
                        />
                      </label>

                      <SliderField
                        label="Fill opacity"
                        value={Math.round(
                          numberOr(shape?.fillOpacity, 1) * 100,
                        )}
                        minimum={0}
                        maximum={100}
                        suffix="%"
                        onChange={(value) => {
                          setShapeSettings({
                            fillOpacity: value / 100,
                          });
                        }}
                      />
                    </>
                  )}

                  {activeShapeType === "rectangle" && (
                    <SliderField
                      label="Corner radius"
                      value={numberOr(shape?.cornerRadius, 0)}
                      minimum={0}
                      maximum={200}
                      step={1}
                      suffix="px"
                      onChange={(value) => {
                        setShapeSettings({
                          cornerRadius: value,
                        });
                      }}
                    />
                  )}

                  {activeShapeType === "polygon" && (
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-300">
                        Polygon sides
                      </span>

                      <input
                        type="number"
                        min="3"
                        max="32"
                        step="1"
                        value={Math.max(
                          3,
                          Math.min(32, numberOr(shape?.sides, 5)),
                        )}
                        onChange={(event) => {
                          setShapeSettings({
                            sides: Math.max(
                              3,
                              Math.min(32, Number(event.target.value) || 5),
                            ),
                          });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                      />
                    </label>
                  )}

                  <label className="flex min-h-11 items-center justify-between gap-4 text-xs text-slate-300">
                    Keep equal proportions
                    <input
                      type="checkbox"
                      checked={shape?.keepAspectRatio === true}
                      onChange={(event) => {
                        setShapeSettings({
                          keepAspectRatio: event.target.checked,
                        });
                      }}
                      className="h-5 w-5 accent-violet-500"
                    />
                  </label>

                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                    <p className="text-xs font-semibold text-slate-200">
                      Drawing shortcuts
                    </p>

                    <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                      Hold Shift for equal proportions. Hold Alt to draw outward
                      from the starting point.
                    </p>
                  </div>
                </div>
              </PanelSection>
            )}

            {activeTool === EDITOR_TOOLS.CLOTHING && (
              <PanelSection title="Clothing Templates">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-slate-200">
                        Front + Back Fashion Flats
                      </p>

                      <span className="shrink-0 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-violet-200">
                        Dual View
                      </span>
                    </div>

                    <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                      Each garment includes realistic front and back fashion
                      flats with editable colours, graphics and fabric patterns
                      clipped safely inside construction regions.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {CLOTHING_TEMPLATES.map((template) => {
                      const regionCount =
                        getClothingTemplateColourRegions(template).length;

                      return (
                        <button
                          key={template.id}
                          type="button"
                          disabled={
                            clothingImporting ||
                            !activeLayer ||
                            activeLayer.locked ||
                            activeLayer.visible === false
                          }
                          onClick={() => {
                            void handleChooseClothingTemplate(template);
                          }}
                          className="group overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-2 text-left transition hover:border-violet-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <div className="flex aspect-[14/9] items-center justify-center overflow-hidden rounded-lg bg-white p-2">
                            <img
                              src={createClothingTemplatePreview(template)}
                              alt={`${template.label} front and back clothing template`}
                              className="h-full w-full object-contain"
                              draggable={false}
                            />
                          </div>

                          <div className="mt-2 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <span className="block text-xs font-semibold text-slate-200 group-hover:text-white">
                                {template.label}
                              </span>

                              {template.description && (
                                <span className="mt-1 block text-[9px] leading-relaxed text-slate-500">
                                  {template.description}
                                </span>
                              )}
                            </div>

                            <span className="shrink-0 rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-slate-400">
                              {template.dualView ? "Front + Back" : "Front"}
                            </span>
                          </div>

                          <span className="mt-2 block text-[9px] font-semibold uppercase tracking-wide text-violet-300">
                            {regionCount} colour + artwork region
                            {regionCount === 1 ? "" : "s"}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {clothingImporting && (
                    <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3">
                      <p className="text-xs font-semibold text-violet-200">
                        Preparing dual-view template…
                      </p>
                    </div>
                  )}

                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
                    <p className="text-xs font-semibold text-violet-100">
                      How to use
                    </p>

                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                      Select a garment and click the canvas once. Front and back
                      are placed together as one editable fashion board. Select
                      it afterward to colour front/back regions independently,
                      add clipped graphics or patterns, resize, rotate, move,
                      duplicate, save or export it.
                    </p>
                  </div>
                </div>
              </PanelSection>
            )}

            {activeTool === EDITOR_TOOLS.LINE && (
              <PanelSection title="Line">
                <div className="space-y-5">
                  <SliderField
                    label="Width"
                    value={numberOr(shape?.strokeWidth, 3)}
                    minimum={0.25}
                    maximum={200}
                    step={0.25}
                    suffix="px"
                    onChange={(value) => {
                      setShapeSettings({
                        strokeWidth: value,
                      });
                    }}
                  />

                  <SliderField
                    label="Opacity"
                    value={Math.round(numberOr(shape?.strokeOpacity, 1) * 100)}
                    minimum={1}
                    maximum={100}
                    suffix="%"
                    onChange={(value) => {
                      setShapeSettings({
                        strokeOpacity: value / 100,
                      });
                    }}
                  />

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-300">
                      Line style
                    </span>

                    <select
                      value={activeLineStyle.id}
                      onChange={(event) => {
                        const selectedStyle =
                          LINE_STYLE_OPTIONS.find(
                            (option) => option.id === event.target.value,
                          ) || LINE_STYLE_OPTIONS[0];

                        setShapeSettings({
                          dash: [...selectedStyle.dash],
                        });
                      }}
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                    >
                      {LINE_STYLE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-300">
                      Line cap
                    </span>

                    <select
                      value={shape?.lineCap || "round"}
                      onChange={(event) => {
                        setShapeSettings({
                          lineCap: event.target.value,

                          lineJoin:
                            event.target.value === "round" ? "round" : "miter",
                        });
                      }}
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                    >
                      {LINE_CAP_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-300">
                      Line colour
                    </span>

                    <input
                      type="color"
                      value={colours.primary}
                      onChange={(event) => {
                        setPrimaryColor(event.target.value);
                      }}
                      className="h-11 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-1"
                    />
                  </label>

                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                    <p className="text-xs font-semibold text-slate-200">
                      Angle snapping
                    </p>

                    <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                      Hold Shift while dragging to snap the line to 15-degree
                      increments.
                    </p>
                  </div>
                </div>
              </PanelSection>
            )}

            {activeTool === EDITOR_TOOLS.FILL && (
              <PanelSection title="Fill Tool">
                <div className="space-y-5">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-300">
                      Fill colour
                    </span>

                    <input
                      type="color"
                      value={shape?.fill || colours.primary}
                      onChange={(event) => {
                        handleFillColourChange(event.target.value);
                      }}
                      className="h-12 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-1"
                    />
                  </label>

                  <SliderField
                    label="Fill opacity"
                    value={Math.round(numberOr(shape?.fillOpacity, 1) * 100)}
                    minimum={0}
                    maximum={100}
                    suffix="%"
                    onChange={(value) => {
                      setShapeSettings({
                        fillOpacity: value / 100,
                      });
                    }}
                  />

                  <div>
                    <p className="mb-2 text-xs font-medium text-slate-300">
                      Quick colours
                    </p>

                    <div className="grid grid-cols-8 gap-2">
                      {DEFAULT_COLOURS.map((colour) => (
                        <button
                          key={`fill-${colour}`}
                          type="button"
                          title={colour}
                          onClick={() => {
                            handleFillColourChange(colour);
                          }}
                          className={[
                            "aspect-square min-h-7 rounded-md border-2 transition hover:scale-110",
                            (shape?.fill || colours.primary) === colour
                              ? "border-violet-400"
                              : "border-slate-700",
                          ].join(" ")}
                          style={{
                            background: colour,
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleFillColourChange(colours.primary);
                      }}
                      className="min-h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                    >
                      Use primary
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleFillColourChange(colours.secondary);
                      }}
                      className="min-h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                    >
                      Use secondary
                    </button>
                  </div>

                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
                    <p className="text-xs font-semibold text-violet-100">
                      How to use
                    </p>

                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                      Click a closed shape to apply this colour. Hold Alt while
                      clicking to remove its fill. Locked or hidden objects are
                      not changed.
                    </p>
                  </div>

                  <p className="text-[10px] leading-relaxed text-slate-500">
                    The Fill tool works with rectangles, ellipses, circles,
                    triangles and polygons. Brush and line objects are ignored.
                  </p>
                </div>
              </PanelSection>
            )}

            {activeTool === EDITOR_TOOLS.TEXT && (
              <PanelSection title="Text Tool">
                <div className="space-y-5">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-300">
                      Text content
                    </span>

                    <textarea
                      rows={4}
                      value={textSettings.content}
                      onChange={(event) => {
                        handleTextContentChange(event.target.value);
                      }}
                      placeholder="Enter text"
                      className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm leading-relaxed text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-500"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-300">
                      Font family
                    </span>

                    <select
                      value={textSettings.fontFamily}
                      onChange={(event) => {
                        updateTextSettings({
                          fontFamily: event.target.value,
                        });
                      }}
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                    >
                      {TEXT_FONT_OPTIONS.map((fontFamily) => (
                        <option key={fontFamily} value={fontFamily}>
                          {fontFamily}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-300">
                        Font size
                      </span>

                      <input
                        type="number"
                        min="1"
                        max="1000"
                        step="1"
                        value={textSettings.fontSize}
                        onChange={(event) => {
                          updateTextSettings({
                            fontSize: Math.max(
                              1,
                              Math.min(1000, Number(event.target.value) || 1),
                            ),
                          });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-300">
                        Font weight
                      </span>

                      <select
                        value={textSettings.fontWeight}
                        onChange={(event) => {
                          updateTextSettings({
                            fontWeight: Number(event.target.value),
                          });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                      >
                        {TEXT_WEIGHT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      aria-pressed={textSettings.fontWeight >= 600}
                      onClick={() => {
                        updateTextSettings({
                          fontWeight:
                            textSettings.fontWeight >= 600 ? 400 : 700,
                        });
                      }}
                      className={[
                        "min-h-11 rounded-lg border px-3 py-2 text-xs font-bold transition",
                        textSettings.fontWeight >= 600
                          ? "border-violet-500 bg-violet-500 text-white"
                          : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800",
                      ].join(" ")}
                    >
                      Bold
                    </button>

                    <button
                      type="button"
                      aria-pressed={textSettings.fontStyle === "italic"}
                      onClick={() => {
                        updateTextSettings({
                          fontStyle:
                            textSettings.fontStyle === "italic"
                              ? "normal"
                              : "italic",
                        });
                      }}
                      className={[
                        "min-h-11 rounded-lg border px-3 py-2 text-xs italic transition",
                        textSettings.fontStyle === "italic"
                          ? "border-violet-500 bg-violet-500 text-white"
                          : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800",
                      ].join(" ")}
                    >
                      Italic
                    </button>

                    <button
                      type="button"
                      aria-pressed={textSettings.textDecoration === "underline"}
                      onClick={() => {
                        updateTextSettings({
                          textDecoration:
                            textSettings.textDecoration === "underline"
                              ? ""
                              : "underline",
                        });
                      }}
                      className={[
                        "min-h-11 rounded-lg border px-3 py-2 text-xs underline transition",
                        textSettings.textDecoration === "underline"
                          ? "border-violet-500 bg-violet-500 text-white"
                          : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800",
                      ].join(" ")}
                    >
                      Underline
                    </button>
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-300">
                      Text colour
                    </span>

                    <input
                      type="color"
                      value={textSettings.fill}
                      onChange={(event) => {
                        handleTextColourChange(event.target.value);
                      }}
                      className="h-12 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-1"
                    />
                  </label>

                  <SliderField
                    label="Opacity"
                    value={Math.round(numberOr(textSettings.opacity, 1) * 100)}
                    minimum={0}
                    maximum={100}
                    suffix="%"
                    onChange={(value) => {
                      updateTextSettings({
                        opacity: value / 100,
                      });
                    }}
                  />

                  <div>
                    <p className="mb-2 text-xs font-medium text-slate-300">
                      Horizontal alignment
                    </p>

                    <div className="grid grid-cols-4 gap-2">
                      {TEXT_ALIGN_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            updateTextSettings({
                              align: option.value,
                            });
                          }}
                          className={[
                            "min-h-10 rounded-lg border px-2 py-2 text-[10px] font-semibold transition",
                            textSettings.align === option.value
                              ? "border-violet-500 bg-violet-500 text-white"
                              : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800",
                          ].join(" ")}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-300">
                      Vertical alignment
                    </span>

                    <select
                      value={textSettings.verticalAlign}
                      onChange={(event) => {
                        updateTextSettings({
                          verticalAlign: event.target.value,
                        });
                      }}
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                    >
                      {TEXT_VERTICAL_ALIGN_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <SliderField
                    label="Line height"
                    value={numberOr(textSettings.lineHeight, 1.2)}
                    minimum={0.5}
                    maximum={4}
                    step={0.05}
                    suffix=""
                    onChange={(value) => {
                      updateTextSettings({
                        lineHeight: value,
                      });
                    }}
                  />

                  <SliderField
                    label="Letter spacing"
                    value={numberOr(textSettings.letterSpacing, 0)}
                    minimum={-10}
                    maximum={100}
                    step={0.5}
                    suffix="px"
                    onChange={(value) => {
                      updateTextSettings({
                        letterSpacing: value,
                      });
                    }}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-300">
                        Box width
                      </span>

                      <input
                        type="number"
                        min="20"
                        max="10000"
                        step="1"
                        value={textSettings.width}
                        onChange={(event) => {
                          updateTextSettings({
                            width: Math.max(
                              20,
                              Number(event.target.value) || 20,
                            ),
                          });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-300">
                        Box height
                      </span>

                      <input
                        type="number"
                        min="20"
                        max="10000"
                        step="1"
                        value={textSettings.height}
                        onChange={(event) => {
                          updateTextSettings({
                            height: Math.max(
                              20,
                              Number(event.target.value) || 20,
                            ),
                          });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-300">
                        Wrapping
                      </span>

                      <select
                        value={textSettings.wrap}
                        onChange={(event) => {
                          updateTextSettings({
                            wrap: event.target.value,
                          });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                      >
                        <option value="word">Word</option>

                        <option value="char">Character</option>

                        <option value="none">None</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-300">
                        Padding
                      </span>

                      <input
                        type="number"
                        min="0"
                        max="500"
                        step="1"
                        value={textSettings.padding}
                        onChange={(event) => {
                          updateTextSettings({
                            padding: Math.max(
                              0,
                              Number(event.target.value) || 0,
                            ),
                          });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                      />
                    </label>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium text-slate-300">
                      Quick colours
                    </p>

                    <div className="grid grid-cols-8 gap-2">
                      {DEFAULT_COLOURS.map((colour) => (
                        <button
                          key={`text-${colour}`}
                          type="button"
                          title={colour}
                          onClick={() => {
                            handleTextColourChange(colour);
                          }}
                          className={[
                            "aspect-square min-h-7 rounded-md border-2 transition hover:scale-110",
                            textSettings.fill === colour
                              ? "border-violet-400"
                              : "border-slate-700",
                          ].join(" ")}
                          style={{
                            background: colour,
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
                    <p className="text-xs font-semibold text-violet-100">
                      How to place text
                    </p>

                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                      Click the canvas to place a default text box, or drag to
                      create a custom-sized text box.
                    </p>
                  </div>
                </div>
              </PanelSection>
            )}

            {activeTool === EDITOR_TOOLS.IMAGE && (
              <PanelSection title="Image Tool">
                <div className="space-y-5">
                  <button
                    type="button"
                    disabled={
                      imageImporting ||
                      !activeLayer ||
                      activeLayer.locked ||
                      activeLayer.visible === false
                    }
                    onClick={() => {
                      handleChooseImage("place");
                    }}
                    className="min-h-12 w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {imageImporting ? "Loading image…" : "Choose Image"}
                  </button>

                  <SliderField
                    label="Import opacity"
                    value={Math.round(clamp(imageSettings.opacity, 0, 1) * 100)}
                    minimum={0}
                    maximum={100}
                    suffix="%"
                    onChange={(value) => {
                      updateImageSettings({
                        opacity: value / 100,
                      });
                    }}
                  />

                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
                    <p className="text-xs font-semibold text-violet-100">
                      Placement workflow
                    </p>

                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                      Choose an image here, then click the canvas to place it.
                      You can also click the canvas first and choose a file from
                      the picker.
                    </p>
                  </div>

                  <p className="text-[10px] leading-relaxed text-slate-500">
                    Supported formats: PNG, JPG, JPEG, WebP and SVG. Large
                    images are scaled to fit the document while keeping their
                    original proportions.
                  </p>
                </div>
              </PanelSection>
            )}

            {activeTool === EDITOR_TOOLS.PATTERN_MASK && (
              <PanelSection title="Pattern Mask">
                <div className="space-y-5">
                  <button
                    type="button"
                    disabled={patternImporting}
                    onClick={() => {
                      handleChoosePattern("mask");
                    }}
                    className="min-h-12 w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {patternImporting
                      ? "Loading fabric…"
                      : "Choose Fabric Texture"}
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={
                        patternImporting || selectedShapeObjects.length === 0
                      }
                      onClick={() => {
                        handleChoosePattern(
                          "mask-selection",
                          null,
                          selectedShapeObjects.map((object) => object.id),
                        );
                      }}
                      className="min-h-11 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Apply Selected
                    </button>

                    <button
                      type="button"
                      disabled={selectedMaskedShapeIds.length === 0}
                      onClick={() => {
                        const removedIds = removePatternMasksFromObjects(
                          selectedMaskedShapeIds,
                        );

                        if (removedIds.length > 0) {
                          showToast(
                            `Pattern removed from ${removedIds.length} shape${removedIds.length === 1 ? "" : "s"}.`,
                          );
                        }
                      }}
                      className="min-h-11 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Remove Selected
                    </button>
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-300">
                      Repeat mode
                    </span>

                    <select
                      value={resolvePatternRepeatMode(patternSettings)}
                      onChange={(event) => {
                        const repeat = event.target.value;

                        updatePatternSettings({
                          repeat,
                          repeatMode: repeat,
                          patternRepeat: repeat,
                        });
                      }}
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                    >
                      {PATTERN_REPEAT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <SliderField
                    label="Pattern scale"
                    value={Math.round(
                      clamp(patternSettings.scale, 0.02, 5) * 100,
                    )}
                    minimum={2}
                    maximum={500}
                    suffix="%"
                    onChange={(value) => {
                      const scale = value / 100;

                      updatePatternSettings({
                        scale,
                        scaleX: scale,
                        scaleY: scale,
                      });
                    }}
                  />

                  <SliderField
                    label="Rotation"
                    value={Math.round(numberOr(patternSettings.rotation, 0))}
                    minimum={0}
                    maximum={360}
                    suffix="°"
                    onChange={(value) => {
                      updatePatternSettings({
                        rotation: value,
                      });
                    }}
                  />

                  <SliderField
                    label="Opacity"
                    value={Math.round(
                      clamp(patternSettings.opacity, 0, 1) * 100,
                    )}
                    minimum={0}
                    maximum={100}
                    suffix="%"
                    onChange={(value) => {
                      updatePatternSettings({
                        opacity: value / 100,
                      });
                    }}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-300">
                        Offset X
                      </span>

                      <input
                        type="number"
                        step="1"
                        value={numberOr(patternSettings.offsetX, 0)}
                        onChange={(event) => {
                          updatePatternSettings({
                            offsetX: Number(event.target.value) || 0,
                          });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-300">
                        Offset Y
                      </span>

                      <input
                        type="number"
                        step="1"
                        value={numberOr(patternSettings.offsetY, 0)}
                        onChange={(event) => {
                          updatePatternSettings({
                            offsetY: Number(event.target.value) || 0,
                          });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                      />
                    </label>
                  </div>

                  <label className="flex min-h-11 items-center justify-between gap-4 text-xs text-slate-300">
                    Smooth fabric
                    <input
                      type="checkbox"
                      checked={patternSettings.imageSmoothingEnabled !== false}
                      onChange={(event) => {
                        updatePatternSettings({
                          imageSmoothingEnabled: event.target.checked,
                        });
                      }}
                      className="h-5 w-5 accent-violet-500"
                    />
                  </label>

                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
                    <p className="text-xs font-semibold text-violet-100">
                      Apply inside a closed shape
                    </p>

                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                      Choose a fabric, then click a rectangle, circle, ellipse,
                      triangle or polygon. Alt-click a patterned shape to remove
                      its texture.
                    </p>
                  </div>
                </div>
              </PanelSection>
            )}

            {activeTool === EDITOR_TOOLS.PATTERN && (
              <PanelSection title="Pattern Tool">
                <div className="space-y-5">
                  <button
                    type="button"
                    disabled={
                      patternImporting ||
                      !activeLayer ||
                      activeLayer.locked ||
                      activeLayer.visible === false
                    }
                    onClick={() => {
                      handleChoosePattern("place");
                    }}
                    className="min-h-12 w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {patternImporting ? "Loading pattern…" : "Choose Pattern"}
                  </button>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-300">
                      Repeat mode
                    </span>

                    <select
                      value={resolvePatternRepeatMode(patternSettings)}
                      onChange={(event) => {
                        const repeat = event.target.value;

                        updatePatternSettings({
                          repeat,
                          repeatMode: repeat,
                        });
                      }}
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                    >
                      {PATTERN_REPEAT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <SliderField
                    label="Scale"
                    value={Math.round(
                      clamp(patternSettings.scale, 0.02, 50) * 100,
                    )}
                    minimum={2}
                    maximum={500}
                    suffix="%"
                    onChange={(value) => {
                      const scale = value / 100;

                      updatePatternSettings({
                        scale,
                        scaleX: scale,
                        scaleY: scale,
                      });
                    }}
                  />

                  <SliderField
                    label="Rotation"
                    value={Math.round(numberOr(patternSettings.rotation, 0))}
                    minimum={0}
                    maximum={360}
                    suffix="°"
                    onChange={(value) => {
                      updatePatternSettings({
                        rotation: value,
                      });
                    }}
                  />

                  <SliderField
                    label="Opacity"
                    value={Math.round(
                      clamp(patternSettings.opacity, 0, 1) * 100,
                    )}
                    minimum={0}
                    maximum={100}
                    suffix="%"
                    onChange={(value) => {
                      updatePatternSettings({
                        opacity: value / 100,
                      });
                    }}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-300">
                        Offset X
                      </span>

                      <input
                        type="number"
                        step="1"
                        value={numberOr(patternSettings.offsetX, 0)}
                        onChange={(event) => {
                          updatePatternSettings({
                            offsetX: Number(event.target.value) || 0,
                          });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-300">
                        Offset Y
                      </span>

                      <input
                        type="number"
                        step="1"
                        value={numberOr(patternSettings.offsetY, 0)}
                        onChange={(event) => {
                          updatePatternSettings({
                            offsetY: Number(event.target.value) || 0,
                          });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
                      />
                    </label>
                  </div>

                  <label className="flex min-h-11 items-center justify-between gap-4 text-xs text-slate-300">
                    Smooth pattern
                    <input
                      type="checkbox"
                      checked={patternSettings.imageSmoothingEnabled !== false}
                      onChange={(event) => {
                        updatePatternSettings({
                          imageSmoothingEnabled: event.target.checked,
                        });
                      }}
                      className="h-5 w-5 accent-violet-500"
                    />
                  </label>

                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
                    <p className="text-xs font-semibold text-violet-100">
                      Placement workflow
                    </p>

                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                      Choose a texture, then drag on the canvas to create the
                      pattern area. Hold Shift for a square or Alt to draw from
                      the centre.
                    </p>
                  </div>

                  <p className="text-[10px] leading-relaxed text-slate-500">
                    Supported formats: PNG, JPG, JPEG and WebP.
                  </p>
                </div>
              </PanelSection>
            )}

            {activeTool === EDITOR_TOOLS.ERASER && (
              <PanelSection title="Eraser">
                <div className="space-y-5">
                  <SliderField
                    label="Size"
                    value={eraser.size}
                    minimum={eraser.minimumSize}
                    maximum={eraser.maximumSize}
                    suffix="px"
                    onChange={setEraserSize}
                  />

                  <div>
                    <p className="mb-2 text-xs font-medium text-slate-300">
                      Eraser mode
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEraserMode("stroke");
                        }}
                        className={[
                          "min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                          eraser.mode === "stroke"
                            ? "border-violet-500 bg-violet-500 text-white"
                            : "border-slate-700 bg-slate-900 text-slate-300",
                        ].join(" ")}
                      >
                        Stroke
                      </button>

                      <button
                        type="button"
                        disabled
                        title="Partial eraser will be added later"
                        className="min-h-11 cursor-not-allowed rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-600"
                      >
                        Partial
                      </button>
                    </div>

                    <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                      Stroke mode removes the complete vector stroke touched by
                      the eraser.
                    </p>
                  </div>
                </div>
              </PanelSection>
            )}

            {activeTool === EDITOR_TOOLS.SELECT && (
              <PanelSection title="Selection">
                {selectedObjects.length > 0 ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                      <p className="text-sm font-semibold text-white">
                        {selectedObjects.length} selected
                      </p>

                      <p className="mt-1 text-[10px] text-slate-500">
                        Drag to move. Use the handles to resize or rotate.
                      </p>
                    </div>

                    {selectedObjects.length === 1 && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-slate-900 p-3">
                          <span className="block text-[9px] uppercase tracking-wide text-slate-500">
                            X
                          </span>

                          <strong>
                            {Math.round(numberOr(selectedObjects[0].x))}
                          </strong>
                        </div>

                        <div className="rounded-lg bg-slate-900 p-3">
                          <span className="block text-[9px] uppercase tracking-wide text-slate-500">
                            Y
                          </span>

                          <strong>
                            {Math.round(numberOr(selectedObjects[0].y))}
                          </strong>
                        </div>

                        <div className="rounded-lg bg-slate-900 p-3">
                          <span className="block text-[9px] uppercase tracking-wide text-slate-500">
                            Rotation
                          </span>

                          <strong>
                            {Math.round(numberOr(selectedObjects[0].rotation))}°
                          </strong>
                        </div>

                        <div className="rounded-lg bg-slate-900 p-3">
                          <span className="block text-[9px] uppercase tracking-wide text-slate-500">
                            Type
                          </span>

                          <strong className="capitalize">
                            {selectedObjects[0].type}
                          </strong>
                        </div>
                      </div>
                    )}

                    {selectedImageObject && (
                      <div className="space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-100">
                              {selectedImageObject.fileName ||
                                selectedImageObject.name ||
                                "Imported image"}
                            </p>

                            <p className="mt-1 text-[9px] uppercase tracking-wide text-slate-500">
                              {Math.round(
                                numberOr(
                                  selectedImageObject.naturalWidth,
                                  selectedImageWidth,
                                ),
                              )}
                              ×
                              {Math.round(
                                numberOr(
                                  selectedImageObject.naturalHeight,
                                  selectedImageHeight,
                                ),
                              )}
                              px source
                            </p>
                          </div>

                          {selectedImageLocked && (
                            <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-300">
                              Locked
                            </span>
                          )}
                        </div>

                        {selectedClothingEditable && (
                          <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-violet-100">
                                  {selectedClothingTemplate.label} Design
                                </p>

                                <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                                  {selectedClothingTemplate.description ||
                                    "Edit each garment construction region independently."}
                                </p>
                              </div>

                              <span className="shrink-0 rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-violet-200">
                                {selectedClothingDualView
                                  ? "Front + Back"
                                  : "Editable"}
                              </span>
                            </div>

                            {selectedClothingDualView && (
                              <div className="mt-4 grid grid-cols-2 gap-2">
                                <div className="rounded-lg border border-slate-700/80 bg-slate-950/70 p-2">
                                  <span className="block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">
                                    Front View
                                  </span>

                                  <span className="mt-1 block text-xs font-semibold text-slate-200">
                                    {selectedClothingRegionsByView.front.length}{" "}
                                    editable regions
                                  </span>
                                </div>

                                <div className="rounded-lg border border-slate-700/80 bg-slate-950/70 p-2">
                                  <span className="block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">
                                    Back View
                                  </span>

                                  <span className="mt-1 block text-xs font-semibold text-slate-200">
                                    {selectedClothingRegionsByView.back.length}{" "}
                                    editable regions
                                  </span>
                                </div>
                              </div>
                            )}

                            {selectedClothingDualView && (
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  disabled={
                                    selectedImageLocked ||
                                    selectedClothingRegionsByView.front
                                      .length === 0
                                  }
                                  onClick={() => {
                                    handleApplyPrimaryToSelectedClothingView(
                                      "front",
                                    );
                                  }}
                                  className="min-h-10 rounded-lg border border-violet-500/40 bg-violet-500/10 px-2 py-2 text-[10px] font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Primary → Front
                                </button>

                                <button
                                  type="button"
                                  disabled={
                                    selectedImageLocked ||
                                    selectedClothingRegionsByView.back
                                      .length === 0
                                  }
                                  onClick={() => {
                                    handleApplyPrimaryToSelectedClothingView(
                                      "back",
                                    );
                                  }}
                                  className="min-h-10 rounded-lg border border-violet-500/40 bg-violet-500/10 px-2 py-2 text-[10px] font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Primary → Back
                                </button>

                                <button
                                  type="button"
                                  disabled={
                                    selectedImageLocked ||
                                    selectedClothingPairedRegionCount === 0
                                  }
                                  onClick={() => {
                                    handleCopySelectedClothingView(
                                      "front",
                                      "back",
                                    );
                                  }}
                                  className="min-h-10 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-[10px] font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Copy Front → Back
                                </button>

                                <button
                                  type="button"
                                  disabled={
                                    selectedImageLocked ||
                                    selectedClothingPairedRegionCount === 0
                                  }
                                  onClick={() => {
                                    handleCopySelectedClothingView(
                                      "back",
                                      "front",
                                    );
                                  }}
                                  className="min-h-10 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-[10px] font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Copy Back → Front
                                </button>
                              </div>
                            )}

                            {["front", "back", "other"].map((view) => {
                              const viewRegions =
                                selectedClothingRegionsByView[view] || [];

                              if (viewRegions.length === 0) {
                                return null;
                              }

                              return (
                                <div
                                  key={view}
                                  className="mt-4 rounded-xl border border-slate-700/70 bg-slate-950/50 p-3"
                                >
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                                      {CLOTHING_VIEW_LABELS[view] || "Other"}{" "}
                                      Regions
                                    </p>

                                    <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[8px] font-bold text-slate-500">
                                      {viewRegions.length}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    {viewRegions.map((region) => {
                                      const regionColour =
                                        selectedClothingColours[region.id] ||
                                        "#ffffff";

                                      return (
                                        <label
                                          key={region.id}
                                          className="block rounded-lg border border-slate-700/80 bg-slate-900/80 p-2"
                                        >
                                          <span className="mb-2 block min-h-[24px] text-[10px] font-semibold leading-tight text-slate-300">
                                            {region.label}
                                          </span>

                                          <div className="flex items-center gap-2">
                                            <input
                                              type="color"
                                              value={regionColour}
                                              disabled={selectedImageLocked}
                                              onChange={(event) => {
                                                handleSelectedClothingColourChange(
                                                  region.id,
                                                  event.target.value,
                                                );
                                              }}
                                              className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-slate-700 bg-slate-950 p-1 disabled:cursor-not-allowed disabled:opacity-50"
                                            />

                                            <span className="min-w-0 truncate font-mono text-[8px] uppercase text-slate-500">
                                              {regionColour}
                                            </span>
                                          </div>

                                          {region.group && (
                                            <span className="mt-2 block truncate text-[8px] font-semibold uppercase tracking-wide text-slate-600">
                                              {getClothingGroupLabel(
                                                region.group,
                                              )}
                                            </span>
                                          )}
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}

                            {selectedClothingRegionGroups.length > 0 && (
                              <div className="mt-4">
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                                  Match Construction Parts
                                </p>

                                <div className="grid grid-cols-2 gap-2">
                                  {selectedClothingRegionGroups.map((group) => (
                                    <button
                                      key={group.id}
                                      type="button"
                                      disabled={selectedImageLocked}
                                      onClick={() => {
                                        handleMatchSelectedClothingGroup(
                                          group.id,
                                        );
                                      }}
                                      className="min-h-10 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-[10px] font-semibold text-slate-300 transition hover:border-violet-500 hover:bg-violet-500/10 hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      Match {group.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            <button
                              type="button"
                              disabled={selectedImageLocked}
                              onClick={handleResetSelectedClothingColours}
                              className="mt-4 min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[10px] font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Reset All Garment Colours
                            </button>

                            {selectedClothingArtworkEditable && (
                              <div className="mt-5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-semibold text-cyan-100">
                                      Region Artwork
                                    </p>

                                    <p className="mt-1 text-[9px] leading-relaxed text-slate-400">
                                      Add a logo, graphic or repeating fabric
                                      pattern. Artwork is clipped to the
                                      selected garment construction region.
                                    </p>
                                  </div>

                                  <span className="shrink-0 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-cyan-200">
                                    Clipped
                                  </span>
                                </div>

                                <label className="mt-4 block">
                                  <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                    Artwork Region
                                  </span>

                                  <select
                                    value={selectedClothingArtworkRegionId}
                                    disabled={
                                      selectedImageLocked ||
                                      selectedClothingArtworkRegions.length ===
                                        0
                                    }
                                    onChange={(event) => {
                                      setClothingArtworkRegionId(
                                        event.target.value,
                                      );
                                    }}
                                    className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {selectedClothingArtworkRegions.map(
                                      (region) => (
                                        <option
                                          key={region.id}
                                          value={region.id}
                                        >
                                          {CLOTHING_VIEW_LABELS[
                                            getClothingRegionView(region)
                                          ] || "Other"}{" "}
                                          — {region.label}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                </label>

                                {selectedClothingArtworkRegion && (
                                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-700/70 bg-slate-950/70 p-2.5">
                                    <div className="min-w-0">
                                      <span className="block truncate text-[10px] font-semibold text-slate-200">
                                        {selectedClothingArtworkRegion.label}
                                      </span>

                                      <span className="mt-0.5 block text-[8px] font-bold uppercase tracking-wide text-slate-500">
                                        {getClothingGroupLabel(
                                          selectedClothingArtworkRegion.group,
                                        )}
                                      </span>
                                    </div>

                                    <span
                                      className={[
                                        "shrink-0 rounded-full border px-2 py-1 text-[8px] font-bold uppercase tracking-wide",
                                        selectedClothingArtworkEntry
                                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                          : "border-slate-700 bg-slate-900 text-slate-500",
                                      ].join(" ")}
                                    >
                                      {selectedClothingArtworkEntry
                                        ? CLOTHING_ARTWORK_TYPE_LABELS[
                                            selectedClothingArtworkEntry.type
                                          ] || "Artwork"
                                        : "Empty"}
                                    </span>
                                  </div>
                                )}

                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    disabled={
                                      selectedImageLocked ||
                                      clothingArtworkImporting ||
                                      !selectedClothingArtworkRegionId
                                    }
                                    onClick={() => {
                                      handleChooseClothingArtwork(
                                        CLOTHING_ARTWORK_TYPES.IMAGE,
                                      );
                                    }}
                                    className="min-h-11 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {clothingArtworkImporting
                                      ? "Loading…"
                                      : selectedClothingArtworkEntry?.type ===
                                          CLOTHING_ARTWORK_TYPES.IMAGE
                                        ? "Replace Graphic"
                                        : "Add Graphic"}
                                  </button>

                                  <button
                                    type="button"
                                    disabled={
                                      selectedImageLocked ||
                                      clothingArtworkImporting ||
                                      !selectedClothingArtworkRegionId
                                    }
                                    onClick={() => {
                                      handleChooseClothingArtwork(
                                        CLOTHING_ARTWORK_TYPES.PATTERN,
                                      );
                                    }}
                                    className="min-h-11 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {clothingArtworkImporting
                                      ? "Loading…"
                                      : selectedClothingArtworkEntry?.type ===
                                          CLOTHING_ARTWORK_TYPES.PATTERN
                                        ? "Replace Pattern"
                                        : "Add Pattern"}
                                  </button>
                                </div>

                                {selectedClothingArtworkEntry && (
                                  <div className="mt-4 space-y-4">
                                    <div className="overflow-hidden rounded-lg border border-slate-700 bg-white p-2">
                                      <div className="flex h-28 items-center justify-center overflow-hidden rounded-md bg-slate-100">
                                        <img
                                          src={
                                            selectedClothingArtworkEntry.source
                                          }
                                          alt={`${selectedClothingArtworkRegion?.label || "Garment"} artwork`}
                                          className="h-full w-full object-contain"
                                          draggable={false}
                                        />
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                      <button
                                        type="button"
                                        aria-pressed={
                                          selectedClothingArtworkEntry.type ===
                                          CLOTHING_ARTWORK_TYPES.IMAGE
                                        }
                                        disabled={selectedImageLocked}
                                        onClick={() => {
                                          handleSelectedClothingArtworkSettingChange(
                                            "type",
                                            CLOTHING_ARTWORK_TYPES.IMAGE,
                                          );
                                        }}
                                        className={[
                                          "min-h-10 rounded-lg border px-2 py-2 text-[10px] font-semibold transition",
                                          selectedClothingArtworkEntry.type ===
                                          CLOTHING_ARTWORK_TYPES.IMAGE
                                            ? "border-cyan-500 bg-cyan-500/20 text-cyan-100"
                                            : "border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-500",
                                        ].join(" ")}
                                      >
                                        Single Graphic
                                      </button>

                                      <button
                                        type="button"
                                        aria-pressed={
                                          selectedClothingArtworkEntry.type ===
                                          CLOTHING_ARTWORK_TYPES.PATTERN
                                        }
                                        disabled={selectedImageLocked}
                                        onClick={() => {
                                          handleSelectedClothingArtworkSettingChange(
                                            "type",
                                            CLOTHING_ARTWORK_TYPES.PATTERN,
                                          );
                                        }}
                                        className={[
                                          "min-h-10 rounded-lg border px-2 py-2 text-[10px] font-semibold transition",
                                          selectedClothingArtworkEntry.type ===
                                          CLOTHING_ARTWORK_TYPES.PATTERN
                                            ? "border-cyan-500 bg-cyan-500/20 text-cyan-100"
                                            : "border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-500",
                                        ].join(" ")}
                                      >
                                        Repeat Pattern
                                      </button>
                                    </div>

                                    <label className="block">
                                      <span className="mb-2 block text-[10px] font-semibold text-slate-300">
                                        Fit inside region
                                      </span>

                                      <select
                                        value={
                                          selectedClothingArtworkEntry.fit ||
                                          "contain"
                                        }
                                        disabled={selectedImageLocked}
                                        onChange={(event) => {
                                          handleSelectedClothingArtworkSettingChange(
                                            "fit",
                                            event.target.value,
                                          );
                                        }}
                                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {CLOTHING_ARTWORK_FIT_OPTIONS.map(
                                          (option) => (
                                            <option
                                              key={option.value}
                                              value={option.value}
                                            >
                                              {option.label}
                                            </option>
                                          ),
                                        )}
                                      </select>
                                    </label>

                                    <SliderField
                                      label={
                                        selectedClothingArtworkEntry.type ===
                                        CLOTHING_ARTWORK_TYPES.PATTERN
                                          ? "Pattern Scale"
                                          : "Graphic Scale"
                                      }
                                      value={Math.round(
                                        clamp(
                                          selectedClothingArtworkEntry.scale,
                                          0.05,
                                          12,
                                        ) * 100,
                                      )}
                                      minimum={5}
                                      maximum={600}
                                      suffix="%"
                                      disabled={selectedImageLocked}
                                      onStart={() => {
                                        beginHistoryTransaction(
                                          "Scale garment artwork",
                                        );
                                      }}
                                      onEnd={() => {
                                        commitHistoryTransaction();
                                      }}
                                      onChange={(value) => {
                                        handleSelectedClothingArtworkSettingChange(
                                          "scale",
                                          value / 100,
                                        );
                                      }}
                                    />

                                    <SliderField
                                      label="Rotation"
                                      value={Math.round(
                                        numberOr(
                                          selectedClothingArtworkEntry.rotation,
                                          0,
                                        ),
                                      )}
                                      minimum={-180}
                                      maximum={180}
                                      suffix="°"
                                      disabled={selectedImageLocked}
                                      onStart={() => {
                                        beginHistoryTransaction(
                                          "Rotate garment artwork",
                                        );
                                      }}
                                      onEnd={() => {
                                        commitHistoryTransaction();
                                      }}
                                      onChange={(value) => {
                                        handleSelectedClothingArtworkSettingChange(
                                          "rotation",
                                          value,
                                        );
                                      }}
                                    />

                                    <SliderField
                                      label="Opacity"
                                      value={Math.round(
                                        clamp(
                                          selectedClothingArtworkEntry.opacity,
                                          0,
                                          1,
                                        ) * 100,
                                      )}
                                      minimum={0}
                                      maximum={100}
                                      suffix="%"
                                      disabled={selectedImageLocked}
                                      onStart={() => {
                                        beginHistoryTransaction(
                                          "Change garment artwork opacity",
                                        );
                                      }}
                                      onEnd={() => {
                                        commitHistoryTransaction();
                                      }}
                                      onChange={(value) => {
                                        handleSelectedClothingArtworkSettingChange(
                                          "opacity",
                                          value / 100,
                                        );
                                      }}
                                    />

                                    <div className="grid grid-cols-2 gap-3">
                                      <label className="block">
                                        <span className="mb-2 block text-[10px] font-semibold text-slate-300">
                                          Position X
                                        </span>

                                        <input
                                          type="number"
                                          step="1"
                                          min="-2000"
                                          max="2000"
                                          value={Math.round(
                                            numberOr(
                                              selectedClothingArtworkEntry.offsetX,
                                              0,
                                            ),
                                          )}
                                          disabled={selectedImageLocked}
                                          onChange={(event) => {
                                            handleSelectedClothingArtworkSettingChange(
                                              "offsetX",
                                              Number(event.target.value) || 0,
                                            );
                                          }}
                                          className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                                        />
                                      </label>

                                      <label className="block">
                                        <span className="mb-2 block text-[10px] font-semibold text-slate-300">
                                          Position Y
                                        </span>

                                        <input
                                          type="number"
                                          step="1"
                                          min="-2000"
                                          max="2000"
                                          value={Math.round(
                                            numberOr(
                                              selectedClothingArtworkEntry.offsetY,
                                              0,
                                            ),
                                          )}
                                          disabled={selectedImageLocked}
                                          onChange={(event) => {
                                            handleSelectedClothingArtworkSettingChange(
                                              "offsetY",
                                              Number(event.target.value) || 0,
                                            );
                                          }}
                                          className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                                        />
                                      </label>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                      <button
                                        type="button"
                                        disabled={selectedImageLocked}
                                        onClick={
                                          handleResetSelectedClothingArtworkTransform
                                        }
                                        className="min-h-10 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-[10px] font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                                      >
                                        Reset Placement
                                      </button>

                                      <button
                                        type="button"
                                        disabled={
                                          selectedImageLocked ||
                                          !selectedClothingArtworkPairedRegionId
                                        }
                                        onClick={
                                          handleCopySelectedClothingArtworkToPairedRegion
                                        }
                                        className="min-h-10 rounded-lg border border-violet-500/40 bg-violet-500/10 px-2 py-2 text-[10px] font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                      >
                                        Copy to Paired Side
                                      </button>
                                    </div>

                                    <button
                                      type="button"
                                      disabled={selectedImageLocked}
                                      onClick={
                                        handleRemoveSelectedClothingArtwork
                                      }
                                      className="min-h-10 w-full rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[10px] font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      Remove Artwork From Region
                                    </button>
                                  </div>
                                )}

                                {!selectedClothingArtworkEntry && (
                                  <p className="mt-3 rounded-lg border border-slate-700/70 bg-slate-950/60 p-2.5 text-[9px] leading-relaxed text-slate-500">
                                    This region has no artwork yet. Add a
                                    graphic for logos/prints, or add a pattern
                                    for repeating fabric-style artwork.
                                  </p>
                                )}
                              </div>
                            )}

                            <p className="mt-3 text-[9px] leading-relaxed text-slate-500">
                              Front and back stay inside one movable image
                              object. Colour and region-artwork changes
                              regenerate the SVG only, so the garment keeps its
                              position, size, rotation, layer, cloud save state
                              and export behaviour.
                            </p>
                          </div>
                        )}

                        <label className="block">
                          <span className="mb-2 block text-xs font-medium text-slate-300">
                            Image fit
                          </span>

                          <select
                            value={selectedImageFit}
                            disabled={selectedImageLocked}
                            onChange={(event) => {
                              handleSelectedImageFitChange(event.target.value);
                            }}
                            className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {IMAGE_FIT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <SliderField
                          label="Opacity"
                          value={selectedImageOpacity}
                          minimum={0}
                          maximum={100}
                          suffix="%"
                          disabled={selectedImageLocked}
                          onStart={() => {
                            beginHistoryTransaction("Change image opacity");
                          }}
                          onEnd={() => {
                            commitHistoryTransaction();
                          }}
                          onChange={(value) => {
                            const opacity = value / 100;

                            updateSelectedImage(
                              {
                                opacity,

                                style: {
                                  opacity,
                                },
                              },
                              "Change image opacity",
                            );
                          }}
                        />

                        <SliderField
                          label="Corner radius"
                          value={Math.round(selectedImageCornerRadius)}
                          minimum={0}
                          maximum={Math.max(
                            0,
                            Math.round(
                              Math.min(
                                selectedImageWidth,
                                selectedImageHeight,
                              ) / 2,
                            ),
                          )}
                          suffix="px"
                          disabled={selectedImageLocked}
                          onStart={() => {
                            beginHistoryTransaction(
                              "Change image corner radius",
                            );
                          }}
                          onEnd={() => {
                            commitHistoryTransaction();
                          }}
                          onChange={(value) => {
                            updateSelectedImage(
                              {
                                cornerRadius: value,

                                style: {
                                  cornerRadius: value,
                                },
                              },
                              "Change image corner radius",
                            );
                          }}
                        />

                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <span className="mb-2 block text-xs font-medium text-slate-300">
                              Width
                            </span>

                            <input
                              type="number"
                              min="1"
                              max="100000"
                              step="1"
                              value={Math.round(selectedImageWidth)}
                              disabled={selectedImageLocked}
                              onChange={(event) => {
                                handleSelectedImageDimensionChange(
                                  "width",
                                  Number(event.target.value),
                                );
                              }}
                              className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-2 block text-xs font-medium text-slate-300">
                              Height
                            </span>

                            <input
                              type="number"
                              min="1"
                              max="100000"
                              step="1"
                              value={Math.round(selectedImageHeight)}
                              disabled={selectedImageLocked}
                              onChange={(event) => {
                                handleSelectedImageDimensionChange(
                                  "height",
                                  Number(event.target.value),
                                );
                              }}
                              className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </label>
                        </div>

                        <label className="flex min-h-11 items-center justify-between gap-4 text-xs text-slate-300">
                          Smooth image
                          <input
                            type="checkbox"
                            checked={selectedImageSmoothing}
                            disabled={selectedImageLocked}
                            onChange={(event) => {
                              const enabled = event.target.checked;

                              updateSelectedImage(
                                {
                                  imageSmoothingEnabled: enabled,

                                  style: {
                                    imageSmoothingEnabled: enabled,
                                  },
                                },
                                "Change image smoothing",
                              );
                            }}
                            className="h-5 w-5 accent-violet-500 disabled:cursor-not-allowed"
                          />
                        </label>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={selectedImageLocked || imageImporting}
                            onClick={() => {
                              handleChooseImage(
                                "replace",
                                selectedImageObject.id,
                              );
                            }}
                            className="min-h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Replace
                          </button>

                          <button
                            type="button"
                            disabled={selectedImageLocked}
                            onClick={handleResetSelectedImageSize}
                            className="min-h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Original Size
                          </button>

                          <button
                            type="button"
                            disabled={selectedImageLocked}
                            onClick={handleFitSelectedImageToDocument}
                            className="col-span-2 min-h-11 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Fit to Document
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedPatternMaskShape && (
                      <div className="space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-100">
                              {selectedPatternMaskShape.name ||
                                "Selected shape"}
                            </p>

                            <p className="mt-1 text-[9px] uppercase tracking-wide text-slate-500">
                              Shape pattern mask
                            </p>
                          </div>

                          <span
                            className={[
                              "shrink-0 rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-wide",
                              selectedPatternMaskLocked
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                : selectedPatternMaskActive
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                  : "border-slate-700 bg-slate-950 text-slate-400",
                            ].join(" ")}
                          >
                            {selectedPatternMaskLocked
                              ? "Locked"
                              : selectedPatternMaskActive
                                ? "Active"
                                : "No Pattern"}
                          </span>
                        </div>

                        {!selectedPatternMaskActive ? (
                          <button
                            type="button"
                            disabled={
                              selectedPatternMaskLocked || patternImporting
                            }
                            onClick={() => {
                              handleChoosePattern("mask-selection", null, [
                                selectedPatternMaskShape.id,
                              ]);
                            }}
                            className="min-h-11 w-full rounded-lg bg-violet-500 px-3 py-2 text-xs font-bold text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Apply Fabric Texture
                          </button>
                        ) : (
                          <>
                            <label className="block">
                              <span className="mb-2 block text-xs font-medium text-slate-300">
                                Repeat mode
                              </span>

                              <select
                                value={selectedPatternMaskRepeat}
                                disabled={selectedPatternMaskLocked}
                                onChange={(event) => {
                                  const repeat = event.target.value;

                                  updateSelectedPatternMask(
                                    {
                                      repeat,
                                      repeatMode: repeat,
                                      patternRepeat: repeat,

                                      style: {
                                        repeat,
                                        repeatMode: repeat,
                                        patternRepeat: repeat,
                                      },
                                    },
                                    "Change shape pattern repeat",
                                  );
                                }}
                                className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {PATTERN_REPEAT_OPTIONS.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <SliderField
                              label="Opacity"
                              value={selectedPatternMaskOpacity}
                              minimum={0}
                              maximum={100}
                              suffix="%"
                              disabled={selectedPatternMaskLocked}
                              onStart={() => {
                                beginHistoryTransaction(
                                  "Change shape pattern opacity",
                                );
                              }}
                              onEnd={() => {
                                commitHistoryTransaction();
                              }}
                              onChange={(value) => {
                                const opacity = value / 100;

                                updateSelectedPatternMask(
                                  {
                                    patternOpacity: opacity,
                                    fillOpacity: opacity,

                                    style: {
                                      patternOpacity: opacity,
                                      fillOpacity: opacity,
                                    },
                                  },
                                  "Change shape pattern opacity",
                                );
                              }}
                            />

                            <SliderField
                              label="Scale X"
                              value={Math.round(
                                selectedPatternMaskScaleX * 100,
                              )}
                              minimum={2}
                              maximum={500}
                              suffix="%"
                              disabled={selectedPatternMaskLocked}
                              onChange={(value) => {
                                const scaleX = value / 100;

                                updateSelectedPatternMask(
                                  {
                                    patternScaleX: scaleX,

                                    style: {
                                      patternScaleX: scaleX,
                                    },
                                  },
                                  "Change shape pattern scale",
                                );
                              }}
                            />

                            <SliderField
                              label="Scale Y"
                              value={Math.round(
                                selectedPatternMaskScaleY * 100,
                              )}
                              minimum={2}
                              maximum={500}
                              suffix="%"
                              disabled={selectedPatternMaskLocked}
                              onChange={(value) => {
                                const scaleY = value / 100;

                                updateSelectedPatternMask(
                                  {
                                    patternScaleY: scaleY,

                                    style: {
                                      patternScaleY: scaleY,
                                    },
                                  },
                                  "Change shape pattern scale",
                                );
                              }}
                            />

                            <SliderField
                              label="Rotation"
                              value={selectedPatternMaskRotation}
                              minimum={0}
                              maximum={360}
                              suffix="°"
                              disabled={selectedPatternMaskLocked}
                              onChange={(value) => {
                                updateSelectedPatternMask(
                                  {
                                    patternRotation: value,

                                    style: {
                                      patternRotation: value,
                                    },
                                  },
                                  "Rotate shape pattern",
                                );
                              }}
                            />

                            <div className="grid grid-cols-2 gap-3">
                              <label className="block">
                                <span className="mb-2 block text-xs font-medium text-slate-300">
                                  Offset X
                                </span>

                                <input
                                  type="number"
                                  step="1"
                                  value={selectedPatternMaskOffsetX}
                                  disabled={selectedPatternMaskLocked}
                                  onChange={(event) => {
                                    const value =
                                      Number(event.target.value) || 0;

                                    updateSelectedPatternMask(
                                      {
                                        patternOffsetX: value,

                                        style: {
                                          patternOffsetX: value,
                                        },
                                      },
                                      "Move shape pattern",
                                    );
                                  }}
                                  className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                              </label>

                              <label className="block">
                                <span className="mb-2 block text-xs font-medium text-slate-300">
                                  Offset Y
                                </span>

                                <input
                                  type="number"
                                  step="1"
                                  value={selectedPatternMaskOffsetY}
                                  disabled={selectedPatternMaskLocked}
                                  onChange={(event) => {
                                    const value =
                                      Number(event.target.value) || 0;

                                    updateSelectedPatternMask(
                                      {
                                        patternOffsetY: value,

                                        style: {
                                          patternOffsetY: value,
                                        },
                                      },
                                      "Move shape pattern",
                                    );
                                  }}
                                  className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                              </label>
                            </div>

                            <label className="flex min-h-11 items-center justify-between gap-4 text-xs text-slate-300">
                              Smooth fabric
                              <input
                                type="checkbox"
                                checked={selectedPatternMaskSmoothing}
                                disabled={selectedPatternMaskLocked}
                                onChange={(event) => {
                                  const enabled = event.target.checked;

                                  updateSelectedPatternMask(
                                    {
                                      imageSmoothingEnabled: enabled,

                                      style: {
                                        imageSmoothingEnabled: enabled,
                                      },
                                    },
                                    "Change shape pattern smoothing",
                                  );
                                }}
                                className="h-5 w-5 accent-violet-500 disabled:cursor-not-allowed"
                              />
                            </label>

                            <label className="flex min-h-11 items-center justify-between gap-4 text-xs text-slate-300">
                              Transparent background
                              <input
                                type="checkbox"
                                checked={
                                  selectedPatternMaskBackground ===
                                  "transparent"
                                }
                                disabled={selectedPatternMaskLocked}
                                onChange={(event) => {
                                  const background = event.target.checked
                                    ? "transparent"
                                    : "#ffffff";

                                  updateSelectedPatternMask(
                                    {
                                      patternBackground: background,

                                      style: {
                                        patternBackground: background,
                                      },
                                    },
                                    "Change shape pattern background",
                                  );
                                }}
                                className="h-5 w-5 accent-violet-500 disabled:cursor-not-allowed"
                              />
                            </label>

                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                disabled={
                                  selectedPatternMaskLocked || patternImporting
                                }
                                onClick={() => {
                                  handleChoosePattern("mask-selection", null, [
                                    selectedPatternMaskShape.id,
                                  ]);
                                }}
                                className="min-h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Replace Fabric
                              </button>

                              <button
                                type="button"
                                disabled={selectedPatternMaskLocked}
                                onClick={() => {
                                  const removedIds =
                                    removePatternMasksFromObjects([
                                      selectedPatternMaskShape.id,
                                    ]);

                                  if (removedIds.length > 0) {
                                    showToast("Pattern removed from shape.");
                                  }
                                }}
                                className="min-h-11 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Remove Pattern
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {selectedPatternObject && (
                      <div className="space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-100">
                              {selectedPatternObject.fileName ||
                                selectedPatternObject.name ||
                                "Imported pattern"}
                            </p>

                            <p className="mt-1 text-[9px] uppercase tracking-wide text-slate-500">
                              Pattern texture
                            </p>
                          </div>

                          {selectedPatternLocked && (
                            <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-300">
                              Locked
                            </span>
                          )}
                        </div>

                        <label className="block">
                          <span className="mb-2 block text-xs font-medium text-slate-300">
                            Repeat mode
                          </span>

                          <select
                            value={selectedPatternRepeat}
                            disabled={selectedPatternLocked}
                            onChange={(event) => {
                              handleSelectedPatternRepeatChange(
                                event.target.value,
                              );
                            }}
                            className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {PATTERN_REPEAT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <SliderField
                          label="Opacity"
                          value={selectedPatternOpacity}
                          minimum={0}
                          maximum={100}
                          suffix="%"
                          disabled={selectedPatternLocked}
                          onStart={() => {
                            beginHistoryTransaction("Change pattern opacity");
                          }}
                          onEnd={() => {
                            commitHistoryTransaction();
                          }}
                          onChange={(value) => {
                            const opacity = value / 100;

                            updateSelectedPattern(
                              {
                                opacity,

                                patternOpacity: opacity,

                                style: {
                                  opacity,

                                  patternOpacity: opacity,
                                },
                              },
                              "Change pattern opacity",
                            );
                          }}
                        />

                        <SliderField
                          label="Scale X"
                          value={Math.round(selectedPatternScaleX * 100)}
                          minimum={2}
                          maximum={500}
                          suffix="%"
                          disabled={selectedPatternLocked}
                          onStart={() => {
                            beginHistoryTransaction("Change pattern scale");
                          }}
                          onEnd={() => {
                            commitHistoryTransaction();
                          }}
                          onChange={(value) => {
                            const scaleX = value / 100;

                            updateSelectedPattern(
                              {
                                patternScaleX: scaleX,

                                tileWidth:
                                  numberOr(
                                    selectedPatternObject.naturalWidth,
                                    128,
                                  ) * scaleX,

                                style: {
                                  patternScaleX: scaleX,

                                  tileWidth:
                                    numberOr(
                                      selectedPatternObject.naturalWidth,
                                      128,
                                    ) * scaleX,
                                },
                              },
                              "Change pattern scale",
                            );
                          }}
                        />

                        <SliderField
                          label="Scale Y"
                          value={Math.round(selectedPatternScaleY * 100)}
                          minimum={2}
                          maximum={500}
                          suffix="%"
                          disabled={selectedPatternLocked}
                          onStart={() => {
                            beginHistoryTransaction("Change pattern scale");
                          }}
                          onEnd={() => {
                            commitHistoryTransaction();
                          }}
                          onChange={(value) => {
                            const scaleY = value / 100;

                            updateSelectedPattern(
                              {
                                patternScaleY: scaleY,

                                tileHeight:
                                  numberOr(
                                    selectedPatternObject.naturalHeight,
                                    128,
                                  ) * scaleY,

                                style: {
                                  patternScaleY: scaleY,

                                  tileHeight:
                                    numberOr(
                                      selectedPatternObject.naturalHeight,
                                      128,
                                    ) * scaleY,
                                },
                              },
                              "Change pattern scale",
                            );
                          }}
                        />

                        <SliderField
                          label="Pattern rotation"
                          value={selectedPatternRotation}
                          minimum={0}
                          maximum={360}
                          suffix="°"
                          disabled={selectedPatternLocked}
                          onStart={() => {
                            beginHistoryTransaction("Rotate pattern");
                          }}
                          onEnd={() => {
                            commitHistoryTransaction();
                          }}
                          onChange={(value) => {
                            updateSelectedPattern(
                              {
                                patternRotation: value,

                                style: {
                                  patternRotation: value,
                                },
                              },
                              "Rotate pattern",
                            );
                          }}
                        />

                        <SliderField
                          label="Corner radius"
                          value={Math.round(selectedPatternCornerRadius)}
                          minimum={0}
                          maximum={Math.max(
                            0,
                            Math.round(
                              Math.min(
                                selectedPatternWidth,
                                selectedPatternHeight,
                              ) / 2,
                            ),
                          )}
                          suffix="px"
                          disabled={selectedPatternLocked}
                          onStart={() => {
                            beginHistoryTransaction(
                              "Change pattern corner radius",
                            );
                          }}
                          onEnd={() => {
                            commitHistoryTransaction();
                          }}
                          onChange={(value) => {
                            updateSelectedPattern(
                              {
                                cornerRadius: value,

                                style: {
                                  cornerRadius: value,
                                },
                              },
                              "Change pattern corner radius",
                            );
                          }}
                        />

                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <span className="mb-2 block text-xs font-medium text-slate-300">
                              Width
                            </span>

                            <input
                              type="number"
                              min="1"
                              max="100000"
                              step="1"
                              value={Math.round(selectedPatternWidth)}
                              disabled={selectedPatternLocked}
                              onChange={(event) => {
                                handleSelectedPatternDimensionChange(
                                  "width",
                                  Number(event.target.value),
                                );
                              }}
                              className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-2 block text-xs font-medium text-slate-300">
                              Height
                            </span>

                            <input
                              type="number"
                              min="1"
                              max="100000"
                              step="1"
                              value={Math.round(selectedPatternHeight)}
                              disabled={selectedPatternLocked}
                              onChange={(event) => {
                                handleSelectedPatternDimensionChange(
                                  "height",
                                  Number(event.target.value),
                                );
                              }}
                              className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <span className="mb-2 block text-xs font-medium text-slate-300">
                              Offset X
                            </span>

                            <input
                              type="number"
                              step="1"
                              value={selectedPatternOffsetX}
                              disabled={selectedPatternLocked}
                              onChange={(event) => {
                                const value = Number(event.target.value) || 0;

                                updateSelectedPattern(
                                  {
                                    patternOffsetX: value,

                                    style: {
                                      patternOffsetX: value,
                                    },
                                  },
                                  "Move pattern texture",
                                );
                              }}
                              className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-2 block text-xs font-medium text-slate-300">
                              Offset Y
                            </span>

                            <input
                              type="number"
                              step="1"
                              value={selectedPatternOffsetY}
                              disabled={selectedPatternLocked}
                              onChange={(event) => {
                                const value = Number(event.target.value) || 0;

                                updateSelectedPattern(
                                  {
                                    patternOffsetY: value,

                                    style: {
                                      patternOffsetY: value,
                                    },
                                  },
                                  "Move pattern texture",
                                );
                              }}
                              className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </label>
                        </div>

                        <label className="flex min-h-11 items-center justify-between gap-4 text-xs text-slate-300">
                          Smooth pattern
                          <input
                            type="checkbox"
                            checked={selectedPatternSmoothing}
                            disabled={selectedPatternLocked}
                            onChange={(event) => {
                              const enabled = event.target.checked;

                              updateSelectedPattern(
                                {
                                  imageSmoothingEnabled: enabled,

                                  style: {
                                    imageSmoothingEnabled: enabled,
                                  },
                                },
                                "Change pattern smoothing",
                              );
                            }}
                            className="h-5 w-5 accent-violet-500 disabled:cursor-not-allowed"
                          />
                        </label>

                        <label className="flex min-h-11 items-center justify-between gap-4 text-xs text-slate-300">
                          Transparent background
                          <input
                            type="checkbox"
                            checked={
                              selectedPatternBackground === "transparent"
                            }
                            disabled={selectedPatternLocked}
                            onChange={(event) => {
                              const background = event.target.checked
                                ? "transparent"
                                : "#ffffff";

                              updateSelectedPattern(
                                {
                                  background,

                                  style: {
                                    background,
                                  },
                                },
                                "Change pattern background",
                              );
                            }}
                            className="h-5 w-5 accent-violet-500 disabled:cursor-not-allowed"
                          />
                        </label>

                        {selectedPatternBackground !== "transparent" && (
                          <label className="block">
                            <span className="mb-2 block text-xs font-medium text-slate-300">
                              Background colour
                            </span>

                            <input
                              type="color"
                              value={
                                /^#[0-9a-f]{6}$/i.test(
                                  selectedPatternBackground,
                                )
                                  ? selectedPatternBackground
                                  : "#ffffff"
                              }
                              disabled={selectedPatternLocked}
                              onChange={(event) => {
                                const background = event.target.value;

                                updateSelectedPattern(
                                  {
                                    background,

                                    style: {
                                      background,
                                    },
                                  },
                                  "Change pattern background",
                                );
                              }}
                              className="h-11 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950 p-1 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </label>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={selectedPatternLocked || patternImporting}
                            onClick={() => {
                              handleChoosePattern(
                                "replace",
                                selectedPatternObject.id,
                              );
                            }}
                            className="min-h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Replace Texture
                          </button>

                          <button
                            type="button"
                            disabled={selectedPatternLocked}
                            onClick={handleFitSelectedPatternToDocument}
                            className="min-h-11 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Fit to Document
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          duplicateObjects(selectedObjectIds);
                        }}
                        className="min-h-11 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                      >
                        Duplicate
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          deleteObjects(selectedObjectIds);
                        }}
                        className="min-h-11 rounded-lg bg-red-950/60 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-900"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-slate-500">
                    Click an object or drag a selection rectangle across several
                    objects.
                  </p>
                )}
              </PanelSection>
            )}

            <PanelSection title="Colours">
              <div className="space-y-4">
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                  <label>
                    <span className="mb-1.5 block text-[10px] uppercase tracking-wide text-slate-500">
                      Primary
                    </span>

                    <input
                      type="color"
                      value={colours.primary}
                      onChange={(event) => {
                        setPrimaryColor(event.target.value);
                      }}
                      className="h-11 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-1"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={swapColors}
                    title="Swap colours"
                    className="mb-0.5 h-11 w-11 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                  >
                    ↔
                  </button>

                  <label>
                    <span className="mb-1.5 block text-[10px] uppercase tracking-wide text-slate-500">
                      Secondary
                    </span>

                    <input
                      type="color"
                      value={colours.secondary}
                      onChange={(event) => {
                        setSecondaryColor(event.target.value);
                      }}
                      className="h-11 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-1"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-8 gap-2">
                  {DEFAULT_COLOURS.map((colour) => (
                    <button
                      key={colour}
                      type="button"
                      title={colour}
                      onClick={() => {
                        setPrimaryColor(colour);
                      }}
                      className={[
                        "aspect-square min-h-7 rounded-md border-2 transition hover:scale-110",
                        colours.primary === colour
                          ? "border-violet-400"
                          : "border-slate-700",
                      ].join(" ")}
                      style={{
                        background: colour,
                      }}
                    />
                  ))}
                </div>

                {colours.recent.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
                      Recent
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {colours.recent.slice(0, 12).map((colour) => (
                        <button
                          key={colour}
                          type="button"
                          onClick={() => {
                            setPrimaryColor(colour);
                          }}
                          className="h-8 w-8 rounded-md border border-slate-700"
                          style={{
                            background: colour,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </PanelSection>

            <PanelSection title="Document">
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-slate-900 p-3">
                    <span className="block text-[9px] uppercase tracking-wide text-slate-500">
                      Width
                    </span>

                    <strong>{documentData.width}px</strong>
                  </div>

                  <div className="rounded-lg bg-slate-900 p-3">
                    <span className="block text-[9px] uppercase tracking-wide text-slate-500">
                      Height
                    </span>

                    <strong>{documentData.height}px</strong>
                  </div>
                </div>

                <label className="block">
                  <span className="mb-2 block text-xs font-medium text-slate-300">
                    Background
                  </span>

                  <input
                    type="color"
                    value={documentData.background}
                    onChange={(event) => {
                      setDocumentBackground(event.target.value);
                    }}
                    className="h-11 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-1"
                  />
                </label>
              </div>
            </PanelSection>
          </>
        )}
      </div>
    </>
  );

  /*=====================================================
    Render
    =====================================================*/

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-950 text-slate-100">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.fashion.json,application/json"
        onChange={handleProjectFileChange}
        className="hidden"
      />

      <input
        ref={imageFileInputRef}
        type="file"
        accept={IMAGE_FILE_ACCEPT}
        onChange={handleImageFileChange}
        className="hidden"
      />

      <input
        ref={clothingArtworkFileInputRef}
        type="file"
        accept={IMAGE_FILE_ACCEPT}
        onChange={handleClothingArtworkFileChange}
        className="hidden"
      />

      <input
        ref={patternFileInputRef}
        type="file"
        accept={PATTERN_FILE_ACCEPT}
        onChange={handlePatternFileChange}
        className="hidden"
      />

      {projectLoading && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/90 p-6 backdrop-blur-md">
          <div className="flex min-w-[260px] flex-col items-center rounded-2xl border border-slate-700 bg-slate-900 p-7 text-center shadow-2xl">
            <span className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-violet-400" />

            <p className="mt-5 text-sm font-semibold text-white">
              Loading cloud project
            </p>

            <p className="mt-2 text-xs leading-5 text-slate-400">
              Restoring layers, objects and editor settings…
            </p>
          </div>
        </div>
      )}

      {/* Header */}

      <header className="relative z-[70] flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-950 px-2 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500 text-xs font-black text-white shadow-lg shadow-violet-950/40">
            FV
          </div>

          <div className="hidden shrink-0 lg:block">
            <p className="text-xs font-bold tracking-wide text-white">
              FashionVision
            </p>

            <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500">
              2D Studio
            </p>
          </div>

          <div className="hidden h-6 w-px bg-slate-800 lg:block" />

          <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
            <DocumentNameField
              documentData={documentData}
              setDocumentName={setDocumentName}
            />

            {persistence.dirty && (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-amber-400"
                title="Unsaved changes"
              />
            )}

            <span className="hidden shrink-0 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 sm:inline-flex">
              {projectLoading
                ? "Loading"
                : projectSaving
                  ? "Saving"
                  : cloudProjectId
                    ? `Cloud #${cloudProjectId}`
                    : "New project"}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-1.5 xl:flex">
            <HeaderButton onClick={handleNewDocument} disabled={projectLoading}>
              New
            </HeaderButton>

            <HeaderButton onClick={handleOpenProject} disabled={projectLoading}>
              Open File
            </HeaderButton>

            <HeaderButton
              onClick={() => handleSaveProject()}
              disabled={projectLoading || projectSaving}
            >
              {projectSaving
                ? "Saving…"
                : cloudProjectId
                  ? "Save"
                  : "Save Cloud"}
            </HeaderButton>

            <HeaderButton
              onClick={handleOpenShowcaseShare}
              disabled={
                projectLoading ||
                projectSaving ||
                showcaseSharing ||
                objectCount <= 0
              }
              title="Open the in-editor Share to Showcase panel"
            >
              {showcaseSharing ? "Sharing…" : "Share"}
            </HeaderButton>

            <HeaderButton
  onClick={handleOpenCreatorShowcase}
  title="Open Creator Showcase"
>
  Showcase
</HeaderButton>

            <HeaderButton onClick={handleExportPng} disabled={exporting}>
              {exporting ? "Exporting…" : "Export PNG"}
            </HeaderButton>

            <HeaderButton
              onClick={handleOpenOrGenerateAiFashionPreview}
              disabled={projectLoading}
              active={aiFashionPreviewOpen}
              title="Turn the current editor design into a realistic AI fashion image"
            >
              {aiFashionGenerating ? "AI Generating…" : "AI Preview"}
            </HeaderButton>
          </div>

          <HeaderButton
            onClick={undo}
            disabled={!canUndo}
            title="Undo"
            className="w-9 px-0"
          >
            ↶
          </HeaderButton>

          <HeaderButton
            onClick={redo}
            disabled={!canRedo}
            title="Redo"
            className="hidden w-9 px-0 sm:inline-flex"
          >
            ↷
          </HeaderButton>

          <HeaderButton
            onClick={() => {
              if (isDesktopPanel) {
                setUiState({
                  rightPanelOpen: !ui.rightPanelOpen,
                });
              } else {
                setPanelDrawerOpen(true);
              }
            }}
            active={isDesktopPanel ? ui.rightPanelOpen : panelDrawerOpen}
            title="Layers and properties"
            className="hidden sm:inline-flex"
          >
            Panel
          </HeaderButton>

          <HeaderButton
            onClick={() => {
              setMobileMenuOpen((value) => !value);
            }}
            active={mobileMenuOpen}
            title="File menu"
            className="xl:hidden"
          >
            Menu
          </HeaderButton>
        </div>

        {mobileMenuOpen && (
          <>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => {
                setMobileMenuOpen(false);
              }}
              className="fixed inset-0 z-[80] cursor-default bg-black/40 backdrop-blur-[2px] xl:hidden"
            />

            <div
              role="menu"
              aria-label="Fashion Editor file menu"
              className="fixed right-2 top-[calc(3.5rem+6px)] z-[90] max-h-[calc(100dvh-4.5rem)] w-[min(20rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-2 shadow-2xl xl:hidden"
            >
              <button
                type="button"
                onClick={handleNewDocument}
                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-slate-800"
              >
                New project
              </button>

              <button
                type="button"
                onClick={handleOpenProject}
                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-slate-800"
              >
                Open project
              </button>

              <button
                type="button"
                disabled={projectLoading || projectSaving}
                onClick={() => handleSaveProject()}
                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
              >
                {projectSaving
                  ? "Saving…"
                  : cloudProjectId
                    ? "Save to cloud"
                    : "Create cloud project"}
              </button>

              <button
                type="button"
                disabled={
                  projectLoading ||
                  projectSaving ||
                  showcaseSharing ||
                  objectCount <= 0
                }
                onClick={handleOpenShowcaseShare}
                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold text-amber-200 hover:bg-amber-950/40 disabled:opacity-40"
              >
                {showcaseSharing ? "Sharing to Showcase…" : "Share to Showcase"}
              </button>

<button
  type="button"
  onClick={handleOpenCreatorShowcase}
  className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-slate-800"
>
  Open Creator Showcase
</button>
              <button
                type="button"
                onClick={handleDownloadProject}
                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-slate-800"
              >
                Download project file
              </button>

              <button
                type="button"
                disabled={exporting}
                onClick={handleExportPng}
                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
              >
                {exporting ? "Exporting PNG…" : "Export PNG"}
              </button>

              <button
                type="button"
                disabled={projectLoading}
                onClick={handleOpenOrGenerateAiFashionPreview}
                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold text-violet-200 hover:bg-violet-950/50 disabled:opacity-40"
              >
                {aiFashionGenerating
                  ? "View AI generation…"
                  : aiFashionResult?.imageUrl
                    ? "View AI Preview"
                    : "Generate AI Preview"}
              </button>

              <div className="my-1 h-px bg-slate-800 sm:hidden" />

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);

                  setPanelDrawerOpen(true);
                }}
                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-slate-800 sm:hidden"
              >
                Layers and properties
              </button>
            </div>
          </>
        )}
      </header>

      {/* Tool options */}

      <div className="flex h-12 shrink-0 items-center gap-3 overflow-x-auto overscroll-x-contain border-b border-slate-800 bg-slate-900 px-3 sm:gap-4 sm:px-4">
        <div className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          {activeToolDefinition?.label || activeTool}
        </div>

        <div className="h-5 w-px shrink-0 bg-slate-700" />

        {activeSymmetryTool && (
          <>
            <HeaderButton
              onClick={handleToggleSymmetry}
              active={Boolean(symmetry.enabled && activeSymmetryToolEnabled)}
              title={`Toggle ${activeSymmetryTool.label} symmetry`}
            >
              {symmetry.enabled ? "Mirror On" : "Mirror Off"}
            </HeaderButton>

            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Mode
              <select
                value={symmetry.mode}
                onChange={(event) => {
                  handleSetSymmetryMode(event.target.value);
                }}
                className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 outline-none focus:border-violet-500"
              >
                {SYMMETRY_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <HeaderButton
              onClick={() => {
                updateSymmetrySettings({
                  showGuide: symmetry.showGuide === false,
                });
              }}
              active={symmetry.showGuide !== false}
              title="Show or hide symmetry guide"
              className="hidden sm:inline-flex"
            >
              Guide
            </HeaderButton>

            <HeaderButton
              onClick={openSymmetryProperties}
              title="Open full symmetry settings"
              className="hidden lg:inline-flex"
            >
              Settings
            </HeaderButton>

            <div className="h-5 w-px shrink-0 bg-slate-700" />
          </>
        )}

        {activeTool === EDITOR_TOOLS.PENCIL && (
          <>
            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Size
              <input
                type="range"
                min="0.25"
                max="100"
                step="0.25"
                value={brush.size}
                onChange={(event) => {
                  setBrushSettings({
                    size: Number(event.target.value),
                  });
                }}
                className="w-24 accent-violet-500 sm:w-28"
              />
              <span className="min-w-10 font-semibold text-slate-100">
                {brush.size}px
              </span>
            </label>

            <label className="hidden shrink-0 items-center gap-2 text-xs text-slate-300 sm:flex">
              Opacity
              <input
                type="range"
                min="0.01"
                max="1"
                step="0.01"
                value={brush.opacity}
                onChange={(event) => {
                  setBrushSettings({
                    opacity: Number(event.target.value),
                  });
                }}
                className="w-24 accent-violet-500"
              />
              <span className="min-w-10 font-semibold text-slate-100">
                {Math.round(brush.opacity * 100)}%
              </span>
            </label>
          </>
        )}

        {activeTool === EDITOR_TOOLS.BRUSH && (
          <>
            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Preset
              <select
                value={activeBrushPreset?.id || DEFAULT_BRUSH_PRESET_ID}
                onChange={(event) => {
                  handleBrushPresetChange(event.target.value);
                }}
                className="h-9 max-w-44 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 outline-none focus:border-violet-500 sm:max-w-52"
              >
                {BRUSH_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Size
              <input
                type="range"
                min={numberOr(brush.minimumSize, 0.25)}
                max={numberOr(brush.maximumSize, 300)}
                step="0.25"
                value={numberOr(brush.size, activeBrushPreset?.size || 4)}
                onChange={(event) => {
                  setBrushSettings({
                    size: Number(event.target.value),
                  });
                }}
                className="w-24 accent-violet-500 sm:w-28"
              />
              <span className="min-w-10 font-semibold text-slate-100">
                {numberOr(brush.size, activeBrushPreset?.size || 4)}
                px
              </span>
            </label>

            <label className="hidden shrink-0 items-center gap-2 text-xs text-slate-300 md:flex">
              Opacity
              <input
                type="range"
                min="0.01"
                max="1"
                step="0.01"
                value={numberOr(brush.opacity, 1)}
                onChange={(event) => {
                  setBrushSettings({
                    opacity: Number(event.target.value),
                  });
                }}
                className="w-24 accent-violet-500"
              />
              <span className="min-w-10 font-semibold text-slate-100">
                {Math.round(numberOr(brush.opacity, 1) * 100)}%
              </span>
            </label>

            <span className="hidden shrink-0 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 lg:inline-flex">
              {activeBrushPreset?.renderMode || brush.renderMode || "line"}
            </span>
          </>
        )}

        {activeTool === EDITOR_TOOLS.SHAPE && (
          <>
            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Shape
              <select
                value={activeShapeType}
                onChange={(event) => {
                  setShapeSettings({
                    shapeType: event.target.value,
                  });
                }}
                className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-violet-500"
              >
                {SHAPE_TYPE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Stroke
              <input
                type="range"
                min="0"
                max="100"
                step="0.25"
                value={numberOr(shape?.strokeWidth, 3)}
                onChange={(event) => {
                  setShapeSettings({
                    strokeWidth: Number(event.target.value),
                  });
                }}
                className="w-20 accent-violet-500 sm:w-24"
              />
              <span className="min-w-11 font-semibold text-slate-100">
                {numberOr(shape?.strokeWidth, 3)}
                px
              </span>
            </label>

            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Fill
              <select
                value={shape?.fillType || "none"}
                onChange={(event) => {
                  setShapeSettings({
                    fillType: event.target.value,
                  });
                }}
                className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 outline-none focus:border-violet-500"
              >
                <option value="none">None</option>

                <option value="solid">Solid</option>
              </select>
            </label>

            {activeShapeType === "polygon" && (
              <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
                Sides
                <input
                  type="number"
                  min="3"
                  max="32"
                  step="1"
                  value={Math.max(3, Math.min(32, numberOr(shape?.sides, 5)))}
                  onChange={(event) => {
                    setShapeSettings({
                      sides: Math.max(
                        3,
                        Math.min(32, Number(event.target.value) || 5),
                      ),
                    });
                  }}
                  className="h-9 w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 outline-none focus:border-violet-500"
                />
              </label>
            )}

            {activeShapeType === "rectangle" && (
              <label className="hidden shrink-0 items-center gap-2 text-xs text-slate-300 lg:flex">
                Radius
                <input
                  type="number"
                  min="0"
                  max="200"
                  step="1"
                  value={numberOr(shape?.cornerRadius, 0)}
                  onChange={(event) => {
                    setShapeSettings({
                      cornerRadius: Math.max(
                        0,
                        Number(event.target.value) || 0,
                      ),
                    });
                  }}
                  className="h-9 w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 outline-none focus:border-violet-500"
                />
              </label>
            )}

            <span className="hidden shrink-0 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 xl:inline-flex">
              Shift: equal · Alt: center
            </span>
          </>
        )}

        {activeTool === EDITOR_TOOLS.LINE && (
          <>
            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Width
              <input
                type="range"
                min="0.25"
                max="200"
                step="0.25"
                value={numberOr(shape?.strokeWidth, 3)}
                onChange={(event) => {
                  setShapeSettings({
                    strokeWidth: Number(event.target.value),
                  });
                }}
                className="w-24 accent-violet-500 sm:w-28"
              />
              <span className="min-w-12 font-semibold text-slate-100">
                {numberOr(shape?.strokeWidth, 3)}
                px
              </span>
            </label>

            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Style
              <select
                value={activeLineStyle.id}
                onChange={(event) => {
                  const selectedStyle =
                    LINE_STYLE_OPTIONS.find(
                      (option) => option.id === event.target.value,
                    ) || LINE_STYLE_OPTIONS[0];

                  setShapeSettings({
                    dash: [...selectedStyle.dash],
                  });
                }}
                className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 outline-none focus:border-violet-500"
              >
                {LINE_STYLE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="hidden shrink-0 items-center gap-2 text-xs text-slate-300 md:flex">
              Opacity
              <input
                type="range"
                min="0.01"
                max="1"
                step="0.01"
                value={numberOr(shape?.strokeOpacity, 1)}
                onChange={(event) => {
                  setShapeSettings({
                    strokeOpacity: Number(event.target.value),
                  });
                }}
                className="w-24 accent-violet-500"
              />
              <span className="min-w-10 font-semibold text-slate-100">
                {Math.round(numberOr(shape?.strokeOpacity, 1) * 100)}%
              </span>
            </label>

            <label className="hidden shrink-0 items-center gap-2 text-xs text-slate-300 lg:flex">
              Cap
              <select
                value={shape?.lineCap || "round"}
                onChange={(event) => {
                  setShapeSettings({
                    lineCap: event.target.value,

                    lineJoin:
                      event.target.value === "round" ? "round" : "miter",
                  });
                }}
                className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 outline-none focus:border-violet-500"
              >
                {LINE_CAP_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <span className="hidden shrink-0 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 xl:inline-flex">
              Hold Shift to snap
            </span>
          </>
        )}

        {activeTool === EDITOR_TOOLS.FILL && (
          <>
            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Colour
              <input
                type="color"
                value={shape?.fill || colours.primary}
                onChange={(event) => {
                  handleFillColourChange(event.target.value);
                }}
                className="h-9 w-12 cursor-pointer rounded-lg border border-slate-700 bg-slate-950 p-1"
              />
            </label>

            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Opacity
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={numberOr(shape?.fillOpacity, 1)}
                onChange={(event) => {
                  setShapeSettings({
                    fillOpacity: Number(event.target.value),
                  });
                }}
                className="w-24 accent-violet-500 sm:w-28"
              />
              <span className="min-w-10 font-semibold text-slate-100">
                {Math.round(numberOr(shape?.fillOpacity, 1) * 100)}%
              </span>
            </label>

            <span className="hidden shrink-0 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 md:inline-flex">
              Click shape to fill
            </span>

            <span className="hidden shrink-0 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 xl:inline-flex">
              Alt + click: remove
            </span>
          </>
        )}

        {activeTool === EDITOR_TOOLS.TEXT && (
          <>
            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Text
              <input
                type="text"
                value={textSettings.content}
                onChange={(event) => {
                  handleTextContentChange(event.target.value);
                }}
                placeholder="Enter text"
                className="h-9 w-40 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-500 sm:w-52"
              />
            </label>

            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Font
              <select
                value={textSettings.fontFamily}
                onChange={(event) => {
                  updateTextSettings({
                    fontFamily: event.target.value,
                  });
                }}
                className="h-9 max-w-40 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 outline-none focus:border-violet-500"
              >
                {TEXT_FONT_OPTIONS.map((fontFamily) => (
                  <option key={fontFamily} value={fontFamily}>
                    {fontFamily}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Size
              <input
                type="number"
                min="1"
                max="1000"
                step="1"
                value={textSettings.fontSize}
                onChange={(event) => {
                  updateTextSettings({
                    fontSize: Math.max(
                      1,
                      Math.min(1000, Number(event.target.value) || 1),
                    ),
                  });
                }}
                className="h-9 w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 outline-none focus:border-violet-500"
              />
            </label>

            <button
              type="button"
              aria-pressed={textSettings.fontWeight >= 600}
              onClick={() => {
                updateTextSettings({
                  fontWeight: textSettings.fontWeight >= 600 ? 400 : 700,
                });
              }}
              className={[
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-black transition",
                textSettings.fontWeight >= 600
                  ? "border-violet-500 bg-violet-500 text-white"
                  : "border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800",
              ].join(" ")}
              title="Bold"
            >
              B
            </button>

            <button
              type="button"
              aria-pressed={textSettings.fontStyle === "italic"}
              onClick={() => {
                updateTextSettings({
                  fontStyle:
                    textSettings.fontStyle === "italic" ? "normal" : "italic",
                });
              }}
              className={[
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold italic transition",
                textSettings.fontStyle === "italic"
                  ? "border-violet-500 bg-violet-500 text-white"
                  : "border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800",
              ].join(" ")}
              title="Italic"
            >
              I
            </button>

            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Colour
              <input
                type="color"
                value={textSettings.fill}
                onChange={(event) => {
                  handleTextColourChange(event.target.value);
                }}
                className="h-9 w-12 cursor-pointer rounded-lg border border-slate-700 bg-slate-950 p-1"
              />
            </label>

            <span className="hidden shrink-0 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 xl:inline-flex">
              Click or drag to place
            </span>
          </>
        )}

        {activeTool === EDITOR_TOOLS.IMAGE && (
          <>
            <button
              type="button"
              disabled={
                imageImporting ||
                !activeLayer ||
                activeLayer.locked ||
                activeLayer.visible === false
              }
              onClick={() => {
                handleChooseImage("place");
              }}
              className="h-9 shrink-0 rounded-lg bg-violet-500 px-3 text-xs font-bold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {imageImporting ? "Loading…" : "Choose Image"}
            </button>

            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Opacity
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={clamp(imageSettings.opacity, 0, 1)}
                onChange={(event) => {
                  updateImageSettings({
                    opacity: Number(event.target.value),
                  });
                }}
                className="w-24 accent-violet-500 sm:w-28"
              />
              <span className="min-w-10 font-semibold text-slate-100">
                {Math.round(clamp(imageSettings.opacity, 0, 1) * 100)}%
              </span>
            </label>

            <span className="hidden shrink-0 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 md:inline-flex">
              Choose, then click to place
            </span>

            <span className="hidden shrink-0 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 xl:inline-flex">
              PNG · JPG · WebP · SVG
            </span>
          </>
        )}

        {activeTool === EDITOR_TOOLS.PATTERN_MASK && (
          <>
            <button
              type="button"
              disabled={patternImporting}
              onClick={() => {
                handleChoosePattern("mask");
              }}
              className="h-9 shrink-0 rounded-lg bg-violet-500 px-3 text-xs font-bold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {patternImporting ? "Loading…" : "Choose Fabric"}
            </button>

            <button
              type="button"
              disabled={patternImporting || selectedShapeObjects.length === 0}
              onClick={() => {
                handleChoosePattern(
                  "mask-selection",
                  null,
                  selectedShapeObjects.map((object) => object.id),
                );
              }}
              className="h-9 shrink-0 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply Selected
            </button>

            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Repeat
              <select
                value={resolvePatternRepeatMode(patternSettings)}
                onChange={(event) => {
                  const repeat = event.target.value;

                  updatePatternSettings({
                    repeat,
                    repeatMode: repeat,
                    patternRepeat: repeat,
                  });
                }}
                className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 outline-none focus:border-violet-500"
              >
                {PATTERN_REPEAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Scale
              <input
                type="range"
                min="0.02"
                max="5"
                step="0.01"
                value={clamp(patternSettings.scale, 0.02, 5)}
                onChange={(event) => {
                  const scale = Number(event.target.value);

                  updatePatternSettings({
                    scale,
                    scaleX: scale,
                    scaleY: scale,
                  });
                }}
                className="w-20 accent-violet-500 sm:w-24"
              />
              <span className="min-w-10 font-semibold text-slate-100">
                {Math.round(clamp(patternSettings.scale, 0.02, 5) * 100)}%
              </span>
            </label>

            <span className="hidden shrink-0 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 xl:inline-flex">
              Click shape · Alt-click removes
            </span>
          </>
        )}

        {activeTool === EDITOR_TOOLS.PATTERN && (
          <>
            <button
              type="button"
              disabled={
                patternImporting ||
                !activeLayer ||
                activeLayer.locked ||
                activeLayer.visible === false
              }
              onClick={() => {
                handleChoosePattern("place");
              }}
              className="h-9 shrink-0 rounded-lg bg-violet-500 px-3 text-xs font-bold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {patternImporting ? "Loading…" : "Choose Pattern"}
            </button>

            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Repeat
              <select
                value={resolvePatternRepeatMode(patternSettings)}
                onChange={(event) => {
                  const repeat = event.target.value;

                  updatePatternSettings({
                    repeat,
                    repeatMode: repeat,
                  });
                }}
                className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 outline-none focus:border-violet-500"
              >
                {PATTERN_REPEAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              Scale
              <input
                type="range"
                min="0.02"
                max="5"
                step="0.01"
                value={clamp(patternSettings.scale, 0.02, 5)}
                onChange={(event) => {
                  const scale = Number(event.target.value);

                  updatePatternSettings({
                    scale,
                    scaleX: scale,
                    scaleY: scale,
                  });
                }}
                className="w-20 accent-violet-500 sm:w-24"
              />
              <span className="min-w-10 font-semibold text-slate-100">
                {Math.round(clamp(patternSettings.scale, 0.02, 5) * 100)}%
              </span>
            </label>

            <label className="hidden shrink-0 items-center gap-2 text-xs text-slate-300 lg:flex">
              Opacity
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={clamp(patternSettings.opacity, 0, 1)}
                onChange={(event) => {
                  updatePatternSettings({
                    opacity: Number(event.target.value),
                  });
                }}
                className="w-20 accent-violet-500"
              />
            </label>

            <span className="hidden shrink-0 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 xl:inline-flex">
              Drag to create pattern area
            </span>
          </>
        )}

        {activeTool === EDITOR_TOOLS.ERASER && (
          <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
            Size
            <input
              type="range"
              min={eraser.minimumSize}
              max={eraser.maximumSize}
              step="1"
              value={eraser.size}
              onChange={(event) => {
                setEraserSize(Number(event.target.value));
              }}
              className="w-28 accent-violet-500 sm:w-40"
            />
            <span className="min-w-12 font-semibold text-slate-100">
              {eraser.size}px
            </span>
          </label>
        )}

        {activeTool === EDITOR_TOOLS.SELECT && (
          <span className="shrink-0 text-xs text-slate-400">
            {selectedObjectIds.length > 0
              ? `${selectedObjectIds.length} selected`
              : "Tap or drag to select"}
          </span>
        )}

        {activeTool === EDITOR_TOOLS.PAN && (
          <span className="shrink-0 text-xs text-slate-400">
            Drag to move canvas
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <HeaderButton
            onClick={toggleGrid}
            active={ui.showGrid}
            title="Toggle grid"
            className="hidden sm:inline-flex"
          >
            Grid
          </HeaderButton>

          <HeaderButton
            onClick={() => zoomOut()}
            title="Zoom out"
            className="w-9 px-0"
          >
            −
          </HeaderButton>

          <span className="min-w-11 text-center text-xs font-semibold text-slate-300">
            {zoomPercentage}%
          </span>

          <HeaderButton
            onClick={() => zoomIn()}
            title="Zoom in"
            className="w-9 px-0"
          >
            +
          </HeaderButton>

          <HeaderButton onClick={fitCanvas} title="Fit document">
            Fit
          </HeaderButton>
        </div>
      </div>

      {/* Workspace */}

      <main className="flex min-h-0 flex-1 overflow-hidden">
        {/* Tablet/Desktop toolbar */}

        {ui.leftPanelOpen !== false && (
          <aside className="hidden w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-slate-800 bg-slate-950 py-3 md:flex">
            {TOOL_DEFINITIONS.map((tool) => (
              <ToolButton
                key={tool.id}
                tool={tool}
                active={activeTool === tool.id}
                onClick={setActiveTool}
              />
            ))}

            <div className="my-1 h-px w-10 bg-slate-800" />

            <div className="relative h-12 w-12">
              <button
                type="button"
                title="Primary colour"
                onClick={() => {
                  setUiState({
                    rightPanelTab: "properties",
                  });

                  if (!isDesktopPanel) {
                    setPanelDrawerOpen(true);
                  }
                }}
                className="absolute left-0 top-0 h-8 w-8 rounded-lg border-2 border-slate-600 shadow"
                style={{
                  background: colours.primary,
                }}
              />

              <button
                type="button"
                title="Secondary colour"
                onClick={() => {
                  setUiState({
                    rightPanelTab: "properties",
                  });

                  if (!isDesktopPanel) {
                    setPanelDrawerOpen(true);
                  }
                }}
                className="absolute bottom-0 right-0 h-8 w-8 rounded-lg border-2 border-slate-600 shadow"
                style={{
                  background: colours.secondary,
                }}
              />

              <button
                type="button"
                onClick={swapColors}
                title="Swap colours"
                className="absolute bottom-0 left-0 text-[10px] font-bold text-slate-400 hover:text-white"
              >
                ↔
              </button>
            </div>
          </aside>
        )}

        {/* Canvas */}

        <section className="relative min-w-0 flex-1 overflow-hidden bg-slate-800">
          <EditorCanvas
            ref={stageRef}
            className="h-full w-full"
            minimumHeight={0}
            onPointerPositionChange={setPointerInformation}
            onSaveRequested={handleSaveProject}
            onError={(error) => {
              console.error(error);

              setEditorError(error);

              showToast("An editor error occurred.", "error");
            }}
          />
        </section>

        {/* Desktop right panel */}

        {isDesktopPanel && ui.rightPanelOpen !== false && (
          <aside className="flex w-[320px] shrink-0 flex-col border-l border-slate-800 bg-slate-950">
            {rightPanelContent}
          </aside>
        )}
      </main>

      {/* Mobile bottom toolbar */}

      <nav className="shrink-0 border-t border-slate-800 bg-slate-950 pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex h-[68px] items-center gap-2 overflow-x-auto overscroll-x-contain px-2">
          {TOOL_DEFINITIONS.map((tool) => (
            <ToolButton
              key={tool.id}
              tool={tool}
              active={activeTool === tool.id}
              onClick={setActiveTool}
              horizontal
            />
          ))}

          <button
            type="button"
            onClick={() => {
              setPanelDrawerOpen(true);
            }}
            className="flex h-14 min-w-[58px] shrink-0 flex-col items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-2 text-slate-300"
          >
            <span className="text-sm font-black">☰</span>

            <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider">
              Panel
            </span>
          </button>
        </div>
      </nav>

      {/* Status bar */}

      <footer className="hidden h-7 shrink-0 items-center justify-between gap-4 overflow-hidden border-t border-slate-800 bg-slate-950 px-3 text-[10px] text-slate-500 sm:flex">
        <div className="flex min-w-0 items-center gap-4">
          <span className="truncate">
            Tool:{" "}
            <strong className="text-slate-300">
              {activeToolDefinition?.label || activeTool}
            </strong>
          </span>

          <span>
            Objects: <strong className="text-slate-300">{objectCount}</strong>
          </span>

          <span className="hidden lg:inline">
            Layer:{" "}
            <strong className="text-slate-300">
              {activeLayer?.name || "None"}
            </strong>
          </span>

          <span
            className={symmetry.enabled ? "text-violet-300" : "text-slate-600"}
          >
            Mirror:{" "}
            <strong>{symmetry.enabled ? symmetryModeLabel : "Off"}</strong>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          {pointerInformation?.insideDocument && (
            <span className="hidden lg:inline">
              X {Math.round(pointerInformation.documentPoint.x)} Y{" "}
              {Math.round(pointerInformation.documentPoint.y)}
            </span>
          )}

          <span>{zoomPercentage}%</span>

          <span
            className={
              projectSaving
                ? "text-violet-300"
                : persistence.dirty
                  ? "text-amber-400"
                  : "text-emerald-400"
            }
          >
            {projectSaving
              ? "Saving…"
              : persistence.dirty
                ? "Unsaved"
                : cloudProjectId
                  ? "Cloud saved"
                  : "Ready"}
          </span>
        </div>
      </footer>

      {/* Creator Showcase share modal */}

      {showcaseShareOpen && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-6">
          <button
            type="button"
            aria-label="Close Share to Showcase"
            disabled={showcaseSharing}
            onClick={handleCloseShowcaseShare}
            className="absolute inset-0 h-full w-full cursor-default disabled:cursor-wait"
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="showcase-share-title"
            className="relative z-10 flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-amber-500/20 bg-slate-950 shadow-2xl shadow-black/60"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-300">
                    Showcase
                  </span>

                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    {cloudProjectId
                      ? `Private project #${cloudProjectId}`
                      : "Cloud project created on share"}
                  </span>
                </div>

                <h2
                  id="showcase-share-title"
                  className="mt-2 text-base font-bold text-white sm:text-lg"
                >
                  Share to Creator Showcase
                </h2>

                <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-400">
                  Publish a Showcase representation of this Fashion Editor
                  project. The editable source stays private in your account.
                </p>
              </div>

              <button
                type="button"
                disabled={showcaseSharing}
                onClick={handleCloseShowcaseShare}
                aria-label="Close Share to Showcase"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-lg text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleShareToShowcase}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
                {showcaseShareError && (
                  <div
                    role="alert"
                    className="mb-4 rounded-xl border border-red-800 bg-red-950/60 px-4 py-3 text-xs leading-5 text-red-200"
                  >
                    {showcaseShareError}
                  </div>
                )}

                {showcaseMetadataError && (
                  <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-800 bg-red-950/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-red-200">
                      {showcaseMetadataError}
                    </p>

                    <button
                      type="button"
                      disabled={showcaseMetadataLoading || showcaseSharing}
                      onClick={() => {
                        void loadShowcaseMetadata();
                      }}
                      className="min-h-9 shrink-0 rounded-lg border border-red-700 bg-red-950 px-3 text-[10px] font-bold uppercase tracking-wide text-red-200 hover:bg-red-900/70 disabled:opacity-40"
                    >
                      Retry
                    </button>
                  </div>
                )}

                <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
                      <div className="flex aspect-[4/5] items-center justify-center bg-black/40 p-3">
                        {showcasePreviewDataUrl ? (
                          <img
                            src={showcasePreviewDataUrl}
                            alt="Fashion Editor Showcase preview"
                            className="max-h-full max-w-full object-contain"
                            draggable={false}
                          />
                        ) : (
                          <div className="px-4 text-center">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-lg font-black text-amber-300">
                              FV
                            </div>

                            <p className="mt-3 text-xs font-semibold text-slate-300">
                              Preview prepared when sharing
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="border-t border-slate-800 px-3 py-3">
                        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">
                          Fashion Editor Preview
                        </p>

                        <p className="mt-1 text-[10px] leading-4 text-slate-400">
                          {documentData.width} × {documentData.height}px ·{" "}
                          {objectCount} object{objectCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-200">
                        Private editable source
                      </p>

                      <p className="mt-2 text-[10px] leading-5 text-slate-400">
                        The Showcase receives this preview and discovery
                        metadata. Your full Fashion Editor project_data stays in
                        the private cloud project.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="block">
                      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        Title
                      </span>

                      <input
                        type="text"
                        required
                        minLength={2}
                        maxLength={SHOWCASE_MAX_TITLE_LENGTH}
                        value={showcaseShareForm.title}
                        disabled={showcaseSharing}
                        onChange={(event) => {
                          handleShowcaseFormChange("title", event.target.value);
                        }}
                        placeholder="e.g. Asymmetrical Silk Blazer"
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-amber-500 disabled:opacity-50"
                      />
                    </label>

                    <label className="block">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                          Description
                        </span>

                        <span className="font-mono text-[9px] text-slate-600">
                          {showcaseShareForm.description.length}/
                          {SHOWCASE_MAX_DESCRIPTION_LENGTH}
                        </span>
                      </div>

                      <textarea
                        required
                        minLength={10}
                        maxLength={SHOWCASE_MAX_DESCRIPTION_LENGTH}
                        rows={4}
                        value={showcaseShareForm.description}
                        disabled={showcaseSharing}
                        onChange={(event) => {
                          handleShowcaseFormChange(
                            "description",
                            event.target.value,
                          );
                        }}
                        placeholder="Describe the silhouette, materials, inspiration, construction details, mood, or visual direction..."
                        className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-600 focus:border-amber-500 disabled:opacity-50"
                      />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                          Creative Category
                        </span>

                        <select
                          value={showcaseShareForm.category_id}
                          disabled={
                            showcaseSharing ||
                            showcaseMetadataLoading ||
                            showcaseCategories.length === 0
                          }
                          onChange={(event) => {
                            handleShowcaseFormChange(
                              "category_id",
                              event.target.value,
                            );
                          }}
                          className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-amber-500 disabled:opacity-50"
                        >
                          <option value="">
                            {showcaseMetadataLoading
                              ? "Loading categories…"
                              : "Select category"}
                          </option>

                          {showcaseCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                          Creative Format
                        </span>

                        <select
                          value={showcaseShareForm.format}
                          disabled={showcaseSharing}
                          onChange={(event) => {
                            handleShowcaseFormChange(
                              "format",
                              event.target.value,
                            );
                          }}
                          className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-amber-500 disabled:opacity-50"
                        >
                          {SHOWCASE_FORMAT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {selectedShowcaseCategory?.description && (
                      <p className="-mt-2 text-[9px] leading-4 text-slate-500">
                        {selectedShowcaseCategory.description}
                      </p>
                    )}

                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
                      <div className="mb-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
                          Showcase Discovery
                        </p>

                        <p className="mt-1 text-[10px] leading-4 text-slate-500">
                          Choose one style and one garment. Occasions are
                          optional and may include more than one.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-semibold text-slate-400">
                            Style
                          </span>

                          <select
                            value={showcaseShareForm.style_term_id}
                            disabled={
                              showcaseSharing ||
                              showcaseMetadataLoading ||
                              showcaseDiscovery.styles.length === 0
                            }
                            onChange={(event) => {
                              handleShowcaseFormChange(
                                "style_term_id",
                                event.target.value,
                              );
                            }}
                            className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-amber-500 disabled:opacity-50"
                          >
                            <option value="">
                              {showcaseMetadataLoading
                                ? "Loading styles…"
                                : "Select style"}
                            </option>

                            {showcaseDiscovery.styles.map((style) => (
                              <option key={style.id} value={style.id}>
                                {style.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-[10px] font-semibold text-slate-400">
                            Garment
                          </span>

                          <select
                            value={showcaseShareForm.garment_term_id}
                            disabled={
                              showcaseSharing ||
                              showcaseMetadataLoading ||
                              showcaseDiscovery.garments.length === 0
                            }
                            onChange={(event) => {
                              handleShowcaseFormChange(
                                "garment_term_id",
                                event.target.value,
                              );
                            }}
                            className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-amber-500 disabled:opacity-50"
                          >
                            <option value="">
                              {showcaseMetadataLoading
                                ? "Loading garments…"
                                : "Select garment"}
                            </option>

                            {showcaseDiscovery.garments.map((garment) => (
                              <option key={garment.id} value={garment.id}>
                                {garment.emoji ? `${garment.emoji} ` : ""}
                                {garment.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      {showcaseDiscovery.occasions.length > 0 && (
                        <div className="mt-4">
                          <span className="mb-2 block text-[10px] font-semibold text-slate-400">
                            Occasions · Optional
                          </span>

                          <div className="flex flex-wrap gap-2">
                            {showcaseDiscovery.occasions.map((occasion) => {
                              const selected =
                                showcaseShareForm.occasion_term_ids.includes(
                                  occasion.id,
                                );

                              return (
                                <button
                                  key={occasion.id}
                                  type="button"
                                  disabled={showcaseSharing}
                                  aria-pressed={selected}
                                  onClick={() => {
                                    handleToggleShowcaseOccasion(occasion.id);
                                  }}
                                  className={[
                                    "rounded-full border px-3 py-2 text-[10px] font-semibold transition disabled:opacity-40",
                                    selected
                                      ? "border-amber-500 bg-amber-500/15 text-amber-200"
                                      : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-white",
                                  ].join(" ")}
                                >
                                  {occasion.emoji ? `${occasion.emoji} ` : ""}
                                  {occasion.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                          Tags · Optional
                        </span>

                        <span className="text-[9px] text-slate-600">
                          {showcaseTags.length}/{SHOWCASE_MAX_TAGS}
                        </span>
                      </div>

                      <div className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-2 focus-within:border-amber-500">
                        <input
                          type="text"
                          maxLength={SHOWCASE_MAX_TAG_LENGTH}
                          value={showcaseTagInput}
                          disabled={
                            showcaseSharing ||
                            showcaseTags.length >= SHOWCASE_MAX_TAGS
                          }
                          onChange={(event) => {
                            setShowcaseTagInput(event.target.value);
                            setShowcaseShareError("");
                          }}
                          onKeyDown={handleShowcaseTagKeyDown}
                          placeholder="silk, layered, modern…"
                          className="h-10 min-w-0 flex-1 bg-transparent px-1 text-xs text-slate-200 outline-none placeholder:text-slate-600 disabled:opacity-50"
                        />

                        <button
                          type="button"
                          disabled={
                            showcaseSharing ||
                            showcaseTags.length >= SHOWCASE_MAX_TAGS ||
                            !normalizeShowcaseTag(showcaseTagInput)
                          }
                          onClick={handleAddShowcaseTag}
                          className="h-8 rounded-md bg-slate-800 px-3 text-[10px] font-bold text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          Add
                        </button>
                      </div>

                      <p className="mt-1.5 text-[9px] text-slate-600">
                        Press Enter or comma to add a tag.
                      </p>

                      {showcaseTags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {showcaseTags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 py-1 pl-2.5 pr-1 text-[9px] text-slate-400"
                            >
                              #{tag}
                              <button
                                type="button"
                                disabled={showcaseSharing}
                                onClick={() => {
                                  setShowcaseTags((current) =>
                                    current.filter((item) => item !== tag),
                                  );
                                }}
                                className="flex h-5 w-5 items-center justify-center rounded-full text-slate-500 hover:bg-slate-800 hover:text-white disabled:opacity-40"
                                aria-label={`Remove ${tag} tag`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-violet-500/25 bg-violet-500/10 p-4">
                      <input
                        type="checkbox"
                        checked={showcaseShareForm.allow_remix}
                        disabled={showcaseSharing}
                        onChange={(event) => {
                          handleShowcaseFormChange(
                            "allow_remix",
                            event.target.checked,
                          );
                        }}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-violet-500"
                      />

                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-violet-100">
                          Allow Remix
                        </span>

                        <span className="mt-1 block text-[10px] leading-5 text-slate-400">
                          Other Creators may make their own private editable
                          copy from the Showcase. Your original project is never
                          changed.
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-slate-800 bg-slate-950/95 px-4 py-4 sm:px-5">
                {showcaseSharing && (
                  <div className="mb-3">
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      <span>Publishing to Showcase</span>
                      <span>{showcaseUploadProgress}%</span>
                    </div>

                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all"
                        style={{
                          width: `${showcaseUploadProgress}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[9px] leading-4 text-slate-500">
                    Sharing saves the latest editor state first. You stay in
                    Fashion Editor after publishing.
                  </p>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={showcaseSharing}
                      onClick={handleCloseShowcaseShare}
                      className="min-h-10 rounded-lg border border-slate-700 bg-slate-900 px-4 text-xs font-semibold text-slate-300 hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={
                        showcaseSharing ||
                        showcaseMetadataLoading ||
                        !showcaseMetadataReady
                      }
                      className="min-h-10 rounded-lg bg-amber-400 px-5 text-xs font-black text-slate-950 shadow-lg shadow-amber-950/30 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
                    >
                      {showcaseSharing
                        ? showcaseUploadProgress > 0
                          ? `Sharing ${showcaseUploadProgress}%`
                          : "Saving & Sharing…"
                        : showcaseMetadataLoading
                          ? "Loading Options…"
                          : "Share to Showcase"}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* AI realistic fashion preview */}

      {aiFashionPreviewOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-3 backdrop-blur-md sm:p-6">
          <button
            type="button"
            aria-label="Close AI fashion preview"
            onClick={() => {
              setAiFashionPreviewOpen(false);
            }}
            className="absolute inset-0 h-full w-full cursor-default"
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-label="AI realistic fashion preview"
            className="relative z-10 flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-violet-700/70 bg-violet-950/70 px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-violet-300">
                    AI
                  </span>

                  <h2 className="truncate text-sm font-bold text-white sm:text-base">
                    Realistic Fashion Preview
                  </h2>
                </div>

                <p className="mt-1 text-[11px] text-slate-400">
                  Uses the selected clothing template as a clean garment
                  reference when available, otherwise uses the current canvas.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setAiFashionPreviewOpen(false);
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-lg text-slate-300 hover:border-slate-600 hover:text-white"
                aria-label="Close AI preview"
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {aiFashionGenerating ? (
                <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-violet-900/60 bg-violet-950/20 p-8 text-center">
                  <span className="h-12 w-12 animate-spin rounded-full border-2 border-slate-700 border-t-violet-400" />

                  <p className="mt-5 text-base font-bold text-white">
                    Generating realistic fashion preview…
                  </p>

                  <p className="mt-2 max-w-lg text-xs leading-5 text-slate-400">
                    {selectedClothingTemplate
                      ? "The clean front + back garment board is being sent through the DesignByYou backend as the strict AI reference."
                      : "Your clean canvas capture is being sent through the DesignByYou backend as the AI reference."}{" "}
                    This may take a little while.
                  </p>
                </div>
              ) : aiFashionResult?.imageUrl ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_230px]">
                  <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
                    <img
                      src={aiFashionResult.imageUrl}
                      alt="AI-generated realistic fashion preview"
                      className="block max-h-[64dvh] w-full object-contain"
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Generated from
                      </p>

                      <p className="mt-2 text-sm font-semibold text-white">
                        {aiFashionResult.garmentType ||
                          selectedClothingTemplate?.label ||
                          "Fashion design"}
                      </p>

                      <dl className="mt-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-slate-500">View</dt>
                          <dd className="text-right font-semibold text-slate-300">
                            {aiFashionResult.view === "front-back"
                              ? "Front + Back"
                              : aiFashionResult.view === "back"
                                ? "Back"
                                : "Front"}
                          </dd>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-slate-500">Reference</dt>
                          <dd className="text-right font-semibold text-slate-300">
                            {aiFashionResult.inputMode === "clean-garment"
                              ? "Clean garment board"
                              : "Canvas capture"}
                          </dd>
                        </div>

                        {aiFashionResult.width && aiFashionResult.height ? (
                          <div className="flex items-center justify-between gap-3">
                            <dt className="text-slate-500">Output</dt>
                            <dd className="text-right font-semibold text-slate-300">
                              {aiFashionResult.width} × {aiFashionResult.height}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenAiFashionImage}
                      className="flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-4 text-sm font-bold text-white shadow-lg shadow-violet-950/40 hover:bg-violet-500"
                    >
                      Open Full Image
                    </button>

                    <button
                      type="button"
                      disabled={aiFashionSaving}
                      onClick={() => {
                        void handleSaveAiFashionImage();
                      }}
                      className="flex min-h-11 items-center justify-center rounded-xl border border-emerald-600/60 bg-emerald-500/10 px-4 text-sm font-bold text-emerald-200 transition hover:border-emerald-500 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {aiFashionSaving ? "Saving Image…" : "Save Image"}
                    </button>

                    <button
                      type="button"
                      onClick={handleGenerateAiFashionPreview}
                      className="flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-200 hover:border-violet-700 hover:text-white"
                    >
                      Generate Again
                    </button>

                    <p className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-3 text-[10px] leading-4 text-amber-200/80">
                      Generate Again creates another paid AI generation. The
                      current editor design is not modified.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-950 text-xl font-black text-violet-300">
                    AI
                  </div>

                  <p className="mt-4 text-base font-bold text-white">
                    No AI preview yet
                  </p>

                  <p className="mt-2 max-w-md text-xs leading-5 text-slate-400">
                    Generate a realistic product-style image from the sketch,
                    drawing, image, graphics or clothing template currently on
                    the canvas.
                  </p>

                  {aiFashionError ? (
                    <p className="mt-4 max-w-lg rounded-xl border border-red-900 bg-red-950/50 px-4 py-3 text-xs text-red-200">
                      {aiFashionError}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleGenerateAiFashionPreview}
                    className="mt-5 min-h-11 rounded-xl bg-violet-600 px-5 text-sm font-bold text-white hover:bg-violet-500"
                  >
                    Generate AI Preview
                  </button>
                </div>
              )}

              {!aiFashionGenerating && aiFashionError && aiFashionResult ? (
                <p className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-xs text-red-200">
                  {aiFashionError}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      )}

      {/* Tablet/mobile panel drawer */}

      {!isDesktopPanel && panelDrawerOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label="Close panel"
            onClick={() => {
              setPanelDrawerOpen(false);
            }}
            className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm"
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Editor layers and properties"
            className="absolute inset-y-0 right-0 flex w-[min(90vw,380px)] flex-col border-l border-slate-700 bg-slate-950 shadow-2xl"
          >
            {rightPanelContent}
          </aside>
        </div>
      )}

      {/* Toast */}

      {toast && (
        <div
          className={[
            "fixed bottom-24 right-3 z-[100] max-w-[calc(100vw-24px)] rounded-xl border px-4 py-3 text-sm font-semibold shadow-2xl sm:bottom-10 sm:right-5 sm:max-w-sm",
            toast.type === "error"
              ? "border-red-800 bg-red-950 text-red-200"
              : "border-emerald-800 bg-emerald-950 text-emerald-200",
          ].join(" ")}
        >
          {toast.message}
        </div>
      )}

      {/* Error notification */}

      {editorError && (
        <button
          type="button"
          onClick={() => {
            setEditorError(null);
          }}
          className="fixed left-3 right-3 top-20 z-[100] rounded-xl border border-red-800 bg-red-950 px-4 py-3 text-left text-xs text-red-200 shadow-2xl sm:left-1/2 sm:right-auto sm:max-w-lg sm:-translate-x-1/2"
        >
          <strong className="block">Editor error</strong>

          <span className="mt-1 block opacity-80">
            {editorError.message || String(editorError)}
          </span>

          <span className="mt-2 block text-[10px] opacity-60">
            Tap to dismiss
          </span>
        </button>
      )}
    </div>
  );
}

/*=========================================================
Export
=========================================================*/

const MemoizedFashionEditor = memo(FashionEditor);

MemoizedFashionEditor.displayName = "FashionEditor";

export default MemoizedFashionEditor;
