import { enrichGarmentTemplate } from "./GarmentTemplateRegistry.js";

/*
=========================================================
FashionVision Clothing Templates
Realistic Dual-View 2D Fashion Flat Library
Version 4.0.0 — Dual-View Colours + Region Artwork
=========================================================
*/

/*=========================================================
Shared SVG Configuration
=========================================================*/

const SVG_WIDTH = 840;
const SVG_HEIGHT = 540;
const SVG_VIEW_BOX = `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`;

const DEFAULT_GARMENT_COLOUR = "#ffffff";
const GARMENT_OUTLINE = "#1f2937";
const SEAM_COLOUR = "#475569";
const FOLD_COLOUR = "#64748b";
const FRAME_COLOUR = "#cbd5e1";
const LABEL_COLOUR = "#334155";

const FRONT_VIEW_TRANSFORM = "translate(30 16) scale(0.9)";
const BACK_VIEW_TRANSFORM = "translate(440 16) scale(0.9)";

/*=========================================================
Region Artwork Configuration
=========================================================*/

export const CLOTHING_ARTWORK_TYPES = Object.freeze({
  IMAGE: "image",
  PATTERN: "pattern",
});

export const CLOTHING_ARTWORK_DEFAULTS = Object.freeze({
  type: CLOTHING_ARTWORK_TYPES.IMAGE,
  scale: 1,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
  opacity: 1,
  fit: "contain",
});

const CLOTHING_ARTWORK_BOXES = Object.freeze({
  "kurta": Object.freeze({
    "frontBody": Object.freeze({"x": 148.38, "y": 80.88, "width": 102.62, "height": 237.0}),
    "frontHem": Object.freeze({"x": 150.75, "y": 317.75, "width": 97.62, "height": 15.38}),
    "frontLeftSleeve": Object.freeze({"x": 34.5, "y": 80.0, "width": 121.62, "height": 52.75}),
    "frontNeckline": Object.freeze({"x": 170.0, "y": 82.12, "width": 60.12, "height": 20.5}),
    "frontRightSleeve": Object.freeze({"x": 244.0, "y": 80.12, "width": 132.88, "height": 53.0}),
    "backLeftSleeve": Object.freeze({"x": 23.25, "y": 80.12, "width": 132.88, "height": 53.5}),
    "backHem": Object.freeze({"x": 146.88, "y": 317.75, "width": 107.62, "height": 15.25}),
    "backBody": Object.freeze({"x": 146.88, "y": 81.12, "width": 106.62, "height": 236.75}),
    "backRightSleeve": Object.freeze({"x": 244.0, "y": 80.25, "width": 121.62, "height": 53.38}),
    "backNeckline": Object.freeze({"x": 170.0, "y": 81.88, "width": 60.12, "height": 9.75}),
  }),
  "suruwal": Object.freeze({
    "frontWaistband": Object.freeze({"x": 130.62, "y": 78.0, "width": 139.0, "height": 38.75}),
    "frontLeftLeg": Object.freeze({"x": 128.0, "y": 116.62, "width": 72.12, "height": 265.12}),
    "frontRightLeg": Object.freeze({"x": 200.0, "y": 116.62, "width": 71.88, "height": 266.0}),
    "backRightLeg": Object.freeze({"x": 200.0, "y": 116.62, "width": 72.12, "height": 265.25}),
    "backLeftLeg": Object.freeze({"x": 128.25, "y": 116.62, "width": 71.88, "height": 266.0}),
    "backWaistband": Object.freeze({"x": 130.62, "y": 90.38, "width": 138.88, "height": 26.38}),
  }),
  tshirt: Object.freeze({
    frontBody: Object.freeze({
      x: 126,
      y: 112,
      width: 148,
      height: 276,
    }),

    backBody: Object.freeze({
      x: 126,
      y: 104,
      width: 148,
      height: 284,
    }),

    frontLeftSleeve: Object.freeze({
      x: 58,
      y: 86,
      width: 78,
      height: 100,
    }),

    frontRightSleeve: Object.freeze({
      x: 264,
      y: 86,
      width: 78,
      height: 100,
    }),

    backLeftSleeve: Object.freeze({
      x: 58,
      y: 86,
      width: 78,
      height: 100,
    }),

    backRightSleeve: Object.freeze({
      x: 264,
      y: 86,
      width: 78,
      height: 100,
    }),

    frontCollar: Object.freeze({
      x: 145,
      y: 72,
      width: 110,
      height: 54,
    }),

    backCollar: Object.freeze({
      x: 145,
      y: 72,
      width: 110,
      height: 40,
    }),
  }),

  "oversized-tshirt": Object.freeze({
    frontBody: Object.freeze({ x: 118, y: 114, width: 164, height: 285 }),
    backBody: Object.freeze({ x: 118, y: 100, width: 164, height: 299 }),
    frontLeftSleeve: Object.freeze({ x: 25, y: 94, width: 94, height: 113 }),
    frontRightSleeve: Object.freeze({ x: 281, y: 94, width: 94, height: 113 }),
    backLeftSleeve: Object.freeze({ x: 25, y: 94, width: 94, height: 113 }),
    backRightSleeve: Object.freeze({ x: 281, y: 94, width: 94, height: 113 }),
    frontCollar: Object.freeze({ x: 143, y: 78, width: 114, height: 54 }),
    backCollar: Object.freeze({ x: 143, y: 78, width: 114, height: 37 }),
    frontHem: Object.freeze({ x: 118, y: 397, width: 164, height: 36 }),
    backHem: Object.freeze({ x: 118, y: 397, width: 164, height: 36 }),
  }),

  // Phase 4.2E: long-sleeve crew-neck tee; front/back body, sleeves, rib cuffs and collar.
  "long-sleeve-tshirt": Object.freeze({
    frontBody: Object.freeze({ x: 126, y: 104, width: 148, height: 320 }),
    backBody: Object.freeze({ x: 126, y: 98, width: 148, height: 326 }),
    frontLeftSleeve: Object.freeze({ x: 47, y: 91, width: 88, height: 192 }),
    frontRightSleeve: Object.freeze({ x: 265, y: 91, width: 88, height: 192 }),
    backLeftSleeve: Object.freeze({ x: 47, y: 91, width: 88, height: 192 }),
    backRightSleeve: Object.freeze({ x: 265, y: 91, width: 88, height: 192 }),
    frontLeftCuff: Object.freeze({ x: 39, y: 273, width: 45, height: 41 }),
    frontRightCuff: Object.freeze({ x: 316, y: 273, width: 45, height: 41 }),
    backLeftCuff: Object.freeze({ x: 39, y: 273, width: 45, height: 41 }),
    backRightCuff: Object.freeze({ x: 316, y: 273, width: 45, height: 41 }),
    frontCollar: Object.freeze({ x: 140, y: 76, width: 120, height: 50 }),
    backCollar: Object.freeze({ x: 140, y: 76, width: 120, height: 36 }),
  }),

  // Phase 4.2F: cropped tee; exact region IDs used for future Sketchfab 3D conversion.
  "crop-top": Object.freeze({
    frontBody: Object.freeze({ x: 140, y: 113, width: 120, height: 206 }),
    backBody: Object.freeze({ x: 140, y: 108, width: 120, height: 211 }),
    frontLeftSleeve: Object.freeze({ x: 69, y: 95, width: 78, height: 92 }),
    frontRightSleeve: Object.freeze({ x: 253, y: 95, width: 78, height: 92 }),
    backLeftSleeve: Object.freeze({ x: 69, y: 95, width: 78, height: 92 }),
    backRightSleeve: Object.freeze({ x: 253, y: 95, width: 78, height: 92 }),
    frontCollar: Object.freeze({ x: 146, y: 76, width: 108, height: 59 }),
    backCollar: Object.freeze({ x: 146, y: 76, width: 108, height: 40 }),
    frontHem: Object.freeze({ x: 149, y: 312, width: 102, height: 29 }),
    backHem: Object.freeze({ x: 149, y: 312, width: 102, height: 29 }),
  }),

  // Phase 4.2D: classic short-sleeve polo, matching the adapted Sketchfab model.
  polo: Object.freeze({
    frontBody: Object.freeze({ x: 123, y: 124, width: 154, height: 280 }),
    backBody: Object.freeze({ x: 123, y: 109, width: 154, height: 295 }),
    frontLeftSleeve: Object.freeze({ x: 57, y: 83, width: 80, height: 111 }),
    frontRightSleeve: Object.freeze({ x: 263, y: 83, width: 80, height: 111 }),
    backLeftSleeve: Object.freeze({ x: 57, y: 83, width: 80, height: 111 }),
    backRightSleeve: Object.freeze({ x: 263, y: 83, width: 80, height: 111 }),
    frontLeftCuff: Object.freeze({ x: 58, y: 162, width: 53, height: 32 }),
    frontRightCuff: Object.freeze({ x: 289, y: 162, width: 53, height: 32 }),
    backLeftCuff: Object.freeze({ x: 58, y: 162, width: 53, height: 32 }),
    backRightCuff: Object.freeze({ x: 289, y: 162, width: 53, height: 32 }),
    frontCollar: Object.freeze({ x: 139, y: 68, width: 122, height: 92 }),
    backCollar: Object.freeze({ x: 139, y: 68, width: 122, height: 57 }),
    frontPlacket: Object.freeze({ x: 188, y: 125, width: 24, height: 86 }),
  }),

  shirt: Object.freeze({
    frontLeftBody: Object.freeze({
      x: 126,
      y: 112,
      width: 74,
      height: 286,
    }),

    frontRightBody: Object.freeze({
      x: 200,
      y: 112,
      width: 74,
      height: 286,
    }),

    backBody: Object.freeze({
      x: 126,
      y: 108,
      width: 148,
      height: 292,
    }),

    frontLeftSleeve: Object.freeze({
      x: 60,
      y: 86,
      width: 78,
      height: 102,
    }),

    frontRightSleeve: Object.freeze({
      x: 262,
      y: 86,
      width: 78,
      height: 102,
    }),

    backLeftSleeve: Object.freeze({
      x: 60,
      y: 86,
      width: 78,
      height: 102,
    }),

    backRightSleeve: Object.freeze({
      x: 262,
      y: 86,
      width: 78,
      height: 102,
    }),

    frontLeftCollar: Object.freeze({
      x: 139,
      y: 67,
      width: 61,
      height: 68,
    }),

    frontRightCollar: Object.freeze({
      x: 200,
      y: 67,
      width: 61,
      height: 68,
    }),

    backCollar: Object.freeze({
      x: 145,
      y: 67,
      width: 110,
      height: 45,
    }),

    frontPocket: Object.freeze({
      x: 228,
      y: 180,
      width: 35,
      height: 56,
    }),
  }),

  hoodie: Object.freeze({
    frontBody: Object.freeze({
      x: 126,
      y: 140,
      width: 148,
      height: 238,
    }),

    backBody: Object.freeze({
      x: 126,
      y: 132,
      width: 148,
      height: 246,
    }),

    frontLeftSleeve: Object.freeze({
      x: 55,
      y: 112,
      width: 82,
      height: 112,
    }),

    frontRightSleeve: Object.freeze({
      x: 263,
      y: 112,
      width: 82,
      height: 112,
    }),

    backLeftSleeve: Object.freeze({
      x: 55,
      y: 112,
      width: 82,
      height: 112,
    }),

    backRightSleeve: Object.freeze({
      x: 263,
      y: 112,
      width: 82,
      height: 112,
    }),

    frontHood: Object.freeze({
      x: 150,
      y: 28,
      width: 100,
      height: 116,
    }),

    backHood: Object.freeze({
      x: 150,
      y: 28,
      width: 100,
      height: 116,
    }),

    frontPocket: Object.freeze({
      x: 148,
      y: 278,
      width: 104,
      height: 86,
    }),

    frontHem: Object.freeze({
      x: 126,
      y: 388,
      width: 148,
      height: 37,
    }),

    backHem: Object.freeze({
      x: 126,
      y: 388,
      width: 148,
      height: 37,
    }),

    frontLeftCuff: Object.freeze({
      x: 47,
      y: 170,
      width: 50,
      height: 54,
    }),

    frontRightCuff: Object.freeze({
      x: 303,
      y: 170,
      width: 50,
      height: 54,
    }),

    backLeftCuff: Object.freeze({
      x: 47,
      y: 170,
      width: 50,
      height: 54,
    }),

    backRightCuff: Object.freeze({
      x: 303,
      y: 170,
      width: 50,
      height: 54,
    }),
  }),

  dress: Object.freeze({
    frontBodice: Object.freeze({ x: 140, y: 80, width: 120, height: 132 }),
    backBodice: Object.freeze({ x: 140, y: 80, width: 120, height: 132 }),
    frontSkirt: Object.freeze({ x: 104, y: 224, width: 192, height: 244 }),
    backSkirt: Object.freeze({ x: 104, y: 224, width: 192, height: 244 }),
    frontLeftSleeve: Object.freeze({ x: 62, y: 69, width: 100, height: 104 }),
    frontRightSleeve: Object.freeze({ x: 238, y: 69, width: 100, height: 104 }),
    backLeftSleeve: Object.freeze({ x: 62, y: 69, width: 100, height: 104 }),
    backRightSleeve: Object.freeze({ x: 238, y: 69, width: 100, height: 104 }),
    frontWaistband: Object.freeze({ x: 144, y: 198, width: 112, height: 34 }),
    backWaistband: Object.freeze({ x: 144, y: 198, width: 112, height: 34 }),
    frontNeckline: Object.freeze({ x: 160, y: 71, width: 80, height: 49 }),
    backNeckline: Object.freeze({ x: 160, y: 71, width: 80, height: 26 }),
  }),

  pants: Object.freeze({
    frontWaistband: Object.freeze({
      x: 120,
      y: 66,
      width: 160,
      height: 42,
    }),

    backWaistband: Object.freeze({
      x: 120,
      y: 66,
      width: 160,
      height: 42,
    }),

    frontLeftLeg: Object.freeze({
      x: 124,
      y: 108,
      width: 76,
      height: 334,
    }),

    frontRightLeg: Object.freeze({
      x: 200,
      y: 108,
      width: 76,
      height: 334,
    }),

    backLeftLeg: Object.freeze({
      x: 124,
      y: 108,
      width: 76,
      height: 334,
    }),

    backRightLeg: Object.freeze({
      x: 200,
      y: 108,
      width: 76,
      height: 334,
    }),

    frontLeftPocket: Object.freeze({
      x: 126,
      y: 112,
      width: 64,
      height: 60,
    }),

    frontRightPocket: Object.freeze({
      x: 210,
      y: 112,
      width: 64,
      height: 60,
    }),

    backLeftPocket: Object.freeze({
      x: 135,
      y: 134,
      width: 49,
      height: 58,
    }),

    backRightPocket: Object.freeze({
      x: 216,
      y: 134,
      width: 49,
      height: 58,
    }),
  }),

  // Phase 4.2G — slim straight-leg Grey Jeans derived from real Sketchfab model.
  // Phase 4.4 — Women's Fitted Tailored Blazer, source Latitude23 Sketchfab.
  "womens-blazer": Object.freeze({
    frontLeftBody: Object.freeze({x: 151, y: 100, width: 58, height: 300}),
    frontRightBody: Object.freeze({x: 191, y: 100, width: 58, height: 300}),
    backBody: Object.freeze({x: 148, y: 98, width: 104, height: 300}),
    sideLeftBody: Object.freeze({x: 142, y: 148, width: 26, height: 247}),
    sideRightBody: Object.freeze({x: 232, y: 148, width: 26, height: 247}),
    frontLeftSleeve: Object.freeze({x: 36, y: 102, width: 122, height: 246}),
    frontRightSleeve: Object.freeze({x: 242, y: 102, width: 122, height: 246}),
    backLeftSleeve: Object.freeze({x: 36, y: 102, width: 122, height: 246}),
    backRightSleeve: Object.freeze({x: 242, y: 102, width: 122, height: 246}),
    frontLeftLapel: Object.freeze({x: 155, y: 96, width: 49, height: 112}),
    frontRightLapel: Object.freeze({x: 196, y: 96, width: 49, height: 112}),
    topCollar: Object.freeze({x: 165, y: 70, width: 70, height: 42}),
    backInnerCollar: Object.freeze({x: 171, y: 71, width: 58, height: 42}),
  }),

  jeans: Object.freeze({
    frontWaistband: Object.freeze({ x: 124, y: 66, width: 152, height: 45 }),
    backWaistband: Object.freeze({ x: 124, y: 66, width: 152, height: 45 }),
    frontLeftLeg: Object.freeze({ x: 123, y: 108, width: 76, height: 335 }),
    frontRightLeg: Object.freeze({ x: 201, y: 108, width: 76, height: 335 }),
    backLeftLeg: Object.freeze({ x: 123, y: 108, width: 76, height: 335 }),
    backRightLeg: Object.freeze({ x: 201, y: 108, width: 76, height: 335 }),
    frontLeftPocket: Object.freeze({ x: 129, y: 112, width: 59, height: 65 }),
    frontRightPocket: Object.freeze({ x: 212, y: 112, width: 59, height: 65 }),
    backLeftPocket: Object.freeze({ x: 132, y: 136, width: 52, height: 76 }),
    backRightPocket: Object.freeze({ x: 216, y: 136, width: 52, height: 76 }),
  }),

  skirt: Object.freeze({
    frontWaistband: Object.freeze({
      x: 120,
      y: 76,
      width: 160,
      height: 46,
    }),

    backWaistband: Object.freeze({
      x: 120,
      y: 76,
      width: 160,
      height: 46,
    }),

    frontLeftPanel: Object.freeze({
      x: 70,
      y: 122,
      width: 106,
      height: 310,
    }),

    frontCentrePanel: Object.freeze({
      x: 160,
      y: 122,
      width: 80,
      height: 310,
    }),

    frontRightPanel: Object.freeze({
      x: 224,
      y: 122,
      width: 106,
      height: 310,
    }),

    backLeftPanel: Object.freeze({
      x: 70,
      y: 122,
      width: 106,
      height: 310,
    }),

    backCentrePanel: Object.freeze({
      x: 160,
      y: 122,
      width: 80,
      height: 310,
    }),

    backRightPanel: Object.freeze({
      x: 224,
      y: 122,
      width: 106,
      height: 310,
    }),
  }),
});

/*=========================================================
Generic Helpers
=========================================================*/

function normaliseHexColour(value, fallback = DEFAULT_GARMENT_COLOUR) {
  if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())) {
    return value.trim().toLowerCase();
  }

  return fallback;
}

function normaliseColourMap(colours, defaults) {
  const source =
    colours && typeof colours === "object" && !Array.isArray(colours)
      ? colours
      : {};

  return Object.keys(defaults).reduce((result, key) => {
    result[key] = normaliseHexColour(source[key], defaults[key]);

    return result;
  }, {});
}

function freezeRegions(regions) {
  return Object.freeze(
    regions.map((region) =>
      Object.freeze({
        ...region,
      }),
    ),
  );
}

function resolveTemplate(templateOrId) {
  if (
    templateOrId &&
    typeof templateOrId === "object" &&
    !Array.isArray(templateOrId)
  ) {
    return templateOrId;
  }

  return getClothingTemplate(templateOrId);
}

function clampNumber(value, minimum, maximum, fallback) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(maximum, numericValue));
}

function escapeXmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function createSafeSvgId(value) {
  return (
    String(value || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "region"
  );
}

function normaliseArtworkSource(value) {
  const source = typeof value === "string" ? value.trim() : "";

  if (!source) {
    return "";
  }

  /*
  Artwork is intentionally self-contained.

  This keeps:
  - cloud project saves portable
  - local .fashion.json projects portable
  - PNG export independent from remote image servers
  - clothing artwork available after reload

  Accepted:
  PNG
  JPG / JPEG
  WebP
  GIF
  SVG
  */

  if (
    /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml)(?:;[^,]*)?,/i.test(source)
  ) {
    return source;
  }

  return "";
}

function normaliseArtworkEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = normaliseArtworkSource(
    value.source || value.src || value.dataUrl || value.imageSource || "",
  );

  if (!source) {
    return null;
  }

  const requestedType = String(value.type || "")
    .trim()
    .toLowerCase();

  const type =
    requestedType === CLOTHING_ARTWORK_TYPES.PATTERN
      ? CLOTHING_ARTWORK_TYPES.PATTERN
      : CLOTHING_ARTWORK_TYPES.IMAGE;

  const requestedFit = String(value.fit || "")
    .trim()
    .toLowerCase();

  const fit = ["contain", "cover", "fill"].includes(requestedFit)
    ? requestedFit
    : type === CLOTHING_ARTWORK_TYPES.PATTERN
      ? "cover"
      : "contain";

  return {
    type,

    source,

    scale: clampNumber(value.scale, 0.05, 12, 1),

    rotation: clampNumber(value.rotation, -3600, 3600, 0),

    offsetX: clampNumber(value.offsetX, -2000, 2000, 0),

    offsetY: clampNumber(value.offsetY, -2000, 2000, 0),

    opacity: clampNumber(value.opacity, 0, 1, 1),

    fit,
  };
}

function getArtworkBox(templateId, regionId) {
  const templateBoxes =
    CLOTHING_ARTWORK_BOXES[String(templateId || "").trim()] || {};

  const box = templateBoxes[String(regionId || "").trim()];

  if (box) {
    return {
      ...box,
    };
  }

  return {
    x: 80,
    y: 60,
    width: 240,
    height: 360,
  };
}

function getPreserveAspectRatio(fit) {
  if (fit === "fill") {
    return "none";
  }

  if (fit === "cover") {
    return "xMidYMid slice";
  }

  return "xMidYMid meet";
}

function regionOutlinePath(d, strokeWidth = 3.5) {
  return `
    <path
      d="${d}"
      fill="none"
      stroke="${GARMENT_OUTLINE}"
      stroke-width="${strokeWidth}"
      stroke-linecap="round"
      stroke-linejoin="round"
      pointer-events="none"
    />
  `.trim();
}

function renderRegionArtwork(templateId, regionId, regionPathData, artworkMap) {
  const entry = normaliseArtworkEntry(
    artworkMap && typeof artworkMap === "object" && !Array.isArray(artworkMap)
      ? artworkMap[regionId]
      : null,
  );

  if (!entry) {
    return "";
  }

  const safeTemplateId = createSafeSvgId(templateId);

  const safeRegionId = createSafeSvgId(regionId);

  const box = getArtworkBox(templateId, regionId);

  /*
  =====================================================
  Repeating Pattern
  =====================================================
  */

  if (entry.type === CLOTHING_ARTWORK_TYPES.PATTERN) {
    const patternId = `fashion-pattern-${safeTemplateId}-${safeRegionId}`;

    const tileSize = Math.max(8, Math.min(600, 84 * entry.scale));

    const tileX = box.x + entry.offsetX;

    const tileY = box.y + entry.offsetY;

    return `
      <defs>
        <pattern
          id="${patternId}"
          patternUnits="userSpaceOnUse"
          x="${tileX}"
          y="${tileY}"
          width="${tileSize}"
          height="${tileSize}"
          patternTransform="
            rotate(
              ${entry.rotation}
              ${box.x + box.width / 2}
              ${box.y + box.height / 2}
            )
          "
        >
          <image
            href="${escapeXmlAttribute(entry.source)}"
            x="0"
            y="0"
            width="${tileSize}"
            height="${tileSize}"
            preserveAspectRatio="${getPreserveAspectRatio(entry.fit)}"
          />
        </pattern>
      </defs>

      <path
        data-clothing-artwork-region="${safeRegionId}"
        d="${regionPathData}"
        fill="url(#${patternId})"
        stroke="none"
        opacity="${entry.opacity}"
      />
    `.trim();
  }

  /*
  =====================================================
  Single Graphic / Logo / Image
  =====================================================
  */

  const clipId = `fashion-clip-${safeTemplateId}-${safeRegionId}`;

  const scaledWidth = Math.max(1, box.width * entry.scale);

  const scaledHeight = Math.max(1, box.height * entry.scale);

  const artworkX = box.x + (box.width - scaledWidth) / 2 + entry.offsetX;

  const artworkY = box.y + (box.height - scaledHeight) / 2 + entry.offsetY;

  const rotationCenterX = artworkX + scaledWidth / 2;

  const rotationCenterY = artworkY + scaledHeight / 2;

  return `
    <defs>
      <clipPath
        id="${clipId}"
        clipPathUnits="userSpaceOnUse"
      >
        <path
          d="${regionPathData}"
        />
      </clipPath>
    </defs>

    <g
      data-clothing-artwork-region="${safeRegionId}"
      clip-path="url(#${clipId})"
      opacity="${entry.opacity}"
    >
      <image
        href="${escapeXmlAttribute(entry.source)}"
        x="${artworkX}"
        y="${artworkY}"
        width="${scaledWidth}"
        height="${scaledHeight}"
        preserveAspectRatio="${getPreserveAspectRatio(entry.fit)}"
        transform="
          rotate(
            ${entry.rotation}
            ${rotationCenterX}
            ${rotationCenterY}
          )
        "
      />
    </g>
  `.trim();
}

function editableRegionPath(
  templateId,
  artworkMap,
  regionId,
  fill,
  d,
  options = {},
) {
  const safeOptions =
    options && typeof options === "object" && !Array.isArray(options)
      ? options
      : {};

  const strokeWidth = Number.isFinite(Number(safeOptions.strokeWidth))
    ? Number(safeOptions.strokeWidth)
    : 3.5;

  const baseRegion = regionPath(regionId, fill, d, safeOptions);

  const artwork = renderRegionArtwork(templateId, regionId, d, artworkMap);

  if (!artwork) {
    return baseRegion;
  }

  return `
    ${baseRegion}

    ${artwork}

    ${regionOutlinePath(d, strokeWidth)}
  `.trim();
}

/*=========================================================
Region Path
=========================================================*/

function regionPath(regionId, fill, d, options = {}) {
  const safeOptions =
    options && typeof options === "object" && !Array.isArray(options)
      ? options
      : {};

  const strokeWidth = Number.isFinite(Number(safeOptions.strokeWidth))
    ? Number(safeOptions.strokeWidth)
    : 3.5;

  const extraAttributes =
    typeof safeOptions.extraAttributes === "string"
      ? safeOptions.extraAttributes.trim()
      : "";

  return `
    <path
      data-clothing-region="${regionId}"
      fill="${fill}"
      stroke="${GARMENT_OUTLINE}"
      stroke-width="${strokeWidth}"
      stroke-linecap="round"
      stroke-linejoin="round"
      d="${d}"
      ${extraAttributes}
    />
  `.trim();
}

function detailPath(
  d,
  { stroke = SEAM_COLOUR, strokeWidth = 1.8, opacity = 0.9, dash = "" } = {},
) {
  return `
    <path
      d="${d}"
      fill="none"
      stroke="${stroke}"
      stroke-width="${strokeWidth}"
      stroke-linecap="round"
      stroke-linejoin="round"
      opacity="${opacity}"
      ${dash ? `stroke-dasharray="${dash}"` : ""}
    />
  `.trim();
}

function detailLine(
  x1,
  y1,
  x2,
  y2,
  { stroke = SEAM_COLOUR, strokeWidth = 1.8, opacity = 0.9, dash = "" } = {},
) {
  return `
    <line
      x1="${x1}"
      y1="${y1}"
      x2="${x2}"
      y2="${y2}"
      stroke="${stroke}"
      stroke-width="${strokeWidth}"
      stroke-linecap="round"
      opacity="${opacity}"
      ${dash ? `stroke-dasharray="${dash}"` : ""}
    />
  `.trim();
}

function foldPath(d, opacity = 0.35) {
  return detailPath(d, {
    stroke: FOLD_COLOUR,

    strokeWidth: 1.35,

    opacity,
  });
}

/*=========================================================
Dual View Board
=========================================================*/

