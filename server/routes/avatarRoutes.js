"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const express = require("express");
const multer = require("multer");

const avatarController = require("../controllers/avatarController");
const { protect } = require("../middlewares/authMiddleware");

const router = express.Router();

/* =========================================================
   DesignByYou
   Shared Avatar Routes
   Version 3.0 - Internal3D

   Shared by:
   - Creator
   - Designer

   Active avatar engines:
   - fashion_persona_2d
   - internal_3d

   This router supports:
   - shared avatar profile
   - Internal3D creation/customization
   - avatar preview upload
   - featured designs
   - reset
   - public avatar profiles

   External avatar providers, provider sessions, provider
   webhooks, three-photo generation, and provider exports are
   intentionally not mounted here anymore.
   ========================================================= */

/* =========================================================
   Public Avatar Preview Directory

   Avatar preview images are profile-facing media, so they
   continue to live under:

       /uploads/avatars

   index.js already exposes /uploads as static assets.
   ========================================================= */

const AVATAR_PREVIEW_DIRECTORY = path.join(process.cwd(), "uploads", "avatars");

/* =========================================================
   Upload Limits
   ========================================================= */

const MAX_AVATAR_PREVIEW_SIZE = 5 * 1024 * 1024;

/* =========================================================
   Supported Preview Image Types
   ========================================================= */

const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

/* =========================================================
   Directory Helpers
   ========================================================= */

function ensureDirectory(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {
      recursive: true,
    });
  }
}

ensureDirectory(AVATAR_PREVIEW_DIRECTORY);

/* =========================================================
   Safe ID Generator
   ========================================================= */

function createUniqueId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(20).toString("hex");
}

/* =========================================================
   Extension Helper
   ========================================================= */

function getImageExtension(file) {
  return ALLOWED_IMAGE_TYPES.get(file?.mimetype) || ".jpg";
}

/* =========================================================
   Preview Filename

   We deliberately do not include user names, emails, UUIDs,
   or original filenames in public preview filenames.
   ========================================================= */

function createAvatarPreviewFilename(file) {
  const extension = getImageExtension(file);

  return ["avatar-preview", Date.now(), createUniqueId()].join("-") + extension;
}

/* =========================================================
   Preview Multer Storage
   ========================================================= */

const avatarPreviewStorage = multer.diskStorage({
  destination: (req, file, callback) => {
    try {
      ensureDirectory(AVATAR_PREVIEW_DIRECTORY);

      callback(null, AVATAR_PREVIEW_DIRECTORY);
    } catch (error) {
      callback(error);
    }
  },

  filename: (req, file, callback) => {
    try {
      callback(null, createAvatarPreviewFilename(file));
    } catch (error) {
      callback(error);
    }
  },
});

/* =========================================================
   Preview Image Validation
   ========================================================= */

function avatarPreviewFileFilter(req, file, callback) {
  if (!ALLOWED_IMAGE_TYPES.has(file?.mimetype)) {
    const error = new Error(
      "Avatar preview must be a JPG, PNG, or WEBP image.",
    );

    error.statusCode = 400;

    return callback(error, false);
  }

  return callback(null, true);
}

/* =========================================================
   Preview Upload
   ========================================================= */

const avatarPreviewUpload = multer({
  storage: avatarPreviewStorage,

  limits: {
    fileSize: MAX_AVATAR_PREVIEW_SIZE,

    files: 1,

    fields: 10,

    parts: 12,
  },

  fileFilter: avatarPreviewFileFilter,
});

/* =========================================================
   Remove Uploaded File Safely
   ========================================================= */

function safelyRemoveUploadedFile(file) {
  const filePath = file?.path;

  if (!filePath) {
    return;
  }

  fs.unlink(filePath, (error) => {
    if (error && error.code !== "ENOENT") {
      console.error("Failed to remove rejected avatar preview upload:", error);
    }
  });
}

/* =========================================================
   Collect Uploaded Files
   ========================================================= */

function collectUploadedFiles(req) {
  const files = [];

  if (req.file) {
    files.push(req.file);
  }

  if (Array.isArray(req.files)) {
    files.push(...req.files);

    return files;
  }

  if (req.files && typeof req.files === "object") {
    Object.values(req.files).forEach((value) => {
      if (Array.isArray(value)) {
        files.push(...value);
      } else if (value) {
        files.push(value);
      }
    });
  }

  return files;
}

function safelyRemoveUploadedFiles(req) {
  collectUploadedFiles(req).forEach(safelyRemoveUploadedFile);
}

/* =========================================================
   Preview Upload Middleware

   Multipart field:

       avatar_preview
   ========================================================= */

function handleAvatarPreviewUpload(req, res, next) {
  const upload = avatarPreviewUpload.single("avatar_preview");

  upload(req, res, (error) => {
    if (!error) {
      return next();
    }

    safelyRemoveUploadedFiles(req);

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,

          message: "Avatar preview may not exceed 5 MB.",
        });
      }

      if (error.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({
          success: false,

          message: "Only one avatar preview image may be uploaded.",
        });
      }

      if (error.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
          success: false,

          message:
            'Upload the avatar preview using the field name "avatar_preview".',
        });
      }

      if (error.code === "LIMIT_FIELD_COUNT") {
        return res.status(400).json({
          success: false,

          message: "Too many avatar preview form fields were supplied.",
        });
      }

      if (error.code === "LIMIT_PART_COUNT") {
        return res.status(400).json({
          success: false,

          message: "Too many avatar preview multipart fields were supplied.",
        });
      }

      return res.status(400).json({
        success: false,

        message: error.message || "The avatar preview upload is invalid.",
      });
    }

    return res.status(error.statusCode || 400).json({
      success: false,

      message: error.message || "The avatar preview could not be uploaded.",
    });
  });
}

