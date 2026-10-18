"use strict";

/**
 * =========================================================
 * DesignByYou / FashionVision
 * Creator Costume Extractor Controller — Version 2.0
 * Flexible View Selection
 * =========================================================
 *
 * - Select any 1–4 views: front, back, left, right.
 * - An omitted selected_views keeps legacy four-view behavior.
 * - One database row per selected view; existing jobs still work.
 * - Idempotent creation, with selection mismatch detection.
 * - Up to two new jobs per creator per hour.
 * - Once reserved, a paid prediction is never auto-resubmitted.
 * - PostgreSQL status updates use explicit text casts.
 * - Results stay at FASHN temporarily, not in PostgreSQL.
 *
 * Routes (existing URLs unchanged):
 * POST /jobs
 * POST /jobs/:jobId/views/:view/start  (multipart field: image)
 * GET  /jobs/:jobId?refresh=true
 * GET  /jobs/:jobId/views/:view/result
 *
 * Middleware in creatorCostumeExtractorRoutes.js must enforce
 * protect, authorize("creator"), and requireVerifiedEmail.
 * =========================================================
 */

const sharp = require("sharp");
const db = require("../../config/db");
const {
  startCostumeView,
  getCostumeViewStatus,
  COSTUME_VIEW_KEYS,
} = require("../../services/FashnCostumeExtractorService");

const JOBS_PER_HOUR = 2;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MIN_DIMENSION = 128;
const MAX_OUTPUT_DIMENSION = 2048;
const MAX_INPUT_PIXELS = 32 * 1024 * 1024;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MIME_FORMAT = Object.freeze({
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
});

const VALID_PROVIDER_STATUSES = new Set([
  "starting",
  "in_queue",
  "processing",
  "completed",
  "failed",
]);

/**
 * =========================================================
 * Error Handling
 * =========================================================
 */

function httpError(status, code, message) {
  const error = new Error(message);
  error.httpStatus = status;
  error.code = code;
  return error;
}

function respondError(res, error, context) {
  if (res.headersSent) return;

  const rawStatus = Number(error?.httpStatus || error?.statusCode || 500);
  const status = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;

  if (status >= 500) {
    console.error(`[Costume Extractor] ${context}:`, error?.message || error);
  }

  return res.status(status).json({
    status: "error",
    code:
      status >= 500 && !error?.httpStatus && !error?.statusCode
        ? "COSTUME_EXTRACTOR_ERROR"
        : error?.code || "COSTUME_EXTRACTOR_ERROR",
    message:
      status >= 500
        ? "Unable to complete the costume extraction request."
        : String(error?.message || "Request failed."),
  });
}

/**
 * =========================================================
 * Authentication and Parameter Validation
 * =========================================================
 */

function creatorIdFrom(req) {
  const id = String(req?.user?.id || "").trim();

  if (!UUID_REGEX.test(id)) {
    throw httpError(401, "UNAUTHENTICATED", "Please sign in as a Creator.");
  }

  return id;
}

function validatedJobId(req) {
  const id = String(req?.params?.jobId || "").trim();

  if (!UUID_REGEX.test(id)) {
    throw httpError(400, "INVALID_JOB_ID", "Invalid extraction job ID.");
  }

  return id;
}

function validatedView(req) {
  const view = String(req?.params?.view || "")
    .trim()
    .toLowerCase();

  if (!COSTUME_VIEW_KEYS.includes(view)) {
    throw httpError(400, "INVALID_VIEW", "Choose front, back, left or right.");
  }

  return view;
}

/**
 * =========================================================
 * Flexible View Selection Validation
 * =========================================================
 *
 * selected_views is optional for compatibility with V1.
 *
 * Examples:
 *
 * ["front"]
 * ["left", "right"]
 * ["front", "back"]
 * ["front", "back", "left", "right"]
 *
 * Requirements:
 * - Minimum 1 view
 * - Maximum 4 views
 * - No duplicates
 * - Only recognized view names
 * - Consistent canonical ordering
 *
 * =========================================================
 */