function createDualViewSvg({ front, back, label, viewBox = SVG_VIEW_BOX }) {
  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="${viewBox}"
  width="${SVG_WIDTH}"
  height="${SVG_HEIGHT}"
  role="img"
  aria-label="${label} front and back fashion flat"
  shape-rendering="geometricPrecision"
>
  <rect
    x="12"
    y="10"
    width="396"
    height="500"
    rx="20"
    fill="none"
    stroke="${FRAME_COLOUR}"
    stroke-width="2"
    stroke-dasharray="8 8"
  />

  <rect
    x="432"
    y="10"
    width="396"
    height="500"
    rx="20"
    fill="none"
    stroke="${FRAME_COLOUR}"
    stroke-width="2"
    stroke-dasharray="8 8"
  />

  <g
    data-clothing-view="front"
    transform="${FRONT_VIEW_TRANSFORM}"
  >
    ${front}
  </g>

  <g
    data-clothing-view="back"
    transform="${BACK_VIEW_TRANSFORM}"
  >
    ${back}
  </g>

  <text
    x="210"
    y="528"
    text-anchor="middle"
    font-family="Arial, sans-serif"
    font-size="18"
    font-weight="700"
    fill="${LABEL_COLOUR}"
  >
    FRONT
  </text>

  <text
    x="630"
    y="528"
    text-anchor="middle"
    font-family="Arial, sans-serif"
    font-size="18"
    font-weight="700"
    fill="${LABEL_COLOUR}"
  >
    BACK
  </text>
</svg>
  `.trim();
}

/*=========================================================
T-Shirt
=========================================================*/

export const TSHIRT_DEFAULT_COLOURS = Object.freeze({
  frontBody: "#ffffff",

  backBody: "#ffffff",

  frontLeftSleeve: "#ffffff",

  frontRightSleeve: "#ffffff",

  backLeftSleeve: "#ffffff",

  backRightSleeve: "#ffffff",

  frontCollar: "#ffffff",

  backCollar: "#ffffff",
});

export const TSHIRT_COLOUR_REGIONS = freezeRegions([
  {
    id: "frontBody",

    label: "Front Body",

    view: "front",

    group: "body",
  },

  {
    id: "backBody",

    label: "Back Body",

    view: "back",

    group: "body",
  },

  {
    id: "frontLeftSleeve",

    label: "Front Left Sleeve",

    view: "front",

    group: "sleeves",
  },

  {
    id: "frontRightSleeve",

    label: "Front Right Sleeve",

    view: "front",

    group: "sleeves",
  },

  {
    id: "backLeftSleeve",

    label: "Back Left Sleeve",

    view: "back",

    group: "sleeves",
  },

  {
    id: "backRightSleeve",

    label: "Back Right Sleeve",

    view: "back",

    group: "sleeves",
  },

  {
    id: "frontCollar",

    label: "Front Collar",

    view: "front",

    group: "collar",
  },

  {
    id: "backCollar",

    label: "Back Collar",

    view: "back",

    group: "collar",
  },
]);

export function createTshirtSvg(colours = {}, artwork = {}) {
  const c = normaliseColourMap(colours, TSHIRT_DEFAULT_COLOURS);

  const front = `
    ${editableRegionPath(
      "tshirt",
      artwork,
      "frontBody",
      c.frontBody,
      "M145 76 L126 95 L126 420 Q200 432 274 420 L274 95 L255 76 C248 102 226 116 200 116 C174 116 152 102 145 76 Z",
    )}

    ${editableRegionPath(
      "tshirt",
      artwork,
      "frontLeftSleeve",
      c.frontLeftSleeve,
      "M145 76 L105 88 L60 145 L96 181 L126 145 L126 95 Z",
    )}

    ${editableRegionPath(
      "tshirt",
      artwork,
      "frontRightSleeve",
      c.frontRightSleeve,
      "M255 76 L295 88 L340 145 L304 181 L274 145 L274 95 Z",
    )}

    ${editableRegionPath(
      "tshirt",
      artwork,
      "frontCollar",
      c.frontCollar,
      "M145 76 C155 108 176 124 200 124 C224 124 245 108 255 76 C247 101 225 114 200 114 C175 114 153 101 145 76 Z",
    )}

    ${detailPath("M126 398 Q200 410 274 398", {
      strokeWidth: 1.7,
    })}

    ${detailPath("M76 153 L102 179", {
      strokeWidth: 1.6,
    })}

    ${detailPath("M324 153 L298 179", {
      strokeWidth: 1.6,
    })}

    ${foldPath("M150 165 Q164 178 170 205")}

    ${foldPath("M250 165 Q236 178 230 205")}

    ${foldPath("M176 180 Q188 215 184 252", 0.28)}

    ${foldPath("M224 180 Q212 215 216 252", 0.28)}
  `;

  const back = `
    ${editableRegionPath(
      "tshirt",
      artwork,
      "backBody",
      c.backBody,
      "M145 76 L126 95 L126 420 Q200 432 274 420 L274 95 L255 76 C244 92 226 101 200 101 C174 101 156 92 145 76 Z",
    )}

    ${editableRegionPath(
      "tshirt",
      artwork,
      "backLeftSleeve",
      c.backLeftSleeve,
      "M145 76 L105 88 L60 145 L96 181 L126 145 L126 95 Z",
    )}

    ${editableRegionPath(
      "tshirt",
      artwork,
      "backRightSleeve",
      c.backRightSleeve,
      "M255 76 L295 88 L340 145 L304 181 L274 145 L274 95 Z",
    )}

    ${editableRegionPath(
      "tshirt",
      artwork,
      "backCollar",
      c.backCollar,
      "M145 76 C158 96 176 106 200 106 C224 106 242 96 255 76 C244 92 226 101 200 101 C174 101 156 92 145 76 Z",
    )}

    ${detailPath("M126 398 Q200 410 274 398", {
      strokeWidth: 1.7,
    })}

    ${detailPath("M76 153 L102 179", {
      strokeWidth: 1.6,
    })}

    ${detailPath("M324 153 L298 179", {
      strokeWidth: 1.6,
    })}

    ${detailPath("M151 124 Q200 142 249 124", {
      strokeWidth: 1.5,

      opacity: 0.7,
    })}

    ${foldPath("M156 168 Q170 188 174 218")}

    ${foldPath("M244 168 Q230 188 226 218")}
  `;

  return createDualViewSvg({
    front,
    back,
    label: "T-Shirt",
  });
}

const TSHIRT_SVG = createTshirtSvg(TSHIRT_DEFAULT_COLOURS);

/*=========================================================
Oversized T-Shirt — Original streetwear fit, Phase 4.2C
=========================================================*/
export const OVERSIZED_TSHIRT_DEFAULT_COLOURS = Object.freeze({
  frontBody: "#ffffff", backBody: "#ffffff",
  frontLeftSleeve: "#ffffff", frontRightSleeve: "#ffffff",
  backLeftSleeve: "#ffffff", backRightSleeve: "#ffffff",
  frontCollar: "#ffffff", backCollar: "#ffffff",
  frontHem: "#ffffff", backHem: "#ffffff",
});

export const OVERSIZED_TSHIRT_COLOUR_REGIONS = freezeRegions([
  { id: "frontBody", label: "Front Body", view: "front", group: "body" },
  { id: "backBody", label: "Back Body", view: "back", group: "body" },
  { id: "frontLeftSleeve", label: "Front Left Sleeve", view: "front", group: "sleeves" },
  { id: "frontRightSleeve", label: "Front Right Sleeve", view: "front", group: "sleeves" },
  { id: "backLeftSleeve", label: "Back Left Sleeve", view: "back", group: "sleeves" },
  { id: "backRightSleeve", label: "Back Right Sleeve", view: "back", group: "sleeves" },
  { id: "frontCollar", label: "Front Rib Collar", view: "front", group: "collar" },
  { id: "backCollar", label: "Back Rib Collar", view: "back", group: "collar" },
  { id: "frontHem", label: "Front Bottom Rib", view: "front", group: "hem" },
  { id: "backHem", label: "Back Bottom Rib", view: "back", group: "hem" },
]);

export function createOversizedTshirtSvg(colours = {}, artwork = {}) {
  const c = normaliseColourMap(colours, OVERSIZED_TSHIRT_DEFAULT_COLOURS);
  const bodyFront = "M143 83 L118 108 L118 402 Q200 416 282 402 L282 108 L257 83 C245 103 225 117 200 117 C175 117 155 103 143 83 Z";
  const bodyBack = "M143 83 L118 108 L118 402 Q200 416 282 402 L282 108 L257 83 C243 96 223 105 200 105 C177 105 157 96 143 83 Z";
  const sleeveL = "M143 83 L95 98 Q82 107 71 125 L25 177 Q52 201 85 211 L118 172 L118 108 Z";
  const sleeveR = "M257 83 L305 98 Q318 107 329 125 L375 177 Q348 201 315 211 L282 172 L282 108 Z";
  const hem = "M118 397 Q200 410 282 397 L282 429 Q200 441 118 429 Z";
  const front = `
    ${editableRegionPath("oversized-tshirt", artwork, "frontBody", c.frontBody, bodyFront)}
    ${editableRegionPath("oversized-tshirt", artwork, "frontLeftSleeve", c.frontLeftSleeve, sleeveL)}
    ${editableRegionPath("oversized-tshirt", artwork, "frontRightSleeve", c.frontRightSleeve, sleeveR)}
    ${editableRegionPath("oversized-tshirt", artwork, "frontHem", c.frontHem, hem)}
    ${editableRegionPath("oversized-tshirt", artwork, "frontCollar", c.frontCollar,
      "M143 83 C155 110 178 126 200 126 C222 126 245 110 257 83 C248 105 228 117 200 117 C172 117 152 105 143 83 Z")}
    ${detailPath("M118 394 Q200 405 282 394", { strokeWidth: 1.4 })}
    ${detailPath("M37 176 Q62 193 88 201", { strokeWidth: 1.7 })}
    ${detailPath("M363 176 Q338 193 312 201", { strokeWidth: 1.7 })}
    ${detailPath("M143 83 Q121 123 117 169", { strokeWidth: 1.4, opacity: 0.6 })}
    ${detailPath("M257 83 Q279 123 283 169", { strokeWidth: 1.4, opacity: 0.6 })}
    ${foldPath("M149 172 Q165 203 160 268", 0.35)}
    ${foldPath("M248 175 Q232 203 240 273", 0.35)}
    ${foldPath("M169 304 Q187 337 181 384", 0.28)}
    ${foldPath("M229 302 Q215 338 221 387", 0.28)}
  `;
  const back = `
    ${editableRegionPath("oversized-tshirt", artwork, "backBody", c.backBody, bodyBack)}
    ${editableRegionPath("oversized-tshirt", artwork, "backLeftSleeve", c.backLeftSleeve, sleeveL)}
    ${editableRegionPath("oversized-tshirt", artwork, "backRightSleeve", c.backRightSleeve, sleeveR)}
    ${editableRegionPath("oversized-tshirt", artwork, "backHem", c.backHem, hem)}
    ${editableRegionPath("oversized-tshirt", artwork, "backCollar", c.backCollar,
      "M143 83 C158 98 178 109 200 109 C222 109 242 98 257 83 C242 94 222 102 200 102 C178 102 158 94 143 83 Z")}
    ${detailPath("M132 136 Q200 159 268 136", { strokeWidth: 1.8, opacity: 0.7 })}
    ${detailPath("M118 394 Q200 405 282 394", { strokeWidth: 1.4 })}
    ${detailPath("M37 176 Q62 193 88 201", { strokeWidth: 1.7 })}
    ${detailPath("M363 176 Q338 193 312 201", { strokeWidth: 1.7 })}
    ${foldPath("M151 159 Q167 203 164 253", 0.32)}
    ${foldPath("M249 159 Q233 203 236 253", 0.32)}
    ${foldPath("M166 299 Q187 336 183 388", 0.25)}
    ${foldPath("M234 301 Q213 339 217 385", 0.25)}
  `;
  return createDualViewSvg({ front, back, label: "Oversized T-Shirt" });
}

const OVERSIZED_TSHIRT_SVG = createOversizedTshirtSvg(OVERSIZED_TSHIRT_DEFAULT_COLOURS);

/*=========================================================
Polo Shirt — Classic short-sleeve fashion flat, Phase 4.2D
13 independent front/back color and artwork regions.
Paired with the 13-mesh Sketchfab Polo GLB (CC BY 4.0).
=========================================================*/
export const POLO_DEFAULT_COLOURS = Object.freeze({
  frontBody: "#ffffff", backBody: "#ffffff",
  frontLeftSleeve: "#ffffff", frontRightSleeve: "#ffffff",
  backLeftSleeve: "#ffffff", backRightSleeve: "#ffffff",
  frontLeftCuff: "#ffffff", frontRightCuff: "#ffffff",
  backLeftCuff: "#ffffff", backRightCuff: "#ffffff",
  frontCollar: "#ffffff", backCollar: "#ffffff",
  frontPlacket: "#ffffff",
});

export const POLO_COLOUR_REGIONS = freezeRegions([
  { id: "frontBody", label: "Front Body", view: "front", group: "body" },
  { id: "backBody", label: "Back Body", view: "back", group: "body" },
  { id: "frontLeftSleeve", label: "Front Left Sleeve", view: "front", group: "sleeves" },
  { id: "frontRightSleeve", label: "Front Right Sleeve", view: "front", group: "sleeves" },
  { id: "backLeftSleeve", label: "Back Left Sleeve", view: "back", group: "sleeves" },
  { id: "backRightSleeve", label: "Back Right Sleeve", view: "back", group: "sleeves" },
  { id: "frontLeftCuff", label: "Front Left Cuff", view: "front", group: "cuffs" },
  { id: "frontRightCuff", label: "Front Right Cuff", view: "front", group: "cuffs" },
  { id: "backLeftCuff", label: "Back Left Cuff", view: "back", group: "cuffs" },
  { id: "backRightCuff", label: "Back Right Cuff", view: "back", group: "cuffs" },
  { id: "frontCollar", label: "Front Collar", view: "front", group: "collar" },
  { id: "backCollar", label: "Back Collar", view: "back", group: "collar" },
  { id: "frontPlacket", label: "Front Button Placket", view: "front", group: "placket" },
]);

export function createPoloSvg(colours = {}, artwork = {}) {
  const c = normaliseColourMap(colours, POLO_DEFAULT_COLOURS);
  const frontBody = "M143 76 L123 97 L123 421 Q200 434 277 421 L277 97 L257 76 L219 111 L212 127 L188 127 L181 111 Z";
  const backBody = "M143 76 L123 97 L123 421 Q200 434 277 421 L277 97 L257 76 Q200 107 143 76 Z";
  const leftSleeve = "M143 76 L107 87 Q95 96 85 114 L58 165 L95 190 L123 153 L123 97 Z";
  const rightSleeve = "M257 76 L293 87 Q305 96 315 114 L342 165 L305 190 L277 153 L277 97 Z";
  const leftCuff = "M58 165 L95 190 L109 172 L73 148 Z";
  const rightCuff = "M342 165 L305 190 L291 172 L327 148 Z";
  const frontCollar = "M143 76 L168 70 L200 91 L181 142 L137 109 Z M257 76 L232 70 L200 91 L219 142 L263 109 Z";
  const backCollar = "M143 76 L161 69 Q200 88 239 69 L257 76 Q200 123 143 76 Z";
  const front = `
    ${editableRegionPath("polo", artwork, "frontBody", c.frontBody, frontBody)}
    ${editableRegionPath("polo", artwork, "frontLeftSleeve", c.frontLeftSleeve, leftSleeve)}
    ${editableRegionPath("polo", artwork, "frontRightSleeve", c.frontRightSleeve, rightSleeve)}
    ${editableRegionPath("polo", artwork, "frontLeftCuff", c.frontLeftCuff, leftCuff)}
    ${editableRegionPath("polo", artwork, "frontRightCuff", c.frontRightCuff, rightCuff)}
    ${editableRegionPath("polo", artwork, "frontPlacket", c.frontPlacket,
      "M188 116 L212 116 L212 205 Q200 209 188 205 Z", { strokeWidth: 2.2 })}
    ${editableRegionPath("polo", artwork, "frontCollar", c.frontCollar, frontCollar)}
    <!-- Decorative left chest pocket, corresponding to the downloaded 3D model.
         Artwork/colour remains on frontBody; no new saved region IDs. -->
    <path d="M231 181 L257 181 L255 222 Q244 229 233 222 Z"
      fill="none" stroke="${SEAM_COLOUR}" stroke-width="2"
      stroke-linejoin="round" pointer-events="none" />
    ${detailPath("M232 185 L256 185", { strokeWidth: 1.1, opacity: 0.6 })}
    ${detailLine(190, 125, 190, 202, { strokeWidth: 1.1, opacity: 0.5 })}
    ${detailLine(210, 125, 210, 202, { strokeWidth: 1.1, opacity: 0.5 })}
    <circle cx="200" cy="149" r="3.1" fill="${GARMENT_OUTLINE}" />
    <circle cx="200" cy="175" r="3.1" fill="${GARMENT_OUTLINE}" />
    <circle cx="200" cy="199" r="3.1" fill="${GARMENT_OUTLINE}" />
    ${detailPath("M123 400 Q200 412 277 400", { strokeWidth: 1.6 })}
    ${detailPath("M63 164 L96 186", { strokeWidth: 1.5 })}
    ${detailPath("M337 164 L304 186", { strokeWidth: 1.5 })}
    ${foldPath("M146 178 Q168 199 169 236", 0.28)}
    ${foldPath("M254 178 Q232 199 231 236", 0.28)}
    ${foldPath("M158 320 Q176 342 171 389", 0.22)}
    ${foldPath("M242 320 Q224 342 229 389", 0.22)}
  `;
  const back = `
    ${editableRegionPath("polo", artwork, "backBody", c.backBody, backBody)}
    ${editableRegionPath("polo", artwork, "backLeftSleeve", c.backLeftSleeve, leftSleeve)}
    ${editableRegionPath("polo", artwork, "backRightSleeve", c.backRightSleeve, rightSleeve)}
    ${editableRegionPath("polo", artwork, "backLeftCuff", c.backLeftCuff, leftCuff)}
    ${editableRegionPath("polo", artwork, "backRightCuff", c.backRightCuff, rightCuff)}
    ${editableRegionPath("polo", artwork, "backCollar", c.backCollar, backCollar)}
    ${detailPath("M134 132 Q200 153 266 132", { strokeWidth: 1.7, opacity: 0.75 })}
    ${detailPath("M123 400 Q200 412 277 400", { strokeWidth: 1.6 })}
    ${detailPath("M63 164 L96 186", { strokeWidth: 1.5 })}
    ${detailPath("M337 164 L304 186", { strokeWidth: 1.5 })}
    ${foldPath("M151 175 Q169 201 167 246", 0.26)}
    ${foldPath("M249 175 Q231 201 233 246", 0.26)}
    ${foldPath("M166 318 Q183 339 178 389", 0.22)}
    ${foldPath("M234 318 Q217 339 222 389", 0.22)}
  `;
  return createDualViewSvg({ front, back, label: "Polo Shirt" });
}

const POLO_SVG = createPoloSvg(POLO_DEFAULT_COLOURS);

/*=========================================================
Long-Sleeve T-Shirt — Phase 4.2E (2D first)
12 editable front/back regions. No 3D model is registered until a real
Sketchfab download is inspected, licensed, optimized and region-mapped.
=========================================================*/
export const LONG_SLEEVE_TSHIRT_DEFAULT_COLOURS = Object.freeze({
  frontBody: "#ffffff", backBody: "#ffffff",
  frontLeftSleeve: "#ffffff", frontRightSleeve: "#ffffff",
  backLeftSleeve: "#ffffff", backRightSleeve: "#ffffff",
  frontLeftCuff: "#ffffff", frontRightCuff: "#ffffff",
  backLeftCuff: "#ffffff", backRightCuff: "#ffffff",
  frontCollar: "#ffffff", backCollar: "#ffffff",
});

export const LONG_SLEEVE_TSHIRT_COLOUR_REGIONS = freezeRegions([
  { id: "frontBody", label: "Front Body", view: "front", group: "body" },
  { id: "backBody", label: "Back Body", view: "back", group: "body" },
  { id: "frontLeftSleeve", label: "Front Left Sleeve", view: "front", group: "sleeves" },
  { id: "frontRightSleeve", label: "Front Right Sleeve", view: "front", group: "sleeves" },
  { id: "backLeftSleeve", label: "Back Left Sleeve", view: "back", group: "sleeves" },
  { id: "backRightSleeve", label: "Back Right Sleeve", view: "back", group: "sleeves" },
  { id: "frontLeftCuff", label: "Front Left Rib Cuff", view: "front", group: "cuffs" },
  { id: "frontRightCuff", label: "Front Right Rib Cuff", view: "front", group: "cuffs" },
  { id: "backLeftCuff", label: "Back Left Rib Cuff", view: "back", group: "cuffs" },
  { id: "backRightCuff", label: "Back Right Rib Cuff", view: "back", group: "cuffs" },
  { id: "frontCollar", label: "Front Crew Collar", view: "front", group: "collar" },
  { id: "backCollar", label: "Back Crew Collar", view: "back", group: "collar" },
]);

export function createLongSleeveTshirtSvg(colours = {}, artwork = {}) {
  const templateId = "long-sleeve-tshirt";
  const c = normaliseColourMap(colours, LONG_SLEEVE_TSHIRT_DEFAULT_COLOURS);
  const bodyFront = "M143 78 L126 102 L126 426 Q200 438 274 426 L274 102 L257 78 C245 103 226 116 200 116 C174 116 155 103 143 78 Z";
  const bodyBack = "M143 78 L126 102 L126 426 Q200 438 274 426 L274 102 L257 78 C242 95 224 104 200 104 C176 104 158 95 143 78 Z";
  const sleeveLeft = "M143 78 L106 91 Q93 105 82 149 L47 276 Q62 286 82 282 L124 158 L126 102 Z";
  const sleeveRight = "M257 78 L294 91 Q307 105 318 149 L353 276 Q338 286 318 282 L276 158 L274 102 Z";
  const cuffLeft = "M47 276 Q64 286 82 282 L73 312 Q54 314 39 303 Z";
  const cuffRight = "M353 276 Q336 286 318 282 L327 312 Q346 314 361 303 Z";
  const frontCollar = "M143 78 C154 107 179 126 200 126 C221 126 246 107 257 78 C246 102 227 115 200 115 C173 115 154 102 143 78 Z";
  const backCollar = "M143 78 C162 98 181 108 200 108 C219 108 238 98 257 78 C243 94 224 101 200 101 C176 101 157 94 143 78 Z";
  const front = `
    ${editableRegionPath(templateId, artwork, "frontBody", c.frontBody, bodyFront)}
    ${editableRegionPath(templateId, artwork, "frontLeftSleeve", c.frontLeftSleeve, sleeveLeft)}
    ${editableRegionPath(templateId, artwork, "frontRightSleeve", c.frontRightSleeve, sleeveRight)}
    ${editableRegionPath(templateId, artwork, "frontLeftCuff", c.frontLeftCuff, cuffLeft)}
    ${editableRegionPath(templateId, artwork, "frontRightCuff", c.frontRightCuff, cuffRight)}
    ${editableRegionPath(templateId, artwork, "frontCollar", c.frontCollar, frontCollar)}
    ${detailPath("M126 404 Q200 414 274 404", { strokeWidth: 1.6 })}
    ${detailPath("M47 275 Q65 285 82 281", { strokeWidth: 1.3, opacity: 0.55 })}
    ${detailPath("M353 275 Q335 285 318 281", { strokeWidth: 1.3, opacity: 0.55 })}
    ${detailPath("M122 130 Q116 169 103 191", { strokeWidth: 1.3, opacity: 0.5 })}
    ${detailPath("M278 130 Q284 169 297 191", { strokeWidth: 1.3, opacity: 0.5 })}
    ${foldPath("M151 169 Q166 191 163 240", 0.27)}
    ${foldPath("M249 169 Q234 191 237 240", 0.27)}
    ${foldPath("M170 318 Q184 350 176 394", 0.2)}
    ${foldPath("M230 318 Q216 350 224 394", 0.2)}
  `;
  const back = `
    ${editableRegionPath(templateId, artwork, "backBody", c.backBody, bodyBack)}
    ${editableRegionPath(templateId, artwork, "backLeftSleeve", c.backLeftSleeve, sleeveLeft)}
    ${editableRegionPath(templateId, artwork, "backRightSleeve", c.backRightSleeve, sleeveRight)}
    ${editableRegionPath(templateId, artwork, "backLeftCuff", c.backLeftCuff, cuffLeft)}
    ${editableRegionPath(templateId, artwork, "backRightCuff", c.backRightCuff, cuffRight)}
    ${editableRegionPath(templateId, artwork, "backCollar", c.backCollar, backCollar)}
    ${detailPath("M135 130 Q200 154 265 130", { strokeWidth: 1.6, opacity: 0.65 })}
    ${detailPath("M126 404 Q200 414 274 404", { strokeWidth: 1.6 })}
    ${detailPath("M47 275 Q65 285 82 281", { strokeWidth: 1.3, opacity: 0.55 })}
    ${detailPath("M353 275 Q335 285 318 281", { strokeWidth: 1.3, opacity: 0.55 })}
    ${foldPath("M155 165 Q168 200 164 246", 0.27)}
    ${foldPath("M245 165 Q232 200 236 246", 0.27)}
    ${foldPath("M173 310 Q186 354 179 390", 0.19)}
    ${foldPath("M227 310 Q214 354 221 390", 0.19)}
  `;
  return createDualViewSvg({ front, back, label: "Long-Sleeve T-Shirt" });
}

const LONG_SLEEVE_TSHIRT_SVG = createLongSleeveTshirtSvg(LONG_SLEEVE_TSHIRT_DEFAULT_COLOURS);

/*=========================================================
Crop Top — Phase 4.2F, editable 2D first
Short-sleeve crew-neck cropped tee, 10 front/back editable regions.
The matching Sketchfab GLB is intentionally NOT registered until conversion.
=========================================================*/
export const CROP_TOP_DEFAULT_COLOURS = Object.freeze({
  frontBody: "#ffffff", backBody: "#ffffff",
  frontLeftSleeve: "#ffffff", frontRightSleeve: "#ffffff",
  backLeftSleeve: "#ffffff", backRightSleeve: "#ffffff",
  frontCollar: "#ffffff", backCollar: "#ffffff",
  frontHem: "#ffffff", backHem: "#ffffff",
});

export const CROP_TOP_COLOUR_REGIONS = freezeRegions([
  { id: "frontBody", label: "Front Body", view: "front", group: "body" },
  { id: "backBody", label: "Back Body", view: "back", group: "body" },
  { id: "frontLeftSleeve", label: "Front Left Sleeve", view: "front", group: "sleeves" },
  { id: "frontRightSleeve", label: "Front Right Sleeve", view: "front", group: "sleeves" },
  { id: "backLeftSleeve", label: "Back Left Sleeve", view: "back", group: "sleeves" },
  { id: "backRightSleeve", label: "Back Right Sleeve", view: "back", group: "sleeves" },
  { id: "frontCollar", label: "Front Crew Collar", view: "front", group: "collar" },
  { id: "backCollar", label: "Back Crew Collar", view: "back", group: "collar" },
  { id: "frontHem", label: "Front Cropped Hem", view: "front", group: "hem" },
  { id: "backHem", label: "Back Cropped Hem", view: "back", group: "hem" },
]);

export function createCropTopSvg(colours = {}, artwork = {}) {
  const templateId = "crop-top";
  const c = normaliseColourMap(colours, CROP_TOP_DEFAULT_COLOURS);
  // Waist tapers in from the upper bodice; shorter length distinguishes this
  // silhouette from the existing regular and oversized T-shirt templates.
  const frontBody = "M151 79 L138 110 Q139 158 144 215 L150 315 Q200 326 250 315 L256 215 Q261 158 262 110 L249 79 C240 104 222 119 200 119 C178 119 160 104 151 79 Z";
  const backBody = "M151 79 L138 110 Q139 158 144 215 L150 315 Q200 326 250 315 L256 215 Q261 158 262 110 L249 79 C236 95 219 107 200 107 C181 107 164 95 151 79 Z";
  const leftSleeve = "M151 79 Q125 85 108 99 Q87 118 70 162 L107 187 Q125 170 140 142 L138 110 Z";
  const rightSleeve = "M249 79 Q275 85 292 99 Q313 118 330 162 L293 187 Q275 170 260 142 L262 110 Z";
  const frontCollar = "M151 79 C159 107 180 132 200 132 C220 132 241 107 249 79 C240 101 224 119 200 119 C176 119 160 101 151 79 Z";
  const backCollar = "M151 79 C164 98 182 111 200 111 C218 111 236 98 249 79 C234 96 219 103 200 103 C181 103 166 96 151 79 Z";
  const hem = "M150 311 Q200 322 250 311 L251 341 Q200 353 149 341 Z";
  const front = `
    ${editableRegionPath(templateId, artwork, "frontBody", c.frontBody, frontBody)}
    ${editableRegionPath(templateId, artwork, "frontLeftSleeve", c.frontLeftSleeve, leftSleeve)}
    ${editableRegionPath(templateId, artwork, "frontRightSleeve", c.frontRightSleeve, rightSleeve)}
    ${editableRegionPath(templateId, artwork, "frontCollar", c.frontCollar, frontCollar)}
    ${editableRegionPath(templateId, artwork, "frontHem", c.frontHem, hem)}
    ${detailPath("M150 327 Q200 338 250 327", { strokeWidth: 1.2, opacity: 0.5 })}
    ${detailPath("M77 159 L109 182", { strokeWidth: 1.5, opacity: 0.75 })}
    ${detailPath("M323 159 L291 182", { strokeWidth: 1.5, opacity: 0.75 })}
    ${foldPath("M159 163 Q168 192 162 218", 0.25)}
    ${foldPath("M241 163 Q232 192 238 218", 0.25)}
    ${foldPath("M175 267 Q183 283 177 303", 0.19)}
  `;
  const back = `
    ${editableRegionPath(templateId, artwork, "backBody", c.backBody, backBody)}
    ${editableRegionPath(templateId, artwork, "backLeftSleeve", c.backLeftSleeve, leftSleeve)}
    ${editableRegionPath(templateId, artwork, "backRightSleeve", c.backRightSleeve, rightSleeve)}
    ${editableRegionPath(templateId, artwork, "backCollar", c.backCollar, backCollar)}
    ${editableRegionPath(templateId, artwork, "backHem", c.backHem, hem)}
    ${detailPath("M150 327 Q200 338 250 327", { strokeWidth: 1.2, opacity: 0.5 })}
    ${detailPath("M77 159 L109 182", { strokeWidth: 1.5, opacity: 0.75 })}
    ${detailPath("M323 159 L291 182", { strokeWidth: 1.5, opacity: 0.75 })}
    ${detailPath("M141 134 Q200 156 259 134", { strokeWidth: 1.4, opacity: 0.62 })}
    ${foldPath("M158 163 Q172 195 167 234", 0.22)}
    ${foldPath("M242 163 Q228 195 233 234", 0.22)}
  `;
  return createDualViewSvg({ front, back, label: "Crop Top" });
}

const CROP_TOP_SVG = createCropTopSvg(CROP_TOP_DEFAULT_COLOURS);

/*=========================================================
Button-Up Shirt
=========================================================*/

export const SHIRT_DEFAULT_COLOURS = Object.freeze({
  frontLeftBody: "#ffffff",

  frontRightBody: "#ffffff",

  backBody: "#ffffff",

  frontLeftSleeve: "#ffffff",

  frontRightSleeve: "#ffffff",

  backLeftSleeve: "#ffffff",

  backRightSleeve: "#ffffff",

  frontLeftCollar: "#ffffff",

  frontRightCollar: "#ffffff",

  backCollar: "#ffffff",

  frontPocket: "#ffffff",
});

export const SHIRT_COLOUR_REGIONS = freezeRegions([
  {
    id: "frontLeftBody",

    label: "Front Left Body",

    view: "front",

    group: "body",
  },

  {
    id: "frontRightBody",

    label: "Front Right Body",

    view: "front",

    group: "body",
  },

  {
    id: "backBody",

    label: "Back Body",

    view: "back",

    group: "body",
  },

  {
    id: "frontLeftSleeve",

    label: "Front Left Sleeve",

    view: "front",

    group: "sleeves",
  },

  {
    id: "frontRightSleeve",

    label: "Front Right Sleeve",

    view: "front",

    group: "sleeves",
  },

  {
    id: "backLeftSleeve",

    label: "Back Left Sleeve",

    view: "back",

    group: "sleeves",
  },

  {
    id: "backRightSleeve",

    label: "Back Right Sleeve",

    view: "back",

    group: "sleeves",
  },

  {
    id: "frontLeftCollar",

    label: "Front Left Collar",

    view: "front",

    group: "collar",
  },

  {
    id: "frontRightCollar",

    label: "Front Right Collar",

    view: "front",

    group: "collar",
  },

  {
    id: "backCollar",

    label: "Back Collar",

    view: "back",

    group: "collar",
  },

  {
    id: "frontPocket",

    label: "Chest Pocket",

    view: "front",

    group: "details",
  },
]);

export function createShirtSvg(colours = {}, artwork = {}) {
  const c = normaliseColourMap(colours, SHIRT_DEFAULT_COLOURS);

  const front = `
    ${editableRegionPath(
      "shirt",
      artwork,
      "frontLeftBody",
      c.frontLeftBody,
      "M145 68 L171 94 L200 111 L200 430 Q162 434 126 421 L126 96 Z",
    )}

    ${editableRegionPath(
      "shirt",
      artwork,
      "frontRightBody",
      c.frontRightBody,
      "M255 68 L229 94 L200 111 L200 430 Q238 434 274 421 L274 96 Z",
    )}

    ${editableRegionPath(
      "shirt",
      artwork,
      "frontLeftSleeve",
      c.frontLeftSleeve,
      "M145 68 L103 86 L61 147 L98 181 L126 145 L126 96 Z",
    )}

    ${editableRegionPath(
      "shirt",
      artwork,
      "frontRightSleeve",
      c.frontRightSleeve,
      "M255 68 L297 86 L339 147 L302 181 L274 145 L274 96 Z",
    )}

    ${editableRegionPath(
      "shirt",
      artwork,
      "frontLeftCollar",
      c.frontLeftCollar,
      "M145 68 L171 94 L200 111 L170 132 L139 97 Z",
    )}

    ${editableRegionPath(
      "shirt",
      artwork,
      "frontRightCollar",
      c.frontRightCollar,
      "M255 68 L229 94 L200 111 L230 132 L261 97 Z",
    )}

    ${editableRegionPath(
      "shirt",
      artwork,
      "frontPocket",
      c.frontPocket,
      "M228 180 L263 180 L260 232 Q245 241 230 232 Z",
      {
        strokeWidth: 2.5,
      },
    )}

    ${detailPath("M200 111 L200 430", {
      strokeWidth: 2.3,
    })}

    ${detailPath("M190 112 L190 430", {
      strokeWidth: 1.1,

      opacity: 0.55,
    })}

    ${detailPath("M210 112 L210 430", {
      strokeWidth: 1.1,

      opacity: 0.55,
    })}

    <g
      fill="${GARMENT_OUTLINE}"
      stroke="none"
    >
      <circle
        cx="200"
        cy="160"
        r="4"
      />

      <circle
        cx="200"
        cy="207"
        r="4"
      />

      <circle
        cx="200"
        cy="254"
        r="4"
      />

      <circle
        cx="200"
        cy="301"
        r="4"
      />

      <circle
        cx="200"
        cy="348"
        r="4"
      />
    </g>

    ${detailPath("M126 399 Q160 411 200 407", {
      strokeWidth: 1.6,
    })}

    ${detailPath("M200 407 Q240 411 274 399", {
      strokeWidth: 1.6,
    })}

    ${detailPath("M74 154 L102 179", {
      strokeWidth: 1.6,
    })}

    ${detailPath("M326 154 L298 179", {
      strokeWidth: 1.6,
    })}

    ${foldPath("M149 158 Q166 177 173 208")}

    ${foldPath("M251 158 Q234 177 227 208")}

    ${foldPath("M170 280 Q180 305 177 345", 0.25)}

    ${foldPath("M230 280 Q220 305 223 345", 0.25)}
  `;

  const back = `
    ${editableRegionPath(
      "shirt",
      artwork,
      "backBody",
      c.backBody,
      "M145 68 L126 96 L126 421 Q200 439 274 421 L274 96 L255 68 L233 91 Q200 108 167 91 Z",
    )}

    ${editableRegionPath(
      "shirt",
      artwork,
      "backLeftSleeve",
      c.backLeftSleeve,
      "M145 68 L103 86 L61 147 L98 181 L126 145 L126 96 Z",
    )}

    ${editableRegionPath(
      "shirt",
      artwork,
      "backRightSleeve",
      c.backRightSleeve,
      "M255 68 L297 86 L339 147 L302 181 L274 145 L274 96 Z",
    )}

    ${editableRegionPath(
      "shirt",
      artwork,
      "backCollar",
      c.backCollar,
      "M145 68 L167 91 Q200 108 233 91 L255 68 Q230 82 200 83 Q170 82 145 68 Z",
    )}

    ${detailPath("M140 123 Q200 151 260 123", {
      strokeWidth: 2.3,
    })}

    ${detailLine(200, 143, 200, 420, {
      strokeWidth: 1.4,

      opacity: 0.5,
    })}

    ${detailPath("M126 399 Q200 420 274 399", {
      strokeWidth: 1.6,
    })}

    ${detailPath("M74 154 L102 179", {
      strokeWidth: 1.6,
    })}

    ${detailPath("M326 154 L298 179", {
      strokeWidth: 1.6,
    })}

    ${foldPath("M150 158 Q169 180 176 216")}

    ${foldPath("M250 158 Q231 180 224 216")}

    ${foldPath("M173 178 Q185 193 190 224", 0.28)}

    ${foldPath("M227 178 Q215 193 210 224", 0.28)}
  `;

  return createDualViewSvg({
    front,
    back,
    label: "Button-Up Shirt",
  });
}

const SHIRT_SVG = createShirtSvg(SHIRT_DEFAULT_COLOURS);

/*=========================================================
Hoodie
=========================================================*/

export const HOODIE_DEFAULT_COLOURS = Object.freeze({
  frontBody: "#ffffff",

  backBody: "#ffffff",

  frontLeftSleeve: "#ffffff",

  frontRightSleeve: "#ffffff",

  backLeftSleeve: "#ffffff",

  backRightSleeve: "#ffffff",

  frontHood: "#ffffff",

  backHood: "#ffffff",

  frontPocket: "#ffffff",

  frontHem: "#ffffff",

  backHem: "#ffffff",

  frontLeftCuff: "#ffffff",

  frontRightCuff: "#ffffff",

  backLeftCuff: "#ffffff",

  backRightCuff: "#ffffff",
});

export const HOODIE_COLOUR_REGIONS = freezeRegions([
  {
    id: "frontBody",

    label: "Front Body",

    view: "front",

    group: "body",
  },

  {
    id: "backBody",

    label: "Back Body",

    view: "back",

    group: "body",
  },

  {
    id: "frontLeftSleeve",

    label: "Front Left Sleeve",

    view: "front",

    group: "sleeves",
  },

  {
    id: "frontRightSleeve",

    label: "Front Right Sleeve",

    view: "front",

    group: "sleeves",
  },

  {
    id: "backLeftSleeve",

    label: "Back Left Sleeve",

    view: "back",

    group: "sleeves",
  },

  {
    id: "backRightSleeve",

    label: "Back Right Sleeve",

    view: "back",

    group: "sleeves",
  },

  {
    id: "frontHood",

    label: "Front Hood",

    view: "front",

    group: "hood",
  },

  {
    id: "backHood",

    label: "Back Hood",

    view: "back",

    group: "hood",
  },

  {
    id: "frontPocket",

    label: "Front Pocket",

    view: "front",

    group: "details",
  },

  {
    id: "frontHem",

    label: "Front Rib Hem",

    view: "front",

    group: "hem",
  },

  {
    id: "backHem",

    label: "Back Rib Hem",

    view: "back",

    group: "hem",
  },

  {
    id: "frontLeftCuff",

    label: "Front Left Cuff",

    view: "front",

    group: "cuffs",
  },

  {
    id: "frontRightCuff",

    label: "Front Right Cuff",

    view: "front",

    group: "cuffs",
  },

  {
    id: "backLeftCuff",

    label: "Back Left Cuff",

    view: "back",

    group: "cuffs",
  },

  {
    id: "backRightCuff",

    label: "Back Right Cuff",

    view: "back",

    group: "cuffs",
  },
]);

export function createHoodieSvg(colours = {}, artwork = {}) {
  const c = normaliseColourMap(colours, HOODIE_DEFAULT_COLOURS);

  const front = `
    ${editableRegionPath(
      "hoodie",
      artwork,
      "frontBody",
      c.frontBody,
      "M145 105 L126 121 L126 391 L274 391 L274 121 L255 105 C242 126 224 138 200 138 C176 138 158 126 145 105 Z",
    )}

    ${editableRegionPath(
      "hoodie",
      artwork,
      "frontLeftSleeve",
      c.frontLeftSleeve,
      "M145 105 L101 117 L58 171 L92 203 L126 168 L126 121 Z",
    )}

    ${editableRegionPath(
      "hoodie",
      artwork,
      "frontRightSleeve",
      c.frontRightSleeve,
      "M255 105 L299 117 L342 171 L308 203 L274 168 L274 121 Z",
    )}

    ${editableRegionPath(
      "hoodie",
      artwork,
      "frontHood",
      c.frontHood,
      "M151 112 C145 72 157 41 181 29 C193 23 207 23 219 29 C243 41 255 72 249 112 C238 131 222 142 200 142 C178 142 162 131 151 112 Z",
    )}

    ${editableRegionPath(
      "hoodie",
      artwork,
      "frontPocket",
      c.frontPocket,
      "M148 290 Q200 266 252 290 L245 351 Q200 373 155 351 Z",
      {
        strokeWidth: 2.8,
      },
    )}

    ${editableRegionPath(
      "hoodie",
      artwork,
      "frontHem",
      c.frontHem,
      "M126 388 L274 388 L274 425 L126 425 Z",
      {
        strokeWidth: 3,
      },
    )}

    ${editableRegionPath(
      "hoodie",
      artwork,
      "frontLeftCuff",
      c.frontLeftCuff,
      "M57 171 L92 203 L82 221 L47 187 Z",
      {
        strokeWidth: 3,
      },
    )}

    ${editableRegionPath(
      "hoodie",
      artwork,
      "frontRightCuff",
      c.frontRightCuff,
      "M343 171 L308 203 L318 221 L353 187 Z",
      {
        strokeWidth: 3,
      },
    )}

    ${detailLine(178, 141, 170, 214, {
      strokeWidth: 1.8,
    })}

    ${detailLine(222, 141, 230, 214, {
      strokeWidth: 1.8,
    })}

    <circle
      cx="170"
      cy="218"
      r="3.5"
      fill="${GARMENT_OUTLINE}"
    />

    <circle
      cx="230"
      cy="218"
      r="3.5"
      fill="${GARMENT_OUTLINE}"
    />

    ${detailPath("M149 290 L179 318", {
      strokeWidth: 1.6,
    })}

    ${detailPath("M251 290 L221 318", {
      strokeWidth: 1.6,
    })}

    ${detailLine(126, 404, 274, 404, {
      strokeWidth: 1.2,

      opacity: 0.45,

      dash: "5 5",
    })}

    ${foldPath("M151 173 Q170 192 174 226")}

    ${foldPath("M249 173 Q230 192 226 226")}

    ${foldPath("M178 237 Q188 255 183 274", 0.28)}

    ${foldPath("M222 237 Q212 255 217 274", 0.28)}
  `;

  const back = `
    ${editableRegionPath(
      "hoodie",
      artwork,
      "backBody",
      c.backBody,
      "M145 105 L126 121 L126 391 L274 391 L274 121 L255 105 C240 120 223 129 200 129 C177 129 160 120 145 105 Z",
    )}

    ${editableRegionPath(
      "hoodie",
      artwork,
      "backLeftSleeve",
      c.backLeftSleeve,
      "M145 105 L101 117 L58 171 L92 203 L126 168 L126 121 Z",
    )}

    ${editableRegionPath(
      "hoodie",
      artwork,
      "backRightSleeve",
      c.backRightSleeve,
      "M255 105 L299 117 L342 171 L308 203 L274 168 L274 121 Z",
    )}

    ${editableRegionPath(
      "hoodie",
      artwork,
      "backHood",
      c.backHood,
      "M151 112 C145 72 157 41 181 29 C193 23 207 23 219 29 C243 41 255 72 249 112 C238 131 222 142 200 142 C178 142 162 131 151 112 Z",
    )}

    ${editableRegionPath(
      "hoodie",
      artwork,
      "backHem",
      c.backHem,
      "M126 388 L274 388 L274 425 L126 425 Z",
      {
        strokeWidth: 3,
      },
    )}

    ${editableRegionPath(
      "hoodie",
      artwork,
      "backLeftCuff",
      c.backLeftCuff,
      "M57 171 L92 203 L82 221 L47 187 Z",
      {
        strokeWidth: 3,
      },
    )}

    ${editableRegionPath(
      "hoodie",
      artwork,
      "backRightCuff",
      c.backRightCuff,
      "M343 171 L308 203 L318 221 L353 187 Z",
      {
        strokeWidth: 3,
      },
    )}

    ${detailPath("M200 31 Q176 68 200 139 Q224 68 200 31", {
      strokeWidth: 1.7,

      opacity: 0.75,
    })}

    ${detailPath("M153 133 Q200 154 247 133", {
      strokeWidth: 1.5,

      opacity: 0.65,
    })}

    ${detailLine(126, 404, 274, 404, {
      strokeWidth: 1.2,

      opacity: 0.45,

      dash: "5 5",
    })}

    ${foldPath("M151 173 Q170 192 174 226")}

    ${foldPath("M249 173 Q230 192 226 226")}

    ${foldPath("M177 199 Q188 230 184 266", 0.28)}

    ${foldPath("M223 199 Q212 230 216 266", 0.28)}
  `;

  return createDualViewSvg({
    front,
    back,
    label: "Hoodie",
  });
}

const HOODIE_SVG = createHoodieSvg(HOODIE_DEFAULT_COLOURS);

/*=========================================================
Dress
=========================================================*/

export const DRESS_DEFAULT_COLOURS = Object.freeze({
  frontBodice: "#ffffff",

  backBodice: "#ffffff",

  frontSkirt: "#ffffff",

  backSkirt: "#ffffff",

  frontLeftSleeve: "#ffffff",

  frontRightSleeve: "#ffffff",

  backLeftSleeve: "#ffffff",

  backRightSleeve: "#ffffff",

  frontWaistband: "#ffffff",

  backWaistband: "#ffffff",

  frontNeckline: "#ffffff",

  backNeckline: "#ffffff",
});

export const DRESS_COLOUR_REGIONS = freezeRegions([
  {
    id: "frontBodice",

    label: "Front Bodice",

    view: "front",

    group: "bodice",
  },

  {
    id: "backBodice",

    label: "Back Bodice",

    view: "back",

    group: "bodice",
  },

  {
    id: "frontSkirt",

    label: "Front Skirt",

    view: "front",

    group: "skirt",
  },

  {
    id: "backSkirt",

    label: "Back Skirt",

    view: "back",

    group: "skirt",
  },

  {
    id: "frontLeftSleeve",

    label: "Front Left Sleeve",

    view: "front",

    group: "sleeves",
  },

  {
    id: "frontRightSleeve",

    label: "Front Right Sleeve",

    view: "front",

    group: "sleeves",
  },

  {
    id: "backLeftSleeve",

    label: "Back Left Sleeve",

    view: "back",

    group: "sleeves",
  },

  {
    id: "backRightSleeve",

    label: "Back Right Sleeve",

    view: "back",

    group: "sleeves",
  },

  {
    id: "frontWaistband",

    label: "Front Waistband",

    view: "front",

    group: "waist",
  },

  {
    id: "backWaistband",

    label: "Back Waistband",

    view: "back",

    group: "waist",
  },

  {
    id: "frontNeckline",

    label: "Front Neckline",

    view: "front",

    group: "neckline",
  },

  {
    id: "backNeckline",

    label: "Back Neckline",

    view: "back",

    group: "neckline",
  },
]);

export function createDressSvg(colours = {}, artwork = {}) {
  const c = normaliseColourMap(colours, DRESS_DEFAULT_COLOURS);

  // Puffed short sleeves, gentle scoop/gathered neckline, softly tapered torso,
  // softly defined waist and a long tiered flowing skirt. Regions match GLB.
  const front = `
    ${editableRegionPath("dress", artwork, "frontSkirt", c.frontSkirt,
      "M150 220 Q200 233 250 220 C270 256 278 325 295 459 Q200 491 105 459 C122 325 130 256 150 220 Z")}
    ${editableRegionPath("dress", artwork, "frontBodice", c.frontBodice,
      "M158 74 Q200 61 242 74 L252 109 Q250 168 255 211 Q200 227 145 211 Q150 168 148 109 Z")}
    ${editableRegionPath("dress", artwork, "frontLeftSleeve", c.frontLeftSleeve,
      "M158 74 Q125 65 107 77 C79 73 60 102 63 131 C61 151 76 168 99 168 Q133 181 145 151 L149 111 Z")}
    ${editableRegionPath("dress", artwork, "frontRightSleeve", c.frontRightSleeve,
      "M242 74 Q275 65 293 77 C321 73 340 102 337 131 C339 151 324 168 301 168 Q267 181 255 151 L251 111 Z")}
    ${editableRegionPath("dress", artwork, "frontWaistband", c.frontWaistband,
      "M147 200 Q200 211 253 200 L255 227 Q200 236 145 227 Z", { strokeWidth: 2.6 })}
    ${editableRegionPath("dress", artwork, "frontNeckline", c.frontNeckline,
      "M158 74 Q200 105 242 74 L244 83 Q200 121 156 83 Z", { strokeWidth: 2.6 })}

    ${detailPath("M157 88 Q178 111 194 113", { strokeWidth: 1.4, opacity: .7 })}
    ${detailPath("M243 88 Q222 111 206 113", { strokeWidth: 1.4, opacity: .7 })}
    ${detailPath("M185 96 Q195 108 198 117", { strokeWidth: 1.1, opacity: .65 })}
    ${detailPath("M215 96 Q205 108 202 117", { strokeWidth: 1.1, opacity: .65 })}
    ${detailPath("M120 83 Q92 106 88 145", { strokeWidth: 1.25, opacity: .5 })}
    ${detailPath("M280 83 Q308 106 312 145", { strokeWidth: 1.25, opacity: .5 })}
    ${detailPath("M68 146 Q95 158 127 160", { strokeWidth: 1.3, opacity: .7 })}
    ${detailPath("M332 146 Q305 158 273 160", { strokeWidth: 1.3, opacity: .7 })}
    ${detailPath("M147 226 Q200 241 253 226", { strokeWidth: 1.1, opacity: .55 })}
    ${detailPath("M118 431 Q200 451 282 431", { strokeWidth: 1.6 })}
    ${foldPath("M158 241 Q146 324 138 446", .31)}
    ${foldPath("M177 244 Q175 334 170 463", .24)}
    ${foldPath("M222 244 Q226 334 230 463", .24)}
    ${foldPath("M244 241 Q257 324 264 446", .31)}
    ${foldPath("M193 253 Q185 349 191 467", .16)}
    ${foldPath("M207 253 Q215 349 210 467", .16)}
  `;

  const back = `
    ${editableRegionPath("dress", artwork, "backSkirt", c.backSkirt,
      "M150 220 Q200 233 250 220 C270 256 278 325 295 459 Q200 491 105 459 C122 325 130 256 150 220 Z")}
    ${editableRegionPath("dress", artwork, "backBodice", c.backBodice,
      "M158 74 Q200 69 242 74 L252 109 Q250 168 255 211 Q200 227 145 211 Q150 168 148 109 Z")}
    ${editableRegionPath("dress", artwork, "backLeftSleeve", c.backLeftSleeve,
      "M158 74 Q125 65 107 77 C79 73 60 102 63 131 C61 151 76 168 99 168 Q133 181 145 151 L149 111 Z")}
    ${editableRegionPath("dress", artwork, "backRightSleeve", c.backRightSleeve,
      "M242 74 Q275 65 293 77 C321 73 340 102 337 131 C339 151 324 168 301 168 Q267 181 255 151 L251 111 Z")}
    ${editableRegionPath("dress", artwork, "backWaistband", c.backWaistband,
      "M147 200 Q200 211 253 200 L255 227 Q200 236 145 227 Z", { strokeWidth: 2.6 })}
    ${editableRegionPath("dress", artwork, "backNeckline", c.backNeckline,
      "M158 74 Q200 83 242 74 L242 86 Q200 95 158 86 Z", { strokeWidth: 2.6 })}
    ${detailPath("M124 80 Q105 106 95 149", { strokeWidth: 1.4, opacity: .48 })}
    ${detailPath("M276 80 Q295 106 305 149", { strokeWidth: 1.4, opacity: .48 })}
    ${detailPath("M66 146 Q97 158 127 160", { strokeWidth: 1.3, opacity: .7 })}
    ${detailPath("M334 146 Q303 158 273 160", { strokeWidth: 1.3, opacity: .7 })}
    ${detailPath("M147 226 Q200 241 253 226", { strokeWidth: 1.1, opacity: .55 })}
    ${detailPath("M118 431 Q200 451 282 431", { strokeWidth: 1.6 })}
    ${foldPath("M158 241 Q146 324 138 446", .31)}
    ${foldPath("M177 244 Q175 334 170 463", .24)}
    ${foldPath("M222 244 Q226 334 230 463", .24)}
    ${foldPath("M244 241 Q257 324 264 446", .31)}
    ${foldPath("M193 253 Q185 349 191 467", .16)}
    ${foldPath("M207 253 Q215 349 210 467", .16)}
  `;

  return createDualViewSvg({ front, back, label: "Puff-Sleeve Maxi Dress" });
}


const DRESS_SVG = createDressSvg(DRESS_DEFAULT_COLOURS);

/*=========================================================
Pants
=========================================================*/

export const PANTS_DEFAULT_COLOURS = Object.freeze({
  frontWaistband: "#ffffff",

  backWaistband: "#ffffff",

  frontLeftLeg: "#ffffff",

  frontRightLeg: "#ffffff",

  backLeftLeg: "#ffffff",

  backRightLeg: "#ffffff",

  frontLeftPocket: "#ffffff",

  frontRightPocket: "#ffffff",

  backLeftPocket: "#ffffff",

  backRightPocket: "#ffffff",
});

export const PANTS_COLOUR_REGIONS = freezeRegions([
  {
    id: "frontWaistband",

    label: "Front Waistband",

    view: "front",

    group: "waist",
  },

  {
    id: "backWaistband",

    label: "Back Waistband",

    view: "back",

    group: "waist",
  },

  {
    id: "frontLeftLeg",

    label: "Front Left Leg",

    view: "front",

    group: "legs",
  },

  {
    id: "frontRightLeg",

    label: "Front Right Leg",

    view: "front",

    group: "legs",
  },

  {
    id: "backLeftLeg",

    label: "Back Left Leg",

    view: "back",

    group: "legs",
  },

  {
    id: "backRightLeg",

    label: "Back Right Leg",

    view: "back",

    group: "legs",
  },

  {
    id: "frontLeftPocket",

    label: "Front Left Pocket",

    view: "front",

    group: "pockets",
  },

  {
    id: "frontRightPocket",

    label: "Front Right Pocket",

    view: "front",

    group: "pockets",
  },

  {
    id: "backLeftPocket",

    label: "Back Left Pocket",

    view: "back",

    group: "pockets",
  },

  {
    id: "backRightPocket",

    label: "Back Right Pocket",

    view: "back",

    group: "pockets",
  },
]);

export function createPantsSvg(colours = {}, artwork = {}) {
  const c = normaliseColourMap(colours, PANTS_DEFAULT_COLOURS);

  const front = `
    ${editableRegionPath(
      "pants",
      artwork,
      "frontLeftLeg",
      c.frontLeftLeg,
      "M124 106 L200 106 L198 234 L181 442 L126 442 L137 230 Z",
    )}

    ${editableRegionPath(
      "pants",
      artwork,
      "frontRightLeg",
      c.frontRightLeg,
      "M200 106 L276 106 L263 230 L274 442 L219 442 L202 234 Z",
    )}

    ${editableRegionPath(
      "pants",
      artwork,
      "frontWaistband",
      c.frontWaistband,
      "M120 66 L280 66 L276 108 L124 108 Z",
      {
        strokeWidth: 3,
      },
    )}

    ${editableRegionPath(
      "pants",
      artwork,
      "frontLeftPocket",
      c.frontLeftPocket,
      "M126 112 L188 112 Q178 145 147 164 L133 151 Z",
      {
        strokeWidth: 2.5,
      },
    )}

    ${editableRegionPath(
      "pants",
      artwork,
      "frontRightPocket",
      c.frontRightPocket,
      "M274 112 L212 112 Q222 145 253 164 L267 151 Z",
      {
        strokeWidth: 2.5,
      },
    )}

    ${detailPath("M200 108 L200 211 Q200 234 218 246", {
      strokeWidth: 2.2,
    })}

    ${detailLine(145, 68, 145, 105, {
      strokeWidth: 1.4,
    })}

    ${detailLine(200, 68, 200, 105, {
      strokeWidth: 1.4,
    })}

    ${detailLine(255, 68, 255, 105, {
      strokeWidth: 1.4,
    })}

    ${detailLine(160, 166, 154, 420, {
      strokeWidth: 1.2,

      opacity: 0.45,

      dash: "7 7",
    })}

    ${detailLine(240, 166, 246, 420, {
      strokeWidth: 1.2,

      opacity: 0.45,

      dash: "7 7",
    })}

    ${foldPath("M171 175 Q179 199 174 229", 0.3)}

    ${foldPath("M229 175 Q221 199 226 229", 0.3)}

    ${foldPath("M168 275 Q162 321 164 369", 0.22)}

    ${foldPath("M232 275 Q238 321 236 369", 0.22)}
  `;

  const back = `
    ${editableRegionPath(
      "pants",
      artwork,
      "backLeftLeg",
      c.backLeftLeg,
      "M124 106 L200 106 L198 234 L181 442 L126 442 L137 230 Z",
    )}

    ${editableRegionPath(
      "pants",
      artwork,
      "backRightLeg",
      c.backRightLeg,
      "M200 106 L276 106 L263 230 L274 442 L219 442 L202 234 Z",
    )}

    ${editableRegionPath(
      "pants",
      artwork,
      "backWaistband",
      c.backWaistband,
      "M120 66 L280 66 L276 108 L124 108 Z",
      {
        strokeWidth: 3,
      },
    )}

    ${editableRegionPath(
      "pants",
      artwork,
      "backLeftPocket",
      c.backLeftPocket,
      "M135 134 L184 134 L181 181 Q159 192 138 181 Z",
      {
        strokeWidth: 2.5,
      },
    )}

    ${editableRegionPath(
      "pants",
      artwork,
      "backRightPocket",
      c.backRightPocket,
      "M216 134 L265 134 L262 181 Q241 192 219 181 Z",
      {
        strokeWidth: 2.5,
      },
    )}

    ${detailPath("M124 108 Q200 132 276 108", {
      strokeWidth: 2.1,
    })}

    ${detailLine(200, 119, 200, 234, {
      strokeWidth: 1.7,

      opacity: 0.65,
    })}

    ${detailLine(145, 68, 145, 105, {
      strokeWidth: 1.4,
    })}

    ${detailLine(200, 68, 200, 105, {
      strokeWidth: 1.4,
    })}

    ${detailLine(255, 68, 255, 105, {
      strokeWidth: 1.4,
    })}

    ${detailLine(160, 191, 154, 420, {
      strokeWidth: 1.2,

      opacity: 0.45,

      dash: "7 7",
    })}

    ${detailLine(240, 191, 246, 420, {
      strokeWidth: 1.2,

      opacity: 0.45,

      dash: "7 7",
    })}

    ${foldPath("M171 197 Q179 218 174 247", 0.28)}

    ${foldPath("M229 197 Q221 218 226 247", 0.28)}
  `;

  return createDualViewSvg({
    front,
    back,
    label: "Pants",
  });
}

const PANTS_SVG = createPantsSvg(PANTS_DEFAULT_COLOURS);

/*=========================================================
Phase 4.2G — Jeans 2D, sourced from realistic grey denim Sketchfab garment
Matching 10 named GLB regions: front/back legs, waistband, front/back pockets.
Artwork is clipped to each editable SVG region as in existing garment types.
=========================================================*/
export const JEANS_DEFAULT_COLOURS = Object.freeze({
  frontWaistband: "#aeb5c1", backWaistband: "#aeb5c1",
  frontLeftLeg: "#929bac", frontRightLeg: "#929bac",
  backLeftLeg: "#929bac", backRightLeg: "#929bac",
  frontLeftPocket: "#929bac", frontRightPocket: "#929bac",
  backLeftPocket: "#929bac", backRightPocket: "#929bac",
});
export const JEANS_COLOUR_REGIONS = freezeRegions([
  {id: "frontWaistband", label: "Front Waistband", view: "front", group: "waist"},
  {id: "backWaistband", label: "Back Waistband", view: "back", group: "waist"},
  {id: "frontLeftLeg", label: "Front Left Leg", view: "front", group: "legs"},
  {id: "frontRightLeg", label: "Front Right Leg", view: "front", group: "legs"},
  {id: "backLeftLeg", label: "Back Left Leg", view: "back", group: "legs"},
  {id: "backRightLeg", label: "Back Right Leg", view: "back", group: "legs"},
  {id: "frontLeftPocket", label: "Front Left Pocket", view: "front", group: "pockets"},
  {id: "frontRightPocket", label: "Front Right Pocket", view: "front", group: "pockets"},
  {id: "backLeftPocket", label: "Back Left Pocket", view: "back", group: "pockets"},
  {id: "backRightPocket", label: "Back Right Pocket", view: "back", group: "pockets"},
]);
export function createJeansSvg(colours = {}, artwork = {}) {
  const t = "jeans";
  const c = normaliseColourMap(colours, JEANS_DEFAULT_COLOURS);
  const leftLeg = "M126 107 L200 107 L196 235 Q189 318 180 446 L125 446 L135 248 Z";
  const rightLeg = "M200 107 L274 107 L265 248 L275 446 L220 446 Q211 318 204 235 Z";
  const waistband = "M126 70 Q200 63 274 70 L276 108 Q200 114 124 108 Z";
  const frontLeftPocket = "M128 113 L184 115 Q179 147 153 168 L137 166 Q137 143 128 113 Z";
  const frontRightPocket = "M272 113 L216 115 Q221 147 247 168 L263 166 Q263 143 272 113 Z";
  const backLeftPocket = "M136 142 L185 140 L181 198 Q159 209 138 195 Z";
  const backRightPocket = "M215 140 L264 142 L262 195 Q241 209 219 198 Z";
  const beltLoops = [141, 187, 213, 259].map(x=>
    detailLine(x, 72, x, 108, {strokeWidth: 2.2, opacity: 0.75})).join("\n");
  const jeansSeams = `
    ${detailPath("M129 428 Q153 436 179 428", {strokeWidth: 2.2, opacity: .9})}
    ${detailPath("M221 428 Q246 436 271 428", {strokeWidth: 2.2, opacity: .9})}
    ${detailPath("M146 173 Q156 294 145 419", {strokeWidth: 1.1, opacity: .47, dash:"5 6"})}
    ${detailPath("M254 173 Q244 294 255 419", {strokeWidth: 1.1, opacity: .47, dash:"5 6"})}
    ${foldPath("M170 215 Q181 245 169 286", .28)}
    ${foldPath("M230 215 Q219 245 231 286", .28)}
    ${foldPath("M147 343 Q156 355 165 356", .22)}
    ${foldPath("M253 343 Q244 355 235 356", .22)}
  `;
  const front = `
    ${editableRegionPath(t, artwork, "frontLeftLeg", c.frontLeftLeg, leftLeg)}
    ${editableRegionPath(t, artwork, "frontRightLeg", c.frontRightLeg, rightLeg)}
    ${editableRegionPath(t, artwork, "frontWaistband", c.frontWaistband, waistband)}
    ${editableRegionPath(t, artwork, "frontLeftPocket", c.frontLeftPocket, frontLeftPocket, {strokeWidth: 2.5})}
    ${editableRegionPath(t, artwork, "frontRightPocket", c.frontRightPocket, frontRightPocket, {strokeWidth: 2.5})}
    ${beltLoops}
    ${detailPath("M200 110 L200 190 Q197 208 213 218", {strokeWidth: 2.3})}
    ${detailPath("M202 110 L202 187 Q202 202 213 205", {strokeWidth: 1.3, opacity: .8, dash: "5 3"})}
    ${detailPath("M127 117 Q153 128 182 115", {strokeWidth: 1.3, opacity: .62})}
    ${detailPath("M218 115 Q247 128 273 117", {strokeWidth: 1.3, opacity: .62})}
    ${jeansSeams}
  `;
  const back = `
    ${editableRegionPath(t, artwork, "backLeftLeg", c.backLeftLeg, leftLeg)}
    ${editableRegionPath(t, artwork, "backRightLeg", c.backRightLeg, rightLeg)}
    ${editableRegionPath(t, artwork, "backWaistband", c.backWaistband, waistband)}
    ${editableRegionPath(t, artwork, "backLeftPocket", c.backLeftPocket, backLeftPocket, {strokeWidth:2.6})}
    ${editableRegionPath(t, artwork, "backRightPocket", c.backRightPocket, backRightPocket, {strokeWidth:2.6})}
    ${beltLoops}
    ${detailPath("M126 110 Q200 135 274 110", {strokeWidth:2})}
    ${detailLine(200, 114, 200, 225, {strokeWidth:1.6, opacity:.72})}
    ${detailPath("M144 158 Q160 183 177 158", {strokeWidth:1.6, opacity:.75})}
    ${detailPath("M223 158 Q240 183 256 158", {strokeWidth:1.6, opacity:.75})}
    ${jeansSeams}
  `;
  return createDualViewSvg({front,back,label:"Grey Jeans"});
}
const JEANS_SVG = createJeansSvg(JEANS_DEFAULT_COLOURS);

/*=========================================================
Skirt
=========================================================*/

export const SKIRT_DEFAULT_COLOURS = Object.freeze({
  frontWaistband: "#ffffff",

  backWaistband: "#ffffff",

  frontLeftPanel: "#ffffff",

  frontCentrePanel: "#ffffff",

  frontRightPanel: "#ffffff",

  backLeftPanel: "#ffffff",

  backCentrePanel: "#ffffff",

  backRightPanel: "#ffffff",
});

export const SKIRT_COLOUR_REGIONS = freezeRegions([
  {
    id: "frontWaistband",

    label: "Front Waistband",

    view: "front",

    group: "waist",
  },

  {
    id: "backWaistband",

    label: "Back Waistband",

    view: "back",

    group: "waist",
  },

  {
    id: "frontLeftPanel",

    label: "Front Left Panel",

    view: "front",

    group: "panels",
  },

  {
    id: "frontCentrePanel",

    label: "Front Centre Panel",

    view: "front",

    group: "panels",
  },

  {
    id: "frontRightPanel",

    label: "Front Right Panel",

    view: "front",

    group: "panels",
  },

  {
    id: "backLeftPanel",

    label: "Back Left Panel",

    view: "back",

    group: "panels",
  },

  {
    id: "backCentrePanel",

    label: "Back Centre Panel",

    view: "back",

    group: "panels",
  },

  {
    id: "backRightPanel",

    label: "Back Right Panel",

    view: "back",

    group: "panels",
  },
]);

export function createSkirtSvg(colours = {}, artwork = {}) {
  const c = normaliseColourMap(colours, SKIRT_DEFAULT_COLOURS);

  const front = `
    ${editableRegionPath(
      "skirt",
      artwork,
      "frontLeftPanel",
      c.frontLeftPanel,
      "M120 122 L176 122 L160 432 L70 432 Z",
    )}

    ${editableRegionPath(
      "skirt",
      artwork,
      "frontCentrePanel",
      c.frontCentrePanel,
      "M176 122 L224 122 L240 432 L160 432 Z",
    )}

    ${editableRegionPath(
      "skirt",
      artwork,
      "frontRightPanel",
      c.frontRightPanel,
      "M224 122 L280 122 L330 432 L240 432 Z",
    )}

    ${editableRegionPath(
      "skirt",
      artwork,
      "frontWaistband",
      c.frontWaistband,
      "M130 76 L270 76 L280 122 L120 122 Z",
      {
        strokeWidth: 3,
      },
    )}

    ${detailLine(124, 110, 276, 110, {
      strokeWidth: 1.6,
    })}

    ${detailLine(176, 132, 160, 410, {
      strokeWidth: 1.2,

      opacity: 0.45,

      dash: "7 7",
    })}

    ${detailLine(224, 132, 240, 410, {
      strokeWidth: 1.2,

      opacity: 0.45,

      dash: "7 7",
    })}

    ${detailPath("M78 410 Q200 428 322 410", {
      strokeWidth: 1.7,
    })}

    ${foldPath("M148 145 Q155 200 149 258", 0.25)}

    ${foldPath("M252 145 Q245 200 251 258", 0.25)}
  `;

  const back = `
    ${editableRegionPath(
      "skirt",
      artwork,
      "backLeftPanel",
      c.backLeftPanel,
      "M120 122 L176 122 L160 432 L70 432 Z",
    )}

    ${editableRegionPath(
      "skirt",
      artwork,
      "backCentrePanel",
      c.backCentrePanel,
      "M176 122 L224 122 L240 432 L160 432 Z",
    )}

    ${editableRegionPath(
      "skirt",
      artwork,
      "backRightPanel",
      c.backRightPanel,
      "M224 122 L280 122 L330 432 L240 432 Z",
    )}

    ${editableRegionPath(
      "skirt",
      artwork,
      "backWaistband",
      c.backWaistband,
      "M130 76 L270 76 L280 122 L120 122 Z",
      {
        strokeWidth: 3,
      },
    )}

    ${detailLine(124, 110, 276, 110, {
      strokeWidth: 1.6,
    })}

    ${detailLine(200, 77, 200, 122, {
      strokeWidth: 2,

      opacity: 0.8,
    })}

    ${detailLine(200, 122, 200, 421, {
      strokeWidth: 1.4,

      opacity: 0.5,
    })}

    ${detailPath("M154 125 Q158 156 170 172", {
      strokeWidth: 1.4,

      opacity: 0.65,
    })}

    ${detailPath("M246 125 Q242 156 230 172", {
      strokeWidth: 1.4,

      opacity: 0.65,
    })}

    ${detailPath("M78 410 Q200 428 322 410", {
      strokeWidth: 1.7,
    })}

    ${foldPath("M148 160 Q155 208 149 266", 0.24)}

    ${foldPath("M252 160 Q245 208 251 266", 0.24)}
  `;

  return createDualViewSvg({
    front,
    back,
    label: "Skirt",
  });
}

const SKIRT_SVG = createSkirtSvg(SKIRT_DEFAULT_COLOURS);

/*=========================================================
Phase 4.4 — Women's Tailored Blazer (Latitude23 Sketchfab)
13 editable regions matched to modified *real* GLB source meshes.
Buttons/cuff metal accents remain non-editable, as in original GLB.
=========================================================*/
export const WOMENS_BLAZER_DEFAULT_COLOURS = Object.freeze({
  frontLeftBody: "#e9eaef", frontRightBody: "#e9eaef", backBody: "#e9eaef",
  sideLeftBody: "#dde0e8", sideRightBody: "#dde0e8",
  frontLeftSleeve: "#e4e6ed", frontRightSleeve: "#e4e6ed",
  backLeftSleeve: "#e4e6ed", backRightSleeve: "#e4e6ed",
  frontLeftLapel: "#d3d8e3", frontRightLapel: "#d3d8e3",
  topCollar: "#d2d5dd", backInnerCollar: "#d2d5dd",
});
export const WOMENS_BLAZER_COLOUR_REGIONS = freezeRegions([
  {id:"frontLeftBody",label:"Front Left Body",view:"front",group:"body"},
  {id:"frontRightBody",label:"Front Right Body",view:"front",group:"body"},
  {id:"backBody",label:"Back Body",view:"back",group:"body"},
  {id:"sideLeftBody",label:"Left Side Tailoring",view:"front",group:"body"},
  {id:"sideRightBody",label:"Right Side Tailoring",view:"front",group:"body"},
  {id:"frontLeftSleeve",label:"Front Left Sleeve",view:"front",group:"sleeves"},
  {id:"frontRightSleeve",label:"Front Right Sleeve",view:"front",group:"sleeves"},
  {id:"backLeftSleeve",label:"Back Left Sleeve",view:"back",group:"sleeves"},
  {id:"backRightSleeve",label:"Back Right Sleeve",view:"back",group:"sleeves"},
  {id:"frontLeftLapel",label:"Front Left Lapel",view:"front",group:"lapels"},
  {id:"frontRightLapel",label:"Front Right Lapel",view:"front",group:"lapels"},
  {id:"topCollar",label:"Upper Collar",view:"front",group:"collar"},
  {id:"backInnerCollar",label:"Back Inner Collar",view:"back",group:"collar"},
]);

export function createWomensBlazerSvg(colours = {}, artwork = {}) {
  const t = "womens-blazer";
  const c = normaliseColourMap(colours, WOMENS_BLAZER_DEFAULT_COLOURS);
  // +Z-front source body: tapered waist (y260), flared split hem (y399), A-pose sleeves.
  const sleeveL = "M151 101 Q142 101 133 116 L39 315 Q36 326 48 342 L65 349 L157 173 L165 126 Z";
  const sleeveR = "M249 101 Q258 101 267 116 L361 315 Q364 326 352 342 L335 349 L243 173 L235 126 Z";
  const sideL = "M153 150 L165 170 Q160 217 173 265 L158 332 L144 394 L135 391 Q154 301 151 242 Z";
  const sideR = "M247 150 L235 170 Q240 217 227 265 L242 332 L256 394 L265 391 Q246 301 249 242 Z";
  const bodyL = "M164 101 L184 95 L201 184 Q201 227 200 249 L200 399 Q181 413 145 395 L166 322 L171 264 Q165 216 163 171 Z";
  const bodyR = "M236 101 L216 95 L199 184 Q199 227 200 249 L200 399 Q219 413 255 395 L234 322 L229 264 Q235 216 237 171 Z";
  const lapelL = "M164 104 L181 111 L199 166 L209 193 L192 202 L161 151 L155 126 L165 137 Z";
  const lapelR = "M236 104 L219 111 L201 166 L191 193 L208 202 L239 151 L245 126 L235 137 Z";
  const collarTop = "M164 103 L173 76 Q198 63 227 76 L236 103 L215 111 Q200 99 185 111 Z";
  const collarBack = "M171 93 Q199 84 229 93 L234 113 Q201 123 166 113 Z";
  const bodyBack = "M159 104 Q201 93 241 104 L244 183 Q240 228 233 257 Q227 293 243 327 L258 397 Q201 408 142 397 L157 327 Q173 293 167 257 Q160 228 156 183 Z";
  const sleevesFront = `
    ${editableRegionPath(t,artwork,"frontLeftSleeve",c.frontLeftSleeve,sleeveL)}
    ${editableRegionPath(t,artwork,"frontRightSleeve",c.frontRightSleeve,sleeveR)}
  `;
  const sleevesBack = `
    ${editableRegionPath(t,artwork,"backLeftSleeve",c.backLeftSleeve,sleeveL)}
    ${editableRegionPath(t,artwork,"backRightSleeve",c.backRightSleeve,sleeveR)}
  `;
  const front = `
    ${sleevesFront}
    ${editableRegionPath(t,artwork,"sideLeftBody",c.sideLeftBody,sideL)}
    ${editableRegionPath(t,artwork,"sideRightBody",c.sideRightBody,sideR)}
    ${editableRegionPath(t,artwork,"frontLeftBody",c.frontLeftBody,bodyL)}
    ${editableRegionPath(t,artwork,"frontRightBody",c.frontRightBody,bodyR)}
    ${editableRegionPath(t,artwork,"frontLeftLapel",c.frontLeftLapel,lapelL)}
    ${editableRegionPath(t,artwork,"frontRightLapel",c.frontRightLapel,lapelR)}
    ${editableRegionPath(t,artwork,"topCollar",c.topCollar,collarTop)}
    ${detailPath("M171 263 Q177 288 166 326",{opacity:.55,strokeWidth:1.4})}
    ${detailPath("M229 263 Q223 288 234 326",{opacity:.55,strokeWidth:1.4})}
    ${detailPath("M160 161 Q154 229 165 261",{opacity:.5,strokeWidth:1.4})}
    ${detailPath("M240 161 Q246 229 235 261",{opacity:.5,strokeWidth:1.4})}
    ${detailPath("M143 322 L58 342",{opacity:.7,strokeWidth:1.3})}
    ${detailPath("M257 322 L342 342",{opacity:.7,strokeWidth:1.3})}
    <circle cx="201" cy="253" r="4.1" fill="#b99550" stroke="#62502a" stroke-width="1.1"/>
    <circle cx="201" cy="311" r="4.1" fill="#b99550" stroke="#62502a" stroke-width="1.1"/>
    ${detailPath("M154 360 Q173 366 190 357",{strokeWidth:1.25,opacity:.52})}
    ${detailPath("M210 357 Q227 366 246 360",{strokeWidth:1.25,opacity:.52})}
  `;
  const back = `
    ${sleevesBack}
    ${editableRegionPath(t,artwork,"backBody",c.backBody,bodyBack)}
    ${editableRegionPath(t,artwork,"backInnerCollar",c.backInnerCollar,collarBack)}
    ${detailPath("M155 146 Q200 155 245 146",{strokeWidth:1.2,opacity:.5})}
    ${detailPath("M167 257 Q186 270 191 313",{opacity:.4,strokeWidth:1.4})}
    ${detailPath("M233 257 Q214 270 209 313",{opacity:.4,strokeWidth:1.4})}
    ${detailPath("M149 397 Q200 406 251 397",{strokeWidth:1.8,opacity:.72})}
    ${detailPath("M58 342 Q70 347 80 338",{opacity:.7,strokeWidth:1.4})}
    ${detailPath("M342 342 Q330 347 320 338",{opacity:.7,strokeWidth:1.4})}
  `;
  return createDualViewSvg({front,back,label:"Women's Tailored Blazer"});
}
const WOMENS_BLAZER_SVG = createWomensBlazerSvg(WOMENS_BLAZER_DEFAULT_COLOURS);

/*=========================================================
Template Definitions
=========================================================*/

/*=========================================================
Phase 4.5 — Real toorkhan source-geometry traced Women's Long V-Neck Kurta
The actual SOURCE TRIANGLES generate these 2D paths and named GLB meshes.
Do not modify region outlines independently without updating the model.
=========================================================*/
export const KURTA_DEFAULT_COLOURS = Object.freeze({
  "frontBody": "#f3f0e8",
  "backBody": "#f3f0e8",
  "frontLeftSleeve": "#f3f0e8",
  "frontRightSleeve": "#f3f0e8",
  "backLeftSleeve": "#f3f0e8",
  "backRightSleeve": "#f3f0e8",
  "frontNeckline": "#e8e1d6",
  "backNeckline": "#e8e1d6",
  "frontHem": "#e8e1d6",
  "backHem": "#e8e1d6",
});
export const KURTA_COLOUR_REGIONS = freezeRegions([
  { id: "frontBody", label: "Front Body", view: "front", group: "body" },
  { id: "backBody", label: "Back Body", view: "back", group: "body" },
  { id: "frontLeftSleeve", label: "Front Left Sleeve", view: "front", group: "sleeves" },
  { id: "frontRightSleeve", label: "Front Right Sleeve", view: "front", group: "sleeves" },
  { id: "backLeftSleeve", label: "Back Left Sleeve", view: "back", group: "sleeves" },
  { id: "backRightSleeve", label: "Back Right Sleeve", view: "back", group: "sleeves" },
  { id: "frontNeckline", label: "Front Neckline", view: "front", group: "neckline" },
  { id: "backNeckline", label: "Back Neckline", view: "back", group: "neckline" },
  { id: "frontHem", label: "Front Hem", view: "front", group: "hem" },
  { id: "backHem", label: "Back Hem", view: "back", group: "hem" },
]);
const KURTA_SOURCE_TRACED_PATHS = Object.freeze({
  "frontBody": "M156.00 80.88 L156.00 132.75 L157.62 136.00 L157.62 136.25 L157.88 136.62 L158.12 137.50 L158.50 138.12 L158.50 138.38 L159.00 139.38 L159.25 140.38 L159.50 140.75 L159.50 141.00 L159.75 141.50 L159.75 141.88 L160.00 142.38 L160.12 143.25 L160.38 143.75 L160.38 144.12 L160.62 144.62 L160.75 145.50 L161.00 146.00 L161.00 146.38 L161.12 146.50 L161.12 146.88 L161.38 147.50 L161.38 148.00 L161.50 148.12 L161.50 148.50 L161.75 149.12 L161.75 149.62 L162.00 150.25 L162.00 150.75 L162.25 151.38 L162.25 152.00 L162.38 152.12 L162.38 152.75 L162.50 152.88 L162.50 153.50 L162.62 153.62 L162.62 154.38 L162.75 154.50 L162.88 156.25 L163.00 156.38 L163.12 158.12 L163.25 158.25 L163.25 159.12 L163.38 159.25 L163.38 160.00 L163.50 160.12 L163.50 161.00 L163.62 161.12 L163.62 161.88 L163.75 162.00 L164.00 166.62 L164.12 166.75 L164.12 167.38 L164.25 167.50 L164.25 168.12 L164.38 168.25 L164.38 168.88 L164.50 169.00 L164.62 175.62 L164.50 175.75 L164.38 177.12 L164.25 177.25 L164.12 178.50 L164.00 178.62 L164.00 179.25 L163.88 179.38 L163.88 179.88 L163.75 180.00 L163.62 181.38 L163.50 181.50 L163.50 182.00 L163.38 182.12 L163.38 182.75 L163.25 182.88 L163.12 184.25 L163.00 184.38 L163.00 184.88 L162.88 185.00 L162.88 185.62 L162.75 185.75 L162.75 186.38 L162.62 186.50 L162.50 187.75 L162.38 187.88 L162.38 188.25 L162.12 188.88 L162.12 189.38 L161.88 190.00 L161.88 190.50 L161.75 190.62 L161.75 191.00 L161.50 191.62 L161.50 192.12 L161.38 192.25 L161.38 192.62 L161.25 192.75 L161.25 193.12 L161.12 193.25 L161.12 193.62 L161.00 193.75 L160.75 195.12 L160.50 195.62 L160.50 196.00 L160.38 196.12 L160.38 196.50 L160.25 196.62 L160.25 197.00 L160.12 197.12 L160.12 197.50 L160.00 197.62 L160.00 198.00 L159.88 198.12 L159.88 198.50 L159.75 198.62 L159.75 199.00 L159.62 199.12 L159.62 199.50 L159.50 199.62 L159.50 200.00 L159.38 200.12 L159.38 200.50 L159.25 200.62 L159.25 201.00 L159.12 201.12 L159.12 201.50 L159.00 201.62 L159.00 202.00 L158.88 202.12 L158.88 202.50 L158.62 203.12 L158.50 205.12 L158.38 205.25 L158.38 206.38 L158.25 206.50 L158.25 207.62 L158.12 207.75 L158.12 208.62 L158.00 208.75 L158.00 209.38 L157.88 209.50 L157.88 210.00 L157.75 210.12 L157.62 211.50 L157.50 211.62 L157.38 212.88 L157.25 213.00 L157.25 213.50 L157.12 213.62 L157.12 214.25 L157.00 214.38 L157.00 214.88 L156.88 215.00 L156.88 215.50 L156.75 215.62 L156.75 216.25 L156.62 216.38 L156.62 216.88 L156.50 217.00 L156.50 217.62 L156.38 217.75 L156.38 218.12 L156.25 218.25 L156.25 218.62 L156.12 218.75 L156.12 219.12 L156.00 219.25 L156.00 219.62 L155.75 220.25 L155.62 221.38 L155.38 222.00 L155.25 223.12 L155.00 223.75 L155.00 224.25 L154.88 224.38 L154.88 224.75 L154.62 225.38 L154.62 225.88 L154.38 226.50 L154.38 227.00 L154.25 227.12 L154.12 228.00 L154.00 228.12 L153.88 228.75 L153.62 229.12 L153.00 231.25 L152.75 231.62 L152.75 231.88 L152.38 232.75 L152.38 233.12 L152.12 233.75 L152.12 234.25 L151.88 234.88 L151.88 235.38 L151.75 235.50 L151.75 236.00 L151.50 236.62 L151.50 237.12 L151.25 237.75 L151.12 239.88 L151.00 240.00 L151.00 241.25 L150.88 241.38 L150.88 242.50 L150.75 242.62 L150.75 243.75 L150.62 243.88 L150.62 244.75 L150.50 244.88 L150.50 245.75 L150.38 245.88 L150.38 246.88 L150.25 247.00 L150.25 247.88 L150.12 248.00 L150.00 252.38 L149.88 252.50 L149.88 255.00 L149.75 255.12 L149.75 257.75 L149.62 257.88 L149.62 266.88 L149.75 267.00 L149.75 269.50 L149.50 270.00 L149.50 270.38 L149.38 270.50 L149.38 270.75 L149.00 271.62 L149.00 272.00 L148.62 272.88 L148.62 273.25 L148.38 273.75 L148.38 274.50 L148.50 274.62 L148.62 277.12 L148.75 277.25 L148.75 278.38 L148.88 278.50 L148.88 279.88 L148.75 280.00 L148.75 281.62 L148.62 281.75 L148.50 284.88 L148.62 285.00 L148.75 287.00 L148.88 287.12 L148.88 288.00 L149.00 288.12 L149.00 289.00 L149.12 289.12 L149.12 290.12 L149.25 290.25 L149.25 291.12 L149.38 291.25 L149.38 292.25 L149.50 292.38 L149.50 293.25 L149.62 293.38 L149.62 294.25 L149.75 294.38 L149.88 297.50 L150.00 297.62 L150.00 299.25 L150.12 299.38 L150.25 304.00 L150.38 304.12 L150.38 308.00 L150.50 308.12 L150.50 313.25 L150.62 313.38 L150.62 316.88 L150.75 317.00 L150.75 317.75 L248.25 317.75 L248.25 309.25 L248.38 309.12 L248.38 305.88 L248.50 305.75 L248.50 304.62 L248.62 304.50 L248.62 303.25 L248.75 303.12 L248.75 302.00 L248.88 301.88 L248.88 300.62 L249.00 300.50 L249.00 299.38 L249.12 299.25 L249.12 298.00 L249.25 297.88 L249.38 295.75 L249.50 295.62 L249.50 295.00 L249.62 294.88 L249.62 294.25 L249.75 294.12 L249.75 293.50 L249.88 293.38 L249.88 292.75 L250.00 292.62 L250.00 292.00 L250.12 291.88 L250.12 291.25 L250.25 291.12 L250.25 290.25 L250.38 290.12 L250.38 289.25 L250.50 289.12 L250.50 288.25 L250.62 288.12 L250.62 287.12 L250.75 287.00 L250.75 286.12 L250.88 286.00 L250.75 284.88 L250.38 284.00 L250.38 283.62 L250.12 283.12 L250.12 282.75 L250.00 282.62 L249.88 281.88 L249.75 281.75 L249.75 281.50 L249.50 281.00 L249.50 280.62 L249.38 280.50 L249.50 279.12 L249.62 279.00 L249.62 278.25 L249.75 278.12 L249.75 277.50 L249.88 277.38 L249.88 276.62 L250.00 276.50 L250.00 275.75 L250.12 275.62 L250.12 269.62 L250.25 269.50 L250.38 267.25 L250.50 267.12 L250.50 266.12 L250.62 266.00 L250.62 261.38 L250.50 261.25 L250.38 256.00 L250.25 255.88 L250.25 253.88 L250.12 253.75 L250.12 252.12 L250.00 252.00 L249.88 248.75 L249.75 248.62 L249.75 247.50 L249.62 247.38 L249.62 246.25 L249.50 246.12 L249.50 245.00 L249.38 244.88 L249.38 243.62 L249.25 243.50 L249.25 242.38 L249.12 242.25 L249.12 241.00 L249.00 240.88 L248.88 238.88 L248.75 238.75 L248.50 237.38 L248.25 236.88 L248.25 236.50 L248.12 236.38 L248.12 236.00 L247.88 235.50 L247.62 234.12 L247.38 233.62 L247.25 232.75 L247.00 232.25 L247.00 231.88 L246.75 231.38 L246.62 230.50 L246.38 230.00 L246.38 229.62 L246.25 229.50 L246.25 229.12 L246.12 229.00 L246.12 228.62 L245.88 228.00 L245.88 227.50 L245.62 226.88 L245.62 226.38 L245.50 226.25 L245.50 225.88 L245.25 225.25 L245.25 224.75 L245.00 224.12 L245.00 223.62 L244.88 223.50 L244.88 223.12 L244.75 223.00 L244.75 222.62 L244.62 222.50 L244.62 222.12 L244.50 222.00 L244.50 221.62 L244.38 221.50 L244.38 221.12 L244.25 221.00 L244.25 220.62 L244.00 220.00 L244.00 219.50 L243.88 219.38 L243.88 218.88 L243.75 218.75 L243.75 218.12 L243.62 218.00 L243.50 216.88 L243.38 216.75 L243.25 215.75 L243.00 215.12 L243.00 214.62 L242.75 214.00 L242.75 213.38 L242.62 213.25 L242.50 212.00 L242.38 211.88 L242.38 211.25 L242.25 211.12 L242.12 209.88 L242.00 209.75 L242.00 208.88 L241.88 208.75 L241.88 207.62 L241.75 207.50 L241.75 206.38 L241.62 206.25 L241.50 204.12 L241.38 204.00 L241.25 203.00 L241.00 202.38 L241.00 201.88 L240.88 201.75 L240.88 201.25 L240.62 200.62 L240.62 200.12 L240.50 200.00 L240.50 199.62 L240.38 199.50 L240.38 199.12 L240.25 199.00 L240.25 198.62 L240.12 198.50 L240.12 198.12 L240.00 198.00 L240.00 197.62 L239.88 197.50 L239.88 197.12 L239.75 197.00 L239.75 196.62 L239.62 196.50 L239.62 196.12 L239.50 196.00 L239.50 195.62 L239.38 195.50 L239.38 195.12 L239.25 195.00 L239.25 194.62 L239.12 194.50 L239.12 194.12 L239.00 194.00 L239.00 193.62 L238.88 193.50 L238.88 193.12 L238.62 192.50 L238.62 192.00 L238.50 191.88 L238.50 191.50 L238.38 191.38 L238.38 191.00 L238.12 190.38 L238.12 189.88 L238.00 189.75 L238.00 189.38 L237.75 188.75 L237.75 188.25 L237.62 188.12 L237.62 187.62 L237.50 187.50 L237.50 187.00 L237.38 186.88 L237.38 186.38 L237.25 186.25 L237.25 185.75 L237.12 185.62 L237.12 185.00 L237.00 184.88 L237.00 184.38 L236.88 184.25 L236.88 183.75 L236.75 183.62 L236.75 183.12 L236.62 183.00 L236.62 182.38 L236.50 182.25 L236.50 181.62 L236.38 181.50 L236.38 180.88 L236.25 180.75 L236.25 180.12 L236.12 180.00 L236.12 179.38 L236.00 179.25 L236.00 178.62 L235.88 178.50 L235.88 177.88 L235.75 177.75 L235.75 177.12 L235.62 177.00 L235.62 173.50 L235.50 173.38 L235.50 169.75 L235.62 169.62 L235.62 168.25 L235.75 168.12 L235.88 165.25 L236.00 165.12 L236.00 164.38 L236.12 164.25 L236.25 162.62 L236.38 162.50 L236.38 161.88 L236.50 161.75 L236.75 158.12 L236.88 158.00 L236.88 157.38 L237.00 157.25 L237.00 156.62 L237.12 156.50 L237.12 155.88 L237.25 155.75 L237.25 155.12 L237.38 155.00 L237.38 154.38 L237.50 154.25 L237.50 153.62 L237.62 153.50 L237.75 152.25 L237.88 152.12 L238.00 151.12 L238.12 151.00 L238.12 150.50 L238.25 150.38 L238.38 149.38 L238.62 148.75 L238.75 147.62 L238.88 147.50 L239.12 146.12 L239.38 145.62 L239.38 145.25 L239.62 144.75 L239.62 144.38 L239.88 143.88 L239.88 143.50 L240.00 143.38 L240.00 143.00 L240.25 142.50 L240.25 142.12 L240.50 141.62 L240.50 141.25 L241.00 140.25 L241.25 139.38 L241.50 139.00 L241.62 138.38 L241.88 138.00 L241.88 137.75 L242.25 137.00 L242.62 135.75 L244.00 133.12 L244.00 81.00 L243.75 81.12 L243.38 81.12 L242.88 81.38 L242.50 81.38 L242.00 81.62 L241.62 81.62 L241.50 81.75 L241.00 81.75 L240.88 81.88 L240.38 81.88 L240.25 82.00 L239.75 82.00 L239.62 82.12 L239.12 82.12 L239.00 82.25 L238.38 82.25 L238.25 82.38 L237.62 82.38 L237.50 82.50 L236.88 82.50 L236.75 82.62 L236.00 82.62 L235.88 82.75 L234.38 82.88 L234.25 83.00 L230.00 83.00 L230.00 102.38 L229.88 102.50 L213.38 102.50 L212.50 103.75 L209.88 106.50 L209.88 106.62 L205.50 110.75 L200.88 107.62 L200.25 107.00 L200.12 107.00 L198.25 105.38 L197.50 104.88 L194.88 102.50 L170.12 102.50 L170.00 102.38 L170.00 82.88 L169.75 82.88 L169.62 83.00 L169.00 83.00 L168.88 83.12 L167.88 83.12 L167.75 83.00 L166.12 83.00 L166.00 82.88 L164.62 82.88 L164.50 82.75 L164.00 82.75 L163.88 82.62 L163.38 82.62 L163.25 82.50 L162.75 82.50 L162.62 82.38 L161.38 82.25 L161.25 82.12 L160.88 82.12 L160.75 82.00 L160.38 82.00 L160.25 81.88 L159.88 81.88 L159.75 81.75 L159.38 81.75 L159.25 81.62 L158.88 81.62 L158.75 81.50 L158.38 81.50 L158.25 81.38 L157.88 81.38 L157.75 81.25 L157.38 81.25 L157.25 81.12 L156.88 81.12 L156.75 81.00 Z",
  "backBody": "M156.00 81.12 L156.00 133.62 L157.62 136.75 L157.62 137.00 L158.50 138.75 L158.50 139.00 L158.75 139.38 L158.75 139.62 L158.88 139.75 L158.88 140.00 L159.00 140.12 L159.00 140.38 L159.12 140.50 L159.12 140.75 L159.25 140.88 L159.25 141.12 L159.38 141.25 L159.38 141.50 L159.50 141.62 L159.50 141.88 L160.12 143.50 L160.12 143.88 L160.38 144.38 L160.38 144.75 L160.62 145.25 L160.62 145.62 L160.88 146.12 L160.88 146.50 L161.00 146.62 L161.00 147.00 L161.25 147.62 L161.38 148.75 L161.62 149.38 L161.62 149.88 L161.75 150.00 L161.88 151.00 L162.00 151.12 L162.00 151.62 L162.12 151.75 L162.25 152.75 L162.38 152.88 L162.38 153.50 L162.50 153.62 L162.50 154.25 L162.62 154.38 L162.62 155.00 L162.75 155.12 L162.75 155.75 L162.88 155.88 L162.88 156.50 L163.00 156.62 L163.00 157.25 L163.12 157.38 L163.12 158.00 L163.25 158.12 L163.25 158.88 L163.38 159.00 L163.38 159.88 L163.50 160.00 L163.50 160.88 L163.62 161.00 L163.62 161.88 L163.75 162.00 L163.75 162.88 L163.88 163.00 L163.88 163.88 L164.00 164.00 L164.00 165.12 L164.12 165.25 L164.12 166.62 L164.25 166.75 L164.38 169.62 L164.50 169.75 L164.38 177.00 L164.25 177.12 L164.25 177.75 L164.12 177.88 L164.12 178.50 L164.00 178.62 L164.00 179.25 L163.88 179.38 L163.88 180.00 L163.75 180.12 L163.75 180.75 L163.62 180.88 L163.62 181.50 L163.50 181.62 L163.38 183.00 L163.25 183.12 L163.25 183.62 L163.12 183.75 L163.00 184.75 L162.88 184.88 L162.88 185.38 L162.75 185.50 L162.75 186.00 L162.62 186.12 L162.62 186.75 L162.50 186.88 L162.50 187.38 L162.38 187.50 L162.25 188.75 L162.12 188.88 L162.12 189.25 L161.88 189.88 L161.88 190.38 L161.75 190.50 L161.75 190.88 L161.62 191.00 L161.62 191.38 L161.38 192.00 L161.38 192.50 L161.25 192.62 L161.25 193.00 L161.12 193.12 L161.12 193.50 L161.00 193.62 L160.75 195.00 L160.50 195.50 L160.50 195.88 L160.38 196.00 L160.38 196.38 L160.25 196.50 L160.25 196.88 L160.12 197.00 L160.12 197.38 L160.00 197.50 L160.00 197.88 L159.88 198.00 L159.88 198.38 L159.62 199.00 L159.62 199.50 L159.50 199.62 L159.38 200.62 L159.12 201.25 L159.00 202.38 L158.88 202.50 L158.75 203.50 L158.50 204.12 L158.50 205.00 L158.38 205.12 L158.38 206.25 L158.25 206.38 L158.25 207.50 L158.12 207.62 L158.00 209.75 L157.88 209.88 L157.88 210.50 L157.75 210.62 L157.75 211.12 L157.62 211.25 L157.50 212.62 L157.38 212.75 L157.25 214.00 L157.12 214.12 L157.12 214.62 L157.00 214.75 L156.75 216.50 L156.50 217.12 L156.25 218.88 L156.12 219.00 L156.00 220.00 L155.88 220.12 L155.88 220.50 L155.75 220.62 L155.75 221.00 L155.62 221.12 L155.62 221.50 L155.50 221.62 L155.50 222.00 L155.38 222.12 L155.38 222.50 L155.25 222.62 L155.25 223.00 L155.00 223.62 L155.00 224.12 L154.75 224.75 L154.75 225.25 L154.62 225.38 L154.62 225.75 L154.38 226.38 L154.38 226.88 L154.12 227.50 L154.12 228.00 L154.00 228.12 L154.00 228.50 L153.88 228.62 L153.62 230.00 L153.38 230.50 L153.38 230.88 L153.12 231.38 L153.12 231.75 L153.00 231.88 L153.00 232.25 L152.75 232.75 L152.62 233.62 L152.38 234.12 L152.12 235.50 L151.88 236.00 L151.75 236.88 L151.50 237.38 L151.50 237.75 L151.38 237.88 L151.38 238.25 L151.12 238.88 L151.12 239.62 L151.00 239.75 L150.88 242.25 L150.75 242.38 L150.62 244.88 L150.50 245.00 L150.50 246.12 L150.38 246.25 L150.38 247.38 L150.25 247.50 L150.25 248.62 L150.12 248.75 L150.12 250.12 L150.00 250.25 L149.88 253.62 L149.75 253.75 L149.62 258.62 L149.50 258.75 L149.50 262.62 L149.38 262.75 L149.38 266.00 L149.25 266.12 L149.25 267.00 L149.12 267.12 L149.00 270.88 L146.88 274.88 L147.00 275.62 L147.12 275.75 L147.12 276.12 L147.25 276.25 L147.25 276.62 L147.38 276.75 L147.38 277.12 L147.50 277.25 L147.50 277.62 L147.62 277.75 L147.62 278.12 L147.75 278.25 L147.75 278.62 L147.88 278.75 L147.88 279.12 L148.00 279.25 L148.00 279.62 L148.12 279.75 L148.25 282.62 L148.38 282.75 L148.38 284.38 L148.50 284.50 L148.50 287.88 L148.38 288.00 L148.38 293.12 L148.25 293.25 L148.25 298.38 L148.12 298.50 L148.12 303.75 L148.00 303.88 L148.00 307.75 L147.88 307.88 L147.88 310.38 L147.75 310.50 L147.75 313.00 L147.62 313.12 L147.50 317.75 L253.38 317.75 L253.38 317.25 L253.25 317.12 L253.25 315.50 L253.12 315.38 L253.00 310.75 L252.88 310.62 L252.88 309.00 L252.75 308.88 L252.75 307.25 L252.62 307.12 L252.62 305.00 L252.50 304.88 L252.50 302.38 L252.38 302.25 L252.38 299.75 L252.25 299.62 L252.12 294.88 L252.00 294.75 L252.00 293.12 L251.88 293.00 L251.88 291.38 L251.75 291.25 L251.75 274.50 L251.62 274.38 L251.62 274.00 L251.50 273.88 L251.50 273.62 L251.25 273.12 L251.25 272.75 L250.88 271.88 L250.88 271.50 L250.50 270.62 L250.50 270.25 L250.25 269.75 L250.25 267.12 L250.38 267.00 L250.38 257.88 L250.25 257.75 L250.25 255.12 L250.12 255.00 L250.12 252.50 L250.00 252.38 L249.88 248.00 L249.75 247.88 L249.62 245.88 L249.50 245.75 L249.50 244.88 L249.38 244.75 L249.38 243.88 L249.25 243.75 L249.25 242.62 L249.12 242.50 L249.12 241.38 L249.00 241.25 L249.00 240.00 L248.88 239.88 L248.75 237.75 L248.50 237.12 L248.50 236.62 L248.25 236.00 L248.25 235.50 L248.12 235.38 L248.12 234.88 L247.88 234.25 L247.88 233.75 L247.75 233.62 L247.62 232.75 L247.50 232.62 L247.25 231.62 L247.00 231.25 L246.38 229.12 L246.12 228.75 L246.12 228.50 L245.88 228.00 L245.88 227.62 L245.62 227.00 L245.62 226.50 L245.38 225.88 L245.38 225.38 L245.25 225.25 L245.25 224.88 L245.00 224.25 L245.00 223.75 L244.75 223.12 L244.75 222.62 L244.50 222.00 L244.38 220.88 L244.12 220.25 L244.12 219.75 L244.00 219.62 L244.00 219.25 L243.88 219.12 L243.88 218.75 L243.75 218.62 L243.75 218.25 L243.50 217.62 L243.50 217.00 L243.38 216.88 L243.38 216.38 L243.25 216.25 L243.25 215.75 L243.12 215.62 L243.12 215.00 L243.00 214.88 L243.00 214.38 L242.88 214.25 L242.88 213.62 L242.75 213.50 L242.62 212.25 L242.50 212.12 L242.38 210.88 L242.25 210.75 L242.25 210.12 L242.12 210.00 L242.00 208.75 L241.88 208.62 L241.88 207.75 L241.75 207.62 L241.75 206.50 L241.62 206.38 L241.62 205.25 L241.50 205.12 L241.38 203.12 L241.25 203.00 L241.25 202.62 L241.12 202.50 L241.12 202.12 L241.00 202.00 L241.00 201.62 L240.88 201.50 L240.88 201.12 L240.75 201.00 L240.75 200.62 L240.62 200.50 L240.62 200.12 L240.50 200.00 L240.50 199.62 L240.38 199.50 L240.38 199.12 L240.25 199.00 L240.25 198.62 L240.12 198.50 L240.12 198.12 L240.00 198.00 L240.00 197.62 L239.88 197.50 L239.62 196.12 L239.38 195.62 L239.38 195.25 L239.25 195.12 L239.25 194.75 L239.12 194.62 L239.12 194.25 L239.00 194.12 L239.00 193.75 L238.88 193.62 L238.88 193.25 L238.75 193.12 L238.75 192.75 L238.50 192.12 L238.50 191.62 L238.38 191.50 L238.38 191.12 L238.12 190.50 L238.12 190.00 L237.88 189.38 L237.88 188.88 L237.75 188.75 L237.75 188.38 L237.50 187.75 L237.38 186.50 L237.25 186.38 L237.25 185.75 L237.12 185.62 L237.12 185.00 L237.00 184.88 L236.88 183.62 L236.75 183.50 L236.75 182.88 L236.62 182.75 L236.62 182.12 L236.50 182.00 L236.50 181.50 L236.38 181.38 L236.25 180.00 L236.12 179.88 L236.00 178.62 L235.88 178.50 L235.88 177.88 L235.75 177.75 L235.62 176.50 L235.50 176.38 L235.50 175.75 L235.38 175.62 L235.50 168.88 L235.62 168.75 L235.62 167.62 L235.75 167.50 L235.75 166.50 L235.88 166.38 L236.00 164.00 L236.12 163.88 L236.12 163.00 L236.25 162.88 L236.25 162.00 L236.38 161.88 L236.38 161.12 L236.50 161.00 L236.50 160.12 L236.62 160.00 L236.62 159.25 L236.75 159.12 L236.75 158.25 L236.88 158.12 L236.88 157.38 L237.00 157.25 L237.00 156.38 L237.12 156.25 L237.12 155.50 L237.25 155.38 L237.25 154.50 L237.38 154.38 L237.38 153.62 L237.50 153.50 L237.62 151.88 L237.75 151.75 L237.75 151.38 L238.00 150.75 L238.00 150.25 L238.25 149.62 L238.25 149.12 L238.38 149.00 L238.38 148.62 L238.62 148.00 L238.62 147.50 L238.75 147.38 L239.00 146.00 L239.25 145.50 L239.38 144.62 L239.50 144.50 L239.50 144.25 L239.62 144.12 L239.62 143.88 L239.75 143.75 L239.75 143.50 L239.88 143.38 L239.88 143.12 L240.00 143.00 L240.00 142.75 L240.12 142.62 L240.12 142.38 L240.25 142.25 L240.25 142.00 L240.38 141.88 L241.12 139.38 L242.25 137.12 L242.25 136.88 L242.75 136.00 L242.75 135.75 L243.50 134.25 L244.00 133.50 L244.00 81.25 L243.12 81.38 L242.50 81.62 L242.00 81.62 L241.88 81.75 L241.38 81.75 L241.25 81.88 L240.75 81.88 L240.62 82.00 L240.12 82.00 L240.00 82.12 L239.50 82.12 L239.38 82.25 L238.75 82.25 L238.62 82.38 L236.88 82.62 L236.75 82.75 L235.75 82.75 L235.62 82.88 L234.00 82.88 L233.88 83.00 L232.25 83.00 L232.12 83.12 L231.12 83.12 L231.00 83.00 L230.38 83.00 L230.25 82.88 L230.00 82.88 L230.00 91.38 L229.88 91.50 L170.12 91.50 L170.00 91.38 L170.00 82.88 L169.75 83.00 L165.75 83.00 L165.62 82.88 L164.88 82.88 L164.75 82.75 L164.00 82.75 L163.88 82.62 L163.25 82.62 L163.12 82.50 L162.38 82.50 L162.25 82.38 L160.75 82.25 L160.12 82.00 L159.62 82.00 L159.50 81.88 L159.12 81.88 L158.50 81.62 L158.00 81.62 L157.88 81.50 L157.50 81.50 L157.38 81.38 L156.88 81.38 L156.75 81.25 Z",
  "frontLeftSleeve": "M156.00 80.88 L154.75 80.75 L154.62 80.62 L154.00 80.62 L153.88 80.50 L153.25 80.50 L153.12 80.38 L152.50 80.38 L152.38 80.25 L151.75 80.25 L151.62 80.12 L151.00 80.12 L150.88 80.00 L149.25 80.00 L149.12 80.12 L146.50 80.12 L146.38 80.25 L144.25 80.25 L144.12 80.38 L141.50 80.38 L141.38 80.50 L140.12 80.50 L140.00 80.62 L139.00 80.62 L138.88 80.75 L138.12 80.75 L138.00 80.88 L137.12 80.88 L137.00 81.00 L136.25 81.00 L136.12 81.12 L135.38 81.12 L135.25 81.25 L134.50 81.25 L134.38 81.38 L133.62 81.38 L133.50 81.50 L132.75 81.50 L132.62 81.62 L131.75 81.62 L131.62 81.75 L130.88 81.75 L130.75 81.88 L130.00 81.88 L129.88 82.00 L129.00 82.00 L128.88 82.12 L128.25 82.12 L128.12 82.25 L127.12 82.38 L127.00 82.50 L126.50 82.50 L126.38 82.62 L125.38 82.75 L125.25 82.88 L124.25 82.88 L124.12 83.00 L122.12 83.12 L122.00 83.25 L121.00 83.25 L120.88 83.38 L119.50 83.38 L119.38 83.50 L117.75 83.50 L117.62 83.62 L114.50 83.75 L114.38 83.88 L113.50 83.88 L113.38 84.00 L112.38 84.00 L112.25 84.12 L111.25 84.12 L111.12 84.25 L109.75 84.25 L109.62 84.38 L108.00 84.38 L107.88 84.50 L103.12 84.62 L103.00 84.75 L100.38 84.75 L100.25 84.88 L97.75 84.88 L97.62 85.00 L95.75 85.00 L95.62 85.12 L94.50 85.12 L94.38 85.25 L90.12 85.25 L90.00 85.12 L88.38 85.12 L88.25 85.00 L86.62 85.00 L86.50 84.88 L84.75 84.88 L84.62 84.75 L83.00 84.75 L82.88 84.62 L81.25 84.62 L81.12 84.50 L76.25 84.38 L76.12 84.25 L72.25 84.25 L72.12 84.38 L66.88 84.38 L66.75 84.50 L63.25 84.50 L63.12 84.62 L61.50 84.62 L61.38 84.75 L59.75 84.75 L59.62 84.88 L56.12 84.88 L56.00 85.00 L52.12 85.00 L52.00 85.12 L49.38 85.12 L49.25 85.25 L47.00 85.25 L46.88 85.38 L45.25 85.38 L45.12 85.50 L41.88 85.62 L41.75 85.75 L40.62 85.75 L40.50 85.88 L34.50 86.00 L34.50 88.00 L34.62 88.12 L34.62 89.62 L34.75 89.75 L34.75 91.75 L34.88 91.88 L35.00 96.25 L35.12 96.38 L35.25 98.88 L35.38 99.00 L35.38 100.12 L35.50 100.25 L35.62 103.38 L35.75 103.50 L35.75 105.12 L35.88 105.25 L35.88 106.62 L36.00 106.75 L36.00 107.88 L36.12 108.00 L36.25 110.38 L36.38 110.50 L36.38 111.25 L36.50 111.38 L36.50 112.00 L36.62 112.12 L36.75 113.50 L36.88 113.62 L36.88 113.88 L39.50 113.88 L39.62 114.00 L48.88 114.00 L49.00 113.88 L51.62 113.88 L51.75 113.75 L55.62 113.75 L55.75 113.88 L77.12 113.88 L77.25 114.00 L81.12 114.00 L81.25 113.88 L83.88 113.88 L84.00 113.75 L93.25 113.62 L93.38 113.50 L97.38 113.50 L97.50 113.38 L100.12 113.38 L100.25 113.25 L109.62 113.12 L109.75 113.00 L126.00 113.00 L126.12 113.12 L131.62 113.12 L131.75 113.25 L135.00 113.25 L135.12 113.38 L136.12 113.38 L136.25 113.50 L137.38 113.50 L137.50 113.62 L139.62 113.75 L139.75 113.88 L140.38 113.88 L141.62 114.50 L142.50 114.75 L143.12 115.12 L143.38 115.12 L144.12 115.50 L145.12 115.75 L146.12 116.25 L149.62 121.50 L149.88 122.12 L150.12 122.38 L150.88 123.88 L151.50 124.75 L152.25 126.25 L152.50 126.50 L152.62 126.88 L152.88 127.12 L153.75 128.75 L155.00 130.62 L156.00 132.62 Z",
  "frontRightSleeve": "M244.00 81.00 L244.00 133.00 L245.75 129.50 L246.00 129.25 L246.62 128.00 L246.88 127.75 L247.00 127.38 L248.00 125.88 L248.25 125.25 L249.25 123.75 L249.50 123.12 L250.12 122.25 L250.38 121.62 L251.00 120.75 L252.12 118.62 L255.88 116.12 L256.25 116.00 L257.75 114.88 L258.62 114.75 L258.75 114.62 L259.25 114.62 L259.38 114.50 L259.88 114.50 L260.00 114.38 L260.50 114.38 L260.62 114.25 L261.12 114.25 L261.25 114.12 L261.75 114.12 L261.88 114.00 L262.38 114.00 L262.50 113.88 L263.00 113.88 L263.12 113.75 L264.25 113.75 L264.38 113.62 L266.12 113.62 L266.25 113.50 L267.88 113.50 L268.00 113.38 L282.38 113.38 L282.50 113.50 L287.75 113.50 L287.88 113.62 L291.62 113.62 L291.75 113.75 L294.25 113.75 L294.38 113.88 L298.25 113.88 L298.38 114.00 L319.12 114.00 L319.25 114.12 L328.25 114.25 L328.38 114.38 L330.75 114.38 L330.88 114.50 L333.00 114.50 L333.12 114.62 L334.75 114.62 L334.88 114.75 L336.50 114.75 L336.62 114.88 L339.88 114.88 L340.00 115.00 L350.25 115.00 L350.38 115.12 L355.50 115.12 L355.62 115.25 L359.38 115.25 L359.50 115.38 L361.88 115.38 L362.00 115.50 L371.00 115.62 L371.12 115.75 L373.62 115.75 L373.88 115.25 L374.00 114.62 L374.25 114.25 L374.25 113.62 L374.38 113.50 L374.38 112.38 L374.50 112.25 L374.50 111.12 L374.62 111.00 L374.62 109.88 L374.75 109.75 L374.75 108.62 L374.88 108.50 L374.88 107.38 L375.00 107.25 L375.00 106.12 L375.12 106.00 L375.12 104.88 L375.25 104.75 L375.25 103.75 L375.38 103.62 L375.38 103.00 L375.50 102.88 L375.50 101.62 L375.62 101.50 L375.75 97.62 L375.88 97.50 L375.88 95.00 L376.00 94.88 L376.00 93.12 L376.12 93.00 L376.12 92.00 L376.25 91.88 L376.38 89.62 L376.50 89.50 L376.50 88.75 L376.62 88.62 L376.75 87.88 L376.12 87.88 L376.00 87.75 L374.88 87.75 L374.75 87.62 L373.50 87.62 L373.38 87.50 L372.25 87.50 L372.12 87.38 L371.00 87.38 L370.88 87.25 L370.00 87.25 L369.88 87.12 L369.00 87.12 L368.88 87.00 L367.88 87.00 L367.75 86.88 L366.88 86.88 L366.75 86.75 L365.75 86.75 L365.62 86.62 L363.62 86.50 L363.50 86.38 L362.50 86.38 L362.38 86.25 L361.50 86.25 L361.38 86.12 L360.38 86.12 L360.25 86.00 L359.38 86.00 L359.25 85.88 L358.38 85.88 L358.25 85.75 L357.25 85.75 L357.12 85.62 L356.25 85.62 L356.12 85.50 L354.88 85.50 L354.75 85.38 L353.12 85.38 L353.00 85.25 L351.38 85.25 L351.25 85.12 L347.75 85.12 L347.62 85.00 L343.75 85.00 L343.62 84.88 L341.12 84.88 L341.00 84.75 L338.50 84.75 L338.38 84.62 L335.75 84.62 L335.62 84.50 L333.12 84.50 L333.00 84.38 L330.50 84.38 L330.38 84.25 L322.50 84.38 L322.38 84.50 L320.50 84.50 L320.38 84.62 L317.88 84.75 L317.75 84.88 L307.38 84.88 L307.25 85.00 L304.75 85.12 L304.62 85.25 L304.38 85.12 L302.75 85.12 L302.62 85.00 L301.00 85.00 L300.88 84.88 L297.50 84.88 L297.38 84.75 L295.62 84.75 L295.50 84.62 L294.25 84.62 L294.12 84.50 L291.50 84.38 L291.38 84.25 L289.75 84.25 L289.62 84.12 L286.50 84.00 L286.38 83.88 L285.50 83.88 L285.38 83.75 L284.50 83.75 L284.38 83.62 L283.38 83.62 L283.25 83.50 L282.38 83.50 L282.25 83.38 L281.12 83.38 L281.00 83.25 L279.75 83.25 L279.62 83.12 L278.50 83.12 L278.38 83.00 L276.00 82.88 L275.88 82.75 L275.12 82.75 L275.00 82.62 L274.25 82.62 L274.12 82.50 L273.38 82.50 L273.25 82.38 L272.50 82.38 L272.38 82.25 L270.88 82.12 L270.75 82.00 L269.50 81.88 L269.38 81.75 L268.88 81.75 L268.75 81.62 L268.25 81.62 L268.12 81.50 L267.62 81.50 L267.50 81.38 L266.88 81.38 L266.75 81.25 L266.25 81.25 L266.12 81.12 L265.38 81.12 L265.25 81.00 L263.25 80.88 L263.12 80.75 L262.12 80.75 L262.00 80.62 L261.12 80.62 L261.00 80.50 L259.62 80.50 L259.50 80.38 L256.00 80.25 L255.88 80.12 L252.50 80.12 L252.38 80.25 L246.75 80.25 L246.62 80.38 L246.25 80.38 L246.12 80.50 L245.75 80.50 L245.62 80.62 L245.25 80.62 L245.12 80.75 L244.75 80.75 L244.62 80.88 L244.25 80.88 Z",
  "backLeftSleeve": "M156.00 81.12 L155.88 81.00 L155.38 81.00 L155.25 80.88 L153.50 80.75 L153.38 80.62 L152.62 80.62 L152.50 80.50 L151.75 80.50 L151.62 80.38 L150.75 80.38 L150.62 80.25 L144.25 80.12 L144.12 80.25 L140.50 80.38 L140.38 80.50 L139.00 80.50 L138.88 80.62 L138.00 80.62 L137.88 80.75 L136.88 80.75 L136.75 80.88 L134.75 81.00 L134.62 81.12 L133.88 81.12 L133.75 81.25 L132.50 81.38 L132.38 81.50 L131.88 81.50 L131.75 81.62 L131.25 81.62 L131.12 81.75 L130.62 81.75 L130.50 81.88 L129.88 81.88 L129.75 82.00 L129.25 82.00 L129.12 82.12 L127.62 82.25 L127.50 82.38 L126.75 82.38 L126.62 82.50 L125.88 82.50 L125.75 82.62 L125.00 82.62 L124.88 82.75 L124.12 82.75 L124.00 82.88 L121.62 83.00 L121.50 83.12 L120.38 83.12 L120.25 83.25 L119.00 83.25 L118.88 83.38 L117.75 83.38 L117.62 83.50 L116.75 83.50 L116.62 83.62 L115.75 83.62 L115.62 83.75 L114.62 83.75 L114.50 83.88 L113.62 83.88 L113.50 84.00 L110.50 84.12 L110.38 84.25 L108.75 84.25 L108.62 84.38 L107.12 84.38 L107.00 84.50 L104.50 84.62 L104.38 84.75 L103.25 84.75 L103.12 84.88 L101.88 84.88 L101.75 85.00 L100.62 85.00 L100.50 85.12 L99.25 85.12 L99.12 85.25 L98.00 85.25 L97.88 85.38 L96.62 85.38 L96.50 85.25 L94.00 85.12 L93.88 85.00 L92.75 85.00 L92.62 84.88 L80.88 84.88 L80.75 84.75 L78.25 84.62 L78.12 84.50 L77.00 84.50 L76.88 84.38 L69.62 84.25 L69.50 84.38 L67.00 84.38 L66.88 84.50 L64.38 84.50 L64.25 84.62 L61.62 84.62 L61.50 84.75 L59.00 84.75 L58.88 84.88 L56.38 84.88 L56.25 85.00 L52.38 85.00 L52.25 85.12 L48.88 85.12 L48.75 85.25 L45.38 85.38 L45.25 85.50 L43.88 85.50 L43.75 85.62 L42.88 85.62 L42.75 85.75 L41.88 85.75 L41.75 85.88 L40.75 85.88 L40.62 86.00 L39.75 86.00 L39.62 86.12 L38.50 86.12 L38.38 86.25 L36.00 86.38 L35.88 86.50 L35.12 86.50 L35.00 86.62 L34.25 86.62 L34.12 86.75 L33.25 86.75 L33.12 86.88 L32.25 86.88 L32.12 87.00 L31.25 87.00 L31.12 87.12 L29.12 87.25 L29.00 87.38 L27.88 87.38 L27.75 87.50 L26.62 87.50 L26.50 87.62 L25.25 87.62 L25.12 87.75 L24.00 87.75 L23.88 87.88 L23.25 87.88 L23.25 88.25 L23.38 88.38 L23.38 89.38 L23.50 89.50 L23.50 90.75 L23.62 90.88 L23.75 93.88 L23.88 94.00 L24.00 96.00 L24.12 96.12 L24.12 97.00 L24.25 97.12 L24.25 98.00 L24.38 98.12 L24.38 99.25 L24.50 99.38 L24.50 100.50 L24.62 100.62 L24.62 101.88 L24.75 102.00 L24.88 104.38 L25.00 104.50 L25.00 105.38 L25.12 105.50 L25.12 106.38 L25.25 106.50 L25.25 107.38 L25.38 107.50 L25.38 108.38 L25.50 108.50 L25.50 109.38 L25.62 109.50 L25.62 110.38 L25.75 110.50 L25.75 111.38 L25.88 111.50 L25.88 112.25 L26.00 112.38 L26.00 113.25 L26.12 113.38 L26.12 114.25 L26.25 114.38 L26.25 115.25 L26.38 115.38 L26.38 115.75 L28.88 115.75 L29.00 115.62 L34.12 115.62 L34.25 115.50 L38.00 115.50 L38.12 115.38 L40.50 115.38 L40.62 115.25 L49.62 115.12 L49.75 115.00 L60.00 115.00 L60.12 114.88 L63.50 114.88 L63.62 114.75 L65.25 114.75 L65.38 114.62 L67.00 114.62 L67.12 114.50 L69.12 114.50 L69.25 114.38 L71.62 114.38 L71.75 114.25 L80.75 114.12 L80.88 114.00 L101.75 114.00 L101.88 113.88 L105.62 113.88 L105.75 113.75 L108.25 113.75 L108.38 113.62 L112.25 113.62 L112.38 113.50 L117.50 113.50 L117.62 113.38 L132.00 113.38 L132.12 113.50 L133.88 113.50 L134.00 113.62 L136.88 113.75 L137.00 113.88 L137.50 113.88 L137.62 114.00 L138.12 114.00 L138.25 114.12 L138.75 114.12 L138.88 114.25 L139.38 114.25 L139.50 114.38 L140.00 114.38 L140.12 114.50 L140.62 114.50 L140.75 114.62 L141.25 114.62 L141.38 114.75 L142.25 114.88 L143.38 115.75 L144.12 116.12 L145.12 116.88 L145.50 117.00 L147.88 118.62 L148.12 119.25 L148.38 119.50 L149.00 120.75 L149.62 121.62 L150.00 122.38 L150.00 122.62 L150.50 123.50 L150.50 123.75 L151.62 126.00 L151.88 126.25 L152.25 127.12 L152.50 127.38 L153.00 128.50 L153.50 129.12 L153.62 129.50 L155.38 132.12 L156.00 133.50 Z",
  "backRightSleeve": "M244.00 81.25 L244.00 133.50 L244.50 132.75 L244.62 132.38 L244.88 132.12 L245.00 131.75 L245.25 131.50 L245.38 131.12 L245.62 130.88 L245.75 130.50 L246.00 130.25 L246.12 129.88 L246.38 129.62 L246.62 129.00 L246.88 128.75 L247.38 127.75 L247.62 127.50 L248.75 125.38 L249.00 125.12 L251.12 120.38 L253.88 116.25 L254.88 115.75 L255.12 115.75 L255.25 115.62 L255.88 115.50 L256.25 115.25 L256.88 115.12 L257.25 114.88 L257.50 114.88 L258.12 114.50 L259.00 114.25 L259.62 113.88 L261.38 113.75 L261.50 113.62 L262.62 113.62 L262.75 113.50 L263.75 113.50 L263.88 113.38 L264.88 113.38 L265.00 113.25 L268.25 113.25 L268.38 113.12 L273.88 113.12 L274.00 113.00 L290.38 113.00 L290.50 113.12 L294.50 113.12 L294.62 113.25 L299.88 113.25 L300.00 113.38 L302.62 113.38 L302.75 113.50 L305.25 113.50 L305.38 113.62 L312.00 113.62 L312.12 113.75 L316.00 113.75 L316.12 113.88 L320.75 114.00 L320.88 114.12 L322.00 114.12 L322.12 114.25 L328.75 114.12 L328.88 114.00 L330.12 114.00 L330.25 113.88 L342.88 113.88 L343.00 114.00 L351.00 113.88 L351.12 114.00 L360.38 114.00 L360.50 113.88 L363.12 113.88 L363.25 113.62 L363.25 113.25 L363.38 113.12 L363.38 112.25 L363.50 112.12 L363.50 110.88 L363.62 110.75 L363.62 109.38 L363.75 109.25 L363.88 106.38 L364.00 106.25 L364.00 104.75 L364.12 104.62 L364.12 103.12 L364.25 103.00 L364.25 101.38 L364.38 101.25 L364.38 99.62 L364.50 99.50 L364.50 97.88 L364.62 97.75 L364.62 96.25 L364.75 96.12 L364.88 93.25 L365.00 93.12 L365.00 92.12 L365.12 92.00 L365.25 88.12 L365.38 88.00 L365.38 86.75 L365.50 86.62 L365.50 86.00 L362.88 86.00 L362.75 85.88 L358.88 85.88 L358.75 85.75 L356.12 85.75 L356.00 85.62 L350.75 85.50 L350.62 85.38 L348.12 85.38 L348.00 85.25 L345.38 85.25 L345.25 85.12 L342.62 85.12 L342.50 85.00 L339.88 85.00 L339.75 84.88 L335.88 84.88 L335.75 84.75 L331.88 84.75 L331.75 84.62 L329.12 84.62 L329.00 84.50 L326.88 84.50 L326.75 84.62 L323.38 84.75 L323.25 84.88 L321.75 84.88 L321.62 85.00 L320.38 85.00 L320.25 85.12 L317.75 85.25 L317.62 85.38 L316.25 85.38 L316.12 85.50 L314.50 85.50 L314.38 85.62 L312.75 85.62 L312.62 85.75 L305.12 85.75 L305.00 85.62 L302.38 85.62 L302.25 85.50 L300.50 85.50 L300.38 85.38 L299.50 85.38 L299.38 85.25 L298.38 85.25 L298.25 85.12 L297.25 85.12 L297.12 85.00 L295.00 84.88 L294.88 84.75 L293.75 84.75 L293.62 84.62 L291.12 84.50 L291.00 84.38 L289.88 84.38 L289.75 84.25 L287.75 84.12 L287.62 84.00 L286.62 84.00 L286.50 83.88 L285.62 83.88 L285.50 83.75 L284.12 83.75 L284.00 83.62 L282.38 83.62 L282.25 83.50 L280.62 83.50 L280.50 83.38 L278.00 83.25 L277.88 83.12 L277.00 83.12 L276.88 83.00 L275.88 83.00 L275.75 82.88 L273.75 82.75 L273.62 82.62 L273.00 82.62 L272.88 82.50 L272.25 82.50 L272.12 82.38 L271.50 82.38 L271.38 82.25 L270.75 82.25 L270.62 82.12 L270.00 82.12 L269.88 82.00 L269.25 82.00 L269.12 81.88 L268.38 81.88 L268.25 81.75 L267.62 81.75 L267.50 81.62 L266.88 81.62 L266.75 81.50 L266.12 81.50 L266.00 81.38 L265.38 81.38 L265.25 81.25 L264.62 81.25 L264.50 81.12 L263.88 81.12 L263.75 81.00 L261.75 80.88 L261.62 80.75 L259.62 80.62 L259.50 80.50 L258.50 80.50 L258.38 80.38 L251.50 80.25 L251.38 80.38 L249.75 80.38 L249.62 80.50 L246.75 80.62 L246.62 80.75 L246.12 80.75 L245.50 81.00 L245.00 81.00 L244.88 81.12 Z",
  "frontNeckline": "M230.00 83.00 L228.88 83.00 L226.00 85.38 L223.62 89.12 L220.50 92.88 L220.50 93.00 L219.62 94.00 L219.25 94.62 L218.75 95.12 L217.75 96.62 L217.38 97.00 L216.88 97.88 L216.50 98.25 L216.00 99.12 L215.62 99.50 L215.38 100.00 L213.38 102.50 L230.00 102.50 Z M170.00 82.88 L170.00 102.50 L194.88 102.50 L191.88 99.62 L191.75 99.62 L185.50 93.38 L185.38 93.38 L180.88 89.12 L180.75 89.12 L179.50 87.88 L179.50 87.75 L178.38 86.62 L178.38 86.50 L177.25 85.38 L177.25 85.25 L173.88 82.12 Z",
  "backNeckline": "M230.00 82.88 L229.12 82.75 L229.00 82.62 L228.50 82.62 L228.38 82.50 L227.88 82.50 L227.75 82.38 L226.50 82.25 L226.38 82.12 L225.50 82.12 L225.38 82.00 L223.38 81.88 L218.75 84.25 L218.50 84.25 L216.12 85.38 L215.25 85.62 L213.75 86.38 L213.50 86.38 L213.38 86.50 L213.12 86.50 L213.00 86.62 L212.75 86.62 L211.12 87.25 L210.75 87.25 L210.62 87.38 L210.38 87.38 L210.25 87.50 L210.00 87.50 L208.38 88.12 L208.00 88.12 L207.88 88.25 L207.50 88.25 L207.38 88.38 L207.00 88.38 L206.88 88.50 L206.50 88.50 L206.38 88.62 L206.00 88.62 L205.88 88.75 L205.50 88.75 L205.38 88.88 L205.00 88.88 L204.88 89.00 L204.50 89.00 L203.88 89.25 L203.38 89.25 L202.75 89.50 L202.25 89.50 L202.12 89.62 L201.62 89.62 L201.00 89.88 L199.88 90.00 L199.25 90.25 L198.12 90.38 L198.00 90.25 L197.00 90.12 L196.38 89.88 L195.88 89.88 L195.75 89.75 L195.25 89.75 L194.62 89.50 L194.12 89.50 L194.00 89.38 L193.62 89.38 L193.50 89.25 L193.12 89.25 L193.00 89.12 L191.62 88.88 L191.12 88.62 L190.25 88.50 L189.75 88.25 L188.38 88.00 L188.25 87.88 L188.00 87.88 L187.88 87.75 L187.62 87.75 L187.50 87.62 L187.25 87.62 L185.62 87.00 L185.25 87.00 L185.12 86.88 L183.00 86.25 L181.25 85.38 L181.00 85.38 L179.25 84.50 L179.00 84.50 L178.38 84.12 L178.12 84.12 L177.50 83.75 L176.62 83.50 L176.00 83.12 L175.12 82.88 L173.88 82.25 L172.25 82.38 L172.12 82.50 L171.38 82.50 L171.25 82.62 L170.88 82.62 L170.75 82.75 L170.00 82.88 L170.00 91.50 L230.00 91.50 Z",
  "frontHem": "M150.75 317.75 L150.88 331.88 L152.12 331.38 L152.50 330.75 L153.50 330.25 L154.75 330.25 L154.88 330.12 L160.25 330.12 L160.38 330.25 L169.12 330.25 L169.25 330.38 L176.12 330.38 L176.25 330.50 L181.50 330.50 L181.62 330.62 L192.12 330.62 L192.25 330.75 L197.38 330.75 L197.50 330.88 L208.00 330.88 L208.12 331.00 L218.62 331.00 L218.75 331.12 L234.50 331.12 L234.62 331.25 L245.25 331.25 L245.38 331.38 L246.75 331.38 L247.75 331.88 L248.25 332.50 L248.25 333.00 L248.25 317.75 Z",
  "backHem": "M147.50 317.75 L147.50 320.00 L147.38 320.12 L147.38 323.62 L147.25 323.75 L147.25 326.25 L147.12 326.38 L147.12 328.88 L147.00 329.00 L147.00 331.50 L146.88 331.62 L146.88 332.88 L147.25 332.50 L148.12 332.38 L148.75 332.12 L149.88 332.12 L150.00 332.00 L151.88 332.00 L152.00 331.88 L181.75 331.88 L181.88 331.75 L192.25 331.75 L192.38 331.62 L197.50 331.62 L197.62 331.50 L207.88 331.50 L208.00 331.38 L213.00 331.38 L213.12 331.50 L223.12 331.50 L223.25 331.62 L233.50 331.62 L233.62 331.75 L236.88 331.75 L237.00 331.88 L238.88 331.88 L239.00 332.00 L241.50 332.00 L241.62 332.12 L245.75 332.12 L245.88 332.25 L248.38 332.25 L248.50 332.38 L250.25 332.38 L250.38 332.50 L252.75 332.50 L252.88 332.62 L254.38 332.62 L254.38 331.88 L254.25 331.75 L254.25 330.12 L254.12 330.00 L254.12 328.38 L254.00 328.25 L254.00 326.62 L253.88 326.50 L253.88 324.88 L253.75 324.75 L253.75 323.12 L253.62 323.00 L253.62 321.12 L253.50 321.00 L253.50 318.88 L253.38 318.75 L253.38 317.75 Z",
});
export function createKurtaSvg(colours = {}, artwork = {}) {
  const templateId = "kurta";
  const c = normaliseColourMap(colours, KURTA_DEFAULT_COLOURS);
  const front = [
    editableRegionPath(templateId, artwork, "frontBody", c["frontBody"], KURTA_SOURCE_TRACED_PATHS["frontBody"], {strokeWidth: 0.7, extraAttributes: "fill-rule=\"evenodd\""}),
    editableRegionPath(templateId, artwork, "frontLeftSleeve", c["frontLeftSleeve"], KURTA_SOURCE_TRACED_PATHS["frontLeftSleeve"], {strokeWidth: 0.7, extraAttributes: "fill-rule=\"evenodd\""}),
    editableRegionPath(templateId, artwork, "frontRightSleeve", c["frontRightSleeve"], KURTA_SOURCE_TRACED_PATHS["frontRightSleeve"], {strokeWidth: 0.7, extraAttributes: "fill-rule=\"evenodd\""}),
    editableRegionPath(templateId, artwork, "frontNeckline", c["frontNeckline"], KURTA_SOURCE_TRACED_PATHS["frontNeckline"], {strokeWidth: 0.7, extraAttributes: "fill-rule=\"evenodd\""}),
    editableRegionPath(templateId, artwork, "frontHem", c["frontHem"], KURTA_SOURCE_TRACED_PATHS["frontHem"], {strokeWidth: 0.7, extraAttributes: "fill-rule=\"evenodd\""}),
  ].join("\n");
  const back = [
    editableRegionPath(templateId, artwork, "backBody", c["backBody"], KURTA_SOURCE_TRACED_PATHS["backBody"], {strokeWidth: 0.7, extraAttributes: "fill-rule=\"evenodd\""}),
    editableRegionPath(templateId, artwork, "backLeftSleeve", c["backLeftSleeve"], KURTA_SOURCE_TRACED_PATHS["backLeftSleeve"], {strokeWidth: 0.7, extraAttributes: "fill-rule=\"evenodd\""}),
    editableRegionPath(templateId, artwork, "backRightSleeve", c["backRightSleeve"], KURTA_SOURCE_TRACED_PATHS["backRightSleeve"], {strokeWidth: 0.7, extraAttributes: "fill-rule=\"evenodd\""}),
    editableRegionPath(templateId, artwork, "backNeckline", c["backNeckline"], KURTA_SOURCE_TRACED_PATHS["backNeckline"], {strokeWidth: 0.7, extraAttributes: "fill-rule=\"evenodd\""}),
    editableRegionPath(templateId, artwork, "backHem", c["backHem"], KURTA_SOURCE_TRACED_PATHS["backHem"], {strokeWidth: 0.7, extraAttributes: "fill-rule=\"evenodd\""}),
  ].join("\n");
  return createDualViewSvg({ front, back, label: "Women's Long V-Neck Kurta" });
}
const KURTA_SVG = createKurtaSvg(KURTA_DEFAULT_COLOURS);

/*=========================================================
Phase 4.5 — Real toorkhan source-geometry traced Slim Suruwal
The actual SOURCE TRIANGLES generate these 2D paths and named GLB meshes.
Do not modify region outlines independently without updating the model.
=========================================================*/
export const SLIM_SURUWAL_DEFAULT_COLOURS = Object.freeze({
  "frontWaistband": "#e8e1d6",
  "backWaistband": "#e8e1d6",
  "frontLeftLeg": "#f3f0e8",
  "frontRightLeg": "#f3f0e8",
  "backLeftLeg": "#f3f0e8",
  "backRightLeg": "#f3f0e8",
});
export const SLIM_SURUWAL_COLOUR_REGIONS = freezeRegions([
  { id: "frontWaistband", label: "Front Waistband", view: "front", group: "waistband" },
  { id: "backWaistband", label: "Back Waistband", view: "back", group: "waistband" },
  { id: "frontLeftLeg", label: "Front Left Leg", view: "front", group: "legs" },
  { id: "frontRightLeg", label: "Front Right Leg", view: "front", group: "legs" },
  { id: "backLeftLeg", label: "Back Left Leg", view: "back", group: "legs" },
  { id: "backRightLeg", label: "Back Right Leg", view: "back", group: "legs" },
]);
const SLIM_SURUWAL_SOURCE_TRACED_PATHS = Object.freeze({
  "frontWaistband": "M130.62 114.75 L130.62 116.62 L269.50 116.62 L269.38 114.62 L269.25 114.50 L269.25 113.38 L269.12 113.25 L269.12 112.12 L269.00 112.00 L269.00 110.88 L268.88 110.75 L268.88 109.62 L268.75 109.50 L268.75 108.00 L268.62 107.88 L268.62 106.00 L268.50 105.88 L268.38 102.38 L268.25 102.25 L268.25 101.38 L268.12 101.25 L268.12 100.25 L268.00 100.12 L268.00 99.25 L267.88 99.12 L267.88 98.25 L267.75 98.12 L267.75 97.12 L267.62 97.00 L267.50 95.38 L267.38 95.25 L267.38 94.88 L267.25 94.75 L267.25 94.38 L267.12 94.25 L267.12 93.88 L267.00 93.75 L267.00 93.38 L266.88 93.25 L266.88 92.88 L266.75 92.75 L266.75 92.38 L266.62 92.25 L266.62 91.88 L266.50 91.75 L266.25 90.38 L264.25 86.38 L260.75 82.50 L260.75 82.38 L260.25 81.88 L259.50 81.50 L259.25 81.50 L258.62 81.12 L258.38 81.12 L257.75 80.75 L257.50 80.75 L256.62 80.25 L256.38 80.25 L254.00 79.12 L253.50 79.12 L253.38 79.00 L252.50 79.00 L252.38 78.88 L251.50 78.88 L251.38 78.75 L250.50 78.75 L250.38 78.62 L249.50 78.62 L249.38 78.50 L248.50 78.50 L248.38 78.38 L247.50 78.38 L247.38 78.25 L246.50 78.25 L246.38 78.12 L236.00 78.25 L235.88 78.38 L232.88 78.50 L232.75 78.62 L231.38 78.62 L231.25 78.75 L229.75 78.75 L229.62 78.88 L228.25 78.88 L228.12 79.00 L226.62 79.00 L226.50 79.12 L225.12 79.12 L225.00 79.25 L223.62 79.25 L223.50 79.38 L222.12 79.38 L222.00 79.50 L220.62 79.50 L220.50 79.62 L219.12 79.62 L219.00 79.75 L213.75 79.88 L213.62 80.00 L210.75 80.00 L210.62 80.12 L195.38 80.12 L195.25 80.00 L189.50 80.00 L189.38 79.88 L187.25 79.88 L187.12 79.75 L182.62 79.62 L182.50 79.50 L180.62 79.50 L180.50 79.38 L179.12 79.38 L179.00 79.25 L177.62 79.25 L177.50 79.12 L176.12 79.12 L176.00 79.00 L174.62 79.00 L174.50 78.88 L173.12 78.88 L173.00 78.75 L171.50 78.75 L171.38 78.62 L170.00 78.62 L169.88 78.50 L168.50 78.50 L168.38 78.38 L167.00 78.38 L166.88 78.25 L165.50 78.25 L165.38 78.12 L164.00 78.12 L163.88 78.00 L160.88 78.00 L160.75 78.12 L156.12 78.12 L156.00 78.25 L153.38 78.25 L153.25 78.38 L152.50 78.38 L152.38 78.50 L151.62 78.50 L151.50 78.62 L150.75 78.62 L150.62 78.75 L149.88 78.75 L149.75 78.88 L149.00 78.88 L148.88 79.00 L148.12 79.00 L148.00 79.12 L146.38 79.25 L146.25 79.38 L145.75 79.38 L145.25 79.62 L144.88 79.62 L143.25 80.25 L142.88 80.25 L141.25 80.88 L140.88 80.88 L140.00 81.25 L139.62 81.62 L139.12 81.88 L138.75 82.25 L136.88 83.50 L134.75 86.50 L134.38 87.38 L134.38 87.75 L134.00 88.62 L134.00 89.00 L133.88 89.12 L133.88 89.38 L133.62 89.88 L133.62 90.25 L133.50 90.38 L133.50 90.62 L133.25 91.12 L133.25 91.50 L133.12 91.62 L133.00 93.00 L132.88 93.12 L132.88 93.88 L132.75 94.00 L132.75 94.75 L132.62 94.88 L132.50 96.62 L132.38 96.75 L132.38 97.50 L132.25 97.62 L132.25 98.38 L132.12 98.50 L132.00 101.00 L131.88 101.12 L131.88 102.50 L131.75 102.62 L131.75 103.75 L131.62 103.88 L131.62 104.75 L131.50 104.88 L131.50 105.62 L131.38 105.75 L131.38 106.50 L131.25 106.62 L131.25 107.50 L131.12 107.62 L131.12 108.38 L131.00 108.50 L131.00 109.38 L130.88 109.50 L130.88 111.38 L130.75 111.50 L130.75 114.62 Z",
  "backWaistband": "M269.38 114.75 L269.25 114.62 L269.25 111.50 L269.12 111.38 L269.12 109.50 L269.00 109.38 L269.00 108.50 L268.88 108.38 L268.88 107.62 L268.75 107.50 L268.75 106.75 L268.62 106.62 L268.62 105.75 L268.50 105.62 L268.50 104.88 L268.38 104.75 L268.25 103.00 L268.12 102.88 L268.12 102.25 L268.00 102.12 L268.00 101.38 L267.88 101.25 L267.88 100.50 L267.75 100.38 L267.75 99.75 L267.62 99.62 L267.62 98.88 L267.50 98.75 L267.50 98.00 L267.38 97.88 L267.25 96.50 L267.12 96.38 L267.12 96.00 L267.00 95.88 L267.00 95.50 L266.75 94.88 L266.75 94.38 L266.62 94.25 L266.62 93.88 L266.50 93.75 L266.50 93.38 L266.38 93.25 L266.25 92.25 L266.12 92.12 L266.12 91.75 L266.00 91.62 L266.00 91.25 L265.88 91.12 L265.75 90.38 L264.75 94.25 L261.25 97.88 L260.00 98.50 L259.75 98.75 L259.38 98.88 L257.88 99.88 L257.25 100.12 L257.00 100.38 L254.50 101.62 L254.25 101.62 L252.62 102.50 L252.38 102.50 L250.50 103.50 L250.12 103.50 L250.00 103.62 L249.62 103.62 L249.50 103.75 L249.12 103.75 L248.50 104.00 L248.00 104.00 L247.88 104.12 L247.50 104.12 L246.88 104.38 L246.38 104.38 L246.25 104.50 L245.88 104.50 L245.75 104.62 L245.38 104.62 L244.75 104.88 L244.25 104.88 L244.12 105.00 L243.75 105.00 L243.12 105.25 L242.50 105.25 L242.38 105.38 L241.75 105.38 L241.62 105.50 L241.00 105.50 L240.88 105.62 L240.25 105.62 L240.12 105.75 L239.50 105.75 L239.38 105.88 L238.75 105.88 L238.62 106.00 L238.00 106.00 L237.88 106.12 L237.25 106.12 L237.12 106.25 L236.50 106.25 L236.38 106.38 L235.75 106.38 L235.62 106.50 L235.00 106.50 L234.88 106.62 L233.25 106.62 L233.12 106.75 L230.50 106.75 L230.38 106.88 L227.75 106.88 L227.62 107.00 L222.25 107.00 L222.12 106.88 L213.88 106.88 L213.75 107.00 L207.62 107.00 L207.50 107.12 L198.25 107.25 L198.12 107.38 L190.88 107.50 L190.75 107.62 L186.62 107.62 L186.50 107.75 L183.50 107.75 L183.38 107.88 L181.38 107.88 L181.25 108.00 L179.25 108.00 L179.12 108.12 L175.25 108.25 L175.12 108.38 L173.62 108.38 L173.50 108.50 L172.00 108.50 L171.88 108.62 L170.25 108.62 L170.12 108.75 L168.62 108.75 L168.50 108.88 L167.00 108.88 L166.88 108.75 L165.25 108.75 L165.12 108.62 L163.62 108.62 L163.50 108.50 L161.88 108.50 L161.75 108.38 L160.12 108.38 L160.00 108.25 L159.00 108.25 L158.38 108.00 L157.88 108.00 L157.25 107.75 L156.75 107.75 L156.12 107.50 L155.62 107.50 L155.50 107.38 L155.00 107.38 L154.38 107.12 L153.88 107.12 L153.25 106.88 L152.75 106.88 L152.62 106.75 L151.75 106.62 L151.00 106.25 L150.38 106.12 L150.00 105.88 L149.38 105.75 L149.00 105.50 L148.00 105.25 L147.62 105.00 L147.38 105.00 L146.62 104.62 L146.00 104.50 L145.62 104.25 L145.00 104.12 L143.38 103.25 L143.12 103.25 L141.50 102.38 L141.25 102.38 L139.50 101.50 L135.38 97.62 L134.62 96.00 L134.38 95.75 L133.62 94.25 L133.62 94.50 L133.50 94.62 L133.50 95.25 L133.38 95.38 L133.38 96.00 L133.25 96.12 L133.25 96.75 L133.12 96.88 L133.12 97.38 L133.00 97.50 L133.00 98.12 L132.88 98.25 L132.88 98.88 L132.75 99.00 L132.75 99.62 L132.62 99.75 L132.62 100.38 L132.50 100.50 L132.50 101.12 L132.38 101.25 L132.38 101.88 L132.25 102.00 L132.25 102.75 L132.12 102.88 L132.12 103.62 L132.00 103.75 L132.00 104.38 L131.88 104.50 L131.75 106.12 L131.62 106.25 L131.62 106.88 L131.50 107.00 L131.50 108.00 L131.38 108.12 L131.38 109.38 L131.25 109.50 L131.25 110.62 L131.12 110.75 L131.12 112.00 L131.00 112.12 L131.00 113.38 L130.88 113.50 L130.88 114.62 L130.75 114.75 L130.75 115.88 L130.62 116.00 L130.62 116.62 L269.38 116.62 Z",
  "frontLeftLeg": "M200.00 116.62 L130.62 116.62 L130.62 117.62 L130.50 117.75 L130.50 119.62 L130.38 119.75 L130.38 121.75 L130.25 121.88 L130.25 126.12 L130.12 126.25 L130.12 132.75 L130.25 132.88 L130.25 137.00 L130.38 137.12 L130.38 139.25 L130.50 139.38 L130.50 141.38 L130.62 141.50 L130.62 143.62 L130.75 143.75 L130.88 148.12 L131.00 148.25 L131.00 150.12 L131.12 150.25 L131.12 151.88 L131.25 152.00 L131.25 153.50 L131.38 153.62 L131.50 156.75 L131.62 156.88 L131.75 159.38 L131.88 159.50 L131.88 160.75 L132.00 160.88 L132.00 162.00 L132.12 162.12 L132.12 163.50 L132.25 163.62 L132.25 165.25 L132.38 165.38 L132.38 167.00 L132.50 167.12 L132.50 168.75 L132.62 168.88 L132.62 170.50 L132.75 170.62 L132.75 172.25 L132.88 172.38 L133.00 175.75 L133.12 175.88 L133.12 177.00 L133.25 177.12 L133.25 177.75 L133.38 177.88 L133.38 178.50 L133.50 178.62 L133.50 179.38 L133.62 179.50 L133.62 180.12 L133.75 180.25 L133.75 180.88 L133.88 181.00 L133.88 181.75 L134.00 181.88 L134.00 182.50 L134.12 182.62 L134.12 183.25 L134.25 183.38 L134.25 184.25 L134.38 184.38 L134.38 185.50 L134.50 185.62 L134.62 187.88 L134.75 188.00 L134.88 190.25 L135.00 190.38 L135.00 191.75 L135.12 191.88 L135.12 193.50 L135.25 193.62 L135.38 197.00 L135.50 197.12 L135.50 201.50 L135.62 201.62 L135.50 227.25 L135.38 227.38 L135.38 228.75 L135.25 228.88 L135.25 230.12 L135.12 230.25 L135.12 231.50 L135.00 231.62 L134.88 234.00 L134.62 234.62 L134.50 235.75 L134.25 236.38 L134.25 236.88 L134.12 237.00 L134.00 238.00 L133.75 238.62 L133.62 239.75 L133.38 240.38 L133.38 240.88 L133.25 241.00 L133.25 241.50 L133.12 241.62 L133.12 242.12 L133.00 242.25 L133.00 242.88 L132.88 243.00 L132.88 243.50 L132.75 243.62 L132.75 244.12 L132.62 244.25 L132.62 244.75 L132.50 244.88 L132.50 245.38 L132.38 245.50 L132.38 246.12 L132.25 246.25 L132.00 248.00 L131.88 248.12 L131.88 248.50 L131.62 249.12 L131.62 249.62 L131.38 250.25 L131.38 250.75 L131.25 250.88 L131.25 251.25 L131.00 251.88 L131.00 252.38 L130.75 253.00 L130.75 253.50 L130.62 253.62 L130.62 254.00 L130.38 254.62 L130.38 255.12 L130.25 255.25 L130.25 255.88 L130.12 256.00 L130.12 256.62 L130.00 256.75 L130.00 257.38 L129.88 257.50 L129.88 258.12 L129.75 258.25 L129.75 259.00 L129.62 259.12 L129.62 259.88 L129.50 260.00 L129.50 260.88 L129.38 261.00 L129.25 262.62 L129.12 262.75 L129.12 263.62 L129.00 263.75 L129.00 264.50 L128.88 264.62 L128.88 265.50 L128.75 265.62 L128.75 266.38 L128.62 266.50 L128.62 267.38 L128.50 267.50 L128.50 268.25 L128.38 268.38 L128.38 269.25 L128.25 269.38 L128.25 273.50 L128.12 273.62 L128.00 286.88 L128.12 287.00 L128.12 290.75 L128.25 290.88 L128.25 293.12 L128.38 293.25 L128.38 294.12 L128.50 294.25 L128.62 296.00 L128.75 296.12 L128.88 297.88 L129.00 298.00 L129.12 299.75 L129.25 299.88 L129.25 300.75 L129.38 300.88 L129.38 301.75 L129.50 301.88 L129.50 302.88 L129.62 303.00 L129.62 303.88 L129.75 304.00 L129.75 304.88 L129.88 305.00 L129.88 306.00 L130.00 306.12 L130.12 308.12 L130.25 308.25 L130.25 309.12 L130.38 309.25 L130.38 310.25 L130.50 310.38 L130.50 311.25 L130.62 311.38 L130.62 312.25 L130.75 312.38 L130.75 313.38 L130.88 313.50 L130.88 314.38 L131.00 314.50 L131.00 315.38 L131.12 315.50 L131.25 317.00 L131.38 317.12 L131.38 317.75 L131.50 317.88 L131.62 319.50 L131.75 319.62 L131.75 320.25 L131.88 320.38 L131.88 321.12 L132.00 321.25 L132.00 321.88 L132.12 322.00 L132.12 322.75 L132.25 322.88 L132.25 323.50 L132.38 323.62 L132.38 324.38 L132.50 324.50 L132.50 325.12 L132.62 325.25 L132.75 326.88 L132.88 327.00 L132.88 327.62 L133.00 327.75 L133.00 328.50 L133.12 328.62 L133.12 329.25 L133.25 329.38 L133.38 333.50 L133.50 333.62 L133.50 336.00 L133.62 336.12 L133.62 338.50 L133.75 338.62 L133.75 341.00 L133.88 341.12 L133.88 343.50 L134.00 343.62 L134.00 345.38 L134.12 345.50 L134.12 346.88 L134.25 347.00 L134.25 348.38 L134.38 348.50 L134.38 349.88 L134.50 350.00 L134.50 351.38 L134.62 351.50 L134.62 352.75 L134.75 352.88 L134.75 354.00 L134.88 354.12 L134.88 355.25 L135.00 355.38 L135.00 356.50 L135.12 356.62 L135.25 359.00 L135.38 359.12 L135.38 359.88 L135.50 360.00 L135.50 360.62 L135.62 360.75 L135.62 361.38 L135.75 361.50 L135.88 362.88 L136.00 363.00 L136.00 363.50 L136.12 363.62 L136.12 364.25 L136.25 364.38 L136.25 365.00 L136.38 365.12 L136.50 366.50 L136.62 366.62 L136.62 367.12 L136.75 367.25 L136.75 367.88 L136.88 368.00 L137.00 369.38 L137.12 369.50 L137.12 370.00 L137.25 370.12 L137.25 370.75 L137.38 370.88 L137.38 371.50 L137.50 371.62 L137.50 372.25 L137.62 372.38 L137.62 373.00 L137.75 373.12 L137.75 373.75 L137.88 373.88 L137.88 374.50 L138.00 374.62 L138.00 375.25 L138.12 375.38 L138.12 376.38 L138.25 376.50 L138.25 377.88 L138.38 378.00 L138.38 379.38 L138.50 379.50 L138.50 380.88 L138.62 381.00 L138.62 381.62 L139.38 381.50 L139.50 381.38 L139.88 381.38 L140.00 381.25 L140.62 381.25 L140.75 381.12 L142.00 381.00 L142.12 380.88 L142.88 380.88 L143.00 380.75 L145.00 380.62 L145.12 380.50 L146.00 380.50 L146.12 380.38 L147.00 380.38 L147.12 380.25 L148.12 380.25 L148.25 380.12 L150.50 380.00 L150.62 379.88 L151.62 379.88 L151.75 379.75 L154.00 379.62 L154.12 379.50 L155.12 379.50 L155.25 379.62 L156.12 379.62 L156.25 379.75 L157.12 379.75 L157.25 379.88 L158.12 379.88 L158.25 380.00 L159.12 380.00 L159.25 380.12 L161.50 380.12 L161.88 379.62 L161.88 379.12 L161.75 379.00 L161.75 377.38 L161.88 377.25 L162.00 375.12 L162.12 375.00 L162.12 374.25 L162.25 374.12 L162.38 372.88 L162.50 372.75 L162.50 372.25 L162.62 372.12 L162.62 371.62 L162.75 371.50 L162.75 370.88 L162.88 370.75 L162.88 370.25 L163.00 370.12 L163.00 369.62 L163.12 369.50 L163.12 368.88 L163.25 368.75 L163.25 368.25 L163.38 368.12 L163.38 367.62 L163.50 367.50 L163.50 366.88 L163.62 366.75 L163.62 366.12 L163.75 366.00 L163.75 365.38 L163.88 365.25 L163.88 364.62 L164.00 364.50 L164.00 363.88 L164.12 363.75 L164.12 363.12 L164.25 363.00 L164.25 362.38 L164.38 362.25 L164.38 361.62 L164.50 361.50 L164.62 359.75 L164.75 359.62 L164.75 358.75 L164.88 358.62 L164.88 357.75 L165.00 357.62 L165.00 356.62 L165.12 356.50 L165.12 355.62 L165.25 355.50 L165.25 354.62 L165.38 354.50 L165.25 346.25 L165.38 346.12 L165.38 345.62 L165.50 345.50 L165.50 345.00 L165.62 344.88 L165.62 344.25 L165.75 344.12 L165.75 343.62 L165.88 343.50 L165.88 342.75 L166.00 342.62 L166.00 341.75 L166.12 341.62 L166.12 340.62 L166.25 340.50 L166.25 339.62 L166.38 339.50 L166.38 338.62 L166.50 338.50 L166.50 337.50 L166.62 337.38 L166.62 336.50 L166.75 336.38 L166.75 335.38 L166.88 335.25 L166.88 334.38 L167.00 334.25 L167.00 333.25 L167.12 333.12 L167.12 332.25 L167.25 332.12 L167.25 331.25 L167.38 331.12 L167.50 329.12 L167.62 329.00 L167.62 328.25 L167.75 328.12 L167.88 327.00 L168.12 326.38 L168.12 325.88 L168.25 325.75 L168.25 325.25 L168.38 325.12 L168.62 323.38 L168.88 322.75 L168.88 322.25 L169.00 322.12 L169.25 320.38 L169.50 319.75 L169.75 318.00 L170.00 317.38 L170.25 315.62 L170.38 315.50 L170.50 314.50 L170.62 314.38 L170.62 313.88 L170.75 313.75 L170.75 313.12 L170.88 313.00 L170.88 312.50 L171.00 312.38 L171.00 311.88 L171.12 311.75 L171.12 311.12 L171.25 311.00 L171.25 310.50 L171.38 310.38 L171.38 309.88 L171.50 309.75 L171.50 309.12 L171.62 309.00 L171.62 308.50 L171.75 308.38 L171.75 307.88 L171.88 307.75 L171.88 307.12 L172.00 307.00 L172.00 306.50 L172.12 306.38 L172.12 305.75 L172.25 305.62 L172.25 305.00 L172.38 304.88 L172.38 304.25 L172.50 304.12 L172.50 303.50 L172.62 303.38 L172.62 302.75 L172.75 302.62 L172.75 302.00 L172.88 301.88 L172.88 301.25 L173.00 301.12 L173.00 300.50 L173.12 300.38 L173.12 299.75 L173.25 299.62 L173.25 298.75 L173.38 298.62 L173.38 297.25 L173.50 297.12 L173.62 294.38 L173.75 294.25 L173.75 292.88 L173.88 292.75 L173.88 291.25 L174.00 291.12 L174.00 289.38 L174.12 289.25 L174.25 285.62 L174.38 285.50 L174.25 275.50 L174.12 275.38 L174.12 271.88 L174.00 271.75 L174.00 266.38 L173.88 266.25 L173.88 254.88 L174.00 254.75 L174.00 254.12 L174.12 254.00 L174.12 253.38 L174.25 253.25 L174.25 252.50 L174.38 252.38 L174.38 251.75 L174.50 251.62 L174.62 250.12 L174.75 250.00 L174.75 249.38 L174.88 249.25 L174.88 248.62 L175.00 248.50 L175.12 247.12 L175.25 247.00 L175.25 246.50 L175.38 246.38 L175.50 245.00 L175.62 244.88 L175.75 243.62 L175.88 243.50 L175.88 243.00 L176.00 242.88 L176.12 241.50 L176.25 241.38 L176.25 240.88 L176.38 240.75 L176.38 240.25 L176.50 240.12 L176.50 239.62 L176.62 239.50 L176.62 238.88 L176.75 238.75 L176.75 238.25 L176.88 238.12 L176.88 237.62 L177.00 237.50 L177.00 237.00 L177.12 236.88 L177.12 236.38 L177.25 236.25 L177.25 235.62 L177.38 235.50 L177.38 235.00 L177.50 234.88 L177.50 234.38 L177.62 234.25 L177.62 233.75 L177.75 233.62 L177.75 233.12 L177.88 233.00 L177.88 232.38 L178.00 232.25 L178.00 231.75 L178.12 231.62 L178.12 231.12 L178.25 231.00 L178.25 230.50 L178.38 230.38 L178.38 229.75 L178.50 229.62 L178.50 229.12 L178.62 229.00 L178.62 228.50 L178.75 228.38 L178.75 227.75 L178.88 227.62 L178.88 227.12 L179.00 227.00 L179.00 226.50 L179.12 226.38 L179.12 225.88 L179.25 225.75 L179.25 225.25 L179.38 225.12 L179.62 223.38 L179.88 222.75 L179.88 222.25 L180.00 222.12 L180.00 221.62 L180.12 221.50 L180.12 221.00 L180.25 220.88 L180.25 220.38 L180.38 220.25 L180.38 219.75 L180.50 219.62 L180.75 217.88 L181.00 217.25 L181.00 216.75 L181.12 216.62 L181.12 216.12 L181.25 216.00 L181.50 214.25 L181.75 213.62 L181.75 213.12 L181.88 213.00 L181.88 212.50 L182.00 212.38 L182.00 211.88 L182.12 211.75 L182.12 211.25 L182.25 211.12 L182.25 210.62 L182.38 210.50 L182.62 208.75 L182.88 208.12 L182.88 207.62 L183.00 207.50 L183.00 207.00 L183.12 206.88 L183.12 206.38 L183.25 206.25 L183.25 205.75 L183.38 205.62 L183.38 205.12 L183.50 205.00 L183.50 204.50 L183.62 204.38 L183.62 203.88 L183.75 203.75 L183.75 203.25 L183.88 203.12 L184.12 201.38 L184.38 200.75 L184.38 200.25 L184.50 200.12 L184.50 199.62 L184.62 199.50 L184.62 199.00 L184.75 198.88 L184.75 198.38 L184.88 198.25 L184.88 197.75 L185.00 197.62 L185.00 197.12 L185.12 197.00 L185.12 196.50 L185.25 196.38 L185.25 195.88 L185.38 195.75 L185.38 195.25 L185.50 195.12 L185.50 194.62 L185.62 194.50 L185.62 194.00 L185.75 193.88 L185.75 193.38 L185.88 193.25 L185.88 192.75 L186.00 192.62 L186.00 192.12 L186.12 192.00 L186.12 191.50 L186.25 191.38 L186.50 189.62 L186.75 189.00 L186.75 188.50 L186.88 188.38 L187.00 187.38 L187.25 186.75 L187.38 185.62 L187.62 185.00 L187.62 184.50 L187.75 184.38 L187.88 183.38 L188.12 182.75 L188.12 182.25 L188.38 181.62 L188.50 180.50 L188.62 180.38 L188.75 179.38 L189.00 178.75 L189.12 177.62 L189.38 177.00 L189.50 175.88 L189.75 175.25 L189.88 174.00 L190.00 173.88 L190.00 173.25 L190.12 173.12 L190.12 172.62 L190.25 172.50 L190.25 171.88 L190.38 171.75 L190.38 171.25 L190.50 171.12 L190.50 170.50 L190.62 170.38 L190.62 169.75 L190.75 169.62 L190.75 169.12 L190.88 169.00 L190.88 168.38 L191.00 168.25 L191.12 167.12 L191.25 167.00 L191.62 165.62 L191.88 165.25 L191.88 165.00 L192.00 164.88 L192.00 164.62 L192.12 164.50 L192.12 164.25 L192.25 164.12 L192.25 163.88 L192.38 163.75 L192.38 163.50 L192.50 163.38 L192.50 163.12 L192.62 163.00 L192.62 162.75 L192.75 162.62 L193.00 161.62 L193.25 161.25 L193.25 161.00 L193.38 160.88 L193.75 159.62 L200.00 155.00 Z",
  "frontRightLeg": "M200.00 116.62 L200.00 155.00 L201.75 153.62 L203.62 155.88 L203.62 156.00 L204.25 156.62 L204.25 156.75 L204.75 157.25 L205.25 158.00 L205.88 158.62 L205.88 158.75 L206.38 159.25 L206.88 160.00 L207.50 160.62 L207.88 161.38 L207.88 162.00 L208.00 162.12 L208.00 162.75 L208.12 162.88 L208.12 163.50 L208.25 163.62 L208.38 165.00 L208.50 165.12 L208.50 165.62 L208.62 165.75 L208.62 166.38 L208.75 166.50 L208.75 167.12 L208.88 167.25 L209.00 168.62 L209.12 168.75 L209.12 169.25 L209.25 169.38 L209.38 170.75 L209.50 170.88 L209.50 171.38 L209.62 171.50 L209.75 172.88 L209.88 173.00 L209.88 173.50 L210.00 173.62 L210.00 174.25 L210.12 174.38 L210.12 174.88 L210.25 175.00 L210.38 176.38 L210.50 176.50 L210.50 177.00 L210.62 177.12 L210.62 177.50 L210.75 177.62 L210.75 178.00 L210.88 178.12 L210.88 178.50 L211.12 179.12 L211.12 179.62 L211.25 179.75 L211.25 180.12 L211.38 180.25 L211.38 180.62 L211.62 181.25 L211.62 181.75 L211.75 181.88 L211.75 182.25 L211.88 182.38 L211.88 182.75 L212.00 182.88 L212.00 183.25 L212.25 183.88 L212.25 184.38 L212.38 184.50 L212.50 185.50 L212.75 186.12 L212.75 186.62 L213.00 187.25 L213.12 188.38 L213.25 188.50 L213.38 189.50 L213.62 190.12 L213.62 190.62 L213.88 191.25 L214.00 192.50 L214.12 192.62 L214.12 193.12 L214.25 193.25 L214.25 193.88 L214.38 194.00 L214.38 194.50 L214.50 194.62 L214.50 195.25 L214.62 195.38 L214.62 195.88 L214.75 196.00 L214.75 196.50 L214.88 196.62 L214.88 197.25 L215.00 197.38 L215.00 197.88 L215.12 198.00 L215.12 198.62 L215.25 198.75 L215.25 199.25 L215.38 199.38 L215.38 199.88 L215.50 200.00 L215.50 200.50 L215.62 200.62 L215.88 202.38 L216.12 203.00 L216.12 203.50 L216.25 203.62 L216.25 204.12 L216.38 204.25 L216.38 204.75 L216.50 204.88 L216.50 205.38 L216.62 205.50 L216.62 206.00 L216.75 206.12 L216.75 206.62 L216.88 206.75 L216.88 207.25 L217.00 207.38 L217.00 207.88 L217.12 208.00 L217.38 209.75 L217.62 210.38 L217.62 210.88 L217.75 211.00 L217.75 211.50 L217.88 211.62 L217.88 212.12 L218.00 212.25 L218.00 212.75 L218.12 212.88 L218.12 213.38 L218.25 213.50 L218.50 215.25 L218.75 215.88 L218.75 216.38 L218.88 216.50 L218.88 217.00 L219.00 217.12 L219.25 218.88 L219.50 219.50 L219.50 220.00 L219.62 220.12 L219.62 220.62 L219.75 220.75 L219.75 221.25 L219.88 221.38 L219.88 221.88 L220.00 222.00 L220.00 222.50 L220.12 222.62 L220.12 223.25 L220.25 223.38 L220.25 223.88 L220.38 224.00 L220.38 224.50 L220.50 224.62 L220.50 225.12 L220.62 225.25 L220.62 225.75 L220.75 225.88 L220.75 226.50 L220.88 226.62 L220.88 227.12 L221.00 227.25 L221.25 229.00 L221.50 229.62 L221.50 230.12 L221.62 230.25 L221.75 231.38 L222.00 232.00 L222.25 233.75 L222.50 234.38 L222.75 236.12 L223.00 236.75 L223.12 237.88 L223.38 238.50 L223.50 239.62 L223.62 239.75 L223.75 240.75 L223.88 240.88 L223.88 241.38 L224.12 242.00 L224.12 242.62 L224.25 242.75 L224.25 243.38 L224.38 243.50 L224.38 244.12 L224.50 244.25 L224.50 244.88 L224.62 245.00 L224.62 245.75 L224.75 245.88 L224.75 246.50 L224.88 246.62 L224.88 247.25 L225.00 247.38 L225.00 248.00 L225.12 248.12 L225.12 248.75 L225.25 248.88 L225.25 249.75 L225.38 249.88 L225.38 250.75 L225.50 250.88 L225.50 251.75 L225.62 251.88 L225.62 252.75 L225.75 252.88 L225.75 253.75 L225.88 253.88 L225.88 254.75 L226.00 254.88 L226.00 255.75 L226.12 255.88 L226.12 259.75 L226.25 259.88 L226.25 267.00 L226.12 267.12 L226.12 272.50 L226.00 272.62 L226.00 276.25 L225.88 276.38 L225.75 286.25 L225.88 286.38 L225.88 287.75 L226.00 287.88 L226.00 289.25 L226.12 289.38 L226.25 292.25 L226.38 292.38 L226.38 293.62 L226.50 293.75 L226.50 295.12 L226.62 295.25 L226.62 296.62 L226.75 296.75 L226.88 299.62 L227.00 299.75 L227.00 300.62 L227.12 300.75 L227.25 302.00 L227.38 302.12 L227.38 302.62 L227.50 302.75 L227.50 303.25 L227.62 303.38 L227.62 304.00 L227.75 304.12 L227.75 304.62 L227.88 304.75 L227.88 305.25 L228.00 305.38 L228.00 305.88 L228.12 306.00 L228.12 306.62 L228.25 306.75 L228.25 307.25 L228.38 307.38 L228.38 307.88 L228.50 308.00 L228.50 308.62 L228.62 308.75 L228.62 309.38 L228.75 309.50 L228.88 310.88 L229.00 311.00 L229.00 311.50 L229.12 311.62 L229.12 312.25 L229.25 312.38 L229.25 313.00 L229.38 313.12 L229.50 314.50 L229.62 314.62 L229.75 315.75 L230.00 316.38 L230.25 318.12 L230.50 318.75 L230.75 320.50 L231.00 321.12 L231.00 321.62 L231.12 321.75 L231.12 322.25 L231.25 322.38 L231.25 322.88 L231.38 323.00 L231.38 323.50 L231.50 323.62 L231.75 325.38 L232.00 326.00 L232.00 326.50 L232.12 326.62 L232.12 327.12 L232.25 327.25 L232.25 327.75 L232.38 327.88 L232.38 328.38 L232.50 328.50 L232.50 329.00 L232.62 329.12 L232.62 331.12 L232.50 331.25 L232.50 334.88 L232.38 335.00 L232.38 337.88 L232.50 338.00 L232.50 340.38 L232.62 340.50 L232.62 342.88 L232.75 343.00 L232.75 344.50 L232.88 344.62 L233.00 346.12 L233.12 346.25 L233.25 347.75 L233.38 347.88 L233.38 348.62 L233.50 348.75 L233.62 350.25 L233.75 350.38 L233.75 351.00 L233.88 351.12 L234.12 355.50 L234.25 355.62 L234.38 357.38 L234.50 357.50 L234.50 358.25 L234.62 358.38 L234.62 359.12 L234.75 359.25 L234.75 360.00 L234.88 360.12 L234.88 361.00 L235.00 361.12 L235.00 361.88 L235.12 362.00 L235.12 362.75 L235.25 362.88 L235.25 363.50 L235.38 363.62 L235.38 364.38 L235.50 364.50 L235.50 365.12 L235.62 365.25 L235.62 366.00 L235.75 366.12 L235.75 366.75 L235.88 366.88 L235.88 367.50 L236.00 367.62 L236.12 369.12 L236.25 369.25 L236.25 369.75 L236.38 369.88 L236.38 370.12 L236.50 370.25 L236.50 370.50 L236.62 370.62 L236.62 370.88 L236.75 371.00 L236.75 371.25 L236.88 371.38 L236.88 371.62 L237.00 371.75 L237.00 372.00 L237.12 372.12 L237.12 372.38 L237.25 372.50 L237.25 372.75 L237.38 372.88 L237.38 373.12 L238.00 374.75 L238.00 375.88 L238.12 376.00 L238.12 377.88 L238.25 378.00 L238.25 378.25 L238.12 378.38 L238.12 379.75 L238.00 379.88 L238.00 380.50 L238.38 381.00 L240.25 381.00 L240.38 380.88 L241.75 380.75 L241.88 380.62 L243.12 380.50 L243.25 380.38 L243.88 380.38 L244.00 380.25 L244.88 380.25 L245.00 380.38 L246.25 380.38 L246.38 380.50 L247.62 380.50 L247.75 380.62 L249.00 380.62 L249.12 380.75 L251.50 380.88 L251.62 381.00 L252.25 381.00 L252.38 381.12 L253.00 381.12 L253.12 381.25 L253.88 381.25 L254.00 381.38 L254.62 381.38 L254.75 381.50 L255.38 381.50 L255.50 381.62 L256.12 381.62 L256.25 381.75 L257.12 381.75 L257.25 381.88 L258.25 381.88 L258.38 382.00 L260.25 382.12 L260.38 382.25 L261.12 382.25 L261.25 382.38 L263.25 382.50 L263.25 381.38 L263.38 381.25 L263.38 378.88 L263.50 378.75 L263.50 376.38 L263.62 376.25 L263.88 359.62 L264.00 359.50 L264.00 358.12 L264.12 358.00 L264.12 356.62 L264.25 356.50 L264.38 353.62 L264.50 353.50 L264.50 352.25 L264.62 352.12 L264.62 351.50 L264.75 351.38 L264.75 350.62 L264.88 350.50 L265.00 348.88 L265.12 348.75 L265.12 348.12 L265.25 348.00 L265.25 347.25 L265.38 347.12 L265.50 345.75 L265.62 345.62 L265.62 345.12 L265.75 345.00 L265.75 344.50 L265.88 344.38 L265.88 343.75 L266.00 343.62 L266.00 343.12 L266.12 343.00 L266.25 341.50 L266.38 341.38 L266.38 340.38 L266.50 340.25 L266.50 339.25 L266.62 339.12 L266.62 338.00 L266.75 337.88 L266.75 336.88 L266.88 336.75 L266.88 335.12 L267.00 335.00 L267.00 332.62 L267.12 332.50 L267.25 328.12 L267.38 328.00 L267.50 322.75 L267.62 322.62 L267.62 321.75 L267.75 321.62 L267.75 320.88 L267.88 320.75 L267.88 319.88 L268.00 319.75 L268.00 319.00 L268.12 318.88 L268.12 318.00 L268.25 317.88 L268.25 317.12 L268.38 317.00 L268.38 316.12 L268.50 316.00 L268.50 315.25 L268.62 315.12 L268.62 314.25 L268.75 314.12 L268.75 313.38 L268.88 313.25 L268.88 312.50 L269.00 312.38 L269.00 311.50 L269.12 311.38 L269.12 310.62 L269.25 310.50 L269.25 309.75 L269.38 309.62 L269.38 308.75 L269.50 308.62 L269.50 307.88 L269.62 307.75 L269.62 307.00 L269.75 306.88 L269.75 306.00 L269.88 305.88 L269.88 305.12 L270.00 305.00 L270.00 304.25 L270.12 304.12 L270.12 303.25 L270.25 303.12 L270.25 302.25 L270.38 302.12 L270.38 301.25 L270.50 301.12 L270.50 300.25 L270.62 300.12 L270.62 299.25 L270.75 299.12 L270.75 298.12 L270.88 298.00 L270.88 297.12 L271.00 297.00 L271.12 294.88 L271.25 294.75 L271.25 293.88 L271.38 293.75 L271.50 289.62 L271.62 289.50 L271.62 287.12 L271.75 287.00 L271.75 274.38 L271.62 274.25 L271.62 270.00 L271.50 269.88 L271.38 267.88 L271.25 267.75 L271.25 266.88 L271.12 266.75 L271.12 265.88 L271.00 265.75 L271.00 264.75 L270.88 264.62 L270.88 263.75 L270.75 263.62 L270.75 262.25 L270.62 262.12 L270.50 259.25 L270.38 259.12 L270.25 258.00 L270.00 257.38 L270.00 256.88 L269.88 256.75 L269.62 255.00 L269.38 254.38 L269.12 252.62 L268.88 252.00 L268.88 251.50 L268.75 251.38 L268.62 250.25 L268.38 249.62 L268.25 248.50 L268.00 247.88 L267.88 246.75 L267.75 246.62 L267.62 245.62 L267.38 245.00 L267.38 244.50 L267.12 243.88 L267.00 242.75 L266.75 242.12 L266.75 241.62 L266.62 241.50 L266.62 241.00 L266.50 240.88 L266.50 240.38 L266.38 240.25 L266.38 239.75 L266.25 239.62 L266.25 239.12 L266.12 239.00 L266.12 238.50 L265.88 237.88 L265.88 237.38 L265.75 237.25 L265.75 236.75 L265.62 236.62 L265.62 236.12 L265.50 236.00 L265.50 235.50 L265.38 235.38 L265.38 234.75 L265.25 234.62 L265.25 233.75 L265.12 233.62 L265.12 232.75 L265.00 232.62 L265.00 231.75 L264.88 231.62 L264.88 230.75 L264.75 230.62 L264.75 229.75 L264.62 229.62 L264.62 228.75 L264.50 228.62 L264.50 219.62 L264.38 219.50 L264.38 216.12 L264.25 216.00 L264.25 210.88 L264.12 210.75 L264.12 205.62 L264.25 205.50 L264.25 202.12 L264.38 202.00 L264.38 199.12 L264.50 199.00 L264.50 196.88 L264.62 196.75 L264.75 192.88 L264.88 192.75 L264.88 191.75 L265.00 191.62 L265.00 190.62 L265.12 190.50 L265.12 189.38 L265.25 189.25 L265.25 188.25 L265.38 188.12 L265.38 187.12 L265.50 187.00 L265.50 186.12 L265.62 186.00 L265.75 184.12 L265.88 184.00 L265.88 183.25 L266.00 183.12 L266.00 182.25 L266.12 182.12 L266.25 180.25 L266.38 180.12 L266.50 178.38 L266.62 178.25 L266.62 177.38 L266.75 177.25 L266.88 175.50 L267.00 175.38 L267.00 174.50 L267.12 174.38 L267.12 173.50 L267.25 173.38 L267.25 172.00 L267.38 171.88 L267.38 169.75 L267.50 169.62 L267.50 167.50 L267.62 167.38 L267.62 165.62 L267.75 165.50 L267.75 164.25 L267.88 164.12 L268.00 161.62 L268.12 161.50 L268.12 160.25 L268.25 160.12 L268.25 158.75 L268.38 158.62 L268.38 157.00 L268.50 156.88 L268.62 153.62 L268.75 153.50 L268.75 152.00 L268.88 151.88 L268.88 150.38 L269.00 150.25 L269.00 148.62 L269.12 148.50 L269.12 147.00 L269.25 146.88 L269.25 145.12 L269.38 145.00 L269.38 143.00 L269.50 142.88 L269.62 138.12 L269.75 138.00 L269.75 134.88 L269.88 134.75 L269.88 130.12 L270.00 130.00 L270.00 123.88 L269.88 123.75 L269.88 120.12 L269.75 120.00 L269.75 118.75 L269.62 118.62 L269.62 117.38 L269.50 117.25 L269.50 116.62 Z",
  "backLeftLeg": "M200.00 116.62 L130.62 116.62 L130.62 117.12 L130.50 117.25 L130.50 118.12 L130.38 118.25 L130.38 119.12 L130.25 119.25 L130.25 120.12 L130.12 120.25 L130.12 123.75 L130.00 123.88 L130.00 130.00 L130.12 130.12 L130.12 134.25 L130.00 134.38 L130.00 135.38 L129.88 135.50 L129.88 136.38 L129.75 136.50 L129.75 137.50 L129.62 137.62 L129.62 138.62 L129.50 138.75 L129.50 139.75 L129.38 139.88 L129.38 140.38 L130.25 141.38 L130.25 142.00 L130.38 142.12 L130.38 142.75 L130.50 142.88 L130.50 143.50 L130.62 143.62 L130.62 145.00 L130.75 145.12 L130.75 146.50 L130.62 146.62 L130.62 149.25 L130.75 149.38 L130.75 150.50 L130.88 150.62 L130.88 151.75 L131.00 151.88 L131.00 153.00 L131.12 153.12 L131.25 156.00 L131.38 156.12 L131.50 159.12 L131.62 159.25 L131.62 160.62 L131.75 160.75 L131.75 161.88 L131.88 162.00 L131.88 163.12 L132.00 163.25 L132.12 165.62 L132.25 165.75 L132.25 166.50 L132.38 166.62 L132.38 167.38 L132.50 167.50 L132.50 169.62 L132.62 169.75 L132.75 173.62 L132.88 173.75 L132.88 174.88 L133.00 175.00 L133.12 177.12 L133.25 177.25 L133.25 177.88 L133.38 178.00 L133.38 178.62 L133.50 178.75 L133.50 179.38 L133.62 179.50 L133.62 180.12 L133.75 180.25 L133.75 181.12 L133.88 181.25 L134.00 183.12 L134.12 183.25 L134.25 185.00 L134.38 185.12 L134.38 186.00 L134.50 186.12 L134.62 190.88 L134.75 191.00 L134.88 193.12 L135.00 193.25 L135.12 195.25 L135.25 195.38 L135.25 196.38 L135.38 196.50 L135.38 205.00 L135.50 205.12 L135.50 207.38 L135.62 207.50 L135.62 209.62 L135.75 209.75 L135.75 214.25 L135.62 214.38 L135.62 219.50 L135.50 219.62 L135.50 228.12 L135.38 228.25 L135.38 229.62 L135.25 229.75 L135.25 230.62 L135.12 230.75 L135.00 232.62 L134.88 232.75 L134.88 233.38 L134.75 233.50 L134.75 233.88 L134.62 234.00 L134.62 234.38 L134.50 234.50 L134.50 234.88 L134.38 235.00 L134.38 235.38 L134.25 235.50 L134.25 235.88 L134.12 236.00 L134.12 236.38 L134.00 236.50 L134.00 236.88 L133.88 237.00 L133.88 237.38 L133.62 238.00 L133.62 238.50 L133.50 238.62 L133.50 239.12 L133.38 239.25 L133.38 239.75 L133.25 239.88 L133.25 240.38 L133.12 240.50 L133.12 241.00 L133.00 241.12 L133.00 241.62 L132.88 241.75 L132.88 242.25 L132.75 242.38 L132.75 242.88 L132.62 243.00 L132.62 243.50 L132.50 243.62 L132.50 244.12 L132.38 244.25 L132.38 244.75 L132.25 244.88 L132.25 245.38 L132.12 245.50 L132.12 246.12 L132.00 246.25 L131.88 247.50 L131.75 247.62 L131.75 248.12 L131.62 248.25 L131.62 248.88 L131.50 249.00 L131.50 249.50 L131.38 249.62 L131.38 250.25 L131.25 250.38 L131.25 250.88 L131.12 251.00 L131.12 251.62 L131.00 251.75 L131.00 252.25 L130.88 252.38 L130.88 252.88 L130.75 253.00 L130.75 253.50 L130.62 253.62 L130.62 254.25 L130.50 254.38 L130.50 254.88 L130.38 255.00 L130.38 255.50 L130.25 255.62 L130.12 257.12 L130.00 257.25 L130.00 258.12 L129.88 258.25 L129.88 259.00 L129.75 259.12 L129.75 259.88 L129.62 260.00 L129.62 260.75 L129.50 260.88 L129.50 261.75 L129.38 261.88 L129.38 262.62 L129.25 262.75 L129.12 264.62 L129.00 264.75 L129.00 265.75 L128.88 265.88 L128.88 266.75 L128.75 266.88 L128.75 267.75 L128.62 267.88 L128.50 269.88 L128.38 270.00 L128.38 274.25 L128.25 274.38 L128.25 287.00 L128.38 287.12 L128.38 289.50 L128.50 289.62 L128.62 293.75 L128.75 293.88 L128.75 294.75 L128.88 294.88 L128.88 295.88 L129.00 296.00 L129.00 297.00 L129.12 297.12 L129.12 298.00 L129.25 298.12 L129.25 299.12 L129.38 299.25 L129.38 300.12 L129.50 300.25 L129.62 302.12 L129.75 302.25 L129.75 303.00 L129.88 303.12 L129.88 304.00 L130.00 304.12 L130.00 304.88 L130.12 305.00 L130.12 305.88 L130.25 306.00 L130.25 306.75 L130.38 306.88 L130.38 307.75 L130.50 307.88 L130.50 308.62 L130.62 308.75 L130.62 309.62 L130.75 309.75 L130.75 310.50 L130.88 310.62 L130.88 311.38 L131.00 311.50 L131.00 312.38 L131.12 312.50 L131.12 313.25 L131.25 313.38 L131.25 314.12 L131.38 314.25 L131.38 315.12 L131.50 315.25 L131.50 316.00 L131.62 316.12 L131.62 317.00 L131.75 317.12 L131.75 317.88 L131.88 318.00 L131.88 318.88 L132.00 319.00 L132.00 319.75 L132.12 319.88 L132.12 320.75 L132.25 320.88 L132.25 321.62 L132.38 321.75 L132.38 322.62 L132.50 322.75 L132.50 323.50 L132.62 323.62 L132.62 324.50 L132.75 324.62 L132.75 325.38 L132.88 325.50 L132.88 326.25 L133.00 326.38 L133.00 327.25 L133.12 327.38 L133.12 328.12 L133.25 328.25 L133.25 329.00 L133.38 329.12 L133.38 330.50 L133.50 330.62 L133.62 334.88 L133.75 335.00 L133.75 337.00 L133.88 337.12 L133.88 338.88 L134.00 339.00 L134.00 340.62 L134.12 340.75 L134.25 349.38 L134.38 349.50 L134.38 351.38 L134.50 351.50 L134.38 358.38 L134.50 358.50 L134.50 362.12 L134.62 362.25 L134.62 365.50 L134.75 365.62 L134.75 368.50 L134.88 368.62 L134.88 370.88 L134.75 371.00 L134.75 372.88 L134.62 373.00 L134.50 376.25 L134.62 376.38 L134.62 377.25 L134.75 377.38 L134.75 378.12 L134.88 378.25 L134.88 379.12 L135.00 379.25 L135.00 380.00 L135.12 380.12 L135.12 380.88 L135.25 381.00 L135.25 381.88 L135.38 382.00 L135.38 382.38 L136.75 382.50 L136.75 382.25 L136.88 382.12 L137.62 382.12 L137.75 382.00 L149.25 382.12 L149.38 382.00 L153.12 382.00 L153.25 381.88 L155.62 381.88 L155.75 381.75 L157.25 381.75 L157.38 381.62 L158.25 381.62 L158.38 381.50 L159.12 381.50 L159.25 381.38 L160.12 381.38 L160.25 381.25 L160.62 381.25 L162.00 380.50 L162.00 379.88 L161.88 379.75 L161.88 378.38 L161.75 378.25 L161.75 376.88 L161.62 376.75 L161.62 375.00 L161.50 374.88 L161.50 371.00 L161.62 370.88 L161.62 369.50 L161.75 369.38 L161.75 368.00 L161.88 367.88 L162.00 365.50 L162.25 365.12 L162.25 364.88 L162.62 364.12 L162.75 363.50 L163.00 363.12 L163.38 361.88 L163.62 361.50 L164.00 360.25 L164.25 359.88 L164.38 359.25 L164.62 358.88 L164.75 357.88 L164.88 357.75 L164.88 357.25 L165.00 357.12 L165.12 356.12 L165.25 356.00 L165.25 355.50 L165.38 355.38 L165.38 354.88 L165.50 354.75 L165.50 354.25 L165.62 354.12 L165.62 353.62 L165.75 353.50 L165.88 352.50 L166.00 352.38 L166.00 351.88 L166.12 351.75 L166.25 350.38 L166.38 350.25 L166.38 349.50 L166.50 349.38 L166.50 348.75 L166.62 348.62 L166.75 347.00 L166.88 346.88 L167.00 345.38 L167.12 345.25 L167.12 344.62 L167.25 344.50 L167.25 343.00 L167.38 342.88 L167.38 340.50 L167.50 340.38 L167.50 338.00 L167.62 337.88 L167.62 335.00 L167.50 334.88 L167.50 331.25 L167.38 331.12 L167.38 329.12 L167.50 329.00 L167.50 328.50 L167.62 328.38 L167.62 327.88 L167.75 327.75 L168.00 326.00 L168.25 325.38 L168.25 324.88 L168.38 324.75 L168.38 324.25 L168.50 324.12 L168.50 323.62 L168.62 323.50 L168.62 323.00 L168.75 322.88 L169.00 321.12 L169.25 320.50 L169.50 318.75 L169.75 318.12 L170.00 316.38 L170.12 316.25 L170.25 315.25 L170.38 315.12 L170.38 314.62 L170.50 314.50 L170.50 313.88 L170.62 313.75 L170.62 313.12 L170.75 313.00 L170.88 311.62 L171.00 311.50 L171.00 311.00 L171.12 310.88 L171.12 310.25 L171.25 310.12 L171.25 309.50 L171.38 309.38 L171.50 308.00 L171.62 307.88 L171.62 307.38 L171.75 307.25 L171.75 306.75 L171.88 306.62 L171.88 306.00 L172.00 305.88 L172.00 305.38 L172.12 305.25 L172.12 304.75 L172.25 304.62 L172.25 304.12 L172.38 304.00 L172.38 303.38 L172.50 303.25 L172.50 302.75 L172.62 302.62 L172.62 302.12 L172.75 302.00 L172.75 301.38 L172.88 301.25 L172.88 300.75 L173.00 300.62 L173.12 298.50 L173.25 298.38 L173.25 297.25 L173.38 297.12 L173.50 294.00 L173.62 293.88 L173.62 292.38 L173.75 292.25 L173.75 290.88 L173.88 290.75 L173.88 289.38 L174.00 289.25 L174.00 287.88 L174.12 287.75 L174.12 286.38 L174.25 286.25 L174.12 277.25 L174.25 277.12 L174.25 275.25 L174.38 275.12 L174.38 273.88 L174.25 273.75 L174.25 273.00 L174.12 272.88 L174.12 272.12 L174.00 272.00 L174.00 271.25 L173.88 271.12 L173.75 263.00 L173.88 262.88 L173.88 261.00 L174.00 260.88 L174.12 255.38 L174.25 255.25 L174.25 254.00 L174.38 253.88 L174.38 252.75 L174.50 252.62 L174.50 251.38 L174.62 251.25 L174.75 249.00 L174.88 248.88 L175.00 247.75 L175.25 247.12 L175.50 245.38 L175.75 244.75 L175.88 243.62 L176.12 243.00 L176.12 242.50 L176.38 241.88 L176.38 241.38 L176.62 240.75 L176.75 239.62 L176.88 239.50 L176.88 239.12 L177.00 239.00 L177.00 238.62 L177.12 238.50 L177.12 238.12 L177.25 238.00 L177.25 237.62 L177.38 237.50 L177.38 237.12 L177.50 237.00 L177.50 236.62 L177.62 236.50 L177.62 236.12 L177.75 236.00 L177.75 235.62 L177.88 235.50 L177.88 235.12 L178.00 235.00 L178.00 234.62 L178.12 234.50 L178.12 234.12 L178.25 234.00 L178.25 233.62 L178.38 233.50 L178.38 233.12 L178.50 233.00 L178.50 232.62 L178.75 232.00 L178.75 231.50 L178.88 231.38 L179.00 230.00 L179.12 229.88 L179.12 229.38 L179.25 229.25 L179.25 228.62 L179.38 228.50 L179.38 227.88 L179.50 227.75 L179.50 227.12 L179.62 227.00 L179.62 226.50 L179.75 226.38 L179.75 225.75 L179.88 225.62 L180.00 224.38 L180.12 224.25 L180.12 223.88 L180.25 223.75 L180.25 223.38 L180.38 223.25 L180.38 222.88 L180.50 222.75 L180.50 222.38 L180.62 222.25 L180.62 221.88 L180.75 221.75 L180.75 221.38 L180.88 221.25 L180.88 220.88 L181.00 220.75 L181.00 220.38 L181.12 220.25 L181.12 219.88 L181.25 219.75 L181.25 219.38 L181.38 219.25 L181.38 218.88 L181.50 218.75 L181.50 218.38 L181.75 217.75 L181.88 216.25 L182.00 216.12 L182.00 215.25 L182.12 215.12 L182.12 214.38 L182.25 214.25 L182.25 213.50 L182.38 213.38 L182.38 212.62 L182.50 212.50 L182.62 210.75 L182.75 210.62 L182.75 210.00 L182.88 209.88 L182.88 209.25 L183.00 209.12 L183.00 208.50 L183.12 208.38 L183.25 207.00 L183.38 206.88 L183.38 206.38 L183.50 206.25 L183.50 205.62 L183.62 205.50 L183.62 204.88 L183.75 204.75 L183.88 203.38 L184.00 203.25 L184.00 202.75 L184.12 202.62 L184.12 202.12 L184.25 202.00 L184.25 201.38 L184.38 201.25 L184.38 200.75 L184.50 200.62 L184.50 200.12 L184.62 200.00 L184.62 199.38 L184.75 199.25 L184.88 198.00 L185.00 197.88 L185.00 197.38 L185.12 197.25 L185.12 196.62 L185.25 196.50 L185.25 196.00 L185.38 195.88 L185.38 195.38 L185.50 195.25 L185.50 194.62 L185.62 194.50 L185.62 194.00 L185.75 193.88 L185.75 193.25 L185.88 193.12 L185.88 192.62 L186.00 192.50 L186.12 191.25 L186.25 191.12 L186.38 190.12 L186.62 189.50 L186.62 189.00 L186.88 188.38 L186.88 187.88 L187.00 187.75 L187.00 187.25 L187.12 187.12 L187.25 186.12 L187.50 185.50 L187.50 185.00 L187.75 184.38 L187.75 183.88 L187.88 183.75 L187.88 183.38 L188.00 183.25 L188.00 182.88 L188.12 182.75 L188.12 182.38 L188.38 181.75 L188.38 181.25 L188.50 181.12 L188.50 180.75 L188.62 180.62 L188.62 180.25 L188.88 179.62 L188.88 179.12 L189.00 179.00 L189.00 178.62 L189.12 178.50 L189.12 178.12 L189.25 178.00 L189.25 177.62 L189.50 177.00 L189.50 176.50 L189.62 176.38 L189.62 175.75 L189.75 175.62 L189.75 175.00 L189.88 174.88 L190.00 173.62 L190.12 173.50 L190.12 173.00 L190.25 172.88 L190.25 172.25 L190.38 172.12 L190.38 171.50 L190.50 171.38 L190.50 170.88 L190.62 170.75 L190.75 169.38 L190.88 169.25 L190.88 168.75 L191.00 168.62 L191.00 168.00 L191.12 167.88 L191.12 167.25 L191.25 167.12 L191.38 165.75 L191.50 165.62 L191.50 165.12 L191.62 165.00 L191.62 164.38 L191.75 164.25 L191.75 163.62 L191.88 163.50 L191.88 162.88 L192.00 162.75 L192.12 161.38 L192.50 160.62 L193.12 160.00 L193.12 159.88 L193.62 159.38 L194.12 158.62 L194.75 158.00 L194.75 157.88 L198.25 153.62 L200.00 155.00 Z",
  "backRightLeg": "M200.00 116.62 L200.00 155.00 L204.88 158.62 L205.25 159.38 L207.25 162.38 L207.25 162.62 L207.38 162.75 L208.12 165.25 L208.38 165.62 L208.38 165.88 L208.88 167.12 L209.00 168.25 L209.12 168.38 L209.12 169.00 L209.25 169.12 L209.25 169.62 L209.38 169.75 L209.38 170.38 L209.50 170.50 L209.50 171.12 L209.62 171.25 L209.75 172.50 L209.88 172.62 L209.88 173.25 L210.00 173.38 L210.00 173.88 L210.12 174.00 L210.12 174.62 L210.25 174.75 L210.25 175.25 L210.38 175.38 L210.38 175.88 L210.50 176.00 L210.50 176.50 L210.62 176.62 L210.62 177.12 L210.88 177.75 L211.12 179.50 L211.25 179.62 L211.25 180.00 L211.50 180.62 L211.50 181.12 L211.75 181.75 L211.75 182.25 L211.88 182.38 L211.88 182.75 L212.12 183.38 L212.12 183.88 L212.38 184.50 L212.38 185.00 L212.62 185.62 L212.75 186.75 L212.88 186.88 L213.00 187.88 L213.25 188.50 L213.25 189.00 L213.50 189.62 L213.50 190.12 L213.62 190.25 L213.62 190.75 L213.75 190.88 L213.75 191.38 L213.88 191.50 L213.88 192.00 L214.00 192.12 L214.00 192.62 L214.12 192.75 L214.12 193.25 L214.25 193.38 L214.25 193.88 L214.38 194.00 L214.38 194.50 L214.50 194.62 L214.50 195.12 L214.62 195.25 L214.62 195.75 L214.75 195.88 L214.75 196.38 L214.88 196.50 L214.88 197.00 L215.00 197.12 L215.00 197.75 L215.12 197.88 L215.12 198.50 L215.25 198.62 L215.25 199.25 L215.38 199.38 L215.50 200.75 L215.62 200.88 L215.62 201.38 L215.75 201.50 L215.75 202.12 L215.88 202.25 L215.88 202.75 L216.00 202.88 L216.00 203.38 L216.12 203.50 L216.12 204.12 L216.25 204.25 L216.25 204.75 L216.38 204.88 L216.38 205.38 L216.50 205.50 L216.50 206.12 L216.62 206.25 L216.62 206.75 L216.75 206.88 L216.75 207.38 L216.88 207.50 L216.88 208.12 L217.00 208.25 L217.00 208.88 L217.12 209.00 L217.12 209.62 L217.25 209.75 L217.25 210.50 L217.38 210.62 L217.38 211.25 L217.50 211.38 L217.62 213.00 L217.75 213.12 L217.88 214.62 L218.00 214.75 L218.00 215.38 L218.12 215.50 L218.12 216.12 L218.25 216.25 L218.25 216.88 L218.38 217.00 L218.38 217.62 L218.50 217.75 L218.62 219.12 L218.75 219.25 L218.75 219.75 L218.88 219.88 L218.88 220.50 L219.00 220.62 L219.00 221.25 L219.12 221.38 L219.25 222.75 L219.38 222.88 L219.38 223.25 L219.50 223.38 L219.50 223.75 L219.62 223.88 L219.62 224.25 L219.75 224.38 L219.75 224.75 L219.88 224.88 L219.88 225.25 L220.00 225.38 L220.25 226.75 L220.50 227.25 L220.50 227.62 L220.62 227.75 L220.62 228.12 L220.75 228.25 L220.75 228.62 L220.88 228.75 L220.88 229.12 L221.00 229.25 L221.00 229.62 L221.12 229.75 L221.12 230.12 L221.38 230.75 L221.38 231.25 L221.50 231.38 L221.62 232.62 L221.75 232.75 L221.75 233.25 L221.88 233.38 L221.88 233.88 L222.00 234.00 L222.00 234.50 L222.12 234.62 L222.12 235.12 L222.25 235.25 L222.25 235.88 L222.38 236.00 L222.50 237.12 L222.62 237.25 L222.62 237.62 L222.88 238.12 L222.88 238.50 L223.25 239.38 L223.25 239.75 L223.38 239.88 L223.38 240.12 L223.62 240.62 L223.62 241.00 L223.75 241.12 L223.75 241.50 L223.88 241.62 L223.88 242.38 L224.00 242.50 L224.12 244.12 L224.25 244.25 L224.25 244.88 L224.38 245.00 L224.38 245.75 L224.50 245.88 L224.62 247.50 L224.75 247.62 L224.75 248.12 L225.00 248.50 L225.12 249.25 L225.25 249.38 L225.38 250.88 L225.50 251.00 L225.50 251.62 L225.62 251.75 L225.62 252.38 L225.75 252.50 L225.75 253.25 L225.88 253.38 L225.75 259.25 L225.88 259.38 L225.88 260.50 L226.00 260.62 L226.00 261.75 L226.12 261.88 L226.12 266.12 L226.00 266.25 L226.00 271.75 L225.88 271.88 L225.88 275.38 L225.75 275.50 L225.62 285.50 L225.75 285.62 L225.75 287.38 L225.88 287.50 L226.00 291.12 L226.12 291.25 L226.12 292.75 L226.25 292.88 L226.38 295.75 L226.50 295.88 L226.50 297.12 L226.62 297.25 L226.62 298.62 L226.75 298.75 L226.75 299.62 L226.88 299.75 L226.88 300.38 L227.00 300.50 L227.00 301.12 L227.12 301.25 L227.12 301.88 L227.25 302.00 L227.25 302.62 L227.38 302.75 L227.38 303.38 L227.50 303.50 L227.50 304.12 L227.62 304.25 L227.62 304.88 L227.75 305.00 L227.88 306.38 L228.00 306.50 L228.12 307.75 L228.25 307.88 L228.25 308.38 L228.38 308.50 L228.38 309.00 L228.50 309.12 L228.50 309.75 L228.62 309.88 L228.62 310.38 L228.75 310.50 L228.75 311.00 L228.88 311.12 L228.88 311.75 L229.00 311.88 L229.00 312.38 L229.12 312.50 L229.12 313.00 L229.25 313.12 L229.25 313.75 L229.38 313.88 L229.50 315.00 L229.75 315.62 L230.00 317.38 L230.25 318.00 L230.50 319.75 L230.75 320.38 L230.75 320.88 L230.88 321.00 L231.12 322.75 L231.38 323.38 L231.38 323.88 L231.50 324.00 L231.50 324.50 L231.62 324.62 L231.88 326.38 L232.00 326.50 L232.12 327.50 L232.25 327.62 L232.25 328.12 L232.38 328.25 L232.38 329.00 L232.50 329.12 L232.50 330.00 L232.62 330.12 L232.62 331.12 L232.75 331.25 L232.75 332.12 L232.88 332.25 L232.88 333.12 L233.00 333.25 L233.00 334.25 L233.12 334.38 L233.12 335.25 L233.25 335.38 L233.25 336.38 L233.38 336.50 L233.38 337.38 L233.50 337.50 L233.50 338.50 L233.62 338.62 L233.62 339.50 L233.75 339.62 L233.75 340.50 L233.88 340.62 L233.88 341.62 L234.00 341.75 L234.12 343.38 L234.25 343.50 L234.25 343.88 L234.38 344.00 L234.62 345.38 L234.88 345.88 L234.88 346.25 L235.00 346.38 L235.25 347.75 L235.50 348.25 L235.50 348.62 L235.62 348.75 L235.62 349.12 L235.75 349.25 L235.75 349.62 L236.00 350.25 L235.75 358.00 L236.00 358.38 L236.00 358.62 L236.38 359.38 L236.50 360.00 L236.75 360.38 L237.12 361.62 L237.38 362.00 L237.75 363.25 L238.00 363.62 L238.12 364.25 L238.38 364.62 L238.38 365.62 L238.50 365.75 L238.50 367.50 L238.62 367.62 L238.62 369.50 L238.50 369.62 L238.50 372.00 L238.38 372.12 L238.38 374.62 L238.25 374.75 L238.25 377.75 L238.12 377.88 L238.12 379.62 L239.38 380.50 L240.00 380.75 L240.62 380.75 L240.75 380.88 L242.00 381.00 L242.12 381.12 L243.38 381.25 L243.50 381.38 L246.25 381.38 L246.38 381.50 L252.38 381.50 L252.50 381.62 L258.75 381.62 L258.88 381.75 L262.50 381.75 L262.62 381.62 L263.62 381.62 L263.75 374.62 L263.62 374.50 L263.62 373.75 L263.50 373.62 L263.50 372.88 L263.38 372.75 L263.38 372.00 L263.25 371.88 L263.25 371.12 L263.12 371.00 L263.12 370.25 L263.00 370.12 L263.00 369.38 L262.88 369.25 L262.88 368.12 L263.00 368.00 L263.12 366.62 L263.25 366.50 L263.38 365.38 L263.62 364.75 L263.62 364.25 L263.75 364.12 L263.75 363.62 L263.88 363.50 L264.12 361.75 L264.25 361.62 L264.38 360.62 L264.50 360.50 L264.50 360.00 L264.62 359.88 L264.62 359.12 L264.75 359.00 L264.75 357.88 L264.88 357.75 L264.88 356.62 L265.00 356.50 L265.00 355.38 L265.12 355.25 L265.12 354.12 L265.25 354.00 L265.25 352.88 L265.38 352.75 L265.38 351.50 L265.50 351.38 L265.50 350.00 L265.62 349.88 L265.62 348.50 L265.75 348.38 L265.88 345.50 L266.00 345.38 L266.00 343.62 L266.12 343.50 L266.12 341.12 L266.25 341.00 L266.25 338.62 L266.38 338.50 L266.38 336.12 L266.50 336.00 L266.50 333.62 L266.62 333.50 L266.75 329.38 L266.88 329.25 L266.88 328.62 L267.00 328.50 L267.00 327.75 L267.12 327.62 L267.12 327.00 L267.25 326.88 L267.38 325.25 L267.50 325.12 L267.50 324.50 L267.62 324.38 L267.62 323.62 L267.75 323.50 L267.75 322.88 L267.88 322.75 L267.88 322.00 L268.00 321.88 L268.00 321.25 L268.12 321.12 L268.12 320.38 L268.25 320.25 L268.25 319.62 L268.38 319.50 L268.38 318.75 L268.50 318.62 L268.50 317.88 L268.62 317.75 L268.75 316.25 L268.88 316.12 L268.88 315.50 L269.00 315.38 L269.00 314.50 L269.12 314.38 L269.12 313.50 L269.25 313.38 L269.25 312.38 L269.38 312.25 L269.38 311.38 L269.50 311.25 L269.50 310.38 L269.62 310.25 L269.62 309.25 L269.75 309.12 L269.88 307.12 L270.00 307.00 L270.00 306.12 L270.12 306.00 L270.12 305.00 L270.25 304.88 L270.25 304.00 L270.38 303.88 L270.38 303.00 L270.50 302.88 L270.50 301.88 L270.62 301.75 L270.62 300.88 L270.75 300.75 L270.88 298.88 L271.00 298.75 L271.12 297.00 L271.25 296.88 L271.38 295.12 L271.50 295.00 L271.62 293.25 L271.75 293.12 L271.75 290.88 L271.88 290.75 L271.88 287.00 L272.00 286.88 L271.88 273.62 L271.75 273.50 L271.75 269.38 L271.62 269.25 L271.62 268.38 L271.50 268.25 L271.38 266.50 L271.25 266.38 L271.25 265.62 L271.12 265.50 L271.12 264.62 L271.00 264.50 L271.00 263.75 L270.88 263.62 L270.88 262.75 L270.75 262.62 L270.75 261.88 L270.62 261.75 L270.62 261.12 L270.50 261.00 L270.50 260.25 L270.38 260.12 L270.38 259.50 L270.25 259.38 L270.25 258.62 L270.12 258.50 L270.12 257.75 L270.00 257.62 L270.00 257.00 L269.88 256.88 L269.88 256.12 L269.75 256.00 L269.62 254.62 L269.50 254.50 L269.50 254.12 L269.25 253.50 L269.25 253.00 L269.00 252.38 L269.00 251.88 L268.88 251.75 L268.88 251.38 L268.62 250.75 L268.62 250.25 L268.38 249.62 L268.38 249.12 L268.25 249.00 L268.25 248.62 L268.00 248.00 L268.00 247.50 L267.88 247.38 L267.88 246.88 L267.75 246.75 L267.75 246.25 L267.62 246.12 L267.62 245.50 L267.50 245.38 L267.50 244.88 L267.38 244.75 L267.38 244.25 L267.25 244.12 L267.25 243.62 L267.12 243.50 L267.12 243.00 L267.00 242.88 L267.00 242.25 L266.88 242.12 L266.88 241.62 L266.75 241.50 L266.75 241.00 L266.62 240.88 L266.62 240.25 L266.50 240.12 L266.50 239.25 L266.38 239.12 L266.38 238.38 L266.25 238.25 L266.25 237.38 L266.12 237.25 L266.12 236.75 L266.00 236.62 L266.00 236.38 L265.62 235.50 L265.62 235.12 L265.12 233.88 L265.12 233.12 L265.00 233.00 L265.00 231.62 L264.88 231.50 L264.88 230.25 L264.75 230.12 L264.75 228.88 L264.62 228.75 L264.62 227.38 L264.50 227.25 L264.50 215.88 L264.38 215.75 L264.38 201.62 L264.50 201.50 L264.50 197.12 L264.62 197.00 L264.62 195.38 L264.75 195.25 L264.75 193.62 L264.88 193.50 L265.00 190.50 L265.12 190.38 L265.12 189.62 L265.25 189.50 L265.25 188.75 L265.38 188.62 L265.38 187.88 L265.50 187.75 L265.50 187.00 L265.62 186.88 L265.62 186.00 L265.75 185.88 L265.75 185.00 L265.88 184.88 L265.88 184.00 L266.00 183.88 L266.00 183.00 L266.12 182.88 L266.12 182.00 L266.25 181.88 L266.25 181.00 L266.38 180.88 L266.38 180.12 L266.50 180.00 L266.50 179.12 L266.62 179.00 L266.62 178.12 L266.75 178.00 L266.75 177.12 L266.88 177.00 L266.88 176.12 L267.00 176.00 L267.00 175.12 L267.12 175.00 L267.12 174.00 L267.25 173.88 L267.25 171.62 L267.38 171.50 L267.38 168.88 L267.50 168.75 L267.62 165.38 L267.75 165.25 L267.75 164.12 L267.88 164.00 L267.88 163.38 L268.00 163.25 L268.00 162.62 L268.12 162.50 L268.12 161.88 L268.25 161.75 L268.25 161.12 L268.38 161.00 L268.38 160.38 L268.50 160.25 L268.62 158.00 L268.75 157.88 L268.75 156.62 L268.88 156.50 L268.88 155.25 L269.00 155.12 L269.00 154.00 L269.12 153.88 L269.25 146.12 L269.38 146.00 L269.38 144.75 L269.50 144.62 L269.50 143.38 L269.62 143.25 L269.62 141.88 L269.75 141.75 L269.75 140.50 L269.88 140.38 L269.88 137.88 L269.75 137.75 L269.75 132.88 L269.88 132.75 L269.88 128.25 L270.00 128.12 L270.00 125.88 L269.88 125.75 L269.88 123.88 L269.75 123.75 L269.75 121.88 L269.62 121.75 L269.62 119.88 L269.50 119.75 L269.50 117.75 L269.38 117.62 L269.38 116.62 Z",
});
export function createSlimSuruwalSvg(colours = {}, artwork = {}) {
  const templateId = "suruwal";
  const c = normaliseColourMap(colours, SLIM_SURUWAL_DEFAULT_COLOURS);
  const front = [
    editableRegionPath(templateId, artwork, "frontWaistband", c["frontWaistband"], SLIM_SURUWAL_SOURCE_TRACED_PATHS["frontWaistband"], {strokeWidth: 0.7, extraAttributes: "fill-rule=\"evenodd\""}),
    editableRegionPath(templateId, artwork, "frontLeftLeg", c["frontLeftLeg"], SLIM_SURUWAL_SOURCE_TRACED_PATHS["frontLeftLeg"], {strokeWidth: 0.7, extraAttributes: "fill-rule=\"evenodd\""}),
    editableRegionPath(templateId, artwork, "frontRightLeg", c["frontRightLeg"], SLIM_SURUWAL_SOURCE_TRACED_PATHS["frontRightLeg"], {strokeWidth: 0.7, extraAttributes: "fill-rule=\"evenodd\""}),
  ].join("\n");
  const back = [
    editableRegionPath(templateId, artwork, "backWaistband", c["backWaistband"], SLIM_SURUWAL_SOURCE_TRACED_PATHS["backWaistband"], {strokeWidth: 0.7, extraAttributes: "fill-rule=\"evenodd\""}),
    editableRegionPath(templateId, artwork, "backLeftLeg", c["backLeftLeg"], SLIM_SURUWAL_SOURCE_TRACED_PATHS["backLeftLeg"], {strokeWidth: 0.7, extraAttributes: "fill-rule=\"evenodd\""}),
    editableRegionPath(templateId, artwork, "backRightLeg", c["backRightLeg"], SLIM_SURUWAL_SOURCE_TRACED_PATHS["backRightLeg"], {strokeWidth: 0.7, extraAttributes: "fill-rule=\"evenodd\""}),
  ].join("\n");
  return createDualViewSvg({ front, back, label: "Slim Suruwal" });
}
const SLIM_SURUWAL_SVG = createSlimSuruwalSvg(SLIM_SURUWAL_DEFAULT_COLOURS);

export const CLOTHING_TEMPLATES = Object.freeze([
  Object.freeze({
    id: "kurta",
    label: "Women's Long Kurta",
    description: "Geometry-traced long V-neck women's kurta with horizontal sleeves, fitted waist, low side slits and editable front/back neckline and hem panels.",
    fileName: "kurta-template.svg",
    mimeType: "image/svg+xml",
    dualView: true,
    views: Object.freeze(["front", "back"]),
    svg: KURTA_SVG,
    editableColours: true,
    editableArtwork: true,
    colourRegions: KURTA_COLOUR_REGIONS,
    defaultColours: KURTA_DEFAULT_COLOURS,
    createSvg: createKurtaSvg,
  }),
  Object.freeze({
    id: "suruwal",
    label: "Slim Suruwal (Churidar-style)",
    description: "Source-matched slim/tapered churidar-style trousers with independently editable front/back waistband and legs.",
    fileName: "suruwal-template.svg",
    mimeType: "image/svg+xml",
    dualView: true,
    views: Object.freeze(["front", "back"]),
    svg: SLIM_SURUWAL_SVG,
    editableColours: true,
    editableArtwork: true,
    colourRegions: SLIM_SURUWAL_COLOUR_REGIONS,
    defaultColours: SLIM_SURUWAL_DEFAULT_COLOURS,
    createSvg: createSlimSuruwalSvg,
  }),
  Object.freeze({
    id: "tshirt",

    label: "T-Shirt",

    description:
      "Realistic front and back short-sleeve crew-neck fashion flat.",

    fileName: "tshirt-template.svg",

    mimeType: "image/svg+xml",

    dualView: true,

    views: Object.freeze(["front", "back"]),

    svg: TSHIRT_SVG,

    editableColours: true,

    editableArtwork: true,

    colourRegions: TSHIRT_COLOUR_REGIONS,

    defaultColours: TSHIRT_DEFAULT_COLOURS,

    createSvg: createTshirtSvg,
  }),

  Object.freeze({
    id: "oversized-tshirt",
    label: "Oversized T-Shirt",
    description: "Relaxed drop-shoulder streetwear T-shirt with wide sleeves, generous body and ribbed collar/hem.",
    fileName: "oversized-tshirt-template.svg",
    mimeType: "image/svg+xml",
    dualView: true,
    views: Object.freeze(["front", "back"]),
    svg: OVERSIZED_TSHIRT_SVG,
    editableColours: true,
    editableArtwork: true,
    colourRegions: OVERSIZED_TSHIRT_COLOUR_REGIONS,
    defaultColours: OVERSIZED_TSHIRT_DEFAULT_COLOURS,
    createSvg: createOversizedTshirtSvg,
  }),

  Object.freeze({
    id: "polo",
    label: "Polo Shirt",
    description: "Classic collared short-sleeve polo with three-button placket, rib cuffs and front/back editable regions.",
    fileName: "polo-template.svg",
    mimeType: "image/svg+xml",
    dualView: true,
    views: Object.freeze(["front", "back"]),
    svg: POLO_SVG,
    editableColours: true,
    editableArtwork: true,
    colourRegions: POLO_COLOUR_REGIONS,
    defaultColours: POLO_DEFAULT_COLOURS,
    createSvg: createPoloSvg,
  }),

  Object.freeze({
    id: "long-sleeve-tshirt",
    label: "Long-Sleeve T-Shirt",
    description: "Classic crew-neck long-sleeve tee with individually editable front/back body, sleeves, ribbed cuffs and collar.",
    fileName: "long-sleeve-tshirt-template.svg",
    mimeType: "image/svg+xml",
    dualView: true,
    views: Object.freeze(["front", "back"]),
    svg: LONG_SLEEVE_TSHIRT_SVG,
    editableColours: true,
    editableArtwork: true,
    colourRegions: LONG_SLEEVE_TSHIRT_COLOUR_REGIONS,
    defaultColours: LONG_SLEEVE_TSHIRT_DEFAULT_COLOURS,
    createSvg: createLongSleeveTshirtSvg,
  }),

  Object.freeze({
    id: "crop-top",
    label: "Crop Top",
    description: "Short-sleeve fitted cropped crew-neck top with editable sleeves, collar, and short hem band.",
    fileName: "crop-top-template.svg",
    mimeType: "image/svg+xml",
    dualView: true,
    views: Object.freeze(["front", "back"]),
    svg: CROP_TOP_SVG,
    editableColours: true,
    editableArtwork: true,
    colourRegions: CROP_TOP_COLOUR_REGIONS,
    defaultColours: CROP_TOP_DEFAULT_COLOURS,
    createSvg: createCropTopSvg,
  }),

  Object.freeze({
    id: "shirt",

    label: "Shirt",

    description:
      "Realistic front and back button-up shirt with collar, placket, chest pocket and yoke detailing.",

    fileName: "shirt-template.svg",

    mimeType: "image/svg+xml",

    dualView: true,

    views: Object.freeze(["front", "back"]),

    svg: SHIRT_SVG,

    editableColours: true,

    editableArtwork: true,

    colourRegions: SHIRT_COLOUR_REGIONS,

    defaultColours: SHIRT_DEFAULT_COLOURS,

    createSvg: createShirtSvg,
  }),

  Object.freeze({
    id: "hoodie",

    label: "Hoodie",

    description:
      "Realistic front and back pullover hoodie with hood, drawcords, kangaroo pocket, rib hem and cuffs.",

    fileName: "hoodie-template.svg",

    mimeType: "image/svg+xml",

    dualView: true,

    views: Object.freeze(["front", "back"]),

    svg: HOODIE_SVG,

    editableColours: true,

    editableArtwork: true,

    colourRegions: HOODIE_COLOUR_REGIONS,

    defaultColours: HOODIE_DEFAULT_COLOURS,

    createSvg: createHoodieSvg,
  }),

  Object.freeze({
    id: "dress",

    label: "Puff-Sleeve Maxi Dress",

    description:
      "Front and back puff-sleeve maxi dress with gathered neckline, fitted bodice, soft waist seam and long flowing skirt.",

    fileName: "puff-sleeve-maxi-dress-template.svg",

    mimeType: "image/svg+xml",

    dualView: true,

    views: Object.freeze(["front", "back"]),

    svg: DRESS_SVG,

    editableColours: true,

    editableArtwork: true,

    colourRegions: DRESS_COLOUR_REGIONS,

    defaultColours: DRESS_DEFAULT_COLOURS,

    createSvg: createDressSvg,
  }),

  Object.freeze({
    id: "pants",

    label: "Pants",

    description:
      "Realistic front and back tailored pants with waistband, fly, crease lines and front/back pockets.",

    fileName: "pants-template.svg",

    mimeType: "image/svg+xml",

    dualView: true,

    views: Object.freeze(["front", "back"]),

    svg: PANTS_SVG,

    editableColours: true,

    editableArtwork: true,

    colourRegions: PANTS_COLOUR_REGIONS,

    defaultColours: PANTS_DEFAULT_COLOURS,

    createSvg: createPantsSvg,
  }),

  Object.freeze({
    id: "womens-blazer",
    label: "Women's Tailored Blazer",
    description: "Fitted two-button women's tailored blazer with deep notch lapels, shaped waist, flared hem and angled full-length sleeves; based on the real Latitude23 Sketchfab garment.",
    fileName: "womens-tailored-blazer-template.svg",
    mimeType: "image/svg+xml",
    dualView: true,
    views: Object.freeze(["front","back"]),
    svg: WOMENS_BLAZER_SVG,
    editableColours: true,
    editableArtwork: true,
    colourRegions: WOMENS_BLAZER_COLOUR_REGIONS,
    defaultColours: WOMENS_BLAZER_DEFAULT_COLOURS,
    createSvg: createWomensBlazerSvg,
  }),

  Object.freeze({
    id: "jeans",
    label: "Grey Jeans",
    description: "Realistic slim straight-leg grey denim jeans with independent front/back legs, waistband and four pockets.",
    fileName: "jeans-template.svg",
    mimeType: "image/svg+xml",
    dualView: true,
    views: Object.freeze(["front", "back"]),
    svg: JEANS_SVG,
    editableColours: true,
    editableArtwork: true,
    colourRegions: JEANS_COLOUR_REGIONS,
    defaultColours: JEANS_DEFAULT_COLOURS,
    createSvg: createJeansSvg,
  }),

  Object.freeze({
    id: "skirt",

    label: "Skirt",

    description:
      "Realistic front and back A-line panel skirt with waistband, seams, darts and back zipper detail.",

    fileName: "skirt-template.svg",

    mimeType: "image/svg+xml",

    dualView: true,

    views: Object.freeze(["front", "back"]),

    svg: SKIRT_SVG,

    editableColours: true,

    editableArtwork: true,

    colourRegions: SKIRT_COLOUR_REGIONS,

    defaultColours: SKIRT_DEFAULT_COLOURS,

    createSvg: createSkirtSvg,
  }),
].map(enrichGarmentTemplate));

/*=========================================================
Template Lookup
=========================================================*/

export function getClothingTemplate(templateId) {
  const requestedId = String(templateId || "").trim();

  if (!requestedId) {
    return null;
  }

  return (
    CLOTHING_TEMPLATES.find((template) => template.id === requestedId) || null
  );
}

/*=========================================================
Default Colour Lookup
=========================================================*/

export function getClothingTemplateDefaultColours(templateOrId) {
  const template = resolveTemplate(templateOrId);

  if (!template || !template.editableColours || !template.defaultColours) {
    return {};
  }

  return {
    ...template.defaultColours,
  };
}

/*=========================================================
Colour Region Lookup
=========================================================*/

export function getClothingTemplateColourRegions(templateOrId) {
  const template = resolveTemplate(templateOrId);

  if (!template || !Array.isArray(template.colourRegions)) {
    return [];
  }

  return template.colourRegions.map((region) => ({
    ...region,
  }));
}

/*=========================================================
Artwork Region Lookup
=========================================================*/

export function getClothingTemplateArtworkRegions(templateOrId) {
  const template = resolveTemplate(templateOrId);

  if (!template || template.editableArtwork !== true) {
    return [];
  }

  return getClothingTemplateColourRegions(template).map((region) => ({
    ...region,

    artworkBox: getArtworkBox(template.id, region.id),
  }));
}

export function getClothingTemplateArtworkBox(templateOrId, regionId) {
  const template = resolveTemplate(templateOrId);

  if (!template || !regionId) {
    return null;
  }

  const validRegion = getClothingTemplateColourRegions(template).some(
    (region) => region.id === String(regionId),
  );

  if (!validRegion) {
    return null;
  }

  return getArtworkBox(template.id, regionId);
}

export function normaliseClothingTemplateArtwork(templateOrId, artwork = null) {
  const template = resolveTemplate(templateOrId);

  if (!template || template.editableArtwork !== true) {
    return {};
  }

  const source =
    artwork && typeof artwork === "object" && !Array.isArray(artwork)
      ? artwork
      : {};

  const validRegionIds = new Set(
    getClothingTemplateColourRegions(template).map((region) => region.id),
  );

  return Object.entries(source).reduce((result, [regionId, entry]) => {
    if (!validRegionIds.has(regionId)) {
      return result;
    }

    const normalizedEntry = normaliseArtworkEntry(entry);

    if (normalizedEntry) {
      result[regionId] = normalizedEntry;
    }

    return result;
  }, {});
}

/*=========================================================
View Helpers
=========================================================*/

export function getClothingTemplateViews(templateOrId) {
  const template = resolveTemplate(templateOrId);

  if (!template) {
    return [];
  }

  return Array.isArray(template.views) ? [...template.views] : ["front"];
}

export function isDualViewClothingTemplate(templateOrId) {
  const template = resolveTemplate(templateOrId);

  return Boolean(
    template?.dualView === true &&
    Array.isArray(template.views) &&
    template.views.includes("front") &&
    template.views.includes("back"),
  );
}

/*=========================================================
Generate Clothing SVG
=========================================================*/

export function createClothingTemplateSvg(
  templateOrId,
  colours = null,
  artwork = null,
) {
  const template = resolveTemplate(templateOrId);

  if (!template) {
    throw new Error("The clothing template is invalid.");
  }

  if (typeof template.createSvg === "function") {
    const safeColours = {
      ...(template.defaultColours || {}),

      ...(colours && typeof colours === "object" && !Array.isArray(colours)
        ? colours
        : {}),
    };

    const safeArtwork = normaliseClothingTemplateArtwork(template, artwork);

    return template.createSvg(safeColours, safeArtwork);
  }

  if (!template.svg) {
    throw new Error("The clothing template SVG is missing.");
  }

  return template.svg;
}

/*=========================================================
Create Clothing File
=========================================================*/

export function createClothingTemplateFile(
  templateOrId,
  colours = null,
  artwork = null,
) {
  const template = resolveTemplate(templateOrId);

  if (!template) {
    throw new Error("The clothing template is invalid.");
  }

  const svg = createClothingTemplateSvg(template, colours, artwork);

  return new File([svg], template.fileName, {
    type: template.mimeType || "image/svg+xml",
  });
}

/*=========================================================
Create Clothing Preview
=========================================================*/

export function createClothingTemplatePreview(
  templateOrId,
  colours = null,
  artwork = null,
) {
  const template = resolveTemplate(templateOrId);

  if (!template) {
    return "";
  }

  try {
    const svg = createClothingTemplateSvg(template, colours, artwork);

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return "";
  }
}

/*=========================================================
Clothing Metadata Helper
=========================================================*/

export function createClothingTemplateMetadata(
  templateOrId,
  colours = null,
  artwork = undefined,
) {
  const template = resolveTemplate(templateOrId);

  if (!template) {
    return null;
  }

  const defaults = getClothingTemplateDefaultColours(template);

  const requestedColours =
    colours && typeof colours === "object" && !Array.isArray(colours)
      ? colours
      : {};

  const clothingColours = template.editableColours
    ? normaliseColourMap(
        {
          ...defaults,
          ...requestedColours,
        },
        defaults,
      )
    : {};

  const metadata = {
    clothingTemplate: true,

    clothingTemplateVersion: 4,

    clothingTemplateId: template.id,

    clothingTemplateLabel: template.label,

    clothingEditableColours: template.editableColours === true,

    clothingEditableArtwork: template.editableArtwork === true,

    clothingDualView: template.dualView === true,

    clothingViews: getClothingTemplateViews(template),

    clothingColours,
  };

  /*
  Important backwards-compatible behaviour:

  If artwork is not supplied, we intentionally do NOT
  write clothingArtwork into the returned metadata.

  This means your currently working colour editor cannot
  accidentally delete previously stored artwork when it
  updates only a garment colour.

  When FashionEditor explicitly supplies an artwork object,
  it will be normalized and persisted here.
  */

  if (artwork !== undefined) {
    metadata.clothingArtwork = normaliseClothingTemplateArtwork(
      template,
      artwork,
    );
  }

  return metadata;
}

/*=========================================================
Default Export
=========================================================*/

export default CLOTHING_TEMPLATES;
