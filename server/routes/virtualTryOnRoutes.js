"use strict";

/*
=========================================================
DesignByYou
FASHN AI Virtual Try-On Routes
Version 1.0
=========================================================

PURPOSE
---------------------------------------------------------

Creator-only Virtual Try-On for Designer booking
deliverables.

Endpoint:

POST
/api/v1/virtual-tryon/bookings/:bookingId

Multipart/form-data:

person_image
  Required image file containing the Creator.

phase
  prototype
  OR
  final

category
  Optional:

  auto
  tops
  bottoms
  one-pieces

=========================================================
SECURITY
=========================================================

Requires:

1. authenticated user
2. Creator role
3. verified Creator email
4. controller confirms Creator owns booking
5. controller confirms garment image belongs to booking

Creator admin approval is NOT required.

=========================================================
PRIVACY
=========================================================

person_image uses Multer memoryStorage.

Therefore:

- no local disk file is created
- no permanent upload is created
- no PostgreSQL image record is created
- controller receives image in req.file.buffer
- controller sends it directly to FASHN

=========================================================
UPLOAD LIMITS
=========================================================

Allowed:

JPEG
PNG
WEBP

Maximum:

12 MB

Only one file may be uploaded.

Expected field name:

person_image

=========================================================
COST / DUPLICATE PROTECTION
=========================================================

Only one Virtual Try-On generation may be active for the
same Creator at a time in this Node process.

This helps prevent:

- double clicks
- duplicate browser submissions
- accidental parallel FASHN credit usage

The controller still remains authoritative for:

- booking authorization
- phase validation
- garment availability
- FASHN processing
=========================================================
*/

const express = require("express");
const multer = require("multer");

const virtualTryOnController = require("../controllers/creators/virtualTryOnController");

const {
  protect,
  authorize,
  requireVerifiedEmail,
} = require("../middlewares/authMiddleware");

const router = express.Router();

/*=========================================================
Configuration
=========================================================*/

const MAX_PERSON_IMAGE_BYTES = 12 * 1024 * 1024;

const ALLOWED_PERSON_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/*=========================================================
Memory Storage
=========================================================*/

/*
IMPORTANT:

Do NOT change this to diskStorage.

The Creator's personal photo is intentionally held only
in server memory for the duration of the request.
*/

const storage = multer.memoryStorage();

/*=========================================================
Upload Error Helper
=========================================================*/

function createUploadError(message, code) {
  const error = new Error(message);

  error.code = code;

  error.statusCode = 400;

  return error;
}

/*=========================================================
Person Image Upload
=========================================================*/

const personImageUpload = multer({
  storage,

  limits: {
    /*
      Maximum uploaded image size.
      */
    fileSize: MAX_PERSON_IMAGE_BYTES,

    /*
      Only one binary file is allowed.
      */
    files: 1,

    /*
      phase + category plus a small safety margin.
      */
    fields: 5,

    /*
      Prevent unexpectedly large multipart requests.
      */
    parts: 8,
  },

  fileFilter(req, file, callback) {
    const mimeType = String(file?.mimetype || "")
      .trim()
      .toLowerCase();

    if (!ALLOWED_PERSON_IMAGE_TYPES.has(mimeType)) {
      return callback(
        createUploadError(
          "The person image must be JPEG, PNG, or WEBP.",
          "INVALID_PERSON_IMAGE_TYPE",
        ),
      );
    }

    return callback(null, true);
  },
});

/*=========================================================
JSON Upload Error Response
=========================================================*/

/*
Wrapping upload.single() lets us return the same JSON API
format used throughout the backend instead of allowing a
raw Multer error to reach the client.
*/

