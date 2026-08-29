"use strict";

/*
=========================================================
DesignByYou / FashionVision
Creator Controller
Creator Studio Assets + Fashion Editor Projects
Version 5.2
=========================================================

CREATOR STUDIO MODEL
---------------------------------------------------------

Creator Studio is NOT:

- ecommerce
- a marketplace
- a store
- checkout
- a sales system
- a licensing system

Creator Studio assets are creative Showcase assets owned
by the Creator.

A Studio asset may contain:

- preview image
- title
- description
- creative format
- general creative category
- Showcase style
- Showcase garment
- Showcase occasions
- tags
- editable/vector canvas state

=========================================================
GENERAL CATEGORY MODEL
=========================================================

design_categories
        ↓
GET /api/v1/creators/studio/categories
        ↓
category_id
        ↓
designs.category_id

Only active categories may be selected.

=========================================================
SHOWCASE DISCOVERY MODEL
=========================================================

showcase_discovery_terms
        ↓
GET /api/v1/creator-showcase/discovery
        ↓
Creator selects:
    exactly 1 Style
    exactly 1 Garment
    0+ Occasions
        ↓
showcase_term_ids
        ↓
validated by this controller
        ↓
design_showcase_terms

A design can therefore belong to multiple discovery
dimensions simultaneously.

Example:

Style:
    Romantic

Garment:
    Dresses

Occasion:
    Wedding
    Party

=========================================================
STYLE CATEGORY COMPATIBILITY
=========================================================

The designs table still contains:

style_category

The frontend may submit style_category for compatibility,
but the backend does NOT trust that value.

The canonical style is loaded from:

showcase_discovery_terms

and its validated database name is written into:

designs.style_category

=========================================================
SHOWCASE VISIBILITY
=========================================================

Creator Studio assets are intended to appear in the
Creator Showcase.

Therefore new Creator Studio assets are saved as:

is_public    = TRUE
is_published = TRUE

These flags mean Showcase visibility/readiness.

They do NOT mean:

- for sale
- purchasable
- licensed
- marketplace listing

=========================================================
LEGACY DATABASE COLUMNS
=========================================================

The designs table still contains older compatibility
columns including:

base_price
product_type
license_type
sku

These are NOT Creator-facing ecommerce features.

base_price:
    always 0

product_type:
    safe legacy enum value "sketch"

license_type:
    safe legacy value "commercial"

sku:
    internal asset identifier only

Creative format remains separate from legacy product_type.

=========================================================
TRANSACTION GUARANTEE
=========================================================

The following happen atomically:

1. validate category
2. validate Showcase discovery terms
3. insert design
4. insert design_showcase_terms rows
5. commit

If any step fails, the database design insert and Showcase
term assignments are rolled back together.
=========================================================
*/

const crypto = require("crypto");

const db = require("../../config/db");

/*=========================================================
Limits
=========================================================*/

const MAX_TITLE_LENGTH = 120;

const MAX_DESCRIPTION_LENGTH = 3000;

const MAX_TAG_LENGTH = 40;

const MAX_TAGS = 15;

/*
1 Style
1 Garment
Up to all 8 currently-defined Occasions

10 gives enough room for:

1 + 1 + 8
*/

const MAX_SHOWCASE_TERMS = 10;

/*=========================================================
Creator Fashion Editor Project Limits
=========================================================*/

const EDITOR_PROJECT_MAX_BYTES = 25 * 1024 * 1024;

const EDITOR_PROJECT_SCHEMA_MAX = 100;

/*=========================================================
Creative Formats
=========================================================*/

const ALLOWED_FORMATS = new Set(["sketch", "3d_garment", "tech_pack"]);

/*=========================================================
Legacy Database Compatibility
=========================================================*/

const LEGACY_PRODUCT_TYPE = "sketch";

const LEGACY_LICENSE_TYPE = "commercial";

const LEGACY_BASE_PRICE = 0;

/*=========================================================
Helpers
=========================================================*/

