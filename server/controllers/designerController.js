"use strict";

const crypto = require("crypto");
const db = require("../config/db");

/*=========================================================
Configuration
=========================================================*/

const SHOWCASE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const SHOWCASE_MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const EDITOR_PROJECT_MAX_BYTES = 25 * 1024 * 1024;

const EDITOR_PROJECT_SCHEMA_MAX = 100;

/*=========================================================
Showcase Taxonomy
=========================================================*/

const SHOWCASE_ITEM_TYPES = new Set([
  "T-Shirt",
  "Shirt",
  "Polo Shirt",
  "Blouse",
  "Top",
  "Tank Top",
  "Hoodie",
  "Sweatshirt",
  "Sweater",
  "Cardigan",
  "Jacket",
  "Blazer",
  "Coat",
  "Dress",
  "Gown",
  "Skirt",
  "Jeans",
  "Trousers",
  "Joggers",
  "Shorts",
  "Jumpsuit",
  "Romper",
  "Kurta",
  "Saree",
  "Lehenga",
  "Activewear Set",
  "Loungewear Set",
  "Sleepwear",
  "Swimwear",
  "Other",
]);

const SHOWCASE_FIT_TYPES = new Set([
  "Regular Fit",
  "Slim Fit",
  "Relaxed Fit",
  "Oversized / Loose Fit",
  "Tailored Fit",
]);

const SHOWCASE_SIZE_CATEGORIES = new Set([
  "Standard Size",
  "Plus Size",
  "Petite",
  "Tall",
]);

const SHOWCASE_AUDIENCES = new Set(["Women", "Men", "Unisex", "Kids"]);

const SHOWCASE_MATERIALS = new Set([
  "100% Cotton",
  "Cotton Blend",
  "Denim",
  "Linen",
  "Silk",
  "Satin",
  "Polyester",
  "Fleece",
  "Wool",
  "Leather",
  "Stretch / Lycra",
  "Organic Fabric",
  "Recycled Fabric",
  "Other",
]);

const SHOWCASE_WEAR_CATEGORIES = new Set([
  "Casual Wear",
  "Formal Wear",
  "Party Wear",
  "Workwear",
  "Activewear / Gym",
  "Loungewear",
  "Traditional Wear",
  "Occasion Wear",
]);

const SHOWCASE_STYLE_AESTHETICS = new Set([
  "Minimalist / Basics",
  "Streetwear",
  "Classic",
  "Modern",
  "Luxury",
  "Vintage",
  "Bohemian",
  "Avant-Garde",
  "Sporty",
  "Preppy",
  "Y2K",
  "Sustainable / Organic",
]);

const SHOWCASE_SEASONS = new Set([
  "All Season",
  "Summer Essentials",
  "Winter Wear",
  "Spring",
  "Autumn / Fall",
]);

/*=========================================================
General Helpers
=========================================================*/

function getAuthenticatedUserId(req) {
  return String(req?.user?.id || req?.user?._id || "").trim();
}

function cleanText(value, maxLength = 1000) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseArrayValue(value) {
  if (Array.isArray(value)) {
    return value;
  }

  const text = String(value ?? "").trim();

  if (!text) {
    return [];
  }

  try {
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Fall through to comma-separated parsing.
  }

  return text.split(",");
}

function uniqueCleanValues(values, maximumLength) {
  const uniqueValues = new Map();

  values.forEach((value) => {
    const cleaned = cleanText(value, maximumLength);

    if (!cleaned) {
      return;
    }

    const key = cleaned.toLowerCase();

    if (!uniqueValues.has(key)) {
      uniqueValues.set(key, cleaned);
    }
  });

  return Array.from(uniqueValues.values());
}

function normalizeShowcaseTag(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\//g, " ")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function createShowcaseSlug(title) {
  const normalized = String(title ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);

  const slugBase = normalized || "showcase-design";

  const suffix = crypto.randomBytes(4).toString("hex");

  return `${slugBase}-${suffix}`;
}

