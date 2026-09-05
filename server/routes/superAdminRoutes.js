"use strict";

/**
 * ============================================================
 * DesignByYou — Super Admin Routes
 * Version 2.1
 * ============================================================
 *
 * All routes in this file require:
 *
 * 1. Valid authenticated session
 * 2. role === "superadmin"
 *
 * This router provides:
 *
 * - Admin account creation
 * - User management
 * - Designer approval management
 * - Designer tier commission policy monitoring
 * - Showcase Hero management
 * - Platform finance monitoring
 * - Transaction monitoring
 * - Designer wallet / payout monitoring
 * - Manual bank payout administration
 * - Designer bank-account verification
 * - Dashboard statistics
 * - Design moderation
 *
 * IMPORTANT:
 *
 * Designer commission is tier-based and READ-ONLY here:
 *
 * Bronze   0-4 completed bookings   -> 10%
 * Silver   5-19 completed bookings  -> 15%
 * Gold     20-34 completed bookings -> 20%
 * Platinum 35-49 completed bookings -> 25%
 * Diamond  50+ completed bookings   -> 30%
 *
 * Global commission editing is intentionally NOT exposed.
 *
 * Maintenance mode is intentionally NOT wired here yet because
 * there is currently no persistent backend maintenance setting.
 *
 * Showcase Hero PUBLIC reads are NOT handled here.
 *
 * Public:
 *
 * GET /api/v1/showcase-hero
 *
 * will be mounted through a separate read-only public router.
 * ============================================================
 */

const express = require("express");

const router = express.Router();

const superCtrl = require("../controllers/superAdminController");

const { protect, authorize } = require("../middlewares/authMiddleware");

/* ============================================================
   GLOBAL SUPER ADMIN SECURITY
   ============================================================ */

/**
 * Every route below requires an authenticated user.
 */

router.use(protect);

/**
 * Every route below requires:
 *
 * role === "superadmin"
 *
 * Creator, Designer and normal Admin accounts cannot access
 * these endpoints.
 */

router.use(authorize("superadmin"));

/* ============================================================
   1. DASHBOARD
   ============================================================ */

/**
 * Main Super Admin dashboard statistics.
 *
 * GET /api/v1/superadmin/dashboard-stats
 */

router.get("/dashboard-stats", superCtrl.getDashboardStats);

/**
 * More detailed global platform statistics.
 *
 * GET /api/v1/superadmin/system/stats
 */

router.get("/system/stats", superCtrl.getGlobalStats);

/* ============================================================
   2. USER MANAGEMENT
   ============================================================ */

/**
 * Get all platform users.
 *
 * GET /api/v1/superadmin/users
 *
 * Optional:
 *
 * GET /api/v1/superadmin/users?role=designer
 * GET /api/v1/superadmin/users?role=creator
 * GET /api/v1/superadmin/users?role=admin
 * GET /api/v1/superadmin/users?role=superadmin
 */

router.get("/users", superCtrl.getUsers);

/**
 * Change a user's role.
 *
 * Allowed target roles are enforced by the controller:
 *
 * creator
 * designer
 * admin
 *
 * Superadmin promotion is NOT allowed through this endpoint.
 *
 * PATCH /api/v1/superadmin/update-role/:userId
 */

router.patch("/update-role/:userId", superCtrl.updateUserRole);

/**
 * Change account approval/status.
 *
 * Controller supports:
 *
 * approved
 * suspended
 * pending
 * rejected
 *
 * Existing frontend compatibility:
 *
 * active -> approved
 * banned -> suspended
 *
 * PATCH /api/v1/superadmin/update-status/:userId
 */

router.patch("/update-status/:userId", superCtrl.manageUserStatus);

/* ============================================================
   3. ADMIN ACCOUNT CREATION
   ============================================================ */

/**
 * Create a normal Admin account.
 *
 * This does NOT create another Super Admin.
 *
 * POST /api/v1/superadmin/admins
 */

router.post("/admins", superCtrl.createAdmin);

/* ============================================================
   4. DESIGNER APPROVALS
   ============================================================ */

/**
 * Retrieve Designer accounts awaiting Super Admin approval.
 *
 * GET /api/v1/superadmin/pending-designers
 */

router.get("/pending-designers", superCtrl.getPendingDesigners);

/* ============================================================
   5. DESIGNER TIER COMMISSION POLICY
   ============================================================ */

