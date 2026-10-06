"use strict";

/**
 * =========================================================
 * DesignByYou / FashionVision
 * Creator Routes
 * Version 5.5
 * =========================================================
 *
 * Creator routes are showcase / creative-work routes.
 *
 * They are NOT:
 * - ecommerce
 * - checkout
 * - direct product sales
 * - licensing sales
 *
 * =========================================================
 * CREATOR STUDIO
 * =========================================================
 *
 * GET
 * /api/v1/creators/studio/categories
 *
 * GET
 * /api/v1/creators/studio/assets
 *
 * POST
 * /api/v1/creators/studio/upload
 *
 * PATCH
 * /api/v1/creators/studio/assets/:designId/visibility
 *
 * =========================================================
 * FASHION EDITOR
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
 * VISIBILITY MODEL
 * =========================================================
 *
 * PRIVATE
 * is_public    = FALSE
 * is_published = TRUE
 *
 * PUBLIC
 * is_public    = TRUE
 * is_published = TRUE
 *
 * Manual Creator Studio upload:
 * - omitted visibility => private
 *
 * New Fashion Editor share:
 * - omitted visibility => public
 *
 * Existing Fashion Editor publication:
 * - omitted visibility => preserve existing visibility
 *
 * The browser may submit only the high-level intent:
 * visibility = "private" | "public"
 *
 * The browser must not directly control:
 * - is_public
 * - is_published
 *
 * =========================================================
 * SECURITY MODEL
 * =========================================================
 *
 * Every route in this file requires:
 * 1. valid authentication
 * 2. Creator role
 *
 * Authentication / authorization runs before upload
 * processing so unauthenticated callers cannot reach
 * Cloudinary/file handling.
 *
 * Creator accounts do not require admin approval.
 * These are not financial routes, so they do not use
 * designer approval, payout, withdrawal, or deposit
 * middleware.
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
  Upload Middleware Validation
=========================================================*/

if (!uploadPreview || typeof uploadPreview.single !== "function") {
  throw new TypeError(
    'Creator upload middleware "uploadPreview" is missing or invalid.',
  );
}

/*
 * Multer .single("preview") allows zero or one preview file.
 * Unexpected/multiple files are rejected.
 */
const singlePreviewUpload = uploadPreview.single("preview");

/*=========================================================
  Safe Preview Upload Wrapper
=========================================================*/

function safePreviewUpload(req, res, next) {
  singlePreviewUpload(req, res, (error) => {
    if (!error) {
      return next();
    }

    /*-------------------------------------------------
        File Too Large
      -------------------------------------------------*/

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        status: "error",

        code: "PREVIEW_TOO_LARGE",

        message: "The preview image must be 5 MB or smaller.",
      });
    }

    /*-------------------------------------------------
        Unexpected File / Multiple Files
      -------------------------------------------------*/

    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        status: "error",

        code: "UNEXPECTED_UPLOAD_FIELD",

        message: 'Only one optional image field named "preview" is accepted.',
      });
    }

    /*-------------------------------------------------
        File / Multipart Part Limits
      -------------------------------------------------*/

    if (
      error.code === "LIMIT_FILE_COUNT" ||
      error.code === "LIMIT_PART_COUNT"
    ) {
      return res.status(400).json({
        status: "error",

        code: "UPLOAD_LIMIT_EXCEEDED",

        message: "The upload contains too many files or multipart parts.",
      });
    }

    /*-------------------------------------------------
        Multipart Field Limits
      -------------------------------------------------*/

    if (
      error.code === "LIMIT_FIELD_COUNT" ||
      error.code === "LIMIT_FIELD_KEY" ||
      error.code === "LIMIT_FIELD_VALUE"
    ) {
      return res.status(400).json({
        status: "error",

        code: "INVALID_MULTIPART_REQUEST",

        message:
          "One or more multipart fields exceed the allowed upload limits.",
      });
    }

    /*-------------------------------------------------
        Known Custom Image Validation Errors
      -------------------------------------------------*/

    if (
      error.code === "INVALID_IMAGE_TYPE" ||
      error.code === "INVALID_IMAGE_FILE" ||
      error.code === "INVALID_FILE_NAME"
    ) {
      return res.status(400).json({
        status: "error",

        code: error.code,

        message: error.message || "The preview image is invalid.",
      });
    }

    /*-------------------------------------------------
        Other Upload / Cloud Storage Errors

        Do not expose Cloudinary/storage internals.
      -------------------------------------------------*/

    console.error("Creator preview upload middleware failed:", error);

    return res.status(400).json({
      status: "error",

      code: "PREVIEW_UPLOAD_FAILED",

      message:
        "The preview image could not be processed. Use JPG, PNG, or WEBP and try again.",
    });
  });
}

