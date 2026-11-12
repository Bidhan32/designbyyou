"use strict";

const sharp = require("sharp");
const db = require("../../config/db");
const {startPatternExtraction, getPatternStatus, assertProviderConfigured} = require("../../services/FashnPatternExtractorService");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODES = new Set(["faithful", "seamless"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_INPUT_PIXELS = 32 * 1024 * 1024;
const MIME_BY_FORMAT = {jpeg: "image/jpeg", png: "image/png", webp: "image/webp"};
const ACTIVE = new Set(["starting", "in_queue", "processing"]);
const JOBS_PER_HOUR = 4;

function apiError(status, code, message) {
  const err = new Error(message);
  err.httpStatus = status;
  err.code = code;
  return err;
}
function respondError(res, error, context) {
  if (res.headersSent) return;
  const status = Number(error?.httpStatus);
  const safeStatus = status >= 400 && status <= 599 ? status : 500;
  if (safeStatus >= 500) console.error(`[Pattern Extractor] ${context}:`, error?.message);
  const retryAfter = Number(error?.retryAfterSeconds);
  if (safeStatus === 429 && Number.isFinite(retryAfter) && retryAfter > 0) {
    res.setHeader("Retry-After", String(Math.ceil(retryAfter)));
  }
  return res.status(safeStatus).json({
    status: "error",
    code: safeStatus >= 500 ? "PATTERN_EXTRACTOR_ERROR" : (error?.code || "PATTERN_EXTRACTOR_ERROR"),
    message: safeStatus >= 500 ? "Unable to complete pattern extraction request." : error.message,
    ...(safeStatus === 429 && Number.isFinite(retryAfter) && retryAfter > 0
      ? {retry_after_seconds: Math.ceil(retryAfter)} : {}),
  });
}
function creatorId(req) {
  const id = String(req?.user?.id || "");
  if (!UUID.test(id)) throw apiError(401, "UNAUTHENTICATED", "Sign in as a Creator.");
  return id;
}
function jobId(req) {
  const id = String(req?.params?.jobId || "");
  if (!UUID.test(id)) throw apiError(400, "INVALID_JOB_ID", "Invalid pattern extraction job ID.");
  return id;
}
function inputs(req) {
  const requestKey = String(req?.body?.request_key || "");
  const mode = String(req?.body?.mode || "");
  const instructions = String(req?.body?.instructions ?? "").trim();
  if (!UUID.test(requestKey)) throw apiError(400, "INVALID_REQUEST_KEY", "UUID request_key required.");
  if (!MODES.has(mode)) throw apiError(400, "INVALID_MODE", "Choose faithful or seamless mode.");
  if (instructions.length > 500) throw apiError(400, "INVALID_INSTRUCTIONS", "Instructions cannot exceed 500 characters.");
  return {requestKey, mode, instructions};
}
async function ownedJob(id, creator) {
  const result = await db.query(
    `SELECT id, creator_id, request_key, mode, instructions, status,
            prediction_id, error_code, estimated_credits, created_at, completed_at
       FROM public.creator_pattern_extraction_jobs
      WHERE id = $1 AND creator_id = $2`,
    [id, creator]
  );
  if (!result.rows.length) throw apiError(404, "JOB_NOT_FOUND", "Pattern extraction job not found.");
  return result.rows[0];
}
function publicJob(row) {
  return {
    id: row.id, mode: row.mode, instructions: row.instructions,
    status: row.status, error_code: row.error_code,
    estimated_credits: row.estimated_credits,
    result_available: row.status === "completed",
    created_at: row.created_at, completed_at: row.completed_at,
  };
}

async function createPatternJob(req, res) {
  let client;
  let tx = false;
  try {
    const owner = creatorId(req);
    const {requestKey, mode, instructions} = inputs(req);
    client = await db.connect();
    await client.query("BEGIN");
    tx = true;
    // Serialize per-creator creation to make the hourly quota and idempotency safe.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), 915714)", [owner]);
    const prev = await client.query(
      `SELECT * FROM public.creator_pattern_extraction_jobs WHERE creator_id=$1 AND request_key=$2`,
      [owner, requestKey]
    );
    if (prev.rows.length) {
      const prior = prev.rows[0];
      if (prior.mode !== mode || prior.instructions !== instructions) {
        throw apiError(409, "REQUEST_KEY_MISMATCH", "This request key belongs to different extraction options.");
      }
      await client.query("COMMIT"); tx = false;
      return res.status(200).json({status: "success", idempotent: true, data: {job: publicJob(prior)}});
    }
    const quota = await client.query(
      `SELECT count(*)::int AS used,
              GREATEST(1, CEIL(EXTRACT(EPOCH FROM
                (MIN(created_at) + INTERVAL '1 hour' - NOW()))))::int AS retry_after_seconds
         FROM public.creator_pattern_extraction_jobs
        WHERE creator_id=$1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [owner]
    );
    if (quota.rows[0].used >= JOBS_PER_HOUR) {
     const error = apiError(
  429,
  "PATTERN_JOB_LIMIT",
  "Maximum four new pattern extraction jobs per hour."
);
      error.retryAfterSeconds = Number(quota.rows[0].retry_after_seconds) || 60;
      throw error;
    }
    const created = await client.query(
      `INSERT INTO public.creator_pattern_extraction_jobs
         (creator_id, request_key, mode, instructions)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [owner, requestKey, mode, instructions]
    );
    await client.query("COMMIT"); tx = false;
    return res.status(201).json({status: "success", idempotent: false, data: {job: publicJob(created.rows[0])}});
  } catch (error) {
    if (client && tx) {
      try { await client.query("ROLLBACK"); } catch (e) { console.error("Pattern job rollback:", e.message); }
    }
    return respondError(res, error, "create job");
  } finally {
    client?.release?.();
  }
}

async function prepareImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length)
    throw apiError(400, "IMAGE_REQUIRED", "Upload one fabric image using the image field.");
  if (file.buffer.length > MAX_IMAGE_BYTES)
    throw apiError(413, "IMAGE_TOO_LARGE", "The image must be at most 12 MB.");
  const mime = String(file.mimetype || "").toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime))
    throw apiError(415, "UNSUPPORTED_IMAGE", "Use JPG, PNG or WebP.");
  let metadata;
  try {
    metadata = await sharp(file.buffer, {failOn: "error", limitInputPixels: MAX_INPUT_PIXELS}).metadata();
  } catch {
    throw apiError(400, "INVALID_IMAGE", "Image cannot be decoded safely.");
  }
  if (MIME_BY_FORMAT[metadata.format] !== mime || (metadata.pages || 1) > 1)
    throw apiError(400, "INVALID_IMAGE", "Image type mismatch or animated images are not supported.");
  if (metadata.width < 128 || metadata.height < 128)
    throw apiError(400, "IMAGE_TOO_SMALL", "Image must be at least 128 by 128 pixels.");
  let png;
  try {
    png = await sharp(file.buffer, {failOn: "error", limitInputPixels: MAX_INPUT_PIXELS})
      .rotate().resize({width: 2048, height: 2048, fit: "inside", withoutEnlargement: true})
      .png({compressionLevel: 9}).toBuffer();
  } catch {
    throw apiError(400, "IMAGE_PROCESSING_FAILED", "Cannot prepare this fabric image.");
  }
  if (png.length > 17 * 1024 * 1024)
    throw apiError(413, "IMAGE_TOO_COMPLEX", "Try cropping the printed area before extraction.");
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function startPatternJob(req, res) {
  let id;
  let reserved = false;
  try {
    const owner = creatorId(req);
    id = jobId(req);
    const current = await ownedJob(id, owner);
    if (current.status !== "pending")
      throw apiError(409, "ALREADY_SUBMITTED", "Job already submitted. Check its status; do not resubmit.");
    // Image must pass all validations BEFORE reserving the paid prediction.
    const imageDataUri = await prepareImage(req.file);
    assertProviderConfigured();
    const claim = await db.query(
      `UPDATE public.creator_pattern_extraction_jobs
          SET status='submitting', error_code=NULL, updated_at=now()
        WHERE id=$1 AND creator_id=$2 AND status='pending'
      RETURNING mode, instructions`, [id, owner]
    );
    if (!claim.rowCount) throw apiError(409, "ALREADY_SUBMITTED", "Job is already reserved or submitted.");
    reserved = true;
    const {mode, instructions} = claim.rows[0];
    const result = await startPatternExtraction({imageDataUri, mode, instructions});
    const persisted = await db.query(
      `UPDATE public.creator_pattern_extraction_jobs
          SET prediction_id=$3, status='starting', updated_at=now()
        WHERE id=$1 AND creator_id=$2 AND status='submitting'
      RETURNING id`, [id, owner, result.predictionId]
    );
    if (!persisted.rowCount)
      throw apiError(503, "SUBMISSION_RECORD_UNCERTAIN", "Prediction was submitted but the job record requires review.");
    return res.status(202).json({status: "success", data: {job_id: id, status: "starting"}});
  } catch (error) {
    if (reserved && id) {
      // A network error can happen AFTER a paid request was accepted.
      // Never auto-resubmit uncertain predictions.
      const knownRejected = ["FASHN_RATE_LIMITED", "FASHN_REQUEST_REJECTED", "FASHN_AUTH_ERROR", "FASHN_NOT_CONFIGURED", "INVALID_PATTERN_MODE", "INVALID_PATTERN_INSTRUCTIONS", "INVALID_PATTERN_IMAGE"].includes(error?.code);
      const next = knownRejected ? "failed" : "submission_unknown";
      try {
        await db.query(
          `UPDATE public.creator_pattern_extraction_jobs
              SET status=$2::text, error_code=$3, updated_at=now(),
                  completed_at=CASE WHEN $2::text='failed' THEN now() ELSE completed_at END
            WHERE id=$1 AND status='submitting'`,
          [id, next, next === "submission_unknown" ? "SUBMISSION_UNCERTAIN" : String(error?.code || "PROVIDER_REJECTED").slice(0, 100)]
        );
      } catch (e) { console.error("Pattern job status persistence failed:", e.message); }
    }
    return respondError(res, error, "start job");
  }
}

