"use strict";

/*
 * =========================================================
 * DesignByYou / FashionVision
 * Creator Background Remover Controller
 * Version 1.0
 * =========================================================
 *
 * PURPOSE
 * ---------------------------------------------------------
 * - Validate Creator image upload from Multer memoryStorage
 * - Apply additional server-side image checks with Sharp
 * - Normalize / optimize input before sending to FASHN
 * - Enforce temporary in-memory per-Creator usage limits
 * - Return a transparent PNG result as base64 data URI
 *
 * SECURITY
 * ---------------------------------------------------------
 * - Creator authentication is handled by route middleware
 * - Creator verified-email requirement is handled by routes
 * - Uploaded file is never written to local disk
 * - No database write occurs in this initial version
 * - No Cloudinary upload occurs in this initial version
 *
 * INITIAL SCOPE
 * ---------------------------------------------------------
 * POST /api/v1/creator-tools/background-remove
 *
 * Request:
 * multipart/form-data
 * field name: image
 *
 * Response:
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
 *
 * =========================================================
 */

const sharp = require("sharp");

const {
  removeBackground,
  BACKGROUND_REMOVE_MODEL,
} = require("../../services/FashnBackgroundRemoverService");

/*
 * =========================================================
 * Temporary Usage Limit Configuration
 *
 * NOTE:
 * This is in-memory only.
 * It resets when the Node process restarts.
 * It is NOT a distributed quota system.
 * =========================================================
 */

const USAGE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 10;

const creatorUsageWindows = new Map();

/*
 * =========================================================
 * Image Validation / Optimization Configuration
 * =========================================================
 */

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const MIN_IMAGE_DIMENSION = 128;
const MAX_INPUT_WIDTH = 2048;
const MAX_INPUT_HEIGHT = 2048;

/*
 * =========================================================
 * Error Helper
 * =========================================================
 */

function createHttpError(message, statusCode, code) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.status = statusCode >= 500 ? "error" : "fail";
  error.code = code;

  return error;
}

/*
 * =========================================================
 * Usage Window Helpers
 * =========================================================
 */

function getCreatorUsageState(creatorId) {
  const now = Date.now();

  const existing = creatorUsageWindows.get(creatorId);

  if (!existing || now >= existing.windowStart + USAGE_WINDOW_MS) {
    const fresh = {
      windowStart: now,
      count: 0,
    };

    creatorUsageWindows.set(creatorId, fresh);

    return fresh;
  }

  return existing;
}

function cleanupExpiredUsageWindows() {
  const now = Date.now();

  for (const [creatorId, state] of creatorUsageWindows.entries()) {
    if (now >= state.windowStart + USAGE_WINDOW_MS) {
      creatorUsageWindows.delete(creatorId);
    }
  }
}

function enforceUsageLimit(creatorId) {
  cleanupExpiredUsageWindows();

  const state = getCreatorUsageState(creatorId);

  if (state.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfterMs = state.windowStart + USAGE_WINDOW_MS - Date.now();

    const error = createHttpError(
      "You have reached the hourly Background Remover limit. Please try again later.",
      429,
      "BACKGROUND_REMOVE_LIMIT_REACHED",
    );

    error.retryAfterMs = Math.max(0, retryAfterMs);

    throw error;
  }

  return state;
}

function incrementUsage(creatorId) {
  const state = getCreatorUsageState(creatorId);

  state.count += 1;

  return {
    used: state.count,
    remaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - state.count),
    windowStart: state.windowStart,
    windowEndsAt: state.windowStart + USAGE_WINDOW_MS,
  };
}

/*
 * =========================================================
 * File Validation
 * =========================================================
 */

function validateUploadedFile(file) {
  if (!file) {
    throw createHttpError(
      "Please upload one image using the image field.",
      400,
      "IMAGE_REQUIRED",
    );
  }

  const mimeType = String(file.mimetype || "")
    .trim()
    .toLowerCase();

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw createHttpError(
      "Only JPG, PNG, and WEBP images are allowed.",
      400,
      "INVALID_IMAGE_TYPE",
    );
  }

  const size = Number(file.size || 0);

  if (!Number.isFinite(size) || size <= 0) {
    throw createHttpError(
      "The uploaded image is empty or invalid.",
      400,
      "INVALID_IMAGE_FILE",
    );
  }

  if (size > MAX_IMAGE_BYTES) {
    throw createHttpError(
      "The uploaded image must be 12 MB or smaller.",
      413,
      "IMAGE_TOO_LARGE",
    );
  }

  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw createHttpError(
      "The uploaded image could not be read.",
      400,
      "INVALID_IMAGE_BUFFER",
    );
  }
}

/*
 * =========================================================
 * Image Preprocessing
 * =========================================================
 */

