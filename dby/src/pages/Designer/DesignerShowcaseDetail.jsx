import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  GitFork,
  ImageOff,
  Layers3,
  Loader2,
  Maximize2,
  Package,
  Palette,
  RefreshCw,
  Ruler,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Shirt,
  Sparkles,
  Tag,
  User,
  X,
} from "lucide-react";

import API from "../../api/axios";
import { useAuth } from "../../context/AuthContext";

const detailEndpoint = (slug) =>
  `/marketplace/product/${encodeURIComponent(slug)}`;

const ITEM_TYPES = [
  "T-Shirt",
  "Shirt",
  "Polo Shirt",
  "Blouse",
  "Top",
  "Tank Top",
  "Hoodie",
  "Sweatshirt",
  "Sweater",
  "Cardigan",
  "Jacket",
  "Blazer",
  "Coat",
  "Dress",
  "Gown",
  "Skirt",
  "Jeans",
  "Trousers",
  "Joggers",
  "Shorts",
  "Jumpsuit",
  "Romper",
  "Kurta",
  "Saree",
  "Lehenga",
  "Activewear Set",
  "Loungewear Set",
  "Sleepwear",
  "Swimwear",
  "Other",
];

const FIT_TYPES = [
  "Regular Fit",
  "Slim Fit",
  "Relaxed Fit",
  "Oversized / Loose Fit",
  "Tailored Fit",
];

const SIZE_CATEGORIES = ["Standard Size", "Plus Size", "Petite", "Tall"];

const AUDIENCE_TYPES = ["Women", "Men", "Unisex", "Kids"];

const MATERIAL_TYPES = [
  "100% Cotton",
  "Cotton Blend",
  "Denim",
  "Linen",
  "Silk",
  "Satin",
  "Polyester",
  "Fleece",
  "Wool",
  "Leather",
  "Stretch / Lycra",
  "Organic Fabric",
  "Recycled Fabric",
  "Other",
];

const WEAR_CATEGORIES = [
  "Casual Wear",
  "Formal Wear",
  "Party Wear",
  "Workwear",
  "Activewear / Gym",
  "Loungewear",
  "Traditional Wear",
  "Occasion Wear",
];

const STYLE_AESTHETICS = [
  "Minimalist / Basics",
  "Streetwear",
  "Classic",
  "Modern",
  "Luxury",
  "Vintage",
  "Bohemian",
  "Avant-Garde",
  "Sporty",
  "Preppy",
  "Y2K",
  "Sustainable / Organic",
];

const SEASONS = [
  "All Season",
  "Summer Essentials",
  "Winter Wear",
  "Spring",
  "Autumn / Fall",
];

/*=========================================================
General Helpers
=========================================================*/

