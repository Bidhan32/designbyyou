"use strict";

/** Creator-only standalone Virtual Try-On; no booking queries or changes. */
const crypto = require("crypto");
const db = require("../../config/db");
const tryOn = require("../../services/FashnCreatorTryOnService");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set(["auto", "tops", "bottoms", "one-pieces"]);
const MODES = new Set(["performance", "balanced", "quality"]);
const PHOTO_TYPES = new Set(["auto", "flat-lay", "model"]);
const FIELDS = `id,category,mode,garment_photo_type,status,output_public_id,
  credits_used,error_message,created_at,updated_at,completed_at`;

function error(res, status, code, message) {
  return res.status(status).json({ status: "error", code, message });
}
function creatorId(req) {
  const id = String(req.user?.id || "");
  return req.user?.role === "creator" && UUID.test(id) ? id : null;
}
function dailyLimit() {
  const configured = Number(process.env.CREATOR_TRYON_DAILY_LIMIT || 5);
  return Number.isInteger(configured) ? Math.max(1, Math.min(30, configured)) : 5;
}
function safeJob(row) {
  return {
    id: row.id,
    category: row.category,
    mode: row.mode,
    garment_photo_type: row.garment_photo_type,
    status: row.status,
    credits_used: row.credits_used,
    error_message: row.status === "failed" ? row.error_message : null,
    ...tryOn.signedResultUrls(row.status === "completed" ? row.output_public_id : null),
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}

exports.start = async (req, res) => {
  const id = creatorId(req);
  if (!id) return error(res, 403, "CREATOR_REQUIRED", "A signed-in Creator account is required.");
  if (process.env.FASHN_CREATOR_TRYON_ENABLED !== "true") {
    return error(res, 503, "TOOL_NOT_ENABLED", "Creator Virtual Try-On is not enabled on this server yet.");
  }
  const body = req.body || {};
  if (Object.keys(body).some(key => !["category", "mode", "garment_photo_type", "request_key", "consent"].includes(key))) {
    return error(res, 400, "UNKNOWN_INPUT", "Unsupported Virtual Try-On setting.");
  }
  if (body.consent !== "true") {
    return error(res, 400, "CONSENT_REQUIRED", "Confirm permission to use the person photo and save its generated output.");
  }
  const category = body.category || "auto";
  const mode = body.mode || "balanced";
  const garmentPhotoType = body.garment_photo_type || "auto";
  if (!CATEGORIES.has(category) || !MODES.has(mode) || !PHOTO_TYPES.has(garmentPhotoType)) {
    return error(res, 400, "INVALID_SETTINGS", "Unsupported category, mode, or garment photo type.");
  }
  const requestKey = body.request_key || crypto.randomUUID();
  if (typeof requestKey !== "string" || !UUID.test(requestKey)) {
    return error(res, 400, "INVALID_REQUEST_KEY", "request_key must be a valid UUID.");
  }
  const personFile = req.files?.person_image?.[0];
  const garmentFile = req.files?.garment_image?.[0];
  if (!personFile || !garmentFile) {
    return error(res, 400, "IMAGES_REQUIRED", "Upload one person photo and one garment photo.");
  }

  let personDataUri, garmentDataUri;
  try {
    [personDataUri, garmentDataUri] = await Promise.all([
      tryOn.prepareImage(personFile, "person"),
      tryOn.prepareImage(garmentFile, "garment"),
    ]);
  } catch (err) {
    return error(res, err.status || 400, err.code || "INVALID_IMAGES", err.message);
  }
  // Uploaded buffers are not persisted or written to Cloudinary.
  let client, job, txOpen = false, reused = false;
  try {
    client = await db.connect();
    await client.query("BEGIN"); txOpen = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`creator_tryon_${id}`]);
    const old = await client.query(`SELECT ${FIELDS} FROM public.creator_virtual_tryon_jobs WHERE creator_id=$1 AND request_key=$2`, [id, requestKey]);
    if (old.rows.length) {
      job = old.rows[0]; reused = true;
    } else {
      await client.query(`UPDATE public.creator_virtual_tryon_jobs SET status='failed', error_message='Submission could not be confirmed. Review provider usage before retrying.', updated_at=NOW()
        WHERE creator_id=$1 AND status='submitting' AND updated_at < NOW() - INTERVAL '3 minutes'`, [id]);
      const active = await client.query(`SELECT COUNT(*)::int AS n FROM public.creator_virtual_tryon_jobs WHERE creator_id=$1 AND status IN ('submitting','processing','saving')`, [id]);
      if (active.rows[0].n > 0) {
        await client.query("ROLLBACK"); txOpen = false;
        return error(res, 429, "ACTIVE_JOB_EXISTS", "Wait for your active Virtual Try-On to finish.");
      }
      const quota = await client.query(`SELECT COUNT(*)::int AS n FROM public.creator_virtual_tryon_jobs WHERE creator_id=$1 AND created_at >= NOW() - INTERVAL '24 hours'`, [id]);
      if (quota.rows[0].n >= dailyLimit()) {
        await client.query("ROLLBACK"); txOpen = false;
        return error(res, 429, "DAILY_LIMIT_REACHED", `Your test limit is ${dailyLimit()} generations per rolling 24 hours.`);
      }
      const inserted = await client.query(`INSERT INTO public.creator_virtual_tryon_jobs (creator_id,request_key,category,mode,garment_photo_type)
        VALUES ($1,$2,$3,$4,$5) RETURNING ${FIELDS}`, [id, requestKey, category, mode, garmentPhotoType]);
      job = inserted.rows[0];
    }
    await client.query("COMMIT"); txOpen = false;
  } catch (err) {
    if (txOpen && client) await client.query("ROLLBACK").catch(() => {});
    console.error("[CreatorTryOn] Database submission:", err.code || err.message);
    return error(res, 500, "DATABASE_ERROR", "Could not prepare the Virtual Try-On request.");
  } finally { client?.release(); }
  if (reused) return res.status(200).json({ status: "success", reused: true, data: safeJob(job) });

  try {
    const predictionId = await tryOn.startPrediction({ personDataUri, garmentDataUri, category, mode, garmentPhotoType });
    const result = await db.query(`UPDATE public.creator_virtual_tryon_jobs SET provider_prediction_id=$1,status='processing',updated_at=NOW()
      WHERE id=$2 AND creator_id=$3 RETURNING ${FIELDS}`, [predictionId, job.id, id]);
    return res.status(202).json({ status: "success", data: safeJob(result.rows[0]) });
  } catch (err) {
    console.error("[CreatorTryOn] Submission failed:", { code: err.code, status: err.status });
    await db.query(`UPDATE public.creator_virtual_tryon_jobs SET status='failed',error_message='Submission could not be confirmed. Check provider usage before retrying.',updated_at=NOW()
      WHERE id=$1 AND creator_id=$2 AND status='submitting'`, [job.id, id]).catch(() => {});
    return error(res, err.status === 429 ? 429 : 502, "FASHN_SUBMISSION_FAILED", "Virtual Try-On could not be started. Check server logs.");
  }
};