function cleanText(value, maxLength = 500) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .replace(/\0/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanMultiline(value, maxLength = 3000) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .replace(/\0/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function normalizeToken(value) {
  return cleanText(value, 100).toLowerCase().replace(/\s+/g, "_");
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPositiveBigIntId(value) {
  return /^[1-9]\d*$/.test(String(value ?? "").trim());
}

function getAuthenticatedCreatorId(req) {
  return cleanText(req?.user?.id || req?.user?._id || "", 100);
}

function normalizeTag(value) {
  return cleanText(value, MAX_TAG_LENGTH)
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

function sendError(res, statusCode, message, code = null) {
  return res.status(statusCode).json({
    status: "error",

    ...(code
      ? {
          code,
        }
      : {}),

    message,
  });
}

/*=========================================================
UUID Validation
=========================================================*/

function isUuid(value) {
  if (typeof value !== "string") {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

/*=========================================================
Uploaded Preview
=========================================================*/

function getUploadedPreviewUrl(req) {
  return cleanText(
    req?.file?.path || req?.file?.secure_url || req?.file?.url || "",
    2000,
  );
}

/*=========================================================
JSON Parsing
=========================================================*/

function parseJson(value) {
  if (value === undefined || value === null || value === "") {
    return {
      supplied: false,
      valid: true,
      value: null,
    };
  }

  if (typeof value === "object") {
    return {
      supplied: true,
      valid: true,
      value,
    };
  }

  if (typeof value !== "string") {
    return {
      supplied: true,
      valid: false,
      value: null,
    };
  }

  try {
    return {
      supplied: true,
      valid: true,
      value: JSON.parse(value),
    };
  } catch {
    return {
      supplied: true,
      valid: false,
      value: null,
    };
  }
}

/*=========================================================
Fashion Editor Project Validation
=========================================================*/

function validateEditorProjectPayload(rawProjectData) {
  const parsed = parseJson(rawProjectData);

  if (!parsed.supplied || !parsed.valid || !isPlainObject(parsed.value)) {
    return {
      error: "A valid Fashion Editor project_data object is required.",
    };
  }

  const projectData = parsed.value;

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

  const title = cleanText(projectData.document?.name, MAX_TITLE_LENGTH);

  return {
    projectData,
    serializedProject,
    schemaVersion,
    title,
  };
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error("Creator transaction rollback failed:", rollbackError);
  }
}

/*=========================================================
Tags
=========================================================*/

function parseTags(rawTags) {
  const parsed = parseJson(rawTags);

  if (!parsed.supplied) {
    return {
      valid: true,
      tags: [],
    };
  }

  if (!parsed.valid || !Array.isArray(parsed.value)) {
    return {
      valid: false,
      tags: [],
    };
  }

  const result = [];
  const seen = new Set();

  for (const rawTag of parsed.value) {
    const tag = normalizeTag(rawTag);

    if (!tag || seen.has(tag)) {
      continue;
    }

    seen.add(tag);
    result.push(tag);

    if (result.length >= MAX_TAGS) {
      break;
    }
  }

  return {
    valid: true,
    tags: result,
  };
}

/*=========================================================
Showcase Term IDs
=========================================================*/

function parseShowcaseTermIds(rawValue) {
  const parsed = parseJson(rawValue);

  if (!parsed.supplied || !parsed.valid || !Array.isArray(parsed.value)) {
    return {
      valid: false,
      ids: [],
    };
  }

  const ids = [];
  const seen = new Set();

  for (const rawId of parsed.value) {
    const id = cleanText(rawId, 100);

    if (!id || !isUuid(id)) {
      return {
        valid: false,
        ids: [],
      };
    }

    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    ids.push(id);

    if (ids.length > MAX_SHOWCASE_TERMS) {
      return {
        valid: false,
        ids: [],
      };
    }
  }

  return {
    valid: true,
    ids,
  };
}

/*=========================================================
Canvas State
=========================================================*/

function parseCanvasState(rawCanvasState) {
  const parsed = parseJson(rawCanvasState);

  if (!parsed.supplied) {
    return {
      valid: true,
      value: [],
    };
  }

  if (!parsed.valid) {
    return {
      valid: false,
      value: [],
    };
  }

  const value = parsed.value;

  if (Array.isArray(value)) {
    return {
      valid: true,
      value,
    };
  }

  if (value && typeof value === "object") {
    return {
      valid: true,
      value,
    };
  }

  return {
    valid: false,
    value: [],
  };
}

/*=========================================================
Slug
=========================================================*/

function makeSlug(title) {
  const base = cleanText(title, MAX_TITLE_LENGTH)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  const suffix = crypto.randomBytes(4).toString("hex");

  return `${base || "creator-studio"}-${suffix}`;
}

/*=========================================================
Internal Asset Code
=========================================================*/

function createInternalAssetCode() {
  return `CRT-STU-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

/*=========================================================
Public Discovery Term Shape
=========================================================*/

function serializeDiscoveryTerm(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    search_term: row.search_term,
    emoji: row.emoji || null,
    description: row.description || null,
    sort_order: row.sort_order,
  };
}

/*=========================================================
GET CREATOR STUDIO CATEGORIES

GET
/api/v1/creators/studio/categories
=========================================================*/

exports.getCreatorStudioCategories = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        id,
        name,
        slug,
        description,
        sort_order

      FROM design_categories

      WHERE is_active = TRUE

      ORDER BY
        sort_order ASC,
        name ASC
    `);

    return res.status(200).json({
      status: "success",
      count: result.rows.length,

      data: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description || null,
        sort_order: row.sort_order,
      })),
    });
  } catch (error) {
    console.error("Creator Studio categories fetch failed:", error);

    return sendError(
      res,
      500,
      "Creator Studio categories could not be loaded.",
      "CREATOR_STUDIO_CATEGORIES_FAILED",
    );
  }
};

/*=========================================================
GET CREATOR FASHION EDITOR PROJECTS

GET
/api/v1/creators/editor-projects
=========================================================*/

