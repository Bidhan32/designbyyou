"use strict";

/**
 * =========================================================
 * DesignByYou / FashionVision
 * Creator Routes
 * Version 5.2
 * =========================================================
 *
 * Creator routes are NOT ecommerce/marketplace routes.
 *
 * =========================================================
 * CREATOR STUDIO ENDPOINTS
 * =========================================================
 *
 * GET
 * /api/v1/creators/studio/categories
 *
 * POST
 * /api/v1/creators/studio/upload
 *
 * =========================================================
 * CREATOR FASHION EDITOR ENDPOINTS
 * =========================================================
 *
 * GET
 * /api/v1/creators/editor-projects
 *
 * POST
 * /api/v1/creators/editor-projects
 *
 * GET
 * /api/v1/creators/editor-projects/:projectId
 *
 * PUT
 * /api/v1/creators/editor-projects/:projectId
 *
 * POST
 * /api/v1/creators/editor-projects/:projectId/share
 *
 * POST
 * /api/v1/creators/showcase/:designId/remix
 *
 * =========================================================
 * FASHION EDITOR / SHOWCASE FLOW
 * =========================================================
 *
 * PRIVATE EDITOR PROJECT
 *
 * FashionEditor
 *      ↓
 * editor_projects
 *
 * Saving an editor project does NOT automatically publish
 * it to the Creator Showcase.
 *
 * ---------------------------------------------------------
 * SHARE TO SHOWCASE
 * ---------------------------------------------------------
 *
 * POST
 * /editor-projects/:projectId/share
 *
 * The authenticated Creator may publish an editor project
 * that they own.
 *
 * The controller validates:
 *
 * editor_projects.owner_id
 * =
 * authenticated Creator ID
 *
 * A successful Fashion Editor publication uses:
 *
 * source_type        = fashion_editor
 * editor_project_id  = project ID
 * is_editable        = TRUE
 * allow_remix        = Creator choice
 *
 * The full editable project state remains stored in:
 *
 * editor_projects.project_data
 *
 * The Showcase design stores the corresponding editable
 * canvas state for presentation/compatibility.
 *
 * ---------------------------------------------------------
 * REMIX / REDESIGN
 * ---------------------------------------------------------
 *
 * POST
 * /showcase/:designId/remix
 *
 * A remix:
 *
 * - requires a published/public Creator Showcase design
 * - requires source_type = fashion_editor
 * - requires is_editable = TRUE
 * - requires allow_remix = TRUE
 * - NEVER modifies the original project
 * - NEVER changes ownership of the original
 *
 * Instead, the controller creates a completely new private:
 *
 * editor_projects
 *
 * row owned by the authenticated Creator.
 *
 * The new project records:
 *
 * source_project_id = source editor project ID
 *
 * The Creator can then open that new project in the
 * Fashion Editor, redesign it, save it independently, and
 * optionally publish their remix later.
 *
 * =========================================================
 * SECURITY MODEL
 * =========================================================
 *
 * Every route in this file requires:
 *
 * 1. valid authenticated session
 * 2. Creator role
 *
 * Creator accounts do NOT require admin approval.
 *
 * Creator Studio uploads, Fashion Editor project CRUD,
 * Showcase sharing, and remix creation are not sensitive
 * financial actions.
 *
 * Therefore these routes do NOT use:
 *
 * - requireApprovedAccount
 * - payout middleware
 * - withdrawal middleware
 * - deposit middleware
 *
 * =========================================================
 * CATEGORY MODEL
 * =========================================================
 *
 * GET
 * /studio/categories
 *
 * returns active rows from:
 *
 * design_categories
 *
 * Creator Studio publishing sends:
 *
 * category_id
 *
 * which is validated and stored as:
 *
 * designs.category_id
 *
 * =========================================================
 * SHOWCASE DISCOVERY MODEL
 * =========================================================
 *
 * The frontend obtains discovery options from:
 *
 * GET
 * /api/v1/creator-showcase/discovery
 *
 * Creator Studio publishing submits:
 *
 * showcase_term_ids
 *
 * containing database UUIDs representing:
 *
 * - exactly one Style
 * - exactly one Garment
 * - zero or more Occasions
 *
 * The Creator Controller validates those values and stores
 * relationships in:
 *
 * design_showcase_terms
 *
 * =========================================================
 * NORMAL CREATOR STUDIO UPLOAD
 * =========================================================
 *
 * POST
 * /api/v1/creators/studio/upload
 *
 * Multipart field:
 *
 * preview
 *
 * Creative metadata:
 *
 * title
 * description
 * style_category
 * format
 * category_id
 * showcase_term_ids
 * tags
 * canvas_state
 *
 * Normal Creator Studio uploads are not automatically
 * editable/remixable Fashion Editor projects.
 *
 * They are stored conceptually as:
 *
 * source_type        = upload
 * editor_project_id  = NULL
 * is_editable        = FALSE
 * allow_remix        = FALSE
 *
 * IMPORTANT:
 *
 * style_category is retained for frontend/database
 * compatibility, but the controller derives the
 * authoritative stored style from the validated Showcase
 * Style term.
 *
 * =========================================================
 * FASHION EDITOR SHARE MODEL
 * =========================================================
 *
 * POST
 * /api/v1/creators/editor-projects/:projectId/share
 *
 * Multipart:
 *
 * preview
 * title
 * description
 * format
 * category_id
 * showcase_term_ids
 * tags
 * allow_remix
 *
 * The controller loads project_data from the authenticated
 * Creator's editor_projects row.
 *
 * Browser supplied canvas data is therefore not trusted as
 * the source of the editable Fashion Editor project.
 *
 * Sharing the same project again updates its existing
 * Fashion Editor-backed Showcase design instead of creating
 * duplicate published records.
 *
 * =========================================================
 * FASHION EDITOR PROJECT MODEL
 * =========================================================
 *
 * Fashion Editor projects are editable Creator-owned cloud
 * documents stored in:
 *
 * editor_projects
 *
 * Creating or saving an editor project does NOT:
 *
 * - publish it
 * - create a Marketplace listing
 * - create a sale
 * - create a booking
 * - expose pricing
 *
 * Supported operations:
 *
 * - list projects
 * - create project
 * - load project
 * - update project
 * - share project to Creator Showcase
 * - remix an eligible Showcase design into a new project
 *
 * =========================================================
 * VISIBILITY
 * =========================================================
 *
 * Creator Studio Showcase assets are published as:
 *
 * is_public    = TRUE
 * is_published = TRUE
 *
 * These values mean Showcase visibility/readiness only.
 *
 * They do NOT mean:
 *
 * - sale
 * - ecommerce listing
 * - purchasable product
 * - licensing offer
 *
 * Fashion Editor projects themselves remain private until
 * explicitly shared to the Showcase.
 *
 * =========================================================
 * UPLOAD MIDDLEWARE
 * =========================================================
 *
 * Creator Studio image field:
 *
 * preview
 *
 * Middleware:
 *
 * uploadPreview.single("preview")
 *
 * Used by:
 *
 * POST /studio/upload
 *
 * and:
 *
 * POST /editor-projects/:projectId/share
 *
 * Expected protections include:
 *
 * - image-only
 * - JPG / PNG / WEBP
 * - max configured upload size
 * - Cloudinary-backed storage
 *
 * Fashion Editor CRUD and remix creation use JSON requests
 * and do not require upload middleware.
 *
 * =========================================================
 * IMPORTANT
 * =========================================================
 *
 * There is intentionally NO:
 *
 * /marketplace/upload
 *
 * route.
 *
 * Creator Showcase remains a creative discovery/showcase
 * system, not an ecommerce system.
 *
 * =========================================================
 */

