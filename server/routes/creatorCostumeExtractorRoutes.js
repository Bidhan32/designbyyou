
"use strict";

/*
 * =========================================================
 * DesignByYou / FashionVision
 * Creator AI Costume Extractor Routes
 * Version 1.0
 * =========================================================
 *
 * PURPOSE
 * ---------------------------------------------------------
 * Provide authenticated Creator-only endpoints for
 * AI-powered garment extraction and multi-view generation.
 *
 * SUPPORTED VIEWS
 * ---------------------------------------------------------
 * - front
 * - back
 * - left
 * - right
 *
 * FASHN MODEL
 * ---------------------------------------------------------
 * edit
 *
 * BASE API ROUTE
 * ---------------------------------------------------------
 * /api/v1/creator-tools/costume-extractor
 *
 * ENDPOINTS
 * ---------------------------------------------------------
 *
 * POST /jobs
 *   Create a new costume extraction job.
 *
 * POST /jobs/:jobId/views/:view/start
 *   Upload image and start generation of one view.
 *
 * GET /jobs/:jobId
 *   Retrieve job information and progress.
 *
 * GET /jobs/:jobId/views/:view/result
 *   Retrieve completed costume PNG.
 *
 * SECURITY
 * ---------------------------------------------------------
 * 1. JWT authentication required.
 * 2. Creator role required.
 * 3. Verified email required.
 * 4. Uploaded images stored temporarily in memory.
 * 5. JPEG, PNG and WebP only.
 * 6. Maximum upload size: 12 MB.
 * 7. Exactly one uploaded image per generation request.
 * 8. Controller verifies ownership of every job.
 * 9. PostgreSQL prevents duplicate view submissions.
 * 10. No public access to generated images.
 *
 * IMPORTANT
 * ---------------------------------------------------------
 * This router does not alter:
 *
 * - Existing Background Remover
 * - Virtual Try-On
 * - Creator wallets
 * - Designer wallets
 * - Stripe or PayPal
 * - Fashion Editor
 * - Showcase publishing
 *
 * =========================================================
 */

const express = require("express");

const multer = require("multer");

const {
  protect,
  authorize,
  requireVerifiedEmail,
} = require("../middlewares/authMiddleware");

const {
  createCostumeExtractionJob,
  startCostumeViewGeneration,
  getCostumeExtractionJob,
  getCostumeViewResult,
} = require(
  "../controllers/creators/creatorCostumeExtractorController"
);

const router = express.Router();

/*
 * =========================================================
 * Configuration
 * =========================================================
 */

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ALLOWED_VIEWS = new Set([
  "front",
  "back",
  "left",
  "right",
]);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/*
 * =========================================================
 * Standard Error Response
 * =========================================================
 */

function sendRouteError(
  res,
  statusCode,
  code,
  message
) {
  if (res.headersSent) {
    return;
  }

  return res.status(statusCode).json({
    status: "error",
    code,
    message,
  });
}

/*
 * =========================================================
 * Multer Memory Storage
 * =========================================================
 *
 * Uploaded costume images are NOT saved to disk.
 *
 * Controller preprocesses uploaded image using Sharp.
 * Image bytes remain in memory during the request.
 *
 * =========================================================
 */

const costumeImageStorage = multer.memoryStorage();

/*
 * =========================================================
 * Image MIME Validation
 * =========================================================
 *
 * This performs initial MIME validation.
 *
 * The controller additionally verifies that the actual
 * decoded image format matches the declared MIME type.
 *
 * =========================================================
 */

function costumeImageFileFilter(
  req,
  file,
  callback
) {
  const mimeType = String(
    file?.mimetype || ""
  )
    .trim()
    .toLowerCase();

  if (
    !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)
  ) {
    const error = new Error(
      "Only JPG, PNG and WebP costume images are supported."
    );

    error.code = "INVALID_COSTUME_IMAGE_TYPE";

    return callback(error);
  }

  const fileName = String(
    file?.originalname || ""
  );

  if (
    fileName.length > 255 ||
    fileName.includes("\0")
  ) {
    const error = new Error(
      "The uploaded image filename is invalid."
    );

    error.code = "INVALID_COSTUME_FILENAME";

    return callback(error);
  }

  return callback(null, true);
}

