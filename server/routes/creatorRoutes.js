"use strict";

/**
 * =========================================================
 * DesignByYou / FashionVision
 * Creator Routes — Version 5.7
 * Creator Studio Multi-Image Gallery
 * =========================================================
 *
 * CREATOR STUDIO
 *
 * GET   /studio/categories
 * GET   /studio/assets
 * POST  /studio/upload
 * PATCH /studio/assets/:designId/visibility
 *
 * FASHION EDITOR
 *
 * GET   /editor-projects
 * POST  /editor-projects
 * GET   /editor-projects/:projectId
 * PUT   /editor-projects/:projectId
 * POST  /editor-projects/:projectId/share
 *
 * SHOWCASE → FASHION EDITOR
 *
 * POST  /showcase/:designId/open-in-editor
 * POST  /showcase/:designId/remix
 *
 * =========================================================
 * CREATOR STUDIO GALLERY
 * =========================================================
 *
 * Manual Creator Studio uploads will support:
 *
 * - 0 to 6 images
 * - JPG, PNG and WebP
 * - 5 MB per image
 * - One creation containing all selected images
 * - Existing Public / Private visibility
 * - Optional creative metadata
 *
 * The multipart field remains named "preview".
 *
 * Example:
 *
 * preview = image1.jpg
 * preview = image2.jpg
 * preview = image3.jpg
 *
 * Fashion Editor sharing continues to use one preview.
 *
 * IMPORTANT:
 * Until the gallery-aware controller is available,
 * the route preserves the existing single-file flow.
 *
 * =========================================================
 * SECURITY
 * =========================================================
 *
 * Every route requires:
 *
 * 1. Valid authentication
 * 2. Creator role
 *
 * Authentication happens before any file upload.
 *
 * These are creative/discovery routes, not ecommerce,
 * checkout, product-sales or financial endpoints.
 *
 * =========================================================
 */

const express = require("express");

const creatorController = require("../controllers/creators/creatorController");
const textToImageController = require(
  "../controllers/creators/textToImageController"
);

const { protect, authorize } = require("../middlewares/authMiddleware");

const {
  uploadPreview,
  uploadCreatorGallery,
} = require("../middlewares/upload");

const router = express.Router();

const MAX_CREATOR_GALLERY_FILES = 6;

/* =========================================================
   Validate Controller Handlers
   ========================================================= */

function requireHandler(name, handler) {
  if (typeof handler !== "function") {
    throw new TypeError(
      `Creator route handler "${name}" is missing or is not a function.`,
    );
  }

  return handler;
}

/* =========================================================
   Validate Upload Middleware
   ========================================================= */

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

/* =========================================================
   Configure Upload Handlers
   =========================================================
 *
 * Single preview:
 * - Zero or one image
 * - Fashion Editor and legacy uploads
 *
 * Creator gallery:
 * - Zero to six images
 * - Manual Creator Studio only
 *
 * ========================================================= */

const singlePreviewUpload = uploadPreview.single("preview");

const creatorGalleryUpload = uploadCreatorGallery.array(
  "preview",
  MAX_CREATOR_GALLERY_FILES,
);

/* =========================================================
   Shared Upload Error Handler
   ========================================================= */

