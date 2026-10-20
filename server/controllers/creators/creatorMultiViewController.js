"use strict";

/** Creator-only front/side/back set. No booking or Fashion Editor mutations. */
const crypto = require("crypto");
const db = require("../../config/db");
const multi = require("../../services/FashnMultiViewService");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODES = new Set(["fast", "balanced", "quality"]);
const SUBJECTS = new Set(["garment", "model"]);
const VIEWS = ["side", "back"];
const ALL_VIEWS = ["front", ...VIEWS];
const ALLOWED_BODY = new Set(["request_key", "generation_mode", "subject_type", "keep_background", "instruction", "consent"]);

function fail(res, http, code, message) {
  return res.status(http).json({ status: "error", code, message });
}
function authenticatedCreator(req) {
  const id = String(req.user?.id || "");
  return req.user?.role === "creator" && UUID.test(id) ? id : null;
}
function limit() {
  const value = Number(process.env.MULTI_VIEW_DAILY_LIMIT || 5);
  return Number.isInteger(value) ? Math.max(1, Math.min(value, 20)) : 5;
}
function aggregateStatuses(viewRows) {
  const hasGeneratedFront = viewRows.some(row => row.view === "front");
  const names = hasGeneratedFront ? ALL_VIEWS : VIEWS;
  const statuses = names.map(view => viewRows.find(row => row.view === view)?.status || "submitting");
  if (statuses.every(s => s === "completed")) return "completed";
  if (statuses.every(s => s === "failed")) return "failed";
  if (statuses.every(s => ["completed", "failed"].includes(s))) return "partial";
  if (statuses.some(s => ["processing", "saving", "completed"].includes(s))) return "processing";
  return "submitting";
}
function safeJob(row, viewRows) {
  const views = {};
  for (const name of VIEWS) {
    const item = viewRows.find(v => v.view === name);
    views[name] = item ? {
      status: item.status,
      ...(item.status === "completed" ? multi.signedUrls(item.output_public_id) : { image_url: null, download_url: null }),
      credits_used: item.credits_used,
      error_message: item.status === "failed" ? item.error_message : null,
    } : { status: "submitting", image_url: null, download_url: null, error_message: null };
  }
  const generatedFront = viewRows.find(v => v.view === "front");
  const front = generatedFront
    ? (generatedFront.status === "completed"
      ? multi.signedUrls(generatedFront.output_public_id)
      : { image_url: null, download_url: null })
    : multi.signedUrls(row.source_public_id); // Legacy sets and Model mode.
  const creditValues = viewRows.map(v => v.credits_used).filter(v => v != null && Number.isFinite(Number(v)));
  return {
    id: row.id,
    status: aggregateStatuses(viewRows),
    subject_type: row.subject_type,
    generation_mode: row.generation_mode,
    keep_background: row.keep_background,
    instruction: row.instruction,
    front,
    front_status: generatedFront?.status || "completed",
    front_error: generatedFront?.status === "failed" ? generatedFront.error_message : null,
    front_generated: Boolean(generatedFront),
    source: multi.signedUrls(row.source_public_id), // Original stays available separately.
    context: multi.signedUrls(row.context_public_id),
    views,
    credits_used: creditValues.length ? creditValues.reduce((sum, n) => sum + Number(n), 0) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
async function getJob(creatorId, jobId) {
  const r = await db.query(
    `SELECT * FROM public.creator_multi_view_jobs WHERE id=$1 AND creator_id=$2 LIMIT 1`,
    [jobId, creatorId]
  );
  if (!r.rows.length) return null;
  const views = await db.query(`SELECT * FROM public.creator_multi_view_images WHERE job_id=$1 ORDER BY view`, [jobId]);
  return { row: r.rows[0], views: views.rows };
}
async function getMany(creatorId) {
  const r = await db.query(`SELECT * FROM public.creator_multi_view_jobs WHERE creator_id=$1 ORDER BY created_at DESC LIMIT 25`, [creatorId]);
  if (!r.rows.length) return [];
  const ids = r.rows.map(row => row.id);
  const v = await db.query(`SELECT * FROM public.creator_multi_view_images WHERE job_id=ANY($1::uuid[])`, [ids]);
  return r.rows.map(row => safeJob(row, v.rows.filter(item => item.job_id === row.id)));
}

exports.start = async (req, res) => {
  const creatorId = authenticatedCreator(req);
  if (!creatorId) return fail(res, 403, "CREATOR_REQUIRED", "A signed-in Creator is required.");
  if (process.env.FASHN_MULTI_VIEW_ENABLED !== "true") {
    return fail(res, 503, "TOOL_NOT_ENABLED", "Multi-View Generator is not enabled on this server yet.");
  }
  if (!String(process.env.FASHN_API_KEY || "").trim()) {
    return fail(res, 503, "PROVIDER_NOT_CONFIGURED", "FASHN is not configured.");
  }
  const body = req.body || {};
  if (Object.keys(body).some(key => !ALLOWED_BODY.has(key))) {
    return fail(res, 400, "INVALID_FIELDS", "Unsupported multi-view setting.");
  }
  if (body.consent !== "true") {
    return fail(res, 400, "PERMISSION_REQUIRED", "Confirm you have permission to use these uploaded images.");
  }
  const mode = body.generation_mode || "fast";
  const subject = body.subject_type || "garment";
  const keepBackground = body.keep_background === "true";
  const instruction = typeof body.instruction === "string" ? body.instruction.replace(/\u0000/g, "").trim() : "";
  const requestKey = body.request_key || crypto.randomUUID();
  if (!MODES.has(mode) || !SUBJECTS.has(subject) || instruction.length > 500 ||
      (body.keep_background != null && !["true", "false"].includes(body.keep_background)) ||
      typeof requestKey !== "string" || !UUID.test(requestKey)) {
    return fail(res, 400, "INVALID_SETTINGS", "Invalid mode, subject type, prompt, background or request ID.");
  }
  const imageFile = req.files?.source_image?.[0];
  const contextFile = req.files?.context_image?.[0];
  if (!imageFile) return fail(res, 400, "SOURCE_REQUIRED", "Please upload the primary front-view image.");
  let sourceBuffer, contextBuffer;
  try {
    [sourceBuffer, contextBuffer] = await Promise.all([
      multi.prepareUpload(imageFile),
      contextFile ? multi.prepareUpload(contextFile) : Promise.resolve(null),
    ]);
  } catch (err) { return fail(res, err.status || 400, err.code || "INVALID_IMAGE", err.message); }

  let client, jobId, reused = false, txOpen = false;
  try {
    client = await db.connect();
    await client.query("BEGIN"); txOpen = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`creator_multiview_${creatorId}`]);
    const exists = await client.query(`SELECT id FROM public.creator_multi_view_jobs WHERE creator_id=$1 AND request_key=$2`, [creatorId, requestKey]);
    if (exists.rows.length) {
      jobId = exists.rows[0].id; reused = true;
    } else {
      // Fail only permanently unconfirmed submissions, not running FASHN jobs.
      await client.query(`UPDATE public.creator_multi_view_images AS v SET status='failed',
        error_message='Provider submission could not be confirmed.'
        FROM public.creator_multi_view_jobs AS j WHERE v.job_id=j.id AND j.creator_id=$1
        AND v.status='submitting' AND v.updated_at < NOW() - INTERVAL '3 minutes'`, [creatorId]);
      const active = await client.query(`SELECT COUNT(*)::int AS n FROM public.creator_multi_view_jobs j
        WHERE j.creator_id=$1 AND EXISTS (SELECT 1 FROM public.creator_multi_view_images v
          WHERE v.job_id=j.id AND v.status IN ('queued','submitting','processing','saving'))`, [creatorId]);
      if (active.rows[0].n) {
        await client.query("ROLLBACK"); txOpen = false;
        return fail(res, 429, "ACTIVE_JOB_EXISTS", "Wait for the existing multi-view set to finish.");
      }
      const count = await client.query(`SELECT COUNT(*)::int AS n FROM public.creator_multi_view_jobs
        WHERE creator_id=$1 AND created_at >= NOW() - INTERVAL '24 hours'`, [creatorId]);
      if (count.rows[0].n >= limit()) {
        await client.query("ROLLBACK"); txOpen = false;
        return fail(res, 429, "DAILY_LIMIT_REACHED", `Limit reached: ${limit()} view sets per rolling 24 hours.`);
      }
      const row = await client.query(`INSERT INTO public.creator_multi_view_jobs
        (creator_id,request_key,subject_type,generation_mode,keep_background,instruction)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [creatorId, requestKey, subject, mode, keepBackground, instruction]);
      jobId = row.rows[0].id;
      if (subject === "garment") {
        // Normalize person-worn source into garment-only front FIRST.
        // Side and back cannot begin until that front exists.
        await client.query(`INSERT INTO public.creator_multi_view_images (job_id,view,status)
          VALUES ($1,'front','submitting'),($1,'side','queued'),($1,'back','queued')`, [jobId]);
      } else {
        await client.query(`INSERT INTO public.creator_multi_view_images (job_id,view)
          VALUES ($1,'side'),($1,'back')`, [jobId]);
      }
    }
    await client.query("COMMIT"); txOpen = false;
  } catch (err) {
    if (txOpen && client) await client.query("ROLLBACK").catch(() => {});
    console.error("[MultiView] DB create failed:", err.code || err.message);
    return fail(res, 500, "DATABASE_ERROR", "Could not prepare the multi-view set.");
  } finally { client?.release(); }

  if (reused) {
    const existing = await getJob(creatorId, jobId);
    return res.status(200).json({ status: "success", reused: true, data: safeJob(existing.row, existing.views) });
  }

  // The source and optional context are private, not published to Showcase.
  let sourceId, contextId;
  try {
    sourceId = await multi.saveImage(sourceBuffer, creatorId, jobId, "source");
    if (contextBuffer) contextId = await multi.saveImage(contextBuffer, creatorId, jobId, "context");
    await db.query(`UPDATE public.creator_multi_view_jobs
      SET source_public_id=$1,context_public_id=$2,updated_at=NOW() WHERE id=$3 AND creator_id=$4`,
      [sourceId, contextId || null, jobId, creatorId]);
  } catch (err) {
    await db.query(`UPDATE public.creator_multi_view_images SET status='failed',error_message='Source storage failed.',updated_at=NOW() WHERE job_id=$1`, [jobId]).catch(() => {});
    await Promise.allSettled([sourceId && multi.destroyImage(sourceId), contextId && multi.destroyImage(contextId)]);
    console.error("[MultiView] Private source save failed:", err.code || err.message);
    return fail(res, 503, "STORAGE_FAILED", "Could not securely store the reference image.");
  }

  // For garment-only: extract a true standalone garment FRONT first.
  // Its saved output becomes the source for SIDE and BACK on later polls.
  // Model mode retains the previous two-call behavior.
  const firstViews = subject === "garment" ? ["front"] : VIEWS;
  for (const view of firstViews) {
    try {
      const predictionId = await multi.startView({
        sourceBuffer, contextBuffer, view, subjectType: subject,
        keepBackground, instruction, generationMode: mode, seed: 42,
      });
      await db.query(`UPDATE public.creator_multi_view_images
        SET prediction_id=$1,status='processing',updated_at=NOW()
        WHERE job_id=$2 AND view=$3 AND status='submitting'`, [predictionId, jobId, view]);
    } catch (err) {
      console.error("[MultiView] View submission error:", { view, code: err.code || "ERROR", status: err.status });
      await db.query(`UPDATE public.creator_multi_view_images
        SET status='failed',error_message='This view could not be submitted; check FASHN usage before retrying.',updated_at=NOW()
        WHERE job_id=$1 AND view=$2 AND status='submitting'`, [jobId, view]).catch(() => {});
      if (view === "front") {
        await db.query(`UPDATE public.creator_multi_view_images
          SET status='failed',error_message='Garment-only front could not be prepared.',updated_at=NOW()
          WHERE job_id=$1 AND status='queued'`, [jobId]).catch(() => {});
      }
    }
  }
  const current = await getJob(creatorId, jobId);
  const safe = safeJob(current.row, current.views);
  return res.status(safe.status === "failed" ? 502 : 202).json({
    status: safe.status === "failed" ? "error" : "success", data: safe,
    ...(safe.status === "failed" ? { code: "PROVIDER_SUBMISSION_FAILED", message: "FASHN could not start either view." } : {}),
  });
};

exports.history = async (req, res) => {
  const creatorId = authenticatedCreator(req);
  if (!creatorId) return fail(res, 403, "CREATOR_REQUIRED", "A Creator account is required.");
  try { return res.json({ status: "success", data: await getMany(creatorId) }); }
  catch (err) {
    console.error("[MultiView] History:", err.code || err.message);
    return fail(res, 500, "HISTORY_FAILED", "Could not load multi-view history.");
  }
};

async function advanceView(creatorId, jobId, row) {
  const view = row.view;
  if (row.status === "submitting" && Date.now() - new Date(row.updated_at).getTime() > 180000) {
    await db.query(`UPDATE public.creator_multi_view_images SET status='failed',
      error_message='Prediction submission could not be confirmed.',updated_at=NOW()
      WHERE job_id=$1 AND view=$2 AND status='submitting'`, [jobId, view]);
    return;
  }
  if (row.status !== "processing" && !(row.status === "saving" && Date.now() - new Date(row.updated_at).getTime() > 180000)) return;
  const { data, credits } = await multi.predictionStatus(row.prediction_id);
  if (data.status === "failed") {
    await db.query(`UPDATE public.creator_multi_view_images SET status='failed',
      error_message='FASHN could not generate this view.',credits_used=$1,updated_at=NOW()
      WHERE job_id=$2 AND view=$3 AND status IN ('processing','saving')`, [credits, jobId, view]);
    return;
  }
  if (data.status !== "completed") return;
  const output = Array.isArray(data.output) ? data.output[0] : null;
  if (typeof output !== "string") {
    await db.query(`UPDATE public.creator_multi_view_images SET status='failed',error_message='FASHN returned no output image.',updated_at=NOW()
      WHERE job_id=$1 AND view=$2 AND status IN ('processing','saving')`, [jobId, view]);
    return;
  }
  // Exactly one request can claim the save. Timed-out saving leases can recover.
  const claim = await db.query(`UPDATE public.creator_multi_view_images SET status='saving',updated_at=NOW()
    WHERE job_id=$1 AND view=$2 AND (status='processing' OR
      (status='saving' AND updated_at < NOW() - INTERVAL '3 minutes')) RETURNING id`, [jobId, view]);
  if (!claim.rows.length) return;
  try {
    const publicId = await multi.saveOutput(output, creatorId, jobId, view);
    await db.query(`UPDATE public.creator_multi_view_images SET status='completed',output_public_id=$1,
      credits_used=$2,error_message=NULL,updated_at=NOW() WHERE job_id=$3 AND view=$4 AND status='saving'`,
      [publicId, credits, jobId, view]);
  } catch (err) {
    console.error("[MultiView] Output save error:", { view, code: err.code || "STORAGE_FAILED" });
    await db.query(`UPDATE public.creator_multi_view_images SET status='processing',updated_at=NOW()
      WHERE job_id=$1 AND view=$2 AND status='saving'`, [jobId, view]).catch(() => {});
  }
}

// When the isolated front is available, start the two remaining views.
// Atomic row claims prevent duplicate paid FASHN submissions when multiple
// browser polling requests overlap.
async function continueGarmentSet(creatorId, jobId, current) {
  const front = current.views.find(v => v.view === "front");
  if (!front) return; // Model mode and older history entries.
  if (front.status === "failed") {
    await db.query(`UPDATE public.creator_multi_view_images
      SET status='failed',error_message='The isolated garment front failed.',updated_at=NOW()
      WHERE job_id=$1 AND status='queued'`, [jobId]);
    return;
  }
  if (front.status !== "completed" || !front.output_public_id ||
    !current.views.some(v => v.status === "queued")) return;

  // Loading the secured front keeps the original person photo out of the
  // side/back FASHN prompts, preventing model bleed-through.
  const normalizedFront = await multi.readStoredImage(
    front.output_public_id, creatorId, jobId, "front"
  );
  for (const view of VIEWS) {
    const claim = await db.query(`UPDATE public.creator_multi_view_images
      SET status='submitting',updated_at=NOW()
      WHERE job_id=$1 AND view=$2 AND status='queued' RETURNING id`, [jobId, view]);
    if (!claim.rows.length) continue;
    try {
      const predictionId = await multi.startView({
        sourceBuffer: normalizedFront,
        contextBuffer: null,
        view, subjectType: "garment", keepBackground: false,
        instruction: current.row.instruction,
        generationMode: current.row.generation_mode, seed: 42,
      });
      await db.query(`UPDATE public.creator_multi_view_images
        SET prediction_id=$1,status='processing',updated_at=NOW()
        WHERE job_id=$2 AND view=$3 AND status='submitting'`, [predictionId, jobId, view]);
    } catch (err) {
      console.error("[MultiView] Garment angle submission error:", {
        view, code: err.code || "ERROR", status: err.status,
      });
      await db.query(`UPDATE public.creator_multi_view_images
        SET status='failed',error_message='Could not submit this garment view.',updated_at=NOW()
        WHERE job_id=$1 AND view=$2 AND status='submitting'`, [jobId, view]);
    }
  }
}

exports.status = async (req, res) => {
  const creatorId = authenticatedCreator(req);
  const jobId = req.params.jobId;
  if (!creatorId) return fail(res, 403, "CREATOR_REQUIRED", "A Creator account is required.");
  if (!UUID.test(String(jobId || ""))) return fail(res, 400, "INVALID_JOB_ID", "Invalid view-set ID.");
  try {
    const initial = await getJob(creatorId, jobId);
    if (!initial) return fail(res, 404, "NOT_FOUND", "View set not found.");
    // Parallel polls, but DB claim prevents duplicate saves.
    const results = await Promise.allSettled(initial.views.map(v => advanceView(creatorId, jobId, v)));
    if (results.some(r => r.status === "rejected")) {
      const first = results.find(r => r.status === "rejected");
      console.error("[MultiView] Provider status fetch failed:", first.reason?.code || "PROVIDER_ERROR");
    }
    const afterPolling = await getJob(creatorId, jobId);
    try {
      await continueGarmentSet(creatorId, jobId, afterPolling);
    } catch (err) {
      // A transient Cloudinary read error should not mark a paid view failed.
      // A later status request can safely retry.
      console.error("[MultiView] Garment sequence retry pending:", err.code || err.message);
    }
    const current = await getJob(creatorId, jobId);
    return res.json({ status: "success", data: safeJob(current.row, current.views) });
  } catch (err) {
    console.error("[MultiView] Status:", err.code || err.message);
    return fail(res, 502, "STATUS_FAILED", "Could not refresh this multi-view set.");
  }
};

exports.remove = async (req, res) => {
  const creatorId = authenticatedCreator(req);
  const jobId = req.params.jobId;
  if (!creatorId) return fail(res, 403, "CREATOR_REQUIRED", "A Creator account is required.");
  if (!UUID.test(String(jobId || ""))) return fail(res, 400, "INVALID_JOB_ID", "Invalid view-set ID.");
  try {
    const current = await getJob(creatorId, jobId);
    if (!current) return fail(res, 404, "NOT_FOUND", "View set not found.");
    const state = aggregateStatuses(current.views);
    if (!["completed", "partial", "failed"].includes(state)) {
      return fail(res, 409, "GENERATION_ACTIVE", "Wait until all view generations finish before deleting.");
    }
    const assets = [current.row.source_public_id, current.row.context_public_id,
      ...current.views.map(v => v.output_public_id)].filter(Boolean);
    await Promise.all(assets.map(id => multi.destroyImage(id)));
    await db.query(`DELETE FROM public.creator_multi_view_jobs WHERE id=$1 AND creator_id=$2`, [jobId, creatorId]);
    return res.json({ status: "success", message: "Multi-view set deleted." });
  } catch (err) {
    console.error("[MultiView] Delete failed:", err.code || err.message);
    return fail(res, 503, "DELETE_FAILED", "Could not delete the saved views. Try again.");
  }
};