/*
 * =========================================================
 * Multer Upload Configuration
 * =========================================================
 *
 * Exactly one multipart file field named "image".
 *
 * No additional text form fields are required.
 *
 * =========================================================
 */

const costumeImageUpload = multer({
  storage: costumeImageStorage,

  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    fields: 3,
    parts: 4,
    fieldNameSize: 100,
    fieldSize: 1024,
  },

  fileFilter: costumeImageFileFilter,
});

/*
 * =========================================================
 * Upload Middleware
 * =========================================================
 *
 * Handles common Multer errors safely.
 *
 * =========================================================
 */

function uploadCostumeImage(
  req,
  res,
  next
) {
  costumeImageUpload.single("image")(
    req,
    res,
    (error) => {
      if (!error) {
        if (req.aborted || res.destroyed) {
          return;
        }

        return next();
      }

      if (error instanceof multer.MulterError) {
        if (
          error.code === "LIMIT_FILE_SIZE"
        ) {
          return sendRouteError(
            res,
            413,
            "COSTUME_IMAGE_TOO_LARGE",
            "Costume image must be 12 MB or smaller."
          );
        }

        if (
          error.code === "LIMIT_UNEXPECTED_FILE"
        ) {
          return sendRouteError(
            res,
            400,
            "UNEXPECTED_COSTUME_FILE",
            "Upload exactly one costume image using the image field."
          );
        }

        if (
          error.code === "LIMIT_FILE_COUNT"
        ) {
          return sendRouteError(
            res,
            400,
            "TOO_MANY_COSTUME_IMAGES",
            "Only one image may be uploaded for each costume view."
          );
        }

        if (
          error.code === "LIMIT_FIELD_COUNT" ||
          error.code === "LIMIT_PART_COUNT" ||
          error.code === "LIMIT_FIELD_VALUE" ||
          error.code === "LIMIT_FIELD_KEY"
        ) {
          return sendRouteError(
            res,
            400,
            "INVALID_COSTUME_UPLOAD",
            "The costume upload contains unexpected or oversized fields."
          );
        }

        return sendRouteError(
          res,
          400,
          "COSTUME_UPLOAD_FAILED",
          "The costume image upload could not be processed."
        );
      }

      if (
        error?.code ===
          "INVALID_COSTUME_IMAGE_TYPE" ||
        error?.code ===
          "INVALID_COSTUME_FILENAME"
      ) {
        return sendRouteError(
          res,
          400,
          error.code,
          error.message
        );
      }

      console.error(
        "[Costume Extractor] Upload error:",
        {
          code: error?.code || null,
          message: error?.message || null,
        }
      );

      return sendRouteError(
        res,
        500,
        "COSTUME_UPLOAD_ERROR",
        "Unable to prepare the costume image upload."
      );
    }
  );
}

/*
 * =========================================================
 * Content-Type Validation
 * =========================================================
 */

function requireMultipartImage(
  req,
  res,
  next
) {
  if (
    !req.is("multipart/form-data")
  ) {
    return sendRouteError(
      res,
      415,
      "UNSUPPORTED_CONTENT_TYPE",
      "Please upload the costume using multipart/form-data."
    );
  }

  return next();
}

function requireJsonBody(
  req,
  res,
  next
) {
  if (
    !req.is("application/json")
  ) {
    return sendRouteError(
      res,
      415,
      "JSON_REQUIRED",
      "This endpoint requires an application/json request body."
    );
  }

  return next();
}

/*
 * =========================================================
 * Validate Job Route Parameter
 * =========================================================
 *
 * Early validation before image upload.
 *
 * Full authorization and ownership checks are performed
 * by the controller.
 *
 * =========================================================
 */

function validateJobIdParam(
  req,
  res,
  next
) {
  const jobId = String(
    req?.params?.jobId || ""
  ).trim();

  if (
    !UUID_REGEX.test(jobId)
  ) {
    return sendRouteError(
      res,
      400,
      "INVALID_JOB_ID",
      "Invalid costume extraction job ID."
    );
  }

  return next();
}

/*
 * =========================================================
 * Validate View Route Parameter
 * =========================================================
 */

