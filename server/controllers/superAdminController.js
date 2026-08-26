"use strict";

const db = require("../config/db");
const bcrypt = require("bcryptjs");

/**
 * ============================================================
 * DesignByYou — Super Admin Controller
 * ============================================================
 *
 * Deployment-focused controller for:
 *
 * - User management
 * - Designer approvals
 * - Global commission management
 * - Platform financial monitoring
 * - Designer wallet / payout monitoring
 * - Booking/platform statistics
 * - Design moderation
 * - Showcase Hero management
 *
 * IMPORTANT:
 *
 * Authentication/authorization belongs in superAdminRoutes.js.
 *
 * All Super Admin routes using this controller should be behind:
 *
 *     protect
 *     authorize("superadmin")
 *
 * Public Showcase Hero reads are exposed separately through
 * a read-only public route.
 *
 * This controller does NOT create a separate platform wallet.
 * Existing transactions remain the financial ledger.
 * ============================================================
 */

/* ============================================================
   INTERNAL HELPERS
   ============================================================ */

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const normalizeRole = (role) =>
  typeof role === "string" ? role.trim().toLowerCase() : "";

const normalizeApprovalStatus = (status) => {
  if (typeof status !== "string") {
    return null;
  }

  const value = status.trim().toLowerCase();

  /**
   * Frontend compatibility:
   *
   * Existing admin UI used:
   *
   * active
   * banned
   *
   * Database/account policy uses:
   *
   * approved
   * suspended
   * pending
   * rejected
   */

  const aliases = {
    active: "approved",
    banned: "suspended",

    approved: "approved",
    suspended: "suspended",
    pending: "pending",
    rejected: "rejected",
  };

  return aliases[value] || null;
};

const parseCommissionRate = (value) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (parsed < 0 || parsed > 100) {
    return null;
  }

  return Number(parsed.toFixed(2));
};

/* ============================================================
   SHOWCASE HERO HELPERS
   ============================================================ */

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object || {}, key);

const normalizeHeroMode = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const mode = value.trim().toLowerCase();

  if (!["slideshow", "video"].includes(mode)) {
    return null;
  }

  return mode;
};

const normalizeHeroUrl = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  return cleaned || null;
};

/**
 * Hero media may use:
 *
 * - HTTPS absolute URLs
 * - application-relative URLs such as:
 *     /uploads/hero/example.jpg
 *
 * Local development may additionally use HTTP.
 */
const isAllowedHeroMediaUrl = (value) => {
  if (!value) {
    return true;
  }

  if (value.startsWith("/") && !value.startsWith("//")) {
    return true;
  }

  try {
    const parsed = new URL(value);

    if (parsed.protocol === "https:") {
      return true;
    }

    if (process.env.NODE_ENV !== "production" && parsed.protocol === "http:") {
      return true;
    }

    return false;
  } catch {
    return false;
  }
};

const normalizeHeroImages = (value) => {
  if (!Array.isArray(value)) {
    return null;
  }

  const seen = new Set();

  const images = [];

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const url = item.trim();

    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);

    images.push(url);
  }

  return images;
};

const getShowcaseHeroRow = async () => {
  const result = await db.query(
    `
        SELECT
            id,
            mode,
            slideshow_images,
            video_url,
            video_poster_url,
            rotation_seconds,
            is_enabled,
            updated_by,
            created_at,
            updated_at
        FROM showcase_hero_settings
        WHERE id = 1
        LIMIT 1
      `,
  );

  return result.rows[0] || null;
};

/* ============================================================
   1. ADMIN ACCOUNT MANAGEMENT
   ============================================================ */

/**
 * Create a normal Admin account.
 *
 * Only a Super Admin should ever be allowed to call this route.
 *
 * This intentionally creates:
 *
 * role = "admin"
 *
 * NOT another superadmin.
 */

exports.createAdmin = async (req, res) => {
  const fullName =
    typeof req.body.full_name === "string" ? req.body.full_name.trim() : "";

  const email = normalizeEmail(req.body.email);

  const password = req.body.password;

  if (!fullName) {
    return res.status(400).json({
      message: "Full name is required.",
    });
  }

  if (!email) {
    return res.status(400).json({
      message: "Email is required.",
    });
  }

  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({
      message: "Password must contain at least 8 characters.",
    });
  }

  try {
    const existing = await db.query(
      `
          SELECT id
          FROM users
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
        `,
      [email],
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    const salt = await bcrypt.genSalt(12);

    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await db.query(
      `
          INSERT INTO users (
              full_name,
              email,
              password_hash,
              role,
              is_email_verified,
              approval_status
          )
          VALUES (
              $1,
              $2,
              $3,
              'admin',
              TRUE,
              'approved'
          )
          RETURNING
              id,
              full_name,
              email,
              role,
              is_email_verified,
              approval_status,
              created_at
        `,
      [fullName, email, hashedPassword],
    );

    return res.status(201).json({
      status: "success",

      data: result.rows[0],
    });
  } catch (error) {
    console.error("createAdmin error:", error);

    return res.status(500).json({
      message: "Admin creation failed.",
    });
  }
};

