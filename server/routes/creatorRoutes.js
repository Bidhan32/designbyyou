"use strict";

/**
 * =========================================================
 * DesignByYou / FashionVision
 * Creator Routes
 * Version 5.1
 * =========================================================
 *
 * Creator routes are NOT ecommerce/marketplace routes.
 *
 * CURRENT CREATOR STUDIO ENDPOINTS
 * ---------------------------------------------------------
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
 * These routes manage Creator-owned editable Fashion Editor
 * project state stored in:
 *
 * editor_projects
 *
 * Project ownership is enforced by:
 *
 * editor_projects.owner_id = authenticated Creator user ID
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
 * Creator Studio uploads and Fashion Editor project
 * save/load operations are not sensitive financial actions,
 * so these routes do NOT use:
 *
 * - requireApprovedAccount
 * - payout/deposit middleware
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
 * The upload sends:
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
 * The Creator Studio upload then submits:
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
 * UPLOAD MODEL
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
 * IMPORTANT:
 *
 * style_category is retained for frontend/database
 * compatibility, but the controller derives the authoritative
 * stored style from the validated Showcase Style term.
 *
 * =========================================================
 * FASHION EDITOR PROJECT MODEL
 * =========================================================
 *
 * Fashion Editor projects are editable Creator-owned cloud
 * documents.
 *
 * They are separate from published Showcase assets.
 *
 * Creating or saving an editor project does NOT:
 *
 * - publish it
 * - create a Marketplace listing
 * - create a sale
 * - create a booking
 * - expose pricing
 *
 * Current phase supports:
 *
 * - list projects
 * - create project
 * - load project
 * - update project
 *
 * Creator Showcase sharing is intentionally handled
 * separately because it must use the Creator Showcase
 * category/discovery model.
 *
 * There is currently NO:
 *
 * POST /editor-projects/:projectId/share
 *
 * and NO:
 *
 * POST /editor-projects/:projectId/remix
 *
 * =========================================================
 * VISIBILITY
 * =========================================================
 *
 * New Creator Studio uploads are published to the Creator
 * Showcase as:
 *
 * is_public    = TRUE
 * is_published = TRUE
 *
 * This represents Showcase visibility only.
 *
 * It does NOT mean:
 *
 * - sale
 * - ecommerce listing
 * - purchasable product
 * - licensing offer
 *
 * Fashion Editor projects themselves remain private project
 * records until a separate Creator Showcase publishing flow
 * explicitly creates a Showcase asset.
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
 * Expected protections include:
 *
 * - image-only
 * - JPG / PNG / WEBP
 * - max configured upload size
 * - Cloudinary-backed storage
 *
 * Fashion Editor project CRUD uses JSON requests and does
 * not use upload middleware.
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

The project remains private editor state. It is not
automatically published to the Showcase.
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
Creator Fashion Editor Showcase Sharing

NOT ENABLED YET
=========================================================*/

/*
Do NOT copy the old Designer routes here:

POST /editor-projects/:projectId/share
POST /editor-projects/:projectId/remix

Creator Showcase publishing must use the Creator model:

category_id
showcase_term_ids
format
tags
canvas_state
preview

instead of the old Designer Fashion Editor taxonomy.
*/

/*=========================================================
Export
=========================================================*/

module.exports = router;
