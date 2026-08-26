"use strict";

/*
=========================================================
DesignByYou
Designer Marketplace / Showcase
Version 5.2
=========================================================

PURPOSE
---------------------------------------------------------

Designer-facing public Showcase discovery.

This version supports the DesignerLayout global theme:

LIGHT MODE
- light page background
- white cards
- dark readable typography
- subtle neutral borders

DARK MODE
- original dark luxury presentation
- dark cards
- white typography

The main media Hero intentionally remains cinematic/dark
in BOTH themes so image/video contrast and Hero copy remain
consistent and readable.

=========================================================
SHARED SHOWCASE HERO
=========================================================

GET
/api/v1/showcase-hero

Super Admin may choose:

1. slideshow
   - 3 to 5 images
   - configurable rotation time

OR

2. video
   - one muted looping background video
   - optional poster image

Only one mode runs at a time.

The same Hero configuration is consumed by:

- CreatorShowcase.jsx
- DesignerMarketplace.jsx

If the shared Hero is disabled or unavailable, this page
falls back to its existing featured-design Hero image.

=========================================================
IMPORTANT
=========================================================

This file preserves the existing Designer Marketplace
backend behavior.

GET
/marketplace

Designer Marketplace remains VIEW / DISCOVERY oriented.

Designers are NOT routed into:

- Creator Fashion Editor
- Creator booking flow
- removed Designer Fashion Editor routes

Designer-owned work may be identified visually, but the
primary action remains View Design.
=========================================================
*/

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
  Eye,
  ImageOff,
  Layers3,
  Loader2,
  Palette,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  Tag,
  UploadCloud,
  User,
  X,
} from "lucide-react";

import API from "../../api/axios";

import { useAuth } from "../../context/AuthContext";

/*=========================================================
Configuration
=========================================================*/

const SHOWCASE_ENDPOINT = "/marketplace";

const HERO_ENDPOINT = "/showcase-hero";

const SEARCH_DELAY_MS = 400;

/*
This controls only the featured DESIGN metadata rotation.

The Super Admin slideshow background uses its own
rotation_seconds setting returned by /showcase-hero.
*/

const HERO_ROTATION_MS = 7000;

const FEATURED_DESIGN_LIMIT = 3;

const TRENDING_DESIGN_LIMIT = 8;