exports.getMyEditorProjects = async (req, res) => {
  const creatorId = getAuthenticatedCreatorId(req);

  if (!creatorId) {
    return sendError(
      res,
      401,
      "Authentication is required.",
      "AUTHENTICATION_REQUIRED",
    );
  }

  if (normalizeToken(req?.user?.role) !== "creator") {
    return sendError(
      res,
      403,
      "Only Creator accounts can access Creator Fashion Editor projects.",
      "CREATOR_REQUIRED",
    );
  }

  try {
    const result = await db.query(
      `
        SELECT
          id,
          owner_id,
          title,
          schema_version,
          preview_url,
          source_project_id,
          version,
          created_at,
          updated_at

        FROM editor_projects

        WHERE owner_id = $1

        ORDER BY updated_at DESC
      `,
      [creatorId],
    );

    return res.status(200).json({
      status: "success",
      results: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Creator editor project list failed:", error);

    return sendError(
      res,
      500,
      "Creator Fashion Editor projects could not be loaded.",
      "CREATOR_EDITOR_PROJECTS_LOAD_FAILED",
    );
  }
};

/*=========================================================
CREATE CREATOR FASHION EDITOR PROJECT

POST
/api/v1/creators/editor-projects
=========================================================*/

exports.createEditorProject = async (req, res) => {
  const creatorId = getAuthenticatedCreatorId(req);

  if (!creatorId) {
    return sendError(
      res,
      401,
      "Authentication is required.",
      "AUTHENTICATION_REQUIRED",
    );
  }

  if (normalizeToken(req?.user?.role) !== "creator") {
    return sendError(
      res,
      403,
      "Only Creator accounts can create Creator Fashion Editor projects.",
      "CREATOR_REQUIRED",
    );
  }

  const projectValidation = validateEditorProjectPayload(
    req.body?.project_data,
  );

  if (projectValidation.error) {
    return sendError(
      res,
      400,
      projectValidation.error,
      "INVALID_EDITOR_PROJECT",
    );
  }

  const title = cleanText(
    req.body?.title || projectValidation.title || "Untitled Fashion Design",
    MAX_TITLE_LENGTH,
  );

  if (!title) {
    return sendError(
      res,
      400,
      "A project title is required.",
      "EDITOR_PROJECT_TITLE_REQUIRED",
    );
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
        creatorId,
        title,
        projectValidation.serializedProject,
        projectValidation.schemaVersion,
      ],
    );

    return res.status(201).json({
      status: "success",
      message: "Creator Fashion Editor project created successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Creator editor project creation failed:", error);

    return sendError(
      res,
      500,
      "The Creator Fashion Editor project could not be created.",
      "CREATOR_EDITOR_PROJECT_CREATE_FAILED",
    );
  }
};

/*=========================================================
GET OWNED CREATOR FASHION EDITOR PROJECT

GET
/api/v1/creators/editor-projects/:projectId
=========================================================*/

exports.getEditorProject = async (req, res) => {
  const creatorId = getAuthenticatedCreatorId(req);
  const projectId = cleanText(req.params?.projectId, 100);

  if (!creatorId) {
    return sendError(
      res,
      401,
      "Authentication is required.",
      "AUTHENTICATION_REQUIRED",
    );
  }

  if (normalizeToken(req?.user?.role) !== "creator") {
    return sendError(
      res,
      403,
      "Only Creator accounts can access Creator Fashion Editor projects.",
      "CREATOR_REQUIRED",
    );
  }

  if (!isPositiveBigIntId(projectId)) {
    return sendError(
      res,
      400,
      "A valid editor project ID is required.",
      "INVALID_EDITOR_PROJECT_ID",
    );
  }

  try {
    const result = await db.query(
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
      `,
      [projectId, creatorId],
    );

    if (result.rows.length === 0) {
      return sendError(
        res,
        404,
        "Creator Fashion Editor project not found.",
        "EDITOR_PROJECT_NOT_FOUND",
      );
    }

    return res.status(200).json({
      status: "success",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Creator editor project retrieval failed:", error);

    return sendError(
      res,
      500,
      "The Creator Fashion Editor project could not be loaded.",
      "CREATOR_EDITOR_PROJECT_LOAD_FAILED",
    );
  }
};

/*=========================================================
UPDATE OWNED CREATOR FASHION EDITOR PROJECT

PUT
/api/v1/creators/editor-projects/:projectId
=========================================================*/

exports.updateEditorProject = async (req, res) => {
  const creatorId = getAuthenticatedCreatorId(req);
  const projectId = cleanText(req.params?.projectId, 100);

  if (!creatorId) {
    return sendError(
      res,
      401,
      "Authentication is required.",
      "AUTHENTICATION_REQUIRED",
    );
  }

  if (normalizeToken(req?.user?.role) !== "creator") {
    return sendError(
      res,
      403,
      "Only Creator accounts can update Creator Fashion Editor projects.",
      "CREATOR_REQUIRED",
    );
  }

  if (!isPositiveBigIntId(projectId)) {
    return sendError(
      res,
      400,
      "A valid editor project ID is required.",
      "INVALID_EDITOR_PROJECT_ID",
    );
  }

  let client;
  let transactionActive = false;

  try {
    client = await db.connect();

    await client.query("BEGIN");
    transactionActive = true;

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
      [projectId, creatorId],
    );

    if (existingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionActive = false;

      return sendError(
        res,
        404,
        "Creator Fashion Editor project not found.",
        "EDITOR_PROJECT_NOT_FOUND",
      );
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
        await client.query("ROLLBACK");
        transactionActive = false;

        return sendError(
          res,
          400,
          "expected_version must be a positive integer.",
          "INVALID_EDITOR_PROJECT_VERSION",
        );
      }

      if (expectedVersion !== Number(existingProject.version)) {
        await client.query("ROLLBACK");
        transactionActive = false;

        return res.status(409).json({
          status: "error",
          code: "EDITOR_PROJECT_VERSION_CONFLICT",
          message:
            "This project has changed since it was opened. Reload the latest version before saving again.",
          details: {
            current_version: Number(existingProject.version),
          },
        });
      }
    }

    let nextProjectData = existingProject.project_data;
    let nextSchemaVersion = Number(existingProject.schema_version) || 2;

    if (req.body?.project_data !== undefined) {
      const projectValidation = validateEditorProjectPayload(
        req.body.project_data,
      );

      if (projectValidation.error) {
        await client.query("ROLLBACK");
        transactionActive = false;

        return sendError(
          res,
          400,
          projectValidation.error,
          "INVALID_EDITOR_PROJECT",
        );
      }

      nextProjectData = projectValidation.projectData;
      nextSchemaVersion = projectValidation.schemaVersion;
    }

    const nextTitle = cleanText(
      req.body?.title ??
        nextProjectData?.document?.name ??
        existingProject.title,
      MAX_TITLE_LENGTH,
    );

    if (!nextTitle) {
      await client.query("ROLLBACK");
      transactionActive = false;

      return sendError(
        res,
        400,
        "A project title is required.",
        "EDITOR_PROJECT_TITLE_REQUIRED",
      );
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
        creatorId,
      ],
    );

    await client.query("COMMIT");
    transactionActive = false;

    return res.status(200).json({
      status: "success",
      message: "Creator Fashion Editor project saved successfully.",
      data: updateResult.rows[0],
    });
  } catch (error) {
    if (client && transactionActive) {
      await rollbackQuietly(client);
      transactionActive = false;
    }

    console.error("Creator editor project update failed:", error);

    return sendError(
      res,
      500,
      "The Creator Fashion Editor project could not be saved.",
      "CREATOR_EDITOR_PROJECT_UPDATE_FAILED",
    );
  } finally {
    if (client) {
      client.release();
    }
  }
};

/*=========================================================
UPLOAD CREATOR STUDIO ASSET / SHARE FASHION EDITOR PROJECT

POST
/api/v1/creators/studio/upload

POST
/api/v1/creators/editor-projects/:projectId/share

Multipart:

preview
title
description
style_category        compatibility only
format
category_id
showcase_term_ids
tags
canvas_state          manual upload compatibility
allow_remix           Fashion Editor share only

Manual Creator Studio upload:

source_type        = upload
editor_project_id  = NULL
is_editable        = FALSE
allow_remix        = FALSE
original_design_id = NULL

Fashion Editor Showcase share:

source_type        = fashion_editor
editor_project_id  = owned editor project
is_editable        = TRUE
allow_remix        = Creator choice

For Fashion Editor shares, the authoritative editable
canvas state is loaded from editor_projects.project_data.
The browser cannot publish another Creator's project.
=========================================================*/

exports.uploadCreatorStudioAsset = async (req, res) => {
  const creatorId = getAuthenticatedCreatorId(req);

  /*=====================================================
    Authentication Defense
    =====================================================*/

  if (!creatorId) {
    return sendError(
      res,
      401,
      "Authentication is required.",
      "AUTHENTICATION_REQUIRED",
    );
  }

  /*
    authorize("creator") is also enforced by the route.
  */

  if (normalizeToken(req?.user?.role) !== "creator") {
    return sendError(
      res,
      403,
      "Only Creator accounts can save Creator Studio assets.",
      "CREATOR_REQUIRED",
    );
  }

  /*=====================================================
    Optional Fashion Editor Source
    =====================================================*/

  const editorProjectId = cleanText(
    req.params?.projectId || req.body?.editor_project_id,
    100,
  );

  const isFashionEditorShare = Boolean(editorProjectId);

  if (isFashionEditorShare && !isPositiveBigIntId(editorProjectId)) {
    return sendError(
      res,
      400,
      "A valid Fashion Editor project ID is required.",
      "INVALID_EDITOR_PROJECT_ID",
    );
  }

  /*
    Manual uploads are never remixable.

    Fashion Editor shares may explicitly opt in.
  */

  const allowRemix = isFashionEditorShare
    ? parseBoolean(req.body?.allow_remix, false)
    : false;

  /*=====================================================
    Preview
    =====================================================*/

  const previewUrl = getUploadedPreviewUrl(req);

  if (!previewUrl) {
    return sendError(
      res,
      400,
      "A preview image is required.",
      "PREVIEW_REQUIRED",
    );
  }

  /*=====================================================
    Basic Metadata
    =====================================================*/

  const title = cleanText(req.body?.title, MAX_TITLE_LENGTH);

  const description = cleanMultiline(
    req.body?.description,
    MAX_DESCRIPTION_LENGTH,
  );

  if (title.length < 2) {
    return sendError(
      res,
      400,
      "Title must contain at least 2 characters.",
      "INVALID_TITLE",
    );
  }

  if (description.length < 10) {
    return sendError(
      res,
      400,
      "Description must contain at least 10 characters.",
      "INVALID_DESCRIPTION",
    );
  }

  /*=====================================================
    General Category
    =====================================================*/

  const categoryId = cleanText(req.body?.category_id, 100);

  if (!categoryId) {
    return sendError(
      res,
      400,
      "Select a category before saving the Studio asset.",
      "CATEGORY_REQUIRED",
    );
  }

  if (!isUuid(categoryId)) {
    return sendError(
      res,
      400,
      "The selected category is invalid.",
      "INVALID_CATEGORY",
    );
  }

  /*=====================================================
    Showcase Discovery IDs
    =====================================================*/

  const showcaseTermResult = parseShowcaseTermIds(req.body?.showcase_term_ids);

  if (!showcaseTermResult.valid) {
    return sendError(
      res,
      400,
      "Showcase discovery selections are invalid.",
      "INVALID_SHOWCASE_TERMS",
    );
  }

  const showcaseTermIds = showcaseTermResult.ids;

  if (showcaseTermIds.length < 2) {
    return sendError(
      res,
      400,
      "Select a Showcase style and garment type.",
      "SHOWCASE_CLASSIFICATION_REQUIRED",
    );
  }

  /*=====================================================
    Creative Format
    =====================================================*/

  const requestedFormat = normalizeToken(
    req.body?.format || req.body?.product_type || "sketch",
  );

  if (!ALLOWED_FORMATS.has(requestedFormat)) {
    return sendError(
      res,
      400,
      "The selected creative format is not supported.",
      "INVALID_FORMAT",
    );
  }

  /*=====================================================
    User Tags
    =====================================================*/

  const parsedTags = parseTags(req.body?.tags);

  if (!parsedTags.valid) {
    return sendError(
      res,
      400,
      "Tags must be supplied as a valid JSON array.",
      "INVALID_TAGS",
    );
  }

  const internalTags = [
    "creator-studio",
    `format-${normalizeTag(requestedFormat)}`,
  ];

  if (isFashionEditorShare) {
    internalTags.push("fashion-editor");
  }

  const combinedTags = [];
  const tagSet = new Set();

  for (const tag of [...internalTags, ...parsedTags.tags]) {
    const normalized = normalizeTag(tag);

    if (!normalized || tagSet.has(normalized)) {
      continue;
    }

    tagSet.add(normalized);
    combinedTags.push(normalized);

    if (combinedTags.length >= MAX_TAGS) {
      break;
    }
  }

  /*=====================================================
    Manual Upload Canvas State

    A Fashion Editor share ignores browser canvas_state and
    loads the authoritative project_data from the database.
    =====================================================*/

  const canvasStateResult = parseCanvasState(req.body?.canvas_state);

  if (!canvasStateResult.valid) {
    return sendError(
      res,
      400,
      "Canvas state must contain valid JSON.",
      "INVALID_CANVAS_STATE",
    );
  }

  const submittedCanvasState = canvasStateResult.value;

  /*=====================================================
    Identifiers
    =====================================================*/

  const internalAssetCode = createInternalAssetCode();
  const slug = makeSlug(title);

  /*=====================================================
    Transaction
    =====================================================*/

  let client;
  let transactionActive = false;

  try {
    client = await db.connect();

    await client.query("BEGIN");
    transactionActive = true;

    /*---------------------------------------------------
      Validate Active General Category
      ---------------------------------------------------*/

    const categoryResult = await client.query(
      `
        SELECT
          id,
          name,
          slug,
          description

        FROM design_categories

        WHERE id = $1
          AND is_active = TRUE

        LIMIT 1

        FOR SHARE
      `,
      [categoryId],
    );

    if (categoryResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionActive = false;

      return sendError(
        res,
        400,
        "The selected category is no longer available.",
        "INVALID_CATEGORY",
      );
    }

    const category = categoryResult.rows[0];

    /*---------------------------------------------------
      Validate Showcase Discovery Terms
      ---------------------------------------------------*/

    const discoveryResult = await client.query(
      `
        SELECT
          id,
          group_type,
          name,
          slug,
          search_term,
          emoji,
          description,
          sort_order

        FROM showcase_discovery_terms

        WHERE id = ANY($1::uuid[])
          AND is_active = TRUE

        ORDER BY
          CASE group_type
            WHEN 'style' THEN 1
            WHEN 'garment' THEN 2
            WHEN 'occasion' THEN 3
            ELSE 4
          END,
          sort_order ASC,
          name ASC

        FOR SHARE
      `,
      [showcaseTermIds],
    );

    if (discoveryResult.rows.length !== showcaseTermIds.length) {
      await client.query("ROLLBACK");
      transactionActive = false;

      return sendError(
        res,
        400,
        "One or more Showcase discovery selections are no longer available.",
        "INVALID_SHOWCASE_TERMS",
      );
    }

    const styleTerms = discoveryResult.rows.filter(
      (row) => row.group_type === "style",
    );

    const garmentTerms = discoveryResult.rows.filter(
      (row) => row.group_type === "garment",
    );

    const occasionTerms = discoveryResult.rows.filter(
      (row) => row.group_type === "occasion",
    );

    if (styleTerms.length !== 1) {
      await client.query("ROLLBACK");
      transactionActive = false;

      return sendError(
        res,
        400,
        "Select exactly one Showcase style.",
        "INVALID_SHOWCASE_STYLE",
      );
    }

    if (garmentTerms.length !== 1) {
      await client.query("ROLLBACK");
      transactionActive = false;

      return sendError(
        res,
        400,
        "Select exactly one garment type.",
        "INVALID_SHOWCASE_GARMENT",
      );
    }

    const styleTerm = styleTerms[0];
    const garmentTerm = garmentTerms[0];

    const styleCategory = cleanText(styleTerm.name, 120);

    /*---------------------------------------------------
      Resolve Fashion Editor Source

      Only a project owned by the authenticated Creator may
      be shared.

      For editor-backed Showcase items, project_data is the
      authoritative editable state.
      ---------------------------------------------------*/

    let editorProject = null;
    let resolvedCanvasState = submittedCanvasState;
    let originalDesignId = null;

    if (isFashionEditorShare) {
      const editorProjectResult = await client.query(
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

          FOR SHARE
        `,
        [editorProjectId, creatorId],
      );

      if (editorProjectResult.rows.length === 0) {
        await client.query("ROLLBACK");
        transactionActive = false;

        return sendError(
          res,
          404,
          "Creator Fashion Editor project not found.",
          "EDITOR_PROJECT_NOT_FOUND",
        );
      }

      editorProject = editorProjectResult.rows[0];

      const projectValidation = validateEditorProjectPayload(
        editorProject.project_data,
      );

      if (projectValidation.error) {
        await client.query("ROLLBACK");
        transactionActive = false;

        return sendError(
          res,
          400,
          "The Fashion Editor project cannot be shared because its editable state is invalid.",
          "INVALID_EDITOR_PROJECT",
        );
      }

      resolvedCanvasState = projectValidation.projectData;

      /*
        If this editor project was itself created from a
        remix, preserve Showcase lineage.

        original_design_id points to the root published
        Showcase design when it can be resolved.
      */

      if (editorProject.source_project_id) {
        const sourceDesignResult = await client.query(
          `
            SELECT
              id,
              original_design_id

            FROM designs

            WHERE editor_project_id = $1
              AND source_type = 'fashion_editor'
              AND is_public = TRUE
              AND is_published = TRUE

            ORDER BY updated_at DESC

            LIMIT 1

            FOR SHARE
          `,
          [editorProject.source_project_id],
        );

        if (sourceDesignResult.rows.length > 0) {
          const sourceDesign = sourceDesignResult.rows[0];

          originalDesignId = sourceDesign.original_design_id || sourceDesign.id;
        }
      }
    }

    /*---------------------------------------------------
      Existing Fashion Editor Publication

      Sharing the same editor project again updates its
      existing Showcase item instead of creating duplicates.

      Manual uploads always create a new Showcase item.
      ---------------------------------------------------*/

    let existingDesign = null;

    if (isFashionEditorShare) {
      const existingDesignResult = await client.query(
        `
          SELECT
            id,
            original_design_id

          FROM designs

          WHERE owner_id = $1
            AND editor_project_id = $2
            AND source_type = 'fashion_editor'

          ORDER BY updated_at DESC

          LIMIT 1

          FOR UPDATE
        `,
        [creatorId, editorProjectId],
      );

      existingDesign = existingDesignResult.rows[0] || null;

      if (!originalDesignId && existingDesign?.original_design_id) {
        originalDesignId = existingDesign.original_design_id;
      }
    }

    /*---------------------------------------------------
      Create / Update Creator Showcase Design
      ---------------------------------------------------*/

    let designResult;

    if (existingDesign) {
      designResult = await client.query(
        `
          UPDATE designs

          SET
            title = $1,
            description = $2,
            canvas_state = $3::jsonb,
            style_category = $4,
            tags = $5::text[],
            product_type = $6,
            license_type = $7,
            category_id = $8,
            watermarked_preview_url = $9,
            high_res_file_url = NULL,
            is_public = TRUE,
            is_published = TRUE,
            source_type = 'fashion_editor',
            editor_project_id = $10,
            is_editable = TRUE,
            allow_remix = $11,
            original_design_id = $12,
            updated_at = NOW()

          WHERE id = $13
            AND owner_id = $14

          RETURNING
            id,
            owner_id,
            title,
            slug,
            description,
            canvas_state,
            style_category,
            tags,
            category_id,
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
          title,
          description,
          JSON.stringify(resolvedCanvasState),
          styleCategory,
          combinedTags,
          LEGACY_PRODUCT_TYPE,
          LEGACY_LICENSE_TYPE,
          category.id,
          previewUrl,
          editorProjectId,
          allowRemix,
          originalDesignId,
          existingDesign.id,
          creatorId,
        ],
      );

      await client.query(
        `
          DELETE FROM design_showcase_terms
          WHERE design_id = $1
        `,
        [existingDesign.id],
      );
    } else {
      designResult = await client.query(
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
            category_id,
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
            $6,
            $7::jsonb,
            $8,
            $9::text[],
            $10,
            $11,
            $12,
            $13,
            NULL,
            TRUE,
            TRUE,
            $14,
            $15,
            $16,
            $17,
            $18,
            NOW(),
            NOW()
          )

          RETURNING
            id,
            owner_id,
            title,
            slug,
            description,
            canvas_state,
            style_category,
            tags,
            category_id,
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
          creatorId,
          title,
          internalAssetCode,
          slug,
          description,
          LEGACY_BASE_PRICE,
          JSON.stringify(resolvedCanvasState),
          styleCategory,
          combinedTags,
          LEGACY_PRODUCT_TYPE,
          LEGACY_LICENSE_TYPE,
          category.id,
          previewUrl,
          isFashionEditorShare ? "fashion_editor" : "upload",
          isFashionEditorShare ? editorProjectId : null,
          isFashionEditorShare,
          allowRemix,
          isFashionEditorShare ? originalDesignId : null,
        ],
      );
    }

    const design = designResult.rows[0];

    /*---------------------------------------------------
      Insert Showcase Discovery Relationships
      ---------------------------------------------------*/

    await client.query(
      `
        INSERT INTO design_showcase_terms (
          design_id,
          term_id,
          created_at
        )

        SELECT
          $1::uuid,
          selected_term_id,
          NOW()

        FROM UNNEST(
          $2::uuid[]
        ) AS selected_term_id

        ON CONFLICT (
          design_id,
          term_id
        )
        DO NOTHING
      `,
      [design.id, showcaseTermIds],
    );

    /*---------------------------------------------------
      Keep Fashion Editor Project Preview Current
      ---------------------------------------------------*/

    if (isFashionEditorShare) {
      await client.query(
        `
          UPDATE editor_projects

          SET
            preview_url = $1,
            updated_at = NOW()

          WHERE id = $2
            AND owner_id = $3
        `,
        [previewUrl, editorProjectId, creatorId],
      );
    }

    await client.query("COMMIT");
    transactionActive = false;

    /*===================================================
      Response
      ===================================================*/

    return res.status(existingDesign ? 200 : 201).json({
      status: "success",

      message: isFashionEditorShare
        ? existingDesign
          ? "Fashion Editor Showcase item updated successfully."
          : "Fashion Editor project shared to the Creator Showcase successfully."
        : "Creator Studio asset saved successfully.",

      data: {
        id: design.id,
        owner_id: design.owner_id,
        title: design.title,
        slug: design.slug,
        description: design.description,
        preview_url: design.watermarked_preview_url,
        style_category: design.style_category,
        format: requestedFormat,

        category: {
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description || null,
        },

        showcase_discovery: {
          style: serializeDiscoveryTerm(styleTerm),
          garment: serializeDiscoveryTerm(garmentTerm),
          occasions: occasionTerms.map(serializeDiscoveryTerm),
        },

        showcase_term_ids: showcaseTermIds,
        tags: parsedTags.tags,
        canvas_state: design.canvas_state,

        is_public: design.is_public,
        is_published: design.is_published,

        source_type: design.source_type,
        editor_project_id: design.editor_project_id,
        is_editable: design.is_editable,
        allow_remix: design.allow_remix,
        original_design_id: design.original_design_id,

        created_at: design.created_at,
        updated_at: design.updated_at,
      },
    });
  } catch (error) {
    if (client && transactionActive) {
      try {
        await client.query("ROLLBACK");
        transactionActive = false;
      } catch (rollbackError) {
        console.error("Creator Studio rollback failed:", rollbackError);
      }
    }

    console.error("Creator Studio asset save failed:", error);

    if (error.code === "23505") {
      return sendError(
        res,
        409,
        "The asset could not be assigned a unique identifier. Please try again.",
        "ASSET_CONFLICT",
      );
    }

    if (error.code === "23503") {
      return sendError(
        res,
        400,
        "One or more selected creative classifications are no longer available.",
        "ASSET_REFERENCE_UNAVAILABLE",
      );
    }

    if (error.code === "22P02") {
      return sendError(
        res,
        400,
        "One or more asset values are incompatible with the current database configuration.",
        "INVALID_DATABASE_VALUE",
      );
    }

    if (error.code === "23514") {
      return sendError(
        res,
        400,
        "One or more asset values violate a database constraint.",
        "DATABASE_CONSTRAINT_FAILED",
      );
    }

    return sendError(
      res,
      500,
      "The Creator Studio asset could not be saved.",
      "CREATOR_STUDIO_SAVE_FAILED",
    );
  } finally {
    if (client) {
      client.release();
    }
  }
};

/*=========================================================
REMIX CREATOR SHOWCASE FASHION EDITOR DESIGN

POST
/api/v1/creators/showcase/:designId/remix

Creates a brand-new private editor_projects row for the
authenticated Creator.

The original Showcase design and original editor project
are never modified.

Requirements:

- public
- published
- Creator Studio item
- source_type = fashion_editor
- is_editable = TRUE
- allow_remix = TRUE

The new editor project records:

source_project_id = source Showcase editor project ID

If the remix is later shared to Showcase, the share flow
resolves original_design_id automatically.
=========================================================*/

exports.remixCreatorShowcaseDesign = async (req, res) => {
  const creatorId = getAuthenticatedCreatorId(req);

  const designId = cleanText(
    req.params?.designId || req.params?.showcaseId || req.body?.design_id,
    100,
  );

  if (!creatorId) {
    return sendError(
      res,
      401,
      "Authentication is required.",
      "AUTHENTICATION_REQUIRED",
    );
  }

  if (normalizeToken(req?.user?.role) !== "creator") {
    return sendError(
      res,
      403,
      "Only Creator accounts can remix Creator Showcase designs.",
      "CREATOR_REQUIRED",
    );
  }

  if (!isUuid(designId)) {
    return sendError(
      res,
      400,
      "A valid Showcase design ID is required.",
      "INVALID_SHOWCASE_DESIGN_ID",
    );
  }

  let client;
  let transactionActive = false;

  try {
    client = await db.connect();

    await client.query("BEGIN");
    transactionActive = true;

    /*---------------------------------------------------
      Resolve Remixable Creator Showcase Design

      creator-studio internal tag prevents this Creator-only
      route from silently becoming a Designer remix route.
      ---------------------------------------------------*/

    const sourceResult = await client.query(
      `
        SELECT
          d.id,
          d.owner_id,
          d.title,
          d.watermarked_preview_url,
          d.editor_project_id,
          d.original_design_id,
          d.source_type,
          d.is_editable,
          d.allow_remix,

          ep.project_data,
          ep.schema_version,
          ep.version AS source_project_version

        FROM designs d

        INNER JOIN editor_projects ep
          ON ep.id = d.editor_project_id

        WHERE d.id = $1
          AND d.is_public = TRUE
          AND d.is_published = TRUE
          AND d.source_type = 'fashion_editor'
          AND d.is_editable = TRUE
          AND d.allow_remix = TRUE
          AND COALESCE(d.tags, ARRAY[]::text[])
              @> ARRAY['creator-studio']::text[]

        LIMIT 1

        FOR SHARE OF d, ep
      `,
      [designId],
    );

    if (sourceResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionActive = false;

      return sendError(
        res,
        404,
        "This Showcase design is not available for remixing.",
        "SHOWCASE_DESIGN_NOT_REMIXABLE",
      );
    }

    const source = sourceResult.rows[0];

    const requestedTitle = cleanText(
      req.body?.title || `${source.title || "Fashion Design"} Remix`,
      MAX_TITLE_LENGTH,
    );

    const remixTitle = requestedTitle || "Fashion Design Remix";

    /*---------------------------------------------------
      Deep-copy + Validate Editable State
      ---------------------------------------------------*/

    let clonedProjectData;

    try {
      clonedProjectData = JSON.parse(JSON.stringify(source.project_data));
    } catch {
      await client.query("ROLLBACK");
      transactionActive = false;

      return sendError(
        res,
        400,
        "The source Fashion Editor project cannot be copied.",
        "INVALID_SOURCE_EDITOR_PROJECT",
      );
    }

    if (isPlainObject(clonedProjectData?.document)) {
      clonedProjectData.document.name = remixTitle;
    }

    const projectValidation = validateEditorProjectPayload(clonedProjectData);

    if (projectValidation.error) {
      await client.query("ROLLBACK");
      transactionActive = false;

      return sendError(
        res,
        400,
        "The source Fashion Editor project is not valid for remixing.",
        "INVALID_SOURCE_EDITOR_PROJECT",
      );
    }

    /*---------------------------------------------------
      Create Private Remix Project

      owner_id changes to the remixer.

      source_project_id points to the source project's ID.

      Nothing is written to the original project.
      ---------------------------------------------------*/

    const remixResult = await client.query(
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
        creatorId,
        remixTitle,
        projectValidation.serializedProject,
        projectValidation.schemaVersion,
        source.watermarked_preview_url || null,
        source.editor_project_id,
      ],
    );

    await client.query("COMMIT");
    transactionActive = false;

    const remixProject = remixResult.rows[0];

    return res.status(201).json({
      status: "success",

      message:
        "A private Fashion Editor remix was created successfully. The original design was not changed.",

      data: {
        ...remixProject,

        source_showcase_design_id: source.id,

        original_design_id: source.original_design_id || source.id,
      },
    });
  } catch (error) {
    if (client && transactionActive) {
      await rollbackQuietly(client);
      transactionActive = false;
    }

    console.error("Creator Showcase remix failed:", error);

    if (error.code === "23503") {
      return sendError(
        res,
        409,
        "The source Fashion Editor project is no longer available.",
        "REMIX_SOURCE_UNAVAILABLE",
      );
    }

    return sendError(
      res,
      500,
      "The Showcase design could not be remixed.",
      "CREATOR_SHOWCASE_REMIX_FAILED",
    );
  } finally {
    if (client) {
      client.release();
    }
  }
};