function validatedSelectedViews(value) {
  if (value === undefined) {
    return [...COSTUME_VIEW_KEYS];
  }

  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    throw httpError(
      400,
      "INVALID_SELECTED_VIEWS",
      "selected_views must contain between 1 and 4 views.",
    );
  }

  if (
    value.some(
      (view) => typeof view !== "string" || !COSTUME_VIEW_KEYS.includes(view),
    )
  ) {
    throw httpError(
      400,
      "INVALID_SELECTED_VIEWS",
      "Only front, back, left and right are allowed in selected_views.",
    );
  }

  if (new Set(value).size !== value.length) {
    throw httpError(
      400,
      "DUPLICATE_SELECTED_VIEW",
      "Each view may be selected only once.",
    );
  }

  return COSTUME_VIEW_KEYS.filter((view) => value.includes(view));
}

/**
 * =========================================================
 * Database Helpers
 * =========================================================
 */

async function getOwnedJob(jobId, creatorId) {
  const result = await db.query(
    `SELECT id, creator_id, request_key, status,
            estimated_credits, created_at, updated_at, completed_at
       FROM creator_costume_extraction_jobs
      WHERE id = $1 AND creator_id = $2`,
    [jobId, creatorId],
  );

  if (!result.rows.length) {
    throw httpError(404, "JOB_NOT_FOUND", "Costume extraction job not found.");
  }

  return result.rows[0];
}

async function listViews(jobId) {
  const result = await db.query(
    `SELECT view_name, status, prediction_id, error_code,
            submitted_at, completed_at, updated_at
       FROM creator_costume_extraction_views
      WHERE job_id = $1
      ORDER BY CASE view_name
        WHEN 'front' THEN 1
        WHEN 'back' THEN 2
        WHEN 'left' THEN 3
        ELSE 4
      END`,
    [jobId],
  );

  return result.rows;
}

/**
 * =========================================================
 * Reconcile Overall Job Status
 * Version 2.0
 * =========================================================
 *
 * Previously:
 * - Required exactly four views to complete.
 *
 * Now:
 * - Uses the actual selected view count.
 * - Supports 1, 2, 3, or 4 views.
 * - Checks view count against estimated_credits.
 * - Preserves partially_failed and failed statuses.
 * - Does not count submission_unknown as completed.
 *
 * =========================================================
 */

async function reconcileJobStatus(jobId) {
  const result = await db.query(
    `SELECT j.estimated_credits::int AS expected_views,
            COUNT(v.id)::int AS total,
            COUNT(v.id) FILTER (WHERE v.status = 'pending')::int AS pending,
            COUNT(v.id) FILTER (WHERE v.status = 'completed')::int AS completed,
            COUNT(v.id) FILTER (WHERE v.status = 'failed')::int AS failed
       FROM creator_costume_extraction_jobs AS j
       LEFT JOIN creator_costume_extraction_views AS v
         ON v.job_id = j.id
      WHERE j.id = $1
      GROUP BY j.id, j.estimated_credits`,
    [jobId],
  );

  if (!result.rows.length) {
    throw httpError(404, "JOB_NOT_FOUND", "Costume extraction job not found.");
  }

  const stats = result.rows[0];

  // A missing view row is a data integrity problem,
  // not a completed job.
  if (stats.total !== stats.expected_views || stats.total < 1) {
    throw httpError(
      500,
      "COSTUME_JOB_INTEGRITY_ERROR",
      "Costume extraction job has inconsistent view records.",
    );
  }

  let nextStatus = "processing";

  if (stats.completed === stats.total) {
    nextStatus = "completed";
  } else if (stats.completed + stats.failed === stats.total) {
    nextStatus = stats.completed > 0 ? "partially_failed" : "failed";
  } else if (stats.pending === stats.total) {
    nextStatus = "pending";
  }

  await db.query(
    `UPDATE creator_costume_extraction_jobs
        SET status = $2::text,
            completed_at = CASE
              WHEN $2::text IN ('completed', 'failed', 'partially_failed')
                THEN COALESCE(completed_at, NOW())
              ELSE NULL
            END
      WHERE id = $1
        AND status IS DISTINCT FROM $2::text`,
    [jobId, nextStatus],
  );
}

