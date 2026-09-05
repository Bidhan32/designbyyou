"use strict";

/*
=========================================================
DesignByYou
Creator Showcase
Version 5.1
=========================================================

CLIENT STRUCTURE
---------------------------------------------------------

1. Full-Width Dynamic Hero
   Design Without Limits

2. Trending Styles

3. Browse by Style

4. Browse by Garment

5. Browse by Occasion

6. Featured Designers

7. New Arrivals

8. Create Your Own Design

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

If the shared Hero is disabled or unavailable, this page
falls back to its existing Showcase/design Hero image.

=========================================================
DATABASE-DRIVEN DISCOVERY
=========================================================

GET
/api/v1/creator-showcase/discovery

Returns:

styles
garments
occasions
trending

The frontend does NOT hardcode discovery terms.

=========================================================
RELATIONAL FILTERING
=========================================================

Discovery cards use:

showcase_discovery_terms.slug

and request:

GET
/api/v1/creator-showcase/pipeline?term=<slug>

Examples:

?term=streetwear
?term=dresses
?term=graduation

The backend filters through:

design_showcase_terms
        ↓
showcase_discovery_terms

=========================================================
TRENDING
=========================================================

If Admin has marked styles:

is_trending = TRUE

those styles are used.

If trending is empty, the first five active Style terms
are used temporarily.

=========================================================
SHOWCASE MODEL
=========================================================

Public Showcase work may belong to:

- Creator
- approved Designer

Designer-owned work:
    may expose booking/commission actions

Creator-owned work:
    does NOT expose Designer booking actions

=========================================================
NOT ECOMMERCE
=========================================================

This page does NOT use:

- price
- starting price
- checkout
- purchases
- licensing
- storefront sales
=========================================================
*/

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Crown,
  Loader2,
  Palette,
  PencilRuler,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Star,
  User,
  Zap,
} from "lucide-react";

import { Link, useNavigate } from "react-router-dom";

import API from "../../api/axios";

/*=========================================================
Configuration
=========================================================*/

const SHOWCASE_PAGE_SIZE = 24;

const SHOWCASE_ENDPOINT = "/creator-showcase/pipeline";

const DISCOVERY_ENDPOINT = "/creator-showcase/discovery";

const TOP_DESIGNERS_ENDPOINT = "/creator-showcase/top-designers";

const HERO_ENDPOINT = "/showcase-hero";

const CREATE_ROUTE = "/creator/upload";

/*=========================================================
Fallback Images
=========================================================*/

const FALLBACK_HERO =
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2200&auto=format&fit=crop";

const STYLE_FALLBACKS = [
  "https://images.unsplash.com/photo-1600607686527-6fb886090705?q=80&w=1400&auto=format&fit=crop",

  "https://images.unsplash.com/photo-1634084462412-254141397efb?q=80&w=1400&auto=format&fit=crop",

  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1400&auto=format&fit=crop",
];

/*=========================================================
Helpers
=========================================================*/

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();

  return text || fallback;
}

function isRequestCanceled(error) {
  return (
    error?.code === "ERR_CANCELED" ||
    error?.name === "CanceledError" ||
    error?.name === "AbortError"
  );
}

function getErrorMessage(error, fallback) {
  if (isRequestCanceled(error)) {
    return "";
  }

  return error?.response?.data?.message || error?.message || fallback;
}

function extractArray(response) {
  const value = response?.data?.data;

  return Array.isArray(value) ? value : [];
}

/*=========================================================
Hero Helpers
=========================================================*/

/**
 * Supports:
 *
 * https://cdn.example.com/image.jpg
 *
 * and:
 *
 * /uploads/image.jpg
 *
 * If axios uses an absolute backend baseURL, an application
 * relative /uploads URL is resolved against the backend
 * origin.
 */

function resolveHeroMediaUrl(value) {
  const url = cleanText(value);

  if (!url) {
    return "";
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (!url.startsWith("/")) {
    return url;
  }

  const apiBase = cleanText(API?.defaults?.baseURL);

  if (/^https?:\/\//i.test(apiBase)) {
    try {
      return `${new URL(apiBase).origin}${url}`;
    } catch {
      return url;
    }
  }

  return url;
}

function normalizeHeroSettings(response) {
  const data = response?.data?.data || {};

  const images = Array.isArray(data.slideshow_images)
    ? data.slideshow_images
        .map((value) => resolveHeroMediaUrl(value))
        .filter(Boolean)
        .slice(0, 5)
    : [];

  const rotationSeconds = Number(data.rotation_seconds);

  return {
    isEnabled: data.is_enabled === true,

    mode: data.mode === "video" ? "video" : "slideshow",

    images,

    videoUrl: resolveHeroMediaUrl(data.video_url),

    posterUrl: resolveHeroMediaUrl(data.video_poster_url),

    rotationSeconds:
      Number.isInteger(rotationSeconds) &&
      rotationSeconds >= 3 &&
      rotationSeconds <= 30
        ? rotationSeconds
        : 6,
  };
}

/*=========================================================
Discovery Normalization
=========================================================*/

function normalizeDiscoveryTerm(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const id = cleanText(item.id);

  const name = cleanText(item.name);

  const slug = cleanText(item.slug);

  if (!id || !name || !slug) {
    return null;
  }

  return {
    id,

    name,

    slug,

    /*
    searchTerm remains useful only for selecting a visual
    preview for Trending cards.

    It is NOT used for Showcase filtering.
    */

    searchTerm: cleanText(item.search_term, name),

    emoji: cleanText(item.emoji),

    description: cleanText(item.description),

    sortOrder: Number.isFinite(Number(item.sort_order))
      ? Number(item.sort_order)
      : 0,
  };
}

function normalizeDiscoveryArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const result = [];

  const seen = new Set();

  for (const item of value) {
    const normalized = normalizeDiscoveryTerm(item);

    if (!normalized || seen.has(normalized.id)) {
      continue;
    }

    seen.add(normalized.id);

    result.push(normalized);
  }

  return result;
}

function normalizeDiscoveryResponse(response) {
  const data = response?.data?.data || {};

  return {
    styles: normalizeDiscoveryArray(data.styles),

    garments: normalizeDiscoveryArray(data.garments),

    occasions: normalizeDiscoveryArray(data.occasions),

    trending: normalizeDiscoveryArray(data.trending),
  };
}

/*=========================================================
Design Helpers
=========================================================*/

function getDesignKey(design, index = 0) {
  return design?.design_id || design?.slug || `design-${index}`;
}

