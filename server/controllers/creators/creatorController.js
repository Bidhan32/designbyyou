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

  const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
  const MAX_CANVAS_STATE_BYTES = 2 * 1024 * 1024;

  const ALLOWED_PREVIEW_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  /*
   * These are the only multipart/text fields
   * accepted by this endpoint.
   *
   * Clients may send:
   *
   * visibility = "private" | "public"
   *
   * Clients may NOT directly control:
   *
   * is_public
   * is_published
   */
  const ALLOWED_BODY_FIELDS = new Set([
    "title",
    "description",
    "format",
    "product_type",
    "category_id",
    "style_category",
    "showcase_term_ids",
    "tags",
    "canvas_state",
    "editor_project_id",
    "allow_remix",
    "visibility",
    "preview",
  ]);

  const body = req.body || {};

  /*=====================================================
    Field Presence Helper

    This is important for Fashion Editor re-share.

    Omitted field:
      preserve existing value

    Explicit field:
      update / clear existing value
  =====================================================*/

  const hasBodyField = (fieldName) =>
    Object.prototype.hasOwnProperty.call(
      body,
      fieldName,
    );

  /*=====================================================
    Preview Helpers
  =====================================================*/

  const getPreviewFile = () => {
    if (req.file) {
      return req.file;
    }

    if (Array.isArray(req.files)) {
      return req.files[0] || null;
    }

    if (
      req.files &&
      Array.isArray(
        req.files.preview,
      )
    ) {
      return (
        req.files.preview[0] ||
        null
      );
    }

    return null;
  };

  const matchesImageSignature = (
    buffer,
    mimeType,
  ) => {
    /*
     * CloudinaryStorage normally does not expose
     * an in-memory file buffer.
     *
     * upload.js / Cloudinary handle image validation
     * in that case.
     */
    if (
      !Buffer.isBuffer(
        buffer,
      )
    ) {
      return true;
    }

    if (
      buffer.length < 12
    ) {
      return false;
    }

    if (
      mimeType ===
      "image/jpeg"
    ) {
      return (
        buffer[0] ===
          0xff &&
        buffer[1] ===
          0xd8 &&
        buffer[2] ===
          0xff
      );
    }

    if (
      mimeType ===
      "image/png"
    ) {
      return (
        buffer[0] ===
          0x89 &&
        buffer[1] ===
          0x50 &&
        buffer[2] ===
          0x4e &&
        buffer[3] ===
          0x47 &&
        buffer[4] ===
          0x0d &&
        buffer[5] ===
          0x0a &&
        buffer[6] ===
          0x1a &&
        buffer[7] ===
          0x0a
      );
    }

    if (
      mimeType ===
      "image/webp"
    ) {
      return (
        buffer
          .subarray(
            0,
            4,
          )
          .toString(
            "ascii",
          ) ===
          "RIFF" &&
        buffer
          .subarray(
            8,
            12,
          )
          .toString(
            "ascii",
          ) ===
          "WEBP"
      );
    }

    return false;
  };

  const getJsonByteLength = (
    value,
  ) => {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return 0;
    }

    try {
      const serialized =
        typeof value ===
        "string"
          ? value
          : JSON.stringify(
              value,
            );

      return Buffer.byteLength(
        serialized,
        "utf8",
      );
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };

  /*=====================================================
    Format Mapping
  =====================================================*/

  const PRODUCT_TYPE_TO_FORMAT =
    Object.freeze({
      sketch:
        "sketch",

      tech_pack:
        "tech_pack",

      "3d_model":
        "3d_garment",
    });

  const FORMAT_TO_PRODUCT_TYPE =
    Object.freeze({
      sketch:
        "sketch",

      tech_pack:
        "tech_pack",

      "3d_garment":
        "3d_model",
    });

  /*=====================================================
    Internal / User Tag Helpers
  =====================================================*/

  const getUserTagsFromStoredTags = (
    storedTags,
  ) => {
    if (
      !Array.isArray(
        storedTags,
      )
    ) {
      return [];
    }

    const result = [];
    const seen =
      new Set();

    for (
      const rawTag of
      storedTags
    ) {
      const tag =
        normalizeTag(
          rawTag,
        );

      if (!tag) {
        continue;
      }

      /*
       * Hide server-controlled implementation tags
       * from the Creator-facing response.
       */
      if (
        tag ===
          "creator-studio" ||
        tag ===
          "fashion-editor" ||
        tag.startsWith(
          "format-",
        )
      ) {
        continue;
      }

      if (
        seen.has(tag)
      ) {
        continue;
      }

      seen.add(tag);

      result.push(tag);

      if (
        result.length >=
        MAX_TAGS
      ) {
        break;
      }
    }

    return result;
  };

  const buildStoredTags = ({
    userTags,
    creatorFormat,
    fashionEditorShare,
  }) => {
    const storedTags = [];

    const seen =
      new Set();

    const pushTag = (
      rawTag,
    ) => {
      const tag =
        normalizeTag(
          rawTag,
        );

      if (
        !tag ||
        seen.has(tag) ||
        storedTags.length >=
          MAX_TAGS
      ) {
        return;
      }

      seen.add(tag);

      storedTags.push(
        tag,
      );
    };

    /*
     * Server-controlled tag.
     */
    pushTag(
      "creator-studio",
    );

    /*
     * Keep format tag synchronized with
     * the effective product_type.
     */
    if (
      creatorFormat
    ) {
      pushTag(
        `format-${creatorFormat}`,
      );
    }

    /*
     * Fashion Editor server-controlled tag.
     */
    if (
      fashionEditorShare
    ) {
      pushTag(
        "fashion-editor",
      );
    }

    for (
      const tag of
      userTags || []
    ) {
      pushTag(tag);
    }

    return storedTags;
  };

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
   * authorize("creator") also exists at route level.
   *
   * This remains defense-in-depth.
   */
  if (
    normalizeToken(
      req?.user?.role,
    ) !== "creator"
  ) {
    return sendError(
      res,
      403,
      "Only Creator accounts can save Creator Studio assets.",
      "CREATOR_REQUIRED",
    );
  }

  /*=====================================================
    Reject Unexpected Body Fields
  =====================================================*/

  for (
    const fieldName of
    Object.keys(body)
  ) {
    if (
      !ALLOWED_BODY_FIELDS.has(
        fieldName,
      )
    ) {
      return sendError(
        res,
        400,
        `Unsupported Creator Studio field: ${fieldName}.`,
        "UNSUPPORTED_STUDIO_FIELD",
      );
    }
  }

  /*=====================================================
    Fashion Editor Source
  =====================================================*/

  const editorProjectId =
    cleanText(
      req.params
        ?.projectId ||
        body.editor_project_id,
      100,
    );

  const isFashionEditorShare =
    Boolean(
      editorProjectId,
    );

  if (
    isFashionEditorShare &&
    !isPositiveBigIntId(
      editorProjectId,
    )
  ) {
    return sendError(
      res,
      400,
      "A valid Fashion Editor project ID is required.",
      "INVALID_EDITOR_PROJECT_ID",
    );
  }

  /*=====================================================
    Visibility Intent

    IMPORTANT:

    We DO NOT calculate the final default here.

    Why?

    For an existing Fashion Editor publication:

      omitted visibility
      → preserve existing visibility

    For a new Fashion Editor publication:

      omitted visibility
      → public

    For a new manual Studio upload:

      omitted visibility
      → private
  =====================================================*/

  const hasVisibilityField =
    hasBodyField(
      "visibility",
    );

  let requestedVisibility =
    null;

  if (
    hasVisibilityField
  ) {
    if (
      typeof body.visibility !==
      "string"
    ) {
      return sendError(
        res,
        400,
        "Visibility must be private or public.",
        "INVALID_VISIBILITY",
      );
    }

    requestedVisibility =
      normalizeToken(
        body.visibility,
      );

    if (
      !new Set([
        "private",
        "public",
      ]).has(
        requestedVisibility,
      )
    ) {
      return sendError(
        res,
        400,
        "Visibility must be private or public.",
        "INVALID_VISIBILITY",
      );
    }
  }

  /*=====================================================
    Remix Intent

    Omitted on existing Fashion Editor item:
      preserve existing value

    Supplied:
      update value
  =====================================================*/

  const hasAllowRemixField =
    hasBodyField(
      "allow_remix",
    );

  /*
   * Preserve the existing endpoint's boolean parsing
   * compatibility for multipart form values.
   */
  const requestedAllowRemix =
    hasAllowRemixField
      ? parseBoolean(
          body.allow_remix,
          false,
        )
      : null;

  /*=====================================================
    Optional Preview Security
  =====================================================*/

  const uploadedPreview =
    getPreviewFile();

  if (uploadedPreview) {
    const previewMimeType =
      String(
        uploadedPreview.mimetype ||
          "",
      ).toLowerCase();

    const previewSize =
      Number(
        uploadedPreview.size ||
          0,
      );

    if (
      !ALLOWED_PREVIEW_TYPES.has(
        previewMimeType,
      )
    ) {
      return sendError(
        res,
        400,
        "Only JPG, PNG, and WEBP preview images are supported.",
        "INVALID_PREVIEW_TYPE",
      );
    }

    if (
      !Number.isFinite(
        previewSize,
      ) ||
      previewSize <= 0
    ) {
      return sendError(
        res,
        400,
        "The uploaded preview image is empty or invalid.",
        "INVALID_PREVIEW_FILE",
      );
    }

    if (
      previewSize >
      MAX_PREVIEW_BYTES
    ) {
      return sendError(
        res,
        413,
        "The preview image must be 5 MB or smaller.",
        "PREVIEW_TOO_LARGE",
      );
    }

    if (
      Buffer.isBuffer(
        uploadedPreview.buffer,
      ) &&
      !matchesImageSignature(
        uploadedPreview.buffer,
        previewMimeType,
      )
    ) {
      return sendError(
        res,
        400,
        "The preview file contents do not match its declared image type.",
        "INVALID_PREVIEW_SIGNATURE",
      );
    }
  }

  const submittedPreviewUrl =
    cleanText(
      getUploadedPreviewUrl(
        req,
      ),
      2048,
    ) || null;

  /*=====================================================
    Optional Title
  =====================================================*/

  const hasTitleField =
    hasBodyField(
      "title",
    );

  if (
    hasTitleField &&
    body.title !== null &&
    typeof body.title !==
      "string"
  ) {
    return sendError(
      res,
      400,
      "Title must be text.",
      "INVALID_TITLE",
    );
  }

  const rawTitle =
    String(
      body.title ?? "",
    );

  if (
    rawTitle.length >
    MAX_TITLE_LENGTH
  ) {
    return sendError(
      res,
      400,
      `Title must not exceed ${MAX_TITLE_LENGTH} characters.`,
      "INVALID_TITLE",
    );
  }

  const title =
    cleanText(
      rawTitle,
      MAX_TITLE_LENGTH,
    ) || null;

  /*=====================================================
    Optional Description
  =====================================================*/

  const hasDescriptionField =
    hasBodyField(
      "description",
    );

  if (
    hasDescriptionField &&
    body.description !==
      null &&
    typeof body.description !==
      "string"
  ) {
    return sendError(
      res,
      400,
      "Description must be text.",
      "INVALID_DESCRIPTION",
    );
  }

  const rawDescription =
    String(
      body.description ??
        "",
    );

  if (
    rawDescription.length >
    MAX_DESCRIPTION_LENGTH
  ) {
    return sendError(
      res,
      400,
      `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters.`,
      "INVALID_DESCRIPTION",
    );
  }

  const description =
    cleanMultiline(
      rawDescription,
      MAX_DESCRIPTION_LENGTH,
    ) || null;

  /*=====================================================
    Optional General Category
  =====================================================*/

  const hasCategoryField =
    hasBodyField(
      "category_id",
    );

  if (
    hasCategoryField &&
    body.category_id !==
      null &&
    typeof body.category_id !==
      "string"
  ) {
    return sendError(
      res,
      400,
      "Creative category must be a valid identifier.",
      "INVALID_CATEGORY",
    );
  }

  const categoryId =
    cleanText(
      body.category_id,
      100,
    );

  if (
    categoryId &&
    !isUuid(categoryId)
  ) {
    return sendError(
      res,
      400,
      "The selected category is invalid.",
      "INVALID_CATEGORY",
    );
  }

  /*=====================================================
    Optional Showcase Discovery Terms
  =====================================================*/

  const hasShowcaseTermsField =
    hasBodyField(
      "showcase_term_ids",
    );

  const rawShowcaseTermIds =
    body.showcase_term_ids;

  const showcaseTermResult =
    rawShowcaseTermIds ===
      undefined ||
    rawShowcaseTermIds ===
      null ||
    rawShowcaseTermIds ===
      ""
      ? {
          valid: true,
          ids: [],
        }
      : parseShowcaseTermIds(
          rawShowcaseTermIds,
        );

  if (
    !showcaseTermResult.valid
  ) {
    return sendError(
      res,
      400,
      "Showcase discovery selections are invalid.",
      "INVALID_SHOWCASE_TERMS",
    );
  }

  const showcaseTermIds =
    Array.from(
      new Set(
        Array.isArray(
          showcaseTermResult.ids,
        )
          ? showcaseTermResult.ids
          : [],
      ),
    );

  if (
    showcaseTermIds.some(
      (id) =>
        !isUuid(id),
    )
  ) {
    return sendError(
      res,
      400,
      "One or more Showcase discovery selections are invalid.",
      "INVALID_SHOWCASE_TERMS",
    );
  }

  /*=====================================================
    Optional Creative Format
  =====================================================*/

  const hasFormatField =
    hasBodyField(
      "format",
    ) ||
    hasBodyField(
      "product_type",
    );

  const rawRequestedFormat =
    body.format !==
      undefined &&
    body.format !== null
      ? body.format
      : body.product_type;

  if (
    hasFormatField &&
    rawRequestedFormat !==
      null &&
    typeof rawRequestedFormat !==
      "string"
  ) {
    return sendError(
      res,
      400,
      "Creative format must be text.",
      "INVALID_FORMAT",
    );
  }

  const requestedFormat =
    normalizeToken(
      rawRequestedFormat ||
        "",
    );

  const ALLOWED_CREATOR_FORMATS =
    new Set([
      "sketch",
      "tech_pack",
      "3d_garment",
    ]);

  if (
    requestedFormat &&
    !ALLOWED_CREATOR_FORMATS.has(
      requestedFormat,
    )
  ) {
    return sendError(
      res,
      400,
      "The selected creative format is not supported.",
      "INVALID_FORMAT",
    );
  }

  const storedProductType =
    requestedFormat
      ? FORMAT_TO_PRODUCT_TYPE[
          requestedFormat
        ]
      : null;

  if (
    requestedFormat &&
    !storedProductType
  ) {
    return sendError(
      res,
      400,
      "The selected creative format cannot be stored.",
      "INVALID_FORMAT",
    );
  }

  /*=====================================================
    Optional User Tags
  =====================================================*/

  const hasTagsField =
    hasBodyField(
      "tags",
    );

  const rawTags =
    body.tags;

  const parsedTags =
    rawTags === undefined ||
    rawTags === null ||
    rawTags === ""
      ? {
          valid: true,
          tags: [],
        }
      : parseTags(
          rawTags,
        );

  if (
    !parsedTags.valid
  ) {
    return sendError(
      res,
      400,
      "Tags must be supplied as a valid JSON array.",
      "INVALID_TAGS",
    );
  }

  /*=====================================================
    Optional Canvas State
  =====================================================*/

  const rawCanvasState =
    body.canvas_state;

  if (
    getJsonByteLength(
      rawCanvasState,
    ) >
    MAX_CANVAS_STATE_BYTES
  ) {
    return sendError(
      res,
      413,
      "Canvas state is too large.",
      "CANVAS_STATE_TOO_LARGE",
    );
  }

  const canvasStateResult =
    rawCanvasState ===
      undefined ||
    rawCanvasState ===
      null ||
    rawCanvasState === ""
      ? {
          valid: true,
          value: [],
        }
      : parseCanvasState(
          rawCanvasState,
        );

  if (
    !canvasStateResult.valid
  ) {
    return sendError(
      res,
      400,
      "Canvas state must contain valid JSON.",
      "INVALID_CANVAS_STATE",
    );
  }

  const submittedCanvasState =
    canvasStateResult.value ??
    [];

  /*=====================================================
    Internal Identifiers
  =====================================================*/

  const internalAssetCode =
    createInternalAssetCode();

  const slug =
    makeSlug(
      title ||
        `creator-studio-${internalAssetCode}`,
    );

  /*=====================================================
    Database Transaction
  =====================================================*/

  let client;

  let transactionActive =
    false;

  try {
    client =
      await db.connect();

    await client.query(
      "BEGIN",
    );

    transactionActive =
      true;

    /*---------------------------------------------------
      Validate Optional Category
    ---------------------------------------------------*/

    let category = null;

    if (categoryId) {
      const categoryResult =
        await client.query(
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
          [
            categoryId,
          ],
        );

      if (
        categoryResult.rows
          .length === 0
      ) {
        await client.query(
          "ROLLBACK",
        );

        transactionActive =
          false;

        return sendError(
          res,
          400,
          "The selected category is no longer available.",
          "INVALID_CATEGORY",
        );
      }

      category =
        categoryResult
          .rows[0];
    }

    /*---------------------------------------------------
      Validate Showcase Discovery Terms
    ---------------------------------------------------*/

    let discoveryRows = [];

    if (
      showcaseTermIds.length >
      0
    ) {
      const discoveryResult =
        await client.query(
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
          [
            showcaseTermIds,
          ],
        );

      if (
        discoveryResult.rows
          .length !==
        showcaseTermIds.length
      ) {
        await client.query(
          "ROLLBACK",
        );

        transactionActive =
          false;

        return sendError(
          res,
          400,
          "One or more Showcase discovery selections are no longer available.",
          "INVALID_SHOWCASE_TERMS",
        );
      }

      discoveryRows =
        discoveryResult.rows;
    }

    const unsupportedDiscoveryTerms =
      discoveryRows.filter(
        (row) =>
          row.group_type !==
            "style" &&
          row.group_type !==
            "garment" &&
          row.group_type !==
            "occasion",
      );

    if (
      unsupportedDiscoveryTerms.length >
      0
    ) {
      await client.query(
        "ROLLBACK",
      );

      transactionActive =
        false;

      return sendError(
        res,
        400,
        "One or more Showcase discovery selections use an unsupported classification.",
        "INVALID_SHOWCASE_TERMS",
      );
    }

    const styleTerms =
      discoveryRows.filter(
        (row) =>
          row.group_type ===
          "style",
      );

    const garmentTerms =
      discoveryRows.filter(
        (row) =>
          row.group_type ===
          "garment",
      );

    const occasionTerms =
      discoveryRows.filter(
        (row) =>
          row.group_type ===
          "occasion",
      );

    if (
      styleTerms.length >
      1
    ) {
      await client.query(
        "ROLLBACK",
      );

      transactionActive =
        false;

      return sendError(
        res,
        400,
        "Only one Showcase style may be selected.",
        "INVALID_SHOWCASE_STYLE",
      );
    }

    if (
      garmentTerms.length >
      1
    ) {
      await client.query(
        "ROLLBACK",
      );

      transactionActive =
        false;

      return sendError(
        res,
        400,
        "Only one garment type may be selected.",
        "INVALID_SHOWCASE_GARMENT",
      );
    }

    const submittedStyleTerm =
      styleTerms[0] ||
      null;

    /*
     * Browser style_category is NOT trusted.
     *
     * It is derived from the validated style term.
     */
    const submittedStyleCategory =
      submittedStyleTerm
        ? cleanText(
            submittedStyleTerm
              .name,
            120,
          ) || null
        : null;

    /*---------------------------------------------------
      Resolve Fashion Editor Project
    ---------------------------------------------------*/

    let editorProject =
      null;

    let resolvedCanvasState =
      submittedCanvasState;

    let resolvedPreviewUrl =
      submittedPreviewUrl;

    let originalDesignId =
      null;

    if (
      isFashionEditorShare
    ) {
      const editorProjectResult =
        await client.query(
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
          [
            editorProjectId,
            creatorId,
          ],
        );

      if (
        editorProjectResult
          .rows.length === 0
      ) {
        await client.query(
          "ROLLBACK",
        );

        transactionActive =
          false;

        return sendError(
          res,
          404,
          "Creator Fashion Editor project not found.",
          "EDITOR_PROJECT_NOT_FOUND",
        );
      }

      editorProject =
        editorProjectResult
          .rows[0];

      /*
       * Fashion Editor DB project_data is authoritative.
       */
      const projectValidation =
        validateEditorProjectPayload(
          editorProject.project_data,
        );

      if (
        projectValidation.error
      ) {
        await client.query(
          "ROLLBACK",
        );

        transactionActive =
          false;

        return sendError(
          res,
          400,
          "The Fashion Editor project cannot be shared because its editable state is invalid.",
          "INVALID_EDITOR_PROJECT",
        );
      }

      resolvedCanvasState =
        projectValidation
          .projectData;

      /*
       * Preserve project preview when no new preview
       * was supplied.
       */
      if (
        !resolvedPreviewUrl &&
        editorProject.preview_url
      ) {
        resolvedPreviewUrl =
          cleanText(
            editorProject
              .preview_url,
            2048,
          ) || null;
      }

      /*-------------------------------------------------
        Remix Lineage
      -------------------------------------------------*/

      if (
        editorProject
          .source_project_id
      ) {
        const sourceDesignResult =
          await client.query(
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
            [
              editorProject
                .source_project_id,
            ],
          );

        if (
          sourceDesignResult
            .rows.length >
          0
        ) {
          const sourceDesign =
            sourceDesignResult
              .rows[0];

          originalDesignId =
            sourceDesign
              .original_design_id ||
            sourceDesign.id;
        }
      }
    }

    /*---------------------------------------------------
      Find Existing Fashion Editor Publication
    ---------------------------------------------------*/

    let existingDesign =
      null;

    if (
      isFashionEditorShare
    ) {
      const existingDesignResult =
        await client.query(
          `
            SELECT
              id,
              original_design_id,
              is_public,
              tags,
              product_type,
              allow_remix

            FROM designs

            WHERE owner_id = $1
              AND editor_project_id = $2
              AND source_type = 'fashion_editor'

            ORDER BY updated_at DESC

            LIMIT 1

            FOR UPDATE
          `,
          [
            creatorId,
            editorProjectId,
          ],
        );

      existingDesign =
        existingDesignResult
          .rows[0] ||
        null;

      if (
        !originalDesignId &&
        existingDesign
          ?.original_design_id
      ) {
        originalDesignId =
          existingDesign
            .original_design_id;
      }
    }

    /*=====================================================
      Resolve Effective Visibility

      NEW manual upload:
        omitted -> private

      NEW Fashion Editor share:
        omitted -> public

      EXISTING Fashion Editor publication:
        omitted -> preserve existing visibility

      Explicit private/public:
        use submitted value
    =====================================================*/

    const effectiveIsPublic =
      requestedVisibility
        ? requestedVisibility ===
          "public"
        : existingDesign
          ? Boolean(
              existingDesign
                .is_public,
            )
          : isFashionEditorShare;

    /*=====================================================
      Resolve Effective Remix Permission
    =====================================================*/

    const effectiveAllowRemix =
      isFashionEditorShare
        ? hasAllowRemixField
          ? Boolean(
              requestedAllowRemix,
            )
          : existingDesign
            ? Boolean(
                existingDesign
                  .allow_remix,
              )
            : false
        : false;

    /*=====================================================
      Resolve Effective Format

      Existing + omitted:
        preserve

      Explicit blank:
        clear to NULL

      Supplied:
        replace
    =====================================================*/

    const effectiveProductType =
      hasFormatField
        ? storedProductType
        : existingDesign
            ?.product_type ||
          null;

    const effectiveCreatorFormat =
      effectiveProductType
        ? PRODUCT_TYPE_TO_FORMAT[
            String(
              effectiveProductType,
            )
          ] || null
        : null;

    /*=====================================================
      Resolve Effective User Tags

      Existing + omitted:
        preserve existing user tags

      Explicit tag array:
        replace user tags
    =====================================================*/

    const effectiveUserTags =
      hasTagsField
        ? parsedTags.tags ||
          []
        : existingDesign
          ? getUserTagsFromStoredTags(
              existingDesign.tags,
            )
          : parsedTags.tags ||
            [];

    /*
     * Rebuild internal tags so a changed format cannot
     * leave an obsolete format-* tag behind.
     */
    const effectiveStoredTags =
      buildStoredTags({
        userTags:
          effectiveUserTags,

        creatorFormat:
          effectiveCreatorFormat,

        fashionEditorShare:
          isFashionEditorShare,
      });

    /*=====================================================
      Create / Update Design
    =====================================================*/

    let designResult;

    if (existingDesign) {
      /*
       * Existing Fashion Editor publication.
       *
       * Presence booleans ensure omitted optional
       * metadata is preserved.
       *
       * Explicit empty values can still clear fields.
       */
      designResult =
        await client.query(
          `
            UPDATE designs

            SET
              title =
                CASE
                  WHEN $1::boolean
                    THEN $2
                  ELSE title
                END,

              description =
                CASE
                  WHEN $3::boolean
                    THEN $4
                  ELSE description
                END,

              /*
               * Fashion Editor project_data is always
               * authoritative and should update.
               */
              canvas_state =
                $5::jsonb,

              style_category =
                CASE
                  WHEN $6::boolean
                    THEN $7
                  ELSE style_category
                END,

              /*
               * Tags are rebuilt from:
               *
               * preserved/submitted user tags
               * +
               * current server-controlled tags.
               */
              tags =
                $8::text[],

              product_type =
                CASE
                  WHEN $9::boolean
                    THEN $10
                  ELSE product_type
                END,

              category_id =
                CASE
                  WHEN $11::boolean
                    THEN $12
                  ELSE category_id
                END,

              watermarked_preview_url =
                COALESCE(
                  $13,
                  watermarked_preview_url
                ),

              high_res_file_url =
                NULL,

              /*
               * Already resolved above.
               *
               * If visibility was omitted on an existing
               * publication this contains its previous
               * is_public value.
               */
              is_public =
                $14,

              /*
               * Private means owner-only visibility,
               * not an unpublished draft.
               */
              is_published =
                TRUE,

              source_type =
                'fashion_editor',

              editor_project_id =
                $15,

              is_editable =
                TRUE,

              allow_remix =
                $16,

              original_design_id =
                $17,

              updated_at =
                NOW()

            WHERE id = $18
              AND owner_id = $19

            RETURNING
              id,
              owner_id,
              title,
              slug,
              description,
              canvas_state,
              style_category,
              tags,
              product_type,
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
            /*
             * $1
             */
            hasTitleField,

            /*
             * $2
             *
             * Explicit blank -> NULL.
             */
            title,

            /*
             * $3
             */
            hasDescriptionField,

            /*
             * $4
             */
            description,

            /*
             * $5
             */
            JSON.stringify(
              resolvedCanvasState,
            ),

            /*
             * $6
             *
             * Discovery terms supplied?
             */
            hasShowcaseTermsField,

            /*
             * $7
             *
             * Derived validated style.
             */
            submittedStyleCategory,

            /*
             * $8
             */
            effectiveStoredTags,

            /*
             * $9
             *
             * Format supplied?
             */
            hasFormatField,

            /*
             * $10
             *
             * Explicit blank can clear to NULL.
             */
            storedProductType,

            /*
             * $11
             *
             * Category supplied?
             */
            hasCategoryField,

            /*
             * $12
             */
            category?.id ||
              null,

            /*
             * $13
             */
            resolvedPreviewUrl,

            /*
             * $14
             *
             * Explicit visibility OR preserved value.
             */
            effectiveIsPublic,

            /*
             * $15
             */
            editorProjectId,

            /*
             * $16
             *
             * Explicit remix setting OR preserved value.
             */
            effectiveAllowRemix,

            /*
             * $17
             */
            originalDesignId,

            /*
             * $18
             */
            existingDesign.id,

            /*
             * $19
             *
             * Ownership defense.
             */
            creatorId,
          ],
        );

      /*
       * IMPORTANT:
       *
       * Only replace discovery relationships when the
       * client actually supplied showcase_term_ids.
       *
       * Omitted:
       *   preserve existing discovery relationships
       *
       * Explicit []:
       *   clear them
       *
       * Explicit IDs:
       *   replace them
       */
      if (
        hasShowcaseTermsField
      ) {
        await client.query(
          `
            DELETE FROM
              design_showcase_terms

            WHERE design_id = $1
          `,
          [
            existingDesign.id,
          ],
        );
      }
    } else {
      /*-------------------------------------------------
        New Manual Upload / New Fashion Editor Publication
      -------------------------------------------------*/

      designResult =
        await client.query(
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
              $14,
              TRUE,
              $15,
              $16,
              $17,
              $18,
              $19,
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
              product_type,
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
            /*
             * $1
             */
            creatorId,

            /*
             * $2
             */
            title,

            /*
             * $3
             */
            internalAssetCode,

            /*
             * $4
             */
            slug,

            /*
             * $5
             */
            description,

            /*
             * $6
             *
             * Legacy schema compatibility only.
             */
            LEGACY_BASE_PRICE,

            /*
             * $7
             */
            JSON.stringify(
              resolvedCanvasState,
            ),

            /*
             * $8
             */
            submittedStyleCategory,

            /*
             * $9
             */
            effectiveStoredTags,

            /*
             * $10
             */
            storedProductType,

            /*
             * $11
             *
             * Legacy DB compatibility only.
             */
            LEGACY_LICENSE_TYPE,

            /*
             * $12
             */
            category?.id ||
              null,

            /*
             * $13
             */
            resolvedPreviewUrl,

            /*
             * $14
             *
             * New manual upload:
             * default private.
             *
             * New Fashion Editor share:
             * default public.
             *
             * Explicit visibility:
             * respected.
             */
            effectiveIsPublic,

            /*
             * $15
             */
            isFashionEditorShare
              ? "fashion_editor"
              : "upload",

            /*
             * $16
             */
            isFashionEditorShare
              ? editorProjectId
              : null,

            /*
             * $17
             */
            isFashionEditorShare,

            /*
             * $18
             */
            effectiveAllowRemix,

            /*
             * $19
             */
            isFashionEditorShare
              ? originalDesignId
              : null,
          ],
        );
    }

    const design =
      designResult.rows[0];

    /*=====================================================
      Showcase Discovery Relationships
    =====================================================*/

    /*
     * New design:
     *   insert supplied terms.
     *
     * Existing design + supplied terms:
     *   old terms were deleted above, insert replacements.
     *
     * Existing design + omitted terms:
     *   do nothing, preserving previous relationships.
     */
    if (
      showcaseTermIds.length >
        0 &&
      (
        !existingDesign ||
        hasShowcaseTermsField
      )
    ) {
      await client.query(
        `
          INSERT INTO
            design_showcase_terms (
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
        [
          design.id,
          showcaseTermIds,
        ],
      );
    }

    /*=====================================================
      Keep Fashion Editor Preview Current
    =====================================================*/

    if (
      isFashionEditorShare &&
      resolvedPreviewUrl
    ) {
      await client.query(
        `
          UPDATE editor_projects

          SET
            preview_url = $1,
            updated_at = NOW()

          WHERE id = $2
            AND owner_id = $3
        `,
        [
          resolvedPreviewUrl,
          editorProjectId,
          creatorId,
        ],
      );
    }

    /*=====================================================
      Resolve Final Effective Category

      Response must represent what is actually stored,
      including preserved existing metadata.
    =====================================================*/

    let finalCategory =
      null;

    if (
      design.category_id
    ) {
      const finalCategoryResult =
        await client.query(
          `
            SELECT
              id,
              name,
              slug,
              description

            FROM design_categories

            WHERE id = $1

            LIMIT 1
          `,
          [
            design.category_id,
          ],
        );

      finalCategory =
        finalCategoryResult
          .rows[0] ||
        null;
    }

    /*=====================================================
      Resolve Final Effective Discovery Terms
    =====================================================*/

    const finalDiscoveryResult =
      await client.query(
        `
          SELECT
            sdt.id,
            sdt.group_type,
            sdt.name,
            sdt.slug,
            sdt.search_term,
            sdt.emoji,
            sdt.description,
            sdt.sort_order

          FROM design_showcase_terms dst

          INNER JOIN showcase_discovery_terms sdt
            ON sdt.id =
              dst.term_id

          WHERE dst.design_id = $1
            AND sdt.is_active = TRUE

          ORDER BY
            CASE sdt.group_type
              WHEN 'style' THEN 1
              WHEN 'garment' THEN 2
              WHEN 'occasion' THEN 3
              ELSE 4
            END,
            sdt.sort_order ASC,
            sdt.name ASC
        `,
        [
          design.id,
        ],
      );

    const finalDiscoveryRows =
      finalDiscoveryResult.rows;

    const finalStyleTerm =
      finalDiscoveryRows.find(
        (row) =>
          row.group_type ===
          "style",
      ) || null;

    const finalGarmentTerm =
      finalDiscoveryRows.find(
        (row) =>
          row.group_type ===
          "garment",
      ) || null;

    const finalOccasionTerms =
      finalDiscoveryRows.filter(
        (row) =>
          row.group_type ===
          "occasion",
      );

    const finalShowcaseTermIds =
      finalDiscoveryRows.map(
        (row) => row.id,
      );

    /*=====================================================
      Resolve Final Format / User Tags
    =====================================================*/

    const finalFormat =
      design.product_type
        ? PRODUCT_TYPE_TO_FORMAT[
            String(
              design.product_type,
            )
          ] || null
        : null;

    const finalUserTags =
      getUserTagsFromStoredTags(
        design.tags,
      );

    /*=====================================================
      Commit
    =====================================================*/

    await client.query(
      "COMMIT",
    );

    transactionActive =
      false;

    /*=====================================================
      Success
    =====================================================*/

    return res
      .status(
        existingDesign
          ? 200
          : 201,
      )
      .json({
        status:
          "success",

        message:
          isFashionEditorShare
            ? design.is_public
              ? existingDesign
                ? "Fashion Editor Showcase item updated successfully."
                : "Fashion Editor project shared to the Creator Showcase successfully."
              : existingDesign
                ? "Fashion Editor item updated and kept private successfully."
                : "Fashion Editor item saved privately successfully."
            : design.is_public
              ? "Creator Studio asset published to the Showcase successfully."
              : "Private Creator Studio asset saved successfully.",

        data: {
          id:
            design.id,

          owner_id:
            design.owner_id,

          title:
            design.title ||
            null,

          slug:
            design.slug,

          description:
            design.description ||
            null,

          preview_url:
            design
              .watermarked_preview_url ||
            null,

          style_category:
            design
              .style_category ||
            null,

          /*
           * Always return the effective stored
           * Creator-facing format.
           */
          format:
            finalFormat,

          category:
            finalCategory
              ? {
                  id:
                    finalCategory.id,

                  name:
                    finalCategory.name,

                  slug:
                    finalCategory.slug,

                  description:
                    finalCategory
                      .description ||
                    null,
                }
              : null,

          showcase_discovery:
            {
              style:
                finalStyleTerm
                  ? serializeDiscoveryTerm(
                      finalStyleTerm,
                    )
                  : null,

              garment:
                finalGarmentTerm
                  ? serializeDiscoveryTerm(
                      finalGarmentTerm,
                    )
                  : null,

              occasions:
                finalOccasionTerms.map(
                  serializeDiscoveryTerm,
                ),
            },

          showcase_term_ids:
            finalShowcaseTermIds,

          /*
           * Server-only internal tags stay hidden.
           */
          tags:
            finalUserTags,

          canvas_state:
            design.canvas_state,

          visibility:
            design.is_public
              ? "public"
              : "private",

          is_public:
            design.is_public,

          is_published:
            design.is_published,

          source_type:
            design.source_type,

          editor_project_id:
            design
              .editor_project_id,

          is_editable:
            design.is_editable,

          allow_remix:
            design.allow_remix,

          original_design_id:
            design
              .original_design_id,

          created_at:
            design.created_at,

          updated_at:
            design.updated_at,
        },
      });
  } catch (error) {
    /*=====================================================
      Rollback
    =====================================================*/

    if (
      client &&
      transactionActive
    ) {
      try {
        await client.query(
          "ROLLBACK",
        );

        transactionActive =
          false;
      } catch (
        rollbackError
      ) {
        console.error(
          "Creator Studio rollback failed:",
          rollbackError,
        );
      }
    }

    console.error(
      "Creator Studio asset save failed:",
      error,
    );

    /*=====================================================
      PostgreSQL Errors
    =====================================================*/

    if (
      error.code ===
      "23505"
    ) {
      return sendError(
        res,
        409,
        "The asset could not be assigned a unique identifier. Please try again.",
        "ASSET_CONFLICT",
      );
    }

    if (
      error.code ===
      "23503"
    ) {
      return sendError(
        res,
        400,
        "One or more selected creative classifications are no longer available.",
        "ASSET_REFERENCE_UNAVAILABLE",
      );
    }

    if (
      error.code ===
      "22P02"
    ) {
      return sendError(
        res,
        400,
        "One or more asset values are incompatible with the current database configuration.",
        "INVALID_DATABASE_VALUE",
      );
    }

    if (
      error.code ===
      "23514"
    ) {
      return sendError(
        res,
        400,
        "One or more asset values violate a database constraint.",
        "DATABASE_CONSTRAINT_FAILED",
      );
    }

    if (
      error.code ===
      "23502"
    ) {
      return sendError(
        res,
        500,
        "The database schema still requires a Creator Studio field that is now optional.",
        "OPTIONAL_FIELD_SCHEMA_MISMATCH",
      );
    }

    return sendError(
      res,
      500,
      "The Creator Studio asset could not be saved.",
      "CREATOR_STUDIO_SAVE_FAILED",
    );
  } finally {
    /*=====================================================
      Release Connection
    =====================================================*/

    if (client) {
      client.release();
    }
  }
};

