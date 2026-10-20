"use strict";

/**
 * =========================================================
 * DesignByYou / FashionVision
 * Creator Routes — Version 6.0
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
const creatorVirtualTryOnController = require("../controllers/creators/creatorVirtualTryOnController");
const { protect, authorize } = require("../middlewares/authMiddleware");
const { uploadPreview, uploadCreatorGallery } = require("../middlewares/upload");

const router = express.Router();
const MAX_CREATOR_GALLERY_FILES = 6;

// =========================================================
// Validate handlers and existing upload middleware
// =========================================================

function requireHandler(name, handler) {
  if (typeof handler !== "function") {
    throw new TypeError(
      `Creator route handler "${name}" is missing or is not a function.`
    );
  }
  return handler;
}

if (!uploadPreview || typeof uploadPreview.single !== "function") {
  throw new TypeError(
    'Creator upload middleware "uploadPreview" is missing or invalid.'
  );
}

if (!uploadCreatorGallery || typeof uploadCreatorGallery.array !== "function") {
  throw new TypeError(
    'Creator upload middleware "uploadCreatorGallery" is missing or invalid. Update middlewares/upload.js first.'
  );
}

const singlePreviewUpload = uploadPreview.single("preview");
const creatorGalleryUpload = uploadCreatorGallery.array(
  "preview",
  MAX_CREATOR_GALLERY_FILES
);

// =========================================================
// Existing Creator Studio upload error handling
// =========================================================

function sendUploadError(error, res, kind) {
  if (res.headersSent) return;

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

function safePreviewUpload(req, res, next) {
  singlePreviewUpload(req, res, (error) => {
    if (error) return sendUploadError(error, res, "preview");
    return next();
  });
}

function safeCreatorGalleryUpload(req, res, next) {
  creatorGalleryUpload(req, res, (error) => {
    if (error) return sendUploadError(error, res, "gallery");
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

// Preserve existing single-upload fallback until the gallery
// controller exists in the deployed creatorController.js.
const galleryReady =
  typeof creatorController.uploadCreatorStudioGalleryAsset === "function";

// =========================================================
// Sketch to Image: isolated Multer memory upload
// =========================================================

/**
 * Expected multipart request from CreatorSketchToImage.jsx:
 *   sketch          = 1 image (JPG/PNG/WebP; <= 6 MB)
 *   instruction     = text
 *   fabric          = text
 *   generation_mode = text
 *   request_key     = text
 *
 * That is 1 file + 4 fields. Set parts to 6 to leave a small
 * buffer for multipart boundary/limit implementation behavior;
 * the strict file and field limits remain unchanged.
 * The controller must still validate actual image bytes.
 */
const sketchUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 6 * 1024 * 1024,
    files: 1,
    fields: 4,
    fieldSize: 2000,
    parts: 6, // Increased from 5
  },
  fileFilter: (req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      const error = new Error("Only JPG, PNG, and WebP sketches are accepted.");
      error.code = "INVALID_SKETCH_TYPE";
      return cb(error);
    }
    return cb(null, true);
  },
}).single("sketch");

function safeSketchUpload(req, res, next) {
  sketchUpload(req, res, (error) => {
    if (!error) return next();

    // Log only metadata; do not log the prompt, image, or secrets.
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
// Creator Virtual Try-On memory uploads, kept isolated from booking uploads.
// Two images + five fields (category, mode, garment_photo_type, request_key, consent).
const creatorTryOnUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 2, fields: 5, fieldSize: 1000, parts: 8 },
  fileFilter: (req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      const err = new Error("Only JPG, PNG or WebP photos are supported.");
      err.code = "INVALID_TRYON_IMAGE";
      return cb(err);
    }
    return cb(null, true);
  },
}).fields([
  { name: "person_image", maxCount: 1 },
  { name: "garment_image", maxCount: 1 },
]);

function safeCreatorTryOnUpload(req, res, next) {
  creatorTryOnUpload(req, res, (err) => {
    if (!err) return next();
    console.error("[CreatorTryOn] Upload rejected:", {
      code: err.code || "UNKNOWN",
      field: err.field || null,
    });
    return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      status: "error",
      code: err.code || "INVALID_TRYON_UPLOAD",
      message: err.code === "LIMIT_FILE_SIZE"
        ? "Each photo must be 12 MB or smaller."
        : err.code === "INVALID_TRYON_IMAGE"
          ? "Only JPG, PNG or WebP photos are accepted."
          : "Upload one person_image and one garment_image with valid try-on settings.",
    });
  });
}

