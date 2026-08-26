"use strict";

/*
=========================================================
DesignByYou
FASHN AI Virtual Try-On Controller
Version 1.1
=========================================================

PURPOSE
---------------------------------------------------------

Allows the CREATOR who owns a booking to virtually try on
a Designer-submitted prototype or final garment.

INPUT
---------------------------------------------------------

Multipart request:

person_image
  Creator's own photo.
  Handled in memory by Multer.

phase
  "prototype"
  OR
  "final"

category
  Optional:
  "auto"
  "tops"
  "bottoms"
  "one-pieces"

GARMENT SOURCE
---------------------------------------------------------

prototype
→ bookings.prototype_tryon_image_url

final
→ bookings.delivery_tryon_image_url

PRIVACY
---------------------------------------------------------

Creator photo:

- is NOT written to PostgreSQL
- is NOT written to local uploads
- is optimized directly in memory
- is converted directly from memory to a data URI
- is sent to FASHN
- generated output is requested as base64

=========================================================
IMPORTANT
=========================================================

This controller DOES NOT modify:

- Stripe
- escrow
- booking status
- payouts
- wallet balances
- project revisions
- designer earnings

It is a read-only booking integration plus an external
FASHN generation request.
=========================================================
*/

const db = require("../../config/db");

const sharp = require("sharp");

/*=========================================================
FASHN Configuration
=========================================================*/

const FASHN_BASE_URL = "https://api.fashn.ai/v1";

const FASHN_MODEL = "tryon-v1.6";

/*
Balanced is FASHN v1.6's normal middle-ground mode.

Optional backend environment override:

FASHN_TRYON_MODE=performance
FASHN_TRYON_MODE=balanced
FASHN_TRYON_MODE=quality
*/

const ALLOWED_FASHN_MODES = new Set(["performance", "balanced", "quality"]);

const configuredMode = String(process.env.FASHN_TRYON_MODE || "balanced")
  .trim()
  .toLowerCase();

const FASHN_TRYON_MODE = ALLOWED_FASHN_MODES.has(configuredMode)
  ? configuredMode
  : "balanced";

/*
We deliberately generate one image per request.

FASHN v1.6 charges per output, so keeping this at one
prevents accidental multi-credit generation.
*/

const FASHN_NUM_SAMPLES = 1;

const FASHN_OUTPUT_FORMAT = "jpeg";

/*
Privacy-oriented output.

FASHN returns a data:image/jpeg;base64,... value rather
than a persistent CDN result URL.
*/

const FASHN_RETURN_BASE64 = true;

/*=========================================================
Polling Configuration
=========================================================*/

const POLL_INTERVAL_MS = 2000;

const MAX_POLL_TIME_MS = 60000;

/*
Individual outbound HTTP requests to FASHN may occasionally
take longer than expected.

This is separate from the prediction polling duration.
*/

const FASHN_HTTP_TIMEOUT_MS = 60000;

/*=========================================================
Creator Upload Configuration
=========================================================*/

/*
The route will also enforce the Multer upload limit.

This controller checks it again as defense in depth.

12 MiB is sufficient for normal phone photos.

The original upload may be this large, but it is optimized
in memory before being converted to Base64 and sent to
FASHN.
*/

const MAX_PERSON_IMAGE_BYTES = 12 * 1024 * 1024;

const ALLOWED_PERSON_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/*=========================================================
Creator Image Optimization
=========================================================*/

/*
Large phone-camera images can become significantly larger
when converted directly to Base64.

Before sending the Creator photo to FASHN:

- respect EXIF orientation
- resize to fit within 1280 x 1600
- never enlarge small images
- convert to JPEG
- compress at quality 82

The image remains entirely in memory.
*/

const PERSON_IMAGE_MAX_WIDTH = 1280;

const PERSON_IMAGE_MAX_HEIGHT = 1600;

const PERSON_IMAGE_JPEG_QUALITY = 82;

const PERSON_IMAGE_OUTPUT_MIME = "image/jpeg";

/*=========================================================
Virtual Try-On Options
=========================================================*/

const ALLOWED_PHASES = new Set(["prototype", "final"]);

const ALLOWED_CATEGORIES = new Set(["auto", "tops", "bottoms", "one-pieces"]);

/*=========================================================
Generic Helpers
=========================================================*/

function cleanText(value, maximumLength = 5000) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function normalizeValue(value) {
  return cleanText(value, 100).toLowerCase();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );
}