/*=========================================================
  Global Creator Authentication
=========================================================*/

/*
 * IMPORTANT:
 *
 * These run before:
 *
 * - safePreviewUpload
 * - Creator Studio controllers
 * - visibility controller
 * - Fashion Editor controllers
 *
 * Therefore unauthenticated / non-Creator accounts cannot
 * reach the underlying operations.
 */

router.use(requireHandler("protect", protect));

router.use(requireHandler("authorize('creator')", authorize("creator")));

/*=========================================================
  Creator Studio Categories

  GET
  /api/v1/creators/studio/categories

  Returns active database-managed creative categories.

  Category selection is optional when saving an asset.
=========================================================*/

router.get(
  "/studio/categories",

  requireHandler(
    "creatorController.getCreatorStudioCategories",

    creatorController.getCreatorStudioCategories,
  ),
);

/*=========================================================
  My Creator Studio Assets

  GET
  /api/v1/creators/studio/assets

  ---------------------------------------------------------

  OWNER-ONLY ASSET LIST

  Returns saved Creator assets belonging only to the
  authenticated Creator.

  This includes:

  - Public assets
  - Private assets
  - Manual Creator Studio uploads
  - Fashion Editor Showcase publications

  ---------------------------------------------------------

  SUPPORTED QUERY PARAMETERS

  ?page=1

  &limit=12

  &visibility=all

  &visibility=public

  &visibility=private

  &source=all

  &source=upload

  &source=fashion_editor

  ---------------------------------------------------------

  SECURITY

  The controller query must require:

  designs.owner_id =
  authenticated Creator ID

  ---------------------------------------------------------

  IMPORTANT

  This is deliberately different from the public Showcase.

  The owner endpoint must NOT require:

  is_public = TRUE

  because the authenticated Creator needs to see both:

  Private
  Public

  ---------------------------------------------------------

  This route does NOT use:

  safePreviewUpload

  because it is a normal GET request and no file is
  uploaded.
=========================================================*/

router.get(
  "/studio/assets",

  requireHandler(
    "creatorController.getMyCreatorStudioAssets",

    creatorController.getMyCreatorStudioAssets,
  ),
);

/*=========================================================
  Creator Studio Asset Upload

  POST
  /api/v1/creators/studio/upload

  ---------------------------------------------------------

  OPTIONAL FILE

  preview

  ---------------------------------------------------------

  OPTIONAL CREATIVE METADATA

  title
  description
  format
  category_id
  showcase_term_ids
  tags
  canvas_state

  ---------------------------------------------------------

  COMPATIBILITY FIELDS

  style_category
  product_type

  The controller does not trust style_category directly.

  The authoritative style is derived from validated
  Showcase discovery terms.

  ---------------------------------------------------------

  VISIBILITY

  visibility = "private" | "public"

  Manual Creator Studio upload default:

  private

  ---------------------------------------------------------

  SHOWCASE DISCOVERY

  0 or 1 Style
  0 or 1 Garment
  0+ Occasions

  All supplied discovery IDs are validated against active
  database rows.

  ---------------------------------------------------------

  NORMAL MANUAL CREATOR STUDIO UPLOAD

  source_type       = upload
  editor_project_id = NULL
  is_editable       = FALSE
  allow_remix       = FALSE

  Private:

  is_public         = FALSE
  is_published      = TRUE

  Public:

  is_public         = TRUE
  is_published      = TRUE

  ---------------------------------------------------------

  Creator-facing creative fields are optional.

  Optional does NOT mean unvalidated.
=========================================================*/

router.post(
  "/studio/upload",

  safePreviewUpload,

  requireHandler(
    "creatorController.uploadCreatorStudioAsset",

    creatorController.uploadCreatorStudioAsset,
  ),
);

/*=========================================================
  Creator Studio Asset Visibility

  PATCH
  /api/v1/creators/studio/assets/:designId/visibility

  JSON BODY

  {
    "visibility": "public"
  }

  OR

  {
    "visibility": "private"
  }

  ---------------------------------------------------------

  NO FILE IS ACCEPTED OR REQUIRED.

  Therefore this endpoint deliberately does NOT use:

  safePreviewUpload

  ---------------------------------------------------------

  SECURITY

  The controller updates only when:

  designs.id = :designId

  AND

  designs.owner_id =
  authenticated Creator ID

  Therefore a Creator cannot alter another Creator's asset
  simply by knowing or guessing the UUID.

  ---------------------------------------------------------

  The controller accepts only:

  visibility

  It must reject direct attempts to submit:

  is_public
  is_published
  owner_id
  source_type
  editor_project_id
  allow_remix

  ---------------------------------------------------------

  Changing visibility must NOT:

  - delete the design
  - delete the preview
  - delete metadata
  - delete discovery classifications
  - change ownership
  - change editable state
  - alter remix lineage
=========================================================*/

