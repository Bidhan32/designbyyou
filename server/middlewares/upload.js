"use strict";

/**
 * =========================================================
 * DesignByYou / FashionVision
 * Cloudinary Upload Middleware
 * Version 2.2 — Creator Studio Gallery Uploads
 * =========================================================
 *
 * UPLOAD TYPES
 *
 * 1. uploadProfile
 *    - Profile images
 *    - Maximum 1 image, 5 MB
 *
 * 2. uploadPreview
 *    - Fashion Editor / existing Showcase previews
 *    - Maximum 1 image, 5 MB
 *
 * 3. uploadCreatorGallery
 *    - Manual Creator Studio image galleries
 *    - 0 to 6 images, maximum 5 MB per image
 *
 * 4. uploadDesign
 *    - High-resolution design assets
 *    - Maximum 1 file, 25 MB
 *
 * IMPORTANT
 *
 * - All existing single-file uploaders remain compatible.
 * - Only manual Creator Studio uses uploadCreatorGallery.
 * - The gallery route must use:
 *
 *   uploadCreatorGallery.array("preview", 6)
 *
 * - Controller and route changes are required before
 *   multi-image uploads become operational.
 *
 * =========================================================
 */

const cloudinary = require("cloudinary").v2;

const { CloudinaryStorage } = require("multer-storage-cloudinary");

const multer = require("multer");

/* =========================================================
   Cloudinary Configuration
   ========================================================= */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
  secure: true,
});

/* =========================================================
   Constants
   ========================================================= */

const FIVE_MB = 5 * 1024 * 1024;

const TWENTY_FIVE_MB = 25 * 1024 * 1024;

const MAX_MULTIPART_FIELD_BYTES = 2 * 1024 * 1024;

const MAX_FIELD_NAME_BYTES = 100;

const MAX_MULTIPART_FIELDS = 50;

const MAX_MULTIPART_PARTS = MAX_MULTIPART_FIELDS + 1;

const MAX_CREATOR_GALLERY_IMAGES = 6;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/* =========================================================
   Upload Error Helper
   ========================================================= */

function createUploadError(message, code) {
  const error = new Error(message);

  error.code = code;

  return error;
}

/* =========================================================
   Image File Filter
   =========================================================
 *
 * Shared by:
 *
 * - uploadProfile
 * - uploadPreview
 * - uploadCreatorGallery
 *
 * Validates declared MIME types and filename metadata.
 *
 * MIME metadata can be spoofed, so it is not treated
 * as proof that a file contains a valid image.
 *
 * Cloudinary uses resource_type: "image" and
 * allowed_formats for an additional validation layer.
 *
 * The application controller must also validate the
 * uploaded file metadata before saving database rows.
 *
 * =========================================================
 */

function imageFileFilter(req, file, callback) {
  if (!file) {
    return callback(
      createUploadError("The uploaded image is invalid.", "INVALID_IMAGE_FILE"),
    );
  }

  /* -------------------------------------------------------
     Validate original filename metadata
     ------------------------------------------------------- */

  const originalName =
    typeof file.originalname === "string" ? file.originalname : "";

  if (originalName.length > 255 || originalName.includes("\0")) {
    return callback(
      createUploadError(
        "The uploaded file name is invalid.",
        "INVALID_FILE_NAME",
      ),
    );
  }

  /* -------------------------------------------------------
     Validate declared MIME type
     ------------------------------------------------------- */

  const mimeType = String(file.mimetype || "")
    .trim()
    .toLowerCase();

  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    return callback(
      createUploadError(
        "Only JPG, PNG, and WEBP image files are allowed.",
        "INVALID_IMAGE_TYPE",
      ),
    );
  }

  return callback(null, true);
}

/* =========================================================
   Shared Image Transformations
   =========================================================
 *
 * Preserve existing optimization behavior:
 *
 * - Maximum dimensions: 1200 x 1200
 * - No unnecessary enlargement
 * - Automatic quality optimization
 * - Strip image metadata in transformed output
 * - Automatic delivery format
 *
 * =========================================================
 */

const imageTransformations = [
  {
    width: 1200,
    height: 1200,
    crop: "limit",
  },
  {
    quality: "auto:good",
  },
  {
    flags: "strip_profile",
  },
  {
    fetch_format: "auto",
  },
];

/* =========================================================
   1. Standard Profile Image Storage
   ========================================================= */

const profileStorage = new CloudinaryStorage({
  cloudinary,

  params: {
    folder: "designbyyou_profiles",

    resource_type: "image",

    allowed_formats: ["jpg", "jpeg", "png", "webp"],

    overwrite: false,

    transformation: imageTransformations,
  },
});

/* =========================================================
   2. Preview Image Storage
   =========================================================
 *
 * Used by:
 *
 * - Fashion Editor Showcase preview uploads
 * - Existing single-image previews
 * - New Creator Studio gallery uploads
 *
 * Keep the existing Cloudinary folder unchanged.
 *
 * =========================================================
 */

