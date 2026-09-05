"use strict";

const db = require("../config/db");
const bcrypt = require("bcryptjs");

const { decryptBankDetails } = require("../utils/bankDetailsCrypto");

/**
 * ============================================================
 * DesignByYou — Super Admin Controller
 * Version 2.2
 * ============================================================
 *
 * Current finance model:
 *
 * Customer / creator payments
 * → DesignByYou Stripe platform account
 *
 * Designer earnings
 * → internal designer wallet
 *
 * All designer withdrawals
 * → verified manual bank payout
 * → Super Admin bank transfer
 *
 * Stripe Connect is no longer used for NEW designer payouts.
 *
 * Designer booking commission policy:
 *
 * Bronze   (0-4 completed bookings)   -> 10%
 * Silver   (5-19 completed bookings)  -> 15%
 * Gold     (20-34 completed bookings) -> 20%
 * Platinum (35-49 completed bookings) -> 25%
 * Diamond  (50+ completed bookings)   -> 30%
 *
 * The commission is PAID TO the Designer. The remaining booking
 * base amount is retained by the platform.
 *
 * Global commission editing is disabled. Tier is the source of
 * truth and commission_rate is maintained as the stored mirror
 * of the tier policy.
 *
 * Historical Stripe records remain preserved elsewhere for
 * financial/audit history.
 *
 * ============================================================
 * MANUAL PAYOUT DESTINATION SAFETY
 * ============================================================
 *
 * designer_payout_requests.destination_summary is the
 * authoritative historical masked payout destination.
 *
 * Example:
 *
 * Test Bank Nepal ••••3456
 *
 * Once a payout references a bank account, designer-side
 * finance logic now creates a NEW bank-account row when bank
 * details change rather than modifying that historical row.
 *
 * Legacy data may already contain an old payout referencing a
 * bank-account row that was subsequently modified.
 *
 * Therefore this controller:
 *
 * 1. compares payout.destination_summary with the bank row;
 * 2. does not present mismatched current bank data as though it
 *    belonged to an old payout;
 * 3. refuses to decrypt mismatched bank data;
 * 4. refuses to move a payout to processing when its bank
 *    snapshot does not match;
 * 5. revalidates the destination again before completion.
 *
 * Sensitive bank details are decrypted ONLY for the dedicated
 * Super Admin payout-detail endpoint and are never logged.
 *
 * Authentication/authorization belongs in superAdminRoutes.js.
 *
 * All Super Admin routes should remain protected by:
 *
 * protect
 * authorize("superadmin")
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

/* ============================================================
   MANUAL PAYOUT HELPERS
   ============================================================ */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value) =>
  typeof value === "string" && UUID_PATTERN.test(value.trim());

const cleanFinanceText = (value, maxLength = 500) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
};

const normalizePayoutStatus = (value) => {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";

  const allowed = [
    "",
    "pending",
    "processing",
    "completed",
    "failed",
    "cancelled",
  ];

  return allowed.includes(status) ? status : null;
};

/**
 * Recreates the same SAFE masked destination format used
 * when the designer payout request was originally created.
 *
 * This uses joined bank-account aliases from the Super Admin
 * queries.
 */
const buildJoinedBankDestinationSummary = (row) => {
  if (!row) {
    return null;
  }

  const bankName = cleanFinanceText(row.bank_name, 120);

  const last4 = row.iban_last4 || row.account_number_last4 || null;

  if (last4) {
    return `${bankName} ••••${last4}`;
  }

  return bankName || "Bank transfer";
};

/**
 * Historical destination integrity check.
 *
 * destination_summary on designer_payout_requests is treated
 * as the authoritative immutable masked snapshot.
 *
 * The attached bank row is considered usable only when its
 * current safe masked representation still matches that
 * snapshot.
 */
const isManualPayoutBankSnapshotConsistent = (row) => {
  if (!row || !row.bank_account_id) {
    return false;
  }

  const payoutDestination = cleanFinanceText(row.destination_summary, 255);

  const joinedBankDestination = cleanFinanceText(
    buildJoinedBankDestinationSummary(row),
    255,
  );

  if (!payoutDestination || !joinedBankDestination) {
    return false;
  }

  return payoutDestination === joinedBankDestination;
};

const manualPayoutResponse = (row) => {
  if (!row) {
    return null;
  }

  const snapshotConsistent = isManualPayoutBankSnapshotConsistent(row);

  return {
    id: row.id,

    designer_id: row.designer_id,

    full_name: row.full_name || null,

    email: row.email || null,

    designer_country: row.designer_country || null,

    amount: row.amount,

    currency: row.currency,

    payout_method: row.payout_method,

    provider: row.provider,

    bank_account_id: row.bank_account_id || null,

    destination_summary: row.destination_summary || null,

    bank_account_snapshot_consistent: snapshotConsistent,

    bank_account_snapshot_warning:
      row.bank_account_id && !snapshotConsistent
        ? "The attached bank-account row no longer matches this payout's stored historical destination. The payout destination_summary remains authoritative."
        : null,

    status: row.status,

    provider_status: row.provider_status || null,

    provider_transaction_id: row.provider_transaction_id || null,

    failure_reason: row.failure_reason || null,

    requested_at: row.requested_at,

    processing_at: row.processing_at,

    completed_at: row.completed_at,

    failed_at: row.failed_at,

    cancelled_at: row.cancelled_at,

    updated_at: row.updated_at,

    bank_account:
      row.bank_account_id && snapshotConsistent
        ? {
            id: row.bank_account_id,

            country_code: row.bank_country_code || null,

            account_holder_name: row.bank_account_holder_name || null,

            bank_name: row.bank_name || null,

            currency: row.bank_currency || null,

            account_number_last4: row.account_number_last4 || null,

            iban_last4: row.iban_last4 || null,

            verification_status: row.bank_verification_status || null,

            is_default: row.bank_is_default === true,

            is_active: row.bank_is_active === true,

            verified_at: row.bank_verified_at || null,
          }
        : null,
  };
};