exports.history = async (req, res) => {
  const id = creatorId(req);
  if (!id) return error(res, 403, "CREATOR_REQUIRED", "A Creator account is required.");
  try {
    const result = await db.query(`SELECT ${FIELDS} FROM public.creator_virtual_tryon_jobs WHERE creator_id=$1 ORDER BY created_at DESC LIMIT 30`, [id]);
    return res.json({ status: "success", data: result.rows.map(safeJob) });
  } catch (err) {
    console.error("[CreatorTryOn] History:", err.code || err.message);
    return error(res, 500, "HISTORY_FAILED", "Could not load your Virtual Try-On history.");
  }
};

exports.status = async (req, res) => {
  const id = creatorId(req), jobId = req.params.jobId;
  if (!id) return error(res, 403, "CREATOR_REQUIRED", "A Creator account is required.");
  if (!UUID.test(String(jobId || ""))) return error(res, 400, "INVALID_JOB_ID", "Invalid generation ID.");
  try {
    const result = await db.query(`SELECT * FROM public.creator_virtual_tryon_jobs WHERE id=$1 AND creator_id=$2`, [jobId, id]);
    if (!result.rows.length) return error(res, 404, "JOB_NOT_FOUND", "Generation not found.");
    let job = result.rows[0];

    if (job.status === "submitting" && Date.now() - new Date(job.updated_at).getTime() > 180000) {
      const expired = await db.query(`UPDATE public.creator_virtual_tryon_jobs SET status='failed',error_message='Submission could not be confirmed.',updated_at=NOW()
        WHERE id=$1 AND creator_id=$2 AND status='submitting' RETURNING *`, [jobId, id]);
      return res.json({ status: "success", data: safeJob(expired.rows[0] || job) });
    }
    if (job.status === "saving" && Date.now() - new Date(job.updated_at).getTime() > 300000) {
      const expired = await db.query(`UPDATE public.creator_virtual_tryon_jobs SET status='failed',error_message='Result saving timed out.',updated_at=NOW()
        WHERE id=$1 AND creator_id=$2 AND status='saving' RETURNING *`, [jobId, id]);
      return res.json({ status: "success", data: safeJob(expired.rows[0] || job) });
    }
    if (job.status !== "processing") {
      return res.json({ status: "success", data: safeJob(job) });
    }
    const { data, credits } = await tryOn.getPrediction(job.provider_prediction_id);
    if (data.status === "failed") {
      const failed = await db.query(`UPDATE public.creator_virtual_tryon_jobs SET status='failed',error_message='The FASHN generation failed.',credits_used=$1,updated_at=NOW()
        WHERE id=$2 AND creator_id=$3 AND status='processing' RETURNING *`, [credits, jobId, id]);
      return res.json({ status: "success", data: safeJob(failed.rows[0] || job) });
    }
    if (data.status !== "completed") {
      if (!["starting", "in_queue", "processing"].includes(data.status)) {
        console.error("[CreatorTryOn] Unexpected provider status:", String(data.status).slice(0, 40));
      }
      return res.json({ status: "success", data: safeJob(job) });
    }

    const claimed = await db.query(`UPDATE public.creator_virtual_tryon_jobs SET status='saving',updated_at=NOW()
      WHERE id=$1 AND creator_id=$2 AND status='processing' RETURNING *`, [jobId, id]);
    if (!claimed.rows.length) {
      const latest = await db.query(`SELECT * FROM public.creator_virtual_tryon_jobs WHERE id=$1 AND creator_id=$2`, [jobId, id]);
      return res.json({ status: "success", data: safeJob(latest.rows[0]) });
    }
    job = claimed.rows[0];
    try {
      const base64Output = Array.isArray(data.output) ? data.output[0] : null;
      const publicId = await tryOn.savePrivateResult(base64Output, id, jobId);
      const saved = await db.query(`UPDATE public.creator_virtual_tryon_jobs SET output_public_id=$1,status='completed',credits_used=$2,completed_at=NOW(),updated_at=NOW()
        WHERE id=$3 AND creator_id=$4 AND status='saving' RETURNING *`, [publicId, credits, jobId, id]);
      if (!saved.rows.length) {
        await tryOn.destroyResult(publicId).catch(() => {});
        return error(res, 409, "STATE_CHANGED", "Generation status changed while saving. Refresh history.");
      }
      return res.json({ status: "success", data: safeJob(saved.rows[0]) });
    } catch (err) {
      console.error("[CreatorTryOn] Save result:", err.code || err.message);
      const failed = await db.query(`UPDATE public.creator_virtual_tryon_jobs SET status='failed',error_message='Generated image could not be saved.',updated_at=NOW()
        WHERE id=$1 AND creator_id=$2 AND status='saving' RETURNING *`, [jobId, id]);
      return res.json({ status: "success", data: safeJob(failed.rows[0] || job) });
    }
  } catch (err) {
    console.error("[CreatorTryOn] Polling:", err.code || err.message);
    return error(res, err.status === 429 ? 429 : 503, "STATUS_UNAVAILABLE", "Could not check Virtual Try-On status; retry shortly.");
  }
};

