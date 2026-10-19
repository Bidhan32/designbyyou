
"use strict";

/**
 * DesignByYou / Creator Studio — Version 7.0
 *
 * Manual upload: 0–6 images under one creation.
 * Multiple selection and incremental selection supported.
 * All creative metadata remains optional.
 * Visibility defaults to Private.
 *
 * Fashion Editor sharing remains a separate workflow.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  FileImage,
  Globe2,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Lock,
  Palette,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Tag,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

import { useNavigate } from "react-router-dom";
import API from "../../api/axios";
import { useSketchStore } from "../sketches/useSketchStore";

/* =========================================================
   Configuration
   ========================================================= */

const UPLOAD_ENDPOINT = "/creators/studio/upload";
const CATEGORIES_ENDPOINT = "/creators/studio/categories";
const DISCOVERY_ENDPOINT = "/creator-showcase/discovery";
const CREATOR_HUB_ROUTE = "/creator/showcase";

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 3000;
const MAX_TAG_LENGTH = 30;
const MAX_TAGS = 12;
const MAX_CANVAS_STATE_BYTES = 2 * 1024 * 1024;

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FORMAT_OPTIONS = [
  { value: "sketch", label: "Fashion Sketch" },
  { value: "3d_garment", label: "3D Garment" },
  { value: "tech_pack", label: "Technical Design" },
];

const VISIBILITY_OPTIONS = [
  {
    value: "private",
    label: "Private",
    description: "Only you can see this creation in your Creator area.",
    Icon: Lock,
  },
  {
    value: "public",
    label: "Public",
    description: "Visible to others through the DesignByYou Showcase.",
    Icon: Globe2,
  },
];

const INITIAL_FORM = {
  title: "",
  description: "",
  format: "",
  category_id: "",
  style_term_id: "",
  garment_term_id: "",
  occasion_term_ids: [],
  visibility: "private",
};

/* =========================================================
   Input Sanitization
   ========================================================= */

function cleanText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMultiline(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || "").trim());
}

function normalizeTag(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, MAX_TAG_LENGTH);
}

function uniqueTags(values) {
  return Array.from(
    new Set(values.map(normalizeTag).filter(Boolean))
  ).slice(0, MAX_TAGS);
}

function isCancelled(error) {
  return (
    ["ERR_CANCELED", "CanceledError", "AbortError"].includes(error?.code) ||
    ["CanceledError", "AbortError"].includes(error?.name)
  );
}

function errorMessage(error, fallback) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
}

/* =========================================================
   Category / Discovery Normalization
   ========================================================= */

function normalizeCategoryList(response) {
  const source = Array.isArray(response?.data?.data)
    ? response.data.data
    : Array.isArray(response?.data?.categories)
      ? response.data.categories
      : [];

  const seen = new Set();

  return source
    .filter((item) => {
      const id = cleanText(item?.id);

      if (
        !id ||
        !cleanText(item?.name) ||
        seen.has(id)
      ) {
        return false;
      }

      seen.add(id);
      return true;
    })
    .map((item) => ({
      id: cleanText(item.id),
      name: cleanText(item.name),
      description: cleanText(item.description),
      slug: cleanText(item.slug),
    }));
}

function normalizeDiscovery(response) {
  const data = response?.data?.data || {};

  const normalize = (items) => {
    const seen = new Set();

    return (Array.isArray(items) ? items : [])
      .filter((item) => {
        const id = cleanText(item?.id);

        if (
          !id ||
          !cleanText(item?.name) ||
          seen.has(id)
        ) {
          return false;
        }

        seen.add(id);
        return true;
      })
      .map((item) => ({
        id: cleanText(item.id),
        name: cleanText(item.name),
        emoji: cleanText(item.emoji),
        description: cleanText(item.description),
      }));
  };

  return {
    styles: normalize(data.styles),
    garments: normalize(data.garments),
    occasions: normalize(data.occasions),
  };
}

/* =========================================================
   Image Validation
   ========================================================= */

function validateFile(file) {
  if (!(file instanceof Blob)) {
    throw new Error("The selected artwork is not a valid image.");
  }

  if (!IMAGE_TYPES.has(String(file.type || "").toLowerCase())) {
    throw new Error("Only JPG, PNG and WEBP images are supported.");
  }

  if (!Number.isFinite(file.size) || file.size < 1) {
    throw new Error("An image is empty.");
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Each image must be 5 MB or smaller.");
  }
}

async function validateSignature(file) {
  validateFile(file);

  const bytes = new Uint8Array(
    await file.slice(0, 12).arrayBuffer()
  );

  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;

  const isPng =
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, index) => bytes[index] === byte
    );

  const isWebp =
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";

  const valid =
    (file.type === "image/jpeg" && isJpeg) ||
    (file.type === "image/png" && isPng) ||
    (file.type === "image/webp" && isWebp);

  if (!valid) {
    throw new Error(
      "One image does not match its declared file type."
    );
  }
}

/* =========================================================
   Existing Studio Image Bridge
   ========================================================= */

function isAllowedImageUrl(value) {
  const source = String(value || "").trim();

  if (/^data:image\/(?:jpeg|png|webp);base64,/i.test(source)) {
    return true;
  }

  if (source.startsWith("blob:")) {
    return true;
  }

  try {
    const parsed = new URL(source, window.location.href);

    return (
      parsed.protocol === "https:" ||
      (
        parsed.protocol === "http:" &&
        (
          parsed.origin === window.location.origin ||
          ["localhost", "127.0.0.1"].includes(parsed.hostname)
        )
      )
    );
  } catch {
    return false;
  }
}

async function convertStudioImageToFile(source) {
  if (!source) {
    throw new Error("The Studio did not provide an image.");
  }

  if (source instanceof File) {
    await validateSignature(source);
    return source;
  }

  if (source instanceof Blob) {
    const extension =
      source.type === "image/webp"
        ? "webp"
        : source.type === "image/jpeg"
          ? "jpg"
          : "png";

    const file = new File(
      [source],
      `creator-studio-${Date.now()}.${extension}`,
      { type: source.type || "image/png" }
    );

    await validateSignature(file);
    return file;
  }

  if (typeof source === "object") {
    const nested =
      source.file ||
      source.blob ||
      source.dataUrl ||
      source.data_url ||
      source.url ||
      source.src ||
      source.image;

    if (nested && nested !== source) {
      return convertStudioImageToFile(nested);
    }
  }

  if (
    typeof source === "string" &&
    isAllowedImageUrl(source)
  ) {
    const parsed =
      source.startsWith("data:") ||
      source.startsWith("blob:")
        ? null
        : new URL(source, window.location.href);

    const response = await fetch(source, {
      credentials:
        parsed?.origin === window.location.origin
          ? "same-origin"
          : "omit",
      referrerPolicy: "no-referrer",
    });

    if (!response.ok) {
      throw new Error("The Studio image could not be loaded.");
    }

    return convertStudioImageToFile(
      await response.blob()
    );
  }

  throw new Error("The Studio image source is unsupported.");
}