function cleanText(value, fallback = "") {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function token(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function humanize(value) {
  return cleanText(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }

  const text = cleanText(value);

  if (!text) {
    return [];
  }

  try {
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
      return parsed.map((item) => cleanText(item)).filter(Boolean);
    }
  } catch {
    // Continue with PostgreSQL array or CSV parsing.
  }

  const content =
    text.startsWith("{") && text.endsWith("}") ? text.slice(1, -1) : text;

  return content
    .split(",")
    .map((item) => item.replace(/^"(.*)"$/, "$1").trim())
    .filter(Boolean);
}

function unique(values) {
  const seen = new Set();

  return values.filter((value) => {
    const key = token(value);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

function taxonomyValue(tags, options) {
  const tagSet = new Set(tags.map(token));

  return options.find((option) => tagSet.has(token(option))) || "";
}

function taxonomyValues(tags, options) {
  const tagSet = new Set(tags.map(token));

  return options.filter((option) => tagSet.has(token(option)));
}

function formatDate(value) {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "Recently published";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function backendOrigin() {
  const configured = cleanText(
    import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_BASE_URL,
  );

  if (/^https?:\/\//i.test(configured)) {
    return configured.replace(/\/api(?:\/v\d+)?\/?$/i, "").replace(/\/+$/, "");
  }

  if (
    typeof window !== "undefined" &&
    window.location.hostname === "localhost"
  ) {
    return "http://localhost:8080";
  }

  return typeof window !== "undefined" ? window.location.origin : "";
}

function mediaUrl(value) {
  const path = cleanText(value);

  if (!path) {
    return "";
  }

  if (path.startsWith("data:") || path.startsWith("blob:")) {
    return path;
  }

  if (/^https?:\/\//i.test(path)) {
    return path
      .replace("localhost:5000", "localhost:8080")
      .replace("localhost:8000", "localhost:8080")
      .replace(/\\/g, "/");
  }

  return `${backendOrigin()}/${path.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}

function extractAsset(response) {
  const body = response?.data;

  const candidates = [
    body?.data?.design,
    body?.data?.item,
    body?.data?.product,
    body?.data,
    body?.design,
    body?.item,
    body?.product,
    body,
  ];

  return (
    candidates.find(
      (candidate) =>
        candidate && typeof candidate === "object" && !Array.isArray(candidate),
    ) || null
  );
}

function normalizeAsset(raw) {
  const tags = unique(parseArray(raw?.tags));

  const submittedMaterials = unique(parseArray(raw?.materials));

  const sourceType = cleanText(raw?.source_type, "upload").toLowerCase();

  return {
    id: cleanText(raw?.id || raw?.design_id),

    slug: cleanText(raw?.slug || raw?.id || raw?.design_id),

    title: cleanText(raw?.title, "Untitled Design"),

    description: cleanText(
      raw?.description,
      "No design description was provided.",
    ),

    image: mediaUrl(
      raw?.watermarked_preview_url ||
        raw?.preview_url ||
        raw?.display_image_url ||
        raw?.image_url ||
        raw?.thumbnail_url,
    ),

    ownerId: cleanText(raw?.owner_id || raw?.designer_id || raw?.user_id),

    ownerName: cleanText(
      raw?.owner_name || raw?.designer_name || raw?.full_name || raw?.username,
      "Independent Designer",
    ),

    ownerAvatar: mediaUrl(
      raw?.owner_avatar ||
        raw?.designer_avatar ||
        raw?.profile_image_url ||
        raw?.profile_image,
    ),

    tags,

    materials:
      submittedMaterials.length > 0
        ? submittedMaterials
        : taxonomyValues(tags, MATERIAL_TYPES),

    itemType: cleanText(
      raw?.item_type || raw?.itemType || taxonomyValue(tags, ITEM_TYPES),
    ),

    fitType: cleanText(
      raw?.fit_type || raw?.fitType || taxonomyValue(tags, FIT_TYPES),
    ),

    sizeCategory: cleanText(
      raw?.size_category ||
        raw?.sizeCategory ||
        taxonomyValue(tags, SIZE_CATEGORIES),
    ),

    audience: cleanText(raw?.audience || taxonomyValue(tags, AUDIENCE_TYPES)),

    wearCategory: cleanText(
      raw?.wear_category ||
        raw?.wearCategory ||
        taxonomyValue(tags, WEAR_CATEGORIES),
    ),

    style: cleanText(
      raw?.style_aesthetic ||
        raw?.style_category ||
        taxonomyValue(tags, STYLE_AESTHETICS),
      "Creative Concept",
    ),

    season: cleanText(raw?.season || taxonomyValue(tags, SEASONS)),

    productType: cleanText(raw?.product_type, "Showcase Image"),

    licenseType: cleanText(raw?.license_type),

    sourceType,

    editorProjectId: cleanText(raw?.editor_project_id),

    isEditable: toBoolean(raw?.is_editable, false),

    allowRemix: toBoolean(raw?.allow_remix, false),

    originalDesignId: cleanText(raw?.original_design_id),

    originalDesignTitle: cleanText(raw?.original_design_title),

    originalDesignerName: cleanText(raw?.original_designer_name),

    createdAt: raw?.created_at || raw?.published_at || null,

    isPublic: toBoolean(raw?.is_public, true),

    isPublished: toBoolean(raw?.is_published, true),
  };
}

function requestError(error) {
  if (
    ["ERR_CANCELED", "CanceledError", "AbortError"].includes(
      error?.code || error?.name,
    )
  ) {
    return "";
  }

  if (error?.response?.status === 404) {
    return "This showcase design could not be found or is no longer public.";
  }

  if (error?.response?.status === 403) {
    return "You do not have permission to view this showcase design.";
  }

  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "The showcase design could not be loaded."
  );
}

async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);

    return;
  }

  const textarea = document.createElement("textarea");

  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";

  document.body.appendChild(textarea);

  textarea.select();

  const copied = document.execCommand("copy");

  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Unable to copy the link.");
  }
}

/*=========================================================
Reusable Components
=========================================================*/

function SafeImage({ src, alt, className = "", priority = false }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-slate-100 text-slate-300 dark:bg-white/[0.035] dark:text-white/15 ${className}`}
      >
        <ImageOff size={42} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

function InfoRow({ icon: Icon, label, value }) {
  if (!value) {
    return null;
  }

  return (
    <div className="flex items-start gap-3 border-b border-slate-100 py-4 last:border-0 dark:border-white/5">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/10 text-[#98761A] dark:text-[#D4AF37]">
        <Icon size={14} />
      </div>

      <div className="min-w-0">
        <p className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
          {label}
        </p>

        <p className="mt-1 text-sm font-medium text-slate-800 dark:text-white/80">
          {value}
        </p>
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, children, onClick, disabled, primary }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "bg-[#D4AF37] text-black shadow-[0_12px_35px_rgba(212,175,55,0.22)] hover:-translate-y-0.5 hover:bg-[#E2C45D]"
          : "border border-slate-200 bg-slate-50 text-slate-700 hover:border-[#D4AF37] hover:text-[#98761A] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60 dark:hover:text-[#D4AF37]"
      }`}
    >
      <Icon size={14} className={Icon === Loader2 ? "animate-spin" : ""} />

      {children}
    </button>
  );
}

/*=========================================================
Designer Showcase Detail
=========================================================*/

export default function DesignerShowcaseDetail() {
  const { slug } = useParams();

  const navigate = useNavigate();

  const { user } = useAuth();

  const [asset, setAsset] = useState(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [retry, setRetry] = useState(0);

  const [shareFeedback, setShareFeedback] = useState("");

  const [imageOpen, setImageOpen] = useState(false);

  const shareTimer = useRef(null);

  const currentUserId = cleanText(user?.id || user?._id);

  const isOwner = Boolean(currentUserId && asset?.ownerId === currentUserId);

  const isEditorDesign = Boolean(
    asset?.sourceType === "fashion_editor" &&
    asset?.isEditable === true &&
    asset?.editorProjectId,
  );

  const isManualUpload = asset?.sourceType === "upload";

  /*=====================================================
  Load Showcase Design
  =====================================================*/

  useEffect(() => {
    if (!slug) {
      setError("No showcase design was specified.");

      setLoading(false);

      return undefined;
    }

    const controller = new AbortController();

    let active = true;

    async function load() {
      setLoading(true);

      setError("");

      try {
        const response = await API.get(detailEndpoint(slug), {
          signal: controller.signal,
        });

        if (!active) {
          return;
        }

        const raw = extractAsset(response);

        if (!raw) {
          throw new Error("The server returned an invalid showcase record.");
        }

        const normalized = normalizeAsset(raw);

        if (!normalized.isPublic || !normalized.isPublished) {
          throw new Error(
            "This design is not currently available in the public showcase.",
          );
        }

        setAsset(normalized);
      } catch (loadError) {
        if (!active) {
          return;
        }

        const message = requestError(loadError);

        if (message) {
          setAsset(null);

          setError(message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;

      controller.abort();
    };
  }, [slug, retry]);

  /*=====================================================
  Browser Effects
  =====================================================*/

  useEffect(() => {
    if (!asset?.title) {
      return undefined;
    }

    const previous = document.title;

    document.title = `${asset.title} | DesignByYou`;

    return () => {
      document.title = previous;
    };
  }, [asset?.title]);

  useEffect(() => {
    return () => {
      if (shareTimer.current) {
        window.clearTimeout(shareTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!imageOpen) {
      return undefined;
    }

    const previous = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const close = (event) => {
      if (event.key === "Escape") {
        setImageOpen(false);
      }
    };

    window.addEventListener("keydown", close);

    return () => {
      document.body.style.overflow = previous;

      window.removeEventListener("keydown", close);
    };
  }, [imageOpen]);

  /*=====================================================
  Derived Data
  =====================================================*/

  const specifications = useMemo(() => {
    if (!asset) {
      return [];
    }

    return [
      [Shirt, "Clothing Item", asset.itemType],
      [Ruler, "Fit", asset.fitType],
      [Layers3, "Size Category", asset.sizeCategory],
      [User, "Audience", asset.audience],
      [Package, "Wear Category", asset.wearCategory],
      [CalendarDays, "Season", asset.season],
      [Eye, "Format", humanize(asset.productType) || "Showcase Image"],
      [
        isEditorDesign ? Layers3 : ImageOff,
        "Source",
        isEditorDesign ? "Fashion Editor Project" : "Image Upload",
      ],
      [ShieldCheck, "Visibility", "Public Showcase"],
    ];
  }, [asset, isEditorDesign]);

  /*=====================================================
  Actions
  =====================================================*/

  const back = () => {
    navigate("/designer/explore");
  };

  const showShareFeedback = (message) => {
    setShareFeedback(message);

    if (shareTimer.current) {
      window.clearTimeout(shareTimer.current);
    }

    shareTimer.current = window.setTimeout(() => {
      setShareFeedback("");
    }, 2500);
  };

  const share = async () => {
    if (!asset) {
      return;
    }

    const data = {
      title: asset.title,

      text: `View "${asset.title}" by ${asset.ownerName} on DesignByYou.`,

      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(data);

        showShareFeedback("Design shared");
      } else {
        await copyToClipboard(data.url);

        showShareFeedback("Link copied");
      }
    } catch (shareError) {
      if (shareError?.name === "AbortError") {
        return;
      }

      try {
        await copyToClipboard(data.url);

        showShareFeedback("Link copied");
      } catch {
        showShareFeedback("Unable to copy link");
      }
    }
  };

  /*=====================================================
  Loading State
  =====================================================*/

  if (loading) {
    return (
      <section className="relative flex min-h-[600px] items-center justify-center overflow-hidden rounded-[2rem] border border-slate-200 bg-white dark:border-white/5 dark:bg-[#090909]">
        <div className="absolute h-80 w-80 rounded-full bg-[#D4AF37]/10 blur-[130px]" />

        <div className="relative text-center">
          <Loader2 size={46} className="mx-auto animate-spin text-[#D4AF37]" />

          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.28em] text-[#98761A] dark:text-[#D4AF37]">
            Loading Showcase
          </p>
        </div>
      </section>
    );
  }

  /*=====================================================
  Error State
  =====================================================*/

  if (error || !asset) {
    return (
      <section className="relative flex min-h-[600px] items-center justify-center overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/5 dark:bg-[#090909]">
        <div className="relative max-w-lg text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-500 dark:border-rose-400/20 dark:bg-rose-400/10">
            <ShieldAlert size={27} />
          </div>

          <h1 className="mt-6 font-serif text-3xl text-slate-900 dark:text-white">
            Showcase unavailable
          </h1>

          <p className="mt-3 text-sm leading-7 text-slate-500 dark:text-white/40">
            {error || "This showcase design could not be loaded."}
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={back}
              className="inline-flex h-12 items-center gap-2 rounded-full border border-slate-300 px-5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-600 dark:border-white/10 dark:text-white/55"
            >
              <ArrowLeft size={14} />
              Back to Showcase
            </button>

            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[#D4AF37] px-5 text-[9px] font-black uppercase tracking-[0.18em] text-black"
            >
              <RefreshCw size={14} />
              Try Again
            </button>
          </div>
        </div>
      </section>
    );
  }

  /*=====================================================
  Main Showcase Detail
  =====================================================*/

  return (
    <>
      <section className="relative w-full overflow-hidden pb-12 text-slate-950 dark:text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-52 -top-52 h-[38rem] w-[38rem] rounded-full bg-[#D4AF37]/10 blur-[180px]" />

          <div className="absolute -bottom-52 -left-52 h-[38rem] w-[38rem] rounded-full bg-indigo-500/[0.06] blur-[180px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-[1450px]">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={back}
              className="group inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55"
            >
              <ArrowLeft
                size={14}
                className="transition group-hover:-translate-x-0.5"
              />
              Back to Showcase
            </button>

            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[8px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300 sm:inline-flex">
                <CheckCircle2 size={12} />
                Published Showcase
              </span>

              <button
                type="button"
                onClick={share}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-600 shadow-sm hover:border-[#D4AF37] hover:bg-[#D4AF37] hover:text-black dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55"
              >
                {shareFeedback === "Link copied" ? (
                  <Copy size={14} />
                ) : (
                  <Share2 size={14} />
                )}

                {shareFeedback || "Share"}
              </button>
            </div>
          </div>

          <article className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-[#0A0A0A] dark:shadow-[0_30px_90px_rgba(0,0,0,0.5)] sm:rounded-[2.75rem]">
            <div className="grid xl:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)]">
              <div className="relative min-h-[500px] overflow-hidden bg-slate-100 dark:bg-black sm:min-h-[640px] xl:min-h-[760px]">
                <SafeImage
                  src={asset.image}
                  alt={asset.title}
                  priority
                  className="h-full w-full object-cover"
                />

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />

                <div className="absolute left-5 right-5 top-5 flex items-start justify-between gap-3 sm:left-7 sm:right-7 sm:top-7">
                  <span className="max-w-[70%] truncate rounded-full border border-white/20 bg-black/45 px-3 py-2 text-[8px] font-black uppercase tracking-[0.18em] text-white backdrop-blur-xl">
                    {asset.style}
                  </span>

                  {isOwner && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4AF37]/50 bg-black/45 px-3 py-2 text-[8px] font-black uppercase tracking-[0.16em] text-[#F0D783] backdrop-blur-xl">
                      <ShieldCheck size={11} />
                      Your Design
                    </span>
                  )}
                </div>

                {asset.image && (
                  <button
                    type="button"
                    onClick={() => setImageOpen(true)}
                    className="absolute bottom-6 right-6 inline-flex h-11 items-center gap-2 rounded-full border border-white/20 bg-black/45 px-5 text-[9px] font-black uppercase tracking-[0.16em] text-white backdrop-blur-xl hover:bg-white hover:text-black"
                  >
                    <Maximize2 size={14} />
                    View Full Image
                  </button>
                )}
              </div>

              <div className="relative flex flex-col justify-center p-7 sm:p-10 lg:p-12 xl:p-14">
                <div className="relative z-10">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.26em] text-[#98761A] dark:text-[#D4AF37]">
                      <Sparkles size={13} />
                      Designer Showcase
                    </span>

                    <span className="h-px w-10 bg-[#D4AF37]/50" />

                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.15em] text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/40">
                      {isEditorDesign
                        ? "Fashion Editor Project"
                        : "Image Upload"}
                    </span>
                  </div>

                  <h1 className="mt-6 font-serif text-5xl leading-[0.98] tracking-[-0.04em] text-slate-950 dark:text-white sm:text-6xl xl:text-7xl">
                    {asset.title}
                  </h1>

                  <p className="mt-7 line-clamp-4 text-sm leading-7 text-slate-500 dark:text-white/45 sm:text-base sm:leading-8">
                    {asset.description}
                  </p>

                  <div className="mt-8 flex items-center gap-4 border-y border-slate-200 py-5 dark:border-white/10">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white/30">
                      {asset.ownerAvatar ? (
                        <SafeImage
                          src={asset.ownerAvatar}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <User size={19} />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/30">
                        Designed By
                      </p>

                      <p className="mt-1 truncate font-serif text-xl text-slate-900 dark:text-white">
                        {asset.ownerName}
                      </p>
                    </div>

                    <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.15em] text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300 sm:inline-flex">
                      <CheckCircle2 size={11} />
                      Verified Designer
                    </span>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-white/30">
                    <span className="inline-flex items-center gap-2">
                      <Clock3 size={12} />

                      {formatDate(asset.createdAt)}
                    </span>

                    <span className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-300">
                      <ShieldCheck size={12} />
                      Publicly Published
                    </span>

                    {isEditorDesign && (
                      <span className="inline-flex items-center gap-2 text-violet-600 dark:text-violet-300">
                        <Layers3 size={12} />
                        Fashion Editor
                      </span>
                    )}
                  </div>

                  {asset.tags.length > 0 && (
                    <div className="mt-7 flex flex-wrap gap-2">
                      {asset.tags.slice(0, 5).map((tag, index) => (
                        <span
                          key={`${tag}-${index}`}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/35"
                        >
                          #{humanize(tag)}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-9 grid gap-3 sm:grid-cols-2">
                    <ActionButton
                      icon={Eye}
                      primary
                      onClick={() => setImageOpen(true)}
                      disabled={!asset.image}
                    >
                      View Presentation
                    </ActionButton>

                    <ActionButton icon={Share2} onClick={share}>
                      Share Design
                    </ActionButton>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] xl:gap-14">
            <div className="min-w-0 space-y-10">
              <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-[#0A0A0A] sm:p-9">
                <div className="flex items-center gap-3 border-b border-slate-200 pb-5 dark:border-white/10">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/10 text-[#98761A] dark:text-[#D4AF37]">
                    <Sparkles size={15} />
                  </div>

                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#98761A] dark:text-[#D4AF37]">
                      Creative Brief
                    </p>

                    <h2 className="mt-1 font-serif text-2xl text-slate-900 dark:text-white">
                      The Vision
                    </h2>
                  </div>
                </div>

                <p className="mt-7 whitespace-pre-wrap font-serif text-xl font-light leading-relaxed text-slate-700 dark:text-white/70 sm:text-2xl">
                  {asset.description}
                </p>
              </section>

              {asset.materials.length > 0 && (
                <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-[#0A0A0A] sm:p-9">
                  <div className="flex items-center gap-3 border-b border-slate-200 pb-5 dark:border-white/10">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/10 text-[#98761A] dark:text-[#D4AF37]">
                      <Layers3 size={15} />
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#98761A] dark:text-[#D4AF37]">
                        Material Direction
                      </p>

                      <h2 className="mt-1 font-serif text-2xl text-slate-900 dark:text-white">
                        Proposed Materials
                      </h2>
                    </div>
                  </div>

                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    {asset.materials.map((material, index) => (
                      <div
                        key={`${material}-${index}`}
                        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/65"
                      >
                        <CheckCircle2
                          size={15}
                          className="shrink-0 text-[#98761A] dark:text-[#D4AF37]"
                        />

                        {material}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {asset.tags.length > 0 && (
                <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-[#0A0A0A] sm:p-9">
                  <div className="flex items-center gap-3 border-b border-slate-200 pb-5 dark:border-white/10">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/10 text-[#98761A] dark:text-[#D4AF37]">
                      <Tag size={15} />
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#98761A] dark:text-[#D4AF37]">
                        Search Discovery
                      </p>

                      <h2 className="mt-1 font-serif text-2xl text-slate-900 dark:text-white">
                        Design Identity
                      </h2>
                    </div>
                  </div>

                  <div className="mt-7 flex flex-wrap gap-2.5">
                    {asset.tags.map((tag, index) => (
                      <span
                        key={`${tag}-${index}`}
                        className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/40"
                      >
                        #{humanize(tag)}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {asset.originalDesignId && (
                <section className="rounded-[2rem] border border-violet-200 bg-violet-50 p-7 dark:border-violet-400/20 dark:bg-violet-400/10 sm:p-9">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200">
                      <GitFork size={17} />
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.22em] text-violet-700 dark:text-violet-200">
                        Remix Lineage
                      </p>

                      <h2 className="mt-2 font-serif text-2xl text-slate-900 dark:text-white">
                        Based on an earlier showcase design
                      </h2>

                      <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-white/55">
                        {asset.originalDesignTitle
                          ? `This project was remixed from “${asset.originalDesignTitle}”${
                              asset.originalDesignerName
                                ? ` by ${asset.originalDesignerName}`
                                : ""
                            }.`
                          : "This project was created as a remix of another published Fashion Editor design."}
                      </p>
                    </div>
                  </div>
                </section>
              )}
            </div>

            <aside className="h-fit space-y-6 lg:sticky lg:top-40">
              <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-lg dark:border-white/10 dark:bg-[#0A0A0A]">
                <p className="text-[9px] font-black uppercase tracking-[0.26em] text-[#98761A] dark:text-[#D4AF37]">
                  The Designer
                </p>

                <div className="mt-6 flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-slate-400 dark:border-white/10 dark:bg-white/5">
                    {asset.ownerAvatar ? (
                      <SafeImage
                        src={asset.ownerAvatar}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <User size={23} />
                    )}
                  </div>

                  <div className="min-w-0">
                    <h2 className="truncate font-serif text-2xl text-slate-900 dark:text-white">
                      {asset.ownerName}
                    </h2>

                    <p className="mt-1 inline-flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-300">
                      <CheckCircle2 size={11} />
                      Verified Designer
                    </p>
                  </div>
                </div>

                <div className="mt-7 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-center text-[9px] font-black uppercase tracking-[0.17em] text-slate-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/40">
                  {isOwner
                    ? "This is your published design"
                    : "Published designer showcase"}
                </div>
              </section>

              <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-lg dark:border-white/10 dark:bg-[#0A0A0A]">
                <div className="border-b border-slate-200 pb-5 dark:border-white/10">
                  <p className="text-[9px] font-black uppercase tracking-[0.26em] text-[#98761A] dark:text-[#D4AF37]">
                    Design Profile
                  </p>

                  <h2 className="mt-2 font-serif text-2xl text-slate-900 dark:text-white">
                    Showcase Details
                  </h2>
                </div>

                <div className="mt-2">
                  <InfoRow icon={Palette} label="Style" value={asset.style} />

                  {specifications.map(([Icon, label, value]) => (
                    <InfoRow
                      key={label}
                      icon={Icon}
                      label={label}
                      value={value}
                    />
                  ))}

                  <InfoRow
                    icon={Clock3}
                    label="Published"
                    value={formatDate(asset.createdAt)}
                  />
                </div>
              </section>

              {isManualUpload && (
                <section className="rounded-[2rem] border border-indigo-200 bg-indigo-50 p-6 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-200">
                  <div className="flex items-start gap-3">
                    <ShieldCheck size={18} className="mt-0.5 shrink-0" />

                    <div>
                      <p className="text-sm font-semibold">
                        Presentation-only upload
                      </p>

                      <p className="mt-2 text-xs leading-6 opacity-75">
                        This is a published image presentation from the Designer
                        Showcase.
                      </p>
                    </div>
                  </div>
                </section>
              )}
            </aside>
          </div>
        </div>
      </section>

      {imageOpen && asset.image && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${asset.title} full image`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setImageOpen(false);
            }
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-xl sm:p-8"
        >
          <button
            type="button"
            onClick={() => setImageOpen(false)}
            aria-label="Close full image"
            className="absolute right-5 top-5 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white hover:bg-white hover:text-black"
          >
            <X size={18} />
          </button>

          <div className="flex h-full max-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
            <SafeImage
              src={asset.image}
              alt={asset.title}
              priority
              className="max-h-full max-w-full rounded-xl object-contain shadow-[0_30px_100px_rgba(0,0,0,0.7)]"
            />
          </div>
        </div>
      )}
    </>
  );
}
