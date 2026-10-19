
"use strict";

/**
 * DesignByYou — Creator Showcase Detail
 * Version 3.8 — Responsive 2D/3D Showcase UI
 *
 * - Public 2D gallery and optional read-only 3D T-shirt preview
 * - Existing multi-image selection and Open in Fashion Editor API preserved
 * - Creator / Designer actions stay role-specific
 * - Does not fetch private projects or expose editable 3D layer state
 */

import React, {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Briefcase,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  Layers3,
  Loader2,
  MapPin,
  MousePointer2,
  Palette,
  Rotate3D,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  UserRound,
  Zap,
} from "lucide-react";
import API from "../../api/axios";

// Keep WebGL out of the initial bundle. A 2D-only item never loads it.
const ShowcaseGarment3D = React.lazy(() => import("./ShowcaseGarment3D"));

const BUTTON_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0b0b0b]";
const GOLD_BUTTON =
  `inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-5 py-3.5 text-xs font-bold text-black transition hover:bg-[#e7cb75] disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_FOCUS}`;
const OUTLINE_BUTTON =
  `inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-[#D4AF37]/60 hover:bg-[#D4AF37]/5 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08] ${BUTTON_FOCUS}`;
const PANEL =
  "rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-[#101011]";

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function isGalleryImageId(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRequestCanceled(error) {
  return error?.code === "ERR_CANCELED" ||
    error?.name === "CanceledError" ||
    error?.name === "AbortError";
}

function isDesignerOwned(item) {
  return item?.owner_role === "designer" ||
    item?.can_book_designer === true ||
    item?.can_book_designer === "true";
}

function isPublicImageUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch {
    return false;
  }
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function getShowcaseImages(item) {
  if (!item || typeof item !== "object") return [];
  const rows = Array.isArray(item.images) ? item.images : [];
  const normalized = rows.map((image, originalIndex) => {
    const url = cleanText(typeof image === "string"
      ? image : image?.image_url || image?.url);
    if (!isPublicImageUrl(url)) return null;
    const order = Number(typeof image === "object" ? image?.display_order : NaN);
    return {
      id: image && typeof image === "object" && image.id
        ? String(image.id) : `gallery-${originalIndex}`,
      url,
      position: Number.isInteger(order) && order > 0 ? order : originalIndex + 1,
      originalIndex,
    };
  }).filter(Boolean).sort((a, b) =>
    a.position - b.position || a.originalIndex - b.originalIndex);

  const used = new Set();
  const images = normalized.filter(({ url }) => {
    if (used.has(url)) return false;
    used.add(url);
    return true;
  }).slice(0, 6);
  if (images.length) return images;

  const fallback = cleanText(item.watermarked_preview_url || item.preview_url);
  return isPublicImageUrl(fallback)
    ? [{ id: "legacy-cover", url: fallback, position: 1, originalIndex: 0 }]
    : [];
}

function formatPublishedDate(value) {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}

function bookingUrlFor(item) {
  if (!isDesignerOwned(item) || !item?.designer_id || !item?.design_id) return null;
  const query = new URLSearchParams({
    designer_id: String(item.designer_id),
    design_id: String(item.design_id),
  });
  return `/creator/bookings/new?${query.toString()}`;
}

function LoadingScreen() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 bg-slate-50 text-slate-700 dark:bg-[#050506] dark:text-white/80">
      <Loader2 size={36} className="animate-spin text-[#D4AF37]" aria-hidden="true" />
      <p className="text-xs font-semibold uppercase tracking-[0.22em]">Loading Showcase</p>
    </main>
  );
}

function ErrorScreen({ message }) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-4 py-16 dark:bg-[#050506]">
      <div className={`${PANEL} w-full max-w-md p-8 text-center sm:p-10`}>
        <Sparkles size={35} className="mx-auto text-[#D4AF37]" aria-hidden="true" />
        <h1 className="mt-5 font-serif text-2xl text-slate-900 dark:text-white">
          Showcase Item Unavailable
        </h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-slate-600 dark:text-white/60">
          {message || "This Showcase design is unavailable."}
        </p>
        <Link to="/creator/showcase" className={`${GOLD_BUTTON} mt-7`}>
          <ArrowLeft size={16} /> Return to Showcase
        </Link>
      </div>
    </main>
  );
}

