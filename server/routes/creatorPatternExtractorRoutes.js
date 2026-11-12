"use strict";

const express = require("express");
const multer = require("multer");
const {protect, authorize, requireVerifiedEmail} = require("../middlewares/authMiddleware");
const {createPatternJob, startPatternJob, getPatternJob, getPatternResult} =
  require("../controllers/creators/creatorPatternExtractorController");

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function fail(res, status, code, message) {
  return res.status(status).json({status: "error", code, message});
}

router.use(protect);
router.use(authorize("creator"));
router.use(requireVerifiedEmail);
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
function requireJson(req, res, next) {
  return req.is("application/json") ? next() : fail(res, 415, "JSON_REQUIRED", "JSON body required.");
}
function validId(req, res, next) {
  return UUID.test(String(req.params.jobId || "")) ? next() : fail(res, 400, "INVALID_JOB_ID", "Invalid job ID.");
}
function requireMultipart(req, res, next) {
  return req.is("multipart/form-data") ? next() : fail(res, 415, "MULTIPART_REQUIRED", "Multipart image upload required.");
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: 12 * 1024 * 1024, files: 1, fields: 2, parts: 3, fieldSize: 1024, fieldNameSize: 100},
  fileFilter(_req, file, callback) {
    if (!TYPES.has(String(file.mimetype || "").toLowerCase())) {
      const error = new Error("Use JPG, PNG or WebP.");
      error.code = "INVALID_IMAGE_TYPE";
      return callback(error);
    }
    if (String(file.originalname || "").length > 255 || String(file.originalname || "").includes("\0")) {
      const error = new Error("Invalid filename.");
      error.code = "INVALID_FILENAME";
      return callback(error);
    }
    callback(null, true);
  },
}).single("image");
function uploadImage(req, res, next) {
  upload(req, res, (error) => {
    if (req.aborted || res.destroyed) return;
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      return fail(res, tooLarge ? 413 : 400, tooLarge ? "IMAGE_TOO_LARGE" : "INVALID_IMAGE_UPLOAD",
        tooLarge ? "Image must be at most 12 MB." : "Upload exactly one image using the image field.");
    }
    if (["INVALID_IMAGE_TYPE", "INVALID_FILENAME"].includes(error.code)) {
      return fail(res, 400, error.code, error.message);
    }
    console.error("[Pattern Extractor] Upload:", error.message);
    return fail(res, 500, "IMAGE_UPLOAD_FAILED", "Unable to process upload.");
  });
}

router.post("/jobs", requireJson, createPatternJob);
router.post("/jobs/:jobId/start", validId, requireMultipart, uploadImage, startPatternJob);
router.get("/jobs/:jobId", validId, getPatternJob);
router.get("/jobs/:jobId/result", validId, getPatternResult);

module.exports = router;
