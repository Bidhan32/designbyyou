"use strict";

/*
=========================================================
DesignByYou / FashionVision
Marketplace Routes
Version 2.0
=========================================================

Marketplace policy:

The marketplace is currently a SHOWCASE / DISCOVERY area.

Users may:

- browse marketplace designs
- view individual design details
- discover designers
- navigate into the booking workflow
- create bookings through the dedicated booking system

Designers earn through the booking workflow.

Direct marketplace purchasing is currently DISABLED.

The legacy purchase controller remains in the codebase for
possible future use, but the backend prevents it from being
executed unless the feature is explicitly enabled.

IMPORTANT:

Hiding a purchase button in the frontend is not sufficient.

The backend must independently prevent direct API clients
from executing marketplace purchase logic.

=========================================================
*/

const express = require("express");

const router = express.Router();

const marketCtrl = require("../controllers/marketplaceController");

const { protect } = require("../middlewares/authMiddleware");

/*
=========================================================
Marketplace Sales Feature Gate
=========================================================

Direct marketplace sales are disabled by default.

The purchase endpoint can execute only when:

ENABLE_MARKETPLACE_SALES=true

Production/current configuration should remain:

ENABLE_MARKETPLACE_SALES=false

This protects against direct requests made through:

- Postman
- curl
- browser developer tools
- modified frontend code
- automated API clients

while preserving the legacy purchase implementation for
possible future use.
=========================================================
*/

function requireMarketplaceSalesEnabled(req, res, next) {
  const marketplaceSalesEnabled =
    String(process.env.ENABLE_MARKETPLACE_SALES || "")
      .trim()
      .toLowerCase() === "true";

  if (!marketplaceSalesEnabled) {
    return res.status(403).json({
      status: "error",
      code: "MARKETPLACE_SALES_DISABLED",
      message: "Direct marketplace purchasing is currently unavailable.",
    });
  }

  return next();
}

/*
=========================================================
1. Public Marketplace Showcase
=========================================================

GET
/api/v1/marketplace

Returns marketplace/showcase content.

This endpoint does NOT:

- purchase a design
- move wallet money
- credit designer earnings
- create marketplace sales

=========================================================
*/

router.get("/", marketCtrl.getMarketplace);

/*
=========================================================
2. Public Design Details
=========================================================

GET
/api/v1/marketplace/product/:slug

Returns details for an individual showcase design.

The design may be used for:

- discovery
- portfolio/showcase display
- designer discovery
- navigation toward the booking workflow

Viewing a design does NOT create a marketplace sale.
=========================================================
*/

router.get("/product/:slug", marketCtrl.getDesignDetails);

/*
=========================================================
3. Legacy Direct Marketplace Purchase
=========================================================

POST
/api/v1/marketplace/purchase

CURRENT POLICY:

Direct marketplace purchasing is disabled.

The route remains registered so the legacy controller can
be preserved for possible future use.

Middleware order:

protect
→ requireMarketplaceSalesEnabled
→ purchaseDesign

Therefore when:

ENABLE_MARKETPLACE_SALES=false

the request stops BEFORE:

- buyer wallet deduction
- designer wallet credit
- marketplace_purchase transaction creation
- purchased_designs creation
- asset unlocking

Expected response:

HTTP 403

{
  "status": "error",
  "code": "MARKETPLACE_SALES_DISABLED",
  "message":
    "Direct marketplace purchasing is currently unavailable."
}

=========================================================
*/

router.post(
  "/purchase",
  protect,
  requireMarketplaceSalesEnabled,
  marketCtrl.purchaseDesign,
);

/*
=========================================================
4. Legacy Purchased Asset Download
=========================================================

GET
/api/v1/marketplace/download/:designId

This route remains available for historical purchase
records that may already exist.

It does NOT create a new marketplace purchase.

The controller is responsible for verifying that the
authenticated user has a valid purchased_designs ownership
record before returning access to the asset.

Authentication is always required.
=========================================================
*/

router.get("/download/:designId", protect, marketCtrl.getDownloadedAsset);

/*
=========================================================
Marketplace Route Contract
=========================================================

SHOWCASE / DISCOVERY
---------------------------------------------------------

GET /marketplace
    → public
    → enabled

GET /marketplace/product/:slug
    → public
    → enabled


DIRECT MARKETPLACE SALES
---------------------------------------------------------

POST /marketplace/purchase
    → authenticated
    → backend feature gated

Current:

ENABLE_MARKETPLACE_SALES=false

Therefore:

direct purchase
→ HTTP 403
→ no wallet movement
→ no marketplace earnings


LEGACY PURCHASE DOWNLOAD
---------------------------------------------------------

GET /marketplace/download/:designId
    → authenticated
    → existing ownership required by controller


BOOKINGS
---------------------------------------------------------

Bookings are NOT implemented through this router.

Marketplace discovery may lead users into the dedicated
booking workflow.

Designer earnings are handled by the booking financial
workflow rather than this marketplace purchase route.

=========================================================
*/

/*
=========================================================
Export Router
=========================================================
*/

module.exports = router;
