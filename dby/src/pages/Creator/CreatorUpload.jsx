"use strict";

/*
=========================================================
DesignByYou
Creator Studio
Version 6.0
=========================================================

PURPOSE
---------------------------------------------------------

Creator Studio lets a Creator save creative/reference work
and publish it into the DesignByYou Showcase.

This page is NOT:

- ecommerce
- a marketplace
- a store
- checkout
- design purchasing
- licensing

=========================================================
CREATIVE ASSET
=========================================================

A Creator Studio asset may contain:

- preview image
- title
- description
- creative format
- database category
- Showcase style
- Showcase garment
- Showcase occasions
- tags
- editable/vector canvas state

=========================================================
DATABASE CATEGORY
=========================================================

GET
/api/v1/creators/studio/categories

Returns:

design_categories

The selected UUID is submitted as:

category_id

and stored in:

designs.category_id

=========================================================
SHOWCASE DISCOVERY
=========================================================

GET
/api/v1/creator-showcase/discovery

Returns:

styles
garments
occasions
trending

The Creator selects:

1 Style
1 Garment
0+ Occasions

Selected term UUIDs are submitted as:

showcase_term_ids

The backend will validate and store them through:

design_showcase_terms

=========================================================
LEGACY STYLE COMPATIBILITY
=========================================================

designs still contains:

style_category

For compatibility, this frontend also sends the selected
database Style name as:

style_category

Example:

Style UUID:
51842132-...

Style name:
Minimalist

style_category:
Minimalist

=========================================================
UPLOAD
=========================================================

POST
/api/v1/creators/studio/upload

Multipart fields:

preview
title
description
style_category
format
category_id
showcase_term_ids
tags
canvas_state

=========================================================
IMPORTANT
=========================================================

This frontend deliberately does NOT send:

price
base_price
license_type
sku
checkout data
commercial rights
marketplace sale data

=========================================================
STUDIO BRIDGE
=========================================================

Store:

useSketchStore

Fields:

pendingStudioImage
setPendingStudioImage
strokes
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
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  FileImage,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Tag,
  UploadCloud,
  X,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import API from "../../api/axios";

import { useSketchStore } from "../sketches/useSketchStore";

/*=========================================================
Configuration
=========================================================*/

const UPLOAD_ENDPOINT = "/creators/studio/upload";

const CATEGORIES_ENDPOINT = "/creators/studio/categories";

const DISCOVERY_ENDPOINT = "/creator-showcase/discovery";

const CREATOR_HUB_ROUTE = "/creator/showcase";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const MAX_TITLE_LENGTH = 120;

const MAX_DESCRIPTION_LENGTH = 3000;

const MAX_TAG_LENGTH = 30;

const MAX_TAGS = 12;

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/*=========================================================
Creative Formats
=========================================================*/

const FORMAT_OPTIONS = [
  {
    value: "sketch",
    label: "Fashion Sketch",
  },

  {
    value: "3d_garment",
    label: "3D Garment",
  },

  {
    value: "tech_pack",
    label: "Technical Design",
  },
];

/*=========================================================
Initial Form
=========================================================*/

const INITIAL_FORM_STATE = {
  title: "",

  description: "",

  format: "sketch",

  category_id: "",

  style_term_id: "",

  garment_term_id: "",

  occasion_term_ids: [],
};

/*=========================================================
Helpers
=========================================================*/

function cleanText(value, fallback = "") {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function isCancelledRequest(error) {
  return (
    error?.code === "ERR_CANCELED" ||
    error?.name === "CanceledError" ||
    error?.name === "AbortError"
  );
}

function getErrorMessage(error, fallback) {
  if (isCancelledRequest(error)) {
    return "";
  }

  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
}

/*=========================================================
Category Normalization
=========================================================*/

function normalizeCategoriesResponse(response) {
  const raw = Array.isArray(response?.data?.data)
    ? response.data.data
    : Array.isArray(response?.data?.categories)
      ? response.data.categories
      : [];

  const result = [];

  const seen = new Set();

  for (const item of raw) {
    const id = cleanText(item?.id);

    const name = cleanText(item?.name);

    if (!id || !name || seen.has(id)) {
      continue;
    }

    seen.add(id);

    result.push({
      id,

      name,

      slug: cleanText(item?.slug) || null,

      description: cleanText(item?.description) || null,

      sort_order: Number.isFinite(Number(item?.sort_order))
        ? Number(item.sort_order)
        : 0,
    });
  }

  return result;
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

  if (!id || !name) {
    return null;
  }

  return {
    id,

    name,

    slug: cleanText(item.slug) || null,

    search_term: cleanText(item.search_term, name),

    emoji: cleanText(item.emoji) || null,

    description: cleanText(item.description) || null,

    sort_order: Number.isFinite(Number(item.sort_order))
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
  };
}

/*=========================================================
Tags
=========================================================*/

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
  const result = [];

  const seen = new Set();

  for (const value of values) {
    const tag = normalizeTag(value);

    if (!tag || seen.has(tag)) {
      continue;
    }

    seen.add(tag);

    result.push(tag);

    if (result.length >= MAX_TAGS) {
      break;
    }
  }

  return result;
}

/*=========================================================
Image Validation
=========================================================*/

function validateImageFile(file) {
  if (!file) {
    throw new Error("Select an image before continuing.");
  }

  if (!(file instanceof Blob)) {
    throw new Error("The selected artwork is not a valid image.");
  }

  const mimeType = String(file.type || "").toLowerCase();

  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new Error("Only JPG, PNG, and WEBP images are supported.");
  }

  if (Number(file.size || 0) <= 0) {
    throw new Error("The selected image is empty.");
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("The image must be 5 MB or smaller.");
  }

  return true;
}

/*=========================================================
Studio Image Conversion
=========================================================*/

async function convertStudioImageToFile(source) {
  if (!source) {
    throw new Error("The Studio did not provide an image.");
  }

  /*-------------------------------------------------------
  File
  -------------------------------------------------------*/

  if (source instanceof File) {
    validateImageFile(source);

    return source;
  }

  /*-------------------------------------------------------
  Blob
  -------------------------------------------------------*/

  if (source instanceof Blob) {
    const mimeType = source.type || "image/png";

    const extension =
      mimeType === "image/webp"
        ? "webp"
        : mimeType === "image/jpeg"
          ? "jpg"
          : "png";

    const file = new File(
      [source],

      `creator-studio-${Date.now()}.${extension}`,

      {
        type: mimeType,
      },
    );

    validateImageFile(file);

    return file;
  }

  /*-------------------------------------------------------
  Wrapper
  -------------------------------------------------------*/

  if (typeof source === "object") {
    const nestedSource =
      source.file ||
      source.blob ||
      source.dataUrl ||
      source.data_url ||
      source.url ||
      source.src ||
      source.image ||
      null;

    if (nestedSource && nestedSource !== source) {
      return convertStudioImageToFile(nestedSource);
    }
  }

  /*-------------------------------------------------------
  URL / Data URL
  -------------------------------------------------------*/

  if (typeof source === "string") {
    const url = source.trim();

    if (!url) {
      throw new Error("The Studio image is empty.");
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("The Studio image could not be loaded.");
    }

    const blob = await response.blob();

    return convertStudioImageToFile(blob);
  }

  throw new Error("The Studio image format is unsupported.");
}

