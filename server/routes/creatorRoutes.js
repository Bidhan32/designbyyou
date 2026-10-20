"use strict";

/**
 * =========================================================
 * DesignByYou / FashionVision
 * Creator Routes — Version 5.9
 * =========================================================
 *
 * Creator Studio, Fashion Editor, Showcase, Text to Image,
 * and Sketch to Image (FASHN edit).
 *
 * Authentication and Creator authorization are applied
 * before any upload middleware or route handlers.
 * =========================================================
 */

const express = require("express");
const multer = require("multer");

const creatorController = require("../controllers/creators/creatorController");
const textToImageController = require("../controllers/creators/textToImageController");
const sketchToImageController = require("../controllers/creators/sketchToImageController");

const { protect, authorize } = require("../middlewares/authMiddleware");

const {
  uploadPreview,
  uploadCreatorGallery,
} = require("../middlewares/upload");

const router = express.Router();

const MAX_CREATOR_GALLERY_FILES = 6;

// =========================================================
// Validate handlers and existing upload middleware
// =========================================================

function requireHandler(name, handler) {
  if (typeof handler !== "function") {
    throw new TypeError(
      `Creator route handler "${name}" is missing or is not a function.`,
    );
  }

  return handler;
}

if (!uploadPreview || typeof uploadPreview.single !== "function") {
  throw new TypeError(
    'Creator upload middleware "uploadPreview" is missing or invalid.',
  );
}

if (!uploadCreatorGallery || typeof uploadCreatorGallery.array !== "function") {
  throw new TypeError(
    'Creator upload middleware "uploadCreatorGallery" is missing or invalid. Update middlewares/upload.js first.',
  );
}

// =========================================================
// Existing Creator Upload Handlers
// =========================================================

const singlePreviewUpload = uploadPreview.single("preview");

const creatorGalleryUpload = uploadCreatorGallery.array(
  "preview",
  MAX_CREATOR_GALLERY_FILES,
);

// =========================================================
// Existing Creator Studio upload error handling
// =========================================================

function sendUploadError(error, res, kind) {
  if (res.headersSent) {
    return;
  }

  const gallery = kind === "gallery";

  const noun = gallery ? "gallery image" : "preview image";

  switch (error?.code) {
    case "LIMIT_FILE_SIZE":
      return res.status(413).json({
        status: "error",
        code: "PREVIEW_TOO_LARGE",
        message: `Each ${noun} must be 5 MB or smaller.`,
      });

    case "LIMIT_UNEXPECTED_FILE":
      return res.status(400).json({
        status: "error",
        code: "UNEXPECTED_UPLOAD_FIELD",
        message: gallery
          ? 'Only up to six images in the field "preview" are accepted.'
          : 'Only one optional image field named "preview" is accepted.',
      });

    case "LIMIT_FILE_COUNT":
    case "LIMIT_PART_COUNT":
      return res.status(400).json({
        status: "error",
        code: "UPLOAD_LIMIT_EXCEEDED",
        message: "The upload contains too many files or multipart parts.",
      });

    case "LIMIT_FIELD_COUNT":
    case "LIMIT_FIELD_KEY":
    case "LIMIT_FIELD_VALUE":
      return res.status(400).json({
        status: "error",
        code: "INVALID_MULTIPART_REQUEST",
        message: "One or more multipart fields exceed the allowed limits.",
      });

    case "INVALID_IMAGE_TYPE":
    case "INVALID_IMAGE_FILE":
    case "INVALID_FILE_NAME":
      return res.status(400).json({
        status: "error",
        code: error.code,
        message: error.message || "The uploaded image is invalid.",
      });

    default:
      console.error(`[Creator Routes] ${kind} upload failed:`, {
        code: error?.code || null,
        message: error?.message || "Unknown upload error",
      });

      return res.status(400).json({
        status: "error",
        code: "PREVIEW_UPLOAD_FAILED",
        message: gallery
          ? "The gallery images could not be processed. Use JPG, PNG or WebP images and try again."
          : "The preview image could not be processed. Use JPG, PNG or WebP and try again.",
      });
  }
}

// =========================================================
// Safe Single Preview Upload
// =========================================================

function safePreviewUpload(req, res, next) {
  singlePreviewUpload(req, res, (error) => {
    if (error) {
      return sendUploadError(error, res, "preview");
    }

    return next();
  });
}

