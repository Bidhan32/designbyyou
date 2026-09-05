"use strict";

/*
=========================================================
FashionVision Designer Finance Controller
Version 5.1 - Universal Manual Designer Payouts
=========================================================

CURRENT FINANCE MODEL
---------------------------------------------------------

1. Customer / creator card payments continue to use the
   DesignByYou platform Stripe account.

2. Stripe Connect is NOT used for new designer payouts.

3. Every designer, in every country including the UAE,
   uses a verified manual bank payout account.

4. Designers cannot fund, top up, or deposit money into
   their own internal wallet.

5. Designer available balance comes from legitimate
   internal earnings/accounting flows such as completed
   booking releases.

6. A payout request atomically moves funds from
   available_balance to pending_payout_balance.

7. Super Admin completes the real bank transfer and the
   existing Super Admin finance flow finalizes the payout.

8. Historical Stripe Connect and historical designer
   wallet-deposit records are preserved for audit/history
   only and cannot be used to create new deposits.

=========================================================
*/

const { randomUUID } = require("crypto");

const db = require("../config/db");

const { encryptBankDetails } = require("../utils/bankDetailsCrypto");

/*
=========================================================
IMPORTANT
=========================================================

No Stripe client is created in this controller.

Designers cannot fund their own wallets.

New designer withdrawals use:

internal wallet
→ verified bank account
→ manual payout request
→ Super Admin bank transfer

Historical Stripe-related fields and records remain
readable for audit/reconciliation only.
=========================================================
*/

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PAYOUT_STATUSES = new Set([
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

/*
 * wallet_deposit remains read-only here solely so older
 * historical rows can still be displayed/audited.
 *
 * There is no current designer wallet-deposit creation or
 * verification flow.
 */
const EARNING_TYPES = new Set(["escrow_release", "wallet_deposit"]);

const MIN_PAYOUT_CENTS = Math.max(
  1,
  Math.round(Number(process.env.DESIGNER_MIN_PAYOUT_AMOUNT || 10) * 100),
);

const MAX_MONEY_CENTS = 100000000;

/*=========================================================
Common Helpers
=========================================================*/

function getAuthenticatedUserId(req) {
  return String(req?.user?.id || req?.user?._id || "").trim();
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || "").trim());
}

function cleanText(value, maxLength = 255) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  return text ? text.slice(0, maxLength) : "";
}

function moneyToCents(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return null;
  }

  const cents = Math.round(amount * 100);

  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_MONEY_CENTS) {
    return null;
  }

  return cents;
}

function centsToMoney(cents) {
  return Number((Number(cents) / 100).toFixed(2));
}

function parsePositiveInteger(value, fallback, maximum) {
  const number = Number.parseInt(value, 10);

  if (!Number.isInteger(number) || number <= 0) {
    return fallback;
  }

  return Math.min(number, maximum);
}

function getClientRequestId(req) {
  return String(
    req?.body?.client_request_id ||
      req?.body?.idempotency_key ||
      req?.get?.("Idempotency-Key") ||
      "",
  ).trim();
}

function sendError(res, statusCode, message, details = undefined) {
  const payload = {
    status: statusCode >= 500 ? "error" : "fail",

    message,
  };

  if (details !== undefined) {
    payload.details = details;
  }

  return res.status(statusCode).json(payload);
}

async function rollbackQuietly(client) {
  if (!client) {
    return;
  }

  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error("Designer finance rollback failed:", rollbackError);
  }
}

async function ensureWalletRow(queryable, designerId) {
  await queryable.query(
    `
      INSERT INTO designer_wallets (
        user_id,
        available_balance,
        pending_escrow_balance,
        pending_payout_balance
      )

      VALUES (
        $1,
        0,
        0,
        0
      )

      ON CONFLICT (user_id)
      DO NOTHING
    `,
    [designerId],
  );
}

function serializeWallet(row = {}) {
  const available = Number(row.available_balance || 0);

  const pendingEscrow = Number(row.pending_escrow_balance || 0);

  const pendingPayout = Number(row.pending_payout_balance || 0);

  return {
    available_balance: available.toFixed(2),

    pending_escrow_balance: pendingEscrow.toFixed(2),

    pending_payout_balance: pendingPayout.toFixed(2),

    total_wallet_balance: (available + pendingEscrow + pendingPayout).toFixed(
      2,
    ),
  };
}

function payoutResponseRow(row) {
  if (!row) {
    return null;
  }

  const latestAttempt = row.latest_attempt_id
    ? {
        attempt_id: row.latest_attempt_id,

        attempt_number: Number(row.latest_attempt_number || 0),

        status: row.latest_attempt_status || null,

        provider_payout_id: row.latest_attempt_provider_payout_id || null,

        previous_provider_payout_id:
          row.latest_attempt_previous_payout_id || null,

        failure_reason: row.latest_attempt_failure_reason || null,

        created_at: row.latest_attempt_created_at || null,

        submitted_at: row.latest_attempt_submitted_at || null,

        completed_at: row.latest_attempt_completed_at || null,

        failed_at: row.latest_attempt_failed_at || null,

        canceled_at: row.latest_attempt_canceled_at || null,

        updated_at: row.latest_attempt_updated_at || null,
      }
    : null;

  return {
    request_id: row.id,

    designer_id: row.designer_id,

    amount: Number(row.amount || 0).toFixed(2),

    payout_method: row.payout_method,

    payout_account_id: row.payout_account_id || null,

    bank_account_id: row.bank_account_id || null,

    provider: row.provider || null,

    destination_summary: row.destination_summary || null,

    status: row.status,

    idempotency_key: row.idempotency_key,

    provider_payout_id: row.provider_payout_id || null,

    provider_batch_id: row.provider_batch_id || null,

    provider_transaction_id: row.provider_transaction_id || null,

    provider_status: row.provider_status || null,

    currency: String(row.currency || "usd").toLowerCase(),

    failure_reason: row.failure_reason || null,

    requested_at: row.requested_at,

    processing_at: row.processing_at,

    completed_at: row.completed_at,

    failed_at: row.failed_at,

    cancelled_at: row.cancelled_at,

    updated_at: row.updated_at,

    payout_attempt_count:
      row.payout_attempt_count === undefined ||
      row.payout_attempt_count === null
        ? null
        : Number(row.payout_attempt_count),

    latest_payout_attempt: latestAttempt,

    /*
     * Historical Stripe payout records remain visible
     * in payout history.
     *
     * They cannot be reused for new withdrawals.
     */
    historical_stripe_payout: Boolean(
      row.payout_method === "stripe" || row.provider === "stripe",
    ),
  };
}

