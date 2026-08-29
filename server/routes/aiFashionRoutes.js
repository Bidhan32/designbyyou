/*
=========================================================
DesignByYou AI Fashion Routes
Sketch / Drawing / Template → Realistic Fashion Image
Version 1.0.0
=========================================================
*/

const express = require("express");

const {
  generateFashionPreview,
} = require("../controllers/aiFashionController");

const {
  protect,
} = require("../middlewares/authMiddleware");

const router = express.Router();

/*=========================================================
Authentication
=========================================================*/

/*
AI generation consumes paid provider credits.

For now every AI fashion route requires an authenticated
DesignByYou user.

We intentionally do not restrict this route to only
creator or designer here yet. That lets the existing
Fashion Editor decide which authenticated roles can use
the feature without duplicating role rules in this file.
*/

router.use(protect);

/*=========================================================
Generate Realistic Fashion Preview
=========================================================*/

/*
POST /api/v1/ai-fashion/render

Accepts:
- imageSource / imageDataUrl / imageUrl
- garmentType
- material
- style
- designNotes
- view
- background
- preserveGraphics
- preserveText
- aspectRatio
- outputFormat

Returns:
- generated image URL
- generation request ID
- model
- prompt
- selected generation options
*/

router.post(
  "/render",
  generateFashionPreview,
);

/*=========================================================
Exports
=========================================================*/

module.exports = router;