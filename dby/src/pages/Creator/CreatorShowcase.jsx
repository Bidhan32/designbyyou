"use strict";

/*
=========================================================
DesignByYou
Creator Showcase
Version 5.2 — Detail Navigation Scroll Fix
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
} from "lucide-react";

import { Link, useNavigate } from "react-router-dom";

import API from "../../api/axios";
import ShowcaseThumbnail from "./ShowcaseThumbnail";
import ShowcaseDesignCard from "./ShowcaseDesignCard";

/*=========================================================
Configuration
=========================================================*/

const SHOWCASE_PAGE_SIZE = 24;

const SHOWCASE_ENDPOINT = "/creator-showcase/pipeline";

const DISCOVERY_ENDPOINT = "/creator-showcase/discovery";

const TOP_DESIGNERS_ENDPOINT = "/creator-showcase/top-designers";

const HERO_ENDPOINT = "/showcase-hero";



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
    design_title: design.title || "Untitled design",
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
        mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between
      "
    >
      <div>
        {eyebrow && (
          <p
            className="
              text-[11px] font-semibold uppercase tracking-normal text-action
            "
          >
            {eyebrow}
          </p>
        )}

        <h2
          className="
            mt-2 font-sans text-3xl tracking-tight sm:text-4xl
          "
        >
          {title}
        </h2>

        {description && (
          <p
            className="
              mt-3 max-w-2xl text-sm leading-6 text-muted
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
        flex min-h-[160px] items-center justify-center rounded-md border border-line bg-surface transition-colors dark:bg-subtle
      "
    >
      <div
        className="
          flex items-center gap-3 text-[11px] font-semibold uppercase tracking-normal text-muted
        "
      >
        <Loader2
          size={15}
          className="
            animate-spin text-action
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

export default function CreatorShowcase({ audience = "creator" }) {
  const isCreator = audience === "creator";
  const createRoute = isCreator ? "/creator/tools" : "/designer/upload";
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
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
        design: matchingDesign,

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
        search,
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
  }, [activeDiscoveryTerm, search]);

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
          search,
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
      const safeSlug = cleanText(slug);

      if (!safeSlug) {
        return;
      }

      // Do not carry the New Arrivals scroll position into the detail page.
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });

      navigate(`/${audience}/showcase/${encodeURIComponent(safeSlug)}`);
    },
    [navigate, audience],
  );

  /*=======================================================
  Render
  =======================================================*/

  return (
    <div
      className="
        relative min-h-screen overflow-x-hidden bg-canvas pb-28 text-ink transition-colors duration-300 selection:bg-subtle selection:text-ink
      "
    >
      {/* Featured showcase media */}

      <div
        className="
          relative z-10 mx-auto max-w-[1440px] px-4 pt-6 sm:px-6 md:px-10 lg:px-12
        "
      >
        <section
          className="
            grid overflow-hidden rounded-2xl bg-[#21352f] text-white md:grid-cols-[1.1fr_1fr]
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

          <div className="relative h-52 overflow-hidden sm:h-64 md:col-start-2 md:row-start-1 md:h-auto md:min-h-80">
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
                absolute inset-0 h-full w-full object-cover
              "
            />
          ) : (
            <img
              key={heroBackgroundImage}
              src={heroImageFailed ? fallbackHeroImage : heroBackgroundImage}
              alt=""
              onError={() => setHeroImageFailed(true)}
              className="
                absolute inset-0 h-full w-full object-cover
              "
            />
          )}

          </div>
          <div className="flex flex-col justify-center p-6 sm:p-9 md:col-start-1 md:row-start-1 lg:p-12">
            <h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl lg:text-6xl">Design showcase</h1>
            <p className="mt-3 max-w-sm text-base leading-relaxed text-[#dae6dc]">{isCreator ? "Browse designs and book their designers for custom work." : "Browse published designs and share your work."}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  arrivalsRef.current?.scrollIntoView({
                    behavior: "smooth",
                  })
                }
                className="
                  inline-flex min-h-11 items-center gap-2 rounded-full bg-[#f6f2e8] px-5 text-sm font-semibold text-[#21352f] hover:bg-white"
              >
                Explore Designs
                <ArrowRight size={14} />
              </button>

              <button
                type="button"
                onClick={() => navigate(createRoute)}
                className="
                  inline-flex min-h-11 items-center gap-2 rounded-full border border-white/50 px-5 text-sm font-semibold hover:bg-white/10"
              >
                <PencilRuler size={14} />
                {isCreator ? "Create Your Own" : "Share Your Design"}
              </button>
            </div>

            {isCreator && (
              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/25 pt-3">
                <p className="text-sm text-[#dae6dc]">Paid plans waive the booking connection fee.</p>
                <Link
                  to="/creator/wallet#subscription"
                  className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold underline decoration-white/50 underline-offset-4 hover:decoration-white"
                >
                  View subscription
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              </div>
            )}
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
          relative z-10 mx-auto max-w-[1440px] px-4 sm:px-6 md:px-10 lg:px-12
        "
      >
        {/*=================================================
        Discovery Error
        =================================================*/}

        {discoveryError && (
          <div
            role="alert"
            className="
              mt-8 flex flex-col gap-4 rounded-md border border-line bg-subtle p-4 sm:flex-row sm:items-center sm:justify-between
            "
          >
            <div
              className="
                flex items-center gap-3 text-sm text-action
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
                inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-action
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
            py-10 sm:py-12
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
                      grid h-9 w-11 place-items-center rounded-md border border-line bg-surface text-muted transition hover:border-line hover:text-action dark:bg-subtle
                    "
                  >
                    <ChevronLeft size={17} />
                  </button>

                  <button
                    type="button"
                    aria-label="Next trending styles"
                    onClick={() => scrollTrending("right")}
                    className="
                      grid h-9 w-11 place-items-center rounded-md border border-line bg-surface text-muted transition hover:border-line hover:text-action dark:bg-subtle
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
                rounded-md border border-dashed border-line bg-surface p-4 text-center text-sm text-muted dark:bg-subtle
              "
            >
              Trending styles are currently unavailable.
            </div>
          ) : (
            <div
              ref={trendingRef}
              className="
                flex snap-x gap-5 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
              "
            >
              {trendingCards.map((term, index) => (
                <button
                  key={term.id}
                  type="button"
                  onClick={() => applyDiscovery(term)}
                  className="
                      group relative min-w-[310px] snap-start overflow-hidden rounded-md border border-line bg-surface text-left text-ink transition hover:-translate-y-1 hover:border-line sm:min-w-[420px] lg:min-w-[500px]
                    "
                >
                  <div
                    className="
                        relative h-[250px] sm:h-[300px]
                      "
                  >
                    {term.design ? <ShowcaseThumbnail key={`${term.design.slug}:${term.design.updated_at || term.design.created_at}`} item={term.design} /> : (
                    <img
                      src={term.image}
                      alt=""
                      loading="lazy"
                      className="
                          h-full w-full object-cover opacity-70 transition duration-700 group-hover:scale-105
                        "
                    />
                    )}



                    <div
                      className="
                          absolute inset-x-0 bottom-0 border-t border-line bg-surface p-3
                        "
                    >
                      <p
                        className="
                            text-[11px] font-semibold uppercase tracking-normal text-action
                          "
                      >
                        {term.description || `Trending style ${index + 1}`}
                      </p>

                      <div
                        className="
                            mt-2 flex items-end justify-between gap-4
                          "
                      >
                        <h3
                          className="
                              text-lg font-semibold
                            "
                        >
                          {term.name}
                        </h3>

                        <span
                          className="
                              grid h-10 w-10 place-items-center rounded-full border border-line bg-subtle transition group-hover:bg-subtle group-hover:text-ink
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
            border-t border-line py-10 sm:py-12
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
                grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8
              "
            >
              {discovery.styles.map((style, index) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => applyDiscovery(style)}
                  className="
                      group min-h-[135px] rounded-md border border-line bg-surface p-4 text-left transition hover:-translate-y-1 hover:border-line hover:bg-subtle
                    "
                >
                  <span
                    className="
                        text-[11px] font-semibold tracking-[0.15em] text-muted
                      "
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <Palette
                    size={18}
                    className="
                        mt-6 text-muted
                      "
                  />

                  <p
                    className="
                        mt-3 font-serif text-lg transition group-hover:text-action
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
            border-t border-line py-10 sm:py-12
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
                grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6
              "
            >
              {discovery.garments.map((garment) => (
                <button
                  key={garment.id}
                  type="button"
                  onClick={() => applyDiscovery(garment)}
                  className="
                      group flex min-h-[160px] flex-col items-center justify-center rounded-md border border-line bg-surface p-4 text-center transition hover:-translate-y-1 hover:border-line hover:bg-canvas dark:bg-subtle dark:hover:bg-subtle
                    "
                >
                  <span
                    className="
                        text-4xl transition duration-300 group-hover:scale-110
                      "
                  >
                    {garment.emoji || "✦"}
                  </span>

                  <p
                    className="
                        mt-4 font-serif text-lg transition group-hover:text-action
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
            border-t border-line py-10 sm:py-12
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
                grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8
              "
            >
              {discovery.occasions.map((occasion) => (
                <button
                  key={occasion.id}
                  type="button"
                  onClick={() => applyDiscovery(occasion)}
                  className="
                      group min-h-[130px] rounded-md border border-line bg-surface p-4 text-center transition hover:-translate-y-1 hover:border-line dark:bg-subtle
                    "
                >
                  <div className="text-3xl">{occasion.emoji || "✦"}</div>

                  <p
                    className="
                        mt-4 font-serif text-base transition group-hover:text-action
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

        {isCreator && <section
          className="
            border-t border-line py-10 sm:py-12
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
                flex min-h-[230px] items-center justify-center
              "
            >
              <Loader2
                size={28}
                className="
                  animate-spin text-action
                "
              />
            </div>
          ) : topDesignersError ? (
            <div
              className="
                rounded-md border border-line bg-canvas p-4 text-sm text-action dark:bg-subtle
              "
            >
              {topDesignersError}
            </div>
          ) : topDesigners.length === 0 ? (
            <div
              className="
                rounded-md border border-dashed border-line bg-surface p-4 text-center text-sm text-muted dark:bg-subtle
              "
            >
              No featured designers are available yet.
            </div>
          ) : (
            <div
              className="
                grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5
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
                        group rounded-md border border-line bg-surface p-4 transition hover:-translate-y-1 hover:border-line
                      "
                  >
                    <div
                      className="
                          flex items-start justify-between gap-4
                        "
                    >
                      <div
                        className="
                            flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-line bg-subtle
                          "
                      >
                        {designer?.designer_avatar ? (
                          <img
                            src={designer.designer_avatar}
                            alt=""
                            className="
                                h-full w-full object-cover
                              "
                          />
                        ) : (
                          <User
                            size={22}
                            className="
                                text-muted
                              "
                          />
                        )}
                      </div>

                      {index === 0 && (
                        <Crown
                          size={17}
                          className="
                              text-action
                            "
                        />
                      )}
                    </div>

                    <h3
                      className="
                          mt-5 truncate font-serif text-xl
                        "
                    >
                      {designer?.designer_name || "Designer"}
                    </h3>

                    <div
                      className="
                          mt-3 flex flex-wrap gap-2
                        "
                    >
                      {Number.isFinite(rating) && rating > 0 && (
                        <span
                          className="
                                inline-flex items-center gap-1 rounded-md bg-subtle px-2.5 py-1 text-[11px] font-bold text-action
                              "
                        >
                          <Star size={9} fill="currentColor" />

                          {rating.toFixed(1)}
                        </span>
                      )}

                      <span
                        className="
                            rounded-md bg-subtle px-2.5 py-1 text-[11px] text-muted
                          "
                      >
                        {bookings} {bookings === 1 ? "booking" : "bookings"}
                      </span>
                    </div>

                    <div
                      className="
                          mt-5 grid grid-cols-2 gap-2
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
                            rounded-md border border-line bg-surface py-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-ink transition hover:border-line hover:text-ink dark:bg-transparent dark:text-muted disabled:cursor-not-allowed disabled:opacity-40
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
                            rounded-md bg-subtle py-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40
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
        </section>}

        {/*=================================================
        NEW ARRIVALS
        =================================================*/}

        <section
          ref={arrivalsRef}
          className="
            scroll-mt-28 border-t border-line py-10 sm:py-12
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
                    rounded-md border border-line bg-surface px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted transition hover:border-line hover:text-action dark:bg-subtle
                  "
                >
                  View All
                </button>
              ) : null
            }
          />

          <form className="mb-6 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); }}>
            <div className="min-w-0 flex-1">
              <label htmlFor="showcase-search" className="mb-2 block text-sm font-medium">Search designs</label>
              <input id="showcase-search" type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search titles, styles or designers"
                className="w-full rounded-md border border-line bg-surface px-4 py-3 text-base text-ink" />
            </div>
            <button type="submit" className="rounded-md bg-action px-5 py-3 text-on-action dark:bg-surface dark:text-ink">Search</button>
            {search && <button type="button" className="px-3 py-3 text-sm underline" onClick={() => { setSearchDraft(""); setSearch(""); }}>Clear search</button>}
          </form>

          {showcaseError && (
            <div
              role="alert"
              className="
                mb-7 flex items-center gap-3 rounded-md border border-line bg-canvas px-5 py-4 text-sm text-action dark:bg-subtle
              "
            >
              <ShieldAlert size={18} />

              {showcaseError}
            </div>
          )}

          {loading ? (
            <div
              className="
                flex min-h-[380px] flex-col items-center justify-center gap-4
              "
            >
              <Loader2
                size={38}
                className="
                  animate-spin text-action
                "
              />

              <span
                className="
                  text-[11px] font-semibold uppercase tracking-normal text-muted
                "
              >
                Loading Showcase
              </span>
            </div>
          ) : items.length === 0 ? (
            <div
              className="
                flex min-h-[330px] flex-col items-center justify-center rounded-md border border-dashed border-line bg-surface px-6 text-center dark:bg-subtle
              "
            >
              <Sparkles
                size={36}
                className="
                  text-muted
                "
              />

              <h3
                className="
                  mt-5 font-sans text-2xl
                "
              >
                No designs found.
              </h3>

              <p
                className="
                  mt-2 text-sm text-muted
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
                    mt-6 rounded-md bg-subtle px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink
                  "
                >
                  View All
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="showcase-design-grid">
                {items.map((item, index) => {
                  const ownerName = getOwnerName(item);

                  const ownerAvatar = getOwnerAvatar(item);

                  const designerOwned = isDesignerOwned(item);

                  const rating = getDesignerRating(item);

                  const bookingUrl = isCreator ? buildBookingUrl(item) : null;

                  return (
                    <ShowcaseDesignCard key={getDesignKey(item, index)} item={item}
                      ownerName={ownerName} ownerAvatar={ownerAvatar} designerOwned={designerOwned}
                      rating={rating} bookingUrl={bookingUrl} onOpen={openDesign}>
                      <ShowcaseThumbnail key={`${item.slug}:${item.updated_at || item.created_at}`} item={item} />
                    </ShowcaseDesignCard>
                  );
                })}
              </div>

              {hasMore && (
                <div
                  className="
                    mt-10 flex justify-center
                  "
                >
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="
                      inline-flex min-w-[180px] items-center justify-center gap-2 rounded-md border border-line bg-subtle px-6 py-3.5 text-[11px] font-semibold uppercase tracking-normal text-action transition hover:bg-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-50
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

        
      </div>
    </div>
  );
}