async function preprocessImage(file) {
  let image;
  let metadata;

  try {
    image = sharp(file.buffer, {
      failOn: "error",
      pages: 1,
    }).rotate();

    metadata = await image.metadata();
  } catch (error) {
    throw createHttpError(
      "The uploaded file is not a valid supported image.",
      400,
      "INVALID_IMAGE_CONTENT",
    );
  }

  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);

  if (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION) {
    throw createHttpError(
      `The uploaded image must be at least ${MIN_IMAGE_DIMENSION} × ${MIN_IMAGE_DIMENSION} pixels.`,
      400,
      "IMAGE_TOO_SMALL",
    );
  }

  if (Number.isInteger(metadata.pages) && metadata.pages > 1) {
    throw createHttpError(
      "Animated or multi-page images are not supported.",
      400,
      "UNSUPPORTED_IMAGE_VARIANT",
    );
  }

  /*
   * Normalize orientation and cap dimensions.
   * We avoid enlarging smaller images.
   */

  const resized = image.resize({
    width: MAX_INPUT_WIDTH,
    height: MAX_INPUT_HEIGHT,
    fit: "inside",
    withoutEnlargement: true,
  });

  /*
   * Use PNG for images with transparency,
   * otherwise use JPEG for smaller payloads.
   */

  const hasAlpha = Boolean(metadata.hasAlpha);

  let outputBuffer;
  let outputMimeType;

  try {
    if (hasAlpha) {
      outputMimeType = "image/png";

      outputBuffer = await resized
        .png({
          compressionLevel: 9,
          adaptiveFiltering: true,
          palette: false,
        })
        .toBuffer();
    } else {
      outputMimeType = "image/jpeg";

      outputBuffer = await resized
        .jpeg({
          quality: 90,
          mozjpeg: true,
          chromaSubsampling: "4:4:4",
        })
        .toBuffer();
    }
  } catch (error) {
    throw createHttpError(
      "The uploaded image could not be prepared for AI processing.",
      500,
      "IMAGE_PREPARATION_FAILED",
    );
  }

  /*
   * Read normalized output metadata for transparency,
   * width/height reporting, etc.
   */

  let normalizedMetadata;

  try {
    normalizedMetadata = await sharp(outputBuffer, {
      failOn: "error",
      pages: 1,
    }).metadata();
  } catch (error) {
    throw createHttpError(
      "The prepared image could not be validated.",
      500,
      "PREPARED_IMAGE_INVALID",
    );
  }

  const dataUri = `data:${outputMimeType};base64,${outputBuffer.toString("base64")}`;

  return {
    dataUri,
    outputMimeType,
    outputBytes: outputBuffer.length,
    width: Number(normalizedMetadata.width || width),
    height: Number(normalizedMetadata.height || height),
    originalMimeType: String(file.mimetype || "")
      .trim()
      .toLowerCase(),
    originalBytes: file.size,
  };
}

/*
 * =========================================================
 * Controller
 * =========================================================
 */

async function removeCreatorImageBackground(req, res, next) {
  try {
    const creatorId = String(req?.user?.id || "").trim();

    if (!creatorId) {
      throw createHttpError(
        "Authentication is required.",
        401,
        "UNAUTHENTICATED",
      );
    }

    validateUploadedFile(req.file);

    /*
     * Prevent wasteful provider usage before preprocessing.
     */

    enforceUsageLimit(creatorId);

    const preparedImage = await preprocessImage(req.file);

    const result = await removeBackground(preparedImage.dataUri);

    const usage = incrementUsage(creatorId);

    return res.status(200).json({
      status: "success",
      message: "Background removed successfully.",
      data: {
        image: result.dataUri,
        prediction_id: result.predictionId,
        provider: "fashn",
        model: BACKGROUND_REMOVE_MODEL,
        output_format: "png",
        temporary: true,

        /*
         * Helpful metadata for debugging and future UI usage.
         */

        input: {
          original_mime_type: preparedImage.originalMimeType,
          original_bytes: preparedImage.originalBytes,
          processed_mime_type: preparedImage.outputMimeType,
          processed_bytes: preparedImage.outputBytes,
          width: preparedImage.width,
          height: preparedImage.height,
        },

        usage: {
          limit: MAX_REQUESTS_PER_WINDOW,
          used: usage.used,
          remaining: usage.remaining,
          window_started_at: new Date(usage.windowStart).toISOString(),
          window_ends_at: new Date(usage.windowEndsAt).toISOString(),
        },
      },
    });
  } catch (error) {
    /*
     * Service-layer provider errors use httpStatus.
     * Normalize them to this app's error format.
     */

    if (Number.isInteger(error?.httpStatus) && !error.statusCode) {
      error.statusCode = error.httpStatus;
    }

    if (!error.status) {
      error.status = (error.statusCode || 500) >= 500 ? "error" : "fail";
    }

    /*
     * A small convenience for clients that want retry timing.
     */

    if (
      error?.code === "BACKGROUND_REMOVE_LIMIT_REACHED" &&
      Number.isFinite(error?.retryAfterMs)
    ) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil(error.retryAfterMs / 1000)),
      );
    }

    return next(error);
  }
}

/*
 * =========================================================
 * Exports
 * =========================================================
 */

module.exports = {
  removeCreatorImageBackground,
};