const previewStorage = new CloudinaryStorage({
  cloudinary,

  params: {
    folder: "designbyyou_previews",

    resource_type: "image",

    allowed_formats: ["jpg", "jpeg", "png", "webp"],

    overwrite: false,

    transformation: imageTransformations,
  },
});

/* =========================================================
   3. High-Resolution Design Asset Storage
   =========================================================
 *
 * Preserve the existing resource_type: "auto".
 *
 * High-resolution assets may be different from ordinary
 * profile and Showcase preview images.
 *
 * =========================================================
 */

const highResStorage = new CloudinaryStorage({
  cloudinary,

  params: {
    folder: "designbyyou_assets",

    resource_type: "auto",

    overwrite: false,
  },
});

/* =========================================================
   4. Shared Single-Image Upload Limits
   =========================================================
 *
 * Do not increase the file count here.
 *
 * Profile images and Fashion Editor previews must
 * continue to use the existing one-file restriction.
 *
 * =========================================================
 */

const imageUploadLimits = {
  fileSize: FIVE_MB,

  files: 1,

  fieldNameSize: MAX_FIELD_NAME_BYTES,

  fieldSize: MAX_MULTIPART_FIELD_BYTES,

  fields: MAX_MULTIPART_FIELDS,

  parts: MAX_MULTIPART_PARTS,
};

/* =========================================================
   5. NEW: Creator Studio Gallery Upload Limits
   =========================================================
 *
 * Allows up to six images in one multipart request.
 *
 * - Maximum 6 files
 * - Maximum 5 MB per file
 * - Maximum 50 non-file fields
 * - Maximum 56 multipart parts
 *
 * Other single-image uploaders are unaffected.
 *
 * =========================================================
 */

const creatorGalleryUploadLimits = {
  ...imageUploadLimits,

  files: MAX_CREATOR_GALLERY_IMAGES,

  parts: MAX_MULTIPART_FIELDS + MAX_CREATOR_GALLERY_IMAGES,
};

/* =========================================================
   6. Profile Upload Middleware
   =========================================================
 *
 * Usage:
 *
 * uploadProfile.single("profile")
 *
 * The existing field name used by each consuming route
 * must remain unchanged.
 *
 * =========================================================
 */

const uploadProfile = multer({
  storage: profileStorage,

  limits: imageUploadLimits,

  fileFilter: imageFileFilter,
});

/* =========================================================
   7. Existing Single Preview Middleware
   =========================================================
 *
 * Usage:
 *
 * uploadPreview.single("preview")
 *
 * Used by:
 * - Fashion Editor sharing
 * - Existing single-preview routes
 *
 * Important:
 * A file is optional.
 *
 * =========================================================
 */

const uploadPreview = multer({
  storage: previewStorage,

  limits: imageUploadLimits,

  fileFilter: imageFileFilter,
});

/* =========================================================
   8. NEW: Creator Studio Gallery Middleware
   =========================================================
 *
 * Usage:
 *
 * uploadCreatorGallery.array("preview", 6)
 *
 * Supports:
 *
 * - No images (metadata-only creation)
 * - One image
 * - Two images
 * - Three images
 * - Four images
 * - Five images
 * - Six images
 *
 * The frontend may accumulate images across multiple
 * selection events, then submit them together.
 *
 * Successful uploads produce:
 *
 * req.files = [
 *   {
 *     fieldname: "preview",
 *     path: "https://res.cloudinary.com/...",
 *     filename: "designbyyou_previews/...",
 *     ...
 *   }
 * ]
 *
 * `path` is the Cloudinary URL.
 * `filename` is the Cloudinary public identifier.
 *
 * The controller will:
 *
 * 1. Validate the uploaded files.
 * 2. Select the cover image.
 * 3. Save the parent designs row.
 * 4. Save ordered design_images rows.
 * 5. Preserve the existing Public/Private policy.
 *
 * SECURITY NOTE:
 *
 * With CloudinaryStorage, images are uploaded before
 * the controller writes the database records.
 *
 * The route/controller must clean up orphaned files
 * if a multi-file upload or database operation fails.
 *
 * Do not enable this new route in production until
 * that cleanup logic is implemented and tested.
 *
 * =========================================================
 */

const uploadCreatorGallery = multer({
  storage: previewStorage,

  limits: creatorGalleryUploadLimits,

  fileFilter: imageFileFilter,
});

/* =========================================================
   9. High-Resolution Design Upload
   =========================================================
 *
 * Preserve the existing 25 MB limit.
 * Preserve resource_type: "auto".
 * Preserve the single-file behavior.
 *
 * =========================================================
 */

const uploadDesign = multer({
  storage: highResStorage,

  limits: {
    fileSize: TWENTY_FIVE_MB,

    files: 1,

    fieldNameSize: MAX_FIELD_NAME_BYTES,

    fieldSize: MAX_MULTIPART_FIELD_BYTES,

    fields: MAX_MULTIPART_FIELDS,

    parts: MAX_MULTIPART_PARTS,
  },
});

/* =========================================================
   Exports
   ========================================================= */

module.exports = {
  uploadProfile,
  uploadPreview,
  uploadCreatorGallery,
  uploadDesign,
};
