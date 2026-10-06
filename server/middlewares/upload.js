"use strict";

/**
 * =========================================================
 * DesignByYou / FashionVision
 * Cloudinary Upload Middleware
 * Version 2.1
 * =========================================================
 *
 * UPLOAD TYPES
 *
 * 1. uploadProfile
 *    - standard account/profile images
 *    - image files only
 *    - JPG / PNG / WEBP
 *    - maximum 5 MB
 *    - optimized by Cloudinary
 *
 * 2. uploadPreview
 *    - Creator Studio / Showcase preview images
 *    - image files only
 *    - JPG / PNG / WEBP
 *    - maximum 5 MB
 *    - optimized by Cloudinary
 *
 * 3. uploadDesign
 *    - high-resolution project/design assets
 *    - maximum 25 MB
 *    - preserves existing resource_type:auto behavior
 *
 * =========================================================
 * SECURITY MODEL
 * =========================================================
 *
 * Browser validation is NEVER trusted as the security
 * boundary.
 *
 * Multer enforces:
 *
 * - upload size limits
 * - maximum file count
 * - multipart field-size limits
 *
 * Image upload middleware additionally enforces:
 *
 * - image MIME allow-list
 * - Cloudinary resource_type = image
 * - Cloudinary allowed_formats
 *
 * The Creator Studio controller performs further
 * validation after this middleware.
 *
 * =========================================================
 * IMPORTANT
 * =========================================================
 *
 * Fashion Persona configuration does NOT use uploadProfile.
 *
 * Standard profile photo:
 *
 *   uploadProfile
 *
 * Fashion Persona:
 *
 *   /avatar/*
 *
 * High-resolution design assets:
 *
 *   uploadDesign
 *
 * =========================================================
 */

const cloudinary =
  require("cloudinary").v2;

const {
  CloudinaryStorage,
} = require(
  "multer-storage-cloudinary",
);

const multer = require("multer");

/*=========================================================
  Cloudinary Configuration
=========================================================*/

cloudinary.config({
  cloud_name:
    process.env.CLOUDINARY_NAME,

  api_key:
    process.env.CLOUDINARY_KEY,

  api_secret:
    process.env.CLOUDINARY_SECRET,

  /*
   * Always generate secure Cloudinary URLs where
   * supported.
   */
  secure: true,
});

/*=========================================================
  Constants
=========================================================*/

const FIVE_MB =
  5 * 1024 * 1024;

const TWENTY_FIVE_MB =
  25 * 1024 * 1024;

/*
 * Creator Studio canvas_state is capped at 2 MB by
 * the controller.
 *
 * Keeping the multipart field limit aligned prevents
 * an oversized text field from reaching the controller.
 */
const MAX_MULTIPART_FIELD_BYTES =
  2 * 1024 * 1024;

/*
 * Prevent excessively large multipart field names.
 */
const MAX_FIELD_NAME_BYTES = 100;

/*
 * A generous multipart-field count prevents field-flood
 * abuse while remaining compatible with other routes that
 * may reuse uploadPreview.
 */
const MAX_MULTIPART_FIELDS = 50;

const MAX_MULTIPART_PARTS =
  MAX_MULTIPART_FIELDS + 1;

const ALLOWED_IMAGE_MIME_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

/*=========================================================
  Upload Error Helper
=========================================================*/

function createUploadError(
  message,
  code,
) {
  const error = new Error(message);

  error.code = code;

  return error;
}

/*=========================================================
  Image File Filter
=========================================================*/

/**
 * Do not rely on React validation.
 *
 * A client may call the API directly using:
 *
 * - curl
 * - Postman
 * - custom JavaScript
 * - another HTTP client
 *
 * Therefore Multer performs its own MIME allow-list check.
 *
 * IMPORTANT:
 *
 * MIME values originate from multipart metadata and can
 * theoretically be spoofed.
 *
 * This is therefore NOT the only validation layer.
 *
 * Cloudinary additionally receives the file using:
 *
 *   resource_type: "image"
 *
 * with an explicit allowed format list.
 *
 * The Creator controller also performs additional checks
 * where file-buffer information is available.
 */

function imageFileFilter(
  req,
  file,
  callback,
) {
  if (!file) {
    return callback(
      createUploadError(
        "The uploaded image is invalid.",
        "INVALID_IMAGE_FILE",
      ),
    );
  }

  /*-------------------------------------------------------
    Validate Original Filename Metadata
  -------------------------------------------------------*/

  const originalName =
    typeof file.originalname === "string"
      ? file.originalname
      : "";

  /*
   * The filename is NOT trusted for storage or content
   * validation.
   *
   * This merely prevents malformed filename metadata.
   */

  if (
    originalName.length > 255 ||
    originalName.includes("\0")
  ) {
    return callback(
      createUploadError(
        "The uploaded file name is invalid.",
        "INVALID_FILE_NAME",
      ),
    );
  }

  /*-------------------------------------------------------
    Validate Declared MIME Type
  -------------------------------------------------------*/

  const mimeType = String(
    file.mimetype || "",
  )
    .trim()
    .toLowerCase();

  if (
    !ALLOWED_IMAGE_MIME_TYPES.has(
      mimeType,
    )
  ) {
    return callback(
      createUploadError(
        "Only JPG, PNG, and WEBP image files are allowed.",
        "INVALID_IMAGE_TYPE",
      ),
    );
  }

  return callback(
    null,
    true,
  );
}