router.patch(
  "/studio/assets/:designId/visibility",

  requireHandler(
    "creatorController.updateCreatorStudioAssetVisibility",

    creatorController.updateCreatorStudioAssetVisibility,
  ),
);

/*=========================================================
  Creator Fashion Editor Projects

  GET
  /api/v1/creators/editor-projects

  Returns private Fashion Editor projects belonging to the
  authenticated Creator.

  ---------------------------------------------------------

  POST
  /api/v1/creators/editor-projects

  Creates a new private Creator-owned Fashion Editor
  project.

  Creating or saving an editor project does NOT
  automatically make it a public Showcase design.
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
  Creator Fashion Editor -> Showcase Share

  POST
  /api/v1/creators/editor-projects/:projectId/share

  ---------------------------------------------------------

  OPTIONAL FILE

  preview

  ---------------------------------------------------------

  OPTIONAL METADATA

  title
  description
  format
  category_id
  showcase_term_ids
  tags
  allow_remix
  visibility

  ---------------------------------------------------------

  VISIBILITY BEHAVIOR

  NEW Fashion Editor publication:

  visibility omitted
  → Public

  EXISTING Fashion Editor publication:

  visibility omitted
  → Preserve its existing visibility

  Explicit:

  visibility = public
  → Public

  visibility = private
  → Private

  ---------------------------------------------------------

  RE-SHARE METADATA PRESERVATION

  For an existing Fashion Editor publication:

  Optional metadata omitted from the re-share request
  should preserve its existing stored value.

  Explicitly supplied values may update or clear the
  corresponding value according to controller rules.

  In particular:

  showcase_term_ids omitted
  → preserve existing discovery relationships

  showcase_term_ids explicitly []
  → clear discovery relationships

  ---------------------------------------------------------

  OWNERSHIP SECURITY

  The controller verifies:

  editor_projects.id = :projectId

  AND

  editor_projects.owner_id =
  authenticated Creator ID

  ---------------------------------------------------------

  AUTHORITATIVE EDITABLE STATE

  Browser-submitted project/canvas state is not trusted as
  the authoritative Fashion Editor state.

  The controller loads:

  editor_projects.project_data

  from the authenticated Creator-owned DB row.

  ---------------------------------------------------------

  FASHION EDITOR DESIGN MODEL

  source_type       = fashion_editor
  editor_project_id = :projectId
  is_editable       = TRUE
  allow_remix       = Creator choice

  ---------------------------------------------------------

  Re-sharing the same editor project updates the existing
  corresponding design rather than creating duplicates.
=========================================================*/

router.post(
  "/editor-projects/:projectId/share",

  safePreviewUpload,

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

  editor_projects.owner_id =
  authenticated Creator ID

  ---------------------------------------------------------

  PUT
  /api/v1/creators/editor-projects/:projectId

  Updates a project only when:

  editor_projects.owner_id =
  authenticated Creator ID

  ---------------------------------------------------------

  The update controller may support:

  expected_version

  for optimistic concurrency protection so an older editor
  session cannot silently overwrite a newer version.
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
  Creator Showcase Remix / Redesign

  POST
  /api/v1/creators/showcase/:designId/remix

  ---------------------------------------------------------

  SOURCE DESIGN REQUIREMENTS

  The controller must require:

  is_public    = TRUE
  is_published = TRUE
  source_type  = fashion_editor
  is_editable  = TRUE
  allow_remix  = TRUE

  ---------------------------------------------------------

  A private design must never become remixable merely
  because:

  allow_remix = TRUE

  Public visibility must also be TRUE.

  ---------------------------------------------------------

  The source Creator's:

  designs row
  editor_projects row
  project_data

  must NEVER be modified.

  ---------------------------------------------------------

  Instead, a NEW private editor_projects record is created
  for the authenticated Creator.

  source_project_id records the lineage.

  ---------------------------------------------------------

  OPTIONAL JSON BODY

  {
    "title": "My Remix"
  }

  If title is omitted, the controller may derive a remix
  title from the source design.
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