/**
 * =========================================================
 * Format Job Response
 * =========================================================
 *
 * selected_views is derived from the existing view rows.
 *
 * This allows older four-view jobs to continue working
 * without another database migration.
 *
 * =========================================================
 */

async function formatJob(jobId, creatorId) {
  await reconcileJobStatus(jobId);

  const job = await getOwnedJob(jobId, creatorId);
  const views = await listViews(jobId);

  return {
    id: job.id,
    status: job.status,
    estimated_credits: job.estimated_credits,
    selected_views: views.map((view) => view.view_name),
    created_at: job.created_at,
    completed_at: job.completed_at,
    views: views.map((view) => ({
      view: view.view_name,
      status: view.status,
      error_code: view.error_code,
      submitted_at: view.submitted_at,
      completed_at: view.completed_at,
      result_available: view.status === "completed",
    })),
  };
}

/**
 * =========================================================
 * Image Upload Validation and Processing
 * =========================================================
 *
 * Allowed:
 * - JPEG
 * - PNG
 * - WebP
 *
 * Maximum upload: 12 MB
 * Minimum dimension: 128 x 128
 * Maximum processed dimension: 2048 x 2048
 *
 * Validates actual image contents.
 * Rejects animated/multipage images.
 * Uses Sharp for optimization.
 *
 * =========================================================
 */