// =========================================================
// Safe Creator Gallery Upload
// =========================================================

function safeCreatorGalleryUpload(req, res, next) {
  creatorGalleryUpload(req, res, (error) => {
    if (error) {
      return sendUploadError(error, res, "gallery");
    }

    if (!Array.isArray(req.files)) {
      return res.status(400).json({
        status: "error",
        code: "INVALID_GALLERY_UPLOAD",
        message: "Invalid image gallery upload.",
      });
    }

    return next();
  });
}

// =========================================================
// Creator Studio Gallery Compatibility
// =========================================================

// Keep existing single-upload fallback when the gallery
// controller is unavailable.

const galleryReady =
  typeof creatorController.uploadCreatorStudioGalleryAsset === "function";

// =========================================================
// AI Sketch to Image Upload Middleware
// =========================================================

/**
 * Expected multipart request:
 *
 * sketch          = 1 image
 * instruction     = text
 * fabric          = text
 * generation_mode = text
 * request_key     = text
 *
 * Accepted image formats:
 * - JPG
 * - PNG
 * - WebP
 *
 * Maximum image size: 6 MB
 * Maximum file count: 1
 * Maximum text fields: 4
 *
 * Important:
 * The controller must validate the actual image bytes,
 * not just the client-supplied MIME type.
 */

const sketchUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 6 * 1024 * 1024,
    files: 1,
    fields: 4,
    fieldSize: 2000,

    // FIX: previously 5
    parts: 6,
  },

  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.mimetype)) {
      const error = new Error("Only JPG, PNG, and WebP sketches are accepted.");

      error.code = "INVALID_SKETCH_TYPE";

      return cb(error);
    }

    return cb(null, true);
  },
}).single("sketch");

// =========================================================
// Safe Sketch Upload — Improved Error Handling
// =========================================================

function safeSketchUpload(req, res, next) {
  sketchUpload(req, res, (error) => {
    if (!error) {
      return next();
    }

    // Log rejection metadata only.
    // Never log image content, prompts or API secrets.
    console.error("[SketchToImage] Upload rejected:", {
      code: error.code || "UNKNOWN",
      field: error.field || null,
      message: error.message || "Unknown upload failure",
    });

    let statusCode = 400;

    let message =
      "Invalid sketch upload. Supply one JPG, PNG, or WebP image and four or fewer settings.";

    switch (error.code) {
      case "LIMIT_FILE_SIZE":
        statusCode = 413;
        message = "Sketch must be 6 MB or smaller.";
        break;

      case "INVALID_SKETCH_TYPE":
        message = "Only JPG, PNG, and WebP sketches are accepted.";
        break;

      case "LIMIT_UNEXPECTED_FILE":
      case "LIMIT_FILE_COUNT":
        message = 'Upload exactly one image in the field named "sketch".';
        break;

      case "LIMIT_FIELD_COUNT":
        message = "Too many form fields. Up to four settings are accepted.";
        break;

      case "LIMIT_PART_COUNT":
        message = "Too many multipart sections in the sketch upload.";
        break;

      case "LIMIT_FIELD_VALUE":
      case "LIMIT_FIELD_KEY":
        message = "A sketch setting exceeds the allowed size.";
        break;

      default:
        break;
    }

    return res.status(statusCode).json({
      status: "error",
      code: error.code || "INVALID_SKETCH_UPLOAD",
      message,
    });
  });
}

// =========================================================
// Global Creator Authentication
// =========================================================

// Authentication MUST execute before uploads.

router.use(requireHandler("protect", protect));

router.use(requireHandler("authorize('creator')", authorize("creator")));

// =========================================================
// Creator Studio Categories
// =========================================================
// GET /api/v1/creators/studio/categories

router.get(
  "/studio/categories",

  requireHandler(
    "creatorController.getCreatorStudioCategories",
    creatorController.getCreatorStudioCategories,
  ),
);

// =========================================================
// Creator Studio Asset Library
// =========================================================
// GET /api/v1/creators/studio/assets

router.get(
  "/studio/assets",

  requireHandler(
    "creatorController.getMyCreatorStudioAssets",
    creatorController.getMyCreatorStudioAssets,
  ),
);