// =========================================================
// Global Creator-only authentication (BEFORE all uploads)
// =========================================================

router.use(requireHandler("protect", protect));
router.use(requireHandler("authorize('creator')", authorize("creator")));

// =========================================================
// Creator Studio
// =========================================================

router.get(
  "/studio/categories",
  requireHandler(
    "creatorController.getCreatorStudioCategories",
    creatorController.getCreatorStudioCategories
  )
);

router.get(
  "/studio/assets",
  requireHandler(
    "creatorController.getMyCreatorStudioAssets",
    creatorController.getMyCreatorStudioAssets
  )
);

router.post(
  "/studio/upload",
  galleryReady ? safeCreatorGalleryUpload : safePreviewUpload,
  requireHandler(
    galleryReady
      ? "creatorController.uploadCreatorStudioGalleryAsset"
      : "creatorController.uploadCreatorStudioAsset",
    galleryReady
      ? creatorController.uploadCreatorStudioGalleryAsset
      : creatorController.uploadCreatorStudioAsset
  )
);

router.patch(
  "/studio/assets/:designId/visibility",
  requireHandler(
    "creatorController.updateCreatorStudioAssetVisibility",
    creatorController.updateCreatorStudioAssetVisibility
  )
);

// =========================================================
// Fashion Editor cloud projects and publishing
// =========================================================

router
  .route("/editor-projects")
  .get(
    requireHandler(
      "creatorController.getMyEditorProjects",
      creatorController.getMyEditorProjects
    )
  )
  .post(
    requireHandler(
      "creatorController.createEditorProject",
      creatorController.createEditorProject
    )
  );

router.post(
  "/editor-projects/:projectId/share",
  safePreviewUpload,
  requireHandler(
    "creatorController.uploadCreatorStudioAsset",
    creatorController.uploadCreatorStudioAsset
  )
);

router
  .route("/editor-projects/:projectId")
  .get(
    requireHandler(
      "creatorController.getEditorProject",
      creatorController.getEditorProject
    )
  )
  .put(
    requireHandler(
      "creatorController.updateEditorProject",
      creatorController.updateEditorProject
    )
  );

// =========================================================
// Showcase → Fashion Editor and legacy Remix
// =========================================================

router.post(
  "/showcase/:designId/open-in-editor",
  requireHandler(
    "creatorController.openShowcaseDesignInEditor",
    creatorController.openShowcaseDesignInEditor
  )
);

router.post(
  "/showcase/:designId/remix",
  requireHandler(
    "creatorController.remixCreatorShowcaseDesign",
    creatorController.remixCreatorShowcaseDesign
  )
);

// =========================================================
// AI Text to Image — FASHN model-create
// =========================================================

router.post(
  "/ai/text-to-image",
  requireHandler("textToImageController.start", textToImageController.start)
);

router.get(
  "/ai/text-to-image/history",
  requireHandler("textToImageController.history", textToImageController.history)
);

router.get(
  "/ai/text-to-image/:jobId",
  requireHandler("textToImageController.status", textToImageController.status)
);

// =========================================================
// AI Sketch to Image — FASHN edit
// =========================================================

router.post(
  "/ai/sketch-to-image",
  safeSketchUpload,
  requireHandler("sketchToImageController.start", sketchToImageController.start)
);

router.get(
  "/ai/sketch-to-image/history",
  requireHandler("sketchToImageController.history", sketchToImageController.history)
);

router.get(
  "/ai/sketch-to-image/:jobId",
  requireHandler("sketchToImageController.status", sketchToImageController.status)
);

// =========================================================
// Standalone Creator Virtual Try-On (bookings controller untouched)
// =========================================================
router.post(
  "/ai/virtual-try-on",
  safeCreatorTryOnUpload,
  requireHandler("creatorVirtualTryOnController.start", creatorVirtualTryOnController.start),
);
router.get(
  "/ai/virtual-try-on/history",
  requireHandler("creatorVirtualTryOnController.history", creatorVirtualTryOnController.history),
);
router.get(
  "/ai/virtual-try-on/:jobId",
  requireHandler("creatorVirtualTryOnController.status", creatorVirtualTryOnController.status),
);
router.delete(
  "/ai/virtual-try-on/:jobId",
  requireHandler("creatorVirtualTryOnController.remove", creatorVirtualTryOnController.remove),
);

module.exports = router;