async function prepareImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
    throw httpError(
      400,
      "IMAGE_REQUIRED",
      "Upload a costume image using the image field.",
    );
  }

  if (file.buffer.length > MAX_FILE_BYTES) {
    throw httpError(413, "IMAGE_TOO_LARGE", "Image must be 12 MB or smaller.");
  }

  const claimedMime = String(file.mimetype || "").toLowerCase();

  if (!["image/jpeg", "image/png", "image/webp"].includes(claimedMime)) {
    throw httpError(415, "UNSUPPORTED_IMAGE", "Use a JPG, PNG or WebP image.");
  }

  let metadata;

  try {
    metadata = await sharp(file.buffer, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
  } catch {
    throw httpError(
      400,
      "INVALID_IMAGE",
      "The image could not be decoded safely.",
    );
  }

  if (MIME_FORMAT[metadata.format] !== claimedMime) {
    throw httpError(
      400,
      "INVALID_IMAGE_TYPE",
      "The file content does not match its image type.",
    );
  }

  if (metadata.pages && metadata.pages > 1) {
    throw httpError(
      400,
      "MULTIPAGE_IMAGE",
      "Animated or multipage images are not supported.",
    );
  }

  if (metadata.width < MIN_DIMENSION || metadata.height < MIN_DIMENSION) {
    throw httpError(
      400,
      "IMAGE_TOO_SMALL",
      "Image dimensions must be at least 128 × 128 pixels.",
    );
  }

  let output;

  try {
    output = await sharp(file.buffer, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({
        width: MAX_OUTPUT_DIMENSION,
        height: MAX_OUTPUT_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 88,
        mozjpeg: true,
      })
      .toBuffer();
  } catch {
    throw httpError(
      400,
      "IMAGE_PROCESSING_FAILED",
      "Unable to prepare the costume image.",
    );
  }

  return `data:image/jpeg;base64,${output.toString("base64")}`;
}

/**
 * =========================================================
 * POST /jobs
 * Flexible Costume Extraction Job Creation
 * =========================================================
 *
 * Request body:
 *
 * {
 *   "request_key": "valid-uuid",
 *   "selected_views": ["front", "right"]
 * }
 *
 * If selected_views is omitted:
 *   defaults to all four views.
 *
 * Features:
 * - Creator authentication
 * - Validation of selected views
 * - Database transaction
 * - Advisory locking
 * - Idempotency
 * - Idempotency selection mismatch detection
 * - Two jobs per hour
 * - Dynamic credit estimation
 *
 * =========================================================
 */

async function createCostumeExtractionJob(req, res) {
  let client;
  let transactionOpen = false;

  try {
    const creatorId = creatorIdFrom(req);

    const requestKey = String(req?.body?.request_key || "").trim();

    const selectedViews = validatedSelectedViews(req?.body?.selected_views);

    if (!UUID_REGEX.test(requestKey)) {
      throw httpError(
        400,
        "INVALID_REQUEST_KEY",
        "A UUID request_key is required.",
      );
    }

    if (typeof db.connect !== "function") {
      throw httpError(
        503,
        "DATABASE_UNAVAILABLE",
        "Database pool does not support transactions.",
      );
    }

    client = await db.connect();

    await client.query("BEGIN");
    transactionOpen = true;

    // Enforce quota and idempotency across concurrent
    // requests and application instances.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), 915713)", [
      creatorId,
    ]);

    const previous = await client.query(
      `SELECT id FROM creator_costume_extraction_jobs
        WHERE creator_id = $1 AND request_key = $2`,
      [creatorId, requestKey],
    );

    if (previous.rows.length) {
      const previousJobId = previous.rows[0].id;

      const previousViews = await client.query(
        `SELECT view_name FROM creator_costume_extraction_views
          WHERE job_id = $1`,
        [previousJobId],
      );

      const existingNames = new Set(
        previousViews.rows.map((row) => row.view_name),
      );

      const sameSelection =
        existingNames.size === selectedViews.length &&
        selectedViews.every((view) => existingNames.has(view));

      if (!sameSelection) {
        throw httpError(
          409,
          "REQUEST_KEY_SELECTION_MISMATCH",
          "This request_key already belongs to a job with different selected views. Use a new request_key for a new selection.",
        );
      }

      await client.query("COMMIT");
      transactionOpen = false;

      const job = await formatJob(previousJobId, creatorId);

      return res.status(200).json({
        status: "success",
        idempotent: true,
        data: { job },
      });
    }

    // Check hourly job quota.
    const quota = await client.query(
      `SELECT COUNT(*)::int AS used
         FROM creator_costume_extraction_jobs
        WHERE creator_id = $1
          AND created_at > NOW() - INTERVAL '1 hour'`,
      [creatorId],
    );

    if (quota.rows[0].used >= JOBS_PER_HOUR) {
      throw httpError(
        429,
        "COSTUME_JOB_LIMIT",
        "Maximum two costume extractions per hour. Try again later.",
      );
    }

    // Create job with dynamically calculated estimated credits.
    const created = await client.query(
      `INSERT INTO creator_costume_extraction_jobs
        (creator_id, request_key, status, estimated_credits)
       VALUES ($1, $2, 'pending', $3::int)
       RETURNING id`,
      [creatorId, requestKey, selectedViews.length],
    );

    const jobId = created.rows[0].id;

    // Insert ONLY the views selected by this creator.
    await client.query(
      `INSERT INTO creator_costume_extraction_views (job_id, view_name)
       SELECT $1, selected.view_name
       FROM unnest($2::text[]) AS selected(view_name)`,
      [jobId, selectedViews],
    );

    await client.query("COMMIT");
    transactionOpen = false;

    const job = await formatJob(jobId, creatorId);

    return res.status(201).json({
      status: "success",
      idempotent: false,
      data: { job },
    });
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "[Costume Extractor] Rollback error:",
          rollbackError?.message,
        );
      }
    }

    return respondError(res, error, "create job");
  } finally {
    client?.release?.();
  }
}

/**
 * =========================================================
 * POST /jobs/:jobId/views/:view/start
 * Start Selected Costume View
 * =========================================================
 *
 * Requires a multipart image field named "image".
 *
 * V2 changes:
 * - Checks that the view belongs to the selected set.
 * - Returns 404 for an unselected view.
 * - Rejects previously submitted views.
 * - Preserves atomic reservation.
 * - Never automatically retries uncertain predictions.
 *
 * =========================================================
 */