/*=========================================================
  Shared Image Transformation
=========================================================*/

/*
 * Cloudinary receives image uploads as actual image
 * resources.
 *
 * width/height use "limit", so smaller images are not
 * enlarged.
 *
 * strip_profile removes unnecessary embedded metadata
 * such as EXIF/profile information from transformed
 * output.
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

/*=========================================================
  1. Standard Profile Image Storage
=========================================================*/

/*
 * Separate storage from design assets.
 *
 * Profile images:
 *
 * - images only
 * - max 5 MB
 * - JPG / PNG / WEBP
 * - 1200x1200 upper bound
 * - Cloudinary-generated identifier
 * - automatic quality optimization
 * - automatic delivery format
 */

const profileStorage =
  new CloudinaryStorage({
    cloudinary,

    params: {
      folder:
        "designbyyou_profiles",

      resource_type:
        "image",

      allowed_formats: [
        "jpg",
        "jpeg",
        "png",
        "webp",
      ],

      /*
       * Do not overwrite an existing Cloudinary
       * resource in the unlikely event of an identifier
       * collision.
       */
      overwrite: false,

      transformation:
        imageTransformations,
    },
  });

/*=========================================================
  2. Preview Storage
=========================================================*/

/*
 * Used for:
 *
 * - Creator Studio previews
 * - Fashion Editor Showcase previews
 * - other design/showcase preview images
 *
 * Preview images are NOT high-resolution source assets.
 */

const previewStorage =
  new CloudinaryStorage({
    cloudinary,

    params: {
      folder:
        "designbyyou_previews",

      resource_type:
        "image",

      allowed_formats: [
        "jpg",
        "jpeg",
        "png",
        "webp",
      ],

      overwrite: false,

      transformation:
        imageTransformations,
    },
  });

/*=========================================================
  3. High-Resolution Design Asset Storage
=========================================================*/

/**
 * Preserve the existing high-resolution asset behavior.
 *
 * resource_type: "auto"
 *
 * is intentional because these project assets may not
 * always be ordinary preview images.
 *
 * IMPORTANT:
 *
 * uploadDesign MUST NOT be substituted for:
 *
 * - account profile pictures
 * - Creator Studio preview images
 * - Fashion Editor preview images
 *
 * Those use the stricter image-only middleware above.
 */

const highResStorage =
  new CloudinaryStorage({
    cloudinary,

    params: {
      folder:
        "designbyyou_assets",

      resource_type:
        "auto",

      overwrite: false,
    },
  });

/*=========================================================
  Shared Image Upload Limits
=========================================================*/

const imageUploadLimits = {
  /*
   * Multer/Busboy rejects the upload while parsing the
   * multipart stream if it exceeds this size.
   */
  fileSize:
    FIVE_MB,

  /*
   * .single(...) already expects one file, but this
   * provides another explicit limit.
   */
  files: 1,

  /*
   * Prevent field-name abuse.
   */
  fieldNameSize:
    MAX_FIELD_NAME_BYTES,

  /*
   * Maximum size for each non-file multipart field.
   *
   * This is especially useful for canvas_state.
   */
  fieldSize:
    MAX_MULTIPART_FIELD_BYTES,

  /*
   * Prevent requests containing thousands of text
   * fields/parts.
   */
  fields:
    MAX_MULTIPART_FIELDS,

  parts:
    MAX_MULTIPART_PARTS,
};

/*=========================================================
  Profile Upload
=========================================================*/

const uploadProfile =
  multer({
    storage:
      profileStorage,

    limits:
      imageUploadLimits,

    fileFilter:
      imageFileFilter,
  });

/*=========================================================
  Preview Upload
=========================================================*/

/*
 * IMPORTANT:
 *
 * A route using:
 *
 * uploadPreview.single("preview")
 *
 * does NOT require the preview file to exist.
 *
 * Therefore Creator Studio may submit:
 *
 * no preview
 *
 * and Multer will simply continue to the controller.
 *
 * If a preview IS supplied, all limits and image
 * validation below apply.
 */

const uploadPreview =
  multer({
    storage:
      previewStorage,

    limits:
      imageUploadLimits,

    fileFilter:
      imageFileFilter,
  });

/*=========================================================
  High-Resolution Design Upload
=========================================================*/

/*
 * High-resolution files intentionally preserve
 * resource_type:auto.
 *
 * A 25 MB limit is enforced before the upload can
 * continue through the request.
 */

const uploadDesign =
  multer({
    storage:
      highResStorage,

    limits: {
      fileSize:
        TWENTY_FIVE_MB,

      files: 1,

      fieldNameSize:
        MAX_FIELD_NAME_BYTES,

      fieldSize:
        MAX_MULTIPART_FIELD_BYTES,

      fields:
        MAX_MULTIPART_FIELDS,

      parts:
        MAX_MULTIPART_PARTS,
    },
  });

/*=========================================================
  Exports
=========================================================*/

module.exports = {
  uploadProfile,
  uploadPreview,
  uploadDesign,
};