export default function CreatorShowcaseDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingEditor, setOpeningEditor] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [previewMode, setPreviewMode] = useState("2d");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedImageIds, setSelectedImageIds] = useState([]);
  const touchStartXRef = useRef(null);

  const showcaseImages = useMemo(() => getShowcaseImages(item), [item]);
  const hasGallery = showcaseImages.length > 1;
  const has3D = item?.preview_3d?.model === "tshirt";
  const is3D = has3D && previewMode === "3d";
  const currentImage = showcaseImages[activeImageIndex] || showcaseImages[0] || null;
  const currentImageId = isGalleryImageId(currentImage?.id) ? currentImage.id : null;
  const selectedImages = showcaseImages.filter((image) =>
    isGalleryImageId(image.id) && selectedImageIds.includes(image.id));
  const selectedCount = selectedImages.length;
  const selectableIds = showcaseImages.filter((image) => isGalleryImageId(image.id))
    .map((image) => image.id);
  const selectedImageNumber = Math.min(activeImageIndex + 1, showcaseImages.length);

  const designerOwned = isDesignerOwned(item);
  const ownerName = cleanText(item?.owner_name) ||
    cleanText(item?.designer_name) || "DesignByYou Creator";
  const ownerAvatar = cleanText(item?.owner_avatar) || cleanText(item?.designer_avatar);
  const bookingUrl = bookingUrlFor(item);
  const designerStudioUrl = designerOwned && item?.designer_id
    ? `/creator/studio/${encodeURIComponent(item.designer_id)}` : null;
  const portfolioUrl = safeExternalUrl(item?.portfolio_url);
  const rating = Number.parseFloat(item?.designer_avg_rating);
  const designerRating = designerOwned && Number.isFinite(rating) && rating > 0 ? rating : null;
  const rawBookings = Number.parseInt(item?.total_completed_bookings, 10);
  const completedBookings = designerOwned && Number.isInteger(rawBookings) && rawBookings > 0
    ? rawBookings : 0;
  const canOpenInEditor = Boolean(cleanText(item?.design_id));
  const tags = Array.isArray(item?.tags) ? item.tags.filter(Boolean) : [];

  const editorActionLabel = is3D
    ? "Open in Fashion Editor"
    : selectedCount > 1
      ? `Open ${selectedCount} Images in Fashion Editor`
      : selectedCount === 1
        ? "Open Selected Image in Fashion Editor"
        : hasGallery
          ? `Edit Image ${selectedImageNumber} in Fashion Editor`
          : "Open in Fashion Editor";

  useEffect(() => {
    setPreviewMode("2d");
    setActiveImageIndex(0);
    setSelectedImageIds([]);
  }, [slug, item?.design_id]);

  useLayoutEffect(() => {
    const scrollToTop = () => window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    scrollToTop();
    const frame = window.requestAnimationFrame(scrollToTop);
    return () => window.cancelAnimationFrame(frame);
  }, [slug, loading]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadItem() {
      if (!slug) {
        setItem(null);
        setError("The requested Showcase item is invalid.");
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
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const record = response?.data?.data;
        if (!record) throw new Error("The Showcase item could not be loaded.");
        setItem(record);
      } catch (requestError) {
        if (controller.signal.aborted || isRequestCanceled(requestError)) return;
        if (import.meta.env.DEV) {
          console.error("Creator Showcase detail request failed:", requestError);
        }
        setError(requestError?.response?.status === 404
          ? "This Showcase design is no longer available."
          : requestError?.response?.data?.message ||
            requestError?.message || "Unable to load this design right now.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadItem();
    return () => controller.abort();
  }, [slug]);

  const changeImage = (direction) => {
    if (openingEditor || showcaseImages.length < 2) return;
    setActiveImageIndex((index) =>
      (index + direction + showcaseImages.length) % showcaseImages.length);
    setEditorError("");
  };

  const onImageKeyDown = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    changeImage(event.key === "ArrowLeft" ? -1 : 1);
  };

  const onImageTouchStart = (event) => {
    touchStartXRef.current = event.changedTouches?.[0]?.clientX ?? null;
  };

  const onImageTouchEnd = (event) => {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    const endX = event.changedTouches?.[0]?.clientX;
    if (startX === null || !hasGallery || !Number.isFinite(endX)) return;
    const delta = endX - startX;
    if (Math.abs(delta) >= 45) changeImage(delta < 0 ? 1 : -1);
  };

  const toggleImageSelection = (id) => {
    if (openingEditor || !isGalleryImageId(id)) return;
    setSelectedImageIds((previous) => previous.includes(id)
      ? previous.filter((existing) => existing !== id)
      : [...previous, id].slice(0, 6));
    setEditorError("");
  };

  const handleOpenInEditor = async () => {
    if (openingEditor) return;
    const designId = cleanText(item?.design_id);
    if (!designId) {
      setEditorError("This Showcase design cannot be opened in Fashion Editor.");
      return;
    }

    // 3D means open the design, NOT a previously selected flat gallery image.
    // The backend decides if the Creator gets their original or a private copy.
    const requestedIds = is3D ? [] : selectedImages.map((image) => image.id);
    if (!is3D && hasGallery && requestedIds.length === 0 && !currentImageId) {
      setEditorError("The gallery image cannot be identified. Refresh and try again.");
      return;
    }
    const payload = requestedIds.length > 1
      ? { image_ids: requestedIds }
      : requestedIds.length === 1
        ? { image_id: requestedIds[0] }
        : !is3D && currentImageId ? { image_id: currentImageId } : {};

    setEditorError("");
    setOpeningEditor(true);
    try {
      const response = await API.post(
        `/creators/showcase/${encodeURIComponent(designId)}/open-in-editor`,
        payload,
      );
      const record = response?.data?.data || {};

      if (requestedIds.length > 1) {
        const returned = Array.isArray(record.source_image_ids)
          ? record.source_image_ids.map(String) : [];
        if (returned.length !== requestedIds.length ||
          !requestedIds.every((id) => returned.includes(id))) {
          throw new Error(
            "Multi-image opening needs the updated creatorController.js backend. " +
            "The server has not confirmed your selection.",
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
        console.error("Open Showcase design in Fashion Editor failed:", requestError);
      }
      const status = requestError?.response?.status;
      const serverMessage = requestError?.response?.data?.message;
      setEditorError(status === 401
        ? "Please sign in again to open this design in Fashion Editor."
        : status === 403
          ? serverMessage || "Only Creator accounts can open Showcase designs in Fashion Editor."
          : status === 404
            ? serverMessage || "This Showcase design is no longer available."
            : status === 409
              ? serverMessage || "This Showcase source is no longer available."
              : serverMessage || requestError?.message ||
                "This design could not be opened in Fashion Editor right now.");
    } finally {
      setOpeningEditor(false);
    }
  };

  if (loading) return <LoadingScreen />;
  if (error || !item) return <ErrorScreen message={error} />;

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 pb-20 text-slate-900 dark:bg-[#050506] dark:text-white">
      {/* Header / breadcrumb */}
      <div className="sticky top-16 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#09090b]/95 sm:top-20">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/creator/showcase"
            className={`inline-flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600 hover:text-[#b68c23] dark:text-white/65 dark:hover:text-[#D4AF37] ${BUTTON_FOCUS}`}>
            <ArrowLeft size={16} className="shrink-0" />
            <span className="truncate">Back to Showcase</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            {item.category_name && (
              <span className="hidden max-w-[160px] truncate rounded-full border border-slate-200 px-3 py-1.5 text-[11px] text-slate-500 dark:border-white/15 dark:text-white/60 sm:inline">
                {item.category_name}
              </span>
            )}
            <span className="max-w-[140px] truncate rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1.5 text-[11px] font-bold text-[#9e7414] dark:text-[#D4AF37] sm:max-w-[220px]">
              {item.style_category || "Showcase Design"}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] px-4 pt-6 sm:px-6 sm:pt-9 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 sm:mb-8">
          <div className="max-w-4xl">
            <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#ad8723] dark:text-[#D4AF37]">
              <Sparkles size={13} /> Community Showcase
            </p>
            <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              {item.title || "Untitled Design"}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-white/50">
              <span className="inline-flex items-center gap-2"><CalendarDays size={14} /> Published {formatPublishedDate(item.created_at)}</span>
              {item.category_name && <span className="inline-flex items-center gap-2"><Layers3 size={14} /> {item.category_name}</span>}
              {item.style_category && <span className="inline-flex items-center gap-2"><Palette size={14} /> {item.style_category}</span>}
            </div>
          </div>
          {has3D && (
            <span className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-2 text-xs font-semibold text-[#957019] dark:text-[#D4AF37]">
              <Box size={15} /> Interactive 3D available
            </span>
          )}
        </div>

        <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">
          {/* Design gallery and information */}
          <div className="min-w-0 space-y-6 lg:col-span-8">
            <section className={`${PANEL} min-w-0 overflow-hidden p-3 sm:p-4`} aria-label="Design preview">
              {/* 2D/3D mode tabs */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 sm:mb-4">
                <div className="inline-flex w-full rounded-xl bg-slate-100 p-1 dark:bg-white/[0.07] sm:w-auto" role="group" aria-label="Showcase preview mode">
                  <button type="button" aria-pressed={!is3D} onClick={() => setPreviewMode("2d")}
                    className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition sm:flex-none ${BUTTON_FOCUS} ${!is3D ? "bg-white text-slate-950 shadow-sm dark:bg-[#28282b] dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-white/55 dark:hover:text-white"}`}>
                    <ImageIcon size={16} /> 2D Images
                  </button>
                  {has3D && (
                    <button type="button" aria-pressed={is3D} onClick={() => setPreviewMode("3d")}
                      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition sm:flex-none ${BUTTON_FOCUS} ${is3D ? "bg-[#D4AF37] text-black shadow-sm" : "text-slate-500 hover:text-slate-900 dark:text-white/55 dark:hover:text-white"}`}>
                      <Box size={16} /> 3D T-Shirt
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-white/45">
                  {is3D ? "Read-only · Rotate and zoom" : `${showcaseImages.length} ${showcaseImages.length === 1 ? "image" : "images"}`}
                </p>
              </div>

              {/* Explicit height lets React Three Fiber fill the entire preview on every breakpoint. */}
              <div className="relative h-[340px] min-w-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-[#161619] sm:h-[460px] lg:h-[min(65vh,670px)]">
                {is3D ? (
                  <Suspense fallback={
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-slate-500 dark:text-white/55">
                      <Loader2 className="animate-spin text-[#D4AF37]" size={28} />
                      Loading 3D garment…
                    </div>
                  }>
                    <ShowcaseGarment3D preview={item.preview_3d} />
                  </Suspense>
                ) : (
                  <div className="relative flex h-full w-full items-center justify-center"
                    role={hasGallery ? "region" : undefined}
                    aria-label={hasGallery ? "Showcase image gallery. Use left and right arrow keys." : undefined}
                    tabIndex={hasGallery ? 0 : undefined}
                    onKeyDown={hasGallery ? onImageKeyDown : undefined}
                    onTouchStart={hasGallery ? onImageTouchStart : undefined}
                    onTouchEnd={hasGallery ? onImageTouchEnd : undefined}>
                    {currentImage?.url ? (
                      <img src={currentImage.url}
                        alt={`${item.title || "Showcase design"} — image ${selectedImageNumber} of ${showcaseImages.length}`}
                        loading="eager" decoding="async"
                        className="h-full w-full select-none object-contain" />
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-white/35">
                        <ImageIcon size={44} />
                        <span className="text-sm">Image preview unavailable</span>
                      </div>
                    )}
                    {hasGallery && (
                      <>
                        <button type="button" aria-label="Previous gallery image" onClick={() => changeImage(-1)}
                          className={`absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/70 text-white transition hover:bg-[#D4AF37] hover:text-black sm:left-5 ${BUTTON_FOCUS}`}>
                          <ChevronLeft size={21} />
                        </button>
                        <button type="button" aria-label="Next gallery image" onClick={() => changeImage(1)}
                          className={`absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/70 text-white transition hover:bg-[#D4AF37] hover:text-black sm:right-5 ${BUTTON_FOCUS}`}>
                          <ChevronRight size={21} />
                        </button>
                        <span aria-live="polite" className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white">
                          {selectedImageNumber} / {showcaseImages.length}
                        </span>
                      </>
                    )}
                    <span className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-[11px] text-white">
                      <ShieldCheck size={13} className="text-[#D4AF37]" /> Showcase Preview
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500 dark:text-white/45">
                <span className="inline-flex items-center gap-1.5">
                  {is3D ? <Rotate3D size={14} /> : <ImageIcon size={14} />}
                  {is3D ? "Drag the garment to rotate; use camera buttons for front and back." : "Published design imagery"}
                </span>
                <span>{designerOwned ? "Designer Work" : "Creator Work"}</span>
              </div>
            </section>

            {/* The gallery selection belongs only to the 2D view. */}
            {!is3D && hasGallery && (
              <section className={`${PANEL} p-4 sm:p-5`} aria-label="Gallery images and editor selection">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold">Explore the gallery</h2>
                    <p aria-live="polite" className="mt-1 text-xs text-slate-500 dark:text-white/45">
                      {selectedCount
                        ? `${selectedCount} image${selectedCount === 1 ? "" : "s"} selected for Fashion Editor`
                        : "Select a thumbnail to view it; tick boxes to edit multiple images."}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => {
                      setSelectedImageIds(selectableIds.slice(0, 6));
                      setEditorError("");
                    }} disabled={openingEditor || selectableIds.length === 0}
                      className={`${OUTLINE_BUTTON} disabled:opacity-40`}>Select All</button>
                    <button type="button" onClick={() => {
                      setSelectedImageIds([]);
                      setEditorError("");
                    }} disabled={openingEditor || selectedCount === 0}
                      className={`${OUTLINE_BUTTON} disabled:opacity-40`}>Clear</button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
                  {showcaseImages.map((image, index) => {
                    const selectable = isGalleryImageId(image.id);
                    const checked = selectable && selectedImageIds.includes(image.id);
                    return (
                      <div key={`${image.id}-${index}`} className="relative min-w-0">
                        <button type="button" disabled={openingEditor} aria-label={`View image ${index + 1}`}
                          aria-pressed={activeImageIndex === index}
                          onClick={() => { setActiveImageIndex(index); setEditorError(""); }}
                          className={`block aspect-square w-full overflow-hidden rounded-xl border-2 bg-slate-100 transition dark:bg-[#1c1c1f] ${BUTTON_FOCUS} ${activeImageIndex === index ? "border-[#D4AF37] ring-2 ring-[#D4AF37]/25" : "border-slate-200 hover:border-[#D4AF37]/60 dark:border-white/10"}`}>
                          <img src={image.url} alt={`Design thumbnail ${index + 1}`}
                            loading="lazy" decoding="async" className="h-full w-full object-contain" />
                        </button>
                        {selectable && (
                          <label className="absolute left-1 top-1 flex cursor-pointer items-center gap-1 rounded-md bg-black/75 px-1.5 py-1 text-[10px] font-semibold text-white sm:left-2 sm:top-2">
                            <input type="checkbox" checked={checked} disabled={openingEditor}
                              onChange={() => toggleImageSelection(image.id)}
                              aria-label={`Select gallery image ${index + 1} for Fashion Editor`}
                              className="h-3.5 w-3.5 accent-[#D4AF37]" />
                            <span className="hidden sm:inline">{checked ? "Selected" : "Select"}</span>
                            {checked && <Check size={11} className="sm:hidden" />}
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-white/45">
                  Maximum 6 images per editing session. Original Showcase designs remain unchanged.
                </p>
              </section>
            )}

            <section className={`${PANEL} space-y-6 p-5 sm:p-7`}>
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold"><Sparkles size={16} className="text-[#D4AF37]" /> The concept</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600 dark:text-white/65">
                  {item.description || "No design description has been provided."}
                </p>
              </div>
              {tags.length > 0 && (
                <div className="border-t border-slate-200 pt-5 dark:border-white/10">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-white/50">Creative tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag, index) => (
                      <span key={`${tag}-${index}`} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-600 dark:bg-white/[0.07] dark:text-white/65">
                        <Tag size={12} /> {String(tag)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Owner and actions */}
          <aside className="min-w-0 lg:col-span-4">
            <div className="space-y-5 lg:sticky lg:top-36">
              <section className={`${PANEL} p-5 sm:p-6`}>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#a77f19] dark:text-[#D4AF37]">
                  {designerOwned ? "Featured Designer" : "Showcase Creator"}
                </p>
                <div className="mt-4 flex min-w-0 items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/[0.07]">
                    {ownerAvatar && isPublicImageUrl(ownerAvatar) ? (
                      <img src={ownerAvatar} alt={`${ownerName} profile`} className="h-full w-full object-cover" />
                    ) : (
                      <UserRound size={23} className="text-slate-400 dark:text-white/40" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate font-serif text-xl">{ownerName}</h2>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-[#9e7414] dark:text-[#D4AF37]">
                      <ShieldCheck size={13} /> {designerOwned ? "Approved Designer" : "Creator"}
                    </p>
                    {designerOwned && item.city && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-white/45">
                        <MapPin size={12} /> {item.city}
                      </p>
                    )}
                  </div>
                </div>

                {designerOwned && item.designer_bio && (
                  <p className="mt-5 rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-600 dark:bg-white/[0.04] dark:text-white/60">
                    {item.designer_bio}
                  </p>
                )}
                {designerOwned && (
                  <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-200 pt-5 dark:border-white/10">
                    <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-white/[0.05]">
                      <Star size={16} className="mx-auto text-[#D4AF37]" />
                      <p className="mt-1 font-serif text-xl">{designerRating ? designerRating.toFixed(1) : "New"}</p>
                      <p className="text-[11px] text-slate-500 dark:text-white/45">Rating</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-white/[0.05]">
                      <Briefcase size={16} className="mx-auto text-[#D4AF37]" />
                      <p className="mt-1 font-serif text-xl">{completedBookings}</p>
                      <p className="text-[11px] text-slate-500 dark:text-white/45">Completed</p>
                    </div>
                  </div>
                )}
              </section>

              {canOpenInEditor && (
                <section className={`${PANEL} p-5 sm:p-6`}>
                  <div className="flex items-center gap-2 text-sm font-bold"><Palette size={17} className="text-[#D4AF37]" /> Open in Fashion Editor</div>
                  <p className="mt-3 text-xs leading-6 text-slate-500 dark:text-white/55">
                    {is3D
                      ? "Explore the published 3D T-shirt, then open this design in your private Fashion Editor workspace."
                      : hasGallery
                        ? "Open the current gallery image, or select several images to place them on one private Fashion Editor canvas."
                        : "Use this design as inspiration in your private Fashion Editor workspace. The published original stays unchanged."}
                  </p>
                  <button type="button" disabled={openingEditor} onClick={handleOpenInEditor}
                    className={`${GOLD_BUTTON} mt-4`}>
                    {openingEditor ? <Loader2 size={16} className="animate-spin" /> : <MousePointer2 size={16} />}
                    <span className="min-w-0 truncate">{openingEditor ? "Opening Fashion Editor…" : editorActionLabel}</span>
                    {!openingEditor && <ArrowRight size={15} className="shrink-0" />}
                  </button>
                  {editorError && (
                    <p role="alert" className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-3 text-xs leading-5 text-rose-700 dark:text-rose-300">
                      {editorError}
                    </p>
                  )}
                </section>
              )}

              {designerOwned && (
                <section className={`${PANEL} space-y-3 p-5 sm:p-6`}>
                  <h2 className="text-sm font-bold">Inspired by this work?</h2>
                  <p className="text-xs leading-6 text-slate-500 dark:text-white/55">
                    Use this Showcase design as creative context for a custom booking with the Designer.
                  </p>
                  {bookingUrl && <Link to={bookingUrl} className={GOLD_BUTTON}><Zap size={15} /> Start Booking <ArrowRight size={15} /></Link>}
                  {designerStudioUrl && <Link to={designerStudioUrl} className={`${OUTLINE_BUTTON} w-full`}>View Designer Studio <ExternalLink size={14} /></Link>}
                  {portfolioUrl && <a href={portfolioUrl} target="_blank" rel="noopener noreferrer" className={`${OUTLINE_BUTTON} w-full`}>Portfolio <ExternalLink size={14} /></a>}
                </section>
              )}

              <Link to="/creator/showcase" className={`${OUTLINE_BUTTON} w-full`}>
                Explore More Designs <ArrowRight size={14} />
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