/*=========================================================
Universal Manual Payout Routing
=========================================================*/

function payoutModeForDesignerCountry(value) {
  const rawCountry = cleanText(value, 100);

  if (!rawCountry) {
    return {
      country: null,

      payoutMethod: null,

      stripeConnectAvailable: false,

      manualBankAvailable: false,

      code: "PAYOUT_COUNTRY_REQUIRED",
    };
  }

  /*
   * =====================================================
   * UNIVERSAL DESIGNER PAYOUT MODEL
   * =====================================================
   *
   * All designers use manual bank payouts.
   *
   * This includes:
   *
   * - UAE
   * - Nepal
   * - India
   * - UK
   * - US
   * - every other supported country
   *
   * Stripe Connect is not used for new designer payouts.
   */

  return {
    country: rawCountry,

    payoutMethod: "manual",

    stripeConnectAvailable: false,

    manualBankAvailable: true,

    code: null,
  };
}

async function getDesignerPayoutRouting(queryable, designerId) {
  const result = await queryable.query(
    `
        SELECT
          u.id,
          dp.country

        FROM users u

        LEFT JOIN designer_profiles dp
          ON dp.user_id =
            u.id

        WHERE u.id = $1
          AND u.role =
            'designer'

        LIMIT 1
      `,
    [designerId],
  );

  const designer = result.rows[0] || null;

  if (!designer) {
    const error = new Error("The designer account was not found.");

    error.statusCode = 404;

    error.code = "DESIGNER_NOT_FOUND";

    throw error;
  }

  return {
    ...payoutModeForDesignerCountry(designer.country),

    designerId,
  };
}

/*=========================================================
Bank Account Helpers
=========================================================*/

function normalizeBankCountryCode(value) {
  const countryCode = String(value || "")
    .trim()
    .toUpperCase();

  return /^[A-Z]{2}$/.test(countryCode) ? countryCode : null;
}

