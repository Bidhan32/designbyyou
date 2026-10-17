"use strict";

/*
 * =========================================================
 * DesignByYou / FashionVision
 * Creator Background Remover Routes
 * Version 1.0
 * =========================================================
 *
 * PURPOSE
 * ---------------------------------------------------------
 * Creator-only AI Background Remover endpoint.
 *
 * ENDPOINT
 * ---------------------------------------------------------
 * POST /api/v1/creator-tools/background-remove
 *
 * Content-Type:
 * multipart/form-data
 *
 * Required file field:
 * image
 *
 * SECURITY
 * ---------------------------------------------------------
 * 1. JWT authentication required
 * 2. Creator role required
 * 3. Verified email required
 * 4. Image stored temporarily in memory
 * 5. JPEG, PNG and WEBP only
 * 6. Maximum upload size: 12 MB
 * 7. One active generation per Creator per Node process
 * 8. Temporary per-Creator attempt rate limiting
 * 9. No permanent upload or database changes
 *
 * IMPORTANT
 * ---------------------------------------------------------
 * This route does NOT modify:
 *
 * - Existing Virtual Try-On routes
 * - Booking information
 * - Creator or Designer wallets
 * - Stripe integrations
 * - Cloudinary uploads
 * - Fashion Editor projects
 *
 * =========================================================
 */

const express = require("express");
const multer = require("multer");

const creatorBackgroundRemoverController = require("../controllers/creators/creatorBackgroundRemoverController");

const {
  protect,
  authorize,
  requireVerifiedEmail,
} = require("../middlewares/authMiddleware");

const router = express.Router();

/*
 * =========================================================
 * Configuration
 * =========================================================
 */

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/*
 * Temporary protection against excessive submissions.
 *
 * This counts attempts, including failed uploads.
 * The controller separately limits successful generations.
 *
 * IMPORTANT:
 * These limits operate within one Node.js process.
 * Production must eventually use distributed rate limiting
 * and durable AI-credit accounting.
 */

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const MAX_ATTEMPTS_PER_WINDOW = 20;

const creatorAttempts = new Map();

const activeCreatorGenerations = new Set();

let lastRateLimitCleanup = 0;

/*
 * =========================================================
 * Response Helper
 * =========================================================
 */

function sendError(res, statusCode, message, code = "BACKGROUND_REMOVE_ERROR") {
  return res.status(statusCode).json({
    status: "error",
    code,
    message,
  });
}

/*
 * =========================================================
 * Image Upload Error Helper
 * =========================================================
 */

function createUploadError(message, code) {
  const error = new Error(message);

  error.code = code;
  error.statusCode = 400;

  return error;
}

/*
 * =========================================================
 * Multer Memory Storage
 *
 * The image is not saved to local disk.
 * =========================================================
 */

const storage = multer.memoryStorage();

/*
 * =========================================================
 * Image File Filter
 *
 * MIME validation here is an initial validation layer.
 * The controller also uses Sharp to decode and validate
 * actual image content.
 * =========================================================
 */

function imageFileFilter(req, file, callback) {
  const mimeType = String(file?.mimetype || "")
    .trim()
    .toLowerCase();

  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    return callback(
      createUploadError(
        "Only JPG, PNG and WEBP image files are supported.",
        "INVALID_IMAGE_TYPE",
      ),
    );
  }

  const originalName = String(file?.originalname || "");

  if (originalName.length > 255 || originalName.includes("\0")) {
    return callback(
      createUploadError(
        "The uploaded filename is invalid.",
        "INVALID_IMAGE_FILENAME",
      ),
    );
  }

  return callback(null, true);
}

/*
 * =========================================================
 * Multer Configuration
 * =========================================================
 */

const backgroundImageUpload = multer({
  storage,

  limits: {
    fileSize: MAX_IMAGE_BYTES,

    files: 1,

    fields: 3,

    parts: 4,

    fieldNameSize: 100,

    fieldSize: 1024,
  },

  fileFilter: imageFileFilter,
});

