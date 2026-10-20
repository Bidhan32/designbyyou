"use strict";

/**
 * =========================================================
 * DesignByYou — Creator Creative Hub
 * Version 4.2 — Compact Detailed Tool Cards
 * =========================================================
 *
 * FEATURES
 * ---------------------------------------------------------
 * - Responsive cards: 1 / 2 / 3 / 4 columns
 * - Optimized local WebP thumbnails
 * - Thumbnail fallback for missing images
 * - Search and category filters
 * - Light and dark themes
 * - Existing Creator navigation preserved
 *
 * AVAILABLE TOOLS
 * ---------------------------------------------------------
 * 1. Fashion Editor
 * 2. Upload Your Creation
 * 3. AI Background Remover
 * 4. AI Costume Extractor
 * 5. AI Text to Image
 * 6. AI Sketch to Image
 * 7. AI Virtual Try-On
 * 8. AI Front, Side & Back Views — NEW
 *
 * UPCOMING
 * ---------------------------------------------------------
 * 9. AI Image Editor
 *
 * =========================================================
 */

import React, { useMemo, useState } from "react";

import { Link } from "react-router-dom";

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ImageOff,
  ImagePlus,
  Images,
  PencilRuler,
  Search,
  Scissors,
  Shirt,
  Sparkles,
  UploadCloud,
  WandSparkles,
  X,
} from "lucide-react";

// =========================================================
// Local Image Assets
// =========================================================

const IMAGE_ROOT = "/images/creator-tools";

const PHOTOS = Object.freeze({
  hero: `${IMAGE_ROOT}/hero.webp`,

  editor: `${IMAGE_ROOT}/fashion-editor.webp`,

  upload: `${IMAGE_ROOT}/creator-upload.webp`,

  text: `${IMAGE_ROOT}/text-to-image.webp`,

  sketch: `${IMAGE_ROOT}/sketch-to-image.webp`,

  remove: `${IMAGE_ROOT}/background-remover.webp`,

  costume: `${IMAGE_ROOT}/costume-extraction.webp`,

  tryon: `${IMAGE_ROOT}/virtual-tryon.webp`,

  // NEW: Multi-View Generator
  multiView: `${IMAGE_ROOT}/multi-view-generator.webp`,

  edit: `${IMAGE_ROOT}/image-editor.webp`,
});

// =========================================================
// Creative Tools Registry
// =========================================================