async function refreshPrediction(row) {
  if (!ACTIVE.has(row.status) || !row.prediction_id) return;
  const status = await getPatternStatus(row.prediction_id);
  await db.query(
    `UPDATE public.creator_pattern_extraction_jobs
        SET status=$3::text, updated_at=now(),
            completed_at=CASE WHEN $3::text IN ('completed','failed') THEN coalesce(completed_at,now()) ELSE completed_at END,
            error_code=CASE WHEN $3::text='failed' THEN 'GENERATION_FAILED' ELSE NULL END
      WHERE id=$1 AND prediction_id=$2 AND status IN ('starting','in_queue','processing')`,
    [row.id, row.prediction_id, status.status]
  );
}

async function getPatternJob(req, res) {
  try {
    const owner = creatorId(req);
    const id = jobId(req);
    let row = await ownedJob(id, owner);
    if (String(req.query?.refresh).toLowerCase() === "true" && ACTIVE.has(row.status)) {
      await refreshPrediction(row);
      row = await ownedJob(id, owner);
    }
    return res.status(200).json({status: "success", data: {job: publicJob(row)}});
  } catch (error) { return respondError(res, error, "read job"); }
}

async function getPatternResult(req, res) {
  try {
    const row = await ownedJob(jobId(req), creatorId(req));
    if (row.status !== "completed" || !row.prediction_id)
      throw apiError(409, "RESULT_NOT_READY", "Pattern is not ready yet.");
    const result = await getPatternStatus(row.prediction_id);
    if (result.status !== "completed" || !result.imageDataUri)
      throw apiError(410, "RESULT_EXPIRED", "Provider image is no longer available; download results promptly.");
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      status: "success",
      data: {job_id: row.id, mode: row.mode, output_format: "png", image: result.imageDataUri},
    });
  } catch (error) { return respondError(res, error, "get result"); }
}

module.exports = {createPatternJob, startPatternJob, getPatternJob, getPatternResult};