// =========================================================
// Creator Studio Upload
// =========================================================
// POST /api/v1/creators/studio/upload

router.post(
  "/studio/upload",

  galleryReady ? safeCreatorGalleryUpload : safePreviewUpload,

  requireHandler(
    galleryReady
      ? "creatorController.uploadCreatorStudioGalleryAsset"
      : "creatorController.uploadCreatorStudioAsset",

    galleryReady
      ? creatorController.uploadCreatorStudioGalleryAsset
      : creatorController.uploadCreatorStudioAsset,
  ),
);

// =========================================================
// Creator Studio Asset Visibility
// =========================================================
// PATCH /api/v1/creators/studio/assets/:designId/visibility

router.patch(
  "/studio/assets/:designId/visibility",

  requireHandler(
    "creatorController.updateCreatorStudioAssetVisibility",
    creatorController.updateCreatorStudioAssetVisibility,
  ),
);

// =========================================================
// Fashion Editor Cloud Projects
// =========================================================
// GET  /editor-projects
// POST /editor-projects

router
  .route("/editor-projects")

  .get(
    requireHandler(
      "creatorController.getMyEditorProjects",
      creatorController.getMyEditorProjects,
    ),
  )

  .post(
    requireHandler(
      "creatorController.createEditorProject",
      creatorController.createEditorProject,
    ),
  );

// =========================================================
// Fashion Editor → Showcase Share
// =========================================================
// POST /editor-projects/:projectId/share

router.post(
  "/editor-projects/:projectId/share",

  safePreviewUpload,

  requireHandler(
    "creatorController.uploadCreatorStudioAsset",
    creatorController.uploadCreatorStudioAsset,
  ),
);

// =========================================================
// Fashion Editor Project Detail
// =========================================================
// GET /editor-projects/:projectId
// PUT /editor-projects/:projectId

router
  .route("/editor-projects/:projectId")

  .get(
    requireHandler(
      "creatorController.getEditorProject",
      creatorController.getEditorProject,
    ),
  )

  .put(
    requireHandler(
      "creatorController.updateEditorProject",
      creatorController.updateEditorProject,
    ),
  );

// =========================================================
// Public Showcase → Fashion Editor
// =========================================================
// POST /showcase/:designId/open-in-editor

router.post(
  "/showcase/:designId/open-in-editor",

  requireHandler(
    "creatorController.openShowcaseDesignInEditor",
    creatorController.openShowcaseDesignInEditor,
  ),
);

// =========================================================
// Legacy Showcase Remix
// =========================================================
// POST /showcase/:designId/remix

router.post(
  "/showcase/:designId/remix",

  requireHandler(
    "creatorController.remixCreatorShowcaseDesign",
    creatorController.remixCreatorShowcaseDesign,
  ),
);

// =========================================================
// AI Text to Image — FASHN model-create
// =========================================================
// Existing Text to Image routes remain unchanged.

// POST /api/v1/creators/ai/text-to-image

router.post(
  "/ai/text-to-image",

  requireHandler("textToImageController.start", textToImageController.start),
);

// GET /api/v1/creators/ai/text-to-image/history

router.get(
  "/ai/text-to-image/history",

  requireHandler(
    "textToImageController.history",
    textToImageController.history,
  ),
);

// GET /api/v1/creators/ai/text-to-image/:jobId

router.get(
  "/ai/text-to-image/:jobId",

  requireHandler("textToImageController.status", textToImageController.status),
);

// =========================================================
// AI Sketch to Image — FASHN edit
// =========================================================

// POST /api/v1/creators/ai/sketch-to-image

router.post(
  "/ai/sketch-to-image",

  safeSketchUpload,

  requireHandler(
    "sketchToImageController.start",
    sketchToImageController.start,
  ),
);

// GET /api/v1/creators/ai/sketch-to-image/history

router.get(
  "/ai/sketch-to-image/history",

  requireHandler(
    "sketchToImageController.history",
    sketchToImageController.history,
  ),
);

// GET /api/v1/creators/ai/sketch-to-image/:jobId

router.get(
  "/ai/sketch-to-image/:jobId",

  requireHandler(
    "sketchToImageController.status",
    sketchToImageController.status,
  ),
);

// =========================================================
// Export Creator Router
// =========================================================

module.exports = router;