exports.remove = async (req, res) => {
  const id = creatorId(req), jobId = req.params.jobId;
  if (!id) return error(res, 403, "CREATOR_REQUIRED", "A Creator account is required.");
  if (!UUID.test(String(jobId || ""))) return error(res, 400, "INVALID_JOB_ID", "Invalid generation ID.");
  try {
    const result = await db.query(`SELECT * FROM public.creator_virtual_tryon_jobs WHERE id=$1 AND creator_id=$2`, [jobId, id]);
    if (!result.rows.length) return error(res, 404, "JOB_NOT_FOUND", "Generation not found.");
    const job = result.rows[0];
    if (["submitting", "processing", "saving"].includes(job.status)) {
      return error(res, 409, "JOB_ACTIVE", "Wait until generation finishes before deleting it.");
    }
    if (job.output_public_id) await tryOn.destroyResult(job.output_public_id);
    await db.query(`DELETE FROM public.creator_virtual_tryon_jobs WHERE id=$1 AND creator_id=$2`, [jobId, id]);
    return res.json({ status: "success", message: "Saved Virtual Try-On deleted." });
  } catch (err) {
    console.error("[CreatorTryOn] Delete:", err.code || err.message);
    return error(res, 503, "DELETE_FAILED", "Could not delete the generation yet. Please try again.");
  }
};