function normalizeCurrencyCode(value, fallback = "USD") {
  const currency = String(value || fallback)
    .trim()
    .toUpperCase();

  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function normalizeIban(value) {
  const iban = String(value || "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .trim();

  if (!iban) {
    return null;
  }

  return /^[A-Z0-9]{15,34}$/.test(iban) ? iban : null;
}

function normalizeSwiftBic(value) {
  const swiftBic = String(value || "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .trim();

  if (!swiftBic) {
    return null;
  }

  return /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(swiftBic) ? swiftBic : null;
}

function normalizeSensitiveBankValue(value, maxLength = 100) {
  const text = String(value || "").trim();

  return text ? text.slice(0, maxLength) : null;
}

function lastFour(value) {
  const compact = String(value || "")
    .replace(/\s+/g, "")
    .trim();

  return compact ? compact.slice(-4) : null;
}

function bankDestinationSummary(row) {
  if (!row) {
    return null;
  }

  const last4 = row.iban_last4 || row.account_number_last4 || null;

  return last4
    ? `${cleanText(row.bank_name, 120)} ••••${last4}`
    : cleanText(row.bank_name, 120) || "Bank transfer";
}

function bankAccountResponseRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,

    country_code: row.country_code,

    account_holder_name: row.account_holder_name,

    bank_name: row.bank_name,

    currency: String(row.currency || "USD").toUpperCase(),

    account_number_last4: row.account_number_last4 || null,

    iban_last4: row.iban_last4 || null,

    destination_summary: bankDestinationSummary(row),

    verification_status: row.verification_status,

    is_default: Boolean(row.is_default),

    is_active: Boolean(row.is_active),

    verified_at: row.verified_at || null,

    created_at: row.created_at,

    updated_at: row.updated_at,
  };
}

async function getUsableBankAccount(
  designerId,
  bankAccountId = null,
  queryable = db,
) {
  const values = [designerId];

  const conditions = [
    "designer_id = $1",
    "is_active = TRUE",
    "verification_status = 'verified'",
  ];

  if (bankAccountId) {
    if (!isUuid(bankAccountId)) {
      const error = new Error("The bank payout account reference is invalid.");

      error.statusCode = 400;

      error.code = "INVALID_BANK_ACCOUNT_REFERENCE";

      throw error;
    }

    values.push(bankAccountId);

    conditions.push(`id = $${values.length}`);
  } else {
    conditions.push("is_default = TRUE");
  }

  const result = await queryable.query(
    `
        SELECT *

        FROM designer_bank_accounts

        WHERE
          ${conditions.join(" AND ")}

        ORDER BY
          is_default DESC,
          created_at DESC

        LIMIT 1
      `,
    values,
  );

  const bankAccount = result.rows[0] || null;

  if (!bankAccount) {
    const error = new Error(
      "A verified bank payout account is required before requesting a withdrawal.",
    );

    error.statusCode = 409;

    error.code = "VERIFIED_BANK_ACCOUNT_REQUIRED";

    throw error;
  }

  /*
   * IMPORTANT:
   *
   * There is intentionally NO UAE restriction here.
   *
   * UAE bank accounts use the same manual payout
   * workflow as every other country.
   */

  return bankAccount;
}

/*=========================================================
1. Fetch Wallet Overview

NOTE:

lifetime_deposits is retained only as a historical/audit
aggregate for legacy designer deposit rows.

No new designer deposit can be created.
=========================================================*/

exports.getWalletBalance = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  try {
    await ensureWalletRow(db, designerId);

    const [walletResult, earningsResult, depositsResult, payoutsResult] =
      await Promise.all([
        db.query(
          `
              SELECT
                available_balance,
                pending_escrow_balance,
                pending_payout_balance

              FROM designer_wallets

              WHERE user_id = $1

              LIMIT 1
            `,
          [designerId],
        ),

        db.query(
          `
              SELECT
                COALESCE(
                  SUM(net_amount),
                  0
                )
                AS lifetime_earnings

              FROM transactions

              WHERE receiver_id = $1
                AND transaction_type =
                  'escrow_release'
            `,
          [designerId],
        ),

        /*
         * Historical designer self-funding only.
         *
         * No new wallet_deposit rows can be created by
         * the current designer finance API/webhook.
         */
        db.query(
          `
              SELECT
                COALESCE(
                  SUM(net_amount),
                  0
                )
                AS lifetime_deposits

              FROM transactions

              WHERE receiver_id = $1
                AND transaction_type =
                  'wallet_deposit'
            `,
          [designerId],
        ),

        db.query(
          `
              SELECT
                COALESCE(
                  SUM(amount)
                  FILTER (
                    WHERE status =
                      'completed'
                  ),
                  0
                )
                AS lifetime_withdrawn,

                COALESCE(
                  SUM(amount)
                  FILTER (
                    WHERE status IN (
                      'pending',
                      'processing'
                    )
                  ),
                  0
                )
                AS queued_payouts

              FROM designer_payout_requests

              WHERE designer_id = $1
            `,
          [designerId],
        ),
      ]);

    const wallet = serializeWallet(walletResult.rows[0]);

    const lifetimeEarnings = Number(
      earningsResult.rows[0]?.lifetime_earnings || 0,
    );

    const lifetimeDeposits = Number(
      depositsResult.rows[0]?.lifetime_deposits || 0,
    );

    const lifetimeWithdrawn = Number(
      payoutsResult.rows[0]?.lifetime_withdrawn || 0,
    );

    const queuedPayouts = Number(payoutsResult.rows[0]?.queued_payouts || 0);

    return res.status(200).json({
      status: "success",

      data: {
        ...wallet,

        lifetime_earnings: lifetimeEarnings.toFixed(2),

        /*
         * Legacy/audit compatibility field.
         */
        lifetime_deposits: lifetimeDeposits.toFixed(2),

        lifetime_withdrawn: lifetimeWithdrawn.toFixed(2),

        queued_payouts: queuedPayouts.toFixed(2),

        currency: "usd",
      },
    });
  } catch (error) {
    console.error("Wallet overview fetch failed:", error);

    return sendError(res, 500, "The wallet overview could not be loaded.");
  }
};

/*=========================================================
2. Fetch Earnings and Historical Credit Ledger

Current designer earnings:

- escrow_release

Historical only:

- wallet_deposit

The historical transaction type remains readable for
audit but can no longer be created.
=========================================================*/