/* ============================================================
   2. USER MANAGEMENT
   ============================================================ */

/**
 * Get all users.
 *
 * Optional:
 *
 * ?role=creator
 * ?role=designer
 * ?role=admin
 * ?role=superadmin
 */

exports.getUsers = async (req, res) => {
  const requestedRole = normalizeRole(req.query.role);

  const allowedFilters = ["", "creator", "designer", "admin", "superadmin"];

  if (!allowedFilters.includes(requestedRole)) {
    return res.status(400).json({
      message: "Invalid role filter.",
    });
  }

  try {
    const params = [];

    let roleFilter = "";

    if (requestedRole) {
      params.push(requestedRole);

      roleFilter = `
        WHERE role = $1
      `;
    }

    const result = await db.query(
      `
          SELECT
              id,
              full_name,
              email,
              role,
              approval_status,
              approval_status AS status,
              is_email_verified,
              created_at
          FROM users
          ${roleFilter}
          ORDER BY created_at DESC
        `,
      params,
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("getUsers error:", error);

    return res.status(500).json({
      message: "Failed to retrieve users.",
    });
  }
};

/**
 * Change a user's normal platform role.
 *
 * SECURITY:
 *
 * - Cannot promote to superadmin.
 * - Cannot modify an existing superadmin.
 *
 * Allowed target roles:
 *
 * creator
 * designer
 * admin
 */

exports.updateUserRole = async (req, res) => {
  const userId = req.params.userId || req.params.id;

  const newRole = normalizeRole(req.body.role);

  const allowedRoles = ["creator", "designer", "admin"];

  if (!userId) {
    return res.status(400).json({
      message: "User ID is required.",
    });
  }

  if (!allowedRoles.includes(newRole)) {
    return res.status(400).json({
      message: "Invalid role.",
    });
  }

  try {
    const targetResult = await db.query(
      `
            SELECT
                id,
                role
            FROM users
            WHERE id = $1
            LIMIT 1
          `,
      [userId],
    );

    if (targetResult.rows.length === 0) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    const target = targetResult.rows[0];

    if (target.role === "superadmin") {
      return res.status(403).json({
        message: "Superadmin role cannot be changed here.",
      });
    }

    const result = await db.query(
      `
            UPDATE users
            SET role = $1
            WHERE id = $2
            RETURNING
                id,
                full_name,
                email,
                role,
                approval_status,
                approval_status AS status
          `,
      [newRole, userId],
    );

    return res.status(200).json({
      status: "success",

      data: result.rows[0],
    });
  } catch (error) {
    console.error("updateUserRole error:", error);

    return res.status(500).json({
      message: "Role update failed.",
    });
  }
};

/**
 * Approve / suspend / reject / restore users.
 *
 * Accepted values:
 *
 * approved
 * suspended
 * pending
 * rejected
 *
 * Frontend compatibility:
 *
 * active -> approved
 * banned -> suspended
 */

exports.manageUserStatus = async (req, res) => {
  const userId = req.params.userId || req.params.id;

  const status = normalizeApprovalStatus(req.body.status);

  if (!userId) {
    return res.status(400).json({
      message: "User ID is required.",
    });
  }

  if (!status) {
    return res.status(400).json({
      message:
        "Invalid status. Allowed statuses are approved, pending, suspended, or rejected.",
    });
  }

  try {
    const targetResult = await db.query(
      `
            SELECT
                id,
                role
            FROM users
            WHERE id = $1
            LIMIT 1
          `,
      [userId],
    );

    if (targetResult.rows.length === 0) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    if (targetResult.rows[0].role === "superadmin") {
      return res.status(403).json({
        message: "Superadmin account status cannot be changed here.",
      });
    }

    const result = await db.query(
      `
            UPDATE users
            SET approval_status = $1
            WHERE id = $2
            RETURNING
                id,
                full_name,
                email,
                role,
                approval_status,
                approval_status AS status
          `,
      [status, userId],
    );

    return res.status(200).json({
      status: "success",

      data: result.rows[0],
    });
  } catch (error) {
    console.error("manageUserStatus error:", error);

    return res.status(500).json({
      message: "Status update failed.",
    });
  }
};

/* ============================================================
   3. DESIGNER APPROVALS
   ============================================================ */

/**
 * Get designers waiting for approval.
 */

exports.getPendingDesigners = async (req, res) => {
  try {
    const result = await db.query(
      `
            SELECT
                u.id,
                u.full_name,
                u.email,
                u.role,
                u.approval_status,
                u.approval_status AS status,
                u.is_email_verified,
                u.created_at,

                dp.portfolio_url,
                dp.expertise_tags,
                dp.commission_rate

            FROM users u

            LEFT JOIN designer_profiles dp
                ON dp.user_id = u.id

            WHERE
                u.role = 'designer'
                AND u.approval_status = 'pending'

            ORDER BY u.created_at ASC
          `,
    );

    return res.status(200).json({
      status: "success",

      data: result.rows,
    });
  } catch (error) {
    console.error("getPendingDesigners error:", error);

    return res.status(500).json({
      message: "Failed to fetch pending designers.",
    });
  }
};

/* ============================================================
   4. COMMISSION CONTROL
   ============================================================ */

/**
 * Return current commission configuration across
 * designer profiles.
 */

exports.getCommissionOverview = async (req, res) => {
  try {
    const result = await db.query(
      `
            SELECT
                COUNT(*)::int AS designer_profiles,

                COALESCE(
                    MIN(commission_rate),
                    0
                ) AS minimum_rate,

                COALESCE(
                    MAX(commission_rate),
                    0
                ) AS maximum_rate,

                COALESCE(
                    ROUND(
                        AVG(commission_rate)::numeric,
                        2
                    ),
                    0
                ) AS average_rate

            FROM designer_profiles
          `,
    );

    const data = result.rows[0];

    const consistent = Number(data.minimum_rate) === Number(data.maximum_rate);

    return res.status(200).json({
      status: "success",

      data: {
        ...data,

        consistent,

        commission_rate: consistent
          ? Number(data.maximum_rate)
          : Number(data.average_rate),
      },
    });
  } catch (error) {
    console.error("getCommissionOverview error:", error);

    return res.status(500).json({
      message: "Failed to retrieve commission configuration.",
    });
  }
};

/**
 * Change commission rate for all existing Designer profiles.
 *
 * Compatible bodies:
 *
 * { "newRate": 15 }
 *
 * OR
 *
 * { "rate": 15 }
 */

exports.updateGlobalCommission = async (req, res) => {
  const requestedRate =
    req.body.newRate !== undefined ? req.body.newRate : req.body.rate;

  const newRate = parseCommissionRate(requestedRate);

  if (newRate === null) {
    return res.status(400).json({
      message: "Commission rate must be a valid number between 0 and 100.",
    });
  }

  try {
    const result = await db.query(
      `
            UPDATE designer_profiles
            SET commission_rate = $1
            RETURNING user_id
          `,
      [newRate],
    );

    return res.status(200).json({
      status: "success",

      message: `Global commission rate updated to ${newRate}%`,

      data: {
        commission_rate: newRate,

        designer_profiles_updated: result.rowCount,
      },
    });
  } catch (error) {
    console.error("updateGlobalCommission error:", error);

    return res.status(500).json({
      message: "Failed to update commission rates.",
    });
  }
};

/* ============================================================
   5. PLATFORM FINANCIAL OVERVIEW
   ============================================================ */

/**
 * Platform finance summary.
 *
 * escrow_lock:
 *
 * creator/payment/platform fee collected at funding
 *
 * escrow_release:
 *
 * platform commission earned when Designer earnings are released
 */

exports.getFinancialOverview = async (req, res) => {
  try {
    const [ledgerResult, bookingResult, walletResult, payoutResult] =
      await Promise.all([
        db.query(
          `
              SELECT
                  COUNT(*)::int AS total_transactions,

                  COALESCE(
                      SUM(gross_amount),
                      0
                  ) AS ledger_gross_volume,

                  COALESCE(
                      SUM(platform_fee_deducted)
                      FILTER (
                          WHERE transaction_type::text = 'escrow_lock'
                      ),
                      0
                  ) AS creator_platform_fees,

                  COALESCE(
                      SUM(platform_fee_deducted)
                      FILTER (
                          WHERE transaction_type::text = 'escrow_release'
                      ),
                      0
                  ) AS booking_commission_revenue,

                  COALESCE(
                      SUM(net_amount)
                      FILTER (
                          WHERE transaction_type::text = 'escrow_release'
                      ),
                      0
                  ) AS designer_earnings_released,

                  COALESCE(
                      SUM(gross_amount)
                      FILTER (
                          WHERE transaction_type::text = 'escrow_release'
                      ),
                      0
                  ) AS completed_booking_release_volume,

                  COALESCE(
                      SUM(gross_amount)
                      FILTER (
                          WHERE transaction_type::text = 'refund'
                      ),
                      0
                  ) AS refund_volume,

                  COUNT(*)
                  FILTER (
                      WHERE transaction_type::text = 'escrow_lock'
                  )::int AS escrow_lock_transactions,

                  COUNT(*)
                  FILTER (
                      WHERE transaction_type::text = 'escrow_release'
                  )::int AS escrow_release_transactions,

                  COUNT(*)
                  FILTER (
                      WHERE transaction_type::text = 'refund'
                  )::int AS refund_transactions

              FROM transactions
            `,
        ),

        db.query(
          `
              SELECT
                  COUNT(*)::int AS total_bookings,

                  COUNT(*)
                  FILTER (
                      WHERE status::text = 'funded'
                  )::int AS funded_bookings,

                  COUNT(*)
                  FILTER (
                      WHERE status::text IN (
                          'progress',
                          'review_prototype',
                          'final_production',
                          'review_final'
                      )
                  )::int AS active_projects,

                  COUNT(*)
                  FILTER (
                      WHERE status::text = 'completed'
                  )::int AS completed_bookings,

                  COUNT(*)
                  FILTER (
                      WHERE status::text = 'cancelled'
                  )::int AS cancelled_bookings,

                  COUNT(*)
                  FILTER (
                      WHERE status::text = 'cancellation_pending'
                  )::int AS cancellation_pending,

                  COUNT(*)
                  FILTER (
                      WHERE status::text = 'refund_pending'
                  )::int AS refund_pending,

                  COUNT(*)
                  FILTER (
                      WHERE status::text = 'refund_failed'
                  )::int AS refund_failed,

                  COALESCE(
                      SUM(agreed_price)
                      FILTER (
                          WHERE status::text = 'completed'
                      ),
                      0
                  ) AS completed_booking_value

              FROM bookings
            `,
        ),

        db.query(
          `
              SELECT
                  COUNT(*)::int AS designer_wallets,

                  COALESCE(
                      SUM(available_balance),
                      0
                  ) AS designer_available_balance,

                  COALESCE(
                      SUM(pending_escrow_balance),
                      0
                  ) AS pending_escrow_balance,

                  COALESCE(
                      SUM(pending_payout_balance),
                      0
                  ) AS pending_payout_balance

              FROM designer_wallets
            `,
        ),

        db.query(
          `
              SELECT
                  COUNT(*)::int AS total_payout_requests,

                  COUNT(*)
                  FILTER (
                      WHERE status = 'pending'
                  )::int AS pending_payout_requests,

                  COUNT(*)
                  FILTER (
                      WHERE status = 'processing'
                  )::int AS processing_payout_requests,

                  COUNT(*)
                  FILTER (
                      WHERE status = 'completed'
                  )::int AS completed_payout_requests,

                  COUNT(*)
                  FILTER (
                      WHERE status = 'failed'
                  )::int AS failed_payout_requests,

                  COALESCE(
                      SUM(amount)
                      FILTER (
                          WHERE status = 'pending'
                      ),
                      0
                  ) AS pending_payout_request_value

              FROM designer_payout_requests
            `,
        ),
      ]);

    const ledger = ledgerResult.rows[0];

    const bookings = bookingResult.rows[0];

    const wallets = walletResult.rows[0];

    const payouts = payoutResult.rows[0];

    const creatorPlatformFees = Number(ledger.creator_platform_fees || 0);

    const bookingCommission = Number(ledger.booking_commission_revenue || 0);

    return res.status(200).json({
      status: "success",

      data: {
        revenue: {
          creator_platform_fees: creatorPlatformFees,

          booking_commission_revenue: bookingCommission,

          total_platform_fees: creatorPlatformFees + bookingCommission,

          designer_earnings_released: Number(
            ledger.designer_earnings_released || 0,
          ),

          completed_booking_release_volume: Number(
            ledger.completed_booking_release_volume || 0,
          ),

          refund_volume: Number(ledger.refund_volume || 0),
        },

        ledger: {
          total_transactions: Number(ledger.total_transactions || 0),

          ledger_gross_volume: Number(ledger.ledger_gross_volume || 0),

          escrow_lock_transactions: Number(
            ledger.escrow_lock_transactions || 0,
          ),

          escrow_release_transactions: Number(
            ledger.escrow_release_transactions || 0,
          ),

          refund_transactions: Number(ledger.refund_transactions || 0),
        },

        bookings: {
          total_bookings: Number(bookings.total_bookings || 0),

          funded_bookings: Number(bookings.funded_bookings || 0),

          active_projects: Number(bookings.active_projects || 0),

          completed_bookings: Number(bookings.completed_bookings || 0),

          cancelled_bookings: Number(bookings.cancelled_bookings || 0),

          cancellation_pending: Number(bookings.cancellation_pending || 0),

          refund_pending: Number(bookings.refund_pending || 0),

          refund_failed: Number(bookings.refund_failed || 0),

          completed_booking_value: Number(
            bookings.completed_booking_value || 0,
          ),
        },

        wallets: {
          designer_wallets: Number(wallets.designer_wallets || 0),

          designer_available_balance: Number(
            wallets.designer_available_balance || 0,
          ),

          pending_escrow_balance: Number(wallets.pending_escrow_balance || 0),

          pending_payout_balance: Number(wallets.pending_payout_balance || 0),
        },

        payouts: {
          total_payout_requests: Number(payouts.total_payout_requests || 0),

          pending_payout_requests: Number(payouts.pending_payout_requests || 0),

          processing_payout_requests: Number(
            payouts.processing_payout_requests || 0,
          ),

          completed_payout_requests: Number(
            payouts.completed_payout_requests || 0,
          ),

          failed_payout_requests: Number(payouts.failed_payout_requests || 0),

          pending_payout_request_value: Number(
            payouts.pending_payout_request_value || 0,
          ),
        },
      },
    });
  } catch (error) {
    console.error("getFinancialOverview error:", error);

    return res.status(500).json({
      message: "Financial audit failed.",
    });
  }
};

/* ============================================================
   6. RECENT FINANCIAL TRANSACTIONS
   ============================================================ */

exports.getFinancialTransactions = async (req, res) => {
  let limit = Number.parseInt(req.query.limit, 10);

  if (!Number.isInteger(limit) || limit <= 0) {
    limit = 100;
  }

  limit = Math.min(limit, 250);

  try {
    const result = await db.query(
      `
            SELECT
                id,
                sender_id,
                receiver_id,
                reference_id,
                gross_amount,
                platform_fee_deducted,
                net_amount,
                transaction_type,
                stripe_payment_intent_id,
                payment_provider,
                provider_payment_id,
                provider_transaction_id,
                currency,
                created_at

            FROM transactions

            ORDER BY
                created_at DESC NULLS LAST

            LIMIT $1
          `,
      [limit],
    );

    return res.status(200).json({
      status: "success",

      count: result.rows.length,

      data: result.rows,
    });
  } catch (error) {
    console.error("getFinancialTransactions error:", error);

    return res.status(500).json({
      message: "Failed to retrieve financial transactions.",
    });
  }
};

/* ============================================================
   7. DESIGNER WALLET + PAYOUT DASHBOARD
   ============================================================ */

/**
 * Wallet source of truth:
 *
 * user_id
 * available_balance
 * pending_escrow_balance
 * pending_payout_balance
 */

exports.getPayoutDashboard = async (req, res) => {
  try {
    const [walletResult, payoutResult] = await Promise.all([
      db.query(
        `
              SELECT
                  u.id AS designer_id,
                  u.full_name,
                  u.email,

                  dw.available_balance,
                  dw.pending_escrow_balance,
                  dw.pending_payout_balance

              FROM designer_wallets dw

              JOIN users u
                  ON u.id = dw.user_id

              WHERE
                  dw.available_balance > 0
                  OR dw.pending_escrow_balance > 0
                  OR dw.pending_payout_balance > 0

              ORDER BY
                  dw.available_balance DESC,
                  dw.pending_payout_balance DESC,
                  dw.pending_escrow_balance DESC
            `,
      ),

      db.query(
        `
              SELECT
                  pr.id,
                  pr.designer_id,
                  u.full_name,
                  u.email,

                  pr.amount,
                  pr.currency,
                  pr.payout_method,
                  pr.provider,
                  pr.destination_summary,

                  pr.status,
                  pr.provider_status,

                  pr.provider_payout_id,
                  pr.provider_batch_id,
                  pr.provider_transaction_id,

                  pr.failure_reason,

                  pr.requested_at,
                  pr.processing_at,
                  pr.completed_at,
                  pr.failed_at,
                  pr.cancelled_at,
                  pr.updated_at

              FROM designer_payout_requests pr

              JOIN users u
                  ON u.id = pr.designer_id

              ORDER BY
                  pr.requested_at DESC

              LIMIT 100
            `,
      ),
    ]);

    return res.status(200).json({
      status: "success",

      data: {
        wallets: walletResult.rows,

        payout_requests: payoutResult.rows,
      },
    });
  } catch (error) {
    console.error("getPayoutDashboard error:", error);

    return res.status(500).json({
      message: "Payout dashboard failed.",
    });
  }
};

/* ============================================================
   8. GLOBAL / DASHBOARD STATISTICS
   ============================================================ */

exports.getGlobalStats = async (req, res) => {
  try {
    const result = await db.query(
      `
            SELECT
                (
                    SELECT COUNT(*)
                    FROM users
                    WHERE role = 'designer'
                )::int AS designer_count,

                (
                    SELECT COUNT(*)
                    FROM users
                    WHERE role = 'creator'
                )::int AS creator_count,

                (
                    SELECT COUNT(*)
                    FROM users
                    WHERE
                        role = 'designer'
                        AND approval_status = 'pending'
                )::int AS pending_designers,

                (
                    SELECT COUNT(*)
                    FROM designs
                    WHERE is_published = TRUE
                )::int AS live_designs,

                (
                    SELECT COUNT(*)
                    FROM bookings
                    WHERE status::text = 'funded'
                )::int AS funded_projects,

                (
                    SELECT COUNT(*)
                    FROM bookings
                    WHERE status::text IN (
                        'progress',
                        'review_prototype',
                        'final_production',
                        'review_final'
                    )
                )::int AS ongoing_projects,

                (
                    SELECT COUNT(*)
                    FROM bookings
                    WHERE status::text = 'completed'
                )::int AS completed_projects,

                (
                    SELECT COUNT(*)
                    FROM bookings
                    WHERE status::text = 'cancelled'
                )::int AS cancelled_projects
          `,
    );

    return res.status(200).json({
      status: "success",

      data: result.rows[0],
    });
  } catch (error) {
    console.error("getGlobalStats error:", error);

    return res.status(500).json({
      message: "Stats retrieval failed.",
    });
  }
};

/**
 * Dashboard-friendly statistics.
 *
 * We intentionally do NOT fake an "online now" count.
 */

exports.getDashboardStats = async (req, res) => {
  try {
    const [distributionResult, pendingResult, bookingResult] =
      await Promise.all([
        db.query(
          `
              SELECT
                  role,
                  COUNT(*)::int AS count
              FROM users
              GROUP BY role
              ORDER BY role
            `,
        ),

        db.query(
          `
              SELECT
                  COUNT(*)::int AS count
              FROM users
              WHERE
                  role = 'designer'
                  AND approval_status = 'pending'
            `,
        ),

        db.query(
          `
              SELECT
                  COUNT(*)
                  FILTER (
                      WHERE status::text = 'funded'
                  )::int AS funded_bookings,

                  COUNT(*)
                  FILTER (
                      WHERE status::text IN (
                          'progress',
                          'review_prototype',
                          'final_production',
                          'review_final'
                      )
                  )::int AS active_projects,

                  COUNT(*)
                  FILTER (
                      WHERE status::text = 'completed'
                  )::int AS completed_bookings

              FROM bookings
            `,
        ),
      ]);

    return res.status(200).json({
      status: "success",

      user_distribution: distributionResult.rows,

      pending_designers: Number(pendingResult.rows[0]?.count || 0),

      online_users: null,

      online_tracking_available: false,

      bookings: {
        funded: Number(bookingResult.rows[0]?.funded_bookings || 0),

        active: Number(bookingResult.rows[0]?.active_projects || 0),

        completed: Number(bookingResult.rows[0]?.completed_bookings || 0),
      },
    });
  } catch (error) {
    console.error("getDashboardStats error:", error);

    return res.status(500).json({
      message: "Dashboard statistics failed.",
    });
  }
};

/* ============================================================
   9. DESIGN MODERATION
   ============================================================ */

/**
 * Allowed actions:
 *
 * unpublish
 * delete
 */

exports.moderateDesign = async (req, res) => {
  const designId = req.params.designId || req.params.id;

  const action =
    typeof req.body.action === "string"
      ? req.body.action.trim().toLowerCase()
      : "";

  if (!designId) {
    return res.status(400).json({
      message: "Design ID is required.",
    });
  }

  if (!["unpublish", "delete"].includes(action)) {
    return res.status(400).json({
      message: "Invalid moderation action. Use unpublish or delete.",
    });
  }

  try {
    let result;

    if (action === "unpublish") {
      result = await db.query(
        `
              UPDATE designs
              SET is_published = FALSE
              WHERE id = $1
              RETURNING
                  id,
                  is_published
            `,
        [designId],
      );
    } else {
      result = await db.query(
        `
              DELETE FROM designs
              WHERE id = $1
              RETURNING id
            `,
        [designId],
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Design not found.",
      });
    }

    return res.status(200).json({
      status: "success",

      message:
        action === "unpublish"
          ? "Design unpublished successfully."
          : "Design deleted successfully.",

      data: result.rows[0],
    });
  } catch (error) {
    console.error("moderateDesign error:", error);

    return res.status(500).json({
      message: "Moderation action failed.",
    });
  }
};