function mergeDesigns(current, incoming) {
  const map = new Map();

  current.forEach((design, index) => {
    map.set(
      String(getDesignKey(design, index)),

      design,
    );
  });

  incoming.forEach((design, index) => {
    map.set(
      String(getDesignKey(design, index)),

      design,
    );
  });

  return Array.from(map.values());
}

function getOwnerName(design) {
  return design?.owner_name || design?.designer_name || "DesignByYou Creator";
}

function getOwnerAvatar(design) {
  return design?.owner_avatar || design?.designer_avatar || "";
}

function isDesignerOwned(design) {
  return (
    design?.owner_role === "designer" ||
    design?.can_book_designer === true ||
    design?.can_book_designer === "true"
  );
}

function getDesignerRating(design) {
  if (!isDesignerOwned(design)) {
    return null;
  }

  const rating = Number.parseFloat(design?.designer_avg_rating);

  if (!Number.isFinite(rating) || rating <= 0) {
    return null;
  }

  return rating;
}

/*=========================================================
Booking URL
=========================================================*/

function buildBookingUrl(design) {
  if (!isDesignerOwned(design)) {
    return null;
  }

  const designerId = design?.designer_id;

  const designId = design?.design_id;

  if (!designerId || !designId) {
    return null;
  }

  const params = new URLSearchParams({
    designer_id: String(designerId),

    design_id: String(designId),
  });

  return `/creator/bookings/new?${params.toString()}`;
}

/*=========================================================
Trending Visual Matching
=========================================================*/