exports.getEarningsLedger = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  const page = parsePositiveInteger(req.query?.page, 1, 100000);

  const limit = parsePositiveInteger(req.query?.limit, 25, 100);

  const offset = (page - 1) * limit;

  const requestedType = String(req.query?.type || "")
    .trim()
    .toLowerCase();

  const transactionType = EARNING_TYPES.has(requestedType)
    ? requestedType
    : null;

  const search = cleanText(req.query?.search, 100);

  const values = [designerId];

  const conditions = [
    "t.receiver_id = $1",

    `
        t.transaction_type IN (
          'escrow_release',
          'wallet_deposit'
        )
      `,
  ];

  if (transactionType) {
    values.push(transactionType);

    conditions.push(
      `
          t.transaction_type =
            $${values.length}::trans_type
        `,
    );
  }

  if (search) {
    values.push(`%${search}%`);

    conditions.push(
      `
          (
            t.id::text
              ILIKE $${values.length}

            OR COALESCE(
              t.reference_id::text,
              ''
            )
              ILIKE $${values.length}

            OR COALESCE(
              u.full_name,
              ''
            )
              ILIKE $${values.length}
          )
        `,
    );
  }

  values.push(limit);

  const limitIndex = values.length;

  values.push(offset);

  const offsetIndex = values.length;

  try {
    const result = await db.query(
      `
            SELECT
              t.id
                AS transaction_id,

              t.reference_id,
              t.sender_id,
              t.receiver_id,
              t.gross_amount,
              t.platform_fee_deducted,
              t.net_amount,
              t.transaction_type,
              t.stripe_payment_intent_id,
              t.payment_provider,
              t.provider_payment_id,
              t.provider_transaction_id,
              t.currency,
              t.created_at,

              u.full_name
                AS sender_name,

              b.status
                AS booking_status,

              b.booking_type,

              COUNT(*) OVER()
                AS total_count

            FROM transactions t

            LEFT JOIN users u
              ON u.id =
                t.sender_id

            LEFT JOIN bookings b
              ON b.id =
                t.reference_id

            WHERE
              ${conditions.join(" AND ")}

            ORDER BY
              t.created_at DESC

            LIMIT
              $${limitIndex}

            OFFSET
              $${offsetIndex}
          `,
      values,
    );

    const total = Number(result.rows[0]?.total_count || 0);

    const data = result.rows.map((row) => ({
      transaction_id: row.transaction_id,

      reference_id: row.reference_id,

      sender_id: row.sender_id,

      receiver_id: row.receiver_id,

      gross_amount: Number(row.gross_amount || 0).toFixed(2),

      platform_fee_deducted: Number(row.platform_fee_deducted || 0).toFixed(2),

      net_amount: Number(row.net_amount || 0).toFixed(2),

      transaction_type: row.transaction_type,

      stripe_payment_intent_id: row.stripe_payment_intent_id || null,

      payment_provider: row.payment_provider || null,

      provider_payment_id: row.provider_payment_id || null,

      provider_transaction_id: row.provider_transaction_id || null,

      currency: String(row.currency || "usd").toLowerCase(),

      sender_name:
        row.sender_name ||
        (row.transaction_type === "wallet_deposit"
          ? "Historical wallet funding"
          : "Booking payment"),

      booking_status: row.booking_status || null,

      booking_type: row.booking_type || null,

      direction: "credit",

      created_at: row.created_at,
    }));

    return res.status(200).json({
      status: "success",

      data,

      pagination: {
        page,

        limit,

        total,

        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Earnings ledger fetch failed:", error);

    return sendError(res, 500, "The earnings ledger could not be loaded.");
  }
};

/*=========================================================
2B. Fetch Payout Options
=========================================================*/

exports.getPayoutOptions = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  try {
    const routing = await getDesignerPayoutRouting(db, designerId);

    let bankAccount = null;

    if (routing.payoutMethod === "manual") {
      const bankResult = await db.query(
        `
              SELECT *

              FROM designer_bank_accounts

              WHERE designer_id = $1
                AND is_default = TRUE
                AND is_active = TRUE

              ORDER BY
                created_at DESC

              LIMIT 1
            `,
        [designerId],
      );

      bankAccount = bankResult.rows[0] || null;
    }

    return res.status(200).json({
      status: "success",

      data: {
        designer_country: routing.country,

        payout_method: routing.payoutMethod,

        stripe_connect_available: false,

        manual_bank_available: routing.manualBankAvailable,

        country_required: !routing.payoutMethod,

        bank_account: bankAccountResponseRow(bankAccount),
      },
    });
  } catch (error) {
    console.error("Designer payout-option lookup failed:", error);

    return sendError(
      res,

      error.statusCode || 500,

      error.statusCode
        ? error.message
        : "The available payout options could not be loaded.",

      error.code
        ? {
            code: error.code,
          }
        : undefined,
    );
  }
};

/*=========================================================
2C. Fetch Manual Bank Payout Account
=========================================================*/

exports.getBankPayoutAccount = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  try {
    const routing = await getDesignerPayoutRouting(db, designerId);

    if (!routing.payoutMethod) {
      return sendError(
        res,
        400,
        "Add your country to your designer profile before setting up payouts.",
        {
          code: "PAYOUT_COUNTRY_REQUIRED",
        },
      );
    }

    const result = await db.query(
      `
            SELECT *

            FROM designer_bank_accounts

            WHERE designer_id = $1
              AND is_default = TRUE
              AND is_active = TRUE

            ORDER BY
              created_at DESC

            LIMIT 1
          `,
      [designerId],
    );

    return res.status(200).json({
      status: "success",

      data: {
        payout_method: "manual",

        stripe_connect_available: false,

        manual_bank_available: true,

        bank_account: bankAccountResponseRow(result.rows[0] || null),
      },
    });
  } catch (error) {
    console.error("Bank payout account fetch failed:", error);

    return sendError(
      res,

      error.statusCode || 500,

      error.statusCode
        ? error.message
        : "The bank payout account could not be loaded.",

      error.code
        ? {
            code: error.code,
          }
        : undefined,
    );
  }
};

/*=========================================================
2D. Create or Replace Manual Bank Payout Account
=========================================================*/

