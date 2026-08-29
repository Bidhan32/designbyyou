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
    frontBodice: Object.freeze({
      x: 141,
      y: 88,
      width: 118,
      height: 108,
    }),

    backBodice: Object.freeze({
      x: 141,
      y: 84,
      width: 118,
      height: 112,
    }),

    frontSkirt: Object.freeze({
      x: 82,
      y: 220,
      width: 236,
      height: 212,
    }),

    backSkirt: Object.freeze({
      x: 82,
      y: 220,
      width: 236,
      height: 212,
    }),

    frontLeftSleeve: Object.freeze({
      x: 90,
      y: 84,
      width: 66,
      height: 82,
    }),

    frontRightSleeve: Object.freeze({
      x: 244,
      y: 84,
      width: 66,
      height: 82,
    }),

    backLeftSleeve: Object.freeze({
      x: 90,
      y: 84,
      width: 66,
      height: 82,
    }),

    backRightSleeve: Object.freeze({
      x: 244,
      y: 84,
      width: 66,
      height: 82,
    }),

    frontWaistband: Object.freeze({
      x: 138,
      y: 194,
      width: 124,
      height: 46,
    }),

    backWaistband: Object.freeze({
      x: 138,
      y: 194,
      width: 124,
      height: 46,
    }),

    frontNeckline: Object.freeze({
      x: 156,
      y: 68,
      width: 88,
      height: 52,
    }),

    backNeckline: Object.freeze({
      x: 156,
      y: 68,
      width: 88,
      height: 34,
    }),
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

  const front = `
    ${editableRegionPath(
      "dress",
      artwork,
      "frontBodice",
      c.frontBodice,
      "M156 70 L141 88 L145 196 Q170 208 200 208 Q230 208 255 196 L259 88 L244 70 C237 101 222 118 200 118 C178 118 163 101 156 70 Z",
    )}

    ${editableRegionPath(
      "dress",
      artwork,
      "frontLeftSleeve",
      c.frontLeftSleeve,
      "M156 70 L119 86 L91 139 L126 164 L145 126 L141 88 Z",
    )}

    ${editableRegionPath(
      "dress",
      artwork,
      "frontRightSleeve",
      c.frontRightSleeve,
      "M244 70 L281 86 L309 139 L274 164 L255 126 L259 88 Z",
    )}

    ${editableRegionPath(
      "dress",
      artwork,
      "frontSkirt",
      c.frontSkirt,
      "M139 219 Q200 231 261 219 L320 438 Q200 458 80 438 Z",
    )}

    ${editableRegionPath(
      "dress",
      artwork,
      "frontWaistband",
      c.frontWaistband,
      "M140 195 Q200 208 260 195 L262 224 Q200 239 138 224 Z",
      {
        strokeWidth: 3,
      },
    )}

    ${editableRegionPath(
      "dress",
      artwork,
      "frontNeckline",
      c.frontNeckline,
      "M156 70 C165 104 179 118 200 118 C221 118 235 104 244 70 C237 94 221 106 200 106 C179 106 163 94 156 70 Z",
      {
        strokeWidth: 2.7,
      },
    )}

    ${detailPath("M163 120 L181 194", {
      strokeWidth: 1.5,

      opacity: 0.6,
    })}

    ${detailPath("M237 120 L219 194", {
      strokeWidth: 1.5,

      opacity: 0.6,
    })}

    ${detailPath("M156 240 L136 417", {
      strokeWidth: 1.5,

      opacity: 0.6,
    })}

    ${detailPath("M200 239 L200 425", {
      strokeWidth: 1.2,

      opacity: 0.45,
    })}

    ${detailPath("M244 240 L264 417", {
      strokeWidth: 1.5,

      opacity: 0.6,
    })}

    ${detailPath("M88 415 Q200 434 312 415", {
      strokeWidth: 1.7,
    })}

    ${foldPath("M168 250 Q178 288 172 333")}

    ${foldPath("M232 250 Q222 288 228 333")}

    ${foldPath("M191 252 Q185 301 190 365", 0.24)}

    ${foldPath("M209 252 Q215 301 210 365", 0.24)}
  `;

  const back = `
    ${editableRegionPath(
      "dress",
      artwork,
      "backBodice",
      c.backBodice,
      "M156 70 L141 88 L145 196 Q170 208 200 208 Q230 208 255 196 L259 88 L244 70 C232 88 218 98 200 98 C182 98 168 88 156 70 Z",
    )}

    ${editableRegionPath(
      "dress",
      artwork,
      "backLeftSleeve",
      c.backLeftSleeve,
      "M156 70 L119 86 L91 139 L126 164 L145 126 L141 88 Z",
    )}

    ${editableRegionPath(
      "dress",
      artwork,
      "backRightSleeve",
      c.backRightSleeve,
      "M244 70 L281 86 L309 139 L274 164 L255 126 L259 88 Z",
    )}

    ${editableRegionPath(
      "dress",
      artwork,
      "backSkirt",
      c.backSkirt,
      "M139 219 Q200 231 261 219 L320 438 Q200 458 80 438 Z",
    )}

    ${editableRegionPath(
      "dress",
      artwork,
      "backWaistband",
      c.backWaistband,
      "M140 195 Q200 208 260 195 L262 224 Q200 239 138 224 Z",
      {
        strokeWidth: 3,
      },
    )}

    ${editableRegionPath(
      "dress",
      artwork,
      "backNeckline",
      c.backNeckline,
      "M156 70 C168 90 182 100 200 100 C218 100 232 90 244 70 C232 85 218 92 200 92 C182 92 168 85 156 70 Z",
      {
        strokeWidth: 2.7,
      },
    )}

    ${detailLine(200, 100, 200, 196, {
      strokeWidth: 2,

      opacity: 0.8,
    })}

    ${detailPath("M166 124 L184 194", {
      strokeWidth: 1.5,

      opacity: 0.55,
    })}

    ${detailPath("M234 124 L216 194", {
      strokeWidth: 1.5,

      opacity: 0.55,
    })}

    ${detailPath("M156 240 L136 417", {
      strokeWidth: 1.5,

      opacity: 0.6,
    })}

    ${detailPath("M244 240 L264 417", {
      strokeWidth: 1.5,

      opacity: 0.6,
    })}

    ${detailPath("M88 415 Q200 434 312 415", {
      strokeWidth: 1.7,
    })}

    ${foldPath("M168 250 Q178 288 172 333")}

    ${foldPath("M232 250 Q222 288 228 333")}
  `;

  return createDualViewSvg({
    front,
    back,
    label: "Dress",
  });
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
Template Definitions
=========================================================*/

export const CLOTHING_TEMPLATES = Object.freeze([
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

    label: "Dress",

    description:
      "Realistic front and back fit-and-flare dress with bodice shaping, waistband, skirt panels and back zipper detail.",

    fileName: "dress-template.svg",

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
]);

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