/* ============================================================
   10. SHOWCASE HERO MANAGEMENT
   ============================================================ */

/**
 * Super Admin:
 *
 * GET /api/v1/superadmin/showcase-hero
 *
 * Returns the complete stored Hero configuration.
 */

exports.getShowcaseHeroSettings = async (req, res) => {
  try {
    const settings = await getShowcaseHeroRow();

    if (!settings) {
      return res.status(404).json({
        message: "Showcase Hero configuration was not found.",
      });
    }

    return res.status(200).json({
      status: "success",

      data: {
        ...settings,

        rotation_seconds: Number(settings.rotation_seconds || 6),

        slideshow_images: Array.isArray(settings.slideshow_images)
          ? settings.slideshow_images
          : [],
      },
    });
  } catch (error) {
    console.error("getShowcaseHeroSettings error:", error);

    return res.status(500).json({
      message: "Failed to retrieve Showcase Hero configuration.",
    });
  }
};

/**
 * Public:
 *
 * GET /api/v1/showcase-hero
 *
 * Read-only configuration consumed by:
 *
 * CreatorShowcase.jsx
 * DesignerMarketplace.jsx
 *
 * Only the ACTIVE media mode is exposed.
 *
 * If configuration cannot be loaded, a disabled response
 * is deliberately returned so the frontend can safely use
 * its existing Hero fallback.
 */

