"use strict";

/*
=========================================================
DesignByYou
Creator Showcase Routes
Version 4.0
=========================================================

Creator Showcase is a creative discovery surface.

It can display public/published creative work from:

- Creators
- approved Designers

It does NOT provide:

- ecommerce
- buying / selling
- checkout
- storefront purchases
- licensing purchases
- editable design source access

=========================================================
ENDPOINTS
=========================================================

GET
/api/v1/creator-showcase/discovery

GET
/api/v1/creator-showcase/pipeline

GET
/api/v1/creator-showcase/top-designers

GET
/api/v1/creator-showcase/item/:slug

=========================================================
SECURITY
=========================================================

Every route requires:

1. valid authenticated session
2. Creator role

Creator accounts do not require admin approval simply to
browse the Showcase.

Financial and booking actions enforce their own security
requirements on their own routes.
=========================================================
*/

const express = require("express");

const router = express.Router();

const showcaseController = require("../controllers/creators/creatorshowcaseController");

const { protect, authorize } = require("../middlewares/authMiddleware");

/*=========================================================
Global Creator Protection
=========================================================*/

router.use(protect);

router.use(authorize("creator"));

/*=========================================================
GET SHOWCASE DISCOVERY

GET
/api/v1/creator-showcase/discovery

Returns active database-managed navigation for:

- styles
- garments
- occasions
- trending styles
=========================================================*/

router.get(
  "/discovery",

  showcaseController.getShowcaseDiscovery,
);

/*=========================================================
GET SHOWCASE PIPELINE

GET
/api/v1/creator-showcase/pipeline

Returns public/published creative work from:

- Creators
- approved Designers

Supports:

?page=1
&limit=30
&search=dress
&style=Streetwear
&category=dress
=========================================================*/

router.get(
  "/pipeline",

  showcaseController.getShowcase,
);

/*=========================================================
GET TOP DESIGNERS

GET
/api/v1/creator-showcase/top-designers

Designer-only discovery endpoint.
=========================================================*/

router.get(
  "/top-designers",

  showcaseController.getTopDesigners,
);

/*=========================================================
GET SINGLE SHOWCASE ITEM

GET
/api/v1/creator-showcase/item/:slug

Returns safe public creative information.

Does NOT return:

- canvas_state
- raw editable source
- price
- license information
=========================================================*/

router.get(
  "/item/:slug",

  showcaseController.getShowcaseItem,
);

/*=========================================================
Export
=========================================================*/

module.exports = router;