function uploadPersonImage(req, res, next) {
  personImageUpload.single("person_image")(req, res, (error) => {
    if (!error) {
      return next();
    }

    /*===============================================
      Multer Errors
      ===============================================*/

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          status: "error",

          code: "PERSON_IMAGE_TOO_LARGE",

          message: "The person image must be 12 MB or smaller.",
        });
      }

      if (error.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
          status: "error",

          code: "UNEXPECTED_UPLOAD_FIELD",

          message: "Upload exactly one image using the person_image field.",
        });
      }

      if (error.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({
          status: "error",

          code: "TOO_MANY_IMAGES",

          message: "Only one person image may be uploaded.",
        });
      }

      if (error.code === "LIMIT_FIELD_COUNT") {
        return res.status(400).json({
          status: "error",

          code: "TOO_MANY_FIELDS",

          message: "The Virtual Try-On request contains too many fields.",
        });
      }

      if (error.code === "LIMIT_PART_COUNT") {
        return res.status(400).json({
          status: "error",

          code: "TOO_MANY_MULTIPART_PARTS",

          message:
            "The Virtual Try-On request contains too many multipart fields.",
        });
      }

      return res.status(400).json({
        status: "error",

        code: "PERSON_IMAGE_UPLOAD_FAILED",

        message: "The person image could not be uploaded.",
      });
    }

    /*===============================================
      Custom File Type Error
      ===============================================*/

    if (error?.code === "INVALID_PERSON_IMAGE_TYPE") {
      return res.status(400).json({
        status: "error",

        code: error.code,

        message: error.message,
      });
    }

    /*===============================================
      Unknown Upload Error
      ===============================================*/

    console.error("Virtual Try-On image upload failed:", error);

    return res.status(500).json({
      status: "error",

      code: "PERSON_IMAGE_UPLOAD_FAILED",

      message: "The person image could not be prepared for Virtual Try-On.",
    });
  });
}

/*=========================================================
Concurrent Generation Protection
=========================================================*/

/*
FASHN generations consume provider resources / credits.

Prevent the same authenticated Creator from accidentally
starting multiple concurrent predictions in this Node
process.

This is primarily double-submit protection.

It does NOT replace a future distributed production
rate limiter if the application runs across multiple
server instances.
*/

const activeCreatorTryOns = new Set();

function preventConcurrentTryOn(req, res, next) {
  const creatorId = String(req?.user?.id || "").trim();

  if (!creatorId) {
    /*
    protect middleware normally prevents reaching this
    point without req.user.

    Let the controller/auth layer remain authoritative.
    */
    return next();
  }

  if (activeCreatorTryOns.has(creatorId)) {
    return res.status(429).json({
      status: "error",

      code: "TRYON_ALREADY_RUNNING",

      message:
        "A Virtual Try-On is already being generated. Please wait for it to finish.",
    });
  }

  activeCreatorTryOns.add(creatorId);

  let released = false;

  const release = () => {
    if (released) {
      return;
    }

    released = true;

    activeCreatorTryOns.delete(creatorId);
  };

  /*
  finish:
  normal completed HTTP response

  close:
  browser/client disconnected before completion
  */

  res.once("finish", release);

  res.once("close", release);

  return next();
}

/*=========================================================
Global Creator Protection
=========================================================*/

/*
Middleware order:

protect
    ↓
authorize creator
    ↓
verified email
    ↓
concurrent-generation protection
    ↓
Multer memory upload
    ↓
Virtual Try-On controller
*/

router.use(protect);

router.use(authorize("creator"));

router.use(requireVerifiedEmail);

/*=========================================================
Generate Booking Virtual Try-On
=========================================================*/

/*
POST
/api/v1/virtual-tryon/bookings/:bookingId

Content-Type:

multipart/form-data

Fields:

person_image
phase
category


Example:

person_image = creator.jpg

phase =
prototype

category =
auto


OR:

person_image = creator.jpg

phase =
final

category =
one-pieces


Controller performs final authorization:

booking.creator_id
    ===
authenticated Creator ID

Then selects:

prototype
→ prototype_tryon_image_url

final
→ delivery_tryon_image_url
*/

router.post(
  "/bookings/:bookingId",

  preventConcurrentTryOn,

  uploadPersonImage,

  virtualTryOnController.generateBookingTryOn,
);

/*=========================================================
Export
=========================================================*/

module.exports = router;
