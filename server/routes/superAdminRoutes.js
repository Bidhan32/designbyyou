"use strict";

/**
 * ============================================================
 * DesignByYou — Super Admin Routes
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
 * - Platform commission controls
 * - Showcase Hero management
 * - Platform finance monitoring
 * - Transaction monitoring
 * - Designer wallet / payout monitoring
 * - Dashboard statistics
 * - Design moderation
 *
 * IMPORTANT:
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
   5. PLATFORM COMMISSION SETTINGS
   ============================================================ */

/**
 * Read current Designer commission configuration.
 *
 * GET /api/v1/superadmin/commission
 */

router.get("/commission", superCtrl.getCommissionOverview);

/**
 * Update global commission rate.
 *
 * Accepted body:
 *
 * {
 *   "rate": 15
 * }
 *
 * OR:
 *
 * {
 *   "newRate": 15
 * }
 *
 * PATCH /api/v1/superadmin/update-commission
 */

router.patch("/update-commission", superCtrl.updateGlobalCommission);

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
 * - Booking commission revenue
 * - Creator/platform fees
 * - Total platform fees
 * - Designer earnings released
 * - Completed booking volume
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
   8. DESIGN MODERATION
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
   9. LEGACY / COMPATIBILITY ROUTES
   ============================================================
 *
 * These routes preserve compatibility with the previous
 * Super Admin backend while the frontend uses the clearer
 * endpoint structure above.
 *
 * They use exactly the same protected controller methods.
 * ============================================================
 */

/* ------------------------------------------------------------
   Old user/admin routes
   ------------------------------------------------------------ */

router.post("/manage/admins", superCtrl.createAdmin);

router.patch("/manage/users/:userId/status", superCtrl.manageUserStatus);

router.get("/manage/pending-designers", superCtrl.getPendingDesigners);

/* ------------------------------------------------------------
   Old finance/business routes
   ------------------------------------------------------------ */

router.patch("/business/commission", superCtrl.updateGlobalCommission);

router.get("/business/ledger", superCtrl.getFinancialOverview);

router.get("/business/payouts", superCtrl.getPayoutDashboard);

/* ------------------------------------------------------------
   Old moderation route
   ------------------------------------------------------------ */

router.patch("/system/moderate/:designId", superCtrl.moderateDesign);

/* ============================================================
   EXPORT ROUTER
   ============================================================ */

module.exports = router;
