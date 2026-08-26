"use strict";

/*
=========================================================
FashionVision Designer Finance Controller
Version 3.8
=========================================================
*/

const { randomUUID } = require("crypto");
const Stripe = require("stripe");
const db = require("../config/db");

const stripeConnectService = require("../services/payments/StripeConnectService");

const stripeConnectPayoutService = require("../services/payouts/StripeConnectPayoutService");

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY is missing from the backend environment.");
}

const stripe = new Stripe(stripeSecretKey);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PAYOUT_METHODS = new Set(["manual", "stripe"]);

const PAYOUT_STATUSES = new Set([
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

const EARNING_TYPES = new Set(["escrow_release", "wallet_deposit"]);

const MIN_PAYOUT_CENTS = Math.max(
  1,
  Math.round(Number(process.env.DESIGNER_MIN_PAYOUT_AMOUNT || 10) * 100),
);

const MAX_MONEY_CENTS = 100000000;

const STRIPE_V1_SAFE_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

const RECOVERABLE_BANK_PAYOUT_PROVIDER_STATUSES = new Set([
  "payout_failed",
  "payout_canceled",
  "payout_retry_submitting",
  "payout_retry_status_unknown",
  "payout_create_failed",
  "payout_retry_create_failed",
]);

const TRANSFER_UNCERTAIN_PROVIDER_STATUSES = new Set([
  "transfer_submitting",
  "transfer_status_unknown",
]);

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

function normalizePayoutMethod(value) {
  const method = String(value || "manual")
    .trim()
    .toLowerCase();

  return PAYOUT_METHODS.has(method) ? method : null;
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

function isStripePayoutId(value) {
  return /^po_[A-Za-z0-9]+$/.test(String(value || "").trim());
}

function stripeRetryReferenceTime(row) {
  /*
   * The replay window must be anchored to the original
   * Stripe Transfer submission period.
   *
   * updated_at is intentionally NOT used here because it is
   * mutable and could otherwise extend the automatic replay
   * window after unrelated local state updates.
   */
  const candidates = [row?.processing_at, row?.requested_at];

  for (const value of candidates) {
    const time = new Date(value).getTime();

    if (!Number.isNaN(time)) {
      return time;
    }
  }

  return null;
}

function isPastStripeSafeRetryWindow(row) {
  const referenceTime = stripeRetryReferenceTime(row);

  if (!referenceTime) {
    return true;
  }

  return Date.now() - referenceTime >= STRIPE_V1_SAFE_RETRY_WINDOW_MS;
}

function isRecoverableStripeBankPayoutRequest(row) {
  return Boolean(
    row &&
    row.payout_method === "stripe" &&
    row.provider === "stripe" &&
    row.provider_transaction_id &&
    isStripePayoutId(row.provider_payout_id) &&
    RECOVERABLE_BANK_PAYOUT_PROVIDER_STATUSES.has(
      String(row.provider_status || "").toLowerCase(),
    ),
  );
}

function buildManualReconciliationResult(payoutRequest, message, code) {
  return {
    success: false,
    manualReconciliationRequired: true,
    code,
    message,
    payoutRequest,
  };
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

  const latestAttemptStatus = latestAttempt?.status || null;

  const bankPayoutRecoveryRequired = Boolean(
    row.payout_method === "stripe" &&
    row.provider === "stripe" &&
    row.provider_transaction_id &&
    (["failed", "canceled", "create_failed", "status_unknown"].includes(
      latestAttemptStatus,
    ) ||
      isRecoverableStripeBankPayoutRequest(row)),
  );

  return {
    request_id: row.id,
    designer_id: row.designer_id,
    amount: Number(row.amount || 0).toFixed(2),
    payout_method: row.payout_method,
    payout_account_id: row.payout_account_id || null,
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
    bank_payout_recovery_required: bankPayoutRecoveryRequired,
  };
}

async function payoutResponseRowWithAttempts(row) {
  if (!row?.id) {
    return payoutResponseRow(row);
  }

  const result = await db.query(
    `
      WITH attempt_count AS (
        SELECT
          COUNT(*)::integer AS payout_attempt_count

        FROM designer_payout_attempts

        WHERE payout_request_id = $1
      ),

      latest_attempt AS (
        SELECT
          id,
          attempt_number,
          status,
          provider_payout_id,
          previous_provider_payout_id,
          failure_reason,
          created_at,
          submitted_at,
          completed_at,
          failed_at,
          canceled_at,
          updated_at

        FROM designer_payout_attempts

        WHERE payout_request_id = $1

        ORDER BY
          attempt_number DESC,
          created_at DESC

        LIMIT 1
      )

      SELECT
        attempt_count.payout_attempt_count,

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
          AS latest_attempt_updated_at

      FROM attempt_count

      LEFT JOIN latest_attempt
        ON TRUE
    `,
    [row.id],
  );

  return payoutResponseRow({
    ...row,
    ...(result.rows[0] || {}),
  });
}

function normalizeIsoCountryCode(value) {
  const country = String(value || "")
    .trim()
    .toUpperCase();

  return /^[A-Z]{2}$/.test(country) ? country : null;
}

function maskStripeAccountId(value) {
  const accountId = String(value || "").trim();

  if (!accountId) {
    return null;
  }

  return `Stripe ••••••${accountId.slice(-6)}`;
}

function payoutAccountResponseRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    is_default: Boolean(row.is_default),
    destination_summary:
      row.destination_summary || maskStripeAccountId(row.provider_account_id),
    details_submitted: Boolean(row.details_submitted),
    payouts_enabled: Boolean(row.payouts_enabled),
    onboarding_completed_at: row.onboarding_completed_at || null,
    last_verified_at: row.last_verified_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getStripeConnectRedirectUrls() {
  const configuredReturnUrl = String(
    process.env.STRIPE_CONNECT_RETURN_URL || "",
  ).trim();

  const configuredRefreshUrl = String(
    process.env.STRIPE_CONNECT_REFRESH_URL || "",
  ).trim();

  const configuredFrontendBaseUrl = String(
    process.env.FRONTEND_URL || process.env.CLIENT_URL || "",
  )
    .trim()
    .replace(/\/+$/, "");

  const developmentFrontendBaseUrl =
    configuredFrontendBaseUrl || "http://localhost:5173";

  const returnUrl =
    configuredReturnUrl ||
    `${developmentFrontendBaseUrl}/designer/finance?stripe_connect=return`;

  const refreshUrl =
    configuredRefreshUrl ||
    `${developmentFrontendBaseUrl}/designer/finance?stripe_connect=refresh`;

  if (process.env.NODE_ENV === "production") {
    if (
      !configuredFrontendBaseUrl &&
      (!configuredReturnUrl || !configuredRefreshUrl)
    ) {
      const error = new Error(
        "Production Stripe Connect redirect URLs are not configured.",
      );

      error.statusCode = 500;
      error.code = "STRIPE_CONNECT_REDIRECT_URLS_MISSING";

      throw error;
    }

    for (const [name, value] of [
      ["STRIPE_CONNECT_RETURN_URL", returnUrl],
      ["STRIPE_CONNECT_REFRESH_URL", refreshUrl],
    ]) {
      let parsed;

      try {
        parsed = new URL(value);
      } catch {
        const error = new Error(`${name} is not a valid URL.`);

        error.statusCode = 500;
        error.code = "INVALID_STRIPE_CONNECT_REDIRECT_URL";

        throw error;
      }

      if (parsed.protocol !== "https:") {
        const error = new Error(`${name} must use HTTPS in production.`);

        error.statusCode = 500;
        error.code = "STRIPE_CONNECT_HTTPS_REQUIRED";

        throw error;
      }
    }
  }

  return {
    returnUrl,
    refreshUrl,
  };
}

function requirementDeadlineStatus(requirement) {
  return (
    requirement?.minimum_deadline?.status ||
    requirement?.impact?.restricts_capabilities?.deadline?.status ||
    null
  );
}

function buildStripeConnectState(account) {
  const recipient = account?.configuration?.recipient || {};

  const stripeBalance = recipient?.capabilities?.stripe_balance || {};

  const transferStatus = stripeBalance?.stripe_transfers?.status || null;

  const payoutStatus = stripeBalance?.payouts?.status || null;

  const requirements = account?.requirements || {};

  const requirementEntries = Array.isArray(requirements.entries)
    ? requirements.entries
    : [];

  const summaryDeadlineStatus =
    requirements?.summary?.minimum_deadline?.status || null;

  const hasBlockingRequirements =
    ["currently_due", "past_due"].includes(summaryDeadlineStatus) ||
    requirementEntries.some((entry) =>
      ["currently_due", "past_due"].includes(requirementDeadlineStatus(entry)),
    );

  const appliedConfigurations = Array.isArray(account?.applied_configurations)
    ? account.applied_configurations
    : [];

  const recipientApplied = appliedConfigurations.includes("recipient");

  const closed = account?.closed === true;

  const payoutsEnabled =
    !closed && transferStatus === "active" && payoutStatus === "active";

  const restricted =
    ["restricted", "unsupported"].includes(transferStatus) ||
    ["restricted", "unsupported"].includes(payoutStatus);

  const detailsSubmitted =
    payoutsEnabled || (recipientApplied && !hasBlockingRequirements);

  let status = "onboarding";

  if (closed) {
    status = "disabled";
  } else if (payoutsEnabled) {
    status = "active";
  } else if (restricted) {
    status = "restricted";
  }

  return {
    status,
    detailsSubmitted,
    payoutsEnabled,
    transferStatus,
    payoutStatus,
    hasBlockingRequirements,

    safeMetadata: {
      object: account?.object || null,
      dashboard: account?.dashboard || null,
      applied_configurations: appliedConfigurations,
      recipient_transfer_status: transferStatus,
      recipient_payout_status: payoutStatus,
      requirements_deadline_status: summaryDeadlineStatus,
      has_blocking_requirements: hasBlockingRequirements,
      livemode: Boolean(account?.livemode),
    },
  };
}

async function syncStripePayoutAccount(
  queryable,
  payoutAccount,
  stripeAccount,
) {
  const state = buildStripeConnectState(stripeAccount);

  const result = await queryable.query(
    `
      UPDATE designer_payout_accounts
      SET
        status = $1,
        details_submitted = $2,
        payouts_enabled = $3,
        provider_metadata =
          COALESCE(
            provider_metadata,
            '{}'::jsonb
          ) ||
          $4::jsonb,

        onboarding_completed_at =
          CASE
            WHEN $3 = TRUE
              THEN COALESCE(
                onboarding_completed_at,
                NOW()
              )
            ELSE
              onboarding_completed_at
          END,

        last_verified_at =
          NOW(),

        updated_at =
          NOW()

      WHERE id = $5

      RETURNING *
      `,
    [
      state.status,
      state.detailsSubmitted,
      state.payoutsEnabled,
      JSON.stringify(state.safeMetadata),
      payoutAccount.id,
    ],
  );

  return {
    row: result.rows[0] || payoutAccount,
    state,
  };
}

function stripeErrorDetails(error) {
  const type = cleanText(error?.type || error?.name || "StripeError", 100);

  const code = cleanText(error?.code || error?.raw?.code || "", 100) || null;

  const message = cleanText(
    error?.message || "Stripe could not process the withdrawal.",
    500,
  );

  return {
    type,
    code,
    message,
  };
}

function isDeterministicStripeTransferFailure(error) {
  const details = stripeErrorDetails(error);

  const deterministicTypes = new Set([
    "StripeInvalidRequestError",
    "StripeAuthenticationError",
    "StripePermissionError",
    "StripeCardError",
  ]);

  const deterministicCodes = new Set([
    "balance_insufficient",
    "resource_missing",
    "account_invalid",
  ]);

  return (
    deterministicTypes.has(details.type) ||
    (details.code && deterministicCodes.has(details.code)) ||
    (error?.statusCode === 400 &&
      typeof details.code === "string" &&
      details.code.startsWith("INVALID_"))
  );
}

function isDeterministicStripeBankPayoutFailure(error) {
  const details = stripeErrorDetails(error);

  const deterministicTypes = new Set([
    "StripeInvalidRequestError",
    "StripeAuthenticationError",
    "StripePermissionError",
  ]);

  const deterministicCodes = new Set([
    "balance_insufficient",
    "payouts_not_allowed",
    "resource_missing",
    "account_invalid",
    "invalid_currency",
  ]);

  return (
    deterministicTypes.has(details.type) ||
    (details.code && deterministicCodes.has(details.code)) ||
    (error?.statusCode === 400 &&
      typeof details.code === "string" &&
      details.code.startsWith("INVALID_"))
  );
}

async function getReadyStripePayoutAccount(designerId, payoutAccountId = null) {
  const values = [designerId];

  const conditions = ["designer_id = $1", "provider = 'stripe'"];

  if (payoutAccountId) {
    if (!isUuid(payoutAccountId)) {
      const error = new Error(
        "The Stripe payout account reference is invalid.",
      );

      error.statusCode = 409;
      error.code = "INVALID_STRIPE_PAYOUT_ACCOUNT_REFERENCE";

      throw error;
    }

    values.push(payoutAccountId);

    conditions.push(`id = $${values.length}`);
  }

  const accountResult = await db.query(
    `
      SELECT *

      FROM designer_payout_accounts

      WHERE
        ${conditions.join(" AND ")}

      ORDER BY
        is_default DESC,
        created_at ASC

      LIMIT 1
      `,
    values,
  );

  const payoutAccount = accountResult.rows[0];

  if (!payoutAccount) {
    const error = new Error(
      "Connect and complete Stripe onboarding before requesting a Stripe withdrawal.",
    );

    error.statusCode = 409;
    error.code = "STRIPE_PAYOUT_ACCOUNT_REQUIRED";

    throw error;
  }

  const stripeAccount = await stripeConnectService.getConnectedAccount(
    payoutAccount.provider_account_id,
  );

  const synchronized = await syncStripePayoutAccount(
    db,
    payoutAccount,
    stripeAccount,
  );

  if (
    synchronized.row.status !== "active" ||
    !synchronized.state.payoutsEnabled ||
    synchronized.state.transferStatus !== "active" ||
    synchronized.state.payoutStatus !== "active"
  ) {
    const error = new Error(
      "The connected Stripe account is not currently ready to receive withdrawals.",
    );

    error.statusCode = 409;
    error.code = "STRIPE_PAYOUT_ACCOUNT_NOT_READY";

    throw error;
  }

  return synchronized.row;
}

async function ensureManualStripePayoutSchedule(payoutAccount) {
  if (!payoutAccount?.provider_account_id) {
    const error = new Error(
      "A Stripe connected account is required before configuring payouts.",
    );

    error.statusCode = 409;
    error.code = "STRIPE_PAYOUT_ACCOUNT_REQUIRED";

    throw error;
  }

  const schedule = await stripeConnectPayoutService.setManualPayoutSchedule(
    payoutAccount.provider_account_id,
  );

  if (schedule?.interval !== "manual") {
    const error = new Error(
      "Stripe did not confirm the connected account's manual payout schedule.",
    );

    error.statusCode = 502;
    error.code = "STRIPE_MANUAL_PAYOUT_SCHEDULE_NOT_CONFIRMED";

    throw error;
  }

  return schedule;
}

async function getWalletSnapshot(designerId) {
  await ensureWalletRow(db, designerId);

  const result = await db.query(
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

  return serializeWallet(result.rows[0]);
}

async function finalizeStripeTransferSuccess(
  payoutRequestId,
  designerId,
  transfer,
) {
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
      [payoutRequestId, designerId],
    );

    const payoutRequest = requestResult.rows[0];

    if (!payoutRequest) {
      throw new Error(
        "The payout request disappeared before the Stripe transfer could be finalized.",
      );
    }

    if (payoutRequest.provider_transaction_id) {
      if (payoutRequest.provider_transaction_id !== transfer.id) {
        throw new Error(
          "The payout request is already associated with a different Stripe transfer.",
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

      return {
        idempotent: true,
        payoutRequest,
        wallet: serializeWallet(walletResult.rows[0]),
      };
    }

    if (!["pending", "processing"].includes(payoutRequest.status)) {
      throw new Error(
        `The payout request cannot accept a Stripe transfer while its status is ${payoutRequest.status}.`,
      );
    }

    const amount = Number(payoutRequest.amount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("The payout request contains an invalid amount.");
    }

    const walletResult = await client.query(
      `
        UPDATE designer_wallets

        SET
          pending_payout_balance =
            pending_payout_balance -
            $1

        WHERE user_id = $2
          AND pending_payout_balance >= $1

        RETURNING
          available_balance,
          pending_escrow_balance,
          pending_payout_balance
        `,
      [amount, designerId],
    );

    if (walletResult.rows.length === 0) {
      throw new Error(
        "The reserved payout balance could not be finalized after the Stripe transfer.",
      );
    }

    await client.query(
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

      SELECT
        gen_random_uuid(),
        NULL,
        $1,
        $2,
        $3,
        0,
        $3,
        'payout',
        NULL,
        'stripe',
        NULL,
        $4,
        'usd',
        NOW()

      WHERE NOT EXISTS (
        SELECT 1

        FROM transactions

        WHERE transaction_type = 'payout'
          AND payment_provider = 'stripe'
          AND provider_transaction_id = $4
      )
      `,
      [designerId, payoutRequestId, amount, transfer.id],
    );

    const updatedRequestResult = await client.query(
      `
        UPDATE designer_payout_requests

        SET
          status = 'processing',
          provider = 'stripe',
          provider_transaction_id = $1,
          provider_status = 'transfer_created',
          currency = 'usd',

          processing_at =
            COALESCE(
              processing_at,
              NOW()
            ),

          failure_reason = NULL,
          updated_at = NOW()

        WHERE id = $2

        RETURNING *
        `,
      [transfer.id, payoutRequestId],
    );

    await client.query("COMMIT");

    return {
      idempotent: false,
      payoutRequest: updatedRequestResult.rows[0],
      wallet: serializeWallet(walletResult.rows[0]),
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

async function finalizeStripeTransferFailure(
  payoutRequestId,
  designerId,
  error,
) {
  const details = stripeErrorDetails(error);

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
      [payoutRequestId, designerId],
    );

    const payoutRequest = requestResult.rows[0];

    if (!payoutRequest) {
      throw new Error(
        "The payout request could not be found during failure recovery.",
      );
    }

    if (payoutRequest.provider_transaction_id) {
      await client.query("COMMIT");

      return {
        payoutRequest,
        wallet: await getWalletSnapshot(designerId),
      };
    }

    if (payoutRequest.status === "failed") {
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

      return {
        payoutRequest,
        wallet: serializeWallet(walletResult.rows[0]),
      };
    }

    if (!["pending", "processing"].includes(payoutRequest.status)) {
      await client.query("COMMIT");

      return {
        payoutRequest,
        wallet: await getWalletSnapshot(designerId),
      };
    }

    const amount = Number(payoutRequest.amount || 0);

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
          AND pending_payout_balance >= $1

        RETURNING
          available_balance,
          pending_escrow_balance,
          pending_payout_balance
        `,
      [amount, designerId],
    );

    if (walletResult.rows.length === 0) {
      throw new Error(
        "The reserved payout amount could not be restored after Stripe rejected the transfer.",
      );
    }

    const reason = cleanText(
      [details.code, details.message].filter(Boolean).join(": "),
      1000,
    );

    const updatedRequestResult = await client.query(
      `
        UPDATE designer_payout_requests

        SET
          status = 'failed',
          provider = 'stripe',
          provider_status = 'transfer_failed',
          failure_reason = $1,
          failed_at = NOW(),
          updated_at = NOW()

        WHERE id = $2

        RETURNING *
        `,
      [reason || "Stripe rejected the transfer.", payoutRequestId],
    );

    await client.query("COMMIT");

    return {
      payoutRequest: updatedRequestResult.rows[0],
      wallet: serializeWallet(walletResult.rows[0]),
    };
  } catch (recoveryError) {
    await rollbackQuietly(client);
    throw recoveryError;
  } finally {
    client.release();
  }
}

async function markStripeTransferStatusUnknown(
  payoutRequestId,
  designerId,
  error,
) {
  const details = stripeErrorDetails(error);

  const reason = cleanText(
    [details.code, details.message].filter(Boolean).join(": "),
    1000,
  );

  const result = await db.query(
    `
      UPDATE designer_payout_requests

      SET
        status = 'processing',
        provider = 'stripe',
        provider_status = 'transfer_status_unknown',
        failure_reason = $1,

        processing_at =
          COALESCE(
            processing_at,
            NOW()
          ),

        updated_at = NOW()

      WHERE id = $2
        AND designer_id = $3
        AND provider_transaction_id IS NULL

        AND status IN (
          'pending',
          'processing'
        )

      RETURNING *
      `,
    [
      reason || "Stripe transfer status could not be confirmed.",
      payoutRequestId,
      designerId,
    ],
  );

  const payoutRequest = result.rows[0];

  return {
    payoutRequest,
    wallet: await getWalletSnapshot(designerId),
  };
}

async function executeStripePayoutTransfer(payoutRequest, payoutAccount) {
  if (!payoutRequest) {
    throw new Error(
      "A payout request is required before creating a Stripe transfer.",
    );
  }

  if (!payoutAccount?.provider_account_id) {
    throw new Error("A Stripe connected account is required for this payout.");
  }

  if (payoutRequest.provider_transaction_id) {
    return {
      success: true,
      idempotent: true,
      payoutRequest,
      wallet: await getWalletSnapshot(payoutRequest.designer_id),
      transferId: payoutRequest.provider_transaction_id,
    };
  }

  if (
    TRANSFER_UNCERTAIN_PROVIDER_STATUSES.has(
      String(payoutRequest.provider_status || "").toLowerCase(),
    ) &&
    isPastStripeSafeRetryWindow(payoutRequest)
  ) {
    return {
      ...buildManualReconciliationResult(
        payoutRequest,
        "The previous Stripe transfer submission is too old to retry blindly. Reconcile the transfer in Stripe before attempting another external transfer.",
        "STRIPE_TRANSFER_MANUAL_RECONCILIATION_REQUIRED",
      ),

      wallet: await getWalletSnapshot(payoutRequest.designer_id),
    };
  }

  const amountCents = moneyToCents(payoutRequest.amount);

  if (!amountCents) {
    throw new Error(
      "The payout request contains an invalid Stripe transfer amount.",
    );
  }

  try {
    const transfer = await stripeConnectPayoutService.createTransfer({
      amountCents,
      connectedAccountId: payoutAccount.provider_account_id,
      payoutRequestId: payoutRequest.id,
      designerId: payoutRequest.designer_id,
      currency: payoutRequest.currency || "usd",
      description: `DesignByYou withdrawal ${payoutRequest.id}`,
    });

    if (!transfer?.id || !String(transfer.id).startsWith("tr_")) {
      throw new Error("Stripe did not return a valid transfer ID.");
    }

    const finalized = await finalizeStripeTransferSuccess(
      payoutRequest.id,
      payoutRequest.designer_id,
      transfer,
    );

    return {
      success: true,
      idempotent: finalized.idempotent,
      payoutRequest: finalized.payoutRequest,
      wallet: finalized.wallet,
      transferId: transfer.id,
    };
  } catch (error) {
    console.error("Stripe designer payout transfer failed:", error);

    if (isDeterministicStripeTransferFailure(error)) {
      const failed = await finalizeStripeTransferFailure(
        payoutRequest.id,
        payoutRequest.designer_id,
        error,
      );

      return {
        success: false,
        deterministicFailure: true,
        error: stripeErrorDetails(error),
        payoutRequest: failed.payoutRequest,
        wallet: failed.wallet,
      };
    }

    const unknown = await markStripeTransferStatusUnknown(
      payoutRequest.id,
      payoutRequest.designer_id,
      error,
    );

    return {
      success: false,
      uncertain: true,
      error: stripeErrorDetails(error),
      payoutRequest: unknown.payoutRequest || payoutRequest,
      wallet: unknown.wallet,
    };
  }
}

/*=========================================================
Stripe Payout Attempt Helpers
=========================================================*/

const PAYOUT_ATTEMPT_TERMINAL_FAILURE_STATUSES = new Set([
  "failed",
  "canceled",
  "create_failed",
]);

const PAYOUT_ATTEMPT_RESUBMITTABLE_WITHOUT_PAYOUT_ID = new Set([
  "pending_submission",
  "submitting",
  "status_unknown",
]);

function payoutAttemptResponseRow(row) {
  if (!row) {
    return null;
  }

  return {
    attempt_id: row.id,
    payout_request_id: row.payout_request_id,
    payout_account_id: row.payout_account_id || null,
    attempt_number: Number(row.attempt_number || 0),
    provider: row.provider || null,
    provider_account_id: row.provider_account_id || null,
    provider_transfer_id: row.provider_transfer_id || null,
    provider_payout_id: row.provider_payout_id || null,
    previous_provider_payout_id: row.previous_provider_payout_id || null,
    amount_cents: Number(row.amount_cents || 0),
    amount: centsToMoney(Number(row.amount_cents || 0)).toFixed(2),
    currency: String(row.currency || "usd").toLowerCase(),
    status: row.status,
    failure_code: row.failure_code || null,
    failure_reason: row.failure_reason || null,
    created_at: row.created_at,
    submitted_at: row.submitted_at,
    completed_at: row.completed_at,
    failed_at: row.failed_at,
    canceled_at: row.canceled_at,
    updated_at: row.updated_at,
  };
}

function stripePayoutStatusToAttemptStatus(value) {
  const status = cleanText(value, 50).toLowerCase();

  if (
    ["pending", "in_transit", "paid", "failed", "canceled"].includes(status)
  ) {
    return status;
  }

  return "status_unknown";
}

function payoutAttemptStatusToProviderStatus(status) {
  switch (status) {
    case "pending_submission":
      return "payout_pending_submission";

    case "submitting":
      return "payout_submitting";

    case "pending":
      return "payout_pending";

    case "in_transit":
      return "payout_in_transit";

    case "paid":
      return "payout_paid";

    case "failed":
      return "payout_failed";

    case "canceled":
      return "payout_canceled";

    case "create_failed":
      return "payout_create_failed";

    case "status_unknown":
      return "payout_status_unknown";

    default:
      return "payout_status_unknown";
  }
}

function payoutAttemptStatusToRequestStatus(status) {
  if (status === "paid") {
    return "completed";
  }

  if (PAYOUT_ATTEMPT_TERMINAL_FAILURE_STATUSES.has(status)) {
    return "failed";
  }

  return "processing";
}

/*
 * Keep the synchronous Stripe response path compatible with
 * the webhook transition rules.
 *
 * In particular:
 * - paid may later become failed for the SAME Stripe payout;
 * - paid must not be downgraded to pending/in_transit;
 * - failed/canceled are terminal for the same payout attempt.
 */
function shouldApplyPayoutAttemptTransition(currentStatus, incomingStatus) {
  const current = cleanText(currentStatus, 50).toLowerCase();
  const incoming = cleanText(incomingStatus, 50).toLowerCase();

  if (!current || current === incoming) {
    return {
      apply: current !== incoming,
      idempotent: current === incoming,
    };
  }

  if (current === "failed" || current === "canceled") {
    return {
      apply: false,
      idempotent: true,
    };
  }

  if (current === "paid") {
    return {
      apply: incoming === "failed",
      idempotent: incoming !== "failed",
    };
  }

  return {
    apply: true,
    idempotent: false,
  };
}

function payoutAttemptProviderMetadata(attempt) {
  const metadata = attempt?.provider_metadata;

  if (!metadata) {
    return {};
  }

  if (typeof metadata === "object") {
    return metadata;
  }

  try {
    const parsed = JSON.parse(metadata);

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function payoutAttemptAllowsMissingPreviousPayoutId(attempt) {
  return (
    Number(attempt?.attempt_number || 0) > 1 &&
    payoutAttemptProviderMetadata(attempt).allow_missing_previous_payout_id ===
      true
  );
}

function isBackfilledPayoutAttempt(attempt) {
  const metadata = attempt?.provider_metadata;

  if (!metadata) {
    return false;
  }

  if (typeof metadata === "object") {
    return metadata.backfilled === true;
  }

  try {
    return JSON.parse(metadata)?.backfilled === true;
  } catch {
    return false;
  }
}

function payoutAttemptRetryReferenceTime(attempt) {
  const candidates = [attempt?.submitted_at, attempt?.created_at];

  for (const value of candidates) {
    const time = new Date(value).getTime();

    if (!Number.isNaN(time)) {
      return time;
    }
  }

  return null;
}

function isPayoutAttemptPastSafeRetryWindow(attempt) {
  const referenceTime = payoutAttemptRetryReferenceTime(attempt);

  if (!referenceTime) {
    return true;
  }

  return Date.now() - referenceTime >= STRIPE_V1_SAFE_RETRY_WINDOW_MS;
}

async function getLatestPayoutAttempt(
  queryable,
  payoutRequestId,
  { forUpdate = false } = {},
) {
  const result = await queryable.query(
    `
      SELECT *

      FROM designer_payout_attempts

      WHERE payout_request_id = $1

      ORDER BY
        attempt_number DESC,
        created_at DESC

      LIMIT 1

      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [payoutRequestId],
  );

  return result.rows[0] || null;
}

async function getPayoutAccountById(payoutAccountId, designerId) {
  if (!isUuid(payoutAccountId)) {
    return null;
  }

  const result = await db.query(
    `
      SELECT *

      FROM designer_payout_accounts

      WHERE id = $1
        AND designer_id = $2
        AND provider = 'stripe'

      LIMIT 1
    `,
    [payoutAccountId, designerId],
  );

  return result.rows[0] || null;
}

function validateStripePayoutAgainstAttempt(
  payout,
  attempt,
  payoutRequest,
  { strictAttemptMetadata = true } = {},
) {
  if (!payout || payout.object !== "payout") {
    throw new Error("Stripe did not return a valid payout object.");
  }

  if (
    attempt.provider_payout_id &&
    String(payout.id) !== String(attempt.provider_payout_id)
  ) {
    throw new Error(
      "The Stripe payout ID does not match the recorded payout attempt.",
    );
  }

  const payoutAmount = Number(payout.amount || 0);
  const attemptAmount = Number(attempt.amount_cents || 0);

  if (
    !Number.isSafeInteger(payoutAmount) ||
    payoutAmount <= 0 ||
    payoutAmount !== attemptAmount
  ) {
    throw new Error(
      "The Stripe payout amount does not match the recorded payout attempt.",
    );
  }

  const payoutCurrency = String(payout.currency || "").toLowerCase();
  const attemptCurrency = String(attempt.currency || "usd").toLowerCase();

  if (!payoutCurrency || payoutCurrency !== attemptCurrency) {
    throw new Error(
      "The Stripe payout currency does not match the recorded payout attempt.",
    );
  }

  if (strictAttemptMetadata) {
    stripeConnectPayoutService.assertPayoutAttemptMetadata(payout, {
      payoutRequestId: attempt.payout_request_id,
      payoutAttemptId: attempt.id,
      attemptNumber: Number(attempt.attempt_number),
      designerId: payoutRequest.designer_id,
      transferId: attempt.provider_transfer_id,
      previousPayoutId: attempt.previous_provider_payout_id || null,
    });

    return true;
  }

  const metadata = payout.metadata || {};

  if (
    metadata.payout_request_id &&
    metadata.payout_request_id !== attempt.payout_request_id
  ) {
    throw new Error(
      "The legacy Stripe payout metadata does not match the payout request.",
    );
  }

  if (
    metadata.designer_id &&
    metadata.designer_id !== payoutRequest.designer_id
  ) {
    throw new Error(
      "The legacy Stripe payout metadata does not match the designer.",
    );
  }

  if (
    metadata.transfer_id &&
    attempt.provider_transfer_id &&
    metadata.transfer_id !== attempt.provider_transfer_id
  ) {
    throw new Error(
      "The legacy Stripe payout metadata does not match the Stripe transfer.",
    );
  }

  return true;
}

async function createPayoutAttemptRow(
  client,
  payoutRequest,
  payoutAccount,
  {
    attemptNumber,
    previousPayoutId = null,
    allowMissingPreviousPayoutId = false,
    replacesAttemptId = null,
    replacementReason = null,
  },
) {
  if (!payoutRequest?.provider_transaction_id) {
    throw new Error(
      "A Stripe transfer must exist before a bank payout attempt can be created.",
    );
  }

  const amountCents = moneyToCents(payoutRequest.amount);

  if (!amountCents) {
    throw new Error(
      "The payout request contains an invalid bank payout amount.",
    );
  }

  if (attemptNumber === 1 && allowMissingPreviousPayoutId) {
    throw new Error(
      "The first bank payout attempt cannot use missing-previous-payout recovery.",
    );
  }

  if (previousPayoutId && !isStripePayoutId(previousPayoutId)) {
    throw new Error("The previous Stripe payout reference is invalid.");
  }

  if (
    Number(attemptNumber) > 1 &&
    !previousPayoutId &&
    !allowMissingPreviousPayoutId
  ) {
    throw new Error(
      "A replacement bank payout attempt must reference the previous Stripe payout unless the previous attempt failed before Stripe created a payout.",
    );
  }

  const attemptId = randomUUID();

  const idempotencyKey =
    stripeConnectPayoutService.buildPayoutAttemptIdempotencyKey(
      payoutRequest.id,
      attemptId,
    );

  const providerMetadata = {
    source: "designerFinanceController",
    payout_request_id: payoutRequest.id,
    attempt_number: attemptNumber,
  };

  if (replacesAttemptId) {
    providerMetadata.replaces_attempt_id = replacesAttemptId;
  }

  if (replacementReason) {
    providerMetadata.replacement_reason = replacementReason;
  }

  if (allowMissingPreviousPayoutId) {
    providerMetadata.allow_missing_previous_payout_id = true;
  }

  const result = await client.query(
    `
      INSERT INTO designer_payout_attempts (
        id,
        payout_request_id,
        payout_account_id,
        attempt_number,
        provider,
        provider_account_id,
        provider_transfer_id,
        provider_payout_id,
        previous_provider_payout_id,
        idempotency_key,
        amount_cents,
        currency,
        status,
        failure_code,
        failure_reason,
        provider_metadata,
        created_at,
        submitted_at,
        completed_at,
        failed_at,
        canceled_at,
        updated_at
      )

      VALUES (
        $1,
        $2,
        $3,
        $4,
        'stripe',
        $5,
        $6,
        NULL,
        $7,
        $8,
        $9,
        $10,
        'submitting',
        NULL,
        NULL,
        $11::jsonb,
        NOW(),
        NOW(),
        NULL,
        NULL,
        NULL,
        NOW()
      )

      RETURNING *
    `,
    [
      attemptId,
      payoutRequest.id,
      payoutAccount.id,
      attemptNumber,
      payoutAccount.provider_account_id,
      payoutRequest.provider_transaction_id,
      previousPayoutId,
      idempotencyKey,
      amountCents,
      String(payoutRequest.currency || "usd").toLowerCase(),
      JSON.stringify(providerMetadata),
    ],
  );

  return result.rows[0];
}

async function prepareInitialPayoutAttempt(payoutRequest, payoutAccount) {
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
      [payoutRequest.id, payoutRequest.designer_id],
    );

    const lockedRequest = requestResult.rows[0];

    if (!lockedRequest) {
      throw new Error(
        "The payout request could not be found before creating its bank payout attempt.",
      );
    }

    if (!lockedRequest.provider_transaction_id) {
      throw new Error(
        "The Stripe transfer must be recorded before creating the first bank payout attempt.",
      );
    }

    const existingAttempt = await getLatestPayoutAttempt(
      client,
      lockedRequest.id,
      {
        forUpdate: true,
      },
    );

    if (existingAttempt) {
      await client.query("COMMIT");

      return {
        created: false,
        payoutRequest: lockedRequest,
        attempt: existingAttempt,
      };
    }

    const attempt = await createPayoutAttemptRow(
      client,
      lockedRequest,
      payoutAccount,
      {
        attemptNumber: 1,
        previousPayoutId: null,
      },
    );

    const updatedRequestResult = await client.query(
      `
        UPDATE designer_payout_requests

        SET
          status = 'processing',
          provider = 'stripe',
          provider_status = 'payout_submitting',
          failure_reason = NULL,

          processing_at =
            COALESCE(
              processing_at,
              NOW()
            ),

          updated_at = NOW()

        WHERE id = $1

        RETURNING *
      `,
      [lockedRequest.id],
    );

    await client.query("COMMIT");

    return {
      created: true,
      payoutRequest: updatedRequestResult.rows[0],
      attempt,
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

async function prepareReplacementPayoutAttempt(
  payoutRequest,
  payoutAccount,
  previousAttempt,
) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const locked = await lockPayoutRequestAndAttempt(
      client,
      payoutRequest.id,
      payoutRequest.designer_id,
      previousAttempt.id,
    );

    const lockedRequest = locked.payoutRequest;
    const lockedPreviousAttempt = locked.payoutAttempt;

    if (!lockedRequest || !lockedPreviousAttempt) {
      throw new Error(
        "The payout request or previous payout attempt could not be found before creating its replacement.",
      );
    }

    if (!lockedRequest.provider_transaction_id) {
      throw new Error(
        "A replacement bank payout cannot be created without the original Stripe transfer.",
      );
    }

    const latestAttempt = await getLatestPayoutAttempt(
      client,
      lockedRequest.id,
      {
        forUpdate: true,
      },
    );

    if (!latestAttempt) {
      throw new Error(
        "The previous payout attempt disappeared before replacement.",
      );
    }

    if (latestAttempt.id !== lockedPreviousAttempt.id) {
      await client.query("COMMIT");

      return {
        created: false,
        payoutRequest: lockedRequest,
        attempt: latestAttempt,
      };
    }

    if (
      !["failed", "canceled", "create_failed"].includes(latestAttempt.status)
    ) {
      throw new Error(
        "Only a definitively failed, canceled, or create-failed Stripe payout attempt can be replaced.",
      );
    }

    let previousPayoutId = null;
    let allowMissingPreviousPayoutId = false;

    if (
      latestAttempt.status === "failed" ||
      latestAttempt.status === "canceled"
    ) {
      if (!isStripePayoutId(latestAttempt.provider_payout_id)) {
        throw new Error(
          "A failed/canceled replacement payout attempt requires the Stripe payout ID.",
        );
      }

      previousPayoutId = latestAttempt.provider_payout_id;
    } else {
      /*
       * create_failed means Stripe did not create a new po_
       * for this attempt.
       *
       * If this create_failed attempt was itself replacing a
       * prior real po_, carry that lineage forward. Otherwise
       * there is legitimately no previous po_ to reference.
       */
      if (latestAttempt.provider_payout_id) {
        throw new Error(
          "A create-failed payout attempt must not already have a Stripe payout ID.",
        );
      }

      if (latestAttempt.previous_provider_payout_id) {
        if (!isStripePayoutId(latestAttempt.previous_provider_payout_id)) {
          throw new Error(
            "The create-failed payout attempt contains an invalid previous Stripe payout reference.",
          );
        }

        previousPayoutId = latestAttempt.previous_provider_payout_id;
      } else {
        allowMissingPreviousPayoutId = true;
      }
    }

    const nextAttemptNumber = Number(latestAttempt.attempt_number || 0) + 1;

    const attempt = await createPayoutAttemptRow(
      client,
      lockedRequest,
      payoutAccount,
      {
        attemptNumber: nextAttemptNumber,
        previousPayoutId,
        allowMissingPreviousPayoutId,
        replacesAttemptId: latestAttempt.id,
        replacementReason: latestAttempt.status,
      },
    );

    const updatedRequestResult = await client.query(
      `
        UPDATE designer_payout_requests

        SET
          status = 'processing',
          provider = 'stripe',
          provider_status = 'payout_retry_submitting',
          failure_reason = NULL,
          failed_at = NULL,
          completed_at = NULL,
          updated_at = NOW()

        WHERE id = $1

        RETURNING *
      `,
      [lockedRequest.id],
    );

    await client.query("COMMIT");

    return {
      created: true,
      payoutRequest: updatedRequestResult.rows[0],
      attempt,
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

async function markExistingAttemptSubmitting(payoutRequest, attempt) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const locked = await lockPayoutRequestAndAttempt(
      client,
      payoutRequest.id,
      payoutRequest.designer_id,
      attempt.id,
    );

    const lockedRequest = locked.payoutRequest;
    const lockedAttempt = locked.payoutAttempt;

    if (!lockedRequest || !lockedAttempt) {
      throw new Error(
        "The payout request or payout attempt could not be found before resubmission.",
      );
    }

    if (lockedAttempt.provider_payout_id) {
      await client.query("COMMIT");

      return {
        payoutRequest: lockedRequest,
        attempt: lockedAttempt,
      };
    }

    if (
      !PAYOUT_ATTEMPT_RESUBMITTABLE_WITHOUT_PAYOUT_ID.has(lockedAttempt.status)
    ) {
      throw new Error(
        `The payout attempt cannot be resubmitted while its status is ${lockedAttempt.status}.`,
      );
    }

    const updatedAttemptResult = await client.query(
      `
        UPDATE designer_payout_attempts

        SET
          status = 'submitting',
          failure_code = NULL,
          failure_reason = NULL,

          submitted_at =
            COALESCE(
              submitted_at,
              NOW()
            ),

          updated_at = NOW()

        WHERE id = $1

        RETURNING *
      `,
      [lockedAttempt.id],
    );

    const requestProviderStatus =
      Number(lockedAttempt.attempt_number) > 1
        ? "payout_retry_submitting"
        : "payout_submitting";

    const updatedRequestResult = await client.query(
      `
        UPDATE designer_payout_requests

        SET
          status = 'processing',
          provider_status = $1,
          failure_reason = NULL,
          failed_at = NULL,
          completed_at = NULL,
          updated_at = NOW()

        WHERE id = $2

        RETURNING *
      `,
      [requestProviderStatus, lockedRequest.id],
    );

    await client.query("COMMIT");

    return {
      payoutRequest: updatedRequestResult.rows[0],
      attempt: updatedAttemptResult.rows[0],
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

async function lockPayoutRequestAndAttempt(
  client,
  payoutRequestId,
  designerId,
  payoutAttemptId,
) {
  const result = await client.query(
    `
      SELECT
        row_to_json(dpat)
          AS payout_attempt,

        row_to_json(dpr)
          AS payout_request

      FROM designer_payout_attempts dpat

      INNER JOIN designer_payout_requests dpr
        ON dpr.id =
          dpat.payout_request_id

      WHERE dpat.id =
        $1

        AND dpr.id =
          $2

        AND dpr.designer_id =
          $3

      LIMIT 1

      FOR UPDATE OF dpat, dpr
    `,
    [payoutAttemptId, payoutRequestId, designerId],
  );

  const row = result.rows[0] || null;

  return {
    payoutAttempt: row?.payout_attempt || null,
    payoutRequest: row?.payout_request || null,
  };
}

async function mirrorResolvedPayoutAttemptToRequest(
  client,
  payoutRequest,
  payoutAttempt,
) {
  if (!payoutAttempt?.provider_payout_id) {
    throw new Error(
      "A resolved Stripe payout attempt must have a Stripe payout ID before it can be mirrored to the payout request.",
    );
  }

  const providerStatus = payoutAttemptStatusToProviderStatus(
    payoutAttempt.status,
  );

  const requestStatus = payoutAttemptStatusToRequestStatus(
    payoutAttempt.status,
  );

  const requestFailureReason = ["failed", "canceled"].includes(
    payoutAttempt.status,
  )
    ? payoutAttempt.failure_reason || `Stripe payout ${payoutAttempt.status}.`
    : null;

  const result = await client.query(
    `
      UPDATE designer_payout_requests

      SET
        provider = 'stripe',
        provider_payout_id = $1::varchar,
        provider_status = $2::varchar,
        status = $3::varchar,
        failure_reason = $4::text,

        processing_at =
          CASE
            WHEN $3::varchar = 'processing'
              THEN COALESCE(
                processing_at,
                NOW()
              )
            ELSE processing_at
          END,

        completed_at =
          CASE
            WHEN $3::varchar = 'completed'
              THEN COALESCE(
                completed_at,
                NOW()
              )
            ELSE NULL
          END,

        failed_at =
          CASE
            WHEN $3::varchar = 'failed'
              THEN COALESCE(
                failed_at,
                NOW()
              )
            ELSE NULL
          END,

        updated_at = NOW()

      WHERE id = $5::uuid
        AND designer_id = $6::uuid

      RETURNING *
    `,
    [
      payoutAttempt.provider_payout_id,
      providerStatus,
      requestStatus,
      requestFailureReason,
      payoutRequest.id,
      payoutRequest.designer_id,
    ],
  );

  return result.rows[0] || payoutRequest;
}

async function applyStripePayoutToAttempt(
  payoutRequest,
  attempt,
  payout,
  { strictAttemptMetadata = true } = {},
) {
  const incomingStatus = stripePayoutStatusToAttemptStatus(payout?.status);

  const failureCode = cleanText(payout?.failure_code, 100) || null;

  const failureReason = cleanText(payout?.failure_message, 1000) || null;

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    /*
     * Lock the exact attempt and parent request together,
     * matching the webhook's row-locking model.
     *
     * Re-reading both rows here prevents an older HTTP
     * response from overwriting a state already resolved by
     * a webhook.
     */
    const locked = await lockPayoutRequestAndAttempt(
      client,
      payoutRequest.id,
      payoutRequest.designer_id,
      attempt.id,
    );

    let lockedRequest = locked.payoutRequest;
    let lockedAttempt = locked.payoutAttempt;

    if (!lockedRequest || !lockedAttempt) {
      throw new Error(
        "The payout request or payout attempt disappeared before its Stripe result could be recorded.",
      );
    }

    /*
     * Validate against the locked rows rather than stale
     * caller snapshots.
     */
    validateStripePayoutAgainstAttempt(payout, lockedAttempt, lockedRequest, {
      strictAttemptMetadata,
    });

    if (
      lockedAttempt.provider_payout_id &&
      lockedAttempt.provider_payout_id !== payout.id
    ) {
      throw new Error(
        "The payout attempt is already associated with another Stripe payout.",
      );
    }

    const transition = shouldApplyPayoutAttemptTransition(
      lockedAttempt.status,
      incomingStatus,
    );

    if (transition.apply) {
      const updatedAttemptResult = await client.query(
        `
          UPDATE designer_payout_attempts

          SET
            provider_payout_id =
              COALESCE(
                provider_payout_id,
                $1::varchar
              ),

            status = $2::varchar,

            failure_code =
              CASE
                WHEN $2::varchar IN (
                  'failed',
                  'canceled'
                )
                  THEN $3::varchar
                ELSE NULL
              END,

            failure_reason =
              CASE
                WHEN $2::varchar IN (
                  'failed',
                  'canceled'
                )
                  THEN $4::text
                ELSE NULL
              END,

            completed_at =
              CASE
                WHEN $2::varchar = 'paid'
                  THEN COALESCE(
                    completed_at,
                    NOW()
                  )
                ELSE NULL
              END,

            failed_at =
              CASE
                WHEN $2::varchar = 'failed'
                  THEN COALESCE(
                    failed_at,
                    NOW()
                  )
                ELSE NULL
              END,

            canceled_at =
              CASE
                WHEN $2::varchar = 'canceled'
                  THEN COALESCE(
                    canceled_at,
                    NOW()
                  )
                ELSE NULL
              END,

            updated_at = NOW()

          WHERE id = $5::uuid
            AND payout_request_id = $6::uuid

          RETURNING *
        `,
        [
          payout.id,
          incomingStatus,
          failureCode,
          failureReason,
          lockedAttempt.id,
          lockedRequest.id,
        ],
      );

      lockedAttempt = updatedAttemptResult.rows[0] || lockedAttempt;
    }

    /*
     * Only the latest payout attempt may control the
     * compatibility fields on designer_payout_requests.
     *
     * This mirrors the webhook's stale-attempt protection.
     */
    const latestAttempt = await getLatestPayoutAttempt(
      client,
      lockedRequest.id,
      {
        forUpdate: true,
      },
    );

    if (!latestAttempt) {
      throw new Error(
        "The payout request no longer has a persistent payout attempt.",
      );
    }

    const isLatestAttempt = latestAttempt.id === lockedAttempt.id;

    if (isLatestAttempt) {
      lockedRequest = await mirrorResolvedPayoutAttemptToRequest(
        client,
        lockedRequest,
        lockedAttempt,
      );
    } else if (lockedAttempt.status === "paid") {
      console.error(
        "CRITICAL Stripe payout reconciliation warning: a non-latest payout attempt is paid during synchronous reconciliation.",
        {
          payoutRequestId: lockedRequest.id,
          designerId: lockedRequest.designer_id,
          payoutAttemptId: lockedAttempt.id,
          payoutAttemptNumber: lockedAttempt.attempt_number,
          payoutId: lockedAttempt.provider_payout_id || payout.id,
          latestAttemptId: latestAttempt.id,
          latestAttemptNumber: latestAttempt.attempt_number,
          latestPayoutId: latestAttempt.provider_payout_id || null,
        },
      );
    }

    await client.query("COMMIT");

    return {
      payoutRequest: lockedRequest,
      attempt: lockedAttempt,
      idempotent: Boolean(transition.idempotent),
      staleForRequest: !isLatestAttempt,
      wallet: await getWalletSnapshot(lockedRequest.designer_id),
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

async function markPayoutAttemptCreateFailure(payoutRequest, attempt, error) {
  const details = stripeErrorDetails(error);

  const failureReason = cleanText(
    [details.code, details.message].filter(Boolean).join(": "),
    1000,
  );

  const reason =
    failureReason || "Stripe rejected creation of the bank payout.";

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const locked = await lockPayoutRequestAndAttempt(
      client,
      payoutRequest.id,
      payoutRequest.designer_id,
      attempt.id,
    );

    let lockedRequest = locked.payoutRequest;
    let lockedAttempt = locked.payoutAttempt;

    if (!lockedRequest || !lockedAttempt) {
      throw new Error(
        "The payout request or payout attempt disappeared during payout-creation failure recovery.",
      );
    }

    /*
     * If a webhook or another reconciliation path already
     * attached a po_ payout, the external result is no longer
     * a create failure. Never downgrade that resolved state.
     */
    if (
      lockedAttempt.provider_payout_id ||
      ["pending", "in_transit", "paid", "failed", "canceled"].includes(
        lockedAttempt.status,
      )
    ) {
      await client.query("COMMIT");

      return {
        payoutRequest: lockedRequest,
        attempt: lockedAttempt,
        idempotent: true,
        wallet: await getWalletSnapshot(lockedRequest.designer_id),
      };
    }

    const wasAlreadyCreateFailed = lockedAttempt.status === "create_failed";

    if (!wasAlreadyCreateFailed) {
      const updatedAttemptResult = await client.query(
        `
          UPDATE designer_payout_attempts

          SET
            status = 'create_failed',
            failure_code = $1,
            failure_reason = $2,
            failed_at = COALESCE(failed_at, NOW()),
            completed_at = NULL,
            canceled_at = NULL,
            updated_at = NOW()

          WHERE id = $3
            AND payout_request_id = $4
            AND provider_payout_id IS NULL

          RETURNING *
        `,
        [
          details.code || details.type || null,
          reason,
          lockedAttempt.id,
          lockedRequest.id,
        ],
      );

      lockedAttempt = updatedAttemptResult.rows[0] || lockedAttempt;
    }

    const latestAttempt = await getLatestPayoutAttempt(
      client,
      lockedRequest.id,
      {
        forUpdate: true,
      },
    );

    if (!latestAttempt) {
      throw new Error(
        "The payout request no longer has a persistent payout attempt.",
      );
    }

    const isLatestAttempt = latestAttempt.id === lockedAttempt.id;

    if (isLatestAttempt && lockedAttempt.status === "create_failed") {
      const requestProviderStatus =
        Number(lockedAttempt.attempt_number || 0) > 1
          ? "payout_retry_create_failed"
          : "payout_create_failed";

      const updatedRequestResult = await client.query(
        `
          UPDATE designer_payout_requests

          SET
            status = 'failed',
            provider = 'stripe',
            provider_status = $1,
            failure_reason = $2,
            failed_at = COALESCE(failed_at, NOW()),
            completed_at = NULL,
            updated_at = NOW()

          WHERE id = $3
            AND designer_id = $4

          RETURNING *
        `,
        [
          requestProviderStatus,
          reason,
          lockedRequest.id,
          lockedRequest.designer_id,
        ],
      );

      lockedRequest = updatedRequestResult.rows[0] || lockedRequest;
    }

    await client.query("COMMIT");

    return {
      payoutRequest: lockedRequest,
      attempt: lockedAttempt,
      idempotent: wasAlreadyCreateFailed,
      staleForRequest: !isLatestAttempt,
      wallet: await getWalletSnapshot(lockedRequest.designer_id),
    };
  } catch (recoveryError) {
    await rollbackQuietly(client);
    throw recoveryError;
  } finally {
    client.release();
  }
}

async function markPayoutAttemptStatusUnknown(payoutRequest, attempt, error) {
  const details = stripeErrorDetails(error);

  const failureReason = cleanText(
    [details.code, details.message].filter(Boolean).join(": "),
    1000,
  );

  const reason =
    failureReason || "Stripe payout status could not be confirmed.";

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const locked = await lockPayoutRequestAndAttempt(
      client,
      payoutRequest.id,
      payoutRequest.designer_id,
      attempt.id,
    );

    let lockedRequest = locked.payoutRequest;
    let lockedAttempt = locked.payoutAttempt;

    if (!lockedRequest || !lockedAttempt) {
      throw new Error(
        "The payout request or payout attempt disappeared during unknown-status recovery.",
      );
    }

    /*
     * A provider payout ID or a resolved Stripe payout state
     * means another path already learned the external result.
     * Never downgrade it to status_unknown.
     */
    if (
      lockedAttempt.provider_payout_id ||
      [
        "pending",
        "in_transit",
        "paid",
        "failed",
        "canceled",
        "create_failed",
      ].includes(lockedAttempt.status)
    ) {
      await client.query("COMMIT");

      return {
        payoutRequest: lockedRequest,
        attempt: lockedAttempt,
        idempotent: true,
        wallet: await getWalletSnapshot(lockedRequest.designer_id),
      };
    }

    const wasAlreadyStatusUnknown = lockedAttempt.status === "status_unknown";

    if (!wasAlreadyStatusUnknown) {
      const updatedAttemptResult = await client.query(
        `
          UPDATE designer_payout_attempts

          SET
            status = 'status_unknown',
            failure_code = $1,
            failure_reason = $2,
            updated_at = NOW()

          WHERE id = $3
            AND payout_request_id = $4
            AND provider_payout_id IS NULL

          RETURNING *
        `,
        [
          details.code || details.type || null,
          reason,
          lockedAttempt.id,
          lockedRequest.id,
        ],
      );

      lockedAttempt = updatedAttemptResult.rows[0] || lockedAttempt;
    }

    const latestAttempt = await getLatestPayoutAttempt(
      client,
      lockedRequest.id,
      {
        forUpdate: true,
      },
    );

    if (!latestAttempt) {
      throw new Error(
        "The payout request no longer has a persistent payout attempt.",
      );
    }

    const isLatestAttempt = latestAttempt.id === lockedAttempt.id;

    if (isLatestAttempt && lockedAttempt.status === "status_unknown") {
      const requestProviderStatus =
        Number(lockedAttempt.attempt_number || 0) > 1
          ? "payout_retry_status_unknown"
          : "payout_status_unknown";

      const updatedRequestResult = await client.query(
        `
          UPDATE designer_payout_requests

          SET
            status = 'processing',
            provider = 'stripe',
            provider_status = $1,
            failure_reason = $2,
            failed_at = NULL,
            completed_at = NULL,
            updated_at = NOW()

          WHERE id = $3
            AND designer_id = $4

          RETURNING *
        `,
        [
          requestProviderStatus,
          reason,
          lockedRequest.id,
          lockedRequest.designer_id,
        ],
      );

      lockedRequest = updatedRequestResult.rows[0] || lockedRequest;
    }

    await client.query("COMMIT");

    return {
      payoutRequest: lockedRequest,
      attempt: lockedAttempt,
      idempotent: wasAlreadyStatusUnknown,
      staleForRequest: !isLatestAttempt,
      wallet: await getWalletSnapshot(lockedRequest.designer_id),
    };
  } catch (recoveryError) {
    await rollbackQuietly(client);
    throw recoveryError;
  } finally {
    client.release();
  }
}

async function submitStripePayoutAttempt(
  payoutRequest,
  payoutAccount,
  attempt,
) {
  try {
    const payout = await stripeConnectPayoutService.createPayoutAttempt({
      amountCents: Number(attempt.amount_cents),
      connectedAccountId: payoutAccount.provider_account_id,
      payoutRequestId: payoutRequest.id,
      payoutAttemptId: attempt.id,
      attemptNumber: Number(attempt.attempt_number),
      designerId: payoutRequest.designer_id,
      transferId: payoutRequest.provider_transaction_id,
      previousPayoutId: attempt.previous_provider_payout_id || null,
      allowMissingPreviousPayoutId:
        payoutAttemptAllowsMissingPreviousPayoutId(attempt),
      currency: attempt.currency || payoutRequest.currency || "usd",
      description: `DesignByYou bank payout attempt ${attempt.attempt_number} for ${payoutRequest.id}`,
      idempotencyKey: attempt.idempotency_key,
    });

    if (!payout?.id || !String(payout.id).startsWith("po_")) {
      throw new Error("Stripe did not return a valid payout ID.");
    }

    const finalized = await applyStripePayoutToAttempt(
      payoutRequest,
      attempt,
      payout,
      {
        strictAttemptMetadata: true,
      },
    );

    return {
      success: true,
      idempotent: Boolean(finalized.idempotent),
      payoutRequest: finalized.payoutRequest,
      attempt: finalized.attempt,
      wallet: finalized.wallet,
      payout,
    };
  } catch (error) {
    console.error("Stripe payout-attempt submission failed:", error);

    if (isDeterministicStripeBankPayoutFailure(error)) {
      const failed = await markPayoutAttemptCreateFailure(
        payoutRequest,
        attempt,
        error,
      );

      return {
        success: false,
        deterministicFailure: true,
        error: stripeErrorDetails(error),
        payoutRequest: failed.payoutRequest,
        attempt: failed.attempt,
        wallet: failed.wallet,
      };
    }

    const unknown = await markPayoutAttemptStatusUnknown(
      payoutRequest,
      attempt,
      error,
    );

    return {
      success: false,
      uncertain: true,
      error: stripeErrorDetails(error),
      payoutRequest: unknown.payoutRequest,
      attempt: unknown.attempt,
      wallet: unknown.wallet,
    };
  }
}

async function reconcilePayoutAttempt(payoutRequest, attempt) {
  if (!attempt?.provider_payout_id) {
    return {
      payoutRequest,
      attempt,
      reconciled: false,
    };
  }

  const payoutAccount =
    (attempt.payout_account_id
      ? await getPayoutAccountById(
          attempt.payout_account_id,
          payoutRequest.designer_id,
        )
      : null) ||
    (payoutRequest.payout_account_id
      ? await getPayoutAccountById(
          payoutRequest.payout_account_id,
          payoutRequest.designer_id,
        )
      : null);

  const connectedAccountId =
    attempt.provider_account_id || payoutAccount?.provider_account_id || null;

  if (!connectedAccountId) {
    throw new Error(
      "The connected Stripe account for this payout attempt could not be resolved.",
    );
  }

  let payout;

  if (isBackfilledPayoutAttempt(attempt)) {
    payout = await stripeConnectPayoutService.retrievePayout(
      attempt.provider_payout_id,
      connectedAccountId,
    );
  } else {
    payout = await stripeConnectPayoutService.retrievePayoutAttempt({
      payoutId: attempt.provider_payout_id,
      connectedAccountId,
      payoutRequestId: payoutRequest.id,
      payoutAttemptId: attempt.id,
      attemptNumber: Number(attempt.attempt_number),
      designerId: payoutRequest.designer_id,
      transferId: attempt.provider_transfer_id,
      previousPayoutId: attempt.previous_provider_payout_id || null,
    });
  }

  const applied = await applyStripePayoutToAttempt(
    payoutRequest,
    attempt,
    payout,
    {
      strictAttemptMetadata: !isBackfilledPayoutAttempt(attempt),
    },
  );

  return {
    payoutRequest: applied.payoutRequest,
    attempt: applied.attempt,
    wallet: applied.wallet,
    payout,
    reconciled: true,
  };
}

async function buildStripePayoutExecutionResponse(
  res,
  execution,
  { statusCode = 200, message = null } = {},
) {
  if (execution.success) {
    return res.status(statusCode).json({
      status: "success",
      idempotent: Boolean(execution.idempotent),
      message: message || "Stripe bank payout attempt submitted successfully.",
      data: await payoutResponseRowWithAttempts(execution.payoutRequest),
      payout_attempt: payoutAttemptResponseRow(execution.attempt),
      wallet: execution.wallet,
      transfer: {
        provider: "stripe",
        transfer_id: execution.payoutRequest?.provider_transaction_id || null,
        status: execution.payoutRequest?.provider_transaction_id
          ? "transfer_created"
          : null,
      },
      payout: {
        provider: "stripe",
        payout_id: execution.attempt?.provider_payout_id || null,
        status: execution.attempt?.status || null,
        attempt_number: Number(execution.attempt?.attempt_number || 0),
      },
    });
  }

  if (execution.deterministicFailure) {
    return sendError(
      res,
      502,
      "Stripe rejected creation of the external bank payout. The original Stripe transfer is not repeated and the money is not restored to the internal wallet.",
      {
        code: execution.error?.code || execution.error?.type || null,
        payout_request: await payoutResponseRowWithAttempts(
          execution.payoutRequest,
        ),
        payout_attempt: payoutAttemptResponseRow(execution.attempt),
        wallet: execution.wallet,
      },
    );
  }

  return res.status(202).json({
    status: "success",
    idempotent: false,
    retry_safe: true,
    message:
      "The Stripe bank payout result could not be confirmed. Do not create another withdrawal or another Stripe Transfer. Retry/reconcile this payout attempt safely.",
    data: await payoutResponseRowWithAttempts(execution.payoutRequest),
    payout_attempt: payoutAttemptResponseRow(execution.attempt),
    wallet: execution.wallet,
    transfer: {
      provider: "stripe",
      transfer_id: execution.payoutRequest?.provider_transaction_id || null,
      status: execution.payoutRequest?.provider_transaction_id
        ? "transfer_created"
        : null,
    },
    provider_status:
      Number(execution.attempt?.attempt_number || 0) > 1
        ? "payout_retry_status_unknown"
        : "payout_status_unknown",
  });
}

/*=========================================================
1. Fetch Wallet Overview
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
          ) AS lifetime_earnings

        FROM transactions

        WHERE receiver_id = $1

          AND transaction_type = 'escrow_release'
        `,
          [designerId],
        ),

        db.query(
          `
        SELECT
          COALESCE(
            SUM(net_amount),
            0
          ) AS lifetime_deposits

        FROM transactions

        WHERE receiver_id = $1
          AND transaction_type = 'wallet_deposit'
        `,
          [designerId],
        ),

        db.query(
          `
        SELECT
          COALESCE(
            SUM(amount)
            FILTER (
              WHERE status = 'completed'
            ),
            0
          ) AS lifetime_withdrawn,

          COALESCE(
            SUM(amount)
            FILTER (
              WHERE status IN (
                'pending',
                'processing'
              )
            ),
            0
          ) AS queued_payouts

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
2. Fetch Earnings and Credit Ledger
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

      sender_name: row.sender_name || "Wallet funding",

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
3. Create Payout Request
=========================================================*/

exports.requestPayout = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  const requestedCents = moneyToCents(req.body?.amount);

  const payoutMethod = normalizePayoutMethod(
    req.body?.payoutMethod || req.body?.payout_method,
  );

  const requestedDestinationSummary = cleanText(
    req.body?.destinationSummary ||
      req.body?.destination_summary ||
      req.body?.accountDetails,
    255,
  );

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

  if (!payoutMethod) {
    return sendError(res, 400, "Select a valid payout method.");
  }

  if (!isUuid(idempotencyKey)) {
    return sendError(res, 400, "A valid client_request_id UUID is required.");
  }

  const requestedAmount = centsToMoney(requestedCents);

  let readyStripePayoutAccount = null;

  if (payoutMethod === "stripe") {
    try {
      readyStripePayoutAccount = await getReadyStripePayoutAccount(designerId);

      await ensureManualStripePayoutSchedule(readyStripePayoutAccount);
    } catch (error) {
      console.error("Stripe payout-account readiness check failed:", error);

      return sendError(
        res,
        error.statusCode || 502,
        error.statusCode
          ? error.message
          : "The connected Stripe account could not be prepared for withdrawal.",
        error.code
          ? {
              code: error.code,
            }
          : undefined,
      );
    }
  }

  const client = await db.connect();

  let payoutRequest = null;
  let reservationWallet = null;
  let newlyCreated = false;

  try {
    await client.query("BEGIN");

    await client.query(
      `
        SELECT pg_advisory_xact_lock(
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

      payoutRequest = existing;

      if (
        payoutMethod === "stripe" &&
        !existing.provider_transaction_id &&
        ["pending", "processing"].includes(existing.status) &&
        !TRANSFER_UNCERTAIN_PROVIDER_STATUSES.has(
          String(existing.provider_status || "").toLowerCase(),
        )
      ) {
        const payoutAccountId =
          existing.payout_account_id || readyStripePayoutAccount?.id || null;

        if (!payoutAccountId) {
          throw new Error(
            "The Stripe payout request does not have a connected payout account.",
          );
        }

        const updateResult = await client.query(
          `
            UPDATE designer_payout_requests

            SET
              payout_account_id =
                COALESCE(
                  payout_account_id,
                  $1
                ),

              provider = 'stripe',
              provider_status = 'transfer_submitting',
              currency = 'usd',
              status = 'processing',

              processing_at =
                COALESCE(
                  processing_at,
                  NOW()
                ),

              updated_at = NOW()

            WHERE id = $2

            RETURNING *
          `,
          [payoutAccountId, existing.id],
        );

        payoutRequest = updateResult.rows[0];
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

      reservationWallet = serializeWallet(walletResult.rows[0]);

      await client.query("COMMIT");
    } else {
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

      const isStripePayout = payoutMethod === "stripe";

      const destinationSummary = isStripePayout
        ? readyStripePayoutAccount?.destination_summary ||
          maskStripeAccountId(readyStripePayoutAccount?.provider_account_id)
        : requestedDestinationSummary || null;

      const insertResult = await client.query(
        `
          INSERT INTO designer_payout_requests (
            id,
            designer_id,
            amount,
            payout_method,
            payout_account_id,
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
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            'usd',
            NOW(),
            $10,
            NOW()
          )

          RETURNING *
        `,
        [
          designerId,
          requestedAmount,
          payoutMethod,
          isStripePayout ? readyStripePayoutAccount.id : null,
          isStripePayout ? "stripe" : null,
          destinationSummary,
          isStripePayout ? "processing" : "pending",
          idempotencyKey,
          isStripePayout ? "transfer_submitting" : null,
          isStripePayout ? new Date() : null,
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
            AND available_balance >= $1

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

      payoutRequest = insertResult.rows[0];

      reservationWallet = serializeWallet(updatedWalletResult.rows[0]);

      newlyCreated = true;

      await client.query("COMMIT");
    }
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

  if (payoutMethod === "manual") {
    return res.status(newlyCreated ? 201 : 200).json({
      status: "success",
      idempotent: !newlyCreated,
      message: newlyCreated
        ? "The payout request was created and the amount is now reserved."
        : "This payout request was already created.",
      data: payoutResponseRow(payoutRequest),
      wallet: reservationWallet,
    });
  }

  if (payoutRequest.status === "completed") {
    return res.status(200).json({
      status: "success",
      idempotent: true,
      message: "This Stripe withdrawal is already completed.",
      data: payoutResponseRow(payoutRequest),
      wallet: reservationWallet,
    });
  }

  if (payoutRequest.status === "cancelled") {
    return res.status(200).json({
      status: "success",
      idempotent: true,
      message: "This payout request is already cancelled.",
      data: payoutResponseRow(payoutRequest),
      wallet: reservationWallet,
    });
  }

  if (
    payoutRequest.status === "failed" &&
    payoutRequest.provider_transaction_id
  ) {
    const latestAttempt = await getLatestPayoutAttempt(db, payoutRequest.id);

    return sendError(
      res,
      409,
      "The Stripe transfer already succeeded, but the bank payout failed. Retry the existing withdrawal through the payout retry endpoint; do not create a new withdrawal.",
      {
        code: "STRIPE_BANK_PAYOUT_RETRY_REQUIRED",
        payout_request: payoutResponseRow(payoutRequest),
        payout_attempt: payoutAttemptResponseRow(latestAttempt),
      },
    );
  }

  if (
    payoutRequest.status === "failed" &&
    !payoutRequest.provider_transaction_id
  ) {
    return res.status(200).json({
      status: "success",
      idempotent: true,
      message:
        "This Stripe withdrawal failed before funds left the internal wallet. Any reserved wallet funds were restored. Use a new client_request_id for a genuinely new withdrawal.",
      data: payoutResponseRow(payoutRequest),
      wallet: reservationWallet,
    });
  }

  try {
    if (
      !readyStripePayoutAccount ||
      readyStripePayoutAccount.id !== payoutRequest.payout_account_id
    ) {
      readyStripePayoutAccount = await getReadyStripePayoutAccount(
        designerId,
        payoutRequest.payout_account_id,
      );

      await ensureManualStripePayoutSchedule(readyStripePayoutAccount);
    }
  } catch (error) {
    console.error("Stripe payout-account retry readiness check failed:", error);

    const statusHelper = payoutRequest.provider_transaction_id
      ? null
      : markStripeTransferStatusUnknown;

    if (statusHelper) {
      const unknown = await statusHelper(payoutRequest.id, designerId, error);

      return res.status(202).json({
        status: "success",
        idempotent: !newlyCreated,
        retry_safe: true,
        message:
          "The Stripe withdrawal is reserved, but the connected account could not be re-verified for the transfer.",
        data: payoutResponseRow(unknown.payoutRequest || payoutRequest),
        wallet: unknown.wallet,
      });
    }

    return res.status(202).json({
      status: "success",
      idempotent: true,
      retry_safe: true,
      message:
        "The original Stripe transfer exists, but the connected account is not currently ready for the bank payout. Fix the connected account and retry the existing payout request.",
      data: payoutResponseRow(payoutRequest),
      wallet: reservationWallet,
    });
  }

  let transferExecution;

  try {
    transferExecution = await executeStripePayoutTransfer(
      payoutRequest,
      readyStripePayoutAccount,
    );
  } catch (error) {
    console.error("Stripe transfer reconciliation failed:", error);

    return sendError(
      res,
      500,
      "The Stripe transfer could not be reconciled safely. Retry later with the same client_request_id and do not create a new payout request.",
      {
        code: "STRIPE_TRANSFER_RECONCILIATION_ERROR",
      },
    );
  }

  if (!transferExecution.success) {
    if (transferExecution.manualReconciliationRequired) {
      return sendError(
        res,
        409,
        transferExecution.message ||
          "The Stripe transfer must be reconciled manually before this withdrawal can continue.",
        {
          code:
            transferExecution.code ||
            "STRIPE_TRANSFER_MANUAL_RECONCILIATION_REQUIRED",
          payout_request: payoutResponseRow(
            transferExecution.payoutRequest || payoutRequest,
          ),
          wallet: transferExecution.wallet || reservationWallet,
        },
      );
    }

    if (transferExecution.deterministicFailure) {
      return sendError(
        res,
        502,
        "Stripe could not create the withdrawal transfer. The reserved wallet funds were restored.",
        {
          code:
            transferExecution.error?.code ||
            transferExecution.error?.type ||
            null,
          payout_request: payoutResponseRow(transferExecution.payoutRequest),
          wallet: transferExecution.wallet,
        },
      );
    }

    return res.status(202).json({
      status: "success",
      idempotent: !newlyCreated,
      retry_safe: true,
      message:
        "Stripe transfer status could not be confirmed. The funds remain reserved. Retry this request with the same client_request_id.",
      data: payoutResponseRow(transferExecution.payoutRequest),
      wallet: transferExecution.wallet,
      provider_status: "transfer_status_unknown",
    });
  }

  payoutRequest = transferExecution.payoutRequest;
  reservationWallet = transferExecution.wallet;

  let prepared;

  try {
    prepared = await prepareInitialPayoutAttempt(
      payoutRequest,
      readyStripePayoutAccount,
    );
  } catch (error) {
    console.error("Initial Stripe payout-attempt preparation failed:", error);

    if (error.code === "23505") {
      const latestAttempt = await getLatestPayoutAttempt(db, payoutRequest.id);

      return res.status(202).json({
        status: "success",
        idempotent: true,
        retry_safe: true,
        message:
          "A bank payout attempt already exists for this withdrawal. Reconcile the existing attempt instead of creating another one.",
        data: payoutResponseRow(payoutRequest),
        payout_attempt: payoutAttemptResponseRow(latestAttempt),
        wallet: reservationWallet,
      });
    }

    return sendError(
      res,
      500,
      "The Stripe transfer succeeded, but the first bank payout attempt could not be prepared safely.",
      {
        code: "PAYOUT_ATTEMPT_PREPARATION_FAILED",
        transfer_id: transferExecution.transferId,
      },
    );
  }

  payoutRequest = prepared.payoutRequest;
  let payoutAttempt = prepared.attempt;

  if (payoutAttempt.provider_payout_id) {
    try {
      const reconciled = await reconcilePayoutAttempt(
        payoutRequest,
        payoutAttempt,
      );

      return res.status(200).json({
        status: "success",
        idempotent: true,
        message:
          reconciled.attempt?.status === "paid"
            ? "This Stripe withdrawal is already completed."
            : "This Stripe withdrawal already has a bank payout attempt. Its current Stripe state was reconciled.",
        data: payoutResponseRow(reconciled.payoutRequest),
        payout_attempt: payoutAttemptResponseRow(reconciled.attempt),
        wallet: reconciled.wallet || reservationWallet,
      });
    } catch (error) {
      console.error(
        "Existing Stripe payout-attempt reconciliation failed:",
        error,
      );

      return res.status(202).json({
        status: "success",
        idempotent: true,
        retry_safe: true,
        message:
          "An existing Stripe bank payout could not be reconciled right now. Do not create another withdrawal or payout attempt.",
        data: payoutResponseRow(payoutRequest),
        payout_attempt: payoutAttemptResponseRow(payoutAttempt),
        wallet: reservationWallet,
      });
    }
  }

  if (
    ["submitting", "status_unknown"].includes(payoutAttempt.status) &&
    !prepared.created &&
    isPayoutAttemptPastSafeRetryWindow(payoutAttempt)
  ) {
    return sendError(
      res,
      409,
      "The existing Stripe payout attempt has an unknown result and is outside the automatic idempotency replay window. Reconcile it before submitting another payout.",
      {
        code: "STRIPE_PAYOUT_ATTEMPT_MANUAL_RECONCILIATION_REQUIRED",
        payout_request: payoutResponseRow(payoutRequest),
        payout_attempt: payoutAttemptResponseRow(payoutAttempt),
      },
    );
  }

  if (payoutAttempt.status === "create_failed") {
    return sendError(
      res,
      409,
      "The first Stripe bank payout attempt was rejected. Retry this existing withdrawal through the payout retry endpoint.",
      {
        code: "STRIPE_BANK_PAYOUT_RETRY_REQUIRED",
        payout_request: payoutResponseRow(payoutRequest),
        payout_attempt: payoutAttemptResponseRow(payoutAttempt),
      },
    );
  }

  if (
    !prepared.created &&
    PAYOUT_ATTEMPT_RESUBMITTABLE_WITHOUT_PAYOUT_ID.has(payoutAttempt.status)
  ) {
    try {
      const marked = await markExistingAttemptSubmitting(
        payoutRequest,
        payoutAttempt,
      );

      payoutRequest = marked.payoutRequest;
      payoutAttempt = marked.attempt;
    } catch (error) {
      console.error(
        "Existing payout-attempt resubmission preparation failed:",
        error,
      );

      return sendError(
        res,
        500,
        "The existing bank payout attempt could not be prepared for a safe retry.",
        {
          code: "PAYOUT_ATTEMPT_RESUBMISSION_PREPARATION_FAILED",
        },
      );
    }
  }

  const execution = await submitStripePayoutAttempt(
    payoutRequest,
    readyStripePayoutAccount,
    payoutAttempt,
  );

  return buildStripePayoutExecutionResponse(res, execution, {
    statusCode: newlyCreated ? 201 : 200,
    message:
      "Stripe withdrawal submitted successfully. The original Transfer and first persistent bank payout attempt are recorded; final completion is confirmed by payout state/webhooks.",
  });
};

/*=========================================================
4. Retry Existing Stripe Bank Payout
=========================================================*/

exports.retryStripePayout = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  const payoutRequestId = String(req.params?.id || "").trim();

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!isUuid(payoutRequestId)) {
    return sendError(res, 400, "A valid payout request ID is required.");
  }

  let requestResult;

  try {
    requestResult = await db.query(
      `
        SELECT *

        FROM designer_payout_requests

        WHERE id = $1
          AND designer_id = $2

        LIMIT 1
      `,
      [payoutRequestId, designerId],
    );
  } catch (error) {
    console.error("Stripe payout retry request lookup failed:", error);

    return sendError(res, 500, "The payout request could not be loaded.");
  }

  let payoutRequest = requestResult.rows[0];

  if (!payoutRequest) {
    return sendError(res, 404, "The payout request was not found.");
  }

  if (
    payoutRequest.payout_method !== "stripe" ||
    payoutRequest.provider !== "stripe"
  ) {
    return sendError(
      res,
      409,
      "Only Stripe payout requests can use Stripe bank-payout recovery.",
    );
  }

  if (!payoutRequest.provider_transaction_id) {
    return sendError(
      res,
      409,
      "This withdrawal does not have a completed Stripe Transfer. It must be resumed through the original payout request instead of the bank-payout retry endpoint.",
      {
        code: "STRIPE_TRANSFER_NOT_CREATED",
      },
    );
  }

  if (payoutRequest.status === "completed") {
    return res.status(200).json({
      status: "success",
      idempotent: true,
      message: "This Stripe withdrawal is already completed.",
      data: await payoutResponseRowWithAttempts(payoutRequest),
      wallet: await getWalletSnapshot(designerId),
    });
  }

  if (payoutRequest.status === "cancelled") {
    return sendError(res, 409, "A cancelled payout request cannot be retried.");
  }

  let payoutAttempt = await getLatestPayoutAttempt(db, payoutRequest.id);

  if (!payoutAttempt) {
    let readyPayoutAccount;

    try {
      readyPayoutAccount = await getReadyStripePayoutAccount(
        designerId,
        payoutRequest.payout_account_id,
      );

      await ensureManualStripePayoutSchedule(readyPayoutAccount);
    } catch (error) {
      return sendError(
        res,
        error.statusCode || 409,
        error.statusCode
          ? error.message
          : "The connected Stripe account is not currently ready for payout recovery.",
        error.code
          ? {
              code: error.code,
            }
          : undefined,
      );
    }

    const prepared = await prepareInitialPayoutAttempt(
      payoutRequest,
      readyPayoutAccount,
    );

    payoutRequest = prepared.payoutRequest;
    payoutAttempt = prepared.attempt;

    const execution = await submitStripePayoutAttempt(
      payoutRequest,
      readyPayoutAccount,
      payoutAttempt,
    );

    return buildStripePayoutExecutionResponse(res, execution, {
      statusCode: 200,
      message:
        "The existing Stripe Transfer was preserved and the first bank payout attempt was submitted.",
    });
  }

  if (payoutAttempt.provider_payout_id) {
    try {
      const reconciled = await reconcilePayoutAttempt(
        payoutRequest,
        payoutAttempt,
      );

      payoutRequest = reconciled.payoutRequest;
      payoutAttempt = reconciled.attempt;
    } catch (error) {
      console.error("Stripe payout retry reconciliation failed:", error);

      return res.status(202).json({
        status: "success",
        idempotent: true,
        retry_safe: true,
        message:
          "The existing Stripe payout could not be reconciled right now. No new payout was created.",
        data: await payoutResponseRowWithAttempts(payoutRequest),
        payout_attempt: payoutAttemptResponseRow(payoutAttempt),
        wallet: await getWalletSnapshot(designerId),
      });
    }
  }

  if (payoutAttempt.status === "paid") {
    return res.status(200).json({
      status: "success",
      idempotent: true,
      message: "The existing Stripe payout is already paid.",
      data: await payoutResponseRowWithAttempts(payoutRequest),
      payout_attempt: payoutAttemptResponseRow(payoutAttempt),
      wallet: await getWalletSnapshot(designerId),
    });
  }

  if (["pending", "in_transit"].includes(payoutAttempt.status)) {
    return res.status(200).json({
      status: "success",
      idempotent: true,
      message:
        "The existing Stripe payout is still active. No replacement payout was created.",
      data: await payoutResponseRowWithAttempts(payoutRequest),
      payout_attempt: payoutAttemptResponseRow(payoutAttempt),
      wallet: await getWalletSnapshot(designerId),
    });
  }

  if (
    !payoutAttempt.provider_payout_id &&
    payoutAttempt.status !== "create_failed"
  ) {
    if (
      !PAYOUT_ATTEMPT_RESUBMITTABLE_WITHOUT_PAYOUT_ID.has(payoutAttempt.status)
    ) {
      return sendError(
        res,
        409,
        `The payout attempt cannot be retried while its status is ${payoutAttempt.status}.`,
      );
    }

    if (
      ["submitting", "status_unknown"].includes(payoutAttempt.status) &&
      isPayoutAttemptPastSafeRetryWindow(payoutAttempt)
    ) {
      return sendError(
        res,
        409,
        "This payout attempt has an unknown external result and is outside the automatic idempotency replay window. Reconcile it manually before another payout is submitted.",
        {
          code: "STRIPE_PAYOUT_ATTEMPT_MANUAL_RECONCILIATION_REQUIRED",
          payout_request: payoutResponseRow(payoutRequest),
          payout_attempt: payoutAttemptResponseRow(payoutAttempt),
        },
      );
    }

    let readyPayoutAccount;

    try {
      readyPayoutAccount = await getReadyStripePayoutAccount(
        designerId,
        payoutRequest.payout_account_id,
      );

      await ensureManualStripePayoutSchedule(readyPayoutAccount);
    } catch (error) {
      return sendError(
        res,
        error.statusCode || 409,
        error.statusCode
          ? error.message
          : "The connected Stripe account is not currently ready for payout recovery.",
        error.code
          ? {
              code: error.code,
            }
          : undefined,
      );
    }

    const marked = await markExistingAttemptSubmitting(
      payoutRequest,
      payoutAttempt,
    );

    payoutRequest = marked.payoutRequest;
    payoutAttempt = marked.attempt;

    const execution = await submitStripePayoutAttempt(
      payoutRequest,
      readyPayoutAccount,
      payoutAttempt,
    );

    return buildStripePayoutExecutionResponse(res, execution, {
      statusCode: 200,
      message:
        "The existing bank payout attempt was safely resubmitted with the same attempt ID and idempotency key. No new Stripe Transfer was created.",
    });
  }

  if (!["failed", "canceled", "create_failed"].includes(payoutAttempt.status)) {
    return sendError(
      res,
      409,
      `A replacement Stripe payout cannot be created while the latest payout attempt is ${payoutAttempt.status}.`,
    );
  }

  let readyPayoutAccount;

  try {
    readyPayoutAccount = await getReadyStripePayoutAccount(
      designerId,
      payoutRequest.payout_account_id,
    );

    await ensureManualStripePayoutSchedule(readyPayoutAccount);
  } catch (error) {
    return sendError(
      res,
      error.statusCode || 409,
      error.statusCode
        ? error.message
        : "The connected Stripe account is not currently ready for a replacement bank payout.",
      error.code
        ? {
            code: error.code,
          }
        : undefined,
    );
  }

  let preparedReplacement;

  try {
    preparedReplacement = await prepareReplacementPayoutAttempt(
      payoutRequest,
      readyPayoutAccount,
      payoutAttempt,
    );
  } catch (error) {
    console.error(
      "Replacement Stripe payout-attempt preparation failed:",
      error,
    );

    if (error.code === "23505") {
      const latestAttempt = await getLatestPayoutAttempt(db, payoutRequest.id);

      return res.status(202).json({
        status: "success",
        idempotent: true,
        retry_safe: true,
        message:
          "Another payout recovery request already created the next payout attempt. No duplicate attempt was created.",
        data: payoutResponseRow(payoutRequest),
        payout_attempt: payoutAttemptResponseRow(latestAttempt),
        wallet: await getWalletSnapshot(designerId),
      });
    }

    return sendError(
      res,
      500,
      "The replacement Stripe payout attempt could not be prepared safely.",
      {
        code: "PAYOUT_REPLACEMENT_PREPARATION_FAILED",
      },
    );
  }

  payoutRequest = preparedReplacement.payoutRequest;
  payoutAttempt = preparedReplacement.attempt;

  if (!preparedReplacement.created && !payoutAttempt.provider_payout_id) {
    if (
      ["submitting", "status_unknown"].includes(payoutAttempt.status) &&
      isPayoutAttemptPastSafeRetryWindow(payoutAttempt)
    ) {
      return sendError(
        res,
        409,
        "The replacement payout attempt has an unknown result and is outside the automatic idempotency replay window. Reconcile it manually before another submission.",
        {
          code: "STRIPE_PAYOUT_ATTEMPT_MANUAL_RECONCILIATION_REQUIRED",
          payout_request: payoutResponseRow(payoutRequest),
          payout_attempt: payoutAttemptResponseRow(payoutAttempt),
        },
      );
    }

    if (
      PAYOUT_ATTEMPT_RESUBMITTABLE_WITHOUT_PAYOUT_ID.has(payoutAttempt.status)
    ) {
      const marked = await markExistingAttemptSubmitting(
        payoutRequest,
        payoutAttempt,
      );

      payoutRequest = marked.payoutRequest;
      payoutAttempt = marked.attempt;
    }
  }

  if (payoutAttempt.provider_payout_id) {
    try {
      const reconciled = await reconcilePayoutAttempt(
        payoutRequest,
        payoutAttempt,
      );

      return res.status(200).json({
        status: "success",
        idempotent: true,
        message:
          "The replacement payout attempt already exists and was reconciled.",
        data: payoutResponseRow(reconciled.payoutRequest),
        payout_attempt: payoutAttemptResponseRow(reconciled.attempt),
        wallet: reconciled.wallet || (await getWalletSnapshot(designerId)),
      });
    } catch (error) {
      return res.status(202).json({
        status: "success",
        idempotent: true,
        retry_safe: true,
        message:
          "The replacement payout attempt already exists but could not be reconciled right now. No additional payout was created.",
        data: payoutResponseRow(payoutRequest),
        payout_attempt: payoutAttemptResponseRow(payoutAttempt),
        wallet: await getWalletSnapshot(designerId),
      });
    }
  }

  const execution = await submitStripePayoutAttempt(
    payoutRequest,
    readyPayoutAccount,
    payoutAttempt,
  );

  return buildStripePayoutExecutionResponse(res, execution, {
    statusCode: 200,
    message:
      "A replacement Stripe bank payout attempt was submitted using the existing connected-account balance. No second Stripe Transfer or wallet deduction was created.",
  });
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
            SELECT COUNT(*)

            FROM designer_payout_attempts dpa_count

            WHERE dpa_count.payout_request_id =
              dpr.id
          ) AS payout_attempt_count,

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

    if (payoutRequest.status !== "pending") {
      await rollbackQuietly(client);

      return sendError(
        res,
        409,
        "Only a pending payout request can be cancelled.",
      );
    }

    const amount = Number(payoutRequest.amount);

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
          AND pending_payout_balance >= $1

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

          cancelled_at =
            NOW(),

          updated_at =
            NOW()

        WHERE id = $1

        RETURNING *
        `,
      [requestId],
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

  try {
    const result = await db.query(
      `
        SELECT *

        FROM designer_payout_accounts

        WHERE designer_id = $1

        ORDER BY
          is_default DESC,
          provider ASC,
          created_at ASC
        `,
      [designerId],
    );

    return res.status(200).json({
      status: "success",

      data: result.rows.map(payoutAccountResponseRow),
    });
  } catch (error) {
    console.error("Payout account fetch failed:", error);

    return sendError(res, 500, "The payout accounts could not be loaded.");
  }
};

/*=========================================================
Stripe Connect Account-Creation Recovery Helpers
=========================================================*/

/*
 * Stripe API v2 idempotency is scoped to the same API and
 * account/sandbox and is guaranteed for requests occurring
 * within 30 days of each other.
 *
 * We deliberately stop blind automatic account creation
 * after 29 days if we still do not know the Stripe acct_
 * ID. That leaves a safety margin before the replay window
 * boundary.
 */
const STRIPE_CONNECT_CREATION_SAFE_REPLAY_MS = 29 * 24 * 60 * 60 * 1000;

function isStripeConnectCreationReplayExpired(operation) {
  if (!operation?.created_at) {
    return false;
  }

  const createdAt = new Date(operation.created_at).getTime();

  if (!Number.isFinite(createdAt)) {
    return false;
  }

  return Date.now() - createdAt > STRIPE_CONNECT_CREATION_SAFE_REPLAY_MS;
}

function safeStripeConnectErrorMessage(error) {
  return String(
    error?.message || "Stripe Connect account creation failed.",
  ).slice(0, 4000);
}

function normalizeStripeConnectContactEmail(value) {
  const email = String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, 320);

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizeStripeConnectDisplayName(value) {
  const displayName = cleanText(value, 100);

  return displayName || null;
}

function stripeConnectHttpStatus(error, fallback = 502) {
  const status = Number(error?.statusCode);

  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    return status;
  }

  return fallback;
}

function isStripeConnectCreationDeterministicFailure(error) {
  const type = String(error?.type || error?.name || "").trim();

  const code = String(error?.code || error?.raw?.code || "").trim();

  return Boolean(
    code === "idempotency_error" ||
    type === "StripeInvalidRequestError" ||
    type === "StripeAuthenticationError" ||
    type === "StripePermissionError" ||
    Number(error?.statusCode) === 400 ||
    Number(error?.statusCode) === 401 ||
    Number(error?.statusCode) === 403,
  );
}

/*=========================================================
8. Start or Resume Stripe Connect Onboarding
=========================================================*/

exports.startStripeConnectOnboarding = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  let payoutAccount = null;

  let creationOperation = null;

  let created = false;

  /*
   * PHASE 1
   *
   * Short local transaction only.
   *
   * Either find the existing Stripe payout account, or
   * persist a durable account-creation operation BEFORE
   * contacting Stripe.
   *
   * No Stripe network request occurs while this transaction
   * is open.
   */
  const preparationClient = await db.connect();

  try {
    await preparationClient.query("BEGIN");

    await preparationClient.query(
      `
        SELECT pg_advisory_xact_lock(
          hashtext($1),
          hashtext($2)
        )
      `,
      ["stripe-connect", designerId],
    );

    const designerResult = await preparationClient.query(
      `
        SELECT
          u.id,
          u.full_name,
          u.email,
          dp.country

        FROM users u

        LEFT JOIN designer_profiles dp
          ON dp.user_id = u.id

        WHERE u.id = $1
          AND u.role = 'designer'

        LIMIT 1
      `,
      [designerId],
    );

    const designer = designerResult.rows[0];

    if (!designer) {
      await rollbackQuietly(preparationClient);

      return sendError(res, 404, "The designer account was not found.");
    }

    const existingResult = await preparationClient.query(
      `
        SELECT *

        FROM designer_payout_accounts

        WHERE designer_id = $1
          AND provider = 'stripe'

        LIMIT 1

        FOR UPDATE
      `,
      [designerId],
    );

    payoutAccount = existingResult.rows[0] || null;

    if (!payoutAccount) {
      const operationResult = await preparationClient.query(
        `
          SELECT *

          FROM designer_stripe_connect_operations

          WHERE designer_id = $1
            AND provider = 'stripe'
            AND operation_type = 'account_create'

          LIMIT 1

          FOR UPDATE
        `,
        [designerId],
      );

      creationOperation = operationResult.rows[0] || null;

      if (!creationOperation) {
        const country = normalizeIsoCountryCode(
          req.body?.country || designer.country,
        );

        if (!country) {
          await rollbackQuietly(preparationClient);

          return sendError(
            res,
            400,
            "A two-letter ISO country code is required to start Stripe onboarding.",
            {
              field: "country",
              example: "US",
              code: "STRIPE_CONNECT_COUNTRY_REQUIRED",
            },
          );
        }

        const contactEmail = normalizeStripeConnectContactEmail(designer.email);

        if (!contactEmail) {
          await rollbackQuietly(preparationClient);

          return sendError(
            res,
            400,
            "A valid designer email address is required to start Stripe onboarding.",
            {
              field: "email",
              code: "STRIPE_CONNECT_EMAIL_REQUIRED",
            },
          );
        }

        const displayName = normalizeStripeConnectDisplayName(
          designer.full_name,
        );

        if (!displayName) {
          await rollbackQuietly(preparationClient);

          return sendError(
            res,
            400,
            "A designer display name is required to start Stripe onboarding.",
            {
              field: "full_name",
              code: "STRIPE_CONNECT_DISPLAY_NAME_REQUIRED",
            },
          );
        }

        const insertOperationResult = await preparationClient.query(
          `
            INSERT INTO designer_stripe_connect_operations (
              id,
              designer_id,
              provider,
              operation_type,
              idempotency_key,
              country,
              contact_email,
              display_name,
              status,
              provider_account_id,
              attempt_count,
              last_error_code,
              last_error_message,
              last_attempt_at,
              completed_at,
              created_at,
              updated_at
            )

            VALUES (
              gen_random_uuid(),
              $1,
              'stripe',
              'account_create',
              gen_random_uuid(),
              $2,
              $3,
              $4,
              'pending',
              NULL,
              0,
              NULL,
              NULL,
              NULL,
              NULL,
              NOW(),
              NOW()
            )

            RETURNING *
          `,
          [designerId, country, contactEmail, displayName],
        );

        creationOperation = insertOperationResult.rows[0];
      }

      if (
        creationOperation.status === "rejected" &&
        !creationOperation.provider_account_id
      ) {
        await preparationClient.query("COMMIT");

        return sendError(
          res,
          422,
          creationOperation.last_error_message ||
            "Stripe rejected creation of the connected account.",
          {
            code:
              creationOperation.last_error_code ||
              "STRIPE_CONNECT_ACCOUNT_CREATE_REJECTED",

            operation_id: creationOperation.id,

            country: creationOperation.country,
          },
        );
      }

      /*
       * A prior operation may have been deliberately stopped
       * for manual reconciliation. If it already contains an
       * acct_ ID we can still recover that known account.
       * Without an acct_ ID, we must not blindly create again.
       */
      if (
        creationOperation.status === "reconciliation_required" &&
        !creationOperation.provider_account_id
      ) {
        await preparationClient.query("COMMIT");

        return sendError(
          res,
          409,
          "Stripe connected-account creation requires manual reconciliation before another account can be created.",
          {
            code: "STRIPE_CONNECT_CREATION_RECONCILIATION_REQUIRED",
            operation_id: creationOperation.id,
          },
        );
      }

      if (
        !creationOperation.provider_account_id &&
        isStripeConnectCreationReplayExpired(creationOperation)
      ) {
        const expiredResult = await preparationClient.query(
          `
            UPDATE designer_stripe_connect_operations

            SET
              status = 'reconciliation_required',
              last_error_code =
                'STRIPE_CONNECT_IDEMPOTENCY_WINDOW_EXPIRED',
              last_error_message =
                'The Stripe account-creation replay window expired before a connected account ID was safely recorded.',
              updated_at = NOW()

            WHERE id = $1

            RETURNING *
          `,
          [creationOperation.id],
        );

        creationOperation = expiredResult.rows[0] || creationOperation;

        await preparationClient.query("COMMIT");

        return sendError(
          res,
          409,
          "Stripe connected-account creation is too old to retry automatically. Manual reconciliation is required before another account can be created.",
          {
            code: "STRIPE_CONNECT_CREATION_RECONCILIATION_REQUIRED",
            operation_id: creationOperation.id,
          },
        );
      }
    }

    await preparationClient.query("COMMIT");
  } catch (error) {
    await rollbackQuietly(preparationClient);

    console.error("Stripe Connect preparation failed:", error);

    return sendError(
      res,
      stripeConnectHttpStatus(error, 500),
      error?.statusCode
        ? error.message
        : "Stripe Connect could not be prepared safely.",
      error?.code
        ? {
            code: error.code,
          }
        : undefined,
    );
  } finally {
    preparationClient.release();
  }

  /*
   * PHASE 2
   *
   * If a payout account already existed, skip account
   * creation entirely.
   *
   * Otherwise recover or create the Stripe account using the
   * durable operation row.
   */
  if (!payoutAccount) {
    let stripeAccount = null;

    if (creationOperation.provider_account_id) {
      /*
       * Stripe succeeded previously and we already persisted
       * the acct_ ID in the operation table. Retrieve that
       * exact account; never create another one.
       */
      try {
        stripeAccount = await stripeConnectService.getConnectedAccount(
          creationOperation.provider_account_id,
        );
      } catch (error) {
        console.error("Stripe Connect stored-account recovery failed:", error);

        return sendError(
          res,
          stripeConnectHttpStatus(error, 502),
          error?.statusCode
            ? error.message
            : "The existing Stripe connected account could not be recovered.",
          {
            code: error?.code || "STRIPE_CONNECT_ACCOUNT_RECOVERY_FAILED",
            operation_id: creationOperation.id,
          },
        );
      }
    } else {
      /*
       * PHASE 3
       *
       * Record a submission attempt locally BEFORE calling
       * Stripe. This write commits independently.
       */
      try {
        const submittingResult = await db.query(
          `
            UPDATE designer_stripe_connect_operations

            SET
              status = 'submitting',
              attempt_count = attempt_count + 1,
              last_attempt_at = NOW(),
              last_error_code = NULL,
              last_error_message = NULL,
              updated_at = NOW()

            WHERE id = $1
              AND provider_account_id IS NULL
              AND status IN (
                'pending',
                'submitting'
              )

            RETURNING *
          `,
          [creationOperation.id],
        );

        if (submittingResult.rows[0]) {
          creationOperation = submittingResult.rows[0];
        }
      } catch (error) {
        console.error("Stripe Connect submission-state update failed:", error);

        return sendError(
          res,
          503,
          "Stripe Connect account creation could not be prepared for submission. No Stripe account was created by this request.",
          {
            code: "STRIPE_CONNECT_SUBMISSION_STATE_FAILED",
            operation_id: creationOperation.id,
            retry_safe: true,
          },
        );
      }

      /*
       * PHASE 4
       *
       * Stripe network request.
       *
       * NO PostgreSQL transaction is open here.
       *
       * Every retry of this same logical creation operation
       * uses the same frozen parameters and same persisted
       * idempotency key.
       */
      try {
        stripeAccount = await stripeConnectService.createConnectedAccount({
          email: creationOperation.contact_email,
          displayName: creationOperation.display_name,
          country: creationOperation.country,
          designerId,
          operationId: creationOperation.id,
          idempotencyKey: String(creationOperation.idempotency_key),
        });
      } catch (error) {
        const isIdempotencyConflict = error?.code === "idempotency_error";

        const deterministicFailure =
          isStripeConnectCreationDeterministicFailure(error);

        const nextStatus = isIdempotencyConflict
          ? "reconciliation_required"
          : deterministicFailure
            ? "rejected"
            : "pending";

        try {
          await db.query(
            `
              UPDATE designer_stripe_connect_operations

              SET
                status = $2,
                last_error_code = $3,
                last_error_message = $4,
                updated_at = NOW()

              WHERE id = $1
            `,
            [
              creationOperation.id,
              nextStatus,
              cleanText(
                error?.code ||
                  error?.raw?.code ||
                  error?.type ||
                  error?.name ||
                  "",
                255,
              ) || null,
              safeStripeConnectErrorMessage(error),
            ],
          );
        } catch (stateError) {
          console.error(
            "Stripe Connect creation-error state persistence failed:",
            stateError,
          );
        }

        console.error("Stripe Connect account creation failed:", error);

        if (isIdempotencyConflict) {
          return sendError(
            res,
            409,
            "Stripe rejected the account-creation replay because its parameters did not match the original operation. Manual reconciliation is required.",
            {
              code: "STRIPE_CONNECT_IDEMPOTENCY_CONFLICT",
              operation_id: creationOperation.id,
            },
          );
        }

        if (deterministicFailure) {
          return sendError(
            res,
            422,
            error?.message ||
              "Stripe rejected creation of the connected account.",
            {
              code: error?.code || "STRIPE_CONNECT_ACCOUNT_CREATE_REJECTED",

              operation_id: creationOperation.id,

              country: creationOperation.country,
            },
          );
        }

        return sendError(
          res,
          stripeConnectHttpStatus(error, 502),
          "Stripe connected-account creation could not be confirmed. Retry the same onboarding request; the same persistent idempotency key will be reused.",
          {
            code: error?.code || "STRIPE_CONNECT_ACCOUNT_CREATE_UNCERTAIN",
            operation_id: creationOperation.id,
            retry_safe: true,
          },
        );
      }

      if (!stripeAccount?.id || !String(stripeAccount.id).startsWith("acct_")) {
        try {
          await db.query(
            `
              UPDATE designer_stripe_connect_operations

              SET
                status = 'reconciliation_required',
                last_error_code =
                  'INVALID_STRIPE_ACCOUNT_RESPONSE',
                last_error_message =
                  'Stripe did not return a connected account ID.',
                updated_at = NOW()

              WHERE id = $1
            `,
            [creationOperation.id],
          );
        } catch (stateError) {
          console.error(
            "Invalid Stripe account-response state persistence failed:",
            stateError,
          );
        }

        return sendError(
          res,
          502,
          "Stripe did not return a valid connected account ID.",
          {
            code: "INVALID_STRIPE_ACCOUNT_RESPONSE",
            operation_id: creationOperation.id,
          },
        );
      }

      /*
       * PHASE 4B
       *
       * Persist the Stripe acct_ ID into the durable operation
       * immediately after Stripe returns and BEFORE creating
       * designer_payout_accounts.
       *
       * If the process later crashes, the next request can
       * retrieve this exact account without depending on a
       * second account-create call.
       */
      try {
        const boundOperationResult = await db.query(
          `
            UPDATE designer_stripe_connect_operations

            SET
              provider_account_id = $2,
              last_error_code = NULL,
              last_error_message = NULL,
              updated_at = NOW()

            WHERE id = $1
              AND (
                provider_account_id IS NULL
                OR provider_account_id = $2
              )

            RETURNING *
          `,
          [creationOperation.id, stripeAccount.id],
        );

        if (boundOperationResult.rows.length === 0) {
          await db.query(
            `
              UPDATE designer_stripe_connect_operations

              SET
                status = 'reconciliation_required',
                last_error_code =
                  'STRIPE_CONNECT_ACCOUNT_CONFLICT',
                last_error_message =
                  'The operation is already associated with a different Stripe connected account.',
                updated_at = NOW()

              WHERE id = $1
            `,
            [creationOperation.id],
          );

          return sendError(
            res,
            409,
            "The Stripe Connect operation is already associated with a different connected account. Manual reconciliation is required.",
            {
              code: "STRIPE_CONNECT_ACCOUNT_CONFLICT",
              operation_id: creationOperation.id,
            },
          );
        }

        creationOperation = boundOperationResult.rows[0];
      } catch (error) {
        console.error("Stripe Connect account-ID persistence failed:", error);

        return sendError(
          res,
          503,
          "Stripe created or recovered the connected account, but its account ID could not be persisted locally. Retry this same onboarding request; do not create a new Stripe account manually.",
          {
            code: "STRIPE_CONNECT_ACCOUNT_ID_PERSISTENCE_PENDING",
            operation_id: creationOperation.id,
            retry_safe: true,
          },
        );
      }
    }

    /*
     * Any recovered account must still be a valid acct_ ID.
     */
    if (!stripeAccount?.id || !String(stripeAccount.id).startsWith("acct_")) {
      return sendError(
        res,
        502,
        "The recovered Stripe connected account is invalid.",
        {
          code: "INVALID_STRIPE_ACCOUNT_RESPONSE",
          operation_id: creationOperation.id,
        },
      );
    }

    /*
     * PHASE 5
     *
     * Persist designer_payout_accounts in a NEW short local
     * transaction.
     *
     * Concurrent requests are serialized by the advisory
     * lock. The database unique constraints provide another
     * protection layer.
     */
    const persistenceClient = await db.connect();

    try {
      await persistenceClient.query("BEGIN");

      await persistenceClient.query(
        `
          SELECT pg_advisory_xact_lock(
            hashtext($1),
            hashtext($2)
          )
        `,
        ["stripe-connect", designerId],
      );

      const lockedOperationResult = await persistenceClient.query(
        `
          SELECT *

          FROM designer_stripe_connect_operations

          WHERE id = $1
            AND designer_id = $2
            AND provider = 'stripe'
            AND operation_type = 'account_create'

          LIMIT 1

          FOR UPDATE
        `,
        [creationOperation.id, designerId],
      );

      const lockedOperation = lockedOperationResult.rows[0];

      if (!lockedOperation) {
        throw new Error(
          "The Stripe Connect creation operation disappeared before local persistence.",
        );
      }

      if (
        lockedOperation.provider_account_id &&
        lockedOperation.provider_account_id !== stripeAccount.id
      ) {
        await persistenceClient.query(
          `
            UPDATE designer_stripe_connect_operations

            SET
              status = 'reconciliation_required',
              last_error_code =
                'STRIPE_CONNECT_ACCOUNT_CONFLICT',
              last_error_message =
                'The durable operation references a different Stripe connected account.',
              updated_at = NOW()

            WHERE id = $1
          `,
          [lockedOperation.id],
        );

        await persistenceClient.query("COMMIT");

        return sendError(
          res,
          409,
          "A different Stripe connected account is already recorded for this onboarding operation. Manual reconciliation is required.",
          {
            code: "STRIPE_CONNECT_ACCOUNT_CONFLICT",
            operation_id: lockedOperation.id,
          },
        );
      }

      const existingResult = await persistenceClient.query(
        `
          SELECT *

          FROM designer_payout_accounts

          WHERE designer_id = $1
            AND provider = 'stripe'

          LIMIT 1

          FOR UPDATE
        `,
        [designerId],
      );

      const existing = existingResult.rows[0] || null;

      if (existing) {
        if (existing.provider_account_id !== stripeAccount.id) {
          await persistenceClient.query(
            `
              UPDATE designer_stripe_connect_operations

              SET
                status = 'reconciliation_required',
                provider_account_id = $2,
                last_error_code =
                  'STRIPE_CONNECT_ACCOUNT_CONFLICT',
                last_error_message =
                  'A different Stripe account is already stored for this designer.',
                updated_at = NOW()

              WHERE id = $1
            `,
            [lockedOperation.id, stripeAccount.id],
          );

          await persistenceClient.query("COMMIT");

          return sendError(
            res,
            409,
            "A different Stripe connected account is already associated with this designer. Manual reconciliation is required.",
            {
              code: "STRIPE_CONNECT_ACCOUNT_CONFLICT",
              operation_id: lockedOperation.id,
            },
          );
        }

        payoutAccount = existing;
      } else {
        const state = buildStripeConnectState(stripeAccount);

        const insertResult = await persistenceClient.query(
          `
            INSERT INTO designer_payout_accounts (
              id,
              designer_id,
              provider,
              provider_account_id,
              status,
              is_default,
              destination_summary,
              details_submitted,
              payouts_enabled,
              provider_metadata,
              onboarding_completed_at,
              last_verified_at,
              created_at,
              updated_at
            )

            VALUES (
              gen_random_uuid(),
              $1,
              'stripe',
              $2,
              $3,
              TRUE,
              $4,
              $5,
              $6,
              $7::jsonb,

              CASE
                WHEN $6 = TRUE
                  THEN NOW()
                ELSE NULL
              END,

              NOW(),
              NOW(),
              NOW()
            )

            RETURNING *
          `,
          [
            designerId,
            stripeAccount.id,
            state.status,
            maskStripeAccountId(stripeAccount.id),
            state.detailsSubmitted,
            state.payoutsEnabled,
            JSON.stringify({
              ...state.safeMetadata,
              connect_creation_operation_id: lockedOperation.id,
            }),
          ],
        );

        payoutAccount = insertResult.rows[0];

        created = true;
      }

      await persistenceClient.query(
        `
          UPDATE designer_stripe_connect_operations

          SET
            status = 'created',
            provider_account_id = $2,
            last_error_code = NULL,
            last_error_message = NULL,
            completed_at =
              COALESCE(
                completed_at,
                NOW()
              ),
            updated_at = NOW()

          WHERE id = $1
        `,
        [lockedOperation.id, stripeAccount.id],
      );

      await persistenceClient.query("COMMIT");
    } catch (error) {
      await rollbackQuietly(persistenceClient);

      console.error("Stripe Connect local persistence failed:", error);

      /*
       * Do not create another Stripe account here.
       *
       * The durable operation either already contains the
       * acct_ ID or still contains the same persistent
       * idempotency key for a safe replay.
       */
      return sendError(
        res,
        error?.code === "23505" ? 409 : 503,
        error?.code === "23505"
          ? "Stripe Connect local persistence encountered a uniqueness conflict. Manual reconciliation is required."
          : "Stripe created or recovered the connected account, but local persistence could not be completed. Retry this same onboarding request; do not create a new Stripe account manually.",
        {
          code:
            error?.code === "23505"
              ? "STRIPE_CONNECT_LOCAL_UNIQUENESS_CONFLICT"
              : "STRIPE_CONNECT_LOCAL_PERSISTENCE_PENDING",
          operation_id: creationOperation.id,
          retry_safe: error?.code !== "23505",
        },
      );
    } finally {
      persistenceClient.release();
    }
  }

  /*
   * PHASE 6
   *
   * Account creation/recovery is complete. Synchronize the
   * current Stripe state and either return readiness or a
   * fresh single-use onboarding link.
   */
  try {
    const stripeAccount = await stripeConnectService.getConnectedAccount(
      payoutAccount.provider_account_id,
    );

    const synchronized = await syncStripePayoutAccount(
      db,
      payoutAccount,
      stripeAccount,
    );

    payoutAccount = synchronized.row;

    if (synchronized.state.payoutsEnabled) {
      return res.status(200).json({
        status: "success",

        message: "Stripe is already connected and ready for payouts.",

        data: {
          connected: true,

          onboarding_required: false,

          onboarding_url: null,

          account: payoutAccountResponseRow(payoutAccount),

          capabilities: {
            stripe_transfers: synchronized.state.transferStatus,

            payouts: synchronized.state.payoutStatus,
          },
        },
      });
    }

    const redirectUrls = getStripeConnectRedirectUrls();

    const accountLink = await stripeConnectService.createOnboardingLink({
      accountId: payoutAccount.provider_account_id,

      returnUrl: redirectUrls.returnUrl,

      refreshUrl: redirectUrls.refreshUrl,
    });

    return res.status(created ? 201 : 200).json({
      status: "success",

      message: created
        ? "Stripe connected account created or recovered. Continue with Stripe onboarding."
        : "Continue your Stripe onboarding.",

      data: {
        connected: true,

        onboarding_required: true,

        onboarding_url: accountLink?.url || null,

        onboarding_expires_at: accountLink?.expires_at || null,

        account: payoutAccountResponseRow(payoutAccount),

        capabilities: {
          stripe_transfers: synchronized.state.transferStatus,

          payouts: synchronized.state.payoutStatus,
        },
      },
    });
  } catch (error) {
    console.error("Stripe Connect onboarding link creation failed:", error);

    return sendError(
      res,
      stripeConnectHttpStatus(error, 502),
      error?.statusCode
        ? error.message
        : "The Stripe onboarding link could not be created.",
      error?.code
        ? {
            code: error.code,
          }
        : undefined,
    );
  }
};

/*=========================================================
9. Refresh Stripe Connect Status
=========================================================*/

exports.getStripeConnectStatus = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  try {
    const accountResult = await db.query(
      `
        SELECT *

        FROM designer_payout_accounts

        WHERE designer_id = $1
          AND provider =
            'stripe'

        ORDER BY
          is_default DESC,
          created_at ASC

        LIMIT 1
        `,
      [designerId],
    );

    const payoutAccount = accountResult.rows[0];

    if (!payoutAccount) {
      return res.status(200).json({
        status: "success",

        data: {
          connected: false,

          onboarding_required: true,

          account: null,

          capabilities: {
            stripe_transfers: null,

            payouts: null,
          },
        },
      });
    }

    const stripeAccount = await stripeConnectService.getConnectedAccount(
      payoutAccount.provider_account_id,
    );

    const synchronized = await syncStripePayoutAccount(
      db,
      payoutAccount,
      stripeAccount,
    );

    return res.status(200).json({
      status: "success",

      data: {
        connected: true,

        onboarding_required: !synchronized.state.payoutsEnabled,

        account: payoutAccountResponseRow(synchronized.row),

        capabilities: {
          stripe_transfers: synchronized.state.transferStatus,

          payouts: synchronized.state.payoutStatus,
        },

        requirements: {
          blocking: synchronized.state.hasBlockingRequirements,
        },
      },
    });
  } catch (error) {
    console.error("Stripe Connect status refresh failed:", error);

    return sendError(
      res,
      error.statusCode || 502,

      error.statusCode
        ? error.message
        : "Stripe connection status could not be refreshed.",

      error.code
        ? {
            code: error.code,
          }
        : undefined,
    );
  }
};

/*=========================================================
10. Create Wallet Deposit PaymentIntent
=========================================================*/

exports.createWalletDeposit = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  const amountCents = moneyToCents(req.body?.amount);

  const clientRequestId = getClientRequestId(req);

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!amountCents) {
    return sendError(res, 400, "Enter a valid wallet deposit amount.");
  }

  if (!isUuid(clientRequestId)) {
    return sendError(res, 400, "A valid client_request_id UUID is required.");
  }

  const amount = centsToMoney(amountCents);

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,

        currency: "usd",

        automatic_payment_methods: {
          enabled: true,
        },

        description: "FashionVision designer wallet deposit",

        metadata: {
          user_id: designerId,

          designer_id: designerId,

          transaction_purpose: "wallet_deposit",

          client_request_id: clientRequestId,

          deposit_amount: amount.toFixed(2),
        },
      },
      {
        idempotencyKey: `designer-wallet-deposit:${designerId}:${clientRequestId}`,
      },
    );

    return res.status(200).json({
      status: "success",

      idempotent: false,

      clientSecret: paymentIntent.client_secret,

      paymentIntentId: paymentIntent.id,

      amount,

      currency: paymentIntent.currency,
    });
  } catch (error) {
    console.error("Wallet deposit initialization failed:", error);

    return sendError(
      res,
      500,
      "The secure wallet deposit could not be initialized.",
    );
  }
};

/*=========================================================
11. Internal Wallet Deposit Processor
=========================================================*/

exports.processWalletDepositInternal = async (paymentIntent, client) => {
  if (!paymentIntent?.id) {
    return {
      success: false,

      reason: "The Stripe PaymentIntent is missing.",
    };
  }

  if (paymentIntent.status !== "succeeded") {
    return {
      success: false,

      reason: "The wallet deposit payment has not succeeded.",
    };
  }

  const metadata = paymentIntent.metadata || {};

  const designerId = String(
    metadata.designer_id || metadata.user_id || "",
  ).trim();

  if (!isUuid(designerId)) {
    return {
      success: false,

      reason: "The wallet deposit contains an invalid designer ID.",
    };
  }

  if (metadata.transaction_purpose !== "wallet_deposit") {
    return {
      success: false,

      reason: "The Stripe payment is not a wallet deposit.",
    };
  }

  if (String(paymentIntent.currency || "").toLowerCase() !== "usd") {
    return {
      success: false,

      reason: "The wallet deposit currency is invalid.",
    };
  }

  const expectedCents = Number(paymentIntent.amount || 0);

  const receivedCents = Number(paymentIntent.amount_received || 0);

  if (
    !Number.isInteger(expectedCents) ||
    !Number.isInteger(receivedCents) ||
    expectedCents <= 0 ||
    receivedCents !== expectedCents
  ) {
    return {
      success: false,

      reason: "The Stripe wallet deposit amount is incomplete or invalid.",
    };
  }

  const existingResult = await client.query(
    `
      SELECT
        id,
        receiver_id,
        net_amount

      FROM transactions

      WHERE stripe_payment_intent_id = $1

      LIMIT 1
      `,
    [paymentIntent.id],
  );

  if (existingResult.rows.length > 0) {
    const existing = existingResult.rows[0];

    if (String(existing.receiver_id) !== designerId) {
      throw new Error(
        "The PaymentIntent is already associated with another wallet.",
      );
    }

    return {
      success: true,
      idempotent: true,
      designerId,

      paymentIntentId: paymentIntent.id,

      amount: Number(existing.net_amount || 0),

      message: "The wallet deposit was already credited.",
    };
  }

  const designerResult = await client.query(
    `
      SELECT id

      FROM users

      WHERE id = $1
        AND role =
          'designer'

      LIMIT 1
      `,
    [designerId],
  );

  if (designerResult.rows.length === 0) {
    return {
      success: false,

      reason: "The wallet owner is not a valid designer account.",
    };
  }

  const amount = centsToMoney(receivedCents);

  await ensureWalletRow(client, designerId);

  const walletResult = await client.query(
    `
      UPDATE designer_wallets

      SET
        available_balance =
          available_balance +
          $1

      WHERE user_id = $2

      RETURNING
        available_balance,
        pending_escrow_balance,
        pending_payout_balance
      `,
    [amount, designerId],
  );

  await client.query(
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
      currency,
      created_at
    )

    VALUES (
      gen_random_uuid(),
      $1,
      $1,
      NULL,
      $2,
      0,
      $2,
      'wallet_deposit',
      $3,
      'stripe',
      $3,
      'usd',
      NOW()
    )
    `,
    [designerId, amount, paymentIntent.id],
  );

  return {
    success: true,

    idempotent: false,

    designerId,

    paymentIntentId: paymentIntent.id,

    amount,

    wallet: serializeWallet(walletResult.rows[0]),

    message: "The wallet deposit was credited successfully.",
  };
};

/*=========================================================
12. Verify Wallet Deposit
=========================================================*/

exports.verifyWalletDeposit = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  const paymentIntentId = cleanText(
    req.body?.paymentIntentId || req.body?.payment_intent_id,

    255,
  );

  if (!isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!paymentIntentId || !paymentIntentId.startsWith("pi_")) {
    return sendError(res, 400, "A valid Stripe PaymentIntent ID is required.");
  }

  let paymentIntent;

  try {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    console.error("Wallet deposit Stripe retrieval failed:", error);

    return sendError(
      res,
      400,
      "The Stripe wallet deposit could not be verified.",
    );
  }

  const metadataDesignerId = String(
    paymentIntent.metadata?.designer_id ||
      paymentIntent.metadata?.user_id ||
      "",
  ).trim();

  if (metadataDesignerId !== designerId) {
    return sendError(
      res,
      403,
      "This wallet deposit belongs to another account.",
    );
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const result = await exports.processWalletDepositInternal(
      paymentIntent,
      client,
    );

    if (!result.success) {
      await rollbackQuietly(client);

      return sendError(
        res,
        400,

        result.reason || "The wallet deposit could not be credited.",
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      status: "success",

      idempotent: Boolean(result.idempotent),

      message: result.message,

      data: {
        paymentIntentId: result.paymentIntentId,

        amount: Number(result.amount || 0).toFixed(2),

        currency: "usd",
      },

      wallet: result.wallet || null,
    });
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Wallet deposit verification failed:", error);

    if (error.code === "23505") {
      return res.status(200).json({
        status: "success",

        idempotent: true,

        message: "The wallet deposit was already credited.",
      });
    }

    return sendError(
      res,
      500,
      "The wallet deposit could not be credited safely.",
    );
  } finally {
    client.release();
  }
};