const express = require("express");

const creatorController = require("../controllers/creators/creatorController");

const { protect, authorize } = require("../middlewares/authMiddleware");

const { uploadPreview } = require("../middlewares/upload");

const router = express.Router();

/*=========================================================
Route Handler Validation
=========================================================*/

function requireHandler(name, handler) {
  if (typeof handler !== "function") {
    throw new TypeError(
      `Creator route handler "${name}" is missing or is not a function.`,
    );
  }

  return handler;
}

/*=========================================================
Global Creator Authentication
=========================================================*/

router.use(requireHandler("protect", protect));

router.use(requireHandler("authorize('creator')", authorize("creator")));

/*=========================================================
Creator Studio Categories

GET
/api/v1/creators/studio/categories

Returns active database-managed general creative
categories.

Keep static Studio routes before future dynamic Studio
routes.
=========================================================*/

router.get(
  "/studio/categories",

  requireHandler(
    "creatorController.getCreatorStudioCategories",
    creatorController.getCreatorStudioCategories,
  ),
);

/*=========================================================
Creator Studio Asset Upload

POST
/api/v1/creators/studio/upload

Normal Creator Studio upload.

Multipart:

preview
title
description
style_category
format
category_id
showcase_term_ids
tags
canvas_state

showcase_term_ids example:

[
  "<style UUID>",
  "<garment UUID>",
  "<occasion UUID>",
  "<occasion UUID>"
]

The controller validates all IDs against active rows in:

showcase_discovery_terms

and stores the relationships in:

design_showcase_terms

Normal Studio uploads are NOT Fashion Editor-backed
remixable designs.
=========================================================*/

