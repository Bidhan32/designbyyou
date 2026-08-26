"use strict";

/*
=========================================================
DesignByYou / FashionVision
Cloudinary Upload Middleware
Version 2.0
=========================================================

UPLOAD TYPES

1. uploadProfile
   - standard account/profile images
   - image files only
   - JPG / PNG / WEBP
   - maximum 5 MB
   - optimized by Cloudinary

2. uploadPreview
   - design/showcase preview images
   - image files only
   - JPG / PNG / WEBP
   - maximum 5 MB
   - optimized by Cloudinary

3. uploadDesign
   - high-resolution project/design assets
   - maximum 25 MB
   - preserves existing resource_type:auto behavior

=========================================================
IMPORTANT
=========================================================

Fashion Persona configuration does NOT use uploadProfile.

Standard profile photo:
    uploadProfile

Fashion Persona:
    /avatar/*

High-resolution design assets:
    uploadDesign
=========================================================
*/

const cloudinary =
  require("cloudinary").v2;

const {
  CloudinaryStorage,
} = require(
  "multer-storage-cloudinary",
);

const multer =
  require("multer");

/*=========================================================
Cloudinary Configuration
=========================================================*/

cloudinary.config({
  cloud_name:
    process.env
      .CLOUDINARY_NAME,

  api_key:
    process.env
      .CLOUDINARY_KEY,

  api_secret:
    process.env
      .CLOUDINARY_SECRET,
});

/*=========================================================
Constants
=========================================================*/

const FIVE_MB =
  5 * 1024 * 1024;

const TWENTY_FIVE_MB =
  25 * 1024 * 1024;

const ALLOWED_IMAGE_MIME_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

/*=========================================================
Image File Filter
=========================================================

Do not rely on React validation.

Any client can call the API directly, so Multer must also
reject unsupported upload types.
=========================================================*/

function imageFileFilter(
  req,
  file,
  callback,
) {
  if (
    !file ||
    !ALLOWED_IMAGE_MIME_TYPES.has(
      String(
        file.mimetype ||
          "",
      ).toLowerCase(),
    )
  ) {
    const error =
      new Error(
        "Only JPG, PNG, and WEBP image files are allowed.",
      );

    error.code =
      "INVALID_IMAGE_TYPE";

    return callback(
      error,
    );
  }

  return callback(
    null,
    true,
  );
}

/*=========================================================
1. Standard Profile Image Storage
=========================================================

Separate storage from design assets.

Profile images:

- images only
- max 5 MB
- 1200x1200 upper bound
- automatic quality optimization
- automatic delivery format
=========================================================*/

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

      transformation: [
        {
          width: 1200,

          height: 1200,

          crop: "limit",
        },

        {
          quality:
            "auto:good",
        },

        {
          fetch_format:
            "auto",
        },
      ],
    },
  });

/*=========================================================
2. Preview Storage
=========================================================*/

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

      transformation: [
        {
          width: 1200,

          height: 1200,

          crop: "limit",
        },

        {
          quality:
            "auto:good",
        },

        {
          fetch_format:
            "auto",
        },
      ],
    },
  });

/*=========================================================
3. High-Resolution Design Asset Storage
=========================================================

Preserves your existing behavior.

resource_type:auto is intentional here because project
assets may not always be ordinary preview images.

Do NOT reuse this middleware for account profile photos.
=========================================================*/

const highResStorage =
  new CloudinaryStorage({
    cloudinary,

    params: {
      folder:
        "designbyyou_assets",

      resource_type:
        "auto",
    },
  });

/*=========================================================
Profile Upload
=========================================================*/

const uploadProfile =
  multer({
    storage:
      profileStorage,

    limits: {
      fileSize:
        FIVE_MB,

      files:
        1,
    },

    fileFilter:
      imageFileFilter,
  });

/*=========================================================
Preview Upload
=========================================================*/

const uploadPreview =
  multer({
    storage:
      previewStorage,

    limits: {
      fileSize:
        FIVE_MB,

      files:
        1,
    },

    fileFilter:
      imageFileFilter,
  });

/*=========================================================
High-Resolution Design Upload
=========================================================*/

const uploadDesign =
  multer({
    storage:
      highResStorage,

    limits: {
      fileSize:
        TWENTY_FIVE_MB,

      files:
        1,
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