const TOOLS = Object.freeze([
  // =======================================================
  // 1. Fashion Editor
  // =======================================================

  {
    id: "fashion-editor",

    title: "Fashion Editor",

    eyebrow: "DESIGN STUDIO",

    description:
      "Create garments using brushes, layers, templates, patterns and precision editing tools.",

    outcome: "Sketch • Customize • Refine",

    categories: ["design"],

    icon: PencilRuler,

    image: PHOTOS.editor,

    imageAlt: "Plain T-shirt transformed into a custom fashion design",

    path: "/creator/fashion-editor",

    available: true,
  },

  // =======================================================
  // 2. Creator Upload
  // =======================================================

  {
    id: "creator-upload",

    title: "Upload Your Creation",

    eyebrow: "CREATOR STUDIO",

    description:
      "Upload your artwork or fashion concepts. Keep them private or share with the community.",

    outcome: "Upload • Organize • Share",

    categories: ["design"],

    icon: UploadCloud,

    image: PHOTOS.upload,

    imageAlt: "Fashion creations ready for Creator Studio upload",

    path: "/creator/upload",

    available: true,
  },

  // =======================================================
  // 3. AI Background Remover
  // =======================================================

  {
    id: "background-remover",

    title: "AI Background Remover",

    eyebrow: "IMAGE UTILITIES",

    description:
      "Remove an image background with AI, compare results and download a transparent PNG.",

    outcome: "Photo → Transparent PNG",

    categories: ["ai", "image"],

    icon: Scissors,

    image: PHOTOS.remove,

    imageAlt: "Handbag before and after background removal",

    path: "/creator/tools/background-remover",

    available: true,
  },

  // =======================================================
  // 4. AI Costume Extractor
  // =======================================================

  {
    id: "costume-extractor",

    title: "AI Costume Extractor",

    eyebrow: "MULTI-VIEW FASHION",

    description:
      "Extract a costume from an image and generate garment-only front, back, left and right views using AI.",

    outcome: "Front • Back • Left • Right",

    categories: ["ai", "image"],

    icon: Shirt,

    image: PHOTOS.costume,

    imageAlt: "Illustrative garment design preview for AI Costume Extractor",

    path: "/creator/tools/costume-extractor",

    available: true,
  },

  // =======================================================
  // 5. AI Text to Image
  // =======================================================

  {
    id: "text-to-image",

    title: "AI Text to Image",

    eyebrow: "GENERATIVE AI",

    description:
      "Turn a written fashion idea into visual concepts with AI-generated imagery.",

    outcome: "Prompt → Fashion concept",

    categories: ["ai"],

    icon: WandSparkles,

    image: PHOTOS.text,

    imageAlt: "AI-generated fashion concept based on a written prompt",

    path: "/creator/tools/text-to-image",

    available: true,
  },

  // =======================================================
  // 6. AI Sketch to Image
  // =======================================================

  {
    id: "sketch-to-image",

    title: "AI Sketch to Image",

    eyebrow: "SKETCH TRANSFORMATION",

    description:
      "Explore realistic fashion concepts based on your original garment sketches.",

    outcome: "Sketch → Visualization",

    categories: ["ai"],

    icon: PencilRuler,

    image: PHOTOS.sketch,

    imageAlt: "Pencil garment sketch turning into a fashion visualization",

    path: "/creator/tools/sketch-to-image",

    available: true,
  },

  // =======================================================
  // 7. AI Virtual Try-On
  // =======================================================

  {
    id: "virtual-tryon",

    title: "AI Virtual Try-On",

    eyebrow: "VIRTUAL FASHION",

    description:
      "Preview how clothing could look on a person using photo references.",

    outcome: "Person + Garment → Look",

    categories: ["ai"],

    icon: Shirt,

    image: PHOTOS.tryon,

    imageAlt: "Outfit preview on a virtual model",

    path: "/creator/tools/virtual-try-on",

    available: true,
  },

  // =======================================================
  // 8. NEW: AI Front, Side & Back Views
  // =======================================================
  /**
   * FASHN AI Multi-View Generator
   *
   * Generates alternate garment perspectives
   * using the original fashion design as reference.
   *
   * FRONT:
   * Original uploaded garment reference.
   *
   * SIDE:
   * AI-generated right-side garment view.
   *
   * BACK:
   * AI-generated rear garment view.
   *
   * Backend:
   * /api/v1/creators/ai/multi-view
   *
   * Frontend:
   * /creator/tools/multi-view-generator
   *
   * FASHN Model:
   * edit
   */

  {
    id: "multi-view-generator",

    title: "AI Front, Side & Back Views",

    eyebrow: "AI MULTI-VIEW GENERATION",

    description:
      "Generate matching front, side and back fashion views from one garment image while preserving design details as closely as possible.",

    outcome: "One Design → Three Views",

    categories: ["ai", "image"],

    icon: Images,

    image: PHOTOS.multiView,

    imageAlt: "Fashion garment displayed in front, side and back views",

    path: "/creator/tools/multi-view-generator",

    available: true,
  },

  // =======================================================
  // 9. AI Image Editor — Upcoming
  // =======================================================

  {
    id: "image-editor",

    title: "AI Image Editor",

    eyebrow: "CREATIVE IMAGE EDITING",

    description:
      "Experiment with colors, details and creative variations in fashion images.",

    outcome: "Image → New variation",

    categories: ["ai", "image"],

    icon: ImagePlus,

    image: PHOTOS.edit,

    imageAlt: "White sneaker beside a restyled sneaker design",

    available: false,
  },
]);

// =========================================================
// Tool Category Filters
// =========================================================

const FILTERS = Object.freeze([
  {
    id: "all",
    label: "All Tools",
  },
  {
    id: "design",
    label: "Design & Upload",
  },
  {
    id: "ai",
    label: "AI Tools",
  },
  {
    id: "image",
    label: "Image Tools",
  },
]);