/**
 * Read the current Designer tier commission policy.
 *
 * This endpoint is READ-ONLY.
 *
 * Tier policy:
 *
 * Bronze:
 * - 0-4 completed bookings
 * - 10% Designer commission
 *
 * Silver:
 * - 5-19 completed bookings
 * - 15% Designer commission
 *
 * Gold:
 * - 20-34 completed bookings
 * - 20% Designer commission
 *
 * Platinum:
 * - 35-49 completed bookings
 * - 25% Designer commission
 *
 * Diamond:
 * - 50+ completed bookings
 * - 30% Designer commission
 *
 * The endpoint also reports:
 *
 * - number of Designer profiles
 * - Designer count per tier
 * - tier/commission policy mismatches
 *
 * GET /api/v1/superadmin/commission
 */

router.get("/commission", superCtrl.getCommissionOverview);

/*
 * IMPORTANT:
 *
 * There is intentionally NO:
 *
 * PATCH /api/v1/superadmin/update-commission
 *
 * and NO:
 *
 * PATCH /api/v1/superadmin/business/commission
 *
 * Global commission editing conflicts with the tier-based
 * Designer commission policy and has therefore been removed.
 */

/* ============================================================
   6. SHOWCASE HERO MANAGEMENT
   ============================================================ */

/**
 * Read complete Showcase Hero configuration.
 *
 * Super Admin only.
 *
 * Returns:
 *
 * - mode
 * - slideshow_images
 * - video_url
 * - video_poster_url
 * - rotation_seconds
 * - is_enabled
 * - updated_by
 * - timestamps
 *
 * GET /api/v1/superadmin/showcase-hero
 */

router.get("/showcase-hero", superCtrl.getShowcaseHeroSettings);

/**
 * Update Showcase Hero configuration.
 *
 * Super Admin only.
 *
 * Supported body:
 *
 * {
 *   "mode": "slideshow",
 *   "slideshow_images": [
 *     "https://...",
 *     "https://...",
 *     "https://..."
 *   ],
 *   "rotation_seconds": 6,
 *   "is_enabled": true
 * }
 *
 * OR:
 *
 * {
 *   "mode": "video",
 *   "video_url": "https://...",
 *   "video_poster_url": "https://...",
 *   "is_enabled": true
 * }
 *
 * RULES:
 *
 * slideshow:
 * - 3 to 5 images required when enabled
 *
 * video:
 * - video_url required when enabled
 *
 * Only one mode is publicly rendered at a time.
 *
 * PATCH /api/v1/superadmin/showcase-hero
 */

router.patch("/showcase-hero", superCtrl.updateShowcaseHeroSettings);

/* ============================================================
   7. PLATFORM FINANCE MONITORING
   ============================================================ */

/**
 * Main platform financial overview.
 *
 * Provides:
 *
 * - Creator/platform fees
 * - Platform retained from completed bookings
 * - Total platform retained/fees
 * - Designer earnings released
 * - Completed booking release volume
 * - Refund volume
 * - Locked/pending balances
 * - Booking status counts
 * - Designer payout request counts
 *
 * GET /api/v1/superadmin/finance/overview
 */

router.get("/finance/overview", superCtrl.getFinancialOverview);

/**
 * Financial transaction ledger.
 *
 * Optional:
 *
 * ?limit=100
 *
 * Maximum enforced by controller:
 *
 * 250
 *
 * GET /api/v1/superadmin/finance/transactions
 */

router.get("/finance/transactions", superCtrl.getFinancialTransactions);

/**
 * Designer wallet and payout monitoring.
 *
 * Returns:
 *
 * - Designer available balances
 * - Pending escrow balances
 * - Pending payout balances
 * - Recent payout requests
 * - Failed payout information
 *
 * GET /api/v1/superadmin/finance/designer-balances
 */

router.get("/finance/designer-balances", superCtrl.getPayoutDashboard);

/* ============================================================
   8. MANUAL DESIGNER BANK PAYOUT ADMINISTRATION
   ============================================================ */

/**
 * Retrieve manual bank payout requests.
 *
 * This endpoint returns MASKED bank-account information only.
 *
 * Optional:
 *
 * ?status=pending
 * ?status=processing
 * ?status=completed
 * ?status=failed
 * ?status=cancelled
 * ?limit=100
 *
 * GET /api/v1/superadmin/finance/manual-payouts
 */

router.get("/finance/manual-payouts", superCtrl.getManualPayoutRequests);