/*
 * =========================================================
 * Upload Middleware
 *
 * Expected field:
 * image
 *
 * Multer errors are returned as structured JSON.
 * =========================================================
 */

function uploadBackgroundImage(req, res, next) {
  backgroundImageUpload.single("image")(req, res, (error) => {
    if (!error) {
      if (req.aborted || res.destroyed) {
        return;
      }

      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return sendError(
          res,
          413,
          "The image must be 12 MB or smaller.",
          "IMAGE_TOO_LARGE",
        );
      }

      if (error.code === "LIMIT_UNEXPECTED_FILE") {
        return sendError(
          res,
          400,
          "Upload exactly one image using the image field.",
          "UNEXPECTED_UPLOAD_FIELD",
        );
      }

      if (error.code === "LIMIT_FILE_COUNT") {
        return sendError(
          res,
          400,
          "Only one image may be uploaded.",
          "TOO_MANY_IMAGES",
        );
      }

      if (
        error.code === "LIMIT_FIELD_COUNT" ||
        error.code === "LIMIT_PART_COUNT" ||
        error.code === "LIMIT_FIELD_VALUE" ||
        error.code === "LIMIT_FIELD_KEY"
      ) {
        return sendError(
          res,
          400,
          "The upload contains too many or oversized fields.",
          "INVALID_MULTIPART_REQUEST",
        );
      }

      return sendError(
        res,
        400,
        "The uploaded image could not be processed.",
        "IMAGE_UPLOAD_FAILED",
      );
    }

    if (
      error?.code === "INVALID_IMAGE_TYPE" ||
      error?.code === "INVALID_IMAGE_FILENAME"
    ) {
      return sendError(res, 400, error.message, error.code);
    }

    console.error("Background Remover upload error:", {
      code: error?.code || null,
      message: error?.message || null,
    });

    return sendError(
      res,
      500,
      "Unable to prepare the uploaded image.",
      "IMAGE_UPLOAD_FAILED",
    );
  });
}

/*
 * =========================================================
 * Validate Content Type
 * =========================================================
 */

function requireMultipartFormData(req, res, next) {
  if (!req.is("multipart/form-data")) {
    return sendError(
      res,
      415,
      "Please upload an image using multipart/form-data.",
      "UNSUPPORTED_CONTENT_TYPE",
    );
  }

  return next();
}

/*
 * =========================================================
 * Temporary Request Rate Limiter
 *
 * Counts attempts rather than just completed generations.
 *
 * The controller also has its own separate successful-
 * generation limit.
 * =========================================================
 */

function cleanupExpiredRateLimits(now) {
  if (now - lastRateLimitCleanup < 5 * 60 * 1000) {
    return;
  }

  lastRateLimitCleanup = now;

  for (const [creatorId, state] of creatorAttempts.entries()) {
    if (now - state.windowStart >= RATE_LIMIT_WINDOW_MS) {
      creatorAttempts.delete(creatorId);
    }
  }
}

function limitCreatorAttempts(req, res, next) {
  const creatorId = String(req?.user?.id || "").trim();

  if (!creatorId) {
    return sendError(
      res,
      401,
      "Authentication is required.",
      "UNAUTHENTICATED",
    );
  }

  const now = Date.now();

  cleanupExpiredRateLimits(now);

  let state = creatorAttempts.get(creatorId);

  if (!state || now - state.windowStart >= RATE_LIMIT_WINDOW_MS) {
    state = {
      windowStart: now,
      attempts: 0,
    };

    creatorAttempts.set(creatorId, state);
  }

  if (state.attempts >= MAX_ATTEMPTS_PER_WINDOW) {
    const remainingMs = Math.max(
      0,
      state.windowStart + RATE_LIMIT_WINDOW_MS - now,
    );

    res.setHeader("Retry-After", String(Math.ceil(remainingMs / 1000)));

    return sendError(
      res,
      429,
      "You have reached the hourly request limit. Please try again later.",
      "BACKGROUND_REMOVE_RATE_LIMITED",
    );
  }

  state.attempts += 1;

  return next();
}