exports.getPublicShowcaseHero = async (req, res) => {
  try {
    const settings = await getShowcaseHeroRow();

    if (!settings) {
      return res.status(200).json({
        status: "success",

        data: {
          is_enabled: false,

          mode: "slideshow",

          slideshow_images: [],

          video_url: null,

          video_poster_url: null,

          rotation_seconds: 6,
        },
      });
    }

    const enabled = settings.is_enabled === true;

    const mode = settings.mode === "video" ? "video" : "slideshow";

    const savedImages = Array.isArray(settings.slideshow_images)
      ? settings.slideshow_images
      : [];

    return res.status(200).json({
      status: "success",

      data: {
        is_enabled: enabled,

        mode,

        rotation_seconds: Number(settings.rotation_seconds || 6),

        /**
         * Only the selected mode is exposed publicly.
         */

        slideshow_images: enabled && mode === "slideshow" ? savedImages : [],

        video_url:
          enabled && mode === "video" ? settings.video_url || null : null,

        video_poster_url:
          enabled && mode === "video"
            ? settings.video_poster_url || null
            : null,
      },
    });
  } catch (error) {
    console.error("getPublicShowcaseHero error:", error);

    /**
     * Hero settings failure must NOT make either Showcase
     * unavailable.
     *
     * Disabled configuration tells the frontend to fall
     * back to its normal Hero.
     */

    return res.status(200).json({
      status: "success",

      data: {
        is_enabled: false,

        mode: "slideshow",

        slideshow_images: [],

        video_url: null,

        video_poster_url: null,

        rotation_seconds: 6,
      },
    });
  }
};