/**
 * Retrieve one manual payout with sensitive bank details.
 *
 * IMPORTANT:
 *
 * This endpoint decrypts the stored bank-transfer details.
 *
 * It must remain Super Admin only.
 *
 * GET
 * /api/v1/superadmin/finance/manual-payouts/:payoutId
 */

router.get(
  "/finance/manual-payouts/:payoutId",
  superCtrl.getManualPayoutRequest,
);

/**
 * Verify or reject a Designer bank account.
 *
 * Body:
 *
 * {
 *   "status": "verified"
 * }
 *
 * OR:
 *
 * {
 *   "status": "rejected"
 * }
 *
 * PATCH
 * /api/v1/superadmin/finance/bank-accounts/:bankAccountId/verification
 */

router.patch(
  "/finance/bank-accounts/:bankAccountId/verification",
  superCtrl.updateDesignerBankAccountVerification,
);

/**
 * Move a manual payout from:
 *
 * pending -> processing
 *
 * No money leaves the internal payout reservation here.
 *
 * POST
 * /api/v1/superadmin/finance/manual-payouts/:payoutId/processing
 */

router.post(
  "/finance/manual-payouts/:payoutId/processing",
  superCtrl.markManualPayoutProcessing,
);

/**
 * Complete a manual bank payout.
 *
 * Only call this AFTER the Super Admin has actually sent the
 * external bank transfer.
 *
 * Required body:
 *
 * {
 *   "transfer_reference": "BANK-TRANSFER-123"
 * }
 *
 * Effects:
 *
 * - processing -> completed
 * - pending_payout_balance decreases
 * - payout transaction is recorded
 * - external bank reference is stored
 *
 * POST
 * /api/v1/superadmin/finance/manual-payouts/:payoutId/complete
 */

router.post(
  "/finance/manual-payouts/:payoutId/complete",
  superCtrl.completeManualPayout,
);

/**
 * Fail/reject a manual payout before money has been sent.
 *
 * Required body:
 *
 * {
 *   "reason": "Bank rejected the transfer",
 *   "funds_sent": false
 * }
 *
 * SAFETY:
 *
 * funds_sent must explicitly be false.
 *
 * The controller restores:
 *
 * pending_payout_balance -> available_balance
 *
 * only when the external transfer has NOT been sent.
 *
 * POST
 * /api/v1/superadmin/finance/manual-payouts/:payoutId/fail
 */

router.post(
  "/finance/manual-payouts/:payoutId/fail",
  superCtrl.failManualPayout,
);

/* ============================================================
   9. DESIGN MODERATION
   ============================================================ */

/**
 * Super Admin design moderation.
 *
 * Body:
 *
 * {
 *   "action": "unpublish"
 * }
 *
 * OR:
 *
 * {
 *   "action": "delete"
 * }
 *
 * PATCH /api/v1/superadmin/designs/:designId/moderate
 */

router.patch("/designs/:designId/moderate", superCtrl.moderateDesign);

/* ============================================================
   10. LEGACY / COMPATIBILITY ROUTES
   ============================================================
 *
 * These routes preserve compatibility with the previous
 * Super Admin backend where keeping them does not conflict
 * with the current business rules.
 *
 * All routes remain protected by:
 *
 * protect
 * authorize("superadmin")
 *
 * IMPORTANT:
 *
 * Legacy global commission mutation was intentionally removed.
 * ============================================================
 */

/* ------------------------------------------------------------
   Old user/admin routes
   ------------------------------------------------------------ */

router.post("/manage/admins", superCtrl.createAdmin);

router.patch("/manage/users/:userId/status", superCtrl.manageUserStatus);

router.get("/manage/pending-designers", superCtrl.getPendingDesigners);

/* ------------------------------------------------------------
   Old finance/business read routes
   ------------------------------------------------------------ */

/**
 * Legacy financial overview.
 *
 * GET /api/v1/superadmin/business/ledger
 */

router.get("/business/ledger", superCtrl.getFinancialOverview);

/**
 * Legacy payout dashboard.
 *
 * GET /api/v1/superadmin/business/payouts
 */

router.get("/business/payouts", superCtrl.getPayoutDashboard);

/*
 * REMOVED:
 *
 * PATCH /api/v1/superadmin/business/commission
 *
 * Global commission editing is incompatible with the tier-based
 * Designer commission policy.
 */

/* ------------------------------------------------------------
   Old moderation route
   ------------------------------------------------------------ */

router.patch("/system/moderate/:designId", superCtrl.moderateDesign);

/* ============================================================
   EXPORT ROUTER
   ============================================================ */

module.exports = router;