/*
 * =========================================================
 * Concurrent Generation Protection
 *
 * Prevents overlapping requests from the same Creator.
 *
 * A lock is reserved BEFORE image preprocessing begins,
 * preventing rapid duplicate requests.
 *
 * The lock is kept while AI generation runs, even if the
 * browser disconnects before the controller finishes.
 * =========================================================
 */

function preventConcurrentGeneration(req, res, next) {
  const creatorId = String(req?.user?.id || "").trim();

  if (!creatorId) {
    return sendError(
      res,
      401,
      "Authentication is required.",
      "UNAUTHENTICATED",
    );
  }

  if (activeCreatorGenerations.has(creatorId)) {
    return sendError(
      res,
      429,
      "A background removal is already running. Please wait for it to finish.",
      "BACKGROUND_REMOVE_ALREADY_RUNNING",
    );
  }

  activeCreatorGenerations.add(creatorId);

  let released = false;
  let processingStarted = false;

  const release = () => {
    if (released) {
      return;
    }

    released = true;

    activeCreatorGenerations.delete(creatorId);
  };

  /*
   * If upload parsing fails or the connection closes
   * before generation begins, release the lock.
   *
   * If the controller has begun processing, release only
   * after the controller promise settles.
   */

  const releaseIfNotProcessing = () => {
    if (!processingStarted) {
      release();
    }
  };

  res.once("finish", releaseIfNotProcessing);

  res.once("close", releaseIfNotProcessing);

  res.locals.backgroundRemoverLock = {
    markProcessing() {
      processingStarted = true;
    },

    release,
  };

  return next();
}

/*
 * =========================================================
 * Controller Runner
 *
 * Guarantees that the Creator's active-generation lock
 * is released when the controller finishes or throws.
 * =========================================================
 */

function runBackgroundRemover(req, res, next) {
  const lock = res.locals.backgroundRemoverLock;

  lock?.markProcessing();

  Promise.resolve()
    .then(() =>
      creatorBackgroundRemoverController.removeCreatorImageBackground(
        req,
        res,
        next,
      ),
    )
    .catch(next)
    .finally(() => {
      lock?.release();
    });
}

/*
 * =========================================================
 * Global Route Protection
 * =========================================================
 *
 * Middleware order:
 *
 * protect
 *   ↓
 * authorize("creator")
 *   ↓
 * requireVerifiedEmail
 *
 * Creators do not require admin approval.
 * =========================================================
 */

router.use(protect);

router.use(authorize("creator"));

router.use(requireVerifiedEmail);

/*
 * Prevent intermediate caches from storing generated
 * images, private request errors or user-specific data.
 */

router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, private");

  res.setHeader("Pragma", "no-cache");

  return next();
});

/*
 * =========================================================
 * POST — Remove Image Background
 *
 * Full URL:
 * /api/v1/creator-tools/background-remove
 *
 * Content-Type:
 * multipart/form-data
 *
 * File field:
 * image
 *
 * Expected response:
 *
 * {
 *   status: "success",
 *   message: "Background removed successfully.",
 *   data: {
 *     image: "data:image/png;base64,...",
 *     prediction_id: "...",
 *     provider: "fashn",
 *     model: "background-remove",
 *     output_format: "png",
 *     temporary: true
 *   }
 * }
 * =========================================================
 */

router.post(
  "/background-remove",

  requireMultipartFormData,

  preventConcurrentGeneration,

  limitCreatorAttempts,

  uploadBackgroundImage,

  runBackgroundRemover,
);

/*
 * =========================================================
 * Export
 * =========================================================
 */

module.exports = router;