exports.updateCreatorStudioAssetVisibility = async (req, res) => {
  /*=====================================================
    Authentication
  =====================================================*/

  const creatorId = getAuthenticatedCreatorId(req);

  if (!creatorId) {
    return sendError(
      res,
      401,
      "Authentication is required.",
      "AUTHENTICATION_REQUIRED",
    );
  }

  /*
   * authorize("creator") must also remain applied
   * in creatorRoutes.js.
   *
   * This controller check is defense-in-depth.
   */
  if (normalizeToken(req?.user?.role) !== "creator") {
    return sendError(
      res,
      403,
      "Only Creator accounts can change asset visibility.",
      "CREATOR_REQUIRED",
    );
  }

  /*=====================================================
    Request Body Security
  =====================================================*/

  /*
   * This endpoint accepts exactly one user-controlled
   * property:
   *
   * visibility
   *
   * Never allow clients to directly set:
   *
   * is_public
   * is_published
   * owner_id
   * source_type
   * allow_remix
   * editor_project_id
   * etc.
   */
  const ALLOWED_BODY_FIELDS = new Set(["visibility"]);

  for (const fieldName of Object.keys(req.body || {})) {
    if (!ALLOWED_BODY_FIELDS.has(fieldName)) {
      return sendError(
        res,
        400,
        `Unsupported visibility field: ${fieldName}.`,
        "UNSUPPORTED_VISIBILITY_FIELD",
      );
    }
  }

  /*=====================================================
    Validate Design ID
  =====================================================*/

  const designId = cleanText(req.params?.designId, 100);

  if (!designId || !isUuid(designId)) {
    return sendError(
      res,
      400,
      "A valid Creator asset ID is required.",
      "INVALID_DESIGN_ID",
    );
  }

  /*=====================================================
    Validate Visibility
  =====================================================*/

  const rawVisibility = req.body?.visibility;

  if (
    rawVisibility === undefined ||
    rawVisibility === null ||
    typeof rawVisibility !== "string"
  ) {
    return sendError(
      res,
      400,
      "Visibility must be private or public.",
      "INVALID_VISIBILITY",
    );
  }

  const visibility = normalizeToken(rawVisibility);

  const ALLOWED_VISIBILITY = new Set(["private", "public"]);

  if (!ALLOWED_VISIBILITY.has(visibility)) {
    return sendError(
      res,
      400,
      "Visibility must be private or public.",
      "INVALID_VISIBILITY",
    );
  }

  /*
   * Browser never decides the raw DB flag.
   *
   * Server maps:
   *
   * private -> FALSE
   * public  -> TRUE
   */
  const isPublic = visibility === "public";

  /*=====================================================
    Update Owner-Owned Asset
  =====================================================*/

  try {
    /*
     * SECURITY:
     *
     * The authenticated Creator ID is included in
     * the WHERE clause.
     *
     * This means guessing another design UUID cannot
     * change another Creator's asset.
     *
     * We intentionally return the same 404 whether:
     *
     * - the design does not exist
     * - the design belongs to somebody else
     * - the design is not an eligible Creator asset
     *
     * This avoids leaking private asset existence.
     */

    const result = await db.query(
      `
          UPDATE designs

          SET
            is_public = $1,
            updated_at = NOW()

          WHERE id = $2
            AND owner_id = $3
            AND is_published = TRUE
            AND source_type IN (
              'upload',
              'fashion_editor'
            )

          RETURNING
            id,
            owner_id,
            title,
            slug,
            description,
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
      [isPublic, designId, creatorId],
    );

    /*===================================================
      Not Found / Not Owner
    ===================================================*/

    if (result.rows.length === 0) {
      return sendError(
        res,
        404,
        "Creator asset not found.",
        "CREATOR_ASSET_NOT_FOUND",
      );
    }

    const design = result.rows[0];

    /*===================================================
      Success
    ===================================================*/

    return res.status(200).json({
      status: "success",

      message: design.is_public
        ? "Asset is now public and can appear in the Showcase."
        : "Asset is now private and hidden from the public Showcase.",

      data: {
        id: design.id,

        owner_id: design.owner_id,

        title: design.title || null,

        slug: design.slug,

        description: design.description || null,

        preview_url: design.watermarked_preview_url || null,

        /*
         * Friendly frontend state.
         */
        visibility: design.is_public ? "public" : "private",

        /*
         * Keep existing API compatibility.
         */
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
    console.error("Creator asset visibility update failed:", error);

    /*===================================================
      PostgreSQL Error Mapping
    ===================================================*/

    if (error.code === "22P02") {
      return sendError(
        res,
        400,
        "The Creator asset identifier is invalid.",
        "INVALID_DESIGN_ID",
      );
    }

    if (error.code === "23514") {
      return sendError(
        res,
        400,
        "The requested visibility change violates a database constraint.",
        "VISIBILITY_CONSTRAINT_FAILED",
      );
    }

    return sendError(
      res,
      500,
      "The asset visibility could not be updated.",
      "VISIBILITY_UPDATE_FAILED",
    );
  }
};

exports.getMyCreatorStudioAssets = async (req, res) => {
  /*=====================================================
    Authentication
  =====================================================*/

  const creatorId =
    getAuthenticatedCreatorId(req);

  if (!creatorId) {
    return sendError(
      res,
      401,
      "Authentication is required.",
      "AUTHENTICATION_REQUIRED",
    );
  }

  /*
   * authorize("creator") should also remain applied
   * globally in creatorRoutes.js.
   *
   * This is defense-in-depth.
   */
  if (
    normalizeToken(
      req?.user?.role,
    ) !== "creator"
  ) {
    return sendError(
      res,
      403,
      "Only Creator accounts can access Creator Studio assets.",
      "CREATOR_REQUIRED",
    );
  }

  /*=====================================================
    Pagination
  =====================================================*/

  const DEFAULT_PAGE = 1;
  const DEFAULT_LIMIT = 12;
  const MAX_LIMIT = 48;

  const parsePositiveInteger = (
    value,
    fallback,
  ) => {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return fallback;
    }

    const parsed =
      Number.parseInt(
        String(value),
        10,
      );

    if (
      !Number.isInteger(
        parsed,
      ) ||
      parsed < 1
    ) {
      return null;
    }

    return parsed;
  };

  const page =
    parsePositiveInteger(
      req.query?.page,
      DEFAULT_PAGE,
    );

  const requestedLimit =
    parsePositiveInteger(
      req.query?.limit,
      DEFAULT_LIMIT,
    );

  if (page === null) {
    return sendError(
      res,
      400,
      "Page must be a positive integer.",
      "INVALID_PAGE",
    );
  }

  if (
    requestedLimit === null
  ) {
    return sendError(
      res,
      400,
      "Limit must be a positive integer.",
      "INVALID_LIMIT",
    );
  }

  const limit =
    Math.min(
      requestedLimit,
      MAX_LIMIT,
    );

  const offset =
    (page - 1) *
    limit;

  /*=====================================================
    Filters
  =====================================================*/

  /*
   * Supported:
   *
   * visibility=all
   * visibility=public
   * visibility=private
   *
   * source=all
   * source=upload
   * source=fashion_editor
   */

  const visibility =
    normalizeToken(
      req.query
        ?.visibility ||
        "all",
    );

  const source =
    normalizeToken(
      req.query?.source ||
        "all",
    );

  const ALLOWED_VISIBILITY_FILTERS =
    new Set([
      "all",
      "public",
      "private",
    ]);

  const ALLOWED_SOURCE_FILTERS =
    new Set([
      "all",
      "upload",
      "fashion_editor",
    ]);

  if (
    !ALLOWED_VISIBILITY_FILTERS.has(
      visibility,
    )
  ) {
    return sendError(
      res,
      400,
      "Visibility filter must be all, public, or private.",
      "INVALID_VISIBILITY_FILTER",
    );
  }

  if (
    !ALLOWED_SOURCE_FILTERS.has(
      source,
    )
  ) {
    return sendError(
      res,
      400,
      "Source filter must be all, upload, or fashion_editor.",
      "INVALID_SOURCE_FILTER",
    );
  }

  /*=====================================================
    Build Secure Owner Query
  =====================================================*/

  /*
   * IMPORTANT:
   *
   * This is an authenticated OWNER endpoint.
   *
   * Therefore we intentionally DO NOT require:
   *
   * d.is_public = TRUE
   *
   * The Creator must be able to see both:
   *
   * Public
   * Private
   *
   * But every returned asset must belong to:
   *
   * d.owner_id = authenticated Creator ID
   */

  const params = [
    creatorId,
  ];

  let whereSql = `
    d.owner_id = $1
    AND d.is_published = TRUE
    AND d.source_type IN (
      'upload',
      'fashion_editor'
    )
  `;

  /*---------------------------------------------------
    Visibility Filter
  ---------------------------------------------------*/

  if (
    visibility ===
    "public"
  ) {
    whereSql += `
      AND d.is_public = TRUE
    `;
  } else if (
    visibility ===
    "private"
  ) {
    whereSql += `
      AND d.is_public = FALSE
    `;
  }

  /*---------------------------------------------------
    Source Filter
  ---------------------------------------------------*/

  if (
    source !== "all"
  ) {
    params.push(source);

    whereSql += `
      AND d.source_type = $${params.length}
    `;
  }

  const countParams = [
    ...params,
  ];

  const dataParams = [
    ...params,
  ];

  dataParams.push(
    limit,
  );

  const limitIndex =
    dataParams.length;

  dataParams.push(
    offset,
  );

  const offsetIndex =
    dataParams.length;

  /*=====================================================
    Response Helpers
  =====================================================*/

  /*
   * PostgreSQL enum
   *        ↓
   * Creator-facing format
   */
  const PRODUCT_TYPE_TO_FORMAT =
    Object.freeze({
      sketch:
        "sketch",

      tech_pack:
        "tech_pack",

      "3d_model":
        "3d_garment",
    });

  /*---------------------------------------------------
    Remove Internal Tags
  ---------------------------------------------------*/

  const getUserTags = (
    storedTags,
  ) => {
    if (
      !Array.isArray(
        storedTags,
      )
    ) {
      return [];
    }

    const result = [];

    const seen =
      new Set();

    for (
      const rawTag of
      storedTags
    ) {
      const tag =
        normalizeTag(
          rawTag,
        );

      if (!tag) {
        continue;
      }

      /*
       * These are server-controlled implementation tags.
       *
       * Do not expose them as user tags.
       */
      if (
        tag ===
          "creator-studio" ||
        tag ===
          "fashion-editor" ||
        tag.startsWith(
          "format-",
        )
      ) {
        continue;
      }

      if (
        seen.has(tag)
      ) {
        continue;
      }

      seen.add(tag);

      result.push(tag);

      if (
        result.length >=
        MAX_TAGS
      ) {
        break;
      }
    }

    return result;
  };

  /*---------------------------------------------------
    Normalize Discovery Terms
  ---------------------------------------------------*/

  const normalizeShowcaseTerms =
    (value) => {
      if (
        !Array.isArray(
          value,
        )
      ) {
        return [];
      }

      return value
        .filter(
          (term) =>
            term &&
            typeof term ===
              "object" &&
            term.id &&
            term.group_type &&
            term.name,
        )
        .map(
          (term) => ({
            id:
              term.id,

            group_type:
              term.group_type,

            name:
              term.name,

            slug:
              term.slug ||
              null,

            search_term:
              term.search_term ||
              null,

            emoji:
              term.emoji ||
              null,

            description:
              term.description ||
              null,

            sort_order:
              Number(
                term.sort_order ||
                  0,
              ),
          }),
        );
    };

  /*=====================================================
    Execute Queries
  =====================================================*/

  try {
    /*
     * Three queries are independent:
     *
     * 1. paginated assets
     * 2. filtered total
     * 3. all/public/private counts
     */
    const [
      dataResult,
      filteredCountResult,
      visibilityCountResult,
    ] = await Promise.all([
      /*-------------------------------------------------
        Asset List
      -------------------------------------------------*/

      db.query(
        `
          SELECT
            d.id,
            d.owner_id,
            d.title,
            d.slug,
            d.description,
            d.watermarked_preview_url,
            d.style_category,
            d.tags,
            d.product_type,
            d.category_id,
            d.is_public,
            d.is_published,
            d.source_type,
            d.editor_project_id,
            d.is_editable,
            d.allow_remix,
            d.original_design_id,
            d.created_at,
            d.updated_at,

            dc.name
              AS category_name,

            dc.slug
              AS category_slug,

            dc.description
              AS category_description,

            COALESCE(
              (
                SELECT
                  jsonb_agg(
                    jsonb_build_object(
                      'id',
                      sdt.id,

                      'group_type',
                      sdt.group_type,

                      'name',
                      sdt.name,

                      'slug',
                      sdt.slug,

                      'search_term',
                      sdt.search_term,

                      'emoji',
                      sdt.emoji,

                      'description',
                      sdt.description,

                      'sort_order',
                      sdt.sort_order
                    )

                    ORDER BY
                      CASE
                        sdt.group_type

                        WHEN 'style'
                          THEN 1

                        WHEN 'garment'
                          THEN 2

                        WHEN 'occasion'
                          THEN 3

                        ELSE 4
                      END,

                      sdt.sort_order ASC,
                      sdt.name ASC
                  )

                FROM design_showcase_terms dst

                INNER JOIN
                  showcase_discovery_terms sdt

                  ON sdt.id =
                    dst.term_id

                WHERE
                  dst.design_id =
                    d.id

                  AND sdt.is_active =
                    TRUE
              ),

              '[]'::jsonb
            ) AS showcase_terms

          FROM designs d

          LEFT JOIN design_categories dc
            ON dc.id =
              d.category_id

          WHERE
            ${whereSql}

          ORDER BY
            d.updated_at DESC,
            d.id DESC

          LIMIT
            $${limitIndex}

          OFFSET
            $${offsetIndex}
        `,
        dataParams,
      ),

      /*-------------------------------------------------
        Filtered Count
      -------------------------------------------------*/

      db.query(
        `
          SELECT
            COUNT(*)::integer
              AS total

          FROM designs d

          WHERE
            ${whereSql}
        `,
        countParams,
      ),

      /*-------------------------------------------------
        Visibility Counts

        This intentionally ignores current visibility
        filtering so profile tabs always know:

        All
        Public
        Private
      -------------------------------------------------*/

      db.query(
        `
          SELECT
            COUNT(*)::integer
              AS total,

            COUNT(*) FILTER (
              WHERE
                d.is_public =
                  TRUE
            )::integer
              AS public,

            COUNT(*) FILTER (
              WHERE
                d.is_public =
                  FALSE
            )::integer
              AS private

          FROM designs d

          WHERE
            d.owner_id = $1

            AND d.is_published =
              TRUE

            AND d.source_type IN (
              'upload',
              'fashion_editor'
            )
        `,
        [
          creatorId,
        ],
      ),
    ]);

    /*===================================================
      Serialize Assets
    ===================================================*/

    const assets =
      dataResult.rows.map(
        (row) => {
          const showcaseTerms =
            normalizeShowcaseTerms(
              row.showcase_terms,
            );

          const styleTerm =
            showcaseTerms.find(
              (term) =>
                term.group_type ===
                "style",
            ) || null;

          const garmentTerm =
            showcaseTerms.find(
              (term) =>
                term.group_type ===
                "garment",
            ) || null;

          const occasionTerms =
            showcaseTerms.filter(
              (term) =>
                term.group_type ===
                "occasion",
            );

          const format =
            row.product_type
              ? PRODUCT_TYPE_TO_FORMAT[
                  String(
                    row.product_type,
                  )
                ] || null
              : null;

          return {
            id:
              row.id,

            owner_id:
              row.owner_id,

            title:
              row.title ||
              null,

            slug:
              row.slug,

            description:
              row.description ||
              null,

            preview_url:
              row
                .watermarked_preview_url ||
              null,

            style_category:
              row
                .style_category ||
              null,

            format,

            category:
              row.category_id
                ? {
                    id:
                      row.category_id,

                    name:
                      row.category_name ||
                      null,

                    slug:
                      row.category_slug ||
                      null,

                    description:
                      row
                        .category_description ||
                      null,
                  }
                : null,

            showcase_discovery:
              {
                style:
                  styleTerm,

                garment:
                  garmentTerm,

                occasions:
                  occasionTerms,
              },

            showcase_term_ids:
              showcaseTerms.map(
                (term) =>
                  term.id,
              ),

            /*
             * Only Creator-supplied tags.
             */
            tags:
              getUserTags(
                row.tags,
              ),

            /*
             * Friendly frontend property.
             */
            visibility:
              row.is_public
                ? "public"
                : "private",

            /*
             * Keep raw flags for compatibility.
             */
            is_public:
              row.is_public,

            is_published:
              row.is_published,

            source_type:
              row.source_type,

            /*
             * This is an authenticated owner-only
             * endpoint.
             *
             * editor_project_id is useful so a
             * Fashion Editor creation can link
             * back to the owner's project.
             */
            editor_project_id:
              row
                .editor_project_id,

            is_editable:
              Boolean(
                row.is_editable,
              ),

            allow_remix:
              Boolean(
                row.allow_remix,
              ),

            original_design_id:
              row
                .original_design_id ||
              null,

            created_at:
              row.created_at,

            updated_at:
              row.updated_at,
          };
        },
      );

    /*===================================================
      Pagination
    ===================================================*/

    const filteredTotal =
      Number(
        filteredCountResult
          .rows[0]?.total ||
          0,
      );

    const visibilityCounts =
      visibilityCountResult
        .rows[0] || {
        total: 0,
        public: 0,
        private: 0,
      };

    const totalPages =
      filteredTotal > 0
        ? Math.ceil(
            filteredTotal /
              limit,
          )
        : 0;

    /*===================================================
      Success
    ===================================================*/

    return res
      .status(200)
      .json({
        status:
          "success",

        results:
          assets.length,

        data:
          assets,

        counts: {
          all:
            Number(
              visibilityCounts
                .total ||
                0,
            ),

          public:
            Number(
              visibilityCounts
                .public ||
                0,
            ),

          private:
            Number(
              visibilityCounts
                .private ||
                0,
            ),
        },

        filters: {
          visibility,
          source,
        },

        pagination: {
          page,

          limit,

          total:
            filteredTotal,

          total_pages:
            totalPages,

          has_more:
            page <
            totalPages,
        },
      });
  } catch (error) {
    console.error(
      "Creator Studio owner asset list failed:",
      error,
    );

    return sendError(
      res,
      500,
      "Creator Studio assets could not be loaded.",
      "CREATOR_STUDIO_ASSETS_LOAD_FAILED",
    );
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