/* =========================================================
   Authenticated Shared Avatar Routes
   Creator + Designer
   ========================================================= */

/* =========================================================
   GET /api/v1/avatar/providers

   Returns active avatar engines and capabilities.

   Expected active engines:

       fashion_persona_2d
       internal_3d
   ========================================================= */

router.get("/avatar/providers", protect, avatarController.getAvatarProviders);

/* =========================================================
   GET /api/v1/avatar/me
   ========================================================= */

router.get("/avatar/me", protect, avatarController.getMyAvatar);

/* =========================================================
   PUT /api/v1/avatar/me

   Shared presentation/profile settings:

   - avatar_config
   - display_mode
   - pose
   - background_theme
   - is_public
   - avatar_preview_url

   Engine/model internals remain controller-owned.
   ========================================================= */

router.put("/avatar/me", protect, avatarController.updateMyAvatar);

/* =========================================================
   Internal3D Fashion Persona
   ========================================================= */

/* =========================================================
   POST /api/v1/avatar/me/internal3d

   Creates or switches the current user to Internal3D.

   Example JSON:

   {
     "avatar_config": {
       "face": {
         "jawWidth": 0.5,
         "eyeSpacing": 0.5
       },
       "body": {
         "height": 0.5
       }
     }
   }

   Empty config is also valid and creates the default
   Internal3D human.
   ========================================================= */

router.post(
  "/avatar/me/internal3d",
  protect,
  avatarController.createInternal3DAvatar,
);

/* =========================================================
   GET /api/v1/avatar/me/internal3d

   Returns the authenticated user's Internal3D avatar.
   ========================================================= */

router.get(
  "/avatar/me/internal3d",
  protect,
  avatarController.getMyInternal3DAvatar,
);

/* =========================================================
   PUT /api/v1/avatar/me/internal3d

   Deep-merges Internal3D avatar configuration.

   Example:

   {
     "avatar_config": {
       "face": {
         "jawWidth": 0.65
       },
       "appearance": {
         "hairColor": "#17120F"
       }
     }
   }
   ========================================================= */

router.put(
  "/avatar/me/internal3d",
  protect,
  avatarController.updateInternal3DAvatar,
);

/* =========================================================
   GET /api/v1/avatar/internal3d/assets

   Returns the Internal3D asset catalog.

   The catalog is currently empty until the actual modular
   GLB hair/clothing/accessory library is added.
   ========================================================= */

router.get(
  "/avatar/internal3d/assets",
  protect,
  avatarController.getInternal3DAssets,
);

/* =========================================================
   POST /api/v1/avatar/me/internal3d/analyze-photo

   Reserved for Phase 2:

       selfie
         -> facial landmarks
         -> Internal3D morph values

   No file upload middleware is mounted yet because photo
   analysis is intentionally not implemented at this stage.

   The controller currently returns HTTP 501.
   ========================================================= */

router.post(
  "/avatar/me/internal3d/analyze-photo",
  protect,
  avatarController.analyzeInternal3DPhoto,
);

/* =========================================================
   Avatar Preview
   ========================================================= */

/* =========================================================
   POST /api/v1/avatar/me/preview

   Supports:

   1. multipart/form-data

      avatar_preview = image

   OR

   2. JSON

      {
        "avatar_preview_url": "..."
      }
   ========================================================= */

router.post(
  "/avatar/me/preview",
  protect,
  handleAvatarPreviewUpload,
  avatarController.updateAvatarPreview,
);

/* =========================================================
   DELETE /api/v1/avatar/me/preview
   ========================================================= */

router.delete(
  "/avatar/me/preview",
  protect,
  avatarController.removeAvatarPreview,
);

/* =========================================================
   Featured Design
   ========================================================= */

/* =========================================================
   PUT /api/v1/avatar/me/featured-design

   Example:

   {
     "featured_design_id": "design-uuid",
     "display_mode": "showcase"
   }
   ========================================================= */

router.put(
  "/avatar/me/featured-design",
  protect,
  avatarController.setFeaturedDesign,
);

/* =========================================================
   DELETE /api/v1/avatar/me/featured-design
   ========================================================= */

router.delete(
  "/avatar/me/featured-design",
  protect,
  avatarController.removeFeaturedDesign,
);

/* =========================================================
   Reset
   ========================================================= */

/* =========================================================
   POST /api/v1/avatar/me/reset

   Resets the user's active avatar to the existing default
   Fashion Persona 2D fallback.
   ========================================================= */

router.post("/avatar/me/reset", protect, avatarController.resetMyAvatar);

/* =========================================================
   Public Avatar Route
   No Authentication Required
   ========================================================= */

/* =========================================================
   GET /api/v1/avatars/:userId

   Private avatars return 404.

   Provider/private bookkeeping and design high-resolution
   files are not exposed by the controller.
   ========================================================= */

router.get("/avatars/:userId", avatarController.getPublicAvatar);

/* =========================================================
   Export
   ========================================================= */

module.exports = router;
