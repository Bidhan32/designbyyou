import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowRight,
  Brush,
  Check,
  Eye,
  GitFork,
  Globe,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Lock,
  Monitor,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Scissors,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  User,
  X,
} from "lucide-react";

import API from "../../api/axios";
import { useAuth } from "../../context/AuthContext";

import FashionPersonaAvatar, {
  DEFAULT_FASHION_PERSONA_CONFIG,
} from "./FashionPersonaAvatar";

/* =========================================================
   DesignByYou
   Shared Avatar Studio

   Creator + Designer
   Version 2.2

   IMPORTANT:
   This component handles:
   - avatar editing
   - API persistence
   - featured design selection
   - visibility
   - presentation settings

   FashionPersonaAvatar.jsx handles ALL avatar rendering.

   Version 2.2:
   - preserves all existing Avatar Studio functionality
   - adds complete light / dark theme support
   - integrates with the global DesignerLayout theme
   ========================================================= */

/* =========================================================
   Defaults
   ========================================================= */

const DEFAULT_CONFIG = Object.freeze({
  ...DEFAULT_FASHION_PERSONA_CONFIG,

  useAsProfilePicture: false,
});

/* =========================================================
   Avatar Configuration Options
   ========================================================= */

const SKIN_TONES = [
  {
    value: "light-1",
    label: "Porcelain",
    color: "#F6D3BE",
  },
  {
    value: "light-2",
    label: "Warm Light",
    color: "#E8B99D",
  },
  {
    value: "medium-1",
    label: "Golden",
    color: "#CC8F66",
  },
  {
    value: "medium-2",
    label: "Warm Medium",
    color: "#B97855",
  },
  {
    value: "deep-1",
    label: "Deep",
    color: "#875137",
  },
  {
    value: "deep-2",
    label: "Rich Deep",
    color: "#5B3424",
  },
];

const FACE_SHAPES = [
  {
    value: "oval",
    label: "Oval",
  },
  {
    value: "round",
    label: "Round",
  },
  {
    value: "square",
    label: "Square",
  },
  {
    value: "heart",
    label: "Heart",
  },
  {
    value: "long",
    label: "Long",
  },
];

const FACE_PRESETS = [
  {
    value: "classic",
    label: "Classic",
  },
  {
    value: "soft",
    label: "Soft",
  },
  {
    value: "defined",
    label: "Defined",
  },
  {
    value: "angular",
    label: "Angular",
  },
  {
    value: "youthful",
    label: "Youthful",
  },
  {
    value: "elegant",
    label: "Elegant",
  },
];

const JAW_SHAPES = [
  {
    value: "soft",
    label: "Soft",
  },
  {
    value: "defined",
    label: "Defined",
  },
  {
    value: "strong",
    label: "Strong",
  },
  {
    value: "tapered",
    label: "Tapered",
  },
];

const CHEEK_SHAPES = [
  {
    value: "balanced",
    label: "Balanced",
  },
  {
    value: "full",
    label: "Full",
  },
  {
    value: "high",
    label: "High",
  },
  {
    value: "sculpted",
    label: "Sculpted",
  },
];

const NOSE_STYLES = [
  {
    value: "natural",
    label: "Natural",
  },
  {
    value: "soft",
    label: "Soft",
  },
  {
    value: "straight",
    label: "Straight",
  },
  {
    value: "defined",
    label: "Defined",
  },
  {
    value: "button",
    label: "Button",
  },
];

const LIP_STYLES = [
  {
    value: "natural",
    label: "Natural",
  },
  {
    value: "soft",
    label: "Soft",
  },
  {
    value: "full",
    label: "Full",
  },
  {
    value: "bow",
    label: "Cupid Bow",
  },
];

const EYE_STYLES = [
  {
    value: "soft",
    label: "Soft",
  },
  {
    value: "wide",
    label: "Wide",
  },
  {
    value: "sharp",
    label: "Sharp",
  },
  {
    value: "relaxed",
    label: "Relaxed",
  },
];

const EYEBROW_STYLES = [
  {
    value: "natural",
    label: "Natural",
  },
  {
    value: "straight",
    label: "Straight",
  },
  {
    value: "arched",
    label: "Arched",
  },
  {
    value: "bold",
    label: "Bold",
  },
];

const EXPRESSIONS = [
  {
    value: "friendly",
    label: "Friendly",
  },
  {
    value: "confident",
    label: "Confident",
  },
  {
    value: "neutral",
    label: "Neutral",
  },
  {
    value: "smile",
    label: "Smile",
  },
];

const HAIR_STYLES = [
  {
    value: "none",
    label: "No Hair",
  },
  {
    value: "buzz",
    label: "Buzz",
  },
  {
    value: "short",
    label: "Short",
  },
  {
    value: "wavy-short",
    label: "Wavy",
  },
  {
    value: "curly",
    label: "Curly",
  },
  {
    value: "long",
    label: "Long",
  },
  {
    value: "bun",
    label: "Bun",
  },
];

const FACIAL_HAIR = [
  {
    value: "none",
    label: "None",
  },
  {
    value: "stubble",
    label: "Stubble",
  },
  {
    value: "mustache",
    label: "Mustache",
  },
  {
    value: "short-beard",
    label: "Short Beard",
  },
];

const GLASSES = [
  {
    value: "none",
    label: "None",
  },
  {
    value: "round-black",
    label: "Round",
  },
  {
    value: "square-black",
    label: "Square",
  },
  {
    value: "gold-frame",
    label: "Gold Frame",
  },
  {
    value: "sunglasses",
    label: "Sunglasses",
  },
];

const BODY_TYPES = [
  {
    value: "slim",
    label: "Slim",
  },
  {
    value: "regular",
    label: "Regular",
  },
  {
    value: "athletic",
    label: "Athletic",
  },
  {
    value: "broad",
    label: "Broad",
  },
  {
    value: "curvy",
    label: "Curvy",
  },
];

const TOP_TEMPLATES = [
  {
    value: "tshirt",
    label: "T-Shirt",
  },
  {
    value: "hoodie",
    label: "Hoodie",
  },
  {
    value: "shirt",
    label: "Shirt",
  },
  {
    value: "jacket",
    label: "Jacket",
  },
  {
    value: "kurta",
    label: "Kurta",
  },
  {
    value: "blouse",
    label: "Blouse",
  },
];

const BOTTOM_TEMPLATES = [
  {
    value: "trousers",
    label: "Trousers",
  },
  {
    value: "jeans",
    label: "Jeans",
  },
  {
    value: "wide-pants",
    label: "Wide Pants",
  },
  {
    value: "skirt",
    label: "Skirt",
  },
  {
    value: "shorts",
    label: "Shorts",
  },
];

const SHOES = [
  {
    value: "sneakers-white",
    label: "White Sneakers",
  },
  {
    value: "sneakers-black",
    label: "Black Sneakers",
  },
  {
    value: "boots",
    label: "Boots",
  },
  {
    value: "formal",
    label: "Formal",
  },
];

const ACCESSORIES = [
  {
    value: "none",
    label: "None",
  },
  {
    value: "sketchbook",
    label: "Sketchbook",
  },
  {
    value: "tablet",
    label: "Tablet",
  },
  {
    value: "tote",
    label: "Fashion Tote",
  },
];