async function startCostumeViewGeneration(req, res) {
  let jobId;
  let view;
  let claimed = false;

  try {
    const creatorId = creatorIdFrom(req);

    jobId = validatedJobId(req);
    view = validatedView(req);

    await getOwnedJob(jobId, creatorId);

    // Distinguish unselected angles from previously
    // submitted angles.
    const available = await db.query(
      `SELECT status FROM creator_costume_extraction_views
        WHERE job_id = $1 AND view_name = $2`,
      [jobId, view],
    );

    if (!available.rows.length) {
      throw httpError(
        404,
        "VIEW_NOT_SELECTED",
        "This angle was not selected for this job. Create a new job to generate it.",
      );
    }

    if (available.rows[0].status !== "pending") {
      throw httpError(
        409,
        "VIEW_ALREADY_SUBMITTED",
        "This view has already been reserved or submitted. Refresh its status; do not submit again.",
      );
    }

    // Validate before reserving: invalid uploads
    // must not use a view slot.
    const imageDataUri = await prepareImage(req.file);

    // Reserve the selected view atomically.
    const claim = await db.query(
      `UPDATE creator_costume_extraction_views AS v
          SET status = 'submitting', error_code = NULL
         FROM creator_costume_extraction_jobs AS j
        WHERE v.job_id = j.id
          AND j.id = $1
          AND j.creator_id = $2
          AND v.view_name = $3
          AND v.status = 'pending'
        RETURNING v.id`,
      [jobId, creatorId, view],
    );

    if (!claim.rows.length) {
      throw httpError(
        409,
        "VIEW_ALREADY_SUBMITTED",
        "This view has already been reserved or submitted. Refresh its status; do not submit again.",
      );
    }

    claimed = true;

    // Submit exactly one selected view to FASHN.
    const result = await startCostumeView({
      imageDataUri,
      view,
    });

    // Persist the returned prediction ID.
    const persisted = await db.query(
      `UPDATE creator_costume_extraction_views
          SET prediction_id = $3,
              status = 'starting',
              submitted_at = NOW()
        WHERE job_id = $1
          AND view_name = $2
          AND status = 'submitting'
        RETURNING id`,
      [jobId, view, result.predictionId],
    );

    if (persisted.rowCount !== 1) {
      throw httpError(
        503,
        "SUBMISSION_RECORD_UNCERTAIN",
        "The prediction was accepted but its database record needs review. Do not resubmit.",
      );
    }

    await reconcileJobStatus(jobId);

    return res.status(202).json({
      status: "success",
      message: `${view} costume view submitted.`,
      data: {
        job_id: jobId,
        view,
        prediction_id: result.predictionId,
        status: "starting",
      },
    });
  } catch (error) {
    if (claimed && jobId && view) {
      // A timeout or post-submission database error
      // may indicate a paid prediction already exists.
      // NEVER automatically retry this view.
      const uncertain =
        [
          "FASHN_TIMEOUT",
          "FASHN_UNAVAILABLE",
          "FASHN_INVALID_RESPONSE",
          "FASHN_INVALID_PREDICTION",
          "SUBMISSION_RECORD_UNCERTAIN",
        ].includes(error?.code) || !error?.httpStatus;

      try {
        await db.query(
          `UPDATE creator_costume_extraction_views
              SET status = $3::text,
                  error_code = $4
            WHERE job_id = $1 AND view_name = $2
              AND status = 'submitting'`,
          [
            jobId,
            view,
            uncertain ? "submission_unknown" : "failed",
            uncertain
              ? "SUBMISSION_UNCERTAIN"
              : String(error?.code || "PROVIDER_REJECTED").slice(0, 100),
          ],
        );

        await reconcileJobStatus(jobId);
      } catch (persistError) {
        console.error(
          "[Costume Extractor] Failed to persist submission failure:",
          persistError?.message,
        );
      }
    }

    return respondError(res, error, "submit view");
  }
}

/**
 * =========================================================
 * Refresh Active Costume Views
 * =========================================================
 *
 * - Checks existing FASHN predictions.
 * - Never starts a new prediction.
 * - Applies PostgreSQL parameter casts.
 * - Updates completed/failed states.
 * - Uses Promise.allSettled so individual refresh
 *   errors do not stop other selected views.
 *
 * =========================================================
 */