exports.saveBankPayoutAccount = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  let routing;

  try {
    routing = await getDesignerPayoutRouting(db, designerId);
  } catch (error) {
    return sendError(
      res,

      error.statusCode || 500,

      error.statusCode
        ? error.message
        : "The designer payout country could not be verified.",

      error.code
        ? {
            code: error.code,
          }
        : undefined,
    );
  }

  if (!routing.payoutMethod) {
    return sendError(
      res,
      400,
      "Add your country to your designer profile before setting up bank payouts.",
      {
        code: "PAYOUT_COUNTRY_REQUIRED",
      },
    );
  }

  const countryCode = normalizeBankCountryCode(
    req.body?.country_code || req.body?.countryCode,
  );

  const currency = normalizeCurrencyCode(req.body?.currency || "USD");

  const accountHolderName = cleanText(
    req.body?.account_holder_name || req.body?.accountHolderName,

    160,
  );

  const bankName = cleanText(
    req.body?.bank_name || req.body?.bankName,

    160,
  );

  const accountNumber = normalizeSensitiveBankValue(
    req.body?.account_number || req.body?.accountNumber,

    100,
  );

  const rawIban = req.body?.iban;

  const iban = rawIban ? normalizeIban(rawIban) : null;

  const rawSwift = req.body?.swift_bic || req.body?.swiftBic || req.body?.swift;

  const swiftBic = rawSwift ? normalizeSwiftBic(rawSwift) : null;

  const routingNumber = normalizeSensitiveBankValue(
    req.body?.routing_number || req.body?.routingNumber,

    50,
  );

  const sortCode = normalizeSensitiveBankValue(
    req.body?.sort_code || req.body?.sortCode,

    50,
  );

  const branchCode = normalizeSensitiveBankValue(
    req.body?.branch_code || req.body?.branchCode,

    50,
  );

  const bankAddress = normalizeSensitiveBankValue(
    req.body?.bank_address || req.body?.bankAddress,

    300,
  );

  const intermediaryBank = normalizeSensitiveBankValue(
    req.body?.intermediary_bank || req.body?.intermediaryBank,

    200,
  );

  if (!countryCode) {
    return sendError(
      res,
      400,
      "A valid two-letter bank country code is required.",
      {
        field: "country_code",

        example: "AE",
      },
    );
  }

  if (!currency) {
    return sendError(
      res,
      400,
      "A valid three-letter currency code is required.",
    );
  }

  if (!accountHolderName) {
    return sendError(res, 400, "The bank account holder name is required.");
  }

  if (!bankName) {
    return sendError(res, 400, "The bank name is required.");
  }

  if (!accountNumber && !iban) {
    return sendError(
      res,
      400,
      "Provide either a bank account number or an IBAN.",
    );
  }

  if (rawIban && !iban) {
    return sendError(res, 400, "The IBAN format is invalid.");
  }

  if (rawSwift && !swiftBic) {
    return sendError(res, 400, "The SWIFT/BIC format is invalid.");
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
      ["designer-bank-account", designerId],
    );

    const existingResult = await client.query(
      `
            SELECT *

            FROM designer_bank_accounts

            WHERE designer_id = $1
              AND is_default = TRUE
              AND is_active = TRUE

            ORDER BY
              created_at DESC

            LIMIT 1

            FOR UPDATE
          `,
      [designerId],
    );

    const existing = existingResult.rows[0] || null;

    let mustCreateReplacement = false;

    if (existing) {
      /*
       * Once a bank account has ever been attached to a
       * payout request, preserve it permanently for
       * historical payout integrity.
       */
      const inUseResult = await client.query(
        `
              SELECT EXISTS (
                SELECT 1

                FROM designer_payout_requests

                WHERE designer_id = $1
                  AND bank_account_id = $2
              ) AS in_use
            `,
        [designerId, existing.id],
      );

      mustCreateReplacement = Boolean(inUseResult.rows[0]?.in_use);
    }

    const bankAccountId =
      existing && !mustCreateReplacement ? existing.id : randomUUID();

    const encrypted = encryptBankDetails(
      {
        country_code: countryCode,

        currency,

        account_holder_name: accountHolderName,

        bank_name: bankName,

        account_number: accountNumber,

        iban,

        swift_bic: swiftBic,

        routing_number: routingNumber,

        sort_code: sortCode,

        branch_code: branchCode,

        bank_address: bankAddress,

        intermediary_bank: intermediaryBank,
      },
      {
        designerId,

        bankAccountId,
      },
    );

    if (existing && mustCreateReplacement) {
      await client.query(
        `
            UPDATE designer_bank_accounts

            SET
              is_default =
                FALSE,

              is_active =
                FALSE,

              updated_at =
                NOW()

            WHERE id = $1
              AND designer_id = $2
          `,
        [existing.id, designerId],
      );
    }

    let savedResult;

    if (existing && !mustCreateReplacement) {
      savedResult = await client.query(
        `
              UPDATE designer_bank_accounts

              SET
                country_code = $1,

                account_holder_name = $2,

                bank_name = $3,

                currency = $4,

                account_number_last4 = $5,

                iban_last4 = $6,

                details_ciphertext = $7,

                details_iv = $8,

                details_auth_tag = $9,

                encryption_version = $10,

                verification_status =
                  'pending',

                is_default =
                  TRUE,

                is_active =
                  TRUE,

                verified_at =
                  NULL,

                updated_at =
                  NOW()

              WHERE id = $11
                AND designer_id = $12

              RETURNING *
            `,
        [
          countryCode,

          accountHolderName,

          bankName,

          currency,

          lastFour(accountNumber),

          lastFour(iban),

          encrypted.ciphertext,

          encrypted.iv,

          encrypted.authTag,

          encrypted.version,

          existing.id,

          designerId,
        ],
      );
    } else {
      await client.query(
        `
            UPDATE designer_bank_accounts

            SET
              is_default =
                FALSE,

              updated_at =
                NOW()

            WHERE designer_id = $1
              AND is_default = TRUE
          `,
        [designerId],
      );

      savedResult = await client.query(
        `
              INSERT INTO designer_bank_accounts (
                id,
                designer_id,
                country_code,
                account_holder_name,
                bank_name,
                currency,
                account_number_last4,
                iban_last4,
                details_ciphertext,
                details_iv,
                details_auth_tag,
                encryption_version,
                verification_status,
                is_default,
                is_active,
                verified_at,
                created_at,
                updated_at
              )

              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11,
                $12,
                'pending',
                TRUE,
                TRUE,
                NULL,
                NOW(),
                NOW()
              )

              RETURNING *
            `,
        [
          bankAccountId,

          designerId,

          countryCode,

          accountHolderName,

          bankName,

          currency,

          lastFour(accountNumber),

          lastFour(iban),

          encrypted.ciphertext,

          encrypted.iv,

          encrypted.authTag,

          encrypted.version,
        ],
      );
    }

    await client.query("COMMIT");

    return res.status(existing && !mustCreateReplacement ? 200 : 201).json({
      status: "success",

      message: mustCreateReplacement
        ? "A new bank payout account was saved. The previous account was preserved for existing payout requests."
        : existing
          ? "The bank payout account was updated successfully."
          : "The bank payout account was saved successfully.",

      data: bankAccountResponseRow(savedResult.rows[0]),
    });
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Bank payout account save failed:", error);

    if (
      error?.code === "BANK_DETAILS_ENCRYPTION_KEY_MISSING" ||
      error?.code === "BANK_DETAILS_ENCRYPTION_KEY_INVALID"
    ) {
      return sendError(res, 500, "Bank-detail encryption is not configured.");
    }

    return sendError(
      res,

      error.code === "23505" ? 409 : 500,

      error.code === "23505"
        ? "A conflicting default bank payout account already exists."
        : "The bank payout account could not be saved safely.",
    );
  } finally {
    client.release();
  }
};

