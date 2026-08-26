import React, { useId, useMemo, useState } from "react";

import {
  Eye,
  GitFork,
  Image as ImageIcon,
  Layers3,
  Monitor,
  Shirt,
  Sparkles,
} from "lucide-react";

/* =========================================================
   DesignByYou
   Fashion Persona Avatar
   Shared Creator + Designer Avatar Renderer
   Version 2.0

   Goals:
   - Keep every Version 1 configuration key working.
   - Add richer, more human facial structure and shading.
   - Remain fully local / SVG-based with no third-party API.
   - Stay lightweight enough for profile, booking, and studio use.
   ========================================================= */

/* =========================================================
   Default Avatar Configuration
   ========================================================= */

export const DEFAULT_FASHION_PERSONA_CONFIG = Object.freeze({
  avatarStyle: "fashion-persona",

  skinTone: "medium-2",

  faceShape: "oval",

  /*
   * New Version 2 face fields are optional.
   * Existing saved avatars that do not contain them continue
   * to render with these defaults.
   */
  facePreset: "classic",
  jawShape: "soft",
  cheekShape: "balanced",
  noseStyle: "natural",
  lipStyle: "natural",
  lipColor: "#8f3f51",

  eyeStyle: "soft",
  eyeColor: "#3b2417",

  eyebrowStyle: "natural",

  hairStyle: "wavy-short",
  hairColor: "#17120f",

  facialHair: "none",

  glasses: "none",

  bodyType: "regular",

  expression: "friendly",

  topTemplate: "hoodie",
  topColor: "#6d28d9",

  bottomTemplate: "trousers",
  bottomColor: "#111827",

  shoes: "sneakers-white",

  accessory: "none",

  animation: "gentle-float",

  showDesignAura: true,
  showFeaturedCard: true,

  auraStyle: "soft-glow",
  auraPrimaryColor: "#8b5cf6",
  auraSecondaryColor: "#06b6d4",
});

/* =========================================================
   Avatar Option Definitions
   ========================================================= */

export const FASHION_PERSONA_SKIN_TONES = [
  {
    value: "light-1",
    color: "#F6D3BE",
  },
  {
    value: "light-2",
    color: "#E8B99D",
  },
  {
    value: "medium-1",
    color: "#CC8F66",
  },
  {
    value: "medium-2",
    color: "#B97855",
  },
  {
    value: "deep-1",
    color: "#875137",
  },
  {
    value: "deep-2",
    color: "#5B3424",
  },
];

/* =========================================================
   Generic Helpers
   ========================================================= */