const STYLE_CATEGORIES = [
  "All",
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

const SORT_OPTIONS = [
  {
    value: "newest",
    label: "Newest First",
  },

  {
    value: "highest-rated",
    label: "Highest Rated",
  },

  {
    value: "oldest",
    label: "Oldest First",
  },

  {
    value: "title",
    label: "Title A–Z",
  },
];

/*=========================================================
Helpers
=========================================================*/

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

function parseNumericValue(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function parseTags(value) {
  if (Array.isArray(value)) {
    return value.map((tag) => cleanText(tag)).filter(Boolean);
  }

  const text = cleanText(value);

  if (!text) {
    return [];
  }

  try {
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
      return parsed.map((tag) => cleanText(tag)).filter(Boolean);
    }
  } catch {
    /*
    Continue with PostgreSQL-array / CSV parsing.
    */
  }

  const content =
    text.startsWith("{") && text.endsWith("}")
      ? text.slice(1, -1)
      : text;

  return content
    .split(",")
    .map((tag) => tag.replace(/^"(.*)"$/, "$1").trim())
    .filter(Boolean);
}

function uniqueTags(values) {
  const seen = new Set();

  return values.filter((value) => {
    const key = cleanText(value).toLowerCase();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

function getBackendOrigin() {
  const configuredUrl = cleanText(
    import.meta.env.VITE_BACKEND_URL ||
      import.meta.env.VITE_API_BASE_URL,
  );

  if (/^https?:\/\//i.test(configuredUrl)) {
    return configuredUrl
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

function extractShowcaseItems(response) {
  const body = response?.data;

  const candidates = [
    body?.data,

    body?.data?.designs,

    body?.data?.items,

    body?.designs,

    body?.items,

    body?.results,
  ];

  return candidates.find(Array.isArray) || [];
}

function normalizeShowcaseItem(item, index) {
  const id = cleanText(
    item?.id ||
      item?.design_id ||
      item?.slug ||
      `showcase-${index}`,
  );

  const sourceType = cleanText(
    item?.source_type,
    "upload",
  ).toLowerCase();

  return {
    raw: item,

    id,

    slug: cleanText(
      item?.slug ||
        item?.id ||
        item?.design_id,
    ),

    ownerId: cleanText(
      item?.owner_id ||
        item?.designer_id ||
        item?.user_id,
    ),

    ownerRole: cleanText(
      item?.owner_role,
    ),

    title: cleanText(
      item?.title,
      "Untitled Design",
    ),

    description: cleanText(
      item?.description,
      "A published fashion concept from the DesignByYou Showcase.",
    ),

    image: resolveMediaUrl(
      item?.watermarked_preview_url ||
        item?.preview_url ||
        item?.display_image_url ||
        item?.image_url ||
        item?.thumbnail_url,
    ),

    ownerName: cleanText(
      item?.owner_name ||
        item?.designer_name ||
        item?.full_name ||
        item?.username,

      "Independent Designer",
    ),

    ownerAvatar: resolveMediaUrl(
      item?.owner_avatar ||
        item?.designer_avatar ||
        item?.profile_image_url ||
        item?.profile_image,
    ),

    styleCategory: cleanText(
      item?.style_category ||
        item?.style_aesthetic,

      "Modern",
    ),

    tags: uniqueTags(
      parseTags(item?.tags),
    ),

    rating: parseNumericValue(
      item?.avg_rating ||
        item?.rating,

      0,
    ),

    reviewCount: parseNumericValue(
      item?.review_count ||
        item?.total_reviews,

      0,
    ),

    createdAt:
      item?.created_at ||
      item?.published_at ||
      null,

    isPublic: toBoolean(
      item?.is_public,
      true,
    ),

    isPublished: toBoolean(
      item?.is_published,
      true,
    ),

    sourceType,

    editorProjectId: cleanText(
      item?.editor_project_id,
    ),

    isEditable: toBoolean(
      item?.is_editable,
      false,
    ),

    allowRemix: toBoolean(
      item?.allow_remix,
      false,
    ),

    originalDesignId: cleanText(
      item?.original_design_id,
    ),
  };
}

/*=========================================================
Shared Hero Helpers
=========================================================*/

function normalizeHeroSettings(response) {
  const data =
    response?.data?.data || {};

  const images = Array.isArray(
    data.slideshow_images,
  )
    ? data.slideshow_images
        .map((value) =>
          resolveMediaUrl(value),
        )
        .filter(Boolean)
        .slice(0, 5)
    : [];

  const rotationSeconds = Number(
    data.rotation_seconds,
  );

  return {
    isEnabled:
      data.is_enabled === true,

    mode:
      data.mode === "video"
        ? "video"
        : "slideshow",

    images,

    videoUrl: resolveMediaUrl(
      data.video_url,
    ),

    posterUrl: resolveMediaUrl(
      data.video_poster_url,
    ),

    rotationSeconds:
      Number.isInteger(rotationSeconds) &&
      rotationSeconds >= 3 &&
      rotationSeconds <= 30
        ? rotationSeconds
        : 6,
  };
}

function isFashionEditorDesign(design) {
  return Boolean(
    design?.sourceType === "fashion_editor" &&
      design?.isEditable === true &&
      design?.editorProjectId,
  );
}

function getDesignAction(
  design,
  currentUserId,
) {
  const isOwnDesign = Boolean(
    currentUserId &&
      design?.ownerId &&
      currentUserId === design.ownerId,
  );

  return {
    type: "view",

    label: "View Design",

    Icon: Eye,

    isOwnDesign,

    editorDesign:
      isFashionEditorDesign(design),
  };
}

function getShowcaseRoute(design) {
  const identifier =
    design?.slug ||
    design?.id;

  if (!identifier) {
    return "/designer/explore";
  }

  return `/designer/showcase/${encodeURIComponent(
    identifier,
  )}`;
}

function formatPublishedDate(value) {
  if (!value) {
    return "Recently published";
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Recently published";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    },
  ).format(date);
}

function getRequestErrorMessage(error) {
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
    "Unable to connect to the Showcase."
  );
}

/*=========================================================
Reusable Components
=========================================================*/

function ShowcaseImage({
  src,
  alt,
  className = "",
  priority = false,
}) {
  const [failed, setFailed] =
    useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`
          flex
          h-full
          w-full
          items-center
          justify-center
          bg-slate-100
          text-slate-300

          dark:bg-white/[0.035]
          dark:text-white/15

          ${className}
        `}
      >
        <ImageOff
          size={34}
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={
        priority
          ? "eager"
          : "lazy"
      }
      fetchPriority={
        priority
          ? "high"
          : "auto"
      }
      decoding="async"
      onError={() =>
        setFailed(true)
      }
      className={className}
    />
  );
}

function ShowcaseSkeleton() {
  return (
    <div
      className="
        overflow-hidden
        rounded-[1.75rem]
        border
        border-slate-200
        bg-white
        shadow-sm

        dark:border-white/10
        dark:bg-[#111]
        dark:shadow-none
      "
    >
      <div
        className="
          aspect-[4/5]
          animate-pulse
          bg-slate-100

          dark:bg-white/[0.07]
        "
      />

      <div className="space-y-4 p-5">
        <div
          className="
            h-3
            w-24
            animate-pulse
            rounded-full
            bg-slate-100

            dark:bg-white/[0.07]
          "
        />

        <div
          className="
            h-6
            w-4/5
            animate-pulse
            rounded-full
            bg-slate-100

            dark:bg-white/[0.07]
          "
        />

        <div
          className="
            h-3
            w-1/2
            animate-pulse
            rounded-full
            bg-slate-100

            dark:bg-white/[0.07]
          "
        />

        <div
          className="
            h-11
            w-full
            animate-pulse
            rounded-xl
            bg-slate-100

            dark:bg-white/[0.07]
          "
        />
      </div>
    </div>
  );
}

function SourceBadge({ design }) {
  const editorDesign =
    isFashionEditorDesign(design);

  /*
  SourceBadge appears over artwork, therefore it remains a
  dark translucent overlay in both page themes.
  */

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] backdrop-blur-md ${
        editorDesign
          ? "border-violet-300/30 bg-violet-500/20 text-violet-100"
          : "border-white/15 bg-black/45 text-white/80"
      }`}
    >
      {editorDesign ? (
        <Layers3 size={10} />
      ) : (
        <ImageOff size={10} />
      )}

      {editorDesign
        ? "Fashion Editor"
        : "Image Upload"}
    </span>
  );
}

function PrimaryActionButton({
  design,
  currentUserId,
  onAction,
  compact = false,
}) {
  const action =
    getDesignAction(
      design,
      currentUserId,
    );

  const Icon = action.Icon;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();

        onAction(design);
      }}
      className={`inline-flex items-center justify-center gap-2 bg-[#e5c67d] font-black uppercase tracking-[0.16em] text-black transition hover:bg-amber-200 dark:hover:bg-white ${
        compact
          ? "h-10 rounded-xl px-4 text-[8px]"
          : "h-12 rounded-full px-7 text-[9px] hover:-translate-y-0.5"
      }`}
    >
      <Icon
        size={
          compact
            ? 12
            : 14
        }
      />

      {action.label}

      <ArrowRight size={13} />
    </button>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  action = null,
}) {
  return (
    <div
      className="
        mb-7
        flex
        flex-col
        gap-4

        md:flex-row
        md:items-end
        md:justify-between
      "
    >
      <div>
        {eyebrow && (
          <p
            className="
              text-[9px]
              font-black
              uppercase
              tracking-[0.3em]
              text-[#b88b20]

              dark:text-[#e5c67d]
            "
          >
            {eyebrow}
          </p>
        )}

        <h2
          className="
            mt-2
            font-serif
            text-3xl
            tracking-tight
            text-slate-900

            dark:text-white

            sm:text-4xl
          "
        >
          {title}
        </h2>

        {description && (
          <p
            className="
              mt-3
              max-w-2xl
              text-sm
              leading-6
              text-slate-500

              dark:text-white/42
            "
          >
            {description}
          </p>
        )}
      </div>

      {action}
    </div>
  );
}

/*=========================================================
Designer Marketplace
=========================================================*/

export default function DesignerMarketplace() {
  const navigate =
    useNavigate();

  const { user } =
    useAuth();

  const currentUserId =
    cleanText(
      user?.id ||
        user?._id,
    );

  /*=======================================================
  Showcase State
  =======================================================*/

  const [
    showcaseItems,
    setShowcaseItems,
  ] = useState([]);

  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

  const [
    debouncedSearch,
    setDebouncedSearch,
  ] = useState("");

  const [
    selectedCategory,
    setSelectedCategory,
  ] = useState("All");

  const [
    selectedSort,
    setSelectedSort,
  ] = useState("newest");

  const [
    currentSlide,
    setCurrentSlide,
  ] = useState(0);

  const [
    initialLoading,
    setInitialLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    refreshVersion,
    setRefreshVersion,
  ] = useState(0);

  /*=======================================================
  Shared Showcase Hero
  =======================================================*/

  const [
    heroSettings,
    setHeroSettings,
  ] = useState({
    isEnabled: false,

    mode: "slideshow",

    images: [],

    videoUrl: "",

    posterUrl: "",

    rotationSeconds: 6,
  });

  const [
    heroSlideIndex,
    setHeroSlideIndex,
  ] = useState(0);

  const [
    heroVideoFailed,
    setHeroVideoFailed,
  ] = useState(false);

  const [
    heroImageFailed,
    setHeroImageFailed,
  ] = useState(false);

  /*=======================================================
  Refs
  =======================================================*/

  const trendingCarouselRef =
    useRef(null);

  const directoryRef =
    useRef(null);

  const hasLoadedRef =
    useRef(false);

  /*=======================================================
  Debounced Search
  =======================================================*/

  useEffect(() => {
    const timer =
      window.setTimeout(
        () => {
          setDebouncedSearch(
            searchQuery.trim(),
          );
        },

        SEARCH_DELAY_MS,
      );

    return () =>
      window.clearTimeout(timer);
  }, [searchQuery]);

  /*=======================================================
  Fetch Shared Showcase Hero
  =======================================================*/

  useEffect(() => {
    const controller =
      new AbortController();

    const loadHero =
      async () => {
        try {
          const response =
            await API.get(
              HERO_ENDPOINT,
              {
                signal:
                  controller.signal,
              },
            );

          if (
            controller.signal.aborted
          ) {
            return;
          }

          setHeroSettings(
            normalizeHeroSettings(
              response,
            ),
          );

          setHeroSlideIndex(0);

          setHeroVideoFailed(
            false,
          );

          setHeroImageFailed(
            false,
          );
        } catch (error) {
          if (
            controller.signal.aborted ||
            error?.code ===
              "ERR_CANCELED" ||
            error?.name ===
              "CanceledError" ||
            error?.name ===
              "AbortError"
          ) {
            return;
          }

          if (
            import.meta.env.DEV
          ) {
            console.error(
              "Designer Marketplace Hero settings request failed:",
              error?.response?.data ||
                error,
            );
          }

          setHeroSettings({
            isEnabled: false,

            mode: "slideshow",

            images: [],

            videoUrl: "",

            posterUrl: "",

            rotationSeconds: 6,
          });

          setHeroSlideIndex(0);

          setHeroVideoFailed(
            false,
          );

          setHeroImageFailed(
            false,
          );
        }
      };

    void loadHero();

    return () => {
      controller.abort();
    };
  }, []);

  /*=======================================================
  Shared Hero Slideshow Rotation
  =======================================================*/

  useEffect(() => {
    if (
      !heroSettings.isEnabled ||
      heroSettings.mode !==
        "slideshow" ||
      heroSettings.images.length <
        2
    ) {
      return undefined;
    }

    const timer =
      window.setInterval(
        () => {
          setHeroSlideIndex(
            (current) =>
              (current + 1) %
              heroSettings.images.length,
          );

          setHeroImageFailed(
            false,
          );
        },

        heroSettings.rotationSeconds *
          1000,
      );

    return () => {
      window.clearInterval(
        timer,
      );
    };
  }, [
    heroSettings.images.length,
    heroSettings.isEnabled,
    heroSettings.mode,
    heroSettings.rotationSeconds,
  ]);

  /*=======================================================
  Fetch Showcase
  =======================================================*/

  useEffect(() => {
    const controller =
      new AbortController();

    let active = true;

    async function fetchShowcase() {
      if (
        hasLoadedRef.current
      ) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
      }

      setErrorMessage("");

      const params = {};

      if (debouncedSearch) {
        params.search =
          debouncedSearch;
      }

      if (
        selectedCategory !==
        "All"
      ) {
        params.style =
          selectedCategory;
      }

      try {
        const response =
          await API.get(
            SHOWCASE_ENDPOINT,
            {
              params,

              signal:
                controller.signal,
            },
          );

        if (!active) {
          return;
        }

        const normalized =
          extractShowcaseItems(
            response,
          )
            .map(
              normalizeShowcaseItem,
            )
            .filter(
              (design) =>
                design.isPublic &&
                design.isPublished,
            );

        const uniqueDesigns =
          Array.from(
            new Map(
              normalized.map(
                (design) => [
                  design.id ||
                    design.slug,

                  design,
                ],
              ),
            ).values(),
          );

        setShowcaseItems(
          uniqueDesigns,
        );

        hasLoadedRef.current =
          true;
      } catch (error) {
        if (!active) {
          return;
        }

        const message =
          getRequestErrorMessage(
            error,
          );

        if (message) {
          setErrorMessage(
            message,
          );
        }
      } finally {
        if (active) {
          setInitialLoading(
            false,
          );

          setRefreshing(
            false,
          );
        }
      }
    }

    void fetchShowcase();

    return () => {
      active = false;

      controller.abort();
    };
  }, [
    debouncedSearch,
    selectedCategory,
    refreshVersion,
  ]);

  /*=======================================================
  Filtering + Sorting
  =======================================================*/

  const visibleDesigns =
    useMemo(() => {
      const search =
        debouncedSearch.toLowerCase();

      const filtered =
        showcaseItems.filter(
          (design) => {
            const categoryMatches =
              selectedCategory ===
                "All" ||
              design.styleCategory
                .toLowerCase() ===
                selectedCategory.toLowerCase();

            if (
              !categoryMatches
            ) {
              return false;
            }

            if (!search) {
              return true;
            }

            const searchableText =
              [
                design.title,
                design.description,
                design.ownerName,
                design.styleCategory,
                design.sourceType,
                ...design.tags,
              ]
                .join(" ")
                .toLowerCase();

            return searchableText.includes(
              search,
            );
          },
        );

      return [...filtered].sort(
        (a, b) => {
          if (
            selectedSort ===
            "highest-rated"
          ) {
            return (
              b.rating -
              a.rating
            );
          }

          if (
            selectedSort ===
            "oldest"
          ) {
            return (
              new Date(
                a.createdAt || 0,
              ).getTime() -
              new Date(
                b.createdAt || 0,
              ).getTime()
            );
          }

          if (
            selectedSort ===
            "title"
          ) {
            return a.title.localeCompare(
              b.title,
            );
          }

          return (
            new Date(
              b.createdAt || 0,
            ).getTime() -
            new Date(
              a.createdAt || 0,
            ).getTime()
          );
        },
      );
    }, [
      showcaseItems,
      debouncedSearch,
      selectedCategory,
      selectedSort,
    ]);

  const featuredDesigns =
    useMemo(
      () =>
        visibleDesigns
          .filter((design) =>
            Boolean(
              design.image,
            ),
          )
          .slice(
            0,
            FEATURED_DESIGN_LIMIT,
          ),

      [visibleDesigns],
    );

  const trendingDesigns =
    useMemo(
      () =>
        [...visibleDesigns]
          .sort((a, b) => {
            if (
              b.rating !==
              a.rating
            ) {
              return (
                b.rating -
                a.rating
              );
            }

            return (
              new Date(
                b.createdAt || 0,
              ).getTime() -
              new Date(
                a.createdAt || 0,
              ).getTime()
            );
          })
          .slice(
            0,
            TRENDING_DESIGN_LIMIT,
          ),

      [visibleDesigns],
    );

  const statistics =
    useMemo(() => {
      const designers =
        new Set(
          visibleDesigns
            .map(
              (design) =>
                design.ownerId,
            )
            .filter(Boolean),
        );

      const editorDesigns =
        visibleDesigns.filter(
          isFashionEditorDesign,
        );

      return {
        designs:
          visibleDesigns.length,

        designers:
          designers.size,

        editorProjects:
          editorDesigns.length,
      };
    }, [visibleDesigns]);

  const activeHeroDesign =
    featuredDesigns[
      currentSlide
    ] || null;

  /*=======================================================
  Shared Hero Active Background
  =======================================================*/

  const sharedSlideshowActive =
    heroSettings.isEnabled &&
    heroSettings.mode ===
      "slideshow" &&
    heroSettings.images.length >
      0;

  const sharedVideoActive =
    heroSettings.isEnabled &&
    heroSettings.mode ===
      "video" &&
    Boolean(
      heroSettings.videoUrl,
    ) &&
    !heroVideoFailed;

  const currentSharedSlide =
    sharedSlideshowActive
      ? heroSettings.images[
          heroSlideIndex %
            Math.max(
              heroSettings.images.length,
              1,
            )
        ] || ""
      : "";

  const existingHeroImage =
    activeHeroDesign?.image ||
    "";

  const heroFallbackImage =
    heroSettings.isEnabled &&
    heroSettings.mode ===
      "video" &&
    heroSettings.posterUrl
      ? heroSettings.posterUrl
      : currentSharedSlide ||
        existingHeroImage;

  /*=======================================================
  Featured Design Metadata Rotation
  =======================================================*/

  useEffect(() => {
    if (
      currentSlide >=
      featuredDesigns.length
    ) {
      setCurrentSlide(0);
    }
  }, [
    currentSlide,
    featuredDesigns.length,
  ]);

  useEffect(() => {
    if (
      featuredDesigns.length <=
      1
    ) {
      return undefined;
    }

    const timer =
      window.setInterval(
        () => {
          setCurrentSlide(
            (previous) =>
              (previous + 1) %
              featuredDesigns.length,
          );
        },

        HERO_ROTATION_MS,
      );

    return () =>
      window.clearInterval(timer);
  }, [
    featuredDesigns.length,
  ]);

  useEffect(() => {
    setHeroImageFailed(
      false,
    );
  }, [heroFallbackImage]);

  /*=======================================================
  Actions
  =======================================================*/

  const openDesign =
    (design) => {
      navigate(
        getShowcaseRoute(
          design,
        ),
      );
    };

  const performPrimaryAction =
    (design) => {
      openDesign(design);
    };

  const refreshShowcase =
    () => {
      setRefreshVersion(
        (version) =>
          version + 1,
      );
    };

  const clearFilters =
    () => {
      setSearchQuery("");

      setDebouncedSearch("");

      setSelectedCategory(
        "All",
      );

      setSelectedSort(
        "newest",
      );
    };

  const applyCategory =
    (category) => {
      setSelectedCategory(
        category,
      );

      window.setTimeout(
        () => {
          directoryRef.current
            ?.scrollIntoView({
              behavior: "smooth",

              block: "start",
            });
        },

        80,
      );
    };

  const previousHeroSlide =
    () => {
      if (
        featuredDesigns.length <=
        1
      ) {
        return;
      }

      setCurrentSlide(
        (previous) =>
          (previous -
            1 +
            featuredDesigns.length) %
          featuredDesigns.length,
      );
    };

  const nextHeroSlide =
    () => {
      if (
        featuredDesigns.length <=
        1
      ) {
        return;
      }

      setCurrentSlide(
        (previous) =>
          (previous + 1) %
          featuredDesigns.length,
      );
    };

  const scrollTrending =
    (direction) => {
      const carousel =
        trendingCarouselRef.current;

      if (!carousel) {
        return;
      }

      const distance =
        Math.min(
          carousel.clientWidth *
            0.8,

          720,
        );

      carousel.scrollBy({
        left:
          direction === "left"
            ? -distance
            : distance,

        behavior: "smooth",
      });
    };

  /*=======================================================
  Render
  =======================================================*/

  return (
    <div
      className="
        relative
        min-h-screen
        overflow-x-hidden
        bg-[#f7f7f5]
        pb-28
        text-slate-900
        transition-colors
        duration-300
        selection:bg-[#e5c67d]
        selection:text-black

        dark:bg-[#080808]
        dark:text-white
      "
    >
      {/*===================================================
      Ambient Background
      ===================================================*/}

      <div
        aria-hidden="true"
        className="
          pointer-events-none
          fixed
          inset-0
          overflow-hidden
        "
      >
        <div
          className="
            absolute
            -left-56
            top-[28rem]
            h-[42rem]
            w-[42rem]
            rounded-full
            bg-[#e5c67d]/[0.10]
            blur-[170px]

            dark:bg-[#e5c67d]/[0.055]
          "
        />

        <div
          className="
            absolute
            -right-52
            top-[90rem]
            h-[38rem]
            w-[38rem]
            rounded-full
            bg-violet-400/[0.07]
            blur-[160px]

            dark:bg-violet-500/[0.05]
          "
        />
      </div>

      {/*===================================================
      FULL-WIDTH HERO

      Hero intentionally stays dark/cinematic regardless
      of global Designer theme.
      ===================================================*/}

      <div
        className="
          relative
          z-10
          w-full
          max-w-none
          pt-6
        "
      >
        <section
          className="
            relative
            min-h-[610px]
            w-full
            max-w-none
            overflow-hidden
            border-y
            border-white/10
            bg-[#101010]
            text-white
            shadow-[0_36px_120px_rgba(0,0,0,0.45)]

            dark:shadow-[0_36px_120px_rgba(0,0,0,0.7)]

            sm:min-h-[680px]

            lg:min-h-[720px]
          "
        >
          {/* Shared / Fallback Hero Media */}

          {sharedVideoActive ? (
            <video
              key={
                heroSettings.videoUrl
              }
              src={
                heroSettings.videoUrl
              }
              poster={
                heroSettings.posterUrl ||
                existingHeroImage ||
                undefined
              }
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-hidden="true"
              onError={() =>
                setHeroVideoFailed(
                  true,
                )
              }
              className="
                absolute
                inset-0
                h-full
                w-full
                object-cover
                opacity-55
              "
            />
          ) : heroFallbackImage &&
            !heroImageFailed ? (
            <img
              key={
                heroFallbackImage
              }
              src={
                heroFallbackImage
              }
              alt=""
              loading="eager"
              fetchPriority="high"
              decoding="async"
              onError={() =>
                setHeroImageFailed(
                  true,
                )
              }
              className="
                absolute
                inset-0
                h-full
                w-full
                object-cover
                opacity-50
                transition-opacity
                duration-700
              "
            />
          ) : null}

          {/* Hero overlays */}

          <div
            className="
              absolute
              inset-0
              bg-gradient-to-r
              from-[#070707]
              via-[#070707]/90
              to-[#070707]/20
            "
          />

          <div
            className="
              absolute
              inset-0
              bg-gradient-to-t
              from-[#080808]/95
              via-transparent
              to-black/25
            "
          />

          <div
            className="
              absolute
              inset-0
              bg-[radial-gradient(circle_at_75%_25%,rgba(229,198,125,0.2),transparent_30%)]
            "
          />

          {/* Hero content */}

          {activeHeroDesign ? (
            <>
              <div
                className="
                  relative
                  z-10
                  mx-auto
                  flex
                  min-h-[610px]
                  w-full
                  max-w-[1800px]
                  flex-col
                  justify-center
                  px-7
                  py-20

                  sm:min-h-[680px]
                  sm:px-12

                  md:px-16

                  lg:min-h-[720px]
                  lg:px-20
                "
              >
                <div
                  className="
                    flex
                    flex-wrap
                    items-center
                    gap-3
                  "
                >
                  <span
                    className="
                      inline-flex
                      items-center
                      gap-2
                      text-[10px]
                      font-black
                      uppercase
                      tracking-[0.34em]
                      text-[#e5c67d]
                    "
                  >
                    <Sparkles
                      size={14}
                    />

                    Designer Showcase
                  </span>

                  <span
                    className="
                      rounded-full
                      border
                      border-white/10
                      bg-white/[0.05]
                      px-3
                      py-1.5
                      text-[8px]
                      font-black
                      uppercase
                      tracking-[0.16em]
                      text-white/50
                      backdrop-blur
                    "
                  >
                    {
                      activeHeroDesign.styleCategory
                    }
                  </span>

                  {getDesignAction(
                    activeHeroDesign,
                    currentUserId,
                  ).isOwnDesign && (
                    <span
                      className="
                        inline-flex
                        items-center
                        gap-1.5
                        rounded-full
                        border
                        border-[#e5c67d]/30
                        bg-[#e5c67d]/10
                        px-3
                        py-1.5
                        text-[8px]
                        font-black
                        uppercase
                        tracking-[0.15em]
                        text-[#e5c67d]
                      "
                    >
                      <CheckCircle2
                        size={11}
                      />

                      Your Design
                    </span>
                  )}
                </div>

                <h1
                  className="
                    mt-7
                    max-w-5xl
                    font-serif
                    text-[3.8rem]
                    leading-[0.9]
                    tracking-[-0.055em]

                    sm:text-7xl

                    lg:text-[7rem]
                  "
                >
                  Discover
                  <br />

                  <span
                    className="
                      italic
                      text-[#e5c67d]
                    "
                  >
                    Creative Vision
                  </span>
                </h1>

                <p
                  className="
                    mt-8
                    max-w-xl
                    border-l
                    border-[#e5c67d]/50
                    pl-5
                    text-base
                    leading-8
                    text-white/65

                    sm:text-lg
                  "
                >
                  Explore published fashion concepts, discover creative
                  direction across the community, and share your own work.
                </p>

                <div
                  className="
                    mt-7
                    flex
                    flex-wrap
                    items-center
                    gap-x-5
                    gap-y-3
                    text-[9px]
                    font-bold
                    uppercase
                    tracking-[0.15em]
                    text-white/40
                  "
                >
                  <span
                    className="
                      flex
                      items-center
                      gap-2
                    "
                  >
                    <User size={13} />

                    {
                      activeHeroDesign.ownerName
                    }
                  </span>

                  <span
                    className="
                      flex
                      items-center
                      gap-2
                    "
                  >
                    <Clock3 size={13} />

                    {formatPublishedDate(
                      activeHeroDesign.createdAt,
                    )}
                  </span>

                  {activeHeroDesign.rating >
                    0 && (
                    <span
                      className="
                        flex
                        items-center
                        gap-2
                        text-[#e5c67d]
                      "
                    >
                      <Star
                        size={13}
                        fill="currentColor"
                      />

                      {activeHeroDesign.rating.toFixed(
                        1,
                      )}
                    </span>
                  )}
                </div>

                <div
                  className="
                    mt-10
                    flex
                    flex-wrap
                    gap-3
                  "
                >
                  <PrimaryActionButton
                    design={
                      activeHeroDesign
                    }
                    currentUserId={
                      currentUserId
                    }
                    onAction={
                      performPrimaryAction
                    }
                  />

                  <button
                    type="button"
                    onClick={() =>
                      directoryRef.current?.scrollIntoView(
                        {
                          behavior:
                            "smooth",
                        },
                      )
                    }
                    className="
                      inline-flex
                      h-12
                      items-center
                      justify-center
                      rounded-full
                      border
                      border-white/20
                      bg-white/[0.06]
                      px-7
                      text-[9px]
                      font-black
                      uppercase
                      tracking-[0.18em]
                      text-white
                      backdrop-blur
                      transition

                      hover:border-[#e5c67d]
                      hover:text-[#e5c67d]
                    "
                  >
                    Browse Collection
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        "/designer/upload",
                      )
                    }
                    className="
                      inline-flex
                      h-12
                      items-center
                      justify-center
                      gap-2
                      rounded-full
                      border
                      border-white/20
                      bg-white/[0.06]
                      px-7
                      text-[9px]
                      font-black
                      uppercase
                      tracking-[0.18em]
                      text-white
                      backdrop-blur
                      transition

                      hover:border-[#e5c67d]
                      hover:text-[#e5c67d]
                    "
                  >
                    <UploadCloud
                      size={14}
                    />

                    Publish Work
                  </button>
                </div>

                <p
                  className="
                    mt-10
                    max-w-lg
                    font-serif
                    text-xl
                    italic
                    text-white/38

                    sm:text-2xl
                  "
                >
                  “Create the work people remember.”
                </p>
              </div>

              {featuredDesigns.length >
                1 && (
                <div
                  className="
                    absolute
                    bottom-7
                    left-0
                    right-0
                    z-20
                    mx-auto
                    flex
                    w-full
                    max-w-[1800px]
                    items-center
                    justify-between
                    gap-4
                    px-7

                    sm:px-12

                    lg:px-20
                  "
                >
                  <div
                    className="
                      flex
                      items-center
                      gap-2
                    "
                  >
                    {featuredDesigns.map(
                      (
                        design,
                        index,
                      ) => (
                        <button
                          key={
                            design.id
                          }
                          type="button"
                          onClick={() =>
                            setCurrentSlide(
                              index,
                            )
                          }
                          aria-label={`Show featured design ${
                            index +
                            1
                          }`}
                          aria-current={
                            currentSlide ===
                            index
                          }
                          className={`h-1.5 rounded-full transition-all duration-500 ${
                            currentSlide ===
                            index
                              ? "w-10 bg-[#e5c67d]"
                              : "w-3 bg-white/25 hover:bg-white/50"
                          }`}
                        />
                      ),
                    )}
                  </div>

                  <div
                    className="
                      flex
                      items-center
                      gap-2
                    "
                  >
                    <button
                      type="button"
                      onClick={
                        previousHeroSlide
                      }
                      aria-label="Previous featured design"
                      className="
                        grid
                        h-11
                        w-11
                        place-items-center
                        rounded-full
                        border
                        border-white/10
                        bg-black/30
                        text-white/55
                        backdrop-blur
                        transition

                        hover:border-[#e5c67d]
                        hover:bg-[#e5c67d]
                        hover:text-black
                      "
                    >
                      <ChevronLeft
                        size={17}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={
                        nextHeroSlide
                      }
                      aria-label="Next featured design"
                      className="
                        grid
                        h-11
                        w-11
                        place-items-center
                        rounded-full
                        border
                        border-white/10
                        bg-black/30
                        text-white/55
                        backdrop-blur
                        transition

                        hover:border-[#e5c67d]
                        hover:bg-[#e5c67d]
                        hover:text-black
                      "
                    >
                      <ChevronRight
                        size={17}
                      />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div
              className="
                relative
                z-10
                mx-auto
                flex
                min-h-[610px]
                w-full
                max-w-[1800px]
                flex-col
                items-center
                justify-center
                px-8
                text-center

                sm:min-h-[680px]

                lg:min-h-[720px]
              "
            >
              <div
                className="
                  relative
                  z-10
                  flex
                  h-20
                  w-20
                  items-center
                  justify-center
                  rounded-full
                  border
                  border-[#e5c67d]/25
                  bg-[#e5c67d]/10
                  text-[#e5c67d]
                "
              >
                {initialLoading ? (
                  <Loader2
                    size={32}
                    className="animate-spin"
                  />
                ) : (
                  <Sparkles
                    size={32}
                  />
                )}
              </div>

              <p
                className="
                  relative
                  z-10
                  mt-7
                  text-[10px]
                  font-black
                  uppercase
                  tracking-[0.3em]
                  text-[#e5c67d]
                "
              >
                DesignByYou Showcase
              </p>

              <h1
                className="
                  relative
                  z-10
                  mt-4
                  max-w-3xl
                  font-serif
                  text-5xl
                  leading-tight
                  tracking-tight

                  sm:text-6xl
                "
              >
                Fashion concepts worth discovering.
              </h1>

              <p
                className="
                  relative
                  z-10
                  mt-5
                  max-w-xl
                  text-sm
                  leading-7
                  text-white/40
                "
              >
                Published work from across the DesignByYou community will appear
                here.
              </p>

              {!initialLoading && (
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      "/designer/upload",
                    )
                  }
                  className="
                    relative
                    z-10
                    mt-8
                    inline-flex
                    h-12
                    items-center
                    justify-center
                    gap-2
                    rounded-full
                    bg-[#e5c67d]
                    px-7
                    text-[9px]
                    font-black
                    uppercase
                    tracking-[0.2em]
                    text-black
                    transition

                    hover:bg-white
                  "
                >
                  <UploadCloud
                    size={15}
                  />

                  Publish a Design
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/*===================================================
      NORMAL THEME-AWARE PAGE CONTENT
      ===================================================*/}

      <div
        className="
          relative
          z-10
          mx-auto
          max-w-[1800px]
          px-4

          sm:px-6
          md:px-10
          lg:px-12
        "
      >
        {/*=================================================
        STATISTICS
        =================================================*/}

        <section
          className="
            relative
            z-20
            mx-3
            -mt-8
            grid
            grid-cols-3
            overflow-hidden
            rounded-2xl
            border
            border-slate-200
            bg-white/95
            shadow-xl
            backdrop-blur-2xl

            dark:border-white/10
            dark:bg-[#101010]/95

            sm:mx-8

            lg:mx-16
          "
        >
          {[
            {
              label:
                "Published Designs",

              value:
                statistics.designs,
            },

            {
              label:
                "Creative Profiles",

              value:
                statistics.designers,
            },

            {
              label:
                "Editor Projects",

              value:
                statistics.editorProjects,
            },
          ].map(
            (
              statistic,
              index,
            ) => (
              <div
                key={
                  statistic.label
                }
                className={`px-3 py-5 text-center sm:px-6 sm:py-6 ${
                  index > 0
                    ? "border-l border-slate-200 dark:border-white/10"
                    : ""
                }`}
              >
                <p
                  className="
                    font-serif
                    text-2xl
                    text-slate-900

                    dark:text-white

                    sm:text-3xl
                  "
                >
                  {
                    statistic.value
                  }
                </p>

                <p
                  className="
                    mt-1
                    text-[7px]
                    font-black
                    uppercase
                    tracking-[0.16em]
                    text-slate-400

                    dark:text-white/30

                    sm:text-[9px]
                    sm:tracking-[0.2em]
                  "
                >
                  {
                    statistic.label
                  }
                </p>
              </div>
            ),
          )}
        </section>

        {/*=================================================
        TRENDING SHOWCASE
        =================================================*/}

        {!initialLoading &&
          trendingDesigns.length >
            0 && (
            <section
              className="
                py-20

                sm:py-24
              "
            >
              <SectionHeading
                eyebrow="Now Inspiring"
                title="Trending Showcase"
                description="Creative work currently standing out across the DesignByYou community."
                action={
                  trendingDesigns.length >
                  1 ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          scrollTrending(
                            "left",
                          )
                        }
                        aria-label="Scroll trending designs left"
                        className="
                          grid
                          h-11
                          w-11
                          place-items-center
                          rounded-full
                          border
                          border-slate-200
                          bg-white
                          text-slate-500
                          shadow-sm
                          transition

                          hover:border-[#c99f3d]
                          hover:text-[#9f7314]

                          dark:border-white/10
                          dark:bg-white/[0.04]
                          dark:text-white/55
                          dark:shadow-none
                          dark:hover:border-[#e5c67d]
                          dark:hover:text-[#e5c67d]
                        "
                      >
                        <ChevronLeft
                          size={17}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          scrollTrending(
                            "right",
                          )
                        }
                        aria-label="Scroll trending designs right"
                        className="
                          grid
                          h-11
                          w-11
                          place-items-center
                          rounded-full
                          border
                          border-slate-200
                          bg-white
                          text-slate-500
                          shadow-sm
                          transition

                          hover:border-[#c99f3d]
                          hover:text-[#9f7314]

                          dark:border-white/10
                          dark:bg-white/[0.04]
                          dark:text-white/55
                          dark:shadow-none
                          dark:hover:border-[#e5c67d]
                          dark:hover:text-[#e5c67d]
                        "
                      >
                        <ChevronRight
                          size={17}
                        />
                      </button>
                    </div>
                  ) : null
                }
              />

              {/*
              Trending cards are image cards, so their
              overlays remain cinematic in both themes.
              */}

              <div
                ref={
                  trendingCarouselRef
                }
                className="
                  flex
                  snap-x
                  gap-5
                  overflow-x-auto
                  pb-3
                  [scrollbar-width:none]

                  [&::-webkit-scrollbar]:hidden
                "
              >
                {trendingDesigns.map(
                  (design) => {
                    const action =
                      getDesignAction(
                        design,
                        currentUserId,
                      );

                    return (
                      <article
                        key={
                          design.id
                        }
                        className="
                          group
                          min-w-[300px]
                          snap-start
                          overflow-hidden
                          rounded-[1.75rem]
                          border
                          border-slate-200
                          bg-white
                          shadow-sm
                          transition

                          hover:-translate-y-1
                          hover:border-[#d1ab52]
                          hover:shadow-lg

                          dark:border-white/10
                          dark:bg-[#111]
                          dark:shadow-none
                          dark:hover:border-[#e5c67d]/50

                          sm:min-w-[420px]
                        "
                      >
                        <button
                          type="button"
                          onClick={() =>
                            openDesign(
                              design,
                            )
                          }
                          className="
                            relative
                            block
                            aspect-[16/10]
                            w-full
                            overflow-hidden
                            text-left
                          "
                        >
                          <ShowcaseImage
                            src={
                              design.image
                            }
                            alt={
                              design.title
                            }
                            className="
                              h-full
                              w-full
                              object-cover
                              opacity-90
                              transition
                              duration-700

                              group-hover:scale-105

                              dark:opacity-80
                            "
                          />

                          <div
                            className="
                              absolute
                              inset-0
                              bg-gradient-to-t
                              from-black
                              via-black/15
                              to-transparent
                            "
                          />

                          <div
                            className="
                              absolute
                              left-4
                              top-4
                              flex
                              flex-wrap
                              gap-2
                            "
                          >
                            <SourceBadge
                              design={
                                design
                              }
                            />

                            {action.isOwnDesign && (
                              <span
                                className="
                                  inline-flex
                                  items-center
                                  gap-1
                                  rounded-full
                                  border
                                  border-[#e5c67d]/40
                                  bg-black/50
                                  px-2.5
                                  py-1
                                  text-[8px]
                                  font-black
                                  uppercase
                                  tracking-[0.14em]
                                  text-[#e5c67d]
                                  backdrop-blur
                                "
                              >
                                <CheckCircle2
                                  size={10}
                                />

                                Yours
                              </span>
                            )}
                          </div>

                          <div
                            className="
                              absolute
                              inset-x-0
                              bottom-0
                              p-5
                              text-white
                            "
                          >
                            <p
                              className="
                                text-[8px]
                                font-black
                                uppercase
                                tracking-[0.18em]
                                text-[#e5c67d]
                              "
                            >
                              {
                                design.styleCategory
                              }
                            </p>

                            <div
                              className="
                                mt-2
                                flex
                                items-end
                                justify-between
                                gap-4
                              "
                            >
                              <div className="min-w-0">
                                <h3
                                  className="
                                    truncate
                                    font-serif
                                    text-2xl
                                  "
                                >
                                  {
                                    design.title
                                  }
                                </h3>

                                <p
                                  className="
                                    mt-1
                                    truncate
                                    text-[9px]
                                    font-bold
                                    uppercase
                                    tracking-[0.14em]
                                    text-white/50
                                  "
                                >
                                  By{" "}
                                  {
                                    design.ownerName
                                  }
                                </p>
                              </div>

                              <span
                                className="
                                  grid
                                  h-10
                                  w-10
                                  shrink-0
                                  place-items-center
                                  rounded-full
                                  border
                                  border-white/20
                                  bg-white/10
                                  transition

                                  group-hover:bg-[#e5c67d]
                                  group-hover:text-black
                                "
                              >
                                <ArrowRight
                                  size={15}
                                />
                              </span>
                            </div>
                          </div>
                        </button>
                      </article>
                    );
                  },
                )}
              </div>
            </section>
          )}

        {/*=================================================
        BROWSE BY STYLE
        =================================================*/}

        <section
          className="
            border-t
            border-slate-200
            py-20

            dark:border-white/[0.07]

            sm:py-24
          "
        >
          <SectionHeading
            eyebrow="Find Your Language"
            title="Browse by Style"
            description="Explore the Showcase through different visual identities and creative directions."
          />

          <div
            className="
              grid
              grid-cols-2
              gap-3

              sm:grid-cols-4

              xl:grid-cols-7
            "
          >
            {STYLE_CATEGORIES.filter(
              (category) =>
                category !==
                "All",
            ).map(
              (
                category,
                index,
              ) => (
                <button
                  key={
                    category
                  }
                  type="button"
                  onClick={() =>
                    applyCategory(
                      category,
                    )
                  }
                  className={`group min-h-[135px] rounded-[1.5rem] border p-4 text-left shadow-sm transition hover:-translate-y-1 dark:shadow-none ${
                    selectedCategory ===
                    category
                      ? "border-[#c89f3d] bg-[#fff8e5] dark:border-[#e5c67d] dark:bg-[#e5c67d]/10"
                      : "border-slate-200 bg-white hover:border-[#d1ab52] hover:bg-[#fffaf0] dark:border-white/10 dark:bg-white/[0.025] dark:hover:border-[#e5c67d]/55 dark:hover:bg-[#e5c67d]/[0.07]"
                  }`}
                >
                  <span
                    className="
                      text-[9px]
                      font-black
                      tracking-[0.15em]
                      text-slate-300

                      dark:text-white/20
                    "
                  >
                    {String(
                      index + 1,
                    ).padStart(
                      2,
                      "0",
                    )}
                  </span>

                  <Palette
                    size={18}
                    className="
                      mt-6
                      text-[#b88b20]

                      dark:text-[#e5c67d]/70
                    "
                  />

                  <p
                    className="
                      mt-3
                      font-serif
                      text-base
                      text-slate-800
                      transition

                      group-hover:text-[#9f7314]

                      dark:text-white
                      dark:group-hover:text-[#e5c67d]
                    "
                  >
                    {category}
                  </p>
                </button>
              ),
            )}
          </div>
        </section>

        {/*=================================================
        INSPIRATION DIRECTORY
        =================================================*/}

        <section
          ref={directoryRef}
          id="showcase-directory"
          className="
            scroll-mt-28
            border-t
            border-slate-200
            py-20

            dark:border-white/[0.07]

            sm:py-24
          "
        >
          <div
            className="
              flex
              flex-col
              gap-6

              xl:flex-row
              xl:items-end
              xl:justify-between
            "
          >
            <div>
              <div
                className="
                  flex
                  items-center
                  gap-2
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.3em]
                  text-[#b88b20]

                  dark:text-[#e5c67d]
                "
              >
                <Compass size={13} />

                The Inspiration Directory
              </div>

              <h2
                className="
                  mt-3
                  font-serif
                  text-4xl
                  tracking-tight
                  text-slate-900

                  dark:text-white

                  sm:text-5xl
                "
              >
                Discover what&apos;s next.
              </h2>

              <p
                className="
                  mt-3
                  max-w-xl
                  text-sm
                  leading-7
                  text-slate-500

                  dark:text-white/40
                "
              >
                Browse published work from across the platform and discover new
                creative directions.
              </p>
            </div>

            <div
              className="
                flex
                w-full
                flex-col
                gap-3

                sm:flex-row

                xl:w-auto
              "
            >
              <label
                className="
                  relative
                  block
                  w-full

                  sm:min-w-[320px]

                  xl:w-[380px]
                "
              >
                <span className="sr-only">
                  Search Showcase designs
                </span>

                <Search
                  size={16}
                  className="
                    pointer-events-none
                    absolute
                    left-5
                    top-1/2
                    -translate-y-1/2
                    text-slate-400

                    dark:text-white/30
                  "
                />

                <input
                  type="search"
                  value={
                    searchQuery
                  }
                  onChange={(event) =>
                    setSearchQuery(
                      event.target.value,
                    )
                  }
                  placeholder="Search designs or creators"
                  autoComplete="off"
                  className="
                    h-[52px]
                    w-full
                    rounded-full
                    border
                    border-slate-200
                    bg-white
                    py-3.5
                    pl-12
                    pr-12
                    text-sm
                    text-slate-900
                    shadow-sm
                    outline-none
                    transition
                    placeholder:text-slate-400

                    focus:border-[#c89f3d]
                    focus:ring-4
                    focus:ring-[#e5c67d]/10

                    dark:border-white/10
                    dark:bg-white/[0.04]
                    dark:text-white
                    dark:shadow-none
                    dark:placeholder:text-white/25
                    dark:focus:border-[#e5c67d]
                  "
                />

                {searchQuery && (
                  <button
                    type="button"
                    onClick={() =>
                      setSearchQuery("")
                    }
                    aria-label="Clear search"
                    className="
                      absolute
                      right-4
                      top-1/2
                      flex
                      h-7
                      w-7
                      -translate-y-1/2
                      items-center
                      justify-center
                      rounded-full
                      text-slate-400
                      transition

                      hover:bg-slate-100
                      hover:text-slate-800

                      dark:text-white/30
                      dark:hover:bg-white/10
                      dark:hover:text-white
                    "
                  >
                    <X size={14} />
                  </button>
                )}
              </label>

              <select
                value={
                  selectedSort
                }
                onChange={(event) =>
                  setSelectedSort(
                    event.target.value,
                  )
                }
                aria-label="Sort Showcase designs"
                className="
                  min-h-[52px]
                  w-full
                  rounded-full
                  border
                  border-slate-200
                  bg-white
                  px-5
                  text-[10px]
                  font-black
                  uppercase
                  tracking-[0.15em]
                  text-slate-600
                  shadow-sm
                  outline-none
                  transition

                  focus:border-[#c89f3d]
                  focus:ring-4
                  focus:ring-[#e5c67d]/10

                  dark:border-white/10
                  dark:bg-[#111]
                  dark:text-white/60
                  dark:shadow-none
                  dark:focus:border-[#e5c67d]

                  sm:w-[190px]
                "
              >
                {SORT_OPTIONS.map(
                  (option) => (
                    <option
                      key={
                        option.value
                      }
                      value={
                        option.value
                      }
                    >
                      {option.label}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          {/* Category Chips */}

          <div
            className="
              mt-7
              flex
              items-center
              gap-2
              overflow-x-auto
              pb-2
              [scrollbar-width:none]

              [&::-webkit-scrollbar]:hidden
            "
          >
            {STYLE_CATEGORIES.map(
              (category) => (
                <button
                  key={
                    category
                  }
                  type="button"
                  onClick={() =>
                    setSelectedCategory(
                      category,
                    )
                  }
                  className={`shrink-0 rounded-full border px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.14em] transition ${
                    selectedCategory ===
                    category
                      ? "border-[#c89f3d] bg-[#e5c67d] text-black"
                      : "border-slate-200 bg-white text-slate-500 hover:border-[#c89f3d] hover:text-[#9f7314] dark:border-white/10 dark:bg-white/[0.035] dark:text-white/40 dark:hover:border-[#e5c67d]/50 dark:hover:text-[#e5c67d]"
                  }`}
                >
                  {category}
                </button>
              ),
            )}
          </div>

          {/* Status Bar */}

          <div
            className="
              mt-8
              flex
              flex-wrap
              items-center
              justify-between
              gap-4
              border-y
              border-slate-200
              py-4

              dark:border-white/[0.07]
            "
          >
            <p
              className="
                text-[9px]
                font-black
                uppercase
                tracking-[0.18em]
                text-slate-400

                dark:text-white/30
              "
            >
              {initialLoading
                ? "Loading collection"
                : `${visibleDesigns.length} design${
                    visibleDesigns.length ===
                    1
                      ? ""
                      : "s"
                  } found`}
            </p>

            <div
              className="
                flex
                items-center
                gap-3
              "
            >
              {refreshing && (
                <span
                  className="
                    inline-flex
                    items-center
                    gap-2
                    text-[8px]
                    font-bold
                    uppercase
                    tracking-[0.14em]
                    text-[#b88b20]

                    dark:text-[#e5c67d]
                  "
                >
                  <Loader2
                    size={12}
                    className="animate-spin"
                  />

                  Refreshing
                </span>
              )}

              <button
                type="button"
                onClick={
                  refreshShowcase
                }
                disabled={
                  refreshing
                }
                className="
                  inline-flex
                  h-10
                  items-center
                  gap-2
                  rounded-full
                  border
                  border-slate-200
                  bg-white
                  px-4
                  text-[8px]
                  font-black
                  uppercase
                  tracking-[0.15em]
                  text-slate-500
                  shadow-sm
                  transition

                  hover:border-[#c89f3d]
                  hover:text-[#9f7314]

                  disabled:opacity-50

                  dark:border-white/10
                  dark:bg-white/[0.035]
                  dark:text-white/40
                  dark:shadow-none
                  dark:hover:border-[#e5c67d]
                  dark:hover:text-[#e5c67d]
                "
              >
                <RefreshCw
                  size={13}
                  className={
                    refreshing
                      ? "animate-spin"
                      : ""
                  }
                />

                Refresh
              </button>
            </div>
          </div>

          {/* Error */}

          {errorMessage && (
            <div
              className="
                mt-8
                flex
                flex-col
                items-center
                justify-between
                gap-4
                rounded-2xl
                border
                border-rose-200
                bg-rose-50
                px-5
                py-5
                text-rose-700

                dark:border-rose-400/20
                dark:bg-rose-400/10
                dark:text-rose-200

                sm:flex-row
              "
            >
              <div
                className="
                  flex
                  items-start
                  gap-3
                "
              >
                <ShieldAlert
                  size={18}
                  className="
                    mt-0.5
                    shrink-0
                  "
                />

                <div>
                  <p className="text-sm font-semibold">
                    Showcase unavailable
                  </p>

                  <p
                    className="
                      mt-1
                      text-xs
                      leading-6
                      opacity-80
                    "
                  >
                    {errorMessage}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={
                  refreshShowcase
                }
                className="
                  inline-flex
                  h-10
                  shrink-0
                  items-center
                  gap-2
                  rounded-full
                  bg-rose-600
                  px-4
                  text-[8px]
                  font-black
                  uppercase
                  tracking-[0.15em]
                  text-white
                "
              >
                <RefreshCw
                  size={13}
                />

                Try Again
              </button>
            </div>
          )}

          {/*=================================================
          DESIGN GRID
          =================================================*/}

          {initialLoading ? (
            <div
              className="
                mt-8
                grid
                gap-5

                sm:grid-cols-2

                lg:grid-cols-3

                xl:grid-cols-4
              "
            >
              {Array.from({
                length: 8,
              }).map(
                (
                  _,
                  index,
                ) => (
                  <ShowcaseSkeleton
                    key={index}
                  />
                ),
              )}
            </div>
          ) : visibleDesigns.length >
            0 ? (
            <div
              className="
                mt-8
                grid
                gap-5

                sm:grid-cols-2

                lg:grid-cols-3

                xl:grid-cols-4
              "
            >
              {visibleDesigns.map(
                (design) => {
                  const action =
                    getDesignAction(
                      design,

                      currentUserId,
                    );

                  return (
                    <article
                      key={
                        design.id
                      }
                      className="
                        group
                        overflow-hidden
                        rounded-[1.75rem]
                        border
                        border-slate-200
                        bg-white
                        shadow-sm
                        transition
                        duration-500

                        hover:-translate-y-1
                        hover:border-[#d1ab52]
                        hover:shadow-xl

                        dark:border-white/10
                        dark:bg-[#111]
                        dark:shadow-none
                        dark:hover:border-[#e5c67d]/50
                        dark:hover:shadow-[0_24px_60px_rgba(0,0,0,0.45)]
                      "
                    >
                      <button
                        type="button"
                        onClick={() =>
                          openDesign(
                            design,
                          )
                        }
                        className="
                          relative
                          block
                          aspect-[4/5]
                          w-full
                          overflow-hidden
                          text-left
                        "
                      >
                        <ShowcaseImage
                          src={
                            design.image
                          }
                          alt={
                            design.title
                          }
                          className="
                            h-full
                            w-full
                            object-cover
                            transition
                            duration-700

                            group-hover:scale-[1.05]
                          "
                        />

                        <div
                          className="
                            absolute
                            inset-0
                            bg-gradient-to-t
                            from-black/85
                            via-transparent
                            to-black/5
                          "
                        />

                        <div
                          className="
                            absolute
                            left-4
                            right-4
                            top-4
                            flex
                            flex-wrap
                            items-start
                            justify-between
                            gap-2
                          "
                        >
                          <SourceBadge
                            design={
                              design
                            }
                          />

                          {action.isOwnDesign && (
                            <span
                              className="
                                inline-flex
                                items-center
                                gap-1
                                rounded-full
                                border
                                border-[#e5c67d]/40
                                bg-black/50
                                px-2.5
                                py-1
                                text-[8px]
                                font-black
                                uppercase
                                tracking-[0.14em]
                                text-[#e5c67d]
                                backdrop-blur
                              "
                            >
                              <CheckCircle2
                                size={10}
                              />

                              Your Design
                            </span>
                          )}
                        </div>

                        <div
                          className="
                            absolute
                            bottom-4
                            left-4
                            right-4
                          "
                        >
                          <span
                            className="
                              rounded-full
                              bg-black/55
                              px-3
                              py-1.5
                              text-[8px]
                              font-bold
                              text-[#e5c67d]
                              backdrop-blur
                            "
                          >
                            {
                              design.styleCategory
                            }
                          </span>
                        </div>
                      </button>

                      <div className="p-5">
                        <div
                          className="
                            flex
                            items-start
                            justify-between
                            gap-3
                          "
                        >
                          <div
                            className="
                              min-w-0
                              flex-1
                            "
                          >
                            <p
                              className="
                                text-[8px]
                                font-black
                                uppercase
                                tracking-[0.18em]
                                text-[#b88b20]

                                dark:text-[#e5c67d]
                              "
                            >
                              {
                                design.styleCategory
                              }
                            </p>

                            <button
                              type="button"
                              onClick={() =>
                                openDesign(
                                  design,
                                )
                              }
                              className="
                                block
                                w-full
                                text-left
                              "
                            >
                              <h3
                                className="
                                  mt-2
                                  line-clamp-2
                                  font-serif
                                  text-2xl
                                  leading-tight
                                  text-slate-900
                                  transition

                                  hover:text-[#9f7314]

                                  dark:text-white
                                  dark:hover:text-[#e5c67d]
                                "
                              >
                                {
                                  design.title
                                }
                              </h3>
                            </button>
                          </div>

                          {design.rating >
                            0 && (
                            <span
                              className="
                                inline-flex
                                shrink-0
                                items-center
                                gap-1
                                rounded-full
                                bg-[#e5c67d]/15
                                px-2.5
                                py-1.5
                                text-[9px]
                                font-bold
                                text-[#9f7314]

                                dark:bg-[#e5c67d]/10
                                dark:text-[#e5c67d]
                              "
                            >
                              <Star
                                size={11}
                                fill="currentColor"
                              />

                              {design.rating.toFixed(
                                1,
                              )}
                            </span>
                          )}
                        </div>

                        <p
                          className="
                            mt-3
                            line-clamp-2
                            text-xs
                            leading-6
                            text-slate-500

                            dark:text-white/40
                          "
                        >
                          {
                            design.description
                          }
                        </p>

                        {/* Owner */}

                        <div
                          className="
                            mt-4
                            flex
                            items-center
                            gap-3
                            border-y
                            border-slate-100
                            py-3

                            dark:border-white/[0.06]
                          "
                        >
                          <div
                            className="
                              flex
                              h-9
                              w-9
                              shrink-0
                              items-center
                              justify-center
                              overflow-hidden
                              rounded-full
                              border
                              border-slate-200
                              bg-slate-50
                              text-slate-400

                              dark:border-white/10
                              dark:bg-white/[0.05]
                              dark:text-white/25
                            "
                          >
                            {design.ownerAvatar ? (
                              <ShowcaseImage
                                src={
                                  design.ownerAvatar
                                }
                                alt=""
                                className="
                                  h-full
                                  w-full
                                  object-cover
                                "
                              />
                            ) : (
                              <User
                                size={14}
                              />
                            )}
                          </div>

                          <div className="min-w-0">
                            <p
                              className="
                                truncate
                                text-xs
                                font-semibold
                                text-slate-700

                                dark:text-white/65
                              "
                            >
                              {
                                design.ownerName
                              }
                            </p>

                            <p
                              className="
                                mt-0.5
                                text-[8px]
                                font-bold
                                uppercase
                                tracking-[0.14em]
                                text-slate-400

                                dark:text-white/25
                              "
                            >
                              {formatPublishedDate(
                                design.createdAt,
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Tags */}

                        {design.tags.length >
                          0 && (
                          <div
                            className="
                              mt-4
                              flex
                              flex-wrap
                              gap-1.5
                            "
                          >
                            {design.tags
                              .slice(
                                0,
                                3,
                              )
                              .map(
                                (tag) => (
                                  <span
                                    key={`${design.id}-${tag}`}
                                    className="
                                      inline-flex
                                      max-w-full
                                      items-center
                                      gap-1
                                      rounded-full
                                      bg-slate-100
                                      px-2.5
                                      py-1.5
                                      text-[8px]
                                      font-bold
                                      uppercase
                                      tracking-[0.1em]
                                      text-slate-500

                                      dark:bg-white/[0.05]
                                      dark:text-white/35
                                    "
                                  >
                                    <Tag
                                      size={9}
                                    />

                                    <span className="truncate">
                                      {tag}
                                    </span>
                                  </span>
                                ),
                              )}
                          </div>
                        )}

                        <div className="mt-5">
                          <PrimaryActionButton
                            design={
                              design
                            }
                            currentUserId={
                              currentUserId
                            }
                            onAction={
                              performPrimaryAction
                            }
                            compact
                          />
                        </div>
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          ) : (
            <div
              className="
                mt-8
                flex
                min-h-[360px]
                flex-col
                items-center
                justify-center
                rounded-[2rem]
                border
                border-dashed
                border-slate-300
                bg-white/60
                px-6
                text-center

                dark:border-white/15
                dark:bg-white/[0.02]
              "
            >
              <div
                className="
                  flex
                  h-16
                  w-16
                  items-center
                  justify-center
                  rounded-full
                  border
                  border-[#c89f3d]/30
                  bg-[#e5c67d]/15
                  text-[#9f7314]

                  dark:border-[#e5c67d]/25
                  dark:bg-[#e5c67d]/10
                  dark:text-[#e5c67d]
                "
              >
                <Compass
                  size={26}
                />
              </div>

              <h3
                className="
                  mt-6
                  font-serif
                  text-3xl
                  text-slate-900

                  dark:text-white
                "
              >
                No designs match your filters.
              </h3>

              <p
                className="
                  mt-3
                  max-w-md
                  text-sm
                  leading-7
                  text-slate-500

                  dark:text-white/40
                "
              >
                Clear the search and style filters to return to the complete
                Showcase.
              </p>

              <button
                type="button"
                onClick={
                  clearFilters
                }
                className="
                  mt-7
                  inline-flex
                  h-11
                  items-center
                  gap-2
                  rounded-full
                  bg-[#e5c67d]
                  px-5
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.18em]
                  text-black
                  transition

                  hover:bg-amber-200

                  dark:hover:bg-white
                "
              >
                <RefreshCw
                  size={14}
                />

                Clear Filters
              </button>
            </div>
          )}
        </section>

        {/*=================================================
        PUBLISH YOUR WORK
        =================================================*/}

        <section
          className="
            relative
            mt-8
            overflow-hidden
            rounded-[2.5rem]
            border
            border-[#d8ba71]/50
            bg-white
            px-6
            py-16
            text-center
            shadow-sm

            dark:border-[#e5c67d]/20
            dark:bg-[#111]
            dark:shadow-none

            sm:px-10
            sm:py-20

            lg:px-16
            lg:py-24
          "
        >
          <div
            aria-hidden="true"
            className="
              absolute
              left-1/2
              top-1/2
              h-[32rem]
              w-[32rem]
              -translate-x-1/2
              -translate-y-1/2
              rounded-full
              bg-[#e5c67d]/[0.12]
              blur-[120px]

              dark:bg-[#e5c67d]/[0.08]
            "
          />

          <div
            className="
              relative
              z-10
              mx-auto
              max-w-4xl
            "
          >
            <UploadCloud
              size={25}
              className="
                mx-auto
                text-[#b88b20]

                dark:text-[#e5c67d]
              "
            />

            <p
              className="
                mt-5
                text-[9px]
                font-black
                uppercase
                tracking-[0.32em]
                text-[#b88b20]

                dark:text-[#e5c67d]
              "
            >
              Your Portfolio Starts Here
            </p>

            <h2
              className="
                mt-4
                font-serif
                text-4xl
                leading-tight
                text-slate-900

                dark:text-white

                sm:text-5xl

                lg:text-6xl
              "
            >
              Publish Your

              <span
                className="
                  italic
                  text-[#b88b20]

                  dark:text-[#e5c67d]
                "
              >
                {" "}
                Creative Work
              </span>
            </h2>

            <p
              className="
                mx-auto
                mt-6
                max-w-2xl
                text-base
                leading-8
                text-slate-500

                dark:text-white/50
              "
            >
              Share your published fashion concepts with the DesignByYou
              community and build your creative presence.
            </p>

            <div
              className="
                mt-8
                flex
                flex-wrap
                justify-center
                gap-x-6
                gap-y-3
                font-serif
                text-lg
                italic
                text-slate-400

                dark:text-white/30

                sm:text-xl
              "
            >
              <span>
                Show your vision.
              </span>

              <span>
                Build your identity.
              </span>

              <span>
                Inspire the community.
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/designer/upload",
                )
              }
              className="
                mt-10
                inline-flex
                items-center
                gap-2
                rounded-full
                bg-[#e5c67d]
                px-8
                py-4
                text-[10px]
                font-black
                uppercase
                tracking-[0.2em]
                text-black
                transition

                hover:-translate-y-0.5
                hover:bg-amber-200
                hover:shadow-[0_0_45px_rgba(229,198,125,0.25)]

                dark:hover:bg-white
              "
            >
              <UploadCloud
                size={15}
              />

              Publish a Design

              <ArrowRight
                size={14}
              />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}