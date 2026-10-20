"use strict";

/** DesignByYou – Creator Sketch -> Garment rendering using FASHN edit. */
const crypto = require("crypto");
const db = require("../../config/db");
const fashn = require("../../services/FashnSketchToImageService");

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MODES = new Set(["fast", "balanced", "quality"]);
const FABRICS = new Set(["as-drawn", "cotton", "satin", "silk", "denim", "linen", "wool", "leather", "chiffon"]);
const DAILY_LIMIT = (() => {
  const n = Number(process.env.SKETCH_TO_IMAGE_DAILY_LIMIT || 5);
  return Number.isInteger(n) ? Math.max(1, Math.min(20, n)) : 5;
})();

function fail(res, status, code, message) {
  return res.status(status).json({ status: "error", code, message });
}
function currentCreator(req) {
  const id = String(req.user?.id || req.user?._id || "");
  return req.user?.role === "creator" && UUID.test(id) ? id : null;
}
function safeJob(row) {
  return {
    id: row.id,
    instruction: row.instruction,
    fabric: row.fabric,
    generation_mode: row.generation_mode,
    source_url: row.source_url || null,
    result_urls: Array.isArray(row.result_urls) ? row.result_urls : [],
    status: row.status,
    credits_used: row.credits_used,
    error_message: row.status === "failed" ? row.error_message : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}
const FIELDS = `id, instruction, fabric, generation_mode, source_url,
  result_urls, status, credits_used, error_message, created_at,
  updated_at, completed_at`;

function buildInstruction(fabric, userInstructions) {
  const fabricText = fabric === "as-drawn"
    ? "Use the fabric or material suggested by the sketch."
    : `Render the garment using realistic ${fabric} fabric.`;
  return [
    "Transform the UPLOADED FASHION SKETCH into a photorealistic professional studio product photograph of the GARMENT ALONE.",
    "Match the sketch's silhouette, length, neckline, sleeve design, panel seams, construction lines and visible colors as closely as possible.",
    "Use a clean light neutral studio background. Show a front view. No human model, no mannequin, no text, no logo, no drawings or paper texture.",
    "Replace sketch lines with physically plausible garment fabric, natural drape and high-quality photographic lighting.",
    fabricText,
    userInstructions ? `Additional designer directions: ${userInstructions}` : "",
  ].filter(Boolean).join(" ");
}

exports.start = async (req, res) => {
  const creatorId = currentCreator(req);
  if (!creatorId) return fail(res, 403, "CREATOR_REQUIRED", "A signed-in Creator account is required.");
  if (process.env.FASHN_SKETCH_TO_IMAGE_ENABLED !== "true") {
    return fail(res, 503, "TOOL_NOT_ENABLED", "Sketch to Image is not enabled on this server yet.");
  }

  const body = req.body || {};
  if (Object.keys(body).some((key) => !["instruction", "fabric", "generation_mode", "request_key"].includes(key))) {
    return fail(res, 400, "UNKNOWN_INPUT", "Unsupported Sketch to Image field.");
  }
  if (!req.file) return fail(res, 400, "SKETCH_REQUIRED", "Upload one JPG, PNG, or WebP sketch.");
  const instruction = typeof body.instruction === "string" ? body.instruction.replace(/\u0000/g, "").trim() : "";
  if (instruction.length > 500) {
    return fail(res, 400, "INVALID_INSTRUCTION", "Additional instructions must not exceed 500 characters.");
  }
  const fabric = body.fabric || "as-drawn";
  const generationMode = body.generation_mode || "fast";
  if (!FABRICS.has(fabric) || !MODES.has(generationMode)) {
    return fail(res, 400, "INVALID_SETTINGS", "Unsupported fabric or generation mode.");
  }
  const requestKey = body.request_key || crypto.randomUUID();
  if (typeof requestKey !== "string" || !UUID.test(requestKey)) {
    return fail(res, 400, "INVALID_REQUEST_KEY", "request_key must be a valid UUID.");
  }

  let normalized;
  try { normalized = await fashn.normalizeSketch(req.file); }
  catch (err) { return fail(res, err.status || 400, "INVALID_SKETCH", err.message); }

  let client;
  let job;
  let reused = false;
  let txOpen = false;
  try {
    client = await db.connect();
    await client.query("BEGIN");
    txOpen = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`fashn_sketch_${creatorId}`]);
    const existing = await client.query(
      `SELECT ${FIELDS} FROM public.creator_sketch_to_image_jobs
       WHERE creator_id=$1 AND request_key=$2 LIMIT 1`, [creatorId, requestKey]
    );
    if (existing.rows.length) {
      job = existing.rows[0];
      reused = true;
    } else {
      // An unconfirmed provider submission must not hold the slot indefinitely.
      await client.query(`UPDATE public.creator_sketch_to_image_jobs
        SET status='failed',error_message='Submission could not be confirmed. Review provider usage before retrying.',updated_at=NOW()
        WHERE creator_id=$1 AND status='submitting'
          AND updated_at < NOW() - INTERVAL '3 minutes'`, [creatorId]);
      const active = await client.query(`SELECT COUNT(*)::int AS n
        FROM public.creator_sketch_to_image_jobs WHERE creator_id=$1
        AND status IN ('submitting','processing','saving')`, [creatorId]);
      if (active.rows[0].n > 0) {
        await client.query("ROLLBACK"); txOpen = false;
        return fail(res, 429, "ACTIVE_JOB_EXISTS", "Wait for the current sketch generation to finish.");
      }
      const used = await client.query(`SELECT COUNT(*)::int AS n
        FROM public.creator_sketch_to_image_jobs WHERE creator_id=$1
        AND created_at >= NOW() - INTERVAL '24 hours'`, [creatorId]);
      if (used.rows[0].n >= DAILY_LIMIT) {
        await client.query("ROLLBACK"); txOpen = false;
        return fail(res, 429, "DAILY_LIMIT_REACHED", `Daily testing limit reached (${DAILY_LIMIT} per 24 hours).`);
      }
      const added = await client.query(`INSERT INTO public.creator_sketch_to_image_jobs
        (creator_id, request_key, instruction, fabric, generation_mode)
        VALUES ($1,$2,$3,$4,$5) RETURNING ${FIELDS}`,
        [creatorId, requestKey, instruction, fabric, generationMode]);
      job = added.rows[0];
    }
    await client.query("COMMIT"); txOpen = false;
  } catch (err) {
    if (txOpen && client) await client.query("ROLLBACK").catch(() => {});
    console.error("[SketchToImage] DB submission failed:", err.code || err.message);
    return fail(res, 500, "GENERATION_START_FAILED", "Could not prepare Sketch to Image job.");
  } finally { client?.release(); }

  if (reused) {
    return res.status(200).json({ status: "success", data: safeJob(job), reused: true });
  }

  try {
    // Source sketch remains in the Creator's unlisted history; never publish automatically.
    const input = await fashn.saveSourceSketch(normalized, creatorId, job.id);
    await db.query(`UPDATE public.creator_sketch_to_image_jobs SET
      source_url=$1,source_public_id=$2,updated_at=NOW()
      WHERE id=$3 AND creator_id=$4`, [input.url, input.publicId, job.id, creatorId]);

    const predictionId = await fashn.startSketchEdit({
      sketchBuffer: normalized,
      instruction: buildInstruction(fabric, instruction),
      generationMode,
    });
    const updated = await db.query(`UPDATE public.creator_sketch_to_image_jobs
      SET provider_prediction_id=$1,status='processing',updated_at=NOW()
      WHERE id=$2 AND creator_id=$3 RETURNING ${FIELDS}`,
      [predictionId, job.id, creatorId]);
    return res.status(202).json({ status: "success", data: safeJob(updated.rows[0]) });
  } catch (err) {
    console.error("[SketchToImage] Submit failed:", err.status || "error", err.message);
    await db.query(`UPDATE public.creator_sketch_to_image_jobs
      SET status='failed',error_message='Submission could not be confirmed. Check provider usage before trying again.',updated_at=NOW()
      WHERE id=$1 AND creator_id=$2 AND status='submitting'`, [job.id, creatorId]).catch(() => {});
    return fail(res, err.status === 429 ? 429 : 502,
      "FASHN_SUBMISSION_FAILED", "Sketch generation could not be started. Check backend logs.");
  }
};