function createSku(prefix = "DSN-SHW") {
  return `${prefix}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function isPositiveBigIntId(value) {
  return /^[1-9]\d*$/.test(String(value ?? "").trim());
}

function parseJsonObject(value) {
  if (isPlainObject(value)) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);

    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/*=========================================================
Project Validation
=========================================================*/

function validateProjectPayload(rawProjectData) {
  const projectData = parseJsonObject(rawProjectData);

  if (!projectData) {
    return {
      error: "A valid Fashion Editor project_data object is required.",
    };
  }

  if (!isPlainObject(projectData.document)) {
    return {
      error: "The editor project must contain a valid document object.",
    };
  }

  if (!Array.isArray(projectData.layers)) {
    return {
      error: "The editor project must contain a layers array.",
    };
  }

  const hasValidObjects =
    Array.isArray(projectData.objects) || isPlainObject(projectData.objects);

  if (!hasValidObjects) {
    return {
      error: "The editor project must contain an objects array or object map.",
    };
  }

  let serializedProject;

  try {
    serializedProject = JSON.stringify(projectData);
  } catch {
    return {
      error: "The editor project contains data that cannot be serialized.",
    };
  }

  const projectBytes = Buffer.byteLength(serializedProject, "utf8");

  if (projectBytes > EDITOR_PROJECT_MAX_BYTES) {
    return {
      error: "The editor project exceeds the 25 MB storage limit.",
    };
  }

  const requestedSchemaVersion = Number(
    projectData.schemaVersion ?? projectData.document?.schemaVersion ?? 2,
  );

  const schemaVersion =
    Number.isInteger(requestedSchemaVersion) &&
    requestedSchemaVersion > 0 &&
    requestedSchemaVersion <= EDITOR_PROJECT_SCHEMA_MAX
      ? requestedSchemaVersion
      : 2;

  const title = cleanText(projectData.document?.name, 120);

  return {
    projectData,
    serializedProject,
    schemaVersion,
    title,
  };
}

/*=========================================================
Showcase Validation
=========================================================*/

function collectShowcaseInput(body, defaults = {}) {
  const title = cleanText(body?.title ?? defaults.title, 120);

  const description = cleanText(
    body?.description ?? defaults.description,
    2000,
  );

  const itemType = cleanText(body?.item_type ?? defaults.itemType, 60);

  const fitType = cleanText(body?.fit_type ?? defaults.fitType, 60);

  const sizeCategory = cleanText(
    body?.size_category ?? defaults.sizeCategory,
    60,
  );

  const audience = cleanText(body?.audience ?? defaults.audience, 60);

  const wearCategory = cleanText(
    body?.wear_category ?? defaults.wearCategory,
    60,
  );

  const styleAesthetic = cleanText(
    body?.style_aesthetic ?? defaults.styleAesthetic,
    60,
  );

  const season = cleanText(body?.season ?? defaults.season, 60);

  const materials = uniqueCleanValues(
    parseArrayValue(body?.materials ?? defaults.materials),
    60,
  );

  const tags = uniqueCleanValues(
    parseArrayValue(body?.tags ?? defaults.tags),
    40,
  );

  return {
    title,
    description,
    itemType,
    fitType,
    sizeCategory,
    audience,
    wearCategory,
    styleAesthetic,
    season,
    materials,
    tags,
  };
}

function validateShowcaseInput(input) {
  if (input.title.length < 3) {
    return "The design title must contain at least 3 characters.";
  }

  if (input.description.length < 20) {
    return "The design description must contain at least 20 characters.";
  }

  const choiceChecks = [
    [input.itemType, SHOWCASE_ITEM_TYPES, "clothing item type"],
    [input.fitType, SHOWCASE_FIT_TYPES, "fit type"],
    [input.sizeCategory, SHOWCASE_SIZE_CATEGORIES, "size category"],
    [input.audience, SHOWCASE_AUDIENCES, "audience"],
    [input.wearCategory, SHOWCASE_WEAR_CATEGORIES, "wear category"],
    [input.styleAesthetic, SHOWCASE_STYLE_AESTHETICS, "style aesthetic"],
    [input.season, SHOWCASE_SEASONS, "season"],
  ];

  const invalidChoice = choiceChecks.find(
    ([value, allowedValues]) => !value || !allowedValues.has(value),
  );

  if (invalidChoice) {
    return `Select a valid ${invalidChoice[2]}.`;
  }

  if (input.materials.length > 5) {
    return "Select no more than 5 materials.";
  }

  const invalidMaterial = input.materials.find(
    (material) => !SHOWCASE_MATERIALS.has(material),
  );

  if (invalidMaterial) {
    return `${invalidMaterial} is not a valid material.`;
  }

  if (input.tags.length > 10) {
    return "Add no more than 10 custom search tags.";
  }

  return "";
}

function buildProcessedTags(input) {
  const attributeValues = [
    input.itemType,
    input.fitType,
    input.sizeCategory,
    input.audience,
    input.wearCategory,
    input.styleAesthetic,
    input.season,
    ...input.materials,
    ...input.tags,
  ];

  return [
    ...new Set(attributeValues.map(normalizeShowcaseTag).filter(Boolean)),
  ].slice(0, 30);
}

function validateUploadedPreview(req, { required = true } = {}) {
  if (!req.file) {
    return required ? "A display image is required for the showcase." : "";
  }

  if (!req.file.path) {
    return "The uploaded preview did not return a valid storage path.";
  }

  if (req.file.mimetype && !SHOWCASE_IMAGE_TYPES.has(req.file.mimetype)) {
    return "Only JPG, PNG and WEBP images are accepted.";
  }

  const uploadedFileSize = Number(req.file.size);

  if (
    Number.isFinite(uploadedFileSize) &&
    uploadedFileSize > SHOWCASE_MAX_IMAGE_BYTES
  ) {
    return "The showcase image must not exceed 15 MB.";
  }

  return "";
}

/*=========================================================
Response and Database Helpers
=========================================================*/

function sendError(res, statusCode, message, details) {
  const payload = {
    status: statusCode >= 500 ? "error" : "fail",

    message,
  };

  if (details !== undefined) {
    payload.details = details;
  }

  return res.status(statusCode).json(payload);
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error("Transaction rollback failed:", rollbackError);
  }
}

function sendDatabaseError(res, error, fallbackMessage) {
  if (error?.code === "23505") {
    return sendError(res, 409, "A record with this identifier already exists.");
  }

  if (error?.code === "23503") {
    return sendError(res, 409, "A required related record no longer exists.");
  }

  if (error?.code === "23514") {
    return sendError(
      res,
      400,
      "One or more values are not allowed by the current database constraints.",
    );
  }

  if (error?.code === "22P02") {
    return sendError(
      res,
      400,
      "One or more values are incompatible with the database structure.",
    );
  }

  return sendError(res, 500, fallbackMessage);
}

/*=========================================================
Get Private Designer Dashboard
=========================================================*/

exports.getDashboard = async (req, res) => {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    return sendError(res, 401, "Authentication is required.");
  }

  try {
    const stats = await db.query(
      `
            SELECT
              w.available_balance,
              w.pending_escrow_balance,

              (
                SELECT COUNT(*)
                FROM designs
                WHERE owner_id = $1
              ) AS total_designs,

              (
                SELECT COUNT(*)
                FROM editor_projects
                WHERE owner_id = $1
              ) AS total_editor_projects,

              dp.avg_rating,
              dp.xp_points

            FROM designer_wallets w

            JOIN designer_profiles dp
              ON w.user_id =
                 dp.user_id

            WHERE w.user_id = $1

            LIMIT 1
          `,
      [userId],
    );

    if (stats.rows.length === 0) {
      return sendError(res, 404, "Designer profile or wallet not found.");
    }

    return res.status(200).json({
      status: "success",

      data: stats.rows[0],
    });
  } catch (error) {
    console.error("Dashboard database mapping error:", error);

    return sendDatabaseError(res, error, "Dashboard synchronization failed.");
  }
};

/*=========================================================
Upload Manual Showcase Design

Manual uploads are always:

source_type       = upload
editor_project_id = NULL
is_editable       = false
allow_remix       = false
original_design_id = NULL
=========================================================*/

exports.uploadShowcaseDesign = async (req, res) => {
  const ownerId = getAuthenticatedUserId(req);

  if (!ownerId) {
    return sendError(res, 401, "Authentication is required.");
  }

  const fileError = validateUploadedPreview(req, {
    required: true,
  });

  if (fileError) {
    return sendError(res, 400, fileError);
  }

  const showcaseInput = collectShowcaseInput(req.body);

  const validationError = validateShowcaseInput(showcaseInput);

  if (validationError) {
    return sendError(res, 400, validationError);
  }

  const processedTags = buildProcessedTags(showcaseInput);

  const previewUrl = req.file.path;

  const slug = createShowcaseSlug(showcaseInput.title);

  const autoSku = createSku("DSN-SHW");

  try {
    const result = await db.query(
      `
            INSERT INTO designs (
              id,
              owner_id,
              title,
              sku,
              slug,
              description,
              base_price,
              canvas_state,
              style_category,
              tags,
              product_type,
              license_type,
              watermarked_preview_url,
              high_res_file_url,
              is_public,
              is_published,
              source_type,
              editor_project_id,
              is_editable,
              allow_remix,
              original_design_id,
              created_at,
              updated_at
            )
            VALUES (
              gen_random_uuid(),
              $1,
              $2,
              $3,
              $4,
              $5,
              0,
              $6::jsonb,
              $7,
              $8,
              'sketch',
              'commercial',
              $9,
              NULL,
              TRUE,
              TRUE,
              'upload',
              NULL,
              FALSE,
              FALSE,
              NULL,
              NOW(),
              NOW()
            )
            RETURNING
              id,
              owner_id,
              title,
              sku,
              slug,
              description,
              style_category,
              tags,
              product_type,
              license_type,
              watermarked_preview_url,
              is_public,
              is_published,
              source_type,
              editor_project_id,
              is_editable,
              allow_remix,
              original_design_id,
              created_at,
              updated_at
          `,
      [
        ownerId,
        showcaseInput.title,
        autoSku,
        slug,
        showcaseInput.description,
        JSON.stringify([]),
        showcaseInput.styleAesthetic,
        processedTags,
        previewUrl,
      ],
    );

    return res.status(201).json({
      status: "success",

      message: "Design published to the showcase successfully.",

      data: {
        ...result.rows[0],

        showcase_attributes: {
          item_type: showcaseInput.itemType,

          fit_type: showcaseInput.fitType,

          size_category: showcaseInput.sizeCategory,

          audience: showcaseInput.audience,

          materials: showcaseInput.materials,

          wear_category: showcaseInput.wearCategory,

          style_aesthetic: showcaseInput.styleAesthetic,

          season: showcaseInput.season,
        },
      },
    });
  } catch (error) {
    console.error("Showcase upload failed:", error);

    return sendDatabaseError(
      res,
      error,
      "The design could not be published to the showcase.",
    );
  }
};

/*=========================================================
List Designer Editor Projects
=========================================================*/

exports.getMyEditorProjects = async (req, res) => {
  const ownerId = getAuthenticatedUserId(req);

  if (!ownerId) {
    return sendError(res, 401, "Authentication is required.");
  }

  try {
    const result = await db.query(
      `
            SELECT
              ep.id,
              ep.owner_id,
              ep.title,
              ep.schema_version,
              ep.preview_url,
              ep.source_project_id,
              ep.version,
              ep.created_at,
              ep.updated_at,

              d.id AS showcase_design_id,
              d.slug AS showcase_slug,
              d.is_public AS showcase_is_public,
              d.is_published AS showcase_is_published,
              d.allow_remix AS showcase_allow_remix

            FROM editor_projects ep

            LEFT JOIN LATERAL (
              SELECT
                id,
                slug,
                is_public,
                is_published,
                allow_remix

              FROM designs

              WHERE owner_id =
                    ep.owner_id

                AND editor_project_id =
                    ep.id

                AND source_type =
                    'fashion_editor'

              ORDER BY
                updated_at DESC

              LIMIT 1
            ) d ON TRUE

            WHERE ep.owner_id = $1

            ORDER BY
              ep.updated_at DESC
          `,
      [ownerId],
    );

    return res.status(200).json({
      status: "success",

      results: result.rows.length,

      data: result.rows,
    });
  } catch (error) {
    console.error("Editor project list failed:", error);

    return sendDatabaseError(
      res,
      error,
      "Editor projects could not be loaded.",
    );
  }
};

/*=========================================================
Create Editable Fashion Editor Project
=========================================================*/

exports.createEditorProject = async (req, res) => {
  const ownerId = getAuthenticatedUserId(req);

  if (!ownerId) {
    return sendError(res, 401, "Authentication is required.");
  }

  const projectValidation = validateProjectPayload(req.body?.project_data);

  if (projectValidation.error) {
    return sendError(res, 400, projectValidation.error);
  }

  const title = cleanText(
    req.body?.title || projectValidation.title || "Untitled Fashion Design",
    120,
  );

  if (!title) {
    return sendError(res, 400, "A project title is required.");
  }

  try {
    const result = await db.query(
      `
            INSERT INTO editor_projects (
              owner_id,
              title,
              project_data,
              schema_version,
              preview_url,
              source_project_id,
              version,
              created_at,
              updated_at
            )
            VALUES (
              $1,
              $2,
              $3::jsonb,
              $4,
              NULL,
              NULL,
              1,
              NOW(),
              NOW()
            )
            RETURNING
              id,
              owner_id,
              title,
              project_data,
              schema_version,
              preview_url,
              source_project_id,
              version,
              created_at,
              updated_at
          `,
      [
        ownerId,
        title,
        projectValidation.serializedProject,
        projectValidation.schemaVersion,
      ],
    );

    return res.status(201).json({
      status: "success",

      message: "Fashion Editor project created successfully.",

      data: result.rows[0],
    });
  } catch (error) {
    console.error("Editor project creation failed:", error);

    return sendDatabaseError(
      res,
      error,
      "The editor project could not be created.",
    );
  }
};

/*=========================================================
Get Owned Fashion Editor Project
=========================================================*/

exports.getEditorProject = async (req, res) => {
  const ownerId = getAuthenticatedUserId(req);

  const projectId = String(req.params?.projectId ?? "").trim();

  if (!ownerId) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!isPositiveBigIntId(projectId)) {
    return sendError(res, 400, "A valid editor project ID is required.");
  }

  try {
    const result = await db.query(
      `
            SELECT
              ep.id,
              ep.owner_id,
              ep.title,
              ep.project_data,
              ep.schema_version,
              ep.preview_url,
              ep.source_project_id,
              ep.version,
              ep.created_at,
              ep.updated_at,

              d.id AS showcase_design_id,
              d.slug AS showcase_slug,
              d.allow_remix AS showcase_allow_remix,
              d.is_public AS showcase_is_public,
              d.is_published AS showcase_is_published

            FROM editor_projects ep

            LEFT JOIN LATERAL (
              SELECT
                id,
                slug,
                allow_remix,
                is_public,
                is_published

              FROM designs

              WHERE owner_id =
                    ep.owner_id

                AND editor_project_id =
                    ep.id

                AND source_type =
                    'fashion_editor'

              ORDER BY
                updated_at DESC

              LIMIT 1
            ) d ON TRUE

            WHERE ep.id = $1
              AND ep.owner_id = $2

            LIMIT 1
          `,
      [projectId, ownerId],
    );

    if (result.rows.length === 0) {
      return sendError(res, 404, "Editor project not found.");
    }

    return res.status(200).json({
      status: "success",

      data: result.rows[0],
    });
  } catch (error) {
    console.error("Editor project retrieval failed:", error);

    return sendDatabaseError(
      res,
      error,
      "The editor project could not be loaded.",
    );
  }
};

/*=========================================================
Update Owned Fashion Editor Project
=========================================================*/

exports.updateEditorProject = async (req, res) => {
  const ownerId = getAuthenticatedUserId(req);

  const projectId = String(req.params?.projectId ?? "").trim();

  if (!ownerId) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!isPositiveBigIntId(projectId)) {
    return sendError(res, 400, "A valid editor project ID is required.");
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const existingResult = await client.query(
      `
            SELECT
              id,
              owner_id,
              title,
              project_data,
              schema_version,
              preview_url,
              source_project_id,
              version,
              created_at,
              updated_at

            FROM editor_projects

            WHERE id = $1
              AND owner_id = $2

            LIMIT 1

            FOR UPDATE
          `,
      [projectId, ownerId],
    );

    if (existingResult.rows.length === 0) {
      await rollbackQuietly(client);

      return sendError(res, 404, "Editor project not found.");
    }

    const existingProject = existingResult.rows[0];

    const expectedVersionValue =
      req.body?.expected_version ?? req.body?.version;

    if (
      expectedVersionValue !== undefined &&
      expectedVersionValue !== null &&
      String(expectedVersionValue).trim() !== ""
    ) {
      const expectedVersion = Number(expectedVersionValue);

      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        await rollbackQuietly(client);

        return sendError(
          res,
          400,
          "expected_version must be a positive integer.",
        );
      }

      if (expectedVersion !== Number(existingProject.version)) {
        await rollbackQuietly(client);

        return sendError(
          res,
          409,
          "This project has changed since it was opened. Reload the latest version before saving again.",
          {
            current_version: Number(existingProject.version),
          },
        );
      }
    }

    let nextProjectData = existingProject.project_data;

    let nextSchemaVersion = Number(existingProject.schema_version) || 2;

    if (req.body?.project_data !== undefined) {
      const projectValidation = validateProjectPayload(req.body.project_data);

      if (projectValidation.error) {
        await rollbackQuietly(client);

        return sendError(res, 400, projectValidation.error);
      }

      nextProjectData = projectValidation.projectData;

      nextSchemaVersion = projectValidation.schemaVersion;
    }

    const nextTitle = cleanText(
      req.body?.title ??
        nextProjectData?.document?.name ??
        existingProject.title,
      120,
    );

    if (!nextTitle) {
      await rollbackQuietly(client);

      return sendError(res, 400, "A project title is required.");
    }

    const updateResult = await client.query(
      `
            UPDATE editor_projects

            SET
              title = $1,
              project_data = $2::jsonb,
              schema_version = $3,
              version = version + 1,
              updated_at = NOW()

            WHERE id = $4
              AND owner_id = $5

            RETURNING
              id,
              owner_id,
              title,
              project_data,
              schema_version,
              preview_url,
              source_project_id,
              version,
              created_at,
              updated_at
          `,
      [
        nextTitle,
        JSON.stringify(nextProjectData),
        nextSchemaVersion,
        projectId,
        ownerId,
      ],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      status: "success",

      message: "Fashion Editor project saved successfully.",

      data: updateResult.rows[0],
    });
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Editor project update failed:", error);

    return sendDatabaseError(
      res,
      error,
      "The editor project could not be saved.",
    );
  } finally {
    client.release();
  }
};

/*=========================================================
Share Fashion Editor Project to Showcase
=========================================================*/

exports.shareEditorProject = async (req, res) => {
  const ownerId = getAuthenticatedUserId(req);

  const projectId = String(req.params?.projectId ?? "").trim();

  if (!ownerId) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!isPositiveBigIntId(projectId)) {
    return sendError(res, 400, "A valid editor project ID is required.");
  }

  const previewValidationError = validateUploadedPreview(req, {
    required: false,
  });

  if (previewValidationError) {
    return sendError(res, 400, previewValidationError);
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const projectResult = await client.query(
      `
            SELECT
              id,
              owner_id,
              title,
              project_data,
              schema_version,
              preview_url,
              source_project_id,
              version,
              created_at,
              updated_at

            FROM editor_projects

            WHERE id = $1
              AND owner_id = $2

            LIMIT 1

            FOR UPDATE
          `,
      [projectId, ownerId],
    );

    if (projectResult.rows.length === 0) {
      await rollbackQuietly(client);

      return sendError(res, 404, "Editor project not found.");
    }

    const project = projectResult.rows[0];

    const showcaseInput = collectShowcaseInput(req.body, {
      title: project.title,

      itemType: "Other",

      fitType: "Regular Fit",

      sizeCategory: "Standard Size",

      audience: "Unisex",

      materials: [],

      wearCategory: "Casual Wear",

      styleAesthetic: "Modern",

      season: "All Season",

      tags: [],
    });

    const validationError = validateShowcaseInput(showcaseInput);

    if (validationError) {
      await rollbackQuietly(client);

      return sendError(res, 400, validationError);
    }

    const allowRemix = parseBoolean(req.body?.allow_remix, false);

    const processedTags = buildProcessedTags(showcaseInput);

    const existingShowcaseResult = await client.query(
      `
            SELECT
              id,
              slug,
              watermarked_preview_url,
              created_at

            FROM designs

            WHERE owner_id = $1
              AND editor_project_id = $2
              AND source_type =
                  'fashion_editor'

            ORDER BY
              updated_at DESC

            LIMIT 1

            FOR UPDATE
          `,
      [ownerId, projectId],
    );

    const existingShowcase = existingShowcaseResult.rows[0] || null;

    const previewUrl =
      req.file?.path ||
      project.preview_url ||
      existingShowcase?.watermarked_preview_url ||
      null;

    if (!previewUrl) {
      await rollbackQuietly(client);

      return sendError(
        res,
        400,
        "A preview image is required the first time an editor project is shared.",
      );
    }

    let originalDesignId = null;

    if (project.source_project_id) {
      const sourceDesignResult = await client.query(
        `
              SELECT id

              FROM designs

              WHERE editor_project_id = $1
                AND source_type =
                    'fashion_editor'
                AND is_public = TRUE
                AND is_published = TRUE

              ORDER BY
                updated_at DESC

              LIMIT 1
            `,
        [project.source_project_id],
      );

      originalDesignId = sourceDesignResult.rows[0]?.id || null;
    }

    let showcaseResult;
    let statusCode;
    let message;

    if (existingShowcase) {
      showcaseResult = await client.query(
        `
              UPDATE designs

              SET
                title = $1,
                description = $2,
                canvas_state = $3::jsonb,
                style_category = $4,
                tags = $5,
                watermarked_preview_url = $6,
                is_public = TRUE,
                is_published = TRUE,
                source_type =
                    'fashion_editor',
                editor_project_id = $7,
                is_editable = TRUE,
                allow_remix = $8,
                original_design_id = $9,
                updated_at = NOW()

              WHERE id = $10
                AND owner_id = $11

              RETURNING
                id,
                owner_id,
                title,
                sku,
                slug,
                description,
                style_category,
                tags,
                product_type,
                license_type,
                watermarked_preview_url,
                is_public,
                is_published,
                source_type,
                editor_project_id,
                is_editable,
                allow_remix,
                original_design_id,
                created_at,
                updated_at
            `,
        [
          showcaseInput.title,
          showcaseInput.description,
          JSON.stringify(project.project_data),
          showcaseInput.styleAesthetic,
          processedTags,
          previewUrl,
          projectId,
          allowRemix,
          originalDesignId,
          existingShowcase.id,
          ownerId,
        ],
      );

      statusCode = 200;

      message = "Showcase publication updated successfully.";
    } else {
      const slug = createShowcaseSlug(showcaseInput.title);

      const sku = createSku("DSN-EDT");

      showcaseResult = await client.query(
        `
              INSERT INTO designs (
                id,
                owner_id,
                title,
                sku,
                slug,
                description,
                base_price,
                canvas_state,
                style_category,
                tags,
                product_type,
                license_type,
                watermarked_preview_url,
                high_res_file_url,
                is_public,
                is_published,
                source_type,
                editor_project_id,
                is_editable,
                allow_remix,
                original_design_id,
                created_at,
                updated_at
              )
              VALUES (
                gen_random_uuid(),
                $1,
                $2,
                $3,
                $4,
                $5,
                0,
                $6::jsonb,
                $7,
                $8,
                'sketch',
                'commercial',
                $9,
                NULL,
                TRUE,
                TRUE,
                'fashion_editor',
                $10,
                TRUE,
                $11,
                $12,
                NOW(),
                NOW()
              )
              RETURNING
                id,
                owner_id,
                title,
                sku,
                slug,
                description,
                style_category,
                tags,
                product_type,
                license_type,
                watermarked_preview_url,
                is_public,
                is_published,
                source_type,
                editor_project_id,
                is_editable,
                allow_remix,
                original_design_id,
                created_at,
                updated_at
            `,
        [
          ownerId,
          showcaseInput.title,
          sku,
          slug,
          showcaseInput.description,
          JSON.stringify(project.project_data),
          showcaseInput.styleAesthetic,
          processedTags,
          previewUrl,
          projectId,
          allowRemix,
          originalDesignId,
        ],
      );

      statusCode = 201;

      message = "Fashion Editor project shared to the showcase successfully.";
    }

    await client.query(
      `
          UPDATE editor_projects

          SET
            title = $1,
            preview_url = $2,
            updated_at = NOW()

          WHERE id = $3
            AND owner_id = $4
        `,
      [showcaseInput.title, previewUrl, projectId, ownerId],
    );

    await client.query("COMMIT");

    return res.status(statusCode).json({
      status: "success",

      message,

      data: {
        ...showcaseResult.rows[0],

        showcase_attributes: {
          item_type: showcaseInput.itemType,

          fit_type: showcaseInput.fitType,

          size_category: showcaseInput.sizeCategory,

          audience: showcaseInput.audience,

          materials: showcaseInput.materials,

          wear_category: showcaseInput.wearCategory,

          style_aesthetic: showcaseInput.styleAesthetic,

          season: showcaseInput.season,
        },
      },
    });
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Editor project sharing failed:", error);

    return sendDatabaseError(
      res,
      error,
      "The editor project could not be shared to the showcase.",
    );
  } finally {
    client.release();
  }
};

/*=========================================================
Remix Shared Fashion Editor Project

A remix always creates a private copy owned by the current
designer. It never modifies the original project.
=========================================================*/

exports.remixEditorProject = async (req, res) => {
  const ownerId = getAuthenticatedUserId(req);

  const sourceProjectId = String(req.params?.projectId ?? "").trim();

  if (!ownerId) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!isPositiveBigIntId(sourceProjectId)) {
    return sendError(res, 400, "A valid source editor project ID is required.");
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const sourceResult = await client.query(
      `
            SELECT
              ep.id,
              ep.owner_id,
              ep.title,
              ep.project_data,
              ep.schema_version,
              ep.preview_url,
              ep.version,

              d.id AS source_design_id,
              d.slug AS source_design_slug,
              d.allow_remix

            FROM editor_projects ep

            JOIN LATERAL (
              SELECT
                id,
                slug,
                allow_remix

              FROM designs

              WHERE editor_project_id =
                    ep.id

                AND source_type =
                    'fashion_editor'

                AND is_editable =
                    TRUE

                AND allow_remix =
                    TRUE

                AND is_public =
                    TRUE

                AND is_published =
                    TRUE

              ORDER BY
                updated_at DESC

              LIMIT 1
            ) d ON TRUE

            WHERE ep.id = $1

            LIMIT 1

            FOR UPDATE OF ep
          `,
      [sourceProjectId],
    );

    if (sourceResult.rows.length === 0) {
      await rollbackQuietly(client);

      return sendError(
        res,
        404,
        "This Fashion Editor project is unavailable for remixing.",
      );
    }

    const sourceProject = sourceResult.rows[0];

    if (String(sourceProject.owner_id) === ownerId) {
      await rollbackQuietly(client);

      return sendError(
        res,
        400,
        "You own this project. Open and edit the original instead of remixing it.",
      );
    }

    const remixTitle = cleanText(
      req.body?.title || `${sourceProject.title} — Remix`,
      120,
    );

    const clonedProjectData = JSON.parse(
      JSON.stringify(sourceProject.project_data),
    );

    const timestamp = new Date().toISOString();

    if (isPlainObject(clonedProjectData.document)) {
      clonedProjectData.document = {
        ...clonedProjectData.document,

        id: `document-${crypto.randomUUID()}`,

        name: remixTitle,

        createdAt: timestamp,

        updatedAt: timestamp,
      };
    }

    clonedProjectData.exportedAt = timestamp;

    const insertResult = await client.query(
      `
            INSERT INTO editor_projects (
              owner_id,
              title,
              project_data,
              schema_version,
              preview_url,
              source_project_id,
              version,
              created_at,
              updated_at
            )
            VALUES (
              $1,
              $2,
              $3::jsonb,
              $4,
              $5,
              $6,
              1,
              NOW(),
              NOW()
            )
            RETURNING
              id,
              owner_id,
              title,
              project_data,
              schema_version,
              preview_url,
              source_project_id,
              version,
              created_at,
              updated_at
          `,
      [
        ownerId,
        remixTitle,
        JSON.stringify(clonedProjectData),
        sourceProject.schema_version,
        sourceProject.preview_url,
        sourceProject.id,
      ],
    );

    await client.query("COMMIT");

    return res.status(201).json({
      status: "success",

      message: "A private remix project was created successfully.",

      data: {
        ...insertResult.rows[0],

        source_design_id: sourceProject.source_design_id,

        source_design_slug: sourceProject.source_design_slug,
      },
    });
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Editor project remix failed:", error);

    return sendDatabaseError(
      res,
      error,
      "The remix project could not be created.",
    );
  } finally {
    client.release();
  }
};

/*=========================================================
Fetch Designer Inventory
=========================================================*/

exports.getMyInventory = async (req, res) => {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    return sendError(res, 401, "Authentication is required.");
  }

  try {
    const designs = await db.query(
      `
            SELECT
              id,
              owner_id,
              sku,
              slug,
              title,
              base_price,
              watermarked_preview_url,
              description,
              style_category,
              tags,
              product_type,
              is_public,
              is_published,
              source_type,
              editor_project_id,
              is_editable,
              allow_remix,
              original_design_id,
              created_at,
              updated_at

            FROM designs

            WHERE owner_id = $1

            ORDER BY
              created_at DESC
          `,
      [userId],
    );

    return res.status(200).json({
      status: "success",

      results: designs.rows.length,

      data: designs.rows,
    });
  } catch (error) {
    console.error("Inventory fetch database error:", error);

    return sendDatabaseError(res, error, "Error fetching inventory.");
  }
};

/*=========================================================
Get Designer Review Statistics
=========================================================*/

exports.getMyReviews = async (req, res) => {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    return sendError(res, 401, "Authentication is required.");
  }

  try {
    const result = await db.query(
      `
            SELECT
              avg_rating,
              total_completed_bookings

            FROM designer_profiles

            WHERE user_id = $1

            LIMIT 1
          `,
      [userId],
    );

    if (result.rows.length === 0) {
      return sendError(res, 404, "Designer profile not found.");
    }

    return res.status(200).json({
      status: "success",

      data: result.rows[0],
    });
  } catch (error) {
    console.error("Review aggregation error:", error);

    return sendDatabaseError(res, error, "Error loading reviews.");
  }
};

/*=========================================================
Get Public Designer Profile
=========================================================*/

exports.getPublicProfile = async (req, res) => {
  const userId = String(req.params?.userId ?? "").trim();

  if (!userId) {
    return sendError(res, 400, "A designer ID is required.");
  }

  try {
    const profileQuery = await db.query(
      `
            SELECT
              dp.*,
              u.full_name,
              u.profile_image_url,
              u.created_at AS joined_at,

              COALESCE(
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id',
                      d.id,

                    'owner_id',
                      d.owner_id,

                    'title',
                      d.title,

                    'slug',
                      d.slug,

                    'description',
                      d.description,

                    'watermarked_preview_url',
                      d.watermarked_preview_url,

                    'product_type',
                      d.product_type,

                    'style_category',
                      d.style_category,

                    'tags',
                      d.tags,

                    'base_price',
                      d.base_price,

                    'source_type',
                      d.source_type,

                    'editor_project_id',
                      d.editor_project_id,

                    'is_editable',
                      d.is_editable,

                    'allow_remix',
                      d.allow_remix,

                    'original_design_id',
                      d.original_design_id,

                    'created_at',
                      d.created_at,

                    'updated_at',
                      d.updated_at
                  )

                  ORDER BY
                    d.created_at DESC
                )

                FILTER (
                  WHERE d.id IS NOT NULL

                    AND d.is_public =
                        TRUE

                    AND d.is_published =
                        TRUE
                ),

                '[]'::json
              ) AS public_portfolio

            FROM designer_profiles dp

            JOIN users u
              ON dp.user_id =
                 u.id

            LEFT JOIN designs d
              ON dp.user_id =
                 d.owner_id

            WHERE dp.user_id = $1

            GROUP BY
              dp.user_id,
              u.id
          `,
      [userId],
    );

    if (profileQuery.rows.length === 0) {
      return sendError(res, 404, "Designer catalog entry not found.");
    }

    return res.status(200).json({
      status: "success",

      data: profileQuery.rows[0],
    });
  } catch (error) {
    console.error("Public profile fetch failed:", error);

    return sendDatabaseError(
      res,
      error,
      "Failed to recover designer profile data.",
    );
  }
};

/*=========================================================
Update Professional Designer Profile
=========================================================*/

exports.updateProfile = async (req, res) => {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    return sendError(res, 401, "Authentication is required.");
  }

  const { bio, portfolio_url, address_line, city, country } = req.body || {};

  const newProfileImage = req.file?.path || null;

  const safeBio = bio === undefined ? null : cleanText(bio, 2000);

  const safePortfolio =
    portfolio_url === undefined ? null : cleanText(portfolio_url, 500);

  const safeAddress =
    address_line === undefined ? null : cleanText(address_line, 255);

  const safeCity = city === undefined ? null : cleanText(city, 100);

  const safeCountry = country === undefined ? null : cleanText(country, 100);

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    if (newProfileImage) {
      await client.query(
        `
            UPDATE users

            SET
              profile_image_url = $1,
              updated_at = NOW()

            WHERE id = $2
          `,
        [newProfileImage, userId],
      );
    } else {
      await client.query(
        `
            UPDATE users

            SET
              updated_at = NOW()

            WHERE id = $1
          `,
        [userId],
      );
    }

    await client.query(
      `
          INSERT INTO designer_profiles (
            user_id,
            bio,
            portfolio_url,
            address_line,
            city,
            country
          )
          VALUES (
            $1,
            COALESCE($2, ''),
            COALESCE($3, ''),
            COALESCE($4, ''),
            COALESCE($5, ''),
            COALESCE($6, '')
          )

          ON CONFLICT (user_id)

          DO UPDATE SET
            bio =
              COALESCE(
                $2,
                designer_profiles.bio
              ),

            portfolio_url =
              COALESCE(
                $3,
                designer_profiles
                  .portfolio_url
              ),

            address_line =
              COALESCE(
                $4,
                designer_profiles
                  .address_line
              ),

            city =
              COALESCE(
                $5,
                designer_profiles.city
              ),

            country =
              COALESCE(
                $6,
                designer_profiles
                  .country
              )
        `,
      [userId, safeBio, safePortfolio, safeAddress, safeCity, safeCountry],
    );

    const updatedRecord = await client.query(
      `
            SELECT
              u.id,
              u.full_name,
              u.email,
              u.profile_image_url,
              u.role,
              u.approval_status,

              dp.bio,
              dp.portfolio_url,
              dp.address_line,
              dp.city,
              dp.country,
              dp.tier,
              dp.xp_points,
              dp.commission_rate

            FROM users u

            LEFT JOIN designer_profiles dp
              ON u.id =
                 dp.user_id

            WHERE u.id = $1

            LIMIT 1
          `,
      [userId],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      status: "success",

      message: "Professional designer profile updated successfully.",

      data: updatedRecord.rows[0],
    });
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Profile database save failure:", error);

    return sendDatabaseError(res, error, "Profile update failed.");
  } finally {
    client.release();
  }
};

/*=========================================================
Fetch Current Designer Profile
=========================================================*/

exports.getMe = async (req, res) => {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    return sendError(res, 401, "Authentication is required.");
  }

  try {
    const result = await db.query(
      `
            SELECT
              u.id,
              u.full_name,
              u.email,
              u.profile_image_url,
              u.role,
              u.approval_status,

              dp.bio,
              dp.portfolio_url,
              dp.address_line,
              dp.city,
              dp.country,
              dp.tier,
              dp.xp_points,
              dp.commission_rate

            FROM users u

            LEFT JOIN designer_profiles dp
              ON u.id =
                 dp.user_id

            WHERE u.id = $1

            LIMIT 1
          `,
      [userId],
    );

    if (result.rows.length === 0) {
      return sendError(res, 404, "Designer profile not found.");
    }

    return res.status(200).json({
      status: "success",

      data: result.rows[0],
    });
  } catch (error) {
    console.error("Profile extraction failed:", error);

    return sendDatabaseError(res, error, "Error retrieving profile.");
  }
};