/*=========================================================
3. Create Manual Payout Request
=========================================================*/

exports.requestPayout = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  const requestedCents = moneyToCents(req.body?.amount);

  const rawRequestedPayoutMethod = String(
    req.body?.payoutMethod || req.body?.payout_method || "",
  )
    .trim()
    .toLowerCase();

  const requestedBankAccountId = String(
    req.body?.bankAccountId || req.body?.bank_account_id || "",
  ).trim();

  const idempotencyKey = getClientRequestId(req);

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!requestedCents) {
    return sendError(res, 400, "Enter a valid payout amount.");
  }

  if (requestedCents < MIN_PAYOUT_CENTS) {
    return sendError(
      res,
      400,
      `The minimum payout amount is $${centsToMoney(MIN_PAYOUT_CENTS).toFixed(
        2,
      )}.`,
    );
  }

  /*
   * Old frontend requests that still explicitly send
   * payoutMethod=stripe are rejected clearly.
   */
  if (rawRequestedPayoutMethod === "stripe") {
    return sendError(
      res,
      410,
      "Stripe Connect is no longer used for designer payouts. Use the verified manual bank payout method.",
      {
        code: "STRIPE_CONNECT_DISABLED",

        required_payout_method: "manual",
      },
    );
  }

  if (rawRequestedPayoutMethod && rawRequestedPayoutMethod !== "manual") {
    return sendError(res, 400, "Select a valid payout method.", {
      required_payout_method: "manual",
    });
  }

  if (!isUuid(idempotencyKey)) {
    return sendError(res, 400, "A valid client_request_id UUID is required.");
  }

  let payoutRouting;

  try {
    payoutRouting = await getDesignerPayoutRouting(db, designerId);
  } catch (error) {
    return sendError(
      res,

      error.statusCode || 500,

      error.statusCode
        ? error.message
        : "The designer payout country could not be verified.",

      error.code
        ? {
            code: error.code,
          }
        : undefined,
    );
  }

  if (!payoutRouting.payoutMethod) {
    return sendError(
      res,
      400,
      "Add your country to your designer profile before requesting a payout.",
      {
        code: "PAYOUT_COUNTRY_REQUIRED",
      },
    );
  }

  let readyManualBankAccount;

  try {
    readyManualBankAccount = await getUsableBankAccount(
      designerId,

      requestedBankAccountId || null,
    );
  } catch (error) {
    return sendError(
      res,

      error.statusCode || 500,

      error.statusCode
        ? error.message
        : "The manual bank payout account could not be prepared.",

      error.code
        ? {
            code: error.code,
          }
        : undefined,
    );
  }

  const requestedAmount = centsToMoney(requestedCents);

  const payoutMethod = "manual";

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
      ["designer-payout", `${designerId}:${idempotencyKey}`],
    );

    const existingResult = await client.query(
      `
            SELECT *

            FROM designer_payout_requests

            WHERE designer_id = $1
              AND idempotency_key = $2

            LIMIT 1

            FOR UPDATE
          `,
      [designerId, idempotencyKey],
    );

    /*
     * Idempotent repeat.
     */
    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];

      const existingCents = Math.round(Number(existing.amount || 0) * 100);

      if (
        existingCents !== requestedCents ||
        String(existing.payout_method || "").toLowerCase() !== payoutMethod
      ) {
        await rollbackQuietly(client);

        return sendError(
          res,
          409,
          "This client_request_id was already used with different payout details.",
        );
      }

      const walletResult = await client.query(
        `
              SELECT
                available_balance,
                pending_escrow_balance,
                pending_payout_balance

              FROM designer_wallets

              WHERE user_id = $1

              LIMIT 1
            `,
        [designerId],
      );

      await client.query("COMMIT");

      return res.status(200).json({
        status: "success",

        idempotent: true,

        message: "This bank payout request was already created.",

        data: payoutResponseRow(existing),

        wallet: serializeWallet(walletResult.rows[0]),
      });
    }

    await ensureWalletRow(client, designerId);

    const walletResult = await client.query(
      `
            SELECT
              available_balance,
              pending_escrow_balance,
              pending_payout_balance

            FROM designer_wallets

            WHERE user_id = $1

            LIMIT 1

            FOR UPDATE
          `,
      [designerId],
    );

    const wallet = walletResult.rows[0];

    const availableCents = Math.round(
      Number(wallet?.available_balance || 0) * 100,
    );

    if (availableCents < requestedCents) {
      await rollbackQuietly(client);

      return sendError(
        res,
        400,
        "The available wallet balance is insufficient for this payout.",
      );
    }

    const destinationSummary = bankDestinationSummary(readyManualBankAccount);

    const insertResult = await client.query(
      `
            INSERT INTO designer_payout_requests (
              id,
              designer_id,
              amount,
              payout_method,
              payout_account_id,
              bank_account_id,
              provider,
              destination_summary,
              status,
              idempotency_key,
              provider_status,
              currency,
              requested_at,
              processing_at,
              updated_at
            )

            VALUES (
              gen_random_uuid(),
              $1,
              $2,
              'manual',
              NULL,
              $3,
              NULL,
              $4,
              'pending',
              $5,
              'awaiting_admin_bank_transfer',
              'usd',
              NOW(),
              NULL,
              NOW()
            )

            RETURNING *
          `,
      [
        designerId,

        requestedAmount,

        readyManualBankAccount.id,

        destinationSummary,

        idempotencyKey,
      ],
    );

    const updatedWalletResult = await client.query(
      `
            UPDATE designer_wallets

            SET
              available_balance =
                available_balance -
                $1,

              pending_payout_balance =
                pending_payout_balance +
                $1

            WHERE user_id = $2
              AND available_balance >=
                $1

            RETURNING
              available_balance,
              pending_escrow_balance,
              pending_payout_balance
          `,
      [requestedAmount, designerId],
    );

    if (updatedWalletResult.rows.length === 0) {
      throw new Error(
        "The wallet balance changed before the payout could be reserved.",
      );
    }

    await client.query("COMMIT");

    return res.status(201).json({
      status: "success",

      idempotent: false,

      message:
        "The bank payout request was created and the amount is reserved for admin transfer.",

      data: payoutResponseRow(insertResult.rows[0]),

      wallet: serializeWallet(updatedWalletResult.rows[0]),
    });
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Payout request creation failed:", error);

    if (error.code === "23505") {
      return sendError(
        res,
        409,
        "This payout request has already been submitted.",
      );
    }

    return sendError(
      res,
      500,
      "The payout request could not be created safely.",
    );
  } finally {
    client.release();
  }
};