function getAuthenticatedUserId(req) {
  return req?.user?.id || null;
}

function getAuthenticatedRole(req) {
  return normalizeValue(req?.user?.role);
}

function sendError(res, statusCode, message, code = null) {
  return res.status(statusCode).json({
    status: "error",

    ...(code
      ? {
          code,
        }
      : {}),

    message,
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/*=========================================================
Image Helpers
=========================================================*/

async function personImageToDataUri(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    return null;
  }

  const mimeType = normalizeValue(file.mimetype);

  if (!ALLOWED_PERSON_IMAGE_TYPES.has(mimeType)) {
    return null;
  }

  try {
    /*
      Optimize the Creator photo before converting it to
      Base64.

      The original file never touches disk.

      rotate()
      → respects EXIF orientation

      resize()
      → limits dimensions while maintaining aspect ratio

      withoutEnlargement
      → prevents smaller photos from being upscaled

      jpeg()
      → creates a significantly smaller request payload
    */

    const optimizedBuffer = await sharp(file.buffer)
      .rotate()
      .resize({
        width: PERSON_IMAGE_MAX_WIDTH,

        height: PERSON_IMAGE_MAX_HEIGHT,

        fit: "inside",

        withoutEnlargement: true,
      })
      .jpeg({
        quality: PERSON_IMAGE_JPEG_QUALITY,

        mozjpeg: true,
      })
      .toBuffer();

    if (!Buffer.isBuffer(optimizedBuffer) || optimizedBuffer.length === 0) {
      return null;
    }

    const encoded = optimizedBuffer.toString("base64");

    if (!encoded) {
      return null;
    }

    return `data:${PERSON_IMAGE_OUTPUT_MIME};base64,${encoded}`;
  } catch (error) {
    /*
      Do not log the photo contents.

      Only record the image-processing error message.
    */

    console.error("Virtual Try-On image optimization failed:", {
      message: error?.message || "Unknown image optimization error.",
    });

    return null;
  }
}

function parseGarmentUrl(value) {
  const cleaned = cleanText(value, 5000);

  if (!cleaned) {
    return null;
  }

  try {
    const parsed = new URL(cleaned);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function isPrivateIpv4(hostname) {
  const match = String(hostname || "").match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );

  if (!match) {
    return false;
  }

  const parts = match.slice(1).map(Number);

  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;

  return Boolean(
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168),
  );
}

function isPublicGarmentUrl(value) {
  const parsed = parseGarmentUrl(value);

  if (!parsed) {
    return false;
  }

  const hostname = parsed.hostname.trim().toLowerCase();

  if (!hostname) {
    return false;
  }

  if (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost") ||
    isPrivateIpv4(hostname)
  ) {
    return false;
  }

  return true;
}

/*=========================================================
FASHN Helpers
=========================================================*/

function getFashnApiKey() {
  return cleanText(process.env.FASHN_API_KEY, 10000);
}

function getFashnHeaders() {
  const apiKey = getFashnApiKey();

  if (!apiKey) {
    const error = new Error("FASHN_API_KEY is not configured.");

    error.statusCode = 503;

    error.code = "FASHN_NOT_CONFIGURED";

    throw error;
  }

  return {
    Authorization: `Bearer ${apiKey}`,

    "Content-Type": "application/json",
  };
}

/*=========================================================
Safe JSON Response Reader
=========================================================*/

async function readResponseBody(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      message: text.slice(0, 1000),
    };
  }
}

/*=========================================================
Timed Fetch
=========================================================*/