exports.history = async (req, res) => {
  const creatorId = currentCreator(req);
  if (!creatorId) return fail(res, 403, "CREATOR_REQUIRED", "A signed-in Creator account is required.");
  try {
    const result = await db.query(`SELECT ${FIELDS} FROM public.creator_sketch_to_image_jobs
      WHERE creator_id=$1 ORDER BY created_at DESC LIMIT 30`, [creatorId]);
    return res.status(200).json({ status: "success", data: result.rows.map(safeJob) });
  } catch (err) {
    console.error("[SketchToImage] History failed:", err.code || err.message);
    return fail(res, 500, "HISTORY_FAILED", "Could not load sketch generation history.");
  }
};

exports.status = async (req, res) => {
  const creatorId = currentCreator(req);
  if (!creatorId) return fail(res, 403, "CREATOR_REQUIRED", "A signed-in Creator account is required.");
  const jobId = req.params.jobId;
  if (typeof jobId !== "string" || !UUID.test(jobId)) {
    return fail(res, 400, "INVALID_JOB_ID", "Invalid generation ID.");
  }
  try {
    const result = await db.query(`SELECT * FROM public.creator_sketch_to_image_jobs
      WHERE id=$1 AND creator_id=$2 LIMIT 1`, [jobId, creatorId]);
    if (!result.rows.length) return fail(res, 404, "JOB_NOT_FOUND", "Generation not found.");
    let job = result.rows[0];
    if (job.status === "submitting" && Date.now() - new Date(job.updated_at).getTime() > 180000) {
      const expired = await db.query(`UPDATE public.creator_sketch_to_image_jobs SET
        status='failed',error_message='Submission confirmation timed out. Check provider usage before trying again.',updated_at=NOW()
        WHERE id=$1 AND creator_id=$2 AND status='submitting' RETURNING ${FIELDS}`,
        [jobId, creatorId]);
      return res.status(200).json({ status: "success", data: safeJob(expired.rows[0] || job) });
    }
    if (["completed", "failed", "submitting"].includes(job.status)) {
      return res.status(200).json({ status: "success", data: safeJob(job) });
    }
    if (job.status === "saving" && Date.now() - new Date(job.updated_at).getTime() < 120000) {
      return res.status(200).json({ status: "success", data: safeJob(job) });
    }
    if (!job.provider_prediction_id) {
      return fail(res, 503, "PREDICTION_ID_MISSING", "Waiting for provider confirmation.");
    }
    const provider = await fashn.getSketchStatus(job.provider_prediction_id);
    if (provider.status === "failed") {
      const message = String(provider.error?.message || "FASHN could not render this sketch.").slice(0, 250);
      const failed = await db.query(`UPDATE public.creator_sketch_to_image_jobs
        SET status='failed',error_message=$1,updated_at=NOW()
        WHERE id=$2 AND creator_id=$3 AND status <> 'completed' RETURNING ${FIELDS}`,
        [message, jobId, creatorId]);
      return res.status(200).json({ status: "success", data: safeJob(failed.rows[0] || job) });
    }
    if (provider.status !== "completed") {
      return res.status(200).json({ status: "success", data: safeJob(job) });
    }
    const outputUrl = Array.isArray(provider.output) ? provider.output[0] : null;
    if (typeof outputUrl !== "string") {
      const failed = await db.query(`UPDATE public.creator_sketch_to_image_jobs
        SET status='failed',error_message='Provider completed without an output image.',updated_at=NOW()
        WHERE id=$1 AND creator_id=$2 AND status <> 'completed' RETURNING ${FIELDS}`,
        [jobId, creatorId]);
      return res.status(200).json({ status: "success", data: safeJob(failed.rows[0] || job) });
    }
    // Claim exactly one writer for the Cloudinary result.
    const lease = await db.query(`UPDATE public.creator_sketch_to_image_jobs
      SET status='saving',updated_at=NOW()
      WHERE id=$1 AND creator_id=$2 AND
      (status='processing' OR (status='saving' AND updated_at < NOW() - INTERVAL '2 minutes'))
      RETURNING id`, [jobId, creatorId]);
    if (!lease.rows.length) {
      const latest = await db.query(`SELECT ${FIELDS} FROM public.creator_sketch_to_image_jobs
        WHERE id=$1 AND creator_id=$2`, [jobId, creatorId]);
      return res.status(200).json({ status: "success", data: safeJob(latest.rows[0]) });
    }
    try {
      const saved = await fashn.saveSketchOutput(outputUrl, creatorId, jobId);
      const completed = await db.query(`UPDATE public.creator_sketch_to_image_jobs
        SET status='completed',result_urls=$1::jsonb,output_public_id=$2,
        credits_used=$3,completed_at=NOW(),updated_at=NOW(),error_message=NULL
        WHERE id=$4 AND creator_id=$5 RETURNING ${FIELDS}`,
        [JSON.stringify([saved.url]), saved.publicId, provider.credits, jobId, creatorId]);
      return res.status(200).json({ status: "success", data: safeJob(completed.rows[0]) });
    } catch (err) {
      console.error("[SketchToImage] Output save failed:", err.message);
      await db.query(`UPDATE public.creator_sketch_to_image_jobs
        SET status='processing',updated_at=NOW()
        WHERE id=$1 AND creator_id=$2 AND status='saving'`, [jobId, creatorId]).catch(() => {});
      return fail(res, 503, "IMAGE_SAVE_RETRY", "Rendering is complete; image storage is retrying.");
    }
  } catch (err) {
    console.error("[SketchToImage] Status failed:", err.status || "error", err.message);
    return fail(res, err.status === 429 ? 429 : 503,
      "STATUS_UNAVAILABLE", "Could not check generation status. Please retry.");
  }
};