/**
 * Super Admin:
 *
 * PATCH /api/v1/superadmin/showcase-hero
 *
 * Supported body:
 *
 * {
 *   "mode": "slideshow" | "video",
 *   "slideshow_images": [],
 *   "video_url": "...",
 *   "video_poster_url": "...",
 *   "rotation_seconds": 6,
 *   "is_enabled": true
 * }
 *
 * RULES
 * ------------------------------------------------------------
 *
 * Enabled slideshow:
 *
 * 3–5 images required.
 *
 * Enabled video:
 *
 * video_url required.
 *
 * Only the selected mode is rendered publicly.
 *
 * Inactive media remains stored so a Super Admin can move:
 *
 * slideshow -> video -> slideshow
 *
 * without losing the previous configuration.
 */

exports.updateShowcaseHeroSettings = async (req, res) => {
  const body = req.body || {};

  try {
    const current = await getShowcaseHeroRow();

    if (!current) {
      return res.status(404).json({
        message:
          "Showcase Hero configuration was not found. Run the Hero settings migration first.",
      });
    }

    /* --------------------------------------------------------
         MODE
         -------------------------------------------------------- */

    let mode = current.mode;

    if (hasOwn(body, "mode")) {
      mode = normalizeHeroMode(body.mode);

      if (!mode) {
        return res.status(400).json({
          message: "Hero mode must be either slideshow or video.",
        });
      }
    }

    /* --------------------------------------------------------
         ENABLED
         -------------------------------------------------------- */

    let isEnabled = current.is_enabled === true;

    if (hasOwn(body, "is_enabled")) {
      if (typeof body.is_enabled !== "boolean") {
        return res.status(400).json({
          message: "is_enabled must be true or false.",
        });
      }

      isEnabled = body.is_enabled;
    }

    /* --------------------------------------------------------
         ROTATION SPEED
         -------------------------------------------------------- */

    let rotationSeconds = Number(current.rotation_seconds || 6);

    if (hasOwn(body, "rotation_seconds")) {
      const parsedRotation = Number(body.rotation_seconds);

      if (
        !Number.isInteger(parsedRotation) ||
        parsedRotation < 3 ||
        parsedRotation > 30
      ) {
        return res.status(400).json({
          message:
            "Slideshow rotation must be an integer between 3 and 30 seconds.",
        });
      }

      rotationSeconds = parsedRotation;
    }

    /* --------------------------------------------------------
         SLIDESHOW IMAGES
         -------------------------------------------------------- */

    let slideshowImages = Array.isArray(current.slideshow_images)
      ? current.slideshow_images
      : [];

    if (hasOwn(body, "slideshow_images")) {
      const normalizedImages = normalizeHeroImages(body.slideshow_images);

      if (!normalizedImages) {
        return res.status(400).json({
          message: "slideshow_images must be an array.",
        });
      }

      if (normalizedImages.length > 5) {
        return res.status(400).json({
          message: "The Hero slideshow supports a maximum of 5 images.",
        });
      }

      const invalidImage = normalizedImages.find(
        (url) => !isAllowedHeroMediaUrl(url),
      );

      if (invalidImage) {
        return res.status(400).json({
          message:
            "Every slideshow image must use a valid HTTPS URL or application-relative URL.",
        });
      }

      slideshowImages = normalizedImages;
    }

    /* --------------------------------------------------------
         VIDEO
         -------------------------------------------------------- */

    let videoUrl = current.video_url || null;

    if (hasOwn(body, "video_url")) {
      if (
        body.video_url !== null &&
        body.video_url !== undefined &&
        typeof body.video_url !== "string"
      ) {
        return res.status(400).json({
          message: "video_url must be a URL string or null.",
        });
      }

      videoUrl = normalizeHeroUrl(body.video_url);

      if (videoUrl && !isAllowedHeroMediaUrl(videoUrl)) {
        return res.status(400).json({
          message: "Video URL must use HTTPS or an application-relative URL.",
        });
      }
    }

    /* --------------------------------------------------------
         VIDEO POSTER
         -------------------------------------------------------- */

    let videoPosterUrl = current.video_poster_url || null;

    if (hasOwn(body, "video_poster_url")) {
      if (
        body.video_poster_url !== null &&
        body.video_poster_url !== undefined &&
        typeof body.video_poster_url !== "string"
      ) {
        return res.status(400).json({
          message: "video_poster_url must be a URL string or null.",
        });
      }

      videoPosterUrl = normalizeHeroUrl(body.video_poster_url);

      if (videoPosterUrl && !isAllowedHeroMediaUrl(videoPosterUrl)) {
        return res.status(400).json({
          message:
            "Video poster URL must use HTTPS or an application-relative URL.",
        });
      }
    }

    /* --------------------------------------------------------
         ACTIVE MODE VALIDATION
         -------------------------------------------------------- */

    if (isEnabled && mode === "slideshow") {
      if (slideshowImages.length < 3 || slideshowImages.length > 5) {
        return res.status(400).json({
          message: "An enabled slideshow requires between 3 and 5 images.",
        });
      }
    }

    if (isEnabled && mode === "video") {
      if (!videoUrl) {
        return res.status(400).json({
          message: "An enabled video Hero requires a video URL.",
        });
      }
    }

    /* --------------------------------------------------------
         UPDATED BY
         -------------------------------------------------------- */

    const updatedBy = req.user?.id || req.user?.user_id || null;

    /* --------------------------------------------------------
         PERSIST
         -------------------------------------------------------- */

    const result = await db.query(
      `
            UPDATE showcase_hero_settings
            SET
                mode = $1,
                slideshow_images = $2::jsonb,
                video_url = $3,
                video_poster_url = $4,
                rotation_seconds = $5,
                is_enabled = $6,
                updated_by = $7,
                updated_at = NOW()
            WHERE id = 1
            RETURNING
                id,
                mode,
                slideshow_images,
                video_url,
                video_poster_url,
                rotation_seconds,
                is_enabled,
                updated_by,
                created_at,
                updated_at
          `,
      [
        mode,

        JSON.stringify(slideshowImages),

        videoUrl,

        videoPosterUrl,

        rotationSeconds,

        isEnabled,

        updatedBy,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Showcase Hero configuration was not found.",
      });
    }

    return res.status(200).json({
      status: "success",

      message: "Showcase Hero configuration updated successfully.",

      data: result.rows[0],
    });
  } catch (error) {
    console.error("updateShowcaseHeroSettings error:", error);

    return res.status(500).json({
      message: "Failed to update Showcase Hero configuration.",
    });
  }
};
