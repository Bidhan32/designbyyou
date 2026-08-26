import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import {
  CheckCircle2,
  Clock3,
  Eye,
  FileImage,
  GitFork,
  ImageOff,
  Layers3,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Tag,
  UploadCloud,
  X,
} from "lucide-react";

import API from "../../api/axios";

/*=========================================================
Configuration
=========================================================*/

const INVENTORY_ENDPOINT = "/designer/my-inventory";

const SOURCE_FILTERS = [
  {
    value: "all",
    label: "All Sources",
  },
  {
    value: "fashion_editor",
    label: "Fashion Editor",
  },
  {
    value: "upload",
    label: "Image Uploads",
  },
];

const STATUS_FILTERS = [
  {
    value: "all",
    label: "All Statuses",
  },
  {
    value: "live",
    label: "Live",
  },
  {
    value: "draft",
    label: "Draft",
  },
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

function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function humanize(value, fallback = "Asset") {
  const text = cleanText(value);

  if (!text) {
    return fallback;
  }

  return text
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function parseTags(value) {
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
    // Continue with PostgreSQL-array or CSV parsing.
  }

  const content =
    text.startsWith("{") && text.endsWith("}") ? text.slice(1, -1) : text;

  return content
    .split(",")
    .map((item) => item.replace(/^"(.*)"$/, "$1").trim())
    .filter(Boolean);
}

/*=========================================================
Media Helpers
=========================================================*/

function getBackendOrigin() {
  const configured = cleanText(
    import.meta.env.VITE_BACKEND_URL ||
      import.meta.env.VITE_API_BASE_URL ||
      API.defaults.baseURL,
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

function resolveImageUrl(value) {
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

  const cleanPath = path.replace(/\\/g, "/").replace(/^\/+/, "");

  return `${getBackendOrigin()}/${cleanPath}`;
}

/*=========================================================
API Response Helpers
=========================================================*/

function extractInventoryItems(response) {
  const body = response?.data;

  const candidates = [
    body?.data,
    body?.data?.designs,
    body?.data?.items,
    body?.designs,
    body?.items,
    body?.results,
    body,
  ];

  return candidates.find(Array.isArray) || [];
}

function normalizeInventoryItem(item, index) {
  const sourceType = cleanText(item?.source_type, "upload").toLowerCase();

  const basePrice = Math.max(0, toNumber(item?.base_price, 0));

  const discountPrice = Math.max(0, toNumber(item?.discount_price, 0));

  const editorProjectId = cleanText(item?.editor_project_id);

  const originalDesignId = cleanText(item?.original_design_id);

  const sourceProjectId = cleanText(item?.source_project_id);

  const isEditable = toBoolean(item?.is_editable, false);

  const isEditorDesign = Boolean(
    sourceType === "fashion_editor" && isEditable && editorProjectId,
  );

  const isRemix = Boolean(
    isEditorDesign &&
    (originalDesignId || sourceProjectId || toBoolean(item?.is_remix, false)),
  );

  return {
    raw: item,

    id: cleanText(
      item?.id || item?.design_id || item?.slug || `inventory-${index}`,
    ),

    slug: cleanText(item?.slug || item?.id || item?.design_id),

    title: cleanText(item?.title, "Untitled Asset"),

    description: cleanText(item?.description, "No description provided."),

    sku: cleanText(item?.sku, "N/A"),

    image: resolveImageUrl(
      item?.watermarked_preview_url ||
        item?.preview_url ||
        item?.display_image_url ||
        item?.image_url ||
        item?.thumbnail_url ||
        item?.high_res_file_url,
    ),

    category: humanize(
      item?.category ||
        item?.style_category ||
        item?.product_type ||
        item?.item_type,
      "Asset",
    ),

    tags: parseTags(item?.tags),

    sourceType,

    editorProjectId,

    originalDesignId,

    sourceProjectId,

    isEditable,

    isEditorDesign,

    isRemix,

    allowRemix: toBoolean(item?.allow_remix, false),

    isPublished: toBoolean(item?.is_published, false),

    isPublic: toBoolean(item?.is_public, false),

    basePrice,

    discountPrice,

    effectivePrice: discountPrice > 0 ? discountPrice : basePrice,

    createdAt: item?.created_at || item?.updated_at || null,
  };
}

/*=========================================================
Formatting Helpers
=========================================================*/

function formatPrice(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, toNumber(value, 0)));
}

function formatDate(value) {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "Recently added";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getErrorMessage(error) {
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
    "Failed to populate inventory matrix."
  );
}

/*=========================================================
Inventory Action Rules
=========================================================*/

function getPrimaryAction() {
  return {
    label: "View Design",
    Icon: Eye,
    type: "view",
  };
}

/*=========================================================
Inventory Image
=========================================================*/

function InventoryImage({ src, alt, className = "" }) {
  const [failed, setFailed] = useState(false);

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
        <ImageOff size={34} aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

/*=========================================================
Inventory Skeleton
=========================================================*/

function InventorySkeleton() {
  return (
    <div
      className="
        overflow-hidden
        rounded-2xl
        border
        border-slate-200
        bg-white
        shadow-sm
        dark:border-white/10
        dark:bg-[#101010]
      "
    >
      <div
        className="
          aspect-[4/3]
          animate-pulse
          bg-slate-200
          dark:bg-white/10
        "
      />

      <div className="space-y-4 p-5">
        <div
          className="
            h-3
            w-24
            animate-pulse
            rounded-full
            bg-slate-200
            dark:bg-white/10
          "
        />

        <div
          className="
            h-5
            w-4/5
            animate-pulse
            rounded-full
            bg-slate-200
            dark:bg-white/10
          "
        />

        <div
          className="
            h-3
            w-full
            animate-pulse
            rounded-full
            bg-slate-200
            dark:bg-white/10
          "
        />

        <div
          className="
            h-10
            w-full
            animate-pulse
            rounded-xl
            bg-slate-200
            dark:bg-white/10
          "
        />
      </div>
    </div>
  );
}

/*=========================================================
Source Badge
=========================================================*/

function SourceBadge({ item }) {
  if (item.isEditorDesign) {
    return (
      <span
        className="
          inline-flex
          items-center
          gap-1.5
          rounded-full
          border
          border-violet-200
          bg-violet-50
          px-2.5
          py-1
          text-[8px]
          font-black
          uppercase
          tracking-[0.14em]
          text-violet-700
          dark:border-violet-400/20
          dark:bg-violet-400/10
          dark:text-violet-200
        "
      >
        {item.isRemix ? <GitFork size={10} /> : <Layers3 size={10} />}

        {item.isRemix ? "Editor Remix" : "Fashion Editor"}
      </span>
    );
  }

  return (
    <span
      className="
        inline-flex
        items-center
        gap-1.5
        rounded-full
        border
        border-indigo-200
        bg-indigo-50
        px-2.5
        py-1
        text-[8px]
        font-black
        uppercase
        tracking-[0.14em]
        text-indigo-700
        dark:border-indigo-400/20
        dark:bg-indigo-400/10
        dark:text-indigo-200
      "
    >
      <FileImage size={10} />
      Image Upload
    </span>
  );
}

/*=========================================================
Inventory Grid
=========================================================*/

const InventoryGrid = () => {
  const navigate = useNavigate();

  const [designs, setDesigns] = useState([]);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");

  const [sourceFilter, setSourceFilter] = useState("all");

  const [statusFilter, setStatusFilter] = useState("all");

  const [previewItem, setPreviewItem] = useState(null);

  const requestControllerRef = useRef(null);

  /*=======================================================
  Fetch Inventory
  =======================================================*/

  const fetchInventory = useCallback(async ({ silent = false } = {}) => {
    requestControllerRef.current?.abort();

    const controller = new AbortController();

    requestControllerRef.current = controller;

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const response = await API.get(INVENTORY_ENDPOINT, {
        signal: controller.signal,
      });

      const normalized = extractInventoryItems(response).map(
        normalizeInventoryItem,
      );

      const uniqueDesigns = Array.from(
        new Map(
          normalized.map((item) => [item.id || item.slug, item]),
        ).values(),
      );

      setDesigns(uniqueDesigns);
    } catch (requestError) {
      const message = getErrorMessage(requestError);

      if (message) {
        console.error("Error collecting asset inventory:", requestError);

        setError(message);
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;

        setLoading(false);

        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchInventory();

    return () => {
      requestControllerRef.current?.abort();
    };
  }, [fetchInventory]);

  /*=======================================================
  Preview Modal Effects
  =======================================================*/

  useEffect(() => {
    if (!previewItem) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setPreviewItem(null);
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;

      window.removeEventListener("keydown", handleEscape);
    };
  }, [previewItem]);

  /*=======================================================
  Inventory Statistics
  =======================================================*/

  const statistics = useMemo(() => {
    return {
      total: designs.length,

      editor: designs.filter((item) => item.isEditorDesign).length,

      uploads: designs.filter((item) => !item.isEditorDesign).length,

      live: designs.filter((item) => item.isPublished && item.isPublic).length,
    };
  }, [designs]);

  /*=======================================================
  Filtered Designs
  =======================================================*/

  const visibleDesigns = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();

    return designs.filter((item) => {
      const matchesSource =
        sourceFilter === "all" ||
        (sourceFilter === "fashion_editor" && item.isEditorDesign) ||
        (sourceFilter === "upload" && !item.isEditorDesign);

      const isLive = item.isPublished && item.isPublic;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "live" && isLive) ||
        (statusFilter === "draft" && !isLive);

      if (!matchesSource || !matchesStatus) {
        return false;
      }

      if (!search) {
        return true;
      }

      const searchable = [
        item.title,
        item.description,
        item.sku,
        item.category,
        item.sourceType,
        ...item.tags,
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(search);
    });
  }, [designs, searchQuery, sourceFilter, statusFilter]);

  /*=======================================================
  Navigation Actions
  =======================================================*/

  const openPublicShowcase = useCallback(
    (item) => {
      if (!item?.slug || !item.isPublished || !item.isPublic) {
        setPreviewItem(item);

        return;
      }

      navigate(`/designer/showcase/${encodeURIComponent(item.slug)}`);
    },
    [navigate],
  );

  const handlePrimaryAction = useCallback(
    (item) => {
      openPublicShowcase(item);
    },
    [openPublicShowcase],
  );

  const clearFilters = () => {
    setSearchQuery("");

    setSourceFilter("all");

    setStatusFilter("all");
  };

  /*=======================================================
  Render
  =======================================================*/

  return (
    <div
      className="
        selection:bg-indigo-600
        selection:text-white
        w-full
        space-y-6
      "
    >
      {/* Header */}

      <section
        className="
          overflow-hidden
          rounded-2xl
          border
          border-slate-200
          bg-white
          shadow-sm
          dark:border-white/10
          dark:bg-[#0B0B0B]
        "
      >
        <div
          className="
            flex
            flex-col
            gap-5
            p-5
            sm:p-6
            lg:flex-row
            lg:items-center
            lg:justify-between
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
                tracking-[0.24em]
                text-indigo-600
                dark:text-indigo-300
              "
            >
              <Sparkles size={13} />
              Designer Asset Library
            </div>

            <h1
              className="
                mt-2
                text-xl
                font-bold
                tracking-tight
                text-slate-900
                dark:text-white
                sm:text-2xl
              "
            >
              Portfolio Catalog Inventory
            </h1>

            <p
              className="
                mt-1
                text-sm
                text-slate-500
                dark:text-white/40
              "
            >
              Manage your uploaded designer assets and published showcase
              presentations.
            </p>
          </div>

          <div
            className="
              flex
              flex-col
              gap-2
              sm:flex-row
            "
          >
            <button
              type="button"
              onClick={() => navigate("/designer/upload")}
              className="
                inline-flex
                h-11
                items-center
                justify-center
                gap-2
                rounded-xl
                bg-indigo-600
                px-4
                text-[9px]
                font-black
                uppercase
                tracking-[0.16em]
                text-white
                shadow-sm
                transition
                hover:bg-indigo-700
              "
            >
              <UploadCloud size={14} />
              Upload New Design
            </button>
          </div>
        </div>

        {/* Statistics */}

        <div
          className="
            grid
            grid-cols-2
            border-t
            border-slate-100
            dark:border-white/5
            sm:grid-cols-4
          "
        >
          {[
            {
              label: "Total Assets",

              value: statistics.total,
            },
            {
              label: "Editor Projects",

              value: statistics.editor,
            },
            {
              label: "Image Uploads",

              value: statistics.uploads,
            },
            {
              label: "Live Designs",

              value: statistics.live,
            },
          ].map((statistic, index) => (
            <div
              key={statistic.label}
              className={`
                  px-4
                  py-4
                  text-center
                  ${
                    index > 0
                      ? "border-l border-slate-100 dark:border-white/5"
                      : ""
                  }
                `}
            >
              <p
                className="
                    text-xl
                    font-bold
                    text-slate-900
                    dark:text-white
                  "
              >
                {statistic.value}
              </p>

              <p
                className="
                    mt-1
                    text-[8px]
                    font-black
                    uppercase
                    tracking-[0.14em]
                    text-slate-400
                    dark:text-white/30
                  "
              >
                {statistic.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Filters */}

      <section
        className="
          rounded-2xl
          border
          border-slate-200
          bg-white
          p-4
          shadow-sm
          dark:border-white/10
          dark:bg-[#0B0B0B]
          sm:p-5
        "
      >
        <div
          className="
            flex
            flex-col
            gap-3
            xl:flex-row
            xl:items-center
            xl:justify-between
          "
        >
          <label
            className="
              relative
              block
              w-full
              xl:max-w-md
            "
          >
            <span className="sr-only">Search inventory</span>

            <Search
              size={16}
              className="
                pointer-events-none
                absolute
                left-4
                top-1/2
                -translate-y-1/2
                text-slate-400
              "
            />

            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search title, SKU, style, or tag"
              className="
                h-11
                w-full
                rounded-xl
                border
                border-slate-200
                bg-slate-50
                pl-11
                pr-10
                text-sm
                text-slate-900
                outline-none
                transition
                placeholder:text-slate-400
                focus:border-indigo-500
                focus:ring-4
                focus:ring-indigo-500/10
                dark:border-white/10
                dark:bg-white/[0.035]
                dark:text-white
                dark:placeholder:text-white/25
              "
            />

            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear inventory search"
                className="
                  absolute
                  right-3
                  top-1/2
                  flex
                  h-7
                  w-7
                  -translate-y-1/2
                  items-center
                  justify-center
                  rounded-full
                  text-slate-400
                  hover:bg-slate-200
                  hover:text-slate-700
                  dark:hover:bg-white/10
                  dark:hover:text-white
                "
              >
                <X size={14} />
              </button>
            )}
          </label>

          <div
            className="
              flex
              flex-col
              gap-2
              sm:flex-row
            "
          >
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              aria-label="Filter inventory by source"
              className="
                h-11
                rounded-xl
                border
                border-slate-200
                bg-slate-50
                px-4
                text-[9px]
                font-black
                uppercase
                tracking-[0.14em]
                text-slate-600
                outline-none
                focus:border-indigo-500
                dark:border-white/10
                dark:bg-white/[0.035]
                dark:text-white/55
              "
            >
              {SOURCE_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter inventory by status"
              className="
                h-11
                rounded-xl
                border
                border-slate-200
                bg-slate-50
                px-4
                text-[9px]
                font-black
                uppercase
                tracking-[0.14em]
                text-slate-600
                outline-none
                focus:border-indigo-500
                dark:border-white/10
                dark:bg-white/[0.035]
                dark:text-white/55
              "
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() =>
                fetchInventory({
                  silent: true,
                })
              }
              disabled={refreshing}
              className="
                inline-flex
                h-11
                items-center
                justify-center
                gap-2
                rounded-xl
                border
                border-slate-200
                bg-white
                px-4
                text-[9px]
                font-black
                uppercase
                tracking-[0.14em]
                text-slate-600
                transition
                hover:border-indigo-400
                hover:text-indigo-600
                disabled:opacity-50
                dark:border-white/10
                dark:bg-white/[0.035]
                dark:text-white/50
                dark:hover:text-indigo-300
              "
            >
              <RefreshCw
                size={14}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {/* Error */}

      {error && (
        <div
          role="alert"
          className="
            flex
            flex-col
            gap-4
            rounded-2xl
            border
            border-rose-200
            bg-rose-50
            p-4
            text-rose-700
            dark:border-rose-400/20
            dark:bg-rose-400/10
            dark:text-rose-200
            sm:flex-row
            sm:items-center
            sm:justify-between
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

            <p
              className="
                text-sm
                leading-6
              "
            >
              {error}
            </p>
          </div>

          <button
            type="button"
            onClick={() => fetchInventory()}
            className="
              inline-flex
              h-10
              shrink-0
              items-center
              justify-center
              gap-2
              rounded-xl
              bg-rose-600
              px-4
              text-[9px]
              font-black
              uppercase
              tracking-[0.14em]
              text-white
            "
          >
            <RefreshCw size={13} />
            Try Again
          </button>
        </div>
      )}

      {/* Loading */}

      {loading ? (
        <div
          className="
            grid
            grid-cols-1
            gap-6
            sm:grid-cols-2
            xl:grid-cols-3
            2xl:grid-cols-4
          "
        >
          {Array.from({
            length: 8,
          }).map((_, index) => (
            <InventorySkeleton key={index} />
          ))}
        </div>
      ) : visibleDesigns.length === 0 ? (
        /* Empty State */

        <div
          className="
            flex
            min-h-[360px]
            flex-col
            items-center
            justify-center
            rounded-2xl
            border-2
            border-dashed
            border-slate-200
            bg-white
            px-6
            text-center
            dark:border-white/10
            dark:bg-[#0B0B0B]
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
              border-indigo-200
              bg-indigo-50
              text-indigo-600
              dark:border-indigo-400/20
              dark:bg-indigo-400/10
              dark:text-indigo-200
            "
          >
            <Layers3 size={26} />
          </div>

          <h2
            className="
              mt-6
              text-xl
              font-bold
              text-slate-900
              dark:text-white
            "
          >
            {designs.length === 0
              ? "Your inventory is currently empty."
              : "No assets match the selected filters."}
          </h2>

          <p
            className="
              mt-2
              max-w-md
              text-sm
              leading-7
              text-slate-500
              dark:text-white/40
            "
          >
            {designs.length === 0
              ? "Upload a finished designer presentation to start building your inventory."
              : "Clear the search and filters to return to your complete inventory."}
          </p>

          <div
            className="
              mt-6
              flex
              flex-col
              gap-2
              sm:flex-row
            "
          >
            {designs.length === 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate("/designer/upload")}
                  className="
                    inline-flex
                    h-11
                    items-center
                    justify-center
                    gap-2
                    rounded-xl
                    bg-indigo-600
                    px-4
                    text-[9px]
                    font-black
                    uppercase
                    tracking-[0.14em]
                    text-white
                  "
                >
                  <UploadCloud size={14} />
                  Upload Design
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={clearFilters}
                className="
                  inline-flex
                  h-11
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  bg-indigo-600
                  px-4
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.14em]
                  text-white
                "
              >
                <RefreshCw size={14} />
                Clear Filters
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Inventory Cards */

        <div
          className="
            grid
            grid-cols-1
            gap-6
            sm:grid-cols-2
            xl:grid-cols-3
            2xl:grid-cols-4
          "
        >
          {visibleDesigns.map((item) => {
            const action = getPrimaryAction(item);

            const ActionIcon = action.Icon;

            const isLive = item.isPublished && item.isPublic;

            return (
              <article
                key={item.id}
                className="
                    group
                    overflow-hidden
                    rounded-2xl
                    border
                    border-slate-200
                    bg-white
                    shadow-sm
                    transition
                    duration-200
                    hover:-translate-y-1
                    hover:border-slate-300
                    hover:shadow-xl
                    dark:border-white/10
                    dark:bg-[#101010]
                    dark:hover:border-white/20
                  "
              >
                {/* Card Image */}

                <button
                  type="button"
                  onClick={() => setPreviewItem(item)}
                  className="
                      relative
                      block
                      aspect-[4/3]
                      w-full
                      overflow-hidden
                      border-b
                      border-slate-100
                      bg-slate-50
                      text-left
                      dark:border-white/5
                      dark:bg-black
                    "
                >
                  <InventoryImage
                    src={item.image}
                    alt={item.title}
                    className="
                        h-full
                        w-full
                        object-contain
                        p-2
                        transition
                        duration-500
                        group-hover:scale-[1.02]
                      "
                  />

                  <div
                    className="
                        absolute
                        left-3
                        top-3
                        flex
                        max-w-[calc(100%-1.5rem)]
                        flex-wrap
                        gap-2
                      "
                  >
                    <SourceBadge item={item} />
                  </div>

                  <span
                    className={`
                        absolute
                        right-3
                        top-3
                        inline-flex
                        items-center
                        gap-1.5
                        rounded-full
                        border
                        px-2.5
                        py-1
                        text-[8px]
                        font-black
                        uppercase
                        tracking-[0.14em]
                        text-white
                        backdrop-blur-md
                        ${
                          isLive
                            ? "border-emerald-300/40 bg-emerald-500/85"
                            : "border-amber-300/40 bg-amber-500/85"
                        }
                      `}
                  >
                    {isLive ? <CheckCircle2 size={10} /> : <Clock3 size={10} />}

                    {isLive ? "Live" : "Draft"}
                  </span>

                  <span
                    className="
                        absolute
                        bottom-3
                        right-3
                        rounded-lg
                        bg-slate-950/80
                        px-2.5
                        py-1.5
                        text-xs
                        font-black
                        tabular-nums
                        text-white
                        shadow-sm
                        backdrop-blur-md
                      "
                  >
                    {formatPrice(item.effectivePrice)}
                  </span>
                </button>

                {/* Card Content */}

                <div className="p-5">
                  <div
                    className="
                        flex
                        items-start
                        justify-between
                        gap-3
                      "
                  >
                    <div className="min-w-0">
                      <p
                        className="
                            text-[8px]
                            font-black
                            uppercase
                            tracking-[0.16em]
                            text-indigo-600
                            dark:text-indigo-300
                          "
                      >
                        {item.category}
                      </p>

                      <h3
                        className="
                            mt-2
                            truncate
                            text-sm
                            font-bold
                            uppercase
                            tracking-tight
                            text-slate-900
                            dark:text-white
                          "
                      >
                        {item.title}
                      </h3>
                    </div>
                  </div>

                  <p
                    className="
                        mt-3
                        line-clamp-2
                        min-h-10
                        text-xs
                        font-medium
                        leading-5
                        text-slate-500
                        dark:text-white/40
                      "
                  >
                    {item.description}
                  </p>

                  {/* Tags */}

                  {item.tags.length > 0 && (
                    <div
                      className="
                          mt-4
                          flex
                          flex-wrap
                          gap-1.5
                        "
                    >
                      {item.tags.slice(0, 3).map((tag) => (
                        <span
                          key={`${item.id}-${tag}`}
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
                          <Tag size={9} />

                          <span className="truncate">{tag}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Metadata */}

                  <div
                    className="
                        mt-4
                        flex
                        items-center
                        justify-between
                        border-y
                        border-slate-100
                        py-3
                        text-[9px]
                        text-slate-400
                        dark:border-white/5
                        dark:text-white/30
                      "
                  >
                    <span className="font-medium">
                      SKU:{" "}
                      <strong
                        className="
                            font-mono
                            text-slate-600
                            dark:text-white/50
                          "
                      >
                        {item.sku}
                      </strong>
                    </span>

                    <span>{formatDate(item.createdAt)}</span>
                  </div>

                  {/* Actions */}

                  <div
                    className="
                        mt-4
                        grid
                        grid-cols-[1fr_auto]
                        gap-2
                      "
                  >
                    <button
                      type="button"
                      onClick={() => handlePrimaryAction(item)}
                      className="
                          inline-flex
                          h-10
                          items-center
                          justify-center
                          gap-2
                          rounded-xl
                          bg-indigo-600
                          px-3
                          text-[8px]
                          font-black
                          uppercase
                          tracking-[0.14em]
                          text-white
                          transition
                          hover:bg-indigo-700
                        "
                    >
                      <ActionIcon size={13} />

                      {action.label}
                    </button>

                    {isLive && (
                      <button
                        type="button"
                        onClick={() => openPublicShowcase(item)}
                        aria-label={`View ${item.title}`}
                        title={
                          isLive ? "View public showcase" : "Preview design"
                        }
                        className="
                            flex
                            h-10
                            w-10
                            items-center
                            justify-center
                            rounded-xl
                            border
                            border-slate-200
                            bg-slate-50
                            text-slate-500
                            transition
                            hover:border-indigo-400
                            hover:text-indigo-600
                            dark:border-white/10
                            dark:bg-white/[0.035]
                            dark:text-white/40
                            dark:hover:text-indigo-300
                          "
                      >
                        <Eye size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}

      {previewItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${previewItem.title} preview`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPreviewItem(null);
            }
          }}
          className="
            fixed
            inset-0
            z-[120]
            flex
            items-center
            justify-center
            bg-black/80
            p-4
            backdrop-blur-md
            sm:p-6
          "
        >
          <section
            className="
              relative
              flex
              max-h-[92dvh]
              w-full
              max-w-4xl
              flex-col
              overflow-hidden
              rounded-2xl
              border
              border-white/10
              bg-[#0B0B0B]
              text-white
              shadow-2xl
            "
          >
            {/* Modal Header */}

            <div
              className="
                flex
                items-start
                justify-between
                gap-4
                border-b
                border-white/10
                px-5
                py-4
                sm:px-6
              "
            >
              <div className="min-w-0">
                <SourceBadge item={previewItem} />

                <h2
                  className="
                    mt-3
                    truncate
                    text-xl
                    font-bold
                  "
                >
                  {previewItem.title}
                </h2>

                <p
                  className="
                    mt-1
                    text-xs
                    text-white/40
                  "
                >
                  SKU {previewItem.sku}
                  {" · "}
                  {formatDate(previewItem.createdAt)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                aria-label="Close inventory preview"
                className="
                  flex
                  h-10
                  w-10
                  shrink-0
                  items-center
                  justify-center
                  rounded-xl
                  border
                  border-white/10
                  bg-white/5
                  text-white/60
                  hover:bg-white/10
                  hover:text-white
                "
              >
                <X size={17} />
              </button>
            </div>

            {/* Modal Body */}

            <div
              className="
                min-h-0
                flex-1
                overflow-y-auto
                p-5
                sm:p-6
              "
            >
              <div
                className="
                  overflow-hidden
                  rounded-2xl
                  border
                  border-white/10
                  bg-black
                "
              >
                <div
                  className="
                    flex
                    min-h-[300px]
                    max-h-[65vh]
                    items-center
                    justify-center
                  "
                >
                  <InventoryImage
                    src={previewItem.image}
                    alt={previewItem.title}
                    className="
                      max-h-[65vh]
                      w-full
                      object-contain
                    "
                  />
                </div>
              </div>

              <p
                className="
                  mt-5
                  whitespace-pre-wrap
                  text-sm
                  leading-7
                  text-white/55
                "
              >
                {previewItem.description}
              </p>
            </div>

            {/* Modal Footer */}

            <div
              className="
                flex
                flex-col-reverse
                gap-2
                border-t
                border-white/10
                px-5
                py-4
                sm:flex-row
                sm:justify-end
                sm:px-6
              "
            >
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="
                  h-11
                  rounded-xl
                  border
                  border-white/10
                  bg-white/5
                  px-5
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.14em]
                  text-white/60
                  hover:bg-white/10
                  hover:text-white
                "
              >
                Close
              </button>

              {previewItem.isPublished &&
                previewItem.isPublic &&
                previewItem.slug && (
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewItem(null);

                      navigate(
                        `/designer/showcase/${encodeURIComponent(
                          previewItem.slug,
                        )}`,
                      );
                    }}
                    className="
                      inline-flex
                      h-11
                      items-center
                      justify-center
                      gap-2
                      rounded-xl
                      border
                      border-indigo-400/30
                      bg-indigo-500/10
                      px-5
                      text-[9px]
                      font-black
                      uppercase
                      tracking-[0.14em]
                      text-indigo-200
                      hover:bg-indigo-500/20
                    "
                  >
                    <Eye size={14} />
                    Public Showcase
                  </button>
                )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default InventoryGrid;