const getAttachedManualPayoutBankAccount = async (queryable, payout) => {
  if (!payout?.bank_account_id || !payout?.designer_id) {
    return null;
  }

  const result = await queryable.query(
    `
        SELECT
            ba.id,

            ba.country_code
                AS bank_country_code,

            ba.account_holder_name
                AS bank_account_holder_name,

            ba.bank_name,

            ba.currency
                AS bank_currency,

            ba.account_number_last4,

            ba.iban_last4,

            ba.verification_status
                AS bank_verification_status,

            ba.is_default
                AS bank_is_default,

            ba.is_active
                AS bank_is_active,

            ba.verified_at
                AS bank_verified_at

        FROM designer_bank_accounts ba

        WHERE
            ba.id = $1

            AND
            ba.designer_id = $2

        LIMIT 1
      `,
    [payout.bank_account_id, payout.designer_id],
  );

  return result.rows[0] || null;
};

const validateAttachedBankForManualPayout = async (queryable, payout) => {
  const bankAccount = await getAttachedManualPayoutBankAccount(
    queryable,
    payout,
  );

  if (!bankAccount) {
    return {
      success: false,

      code: "PAYOUT_BANK_ACCOUNT_MISSING",

      message: "The payout does not reference a usable bank account.",
    };
  }

  if (bankAccount.bank_verification_status !== "verified") {
    return {
      success: false,

      code: "PAYOUT_BANK_ACCOUNT_NOT_VERIFIED",

      message: "The payout does not reference a verified bank account.",
    };
  }

  const comparisonRow = {
    ...payout,
    ...bankAccount,
  };

  if (!isManualPayoutBankSnapshotConsistent(comparisonRow)) {
    return {
      success: false,

      code: "PAYOUT_BANK_SNAPSHOT_MISMATCH",

      message:
        "The bank account currently attached to this payout no longer matches the payout's stored destination snapshot. Do not use the current bank details for this payout; manual reconciliation is required.",
    };
  }

  return {
    success: true,

    bankAccount,

    comparisonRow,
  };
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

          WHERE LOWER(email) =
                LOWER($1)

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

          ORDER BY
              created_at DESC
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
              ON dp.user_id =
                 u.id

          WHERE
              u.role =
                  'designer'

              AND
              u.approval_status =
                  'pending'

          ORDER BY
              u.created_at ASC
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
   4. DESIGNER TIER COMMISSION POLICY
   ============================================================ */

/**
 * GET
 * /api/v1/superadmin/commission
 *
 * Read-only policy monitoring.
 *
 * The Designer tier is the source of truth:
 *
 * Bronze   -> 10% -> 0-4 completed bookings
 * Silver   -> 15% -> 5-19 completed bookings
 * Gold     -> 20% -> 20-34 completed bookings
 * Platinum -> 25% -> 35-49 completed bookings
 * Diamond  -> 30% -> 50+ completed bookings
 *
 * A mixed set of commission rates is EXPECTED because Designers
 * belong to different tiers.
 *
 * The endpoint also reports any profile whose stored tier and
 * commission_rate no longer match the tier policy.
 */
exports.getCommissionOverview = async (req, res) => {
  try {
    const result = await db.query(
      `
          SELECT
              COUNT(*)::int
                  AS designer_profiles,

              COUNT(*)
              FILTER (
                  WHERE
                    tier::text =
                    'bronze'
              )::int
                  AS bronze_designers,

              COUNT(*)
              FILTER (
                  WHERE
                    tier::text =
                    'silver'
              )::int
                  AS silver_designers,

              COUNT(*)
              FILTER (
                  WHERE
                    tier::text =
                    'gold'
              )::int
                  AS gold_designers,

              COUNT(*)
              FILTER (
                  WHERE
                    tier::text =
                    'platinum'
              )::int
                  AS platinum_designers,

              COUNT(*)
              FILTER (
                  WHERE
                    tier::text =
                    'diamond'
              )::int
                  AS diamond_designers,

              COUNT(*)
              FILTER (
                  WHERE
                    tier IS NULL

                    OR
                    commission_rate IS NULL

                    OR
                    commission_rate <>
                        CASE
                          WHEN tier::text = 'bronze'
                            THEN 10.00

                          WHEN tier::text = 'silver'
                            THEN 15.00

                          WHEN tier::text = 'gold'
                            THEN 20.00

                          WHEN tier::text = 'platinum'
                            THEN 25.00

                          WHEN tier::text = 'diamond'
                            THEN 30.00

                          ELSE -1.00
                        END
              )::int
                  AS policy_mismatches

          FROM designer_profiles
        `,
    );

    const counts = result.rows[0] || {};

    const policyMismatches = Number(counts.policy_mismatches || 0);

    return res.status(200).json({
      status: "success",

      data: {
        mode: "tier_based",

        editable: false,

        designer_profiles: Number(counts.designer_profiles || 0),

        policy_mismatches: policyMismatches,

        policy_consistent: policyMismatches === 0,

        policy: [
          {
            tier: "bronze",

            minimum_completed_bookings: 0,

            maximum_completed_bookings: 4,

            commission_rate: 10,

            designer_count: Number(counts.bronze_designers || 0),
          },

          {
            tier: "silver",

            minimum_completed_bookings: 5,

            maximum_completed_bookings: 19,

            commission_rate: 15,

            designer_count: Number(counts.silver_designers || 0),
          },

          {
            tier: "gold",

            minimum_completed_bookings: 20,

            maximum_completed_bookings: 34,

            commission_rate: 20,

            designer_count: Number(counts.gold_designers || 0),
          },

          {
            tier: "platinum",

            minimum_completed_bookings: 35,

            maximum_completed_bookings: 49,

            commission_rate: 25,

            designer_count: Number(counts.platinum_designers || 0),
          },

          {
            tier: "diamond",

            minimum_completed_bookings: 50,

            maximum_completed_bookings: null,

            commission_rate: 30,

            designer_count: Number(counts.diamond_designers || 0),
          },
        ],
      },
    });
  } catch (error) {
    console.error("getCommissionOverview error:", error);

    return res.status(500).json({
      message: "Failed to retrieve Designer tier commission policy.",
    });
  }
};

/**
 * Compatibility safety handler.
 *
 * Older Super Admin routes/frontends may still call:
 *
 * PATCH /api/v1/superadmin/update-commission
 * PATCH /api/v1/superadmin/business/commission
 *
 * Global updates are intentionally disabled so a stale client
 * can never overwrite tier-based Designer commission rates.
 *
 * The routes should be removed in superAdminRoutes.js, but this
 * handler remains harmless while the migration is in progress.
 */
exports.updateGlobalCommission = async (req, res) => {
  return res.status(410).json({
    status: "fail",

    code: "GLOBAL_COMMISSION_DISABLED",

    message:
      "Global commission editing is disabled. Designer commission is determined automatically by tier: Bronze 10%, Silver 15%, Gold 20%, Platinum 25%, and Diamond 30%.",

    data: {
      mode: "tier_based",

      editable: false,
    },
  });
};

/* ============================================================
   5. PLATFORM FINANCIAL OVERVIEW
   ============================================================ */

exports.getFinancialOverview = async (req, res) => {
  try {
    const [ledgerResult, bookingResult, walletResult, payoutResult] =
      await Promise.all([
        db.query(
          `
            SELECT
                COUNT(*)::int
                    AS total_transactions,

                COALESCE(
                    SUM(gross_amount),
                    0
                ) AS ledger_gross_volume,

                COALESCE(
                    SUM(
                        platform_fee_deducted
                    )
                    FILTER (
                        WHERE
                          transaction_type::text =
                          'escrow_lock'
                    ),
                    0
                ) AS creator_platform_fees,

                COALESCE(
                    SUM(
                        platform_fee_deducted
                    )
                    FILTER (
                        WHERE
                          transaction_type::text =
                          'escrow_release'
                    ),
                    0
                ) AS booking_platform_retained,

                COALESCE(
                    SUM(net_amount)
                    FILTER (
                        WHERE
                          transaction_type::text =
                          'escrow_release'
                    ),
                    0
                ) AS designer_earnings_released,

                COALESCE(
                    SUM(gross_amount)
                    FILTER (
                        WHERE
                          transaction_type::text =
                          'escrow_release'
                    ),
                    0
                ) AS completed_booking_release_volume,

                COALESCE(
                    SUM(gross_amount)
                    FILTER (
                        WHERE
                          transaction_type::text =
                          'refund'
                    ),
                    0
                ) AS refund_volume,

                COUNT(*)
                FILTER (
                    WHERE
                      transaction_type::text =
                      'escrow_lock'
                )::int
                    AS escrow_lock_transactions,

                COUNT(*)
                FILTER (
                    WHERE
                      transaction_type::text =
                      'escrow_release'
                )::int
                    AS escrow_release_transactions,

                COUNT(*)
                FILTER (
                    WHERE
                      transaction_type::text =
                      'refund'
                )::int
                    AS refund_transactions

            FROM transactions
          `,
        ),

        db.query(
          `
            SELECT
                COUNT(*)::int
                    AS total_bookings,

                COUNT(*)
                FILTER (
                    WHERE
                      status::text =
                      'funded'
                )::int
                    AS funded_bookings,

                COUNT(*)
                FILTER (
                    WHERE
                      status::text IN (
                          'progress',
                          'review_prototype',
                          'final_production',
                          'review_final'
                      )
                )::int
                    AS active_projects,

                COUNT(*)
                FILTER (
                    WHERE
                      status::text =
                      'completed'
                )::int
                    AS completed_bookings,

                COUNT(*)
                FILTER (
                    WHERE
                      status::text =
                      'cancelled'
                )::int
                    AS cancelled_bookings,

                COUNT(*)
                FILTER (
                    WHERE
                      status::text =
                      'cancellation_pending'
                )::int
                    AS cancellation_pending,

                COUNT(*)
                FILTER (
                    WHERE
                      status::text =
                      'refund_pending'
                )::int
                    AS refund_pending,

                COUNT(*)
                FILTER (
                    WHERE
                      status::text =
                      'refund_failed'
                )::int
                    AS refund_failed,

                COALESCE(
                    SUM(agreed_price)
                    FILTER (
                        WHERE
                          status::text =
                          'completed'
                    ),
                    0
                ) AS completed_booking_value

            FROM bookings
          `,
        ),

        db.query(
          `
            SELECT
                COUNT(*)::int
                    AS designer_wallets,

                COALESCE(
                    SUM(
                        available_balance
                    ),
                    0
                ) AS designer_available_balance,

                COALESCE(
                    SUM(
                        pending_escrow_balance
                    ),
                    0
                ) AS pending_escrow_balance,

                COALESCE(
                    SUM(
                        pending_payout_balance
                    ),
                    0
                ) AS pending_payout_balance

            FROM designer_wallets
          `,
        ),

        db.query(
          `
            SELECT
                COUNT(*)::int
                    AS total_payout_requests,

                COUNT(*)
                FILTER (
                    WHERE
                      status =
                      'pending'
                )::int
                    AS pending_payout_requests,

                COUNT(*)
                FILTER (
                    WHERE
                      status =
                      'processing'
                )::int
                    AS processing_payout_requests,

                COUNT(*)
                FILTER (
                    WHERE
                      status =
                      'completed'
                )::int
                    AS completed_payout_requests,

                COUNT(*)
                FILTER (
                    WHERE
                      status =
                      'failed'
                )::int
                    AS failed_payout_requests,

                COALESCE(
                    SUM(amount)
                    FILTER (
                        WHERE
                          status =
                          'pending'
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

    const bookingPlatformRetained = Number(
      ledger.booking_platform_retained || 0,
    );

    return res.status(200).json({
      status: "success",

      data: {
        revenue: {
          creator_platform_fees: creatorPlatformFees,

          booking_platform_retained: bookingPlatformRetained,

          /*
           * Temporary compatibility alias.
           * Remove after the frontend dashboard is migrated.
           */
          booking_commission_revenue: bookingPlatformRetained,

          total_platform_fees: creatorPlatformFees + bookingPlatformRetained,

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
              created_at DESC
              NULLS LAST

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

exports.getPayoutDashboard = async (req, res) => {
  try {
    const [walletResult, payoutResult] = await Promise.all([
      db.query(
        `
            SELECT
                u.id
                    AS designer_id,

                u.full_name,
                u.email,

                dw.available_balance,
                dw.pending_escrow_balance,
                dw.pending_payout_balance

            FROM designer_wallets dw

            JOIN users u
                ON u.id =
                   dw.user_id

            WHERE
                dw.available_balance > 0

                OR
                dw.pending_escrow_balance > 0

                OR
                dw.pending_payout_balance > 0

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
                ON u.id =
                   pr.designer_id

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
   8. MANUAL BANK PAYOUT ADMINISTRATION
   ============================================================ */

exports.getManualPayoutRequests = async (req, res) => {
  const status = normalizePayoutStatus(req.query.status);

  if (status === null) {
    return res.status(400).json({
      message: "Invalid payout status filter.",
    });
  }

  let limit = Number.parseInt(req.query.limit, 10);

  if (!Number.isInteger(limit) || limit <= 0) {
    limit = 100;
  }

  limit = Math.min(limit, 250);

  try {
    const params = [];

    let statusFilter = "";

    if (status) {
      params.push(status);

      statusFilter = `
        AND pr.status =
            $${params.length}
      `;
    }

    params.push(limit);

    const result = await db.query(
      `
          SELECT
              pr.id,
              pr.designer_id,

              u.full_name,
              u.email,

              dp.country
                  AS designer_country,

              pr.amount,
              pr.currency,

              pr.payout_method,
              pr.provider,

              pr.bank_account_id,

              pr.destination_summary,

              pr.status,
              pr.provider_status,

              pr.provider_transaction_id,

              pr.failure_reason,

              pr.requested_at,
              pr.processing_at,
              pr.completed_at,
              pr.failed_at,
              pr.cancelled_at,
              pr.updated_at,

              ba.country_code
                  AS bank_country_code,

              ba.account_holder_name
                  AS bank_account_holder_name,

              ba.bank_name,

              ba.currency
                  AS bank_currency,

              ba.account_number_last4,

              ba.iban_last4,

              ba.verification_status
                  AS bank_verification_status,

              ba.is_default
                  AS bank_is_default,

              ba.is_active
                  AS bank_is_active,

              ba.verified_at
                  AS bank_verified_at

          FROM designer_payout_requests pr

          JOIN users u
              ON u.id =
                 pr.designer_id

          LEFT JOIN designer_profiles dp
              ON dp.user_id =
                 pr.designer_id

          LEFT JOIN designer_bank_accounts ba
              ON ba.id =
                 pr.bank_account_id

              AND ba.designer_id =
                 pr.designer_id

          WHERE
              pr.payout_method =
                  'manual'

              AND
              pr.provider
                  IS NULL

              ${statusFilter}

          ORDER BY
              pr.requested_at DESC

          LIMIT
              $${params.length}
        `,
      params,
    );

    return res.status(200).json({
      status: "success",

      count: result.rows.length,

      data: result.rows.map(manualPayoutResponse),
    });
  } catch (error) {
    console.error("getManualPayoutRequests error:", error);

    return res.status(500).json({
      message: "Failed to retrieve manual payout requests.",
    });
  }
};

exports.getManualPayoutRequest = async (req, res) => {
  const payoutId = String(req.params.payoutId || "").trim();

  if (!isUuid(payoutId)) {
    return res.status(400).json({
      message: "A valid payout request ID is required.",
    });
  }

  try {
    const result = await db.query(
      `
          SELECT
              pr.id,
              pr.designer_id,

              u.full_name,
              u.email,

              dp.country
                  AS designer_country,

              pr.amount,
              pr.currency,

              pr.payout_method,
              pr.provider,

              pr.bank_account_id,

              pr.destination_summary,

              pr.status,
              pr.provider_status,

              pr.provider_transaction_id,

              pr.failure_reason,

              pr.requested_at,
              pr.processing_at,
              pr.completed_at,
              pr.failed_at,
              pr.cancelled_at,
              pr.updated_at,

              ba.country_code
                  AS bank_country_code,

              ba.account_holder_name
                  AS bank_account_holder_name,

              ba.bank_name,

              ba.currency
                  AS bank_currency,

              ba.account_number_last4,

              ba.iban_last4,

              ba.verification_status
                  AS bank_verification_status,

              ba.is_default
                  AS bank_is_default,

              ba.is_active
                  AS bank_is_active,

              ba.verified_at
                  AS bank_verified_at,

              ba.details_ciphertext,
              ba.details_iv,
              ba.details_auth_tag,
              ba.encryption_version

          FROM designer_payout_requests pr

          JOIN users u
              ON u.id =
                 pr.designer_id

          LEFT JOIN designer_profiles dp
              ON dp.user_id =
                 pr.designer_id

          LEFT JOIN designer_bank_accounts ba
              ON ba.id =
                 pr.bank_account_id

              AND ba.designer_id =
                 pr.designer_id

          WHERE
              pr.id = $1

              AND
              pr.payout_method =
                  'manual'

              AND
              pr.provider
                  IS NULL

          LIMIT 1
        `,
      [payoutId],
    );

    const payout = result.rows[0];

    if (!payout) {
      return res.status(404).json({
        message: "Manual payout request not found.",
      });
    }

    if (!payout.bank_account_id) {
      return res.status(409).json({
        status: "fail",

        code: "PAYOUT_BANK_ACCOUNT_MISSING",

        message: "The payout request does not reference a bank account.",

        data: manualPayoutResponse(payout),
      });
    }

    if (!isManualPayoutBankSnapshotConsistent(payout)) {
      res.set("Cache-Control", "no-store");

      return res.status(409).json({
        status: "fail",

        code: "PAYOUT_BANK_SNAPSHOT_MISMATCH",

        message:
          "The bank account currently attached to this payout does not match the payout's stored historical destination. Current bank credentials will not be exposed for this payout.",

        data: {
          ...manualPayoutResponse(payout),

          bank_details: null,
        },
      });
    }

    if (
      !payout.details_ciphertext ||
      !payout.details_iv ||
      !payout.details_auth_tag
    ) {
      return res.status(409).json({
        status: "fail",

        code: "PAYOUT_BANK_DETAILS_UNAVAILABLE",

        message:
          "The payout request does not contain usable encrypted bank details.",
      });
    }

    let bankDetails;

    try {
      bankDetails = decryptBankDetails(
        {
          ciphertext: payout.details_ciphertext,

          iv: payout.details_iv,

          authTag: payout.details_auth_tag,

          version: Number(payout.encryption_version || 1),
        },
        {
          designerId: payout.designer_id,

          bankAccountId: payout.bank_account_id,
        },
      );
    } catch (error) {
      console.error(
        "Manual payout bank-detail decryption failed:",
        error?.code || error?.message,
      );

      return res.status(500).json({
        message: "The bank details could not be securely decrypted.",
      });
    }

    res.set("Cache-Control", "no-store");

    return res.status(200).json({
      status: "success",

      data: {
        ...manualPayoutResponse(payout),

        bank_details: {
          country_code: bankDetails.country_code || null,

          currency: bankDetails.currency || null,

          account_holder_name: bankDetails.account_holder_name || null,

          bank_name: bankDetails.bank_name || null,

          account_number: bankDetails.account_number || null,

          iban: bankDetails.iban || null,

          swift_bic: bankDetails.swift_bic || null,

          routing_number: bankDetails.routing_number || null,

          sort_code: bankDetails.sort_code || null,

          branch_code: bankDetails.branch_code || null,

          bank_address: bankDetails.bank_address || null,

          intermediary_bank: bankDetails.intermediary_bank || null,
        },
      },
    });
  } catch (error) {
    console.error("getManualPayoutRequest error:", error);

    return res.status(500).json({
      message: "Failed to retrieve the manual payout request.",
    });
  }
};

exports.updateDesignerBankAccountVerification = async (req, res) => {
  const bankAccountId = String(req.params.bankAccountId || "").trim();

  const requestedStatus = String(req.body?.status || "")
    .trim()
    .toLowerCase();

  if (!isUuid(bankAccountId)) {
    return res.status(400).json({
      message: "A valid bank account ID is required.",
    });
  }

  if (!["verified", "rejected"].includes(requestedStatus)) {
    return res.status(400).json({
      message: "Bank verification status must be verified or rejected.",
    });
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const accountResult = await client.query(
      `
          SELECT *

          FROM designer_bank_accounts

          WHERE id = $1

          LIMIT 1

          FOR UPDATE
        `,
      [bankAccountId],
    );

    const bankAccount = accountResult.rows[0];

    if (!bankAccount) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Designer bank account not found.",
      });
    }

    if (requestedStatus === "rejected") {
      const activePayoutResult = await client.query(
        `
            SELECT id

            FROM designer_payout_requests

            WHERE
                bank_account_id = $1

                AND
                payout_method =
                    'manual'

                AND
                provider IS NULL

                AND
                status IN (
                    'pending',
                    'processing'
                )

            LIMIT 1
          `,
        [bankAccountId],
      );

      if (activePayoutResult.rows.length > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "This bank account is attached to an active payout request. Resolve that payout before rejecting the bank account.",
        });
      }
    }

    let updatedResult;

    if (requestedStatus === "verified") {
      const designerAccountsResult = await client.query(
        `
            SELECT
                id,
                is_default,
                is_active,
                verification_status

            FROM designer_bank_accounts

            WHERE designer_id = $1

            ORDER BY
                created_at DESC

            FOR UPDATE
          `,
        [bankAccount.designer_id],
      );

      const existingUsableDefault = designerAccountsResult.rows.find(
        (row) =>
          row.id !== bankAccountId &&
          row.is_default === true &&
          row.is_active === true &&
          row.verification_status === "verified",
      );

      const shouldBecomeDefault = !existingUsableDefault;

      updatedResult = await client.query(
        `
            UPDATE designer_bank_accounts

            SET
                verification_status =
                    'verified',

                is_active =
                    TRUE,

                is_default =
                    $2,

                verified_at =
                    NOW(),

                updated_at =
                    NOW()

            WHERE id = $1

            RETURNING
                id,
                designer_id,
                country_code,
                account_holder_name,
                bank_name,
                currency,
                account_number_last4,
                iban_last4,
                verification_status,
                is_default,
                is_active,
                verified_at,
                created_at,
                updated_at
          `,
        [bankAccountId, shouldBecomeDefault],
      );
    } else {
      updatedResult = await client.query(
        `
            UPDATE designer_bank_accounts

            SET
                verification_status =
                    'rejected',

                is_default =
                    FALSE,

                is_active =
                    FALSE,

                verified_at =
                    NULL,

                updated_at =
                    NOW()

            WHERE id = $1

            RETURNING
                id,
                designer_id,
                country_code,
                account_holder_name,
                bank_name,
                currency,
                account_number_last4,
                iban_last4,
                verification_status,
                is_default,
                is_active,
                verified_at,
                created_at,
                updated_at
          `,
        [bankAccountId],
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      status: "success",

      message:
        requestedStatus === "verified"
          ? "The designer bank account was verified."
          : "The designer bank account was rejected.",

      data: updatedResult.rows[0],
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors.
    }

    console.error("updateDesignerBankAccountVerification error:", error);

    return res.status(500).json({
      message: "The bank-account verification status could not be updated.",
    });
  } finally {
    client.release();
  }
};

exports.markManualPayoutProcessing = async (req, res) => {
  const payoutId = String(req.params.payoutId || "").trim();

  if (!isUuid(payoutId)) {
    return res.status(400).json({
      message: "A valid payout request ID is required.",
    });
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const payoutResult = await client.query(
      `
          SELECT *

          FROM designer_payout_requests

          WHERE id = $1

          LIMIT 1

          FOR UPDATE
        `,
      [payoutId],
    );

    const payout = payoutResult.rows[0];

    if (!payout) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Payout request not found.",
      });
    }

    if (payout.payout_method !== "manual" || payout.provider !== null) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "Only manual bank payout requests can use this action.",
      });
    }

    if (payout.status === "processing") {
      await client.query("COMMIT");

      return res.status(200).json({
        status: "success",

        idempotent: true,

        message: "This manual payout is already processing.",

        data: payout,
      });
    }

    if (payout.status !== "pending") {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: `A ${payout.status} payout cannot be moved to processing.`,
      });
    }

    const bankValidation = await validateAttachedBankForManualPayout(
      client,
      payout,
    );

    if (!bankValidation.success) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        status: "fail",

        code: bankValidation.code,

        message: bankValidation.message,

        destination_summary: payout.destination_summary || null,
      });
    }

    const updatedResult = await client.query(
      `
          UPDATE designer_payout_requests

          SET
              status =
                  'processing',

              provider_status =
                  'admin_bank_transfer_processing',

              processing_at =
                  COALESCE(
                      processing_at,
                      NOW()
                  ),

              failure_reason =
                  NULL,

              updated_at =
                  NOW()

          WHERE id = $1

          RETURNING *
        `,
      [payoutId],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      status: "success",

      idempotent: false,

      message: "The manual payout is now processing.",

      data: updatedResult.rows[0],
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors.
    }

    console.error("markManualPayoutProcessing error:", error);

    return res.status(500).json({
      message: "The manual payout could not be moved to processing.",
    });
  } finally {
    client.release();
  }
};