function designMatchesTerm(design, term) {
  if (!design || !term) {
    return false;
  }

  const needles = [term.name, term.searchTerm]
    .map((value) => cleanText(value).toLowerCase())
    .filter(Boolean);

  if (needles.length === 0) {
    return false;
  }

  const searchable = [
    design.title,

    design.description,

    design.style_category,

    design.category_name,

    design.category_slug,

    ...(Array.isArray(design.tags) ? design.tags : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return needles.some((needle) => searchable.includes(needle));
}

/*=========================================================
Section Heading
=========================================================*/

function SectionHeading({ eyebrow, title, description, action = null }) {
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
              text-[#e5c67d]
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
              text-slate-600

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
Discovery Loading
=========================================================*/

function DiscoveryLoading() {
  return (
    <div
      className="
        flex
        min-h-[160px]
        items-center
        justify-center
        rounded-[1.75rem]
        border
        border-slate-200
        bg-white
        shadow-sm
        transition-colors

        dark:border-white/[0.07]
        dark:bg-white/[0.02]
        dark:shadow-none
      "
    >
      <div
        className="
          flex
          items-center
          gap-3
          text-[9px]
          font-black
          uppercase
          tracking-[0.2em]
          text-slate-500

          dark:text-white/35
        "
      >
        <Loader2
          size={15}
          className="
            animate-spin
            text-[#e5c67d]
          "
        />
        Loading Discovery
      </div>
    </div>
  );
}

/*=========================================================
Creator Showcase
=========================================================*/

export default function CreatorShowcase() {
  const navigate = useNavigate();

  /*=======================================================
  Showcase State
  =======================================================*/

  const [items, setItems] = useState([]);

  const [loading, setLoading] = useState(true);

  const [loadingMore, setLoadingMore] = useState(false);

  const [showcaseError, setShowcaseError] = useState("");

  const [currentPage, setCurrentPage] = useState(1);

  const [hasMore, setHasMore] = useState(false);

  /*=======================================================
  Discovery State
  =======================================================*/

  const [discovery, setDiscovery] = useState({
    styles: [],
    garments: [],
    occasions: [],
    trending: [],
  });

  const [discoveryLoading, setDiscoveryLoading] = useState(true);

  const [discoveryError, setDiscoveryError] = useState("");

  const [activeDiscovery, setActiveDiscovery] = useState(null);

  /*=======================================================
  Featured Designers
  =======================================================*/

  const [topDesigners, setTopDesigners] = useState([]);

  const [topDesignersLoading, setTopDesignersLoading] = useState(true);

  const [topDesignersError, setTopDesignersError] = useState("");

  /*=======================================================
  Shared Showcase Hero
  =======================================================*/

  const [heroSettings, setHeroSettings] = useState({
    isEnabled: false,

    mode: "slideshow",

    images: [],

    videoUrl: "",

    posterUrl: "",

    rotationSeconds: 6,
  });

  const [heroSlideIndex, setHeroSlideIndex] = useState(0);

  const [heroVideoFailed, setHeroVideoFailed] = useState(false);

  const [heroImageFailed, setHeroImageFailed] = useState(false);

  /*=======================================================
  Refs
  =======================================================*/

  const showcaseRequestRef = useRef(null);

  const discoveryRequestRef = useRef(null);

  const trendingRef = useRef(null);

  const arrivalsRef = useRef(null);

  /*=======================================================
  Active Relational Discovery Slug
  =======================================================*/

  const activeDiscoveryTerm = activeDiscovery?.slug || "";

  /*=======================================================
  Existing Hero Fallback Design
  =======================================================*/

  const heroDesign = useMemo(
    () => items.find((item) => Boolean(item?.watermarked_preview_url)) || null,

    [items],
  );

  const fallbackHeroImage =
    heroDesign?.watermarked_preview_url || FALLBACK_HERO;

  /*=======================================================
  Shared Hero Active Media
  =======================================================*/

  const heroSlideshowActive =
    heroSettings.isEnabled &&
    heroSettings.mode === "slideshow" &&
    heroSettings.images.length > 0;

  const heroVideoActive =
    heroSettings.isEnabled &&
    heroSettings.mode === "video" &&
    Boolean(heroSettings.videoUrl) &&
    !heroVideoFailed;

  const currentHeroSlide = heroSlideshowActive
    ? heroSettings.images[
        heroSlideIndex % Math.max(heroSettings.images.length, 1)
      ] || ""
    : "";

  const heroBackgroundImage =
    heroSettings.isEnabled &&
    heroSettings.mode === "video" &&
    heroSettings.posterUrl
      ? heroSettings.posterUrl
      : currentHeroSlide || fallbackHeroImage;

  /*=======================================================
  Trending Styles
  =======================================================*/

  const trendingStyles = useMemo(() => {
    if (discovery.trending.length > 0) {
      return discovery.trending;
    }

    return discovery.styles.slice(0, 5);
  }, [discovery]);

  /*=======================================================
  Trending Cards
  =======================================================*/

  const trendingCards = useMemo(() => {
    return trendingStyles.map((term, index) => {
      const matchingDesign = items.find((item) =>
        designMatchesTerm(item, term),
      );

      return {
        ...term,

        image:
          matchingDesign?.watermarked_preview_url ||
          STYLE_FALLBACKS[index % STYLE_FALLBACKS.length],
      };
    });
  }, [items, trendingStyles]);

  /*=======================================================
  Load Shared Showcase Hero
  =======================================================*/

  useEffect(() => {
    const controller = new AbortController();

    const loadHeroSettings = async () => {
      try {
        const response = await API.get(HERO_ENDPOINT, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        setHeroSettings(normalizeHeroSettings(response));

        setHeroSlideIndex(0);

        setHeroVideoFailed(false);

        setHeroImageFailed(false);
      } catch (error) {
        if (controller.signal.aborted || isRequestCanceled(error)) {
          return;
        }

        if (import.meta.env.DEV) {
          console.error(
            "Showcase Hero settings request failed:",
            error?.response?.data || error,
          );
        }

        /*
          Hero presentation failure must not break the
          Showcase page.
          */

        setHeroSettings({
          isEnabled: false,

          mode: "slideshow",

          images: [],

          videoUrl: "",

          posterUrl: "",

          rotationSeconds: 6,
        });

        setHeroSlideIndex(0);

        setHeroVideoFailed(false);

        setHeroImageFailed(false);
      }
    };

    void loadHeroSettings();

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
      heroSettings.mode !== "slideshow" ||
      heroSettings.images.length < 2
    ) {
      return undefined;
    }

    const timer = window.setInterval(
      () => {
        setHeroSlideIndex(
          (current) => (current + 1) % heroSettings.images.length,
        );

        setHeroImageFailed(false);
      },

      heroSettings.rotationSeconds * 1000,
    );

    return () => {
      window.clearInterval(timer);
    };
  }, [
    heroSettings.images.length,
    heroSettings.isEnabled,
    heroSettings.mode,
    heroSettings.rotationSeconds,
  ]);

  /*=======================================================
  Load Discovery Taxonomy
  =======================================================*/

  const loadDiscovery = useCallback(async () => {
    discoveryRequestRef.current?.abort();

    const controller = new AbortController();

    discoveryRequestRef.current = controller;

    setDiscoveryLoading(true);

    setDiscoveryError("");

    try {
      const response = await API.get(DISCOVERY_ENDPOINT, {
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      setDiscovery(normalizeDiscoveryResponse(response));
    } catch (error) {
      if (controller.signal.aborted || isRequestCanceled(error)) {
        return;
      }

      if (import.meta.env.DEV) {
        console.error(
          "Showcase discovery request failed:",
          error?.response?.data || error,
        );
      }

      setDiscovery({
        styles: [],
        garments: [],
        occasions: [],
        trending: [],
      });

      setDiscoveryError(
        getErrorMessage(
          error,

          "Showcase discovery options could not be loaded.",
        ),
      );
    } finally {
      if (discoveryRequestRef.current === controller) {
        discoveryRequestRef.current = null;

        setDiscoveryLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadDiscovery();

    return () => {
      discoveryRequestRef.current?.abort();
    };
  }, [loadDiscovery]);

  /*=======================================================
  Load Showcase Designs
  =======================================================*/

  useEffect(() => {
    showcaseRequestRef.current?.abort();

    const controller = new AbortController();

    showcaseRequestRef.current = controller;

    const load = async () => {
      setLoading(true);

      setLoadingMore(false);

      setShowcaseError("");

      setCurrentPage(1);

      setHasMore(false);

      try {
        const params = {
          page: 1,

          limit: SHOWCASE_PAGE_SIZE,
        };

        if (activeDiscoveryTerm) {
          params.term = activeDiscoveryTerm;
        }

        const response = await API.get(SHOWCASE_ENDPOINT, {
          params,

          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        setItems(extractArray(response));

        setHasMore(Boolean(response?.data?.pagination?.hasMore));
      } catch (error) {
        if (controller.signal.aborted || isRequestCanceled(error)) {
          return;
        }

        if (import.meta.env.DEV) {
          console.error(
            "Creator Showcase request failed:",
            error?.response?.data || error,
          );
        }

        setItems([]);

        setHasMore(false);

        setShowcaseError(
          getErrorMessage(
            error,

            "Unable to load the Showcase right now.",
          ),
        );
      } finally {
        if (showcaseRequestRef.current === controller) {
          showcaseRequestRef.current = null;

          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      controller.abort();
    };
  }, [activeDiscoveryTerm]);

  /*=======================================================
  Load Featured Designers
  =======================================================*/

  useEffect(() => {
    const controller = new AbortController();

    const loadDesigners = async () => {
      setTopDesignersLoading(true);

      setTopDesignersError("");

      try {
        const response = await API.get(TOP_DESIGNERS_ENDPOINT, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        setTopDesigners(extractArray(response));
      } catch (error) {
        if (controller.signal.aborted || isRequestCanceled(error)) {
          return;
        }

        if (import.meta.env.DEV) {
          console.error(
            "Featured designers request failed:",
            error?.response?.data || error,
          );
        }

        setTopDesigners([]);

        setTopDesignersError(
          getErrorMessage(
            error,

            "Featured designers are temporarily unavailable.",
          ),
        );
      } finally {
        if (!controller.signal.aborted) {
          setTopDesignersLoading(false);
        }
      }
    };

    void loadDesigners();

    return () => {
      controller.abort();
    };
  }, []);

  /*=======================================================
  Apply Discovery Term
  =======================================================*/

  const applyDiscovery = useCallback((term) => {
    if (!term) {
      return;
    }

    const id = cleanText(term.id);

    const label = cleanText(term.name);

    const slug = cleanText(term.slug).toLowerCase();

    if (!id || !label || !slug) {
      return;
    }

    setActiveDiscovery({
      id,

      label,

      slug,
    });

    window.setTimeout(
      () => {
        arrivalsRef.current?.scrollIntoView({
          behavior: "smooth",

          block: "start",
        });
      },

      80,
    );
  }, []);

  const clearDiscovery = useCallback(() => {
    setActiveDiscovery(null);
  }, []);

  /*=======================================================
  Load More
  =======================================================*/

  const handleLoadMore = async () => {
    if (loading || loadingMore || !hasMore) {
      return;
    }

    showcaseRequestRef.current?.abort();

    const controller = new AbortController();

    showcaseRequestRef.current = controller;

    const nextPage = currentPage + 1;

    setLoadingMore(true);

    setShowcaseError("");

    try {
      const params = {
        page: nextPage,

        limit: SHOWCASE_PAGE_SIZE,
      };

      if (activeDiscoveryTerm) {
        params.term = activeDiscoveryTerm;
      }

      const response = await API.get(SHOWCASE_ENDPOINT, {
        params,

        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      setItems((current) =>
        mergeDesigns(
          current,

          extractArray(response),
        ),
      );

      setCurrentPage(nextPage);

      setHasMore(Boolean(response?.data?.pagination?.hasMore));
    } catch (error) {
      if (controller.signal.aborted || isRequestCanceled(error)) {
        return;
      }

      setShowcaseError(
        getErrorMessage(
          error,

          "Unable to load more Showcase work.",
        ),
      );
    } finally {
      if (showcaseRequestRef.current === controller) {
        showcaseRequestRef.current = null;

        setLoadingMore(false);
      }
    }
  };

  /*=======================================================
  Trending Scroll
  =======================================================*/

  const scrollTrending = useCallback((direction) => {
    if (!trendingRef.current) {
      return;
    }

    trendingRef.current.scrollBy({
      left: direction === "left" ? -430 : 430,

      behavior: "smooth",
    });
  }, []);

  /*=======================================================
  Design Detail
  =======================================================*/

  const openDesign = useCallback(
    (slug) => {
      if (!slug) {
        return;
      }

      navigate(`/creator/showcase/${encodeURIComponent(slug)}`);
    },
    [navigate],
  );

  /*=======================================================
  Render
  =======================================================*/

  return (
    <div
      className="
        relative
        min-h-screen
        overflow-x-hidden
        bg-slate-50
        pb-28
        text-slate-900
        transition-colors
        duration-300

        dark:bg-[#080808]
        dark:text-white
        selection:bg-[#e5c67d]
        selection:text-black
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
            top-[30rem]
            h-[42rem]
            w-[42rem]
            rounded-full
            bg-[#e5c67d]/[0.055]
            blur-[170px]
          "
        />

        <div
          className="
            absolute
            -right-52
            top-[95rem]
            h-[38rem]
            w-[38rem]
            rounded-full
            bg-violet-500/[0.05]
            blur-[160px]
          "
        />
      </div>

      {/*===================================================
      FULL-WIDTH HERO

      IMPORTANT:
      Hero is intentionally outside the max-w-[1800px]
      content container.

      The Hero media therefore fills 100% of the available
      page width edge-to-edge.
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
            shadow-[0_36px_120px_rgba(0,0,0,0.7)]

            sm:min-h-[680px]

            lg:min-h-[720px]
          "
        >
          {/*===============================================
          Hero Media

          VIDEO:
              selected video only

          SLIDESHOW:
              selected image only

          DISABLED / FAILURE:
              existing design/fallback Hero
          ===============================================*/}

          {heroVideoActive ? (
            <video
              key={heroSettings.videoUrl}
              src={heroSettings.videoUrl}
              poster={heroSettings.posterUrl || fallbackHeroImage}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-hidden="true"
              onError={() => setHeroVideoFailed(true)}
              className="
                absolute
                inset-0
                h-full
                w-full
                object-cover
                opacity-55
              "
            />
          ) : (
            <img
              key={heroBackgroundImage}
              src={heroImageFailed ? fallbackHeroImage : heroBackgroundImage}
              alt=""
              onError={() => setHeroImageFailed(true)}
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
          )}

          {/*===============================================
          Hero Overlays
          ===============================================*/}

          <div
            className="
              absolute
              inset-0
              bg-gradient-to-r
              from-[#070707]
              via-[#070707]/85
              to-[#070707]/15
            "
          />

          <div
            className="
              absolute
              inset-0
              bg-gradient-to-t
              from-[#080808]/90
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

          {/*===============================================
          Hero Copy

          Background is full width.
          Copy remains aligned to the main content grid.
          ===============================================*/}

          <div
            className="
              relative
              z-10
              mx-auto
              flex
              min-h-[610px]
              w-full
              text-white
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
            <p
              className="
                flex
                items-center
                gap-2
                text-[10px]
                font-black
                uppercase
                tracking-[0.34em]
                text-[#e5c67d]
              "
            >
              <Sparkles size={14} />
              DesignByYou
            </p>

            <h1
              className="
                mt-7
                max-w-5xl
                font-serif
                text-[3.8rem]
                leading-[0.9]
                tracking-[-0.055em]

                sm:text-7xl

                lg:text-[7.4rem]
              "
            >
              Design
              <br />
              <span
                className="
                  italic
                  text-[#e5c67d]
                "
              >
                Without Limits
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
              Wear your identity. Discover ideas, find your style, connect with
              designers, or bring your own vision to life.
            </p>

            <div
              className="
                mt-10
                flex
                flex-wrap
                gap-3
              "
            >
              <button
                type="button"
                onClick={() =>
                  arrivalsRef.current?.scrollIntoView({
                    behavior: "smooth",
                  })
                }
                className="
                  inline-flex
                  items-center
                  gap-2
                  rounded-full
                  bg-[#e5c67d]
                  px-7
                  py-4
                  text-[10px]
                  font-black
                  uppercase
                  tracking-[0.2em]
                  text-black
                  transition

                  hover:-translate-y-0.5
                  hover:bg-white
                "
              >
                Explore Designs
                <ArrowRight size={14} />
              </button>

              <button
                type="button"
                onClick={() => navigate(CREATE_ROUTE)}
                className="
                  inline-flex
                  items-center
                  gap-2
                  rounded-full
                  border
                  border-white/20
                  bg-white/[0.06]
                  px-7
                  py-4
                  text-[10px]
                  font-black
                  uppercase
                  tracking-[0.2em]
                  text-white
                  backdrop-blur
                  transition

                  hover:border-[#e5c67d]
                  hover:text-[#e5c67d]
                "
              >
                <PencilRuler size={14} />
                Create Your Own
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
              “You don&apos;t just wear it. You create it.”
            </p>
          </div>
        </section>
      </div>

      {/*===================================================
      Normal Page Content

      Everything below Hero remains inside the original
      max-width content container.
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
        Discovery Error
        =================================================*/}

        {discoveryError && (
          <div
            role="alert"
            className="
              mt-8
              flex
              flex-col
              gap-4
              rounded-2xl
              border
              border-rose-400/20
              bg-rose-400/[0.08]
              p-4

              sm:flex-row
              sm:items-center
              sm:justify-between
            "
          >
            <div
              className="
                flex
                items-center
                gap-3
                text-sm
                text-rose-700

                dark:text-rose-200
              "
            >
              <ShieldAlert
                size={17}
                className="
                  shrink-0
                "
              />

              {discoveryError}
            </div>

            <button
              type="button"
              onClick={() => void loadDiscovery()}
              className="
                inline-flex
                h-9
                items-center
                justify-center
                gap-2
                rounded-xl
                border
                border-rose-400/20
                px-4
                text-[8px]
                font-black
                uppercase
                tracking-[0.15em]
                text-rose-700

                dark:text-rose-200
              "
            >
              <RefreshCw size={11} />
              Retry
            </button>
          </div>
        )}

        {/*=================================================
        TRENDING STYLES
        =================================================*/}

        <section
          className="
            py-20

            sm:py-24
          "
        >
          <SectionHeading
            eyebrow="Now Inspiring"
            title="Trending Styles"
            description="Explore creative directions shaping the DesignByYou community."
            action={
              !discoveryLoading && trendingCards.length > 1 ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label="Previous trending styles"
                    onClick={() => scrollTrending("left")}
                    className="
                      grid
                      h-11
                      w-11
                      place-items-center
                      rounded-full
                      border
                      border-slate-200
                      bg-white
                      text-slate-600
                      shadow-sm
                      transition

                      hover:border-[#e5c67d]
                      hover:text-[#b38b32]

                      dark:border-white/10
                      dark:bg-white/[0.04]
                      dark:text-white/55
                      dark:shadow-none
                      dark:hover:border-[#e5c67d]
                      dark:hover:text-[#e5c67d]
                    "
                  >
                    <ChevronLeft size={17} />
                  </button>

                  <button
                    type="button"
                    aria-label="Next trending styles"
                    onClick={() => scrollTrending("right")}
                    className="
                      grid
                      h-11
                      w-11
                      place-items-center
                      rounded-full
                      border
                      border-slate-200
                      bg-white
                      text-slate-600
                      shadow-sm
                      transition

                      hover:border-[#e5c67d]
                      hover:text-[#b38b32]

                      dark:border-white/10
                      dark:bg-white/[0.04]
                      dark:text-white/55
                      dark:shadow-none
                      dark:hover:border-[#e5c67d]
                      dark:hover:text-[#e5c67d]
                    "
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              ) : null
            }
          />

          {discoveryLoading ? (
            <DiscoveryLoading />
          ) : trendingCards.length === 0 ? (
            <div
              className="
                rounded-[1.75rem]
                border
                border-dashed
                border-slate-300
                bg-white
                p-8
                text-center
                text-sm
                text-slate-500
                shadow-sm

                dark:border-white/10
                dark:bg-white/[0.02]
                dark:text-white/30
                dark:shadow-none
              "
            >
              Trending styles are currently unavailable.
            </div>
          ) : (
            <div
              ref={trendingRef}
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
              {trendingCards.map((term, index) => (
                <button
                  key={term.id}
                  type="button"
                  onClick={() => applyDiscovery(term)}
                  className="
                      group
                      relative
                      min-w-[310px]
                      snap-start
                      overflow-hidden
                      rounded-[1.75rem]
                      border
                      border-slate-200
                      bg-white
                      text-left
                      text-white
                      shadow-sm
                      transition

                      dark:border-white/10
                      dark:bg-[#111]
                      dark:shadow-none

                      hover:-translate-y-1
                      hover:border-[#e5c67d]/60

                      sm:min-w-[420px]

                      lg:min-w-[500px]
                    "
                >
                  <div
                    className="
                        relative
                        h-[250px]

                        sm:h-[300px]
                      "
                  >
                    <img
                      src={term.image}
                      alt=""
                      loading="lazy"
                      className="
                          h-full
                          w-full
                          object-cover
                          opacity-70
                          transition
                          duration-700

                          group-hover:scale-105
                        "
                    />

                    <div
                      className="
                          absolute
                          inset-0
                          bg-gradient-to-t
                          from-black
                          via-black/20
                          to-transparent
                        "
                    />

                    <div
                      className="
                          absolute
                          inset-x-0
                          bottom-0
                          p-6

                          sm:p-7
                        "
                    >
                      <p
                        className="
                            text-[9px]
                            font-black
                            uppercase
                            tracking-[0.22em]
                            text-[#e5c67d]
                          "
                      >
                        {term.description || `Trending style ${index + 1}`}
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
                        <h3
                          className="
                              font-serif
                              text-3xl

                              sm:text-4xl
                            "
                        >
                          {term.name}
                        </h3>

                        <span
                          className="
                              grid
                              h-10
                              w-10
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
                          <ArrowRight size={15} />
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

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
            description="Start with the visual identity that feels most like you."
          />

          {discoveryLoading ? (
            <DiscoveryLoading />
          ) : (
            <div
              className="
                grid
                grid-cols-2
                gap-3

                sm:grid-cols-4

                xl:grid-cols-8
              "
            >
              {discovery.styles.map((style, index) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => applyDiscovery(style)}
                  className="
                      group
                      min-h-[135px]
                      rounded-[1.5rem]
                      border
                      border-slate-200
                      bg-white
                      p-4
                      text-left
                      shadow-sm
                      transition

                      hover:-translate-y-1
                      hover:border-[#e5c67d]/70
                      hover:bg-[#e5c67d]/[0.07]

                      dark:border-white/10
                      dark:bg-white/[0.025]
                      dark:shadow-none
                      dark:hover:border-[#e5c67d]/55
                    "
                >
                  <span
                    className="
                        text-[9px]
                        font-black
                        tracking-[0.15em]
                        text-slate-400

                        dark:text-white/20
                      "
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <Palette
                    size={18}
                    className="
                        mt-6
                        text-[#e5c67d]/70
                      "
                  />

                  <p
                    className="
                        mt-3
                        font-serif
                        text-lg
                        transition

                        group-hover:text-[#e5c67d]
                      "
                  >
                    {style.name}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        {/*=================================================
        BROWSE BY GARMENT
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
            eyebrow="Choose the Piece"
            title="Browse by Garment"
            description="Explore ideas around the kind of piece you want to create."
          />

          {discoveryLoading ? (
            <DiscoveryLoading />
          ) : (
            <div
              className="
                grid
                grid-cols-2
                gap-4

                sm:grid-cols-3

                lg:grid-cols-6
              "
            >
              {discovery.garments.map((garment) => (
                <button
                  key={garment.id}
                  type="button"
                  onClick={() => applyDiscovery(garment)}
                  className="
                      group
                      flex
                      min-h-[160px]
                      flex-col
                      items-center
                      justify-center
                      rounded-[1.5rem]
                      border
                      border-slate-200
                      bg-white
                      p-5
                      text-center
                      shadow-sm
                      transition

                      hover:-translate-y-1
                      hover:border-[#e5c67d]/70
                      hover:bg-slate-50

                      dark:border-white/10
                      dark:bg-white/[0.025]
                      dark:shadow-none
                      dark:hover:border-[#e5c67d]/50
                      dark:hover:bg-white/[0.05]
                    "
                >
                  <span
                    className="
                        text-4xl
                        transition
                        duration-300

                        group-hover:scale-110
                      "
                  >
                    {garment.emoji || "✦"}
                  </span>

                  <p
                    className="
                        mt-4
                        font-serif
                        text-lg
                        transition

                        group-hover:text-[#e5c67d]
                      "
                  >
                    {garment.name}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        {/*=================================================
        BROWSE BY OCCASION
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
            eyebrow="Dress for the Moment"
            title="Browse by Occasion"
            description="Start with where you're going, then make the look completely yours."
          />

          {discoveryLoading ? (
            <DiscoveryLoading />
          ) : (
            <div
              className="
                grid
                grid-cols-2
                gap-3

                sm:grid-cols-4

                xl:grid-cols-8
              "
            >
              {discovery.occasions.map((occasion) => (
                <button
                  key={occasion.id}
                  type="button"
                  onClick={() => applyDiscovery(occasion)}
                  className="
                      group
                      min-h-[130px]
                      rounded-[1.5rem]
                      border
                      border-slate-200
                      bg-white
                      p-4
                      text-center
                      shadow-sm
                      transition

                      hover:-translate-y-1
                      hover:border-[#e5c67d]/70

                      dark:border-white/10
                      dark:bg-white/[0.025]
                      dark:shadow-none
                      dark:hover:border-[#e5c67d]/50
                    "
                >
                  <div className="text-3xl">{occasion.emoji || "✦"}</div>

                  <p
                    className="
                        mt-4
                        font-serif
                        text-base
                        transition

                        group-hover:text-[#e5c67d]
                      "
                  >
                    {occasion.name}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        {/*=================================================
        FEATURED DESIGNERS
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
            eyebrow="The Network"
            title="Featured Designers"
            description="Discover approved designers and explore the creative minds behind the work."
          />

          {topDesignersLoading ? (
            <div
              className="
                flex
                min-h-[230px]
                items-center
                justify-center
              "
            >
              <Loader2
                size={28}
                className="
                  animate-spin
                  text-[#e5c67d]
                "
              />
            </div>
          ) : topDesignersError ? (
            <div
              className="
                rounded-2xl
                border
                border-rose-400/20
                bg-rose-50
                p-5
                text-sm
                text-rose-700

                dark:bg-rose-400/10
                dark:text-rose-200
              "
            >
              {topDesignersError}
            </div>
          ) : topDesigners.length === 0 ? (
            <div
              className="
                rounded-[1.75rem]
                border
                border-dashed
                border-slate-300
                bg-white
                p-8
                text-center
                text-sm
                text-slate-500
                shadow-sm

                dark:border-white/10
                dark:bg-white/[0.02]
                dark:text-white/30
                dark:shadow-none
              "
            >
              No featured designers are available yet.
            </div>
          ) : (
            <div
              className="
                grid
                gap-4

                sm:grid-cols-2

                lg:grid-cols-3

                xl:grid-cols-5
              "
            >
              {topDesigners.map((designer, index) => {
                const designerId = designer?.designer_id;

                const rating = Number.parseFloat(designer?.avg_rating);

                const bookings =
                  Number.parseInt(designer?.total_completed_bookings, 10) || 0;

                return (
                  <article
                    key={designerId || `designer-${index}`}
                    className="
                        group
                        rounded-[1.75rem]
                        border
                        border-slate-200
                        bg-white
                        p-5
                        shadow-sm
                        transition

                        hover:-translate-y-1
                        hover:border-[#e5c67d]/70
                        hover:shadow-md

                        dark:border-white/10
                        dark:bg-[#111]
                        dark:shadow-none
                        dark:hover:border-[#e5c67d]/50
                      "
                  >
                    <div
                      className="
                          flex
                          items-start
                          justify-between
                          gap-4
                        "
                    >
                      <div
                        className="
                            flex
                            h-16
                            w-16
                            items-center
                            justify-center
                            overflow-hidden
                            rounded-full
                            border
                            border-slate-200
                            bg-slate-100

                            dark:border-white/10
                            dark:bg-white/[0.05]
                          "
                      >
                        {designer?.designer_avatar ? (
                          <img
                            src={designer.designer_avatar}
                            alt=""
                            className="
                                h-full
                                w-full
                                object-cover
                              "
                          />
                        ) : (
                          <User
                            size={22}
                            className="
                                text-slate-400

                                dark:text-white/30
                              "
                          />
                        )}
                      </div>

                      {index === 0 && (
                        <Crown
                          size={17}
                          className="
                              text-[#e5c67d]
                            "
                        />
                      )}
                    </div>

                    <h3
                      className="
                          mt-5
                          truncate
                          font-serif
                          text-xl
                        "
                    >
                      {designer?.designer_name || "Designer"}
                    </h3>

                    <div
                      className="
                          mt-3
                          flex
                          flex-wrap
                          gap-2
                        "
                    >
                      {Number.isFinite(rating) && rating > 0 && (
                        <span
                          className="
                                inline-flex
                                items-center
                                gap-1
                                rounded-full
                                bg-[#e5c67d]/10
                                px-2.5
                                py-1
                                text-[9px]
                                font-bold
                                text-[#e5c67d]
                              "
                        >
                          <Star size={9} fill="currentColor" />

                          {rating.toFixed(1)}
                        </span>
                      )}

                      <span
                        className="
                            rounded-full
                            bg-slate-100
                            px-2.5
                            py-1
                            text-[9px]
                            text-slate-600

                            dark:bg-white/[0.05]
                            dark:text-white/40
                          "
                      >
                        {bookings} {bookings === 1 ? "booking" : "bookings"}
                      </span>
                    </div>

                    <div
                      className="
                          mt-5
                          grid
                          grid-cols-2
                          gap-2
                        "
                    >
                      <button
                        type="button"
                        disabled={!designerId}
                        onClick={() => {
                          if (!designerId) {
                            return;
                          }

                          navigate(
                            `/creator/studio/${encodeURIComponent(designerId)}`,
                          );
                        }}
                        className="
                            rounded-xl
                            border
                            border-slate-200
                            bg-white
                            py-3
                            text-[8px]
                            font-black
                            uppercase
                            tracking-[0.13em]
                            text-slate-700
                            transition

                            hover:border-slate-400
                            hover:text-slate-950

                            dark:border-white/10
                            dark:bg-transparent
                            dark:text-white/65
                            dark:hover:border-white/30
                            dark:hover:text-white

                            disabled:cursor-not-allowed
                            disabled:opacity-40
                          "
                      >
                        View Profile
                      </button>

                      <button
                        type="button"
                        disabled={!designerId}
                        onClick={() => {
                          if (!designerId) {
                            return;
                          }

                          navigate(
                            `/creator/bookings/new?designer_id=${encodeURIComponent(
                              designerId,
                            )}`,
                          );
                        }}
                        className="
                            rounded-xl
                            bg-[#e5c67d]
                            py-3
                            text-[8px]
                            font-black
                            uppercase
                            tracking-[0.13em]
                            text-black
                            transition

                            hover:bg-white

                            disabled:cursor-not-allowed
                            disabled:opacity-40
                          "
                      >
                        Booking
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/*=================================================
        NEW ARRIVALS
        =================================================*/}

        <section
          ref={arrivalsRef}
          className="
            scroll-mt-28
            border-t
            border-slate-200
            py-20

            dark:border-white/[0.07]

            sm:py-24
          "
        >
          <SectionHeading
            eyebrow="Fresh From the Community"
            title={
              activeDiscovery
                ? `Explore ${activeDiscovery.label}`
                : "New Arrivals"
            }
            description={
              activeDiscovery
                ? `Showing designs classified as ${activeDiscovery.label}.`
                : "Recently published creative work from Creators and approved Designers."
            }
            action={
              activeDiscovery ? (
                <button
                  type="button"
                  onClick={clearDiscovery}
                  className="
                    rounded-full
                    border
                    border-slate-200
                    bg-white
                    px-5
                    py-2.5
                    text-[9px]
                    font-black
                    uppercase
                    tracking-[0.16em]
                    text-slate-600
                    shadow-sm
                    transition

                    hover:border-[#e5c67d]
                    hover:text-[#b38b32]

                    dark:border-white/10
                    dark:bg-white/[0.04]
                    dark:text-white/55
                    dark:shadow-none
                    dark:hover:text-[#e5c67d]
                  "
                >
                  View All
                </button>
              ) : null
            }
          />

          {showcaseError && (
            <div
              role="alert"
              className="
                mb-7
                flex
                items-center
                gap-3
                rounded-2xl
                border
                border-rose-400/20
                bg-rose-50
                px-5
                py-4
                text-sm
                text-rose-700

                dark:bg-rose-400/10
                dark:text-rose-200
              "
            >
              <ShieldAlert size={18} />

              {showcaseError}
            </div>
          )}

          {loading ? (
            <div
              className="
                flex
                min-h-[380px]
                flex-col
                items-center
                justify-center
                gap-4
              "
            >
              <Loader2
                size={38}
                className="
                  animate-spin
                  text-[#e5c67d]
                "
              />

              <span
                className="
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.26em]
                  text-slate-500

                  dark:text-white/35
                "
              >
                Loading Showcase
              </span>
            </div>
          ) : items.length === 0 ? (
            <div
              className="
                flex
                min-h-[330px]
                flex-col
                items-center
                justify-center
                rounded-[2rem]
                border
                border-dashed
                border-slate-300
                bg-white
                px-6
                text-center
                shadow-sm

                dark:border-white/15
                dark:bg-white/[0.02]
                dark:shadow-none
              "
            >
              <Sparkles
                size={36}
                className="
                  text-[#e5c67d]/50
                "
              />

              <h3
                className="
                  mt-5
                  font-serif
                  text-2xl
                "
              >
                No designs found.
              </h3>

              <p
                className="
                  mt-2
                  text-sm
                  text-slate-500

                  dark:text-white/35
                "
              >
                {activeDiscovery
                  ? `No Showcase designs are currently assigned to ${activeDiscovery.label}.`
                  : "No Showcase designs are available right now."}
              </p>

              {activeDiscovery && (
                <button
                  type="button"
                  onClick={clearDiscovery}
                  className="
                    mt-6
                    rounded-full
                    bg-[#e5c67d]
                    px-5
                    py-3
                    text-[9px]
                    font-black
                    uppercase
                    tracking-[0.16em]
                    text-black
                  "
                >
                  View All
                </button>
              )}
            </div>
          ) : (
            <>
              <div
                className="
                  grid
                  gap-5

                  sm:grid-cols-2

                  lg:grid-cols-3

                  xl:grid-cols-4
                "
              >
                {items.map((item, index) => {
                  const ownerName = getOwnerName(item);

                  const ownerAvatar = getOwnerAvatar(item);

                  const designerOwned = isDesignerOwned(item);

                  const rating = getDesignerRating(item);

                  const bookingUrl = buildBookingUrl(item);

                  return (
                    <article
                      key={getDesignKey(item, index)}
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
                          hover:border-[#e5c67d]/70
                          hover:shadow-lg

                          dark:border-white/10
                          dark:bg-[#111]
                          dark:shadow-none
                          dark:hover:border-[#e5c67d]/50
                          dark:hover:shadow-[0_24px_60px_rgba(0,0,0,0.45)]
                        "
                    >
                      <button
                        type="button"
                        onClick={() => openDesign(item.slug)}
                        disabled={!item.slug}
                        className="
                            relative
                            block
                            aspect-[4/5]
                            w-full
                            overflow-hidden
                            text-left

                            disabled:cursor-default
                          "
                      >
                        {item.watermarked_preview_url ? (
                          <img
                            src={item.watermarked_preview_url}
                            alt={item.title || "Showcase design"}
                            loading="lazy"
                            decoding="async"
                            className="
                                h-full
                                w-full
                                object-cover
                                transition
                                duration-700

                                group-hover:scale-[1.05]
                              "
                          />
                        ) : (
                          <div
                            className="
                                flex
                                h-full
                                items-center
                                justify-center
                                bg-slate-100

                                dark:bg-white/[0.03]
                              "
                          >
                            <Sparkles
                              size={30}
                              className="
                                  text-slate-300

                                  dark:text-white/15
                                "
                            />
                          </div>
                        )}

                        <div
                          className="
                              absolute
                              inset-0
                              bg-gradient-to-t
                              from-black/80
                              via-transparent
                              to-transparent
                            "
                        />

                        <span
                          className="
                              absolute
                              left-4
                              top-4
                              rounded-full
                              border
                              border-white/15
                              bg-black/45
                              px-3
                              py-1.5
                              text-[8px]
                              font-black
                              uppercase
                              tracking-[0.13em]
                              text-white/75
                              backdrop-blur
                            "
                        >
                          {designerOwned ? "Designer" : "Creator"}
                        </span>

                        {item?.category_name && (
                          <span
                            className="
                                absolute
                                bottom-4
                                left-4
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
                            {item.category_name}
                          </span>
                        )}
                      </button>

                      <div className="p-5">
                        <h3
                          className="
                              truncate
                              font-serif
                              text-xl
                            "
                        >
                          {item.title || "Untitled Design"}
                        </h3>

                        <div
                          className="
                              mt-3
                              flex
                              items-center
                              justify-between
                              gap-3
                            "
                        >
                          <div
                            className="
                                flex
                                min-w-0
                                items-center
                                gap-2.5
                              "
                          >
                            <div
                              className="
                                  flex
                                  h-8
                                  w-8
                                  shrink-0
                                  items-center
                                  justify-center
                                  overflow-hidden
                                  rounded-full
                                  border
                                  border-slate-200
                                  bg-slate-100

                                  dark:border-white/10
                                  dark:bg-white/[0.05]
                                "
                            >
                              {ownerAvatar ? (
                                <img
                                  src={ownerAvatar}
                                  alt=""
                                  className="
                                      h-full
                                      w-full
                                      object-cover
                                    "
                                />
                              ) : (
                                <User
                                  size={13}
                                  className="
                                      text-slate-400

                                      dark:text-white/35
                                    "
                                />
                              )}
                            </div>

                            <div className="min-w-0">
                              <p
                                className="
                                    truncate
                                    text-[10px]
                                    font-semibold
                                    text-slate-700

                                    dark:text-white/65
                                  "
                              >
                                {ownerName}
                              </p>

                              <p
                                className="
                                    mt-0.5
                                    truncate
                                    text-[8px]
                                    uppercase
                                    tracking-[0.13em]
                                    text-slate-400

                                    dark:text-white/25
                                  "
                              >
                                {item?.style_category || "Creative work"}
                              </p>
                            </div>
                          </div>

                          {rating && (
                            <span
                              className="
                                  inline-flex
                                  shrink-0
                                  items-center
                                  gap-1
                                  text-[9px]
                                  font-bold
                                  text-[#e5c67d]
                                "
                            >
                              <Star size={9} fill="currentColor" />

                              {rating.toFixed(1)}
                            </span>
                          )}
                        </div>

                        <div
                          className={`
                              mt-5
                              grid
                              gap-2

                              ${bookingUrl ? "grid-cols-2" : "grid-cols-1"}
                            `}
                        >
                          <button
                            type="button"
                            disabled={!item.slug}
                            onClick={() => openDesign(item.slug)}
                            className="
                                rounded-xl
                                border
                                border-slate-200
                                bg-white
                                py-3
                                text-[8px]
                                font-black
                                uppercase
                                tracking-[0.15em]
                                text-slate-700
                                transition

                                hover:border-slate-400
                                hover:text-slate-950

                                dark:border-white/10
                                dark:bg-transparent
                                dark:text-white/65
                                dark:hover:border-white/30
                                dark:hover:text-white

                                disabled:cursor-not-allowed
                                disabled:opacity-40
                              "
                          >
                            View Details
                          </button>

                          {bookingUrl && (
                            <Link
                              to={bookingUrl}
                              className="
                                  flex
                                  items-center
                                  justify-center
                                  gap-1.5
                                  rounded-xl
                                  bg-[#e5c67d]
                                  py-3
                                  text-[8px]
                                  font-black
                                  uppercase
                                  tracking-[0.15em]
                                  text-black
                                  transition

                                  hover:bg-white
                                "
                            >
                              <Zap size={11} />
                              Book
                            </Link>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {hasMore && (
                <div
                  className="
                    mt-10
                    flex
                    justify-center
                  "
                >
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="
                      inline-flex
                      min-w-[180px]
                      items-center
                      justify-center
                      gap-2
                      rounded-full
                      border
                      border-[#e5c67d]/30
                      bg-[#e5c67d]/10
                      px-6
                      py-3.5
                      text-[9px]
                      font-black
                      uppercase
                      tracking-[0.2em]
                      text-[#e5c67d]
                      transition

                      hover:bg-[#e5c67d]
                      hover:text-black

                      disabled:cursor-not-allowed
                      disabled:opacity-50
                    "
                  >
                    {loadingMore ? (
                      <>
                        <Loader2
                          size={14}
                          className="
                            animate-spin
                          "
                        />
                        Loading
                      </>
                    ) : (
                      <>
                        Load More
                        <ChevronRight size={14} />
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/*=================================================
        CREATE YOUR OWN DESIGN
        =================================================*/}

        <section
          className="
            relative
            mt-8
            overflow-hidden
            rounded-[2.5rem]
            border
            border-[#e5c67d]/30
            bg-white
            px-6
            shadow-sm
            transition-colors

            dark:border-[#e5c67d]/20
            dark:bg-[#111]
            dark:shadow-none
            py-16
            text-center

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
              bg-[#e5c67d]/[0.08]
              blur-[120px]
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
            <Sparkles
              size={24}
              className="
                mx-auto
                text-[#e5c67d]
              "
            />

            <p
              className="
                mt-5
                text-[9px]
                font-black
                uppercase
                tracking-[0.32em]
                text-[#e5c67d]
              "
            >
              Your Idea Starts Here
            </p>

            <h2
              className="
                mt-4
                font-serif
                text-4xl
                leading-tight

                sm:text-5xl

                lg:text-6xl
              "
            >
              Create Your Own
              <span
                className="
                  italic
                  text-[#e5c67d]
                "
              >
                {" "}
                Design
              </span>
            </h2>

            <p
              className="
                mx-auto
                mt-6
                max-w-2xl
                text-base
                leading-8
                text-slate-600

                dark:text-white/50
              "
            >
              I don&apos;t need something that someone already has. Just dream
              it. Build something that feels like you.
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
              <span>Wear your identity.</span>

              <span>You create it.</span>

              <span>Just dream it.</span>

              <span>It&apos;s not just about the logo.</span>
            </div>

            <button
              type="button"
              onClick={() => navigate(CREATE_ROUTE)}
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
                hover:bg-white
                hover:shadow-[0_0_45px_rgba(229,198,125,0.25)]
              "
            >
              <PencilRuler size={15} />
              Start Creating
              <ArrowRight size={14} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