async function fashnFetch(url, options = {}) {
  if (typeof fetch !== "function") {
    const error = new Error(
      "This Node.js runtime does not provide the Fetch API.",
    );

    error.statusCode = 500;

    error.code = "FETCH_UNAVAILABLE";

    throw error;
  }

  const controller = new AbortController();

  const timer = setTimeout(
    () => {
      controller.abort();
    },

    FASHN_HTTP_TIMEOUT_MS,
  );

  try {
    return await fetch(url, {
      ...options,

      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("The FASHN request timed out.");

      timeoutError.code = "FASHN_HTTP_TIMEOUT";

      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/*=========================================================
FASHN Error Helpers
=========================================================*/

function extractFashnErrorMessage(data, fallback) {
  if (!data) {
    return fallback;
  }

  if (typeof data.error === "string") {
    return cleanText(data.error, 1000);
  }

  if (data.error && typeof data.error === "object") {
    return (
      cleanText(data.error.message, 1000) ||
      cleanText(data.error.name, 500) ||
      fallback
    );
  }

  return cleanText(data.message, 1000) || fallback;
}

/*=========================================================
Start FASHN Prediction
=========================================================*/

async function startPrediction({ personImage, garmentImage, category }) {
  const response = await fashnFetch(`${FASHN_BASE_URL}/run`, {
    method: "POST",

    headers: getFashnHeaders(),

    body: JSON.stringify({
      model_name: FASHN_MODEL,

      inputs: {
        model_image: personImage,

        garment_image: garmentImage,

        category,

        garment_photo_type: "auto",

        mode: FASHN_TRYON_MODE,

        num_samples: FASHN_NUM_SAMPLES,

        output_format: FASHN_OUTPUT_FORMAT,

        return_base64: FASHN_RETURN_BASE64,
      },
    }),
  });

  const data = await readResponseBody(response);

  if (!response.ok) {
    const error = new Error(
      extractFashnErrorMessage(
        data,
        "FASHN rejected the Virtual Try-On request.",
      ),
    );

    error.statusCode = response.status;

    error.code = "FASHN_REQUEST_REJECTED";

    error.providerData = data;

    throw error;
  }

  const predictionId = cleanText(data?.id, 500);

  if (!predictionId) {
    const error = new Error("FASHN did not return a prediction ID.");

    error.code = "FASHN_PREDICTION_ID_MISSING";

    error.providerData = data;

    throw error;
  }

  return predictionId;
}

/*=========================================================
Read FASHN Prediction Status
=========================================================*/

async function getPredictionStatus(predictionId) {
  const response = await fashnFetch(
    `${FASHN_BASE_URL}/status/${encodeURIComponent(predictionId)}`,
    {
      method: "GET",

      headers: getFashnHeaders(),
    },
  );

  const data = await readResponseBody(response);

  if (!response.ok) {
    const error = new Error(
      extractFashnErrorMessage(
        data,
        "Unable to read the FASHN prediction status.",
      ),
    );

    error.statusCode = response.status;

    error.code = "FASHN_STATUS_ERROR";

    error.providerData = data;

    throw error;
  }

  return data;
}

/*=========================================================
Poll Until Prediction Completes
=========================================================*/

async function waitForPrediction(predictionId) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < MAX_POLL_TIME_MS) {
    const prediction = await getPredictionStatus(predictionId);

    const status = normalizeValue(prediction?.status);

    if (status === "completed") {
      const outputs = Array.isArray(prediction.output)
        ? prediction.output.filter(
            (value) => typeof value === "string" && value.length > 0,
          )
        : [];

      if (outputs.length === 0) {
        const error = new Error(
          "FASHN completed the request but returned no generated image.",
        );

        error.code = "FASHN_OUTPUT_MISSING";

        error.providerData = prediction;

        throw error;
      }

      return {
        prediction,

        outputs,
      };
    }

    if (status === "failed") {
      const error = new Error(
        extractFashnErrorMessage(
          prediction,
          "The Virtual Try-On generation failed.",
        ),
      );

      error.code = "FASHN_GENERATION_FAILED";

      error.providerData = prediction;

      throw error;
    }

    if (!["starting", "in_queue", "processing"].includes(status)) {
      const error = new Error(
        `FASHN returned an unexpected prediction status: ${
          status || "unknown"
        }.`,
      );

      error.code = "FASHN_UNKNOWN_STATUS";

      error.providerData = prediction;

      throw error;
    }

    await wait(POLL_INTERVAL_MS);
  }

  const error = new Error(
    "Virtual Try-On is taking longer than expected. Please try again.",
  );

  error.statusCode = 504;

  error.code = "FASHN_POLL_TIMEOUT";

  throw error;
}

/*=========================================================
Load Creator Booking
=========================================================*/

async function loadCreatorBooking(bookingId) {
  const result = await db.query(
    `
      SELECT
        id,
        creator_id,
        designer_id,
        status,

        prototype_file_url,
        prototype_tryon_image_url,

        delivery_file_url,
        delivery_tryon_image_url,

        created_at,
        updated_at

      FROM bookings

      WHERE id = $1

      LIMIT 1
    `,
    [bookingId],
  );

  return result.rows[0] || null;
}

/*=========================================================
Resolve Garment Image
=========================================================*/

function getGarmentImageForPhase(booking, phase) {
  if (phase === "prototype") {
    return cleanText(booking?.prototype_tryon_image_url, 5000);
  }

  if (phase === "final") {
    return cleanText(booking?.delivery_tryon_image_url, 5000);
  }

  return "";
}

/*=========================================================
Public Controller
=========================================================*/

/*
POST
/api/v1/virtual-tryon/bookings/:bookingId

Expected multipart/form-data:

person_image = image file
phase        = prototype | final
category     = auto | tops | bottoms | one-pieces
*/

exports.generateBookingTryOn = async (req, res) => {
  const creatorId = getAuthenticatedUserId(req);

  const role = getAuthenticatedRole(req);

  const bookingId = cleanText(req.params?.bookingId || req.params?.id, 100);

  const phase = normalizeValue(req.body?.phase);

  const categoryInput = normalizeValue(req.body?.category || "auto");

  const category = categoryInput || "auto";

  /*=====================================================
    Authentication
    =====================================================*/

  if (!creatorId || !isUuid(creatorId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (role !== "creator") {
    return sendError(
      res,
      403,
      "Only creator accounts can use booking Virtual Try-On.",
    );
  }

  /*=====================================================
    Booking Validation
    =====================================================*/

  if (!isUuid(bookingId)) {
    return sendError(res, 400, "A valid booking ID is required.");
  }

  if (!ALLOWED_PHASES.has(phase)) {
    return sendError(res, 400, "phase must be either 'prototype' or 'final'.");
  }

  if (!ALLOWED_CATEGORIES.has(category)) {
    return sendError(
      res,
      400,
      "category must be 'auto', 'tops', 'bottoms', or 'one-pieces'.",
    );
  }

  /*=====================================================
    Person Image Validation
    =====================================================*/

  if (!req.file) {
    return sendError(
      res,
      400,
      "Please upload a photo using the person_image field.",
    );
  }

  const mimeType = normalizeValue(req.file?.mimetype);

  if (!ALLOWED_PERSON_IMAGE_TYPES.has(mimeType)) {
    return sendError(res, 400, "The person image must be JPEG, PNG, or WEBP.");
  }

  const fileSize = Number(req.file?.size || req.file?.buffer?.length || 0);

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return sendError(
      res,
      400,
      "The uploaded person image is empty or invalid.",
    );
  }

  if (fileSize > MAX_PERSON_IMAGE_BYTES) {
    return sendError(res, 413, "The person image must be 12 MB or smaller.");
  }

  /*=====================================================
    Provider Configuration
    =====================================================*/

  if (!getFashnApiKey()) {
    return sendError(
      res,
      503,
      "Virtual Try-On is temporarily unavailable.",
      "FASHN_NOT_CONFIGURED",
    );
  }

  try {
    /*===================================================
      Load Booking
      ===================================================*/

    const booking = await loadCreatorBooking(bookingId);

    if (!booking) {
      return sendError(res, 404, "The booking was not found.");
    }

    /*===================================================
      Creator Ownership
      ===================================================*/

    if (booking.creator_id !== creatorId) {
      return sendError(
        res,
        403,
        "Only the creator who owns this booking can use Virtual Try-On.",
      );
    }

    /*===================================================
      Resolve Designer Garment
      ===================================================*/

    const garmentImage = getGarmentImageForPhase(booking, phase);

    if (!garmentImage) {
      return sendError(
        res,
        409,
        phase === "prototype"
          ? "This prototype does not have a Virtual Try-On garment image."
          : "This final delivery does not have a Virtual Try-On garment image.",
        "TRYON_GARMENT_NOT_AVAILABLE",
      );
    }

    /*
      FASHN must be able to reach the garment image from
      its own servers.

      localhost and private network addresses cannot be
      used as production garment sources.
    */

    if (!isPublicGarmentUrl(garmentImage)) {
      return sendError(
        res,
        409,
        "The Designer's Virtual Try-On garment image is not publicly accessible.",
        "TRYON_GARMENT_NOT_PUBLIC",
      );
    }

    /*===================================================
      Optimize Creator Photo Directly From Memory
      ===================================================*/

    const personImage = await personImageToDataUri(req.file);

    if (!personImage) {
      return sendError(
        res,
        400,
        "The uploaded person image could not be prepared for Virtual Try-On.",
      );
    }

    /*===================================================
      Start FASHN Generation
      ===================================================*/

    const predictionId = await startPrediction({
      personImage,

      garmentImage,

      category,
    });

    /*===================================================
      Poll FASHN
      ===================================================*/

    const { outputs, prediction } = await waitForPrediction(predictionId);

    const resultImage = outputs[0];

    /*===================================================
      Success

      Nothing is written to the bookings table.

      Result is returned directly to the Creator.
      ===================================================*/

    return res.status(200).json({
      status: "success",

      message: "Virtual Try-On generated successfully.",

      data: {
        booking_id: booking.id,

        phase,

        category,

        provider: "fashn",

        model: FASHN_MODEL,

        mode: FASHN_TRYON_MODE,

        prediction_id: predictionId,

        image: resultImage,

        output_format: FASHN_OUTPUT_FORMAT,

        temporary: true,

        provider_status: prediction.status,
      },
    });
  } catch (error) {
    /*
      Log provider details server-side only.

      Do not expose API key or the Creator's base64 photo.
    */

   console.error("Virtual Try-On generation failed:", {
  message: error?.message || null,
  code: error?.code || null,
  statusCode: error?.statusCode || null,
  providerError: error?.providerData?.error || null,

  causeName: error?.cause?.name || null,
  causeCode: error?.cause?.code || null,
  causeMessage: error?.cause?.message || null,
  causeErrno: error?.cause?.errno || null,
  causeSyscall: error?.cause?.syscall || null,
});

    if (error?.code === "FASHN_GENERATION_FAILED") {
      return sendError(
        res,
        422,
        error.message ||
          "FASHN could not generate a Virtual Try-On from these images.",
        "TRYON_GENERATION_FAILED",
      );
    }

    if (error?.code === "FASHN_POLL_TIMEOUT") {
      return sendError(
        res,
        504,
        "Virtual Try-On is taking longer than expected. Please try again.",
        "TRYON_TIMEOUT",
      );
    }

    if (
      ["FASHN_REQUEST_REJECTED", "FASHN_STATUS_ERROR"].includes(error?.code)
    ) {
      /*
        401/403 from FASHN usually means a key/account
        configuration problem.

        Do not expose provider authentication details
        to the frontend.
      */

      if ([401, 403].includes(Number(error.statusCode))) {
        return sendError(
          res,
          503,
          "Virtual Try-On is temporarily unavailable.",
          "TRYON_PROVIDER_UNAVAILABLE",
        );
      }

      /*
        Rate limiting.
      */

      if (Number(error.statusCode) === 429) {
        return sendError(
          res,
          429,
          "Virtual Try-On is busy right now. Please try again shortly.",
          "TRYON_RATE_LIMITED",
        );
      }

      /*
        Provider-side validation error.
      */

      if (Number(error.statusCode) >= 400 && Number(error.statusCode) < 500) {
        return sendError(
          res,
          422,
          error.message ||
            "The supplied images could not be processed for Virtual Try-On.",
          "TRYON_INPUT_REJECTED",
        );
      }
    }

    if (error?.code === "FASHN_HTTP_TIMEOUT") {
      return sendError(
        res,
        504,
        "The Virtual Try-On service did not respond in time.",
        "TRYON_PROVIDER_TIMEOUT",
      );
    }

    if (error?.code === "FASHN_NOT_CONFIGURED") {
      return sendError(
        res,
        503,
        "Virtual Try-On is temporarily unavailable.",
        "FASHN_NOT_CONFIGURED",
      );
    }

    return sendError(
      res,
      500,
      "The Virtual Try-On could not be generated.",
      "TRYON_FAILED",
    );
  }
};

/*=========================================================
Optional Exported Constants

Useful for route tests/debugging without exposing secrets.
=========================================================*/

exports.VIRTUAL_TRYON_CONFIG = Object.freeze({
  provider: "fashn",

  model: FASHN_MODEL,

  mode: FASHN_TRYON_MODE,

  maxPersonImageBytes: MAX_PERSON_IMAGE_BYTES,

  optimizedPersonImage: {
    maxWidth: PERSON_IMAGE_MAX_WIDTH,

    maxHeight: PERSON_IMAGE_MAX_HEIGHT,

    jpegQuality: PERSON_IMAGE_JPEG_QUALITY,

    outputMime: PERSON_IMAGE_OUTPUT_MIME,
  },

  allowedImageTypes: Array.from(ALLOWED_PERSON_IMAGE_TYPES),

  allowedPhases: Array.from(ALLOWED_PHASES),

  allowedCategories: Array.from(ALLOWED_CATEGORIES),
});
