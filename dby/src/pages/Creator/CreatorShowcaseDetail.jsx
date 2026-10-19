"use strict";
/**
 * DesignByYou — Creator Showcase Detail
 * Version 3.6 — Multi-select Showcase Gallery to Fashion Editor
 * Preserves Creator/Designer role-specific actions and scroll restoration.
 * Expects an owner-safe public detail response with `images` (ordered gallery).
 * Falls back to the legacy single preview when the gallery is absent.
 */
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Layers3,
  Loader2,
  MapPin,
  Palette,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  User,
  Zap,
} from "lucide-react";
import API from "../../api/axios";
function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}
function isGalleryImageId(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isRequestCanceled(error) {
  return (
    error?.code === "ERR_CANCELED" ||
    error?.name === "CanceledError" ||
    error?.name === "AbortError"
  );
}
function isDesignerOwned(item) {
  return (
    item?.owner_role === "designer" ||
    item?.can_book_designer === true ||
    item?.can_book_designer === "true"
  );
}
function getOwnerName(item) {
  return (
    cleanText(item?.owner_name) ||
    cleanText(item?.designer_name) ||
    "DesignByYou Creator"
  );
}
function getOwnerAvatar(item) {
  return cleanText(item?.owner_avatar) || cleanText(item?.designer_avatar);
}
function getDesignerRating(item) {
  if (!isDesignerOwned(item)) {
    return null;
  }
  const rating = Number.parseFloat(item?.designer_avg_rating);
  if (!Number.isFinite(rating) || rating <= 0) {
    return null;
  }
  return rating;
}
function getCompletedBookings(item) {
  if (!isDesignerOwned(item)) {
    return 0;
  }
  const count = Number.parseInt(item?.total_completed_bookings, 10);
  if (!Number.isInteger(count) || count < 0) {
    return 0;
  }
  return count;
}
function formatPublishedDate(value) {
  if (!value) {
    return "Recently";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}
function buildBookingUrl(item) {
  if (!isDesignerOwned(item)) {
    return null;
  }
  const designerId = item?.designer_id;
  const designId = item?.design_id;
  if (!designerId || !designId) {
    return null;
  }
  const params = new URLSearchParams({
    designer_id: String(designerId),
    design_id: String(designId),
  });
  return `/creator/bookings/new?${params.toString()}`;
}
/** Normalize gallery rows coming from the public Showcase detail API. */
function getShowcaseImages(item) {
  if (!item || typeof item !== "object") return [];

  // Gallery records are public only when the detail API authorizes the design.
  // Do NOT make a separate request to the private Creator Studio owner endpoint.
  const galleryRows = Array.isArray(item.images) ? item.images : [];
  const entries = galleryRows
    .map((image, originalIndex) => {
      const rawUrl =
        typeof image === "string"
          ? image
          : image?.image_url || image?.url || "";

      const url = cleanText(rawUrl);
      if (!isPublicImageUrl(url)) return null;

      const rawPosition = Number(
        typeof image === "object" ? image?.display_order : NaN,
      );

      return {
        id:
          typeof image === "object" && image?.id
            ? String(image.id)
            : `gallery-${originalIndex}`,
        url,
        position:
          Number.isInteger(rawPosition) && rawPosition > 0
            ? rawPosition
            : originalIndex + 1,
        originalIndex,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) => a.position - b.position || a.originalIndex - b.originalIndex,
    );

  const unique = new Set();
  const gallery = entries
    .filter(({ url }) => {
      if (unique.has(url)) return false;
      unique.add(url);
      return true;
    })
    .slice(0, 6);

  if (gallery.length) return gallery;

  // Backwards compatible: older Creator Studio / Fashion Editor / Designer items.
  const cover = cleanText(item.watermarked_preview_url || item.preview_url);

  return isPublicImageUrl(cover)
    ? [{ id: "legacy-cover", url: cover, position: 1, originalIndex: 0 }]
    : [];
}

function isPublicImageUrl(source) {
  if (!source || typeof source !== "string") return false;
  try {
    const url = new URL(source);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

export default function CreatorShowcaseDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingEditor, setOpeningEditor] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  // Explicit multi-selection is independent of the image being previewed.
  const [selectedImageIds, setSelectedImageIds] = useState([]);
  const touchStartXRef = useRef(null);

  const showcaseImages = useMemo(() => getShowcaseImages(item), [item]);
  const currentImage =
    showcaseImages[activeImageIndex] || showcaseImages[0] || null;
  const hasGallery = showcaseImages.length > 1;
  const currentImageId = isGalleryImageId(currentImage?.id)
    ? currentImage.id
    : null;
  const selectedGalleryImages = showcaseImages.filter(
    (image) =>
      isGalleryImageId(image.id) && selectedImageIds.includes(image.id),
  );
  const selectedCount = selectedGalleryImages.length;
  const eligibleImageIds = showcaseImages
    .filter((image) => isGalleryImageId(image.id))
    .map((image) => image.id);
  const selectedImageNumber = Math.min(
    activeImageIndex + 1,
    showcaseImages.length,
  );
  const editorActionLabel =
    selectedCount > 1
      ? `Open ${selectedCount} Images in Fashion Editor`
      : selectedCount === 1
        ? `Open Selected Image in Fashion Editor`
        : hasGallery
          ? `Edit Image ${selectedImageNumber} in Fashion Editor`
          : "Open in Fashion Editor";

  const toggleImageSelection = (imageId) => {
    if (openingEditor || !isGalleryImageId(imageId)) return;
    setEditorError("");
    setSelectedImageIds((previous) =>
      previous.includes(imageId)
        ? previous.filter((id) => id !== imageId)
        : [...previous, imageId].slice(0, 6),
    );
  };

  const selectAllImages = () => {
    if (openingEditor) return;
    setSelectedImageIds(eligibleImageIds.slice(0, 6));
    setEditorError("");
  };

  const clearImageSelection = () => {
    if (openingEditor) return;
    setSelectedImageIds([]);
    setEditorError("");
  };

  const changeImage = (direction) => {
    if (showcaseImages.length < 2 || openingEditor) return;
    setActiveImageIndex(
      (index) =>
        (index + direction + showcaseImages.length) % showcaseImages.length,
    );
  };

  const onImageKeyDown = (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      changeImage(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      changeImage(1);
    }
  };

  const onImageTouchStart = (event) => {
    touchStartXRef.current = event.changedTouches?.[0]?.clientX ?? null;
  };

  const onImageTouchEnd = (event) => {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX === null || !hasGallery) return;

    const endX = event.changedTouches?.[0]?.clientX;
    if (!Number.isFinite(endX)) return;

    const delta = endX - startX;
    if (Math.abs(delta) >= 45) changeImage(delta < 0 ? 1 : -1);
  };

  useEffect(() => {
    setActiveImageIndex(0);
    setSelectedImageIds([]);
  }, [slug, item?.design_id]);

  // Reset scroll whenever a Showcase detail route opens or finishes loading.

  // React Router otherwise may retain the scroll position from New Arrivals.

  useLayoutEffect(() => {
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    };
    scrollToTop();

    const frame = window.requestAnimationFrame(scrollToTop);
    return () => window.cancelAnimationFrame(frame);
  }, [slug, loading]);
  useEffect(() => {
    const controller = new AbortController();
    const loadItem = async () => {
      if (!slug) {
        setItem(null);
        setError("The requested showcase item is invalid.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      setEditorError("");
      setItem(null);
      try {
        const response = await API.get(
          `/creator-showcase/item/${encodeURIComponent(slug)}`,
          {
            signal: controller.signal,
          },
        );
        if (controller.signal.aborted) {
          return;
        }
        const showcaseItem = response?.data?.data;
        if (!showcaseItem) {
          setError("The showcase item could not be loaded.");
          return;
        }
        setActiveImageIndex(0);
        setItem(showcaseItem);
      } catch (requestError) {
        if (controller.signal.aborted || isRequestCanceled(requestError)) {
          return;
        }
        if (import.meta.env.DEV) {
          console.error(
            "Creator Showcase detail request failed:",
            requestError?.response?.data || requestError,
          );
        }
        const status = requestError?.response?.status;
        if (status === 404) {
          setError("This showcase design is no longer available.");
        } else if (status === 400) {
          setError(
            requestError?.response?.data?.message ||
              "The requested showcase item is invalid.",
          );
        } else {
          setError(
            requestError?.response?.data?.message ||
              "Unable to load this showcase design right now.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    void loadItem();
    return () => {
      controller.abort();
    };
  }, [slug]);
  const handleOpenInEditor = async () => {
    if (openingEditor) return;

    const designId = cleanText(item?.design_id);
    if (!designId) {
      setEditorError(
        "This Showcase design cannot be opened in Fashion Editor.",
      );
      return;
    }

    // A gallery selection must use database image identifiers, never URLs.
    // When nothing is checked, keep the existing single-current-image behavior.
    if (hasGallery && selectedCount === 0 && !currentImageId) {
      setEditorError(
        "The gallery image cannot be identified. Refresh and try again.",
      );
      return;
    }

    const requestedIds = selectedGalleryImages.map((image) => image.id);
    let payload;
    if (requestedIds.length > 1) {
      payload = { image_ids: requestedIds };
    } else if (requestedIds.length === 1) {
      payload = { image_id: requestedIds[0] };
    } else {
      payload = currentImageId ? { image_id: currentImageId } : {};
    }

    setEditorError("");
    setOpeningEditor(true);
    try {
      const response = await API.post(
        `/creators/showcase/${encodeURIComponent(designId)}/open-in-editor`,
        payload,
      );
      const record = response?.data?.data || {};

      // Version 5.5 does not support image_ids. Reject older single-image
      // responses rather than incorrectly navigate to a cover-image project.
      if (requestedIds.length > 1) {
        const returnedIds = Array.isArray(record.source_image_ids)
          ? record.source_image_ids.map(String)
          : [];
        const matches =
          returnedIds.length === requestedIds.length &&
          requestedIds.every((id) => returnedIds.includes(id));
        if (!matches) {
          throw new Error(
            "Multi-image opening needs the updated creatorController.js backend. " +
              "The server has not confirmed this selection, so the old cover project was not opened.",
          );
        }
      }

      const projectId = cleanText(record.project_id || record.id);
      if (!/^[1-9]\d*$/.test(projectId)) {
        throw new Error("The Fashion Editor project ID was not returned.");
      }

      navigate(`/creator/fashion-editor/${encodeURIComponent(projectId)}`);
    } catch (requestError) {
      if (import.meta.env.DEV) {
        console.error(
          "Open Showcase design in Fashion Editor failed:",
          requestError?.response?.data || requestError,
        );
      }
      const status = requestError?.response?.status;
      if (status === 401) {
        setEditorError(
          "Please sign in again to open this design in Fashion Editor.",
        );
      } else if (status === 403) {
        setEditorError(
          requestError?.response?.data?.message ||
            "Only Creator accounts can open Showcase designs in Fashion Editor.",
        );
      } else if (status === 404) {
        setEditorError(
          requestError?.response?.data?.message ||
            "This Showcase design is no longer available.",
        );
      } else if (status === 409) {
        setEditorError(
          requestError?.response?.data?.message ||
            "This Showcase source is no longer available.",
        );
      } else {
        setEditorError(
          requestError?.response?.data?.message ||
            requestError?.message ||
            "This design could not be opened in Fashion Editor right now.",
        );
      }
    } finally {
      setOpeningEditor(false);
    }
  };

  const derived = useMemo(() => {
    if (!item) {
      return {
        designerOwned: false,
        ownerName: "",
        ownerAvatar: "",
        designerRating: null,
        completedBookings: 0,
        bookingUrl: null,
        designerStudioUrl: null,
        canOpenInEditor: false,
        tags: [],
      };
    }
    const designerOwned = isDesignerOwned(item);
    const designerId = designerOwned ? item?.designer_id : null;
    return {
      designerOwned,
      ownerName: getOwnerName(item),
      ownerAvatar: getOwnerAvatar(item),
      designerRating: getDesignerRating(item),
      completedBookings: getCompletedBookings(item),
      bookingUrl: buildBookingUrl(item),
      designerStudioUrl: designerId
        ? `/creator/studio/${encodeURIComponent(designerId)}`
        : null,
      canOpenInEditor: Boolean(cleanText(item?.design_id)),
      tags: Array.isArray(item?.tags) ? item.tags.filter(Boolean) : [],
    };
  }, [item]);
  if (loading) {
    return (
      <div
        className="
          flex
          min-h-[calc(100vh-5rem)]
          flex-col
          items-center
          justify-center
          gap-4
          bg-slate-50
          text-slate-900
          transition-colors
          duration-300
          dark:bg-[#030303]
          dark:text-white
        "
      >
        <div className="relative">
          <div
            className="
              absolute
              inset-0
              animate-spin
              rounded-full
              border-t-2
              border-[#D4AF37]
            "
          />
          <Loader2
            size={40}
            aria-hidden="true"
            className="
              animate-spin
              text-slate-400
              dark:text-white/20
            "
          />
        </div>
        <span
          className="
            animate-pulse
            text-[10px]
            font-bold
            uppercase
            tracking-[0.3em]
            text-[#D4AF37]
          "
        >
          Loading Showcase
        </span>
      </div>
    );
  }
  if (error || !item) {
    return (
      <div
        className="
          relative
          flex
          min-h-[calc(100vh-5rem)]
          items-center
          justify-center
          overflow-hidden
          bg-slate-50
          p-6
          text-slate-900
          transition-colors
          duration-300
          dark:bg-[#030303]
          dark:text-white
        "
      >
        <div
          aria-hidden="true"
          className="
            pointer-events-none
            absolute
            left-1/2
            top-1/2
            h-[40vw]
            w-[40vw]
            -translate-x-1/2
            -translate-y-1/2
            rounded-full
            bg-rose-500/5
            blur-[120px]
          "
        />
        <div
          className="
            relative
            z-10
            w-full
            max-w-md
            space-y-4
            rounded-3xl
            border
            border-slate-200
            bg-white
            p-10
            text-center
            shadow-2xl
            backdrop-blur-xl
            dark:border-white/10
            dark:bg-[#0a0a0a]
          "
        >
          <Sparkles
            size={48}
            aria-hidden="true"
            className="
              mx-auto
              mb-6
              text-slate-300
              dark:text-white/10
            "
          />
          <h2
            className="
              font-serif
              text-2xl
              tracking-wide
              text-slate-900
              dark:text-white
            "
          >
            Showcase Item Unavailable
          </h2>
          <p
            className="
              text-xs
              font-bold
              uppercase
              leading-6
              tracking-widest
              text-slate-500
              dark:text-white/40
            "
          >
            {error || "This showcase item is unavailable."}
          </p>
          <Link
            to="/creator/showcase"
            className="
              mt-8
              inline-flex
              items-center
              justify-center
              gap-2
              rounded-full
              bg-[#D4AF37]
              px-8
              py-3
              text-[10px]
              font-black
              uppercase
              tracking-[0.2em]
              text-black
              transition
              hover:bg-[#ead28f]
              dark:hover:bg-white
            "
          >
            <ChevronLeft size={13} />
            Return to Showcase
          </Link>
        </div>
      </div>
    );
  }
  const {
    designerOwned,
    ownerName,
    ownerAvatar,
    designerRating,
    completedBookings,
    bookingUrl,
    designerStudioUrl,
    canOpenInEditor,
    tags,
  } = derived;
  return (
    <div
      className="
        relative
        min-h-screen
        overflow-x-hidden
        bg-slate-50
        pb-32
        text-slate-900
        transition-colors
        duration-300
        selection:bg-[#D4AF37]
        selection:text-black
        dark:bg-[#030303]
        dark:text-white
      "
    >
      <div
        aria-hidden="true"
        className="
          pointer-events-none
          fixed
          inset-0
          z-0
          overflow-hidden
        "
      >
        <div
          className="
            absolute
            -right-[5%]
            -top-[10%]
            h-[40vw]
            w-[40vw]
            rounded-full
            bg-[#D4AF37]/10
            blur-[150px]
          "
        />
        <div
          className="
            absolute
            -bottom-[20%]
            -left-[10%]
            h-[50vw]
            w-[50vw]
            rounded-full
            bg-violet-500/[0.035]
            blur-[160px]
          "
        />
      </div>
      <div
        className="
          sticky
          top-20
          z-40
          border-b
          border-slate-200
          bg-white/90
          px-4
          py-4
          shadow-2xl
          backdrop-blur-xl
          sm:px-6
          dark:border-white/5
          dark:bg-[#0a0a0a]/90
        "
      >
        <div
          className="
            mx-auto
            flex
            max-w-[1800px]
            items-center
            justify-between
            gap-4
          "
        >
          <Link
            to="/creator/showcase"
            className="
              group
              flex
              min-w-0
              items-center
              gap-2
              text-[9px]
              font-bold
              uppercase
              tracking-[0.16em]
              text-slate-500
              transition
              hover:text-slate-950
              sm:text-[10px]
              dark:text-white/40
              dark:hover:text-white
            "
          >
            <span
              className="
                flex
                h-8
                w-8
                shrink-0
                items-center
                justify-center
                rounded-full
                border
                border-slate-200
                bg-slate-100
                group-hover:bg-slate-200
                dark:border-white/5
                dark:bg-white/5
                dark:group-hover:bg-white/10
              "
            >
              <ChevronLeft size={14} />
            </span>
            <span className="truncate">Back to Showcase</span>
          </Link>
          <div
            className="
              flex
              max-w-[55%]
              items-center
              gap-2
            "
          >
            {item?.category_name && (
              <span
                className="
                  hidden
                  truncate
                  rounded-full
                  border
                  border-slate-200
                  bg-slate-100/80
                  px-3
                  py-2
                  text-[8px]
                  font-black
                  uppercase
                  tracking-[0.15em]
                  text-slate-600
                  sm:block
                  dark:border-white/10
                  dark:bg-white/[0.04]
                  dark:text-white/45
                "
              >
                {item.category_name}
              </span>
            )}
            <span
              className="
                truncate
                rounded-full
                border
                border-[#D4AF37]/30
                bg-[#D4AF37]/10
                px-3
                py-2
                text-[8px]
                font-black
                uppercase
                tracking-[0.18em]
                text-[#D4AF37]
                sm:px-4
              "
            >
              {item.style_category || "Showcase Design"}
            </span>
          </div>
        </div>
      </div>
      <div
        className="
          relative
          z-10
          mx-auto
          mt-8
          grid
          max-w-[1800px]
          grid-cols-1
          gap-8
          px-4
          sm:px-6
          md:mt-12
          lg:grid-cols-12
          lg:gap-12
        "
      >
        <div
          className="
            space-y-8
            lg:col-span-8
          "
        >
          <div
            className="
              group
              relative
              flex
              aspect-[4/3]
              items-center
              justify-center
              overflow-hidden
              rounded-3xl
              border
              border-slate-200
              bg-white
              p-2
              shadow-2xl
              dark:border-white/5
              dark:bg-[#0a0a0a]
            "
          >
            <div
              className="
                relative
                h-full
                w-full
                overflow-hidden
                rounded-2xl
                bg-slate-100
                dark:bg-[#111]
              "
              tabIndex={hasGallery ? 0 : undefined}
              role={hasGallery ? "region" : undefined}
              aria-label={
                hasGallery
                  ? "Showcase image gallery, use arrow keys to navigate"
                  : undefined
              }
              onKeyDown={hasGallery ? onImageKeyDown : undefined}
              onTouchStart={hasGallery ? onImageTouchStart : undefined}
              onTouchEnd={hasGallery ? onImageTouchEnd : undefined}
            >
              {currentImage?.url ? (
                <img
                  src={currentImage.url}
                  alt={`${item.title || "Showcase design"} — image ${activeImageIndex + 1} of ${showcaseImages.length}`}
                  loading="eager"
                  decoding="async"
                  className="
                    h-full
                    w-full
                    object-contain
                    opacity-95
                    transition
                    duration-[1.2s]
                    group-hover:scale-[1.02]
                    group-hover:opacity-100
                  "
                />
              ) : (
                <div
                  className="
                    flex
                    h-full
                    w-full
                    flex-col
                    items-center
                    justify-center
                    gap-3
                    text-slate-300
                    dark:text-white/10
                  "
                >
                  <Sparkles size={48} />
                  <span
                    className="
                      text-[10px]
                      font-black
                      uppercase
                      tracking-widest
                    "
                  >
                    Preview Unavailable
                  </span>
                </div>
              )}
              {hasGallery && (
                <>
                  <button
                    type="button"
                    onClick={() => changeImage(-1)}
                    aria-label="Previous gallery image"
                    className="absolute left-3 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/65 text-white backdrop-blur transition hover:bg-[#D4AF37] hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37] sm:left-5"
                  >
                    <ChevronLeft size={21} />
                  </button>
                  <button
                    type="button"
                    onClick={() => changeImage(1)}
                    aria-label="Next gallery image"
                    className="absolute right-3 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/65 text-white backdrop-blur transition hover:bg-[#D4AF37] hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37] sm:right-5"
                  >
                    <ChevronRight size={21} />
                  </button>
                  <span
                    aria-live="polite"
                    className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-white/15 bg-black/65 px-4 py-2 text-[10px] font-bold tracking-[0.15em] text-white backdrop-blur"
                  >
                    {activeImageIndex + 1} / {showcaseImages.length}
                  </span>
                </>
              )}

              <div
                className="
                  pointer-events-none
                  absolute
                  inset-0
                  bg-gradient-to-t
                  from-[#030303]/65
                  via-transparent
                  to-transparent
                "
              />
              <div
                className="
                  absolute
                  bottom-4
                  left-4
                  flex
                  items-center
                  gap-2
                  rounded-full
                  border
                  border-white/10
                  bg-black/55
                  px-3
                  py-2
                  text-[8px]
                  font-black
                  uppercase
                  tracking-[0.18em]
                  text-white/55
                  backdrop-blur-md
                "
              >
                <ShieldCheck
                  size={11}
                  className="
                    text-[#D4AF37]
                  "
                />
                Showcase Preview
              </div>
              <div
                className="
                  absolute
                  bottom-4
                  right-4
                  rounded-full
                  border
                  border-white/10
                  bg-black/55
                  px-3
                  py-2
                  text-[8px]
                  font-black
                  uppercase
                  tracking-[0.14em]
                  text-white/50
                  backdrop-blur-md
                "
              >
                {designerOwned ? "Designer Work" : "Creator Work"}
              </div>
            </div>
          </div>
          {hasGallery && (
            <div
              aria-label="Showcase gallery thumbnails and Editor image selection"
              className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm dark:border-white/10 dark:bg-[#0a0a0a] sm:p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-800 dark:text-white/80">
                    Choose images for Fashion Editor
                  </p>
                  <p
                    aria-live="polite"
                    className="mt-1 text-[11px] text-slate-500 dark:text-white/45"
                  >
                    {selectedCount > 0
                      ? `${selectedCount} of ${showcaseImages.length} selected`
                      : `No checkboxes selected — opens preview image ${selectedImageNumber}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllImages}
                    disabled={openingEditor || eligibleImageIds.length === 0}
                    className="rounded-lg border border-[#D4AF37]/35 px-3 py-2 text-[10px] font-bold text-[#9f7711] hover:bg-[#D4AF37]/10 disabled:opacity-50 dark:text-[#D4AF37]"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={clearImageSelection}
                    disabled={openingEditor || selectedCount === 0}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-white/65 dark:hover:bg-white/10"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {showcaseImages.map((image, index) => {
                  const selectable = isGalleryImageId(image.id);
                  const checked =
                    selectable && selectedImageIds.includes(image.id);
                  return (
                    <div key={`${image.id}-${index}`} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (openingEditor) return;
                          setActiveImageIndex(index);
                          setEditorError("");
                        }}
                        disabled={openingEditor}
                        aria-label={`Preview image ${index + 1} of ${showcaseImages.length}`}
                        aria-pressed={index === activeImageIndex}
                        className={`relative block aspect-[4/3] w-full overflow-hidden rounded-xl border-2 bg-slate-100 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37] dark:bg-[#111] ${
                          index === activeImageIndex
                            ? "border-[#D4AF37] ring-2 ring-[#D4AF37]/30"
                            : "border-slate-200 hover:border-[#D4AF37]/50 dark:border-white/10"
                        }`}
                      >
                        <img
                          src={image.url}
                          alt={`Thumbnail ${index + 1}`}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-contain"
                        />
                        <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[9px] text-white">
                          {index + 1}
                        </span>
                      </button>
                      {selectable && (
                        <label className="absolute left-1 top-1 z-10 flex cursor-pointer items-center gap-1 rounded-lg bg-black/80 px-2 py-1 text-[9px] font-bold text-white shadow-lg">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={openingEditor}
                            onChange={() => toggleImageSelection(image.id)}
                            aria-label={`Select image ${index + 1} for Fashion Editor`}
                            className="h-4 w-4 cursor-pointer accent-[#D4AF37]"
                          />
                          {checked ? "Selected" : "Select"}
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 px-1 text-center text-[10px] text-slate-500 dark:text-white/40">
                Click a thumbnail to preview it. Tick checkboxes to open several
                images together in one project (maximum 6).
              </p>
            </div>
          )}

          <section
            className="
              space-y-8
              rounded-3xl
              border
              border-slate-200
              bg-white
              p-6
              shadow-2xl
              sm:p-8
              md:p-10
              dark:border-white/5
              dark:bg-[#0a0a0a]
            "
          >
            <div>
              <h1
                className="
                  font-serif
                  text-3xl
                  font-light
                  leading-tight
                  tracking-tight
                  sm:text-4xl
                  md:text-5xl
                "
              >
                {item.title || "Untitled Design"}
              </h1>
              <div
                className="
                  mt-5
                  flex
                  flex-wrap
                  items-center
                  gap-x-5
                  gap-y-2
                  text-[9px]
                  font-bold
                  uppercase
                  tracking-[0.16em]
                  text-slate-500
                  dark:text-white/35
                "
              >
                <span
                  className="
                    flex
                    items-center
                    gap-2
                  "
                >
                  <Calendar
                    size={12}
                    className="
                      text-[#D4AF37]
                    "
                  />
                  Published {formatPublishedDate(item.created_at)}
                </span>
                {item?.category_name && (
                  <span
                    className="
                      flex
                      items-center
                      gap-2
                    "
                  >
                    <Layers3
                      size={12}
                      className="
                        text-[#D4AF37]
                      "
                    />
                    {item.category_name}
                  </span>
                )}
                {item?.style_category && (
                  <span
                    className="
                      flex
                      items-center
                      gap-2
                    "
                  >
                    <Palette
                      size={12}
                      className="
                        text-[#D4AF37]
                      "
                    />
                    {item.style_category}
                  </span>
                )}
              </div>
            </div>
            <div
              className="
                h-px
                bg-gradient-to-r
                from-slate-200
                via-slate-100
                to-transparent
                dark:from-white/10
                dark:via-white/5
              "
            />
            <div>
              <h2
                className="
                  mb-4
                  flex
                  items-center
                  gap-2
                  text-[10px]
                  font-black
                  uppercase
                  tracking-[0.25em]
                  text-[#D4AF37]
                "
              >
                <Sparkles size={12} />
                Concept
              </h2>
              <p
                className="
                  whitespace-pre-wrap
                  text-sm
                  font-light
                  leading-loose
                  text-slate-700
                  md:text-base
                  dark:text-white/70
                "
              >
                {item.description || "No design description has been provided."}
              </p>
            </div>
            {tags.length > 0 && (
              <div
                className="
                  border-t
                  border-slate-200
                  pt-7
                  dark:border-white/5
                "
              >
                <p
                  className="
                    mb-4
                    text-[9px]
                    font-black
                    uppercase
                    tracking-[0.2em]
                    text-slate-500
                    dark:text-white/30
                  "
                >
                  Creative Tags
                </p>
                <div
                  className="
                    flex
                    flex-wrap
                    gap-2
                  "
                >
                  {tags.map((tag, index) => (
                    <span
                      key={`${tag}-${index}`}
                      className="
                        flex
                        items-center
                        gap-1.5
                        rounded-full
                        border
                        border-slate-200
                        bg-slate-100
                        px-4
                        py-2
                        text-[9px]
                        font-bold
                        uppercase
                        tracking-[0.16em]
                        text-slate-600
                        dark:border-white/10
                        dark:bg-white/5
                        dark:text-white/50
                      "
                    >
                      <Tag size={10} />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
        <aside
          className="
            space-y-6
            lg:col-span-4
          "
        >
          <section
            className="
              overflow-hidden
              rounded-3xl
              border
              border-slate-200
              bg-white
              p-6
              shadow-2xl
              sm:p-8
              lg:sticky
              lg:top-36
              dark:border-white/5
              dark:bg-[#0a0a0a]
            "
          >
            <p
              className="
                mb-5
                text-[9px]
                font-black
                uppercase
                tracking-[0.25em]
                text-[#D4AF37]
              "
            >
              {designerOwned ? "Featured Designer" : "Showcase Creator"}
            </p>
            <div
              className="
                flex
                items-center
                gap-4
              "
            >
              <div
                className="
                  flex
                  h-16
                  w-16
                  shrink-0
                  items-center
                  justify-center
                  overflow-hidden
                  rounded-full
                  border
                  border-slate-200
                  bg-slate-100
                  dark:border-white/10
                  dark:bg-[#111]
                "
              >
                {ownerAvatar ? (
                  <img
                    src={ownerAvatar}
                    alt={`${ownerName} profile`}
                    loading="lazy"
                    decoding="async"
                    className="
                      h-full
                      w-full
                      object-cover
                    "
                  />
                ) : (
                  <User
                    size={24}
                    className="
                      text-slate-400
                      dark:text-white/20
                    "
                  />
                )}
              </div>
              <div className="min-w-0">
                <h2
                  className="
                    truncate
                    font-serif
                    text-xl
                  "
                >
                  {ownerName}
                </h2>
                <p
                  className="
                    mt-1
                    flex
                    items-center
                    gap-1.5
                    text-[9px]
                    font-black
                    uppercase
                    tracking-[0.16em]
                    text-[#D4AF37]
                  "
                >
                  <ShieldCheck size={11} />
                  {designerOwned ? "Approved Designer" : "Creator"}
                </p>
                {designerOwned && item.city && (
                  <p
                    className="
                      mt-2
                      flex
                      items-center
                      gap-1.5
                      text-[9px]
                      text-slate-500
                      dark:text-white/35
                    "
                  >
                    <MapPin size={10} />
                    {item.city}
                  </p>
                )}
              </div>
            </div>
            {designerOwned ? (
              <>
                {item.designer_bio && (
                  <p
                    className="
                      mt-6
                      rounded-2xl
                      border
                      border-slate-200
                      bg-slate-100
                      p-5
                      text-xs
                      font-light
                      leading-relaxed
                      text-slate-600
                      dark:border-white/5
                      dark:bg-[#111]
                      dark:text-white/50
                    "
                  >
                    {item.designer_bio}
                  </p>
                )}
                <div
                  className="
                    mt-6
                    grid
                    grid-cols-2
                    gap-3
                    border-t
                    border-slate-200
                    pt-6
                    dark:border-white/5
                  "
                >
                  <div
                    className="
                      flex
                      flex-col
                      items-center
                      justify-center
                      rounded-2xl
                      border
                      border-slate-200
                      bg-slate-100/80
                      p-4
                      text-center
                      dark:border-white/5
                      dark:bg-white/[0.04]
                    "
                  >
                    <Star
                      size={16}
                      className="
                        mb-2
                        text-[#D4AF37]
                      "
                      fill={designerRating ? "currentColor" : "none"}
                    />
                    <span
                      className="
                        font-serif
                        text-xl
                      "
                    >
                      {designerRating ? designerRating.toFixed(1) : "New"}
                    </span>
                    <span
                      className="
                        mt-1
                        text-[8px]
                        font-bold
                        uppercase
                        tracking-[0.16em]
                        text-slate-500
                        dark:text-white/35
                      "
                    >
                      Rating
                    </span>
                  </div>
                  <div
                    className="
                      flex
                      flex-col
                      items-center
                      justify-center
                      rounded-2xl
                      border
                      border-slate-200
                      bg-slate-100/80
                      p-4
                      text-center
                      dark:border-white/5
                      dark:bg-white/[0.04]
                    "
                  >
                    <Briefcase
                      size={16}
                      className="
                        mb-2
                        text-slate-700
                        dark:text-white/60
                      "
                    />
                    <span
                      className="
                        font-serif
                        text-xl
                      "
                    >
                      {completedBookings}
                    </span>
                    <span
                      className="
                        mt-1
                        text-[8px]
                        font-bold
                        uppercase
                        tracking-[0.13em]
                        text-slate-500
                        dark:text-white/35
                      "
                    >
                      Completed
                    </span>
                  </div>
                </div>
                <div
                  className="
                    mt-6
                    rounded-2xl
                    border
                    border-[#D4AF37]/15
                    bg-[#D4AF37]/[0.055]
                    p-5
                  "
                >
                  <p
                    className="
                      text-[9px]
                      font-black
                      uppercase
                      tracking-[0.18em]
                      text-[#D4AF37]
                    "
                  >
                    Inspired by this work?
                  </p>
                  <p
                    className="
                      mt-2
                      text-xs
                      leading-6
                      text-slate-600
                      dark:text-white/45
                    "
                  >
                    Use this Showcase design as creative context when starting a
                    custom booking with the Designer.
                  </p>
                </div>
                {canOpenInEditor && (
                  <div
                    className="
                      mt-5
                      rounded-2xl
                      border
                      border-violet-400/15
                      bg-violet-500/[0.055]
                      p-5
                    "
                  >
                    <p
                      className="
                        text-[9px]
                        font-black
                        uppercase
                        tracking-[0.18em]
                        text-violet-600
                        dark:text-violet-300
                      "
                    >
                      Fashion Editor
                    </p>
                    <p
                      className="
                        mt-2
                        text-xs
                        leading-6
                        text-slate-600
                        dark:text-white/45
                      "
                    >
                      Choose one or more gallery images above. Selected images
                      open together in one private Fashion Editor project, with
                      each image as its own editable object. The Designer's
                      original work remains unchanged.
                    </p>
                  </div>
                )}
                <div
                  className="
                    mt-6
                    space-y-3
                  "
                >
                  {canOpenInEditor && (
                    <button
                      type="button"
                      onClick={handleOpenInEditor}
                      disabled={openingEditor}
                      className="
                        flex
                        w-full
                        items-center
                        justify-center
                        gap-2
                        rounded-xl
                        bg-violet-600
                        py-4
                        text-[10px]
                        font-black
                        uppercase
                        tracking-[0.18em]
                        text-white
                        transition
                        hover:bg-violet-500
                        disabled:cursor-not-allowed
                        disabled:opacity-60
                      "
                    >
                      {openingEditor ? (
                        <>
                          <Loader2
                            size={14}
                            aria-hidden="true"
                            className="animate-spin"
                          />
                          Opening Fashion Editor
                        </>
                      ) : (
                        <>
                          <Palette size={14} />

                          {editorActionLabel}

                          <ArrowRight size={13} />
                        </>
                      )}
                    </button>
                  )}
                  {editorError && (
                    <p
                      role="alert"
                      className="
                        rounded-xl
                        border
                        border-rose-500/15
                        bg-rose-500/[0.06]
                        px-4
                        py-3
                        text-[10px]
                        leading-5
                        text-rose-600
                        dark:text-rose-300
                      "
                    >
                      {editorError}
                    </p>
                  )}
                  {bookingUrl && (
                    <Link
                      to={bookingUrl}
                      className="
                        flex
                        w-full
                        items-center
                        justify-center
                        gap-2
                        rounded-xl
                        bg-[#D4AF37]
                        py-4
                        text-[10px]
                        font-black
                        uppercase
                        tracking-[0.18em]
                        text-black
                        transition
                        hover:bg-[#ead28f]
                        dark:hover:bg-white
                      "
                    >
                      <Zap size={14} />
                      Start Booking
                      <ArrowRight size={13} />
                    </Link>
                  )}
                  {designerStudioUrl && (
                    <Link
                      to={designerStudioUrl}
                      className="
                        flex
                        w-full
                        items-center
                        justify-center
                        gap-2
                        rounded-xl
                        border
                        border-slate-200
                        bg-slate-100/80
                        py-3.5
                        text-[9px]
                        font-black
                        uppercase
                        tracking-[0.16em]
                        text-slate-700
                        transition
                        hover:border-[#D4AF37]/40
                        hover:bg-[#D4AF37]/10
                        hover:text-[#D4AF37]
                        dark:border-white/10
                        dark:bg-white/[0.04]
                        dark:text-white/65
                      "
                    >
                      View Designer Studio
                      <ExternalLink size={12} />
                    </Link>
                  )}
                  {item.portfolio_url && (
                    <a
                      href={item.portfolio_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="
                        flex
                        w-full
                        items-center
                        justify-center
                        gap-2
                        rounded-xl
                        border
                        border-slate-200
                        py-3.5
                        text-[9px]
                        font-black
                        uppercase
                        tracking-[0.16em]
                        text-slate-600
                        transition
                        hover:border-slate-400
                        hover:text-slate-950
                        dark:border-white/10
                        dark:text-white/45
                        dark:hover:border-white/25
                        dark:hover:text-white
                      "
                    >
                      Portfolio
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </>
            ) : (
              <div
                className="
                  mt-6
                  border-t
                  border-slate-200
                  pt-6
                  dark:border-white/5
                "
              >
                <div
                  className="
                    rounded-2xl
                    border
                    border-violet-400/10
                    bg-violet-500/[0.055]
                    p-5
                  "
                >
                  <Sparkles
                    size={17}
                    className="
                      text-violet-600
                      dark:text-violet-300
                    "
                  />
                  <h3
                    className="
                      mt-3
                      font-serif
                      text-lg
                    "
                  >
                    Community Inspiration
                  </h3>
                  <p
                    className="
                      mt-2
                      text-xs
                      leading-6
                      text-slate-600
                      dark:text-white/42
                    "
                  >
                    This creative work was shared by a Creator in the
                    DesignByYou Showcase.
                  </p>
                </div>
                {canOpenInEditor && (
                  <div
                    className="
                      mt-5
                      rounded-2xl
                      border
                      border-[#D4AF37]/20
                      bg-[#D4AF37]/[0.055]
                      p-5
                    "
                  >
                    <p
                      className="
                        text-[9px]
                        font-black
                        uppercase
                        tracking-[0.18em]
                        text-[#D4AF37]
                      "
                    >
                      Fashion Editor
                    </p>
                    <p
                      className="
                        mt-2
                        text-xs
                        leading-6
                        text-slate-600
                        dark:text-white/45
                      "
                    >
                      Choose images from the gallery above. Multiple checked
                      images open together on one private Fashion Editor canvas.
                      If no images are checked, the previewed image opens
                      individually. Original Showcase work remains unchanged.
                    </p>
                    <button
                      type="button"
                      onClick={handleOpenInEditor}
                      disabled={openingEditor}
                      className="
                        mt-4
                        flex
                        w-full
                        items-center
                        justify-center
                        gap-2
                        rounded-xl
                        bg-[#D4AF37]
                        py-4
                        text-[10px]
                        font-black
                        uppercase
                        tracking-[0.18em]
                        text-black
                        transition
                        hover:bg-[#ead28f]
                        dark:hover:bg-white
                        disabled:cursor-not-allowed
                        disabled:opacity-60
                      "
                    >
                      {openingEditor ? (
                        <>
                          <Loader2
                            size={14}
                            aria-hidden="true"
                            className="animate-spin"
                          />
                          Opening Fashion Editor
                        </>
                      ) : (
                        <>
                          <Palette size={14} />

                          {editorActionLabel}

                          <ArrowRight size={13} />
                        </>
                      )}
                    </button>
                    {editorError && (
                      <p
                        role="alert"
                        className="
                          mt-3
                          rounded-xl
                          border
                          border-rose-500/15
                          bg-rose-500/[0.06]
                          px-4
                          py-3
                          text-[10px]
                          leading-5
                          text-rose-600
                          dark:text-rose-300
                        "
                      >
                        {editorError}
                      </p>
                    )}
                  </div>
                )}
                <Link
                  to="/creator/showcase"
                  className="
                    mt-5
                    flex
                    w-full
                    items-center
                    justify-center
                    gap-2
                    rounded-xl
                    border
                    border-slate-200
                    bg-slate-100/80
                    py-3.5
                    text-[9px]
                    font-black
                    uppercase
                    tracking-[0.16em]
                    text-slate-700
                    transition
                    hover:border-[#D4AF37]/35
                    hover:text-[#D4AF37]
                    dark:border-white/10
                    dark:bg-white/[0.04]
                    dark:text-white/60
                  "
                >
                  Explore More Designs
                  <ArrowRight size={12} />
                </Link>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