const POSES = [
  {
    value: "standing",
    label: "Standing",
  },
  {
    value: "confident",
    label: "Confident",
  },
  {
    value: "hands-on-hips",
    label: "Hands on Hips",
  },
  {
    value: "holding-sketchbook",
    label: "Sketchbook",
  },
  {
    value: "holding-tablet",
    label: "Tablet",
  },
  {
    value: "presenting-design",
    label: "Presenting",
  },
  {
    value: "walking",
    label: "Walking",
  },
  {
    value: "seated",
    label: "Seated",
  },
];

const BACKGROUNDS = [
  {
    value: "studio",
    label: "Studio",
  },
  {
    value: "digital-studio",
    label: "Digital Studio",
  },
  {
    value: "runway",
    label: "Runway",
  },
  {
    value: "atelier",
    label: "Atelier",
  },
  {
    value: "minimal",
    label: "Minimal",
  },
  {
    value: "neon",
    label: "Neon",
  },
  {
    value: "luxury",
    label: "Luxury",
  },
  {
    value: "street",
    label: "Street",
  },
  {
    value: "nature",
    label: "Nature",
  },
  {
    value: "transparent",
    label: "Transparent",
  },
];

const ANIMATIONS = [
  {
    value: "none",
    label: "None",
  },
  {
    value: "gentle-float",
    label: "Gentle Float",
  },
  {
    value: "soft-breathe",
    label: "Soft Breathe",
  },
  {
    value: "fashion-idle",
    label: "Fashion Idle",
  },
];

const AURA_STYLES = [
  {
    value: "soft-glow",
    label: "Soft Glow",
  },
  {
    value: "halo",
    label: "Halo",
  },
  {
    value: "pulse",
    label: "Pulse",
  },
  {
    value: "spotlight",
    label: "Spotlight",
  },
];

const TABS = [
  {
    value: "face",
    label: "Face",
    Icon: User,
  },
  {
    value: "hair",
    label: "Hair",
    Icon: Scissors,
  },
  {
    value: "style",
    label: "Style",
    Icon: Shirt,
  },
  {
    value: "presentation",
    label: "Presentation",
    Icon: Sparkles,
  },
  {
    value: "design",
    label: "Featured Design",
    Icon: Layers3,
  },
];

/* =========================================================
   Helpers
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

/* =========================================================
   Backend Media URL Helpers
   ========================================================= */

function getBackendOrigin() {
  const configured = cleanText(
    import.meta.env.VITE_BACKEND_URL ||
      import.meta.env.VITE_API_BASE_URL ||
      API.defaults.baseURL,
  );

  if (/^https?:\/\//i.test(configured)) {
    return configured
      .replace(/\/api(?:\/v\d+)?\/?$/i, "")
      .replace(/\/+$/, "");
  }

  if (
    typeof window !== "undefined" &&
    window.location.hostname === "localhost"
  ) {
    return "http://localhost:8080";
  }

  return typeof window !== "undefined"
    ? window.location.origin
    : "";
}

function resolveMediaUrl(value) {
  const path = cleanText(value);

  if (!path) {
    return "";
  }

  if (
    path.startsWith("data:") ||
    path.startsWith("blob:")
  ) {
    return path;
  }

  if (/^https?:\/\//i.test(path)) {
    return path
      .replace("localhost:5000", "localhost:8080")
      .replace("localhost:8000", "localhost:8080")
      .replace(/\\/g, "/");
  }

  return `${getBackendOrigin()}/${path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")}`;
}

/* =========================================================
   API Response Helpers
   ========================================================= */

function extractObject(response) {
  const body = response?.data;

  const candidates = [
    body?.data,
    body?.avatar,
    body,
  ];

  return (
    candidates.find(
      (candidate) =>
        candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate),
    ) || null
  );
}

function extractArray(response) {
  const body = response?.data;

  const candidates = [
    body?.data,
    body?.data?.items,
    body?.data?.designs,
    body?.data?.products,
    body?.data?.rows,
    body?.designs,
    body?.products,
    body?.items,
    body?.results,
    body?.rows,
    body,
  ];

  return (
    candidates.find(
      Array.isArray,
    ) || []
  );
}

function getErrorMessage(error, fallback) {
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
    fallback
  );
}

/* =========================================================
   Design Normalization
   ========================================================= */

function normalizeDesign(item) {
  if (
    !item ||
    typeof item !== "object"
  ) {
    return null;
  }

  const id = cleanText(
    item.id ||
      item.design_id,
  );

  if (!id) {
    return null;
  }

  return {
    id,

    title: cleanText(
      item.title,
      "Untitled Design",
    ),

    description: cleanText(
      item.description,
      "No description available.",
    ),

    slug: cleanText(
      item.slug,
    ),

    image: resolveMediaUrl(
      item.watermarked_preview_url ||
        item.preview_url ||
        item.reference_image_url ||
        item.image_url ||
        item.image,
    ),

    sourceType: cleanText(
      item.sourceType ||
        item.source_type,

      "upload",
    ).toLowerCase(),

    editorProjectId: cleanText(
      item.editorProjectId ||
        item.editor_project_id,
    ),

    isEditable: toBoolean(
      item.isEditable ??
        item.is_editable,

      false,
    ),

    allowRemix: toBoolean(
      item.allowRemix ??
        item.allow_remix,

      false,
    ),

    originalDesignId: cleanText(
      item.originalDesignId ||
        item.original_design_id,
    ),

    isPublic: toBoolean(
      item.isPublic ??
        item.is_public,

      true,
    ),

    isPublished: toBoolean(
      item.isPublished ??
        item.is_published,

      true,
    ),
  };
}

/* =========================================================
   Unsaved State Snapshot
   ========================================================= */

function createSnapshot({
  config,
  displayMode,
  pose,
  backgroundTheme,
  isPublic,
  featuredDesignId,
}) {
  return JSON.stringify({
    config,
    displayMode,
    pose,
    backgroundTheme,
    isPublic,
    featuredDesignId,
  });
}

/* =========================================================
   Small UI Components
   ========================================================= */

function SectionTitle({
  icon: Icon,
  title,
  description,
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2">
        {Icon && (
          <Icon
            size={15}
            className="text-violet-600 dark:text-violet-400"
          />
        )}

        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          {title}
        </h3>
      </div>

      {description && (
        <p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-white/35">
          {description}
        </p>
      )}
    </div>
  );
}

