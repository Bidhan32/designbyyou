"use strict";

const crypto = require("crypto");
const db = require("../../config/db");
const fashn = require("../../services/FashnTextToImageService");

const RATIOS = new Set(["1:1", "3:4", "4:5", "2:3", "9:16", "16:9"]);
const MODES = new Set(["fast", "balanced", "quality"]);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const DAILY_LIMIT = (() => {
  const n = Number(process.env.TEXT_TO_IMAGE_DAILY_LIMIT || 5);
  return Number.isInteger(n) ? Math.max(1, Math.min(20, n)) : 5;
})();

function fail(res, status, code, message) {
  return res.status(status).json({ status: "error", code, message });
}

function creator(req) {
  const id = String(req.user?.id || req.user?._id || "");
  return req.user?.role === "creator" && UUID.test(id) ? id : null;
}

function publicJob(row) {
  return {
    id: row.id,
    prompt: row.prompt,
    aspect_ratio: row.aspect_ratio,
    generation_mode: row.generation_mode,
    resolution: row.resolution,
    num_images: row.num_images,
    status: row.status,
    result_urls: Array.isArray(row.result_urls) ? row.result_urls : [],
    error_message: row.status === "failed" ? row.error_message : null,
    credits_used: row.credits_used,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}

const FIELDS = `id, prompt, aspect_ratio, generation_mode, resolution, num_images,
  status, result_urls, credits_used, error_message, created_at, updated_at, completed_at`;

exports.start = async (req, res) => {
  const creatorId = creator(req);
  if (!creatorId) return fail(res, 403, "CREATOR_REQUIRED", "A signed-in Creator account is required.");
  if (process.env.FASHN_TEXT_TO_IMAGE_ENABLED !== "true") {
    return fail(res, 503, "TOOL_NOT_ENABLED", "Text to Image is not enabled on this server yet.");
  }
  const body = req.body || {};
  if (Object.keys(body).some((key) => !["prompt", "aspect_ratio", "generation_mode", "request_key"].includes(key))) {
    return fail(res, 400, "UNKNOWN_INPUT", "Unsupported Text to Image input field.");
  }
  if (typeof body.prompt !== "string") {
    return fail(res, 400, "INVALID_PROMPT", "Provide a written fashion image prompt.");
  }
  const prompt = body.prompt.replace(/\u0000/g, "").trim();
  if (prompt.length < 12 || prompt.length > 1200) {
    return fail(res, 400, "INVALID_PROMPT", "The prompt must contain 12 to 1,200 characters.");
  }
  const ratio = body.aspect_ratio === undefined ? "3:4" : body.aspect_ratio;
  const mode = body.generation_mode === undefined ? "fast" : body.generation_mode;
  if (!RATIOS.has(ratio) || !MODES.has(mode)) {
    return fail(res, 400, "INVALID_SETTINGS", "Unsupported aspect ratio or generation mode.");
  }
  const requestKey = body.request_key === undefined ? crypto.randomUUID() : body.request_key;
  if (typeof requestKey !== "string" || !UUID.test(requestKey)) {
    return fail(res, 400, "INVALID_REQUEST_KEY", "request_key must be a UUID.");
  }

  let client;
  let job;
  let reused = false;
  let txOpen = false;
  try {
    client = await db.connect();
    await client.query("BEGIN");
    txOpen = true;
    // Serializes quota checks by Creator, including concurrent browser tabs.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`fashn_t2i_${creatorId}`]);
    const existing = await client.query(
      `SELECT ${FIELDS} FROM public.creator_text_to_image_jobs WHERE creator_id=$1 AND request_key=$2 LIMIT 1`,
      [creatorId, requestKey],
    );
    if (existing.rows.length) {
      job = existing.rows[0];
      reused = true;
    } else {
      // A crashed submission must not block a Creator forever.
      // Do not automatically resubmit it: an upstream request might have been billed.
      await client.query(`UPDATE public.creator_text_to_image_jobs
        SET status='failed', error_message='Submission could not be confirmed. Please check your history before trying again.', updated_at=NOW()
        WHERE creator_id=$1 AND status='submitting' AND updated_at < NOW() - INTERVAL '3 minutes'`, [creatorId]);
      const active = await client.query(`SELECT COUNT(*)::int AS n FROM public.creator_text_to_image_jobs
        WHERE creator_id=$1 AND status IN ('submitting','processing','saving')`, [creatorId]);
      if (active.rows[0].n >= 1) {
        await client.query("ROLLBACK"); txOpen = false;
        return fail(res, 429, "ACTIVE_JOB_EXISTS", "Wait for your current generation to finish before starting another.");
      }
      const used = await client.query(`SELECT COUNT(*)::int AS n FROM public.creator_text_to_image_jobs
        WHERE creator_id=$1 AND created_at >= NOW() - INTERVAL '24 hours'`, [creatorId]);
      if (used.rows[0].n >= DAILY_LIMIT) {
        await client.query("ROLLBACK"); txOpen = false;
        return fail(res, 429, "DAILY_LIMIT_REACHED", `Daily testing limit reached (${DAILY_LIMIT} requests per 24 hours).`);
      }
      const inserted = await client.query(`INSERT INTO public.creator_text_to_image_jobs
        (creator_id, request_key, prompt, aspect_ratio, generation_mode)
        VALUES ($1,$2,$3,$4,$5) RETURNING ${FIELDS}`, [creatorId, requestKey, prompt, ratio, mode]);
      job = inserted.rows[0];
    }
    await client.query("COMMIT"); txOpen = false;
  } catch (error) {
    if (txOpen && client) await client.query("ROLLBACK").catch(() => {});
    console.error("[TextToImage] Database start failed:", error.code || error.message);
    return fail(res, 500, "GENERATION_START_FAILED", "Could not prepare the generation request.");
  } finally { client?.release(); }

  if (reused) return res.status(200).json({ status: "success", data: publicJob(job), reused: true });

  try {
    const predictionId = await fashn.startTextToImage({
      prompt, aspectRatio: ratio, generationMode: mode,
    });
    const updated = await db.query(`UPDATE public.creator_text_to_image_jobs
      SET provider_prediction_id=$1,status='processing',updated_at=NOW()
      WHERE id=$2 AND creator_id=$3 RETURNING ${FIELDS}`, [predictionId, job.id, creatorId]);
    return res.status(202).json({ status: "success", data: publicJob(updated.rows[0]), reused: false });
  } catch (error) {
    console.error("[TextToImage] Provider submit failed:", error.status || "error", error.message);
    await db.query(`UPDATE public.creator_text_to_image_jobs SET status='failed',
      error_message='The generation could not be confirmed. If the request timed out, check provider usage before repeating it.',
      updated_at=NOW() WHERE id=$1 AND creator_id=$2`, [job.id, creatorId]).catch(() => {});
    return fail(res, error.status === 429 ? 429 : 502, "FASHN_SUBMISSION_FAILED", "The FASHN generation request did not start successfully. Check server logs.");
  }
};

exports.history = async (req, res) => {
  const creatorId = creator(req);
  if (!creatorId) return fail(res, 403, "CREATOR_REQUIRED", "A signed-in Creator account is required.");
  try {
    const result = await db.query(`SELECT ${FIELDS} FROM public.creator_text_to_image_jobs
      WHERE creator_id=$1 ORDER BY created_at DESC LIMIT 30`, [creatorId]);
    return res.status(200).json({ status: "success", data: result.rows.map(publicJob) });
  } catch (error) {
    console.error("[TextToImage] History query failed:", error.code || error.message);
    return fail(res, 500, "HISTORY_FAILED", "Could not load generation history.");
  }
};

exports.status = async (req, res) => {
  const creatorId = creator(req);
  if (!creatorId) return fail(res, 403, "CREATOR_REQUIRED", "A signed-in Creator account is required.");
  const jobId = req.params.jobId;
  if (typeof jobId !== "string" || !UUID.test(jobId)) {
    return fail(res, 400, "INVALID_JOB_ID", "Invalid generation ID.");
  }
  try {
    const result = await db.query(`SELECT * FROM public.creator_text_to_image_jobs
      WHERE id=$1 AND creator_id=$2 LIMIT 1`, [jobId, creatorId]);
    if (!result.rows.length) return fail(res, 404, "JOB_NOT_FOUND", "Generation not found.");
    const job = result.rows[0];
    if (["completed", "failed", "submitting"].includes(job.status)) {
      return res.status(200).json({ status: "success", data: publicJob(job) });
    }
    if (job.status === "saving" && Date.now() - new Date(job.updated_at).getTime() < 120000) {
      return res.status(200).json({ status: "success", data: publicJob(job) });
    }
    if (!job.provider_prediction_id) {
      return fail(res, 503, "PROVIDER_ID_MISSING", "Generation is not ready to check yet.");
    }
    const state = await fashn.getTextToImageStatus(job.provider_prediction_id);
    if (state.status === "failed") {
      const message = String(state.error?.message || "FASHN was unable to generate this image.").slice(0, 250);
      const failed = await db.query(`UPDATE public.creator_text_to_image_jobs
        SET status='failed', error_message=$1, updated_at=NOW()
        WHERE id=$2 AND creator_id=$3 AND status <> 'completed' RETURNING ${FIELDS}`,
        [message, jobId, creatorId]);
      return res.status(200).json({ status: "success", data: publicJob(failed.rows[0] || job) });
    }
    if (state.status !== "completed") {
      return res.status(200).json({ status: "success", data: publicJob(job) });
    }
    const outputUrl = state.output?.[0];
    if (typeof outputUrl !== "string") {
      const failed = await db.query(`UPDATE public.creator_text_to_image_jobs SET status='failed',
        error_message='FASHN completed but did not return an image.',updated_at=NOW()
        WHERE id=$1 AND creator_id=$2 RETURNING ${FIELDS}`, [jobId, creatorId]);
      return res.status(200).json({ status: "success", data: publicJob(failed.rows[0]) });
    }
    // Exactly one request may perform the Cloudinary copy.
    const lease = await db.query(`UPDATE public.creator_text_to_image_jobs
      SET status='saving',updated_at=NOW()
      WHERE id=$1 AND creator_id=$2 AND (
        status='processing' OR (status='saving' AND updated_at < NOW() - INTERVAL '2 minutes')
      ) RETURNING id`, [jobId, creatorId]);
    if (!lease.rows.length) {
      const latest = await db.query(`SELECT ${FIELDS} FROM public.creator_text_to_image_jobs WHERE id=$1 AND creator_id=$2`, [jobId, creatorId]);
      return res.status(200).json({ status: "success", data: publicJob(latest.rows[0]) });
    }
    try {
      const saved = await fashn.saveFashnOutputToCloudinary({
        fashnUrl: outputUrl, creatorId, jobId,
      });
      const completed = await db.query(`UPDATE public.creator_text_to_image_jobs
        SET status='completed', result_urls=$1::jsonb, cloudinary_public_id=$2,
        credits_used=$3, completed_at=NOW(),updated_at=NOW(),error_message=NULL
        WHERE id=$4 AND creator_id=$5 RETURNING ${FIELDS}`,
        [JSON.stringify([saved.url]), saved.publicId, state.credits, jobId, creatorId]);
      return res.status(200).json({ status: "success", data: publicJob(completed.rows[0]) });
    } catch (error) {
      console.error("[TextToImage] Image persistence failed:", error.message);
      // Preserve the FASHN prediction ID so the next poll can retry storage.
      await db.query(`UPDATE public.creator_text_to_image_jobs SET status='processing',updated_at=NOW()
        WHERE id=$1 AND creator_id=$2 AND status='saving'`, [jobId, creatorId]).catch(() => {});
      return fail(res, 503, "IMAGE_SAVE_RETRY", "Image generation completed, but saving is pending. Please retry shortly.");
    }
  } catch (error) {
    console.error("[TextToImage] Status check failed:", error.status || "error", error.message);
    return fail(res, error.status === 429 ? 429 : 503, "GENERATION_STATUS_UNAVAILABLE", "Generation status is temporarily unavailable. Try again shortly.");
  }
};
