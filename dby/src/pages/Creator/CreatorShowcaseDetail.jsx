"use strict";

/* DesignByYou — Creator Showcase Detail, Version 3.3 (navigation scroll fix).
   Reconstructed from the supplied Markdown-formatted JSX. */

import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";

import { Link, useNavigate, useParams } from "react-router-dom";

import {
  ArrowRight,
  Briefcase,
  Calendar,
  ChevronLeft,
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

export default function CreatorShowcaseDetail() {
  const { slug } = useParams();

  const navigate = useNavigate();

  const [item, setItem] = useState(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [openingEditor, setOpeningEditor] = useState(false);

  const [editorError, setEditorError] = useState("");
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
    if (openingEditor) {
      return;
    }

    const designId = cleanText(item?.design_id);

    if (!designId) {
      setEditorError(
        "This Showcase design cannot be opened in Fashion Editor.",
      );

      return;
    }

    setEditorError("");

    setOpeningEditor(true);

    try {
      const response = await API.post(
        `/creators/showcase/${encodeURIComponent(designId)}/open-in-editor`,

        {},
      );

      const projectId = cleanText(
        response?.data?.data?.project_id || response?.data?.data?.id,
      );

      if (!/^[1-9]\d*$/.test(projectId)) {
        throw new Error(
          "The Fashion Editor project was prepared, but its project ID was not returned.",
        );
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
          "Please sign in again before opening this design in Fashion Editor.",
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
            "The Showcase source is no longer available for Fashion Editor.",
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
            >
              {item.watermarked_preview_url ? (
                <img
                  src={item.watermarked_preview_url}
                  alt={item.title || "Showcase design"}
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
                      Open this public Designer Showcase design in your Fashion
                      Editor. A private editable project will be prepared for
                      you, and the Designer's original work remains unchanged.
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
                          Open in Fashion Editor
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
                      Open this public design in Fashion Editor. If this is your
                      own Fashion Editor design, your existing project will
                      reopen. Otherwise, DesignByYou prepares a private editable
                      project and leaves the original work unchanged.
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
                          Open in Fashion Editor
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