function OptionGrid({
  label,
  options,
  value,
  onChange,
  columns = "grid-cols-2 sm:grid-cols-3",
}) {
  return (
    <div>
      <p className="mb-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-white/35">
        {label}
      </p>

      <div className={`grid gap-2 ${columns}`}>
        {options.map((option) => {
          const selected =
            value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                onChange(option.value)
              }
              className={`relative min-h-11 rounded-xl border px-3 py-2.5 text-left text-[10px] font-bold transition ${
                selected
                  ? "border-violet-500 bg-violet-50 text-violet-800 shadow-sm dark:border-violet-400 dark:bg-violet-500/15 dark:text-white dark:shadow-[0_0_20px_rgba(139,92,246,0.12)]"
                  : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50/50 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/45 dark:hover:border-white/20 dark:hover:bg-white/[0.06] dark:hover:text-white/70"
              }`}
            >
              {option.label}

              {selected && (
                <Check
                  size={12}
                  className="absolute right-2 top-2 text-violet-600 dark:text-violet-300"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ColorChoices({
  label,
  colors,
  value,
  onChange,
}) {
  return (
    <div>
      <p className="mb-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-white/35">
        {label}
      </p>

      <div className="flex flex-wrap gap-2.5">
        {colors.map((color) => {
          const selected =
            value === color;

          return (
            <button
              key={color}
              type="button"
              aria-label={`${label} ${color}`}
              onClick={() =>
                onChange(color)
              }
              className={`relative h-9 w-9 rounded-full border-2 transition ${
                selected
                  ? "scale-110 border-slate-900 shadow-[0_0_0_3px_rgba(139,92,246,0.25)] dark:border-white dark:shadow-[0_0_0_3px_rgba(139,92,246,0.35)]"
                  : "border-slate-200 hover:scale-105 hover:border-slate-400 dark:border-white/10 dark:hover:border-white/30"
              }`}
              style={{
                backgroundColor:
                  color,
              }}
            >
              {selected && (
                <Check
                  size={13}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow"
                />
              )}
            </button>
          );
        })}

        <label className="relative h-9 w-9 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-slate-300 bg-white transition hover:border-violet-500 dark:border-white/20 dark:bg-white/[0.04] dark:hover:border-violet-400">
          <Palette
            size={14}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-500 dark:text-white/50"
          />

          <input
            type="color"
            value={
              value ||
              "#000000"
            }
            onChange={(event) =>
              onChange(
                event.target.value,
              )
            }
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  title,
  description,
  Icon,
}) {
  return (
    <button
      type="button"
      onClick={() =>
        onChange(!checked)
      }
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-violet-300 dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none dark:hover:border-white/20"
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-white/[0.05] dark:text-violet-300">
            <Icon size={15} />
          </div>
        )}

        <div>
          <p className="text-xs font-bold text-slate-800 dark:text-white/80">
            {title}
          </p>

          {description && (
            <p className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-white/30">
              {description}
            </p>
          )}
        </div>
      </div>

      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked
            ? "bg-violet-600"
            : "bg-slate-200 dark:bg-white/10"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${
            checked
              ? "left-6"
              : "left-1"
          }`}
        />
      </span>
    </button>
  );
}

/* =========================================================
   Featured Design Selection Card
   ========================================================= */

function DesignCard({
  design,
  selected,
  onSelect,
}) {
  const [
    imageFailed,
    setImageFailed,
  ] = useState(false);

  return (
    <button
      type="button"
      onClick={() =>
        onSelect(design)
      }
      className={`group overflow-hidden rounded-2xl border text-left transition ${
        selected
          ? "border-violet-500 bg-violet-50 shadow-sm dark:border-violet-400 dark:bg-violet-500/10 dark:shadow-[0_0_24px_rgba(139,92,246,0.12)]"
          : "border-slate-200 bg-white shadow-sm hover:border-violet-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none dark:hover:border-white/20 dark:hover:bg-white/[0.05]"
      }`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-black">
        {design.image &&
        !imageFailed ? (
          <img
            src={
              design.image
            }
            alt={
              design.title
            }
            loading="lazy"
            decoding="async"
            onError={() =>
              setImageFailed(
                true,
              )
            }
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/15">
            <ImageIcon
              size={24}
            />
          </div>
        )}

        {selected && (
          <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-white">
            <Check size={13} />
          </div>
        )}

        {design.sourceType ===
          "fashion_editor" && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full border border-violet-300/20 bg-black/55 px-2 py-1 text-[7px] font-black uppercase tracking-[0.1em] text-violet-200 backdrop-blur-md">
            <Layers3
              size={9}
            />

            {design.originalDesignId
              ? "Remix"
              : "Editor"}
          </span>
        )}
      </div>

      <div className="p-3">
        <p className="truncate text-xs font-bold text-slate-800 dark:text-white/80">
          {design.title}
        </p>

        <p className="mt-1 line-clamp-2 min-h-8 text-[9px] leading-4 text-slate-500 dark:text-white/30">
          {design.description}
        </p>

        {design.allowRemix && (
          <div className="mt-2 inline-flex items-center gap-1 text-[7px] font-black uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300/70">
            <GitFork size={9} />

            Remixable
          </div>
        )}
      </div>
    </button>
  );
}

/* =========================================================
   Main Avatar Studio
   ========================================================= */

export default function AvatarStudio() {
  const { user } =
    useAuth();

  const avatarRequestRef =
    useRef(null);

  const designRequestRef =
    useRef(null);

  const originalSnapshotRef =
    useRef("");

  /* =======================================================
     UI State
     ======================================================= */

  const [
    activeTab,
    setActiveTab,
  ] = useState("face");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    resetting,
    setResetting,
  ] = useState(false);

  const [
    designLoading,
    setDesignLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  const [
    designError,
    setDesignError,
  ] = useState("");

  /* =======================================================
     Avatar State
     ======================================================= */

  const [
    avatarExists,
    setAvatarExists,
  ] = useState(false);

  const [
    avatarVersion,
    setAvatarVersion,
  ] = useState(1);

  const [
    config,
    setConfig,
  ] = useState({
    ...DEFAULT_CONFIG,
  });

  const [
    displayMode,
    setDisplayMode,
  ] = useState(
    "showcase",
  );

  const [
    pose,
    setPose,
  ] = useState(
    "standing",
  );

  const [
    backgroundTheme,
    setBackgroundTheme,
  ] = useState(
    "studio",
  );

  const [
    isPublic,
    setIsPublic,
  ] = useState(true);

  /* =======================================================
     Featured Design State
     ======================================================= */

  const [
    originalFeaturedDesignId,
    setOriginalFeaturedDesignId,
  ] = useState("");

  const [
    featuredDesign,
    setFeaturedDesign,
  ] = useState(null);

  const [
    availableDesigns,
    setAvailableDesigns,
  ] = useState([]);

  const [
    designSearch,
    setDesignSearch,
  ] = useState("");

  /* =======================================================
     User Role
     ======================================================= */

  const role =
    cleanText(
      user?.role,
    ).toLowerCase();

  const isDesigner =
    role === "designer";

  const isCreator =
    role === "creator";

  /* =======================================================
     Configuration Helper
     ======================================================= */

  const updateConfig =
    useCallback(
      (key, value) => {
        setConfig(
          (current) => ({
            ...current,

            [key]:
              value,
          }),
        );

        setSuccess("");
      },
      [],
    );

  /* =======================================================
     Apply Avatar API Response
     ======================================================= */

  const applyAvatarResponse =
    useCallback(
      (data) => {
        if (!data) {
          return;
        }

        const nextConfig = {
          ...DEFAULT_CONFIG,

          ...(data.avatar_config ||
            {}),
        };

        const normalizedFeatured =
          data.featured_design
            ? normalizeDesign(
                data.featured_design,
              )
            : null;

        const nextDisplayMode =
          cleanText(
            data.display_mode,
            "showcase",
          );

        const nextPose =
          cleanText(
            data.pose,
            "standing",
          );

        const nextBackground =
          cleanText(
            data.background_theme,
            "studio",
          );

        const nextPublic =
          toBoolean(
            data.is_public,
            true,
          );

        const nextFeaturedId =
          cleanText(
            data.featured_design_id,
          );

        setAvatarExists(
          Boolean(
            data.exists,
          ),
        );

        setAvatarVersion(
          Number(
            data.avatar_version ||
              1,
          ),
        );

        setConfig(
          nextConfig,
        );

        setDisplayMode(
          nextDisplayMode,
        );

        setPose(
          nextPose,
        );

        setBackgroundTheme(
          nextBackground,
        );

        setIsPublic(
          nextPublic,
        );

        setFeaturedDesign(
          normalizedFeatured,
        );

        setOriginalFeaturedDesignId(
          nextFeaturedId,
        );

        originalSnapshotRef.current =
          createSnapshot({
            config:
              nextConfig,

            displayMode:
              nextDisplayMode,

            pose:
              nextPose,

            backgroundTheme:
              nextBackground,

            isPublic:
              nextPublic,

            featuredDesignId:
              nextFeaturedId,
          });
      },
      [],
    );

  /* =======================================================
     Load Current Avatar
     ======================================================= */

  const loadAvatar =
    useCallback(
      async () => {
        avatarRequestRef.current?.abort();

        const controller =
          new AbortController();

        avatarRequestRef.current =
          controller;

        setLoading(true);

        setError("");

        try {
          const response =
            await API.get(
              "/avatar/me",
              {
                signal:
                  controller.signal,
              },
            );

          const avatar =
            extractObject(
              response,
            );

          if (!avatar) {
            throw new Error(
              "The avatar response was empty.",
            );
          }

          applyAvatarResponse(
            avatar,
          );
        } catch (
          requestError
        ) {
          const message =
            getErrorMessage(
              requestError,

              "The Avatar Studio could not be loaded.",
            );

          if (message) {
            console.error(
              "Avatar load failed:",
              requestError,
            );

            setError(
              message,
            );
          }
        } finally {
          if (
            avatarRequestRef.current ===
            controller
          ) {
            avatarRequestRef.current =
              null;

            setLoading(
              false,
            );
          }
        }
      },
      [
        applyAvatarResponse,
      ],
    );

  /* =======================================================
     Load Designs
     ======================================================= */

  const loadDesigns =
    useCallback(
      async () => {
        designRequestRef.current?.abort();

        const controller =
          new AbortController();

        designRequestRef.current =
          controller;

        setDesignLoading(
          true,
        );

        setDesignError("");

        try {
          const response =
            isDesigner
              ? await API.get(
                  "/designer/my-inventory",
                  {
                    signal:
                      controller.signal,
                  },
                )
              : await API.get(
                  "/marketplace",
                  {
                    signal:
                      controller.signal,
                  },
                );

          let designs =
            extractArray(
              response,
            )
              .map(
                normalizeDesign,
              )
              .filter(
                Boolean,
              );

          if (isCreator) {
            designs =
              designs.filter(
                (design) =>
                  design.isPublic &&
                  design.isPublished,
              );
          }

          setAvailableDesigns(
            designs,
          );
        } catch (
          requestError
        ) {
          const message =
            getErrorMessage(
              requestError,

              "The design library could not be loaded.",
            );

          if (message) {
            console.error(
              "Avatar design library failed:",
              requestError,
            );

            setDesignError(
              message,
            );
          }
        } finally {
          if (
            designRequestRef.current ===
            controller
          ) {
            designRequestRef.current =
              null;

            setDesignLoading(
              false,
            );
          }
        }
      },
      [
        isCreator,
        isDesigner,
      ],
    );

  /* =======================================================
     Initial Loading
     ======================================================= */

  useEffect(() => {
    void loadAvatar();

    return () => {
      avatarRequestRef.current?.abort();
    };
  }, [loadAvatar]);

  useEffect(() => {
    void loadDesigns();

    return () => {
      designRequestRef.current?.abort();
    };
  }, [loadDesigns]);

  /* =======================================================
     Derived Values
     ======================================================= */

  const currentFeaturedDesignId =
    cleanText(
      featuredDesign?.id,
    );

  const currentSnapshot =
    useMemo(
      () =>
        createSnapshot({
          config,

          displayMode,

          pose,

          backgroundTheme,

          isPublic,

          featuredDesignId:
            currentFeaturedDesignId,
        }),
      [
        backgroundTheme,
        config,
        currentFeaturedDesignId,
        displayMode,
        isPublic,
        pose,
      ],
    );

  const hasUnsavedChanges =
    Boolean(
      originalSnapshotRef.current &&
        originalSnapshotRef.current !==
          currentSnapshot,
    );

  const visibleDesigns =
    useMemo(() => {
      const search =
        designSearch
          .trim()
          .toLowerCase();

      if (!search) {
        return availableDesigns;
      }

      return availableDesigns.filter(
        (design) =>
          [
            design.title,
            design.description,
            design.sourceType,
          ]
            .join(" ")
            .toLowerCase()
            .includes(
              search,
            ),
      );
    }, [
      availableDesigns,
      designSearch,
    ]);

  const displayName =
    cleanText(
      user?.full_name ||
        user?.name,

      role === "creator"
        ? "Creator"
        : "Designer",
    );

  /* =======================================================
     Save Avatar
     ======================================================= */

  const handleSave =
    useCallback(
      async () => {
        if (
          saving ||
          resetting
        ) {
          return;
        }

        setSaving(true);

        setError("");

        setSuccess("");

        try {
          await API.put(
            "/avatar/me",
            {
              avatar_config:
                config,

              replace_config:
                true,

              display_mode:
                displayMode,

              pose,

              background_theme:
                backgroundTheme,

              is_public:
                isPublic,
            },
          );

          if (
            currentFeaturedDesignId !==
            originalFeaturedDesignId
          ) {
            if (
              currentFeaturedDesignId
            ) {
              await API.put(
                "/avatar/me/featured-design",
                {
                  featured_design_id:
                    currentFeaturedDesignId,

                  display_mode:
                    displayMode,
                },
              );
            } else if (
              originalFeaturedDesignId
            ) {
              await API.delete(
                "/avatar/me/featured-design",
              );
            }
          }

          const refreshed =
            await API.get(
              "/avatar/me",
            );

          const avatar =
            extractObject(
              refreshed,
            );

          if (avatar) {
            applyAvatarResponse(
              avatar,
            );
          }

          setSuccess(
            "Fashion Persona saved successfully.",
          );
        } catch (
          requestError
        ) {
          console.error(
            "Avatar save failed:",
            requestError,
          );

          setError(
            getErrorMessage(
              requestError,

              "Your Fashion Persona could not be saved.",
            ),
          );
        } finally {
          setSaving(
            false,
          );
        }
      },
      [
        applyAvatarResponse,
        backgroundTheme,
        config,
        currentFeaturedDesignId,
        displayMode,
        isPublic,
        originalFeaturedDesignId,
        pose,
        resetting,
        saving,
      ],
    );

  /* =======================================================
     Reset Avatar
     ======================================================= */

  const handleReset =
    useCallback(
      async () => {
        if (
          resetting ||
          saving
        ) {
          return;
        }

        const confirmed =
          window.confirm(
            "Reset your Fashion Persona to the default avatar? Your current avatar customization and featured design will be removed.",
          );

        if (!confirmed) {
          return;
        }

        setResetting(
          true,
        );

        setError("");

        setSuccess("");

        try {
          const response =
            await API.post(
              "/avatar/me/reset",
            );

          const avatar =
            extractObject(
              response,
            );

          if (avatar) {
            applyAvatarResponse(
              avatar,
            );
          }

          setSuccess(
            "Fashion Persona reset successfully.",
          );
        } catch (
          requestError
        ) {
          console.error(
            "Avatar reset failed:",
            requestError,
          );

          setError(
            getErrorMessage(
              requestError,

              "Your Fashion Persona could not be reset.",
            ),
          );
        } finally {
          setResetting(
            false,
          );
        }
      },
      [
        applyAvatarResponse,
        resetting,
        saving,
      ],
    );

  /* =======================================================
     Select Featured Design
     ======================================================= */

  const selectDesign =
    useCallback(
      (design) => {
        setFeaturedDesign(
          design,
        );

        setConfig(
          (current) => ({
            ...current,

            showFeaturedCard:
              true,

            showDesignAura:
              true,
          }),
        );

        setSuccess("");
      },
      [],
    );

  /* =======================================================
     Remove Featured Design
     ======================================================= */

  const removeFeaturedDesign =
    useCallback(() => {
      setFeaturedDesign(
        null,
      );

      setDisplayMode(
        "showcase",
      );

      setSuccess("");
    }, []);

  /* =======================================================
     Loading Screen
     ======================================================= */

  if (loading) {
    return (
      <div
        className="
          flex
          min-h-[75vh]
          flex-col
          items-center
          justify-center
          gap-5
          bg-[#f7f7f9]
          text-slate-900
          transition-colors
          duration-300

          dark:bg-[#050507]
          dark:text-white
        "
      >
        <div
          className="
            flex
            h-16
            w-16
            items-center
            justify-center
            rounded-2xl
            border
            border-violet-200
            bg-violet-50
            shadow-lg

            dark:border-violet-400/20
            dark:bg-violet-500/10
            dark:shadow-[0_0_50px_rgba(139,92,246,0.15)]
          "
        >
          <Loader2
            size={28}
            className="animate-spin text-violet-600 dark:text-violet-300"
          />
        </div>

        <div className="text-center">
          <p className="text-sm font-bold">
            Loading Avatar Studio
          </p>

          <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/25">
            Preparing Fashion Persona
          </p>
        </div>
      </div>
    );
  }

  /* =======================================================
     Render
     ======================================================= */

  return (
    <div
      className="
        min-h-screen
        bg-[#f7f7f9]
        text-slate-900
        transition-colors
        duration-300
        selection:bg-violet-600
        selection:text-white

        dark:bg-[#050507]
        dark:text-white
      "
    >
      {/* ===================================================
          Ambient Background
          =================================================== */}

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="
            absolute
            -left-48
            -top-48
            h-[38rem]
            w-[38rem]
            rounded-full
            bg-violet-400/[0.10]
            blur-[160px]

            dark:bg-violet-600/10
          "
        />

        <div
          className="
            absolute
            -bottom-52
            -right-52
            h-[36rem]
            w-[36rem]
            rounded-full
            bg-cyan-400/[0.08]
            blur-[160px]

            dark:bg-cyan-500/[0.06]
          "
        />
      </div>

      <div className="relative mx-auto max-w-[1700px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        {/* =================================================
            Header
            ================================================= */}

        <header
          className="
            flex
            flex-col
            gap-5
            rounded-[2rem]
            border
            border-slate-200
            bg-white/90
            p-5
            shadow-xl
            backdrop-blur-xl

            dark:border-white/10
            dark:bg-[#0b0b0e]/90
            dark:shadow-2xl

            sm:p-6

            lg:flex-row
            lg:items-center
            lg:justify-between
          "
        >
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.22em] text-violet-600 dark:text-violet-300">
                <Sparkles
                  size={13}
                />

                Fashion Persona
              </span>

              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.14em] text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/35">
                {role || "User"}
              </span>

              {avatarExists && (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
                  Version{" "}
                  {avatarVersion}
                </span>
              )}

              {hasUnsavedChanges && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.14em] text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
                  Unsaved Changes
                </span>
              )}
            </div>

            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Avatar Studio
            </h1>

            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-white/35">
              Build a richer human identity, refine facial structure and
              styling, connect a fashion design, and create the persona shown
              throughout your profile.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={
                handleReset
              }
              disabled={
                resetting ||
                saving
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[9px] font-black uppercase tracking-[0.15em] text-slate-500 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/50 dark:shadow-none dark:hover:border-rose-400/30 dark:hover:bg-rose-400/10 dark:hover:text-rose-200"
            >
              {resetting ? (
                <Loader2
                  size={14}
                  className="animate-spin"
                />
              ) : (
                <RotateCcw
                  size={14}
                />
              )}

              Reset
            </button>

            <button
              type="button"
              onClick={
                handleSave
              }
              disabled={
                saving ||
                resetting
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-[9px] font-black uppercase tracking-[0.15em] text-white shadow-lg shadow-violet-200/60 transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-violet-950/30"
            >
              {saving ? (
                <Loader2
                  size={14}
                  className="animate-spin"
                />
              ) : (
                <Save
                  size={14}
                />
              )}

              {saving
                ? "Saving"
                : "Save Fashion Persona"}
            </button>
          </div>
        </header>

        {/* Error */}

        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200"
          >
            <span>
              {error}
            </span>

            <button
              type="button"
              onClick={() =>
                setError("")
              }
              className="shrink-0 text-rose-400 transition hover:text-rose-700 dark:text-rose-300/60 dark:hover:text-white"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Success */}

        {success && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200"
          >
            <Check size={16} />

            {success}
          </div>
        )}

        {/* =================================================
            Main Workspace
            ================================================= */}

        <div className="grid gap-6 xl:grid-cols-[minmax(420px,0.9fr)_minmax(600px,1.1fr)]">
          {/* Live Preview */}

          <section className="xl:sticky xl:top-5 xl:self-start">
            <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#0b0b0e] dark:shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">
                    Live Preview
                  </p>

                  <p className="mt-1 text-sm font-bold text-slate-800 dark:text-white/80">
                    {displayName}
                  </p>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.13em] text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/40">
                  <Eye size={11} />

                  Real Time
                </div>
              </div>

              <div className="p-3 sm:p-4">
                <FashionPersonaAvatar
                  config={
                    config
                  }
                  pose={
                    pose
                  }
                  backgroundTheme={
                    backgroundTheme
                  }
                  displayMode={
                    displayMode
                  }
                  featuredDesign={
                    featuredDesign
                  }
                  avatarLabel="Live Fashion Persona"
                  ariaLabel={`${displayName} Fashion Persona preview`}
                />
              </div>

              <div className="grid grid-cols-2 border-t border-slate-200 dark:border-white/10 sm:grid-cols-4">
                {[
                  {
                    label:
                      "Pose",

                    value:
                      POSES.find(
                        (option) =>
                          option.value ===
                          pose,
                      )?.label ||
                      pose,
                  },

                  {
                    label:
                      "Background",

                    value:
                      BACKGROUNDS.find(
                        (option) =>
                          option.value ===
                          backgroundTheme,
                      )?.label ||
                      backgroundTheme,
                  },

                  {
                    label:
                      "Display",

                    value:
                      displayMode ===
                      "wear"
                        ? "Wear"
                        : "Showcase",
                  },

                  {
                    label:
                      "Visibility",

                    value:
                      isPublic
                        ? "Public"
                        : "Private",
                  },
                ].map(
                  (item) => (
                    <div
                      key={
                        item.label
                      }
                      className="border-r border-slate-100 px-3 py-3 text-center last:border-r-0 dark:border-white/5"
                    >
                      <p className="truncate text-[9px] font-bold text-slate-700 dark:text-white/65">
                        {item.value}
                      </p>

                      <p className="mt-1 text-[7px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-white/20">
                        {item.label}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </div>
          </section>

          {/* Customization Panel */}

          <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#0b0b0e] dark:shadow-2xl">
            {/* Tabs */}

            <div className="overflow-x-auto border-b border-slate-200 dark:border-white/10">
              <div className="flex min-w-max px-2 pt-2">
                {TABS.map(
                  ({
                    value,
                    label,
                    Icon,
                  }) => {
                    const active =
                      activeTab ===
                      value;

                    return (
                      <button
                        key={
                          value
                        }
                        type="button"
                        onClick={() =>
                          setActiveTab(
                            value,
                          )
                        }
                        className={`relative inline-flex min-h-12 items-center gap-2 rounded-t-xl px-4 text-[9px] font-black uppercase tracking-[0.13em] transition ${
                          active
                            ? "bg-violet-50 text-violet-700 dark:bg-white/[0.055] dark:text-white"
                            : "text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:text-white/30 dark:hover:bg-transparent dark:hover:text-white/60"
                        }`}
                      >
                        <Icon
                          size={13}
                        />

                        {label}

                        {active && (
                          <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-violet-500" />
                        )}
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            <div className="min-h-[640px] p-5 sm:p-6">
              {/* FACE TAB */}

              {activeTab ===
                "face" && (
                <div className="space-y-7">
                  <SectionTitle
                    icon={User}
                    title="Face & Identity"
                    description="Build a more human Fashion Persona by combining facial proportions, structure, eyes, nose, lips, and expression."
                  />

                  <div>
                    <p className="mb-3 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-white/35">
                      Skin Tone
                    </p>

                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {SKIN_TONES.map(
                        (tone) => {
                          const selected =
                            config.skinTone ===
                            tone.value;

                          return (
                            <button
                              key={
                                tone.value
                              }
                              type="button"
                              onClick={() =>
                                updateConfig(
                                  "skinTone",

                                  tone.value,
                                )
                              }
                              className={`rounded-xl border p-2 transition ${
                                selected
                                  ? "border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-violet-500/10"
                                  : "border-slate-200 bg-white hover:border-violet-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20"
                              }`}
                            >
                              <div
                                className="mx-auto h-9 w-9 rounded-full border border-black/10 dark:border-white/10"
                                style={{
                                  backgroundColor:
                                    tone.color,
                                }}
                              />

                              <p className="mt-2 truncate text-center text-[7px] font-bold text-slate-500 dark:text-white/45">
                                {
                                  tone.label
                                }
                              </p>
                            </button>
                          );
                        },
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-400/15 dark:bg-violet-500/[0.045]">
                    <p className="text-[8px] font-black uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
                      Human Face Structure
                    </p>

                    <p className="mt-2 text-[10px] leading-5 text-slate-500 dark:text-white/30">
                      Face presets provide a quick overall look. You can then
                      refine the face shape, jaw, cheeks, nose, lips, eyes, and
                      expression individually.
                    </p>
                  </div>

                  <OptionGrid
                    label="Face Preset"
                    options={
                      FACE_PRESETS
                    }
                    value={
                      config.facePreset
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "facePreset",

                        value,
                      )
                    }
                  />

                  <OptionGrid
                    label="Face Shape"
                    options={
                      FACE_SHAPES
                    }
                    value={
                      config.faceShape
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "faceShape",

                        value,
                      )
                    }
                  />

                  <OptionGrid
                    label="Jaw Shape"
                    options={
                      JAW_SHAPES
                    }
                    value={
                      config.jawShape
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "jawShape",

                        value,
                      )
                    }
                  />

                  <OptionGrid
                    label="Cheek Structure"
                    options={
                      CHEEK_SHAPES
                    }
                    value={
                      config.cheekShape
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "cheekShape",

                        value,
                      )
                    }
                  />

                  <OptionGrid
                    label="Eyes"
                    options={
                      EYE_STYLES
                    }
                    value={
                      config.eyeStyle
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "eyeStyle",

                        value,
                      )
                    }
                  />

                  <ColorChoices
                    label="Eye Color"
                    value={
                      config.eyeColor
                    }
                    colors={[
                      "#3b2417",
                      "#5a3a22",
                      "#8b6b45",
                      "#2563eb",
                      "#0f766e",
                      "#16a34a",
                      "#6b7280",
                      "#111827",
                    ]}
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "eyeColor",

                        value,
                      )
                    }
                  />

                  <OptionGrid
                    label="Eyebrows"
                    options={
                      EYEBROW_STYLES
                    }
                    value={
                      config.eyebrowStyle
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "eyebrowStyle",

                        value,
                      )
                    }
                  />

                  <OptionGrid
                    label="Nose"
                    options={
                      NOSE_STYLES
                    }
                    value={
                      config.noseStyle
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "noseStyle",

                        value,
                      )
                    }
                  />

                  <OptionGrid
                    label="Lips"
                    options={
                      LIP_STYLES
                    }
                    value={
                      config.lipStyle
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "lipStyle",

                        value,
                      )
                    }
                  />

                  <ColorChoices
                    label="Lip Color"
                    value={
                      config.lipColor
                    }
                    colors={[
                      "#8f3f51",
                      "#a94f5f",
                      "#b85c68",
                      "#7f3948",
                      "#9c4a3f",
                      "#6f3340",
                      "#c26c70",
                      "#7a4654",
                    ]}
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "lipColor",

                        value,
                      )
                    }
                  />

                  <OptionGrid
                    label="Expression"
                    options={
                      EXPRESSIONS
                    }
                    value={
                      config.expression
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "expression",

                        value,
                      )
                    }
                  />
                </div>
              )}

              {/* HAIR TAB */}

              {activeTab ===
                "hair" && (
                <div className="space-y-7">
                  <SectionTitle
                    icon={
                      Scissors
                    }
                    title="Hair & Details"
                    description="Customize hairstyle, facial hair, glasses, and signature details."
                  />

                  <OptionGrid
                    label="Hairstyle"
                    options={
                      HAIR_STYLES
                    }
                    value={
                      config.hairStyle
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "hairStyle",

                        value,
                      )
                    }
                  />

                  <ColorChoices
                    label="Hair Color"
                    value={
                      config.hairColor
                    }
                    colors={[
                      "#17120f",
                      "#2d1b13",
                      "#5a3423",
                      "#b7791f",
                      "#111827",
                      "#6b7280",
                      "#7c3aed",
                      "#dc2626",
                    ]}
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "hairColor",

                        value,
                      )
                    }
                  />

                  <OptionGrid
                    label="Facial Hair"
                    options={
                      FACIAL_HAIR
                    }
                    value={
                      config.facialHair
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "facialHair",

                        value,
                      )
                    }
                  />

                  <OptionGrid
                    label="Glasses"
                    options={
                      GLASSES
                    }
                    value={
                      config.glasses
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "glasses",

                        value,
                      )
                    }
                  />
                </div>
              )}

              {/* STYLE TAB */}

              {activeTab ===
                "style" && (
                <div className="space-y-7">
                  <SectionTitle
                    icon={Shirt}
                    title="Fashion Styling"
                    description="Dress your Fashion Persona with a base wardrobe and combine it with featured designs."
                  />

                  <OptionGrid
                    label="Body Type"
                    options={
                      BODY_TYPES
                    }
                    value={
                      config.bodyType
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "bodyType",

                        value,
                      )
                    }
                  />

                  <OptionGrid
                    label="Top"
                    options={
                      TOP_TEMPLATES
                    }
                    value={
                      config.topTemplate
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "topTemplate",

                        value,
                      )
                    }
                  />

                  <ColorChoices
                    label="Top Color"
                    value={
                      config.topColor
                    }
                    colors={[
                      "#6d28d9",
                      "#2563eb",
                      "#111827",
                      "#f8fafc",
                      "#dc2626",
                      "#059669",
                      "#d4af37",
                      "#db2777",
                    ]}
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "topColor",

                        value,
                      )
                    }
                  />

                  <OptionGrid
                    label="Bottom"
                    options={
                      BOTTOM_TEMPLATES
                    }
                    value={
                      config.bottomTemplate
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "bottomTemplate",

                        value,
                      )
                    }
                  />

                  <ColorChoices
                    label="Bottom Color"
                    value={
                      config.bottomColor
                    }
                    colors={[
                      "#111827",
                      "#1e3a8a",
                      "#3f3f46",
                      "#f8fafc",
                      "#4c1d95",
                      "#7f1d1d",
                      "#365314",
                    ]}
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "bottomColor",

                        value,
                      )
                    }
                  />

                  <OptionGrid
                    label="Shoes"
                    options={
                      SHOES
                    }
                    value={
                      config.shoes
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "shoes",

                        value,
                      )
                    }
                  />

                  <OptionGrid
                    label="Accessory"
                    options={
                      ACCESSORIES
                    }
                    value={
                      config.accessory
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "accessory",

                        value,
                      )
                    }
                  />
                </div>
              )}

              {/* PRESENTATION TAB */}

              {activeTab ===
                "presentation" && (
                <div className="space-y-7">
                  <SectionTitle
                    icon={
                      Sparkles
                    }
                    title="Presentation"
                    description="Control how your Fashion Persona appears across DesignByYou."
                  />

                  <OptionGrid
                    label="Pose"
                    options={
                      POSES
                    }
                    value={
                      pose
                    }
                    onChange={(
                      value,
                    ) => {
                      setPose(
                        value,
                      );

                      setSuccess(
                        "",
                      );
                    }}
                  />

                  <OptionGrid
                    label="Background"
                    options={
                      BACKGROUNDS
                    }
                    value={
                      backgroundTheme
                    }
                    onChange={(
                      value,
                    ) => {
                      setBackgroundTheme(
                        value,
                      );

                      setSuccess(
                        "",
                      );
                    }}
                  />

                  <OptionGrid
                    label="Animation"
                    options={
                      ANIMATIONS
                    }
                    value={
                      config.animation
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "animation",

                        value,
                      )
                    }
                  />

                  <OptionGrid
                    label="Design Aura"
                    options={
                      AURA_STYLES
                    }
                    value={
                      config.auraStyle
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "auraStyle",

                        value,
                      )
                    }
                  />

                  <ColorChoices
                    label="Aura Primary Color"
                    value={
                      config.auraPrimaryColor
                    }
                    colors={[
                      "#8b5cf6",
                      "#06b6d4",
                      "#d4af37",
                      "#ec4899",
                      "#10b981",
                      "#ef4444",
                    ]}
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "auraPrimaryColor",

                        value,
                      )
                    }
                  />

                  <ColorChoices
                    label="Aura Secondary Color"
                    value={
                      config.auraSecondaryColor
                    }
                    colors={[
                      "#06b6d4",
                      "#8b5cf6",
                      "#d4af37",
                      "#f43f5e",
                      "#22c55e",
                      "#3b82f6",
                    ]}
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "auraSecondaryColor",

                        value,
                      )
                    }
                  />

                  <Toggle
                    checked={
                      config.showDesignAura
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "showDesignAura",

                        value,
                      )
                    }
                    title="Design Aura"
                    description="Display the animated visual identity glow around your avatar."
                    Icon={
                      Sparkles
                    }
                  />

                  <Toggle
                    checked={
                      config.showFeaturedCard
                    }
                    onChange={(
                      value,
                    ) =>
                      updateConfig(
                        "showFeaturedCard",

                        value,
                      )
                    }
                    title="Featured Design Card"
                    description="Show your selected design beside the avatar while using Showcase Mode."
                    Icon={
                      ImageIcon
                    }
                  />

                  {/* Profile Identity Preference */}

                  <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-400/15 dark:bg-violet-500/[0.055]">
                    <div className="mb-4 flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-white text-violet-600 dark:border-violet-300/15 dark:bg-violet-500/10 dark:text-violet-300">
                        <User
                          size={16}
                        />
                      </div>

                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-white/85">
                          Profile Identity
                        </p>

                        <p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-white/35">
                          Choose whether your saved Fashion Persona should
                          replace your normal profile photo in identity surfaces
                          such as your profile, navigation, chat, bookings, and
                          cards.
                        </p>
                      </div>
                    </div>

                    <Toggle
                      checked={toBoolean(
                        config.useAsProfilePicture,

                        false,
                      )}
                      onChange={(
                        value,
                      ) =>
                        updateConfig(
                          "useAsProfilePicture",

                          value,
                        )
                      }
                      title={
                        config.useAsProfilePicture
                          ? "Fashion Persona is my profile picture"
                          : "Use Fashion Persona as profile picture"
                      }
                      description={
                        config.useAsProfilePicture
                          ? "Your Fashion Persona will be preferred wherever DesignByYou uses Profile Identity."
                          : "Your normal uploaded profile photo will remain preferred. Your Fashion Persona stays saved in Avatar Studio."
                      }
                      Icon={
                        Sparkles
                      }
                    />
                  </div>

                  <Toggle
                    checked={
                      isPublic
                    }
                    onChange={(
                      value,
                    ) => {
                      setIsPublic(
                        value,
                      );

                      setSuccess(
                        "",
                      );
                    }}
                    title={
                      isPublic
                        ? "Public Avatar"
                        : "Private Avatar"
                    }
                    description={
                      isPublic
                        ? "Your Fashion Persona can appear on your public profile."
                        : "Your saved Fashion Persona will not be available through the public avatar endpoint."
                    }
                    Icon={
                      isPublic
                        ? Globe
                        : Lock
                    }
                  />
                </div>
              )}

              {/* FEATURED DESIGN TAB */}

              {activeTab ===
                "design" && (
                <div className="space-y-6">
                  <SectionTitle
                    icon={
                      Layers3
                    }
                    title="Featured Design"
                    description={
                      isDesigner
                        ? "Connect one of your own designs to your Fashion Persona."
                        : "Choose a public and published design to feature with your Fashion Persona."
                    }
                  />

                  {/* Presentation Mode */}

                  <div>
                    <p className="mb-3 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-white/35">
                      Presentation Mode
                    </p>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDisplayMode(
                            "showcase",
                          );

                          setSuccess(
                            "",
                          );
                        }}
                        className={`rounded-2xl border p-4 text-left transition ${
                          displayMode ===
                          "showcase"
                            ? "border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-violet-500/15"
                            : "border-slate-200 bg-white hover:border-violet-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20"
                        }`}
                      >
                        <Monitor
                          size={18}
                          className="text-violet-600 dark:text-violet-300"
                        />

                        <p className="mt-3 text-xs font-bold text-slate-800 dark:text-white">
                          Showcase Mode
                        </p>

                        <p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-white/30">
                          Present the selected fashion design beside your avatar
                          as part of your visual portfolio.
                        </p>
                      </button>

                      <button
                        type="button"
                        disabled={
                          !featuredDesign
                        }
                        onClick={() => {
                          setDisplayMode(
                            "wear",
                          );

                          setSuccess(
                            "",
                          );
                        }}
                        className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          displayMode ===
                          "wear"
                            ? "border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-violet-500/15"
                            : "border-slate-200 bg-white hover:border-violet-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20"
                        }`}
                      >
                        <Shirt
                          size={18}
                          className="text-violet-600 dark:text-violet-300"
                        />

                        <p className="mt-3 text-xs font-bold text-slate-800 dark:text-white">
                          Wear Mode
                        </p>

                        <p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-white/30">
                          Apply the featured design preview as a visual garment
                          treatment on the Fashion Persona.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Currently Selected Design */}

                  {featuredDesign && (
                    <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-400/25 dark:bg-violet-500/10">
                      <div className="flex items-center gap-4">
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-black dark:border-white/10">
                          {featuredDesign.image ? (
                            <img
                              src={
                                featuredDesign.image
                              }
                              alt={
                                featuredDesign.title
                              }
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <ImageIcon
                                size={
                                  20
                                }
                                className="text-white/20"
                              />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-[8px] font-black uppercase tracking-[0.15em] text-violet-600 dark:text-violet-300">
                            Currently Featured
                          </p>

                          <h4 className="mt-1 truncate text-sm font-bold text-slate-900 dark:text-white">
                            {
                              featuredDesign.title
                            }
                          </h4>

                          <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">
                            {featuredDesign.sourceType ===
                            "fashion_editor"
                              ? featuredDesign.originalDesignId
                                ? "Fashion Editor Remix"
                                : "Fashion Editor"
                              : "Image Upload"}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={
                            removeFeaturedDesign
                          }
                          title="Remove featured design"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-white/10 dark:text-white/35 dark:hover:border-rose-400/30 dark:hover:bg-rose-400/10 dark:hover:text-rose-200"
                        >
                          <X
                            size={14}
                          />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Search Design Library */}

                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <SlidersHorizontal
                        size={14}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/25"
                      />

                      <input
                        value={
                          designSearch
                        }
                        onChange={(
                          event,
                        ) =>
                          setDesignSearch(
                            event.target.value,
                          )
                        }
                        placeholder="Search designs..."
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-white dark:placeholder:text-white/20 dark:focus:border-violet-400"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={
                        loadDesigns
                      }
                      disabled={
                        designLoading
                      }
                      title="Refresh design library"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:border-violet-400 hover:text-violet-600 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/35 dark:hover:text-violet-300"
                    >
                      <RefreshCw
                        size={14}
                        className={
                          designLoading
                            ? "animate-spin"
                            : ""
                        }
                      />
                    </button>
                  </div>

                  {/* Design Loading Error */}

                  {designError && (
                    <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-5 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/[0.06] dark:text-amber-200/70">
                      <span>
                        {
                          designError
                        }
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setDesignError(
                            "",
                          )
                        }
                        className="shrink-0 text-amber-500 hover:text-amber-800 dark:text-amber-200/40 dark:hover:text-white"
                      >
                        <X
                          size={13}
                        />
                      </button>
                    </div>
                  )}

                  {/* Design Library */}

                  {designLoading ? (
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                      {Array.from({
                        length: 6,
                      }).map(
                        (
                          _,
                          index,
                        ) => (
                          <div
                            key={
                              index
                            }
                            className="aspect-[4/5] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[0.05]"
                          />
                        ),
                      )}
                    </div>
                  ) : visibleDesigns.length ===
                    0 ? (
                    <div className="flex min-h-[250px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center dark:border-white/10 dark:bg-white/[0.02]">
                      <Layers3
                        size={27}
                        className="text-slate-300 dark:text-white/15"
                      />

                      <p className="mt-4 text-sm font-bold text-slate-600 dark:text-white/55">
                        No designs available
                      </p>

                      <p className="mt-2 max-w-sm text-xs leading-6 text-slate-400 dark:text-white/25">
                        {isDesigner
                          ? "Create or upload a design first, then return here to connect it with your Fashion Persona."
                          : "No public and published showcase designs are currently available to feature."}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                      {visibleDesigns.map(
                        (
                          design,
                        ) => (
                          <DesignCard
                            key={
                              design.id
                            }
                            design={
                              design
                            }
                            selected={
                              currentFeaturedDesignId ===
                              design.id
                            }
                            onSelect={
                              selectDesign
                            }
                          />
                        ),
                      )}
                    </div>
                  )}

                  {/* Role Permission Information */}

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.025]">
                    <div className="flex items-start gap-3">
                      {isDesigner ? (
                        <GitFork
                          size={15}
                          className="mt-0.5 shrink-0 text-violet-600 dark:text-violet-300"
                        />
                      ) : (
                        <Sparkles
                          size={15}
                          className="mt-0.5 shrink-0 text-violet-600 dark:text-violet-300"
                        />
                      )}

                      <p className="text-[10px] leading-5 text-slate-500 dark:text-white/30">
                        {isDesigner
                          ? "Designer Fashion Personas can feature designs owned by that designer, including Fashion Editor originals, remixes, and manual uploads."
                          : "Creator Fashion Personas use exactly the same avatar system. Creators can currently feature public and published designs. Purchased and commissioned design permissions can be connected later."}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Save Bar */}

            <div className="sticky bottom-0 z-20 flex flex-col gap-3 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#0b0b0e]/95 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold text-slate-700 dark:text-white/65">
                  {hasUnsavedChanges
                    ? "Your persona has unsaved changes."
                    : avatarExists
                      ? "Your Fashion Persona is saved."
                      : "Create your first Fashion Persona."}
                </p>

                <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.13em] text-slate-400 dark:text-white/20">
                  Shared Avatar ·{" "}
                  {role ||
                    "User"}{" "}
                  · Version{" "}
                  {
                    avatarVersion
                  }
                </p>
              </div>

              <button
                type="button"
                onClick={
                  handleSave
                }
                disabled={
                  saving ||
                  resetting
                }
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-[9px] font-black uppercase tracking-[0.15em] text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2
                    size={14}
                    className="animate-spin"
                  />
                ) : (
                  <Save
                    size={14}
                  />
                )}

                {saving
                  ? "Saving"
                  : "Save Persona"}
              </button>
            </div>
          </section>
        </div>

        {/* Architecture Information */}

        <section className="grid gap-4 pb-6 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.025] dark:shadow-none">
            <Brush
              size={17}
              className="text-violet-600 dark:text-violet-300"
            />

            <h3 className="mt-4 text-sm font-bold text-slate-900 dark:text-white">
              One Identity
            </h3>

            <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-white/30">
              Creator and designer accounts use the exact same Fashion Persona
              customization system.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.025] dark:shadow-none">
            <Layers3
              size={17}
              className="text-cyan-600 dark:text-cyan-300"
            />

            <h3 className="mt-4 text-sm font-bold text-slate-900 dark:text-white">
              One Renderer
            </h3>

            <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-white/30">
              Avatar Studio and profile pages share FashionPersonaAvatar,
              including the richer Version 2 human-face rendering system.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.025] dark:shadow-none">
            <ArrowRight
              size={17}
              className="text-[#b58a20] dark:text-[#D4AF37]"
            />

            <h3 className="mt-4 text-sm font-bold text-slate-900 dark:text-white">
              Profile Ready
            </h3>

            <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-white/30">
              This same saved Fashion Persona can now be rendered directly
              inside designer and creator profile pages.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}