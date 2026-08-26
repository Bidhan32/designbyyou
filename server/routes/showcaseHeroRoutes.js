"use strict";

/**
 * ============================================================
 * DesignByYou — Public Showcase Hero Routes
 * ============================================================
 *
 * PURPOSE
 * ------------------------------------------------------------
 *
 * Public read-only Hero configuration used by:
 *
 * - CreatorShowcase.jsx
 * - DesignerMarketplace.jsx
 *
 * This router does NOT allow configuration changes.
 *
 * Super Admin writes remain protected under:
 *
 * PATCH /api/v1/superadmin/showcase-hero
 *
 * PUBLIC ENDPOINT
 * ------------------------------------------------------------
 *
 * GET /api/v1/showcase-hero
 *
 * ============================================================
 */

const express = require("express");

const router = express.Router();

const superCtrl = require(
  "../controllers/superAdminController",
);

/* ============================================================
   PUBLIC HERO CONFIGURATION
   ============================================================ */

/**
 * Read the currently active Showcase Hero configuration.
 *
 * Possible modes:
 *
 * slideshow
 * video
 *
 * If Hero configuration is disabled or unavailable, the
 * controller returns a safe disabled configuration so both
 * Showcase pages can use their existing fallback Hero.
 *
 * GET /api/v1/showcase-hero
 */

router.get(
  "/",
  superCtrl.getPublicShowcaseHero,
);

/* ============================================================
   EXPORT ROUTER
   ============================================================ */

module.exports = router;