function validateCostumeViewParam(
  req,
  res,
  next
) {
  const view = String(
    req?.params?.view || ""
  )
    .trim()
    .toLowerCase();

  if (
    !ALLOWED_VIEWS.has(view)
  ) {
    return sendRouteError(
      res,
      400,
      "INVALID_COSTUME_VIEW",
      "Choose front, back, left or right."
    );
  }

  return next();
}

/*
 * =========================================================
 * Global Authentication and Authorization
 * =========================================================
 *
 * Authentication must run BEFORE parsing image uploads.
 *
 * This prevents anonymous users from uploading large
 * image files to the Costume Extractor.
 *
 * =========================================================
 */

router.use(protect);

router.use(authorize("creator"));

router.use(requireVerifiedEmail);

/*
 * =========================================================
 * Privacy Headers
 * =========================================================
 *
 * Prevent user-specific API responses and generated
 * images from being cached by intermediate caches.
 *
 * =========================================================
 */

router.use((req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "private, no-store, max-age=0"
  );

  res.setHeader(
    "Pragma",
    "no-cache"
  );

  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  return next();
});

/*
 * =========================================================
 * POST /jobs
 *
 * Create Costume Extraction Job
 * =========================================================
 *
 * Full endpoint:
 *
 * POST
 * /api/v1/creator-tools/costume-extractor/jobs
 *
 * Request JSON:
 *
 * {
 *   "request_key": "UUID"
 * }
 *
 * The request_key provides job creation idempotency.
 *
 * The controller:
 * - enforces Creator ownership
 * - checks job limits
 * - creates one parent job
 * - creates four view records
 *
 * =========================================================
 */

router.post(
  "/jobs",

  requireJsonBody,

  createCostumeExtractionJob
);

/*
 * =========================================================
 * POST /jobs/:jobId/views/:view/start
 *
 * Start Costume View Generation
 * =========================================================
 *
 * Full endpoint:
 *
 * POST
 * /api/v1/creator-tools/costume-extractor/jobs/:jobId/views/:view/start
 *
 * Supported view:
 * front
 * back
 * left
 * right
 *
 * Content-Type:
 * multipart/form-data
 *
 * File field:
 * image
 *
 * Important:
 * The same original costume image may be uploaded once
 * per requested view.
 *
 * The controller reserves each view in PostgreSQL before
 * submitting a paid FASHN generation.
 *
 * =========================================================
 */

router.post(
  "/jobs/:jobId/views/:view/start",

  validateJobIdParam,

  validateCostumeViewParam,

  requireMultipartImage,

  uploadCostumeImage,

  startCostumeViewGeneration
);

/*
 * =========================================================
 * GET /jobs/:jobId
 *
 * Retrieve Costume Extraction Job
 * =========================================================
 *
 * Full endpoint:
 *
 * GET
 * /api/v1/creator-tools/costume-extractor/jobs/:jobId
 *
 * Optional:
 *
 * ?refresh=true
 *
 * Refresh queries FASHN for currently active predictions.
 *
 * Response contains:
 *
 * - job status
 * - view statuses
 * - error codes
 * - availability of completed results
 *
 * Generated image data is NOT included here.
 *
 * =========================================================
 */

router.get(
  "/jobs/:jobId",

  validateJobIdParam,

  getCostumeExtractionJob
);

/*
 * =========================================================
 * GET /jobs/:jobId/views/:view/result
 *
 * Retrieve Completed Costume PNG
 * =========================================================
 *
 * Full endpoint:
 *
 * GET
 * /api/v1/creator-tools/costume-extractor/jobs/:jobId/views/:view/result
 *
 * The controller verifies:
 *
 * - authenticated Creator
 * - matching job owner
 * - valid costume view
 * - completed FASHN prediction
 *
 * Result:
 *
 * {
 *   "status": "success",
 *   "data": {
 *     "job_id": "...",
 *     "view": "front",
 *     "output_format": "png",
 *     "image": "data:image/png;base64,..."
 *   }
 * }
 *
 * =========================================================
 */

router.get(
  "/jobs/:jobId/views/:view/result",

  validateJobIdParam,

  validateCostumeViewParam,

  getCostumeViewResult
);

/*
 * =========================================================
 * Export Router
 * =========================================================
 */

module.exports = router;
