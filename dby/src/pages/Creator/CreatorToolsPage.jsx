"use strict";

/**

 * =========================================================

 * DesignByYou — Creator Creative Hub

 * Version 4.3 — Pattern Extractor Integration

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

 * 8. AI Front, Side & Back Views
 * 9. AI Pattern Extractor

 *

 * UPCOMING

 * ---------------------------------------------------------

 * 10. AI Image Editor

 *

 * =========================================================

 */

import React, { useMemo, useState } from "react";
import CreatorCreditBalance from "../../components/CreatorCreditBalance";

import { Link } from "react-router-dom";

import {



  ArrowUpRight,
  FolderOpen,

  ImageOff,

  ImagePlus,

  Images,

  PencilRuler,

  Search,

  ScanLine,
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

  pattern: `${IMAGE_ROOT}/pattern-extractor.webp`,

  tryon: `${IMAGE_ROOT}/virtual-tryon.webp`,

  // NEW: Multi-View Generator

  multiView: `${IMAGE_ROOT}/multi-view-generator.webp?v=20261020`,

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

  // =======================================================
  // 9. AI Pattern Extractor
  // =======================================================
  {
    id: "pattern-extractor",
    title: "AI Pattern Extractor",
    eyebrow: "AI TEXTILE TOOLS",
    description:
      "Extract fabric prints and motifs from clothing or fabric photos into reusable flat textile artwork.",
    outcome: "Fabric Photo → Pattern Artwork",
    categories: ["ai", "image"],
    icon: ScanLine,
    image: PHOTOS.pattern,
    imageAlt: "Fabric photo transformed into flat textile pattern artwork",
    path: "/creator/tools/pattern-extractor",
    available: true,
  },

  // 10. AI Image Editor — Upcoming

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

    <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface">

      {/* Fallback */}

      <div className="absolute inset-0 flex items-center justify-center gap-2 text-muted">

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

    </div>

  );

}

// =========================================================

// Tool Card

// =========================================================

function ToolCard({ tool }) {

  const ready = Boolean(tool.available && tool.path);

  return (

    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-md border border-line bg-surface transition-all duration-300 hover:border-line">

      {/* Tool Image */}

      {ready ? (

        <Link

          to={tool.path}

          aria-label={`Open ${tool.title}`}

          className="block overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-action"

        >

          <ToolThumbnail tool={tool} />

        </Link>

      ) : (

        <ToolThumbnail tool={tool} />

      )}

      {/* Tool Details */}

      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5">

        <h3 className="text-base font-semibold leading-6 tracking-tight text-ink">

          {tool.title}

        </h3>

        {/* Description */}

        <p className="mt-2 flex-1 text-[12px] leading-[1.65] text-muted">

          {tool.description}

        </p>

        <div className="mt-3 border-t border-line pt-3">

          {ready ? (

            <Link

              to={tool.path}

              className="inline-flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-line bg-surface px-3.5 text-sm font-semibold text-ink transition hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"

            >

              <span>Open tool</span>

              <ArrowUpRight size={15} aria-hidden="true" />

            </Link>

          ) : (

            <div className="flex min-h-9 items-center justify-between gap-2 rounded-md border border-line bg-canvas px-3.5 text-xs text-muted dark:bg-subtle">

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

        <p className="text-xs font-bold tracking-normal text-action">

          {eyebrow}

        </p>

        <h2 className="mt-1.5 font-sans text-2xl tracking-tight sm:text-[29px]">

          {title}

        </h2>

        <p className="mt-1.5 max-w-xl text-[12px] leading-5 text-muted">

          {description}

        </p>

      </div>

      <span className="text-xs text-muted">

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

    <main className="min-h-screen overflow-x-hidden bg-canvas pb-16 text-ink dark:bg-surface">

      {/* ===================================================

          HERO

          =================================================== */}

      <header className="mx-auto max-w-7xl px-5 pt-8 sm:px-8 lg:px-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Create</h1>
        <CreatorCreditBalance />
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Start with a garment, upload a design, or choose an image tool below.</p>
        <Link to="/creator/projects" className="mt-6 flex items-center gap-4 rounded-md border border-line bg-surface p-4 transition hover:border-line focus-visible:outline-2 focus-visible:outline-offset-4 dark:bg-subtle sm:p-4">
          <FolderOpen size={24} className="shrink-0 text-muted" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">My projects</h2>
            <p className="mt-1 text-sm text-muted">Browse your saved editor projects and uploaded designs.</p>
          </div>
          <ArrowUpRight size={20} className="shrink-0" aria-hidden="true" />
        </Link>
      </header>

      {/* ===================================================

          SEARCH AND FILTERS

          =================================================== */}

      <section

        id="explore-tools"

        className="mx-auto max-w-7xl scroll-mt-20 px-5 pt-10 sm:px-8 lg:px-10"

      >

        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">

          <div>

            <p className="text-xs font-bold tracking-normal text-action">

              Creative tools

            </p>

            <h2 className="mt-1.5 font-sans text-2xl sm:text-[29px]">

              Choose a tool

            </h2>

            <p className="mt-1.5 text-[12px] text-muted">

              Start a design, upload your work, or transform an image.

            </p>

          </div>

          {/* Search */}

          <div className="relative w-full md:max-w-[290px]">

            <Search

              size={16}

              aria-hidden="true"

              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"

            />

            <input

              type="search"

              value={search}

              onChange={(event) => setSearch(event.target.value)}

              placeholder="Search tools..."

              aria-label="Search creative tools"

              className="min-h-10 w-full rounded-md border border-line bg-surface py-2 pl-10 pr-10 text-[13px] text-ink outline-none transition focus:border-line focus:ring-2 focus:ring-action"

            />

            {search && (

              <button

                type="button"

                aria-label="Clear search"

                onClick={() => setSearch("")}

                className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-muted hover:text-ink"

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

                className={`rounded-md border px-3.5 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-action ${

                  selected

                    ? "border-line bg-subtle text-ink"

                    : "border-line bg-surface text-muted hover:border-line"

                }`}

              >

                {filter.label}

              </button>

            );

          })}

        </div>

        {/* Search Results Count */}

        <p

          className="mt-3 text-xs text-muted"

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

          <div className="mt-8 rounded-md border border-dashed border-line bg-surface px-5 py-12 text-center">

            <ImageOff

              size={27}

              className="mx-auto text-muted"

              aria-hidden="true"

            />

            <h3 className="mt-3 font-serif text-xl">No matching tools</h3>

            <p className="mt-2 text-[13px] text-muted">

              Try another search or reset the filters.

            </p>

            <button

              type="button"

              onClick={() => {

                setSearch("");

                setActiveFilter("all");

              }}

              className="mt-4 rounded-md bg-subtle px-5 py-2.5 text-xs font-bold text-ink hover:bg-subtle"

            >

              View All Tools

            </button>

          </div>

        )}

      </section>

      {/* ===================================================

          CLOSING CTA

          =================================================== */}

      

    </main>

  );

}