/*=========================================================
4. Retry Existing Stripe Bank Payout
Disabled Compatibility Endpoint
=========================================================*/

exports.retryStripePayout = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  /*
   * Endpoint remains temporarily for route compatibility.
   *
   * It does not create:
   *
   * - Stripe Transfer
   * - Stripe payout
   * - connected account
   */

  return sendError(
    res,
    410,
    "Stripe Connect designer payouts are disabled. New designer withdrawals use verified manual bank payouts.",
    {
      code: "STRIPE_CONNECT_DISABLED",

      payout_method: "manual",
    },
  );
};

/*=========================================================
5. Fetch Payout Request History
=========================================================*/

exports.getPayoutHistory = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  const page = parsePositiveInteger(req.query?.page, 1, 100000);

  const limit = parsePositiveInteger(req.query?.limit, 25, 100);

  const offset = (page - 1) * limit;

  const requestedStatus = String(req.query?.status || "")
    .trim()
    .toLowerCase();

  const status = PAYOUT_STATUSES.has(requestedStatus) ? requestedStatus : null;

  const values = [designerId];

  const conditions = ["dpr.designer_id = $1"];

  if (status) {
    values.push(status);

    conditions.push(`dpr.status = $${values.length}`);
  }

  values.push(limit);

  const limitIndex = values.length;

  values.push(offset);

  const offsetIndex = values.length;

  try {
    const result = await db.query(
      `
            SELECT
              dpr.*,

              (
                SELECT
                  COUNT(*)

                FROM designer_payout_attempts dpa_count

                WHERE dpa_count.payout_request_id =
                  dpr.id
              )
              AS payout_attempt_count,

              latest_attempt.id
                AS latest_attempt_id,

              latest_attempt.attempt_number
                AS latest_attempt_number,

              latest_attempt.status
                AS latest_attempt_status,

              latest_attempt.provider_payout_id
                AS latest_attempt_provider_payout_id,

              latest_attempt.previous_provider_payout_id
                AS latest_attempt_previous_payout_id,

              latest_attempt.failure_reason
                AS latest_attempt_failure_reason,

              latest_attempt.created_at
                AS latest_attempt_created_at,

              latest_attempt.submitted_at
                AS latest_attempt_submitted_at,

              latest_attempt.completed_at
                AS latest_attempt_completed_at,

              latest_attempt.failed_at
                AS latest_attempt_failed_at,

              latest_attempt.canceled_at
                AS latest_attempt_canceled_at,

              latest_attempt.updated_at
                AS latest_attempt_updated_at,

              COUNT(*) OVER()
                AS total_count

            FROM designer_payout_requests dpr

            LEFT JOIN LATERAL (
              SELECT
                dpa.*

              FROM designer_payout_attempts dpa

              WHERE dpa.payout_request_id =
                dpr.id

              ORDER BY
                dpa.attempt_number DESC,
                dpa.created_at DESC

              LIMIT 1
            ) latest_attempt
              ON TRUE

            WHERE
              ${conditions.join(" AND ")}

            ORDER BY
              dpr.requested_at DESC

            LIMIT
              $${limitIndex}

            OFFSET
              $${offsetIndex}
          `,
      values,
    );

    const total = Number(result.rows[0]?.total_count || 0);

    return res.status(200).json({
      status: "success",

      data: result.rows.map(payoutResponseRow),

      pagination: {
        page,

        limit,

        total,

        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Payout history fetch failed:", error);

    return sendError(
      res,
      500,
      "The payout request history could not be loaded.",
    );
  }
};

/*=========================================================
6. Cancel Pending Payout Request
=========================================================*/

exports.cancelPayoutRequest = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  const requestId = String(req.params?.id || "").trim();

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!isUuid(requestId)) {
    return sendError(res, 400, "A valid payout request ID is required.");
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const requestResult = await client.query(
      `
            SELECT *

            FROM designer_payout_requests

            WHERE id = $1
              AND designer_id = $2

            LIMIT 1

            FOR UPDATE
          `,
      [requestId, designerId],
    );

    const payoutRequest = requestResult.rows[0];

    if (!payoutRequest) {
      await rollbackQuietly(client);

      return sendError(res, 404, "The payout request was not found.");
    }

    if (payoutRequest.status === "cancelled") {
      await client.query("COMMIT");

      return res.status(200).json({
        status: "success",

        idempotent: true,

        message: "The payout request is already cancelled.",

        data: payoutResponseRow(payoutRequest),
      });
    }

    /*
     * Historical Stripe payouts are deliberately
     * read-only.
     *
     * We must not restore their balances through the
     * new manual flow because their old external Stripe
     * state may already have moved money.
     */

    if (payoutRequest.payout_method !== "manual") {
      await rollbackQuietly(client);

      return sendError(
        res,
        409,
        "Historical Stripe payout requests cannot be cancelled through the new manual payout flow.",
        {
          code: "HISTORICAL_STRIPE_PAYOUT_READ_ONLY",
        },
      );
    }

    if (payoutRequest.status !== "pending") {
      await rollbackQuietly(client);

      return sendError(
        res,
        409,
        "Only a pending payout request can be cancelled.",
      );
    }

    const amount = Number(payoutRequest.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("The payout request contains an invalid amount.");
    }

    const walletResult = await client.query(
      `
            UPDATE designer_wallets

            SET
              pending_payout_balance =
                pending_payout_balance -
                $1,

              available_balance =
                available_balance +
                $1

            WHERE user_id = $2
              AND pending_payout_balance >=
                $1

            RETURNING
              available_balance,
              pending_escrow_balance,
              pending_payout_balance
          `,
      [amount, designerId],
    );

    if (walletResult.rows.length === 0) {
      throw new Error(
        "The wallet does not contain the reserved payout amount.",
      );
    }

    const cancelledResult = await client.query(
      `
            UPDATE designer_payout_requests

            SET
              status =
                'cancelled',

              provider_status =
                'cancelled',

              cancelled_at =
                NOW(),

              updated_at =
                NOW()

            WHERE id = $1
              AND designer_id = $2

            RETURNING *
          `,
      [payoutRequest.id, designerId],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      status: "success",

      idempotent: false,

      message: "The payout request was cancelled and the funds were restored.",

      data: payoutResponseRow(cancelledResult.rows[0]),

      wallet: serializeWallet(walletResult.rows[0]),
    });
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Payout cancellation failed:", error);

    return sendError(
      res,
      500,
      "The payout request could not be cancelled safely.",
    );
  } finally {
    client.release();
  }
};