/*=========================================================
Field Label
=========================================================*/

function FieldLabel({ children, optional = false }) {
  return (
    <span
      className="
        mb-2.5
        flex
        items-center
        justify-between
        gap-3
        text-[9px]
        font-black
        uppercase
        tracking-[0.17em]
        text-slate-500

        dark:text-white/40
      "
    >
      <span>{children}</span>

      {optional && (
        <span
          className="
            text-[7px]
            font-medium
            tracking-[0.12em]
            text-slate-300

            dark:text-white/20
          "
        >
          Optional
        </span>
      )}
    </span>
  );
}

/*=========================================================
Select Field
=========================================================*/

function SelectField({ value, onChange, disabled, children }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="
          h-[52px]
          w-full
          appearance-none
          rounded-xl
          border
          border-slate-200
          bg-slate-50
          px-4
          pr-11
          text-sm
          font-medium
          text-slate-800
          outline-none
          transition

          focus:border-[#D4AF37]/60
          focus:bg-white
          focus:ring-4
          focus:ring-[#D4AF37]/10

          disabled:cursor-not-allowed
          disabled:opacity-60

          dark:border-white/10
          dark:bg-white/[0.035]
          dark:text-white
          dark:focus:bg-white/[0.05]
        "
      >
        {children}
      </select>

      <ChevronDown
        size={15}
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          right-4
          top-1/2
          -translate-y-1/2
          text-slate-400

          dark:text-white/25
        "
      />
    </div>
  );
}

/*=========================================================
Creator Studio
=========================================================*/

export default function CreatorUpload() {
  const navigate = useNavigate();

  /*=======================================================
  Sketch Store
  =======================================================*/

  const pendingStudioImage = useSketchStore(
    (state) => state.pendingStudioImage,
  );

  const setPendingStudioImage = useSketchStore(
    (state) => state.setPendingStudioImage,
  );

  const strokes = useSketchStore((state) => state.strokes);

  /*=======================================================
  Form
  =======================================================*/

  const [form, setForm] = useState(INITIAL_FORM_STATE);

  const [tags, setTags] = useState([]);

  const [tagInput, setTagInput] = useState("");

  /*=======================================================
  Categories
  =======================================================*/

  const [categories, setCategories] = useState([]);

  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const [categoriesError, setCategoriesError] = useState("");

  /*=======================================================
  Showcase Discovery
  =======================================================*/

  const [discovery, setDiscovery] = useState({
    styles: [],
    garments: [],
    occasions: [],
  });

  const [discoveryLoading, setDiscoveryLoading] = useState(true);

  const [discoveryError, setDiscoveryError] = useState("");

  /*=======================================================
  Artwork
  =======================================================*/

  const [displayImage, setDisplayImage] = useState(null);

  const [imageSource, setImageSource] = useState("");

  const [previewUrl, setPreviewUrl] = useState("");

  const [imageDimensions, setImageDimensions] = useState(null);

  const [dragActive, setDragActive] = useState(false);

  /*=======================================================
  Request
  =======================================================*/

  const [loading, setLoading] = useState(false);

  const [uploadProgress, setUploadProgress] = useState(0);

  const [success, setSuccess] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");

  /*=======================================================
  Refs
  =======================================================*/

  const imageInputRef = useRef(null);

  const dragDepthRef = useRef(0);

  const uploadControllerRef = useRef(null);

  const categoriesControllerRef = useRef(null);

  const discoveryControllerRef = useRef(null);

  const navigationTimerRef = useRef(null);

  /*=======================================================
  Selected Database Category
  =======================================================*/

  const selectedCategory = useMemo(() => {
    if (!form.category_id) {
      return null;
    }

    return (
      categories.find((category) => category.id === form.category_id) || null
    );
  }, [categories, form.category_id]);

  /*=======================================================
  Selected Showcase Style
  =======================================================*/

  const selectedStyle = useMemo(() => {
    if (!form.style_term_id) {
      return null;
    }

    return (
      discovery.styles.find((style) => style.id === form.style_term_id) || null
    );
  }, [discovery.styles, form.style_term_id]);

  /*=======================================================
  Selected Garment
  =======================================================*/

  const selectedGarment = useMemo(() => {
    if (!form.garment_term_id) {
      return null;
    }

    return (
      discovery.garments.find(
        (garment) => garment.id === form.garment_term_id,
      ) || null
    );
  }, [discovery.garments, form.garment_term_id]);

  /*=======================================================
  Selected Occasions
  =======================================================*/

  const selectedOccasions = useMemo(() => {
    const selectedIds = new Set(
      Array.isArray(form.occasion_term_ids) ? form.occasion_term_ids : [],
    );

    return discovery.occasions.filter((occasion) =>
      selectedIds.has(occasion.id),
    );
  }, [discovery.occasions, form.occasion_term_ids]);

  /*=======================================================
  Selected Showcase Term IDs
  =======================================================*/

  const selectedShowcaseTermIds = useMemo(() => {
    const result = [];

    if (selectedStyle?.id) {
      result.push(selectedStyle.id);
    }

    if (selectedGarment?.id) {
      result.push(selectedGarment.id);
    }

    for (const occasion of selectedOccasions) {
      if (occasion?.id) {
        result.push(occasion.id);
      }
    }

    return Array.from(new Set(result));
  }, [selectedStyle, selectedGarment, selectedOccasions]);

  /*=======================================================
  Load Categories
  =======================================================*/

  const loadCategories = useCallback(async () => {
    categoriesControllerRef.current?.abort();

    const controller = new AbortController();

    categoriesControllerRef.current = controller;

    setCategoriesLoading(true);

    setCategoriesError("");

    try {
      const response = await API.get(CATEGORIES_ENDPOINT, {
        signal: controller.signal,
      });

      const loadedCategories = normalizeCategoriesResponse(response);

      setCategories(loadedCategories);

      setForm((current) => {
        if (
          current.category_id &&
          loadedCategories.some(
            (category) => category.id === current.category_id,
          )
        ) {
          return current;
        }

        return {
          ...current,

          category_id: "",
        };
      });

      if (loadedCategories.length === 0) {
        setCategoriesError(
          "No active creative categories are currently available.",
        );
      }
    } catch (error) {
      if (isCancelledRequest(error)) {
        return;
      }

      if (import.meta.env.DEV) {
        console.error("Creator Studio categories failed to load:", error);
      }

      setCategories([]);

      setForm((current) => ({
        ...current,

        category_id: "",
      }));

      setCategoriesError(
        getErrorMessage(error, "Creative categories could not be loaded."),
      );
    } finally {
      if (categoriesControllerRef.current === controller) {
        categoriesControllerRef.current = null;

        setCategoriesLoading(false);
      }
    }
  }, []);

  /*=======================================================
  Load Showcase Discovery
  =======================================================*/

  const loadDiscovery = useCallback(async () => {
    discoveryControllerRef.current?.abort();

    const controller = new AbortController();

    discoveryControllerRef.current = controller;

    setDiscoveryLoading(true);

    setDiscoveryError("");

    try {
      const response = await API.get(DISCOVERY_ENDPOINT, {
        signal: controller.signal,
      });

      const loaded = normalizeDiscoveryResponse(response);

      setDiscovery(loaded);

      /*
        Clear selections that have disappeared or been
        disabled by Admin.
        */

      setForm((current) => {
        const styleStillExists = loaded.styles.some(
          (term) => term.id === current.style_term_id,
        );

        const garmentStillExists = loaded.garments.some(
          (term) => term.id === current.garment_term_id,
        );

        const validOccasionIds = new Set(
          loaded.occasions.map((term) => term.id),
        );

        const occasionIds = Array.isArray(current.occasion_term_ids)
          ? current.occasion_term_ids.filter((id) => validOccasionIds.has(id))
          : [];

        return {
          ...current,

          style_term_id: styleStillExists ? current.style_term_id : "",

          garment_term_id: garmentStillExists ? current.garment_term_id : "",

          occasion_term_ids: occasionIds,
        };
      });

      if (loaded.styles.length === 0 || loaded.garments.length === 0) {
        setDiscoveryError("Showcase discovery options are incomplete.");
      }
    } catch (error) {
      if (isCancelledRequest(error)) {
        return;
      }

      if (import.meta.env.DEV) {
        console.error("Creator Studio discovery failed to load:", error);
      }

      setDiscovery({
        styles: [],
        garments: [],
        occasions: [],
      });

      setForm((current) => ({
        ...current,

        style_term_id: "",

        garment_term_id: "",

        occasion_term_ids: [],
      }));

      setDiscoveryError(
        getErrorMessage(
          error,
          "Showcase discovery options could not be loaded.",
        ),
      );
    } finally {
      if (discoveryControllerRef.current === controller) {
        discoveryControllerRef.current = null;

        setDiscoveryLoading(false);
      }
    }
  }, []);

  /*=======================================================
  Initial Metadata Load
  =======================================================*/

  useEffect(() => {
    void loadCategories();

    void loadDiscovery();

    return () => {
      categoriesControllerRef.current?.abort();

      discoveryControllerRef.current?.abort();
    };
  }, [loadCategories, loadDiscovery]);

  /*=======================================================
  General Cleanup
  =======================================================*/

  useEffect(() => {
    return () => {
      uploadControllerRef.current?.abort();

      if (navigationTimerRef.current) {
        window.clearTimeout(navigationTimerRef.current);
      }
    };
  }, []);

  /*=======================================================
  Studio Artwork Bridge
  =======================================================*/

  useEffect(() => {
    if (!pendingStudioImage) {
      return undefined;
    }

    let cancelled = false;

    const prepareImage = async () => {
      try {
        setErrorMsg("");

        const file = await convertStudioImageToFile(pendingStudioImage);

        if (cancelled) {
          return;
        }

        setDisplayImage(file);

        setImageSource("studio");

        setUploadProgress(0);

        setSuccess(false);
      } catch (error) {
        if (!cancelled) {
          setErrorMsg(
            error?.message || "The Studio image could not be prepared.",
          );
        }
      } finally {
        if (!cancelled && typeof setPendingStudioImage === "function") {
          setPendingStudioImage(null);
        }
      }
    };

    void prepareImage();

    return () => {
      cancelled = true;
    };
  }, [pendingStudioImage, setPendingStudioImage]);

  /*=======================================================
  Preview URL
  =======================================================*/

  useEffect(() => {
    if (!displayImage) {
      setPreviewUrl("");

      setImageDimensions(null);

      return undefined;
    }

    const objectUrl = URL.createObjectURL(displayImage);

    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [displayImage]);

  /*=======================================================
  Form Changes
  =======================================================*/

  const handleInputChange = useCallback((field, value) => {
    setForm((current) => ({
      ...current,

      [field]: value,
    }));

    setSuccess(false);

    setErrorMsg("");
  }, []);

  /*=======================================================
  Occasion Toggle
  =======================================================*/

  const toggleOccasion = useCallback((occasionId) => {
    if (!occasionId) {
      return;
    }

    setForm((current) => {
      const currentIds = Array.isArray(current.occasion_term_ids)
        ? current.occasion_term_ids
        : [];

      const exists = currentIds.includes(occasionId);

      return {
        ...current,

        occasion_term_ids: exists
          ? currentIds.filter((id) => id !== occasionId)
          : [...currentIds, occasionId],
      };
    });

    setErrorMsg("");

    setSuccess(false);
  }, []);

  /*=======================================================
  Tags
  =======================================================*/

  const addCurrentTag = useCallback(() => {
    const tag = normalizeTag(tagInput);

    if (!tag) {
      setTagInput("");

      return;
    }

    if (tags.includes(tag)) {
      setTagInput("");

      return;
    }

    if (tags.length >= MAX_TAGS) {
      setErrorMsg(`You can add up to ${MAX_TAGS} tags.`);

      return;
    }

    setTags((current) => uniqueTags([...current, tag]));

    setTagInput("");

    setErrorMsg("");
  }, [tagInput, tags]);

  const handleTagKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();

        addCurrentTag();

        return;
      }

      if (event.key === "Backspace" && !tagInput && tags.length > 0) {
        setTags((current) => current.slice(0, -1));
      }
    },
    [addCurrentTag, tagInput, tags.length],
  );

  const removeTag = useCallback((tag) => {
    setTags((current) => current.filter((item) => item !== tag));
  }, []);

  /*=======================================================
  Artwork
  =======================================================*/

  const applySelectedImage = useCallback((file, source = "upload") => {
    validateImageFile(file);

    setDisplayImage(file);

    setImageSource(source);

    setUploadProgress(0);

    setSuccess(false);

    setErrorMsg("");
  }, []);

  const handleFileChange = useCallback(
    (event) => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      try {
        applySelectedImage(file, "upload");
      } catch (error) {
        setErrorMsg(error?.message || "The selected image could not be used.");

        event.target.value = "";
      }
    },
    [applySelectedImage],
  );

  const openFilePicker = useCallback(() => {
    if (loading || success) {
      return;
    }

    if (imageInputRef.current) {
      imageInputRef.current.value = "";

      imageInputRef.current.click();
    }
  }, [loading, success]);

  /*=======================================================
  Drag / Drop
  =======================================================*/

  const handleDragEnter = useCallback(
    (event) => {
      event.preventDefault();

      event.stopPropagation();

      if (loading || success) {
        return;
      }

      dragDepthRef.current += 1;

      setDragActive(true);
    },
    [loading, success],
  );

  const handleDragOver = useCallback((event) => {
    event.preventDefault();

    event.stopPropagation();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDragLeave = useCallback((event) => {
    event.preventDefault();

    event.stopPropagation();

    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();

      event.stopPropagation();

      dragDepthRef.current = 0;

      setDragActive(false);

      if (loading || success) {
        return;
      }

      const files = Array.from(event.dataTransfer?.files || []);

      if (files.length === 0) {
        return;
      }

      if (files.length > 1) {
        setErrorMsg("Please add one image at a time.");

        return;
      }

      try {
        applySelectedImage(files[0], "upload");
      } catch (error) {
        setErrorMsg(error?.message || "The dropped image could not be used.");
      }
    },
    [applySelectedImage, loading, success],
  );

  /*=======================================================
  Remove Artwork
  =======================================================*/

  const clearFileSlot = useCallback(() => {
    if (loading || success) {
      return;
    }

    setDisplayImage(null);

    setImageSource("");

    setImageDimensions(null);

    setUploadProgress(0);

    setErrorMsg("");

    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  }, [loading, success]);

  /*=======================================================
  Dimensions
  =======================================================*/

  const handlePreviewLoad = useCallback((event) => {
    const image = event.currentTarget;

    setImageDimensions({
      width: image.naturalWidth,

      height: image.naturalHeight,
    });
  }, []);

  /*=======================================================
  Canvas State
  =======================================================*/

  const serializedCanvasState = useMemo(() => {
    try {
      return JSON.stringify(Array.isArray(strokes) ? strokes : strokes || []);
    } catch {
      return "[]";
    }
  }, [strokes]);

  const strokeCount = Array.isArray(strokes) ? strokes.length : 0;

  /*=======================================================
  Metadata Ready
  =======================================================*/

  const metadataLoading = categoriesLoading || discoveryLoading;

  const metadataUnavailable =
    categories.length === 0 ||
    discovery.styles.length === 0 ||
    discovery.garments.length === 0;

  /*=======================================================
  Submit
  =======================================================*/

  const handleUploadSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (loading || success) {
        return;
      }

      setErrorMsg("");

      /*-------------------------------------------------
        Artwork
        -------------------------------------------------*/

      if (!displayImage) {
        setErrorMsg("Add artwork before saving this Studio asset.");

        return;
      }

      try {
        validateImageFile(displayImage);
      } catch (error) {
        setErrorMsg(error.message);

        return;
      }

      /*-------------------------------------------------
        Title
        -------------------------------------------------*/

      const title = cleanText(form.title);

      if (title.length < 2) {
        setErrorMsg("Title must contain at least 2 characters.");

        return;
      }

      if (title.length > MAX_TITLE_LENGTH) {
        setErrorMsg(`Title must not exceed ${MAX_TITLE_LENGTH} characters.`);

        return;
      }

      /*-------------------------------------------------
        Description
        -------------------------------------------------*/

      const description = String(form.description || "").trim();

      if (description.length < 10) {
        setErrorMsg("Description must contain at least 10 characters.");

        return;
      }

      if (description.length > MAX_DESCRIPTION_LENGTH) {
        setErrorMsg(
          `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters.`,
        );

        return;
      }

      /*-------------------------------------------------
        Categories
        -------------------------------------------------*/

      if (categoriesLoading) {
        setErrorMsg("Creative categories are still loading.");

        return;
      }

      if (categoriesError || categories.length === 0) {
        setErrorMsg("Creative categories are currently unavailable.");

        return;
      }

      const categoryId = cleanText(form.category_id);

      if (!categoryId) {
        setErrorMsg("Select a creative category.");

        return;
      }

      if (!categories.some((category) => category.id === categoryId)) {
        setErrorMsg("The selected creative category is no longer available.");

        return;
      }

      /*-------------------------------------------------
        Discovery
        -------------------------------------------------*/

      if (discoveryLoading) {
        setErrorMsg("Showcase discovery options are still loading.");

        return;
      }

      if (
        discoveryError ||
        discovery.styles.length === 0 ||
        discovery.garments.length === 0
      ) {
        setErrorMsg("Showcase discovery options are currently unavailable.");

        return;
      }

      if (!selectedStyle) {
        setErrorMsg("Select a Showcase style.");

        return;
      }

      if (!selectedGarment) {
        setErrorMsg("Select a garment type.");

        return;
      }

      /*
        Occasion is optional because some concepts are not
        tied to a specific event or use case.
        */

      if (selectedShowcaseTermIds.length < 2) {
        setErrorMsg("Select a Showcase style and garment type.");

        return;
      }

      /*-------------------------------------------------
        Tags
        -------------------------------------------------*/

      const finalTags = uniqueTags([...tags, tagInput]);

      /*-------------------------------------------------
        Multipart
        -------------------------------------------------*/

      const formData = new FormData();

      formData.append("title", title);

      formData.append("description", description);

      /*
        Existing designs.style_category compatibility.

        The value now comes from the database-managed
        Showcase Style.
        */

      formData.append("style_category", selectedStyle.name);

      formData.append("format", form.format);

      formData.append("category_id", categoryId);

      /*
        NEW:

        Backend validates these UUIDs and inserts them into:

        design_showcase_terms
        */

      formData.append(
        "showcase_term_ids",
        JSON.stringify(selectedShowcaseTermIds),
      );

      formData.append("tags", JSON.stringify(finalTags));

      formData.append("canvas_state", serializedCanvasState);

      formData.append("preview", displayImage);

      /*-------------------------------------------------
        Request
        -------------------------------------------------*/

      const controller = new AbortController();

      uploadControllerRef.current = controller;

      setLoading(true);

      setUploadProgress(0);

      const requestEndpoint = UPLOAD_ENDPOINT;

      try {
        await API.post(
          requestEndpoint,

          formData,

          {
            signal: controller.signal,

            onUploadProgress: (progressEvent) => {
              const total = Number(progressEvent.total || 0);

              const loaded = Number(progressEvent.loaded || 0);

              if (total <= 0) {
                return;
              }

              const percentage = Math.min(
                100,

                Math.round((loaded / total) * 100),
              );

              setUploadProgress(percentage);
            },
          },
        );

        setTags(finalTags);

        setTagInput("");

        setUploadProgress(100);

        setSuccess(true);

        navigationTimerRef.current = window.setTimeout(
          () => {
            navigate(
              CREATOR_HUB_ROUTE,

              {
                replace: true,
              },
            );
          },

          1200,
        );
      } catch (error) {
        if (isCancelledRequest(error)) {
          return;
        }

        if (import.meta.env.DEV) {
          console.error("Creator Studio asset save failed:", error);
        }

        setUploadProgress(0);

        setErrorMsg(
          getErrorMessage(
            error,
            "The Studio asset could not be saved. Please try again.",
          ),
        );
      } finally {
        if (uploadControllerRef.current === controller) {
          uploadControllerRef.current = null;
        }

        setLoading(false);
      }
    },
    [
      categories,
      categoriesError,
      categoriesLoading,
      discovery.styles.length,
      discovery.garments.length,
      discoveryError,
      discoveryLoading,
      displayImage,
      form,
      loading,
      navigate,
      selectedGarment,
      selectedShowcaseTermIds,
      selectedStyle,
      serializedCanvasState,
      success,
      tagInput,
      tags,
    ],
  );

  /*=======================================================
  Render
  =======================================================*/

  return (
    <div
      className="
        relative
        min-h-screen
        overflow-hidden
        bg-slate-50
        pb-24
        text-slate-950

        dark:bg-[#030303]
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
          z-0
          overflow-hidden
        "
      >
        <div
          className="
            absolute
            -right-64
            -top-64
            h-[42rem]
            w-[42rem]
            rounded-full
            bg-[#D4AF37]/10
            blur-[180px]
          "
        />

        <div
          className="
            absolute
            -bottom-64
            -left-64
            h-[36rem]
            w-[36rem]
            rounded-full
            bg-violet-500/[0.05]
            blur-[170px]

            dark:bg-violet-500/[0.07]
          "
        />
      </div>

      <main
        className="
          relative
          z-10
          mx-auto
          max-w-[1100px]
          px-4
          pt-9

          sm:px-6

          lg:px-10
          lg:pt-12
        "
      >
        {/*=================================================
        Header
        =================================================*/}

        <section
          className="
            relative
            mb-7
            overflow-hidden
            rounded-[2rem]
            border
            border-slate-200/80
            bg-white/90
            p-6
            shadow-[0_24px_80px_rgba(15,23,42,0.06)]
            backdrop-blur-xl

            sm:p-8

            lg:p-10

            dark:border-white/[0.06]
            dark:bg-[#090909]/90
            dark:shadow-[0_30px_100px_rgba(0,0,0,0.45)]
          "
        >
          <div
            className="
              pointer-events-none
              absolute
              -right-20
              -top-20
              h-64
              w-64
              rounded-full
              bg-[#D4AF37]/12
              blur-[80px]
            "
          />

          <div
            className="
              relative
              z-10
              flex
              flex-col
              gap-7

              md:flex-row
              md:items-end
              md:justify-between
            "
          >
            <div>
              <p
                className="
                  inline-flex
                  items-center
                  gap-2
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.24em]
                  text-[#98751A]

                  dark:text-[#D4AF37]
                "
              >
                <Sparkles size={12} />
                Creator Studio
              </p>

              <h1
                className="
                  mt-4
                  font-serif
                  text-4xl
                  font-light
                  tracking-tight

                  sm:text-5xl
                "
              >
                Save your{" "}
                <span
                  className="
                    italic
                    text-[#A17D1C]

                    dark:text-[#D4AF37]
                  "
                >
                  creative work
                </span>
              </h1>

              <p
                className="
                  mt-4
                  max-w-2xl
                  text-sm
                  leading-7
                  text-slate-500

                  dark:text-white/40
                "
              >
                Add the creative context that helps people discover your work by
                style, garment, and occasion.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate(CREATOR_HUB_ROUTE)}
              className="
                inline-flex
                h-11
                shrink-0
                items-center
                justify-center
                gap-2
                rounded-xl
                border
                border-slate-200
                bg-white
                px-5
                text-[8px]
                font-black
                uppercase
                tracking-[0.16em]
                text-slate-500
                transition

                hover:border-[#D4AF37]/40
                hover:text-[#98751A]

                dark:border-white/10
                dark:bg-white/[0.035]
                dark:text-white/45
                dark:hover:text-[#D4AF37]
              "
            >
              <ArrowLeft size={13} />
              Creator Hub
            </button>
          </div>
        </section>

        {/*=================================================
        Information
        =================================================*/}

        <section
          className="
            mb-7
            flex
            items-start
            gap-3
            rounded-2xl
            border
            border-violet-200
            bg-violet-50/70
            p-4

            dark:border-violet-400/15
            dark:bg-violet-500/[0.06]
          "
        >
          <Layers3
            size={17}
            className="
              mt-0.5
              shrink-0
              text-violet-600

              dark:text-violet-300
            "
          />

          <div>
            <p
              className="
                text-xs
                font-semibold
                text-violet-800

                dark:text-violet-200
              "
            >
              Showcase classification
            </p>

            <p
              className="
                mt-1
                text-[10px]
                leading-5
                text-violet-700/70

                dark:text-violet-200/55
              "
            >
              Style, garment and occasion selections help your design appear in
              the correct Showcase discovery sections.
            </p>
          </div>
        </section>

        {/*=================================================
        Success
        =================================================*/}

        {success && (
          <div
            role="status"
            className="
              mb-7
              flex
              items-start
              gap-3
              rounded-2xl
              border
              border-emerald-200
              bg-emerald-50
              p-4
              text-sm
              text-emerald-700

              dark:border-emerald-400/20
              dark:bg-emerald-400/[0.08]
              dark:text-emerald-200
            "
          >
            <CheckCircle2
              size={18}
              className="
                mt-0.5
                shrink-0
              "
            />

            <div>
              <p className="font-semibold">Studio asset saved successfully.</p>

              <p
                className="
                  mt-1
                  text-xs
                  opacity-70
                "
              >
                Returning you to the Showcase…
              </p>
            </div>
          </div>
        )}

        {/*=================================================
        Error
        =================================================*/}

        {errorMsg && (
          <div
            role="alert"
            className="
              mb-7
              flex
              items-start
              gap-3
              rounded-2xl
              border
              border-rose-200
              bg-rose-50
              p-4
              text-sm
              text-rose-700

              dark:border-rose-400/20
              dark:bg-rose-400/[0.08]
              dark:text-rose-200
            "
          >
            <AlertCircle
              size={18}
              className="
                mt-0.5
                shrink-0
              "
            />

            <p>{errorMsg}</p>
          </div>
        )}

        {/*=================================================
        Form
        =================================================*/}

        <form
          onSubmit={handleUploadSubmit}
          className="
            overflow-hidden
            rounded-[2rem]
            border
            border-slate-200/80
            bg-white/90
            shadow-sm

            dark:border-white/[0.06]
            dark:bg-[#090909]
          "
        >
          {/*===============================================
          Artwork
          ===============================================*/}

          <section
            className="
              border-b
              border-slate-200
              p-6

              sm:p-8

              dark:border-white/[0.06]
            "
          >
            <div
              className="
                mb-5
                flex
                flex-col
                gap-3

                sm:flex-row
                sm:items-end
                sm:justify-between
              "
            >
              <div>
                <p
                  className="
                    text-[8px]
                    font-black
                    uppercase
                    tracking-[0.2em]
                    text-[#98751A]

                    dark:text-[#D4AF37]
                  "
                >
                  Creative Asset
                </p>

                <h2
                  className="
                    mt-2
                    font-serif
                    text-2xl
                  "
                >
                  Artwork preview
                </h2>
              </div>

              {displayImage && (
                <span
                  className="
                    inline-flex
                    w-fit
                    items-center
                    gap-1.5
                    rounded-full
                    border
                    border-emerald-200
                    bg-emerald-50
                    px-3
                    py-1.5
                    text-[8px]
                    font-black
                    uppercase
                    tracking-[0.14em]
                    text-emerald-700

                    dark:border-emerald-400/20
                    dark:bg-emerald-400/10
                    dark:text-emerald-300
                  "
                >
                  <CheckCircle2 size={10} />

                  {imageSource === "studio" ? "From Studio" : "Image Ready"}
                </span>
              )}
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={loading || success}
              className="hidden"
            />

            {previewUrl ? (
              <div
                className="
                  overflow-hidden
                  rounded-[1.75rem]
                  border
                  border-slate-200
                  bg-slate-950

                  dark:border-white/10
                "
              >
                <div
                  className="
                    relative
                    min-h-[320px]
                    overflow-hidden
                    bg-black
                  "
                >
                  <img
                    src={previewUrl}
                    alt="Creator Studio artwork preview"
                    onLoad={handlePreviewLoad}
                    className="
                      h-full
                      max-h-[620px]
                      min-h-[320px]
                      w-full
                      object-contain
                    "
                  />

                  {!loading && !success && (
                    <div
                      className="
                          absolute
                          right-4
                          top-4
                          flex
                          gap-2
                        "
                    >
                      <button
                        type="button"
                        onClick={openFilePicker}
                        className="
                            inline-flex
                            h-10
                            items-center
                            justify-center
                            gap-2
                            rounded-xl
                            border
                            border-white/15
                            bg-black/65
                            px-4
                            text-[8px]
                            font-black
                            uppercase
                            tracking-[0.14em]
                            text-white
                            backdrop-blur
                            transition

                            hover:bg-white
                            hover:text-black
                          "
                      >
                        <RefreshCw size={12} />
                        Replace
                      </button>

                      <button
                        type="button"
                        onClick={clearFileSlot}
                        aria-label="Remove artwork"
                        className="
                            grid
                            h-10
                            w-10
                            place-items-center
                            rounded-xl
                            border
                            border-rose-400/20
                            bg-black/65
                            text-rose-300
                            backdrop-blur
                            transition

                            hover:bg-rose-500
                            hover:text-white
                          "
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )}
                </div>

                <div
                  className="
                    flex
                    flex-wrap
                    items-center
                    gap-x-5
                    gap-y-2
                    border-t
                    border-white/10
                    bg-[#080808]
                    px-5
                    py-3
                    text-[8px]
                    font-medium
                    uppercase
                    tracking-[0.13em]
                    text-white/35
                  "
                >
                  <span>{displayImage.name || "Studio artwork"}</span>

                  <span>{(displayImage.size / 1024 / 1024).toFixed(2)} MB</span>

                  {imageDimensions && (
                    <span>
                      {imageDimensions.width}×{imageDimensions.height}
                    </span>
                  )}

                  {strokeCount > 0 && (
                    <span
                      className="
                        inline-flex
                        items-center
                        gap-1.5
                        text-violet-300
                      "
                    >
                      <Layers3 size={10} />
                      {strokeCount} Studio{" "}
                      {strokeCount === 1 ? "stroke" : "strokes"}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={loading || success}
                onClick={openFilePicker}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
                  flex
                  min-h-[340px]
                  w-full
                  flex-col
                  items-center
                  justify-center
                  rounded-[1.75rem]
                  border-2
                  border-dashed
                  px-6
                  text-center
                  transition

                  ${
                    dragActive
                      ? "border-[#D4AF37] bg-[#D4AF37]/10"
                      : "border-slate-200 bg-slate-50 hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/[0.025] dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-[#D4AF37]/30"
                  }

                  disabled:cursor-not-allowed
                  disabled:opacity-50
                `}
              >
                <div
                  className="
                    grid
                    h-16
                    w-16
                    place-items-center
                    rounded-2xl
                    border
                    border-[#D4AF37]/20
                    bg-[#D4AF37]/10
                    text-[#98751A]

                    dark:text-[#D4AF37]
                  "
                >
                  {dragActive ? (
                    <UploadCloud size={27} />
                  ) : (
                    <ImageIcon size={27} />
                  )}
                </div>

                <h3
                  className="
                    mt-5
                    font-serif
                    text-2xl
                  "
                >
                  {dragActive ? "Drop your artwork" : "Add artwork"}
                </h3>

                <p
                  className="
                    mt-3
                    max-w-md
                    text-xs
                    leading-6
                    text-slate-500

                    dark:text-white/35
                  "
                >
                  Choose an image or drag one here. Artwork exported from the
                  Studio is loaded automatically when available.
                </p>

                <div
                  className="
                    mt-5
                    inline-flex
                    items-center
                    gap-2
                    rounded-full
                    border
                    border-slate-200
                    bg-white
                    px-4
                    py-2
                    text-[8px]
                    font-black
                    uppercase
                    tracking-[0.15em]
                    text-slate-500

                    dark:border-white/10
                    dark:bg-white/[0.03]
                    dark:text-white/35
                  "
                >
                  <FileImage size={11} />
                  JPG · PNG · WEBP · Max 5 MB
                </div>
              </button>
            )}
          </section>

          {/*===============================================
          Details
          ===============================================*/}

          <section
            className="
              p-6

              sm:p-8
            "
          >
            <div
              className="
                mb-7
                border-b
                border-slate-200
                pb-5

                dark:border-white/[0.06]
              "
            >
              <p
                className="
                  text-[8px]
                  font-black
                  uppercase
                  tracking-[0.2em]
                  text-[#98751A]

                  dark:text-[#D4AF37]
                "
              >
                Creative Details
              </p>

              <h2
                className="
                  mt-2
                  font-serif
                  text-2xl
                "
              >
                Describe your concept
              </h2>
            </div>

            <div className="space-y-7">
              {/* Title */}

              <label className="block">
                <FieldLabel>Design Title</FieldLabel>

                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={MAX_TITLE_LENGTH}
                  value={form.title}
                  disabled={loading || success}
                  onChange={(event) =>
                    handleInputChange("title", event.target.value)
                  }
                  placeholder="e.g. Asymmetrical Silk Blazer"
                  className="
                    h-[52px]
                    w-full
                    rounded-xl
                    border
                    border-slate-200
                    bg-slate-50
                    px-4
                    text-sm
                    outline-none
                    transition

                    placeholder:text-slate-400

                    focus:border-[#D4AF37]/60
                    focus:bg-white
                    focus:ring-4
                    focus:ring-[#D4AF37]/10

                    disabled:opacity-60

                    dark:border-white/10
                    dark:bg-white/[0.035]
                    dark:text-white
                    dark:placeholder:text-white/20
                  "
                />
              </label>

              {/* Creative Format */}

              <label className="block">
                <FieldLabel>Creative Format</FieldLabel>

                <SelectField
                  value={form.format}
                  disabled={loading || success}
                  onChange={(event) =>
                    handleInputChange("format", event.target.value)
                  }
                >
                  {FORMAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </SelectField>
              </label>

              {/*===========================================
              General Category
              ===========================================*/}

              <div>
                <FieldLabel>Creative Category</FieldLabel>

                <SelectField
                  value={form.category_id}
                  disabled={
                    loading ||
                    success ||
                    categoriesLoading ||
                    categories.length === 0
                  }
                  onChange={(event) =>
                    handleInputChange("category_id", event.target.value)
                  }
                >
                  <option value="">
                    {categoriesLoading
                      ? "Loading categories…"
                      : categories.length === 0
                        ? "No categories available"
                        : "Select a category"}
                  </option>

                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </SelectField>

                {categoriesLoading && (
                  <p
                    className="
                      mt-2
                      flex
                      items-center
                      gap-2
                      text-[9px]
                      text-slate-400

                      dark:text-white/25
                    "
                  >
                    <Loader2 size={11} className="animate-spin" />
                    Loading active categories…
                  </p>
                )}

                {!categoriesLoading && categoriesError && (
                  <div
                    className="
                        mt-3
                        flex
                        items-center
                        justify-between
                        gap-3
                        rounded-xl
                        border
                        border-rose-200
                        bg-rose-50
                        p-3

                        dark:border-rose-400/15
                        dark:bg-rose-500/[0.06]
                      "
                  >
                    <p
                      className="
                          text-[10px]
                          text-rose-700

                          dark:text-rose-200
                        "
                    >
                      {categoriesError}
                    </p>

                    <button
                      type="button"
                      onClick={() => void loadCategories()}
                      className="
                          inline-flex
                          items-center
                          gap-1.5
                          text-[8px]
                          font-black
                          uppercase
                          text-rose-600
                        "
                    >
                      <RefreshCw size={10} />
                      Retry
                    </button>
                  </div>
                )}

                {selectedCategory && !categoriesError && (
                  <p
                    className="
                        mt-2
                        text-[9px]
                        text-slate-400

                        dark:text-white/25
                      "
                  >
                    {selectedCategory.description || selectedCategory.name}
                  </p>
                )}
              </div>

              {/*===========================================
              Showcase Discovery
              ===========================================*/}

              <div
                className="
                  rounded-[1.5rem]
                  border
                  border-[#D4AF37]/20
                  bg-[#D4AF37]/[0.035]
                  p-5

                  sm:p-6
                "
              >
                <div
                  className="
                    mb-6
                    flex
                    items-start
                    gap-3
                  "
                >
                  <Palette
                    size={18}
                    className="
                      mt-0.5
                      shrink-0
                      text-[#A17D1C]

                      dark:text-[#D4AF37]
                    "
                  />

                  <div>
                    <h3
                      className="
                        font-serif
                        text-xl
                      "
                    >
                      Showcase Discovery
                    </h3>

                    <p
                      className="
                        mt-1
                        text-[10px]
                        leading-5
                        text-slate-500

                        dark:text-white/35
                      "
                    >
                      These selections determine where this design can be
                      discovered in the Showcase.
                    </p>
                  </div>
                </div>

                {discoveryLoading ? (
                  <div
                    className="
                      flex
                      min-h-[120px]
                      items-center
                      justify-center
                      gap-2
                      text-[9px]
                      text-slate-400

                      dark:text-white/30
                    "
                  >
                    <Loader2 size={14} className="animate-spin" />
                    Loading discovery options…
                  </div>
                ) : discoveryError ? (
                  <div
                    className="
                      rounded-xl
                      border
                      border-rose-200
                      bg-rose-50
                      p-4

                      dark:border-rose-400/15
                      dark:bg-rose-500/[0.06]
                    "
                  >
                    <div
                      className="
                        flex
                        items-start
                        gap-2
                      "
                    >
                      <AlertCircle
                        size={14}
                        className="
                          mt-0.5
                          text-rose-500
                        "
                      />

                      <p
                        className="
                          flex-1
                          text-[10px]
                          leading-5
                          text-rose-700

                          dark:text-rose-200
                        "
                      >
                        {discoveryError}
                      </p>

                      <button
                        type="button"
                        onClick={() => void loadDiscovery()}
                        className="
                          inline-flex
                          items-center
                          gap-1.5
                          text-[8px]
                          font-black
                          uppercase
                          text-rose-600

                          dark:text-rose-200
                        "
                      >
                        <RefreshCw size={10} />
                        Retry
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Style + Garment */}

                    <div
                      className="
                        grid
                        gap-5

                        md:grid-cols-2
                      "
                    >
                      <label className="block">
                        <FieldLabel>Style</FieldLabel>

                        <SelectField
                          value={form.style_term_id}
                          disabled={loading || success}
                          onChange={(event) =>
                            handleInputChange(
                              "style_term_id",
                              event.target.value,
                            )
                          }
                        >
                          <option value="">Select a style</option>

                          {discovery.styles.map((style) => (
                            <option key={style.id} value={style.id}>
                              {style.name}
                            </option>
                          ))}
                        </SelectField>
                      </label>

                      <label className="block">
                        <FieldLabel>Garment</FieldLabel>

                        <SelectField
                          value={form.garment_term_id}
                          disabled={loading || success}
                          onChange={(event) =>
                            handleInputChange(
                              "garment_term_id",
                              event.target.value,
                            )
                          }
                        >
                          <option value="">Select a garment</option>

                          {discovery.garments.map((garment) => (
                            <option key={garment.id} value={garment.id}>
                              {garment.emoji ? `${garment.emoji} ` : ""}
                              {garment.name}
                            </option>
                          ))}
                        </SelectField>
                      </label>
                    </div>

                    {/* Occasions */}

                    <div>
                      <FieldLabel optional>Occasion</FieldLabel>

                      <p
                        className="
                          mb-3
                          text-[9px]
                          leading-5
                          text-slate-400

                          dark:text-white/25
                        "
                      >
                        Select any occasions this design fits. Multiple
                        selections are allowed.
                      </p>

                      <div
                        className="
                          grid
                          grid-cols-2
                          gap-2

                          sm:grid-cols-4
                        "
                      >
                        {discovery.occasions.map((occasion) => {
                          const selected = form.occasion_term_ids.includes(
                            occasion.id,
                          );

                          return (
                            <button
                              key={occasion.id}
                              type="button"
                              disabled={loading || success}
                              aria-pressed={selected}
                              onClick={() => toggleOccasion(occasion.id)}
                              className={`
                                  relative
                                  min-h-[76px]
                                  rounded-xl
                                  border
                                  p-3
                                  text-left
                                  transition

                                  ${
                                    selected
                                      ? "border-[#D4AF37]/60 bg-[#D4AF37]/10 text-[#8A6814] dark:text-[#E4C65D]"
                                      : "border-slate-200 bg-white text-slate-500 hover:border-[#D4AF37]/35 dark:border-white/10 dark:bg-white/[0.025] dark:text-white/40"
                                  }

                                  disabled:cursor-not-allowed
                                  disabled:opacity-50
                                `}
                            >
                              <div
                                className="
                                    flex
                                    items-start
                                    justify-between
                                    gap-2
                                  "
                              >
                                <span
                                  className="
                                      text-xl
                                    "
                                >
                                  {occasion.emoji || "✦"}
                                </span>

                                {selected && (
                                  <span
                                    className="
                                        grid
                                        h-5
                                        w-5
                                        place-items-center
                                        rounded-full
                                        bg-[#D4AF37]
                                        text-black
                                      "
                                  >
                                    <Check size={11} />
                                  </span>
                                )}
                              </div>

                              <p
                                className="
                                    mt-2
                                    text-[9px]
                                    font-black
                                    uppercase
                                    tracking-[0.1em]
                                  "
                              >
                                {occasion.name}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Selected Summary */}

                    {(selectedStyle ||
                      selectedGarment ||
                      selectedOccasions.length > 0) && (
                      <div
                        className="
                          flex
                          flex-wrap
                          gap-2
                          border-t
                          border-[#D4AF37]/15
                          pt-4
                        "
                      >
                        {selectedStyle && (
                          <span
                            className="
                              rounded-full
                              bg-[#D4AF37]/10
                              px-3
                              py-1.5
                              text-[8px]
                              font-black
                              uppercase
                              tracking-[0.12em]
                              text-[#8A6814]

                              dark:text-[#D4AF37]
                            "
                          >
                            Style · {selectedStyle.name}
                          </span>
                        )}

                        {selectedGarment && (
                          <span
                            className="
                              rounded-full
                              bg-violet-500/10
                              px-3
                              py-1.5
                              text-[8px]
                              font-black
                              uppercase
                              tracking-[0.12em]
                              text-violet-600

                              dark:text-violet-300
                            "
                          >
                            Garment · {selectedGarment.name}
                          </span>
                        )}

                        {selectedOccasions.map((occasion) => (
                          <span
                            key={occasion.id}
                            className="
                                rounded-full
                                bg-slate-100
                                px-3
                                py-1.5
                                text-[8px]
                                font-black
                                uppercase
                                tracking-[0.1em]
                                text-slate-500

                                dark:bg-white/[0.05]
                                dark:text-white/40
                              "
                          >
                            {occasion.emoji} {occasion.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/*===========================================
              Tags
              ===========================================*/}

              <div>
                <FieldLabel optional>Tags</FieldLabel>

                <div
                  className="
                    flex
                    min-h-[52px]
                    items-center
                    gap-2
                    rounded-xl
                    border
                    border-slate-200
                    bg-slate-50
                    px-3
                    transition

                    focus-within:border-[#D4AF37]/60
                    focus-within:ring-4
                    focus-within:ring-[#D4AF37]/10

                    dark:border-white/10
                    dark:bg-white/[0.035]
                  "
                >
                  <Tag
                    size={14}
                    className="
                      shrink-0
                      text-slate-400

                      dark:text-white/25
                    "
                  />

                  <input
                    type="text"
                    maxLength={MAX_TAG_LENGTH}
                    value={tagInput}
                    disabled={loading || success || tags.length >= MAX_TAGS}
                    onChange={(event) => {
                      setTagInput(event.target.value);

                      setErrorMsg("");
                    }}
                    onKeyDown={handleTagKeyDown}
                    placeholder="silk, layered, modern…"
                    className="
                      h-12
                      min-w-0
                      flex-1
                      bg-transparent
                      text-sm
                      outline-none

                      dark:text-white
                    "
                  />

                  <button
                    type="button"
                    onClick={addCurrentTag}
                    disabled={
                      !normalizeTag(tagInput) ||
                      tags.length >= MAX_TAGS ||
                      loading ||
                      success
                    }
                    className="
                      grid
                      h-8
                      w-8
                      place-items-center
                      rounded-lg
                      bg-slate-200
                      text-slate-600

                      disabled:opacity-30

                      dark:bg-white/10
                      dark:text-white/50
                    "
                  >
                    <Plus size={13} />
                  </button>
                </div>

                <div
                  className="
                    mt-2
                    flex
                    justify-between
                    text-[9px]
                    text-slate-400

                    dark:text-white/25
                  "
                >
                  <span>Press Enter or comma to add</span>

                  <span>
                    {tags.length}/{MAX_TAGS}
                  </span>
                </div>

                {tags.length > 0 && (
                  <div
                    className="
                      mt-3
                      flex
                      flex-wrap
                      gap-2
                    "
                  >
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="
                            inline-flex
                            items-center
                            gap-1
                            rounded-full
                            border
                            border-slate-200
                            bg-slate-50
                            py-1.5
                            pl-3
                            pr-1.5
                            text-[9px]
                            text-slate-500

                            dark:border-white/10
                            dark:bg-white/[0.03]
                            dark:text-white/40
                          "
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          disabled={loading || success}
                          className="
                              grid
                              h-6
                              w-6
                              place-items-center
                              rounded-full
                            "
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/*===========================================
              Description
              ===========================================*/}

              <label className="block">
                <FieldLabel>Description</FieldLabel>

                <textarea
                  required
                  minLength={10}
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  rows={7}
                  value={form.description}
                  disabled={loading || success}
                  onChange={(event) =>
                    handleInputChange("description", event.target.value)
                  }
                  placeholder="Describe the silhouette, materials, inspiration, mood, construction ideas, visual direction, or anything useful about this concept..."
                  className="
                    w-full
                    resize-y
                    rounded-xl
                    border
                    border-slate-200
                    bg-slate-50
                    p-4
                    text-sm
                    leading-7
                    outline-none

                    focus:border-[#D4AF37]/60
                    focus:ring-4
                    focus:ring-[#D4AF37]/10

                    dark:border-white/10
                    dark:bg-white/[0.035]
                    dark:text-white
                  "
                />

                <div
                  className="
                    mt-2
                    flex
                    justify-end
                    text-[8px]
                    font-mono
                    text-slate-400

                    dark:text-white/25
                  "
                >
                  {form.description.length}/{MAX_DESCRIPTION_LENGTH}
                </div>
              </label>
            </div>
          </section>

          {/*===============================================
          Footer
          ===============================================*/}

          <footer
            className="
              border-t
              border-slate-200
              bg-slate-50/70
              p-5

              sm:p-6

              dark:border-white/[0.06]
              dark:bg-white/[0.015]
            "
          >
            {loading && (
              <div className="mb-5">
                <div
                  className="
                    mb-2
                    flex
                    justify-between
                    text-[8px]
                    font-black
                    uppercase
                    tracking-[0.15em]
                    text-slate-400

                    dark:text-white/25
                  "
                >
                  <span>Saving Studio Asset</span>

                  <span>{uploadProgress}%</span>
                </div>

                <div
                  className="
                    h-1.5
                    overflow-hidden
                    rounded-full
                    bg-slate-200

                    dark:bg-white/[0.06]
                  "
                >
                  <div
                    className="
                      h-full
                      rounded-full
                      bg-gradient-to-r
                      from-[#A98520]
                      to-[#D4AF37]
                      transition-all
                    "
                    style={{
                      width: `${uploadProgress}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div
              className="
                flex
                flex-col
                gap-4

                sm:flex-row
                sm:items-center
                sm:justify-between
              "
            >
              <div
                className="
                  flex
                  items-start
                  gap-2
                  text-[9px]
                  leading-5
                  text-slate-400

                  dark:text-white/25
                "
              >
                <Layers3
                  size={13}
                  className="
                    mt-0.5
                    shrink-0
                  "
                />

                <span>
                  {strokeCount > 0
                    ? `${strokeCount} editable Studio stroke${strokeCount === 1 ? "" : "s"} will be stored with this asset.`
                    : "No editable Studio vector state is attached to this image."}
                </span>
              </div>

              <button
                type="submit"
                disabled={
                  loading || success || metadataLoading || metadataUnavailable
                }
                className="
                  inline-flex
                  h-12
                  shrink-0
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  bg-[#D4AF37]
                  px-7
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.18em]
                  text-black
                  shadow-[0_14px_35px_rgba(212,175,55,0.2)]
                  transition

                  hover:-translate-y-0.5
                  hover:bg-[#E4C65D]

                  disabled:cursor-not-allowed
                  disabled:bg-slate-200
                  disabled:text-slate-400
                  disabled:shadow-none

                  dark:disabled:bg-white/5
                  dark:disabled:text-white/25
                "
              >
                {loading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Saving
                  </>
                ) : success ? (
                  <>
                    <CheckCircle2 size={14} />
                    Saved
                  </>
                ) : metadataLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Loading
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    Save Studio Asset
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