async function refreshActiveViews(jobId) {
  const active = await db.query(
    `SELECT view_name, prediction_id, status
       FROM creator_costume_extraction_views
      WHERE job_id = $1
        AND prediction_id IS NOT NULL
        AND status IN ('starting', 'in_queue', 'processing')
      ORDER BY CASE view_name
        WHEN 'front' THEN 1
        WHEN 'back' THEN 2
        WHEN 'left' THEN 3
        ELSE 4
      END`,
    [jobId],
  );

  const results = await Promise.allSettled(
    active.rows.map(async (row) => {
      const providerResult = await getCostumeViewStatus(row.prediction_id);

      const nextStatus = providerResult.status;

      if (!VALID_PROVIDER_STATUSES.has(nextStatus)) {
        throw new Error(`Unexpected FASHN status: ${nextStatus}`);
      }

      const updated = await db.query(
        `UPDATE creator_costume_extraction_views
            SET status = $3::text,
                error_code = CASE
                  WHEN $3::text = 'failed' THEN 'GENERATION_FAILED'
                  ELSE NULL
                END,
                completed_at = CASE
                  WHEN $3::text = 'completed'
                    THEN COALESCE(completed_at, NOW())
                  ELSE completed_at
                END
          WHERE job_id = $1
            AND view_name = $2
            AND prediction_id = $4
            AND status IN ('starting', 'in_queue', 'processing')
          RETURNING view_name, status`,
        [jobId, row.view_name, nextStatus, row.prediction_id],
      );

      if (updated.rowCount > 0 && row.status !== nextStatus) {
        console.info(`[Costume Extractor] ${row.view_name}: ${nextStatus}`);
      }
    }),
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `[Costume Extractor] Status refresh failed (${active.rows[index].view_name}):`,
        {
          code: result.reason?.code || null,
          message: result.reason?.message || "Unknown refresh error",
        },
      );
    }
  });
}

/**
 * =========================================================
 * GET /jobs/:jobId
 * =========================================================
 *
 * Optional:
 * ?refresh=true
 *
 * Returns metadata only.
 * Images are fetched through the result endpoint.
 *
 * =========================================================
 */

async function getCostumeExtractionJob(req, res) {
  try {
    const creatorId = creatorIdFrom(req);
    const jobId = validatedJobId(req);

    await getOwnedJob(jobId, creatorId);

    if (String(req.query?.refresh || "").toLowerCase() === "true") {
      await refreshActiveViews(jobId);
    }

    const job = await formatJob(jobId, creatorId);

    return res.status(200).json({
      status: "success",
      data: { job },
    });
  } catch (error) {
    return respondError(res, error, "read job");
  }
}

/**
 * =========================================================
 * GET /jobs/:jobId/views/:view/result
 * =========================================================
 *
 * Returns completed PNG data after verifying:
 * - Authenticated creator
 * - Job ownership
 * - View was selected
 * - Prediction completed
 *
 * Results are not stored in PostgreSQL.
 *
 * =========================================================
 */

async function getCostumeViewResult(req, res) {
  try {
    const creatorId = creatorIdFrom(req);
    const jobId = validatedJobId(req);
    const view = validatedView(req);

    await getOwnedJob(jobId, creatorId);

    const results = await db.query(
      `SELECT prediction_id, status
         FROM creator_costume_extraction_views
        WHERE job_id = $1 AND view_name = $2`,
      [jobId, view],
    );

    if (!results.rows.length) {
      throw httpError(
        404,
        "VIEW_NOT_SELECTED",
        "This angle was not selected for this job.",
      );
    }

    const row = results.rows[0];

    if (!row.prediction_id || row.status !== "completed") {
      throw httpError(
        409,
        "VIEW_NOT_READY",
        "This costume view is not completed yet.",
      );
    }

    const result = await getCostumeViewStatus(row.prediction_id);

    if (!result.completed || !result.imageDataUri) {
      throw httpError(
        410,
        "RESULT_UNAVAILABLE",
        "This image is no longer available at the AI provider. Please save generated results promptly.",
      );
    }

    res.setHeader("Cache-Control", "private, no-store");

    return res.status(200).json({
      status: "success",
      data: {
        job_id: jobId,
        view,
        output_format: "png",
        image: result.imageDataUri,
      },
    });
  } catch (error) {
    return respondError(res, error, "get result");
  }
}

/**
 * =========================================================
 * Exports
 * =========================================================
 */

module.exports = {
  createCostumeExtractionJob,
  startCostumeViewGeneration,
  getCostumeExtractionJob,
  getCostumeViewResult,
};