/*=========================================================
7. Fetch Designer Payout Accounts
=========================================================*/

exports.getPayoutAccounts = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  /*
   * designer_payout_accounts contains old provider payout
   * accounts such as Stripe Connect.
   *
   * They stay in the database for historical/audit use.
   *
   * They are intentionally not returned as selectable
   * destinations for new withdrawals.
   */

  return res.status(200).json({
    status: "success",

    data: [],

    payout_method: "manual",

    stripe_connect_available: false,
  });
};

/*=========================================================
8. Start Stripe Connect Onboarding - Disabled
=========================================================*/

exports.startStripeConnectOnboarding = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  /*
   * Route remains temporarily for frontend/API
   * compatibility.
   *
   * No Stripe API call is made here.
   */

  return sendError(
    res,
    410,
    "Stripe Connect is no longer used for designer payouts. Add a verified bank payout account instead.",
    {
      code: "STRIPE_CONNECT_DISABLED",

      payout_method: "manual",
    },
  );
};

/*=========================================================
9. Stripe Connect Status - Manual Payout Mode
=========================================================*/

exports.getStripeConnectStatus = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  try {
    const routing = await getDesignerPayoutRouting(db, designerId);

    /*
     * Kept temporarily for frontend/API compatibility.
     *
     * It reports the current universal manual payout
     * policy.
     */

    return res.status(200).json({
      status: "success",

      data: {
        connected: false,

        onboarding_required: false,

        stripe_connect_available: false,

        payout_method: routing.payoutMethod,

        manual_bank_available: routing.manualBankAvailable,

        country_required: !routing.payoutMethod,

        account: null,

        capabilities: {
          stripe_transfers: null,

          payouts: null,
        },
      },
    });
  } catch (error) {
    console.error("Designer payout status lookup failed:", error);

    return sendError(
      res,

      error.statusCode || 500,

      error.statusCode
        ? error.message
        : "The designer payout status could not be loaded.",

      error.code
        ? {
            code: error.code,
          }
        : undefined,
    );
  }
};

/*
=========================================================
END OF DESIGNER FINANCE CONTROLLER
=========================================================

There is intentionally NO:

- createWalletDeposit
- processWalletDepositInternal
- verifyWalletDeposit

There is intentionally NO designer wallet funding route
or Stripe PaymentIntent creation in this controller.

Designer balance flow:

completed booking
      ↓
escrow release
      ↓
available designer wallet balance
      ↓
manual withdrawal request
      ↓
verified bank account
      ↓
Super Admin bank transfer

Historical Stripe payout/deposit records remain readable
where needed for audit and reconciliation only.

=========================================================
*/