function cleanText(value, fallback = "") {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  const normalized = cleanText(value).toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function normalizeColor(value, fallback) {
  const color = cleanText(value);

  if (/^#[0-9a-f]{3,8}$/i.test(color)) {
    return color;
  }

  return fallback;
}

function hexToRgb(value) {
  const normalized = cleanText(value).replace(/^#/, "").trim();

  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : normalized.slice(0, 6);

  if (!/^[0-9a-f]{6}$/i.test(expanded)) {
    return null;
  }

  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const channel = (value) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");

  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function mixColor(color, target, amount = 0.2) {
  const from = hexToRgb(color);
  const to = hexToRgb(target);

  if (!from || !to) {
    return color;
  }

  const strength = Math.max(0, Math.min(1, Number(amount) || 0));

  return rgbToHex({
    r: from.r + (to.r - from.r) * strength,
    g: from.g + (to.g - from.g) * strength,
    b: from.b + (to.b - from.b) * strength,
  });
}

function getSkinColor(skinTone) {
  return (
    FASHION_PERSONA_SKIN_TONES.find((tone) => tone.value === skinTone)?.color ||
    "#B97855"
  );
}

/* =========================================================
   Featured Design Normalization
   ========================================================= */

function normalizeFeaturedDesign(featuredDesign) {
  if (!featuredDesign || typeof featuredDesign !== "object") {
    return null;
  }

  const image = cleanText(
    featuredDesign.image ||
      featuredDesign.watermarked_preview_url ||
      featuredDesign.preview_url ||
      featuredDesign.reference_image_url ||
      featuredDesign.image_url,
  );

  return {
    id: cleanText(featuredDesign.id || featuredDesign.design_id),

    title: cleanText(featuredDesign.title, "Featured Design"),

    description: cleanText(featuredDesign.description),

    image,

    slug: cleanText(featuredDesign.slug),

    sourceType: cleanText(
      featuredDesign.sourceType || featuredDesign.source_type,
      "upload",
    ).toLowerCase(),

    editorProjectId: cleanText(
      featuredDesign.editorProjectId || featuredDesign.editor_project_id,
    ),

    isEditable: toBoolean(
      featuredDesign.isEditable ?? featuredDesign.is_editable,
      false,
    ),

    allowRemix: toBoolean(
      featuredDesign.allowRemix ?? featuredDesign.allow_remix,
      false,
    ),

    originalDesignId: cleanText(
      featuredDesign.originalDesignId || featuredDesign.original_design_id,
    ),

    isRemix: Boolean(
      featuredDesign.isRemix ||
      featuredDesign.is_remix ||
      featuredDesign.originalDesignId ||
      featuredDesign.original_design_id,
    ),
  };
}

/* =========================================================
   Human Face Geometry
   ========================================================= */

function getFaceGeometry(config) {
  const shape = cleanText(config.faceShape, "oval");

  const presets = {
    round: {
      temple: 45,
      cheek: 49,
      jaw: 39,
      topY: 128,
      cheekY: 188,
      chinY: 244,
    },

    square: {
      temple: 44,
      cheek: 47,
      jaw: 43,
      topY: 128,
      cheekY: 186,
      chinY: 244,
    },

    heart: {
      temple: 46,
      cheek: 49,
      jaw: 32,
      topY: 127,
      cheekY: 184,
      chinY: 248,
    },

    long: {
      temple: 39,
      cheek: 42,
      jaw: 34,
      topY: 124,
      cheekY: 190,
      chinY: 253,
    },

    oval: {
      temple: 42,
      cheek: 45,
      jaw: 35,
      topY: 126,
      cheekY: 187,
      chinY: 248,
    },
  };

  const base = {
    ...(presets[shape] || presets.oval),
  };

  switch (cleanText(config.jawShape, "soft")) {
    case "defined":
      base.jaw += 2;
      base.chinY += 1;
      break;

    case "strong":
      base.jaw += 5;
      base.chinY -= 1;
      break;

    case "tapered":
      base.jaw -= 4;
      base.chinY += 3;
      break;

    default:
      break;
  }

  switch (cleanText(config.cheekShape, "balanced")) {
    case "full":
      base.cheek += 3;
      break;

    case "high":
      base.cheekY -= 5;
      base.cheek += 1;
      break;

    case "sculpted":
      base.cheek -= 2;
      base.cheekY -= 2;
      break;

    default:
      break;
  }

  const facePreset = cleanText(config.facePreset, "classic");

  if (facePreset === "soft") {
    base.cheek += 2;
    base.jaw -= 1;
  } else if (facePreset === "defined") {
    base.cheek -= 1;
    base.jaw += 2;
  } else if (facePreset === "angular") {
    base.temple += 1;
    base.cheek -= 2;
    base.jaw += 4;
  } else if (facePreset === "youthful") {
    base.cheek += 3;
    base.chinY -= 2;
  } else if (facePreset === "elegant") {
    base.temple -= 1;
    base.jaw -= 2;
    base.chinY += 2;
  }

  const leftTemple = 210 - base.temple;

  const rightTemple = 210 + base.temple;

  const leftCheek = 210 - base.cheek;

  const rightCheek = 210 + base.cheek;

  const leftJaw = 210 - base.jaw;

  const rightJaw = 210 + base.jaw;

  return {
    ...base,

    leftTemple,
    rightTemple,
    leftCheek,
    rightCheek,
    leftJaw,
    rightJaw,

    path: [
      `M 210 ${base.topY}`,
      `C ${leftTemple - 4} ${base.topY - 1}, ${leftCheek - 4} ${
        base.cheekY - 35
      }, ${leftCheek} ${base.cheekY}`,

      `C ${leftCheek + 1} ${base.cheekY + 27}, ${leftJaw - 4} ${
        base.chinY - 22
      }, 210 ${base.chinY}`,

      `C ${rightJaw + 4} ${base.chinY - 22}, ${rightCheek - 1} ${
        base.cheekY + 27
      }, ${rightCheek} ${base.cheekY}`,

      `C ${rightCheek + 4} ${base.cheekY - 35}, ${rightTemple + 4} ${
        base.topY - 1
      }, 210 ${base.topY}`,

      "Z",
    ].join(" "),
  };
}

function getEyeGeometry(eyeStyle) {
  switch (cleanText(eyeStyle, "soft")) {
    case "wide":
      return {
        rx: 10,
        ry: 6.8,
        upperLift: 4,
        outerOffset: 0,
      };

    case "sharp":
      return {
        rx: 9.5,
        ry: 5,
        upperLift: 2.5,
        outerOffset: -2,
      };

    case "relaxed":
      return {
        rx: 9,
        ry: 4.2,
        upperLift: 1.5,
        outerOffset: 1,
      };

    default:
      return {
        rx: 9.2,
        ry: 5.8,
        upperLift: 3,
        outerOffset: 0,
      };
  }
}

function getNosePaths(style) {
  switch (cleanText(style, "natural")) {
    case "button":
      return {
        bridge: "M208 183 Q207 194 210 199",

        tip: "M203 202 Q210 208 217 202",
      };

    case "defined":
      return {
        bridge: "M208 178 Q204 194 208 207",

        tip: "M201 207 Q210 213 220 206",
      };

    case "straight":
      return {
        bridge: "M209 178 L207 205",

        tip: "M202 206 Q210 211 218 206",
      };

    case "soft":
      return {
        bridge: "M209 181 Q207 194 210 203",

        tip: "M204 204 Q210 209 216 204",
      };

    default:
      return {
        bridge: "M209 180 Q205 195 210 204",

        tip: "M202 205 Q210 211 219 205",
      };
  }
}

function getLipGeometry(config) {
  const style = cleanText(config.lipStyle, "natural");

  const expression = cleanText(config.expression, "friendly");

  let width = 30;
  let upper = 3.8;
  let lower = 5.4;

  if (style === "full") {
    width = 31;
    upper = 5;
    lower = 7;
  } else if (style === "bow") {
    width = 29;
    upper = 5.4;
    lower = 5.8;
  } else if (style === "soft") {
    width = 28;
    upper = 3.4;
    lower = 4.8;
  }

  const left = 210 - width / 2;

  const right = 210 + width / 2;

  let centerY = 219;
  let smileLift = 0;

  if (expression === "smile") {
    centerY = 218;
    smileLift = 4;
  } else if (expression === "friendly") {
    smileLift = 2;
  } else if (expression === "confident") {
    smileLift = 1;
  }

  const upperCenter =
    style === "bow"
      ? `Q 203 ${centerY - upper - 2} 210 ${centerY - 1} Q 217 ${
          centerY - upper - 2
        } ${right} ${centerY + smileLift}`
      : `Q 210 ${centerY - upper} ${right} ${centerY + smileLift}`;

  return {
    path:
      `M ${left} ${centerY + smileLift} ${upperCenter} ` +
      `Q 210 ${centerY + lower + smileLift} ${left} ${centerY + smileLift} Z`,

    inner:
      expression === "neutral"
        ? `M ${left + 4} ${centerY + 1} L ${right - 4} ${centerY + 1}`
        : `M ${left + 4} ${centerY + 1} Q 210 ${centerY + 4 + smileLift} ${
            right - 4
          } ${centerY + 1}`,
  };
}

function getBodyScale(bodyType) {
  if (bodyType === "slim") {
    return 0.9;
  }

  if (bodyType === "broad") {
    return 1.1;
  }

  if (bodyType === "curvy") {
    return 1.06;
  }

  if (bodyType === "athletic") {
    return 1.045;
  }

  return 1;
}

function getPoseRotations(pose) {
  switch (pose) {
    case "hands-on-hips":
      return {
        left: -28,
        right: 28,
      };

    case "presenting-design":
      return {
        left: -40,
        right: -58,
      };

    case "walking":
      return {
        left: 14,
        right: -18,
      };

    case "confident":
      return {
        left: -8,
        right: 8,
      };

    default:
      return {
        left: 5,
        right: -5,
      };
  }
}

function getAnimationClass(animation) {
  switch (animation) {
    case "gentle-float":
      return "fpa-gentle-float";

    case "soft-breathe":
      return "fpa-soft-breathe";

    case "fashion-idle":
      return "fpa-fashion-idle";

    default:
      return "";
  }
}

function getBackgroundClass(backgroundTheme) {
  const themes = {
    studio: "from-slate-950 via-[#12121a] to-black",

    "digital-studio": "from-indigo-950 via-violet-950 to-black",

    runway: "from-neutral-900 via-zinc-800 to-black",

    atelier: "from-amber-950 via-stone-900 to-black",

    minimal: "from-slate-800 via-slate-900 to-black",

    neon: "from-fuchsia-950 via-indigo-950 to-black",

    luxury: "from-[#2b2104] via-[#111008] to-black",

    street: "from-slate-800 via-zinc-900 to-black",

    nature: "from-emerald-950 via-slate-950 to-black",

    transparent: "from-black/10 via-black/5 to-black/10",
  };

  return themes[backgroundTheme] || themes.studio;
}

function getShoeColor(shoes) {
  switch (shoes) {
    case "sneakers-white":
      return "#f8fafc";

    case "boots":
      return "#3f2c22";

    case "formal":
      return "#18181b";

    default:
      return "#111827";
  }
}

/* =========================================================
   Featured Design Card
   ========================================================= */

function FeaturedDesignCard({ design, onClick, interactive }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!design) {
    return null;
  }

  const content = (
    <div className="flex items-center gap-3">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5">
        {design.image && !imageFailed ? (
          <img
            src={design.image}
            alt={design.title}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon size={18} className="text-white/20" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[8px] font-black uppercase tracking-[0.14em] text-violet-300">
          Featured Design
        </p>

        <p className="mt-1 truncate text-xs font-bold text-white">
          {design.title}
        </p>

        <div className="mt-1 flex items-center gap-2">
          <span className="truncate text-[8px] font-bold uppercase tracking-[0.1em] text-white/30">
            {design.sourceType === "fashion_editor"
              ? design.isRemix
                ? "Editor Remix"
                : "Fashion Editor"
              : "Image Upload"}
          </span>

          {design.allowRemix && (
            <GitFork size={9} className="shrink-0 text-violet-300" />
          )}
        </div>
      </div>

      {interactive && (
        <Eye
          size={14}
          className="shrink-0 text-white/30 transition group-hover:text-white"
        />
      )}
    </div>
  );

  if (interactive && typeof onClick === "function") {
    return (
      <button
        type="button"
        onClick={() => onClick(design)}
        className="group w-full text-left"
      >
        {content}
      </button>
    );
  }

  return content;
}

/* =========================================================
   Hair Renderer
   ========================================================= */

function HairLayer({ style, fill, highlight, behind = false }) {
  if (style === "none") {
    return null;
  }

  if (behind) {
    if (style === "long") {
      return (
        <>
          <path
            d="M157 150 Q170 92 210 91 Q251 92 266 150 L279 284 Q249 300 236 258 L184 258 Q172 300 141 282 Z"
            fill={fill}
          />

          <path
            d="M171 145 Q184 103 205 101"
            fill="none"
            stroke={highlight}
            strokeWidth="7"
            strokeLinecap="round"
            opacity="0.34"
          />
        </>
      );
    }

    return null;
  }

  switch (style) {
    case "buzz":
      return (
        <>
          <path
            d="M169 164 Q171 121 210 118 Q249 121 251 164 Q233 144 210 145 Q188 143 169 164 Z"
            fill={fill}
          />

          <path
            d="M179 145 Q194 125 222 127"
            fill="none"
            stroke={highlight}
            strokeWidth="5"
            strokeLinecap="round"
            opacity="0.26"
          />
        </>
      );

    case "short":
      return (
        <>
          <path
            d="M165 165 Q164 119 198 107 Q229 101 250 122 Q258 138 253 160 Q238 144 221 147 Q201 134 183 148 Q174 149 165 165 Z"
            fill={fill}
          />

          <path
            d="M181 136 Q200 111 229 119"
            fill="none"
            stroke={highlight}
            strokeWidth="7"
            strokeLinecap="round"
            opacity="0.32"
          />
        </>
      );

    case "wavy-short":
      return (
        <>
          <path
            d="M163 166 Q160 134 179 116 Q192 101 207 110 Q220 96 236 108 Q257 119 258 144 Q260 156 252 165 Q240 145 225 149 Q211 136 194 149 Q178 142 163 166 Z"
            fill={fill}
          />

          <path
            d="M178 139 Q190 114 205 119 Q219 105 237 126"
            fill="none"
            stroke={highlight}
            strokeWidth="7"
            strokeLinecap="round"
            opacity="0.3"
          />
        </>
      );

    case "curly":
      return (
        <g fill={fill}>
          {[
            [169, 145, 20],
            [180, 124, 21],
            [202, 114, 23],
            [226, 117, 23],
            [247, 135, 21],
            [253, 158, 19],
            [160, 164, 18],
          ].map(([cx, cy, r], index) => (
            <g key={index}>
              <circle cx={cx} cy={cy} r={r} />

              <circle
                cx={cx - 5}
                cy={cy - 6}
                r={Math.max(5, r * 0.35)}
                fill={highlight}
                opacity="0.24"
              />
            </g>
          ))}
        </g>
      );

    case "bun":
      return (
        <>
          <circle cx="210" cy="99" r="31" fill={fill} />

          <circle cx="201" cy="91" r="11" fill={highlight} opacity="0.23" />

          <path
            d="M165 164 Q164 118 210 111 Q256 118 255 164 Q238 144 210 145 Q182 144 165 164 Z"
            fill={fill}
          />
        </>
      );

    case "long":
      return (
        <>
          <path
            d="M164 160 Q164 113 210 108 Q257 112 256 161 Q238 142 210 145 Q183 143 164 160 Z"
            fill={fill}
          />

          <path
            d="M179 140 Q193 116 221 116"
            fill="none"
            stroke={highlight}
            strokeWidth="7"
            strokeLinecap="round"
            opacity="0.28"
          />
        </>
      );

    default:
      return null;
  }
}

/* =========================================================
   Fashion Persona Avatar
   ========================================================= */

export default function FashionPersonaAvatar({
  config: incomingConfig = {},

  pose = "standing",

  backgroundTheme = "studio",

  displayMode = "showcase",

  featuredDesign = null,

  interactive = false,

  onFeaturedDesignClick,

  showModeBadge = true,

  showFeaturedCard = true,

  showBackground = true,

  compact = false,

  className = "",

  minHeight,

  avatarLabel = "Fashion Persona",

  ariaLabel = "Fashion Persona avatar",
}) {
  /* =======================================================
     Normalized State
     ======================================================= */

  const rawId = useId();

  const svgId = useMemo(() => rawId.replace(/[^a-zA-Z0-9_-]/g, ""), [rawId]);

  const ids = useMemo(
    () => ({
      skin: `fpaSkin-${svgId}`,

      skinShadow: `fpaSkinShadow-${svgId}`,

      hair: `fpaHair-${svgId}`,

      iris: `fpaIris-${svgId}`,

      leg: `fpaLeg-${svgId}`,

      top: `fpaTop-${svgId}`,

      topLight: `fpaTopLight-${svgId}`,

      shoe: `fpaShoe-${svgId}`,

      garment: `fpaGarment-${svgId}`,

      faceGlow: `fpaFaceGlow-${svgId}`,
    }),
    [svgId],
  );

  const config = useMemo(
    () => ({
      ...DEFAULT_FASHION_PERSONA_CONFIG,

      ...(incomingConfig && typeof incomingConfig === "object"
        ? incomingConfig
        : {}),
    }),
    [incomingConfig],
  );

  const design = useMemo(
    () => normalizeFeaturedDesign(featuredDesign),
    [featuredDesign],
  );

  const skin = getSkinColor(config.skinTone);

  const skinLight = mixColor(skin, "#ffffff", 0.2);

  const skinSoftLight = mixColor(skin, "#ffffff", 0.1);

  const skinShadow = mixColor(skin, "#4a2318", 0.2);

  const skinDeepShadow = mixColor(skin, "#2b160f", 0.26);

  const blush = mixColor(skin, "#d9787a", 0.42);

  const face = getFaceGeometry(config);

  const eye = getEyeGeometry(config.eyeStyle);

  const nose = getNosePaths(config.noseStyle);

  const lips = getLipGeometry(config);

  const bodyScale = getBodyScale(config.bodyType);

  const {
    left: leftArmRotation,

    right: rightArmRotation,
  } = getPoseRotations(pose);

  const animationClass = getAnimationClass(config.animation);

  const backgroundClass = getBackgroundClass(backgroundTheme);

  const seated = pose === "seated";

  const designImage = design?.image || "";

  const safeTopColor = normalizeColor(config.topColor, "#6d28d9");

  const safeBottomColor = normalizeColor(config.bottomColor, "#111827");

  const safeHairColor = normalizeColor(config.hairColor, "#17120f");

  const safeEyeColor = normalizeColor(config.eyeColor, "#3b2417");

  const safeLipColor = normalizeColor(config.lipColor, "#8f3f51");

  const hairHighlight = mixColor(safeHairColor, "#ffffff", 0.22);

  const hairShadow = mixColor(safeHairColor, "#000000", 0.25);

  const auraPrimary = normalizeColor(config.auraPrimaryColor, "#8b5cf6");

  const auraSecondary = normalizeColor(config.auraSecondaryColor, "#06b6d4");

  const shoeColor = getShoeColor(config.shoes);

  const shoeLight = mixColor(shoeColor, "#ffffff", 0.16);

  const useWearTexture = Boolean(displayMode === "wear" && designImage);

  const topFill = useWearTexture ? `url(#${ids.garment})` : `url(#${ids.top})`;

  const calculatedMinHeight = minHeight || (compact ? "280px" : "520px");

  const leftEyeX = 189;

  const rightEyeX = 231;

  const eyeY = 181;

  /* =======================================================
     Render
     ======================================================= */

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[2rem] ${
        showBackground
          ? `bg-gradient-to-br ${backgroundClass}`
          : "bg-transparent"
      } ${className}`}
      style={{
        minHeight: calculatedMinHeight,
      }}
    >
      {/* ===================================================
          Animation Styles
          =================================================== */}

      <style>
        {`
          @keyframes fpaGentleFloat {
            0%, 100% {
              transform: translateY(0px);
            }

            50% {
              transform: translateY(-8px);
            }
          }

          @keyframes fpaSoftBreathe {
            0%, 100% {
              transform: scale(1);
            }

            50% {
              transform: scale(1.012);
            }
          }

          @keyframes fpaFashionIdle {
            0%, 100% {
              transform:
                translateY(0)
                rotate(0deg);
            }

            35% {
              transform:
                translateY(-4px)
                rotate(-0.5deg);
            }

            70% {
              transform:
                translateY(-2px)
                rotate(0.5deg);
            }
          }

          @keyframes fpaAuraPulse {
            0%, 100% {
              opacity: 0.28;
              transform: scale(1);
            }

            50% {
              opacity: 0.46;
              transform: scale(1.06);
            }
          }

          .fpa-gentle-float {
            animation:
              fpaGentleFloat
              4s
              ease-in-out
              infinite;
          }

          .fpa-soft-breathe {
            animation:
              fpaSoftBreathe
              4.8s
              ease-in-out
              infinite;
          }

          .fpa-fashion-idle {
            animation:
              fpaFashionIdle
              5s
              ease-in-out
              infinite;
          }

          .fpa-aura-pulse {
            animation:
              fpaAuraPulse
              3.6s
              ease-in-out
              infinite;
          }

          @media (
            prefers-reduced-motion:
              reduce
          ) {
            .fpa-gentle-float,
            .fpa-soft-breathe,
            .fpa-fashion-idle,
            .fpa-aura-pulse {
              animation:
                none !important;
            }
          }
        `}
      </style>

      {/* ===================================================
          Background Effects
          =================================================== */}

      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-[42%] h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]"
          style={{
            background: config.showDesignAura ? auraPrimary : "#6366f1",

            opacity: config.showDesignAura ? 0.19 : 0.06,
          }}
        />

        {config.showDesignAura && (
          <div
            className={`fpa-aura-pulse absolute left-1/2 top-[44%] h-[360px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border ${
              config.auraStyle === "spotlight" ? "blur-xl" : "blur-2xl"
            }`}
            style={{
              borderColor: auraPrimary,

              boxShadow: `0 0 90px ${auraSecondary}`,
            }}
          />
        )}

        {config.auraStyle === "halo" && config.showDesignAura && (
          <div
            className="absolute left-1/2 top-[21%] h-20 w-44 -translate-x-1/2 rounded-[50%] border opacity-30 blur-[1px]"
            style={{
              borderColor: auraSecondary,

              boxShadow: `0 0 25px ${auraPrimary}`,
            }}
          />
        )}

        {backgroundTheme === "digital-studio" && (
          <>
            <div className="absolute left-8 top-16 h-px w-28 bg-violet-400/25" />

            <div className="absolute right-8 top-28 h-px w-20 bg-cyan-400/25" />

            <div className="absolute bottom-28 left-10 h-px w-16 bg-violet-400/20" />

            <div className="absolute bottom-16 right-12 h-px w-24 bg-cyan-400/15" />
          </>
        )}

        {backgroundTheme === "runway" && (
          <>
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/10" />

            <div className="absolute bottom-0 left-[25%] h-[45%] w-px origin-bottom -rotate-[18deg] bg-white/10" />

            <div className="absolute bottom-0 right-[25%] h-[45%] w-px origin-bottom rotate-[18deg] bg-white/10" />
          </>
        )}

        {backgroundTheme === "luxury" && (
          <div className="absolute inset-5 rounded-[1.5rem] border border-[#D4AF37]/10" />
        )}
      </div>

      {/* ===================================================
          Avatar Label
          =================================================== */}

      {avatarLabel && (
        <div className="absolute left-4 top-4 z-30 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[7px] font-black uppercase tracking-[0.15em] text-white/45 backdrop-blur-md">
          <Sparkles size={10} />

          {avatarLabel}
        </div>
      )}

      {/* ===================================================
          Display Mode Badge
          =================================================== */}

      {showModeBadge && (
        <div className="absolute right-4 top-4 z-30 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[7px] font-black uppercase tracking-[0.15em] text-white/60 backdrop-blur-md">
          {displayMode === "wear" ? <Shirt size={10} /> : <Monitor size={10} />}

          {displayMode === "wear" ? "Wear" : "Showcase"}
        </div>
      )}

      {/* ===================================================
          Avatar SVG
          =================================================== */}

      <div
        className={`relative z-10 flex h-full items-end justify-center ${animationClass}`}
        style={{
          minHeight: calculatedMinHeight,
        }}
      >
        <svg
          viewBox="0 0 420 620"
          preserveAspectRatio="xMidYMax meet"
          className={
            compact
              ? "h-[270px] w-full max-w-[260px]"
              : "h-[500px] w-full max-w-[420px]"
          }
          role="img"
          aria-label={ariaLabel}
        >
          {/* ===============================================
              Definitions
              =============================================== */}

          <defs>
            <linearGradient id={ids.skin} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={skinLight} />

              <stop offset="42%" stopColor={skin} />

              <stop offset="100%" stopColor={skinShadow} />
            </linearGradient>

            <linearGradient id={ids.skinShadow} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={skinSoftLight} />

              <stop offset="100%" stopColor={skinDeepShadow} />
            </linearGradient>

            <linearGradient id={ids.hair} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={hairHighlight} />

              <stop offset="35%" stopColor={safeHairColor} />

              <stop offset="100%" stopColor={hairShadow} />
            </linearGradient>

            <radialGradient id={ids.iris} cx="40%" cy="35%" r="70%">
              <stop
                offset="0%"
                stopColor={mixColor(safeEyeColor, "#ffffff", 0.42)}
              />

              <stop offset="55%" stopColor={safeEyeColor} />

              <stop
                offset="100%"
                stopColor={mixColor(safeEyeColor, "#000000", 0.5)}
              />
            </radialGradient>

            <linearGradient id={ids.leg} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={safeBottomColor} />

              <stop
                offset="100%"
                stopColor={mixColor(safeBottomColor, "#000000", 0.44)}
              />
            </linearGradient>

            <linearGradient id={ids.top} x1="0" y1="0" x2="1" y2="1">
              <stop
                offset="0%"
                stopColor={mixColor(safeTopColor, "#ffffff", 0.18)}
              />

              <stop offset="48%" stopColor={safeTopColor} />

              <stop
                offset="100%"
                stopColor={mixColor(safeTopColor, "#000000", 0.3)}
              />
            </linearGradient>

            <linearGradient id={ids.topLight} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />

              <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />

              <stop offset="100%" stopColor="#000000" stopOpacity="0.18" />
            </linearGradient>

            <linearGradient id={ids.shoe} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={shoeLight} />

              <stop offset="100%" stopColor={shoeColor} />
            </linearGradient>

            <radialGradient id={ids.faceGlow} cx="38%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />

              <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />

              <stop offset="100%" stopColor="#000000" stopOpacity="0.11" />
            </radialGradient>

            {designImage && (
              <pattern
                id={ids.garment}
                width="1"
                height="1"
                patternUnits="objectBoundingBox"
              >
                <image
                  href={designImage}
                  width="1"
                  height="1"
                  preserveAspectRatio="xMidYMid slice"
                />
              </pattern>
            )}
          </defs>

          {/* ===============================================
              Ground Shadow
              =============================================== */}

          <ellipse
            cx="210"
            cy="592"
            rx={seated ? 125 : 105}
            ry="16"
            fill="#000"
            opacity="0.35"
          />

          {/* ===============================================
              Legs and Bottom
              =============================================== */}

          <g transform={seated ? "translate(0 -30)" : ""}>
            {config.bottomTemplate === "skirt" ? (
              <>
                <path
                  d="M158 380 L262 380 L288 485 L132 485 Z"
                  fill={`url(#${ids.leg})`}
                />

                <path
                  d="M165 475 Q180 466 196 475 L195 563 Q180 571 165 563 Z"
                  fill={`url(#${ids.skin})`}
                />

                <path
                  d="M224 475 Q240 466 255 475 L255 563 Q240 571 225 563 Z"
                  fill={`url(#${ids.skin})`}
                />
              </>
            ) : config.bottomTemplate === "shorts" ? (
              <>
                <path
                  d="M153 382 L208 382 L201 455 L151 455 Z"
                  fill={`url(#${ids.leg})`}
                />

                <path
                  d="M212 382 L267 382 L269 455 L219 455 Z"
                  fill={`url(#${ids.leg})`}
                />

                <path
                  d="M163 448 Q179 442 195 448 L195 564 Q179 570 163 564 Z"
                  fill={`url(#${ids.skin})`}
                />

                <path
                  d="M228 448 Q244 442 260 448 L260 564 Q244 570 228 564 Z"
                  fill={`url(#${ids.skin})`}
                />
              </>
            ) : seated ? (
              <>
                <path
                  d="M157 381 L205 381 L184 475 L102 492 L95 458 L158 428 Z"
                  fill={`url(#${ids.leg})`}
                />

                <path
                  d="M213 381 L261 381 L265 445 L330 462 L321 496 L233 474 Z"
                  fill={`url(#${ids.leg})`}
                />
              </>
            ) : (
              <>
                <path
                  d="M160 378 L208 378 L202 554 L158 554 Z"
                  fill={`url(#${ids.leg})`}
                />

                <path
                  d="M212 378 L260 378 L264 554 L220 554 Z"
                  fill={`url(#${ids.leg})`}
                />

                {config.bottomTemplate === "wide-pants" && (
                  <>
                    <path
                      d="M149 390 L208 390 L196 558 L141 558 Z"
                      fill={`url(#${ids.leg})`}
                      opacity="0.98"
                    />

                    <path
                      d="M212 390 L271 390 L279 558 L224 558 Z"
                      fill={`url(#${ids.leg})`}
                      opacity="0.98"
                    />
                  </>
                )}
              </>
            )}

            {["skirt", "shorts"].includes(config.bottomTemplate) === false &&
              !seated && (
                <>
                  <path
                    d="M184 393 L181 543"
                    fill="none"
                    stroke="#ffffff"
                    strokeOpacity="0.08"
                    strokeWidth="2"
                  />

                  <path
                    d="M237 393 L241 543"
                    fill="none"
                    stroke="#ffffff"
                    strokeOpacity="0.08"
                    strokeWidth="2"
                  />
                </>
              )}

            {!seated && (
              <>
                <path
                  d="M148 548 Q178 540 207 551 L207 577 Q170 583 143 574 Z"
                  fill={`url(#${ids.shoe})`}
                />

                <path
                  d="M215 551 Q247 540 274 553 L281 575 Q247 583 216 576 Z"
                  fill={`url(#${ids.shoe})`}
                />

                {config.shoes?.startsWith("sneakers") && (
                  <>
                    <path
                      d="M151 560 Q177 554 202 561"
                      fill="none"
                      stroke="#94a3b8"
                      strokeOpacity="0.55"
                      strokeWidth="2"
                    />

                    <path
                      d="M221 561 Q246 555 271 562"
                      fill="none"
                      stroke="#94a3b8"
                      strokeOpacity="0.55"
                      strokeWidth="2"
                    />
                  </>
                )}
              </>
            )}
          </g>

          {/* ===============================================
              Long Hair Behind Head
              =============================================== */}

          <HairLayer
            style={config.hairStyle}
            fill={`url(#${ids.hair})`}
            highlight={hairHighlight}
            behind
          />

          {/* ===============================================
              Body
              =============================================== */}

          <g
            transform={`translate(${
              210 - 210 * bodyScale
            } 0) scale(${bodyScale} 1)`}
          >
            <g transform={`rotate(${leftArmRotation} 152 315)`}>
              <path
                d="M132 281 Q145 271 159 281 L163 392 Q157 418 145 431 Q131 418 128 394 Z"
                fill={
                  config.topTemplate === "tshirt" ||
                  config.topTemplate === "blouse"
                    ? `url(#${ids.skin})`
                    : topFill
                }
              />

              <ellipse
                cx="145"
                cy="425"
                rx="17"
                ry="20"
                fill={`url(#${ids.skin})`}
              />
            </g>

            <g transform={`rotate(${rightArmRotation} 268 315)`}>
              <path
                d="M261 281 Q275 271 288 281 L292 394 Q289 418 275 431 Q263 418 257 392 Z"
                fill={
                  config.topTemplate === "tshirt" ||
                  config.topTemplate === "blouse"
                    ? `url(#${ids.skin})`
                    : topFill
                }
              />

              <ellipse
                cx="275"
                cy="425"
                rx="17"
                ry="20"
                fill={`url(#${ids.skin})`}
              />
            </g>

            <path
              d="M149 282 Q210 244 271 282"
              fill="none"
              stroke="#000000"
              strokeOpacity="0.13"
              strokeWidth="9"
              strokeLinecap="round"
            />

            <path
              d={
                config.topTemplate === "hoodie"
                  ? "M145 271 Q210 238 275 271 L283 394 Q211 421 137 394 Z"
                  : config.topTemplate === "jacket"
                    ? "M142 270 Q210 240 278 270 L287 398 Q210 420 133 398 Z"
                    : config.topTemplate === "kurta"
                      ? "M146 267 Q210 241 274 267 L286 440 Q210 456 134 440 Z"
                      : config.topTemplate === "blouse"
                        ? "M154 269 Q210 246 266 269 L272 378 Q210 397 148 378 Z"
                        : "M150 269 Q210 245 270 269 L278 394 Q210 414 142 394 Z"
              }
              fill={topFill}
              stroke="#ffffff"
              strokeOpacity="0.1"
              strokeWidth="2"
            />

            <path
              d={
                config.topTemplate === "hoodie"
                  ? "M145 271 Q210 238 275 271 L283 394 Q211 421 137 394 Z"
                  : config.topTemplate === "jacket"
                    ? "M142 270 Q210 240 278 270 L287 398 Q210 420 133 398 Z"
                    : config.topTemplate === "kurta"
                      ? "M146 267 Q210 241 274 267 L286 440 Q210 456 134 440 Z"
                      : "M150 269 Q210 245 270 269 L278 394 Q210 414 142 394 Z"
              }
              fill={`url(#${ids.topLight})`}
              pointerEvents="none"
            />

            <path
              d="M174 302 Q168 344 173 385 M246 302 Q251 344 247 385"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.09"
              strokeWidth="2"
            />

            <path
              d="M190 303 Q210 313 230 303"
              fill="none"
              stroke="#000000"
              strokeOpacity="0.11"
              strokeWidth="2"
            />

            {config.topTemplate === "hoodie" && (
              <>
                <path
                  d="M168 267 Q210 225 252 267 Q235 282 210 284 Q185 282 168 267 Z"
                  fill={topFill}
                  stroke="#ffffff"
                  strokeOpacity="0.12"
                />

                <line
                  x1="195"
                  y1="270"
                  x2="190"
                  y2="311"
                  stroke="#ffffff"
                  strokeOpacity="0.5"
                  strokeWidth="2"
                />

                <line
                  x1="225"
                  y1="270"
                  x2="230"
                  y2="311"
                  stroke="#ffffff"
                  strokeOpacity="0.5"
                  strokeWidth="2"
                />
              </>
            )}

            {config.topTemplate === "jacket" && (
              <>
                <line
                  x1="210"
                  y1="263"
                  x2="210"
                  y2="398"
                  stroke="#ffffff"
                  strokeOpacity="0.35"
                  strokeWidth="3"
                />

                <path
                  d="M176 272 L204 303 L210 271 M244 272 L216 303 L210 271"
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity="0.24"
                  strokeWidth="2"
                />

                <circle cx="210" cy="314" r="3" fill="#ffffff" opacity="0.55" />

                <circle cx="210" cy="344" r="3" fill="#ffffff" opacity="0.55" />
              </>
            )}
          </g>

          {/* ===============================================
              Neck + Collarbone
              =============================================== */}

          <path
            d="M190 225 Q210 234 230 225 L229 277 Q210 287 191 277 Z"
            fill={`url(#${ids.skinShadow})`}
          />

          <path
            d="M174 270 Q192 257 210 266 Q228 257 246 270"
            fill="none"
            stroke={skinShadow}
            strokeOpacity="0.34"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* ===============================================
              Ears
              =============================================== */}

          <ellipse
            cx={face.leftCheek - 2}
            cy="190"
            rx="9"
            ry="15"
            fill={`url(#${ids.skin})`}
          />

          <ellipse
            cx={face.rightCheek + 2}
            cy="190"
            rx="9"
            ry="15"
            fill={`url(#${ids.skin})`}
          />

          <path
            d={`M ${face.leftCheek - 3} 183 Q ${face.leftCheek + 2} 190 ${
              face.leftCheek - 3
            } 199`}
            fill="none"
            stroke={skinShadow}
            strokeOpacity="0.34"
            strokeWidth="1.6"
          />

          <path
            d={`M ${face.rightCheek + 3} 183 Q ${face.rightCheek - 2} 190 ${
              face.rightCheek + 3
            } 199`}
            fill="none"
            stroke={skinShadow}
            strokeOpacity="0.34"
            strokeWidth="1.6"
          />

          {/* ===============================================
              Human Face
              =============================================== */}

          <path d={face.path} fill={`url(#${ids.skin})`} />

          <path
            d={face.path}
            fill={`url(#${ids.faceGlow})`}
            pointerEvents="none"
          />

          <path
            d={`M ${face.leftCheek + 5} 192 Q 181 202 183 214`}
            fill="none"
            stroke={skinShadow}
            strokeOpacity="0.16"
            strokeWidth="3"
            strokeLinecap="round"
          />

          <path
            d={`M ${face.rightCheek - 5} 192 Q 239 202 237 214`}
            fill="none"
            stroke={skinShadow}
            strokeOpacity="0.16"
            strokeWidth="3"
            strokeLinecap="round"
          />

          <ellipse
            cx="181"
            cy="204"
            rx="16"
            ry="8"
            fill={blush}
            opacity="0.1"
          />

          <ellipse
            cx="239"
            cy="204"
            rx="16"
            ry="8"
            fill={blush}
            opacity="0.1"
          />

          {/* ===============================================
              Hair
              =============================================== */}

          <HairLayer
            style={config.hairStyle}
            fill={`url(#${ids.hair})`}
            highlight={hairHighlight}
          />

          {config.hairStyle !== "none" && (
            <path
              d="M171 158 Q210 142 249 158"
              fill="none"
              stroke={hairShadow}
              strokeOpacity="0.2"
              strokeWidth="3"
              strokeLinecap="round"
            />
          )}

          {/* ===============================================
              Eyebrows
              =============================================== */}

          <path
            d={
              config.eyebrowStyle === "arched"
                ? "M177 166 Q189 157 201 166"
                : config.eyebrowStyle === "straight"
                  ? "M177 165 Q189 163 201 165"
                  : "M177 165 Q189 160 201 165"
            }
            fill="none"
            stroke={safeHairColor}
            strokeWidth={config.eyebrowStyle === "bold" ? 5 : 3.2}
            strokeLinecap="round"
          />

          <path
            d={
              config.eyebrowStyle === "arched"
                ? "M219 166 Q231 157 243 166"
                : config.eyebrowStyle === "straight"
                  ? "M219 165 Q231 163 243 165"
                  : "M219 165 Q231 160 243 165"
            }
            fill="none"
            stroke={safeHairColor}
            strokeWidth={config.eyebrowStyle === "bold" ? 5 : 3.2}
            strokeLinecap="round"
          />

          {/* ===============================================
              Eyes
              =============================================== */}

          <g>
            <ellipse
              cx={leftEyeX}
              cy={eyeY}
              rx={eye.rx}
              ry={eye.ry}
              fill="#fffdfb"
              opacity="0.96"
            />

            <ellipse
              cx={rightEyeX}
              cy={eyeY}
              rx={eye.rx}
              ry={eye.ry}
              fill="#fffdfb"
              opacity="0.96"
            />

            <circle
              cx={leftEyeX}
              cy={eyeY + 0.3}
              r="5.3"
              fill={`url(#${ids.iris})`}
            />

            <circle
              cx={rightEyeX}
              cy={eyeY + 0.3}
              r="5.3"
              fill={`url(#${ids.iris})`}
            />

            <circle cx={leftEyeX} cy={eyeY + 0.5} r="2.4" fill="#090909" />

            <circle cx={rightEyeX} cy={eyeY + 0.5} r="2.4" fill="#090909" />

            <circle
              cx={leftEyeX - 1.6}
              cy={eyeY - 1.6}
              r="1.35"
              fill="#ffffff"
            />

            <circle
              cx={rightEyeX - 1.6}
              cy={eyeY - 1.6}
              r="1.35"
              fill="#ffffff"
            />

            <path
              d={`M ${leftEyeX - eye.rx - 1} ${eyeY + eye.outerOffset} Q ${
                leftEyeX
              } ${eyeY - eye.upperLift - eye.ry} ${
                leftEyeX + eye.rx + 1
              } ${eyeY}`}
              fill="none"
              stroke={skinDeepShadow}
              strokeOpacity="0.72"
              strokeWidth="1.8"
              strokeLinecap="round"
            />

            <path
              d={`M ${rightEyeX - eye.rx - 1} ${eyeY} Q ${rightEyeX} ${
                eyeY - eye.upperLift - eye.ry
              } ${rightEyeX + eye.rx + 1} ${eyeY + eye.outerOffset}`}
              fill="none"
              stroke={skinDeepShadow}
              strokeOpacity="0.72"
              strokeWidth="1.8"
              strokeLinecap="round"
            />

            <path
              d={`M ${leftEyeX - eye.rx + 2} ${eyeY + 2} Q ${leftEyeX} ${
                eyeY + eye.ry + 3
              } ${leftEyeX + eye.rx - 2} ${eyeY + 2}`}
              fill="none"
              stroke={skinShadow}
              strokeOpacity="0.28"
              strokeWidth="1"
            />

            <path
              d={`M ${rightEyeX - eye.rx + 2} ${eyeY + 2} Q ${rightEyeX} ${
                eyeY + eye.ry + 3
              } ${rightEyeX + eye.rx - 2} ${eyeY + 2}`}
              fill="none"
              stroke={skinShadow}
              strokeOpacity="0.28"
              strokeWidth="1"
            />

            {config.eyeStyle !== "relaxed" && (
              <>
                <path
                  d={`M ${leftEyeX - eye.rx} ${eyeY} l -4 -2 M ${
                    leftEyeX + eye.rx
                  } ${eyeY} l 4 -2`}
                  stroke={safeHairColor}
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  opacity="0.52"
                />

                <path
                  d={`M ${rightEyeX - eye.rx} ${eyeY} l -4 -2 M ${
                    rightEyeX + eye.rx
                  } ${eyeY} l 4 -2`}
                  stroke={safeHairColor}
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  opacity="0.52"
                />
              </>
            )}
          </g>

          {/* ===============================================
              Glasses
              =============================================== */}

          {config.glasses !== "none" && (
            <g
              fill={
                config.glasses === "sunglasses" ? "rgba(10,10,10,0.82)" : "none"
              }
              stroke={config.glasses === "gold-frame" ? "#d4af37" : "#111827"}
              strokeWidth="2.5"
            >
              {config.glasses === "round-black" ? (
                <>
                  <circle cx="188" cy="181" r="15" />

                  <circle cx="232" cy="181" r="15" />
                </>
              ) : (
                <>
                  <rect x="173" y="168" width="30" height="25" rx="6" />

                  <rect x="217" y="168" width="30" height="25" rx="6" />
                </>
              )}

              <line x1="203" y1="180" x2="217" y2="180" />

              <path d="M173 177 L164 174 M247 177 L256 174" />
            </g>
          )}

          {/* ===============================================
              Nose
              =============================================== */}

          <path
            d={nose.bridge}
            fill="none"
            stroke={skinDeepShadow}
            strokeOpacity="0.37"
            strokeWidth="1.7"
            strokeLinecap="round"
          />

          <path
            d={nose.tip}
            fill="none"
            stroke={skinDeepShadow}
            strokeOpacity="0.48"
            strokeWidth="1.6"
            strokeLinecap="round"
          />

          <ellipse
            cx="204.5"
            cy="205"
            rx="2"
            ry="1.2"
            fill={skinDeepShadow}
            opacity="0.22"
          />

          <ellipse
            cx="215.5"
            cy="205"
            rx="2"
            ry="1.2"
            fill={skinDeepShadow}
            opacity="0.22"
          />

          <path
            d="M208 209 Q210 213 212 209"
            fill="none"
            stroke={skinDeepShadow}
            strokeOpacity="0.18"
            strokeWidth="1.2"
          />

          {/* ===============================================
              Lips / Expression
              =============================================== */}

          <path
            d={lips.path}
            fill={safeLipColor}
            opacity={config.expression === "neutral" ? 0.88 : 0.95}
          />

          <path
            d={lips.inner}
            fill="none"
            stroke={mixColor(safeLipColor, "#000000", 0.46)}
            strokeOpacity="0.78"
            strokeWidth="1.2"
            strokeLinecap="round"
          />

          <path
            d="M201 218 Q210 214 219 218"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.14"
            strokeWidth="1"
            strokeLinecap="round"
          />

          {/* ===============================================
              Facial Hair
              =============================================== */}

          {config.facialHair === "mustache" && (
            <path
              d="M194 208 Q202 202 210 208 Q218 202 226 208 Q218 214 210 211 Q202 214 194 208 Z"
              fill={`url(#${ids.hair})`}
            />
          )}

          {config.facialHair === "short-beard" && (
            <path
              d="M174 203 Q178 237 210 250 Q242 237 246 203 Q238 242 210 245 Q182 242 174 203 Z"
              fill={`url(#${ids.hair})`}
              opacity="0.74"
            />
          )}

          {config.facialHair === "stubble" && (
            <>
              <path
                d="M178 204 Q181 237 210 245 Q239 236 242 204"
                fill="none"
                stroke={safeHairColor}
                strokeWidth="5"
                opacity="0.18"
              />

              {[
                [188, 218],
                [197, 229],
                [210, 234],
                [223, 229],
                [232, 218],
              ].map(([x, y]) => (
                <circle
                  key={`${x}-${y}`}
                  cx={x}
                  cy={y}
                  r="1.1"
                  fill={safeHairColor}
                  opacity="0.32"
                />
              ))}
            </>
          )}

          {/* ===============================================
              Sketchbook
              =============================================== */}

          {(config.accessory === "sketchbook" ||
            pose === "holding-sketchbook") && (
            <g transform="translate(240 365) rotate(-8)">
              <rect
                x="0"
                y="0"
                width="80"
                height="104"
                rx="8"
                fill="#f5f5f4"
                stroke="#d4af37"
                strokeWidth="3"
              />

              {designImage ? (
                <image
                  href={designImage}
                  x="8"
                  y="10"
                  width="64"
                  height="78"
                  preserveAspectRatio="xMidYMid slice"
                />
              ) : (
                <path
                  d="M18 29 Q39 18 60 30 M19 48 Q40 38 62 50 M18 68 Q40 58 58 73"
                  fill="none"
                  stroke="#6d28d9"
                  strokeWidth="3"
                  opacity="0.75"
                />
              )}

              <rect
                x="8"
                y="92"
                width="34"
                height="3"
                rx="1.5"
                fill="#94a3b8"
              />
            </g>
          )}

          {/* ===============================================
              Tablet
              =============================================== */}

          {(config.accessory === "tablet" ||
            pose === "holding-tablet" ||
            pose === "presenting-design") && (
            <g
              transform={
                pose === "presenting-design"
                  ? "translate(258 338) rotate(-5)"
                  : "translate(240 370) rotate(-7)"
              }
            >
              <rect
                x="0"
                y="0"
                width="86"
                height="110"
                rx="9"
                fill="#111827"
                stroke="#64748b"
                strokeWidth="3"
              />

              <rect
                x="7"
                y="8"
                width="72"
                height="90"
                rx="5"
                fill={designImage ? "#111827" : "#312e81"}
              />

              {designImage && (
                <image
                  href={designImage}
                  x="7"
                  y="8"
                  width="72"
                  height="90"
                  preserveAspectRatio="xMidYMid slice"
                />
              )}

              <circle cx="43" cy="103" r="2" fill="#64748b" />
            </g>
          )}

          {/* ===============================================
              Fashion Tote
              =============================================== */}

          {config.accessory === "tote" && (
            <g transform="translate(278 397)">
              <path
                d="M0 18 Q22 -11 44 18"
                fill="none"
                stroke="#d4af37"
                strokeWidth="4"
              />

              <rect
                x="-2"
                y="15"
                width="50"
                height="62"
                rx="6"
                fill="#d4af37"
              />

              <text
                x="23"
                y="51"
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill="#111"
              >
                DBY
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* ===================================================
          Featured Design Presentation Card
          =================================================== */}

      {displayMode === "showcase" &&
        showFeaturedCard &&
        config.showFeaturedCard &&
        design && (
          <div
            className={`absolute z-20 rounded-2xl border border-white/15 bg-black/45 shadow-2xl backdrop-blur-xl ${
              compact
                ? "bottom-3 left-3 right-3 p-2.5"
                : "bottom-5 left-5 right-5 p-3 sm:left-auto sm:right-5 sm:w-60"
            }`}
          >
            <FeaturedDesignCard
              design={design}
              interactive={interactive}
              onClick={onFeaturedDesignClick}
            />
          </div>
        )}

      {/* ===================================================
          Wear Mode Indicator
          =================================================== */}

      {displayMode === "wear" && design && (
        <div
          className={`absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-violet-300/20 bg-black/45 text-center font-black uppercase tracking-[0.13em] text-violet-100 backdrop-blur-md ${
            compact ? "px-2.5 py-1 text-[6px]" : "px-3 py-1.5 text-[7px]"
          }`}
        >
          Wearing {design.title}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Compact Avatar Wrapper
   ========================================================= */

export function FashionPersonaAvatarCompact({
  config,
  pose,
  backgroundTheme,
  displayMode,
  featuredDesign,
  className = "",
}) {
  return (
    <FashionPersonaAvatar
      config={config}
      pose={pose}
      backgroundTheme={backgroundTheme}
      displayMode={displayMode}
      featuredDesign={featuredDesign}
      compact
      showModeBadge={false}
      showFeaturedCard={false}
      avatarLabel=""
      minHeight="260px"
      className={className}
    />
  );
}

/* =========================================================
   Avatar Circle Wrapper
   ========================================================= */

export function FashionPersonaAvatarCircle({
  config,
  pose = "standing",
  backgroundTheme = "studio",
  displayMode = "showcase",
  featuredDesign = null,
  size = 72,
  className = "",
  ariaLabel = "Fashion Persona avatar",
}) {
  /*
   * The main compact renderer uses a fixed portrait canvas:
   *
   * SVG viewport:
   *     420 × 620
   *
   * Compact rendered SVG:
   *     ~260 × 270
   *
   * The previous implementation resized the outer wrapper
   * relative to `size`, while the compact SVG itself stayed
   * 270px tall.
   *
   * At navbar sizes such as 36px, the face therefore ended
   * up outside the visible circular crop.
   *
   * This wrapper instead renders the avatar against one
   * stable source canvas and crops a dedicated portrait
   * region from that canvas.
   */

  const safeSize = Math.max(
    24,
    Number(size) || 72,
  );

  /*
   * Smaller profile pictures receive a tighter face crop.
   *
   * Larger identity surfaces show slightly more neck /
   * shoulders.
   */

  const portraitWindow =
    safeSize <= 40
      ? {
          x: 82,
          y: 38,
          size: 96,
        }
      : safeSize <= 64
        ? {
            x: 78,
            y: 34,
            size: 104,
          }
        : safeSize <= 88
          ? {
              x: 75,
              y: 31,
              size: 110,
            }
          : {
              x: 72,
              y: 28,
              size: 116,
            };

  const portraitScale =
    safeSize /
    portraitWindow.size;

  /*
   * Profile identities should remain visually stable.
   *
   * Disable full-body idle movement inside the cropped
   * portrait because even a small vertical movement is
   * noticeable in a 36px navbar circle.
   *
   * Everything else in the saved Persona configuration
   * remains unchanged.
   */

  const portraitConfig = {
    ...(config &&
    typeof config === "object"
      ? config
      : {}),

    animation: "none",

    showDesignAura: false,

    showFeaturedCard: false,
  };

  return (
    <div
      className={`
        relative
        shrink-0
        overflow-hidden
        rounded-full
        border
        border-white/10
        bg-slate-950
        ${className}
      `}
      style={{
        width: safeSize,
        height: safeSize,
      }}
      role="img"
      aria-label={ariaLabel}
    >
      {/*
       * Stable source canvas.
       *
       * Do NOT derive this canvas from the target navbar
       * size. The crop coordinates above are based on this
       * fixed rendering surface.
       */}

      <div
        className="
          pointer-events-none
          absolute
        "
        style={{
          width: 260,
          height: 280,

          left:
            -portraitWindow.x *
            portraitScale,

          top:
            -portraitWindow.y *
            portraitScale,

          transform: `scale(${portraitScale})`,

          transformOrigin:
            "top left",
        }}
      >
        <FashionPersonaAvatar
          config={portraitConfig}
          pose={pose}
          backgroundTheme={
            backgroundTheme
          }
          displayMode={
            displayMode
          }
          featuredDesign={
            featuredDesign
          }
          compact
          avatarLabel=""
          showModeBadge={false}
          showFeaturedCard={false}
          minHeight="280px"
          className="
            rounded-none
          "
          ariaLabel={
            ariaLabel
          }
        />
      </div>
    </div>
  );
}

/* =========================================================
   Design Type Badge Helper
   ========================================================= */

export function FashionPersonaDesignBadge({ featuredDesign }) {
  const design = normalizeFeaturedDesign(featuredDesign);

  if (!design) {
    return null;
  }

  const isEditor = design.sourceType === "fashion_editor";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.12em] ${
        isEditor
          ? "border-violet-300/20 bg-violet-500/10 text-violet-300"
          : "border-slate-300/20 bg-slate-500/10 text-slate-300"
      }`}
    >
      {isEditor ? (
        design.isRemix ? (
          <GitFork size={9} />
        ) : (
          <Layers3 size={9} />
        )
      ) : (
        <ImageIcon size={9} />
      )}

      {isEditor
        ? design.isRemix
          ? "Editor Remix"
          : "Fashion Editor"
        : "Image Upload"}
    </span>
  );
}