function sendUploadError(error, res, kind) {
  if (res.headersSent) {
    return;
  }

  const gallery = kind === "gallery";

  const noun = gallery ? "gallery image" : "preview image";

  switch (error?.code) {
    /* -----------------------------------------------------
       File Exceeds 5 MB
       ----------------------------------------------------- */

    case "LIMIT_FILE_SIZE":
      return res.status(413).json({
        status: "error",
        code: "PREVIEW_TOO_LARGE",
        message: `Each ${noun} must be 5 MB or smaller.`,
      });

    /* -----------------------------------------------------
       Unexpected Field or Excess Images
       ----------------------------------------------------- */

    case "LIMIT_UNEXPECTED_FILE":
      return res.status(400).json({
        status: "error",
        code: "UNEXPECTED_UPLOAD_FIELD",
        message: gallery
          ? 'Only up to six images in the field "preview" are accepted.'
          : 'Only one optional image field named "preview" is accepted.',
      });

    /* -----------------------------------------------------
       File and Multipart Limits
       ----------------------------------------------------- */

    case "LIMIT_FILE_COUNT":
    case "LIMIT_PART_COUNT":
      return res.status(400).json({
        status: "error",
        code: "UPLOAD_LIMIT_EXCEEDED",
        message: "The upload contains too many files or multipart parts.",
      });

    /* -----------------------------------------------------
       Multipart Field Limits
       ----------------------------------------------------- */

    case "LIMIT_FIELD_COUNT":
    case "LIMIT_FIELD_KEY":
    case "LIMIT_FIELD_VALUE":
      return res.status(400).json({
        status: "error",
        code: "INVALID_MULTIPART_REQUEST",
        message: "One or more multipart fields exceed the allowed limits.",
      });

    /* -----------------------------------------------------
       Image Validation
       ----------------------------------------------------- */

    case "INVALID_IMAGE_TYPE":
    case "INVALID_IMAGE_FILE":
    case "INVALID_FILE_NAME":
      return res.status(400).json({
        status: "error",
        code: error.code,
        message: error.message || "The uploaded image is invalid.",
      });

    /* -----------------------------------------------------
       Unknown Upload or Cloudinary Error
       ----------------------------------------------------- */

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

/* =========================================================
   Safe Single Preview Upload
   =========================================================
 *
 * Retained for existing single-preview workflows.
 *
 * ========================================================= */

function safePreviewUpload(req, res, next) {
  singlePreviewUpload(req, res, (error) => {
    if (error) {
      return sendUploadError(error, res, "preview");
    }

    return next();
  });
}

/* =========================================================
   NEW: Safe Creator Gallery Upload
   =========================================================
 *
 * Accepts 0 to 6 uploaded images.
 *
 * Successful upload:
 *
 * req.files = [
 *   { path, filename, mimetype, size, ... },
 *   ...
 * ]
 *
 * The gallery controller must:
 *
 * - Validate all files
 * - Save ordered design_images records
 * - Preserve the cover image
 * - Remove orphaned Cloudinary assets if DB work fails
 *
 * On Multer parser failures, Multer attempts cleanup
 * through the storage adapter. Adapter cleanup must
 * be verified during integration testing.
 *
 * ========================================================= */

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

/* =========================================================
   Gallery Controller Compatibility
   =========================================================
 *
 * Existing creatorController.uploadCreatorStudioAsset
 * currently handles the single-image workflow.
 *
 * To avoid silently discarding additional uploaded files,
 * we will activate six-image uploads only when the
 * controller exports:
 *
 * uploadCreatorStudioGalleryAsset
 *
 * Until then:
 *
 * - Single-image uploads keep working.
 * - Metadata-only uploads keep working.
 * - Multiple-image requests remain rejected.
 *
 * After the controller update:
 *
 * - The gallery middleware accepts up to six images.
 * - The new controller saves all selected files.
 * - Fashion Editor continues using the old handler.
 *
 * This compatibility decision is made at server startup.
 *
 * ========================================================= */

const galleryReady =
  typeof creatorController.uploadCreatorStudioGalleryAsset === "function";

/* =========================================================
   Global Creator Authentication
   =========================================================
 *
 * Must run before all Creator routes and upload middleware.
 *
 * ========================================================= */

router.use(requireHandler("protect", protect));

router.use(requireHandler("authorize('creator')", authorize("creator")));

/* =========================================================
   Creator Studio Categories
   =========================================================
 *
 * GET /api/v1/creators/studio/categories
 *
 * ========================================================= */

router.get(
  "/studio/categories",

  requireHandler(
    "creatorController.getCreatorStudioCategories",
    creatorController.getCreatorStudioCategories,
  ),
);

/* =========================================================
   Creator Studio Asset Library
   =========================================================
 *
 * GET /api/v1/creators/studio/assets
 *
 * Owner-only.
 *
 * Includes:
 *
 * - Private creations
 * - Public creations
 * - Manual uploads
 * - Fashion Editor publications
 *
 * ========================================================= */

router.get(
  "/studio/assets",

  requireHandler(
    "creatorController.getMyCreatorStudioAssets",
    creatorController.getMyCreatorStudioAssets,
  ),
);

/* =========================================================
   Creator Studio Upload — Version 5.7
   =========================================================
 *
 * POST /api/v1/creators/studio/upload
 *
 * MANUAL CREATOR STUDIO ONLY
 *
 * New gallery behavior:
 *
 * - 0 to 6 optional image files
 * - Same multipart field: preview
 * - Optional title, description and metadata
 * - One parent designs record
 * - Up to six design_images records
 * - One Public/Private visibility setting
 *
 * Private remains the default.
 *
 * SECURITY:
 *
 * The gallery controller must enforce server-side
 * validation, transactional database writes and
 * Cloudinary cleanup.
 *
 * ========================================================= */

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

/* =========================================================
   Creator Studio Asset Visibility
   =========================================================
 *
 * PATCH
 * /api/v1/creators/studio/assets/:designId/visibility
 *
 * Request:
 *
 * {
 *   "visibility": "public"
 * }
 *
 * or:
 *
 * {
 *   "visibility": "private"
 * }
 *
 * Only the owner may change visibility.
 *
 * Never trust browser-submitted:
 *
 * - is_public
 * - is_published
 * - owner_id
 * - source_type
 *
 * Changing visibility must preserve images,
 * creation metadata and ownership.
 *
 * ========================================================= */

router.patch(
  "/studio/assets/:designId/visibility",

  requireHandler(
    "creatorController.updateCreatorStudioAssetVisibility",
    creatorController.updateCreatorStudioAssetVisibility,
  ),
);

/* =========================================================
   Creator Fashion Editor Projects
   =========================================================
 *
 * GET /api/v1/creators/editor-projects
 * POST /api/v1/creators/editor-projects
 *
 * Creating a project never automatically publishes it.
 *
 * ========================================================= */

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

/* =========================================================
   Fashion Editor → Showcase Share
   =========================================================
 *
 * POST
 * /api/v1/creators/editor-projects/:projectId/share
 *
 * IMPORTANT:
 *
 * Fashion Editor sharing continues to accept
 * at most ONE optional preview image.
 *
 * It is not switched to the six-image gallery flow.
 *
 * Existing behavior preserved:
 *
 * - Editor project ownership
 * - New publication visibility policy
 * - Re-share metadata preservation
 * - Allow Remix
 * - Showcase discovery metadata
 * - Existing publication updates
 *
 * ========================================================= */

router.post(
  "/editor-projects/:projectId/share",

  safePreviewUpload,

  requireHandler(
    "creatorController.uploadCreatorStudioAsset",
    creatorController.uploadCreatorStudioAsset,
  ),
);

/* =========================================================
   Creator Fashion Editor Project Detail
   =========================================================
 *
 * GET /api/v1/creators/editor-projects/:projectId
 * PUT /api/v1/creators/editor-projects/:projectId
 *
 * Ownership enforced by the controller.
 *
 * ========================================================= */

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

/* =========================================================
   Public Showcase → Fashion Editor
   =========================================================
 *
 * POST
 * /api/v1/creators/showcase/:designId/open-in-editor
 *
 * Eligible public + published Showcase designs can be
 * opened by any authenticated Creator.
 *
 * Source designs can belong to Creators or Designers.
 *
 * The original source must remain unchanged.
 *
 * No preview upload middleware is required.
 *
 * ========================================================= */

router.post(
  "/showcase/:designId/open-in-editor",

  requireHandler(
    "creatorController.openShowcaseDesignInEditor",
    creatorController.openShowcaseDesignInEditor,
  ),
);

/* =========================================================
   Legacy Creator Showcase Remix
   =========================================================
 *
 * POST
 * /api/v1/creators/showcase/:designId/remix
 *
 * Preserve backward compatibility.
 *
 * The controller still applies the existing public,
 * published, editable and remix eligibility rules.
 *
 * ========================================================= */

router.post(
  "/showcase/:designId/remix",

  requireHandler(
    "creatorController.remixCreatorShowcaseDesign",
    creatorController.remixCreatorShowcaseDesign,
  ),
);


router.post(
  "/ai/text-to-image",
  textToImageController.start
);

router.get(
  "/ai/text-to-image/history",
  textToImageController.history
);

router.get(
  "/ai/text-to-image/:jobId",
  textToImageController.status
);

/* =========================================================
   Export
   ========================================================= */

module.exports = router;
