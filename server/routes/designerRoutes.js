"use strict";

/*
=========================================================
FashionVision Designer Routes
Profile, Dashboard, Showcase, Editor Projects, Inventory
and Pitches
Version 3.0
=========================================================
*/

const express = require("express");

const designerCtrl = require("../controllers/designerController");

const pitchCtrl = require("../controllers/designerPitchController");

const { protect, authorize } = require("../middlewares/authMiddleware");

const { uploadDesign, uploadPreview } = require("../middlewares/upload");

const router = express.Router();

/*=========================================================
Route Handler Validation
=========================================================*/

function requireHandler(name, handler) {
  if (typeof handler !== "function") {
    throw new TypeError(
      `Designer route handler "${name}" is missing or is not a function.`,
    );
  }

  return handler;
}

/*=========================================================
Public Designer Routes
=========================================================*/

router.get(
  "/profiles/:userId",

  requireHandler(
    "designerCtrl.getPublicProfile",
    designerCtrl.getPublicProfile,
  ),
);

/*=========================================================
Protected Designer Routes

Creator operations remain in creatorRoutes.js.
Everything below is intentionally designer-only.
=========================================================*/

router.use(requireHandler("protect", protect));

router.use(requireHandler("authorize('designer')", authorize("designer")));

/*=========================================================
Identity and Dashboard
=========================================================*/

router.get(
  "/me",

  requireHandler("designerCtrl.getMe", designerCtrl.getMe),
);

router.get(
  "/dashboard",

  requireHandler("designerCtrl.getDashboard", designerCtrl.getDashboard),
);

/*=========================================================
Profile Management
=========================================================*/

router.patch(
  "/update-profile",

  uploadPreview.single("profileImage"),

  requireHandler("designerCtrl.updateProfile", designerCtrl.updateProfile),
);

/*=========================================================
Designer Inventory
=========================================================*/

router.get(
  "/my-inventory",

  requireHandler("designerCtrl.getMyInventory", designerCtrl.getMyInventory),
);

/*=========================================================
Manual Showcase Upload

This accepts a flattened image only.

The resulting record is:
source_type       = upload
editor_project_id = NULL
is_editable       = false
allow_remix       = false
=========================================================*/

router.post(
  "/upload",

  uploadDesign.single("preview"),

  requireHandler(
    "designerCtrl.uploadShowcaseDesign",
    designerCtrl.uploadShowcaseDesign,
  ),
);

/*
Temporary compatibility route for older frontend code.
*/

router.post(
  "/marketplace/upload",

  uploadDesign.single("preview"),

  requireHandler(
    "designerCtrl.uploadShowcaseDesign",
    designerCtrl.uploadShowcaseDesign,
  ),
);

/*=========================================================
Fashion Editor Projects
=========================================================*/

/*
GET  /editor-projects
Lists the authenticated designer's projects.

POST /editor-projects
Creates a new editable editor project.
*/

router
  .route("/editor-projects")
  .get(
    requireHandler(
      "designerCtrl.getMyEditorProjects",
      designerCtrl.getMyEditorProjects,
    ),
  )
  .post(
    requireHandler(
      "designerCtrl.createEditorProject",
      designerCtrl.createEditorProject,
    ),
  );

/*
GET /editor-projects/:projectId
Loads an owned project.

PUT /editor-projects/:projectId
Saves changes to an owned project.
*/

router
  .route("/editor-projects/:projectId")
  .get(
    requireHandler(
      "designerCtrl.getEditorProject",
      designerCtrl.getEditorProject,
    ),
  )
  .put(
    requireHandler(
      "designerCtrl.updateEditorProject",
      designerCtrl.updateEditorProject,
    ),
  );

/*
Shares an owned editor project to the public showcase.

The image field must be named "preview".
The first share requires a preview image.
Later updates may reuse the existing preview.
*/

router.post(
  "/editor-projects/:projectId/share",

  uploadDesign.single("preview"),

  requireHandler(
    "designerCtrl.shareEditorProject",
    designerCtrl.shareEditorProject,
  ),
);

/*
Creates a private remix copy.

This route never edits the original project.
The source project must be publicly shared and have
allow_remix = true.
*/

router.post(
  "/editor-projects/:projectId/remix",

  requireHandler(
    "designerCtrl.remixEditorProject",
    designerCtrl.remixEditorProject,
  ),
);

/*=========================================================
Designer Pitches
=========================================================*/

router
  .route("/pitches")
  .get(requireHandler("pitchCtrl.getMyPitches", pitchCtrl.getMyPitches))
  .post(requireHandler("pitchCtrl.submitPitch", pitchCtrl.submitPitch));

/*=========================================================
Designer Reviews
=========================================================*/

router.get(
  "/reviews",

  requireHandler("designerCtrl.getMyReviews", designerCtrl.getMyReviews),
);

/*=========================================================
Export Router
=========================================================*/

module.exports = router;