function fileFingerprint(file) {
  return `${file.name || "studio"}:${file.size}:${file.lastModified || 0}:${file.type}`;
}

function makeImageId() {
  return typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/* =========================================================
   Reusable Form Components
   ========================================================= */

function FieldLabel({ children, optional = false }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 text-[9px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-white/40">
      <span>{children}</span>

      {optional && (
        <span className="text-[8px] font-medium tracking-wider text-slate-400 dark:text-white/25">
          Optional
        </span>
      )}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  disabled,
  children,
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="h-[52px] w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 pr-11 text-sm text-slate-900 outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 disabled:opacity-60 dark:border-white/10 dark:bg-[#111111] dark:text-white dark:[color-scheme:dark]"
      >
        {children}
      </select>

      <ChevronDown
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
      />
    </div>
  );
}

const textFieldClass =
  "h-[52px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 disabled:opacity-60 dark:border-white/10 dark:bg-[#111111] dark:text-white dark:placeholder:text-white/25";

const miniButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-black/65 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-white transition hover:bg-white hover:text-black disabled:opacity-40";

/* =========================================================
   Main Creator Studio
   ========================================================= */

export default function CreatorUpload() {
  const navigate = useNavigate();

  const pendingStudioImage = useSketchStore(
    (state) => state.pendingStudioImage
  );

  const setPendingStudioImage = useSketchStore(
    (state) => state.setPendingStudioImage
  );

  const strokes = useSketchStore(
    (state) => state.strokes
  );

  /* -------------------------------------------------------
     Form State
     ------------------------------------------------------- */

  const [form, setForm] = useState(INITIAL_FORM);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");

  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] =
    useState(true);
  const [categoriesError, setCategoriesError] = useState("");

  const [discovery, setDiscovery] = useState({
    styles: [],
    garments: [],
    occasions: [],
  });

  const [discoveryLoading, setDiscoveryLoading] =
    useState(true);
  const [discoveryError, setDiscoveryError] = useState("");

  /* -------------------------------------------------------
     Image Gallery
     -------------------------------------------------------
     Each entry:
     {
       id,
       file,
       url,
       source
     }

     URL.createObjectURL is used for local previews.
     URLs are revoked on removal and unmount.
     ------------------------------------------------------- */

  const [gallery, setGallery] = useState([]);
  const galleryRef = useRef([]);

  const [coverId, setCoverId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [imageDimensions, setImageDimensions] = useState(null);

  const [dragActive, setDragActive] = useState(false);

  const dragDepthRef = useRef(0);
  const pickerRef = useRef(null);
  const selectingRef = useRef(false);
  const mountedRef = useRef(true);

  /* -------------------------------------------------------
     Request State
     ------------------------------------------------------- */

  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const uploadControllerRef = useRef(null);
  const uploadInProgressRef = useRef(false);
  const categoriesControllerRef = useRef(null);
  const discoveryControllerRef = useRef(null);
  const navigationTimerRef = useRef(null);

  /* -------------------------------------------------------
     Gallery State Synchronization
     ------------------------------------------------------- */

  const setGallerySafe = useCallback((items) => {
    galleryRef.current = items;
    setGallery(items);
  }, []);

  /* -------------------------------------------------------
     Selected Metadata
     ------------------------------------------------------- */

  const selectedCategory = useMemo(
    () =>
      categories.find(
        (category) => category.id === form.category_id
      ) || null,
    [categories, form.category_id]
  );

  const selectedStyle = useMemo(
    () =>
      discovery.styles.find(
        (style) => style.id === form.style_term_id
      ) || null,
    [discovery.styles, form.style_term_id]
  );

  const selectedGarment = useMemo(
    () =>
      discovery.garments.find(
        (garment) => garment.id === form.garment_term_id
      ) || null,
    [discovery.garments, form.garment_term_id]
  );

  const selectedOccasions = useMemo(() => {
    const ids = new Set(form.occasion_term_ids);

    return discovery.occasions.filter(
      (occasion) => ids.has(occasion.id)
    );
  }, [discovery.occasions, form.occasion_term_ids]);

  const selectedTermIds = useMemo(
    () =>
      Array.from(
        new Set(
          [
            selectedStyle?.id,
            selectedGarment?.id,
            ...selectedOccasions.map(
              (occasion) => occasion.id
            ),
          ].filter(Boolean)
        )
      ),
    [selectedStyle, selectedGarment, selectedOccasions]
  );

  const activeImage =
    gallery.find((image) => image.id === activeId) ||
    gallery[0] ||
    null;

  const coverImage =
    gallery.find((image) => image.id === coverId) ||
    gallery[0] ||
    null;

  const strokeCount = Array.isArray(strokes)
    ? strokes.length
    : 0;

  const serializedCanvas = useMemo(() => {
    try {
      return JSON.stringify(
        Array.isArray(strokes) ? strokes : strokes || []
      );
    } catch {
      return "[]";
    }
  }, [strokes]);

  /* =======================================================
     Load Categories
     ======================================================= */

  const loadCategories = useCallback(async () => {
    categoriesControllerRef.current?.abort();

    const controller = new AbortController();
    categoriesControllerRef.current = controller;

    setCategoriesLoading(true);
    setCategoriesError("");

    try {
      const response = await API.get(
        CATEGORIES_ENDPOINT,
        { signal: controller.signal }
      );

      if (controller.signal.aborted) return;

      const list = normalizeCategoryList(response);

      setCategories(list);

      setForm((old) => ({
        ...old,
        category_id: list.some(
          (category) => category.id === old.category_id
        )
          ? old.category_id
          : "",
      }));

      if (!list.length) {
        setCategoriesError(
          "No active creative categories are currently available."
        );
      }
    } catch (error) {
      if (isCancelled(error)) return;

      if (import.meta.env.DEV) {
        console.error("Creator categories failed:", error);
      }

      setCategories([]);

      setCategoriesError(
        errorMessage(
          error,
          "Creative categories could not be loaded."
        )
      );
    } finally {
      if (categoriesControllerRef.current === controller) {
        categoriesControllerRef.current = null;
        setCategoriesLoading(false);
      }
    }
  }, []);

  /* =======================================================
     Load Showcase Discovery
     ======================================================= */

  const loadDiscovery = useCallback(async () => {
    discoveryControllerRef.current?.abort();

    const controller = new AbortController();
    discoveryControllerRef.current = controller;

    setDiscoveryLoading(true);
    setDiscoveryError("");

    try {
      const response = await API.get(
        DISCOVERY_ENDPOINT,
        { signal: controller.signal }
      );

      if (controller.signal.aborted) return;

      const data = normalizeDiscovery(response);

      setDiscovery(data);

      setForm((old) => ({
        ...old,

        style_term_id: data.styles.some(
          (style) => style.id === old.style_term_id
        )
          ? old.style_term_id
          : "",

        garment_term_id: data.garments.some(
          (garment) => garment.id === old.garment_term_id
        )
          ? old.garment_term_id
          : "",

        occasion_term_ids: old.occasion_term_ids.filter(
          (id) =>
            data.occasions.some(
              (occasion) => occasion.id === id
            )
        ),
      }));

      if (
        !data.styles.length ||
        !data.garments.length
      ) {
        setDiscoveryError(
          "Showcase discovery options are incomplete."
        );
      }
    } catch (error) {
      if (isCancelled(error)) return;

      if (import.meta.env.DEV) {
        console.error("Creator discovery failed:", error);
      }

      setDiscoveryError(
        errorMessage(
          error,
          "Showcase discovery options could not be loaded."
        )
      );
    } finally {
      if (discoveryControllerRef.current === controller) {
        discoveryControllerRef.current = null;
        setDiscoveryLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadCategories();
    void loadDiscovery();

    return () => {
      categoriesControllerRef.current?.abort();
      discoveryControllerRef.current?.abort();
    };
  }, [loadCategories, loadDiscovery]);

  /* =======================================================
     Cleanup
     ======================================================= */

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      uploadControllerRef.current?.abort();

      if (navigationTimerRef.current) {
        window.clearTimeout(
          navigationTimerRef.current
        );
      }

      galleryRef.current.forEach(
        (item) => URL.revokeObjectURL(item.url)
      );
    };
  }, []);

  useEffect(() => {
    setImageDimensions(null);
  }, [activeImage?.id]);

  /* =======================================================
     Add Images
     =======================================================
     This function supports:
     - Selecting 1 image
     - Selecting several images
     - Reopening the same picker to add more
     - Dragging several files
     - Imported Studio images

     Invalid batches are rejected without partially
     adding their files.
     ======================================================= */

  const appendFiles = useCallback(
    async (incoming, source = "upload") => {
      if (
        uploadInProgressRef.current ||
        success
      ) {
        return;
      }

      if (selectingRef.current) {
        setErrorMsg(
          "Please wait for the current images to finish loading."
        );
        return;
      }

      const files = Array.from(incoming || []);

      if (!files.length) return;

      selectingRef.current = true;

      try {
        if (files.length > MAX_IMAGES) {
          throw new Error(
            `You can upload up to ${MAX_IMAGES} images per creation.`
          );
        }

        for (const file of files) {
          await validateSignature(file);
        }

        if (!mountedRef.current) return;

        const current = galleryRef.current;

        const fingerprints = new Set(
          current.map(
            (entry) => fileFingerprint(entry.file)
          )
        );

        const accepted = [];

        for (const file of files) {
          const fingerprint =
            fileFingerprint(file);

          if (fingerprints.has(fingerprint)) {
            continue;
          }

          fingerprints.add(fingerprint);
          accepted.push(file);
        }

        if (
          current.length + accepted.length >
          MAX_IMAGES
        ) {
          throw new Error(
            `Only ${MAX_IMAGES} images are allowed. You already selected ${current.length}.`
          );
        }

        if (!accepted.length) {
          throw new Error(
            "These images are already selected."
          );
        }

        const newEntries = [];

        try {
          for (const file of accepted) {
            newEntries.push({
              id: makeImageId(),
              file,
              url: URL.createObjectURL(file),
              source,
            });
          }
        } catch (error) {
          newEntries.forEach(
            (entry) =>
              URL.revokeObjectURL(entry.url)
          );

          throw error;
        }

        setGallerySafe([
          ...current,
          ...newEntries,
        ]);

        if (!current.length) {
          setCoverId(newEntries[0].id);
          setActiveId(newEntries[0].id);
        }

        setUploadProgress(0);
        setSuccess(false);
        setErrorMsg("");
      } catch (error) {
        if (mountedRef.current) {
          setErrorMsg(
            error?.message ||
              "One or more images could not be added."
          );
        }
      } finally {
        selectingRef.current = false;
      }
    },
    [setGallerySafe, success]
  );

  /* =======================================================
     Import Pending Studio Image
     ======================================================= */

  useEffect(() => {
    if (!pendingStudioImage) {
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        const file =
          await convertStudioImageToFile(
            pendingStudioImage
          );

        if (!cancelled) {
          await appendFiles(
            [file],
            "studio"
          );
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMsg(
            error?.message ||
              "The Studio image could not be prepared."
          );
        }
      } finally {
        if (
          !cancelled &&
          typeof setPendingStudioImage ===
            "function"
        ) {
          setPendingStudioImage(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    pendingStudioImage,
    setPendingStudioImage,
    appendFiles,
  ]);

  /* =======================================================
     File Picker
     ======================================================= */

  const openPicker = useCallback(() => {
    if (
      loading ||
      success ||
      galleryRef.current.length >= MAX_IMAGES
    ) {
      return;
    }

    if (pickerRef.current) {
      pickerRef.current.value = "";
      pickerRef.current.click();
    }
  }, [loading, success]);

  const handleFileChange = useCallback(
    async (event) => {
      const files = Array.from(
        event.target.files || []
      );

      event.target.value = "";

      await appendFiles(files);
    },
    [appendFiles]
  );

  /* =======================================================
     Drag and Drop
     ======================================================= */

  const handleDragEnter = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (loading || success) return;

    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();

    dragDepthRef.current = Math.max(
      0,
      dragDepthRef.current - 1
    );

    if (!dragDepthRef.current) {
      setDragActive(false);
    }
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    dragDepthRef.current = 0;
    setDragActive(false);

    if (!loading && !success) {
      await appendFiles(
        event.dataTransfer?.files
      );
    }
  };

  /* =======================================================
     Remove / Clear / Reorder Images
     ======================================================= */

  const removeImage = (id) => {
    if (loading || success) return;

    const current = galleryRef.current;

    const removed = current.find(
      (image) => image.id === id
    );

    if (!removed) return;

    const next = current.filter(
      (image) => image.id !== id
    );

    setGallerySafe(next);

    URL.revokeObjectURL(removed.url);

    if (coverId === id) {
      setCoverId(next[0]?.id || null);
    }

    if (activeId === id) {
      setActiveId(next[0]?.id || null);
    }

    setUploadProgress(0);
    setErrorMsg("");
  };

  const clearAllImages = () => {
    if (loading || success) return;

    galleryRef.current.forEach(
      (item) => URL.revokeObjectURL(item.url)
    );

    setGallerySafe([]);

    setCoverId(null);
    setActiveId(null);
    setImageDimensions(null);

    if (pickerRef.current) {
      pickerRef.current.value = "";
    }

    setUploadProgress(0);
    setErrorMsg("");
  };

  const moveImage = (id, direction) => {
    if (loading || success) return;

    const next = [
      ...galleryRef.current,
    ];

    const from = next.findIndex(
      (item) => item.id === id
    );

    const to = from + direction;

    if (
      from < 0 ||
      to < 0 ||
      to >= next.length
    ) {
      return;
    }

    [next[from], next[to]] = [
      next[to],
      next[from],
    ];

    setGallerySafe(next);
    setErrorMsg("");
  };

  /* =======================================================
     Metadata Changes
     ======================================================= */

  const handleFormChange = (
    field,
    value
  ) => {
    setForm((old) => ({
      ...old,
      [field]: value,
    }));

    setErrorMsg("");
    setSuccess(false);
  };

  const toggleOccasion = (id) => {
    setForm((old) => ({
      ...old,

      occasion_term_ids:
        old.occasion_term_ids.includes(id)
          ? old.occasion_term_ids.filter(
              (item) => item !== id
            )
          : [
              ...old.occasion_term_ids,
              id,
            ],
    }));

    setErrorMsg("");
  };

  const addTag = () => {
    const next = normalizeTag(tagInput);

    if (!next) {
      setTagInput("");
      return;
    }

    if (
      tags.length >= MAX_TAGS &&
      !tags.includes(next)
    ) {
      setErrorMsg(
        `You can add up to ${MAX_TAGS} tags.`
      );
      return;
    }

    setTags((old) =>
      uniqueTags([
        ...old,
        next,
      ])
    );

    setTagInput("");
    setErrorMsg("");
  };

  /* =======================================================
     Submit Creation
     ======================================================= */

  const submit = async (event) => {
    event.preventDefault();

    if (
      uploadInProgressRef.current ||
      success
    ) {
      return;
    }

    uploadInProgressRef.current = true;

    setLoading(true);
    setErrorMsg("");
    setUploadProgress(0);

    const controller =
      new AbortController();

    uploadControllerRef.current =
      controller;

    try {
      const files =
        galleryRef.current;

      if (files.length > MAX_IMAGES) {
        throw new Error(
          `Maximum ${MAX_IMAGES} images allowed.`
        );
      }

      for (const item of files) {
        await validateSignature(
          item.file
        );
      }

      /* -----------------------------------------------
         Optional Metadata
         ----------------------------------------------- */

      const title =
        cleanText(form.title);

      const description =
        cleanMultiline(form.description);

      if (
        title.length >
        MAX_TITLE_LENGTH
      ) {
        throw new Error(
          `Title must not exceed ${MAX_TITLE_LENGTH} characters.`
        );
      }

      if (
        description.length >
        MAX_DESCRIPTION_LENGTH
      ) {
        throw new Error(
          `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters.`
        );
      }

      if (
        !["public", "private"].includes(
          form.visibility
        )
      ) {
        throw new Error(
          "Choose Private or Public visibility."
        );
      }

      if (
        form.format &&
        !FORMAT_OPTIONS.some(
          (item) =>
            item.value === form.format
        )
      ) {
        throw new Error(
          "Invalid creative format."
        );
      }

      if (
        form.category_id &&
        (
          !isUuid(form.category_id) ||
          !categories.some(
            (category) =>
              category.id === form.category_id
          )
        )
      ) {
        throw new Error(
          "The selected creative category is no longer available."
        );
      }

      if (
        selectedTermIds.some(
          (id) => !isUuid(id)
        )
      ) {
        throw new Error(
          "Invalid Showcase discovery selection."
        );
      }

      const finalTags =
        uniqueTags([
          ...tags,
          tagInput,
        ]);

      if (
        new Blob([
          serializedCanvas,
        ]).size >
        MAX_CANVAS_STATE_BYTES
      ) {
        throw new Error(
          "The editable Studio data is too large to save safely."
        );
      }

      /* -----------------------------------------------
         FormData
         ----------------------------------------------- */

      const formData =
        new FormData();

      if (title) {
        formData.append(
          "title",
          title
        );
      }

      if (description) {
        formData.append(
          "description",
          description
        );
      }

      if (selectedStyle?.name) {
        formData.append(
          "style_category",
          selectedStyle.name
        );
      }

      if (form.format) {
        formData.append(
          "format",
          form.format
        );
      }

      if (form.category_id) {
        formData.append(
          "category_id",
          form.category_id
        );
      }

      if (
        selectedTermIds.length
      ) {
        formData.append(
          "showcase_term_ids",
          JSON.stringify(
            selectedTermIds
          )
        );
      }

      if (
        finalTags.length
      ) {
        formData.append(
          "tags",
          JSON.stringify(
            finalTags
          )
        );
      }

      if (
        serializedCanvas &&
        serializedCanvas !== "[]"
      ) {
        formData.append(
          "canvas_state",
          serializedCanvas
        );
      }

      /* -----------------------------------------------
         New Gallery Multipart Fields
         -----------------------------------------------
         Same field name for every image.
         One request = one creation.
         ----------------------------------------------- */

      files.forEach((item) => {
        formData.append(
          "preview",
          item.file,
          item.file.name
        );
      });

      if (files.length) {
        const coverIndex =
          files.findIndex(
            (item) =>
              item.id ===
              coverImage?.id
          );

        formData.append(
          "cover_image_index",
          String(
            Math.max(
              0,
              coverIndex
            )
          )
        );
      }

      /* -----------------------------------------------
         Visibility
         ----------------------------------------------- */

      formData.append(
        "visibility",
        form.visibility
      );

      /* -----------------------------------------------
         API Request
         ----------------------------------------------- */

      await API.post(
        UPLOAD_ENDPOINT,
        formData,
        {
          signal:
            controller.signal,

          onUploadProgress:
            (progress) => {
              const total =
                Number(
                  progress.total || 0
                );

              if (
                total > 0
              ) {
                setUploadProgress(
                  Math.min(
                    100,
                    Math.round(
                      Number(
                        progress.loaded || 0
                      ) /
                        total *
                        100
                    )
                  )
                );
              }
            },
        }
      );

      setTags(finalTags);
      setTagInput("");
      setUploadProgress(100);
      setSuccess(true);

      navigationTimerRef.current =
        window.setTimeout(
          () =>
            navigate(
              CREATOR_HUB_ROUTE,
              {
                replace: true,
              }
            ),
          1200
        );
    } catch (error) {
      if (!isCancelled(error)) {
        if (
          import.meta.env.DEV
        ) {
          console.error(
            "Creator Studio upload failed:",
            error
          );
        }

        setErrorMsg(
          errorMessage(
            error,
            "The Studio creation could not be saved."
          )
        );
      }

      setUploadProgress(0);
    } finally {
      uploadInProgressRef.current =
        false;

      if (
        uploadControllerRef.current ===
        controller
      ) {
        uploadControllerRef.current =
          null;
      }

      if (
        mountedRef.current
      ) {
        setLoading(false);
      }
    }
  };

  /* =======================================================
     Render
     ======================================================= */

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 pb-24 text-slate-950 dark:bg-[#030303] dark:text-white">
      {/* Ambient background */}

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -right-64 -top-64 h-[42rem] w-[42rem] rounded-full bg-[#D4AF37]/10 blur-[180px]" />

        <div className="absolute -bottom-64 -left-64 h-[36rem] w-[36rem] rounded-full bg-violet-500/[0.06] blur-[170px]" />
      </div>

      <main className="relative z-10 mx-auto max-w-[1100px] px-4 pt-9 sm:px-6 lg:px-10 lg:pt-12">
        {/* Header */}

        <section className="relative mb-7 overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-8 lg:p-10 dark:border-white/[0.06] dark:bg-[#090909]/90">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.24em] text-[#98751A] dark:text-[#D4AF37]">
                <Sparkles size={12} />
                Creator Studio
              </p>

              <h1 className="mt-4 font-serif text-4xl font-light tracking-tight sm:text-5xl">
                Save your{" "}
                <span className="italic text-[#A17D1C] dark:text-[#D4AF37]">
                  creative work
                </span>
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500 dark:text-white/40">
                Add up to six images to a single creation.
                Save it privately or share it in the
                Showcase. Creative details are optional.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate(CREATOR_HUB_ROUTE)
              }
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 text-[9px] font-black uppercase tracking-wider text-slate-500 transition hover:border-[#D4AF37] dark:border-white/10 dark:text-white/45"
            >
              <ArrowLeft size={13} />
              Creator Hub
            </button>
          </div>
        </section>

        {/* Information */}

        <section className="mb-7 flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-400/15 dark:bg-violet-500/[0.06]">
          <Layers3
            size={17}
            className="mt-0.5 shrink-0 text-violet-600 dark:text-violet-300"
          />

          <div>
            <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
              One creation, multiple images
            </p>

            <p className="mt-1 text-[10px] leading-5 text-violet-700/70 dark:text-violet-200/55">
              Choose several pictures at once or add them
              individually using the same artwork area.
              Select a cover and arrange the gallery
              before saving.
            </p>
          </div>
        </section>

        {/* Success */}

        {success && (
          <div
            role="status"
            className="mb-7 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/[0.08] dark:text-emerald-200"
          >
            <CheckCircle2 size={18} />

            <div>
              <p className="font-semibold">
                {form.visibility === "public"
                  ? "Creation published successfully."
                  : "Private creation saved successfully."}
              </p>

              <p className="mt-1 text-xs opacity-70">
                Returning to Creator Hub…
              </p>
            </div>
          </div>
        )}

        {/* Error */}

        {errorMsg && (
          <div
            role="alert"
            className="mb-7 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/[0.08] dark:text-rose-200"
          >
            <AlertCircle
              size={18}
              className="shrink-0"
            />

            <p>{errorMsg}</p>
          </div>
        )}

        {/* Form */}

        <form
          onSubmit={submit}
          className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/90 shadow-sm dark:border-white/[0.06] dark:bg-[#090909]"
        >
          {/* Gallery Upload Area */}

          <section className="border-b border-slate-200 p-6 sm:p-8 dark:border-white/[0.06]">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#98751A] dark:text-[#D4AF37]">
                  Creative Asset
                </p>

                <h2 className="mt-2 font-serif text-2xl">
                  Artwork preview
                </h2>
              </div>

              <span className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-[#98751A] dark:text-[#D4AF37]">
                {gallery.length}/{MAX_IMAGES} images

                {gallery.length > 0 && (
                  <CheckCircle2 size={12} />
                )}
              </span>
            </div>

            <input
              ref={pickerRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={
                loading ||
                success ||
                gallery.length >= MAX_IMAGES
              }
              className="hidden"
              aria-label="Choose up to six artwork images"
            />

            {!gallery.length ? (
              /* Empty Upload Area */

              <button
                type="button"
                onClick={openPicker}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                disabled={loading || success}
                className={`
                  flex min-h-[340px] w-full flex-col
                  items-center justify-center
                  rounded-[1.75rem] border-2 border-dashed
                  px-6 text-center transition

                  ${
                    dragActive
                      ? "border-[#D4AF37] bg-[#D4AF37]/10"
                      : "border-slate-200 bg-slate-50 hover:border-[#D4AF37]/40 dark:border-white/10 dark:bg-white/[0.02]"
                  }

                  disabled:opacity-50
                `}
              >
                <span className="grid h-16 w-16 place-items-center rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/10 text-[#98751A] dark:text-[#D4AF37]">
                  {dragActive ? (
                    <UploadCloud size={27} />
                  ) : (
                    <ImageIcon size={27} />
                  )}
                </span>

                <h3 className="mt-5 font-serif text-2xl">
                  {dragActive
                    ? "Drop your artwork"
                    : "Add artwork (optional)"}
                </h3>

                <p className="mt-3 max-w-md text-xs leading-6 text-slate-500 dark:text-white/35">
                  Choose several images together or add
                  one at a time. Drag and drop also works.
                  Artwork from Studio appears here
                  automatically.
                </p>

                <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[9px] font-black uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/35">
                  <FileImage size={12} />
                  JPG · PNG · WEBP · 5 MB each · Up to 6
                </span>
              </button>
            ) : (
              /* Gallery With Selected Images */

              <div
                className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-black dark:border-white/10"
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {/* Main Image Preview */}

                <div
                  className={`
                    relative flex min-h-[320px]
                    items-center justify-center
                    overflow-hidden

                    ${
                      dragActive
                        ? "ring-4 ring-inset ring-[#D4AF37]"
                        : ""
                    }
                  `}
                >
                  <img
                    key={activeImage?.id}
                    src={activeImage?.url}
                    alt="Selected Creator Studio artwork"
                    onLoad={(event) =>
                      setImageDimensions({
                        width:
                          event.currentTarget.naturalWidth,
                        height:
                          event.currentTarget.naturalHeight,
                      })
                    }
                    className="max-h-[620px] min-h-[320px] w-full object-contain"
                  />

                  <span className="absolute left-4 top-4 rounded-full bg-black/70 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-white">
                    {activeImage?.id === coverImage?.id
                      ? "Cover image"
                      : "Gallery preview"}
                  </span>

                  {!loading && !success && (
                    <div className="absolute right-4 top-4 flex flex-wrap justify-end gap-2">
                      {gallery.length < MAX_IMAGES && (
                        <button
                          type="button"
                          onClick={openPicker}
                          className={miniButtonClass}
                        >
                          <Plus size={13} />
                          Add More
                        </button>
                      )}

                      {activeImage?.id !== coverImage?.id && (
                        <button
                          type="button"
                          onClick={() =>
                            setCoverId(
                              activeImage.id
                            )
                          }
                          className={miniButtonClass}
                        >
                          <Star size={12} />
                          Set Cover
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={clearAllImages}
                        className={miniButtonClass}
                        aria-label="Remove all artwork images"
                      >
                        <Trash2 size={13} />
                        Clear All
                      </button>
                    </div>
                  )}
                </div>

                {/* Preview Metadata */}

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 bg-[#080808] px-5 py-3 text-[9px] text-white/45">
                  <span className="max-w-[18rem] truncate">
                    {activeImage?.file?.name ||
                      "Studio artwork"}
                  </span>

                  <span>
                    {(
                      Number(
                        activeImage?.file?.size || 0
                      ) /
                      1024 /
                      1024
                    ).toFixed(2)}{" "}
                    MB
                  </span>

                  {imageDimensions && (
                    <span>
                      {imageDimensions.width} ×{" "}
                      {imageDimensions.height}
                    </span>
                  )}

                  {strokeCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-violet-300">
                      <Layers3 size={11} />

                      {strokeCount} Studio strokes
                    </span>
                  )}
                </div>

                {/* Gallery Thumbnails */}

                <div className="grid grid-cols-2 gap-3 bg-[#0d0d0d] p-4 sm:grid-cols-3 lg:grid-cols-4">
                  {gallery.map(
                    (image, index) => (
                      <div
                        key={image.id}
                        className={`
                          overflow-hidden rounded-xl border

                          ${
                            image.id === activeImage?.id
                              ? "border-[#D4AF37]"
                              : "border-white/10"
                          }
                        `}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setActiveId(
                              image.id
                            )
                          }
                          className="relative block aspect-[4/3] w-full bg-black"
                          aria-label={`Preview image ${index + 1}`}
                        >
                          <img
                            src={image.url}
                            alt={`Artwork ${index + 1}`}
                            className="h-full w-full object-cover"
                          />

                          <span className="absolute left-2 top-2 rounded-md bg-black/75 px-2 py-1 text-[8px] text-white">
                            {index + 1}
                          </span>

                          {coverImage?.id === image.id && (
                            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-[#D4AF37] px-2 py-1 text-[8px] font-bold text-black">
                              <Star
                                size={10}
                                fill="currentColor"
                              />

                              Cover
                            </span>
                          )}
                        </button>

                        {/* Thumbnail Controls */}

                        <div className="flex items-center justify-between gap-1 bg-[#151515] px-2 py-2">
                          <button
                            type="button"
                            disabled={
                              loading ||
                              success ||
                              index === 0
                            }
                            onClick={() =>
                              moveImage(
                                image.id,
                                -1
                              )
                            }
                            aria-label={`Move image ${index + 1} earlier`}
                            className="rounded p-1 text-white/70 hover:text-[#D4AF37] disabled:opacity-25"
                          >
                            <ArrowUp size={13} />
                          </button>

                          <button
                            type="button"
                            disabled={
                              loading ||
                              success ||
                              index === gallery.length - 1
                            }
                            onClick={() =>
                              moveImage(
                                image.id,
                                1
                              )
                            }
                            aria-label={`Move image ${index + 1} later`}
                            className="rounded p-1 text-white/70 hover:text-[#D4AF37] disabled:opacity-25"
                          >
                            <ArrowDown size={13} />
                          </button>

                          {coverImage?.id !== image.id && (
                            <button
                              type="button"
                              disabled={loading || success}
                              onClick={() =>
                                setCoverId(
                                  image.id
                                )
                              }
                              title="Set as cover"
                              aria-label={`Set image ${index + 1} as cover`}
                              className="rounded p-1 text-white/70 hover:text-[#D4AF37]"
                            >
                              <Star size={13} />
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={loading || success}
                            onClick={() =>
                              removeImage(
                                image.id
                              )
                            }
                            title="Remove image"
                            aria-label={`Remove image ${index + 1}`}
                            className="rounded p-1 text-rose-300 hover:text-rose-100"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  )}

                  {/* Add More Slot */}

                  {gallery.length < MAX_IMAGES && (
                    <button
                      type="button"
                      onClick={openPicker}
                      disabled={loading || success}
                      className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 text-white/60 hover:border-[#D4AF37] hover:text-[#D4AF37] disabled:opacity-50"
                    >
                      <Plus size={19} />

                      <span className="text-[9px] font-black uppercase tracking-wider">
                        Add more
                      </span>
                    </button>
                  )}
                </div>

                <p className="bg-[#0d0d0d] px-4 pb-4 text-[10px] text-white/40">
                  Click a thumbnail to preview. Use the star
                  to choose a cover, and arrows to change
                  the sequence. All images save as one
                  creation.
                </p>
              </div>
            )}
          </section>

          {/* Creative Details */}

          <section className="p-6 sm:p-8">
            <div className="mb-7 border-b border-slate-200 pb-5 dark:border-white/[0.06]">
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#98751A] dark:text-[#D4AF37]">
                Creative Details
              </p>

              <h2 className="mt-2 font-serif text-2xl">
                Describe your concept
              </h2>
            </div>

            <div className="space-y-7">
              {/* Title */}

              <label className="block">
                <FieldLabel optional>
                  Design Title
                </FieldLabel>

                <input
                  type="text"
                  maxLength={MAX_TITLE_LENGTH}
                  value={form.title}
                  onChange={(event) =>
                    handleFormChange(
                      "title",
                      event.target.value
                    )
                  }
                  disabled={loading || success}
                  placeholder="e.g. Asymmetrical Silk Blazer"
                  className={textFieldClass}
                />
              </label>

              {/* Format */}

              <div>
                <FieldLabel optional>
                  Creative Format
                </FieldLabel>

                <SelectField
                  value={form.format}
                  disabled={loading || success}
                  onChange={(event) =>
                    handleFormChange(
                      "format",
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    Select a format (optional)
                  </option>

                  {FORMAT_OPTIONS.map(
                    (option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    )
                  )}
                </SelectField>
              </div>

              {/* Category */}

              <div>
                <FieldLabel optional>
                  Creative Category
                </FieldLabel>

                <SelectField
                  value={form.category_id}
                  disabled={
                    loading ||
                    success ||
                    categoriesLoading ||
                    !categories.length
                  }
                  onChange={(event) =>
                    handleFormChange(
                      "category_id",
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    {categoriesLoading
                      ? "Loading categories…"
                      : !categories.length
                        ? "No categories available"
                        : "Select a category (optional)"}
                  </option>

                  {categories.map(
                    (category) => (
                      <option
                        key={category.id}
                        value={category.id}
                      >
                        {category.name}
                      </option>
                    )
                  )}
                </SelectField>

                {categoriesError && (
                  <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-rose-500">
                    <span>
                      {categoriesError}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        void loadCategories()
                      }
                      className="inline-flex items-center gap-1 font-bold"
                    >
                      <RefreshCw size={11} />
                      Retry
                    </button>
                  </div>
                )}

                {selectedCategory?.description && (
                  <p className="mt-2 text-[10px] text-slate-400 dark:text-white/30">
                    {selectedCategory.description}
                  </p>
                )}
              </div>

              {/* Discovery */}

              <div className="rounded-[1.5rem] border border-[#D4AF37]/20 bg-[#D4AF37]/[0.035] p-5 sm:p-6">
                <div className="mb-5 flex items-start gap-3">
                  <Palette
                    size={18}
                    className="mt-1 text-[#A17D1C] dark:text-[#D4AF37]"
                  />

                  <div>
                    <h3 className="font-serif text-xl">
                      Showcase Discovery
                    </h3>

                    <p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-white/35">
                      Optional selections help people
                      find public creations.
                    </p>
                  </div>
                </div>

                {discoveryLoading ? (
                  <div className="inline-flex items-center gap-2 text-xs text-slate-400">
                    <Loader2
                      size={14}
                      className="animate-spin"
                    />

                    Loading discovery options…
                  </div>
                ) : discoveryError ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-[10px] text-rose-700 dark:border-rose-400/15 dark:bg-rose-400/[0.06] dark:text-rose-200">
                    <span>
                      {discoveryError}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        void loadDiscovery()
                      }
                      className="inline-flex items-center gap-1 font-bold"
                    >
                      <RefreshCw size={12} />
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Style and Garment */}

                    <div className="grid gap-5 md:grid-cols-2">
                      <div>
                        <FieldLabel optional>
                          Style
                        </FieldLabel>

                        <SelectField
                          value={
                            form.style_term_id
                          }
                          disabled={loading || success}
                          onChange={(event) =>
                            handleFormChange(
                              "style_term_id",
                              event.target.value
                            )
                          }
                        >
                          <option value="">
                            Select a style (optional)
                          </option>

                          {discovery.styles.map(
                            (style) => (
                              <option
                                key={style.id}
                                value={style.id}
                              >
                                {style.name}
                              </option>
                            )
                          )}
                        </SelectField>
                      </div>

                      <div>
                        <FieldLabel optional>
                          Garment
                        </FieldLabel>

                        <SelectField
                          value={
                            form.garment_term_id
                          }
                          disabled={loading || success}
                          onChange={(event) =>
                            handleFormChange(
                              "garment_term_id",
                              event.target.value
                            )
                          }
                        >
                          <option value="">
                            Select a garment (optional)
                          </option>

                          {discovery.garments.map(
                            (garment) => (
                              <option
                                key={garment.id}
                                value={garment.id}
                              >
                                {garment.emoji
                                  ? `${garment.emoji} `
                                  : ""}
                                {garment.name}
                              </option>
                            )
                          )}
                        </SelectField>
                      </div>
                    </div>

                    {/* Occasions */}

                    <div>
                      <FieldLabel optional>
                        Occasion
                      </FieldLabel>

                      <p className="mb-3 text-[10px] text-slate-400 dark:text-white/30">
                        Select any occasions this design
                        fits; multiple selections are allowed.
                      </p>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {discovery.occasions.map(
                          (occasion) => {
                            const chosen =
                              form.occasion_term_ids.includes(
                                occasion.id
                              );

                            return (
                              <button
                                type="button"
                                key={occasion.id}
                                onClick={() =>
                                  toggleOccasion(
                                    occasion.id
                                  )
                                }
                                disabled={loading || success}
                                aria-pressed={chosen}
                                className={`
                                  min-h-[76px]
                                  rounded-xl border
                                  p-3 text-left
                                  transition

                                  ${
                                    chosen
                                      ? "border-[#D4AF37]/60 bg-[#D4AF37]/10 text-[#8A6814] dark:text-[#E4C65D]"
                                      : "border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-white/[0.025] dark:text-white/40"
                                  }
                                `}
                              >
                                <div className="flex items-start justify-between">
                                  <span className="text-xl">
                                    {occasion.emoji || "✦"}
                                  </span>

                                  {chosen && (
                                    <Check size={16} />
                                  )}
                                </div>

                                <p className="mt-2 text-[9px] font-black uppercase tracking-wider">
                                  {occasion.name}
                                </p>
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>

                    {/* Selected Terms */}

                    {!!selectedTermIds.length && (
                      <div className="flex flex-wrap gap-2 border-t border-[#D4AF37]/15 pt-4">
                        {[
                          selectedStyle,
                          selectedGarment,
                          ...selectedOccasions,
                        ]
                          .filter(Boolean)
                          .map((term) => (
                            <span
                              key={term.id}
                              className="rounded-full bg-[#D4AF37]/10 px-3 py-1.5 text-[9px] font-bold text-[#8A6814] dark:text-[#D4AF37]"
                            >
                              {term.emoji
                                ? `${term.emoji} `
                                : ""}
                              {term.name}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tags */}

              <div>
                <FieldLabel optional>
                  Tags
                </FieldLabel>

                <div className="flex min-h-[52px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-[#D4AF37]/60 dark:border-white/10 dark:bg-[#111111]">
                  <Tag
                    size={14}
                    className="shrink-0 text-slate-400"
                  />

                  <input
                    value={tagInput}
                    type="text"
                    maxLength={MAX_TAG_LENGTH}
                    disabled={
                      loading ||
                      success ||
                      tags.length >= MAX_TAGS
                    }
                    onChange={(event) => {
                      setTagInput(
                        event.target.value
                      );

                      setErrorMsg("");
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" ||
                        event.key === ","
                      ) {
                        event.preventDefault();
                        addTag();
                      } else if (
                        event.key === "Backspace" &&
                        !tagInput &&
                        tags.length
                      ) {
                        setTags(
                          (old) =>
                            old.slice(
                              0,
                              -1
                            )
                        );
                      }
                    }}
                    placeholder="silk, layered, modern…"
                    className="h-12 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none dark:text-white"
                  />

                  <button
                    type="button"
                    onClick={addTag}
                    disabled={
                      loading ||
                      success ||
                      !normalizeTag(tagInput)
                    }
                    aria-label="Add tag"
                    className="rounded-lg bg-slate-200 p-2 text-slate-600 disabled:opacity-40 dark:bg-white/10 dark:text-white"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                <div className="mt-2 flex justify-between text-[9px] text-slate-400">
                  <span>
                    Press Enter or comma to add
                  </span>

                  <span>
                    {tags.length}/{MAX_TAGS}
                  </span>
                </div>

                {tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/50"
                      >
                        #{tag}

                        <button
                          type="button"
                          onClick={() =>
                            setTags(
                              (old) =>
                                old.filter(
                                  (item) => item !== tag
                                )
                            )
                          }
                          disabled={loading || success}
                          aria-label={`Remove ${tag} tag`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Description */}

              <label className="block">
                <FieldLabel optional>
                  Description
                </FieldLabel>

                <textarea
                  rows={7}
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  value={form.description}
                  onChange={(event) =>
                    handleFormChange(
                      "description",
                      event.target.value
                    )
                  }
                  disabled={loading || success}
                  placeholder="Describe the silhouette, materials, inspiration, mood, construction ideas, or visual direction…"
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#111111] dark:text-white dark:placeholder:text-white/25"
                />

                <p className="mt-2 text-right text-[9px] text-slate-400">
                  {form.description.length}/
                  {MAX_DESCRIPTION_LENGTH}
                </p>
              </label>

              {/* Visibility */}

              <div>
                <FieldLabel>
                  Visibility
                </FieldLabel>

                <p className="mb-3 text-[10px] leading-5 text-slate-500 dark:text-white/35">
                  Private is the default. You can change
                  visibility later from your Creator profile.
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  {VISIBILITY_OPTIONS.map(
                    ({
                      value,
                      label,
                      description,
                      Icon,
                    }) => {
                      const chosen =
                        form.visibility === value;

                      return (
                        <button
                          type="button"
                          key={value}
                          onClick={() =>
                            handleFormChange(
                              "visibility",
                              value
                            )
                          }
                          disabled={loading || success}
                          aria-pressed={chosen}
                          className={`
                            rounded-2xl border
                            p-5 text-left
                            transition

                            ${
                              chosen
                                ? "border-[#D4AF37]/60 bg-[#D4AF37]/10"
                                : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.025]"
                            }
                          `}
                        >
                          <div className="flex justify-between">
                            <span className="grid h-11 w-11 place-items-center rounded-xl border border-[#D4AF37]/20 text-[#98751A] dark:text-[#D4AF37]">
                              <Icon size={18} />
                            </span>

                            {chosen && (
                              <span className="grid h-6 w-6 place-items-center rounded-full bg-[#D4AF37] text-black">
                                <Check size={13} />
                              </span>
                            )}
                          </div>

                          <p className="mt-4 text-sm font-bold">
                            {label}
                          </p>

                          <p className="mt-1.5 text-[10px] leading-5 text-slate-500 dark:text-white/35">
                            {description}
                          </p>
                        </button>
                      );
                    }
                  )}
                </div>

                <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[10px] leading-5 text-slate-500 dark:border-white/10 dark:bg-white/[0.025] dark:text-white/40">
                  {form.visibility === "public" ? (
                    <Globe2
                      size={14}
                      className="mt-0.5 shrink-0"
                    />
                  ) : (
                    <Lock
                      size={14}
                      className="mt-0.5 shrink-0"
                    />
                  )}

                  {form.visibility === "public"
                    ? "Public creations can appear in Showcase discovery."
                    : "Private creations remain hidden from the public Showcase. Files uploaded to public Cloudinary storage may still be accessible through their direct URLs."}
                </div>
              </div>
            </div>
          </section>

          {/* Footer */}

          <footer className="border-t border-slate-200 bg-slate-50/70 p-5 sm:p-6 dark:border-white/[0.06] dark:bg-white/[0.015]">
            {loading && (
              <div className="mb-5">
                <div className="mb-2 flex justify-between text-[9px] font-bold uppercase text-slate-400">
                  <span>
                    Saving Creator Studio creation
                  </span>

                  <span>
                    {uploadProgress}%
                  </span>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#A98520] to-[#D4AF37] transition-all"
                    style={{
                      width: `${uploadProgress}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <p className="inline-flex items-start gap-2 text-[10px] leading-5 text-slate-400 dark:text-white/30">
                <Layers3
                  size={13}
                  className="mt-0.5 shrink-0"
                />

                <span>
                  {strokeCount
                    ? `${strokeCount} Studio stroke${strokeCount === 1 ? "" : "s"} will be stored.`
                    : "No editable Studio vector state is attached."}{" "}

                  {gallery.length
                    ? `${gallery.length} image${gallery.length === 1 ? "" : "s"} will be saved together.`
                    : "Artwork is optional."}
                </span>
              </p>

              <button
                type="submit"
                disabled={loading || success}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-7 text-[9px] font-black uppercase tracking-[0.18em] text-black shadow-[0_14px_35px_rgba(212,175,55,0.2)] transition hover:bg-[#E4C65D] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2
                      size={14}
                      className="animate-spin"
                    />
                    Saving
                  </>
                ) : success ? (
                  <>
                    <CheckCircle2 size={14} />
                    Saved
                  </>
                ) : form.visibility === "public" ? (
                  <>
                    <Globe2 size={14} />
                    Publish to Showcase
                  </>
                ) : (
                  <>
                    <Lock size={14} />
                    Save Private Asset
                  </>
                )}
              </button>
            </div>
          </footer>
        </form>
      </main>
    </div>
  );
}