router.post(
  "/studio/upload",

  uploadPreview.single("preview"),

  requireHandler(
    "creatorController.uploadCreatorStudioAsset",
    creatorController.uploadCreatorStudioAsset,
  ),
);

/*=========================================================
Creator Fashion Editor Projects

GET
/api/v1/creators/editor-projects

Lists the authenticated Creator's private Fashion Editor
projects.


POST
/api/v1/creators/editor-projects

Creates a new Creator-owned editable Fashion Editor
project.

The project remains private editor state.

It is NOT automatically published to the Showcase.
=========================================================*/

router
  .route("/editor-projects")

  .get(
    requireHandler(
      "creatorController.getMyEditorProjects",
      creatorController.getMyEditorProjects,
    ),
  )

  .post(
    requireHandler(
      "creatorController.createEditorProject",
      creatorController.createEditorProject,
    ),
  );

/*=========================================================
Creator Fashion Editor Showcase Sharing

POST
/api/v1/creators/editor-projects/:projectId/share

Publishes an authenticated Creator-owned Fashion Editor
project to the Creator Showcase.

Multipart:

preview
title
description
format
category_id
showcase_term_ids
tags
allow_remix

The controller verifies:

editor_projects.id = :projectId

AND

editor_projects.owner_id
=
authenticated Creator ID

The editable state is loaded from:

editor_projects.project_data

rather than trusting arbitrary browser project state.

Published Fashion Editor designs use:

source_type        = fashion_editor
editor_project_id  = :projectId
is_editable        = TRUE
allow_remix        = submitted Creator preference

Re-sharing the same editor project updates its existing
Showcase item instead of creating a duplicate.
=========================================================*/

router.post(
  "/editor-projects/:projectId/share",

  uploadPreview.single("preview"),

  requireHandler(
    "creatorController.uploadCreatorStudioAsset",
    creatorController.uploadCreatorStudioAsset,
  ),
);

/*=========================================================
Creator Fashion Editor Project

GET
/api/v1/creators/editor-projects/:projectId

Loads a project only when:

editor_projects.owner_id
=
authenticated Creator ID


PUT
/api/v1/creators/editor-projects/:projectId

Updates a project only when:

editor_projects.owner_id
=
authenticated Creator ID

The update handler also supports optimistic version
checking through:

expected_version

This prevents an older editor session from silently
overwriting a newer saved version.
=========================================================*/

router
  .route("/editor-projects/:projectId")

  .get(
    requireHandler(
      "creatorController.getEditorProject",
      creatorController.getEditorProject,
    ),
  )

  .put(
    requireHandler(
      "creatorController.updateEditorProject",
      creatorController.updateEditorProject,
    ),
  );

/*=========================================================
Creator Showcase Fashion Editor Remix / Redesign

POST
/api/v1/creators/showcase/:designId/remix

Creates a NEW private Fashion Editor project from an
eligible Creator Showcase design.

The source Showcase item must be:

is_public    = TRUE
is_published = TRUE
source_type  = fashion_editor
is_editable  = TRUE
allow_remix  = TRUE

The source Creator's:

designs row
editor_projects row
project_data

are NEVER modified.

Instead a new editor_projects row is created with:

owner_id = authenticated Creator

source_project_id = source project's editor project ID

The returned project can then be opened by the authenticated
Creator in FashionEditor.jsx and edited independently.

Optional JSON body:

{
  "title": "My Remix"
}

If title is omitted, the controller derives a Remix title
from the source Showcase design.
=========================================================*/

router.post(
  "/showcase/:designId/remix",

  requireHandler(
    "creatorController.remixCreatorShowcaseDesign",
    creatorController.remixCreatorShowcaseDesign,
  ),
);

/*=========================================================
Export
=========================================================*/

module.exports = router;