// =========================================================
// Tool Thumbnail
// =========================================================

function ToolThumbnail({ tool }) {
  const [failed, setFailed] = useState(false);

  const Icon = tool.icon;

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-[#25221d] via-[#181818] to-[#0c0c0c]">
      {/* Fallback */}

      <div className="absolute inset-0 flex items-center justify-center gap-2 text-white/45">
        <Icon size={27} strokeWidth={1.5} aria-hidden="true" />

        <span className="text-xs font-medium">{tool.title}</span>
      </div>

      {/* Thumbnail */}

      {!failed && tool.image && (
        <img
          src={tool.image}
          alt={tool.imageAlt}
          width={1920}
          height={1080}
          loading="lazy"
          decoding="async"
          sizes="(min-width: 1280px) 280px, (min-width: 1024px) 31vw, (min-width: 640px) 47vw, 100vw"
          draggable={false}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.035]"
        />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/25 to-transparent" />

      {/* Availability Badge */}

      <span
        className={`absolute right-2.5 top-2.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold backdrop-blur-md ${
          tool.available
            ? "border-[#e5c67d]/50 bg-[#17130b]/85 text-[#f3d693]"
            : "border-white/15 bg-black/65 text-white/85"
        }`}
      >
        {tool.available ? "Available" : "Coming Soon"}
      </span>
    </div>
  );
}

// =========================================================
// Tool Card
// =========================================================

function ToolCard({ tool }) {
  const Icon = tool.icon;

  const ready = Boolean(tool.available && tool.path);

  return (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_3px_16px_rgba(0,0,0,0.035)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#d7b66b]/70 hover:shadow-[0_14px_32px_rgba(0,0,0,0.075)] dark:border-white/10 dark:bg-[#151515] dark:shadow-none dark:hover:border-[#d7b66b]/45">
      {/* Tool Image */}

      {ready ? (
        <Link
          to={tool.path}
          aria-label={`Open ${tool.title}`}
          className="block overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#e5c67d]"
        >
          <ToolThumbnail tool={tool} />
        </Link>
      ) : (
        <ToolThumbnail tool={tool} />
      )}

      {/* Tool Details */}

      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5">
        {/* Icon and Category */}

        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#e5c67d]/15 text-[#ab802c] dark:text-[#e5c67d]">
            <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
          </span>

          <span className="min-w-0 text-[9px] font-bold uppercase tracking-[0.13em] text-[#a78032] dark:text-[#e5c67d]">
            {tool.eyebrow}
          </span>
        </div>

        {/* Tool Title */}

        <h3 className="mt-3 font-serif text-[19px] font-semibold leading-6 tracking-tight text-slate-900 dark:text-white">
          {tool.title}
        </h3>

        {/* Description */}

        <p className="mt-2 flex-1 text-[12px] leading-[1.65] text-slate-600 dark:text-white/55">
          {tool.description}
        </p>

        {/* Outcome */}

        <div className="mt-3 flex items-start gap-1.5 text-[11px] font-medium leading-4 text-slate-500 dark:text-white/50">
          <Sparkles
            size={13}
            className="mt-0.5 shrink-0 text-[#bc913c]"
            aria-hidden="true"
          />

          <span>{tool.outcome}</span>
        </div>

        {/* Action */}

        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/10">
          {ready ? (
            <Link
              to={tool.path}
              className="inline-flex min-h-9 w-full items-center justify-between gap-2 rounded-lg bg-[#e5c67d] px-3.5 text-[12px] font-bold text-[#17130b] transition hover:bg-[#f4d995] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b58a32]"
            >
              <span>Open Tool</span>

              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          ) : (
            <div className="flex min-h-9 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-[11px] text-slate-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/45">
              <span>In Development</span>

              <Sparkles size={13} aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// =========================================================
// Section Heading
// =========================================================

function SectionHeading({ eyebrow, title, description, count }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ad8433] dark:text-[#e5c67d]">
          {eyebrow}
        </p>

        <h2 className="mt-1.5 font-serif text-2xl tracking-tight sm:text-[29px]">
          {title}
        </h2>

        <p className="mt-1.5 max-w-xl text-[12px] leading-5 text-slate-500 dark:text-white/50">
          {description}
        </p>
      </div>

      <span className="text-[11px] text-slate-400 dark:text-white/40">
        {count} {count === 1 ? "tool" : "tools"}
      </span>
    </div>
  );
}

// =========================================================
// Creator Creative Hub
// =========================================================

export default function CreatorToolsPage() {
  const [search, setSearch] = useState("");

  const [activeFilter, setActiveFilter] = useState("all");

  const [heroImageFailed, setHeroImageFailed] = useState(false);

  // =======================================================
  // Search and Filter
  // =======================================================

  const filteredTools = useMemo(() => {
    const query = search.trim().toLowerCase();

    return TOOLS.filter((tool) => {
      if (activeFilter !== "all" && !tool.categories.includes(activeFilter)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        tool.title,
        tool.eyebrow,
        tool.description,
        tool.outcome,
        ...tool.categories,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [search, activeFilter]);

  const readyTools = filteredTools.filter((tool) => tool.available);

  const upcomingTools = filteredTools.filter((tool) => !tool.available);

  // =======================================================
  // Render
  // =======================================================

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 pb-16 text-slate-900 dark:bg-[#090909] dark:text-white">
      {/* ===================================================
          HERO
          =================================================== */}

      <section className="relative isolate min-h-[350px] overflow-hidden bg-[#0b0b0b] text-white sm:min-h-[390px]">
        {!heroImageFailed && (
          <img
            src={PHOTOS.hero}
            alt=""
            width={1920}
            height={1080}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onError={() => setHeroImageFailed(true)}
            className="absolute inset-0 h-full w-full object-cover object-[65%_center] opacity-60 sm:object-center sm:opacity-75"
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/80 to-black/35 sm:from-black/90 sm:via-black/65 sm:to-black/20" />

        <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />

        <div className="relative z-10 mx-auto flex min-h-[350px] max-w-7xl flex-col justify-center px-5 py-8 sm:min-h-[390px] sm:px-8 lg:px-10">
          <Link
            to="/creator/showcase"
            className="mb-8 inline-flex w-fit items-center gap-2 text-xs text-white/70 transition hover:text-[#e5c67d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e5c67d]"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Back to Showcase
          </Link>

          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-[#e5c67d]">
            <Sparkles size={15} aria-hidden="true" />
            DesignByYou Creative Hub
          </p>

          <h1 className="mt-4 max-w-2xl font-serif text-4xl leading-[1.1] tracking-tight sm:text-5xl lg:text-[58px]">
            Every Great Design
            <span className="block italic text-[#e5c67d]">
              Starts With You.
            </span>
          </h1>

          <p className="mt-4 max-w-lg text-[13px] leading-6 text-white/75 sm:text-sm">
            Design, upload and transform your fashion ideas with creative tools
            built for you.
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            {/* Explore Tools */}

            <a
              href="#explore-tools"
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#e5c67d] px-5 text-xs font-bold text-black transition hover:bg-[#f4d995] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Explore Tools
              <ArrowRight size={15} aria-hidden="true" />
            </a>

            {/* Fashion Editor */}

            <Link
              to="/creator/fashion-editor"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/35 bg-black/20 px-5 text-xs font-semibold text-white transition hover:border-[#e5c67d] hover:text-[#e5c67d]"
            >
              <PencilRuler size={15} aria-hidden="true" />
              Fashion Editor
            </Link>
          </div>
        </div>
      </section>

      {/* ===================================================
          SEARCH AND FILTERS
          =================================================== */}

      <section
        id="explore-tools"
        className="mx-auto max-w-7xl scroll-mt-20 px-5 pt-10 sm:px-8 lg:px-10"
      >
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ad8433] dark:text-[#e5c67d]">
              Your Creative Workspace
            </p>

            <h2 className="mt-1.5 font-serif text-2xl sm:text-[29px]">
              Discover Creative Tools
            </h2>

            <p className="mt-1.5 text-[12px] text-slate-500 dark:text-white/50">
              Compact previews. Clear details. Find the right tool faster.
            </p>
          </div>

          {/* Search */}

          <div className="relative w-full md:max-w-[290px]">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tools..."
              aria-label="Search creative tools"
              className="min-h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-10 text-[13px] text-slate-900 outline-none transition focus:border-[#b58a32] focus:ring-2 focus:ring-[#e5c67d]/20 dark:border-white/10 dark:bg-[#161616] dark:text-white"
            />

            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* ===============================================
            CATEGORY FILTERS
            =============================================== */}

        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filter tools"
        >
          {FILTERS.map((filter) => {
            const selected = activeFilter === filter.id;

            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setActiveFilter(filter.id)}
                className={`rounded-full border px-3.5 py-2 text-[11px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b58a32] ${
                  selected
                    ? "border-[#e5c67d] bg-[#e5c67d] text-black"
                    : "border-slate-200 bg-white text-slate-600 hover:border-[#d4ae57] dark:border-white/10 dark:bg-[#161616] dark:text-white/65"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        {/* Search Results Count */}

        <p
          className="mt-3 text-[11px] text-slate-400 dark:text-white/40"
          aria-live="polite"
        >
          Showing {filteredTools.length} of {TOOLS.length} tools
        </p>

        {/* ===============================================
            AVAILABLE TOOLS
            =============================================== */}

        {readyTools.length > 0 && (
          <section className="mt-8" aria-label="Available creative tools">
            <SectionHeading
              eyebrow="Available Now"
              title="Ready to Create"
              description="Open these tools and start working on your next idea."
              count={readyTools.length}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {readyTools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          </section>
        )}

        {/* ===============================================
            UPCOMING AI TOOLS
            =============================================== */}

        {upcomingTools.length > 0 && (
          <section className="mt-10" aria-label="Upcoming AI tools">
            <SectionHeading
              eyebrow="What's Next"
              title="More AI Tools on the Way"
              description="Explore upcoming features. These previews are illustrative; generation is not yet enabled."
              count={upcomingTools.length}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {upcomingTools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          </section>
        )}

        {/* ===============================================
            EMPTY STATE
            =============================================== */}

        {filteredTools.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center dark:border-white/10 dark:bg-[#151515]">
            <ImageOff
              size={27}
              className="mx-auto text-slate-400"
              aria-hidden="true"
            />

            <h3 className="mt-3 font-serif text-xl">No matching tools</h3>

            <p className="mt-2 text-[13px] text-slate-500 dark:text-white/55">
              Try another search or reset the filters.
            </p>

            <button
              type="button"
              onClick={() => {
                setSearch("");
                setActiveFilter("all");
              }}
              className="mt-4 rounded-full bg-[#e5c67d] px-5 py-2.5 text-xs font-bold text-black hover:bg-[#f4d995]"
            >
              View All Tools
            </button>
          </div>
        )}
      </section>

      {/* ===================================================
          CLOSING CTA
          =================================================== */}

      <section className="mx-auto mt-12 max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-5 rounded-2xl border border-[#e5c67d]/30 bg-white p-5 dark:bg-[#151515] sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ad8433] dark:text-[#e5c67d]">
              Keep Creating
            </p>

            <h2 className="mt-1 font-serif text-2xl">
              Your next idea starts here.
            </h2>

            <p className="mt-1.5 text-[12px] leading-5 text-slate-500 dark:text-white/50">
              Build a design in the editor or upload a creation to your studio.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Open Fashion Editor */}

            <Link
              to="/creator/fashion-editor"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#e5c67d] px-4 text-[12px] font-bold text-black hover:bg-[#f4d995]"
            >
              <PencilRuler size={15} aria-hidden="true" />
              Open Editor
              <ArrowRight size={14} aria-hidden="true" />
            </Link>

            {/* Upload Creation */}

            <Link
              to="/creator/upload"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-[12px] font-semibold hover:border-[#d4ae57] dark:border-white/15"
            >
              <UploadCloud size={15} aria-hidden="true" />
              Upload Creation
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