exports.completeManualPayout = async (req, res) => {
  const payoutId = String(req.params.payoutId || "").trim();

  const transferReference = cleanFinanceText(
    req.body?.transfer_reference || req.body?.transaction_reference,

    160,
  );

  if (!isUuid(payoutId)) {
    return res.status(400).json({
      message: "A valid payout request ID is required.",
    });
  }

  if (transferReference.length < 3) {
    return res.status(400).json({
      message: "A valid external bank transfer reference is required.",
    });
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
        SELECT
            pg_advisory_xact_lock(
                hashtext($1),
                hashtext($2)
            )
      `,
      ["manual-bank-transfer-reference", transferReference],
    );

    const payoutResult = await client.query(
      `
          SELECT *

          FROM designer_payout_requests

          WHERE id = $1

          LIMIT 1

          FOR UPDATE
        `,
      [payoutId],
    );

    const payout = payoutResult.rows[0];

    if (!payout) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Payout request not found.",
      });
    }

    if (payout.payout_method !== "manual" || payout.provider !== null) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "Only manual bank payouts can use this completion action.",
      });
    }

    if (payout.status === "completed") {
      if (payout.provider_transaction_id === transferReference) {
        await client.query("COMMIT");

        return res.status(200).json({
          status: "success",

          idempotent: true,

          message: "This manual payout is already completed.",

          data: payout,
        });
      }

      await client.query("ROLLBACK");

      return res.status(409).json({
        message:
          "This payout is already completed with a different bank transfer reference.",
      });
    }

    if (payout.status !== "processing") {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message:
          "The manual payout must be processing before it can be completed.",
      });
    }

    if (payout.provider_transaction_id) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message:
          "This payout already contains an external transfer reference and requires reconciliation before another completion attempt.",
      });
    }

    const bankValidation = await validateAttachedBankForManualPayout(
      client,
      payout,
    );

    if (!bankValidation.success) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        status: "fail",

        code: bankValidation.code,

        message: bankValidation.message,

        destination_summary: payout.destination_summary || null,
      });
    }

    const duplicateReferenceResult = await client.query(
      `
          SELECT
              id,
              reference_id

          FROM transactions

          WHERE
              transaction_type =
                  'payout'

              AND
              payment_provider
                  IS NULL

              AND
              provider_transaction_id =
                  $1

          LIMIT 1
        `,
      [transferReference],
    );

    if (duplicateReferenceResult.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message:
          "This bank transfer reference has already been recorded for another payout.",
      });
    }

    const existingPayoutTransaction = await client.query(
      `
          SELECT
              id,
              provider_transaction_id

          FROM transactions

          WHERE
              reference_id = $1

              AND
              transaction_type =
                  'payout'

          LIMIT 1
        `,
      [payoutId],
    );

    if (existingPayoutTransaction.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message:
          "A payout transaction already exists for this request and requires reconciliation.",
      });
    }

    const amount = Number(payout.amount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("The payout request contains an invalid amount.");
    }

    const currency = String(payout.currency || "usd")
      .trim()
      .toLowerCase();

    if (!/^[a-z]{3}$/.test(currency)) {
      throw new Error("The payout request contains an invalid currency.");
    }

    const walletResult = await client.query(
      `
          UPDATE designer_wallets

          SET
              pending_payout_balance =
                  pending_payout_balance
                  - $1

          WHERE
              user_id = $2

              AND
              pending_payout_balance
                  >= $1

          RETURNING
              available_balance,
              pending_escrow_balance,
              pending_payout_balance
        `,
      [amount, payout.designer_id],
    );

    if (walletResult.rows.length === 0) {
      throw new Error(
        "The designer wallet does not contain the expected reserved payout balance.",
      );
    }

    const transactionResult = await client.query(
      `
          INSERT INTO transactions (
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
          )

          VALUES (
              gen_random_uuid(),
              NULL,
              $1,
              $2,
              $3,
              0,
              $3,
              'payout',
              NULL,
              NULL,
              NULL,
              $4,
              $5,
              NOW()
          )

          RETURNING *
        `,
      [payout.designer_id, payout.id, amount, transferReference, currency],
    );

    const updatedResult = await client.query(
      `
          UPDATE designer_payout_requests

          SET
              status =
                  'completed',

              provider_status =
                  'bank_transfer_completed',

              provider_transaction_id =
                  $1,

              completed_at =
                  COALESCE(
                      completed_at,
                      NOW()
                  ),

              failure_reason =
                  NULL,

              updated_at =
                  NOW()

          WHERE id = $2

          RETURNING *
        `,
      [transferReference, payout.id],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      status: "success",

      idempotent: false,

      message: "The manual bank payout was completed successfully.",

      data: updatedResult.rows[0],

      transaction: transactionResult.rows[0],

      wallet: walletResult.rows[0],
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors.
    }

    console.error("completeManualPayout error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        message: "This payout completion has already been recorded.",
      });
    }

    return res.status(500).json({
      message: "The manual payout could not be completed safely.",
    });
  } finally {
    client.release();
  }
};

exports.failManualPayout = async (req, res) => {
  const payoutId = String(req.params.payoutId || "").trim();

  const reason = cleanFinanceText(req.body?.reason, 1000);

  const fundsSent = req.body?.funds_sent;

  if (!isUuid(payoutId)) {
    return res.status(400).json({
      message: "A valid payout request ID is required.",
    });
  }

  if (reason.length < 3) {
    return res.status(400).json({
      message: "A failure or rejection reason is required.",
    });
  }

  if (fundsSent !== false) {
    return res.status(400).json({
      message:
        "funds_sent must explicitly be false before reserved funds can be restored.",
    });
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const payoutResult = await client.query(
      `
          SELECT *

          FROM designer_payout_requests

          WHERE id = $1

          LIMIT 1

          FOR UPDATE
        `,
      [payoutId],
    );

    const payout = payoutResult.rows[0];

    if (!payout) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Payout request not found.",
      });
    }

    if (payout.payout_method !== "manual" || payout.provider !== null) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "Only manual bank payouts can use this failure action.",
      });
    }

    if (payout.status === "failed") {
      await client.query("COMMIT");

      return res.status(200).json({
        status: "success",

        idempotent: true,

        message: "This manual payout is already failed.",

        data: payout,
      });
    }

    if (!["pending", "processing"].includes(payout.status)) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: `A ${payout.status} payout cannot be failed with wallet restoration.`,
      });
    }

    if (payout.provider_transaction_id) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message:
          "This payout already has an external bank transfer reference. Do not restore the wallet automatically; reconcile the external transfer first.",
      });
    }

    const amount = Number(payout.amount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("The payout request contains an invalid amount.");
    }

    const walletResult = await client.query(
      `
          UPDATE designer_wallets

          SET
              pending_payout_balance =
                  pending_payout_balance
                  - $1,

              available_balance =
                  available_balance
                  + $1

          WHERE
              user_id = $2

              AND
              pending_payout_balance
                  >= $1

          RETURNING
              available_balance,
              pending_escrow_balance,
              pending_payout_balance
        `,
      [amount, payout.designer_id],
    );

    if (walletResult.rows.length === 0) {
      throw new Error(
        "The reserved payout balance could not be restored safely.",
      );
    }

    const updatedResult = await client.query(
      `
          UPDATE designer_payout_requests

          SET
              status =
                  'failed',

              provider_status =
                  'bank_transfer_failed_before_send',

              failure_reason =
                  $1,

              failed_at =
                  COALESCE(
                      failed_at,
                      NOW()
                  ),

              updated_at =
                  NOW()

          WHERE id = $2

          RETURNING *
        `,
      [reason, payout.id],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      status: "success",

      idempotent: false,

      message:
        "The manual payout was failed and the reserved funds were restored.",

      data: updatedResult.rows[0],

      wallet: walletResult.rows[0],
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors.
    }

    console.error("failManualPayout error:", error);

    return res.status(500).json({
      message: "The manual payout could not be failed safely.",
    });
  } finally {
    client.release();
  }
};

/* ============================================================
   9. GLOBAL / DASHBOARD STATISTICS
   ============================================================ */

exports.getGlobalStats = async (req, res) => {
  try {
    const result = await db.query(
      `
          SELECT
              (
                  SELECT
                      COUNT(*)

                  FROM users

                  WHERE
                      role =
                      'designer'
              )::int
                  AS designer_count,

              (
                  SELECT
                      COUNT(*)

                  FROM users

                  WHERE
                      role =
                      'creator'
              )::int
                  AS creator_count,

              (
                  SELECT
                      COUNT(*)

                  FROM users

                  WHERE
                      role =
                      'designer'

                      AND
                      approval_status =
                      'pending'
              )::int
                  AS pending_designers,

              (
                  SELECT
                      COUNT(*)

                  FROM designs

                  WHERE
                      is_published =
                      TRUE
              )::int
                  AS live_designs,

              (
                  SELECT
                      COUNT(*)

                  FROM bookings

                  WHERE
                      status::text =
                      'funded'
              )::int
                  AS funded_projects,

              (
                  SELECT
                      COUNT(*)

                  FROM bookings

                  WHERE
                      status::text
                      IN (
                          'progress',
                          'review_prototype',
                          'final_production',
                          'review_final'
                      )
              )::int
                  AS ongoing_projects,

              (
                  SELECT
                      COUNT(*)

                  FROM bookings

                  WHERE
                      status::text =
                      'completed'
              )::int
                  AS completed_projects,

              (
                  SELECT
                      COUNT(*)

                  FROM bookings

                  WHERE
                      status::text =
                      'cancelled'
              )::int
                  AS cancelled_projects
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

exports.getDashboardStats = async (req, res) => {
  try {
    const [distributionResult, pendingResult, bookingResult] =
      await Promise.all([
        db.query(
          `
            SELECT
                role,

                COUNT(*)::int
                    AS count

            FROM users

            GROUP BY role

            ORDER BY role
          `,
        ),

        db.query(
          `
            SELECT
                COUNT(*)::int
                    AS count

            FROM users

            WHERE
                role =
                    'designer'

                AND
                approval_status =
                    'pending'
          `,
        ),

        db.query(
          `
            SELECT
                COUNT(*)
                FILTER (
                    WHERE
                      status::text =
                      'funded'
                )::int
                    AS funded_bookings,

                COUNT(*)
                FILTER (
                    WHERE
                      status::text IN (
                          'progress',
                          'review_prototype',
                          'final_production',
                          'review_final'
                      )
                )::int
                    AS active_projects,

                COUNT(*)
                FILTER (
                    WHERE
                      status::text =
                      'completed'
                )::int
                    AS completed_bookings

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
   10. DESIGN MODERATION
   ============================================================ */

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

            SET
                is_published =
                    FALSE

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
   11. SHOWCASE HERO MANAGEMENT
   ============================================================ */

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

    let mode = current.mode;

    if (hasOwn(body, "mode")) {
      mode = normalizeHeroMode(body.mode);

      if (!mode) {
        return res.status(400).json({
          message: "Hero mode must be either slideshow or video.",
        });
      }
    }

    let isEnabled = current.is_enabled === true;

    if (hasOwn(body, "is_enabled")) {
      if (typeof body.is_enabled !== "boolean") {
        return res.status(400).json({
          message: "is_enabled must be true or false.",
        });
      }

      isEnabled = body.is_enabled;
    }

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

    const updatedBy = req.user?.id || req.user?.user_id || null;

    const result = await db.query(
      `
          UPDATE showcase_hero_settings

          SET
              mode = $1,

              slideshow_images =
                  $2::jsonb,

              video_url =
                  $3,

              video_poster_url =
                  $4,

              rotation_seconds =
                  $5,

              is_enabled =
                  $6,

              updated_by =
                  $7,

              updated_at =
                  NOW()

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
