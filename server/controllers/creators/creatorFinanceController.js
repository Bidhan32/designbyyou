"use strict";

/*
=========================================================
FashionVision Creator Finance Controller
Version 4.5
=========================================================
*/

const Stripe = require("stripe");
const db = require("../../config/db");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const STRIPE_MIN_AMOUNT_CENTS = 50;
const STRIPE_MAX_AMOUNT_CENTS = 99999999;

const MIN_CREATOR_REFUND_CENTS = 1;

/*
Stripe v1 idempotency keys can eventually be pruned.

We use 23 hours as a conservative automatic replay
boundary rather than allowing an old uncertain POST to
be blindly submitted forever.
*/
const STRIPE_V1_SAFE_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

const configuredRefundSubmissionStaleSeconds = Number(
  process.env.CREATOR_REFUND_SUBMISSION_STALE_SECONDS || 90,
);

const REFUND_SUBMISSION_STALE_MS = Number.isFinite(
  configuredRefundSubmissionStaleSeconds,
)
  ? Math.max(
      30000,
      Math.min(600000, configuredRefundSubmissionStaleSeconds * 1000),
    )
  : 90000;

const REFUND_TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

const REFUND_ACTIVE_STATUSES = new Set([
  "pending",
  "submitting",
  "processing",
  "status_unknown",
]);

const configuredMinDepositCents = Math.round(
  Number(process.env.CREATOR_MIN_DEPOSIT_AMOUNT || 1) * 100,
);

const MIN_CREATOR_DEPOSIT_CENTS = Math.max(
  STRIPE_MIN_AMOUNT_CENTS,
  Number.isSafeInteger(configuredMinDepositCents)
    ? configuredMinDepositCents
    : 100,
);

/*
Marketplace/storefront direct-sale finance is intentionally
excluded.

Creator finance currently recognizes booking/wallet related
transaction activity only.
*/
const CREATOR_TRANSACTION_TYPES = new Set([
  "escrow_lock",
  "escrow_release",
  "refund",
  "booking_deposit",
  "wallet_deposit",
]);

const PAYMENT_PROVIDERS = new Set(["stripe", "paypal"]);

let stripeClient = null;

/*=========================================================
General Helpers
=========================================================*/

function getStripeClient() {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

function getAuthenticatedUserId(req) {
  return req.user?.id || req.user?.user_id || req.user?.userId || null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );
}

function cleanText(value, maxLength = 255) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function parsePositiveInteger(
  value,
  fallback,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, maximum);
}

function money(value) {
  const number = Number(value || 0);

  return Number.isFinite(number) ? number.toFixed(2) : "0.00";
}

function moneyToCents(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  const cents = Math.round(number * 100);

  return Number.isSafeInteger(cents) ? cents : null;
}

function centsToMoney(cents) {
  return Number((Number(cents) / 100).toFixed(2));
}

function getClientRequestId(req) {
  return cleanText(
    req?.body?.client_request_id ||
      req?.body?.clientRequestId ||
      req?.body?.idempotency_key ||
      req?.get?.("Idempotency-Key") ||
      "",
    255,
  );
}

function sendError(res, statusCode, message, extra = {}) {
  return res.status(statusCode).json({
    status: statusCode >= 500 ? "error" : "fail",
    message,
    ...extra,
  });
}

async function rollbackQuietly(client) {
  if (!client) {
    return;
  }

  try {
    await client.query("ROLLBACK");
  } catch (error) {
    console.error("Creator finance rollback failed:", error);
  }
}

function normalizeTransactionType(value) {
  const normalized = cleanText(value, 50).toLowerCase();

  return CREATOR_TRANSACTION_TYPES.has(normalized) ? normalized : null;
}

function normalizeProvider(value) {
  const normalized = cleanText(value, 20).toLowerCase();

  return PAYMENT_PROVIDERS.has(normalized) ? normalized : null;
}

function getStripeObjectId(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && typeof value.id === "string") {
    return value.id;
  }

  return null;
}

/*=========================================================
Creator Wallet Helpers
=========================================================*/

async function ensureCreatorWalletRow(queryable, creatorId) {
  await queryable.query(
    `
      INSERT INTO creator_wallets (
        creator_id
      )

      VALUES (
        $1
      )

      ON CONFLICT (
        creator_id
      )
      DO NOTHING
    `,
    [creatorId],
  );
}

function serializeCreatorWallet(row = {}) {
  const available = Number(row.available_balance || 0);

  const pendingEscrow = Number(row.pending_escrow_balance || 0);

  const pendingPayout = Number(row.pending_payout_balance || 0);

  const pendingRefund = Number(row.pending_refund_balance || 0);

  return {
    available_balance: money(available),

    pending_escrow_balance: money(pendingEscrow),

    pending_payout_balance: money(pendingPayout),

    pending_refund_balance: money(pendingRefund),

    total_wallet_balance: money(
      available + pendingEscrow + pendingPayout + pendingRefund,
    ),

    lifetime_deposited: money(row.lifetime_deposited),

    lifetime_spent: money(row.lifetime_spent),

    lifetime_withdrawn: money(row.lifetime_withdrawn),

    lifetime_refunded: money(row.lifetime_refunded),

    currency: String(row.currency || "usd").toLowerCase(),
  };
}

function serializeDeposit(row = {}) {
  if (!row?.id) {
    return null;
  }

  return {
    id: row.id,

    creator_id: row.creator_id,

    amount: money(row.amount),

    remaining_refundable_amount: money(row.remaining_refundable_amount),

    payment_provider: row.payment_provider,

    provider_payment_id: row.provider_payment_id || null,

    provider_capture_id: row.provider_capture_id || null,

    currency: String(row.currency || "usd").toLowerCase(),

    status: row.status,

    client_request_id: row.client_request_id,

    failure_reason: row.failure_reason || null,

    created_at: row.created_at,

    updated_at: row.updated_at,

    credited_at: row.credited_at || null,

    failed_at: row.failed_at || null,

    cancelled_at: row.cancelled_at || null,
  };
}

function serializeRefundItem(row = {}) {
  if (!row?.id) {
    return null;
  }

  return {
    id: row.id,

    refund_request_id: row.refund_request_id,

    deposit_id: row.deposit_id,

    amount: money(row.amount),

    payment_provider: row.payment_provider,

    provider_payment_id: row.provider_payment_id,

    provider_refund_id: row.provider_refund_id || null,

    provider_status: row.provider_status || null,

    provider_idempotency_key: row.provider_idempotency_key || null,

    submission_attempt_count: Number(row.submission_attempt_count || 0),

    status: row.status,

    failure_reason: row.failure_reason || null,

    provider_failure_balance_transaction_id:
      row.provider_failure_balance_transaction_id || null,

    created_at: row.created_at,

    updated_at: row.updated_at,

    processing_at: row.processing_at || null,

    completed_at: row.completed_at || null,

    failed_at: row.failed_at || null,

    last_submission_at: row.last_submission_at || null,

    status_unknown_at: row.status_unknown_at || null,

    last_reconciled_at: row.last_reconciled_at || null,
  };
}

function serializeRefundRequest(row = {}, items = []) {
  if (!row?.id) {
    return null;
  }

  return {
    id: row.id,

    creator_id: row.creator_id,

    amount: money(row.amount),

    currency: String(row.currency || "usd").toLowerCase(),

    status: row.status,

    client_request_id: row.client_request_id,

    failure_reason: row.failure_reason || null,

    requested_at: row.requested_at,

    processing_at: row.processing_at || null,

    completed_at: row.completed_at || null,

    failed_at: row.failed_at || null,

    updated_at: row.updated_at,

    items: items.map(serializeRefundItem).filter(Boolean),
  };
}

/*=========================================================
Creator Ledger Helpers
=========================================================*/

function getCreatorTransactionDirection(row, creatorId) {
  const type = String(row.transaction_type || "").toLowerCase();

  /*
  A successful unused-wallet-balance return is represented
  by a refund transaction projection, but financially it is
  money leaving the creator's internal wallet.
  */
  if (type === "refund" && row.creator_wallet_refund_request_id) {
    return "debit";
  }

  /*
  Booking/P2P refunds received by the creator remain credits.
  */
  if (type === "refund" && row.receiver_id === creatorId) {
    return "credit";
  }

  if (type === "wallet_deposit" && row.receiver_id === creatorId) {
    return "credit";
  }

  if (type === "escrow_release") {
    return "internal_release";
  }

  if (row.sender_id === creatorId) {
    return "debit";
  }

  if (row.receiver_id === creatorId) {
    return "credit";
  }

  return "informational";
}

function getCreatorTransactionLabel(row) {
  const type = String(row?.transaction_type || "").toLowerCase();

  if (type === "refund" && row?.creator_wallet_refund_request_id) {
    return "Unused wallet balance returned";
  }

  switch (type) {
    case "escrow_lock":
      return "Booking funded";

    case "escrow_release":
      return "Designer payment released";

    case "refund":
      return "Refund received";

    case "booking_deposit":
      return "Booking deposit";

    case "wallet_deposit":
      return "Wallet deposit";

    default:
      return "Transaction";
  }
}

/*=========================================================
Stripe Refund Helpers
=========================================================*/

function normalizeStripeRefundStatus(value) {
  const status = cleanText(value, 50).toLowerCase();

  return [
    "pending",
    "requires_action",
    "succeeded",
    "failed",
    "canceled",
  ].includes(status)
    ? status
    : null;
}

function getStripeRefundFailureReason(refund) {
  return (
    cleanText(refund?.failure_reason, 500) ||
    cleanText(refund?.pending_reason, 500) ||
    null
  );
}

function isDefinitiveStripeRefundCreationError(error) {
  return [
    "StripeInvalidRequestError",
    "StripeAuthenticationError",
    "StripePermissionError",
  ].includes(String(error?.type || ""));
}

/*
A failed Stripe refund can make the original funding source
unsuitable for future automatic refund attempts.

The exact failure observed in our release regression was a
definitive Stripe creation error stating that a previous
attempt to refund the same charge had already failed.

We intentionally keep this detector narrow. Authentication,
permission, malformed-request, or other deterministic errors
must not automatically quarantine a legitimate funding
source.
*/
function isUnusableStripeRefundSourceCreationError(error) {
  const message = String(error?.message || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return (
    message.includes("previous attempt to refund charge") &&
    message.includes("failed")
  );
}

async function loadRefundRequestItems(queryable, requestId) {
  const result = await queryable.query(
    `
      SELECT *

      FROM creator_wallet_refund_items

      WHERE refund_request_id = $1

      ORDER BY
        created_at ASC,
        id ASC
    `,
    [requestId],
  );

  return result.rows;
}

async function refreshRefundRequestStatus(client, requestId) {
  const aggregateResult = await client.query(
    `
      SELECT
        COUNT(*)::integer AS total_items,

        COUNT(*) FILTER (
          WHERE status = 'succeeded'
        )::integer AS succeeded_items,

        COUNT(*) FILTER (
          WHERE status IN (
            'failed',
            'cancelled'
          )
        )::integer AS failed_items,

        COUNT(*) FILTER (
          WHERE status IN (
            'pending',
            'submitting',
            'processing',
            'status_unknown'
          )
        )::integer AS processing_items,

        STRING_AGG(
          NULLIF(failure_reason, ''),
          '; '
          ORDER BY created_at ASC
        ) FILTER (
          WHERE status IN (
            'failed',
            'cancelled'
          )
        ) AS failure_reason

      FROM creator_wallet_refund_items

      WHERE refund_request_id = $1::uuid
    `,
    [requestId],
  );

  const aggregate = aggregateResult.rows[0] || {};

  const total = Number(aggregate.total_items || 0);

  const succeeded = Number(aggregate.succeeded_items || 0);

  const failed = Number(aggregate.failed_items || 0);

  const processing = Number(aggregate.processing_items || 0);

  const failureReason = cleanText(aggregate.failure_reason || "", 1000);

  let status = "processing";

  if (total > 0 && succeeded === total) {
    status = "completed";
  } else if (processing > 0) {
    status = "processing";
  } else if (succeeded > 0 && failed > 0) {
    status = "partially_completed";
  } else if (total > 0 && failed === total) {
    status = "failed";
  }

  const result = await client.query(
    `
      WITH input AS (
        SELECT
          $1::varchar AS new_status,
          $2::text AS new_failure_reason,
          $3::uuid AS request_id
      )

      UPDATE creator_wallet_refund_requests AS r

      SET
        status =
          input.new_status,

        processing_at =
          CASE
            WHEN input.new_status = 'processing'
              THEN COALESCE(
                r.processing_at,
                NOW()
              )

            ELSE r.processing_at
          END,

        completed_at =
          CASE
            WHEN input.new_status IN (
              'completed',
              'partially_completed'
            )
              THEN COALESCE(
                r.completed_at,
                NOW()
              )

            WHEN input.new_status = 'failed'
              THEN NULL

            ELSE r.completed_at
          END,

        failed_at =
          CASE
            WHEN input.new_status = 'failed'
              THEN COALESCE(
                r.failed_at,
                NOW()
              )

            WHEN input.new_status IN (
              'completed',
              'partially_completed'
            )
              THEN NULL

            ELSE r.failed_at
          END,

        failure_reason =
          CASE
            WHEN input.new_status IN (
              'completed',
              'processing'
            )
              THEN NULL

            WHEN input.new_status IN (
              'failed',
              'partially_completed'
            )
              THEN NULLIF(
                input.new_failure_reason,
                ''
              )

            ELSE r.failure_reason
          END,

        updated_at =
          NOW()

      FROM input

      WHERE r.id =
        input.request_id

      RETURNING r.*
    `,
    [status, failureReason, requestId],
  );

  return result.rows[0] || null;
}

async function recomputeDepositStatus(client, depositId) {
  const depositResult = await client.query(
    `
      SELECT *

      FROM creator_wallet_deposits

      WHERE id = $1

      LIMIT 1

      FOR UPDATE
    `,
    [depositId],
  );

  const deposit = depositResult.rows[0];

  if (!deposit) {
    throw new Error("Creator wallet deposit could not be reconciled.");
  }

  const refundResult = await client.query(
    `
      SELECT
        COALESCE(
          SUM(amount)
          FILTER (
            WHERE status = 'succeeded'
          ),
          0
        ) AS successful_refund_amount

      FROM creator_wallet_refund_items

      WHERE deposit_id = $1
    `,
    [depositId],
  );

  const amount = Number(deposit.amount || 0);

  const remaining = Number(deposit.remaining_refundable_amount || 0);

  const refunded = Number(refundResult.rows[0]?.successful_refund_amount || 0);

  let status = "succeeded";

  if (refunded >= amount && amount > 0) {
    status = "refunded";
  } else if (refunded > 0) {
    status = "partially_refunded";
  } else if (remaining <= 0) {
    status = "used";
  } else if (remaining < amount) {
    status = "partially_used";
  }

  const result = await client.query(
    `
      UPDATE creator_wallet_deposits

      SET
        status = $1,
        updated_at = NOW()

      WHERE id = $2

      RETURNING *
    `,
    [status, depositId],
  );

  return result.rows[0] || deposit;
}

/*
Mark one original Stripe-funded creator deposit as no longer
eligible for automatic return-to-source refunds.

This does NOT remove money from the creator wallet. It only
removes this funding source from the automatic refundable
pool by setting remaining_refundable_amount to zero.

creator_wallet_refund_items remains the durable audit trail
that explains why the source was quarantined.
*/
async function quarantineCreatorDepositRefundSource(client, depositId) {
  const result = await client.query(
    `
      UPDATE creator_wallet_deposits

      SET
        remaining_refundable_amount = 0,
        updated_at = NOW()

      WHERE id = $1

      RETURNING *
    `,
    [depositId],
  );

  if (!result.rows.length) {
    throw new Error(
      "Creator wallet deposit refund source could not be quarantined.",
    );
  }

  return result.rows[0];
}

async function failRefundItemAndRestore(
  itemId,
  reason,
  { quarantineRefundSource = false } = {},
) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const itemResult = await client.query(
      `
        SELECT
          i.*,
          r.creator_id

        FROM creator_wallet_refund_items i

        JOIN creator_wallet_refund_requests r
          ON r.id = i.refund_request_id

        WHERE i.id = $1

        LIMIT 1

        FOR UPDATE OF i, r
      `,
      [itemId],
    );

    const item = itemResult.rows[0];

    if (!item) {
      throw new Error("Creator wallet refund item was not found.");
    }

    if (REFUND_TERMINAL_STATUSES.has(item.status)) {
      await client.query("COMMIT");

      return {
        success: true,
        idempotent: true,
      };
    }

    /*
    Once Stripe has supplied an re_ ID, this can no longer be
    treated as a simple local creation failure.
    */
    if (item.provider_refund_id) {
      throw new Error(
        "A creator wallet refund with a Stripe refund ID cannot be restored as a creation failure.",
      );
    }

    const amount = Number(item.amount || 0);

    const walletResult = await client.query(
      `
        UPDATE creator_wallets

        SET
          available_balance =
            available_balance + $1,

          pending_refund_balance =
            pending_refund_balance - $1,

          updated_at = NOW()

        WHERE creator_id = $2
          AND pending_refund_balance >= $1

        RETURNING *
      `,
      [amount, item.creator_id],
    );

    if (walletResult.rows.length === 0) {
      throw new Error(
        "Creator wallet refund reservation could not be restored.",
      );
    }

    if (quarantineRefundSource) {
      /*
      The creator keeps the restored internal wallet value,
      but this original Stripe funding source is no longer
      advertised as automatically refundable.

      This prevents FIFO withdrawal allocation from selecting
      the same permanently failed source over and over.
      */
      await quarantineCreatorDepositRefundSource(client, item.deposit_id);
    } else {
      await client.query(
        `
          UPDATE creator_wallet_deposits

          SET
            remaining_refundable_amount =
              LEAST(
                amount,
                remaining_refundable_amount + $1
              ),

            updated_at = NOW()

          WHERE id = $2
        `,
        [amount, item.deposit_id],
      );
    }

    await client.query(
      `
        UPDATE creator_wallet_refund_items

        SET
          status = 'failed',

          provider_status =
            COALESCE(
              provider_status,
              'creation_failed'
            ),

          failure_reason = $1,

          failed_at =
            COALESCE(
              failed_at,
              NOW()
            ),

          status_unknown_at = NULL,

          last_reconciled_at = NOW(),

          updated_at = NOW()

        WHERE id = $2
      `,
      [cleanText(reason, 1000), itemId],
    );

    await recomputeDepositStatus(client, item.deposit_id);

    await refreshRefundRequestStatus(client, item.refund_request_id);

    await client.query("COMMIT");

    return {
      success: true,
      idempotent: false,
    };
  } catch (error) {
    await rollbackQuietly(client);

    throw error;
  } finally {
    client.release();
  }
}

/*=========================================================
Stripe Refund Submission Replay Safety
=========================================================*/

function isFreshRefundSubmission(row) {
  if (row?.status !== "submitting" || !row?.last_submission_at) {
    return false;
  }

  const submittedAt = new Date(row.last_submission_at).getTime();

  if (!Number.isFinite(submittedAt)) {
    return false;
  }

  return Date.now() - submittedAt < REFUND_SUBMISSION_STALE_MS;
}

function refundSubmissionReferenceTime(row) {
  /*
  processing_at is initialized on the first claimed Stripe
  submission and is preserved with COALESCE.

  last_submission_at is intentionally NOT used here because
  it changes on each retry and would create a rolling replay
  window.
  */
  const candidates = [row?.processing_at, row?.created_at];

  for (const value of candidates) {
    const timestamp = new Date(value).getTime();

    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  return null;
}

function isRefundSubmissionPastSafeReplayWindow(row) {
  const attempts = Number(row?.submission_attempt_count || 0);

  if (!Number.isFinite(attempts) || attempts <= 0) {
    return false;
  }

  const referenceTime = refundSubmissionReferenceTime(row);

  if (!referenceTime) {
    return true;
  }

  return Date.now() - referenceTime >= STRIPE_V1_SAFE_RETRY_WINDOW_MS;
}

function depositCreationReferenceTime(row) {
  const timestamp = new Date(row?.created_at).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}

function isDepositCreationPastSafeReplayWindow(row) {
  if (!row || row.provider_payment_id) {
    return false;
  }

  const referenceTime = depositCreationReferenceTime(row);

  if (!referenceTime) {
    return true;
  }

  return Date.now() - referenceTime >= STRIPE_V1_SAFE_RETRY_WINDOW_MS;
}

function getStripeRefundFailureBalanceTransactionId(refund) {
  return getStripeObjectId(refund?.failure_balance_transaction);
}

async function loadRefundItemContext(queryable, itemId) {
  const result = await queryable.query(
    `
      SELECT
        i.*,

        r.creator_id AS request_creator_id,

        r.client_request_id,

        r.currency AS request_currency,

        r.status AS request_status

      FROM creator_wallet_refund_items i

      JOIN creator_wallet_refund_requests r
        ON r.id = i.refund_request_id

      WHERE i.id = $1

      LIMIT 1
    `,
    [itemId],
  );

  return result.rows[0] || null;
}

function stripeRefundMatchesItem(refund, item, creatorId, clientRequestId) {
  const metadata = refund?.metadata || {};

  const refundPaymentIntentId = getStripeObjectId(refund?.payment_intent);

  const expectedCents = moneyToCents(item?.amount);

  return (
    metadata.transaction_purpose === "creator_wallet_refund" &&
    metadata.refund_request_id === item.refund_request_id &&
    metadata.refund_item_id === item.id &&
    metadata.deposit_id === item.deposit_id &&
    metadata.creator_id === creatorId &&
    metadata.client_request_id === clientRequestId &&
    Number(metadata.amount_cents) === expectedCents &&
    Number(refund?.amount) === expectedCents &&
    String(refund?.currency || "").toLowerCase() === "usd" &&
    refundPaymentIntentId === item.provider_payment_id
  );
}

async function findMatchingStripeRefundForItem(
  stripe,
  item,
  creatorId,
  clientRequestId,
) {
  const matches = [];

  let startingAfter = null;

  for (let page = 0; page < 20; page += 1) {
    const params = {
      payment_intent: item.provider_payment_id,
      limit: 100,
    };

    if (startingAfter) {
      params.starting_after = startingAfter;
    }

    const response = await stripe.refunds.list(params);

    for (const refund of response.data || []) {
      if (stripeRefundMatchesItem(refund, item, creatorId, clientRequestId)) {
        matches.push(refund);

        if (matches.length > 1) {
          const error = new Error(
            "Multiple Stripe refunds match the same creator wallet refund item. Manual reconciliation is required.",
          );

          error.code = "CREATOR_REFUND_RECONCILIATION_AMBIGUOUS";

          throw error;
        }
      }
    }

    if (!response.has_more) {
      break;
    }

    const last = response.data?.[response.data.length - 1];

    if (!last?.id) {
      break;
    }

    startingAfter = last.id;

    if (page === 19) {
      const error = new Error(
        "Stripe refund reconciliation exceeded the safe pagination limit.",
      );

      error.code = "CREATOR_REFUND_RECONCILIATION_LIMIT";

      throw error;
    }
  }

  return matches[0] || null;
}

/*=========================================================
Refund Reconciliation State Helpers
=========================================================*/

async function markRefundItemReconciliationIssue(itemId, reason) {
  const result = await db.query(
    `
      UPDATE creator_wallet_refund_items

      SET
        status =
          CASE
            WHEN provider_refund_id IS NULL
              AND status IN (
                'pending',
                'submitting',
                'processing',
                'status_unknown'
              )
              THEN 'status_unknown'

            ELSE status
          END,

        status_unknown_at =
          CASE
            WHEN provider_refund_id IS NULL
              AND status IN (
                'pending',
                'submitting',
                'processing',
                'status_unknown'
              )
              THEN COALESCE(
                status_unknown_at,
                NOW()
              )

            ELSE status_unknown_at
          END,

        /*
        Do not contaminate an already-terminal item with a
        transient reconciliation error.
        */
        failure_reason =
          CASE
            WHEN status IN (
              'pending',
              'submitting',
              'processing',
              'status_unknown'
            )
              THEN $1

            ELSE failure_reason
          END,

        updated_at = NOW()

      WHERE id = $2

      RETURNING *
    `,
    [cleanText(reason, 1000), itemId],
  );

  return result.rows[0] || null;
}

async function persistStripeRefundLink(itemId, refund) {
  const refundId = String(refund?.id || "").trim();

  if (!refundId.startsWith("re_")) {
    throw new Error("Stripe returned an invalid refund ID.");
  }

  const result = await db.query(
    `
      UPDATE creator_wallet_refund_items

      SET
        provider_refund_id =
          COALESCE(
            provider_refund_id,
            $1
          ),

        /*
        A synchronous refunds.create response may race with
        a webhook that already finalized the item.

        Never downgrade provider-facing state for a terminal
        item here. The transactional provider-state processor
        below owns terminal transitions.
        */
        provider_status =
          CASE
            WHEN status IN (
              'succeeded',
              'failed',
              'cancelled'
            )
              THEN provider_status

            ELSE $2
          END,

        status =
          CASE
            WHEN status IN (
              'pending',
              'submitting',
              'processing',
              'status_unknown'
            )
              THEN 'processing'

            ELSE status
          END,

        failure_reason =
          CASE
            WHEN status IN (
              'succeeded',
              'failed',
              'cancelled'
            )
              THEN failure_reason

            ELSE $3
          END,

        processing_at =
          COALESCE(
            processing_at,
            NOW()
          ),

        status_unknown_at = NULL,

        last_reconciled_at = NOW(),

        updated_at = NOW()

      WHERE id = $4

        AND (
          provider_refund_id IS NULL
          OR provider_refund_id = $1
        )

      RETURNING *
    `,
    [
      refundId,
      cleanText(refund.status || "pending", 50),
      getStripeRefundFailureReason(refund),
      itemId,
    ],
  );

  if (!result.rows.length) {
    throw new Error(
      "Stripe refund could not be linked safely to the creator wallet refund item.",
    );
  }

  return result.rows[0];
}

async function claimRefundSubmission(itemId, creatorId, requestId) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        SELECT
          i.*,

          r.creator_id AS request_creator_id

        FROM creator_wallet_refund_items i

        JOIN creator_wallet_refund_requests r
          ON r.id = i.refund_request_id

        WHERE i.id = $1
          AND i.refund_request_id = $2
          AND r.creator_id = $3

        LIMIT 1

        FOR UPDATE OF i, r
      `,
      [itemId, requestId, creatorId],
    );

    const item = result.rows[0];

    if (!item) {
      throw new Error(
        "Creator wallet refund item could not be claimed for submission.",
      );
    }

    if (item.provider_refund_id || REFUND_TERMINAL_STATUSES.has(item.status)) {
      await client.query("COMMIT");

      return {
        claimed: false,
        item,
        terminal: REFUND_TERMINAL_STATUSES.has(item.status),
      };
    }

    if (isFreshRefundSubmission(item)) {
      await client.query("COMMIT");

      return {
        claimed: false,
        item,
        inFlight: true,
      };
    }

    const updateResult = await client.query(
      `
        UPDATE creator_wallet_refund_items

        SET
          status = 'submitting',

          submission_attempt_count =
            submission_attempt_count + 1,

          last_submission_at = NOW(),

          status_unknown_at = NULL,

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
      [itemId],
    );

    await client.query("COMMIT");

    return {
      claimed: true,
      item: updateResult.rows[0],
    };
  } catch (error) {
    await rollbackQuietly(client);

    throw error;
  } finally {
    client.release();
  }
}

async function applyStripeRefundObject(refund) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const applied = await processWalletRefundStateInternal(refund, client);

    if (!applied?.success) {
      await rollbackQuietly(client);

      return applied;
    }

    await client.query("COMMIT");

    return applied;
  } catch (error) {
    await rollbackQuietly(client);

    throw error;
  } finally {
    client.release();
  }
}

async function processRefundItemWithStripe({
  stripe,
  itemId,
  requestId,
  creatorId,
  clientRequestId,
}) {
  let item = await loadRefundItemContext(db, itemId);

  if (!item) {
    throw new Error("Creator wallet refund item was not found.");
  }

  if (
    item.refund_request_id !== requestId ||
    item.request_creator_id !== creatorId ||
    item.client_request_id !== clientRequestId
  ) {
    throw new Error(
      "Creator wallet refund item ownership or request metadata does not match.",
    );
  }

  /*
  If we already know the re_ ID, retrieve that exact provider
  object. Never create another refund for this item.
  */
  if (item.provider_refund_id) {
    try {
      const refund = await stripe.refunds.retrieve(item.provider_refund_id);

      const applied = await applyStripeRefundObject(refund);

      if (!applied?.success) {
        await markRefundItemReconciliationIssue(
          item.id,
          applied?.reason ||
            "Stripe refund could not be reconciled with internal records.",
        );

        return {
          success: false,
          uncertain: true,
        };
      }

      return {
        success: true,
        reconciled: true,
        refund,
        applied,
      };
    } catch (error) {
      await markRefundItemReconciliationIssue(
        item.id,
        error?.message || "Stripe refund retrieval failed.",
      );

      return {
        success: false,
        uncertain: true,
        error,
      };
    }
  }

  if (REFUND_TERMINAL_STATUSES.has(item.status)) {
    return {
      success: true,
      idempotent: true,
      terminal: true,
    };
  }

  /*
  If a submission may already have reached Stripe but we
  failed to persist its re_ ID, search existing refunds
  before considering another refunds.create call.
  */
  const needsDiscovery =
    Number(item.submission_attempt_count || 0) > 0 ||
    ["submitting", "status_unknown"].includes(item.status);

  if (needsDiscovery) {
    try {
      const recoveredRefund = await findMatchingStripeRefundForItem(
        stripe,
        item,
        creatorId,
        clientRequestId,
      );

      if (recoveredRefund) {
        await persistStripeRefundLink(item.id, recoveredRefund);

        const applied = await applyStripeRefundObject(recoveredRefund);

        if (!applied?.success) {
          await markRefundItemReconciliationIssue(
            item.id,
            applied?.reason ||
              "Recovered Stripe refund could not be reconciled safely.",
          );

          return {
            success: false,
            uncertain: true,
          };
        }

        return {
          success: true,
          recovered: true,
          refund: recoveredRefund,
          applied,
        };
      }
    } catch (error) {
      await markRefundItemReconciliationIssue(
        item.id,
        error?.message || "Stripe refund discovery failed.",
      );

      return {
        success: false,
        uncertain: true,
        error,
      };
    }
  }

  /*
  Do not blindly replay an old Stripe v1 POST forever.

  This check occurs only after discovery fails to find an
  existing matching Stripe refund.
  */
  if (
    !item.provider_refund_id &&
    Number(item.submission_attempt_count || 0) > 0 &&
    isRefundSubmissionPastSafeReplayWindow(item)
  ) {
    const reason =
      "The previous Stripe refund submission is outside the automatic idempotency replay window. Manual reconciliation is required before another refund submission.";

    await markRefundItemReconciliationIssue(item.id, reason);

    return {
      success: false,
      uncertain: true,
      manualReconciliationRequired: true,
      code: "CREATOR_REFUND_MANUAL_RECONCILIATION_REQUIRED",
      reason,
    };
  }

  const claim = await claimRefundSubmission(item.id, creatorId, requestId);

  if (!claim.claimed) {
    if (claim.item?.provider_refund_id) {
      try {
        const refund = await stripe.refunds.retrieve(
          claim.item.provider_refund_id,
        );

        const applied = await applyStripeRefundObject(refund);

        return {
          success: Boolean(applied?.success),
          reconciled: true,
          uncertain: !applied?.success,
          refund,
          applied,
        };
      } catch (error) {
        await markRefundItemReconciliationIssue(
          item.id,
          error?.message || "Stripe refund retrieval failed.",
        );

        return {
          success: false,
          uncertain: true,
          error,
        };
      }
    }

    return {
      success: true,
      processing: true,
      inFlight: Boolean(claim.inFlight),
      idempotent: Boolean(claim.terminal),
    };
  }

  item = claim.item;

  const itemCents = moneyToCents(item.amount);

  if (!Number.isSafeInteger(itemCents) || itemCents <= 0) {
    await failRefundItemAndRestore(
      item.id,
      "The creator wallet refund item contains an invalid amount.",
    );

    return {
      success: false,
      deterministicFailure: true,
    };
  }

  let refund;

  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: item.provider_payment_id,

        amount: itemCents,

        reason: "requested_by_customer",

        metadata: {
          transaction_purpose: "creator_wallet_refund",

          refund_request_id: requestId,

          refund_item_id: item.id,

          deposit_id: item.deposit_id,

          creator_id: creatorId,

          client_request_id: clientRequestId,

          amount_cents: String(itemCents),
        },
      },
      {
        idempotencyKey: item.provider_idempotency_key,
      },
    );
  } catch (error) {
    const reason = cleanText(
      error?.message || "Stripe refund request failed.",
      1000,
    );

    if (isDefinitiveStripeRefundCreationError(error)) {
      const quarantineRefundSource =
        isUnusableStripeRefundSourceCreationError(error);

      await failRefundItemAndRestore(item.id, reason, {
        quarantineRefundSource,
      });

      return {
        success: false,
        deterministicFailure: true,
        refundSourceQuarantined: quarantineRefundSource,
        error,
      };
    }

    await markRefundItemReconciliationIssue(item.id, reason);

    return {
      success: false,
      uncertain: true,
      error,
    };
  }

  await persistStripeRefundLink(item.id, refund);

  try {
    const applied = await applyStripeRefundObject(refund);

    if (!applied?.success) {
      await markRefundItemReconciliationIssue(
        item.id,
        applied?.reason ||
          "Stripe refund was created but could not be reconciled safely.",
      );

      return {
        success: false,
        uncertain: true,
        refund,
      };
    }

    return {
      success: true,
      refund,
      applied,
    };
  } catch (error) {
    await markRefundItemReconciliationIssue(
      item.id,
      error?.message ||
        "Stripe refund was created but internal reconciliation failed.",
    );

    return {
      success: false,
      uncertain: true,
      refund,
      error,
    };
  }
}

/*=========================================================
1. Creator Wallet Summary
=========================================================*/

exports.getCreatorWalletSummary = async (req, res) => {
  const creatorId = getAuthenticatedUserId(req);

  if (!isUuid(creatorId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  try {
    await ensureCreatorWalletRow(db, creatorId);

    const [walletResult, escrowResult, p2pResult] = await Promise.all([
      db.query(
        `
          SELECT
            available_balance,
            pending_escrow_balance,
            pending_payout_balance,
            pending_refund_balance,
            lifetime_deposited,
            lifetime_spent,
            lifetime_withdrawn,
            lifetime_refunded,
            currency

          FROM creator_wallets

          WHERE creator_id = $1

          LIMIT 1
        `,
        [creatorId],
      ),

      db.query(
        `
          SELECT
            COALESCE(
              SUM(agreed_price),
              0
            ) AS locked_escrow_balance,

            COUNT(*)::integer AS active_escrow_count

          FROM bookings

          WHERE creator_id = $1
            AND escrow_locked = TRUE
        `,
        [creatorId],
      ),

      db.query(
        `
          SELECT
            COALESCE(
              SUM(t.gross_amount)
              FILTER (
                WHERE
                  t.sender_id = $1
                  AND t.transaction_type = 'escrow_lock'
              ),
              0
            ) AS total_p2p_charged,

            COALESCE(
              SUM(t.gross_amount)
              FILTER (
                WHERE
                  t.receiver_id = $1
                  AND t.transaction_type = 'refund'

                  AND EXISTS (
                    SELECT 1

                    FROM bookings rb

                    WHERE rb.id = t.reference_id
                      AND rb.creator_id = $1
                  )
              ),
              0
            ) AS total_p2p_refunded

          FROM transactions t

          WHERE
            (
              t.sender_id = $1
              AND t.transaction_type = 'escrow_lock'
            )

            OR

            (
              t.receiver_id = $1
              AND t.transaction_type = 'refund'

              AND EXISTS (
                SELECT 1

                FROM bookings rb

                WHERE rb.id = t.reference_id
                  AND rb.creator_id = $1
              )
            )
        `,
        [creatorId],
      ),
    ]);

    const wallet = serializeCreatorWallet(walletResult.rows[0]);

    const lockedEscrow = Number(
      escrowResult.rows[0]?.locked_escrow_balance || 0,
    );

    const activeEscrowCount = Number(
      escrowResult.rows[0]?.active_escrow_count || 0,
    );

    const totalP2PCharged = Number(p2pResult.rows[0]?.total_p2p_charged || 0);

    const totalP2PRefunded = Number(p2pResult.rows[0]?.total_p2p_refunded || 0);

    const netP2PSpend = Math.max(0, totalP2PCharged - totalP2PRefunded);

    /*
    Keep the legacy fields so existing frontend code does not
    break, but direct marketplace/store financial activity is
    deliberately no longer counted.
    */
    const totalStoreSpend = 0;

    const completedStoreOrders = 0;

    const totalLifespanSpend = netP2PSpend;

    return res.status(200).json({
      status: "success",

      data: {
        ...wallet,

        locked_escrow_balance: money(lockedEscrow),

        active_escrow_count: activeEscrowCount,

        total_p2p_charged: money(totalP2PCharged),

        total_p2p_refunded: money(totalP2PRefunded),

        net_p2p_spend: money(netP2PSpend),

        total_store_spend: money(totalStoreSpend),

        completed_store_orders: completedStoreOrders,

        total_lifespan_spend: money(totalLifespanSpend),
      },
    });
  } catch (error) {
    console.error("Creator financial summary fetch failed:", error);

    return sendError(
      res,
      500,
      "The creator financial summary could not be loaded.",
    );
  }
};

/*=========================================================
2. Creator Transaction Ledger
=========================================================*/

exports.getOutboundLedger = async (req, res) => {
  const creatorId = getAuthenticatedUserId(req);

  if (!isUuid(creatorId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  const page = parsePositiveInteger(req.query?.page, DEFAULT_PAGE, 100000);

  const limit = parsePositiveInteger(
    req.query?.limit,
    DEFAULT_LIMIT,
    MAX_LIMIT,
  );

  const offset = (page - 1) * limit;

  const requestedType = cleanText(req.query?.type, 50).toLowerCase();

  const transactionType = normalizeTransactionType(requestedType);

  const requestedProvider = cleanText(req.query?.provider, 20).toLowerCase();

  const paymentProvider = normalizeProvider(requestedProvider);

  const search = cleanText(req.query?.search, 100);

  if (requestedType && !transactionType) {
    return sendError(res, 400, "Unsupported creator transaction type.");
  }

  if (requestedProvider && !paymentProvider) {
    return sendError(res, 400, "Unsupported payment provider.");
  }

  const values = [creatorId];

  const conditions = [
    "(t.sender_id = $1 OR t.receiver_id = $1)",

    `
      t.transaction_type IN (
        'escrow_lock',
        'escrow_release',
        'refund',
        'booking_deposit',
        'wallet_deposit'
      )
    `,
  ];

  if (transactionType) {
    values.push(transactionType);

    conditions.push(`t.transaction_type::text = $${values.length}`);
  }

  if (paymentProvider) {
    values.push(paymentProvider);

    conditions.push(
      `LOWER(COALESCE(t.payment_provider, '')) = $${values.length}`,
    );
  }

  if (search) {
    values.push(`%${search}%`);

    const i = values.length;

    conditions.push(
      `
        (
          t.id::text ILIKE $${i}

          OR COALESCE(
            t.reference_id::text,
            ''
          ) ILIKE $${i}

          OR COALESCE(
            t.provider_payment_id,
            ''
          ) ILIKE $${i}

          OR COALESCE(
            t.provider_transaction_id,
            ''
          ) ILIKE $${i}

          OR COALESCE(
            t.stripe_payment_intent_id,
            ''
          ) ILIKE $${i}

          OR COALESCE(
            sender.full_name,
            ''
          ) ILIKE $${i}

          OR COALESCE(
            receiver.full_name,
            ''
          ) ILIKE $${i}
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
          t.id AS transaction_id,
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

          sender.full_name AS sender_name,

          receiver.full_name AS receiver_name,

          CASE
            WHEN t.sender_id = $1
              THEN receiver.full_name

            WHEN t.receiver_id = $1
              THEN sender.full_name

            ELSE NULL
          END AS counterparty_name,

          b.status AS booking_status,

          b.booking_type,

          b.payment_provider AS booking_payment_provider,

          b.provider_payment_id AS booking_provider_payment_id,

          b.provider_capture_id AS booking_provider_capture_id,

          b.provider_refund_id AS booking_provider_refund_id,

          b.payment_currency AS booking_currency,

          cwrr.id AS creator_wallet_refund_request_id,

          COUNT(*) OVER() AS total_count

        FROM transactions t

        LEFT JOIN users sender
          ON sender.id = t.sender_id

        LEFT JOIN users receiver
          ON receiver.id = t.receiver_id

        LEFT JOIN bookings b
          ON b.id = t.reference_id

        LEFT JOIN creator_wallet_refund_requests cwrr
          ON cwrr.id = t.reference_id
          AND cwrr.creator_id = $1

        WHERE
          ${conditions.join(" AND ")}

        ORDER BY
          t.created_at DESC,
          t.id DESC

        LIMIT $${limitIndex}

        OFFSET $${offsetIndex}
      `,
      values,
    );

    const total = Number(result.rows[0]?.total_count || 0);

    const data = result.rows.map((row) => ({
      transaction_id: row.transaction_id,

      reference_id: row.reference_id || null,

      sender_id: row.sender_id || null,

      receiver_id: row.receiver_id || null,

      sender_name: row.sender_name || null,

      receiver_name: row.receiver_name || null,

      counterparty_name: row.counterparty_name || null,

      gross_amount: money(row.gross_amount),

      platform_fee_deducted: money(row.platform_fee_deducted),

      net_amount: money(row.net_amount),

      transaction_type: row.transaction_type,

      transaction_label: getCreatorTransactionLabel(row),

      direction: getCreatorTransactionDirection(row, creatorId),

      creator_wallet_refund_request_id:
        row.creator_wallet_refund_request_id || null,

      payment_provider:
        row.payment_provider ||
        row.booking_payment_provider ||
        (row.stripe_payment_intent_id ? "stripe" : null),

      provider_payment_id:
        row.provider_payment_id ||
        row.booking_provider_payment_id ||
        row.stripe_payment_intent_id ||
        null,

      provider_transaction_id: row.provider_transaction_id || null,

      stripe_payment_intent_id: row.stripe_payment_intent_id || null,

      currency: String(
        row.currency || row.booking_currency || "usd",
      ).toLowerCase(),

      booking_status: row.booking_status || null,

      booking_type: row.booking_type || null,

      provider_capture_id: row.booking_provider_capture_id || null,

      provider_refund_id: row.booking_provider_refund_id || null,

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

        hasNextPage: page * limit < total,

        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Creator outbound ledger fetch failed:", error);

    return sendError(
      res,
      500,
      "The creator transaction ledger could not be loaded.",
    );
  }
};

/*=========================================================
3. Create Creator Wallet Deposit
=========================================================*/

exports.createWalletDeposit = async (req, res) => {
  const creatorId = getAuthenticatedUserId(req);

  const clientRequestId = getClientRequestId(req);

  const requestedCents = moneyToCents(req.body?.amount);

  const requestedProvider = String(
    req.body?.paymentProvider || req.body?.payment_provider || "stripe",
  )
    .trim()
    .toLowerCase();

  if (!isUuid(creatorId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!clientRequestId) {
    return sendError(
      res,
      400,
      "A client_request_id or Idempotency-Key is required.",
    );
  }

  if (requestedProvider !== "stripe") {
    return sendError(
      res,
      400,
      "Only Stripe creator wallet deposits are enabled right now.",
    );
  }

  if (
    !Number.isSafeInteger(requestedCents) ||
    requestedCents < MIN_CREATOR_DEPOSIT_CENTS ||
    requestedCents > STRIPE_MAX_AMOUNT_CENTS
  ) {
    return sendError(
      res,
      400,
      `Deposit amount must be between $${money(
        MIN_CREATOR_DEPOSIT_CENTS / 100,
      )} and $${money(STRIPE_MAX_AMOUNT_CENTS / 100)}.`,
    );
  }

  const amount = centsToMoney(requestedCents);

  try {
    await ensureCreatorWalletRow(db, creatorId);

    let result = await db.query(
      `
        SELECT *

        FROM creator_wallet_deposits

        WHERE creator_id = $1
          AND client_request_id = $2

        LIMIT 1
      `,
      [creatorId, clientRequestId],
    );

    let deposit = result.rows[0] || null;

    let idempotent = Boolean(deposit);

    if (deposit) {
      if (
        moneyToCents(deposit.amount) !== requestedCents ||
        deposit.payment_provider !== "stripe" ||
        String(deposit.currency || "usd").toLowerCase() !== "usd"
      ) {
        return sendError(
          res,
          409,
          "This client_request_id is already associated with a different wallet deposit.",
        );
      }
    } else {
      result = await db.query(
        `
          INSERT INTO creator_wallet_deposits (
            creator_id,
            amount,
            remaining_refundable_amount,
            payment_provider,
            currency,
            status,
            client_request_id
          )

          VALUES (
            $1,
            $2,
            0,
            'stripe',
            'usd',
            'pending',
            $3
          )

          ON CONFLICT (
            creator_id,
            client_request_id
          )
          DO NOTHING

          RETURNING *
        `,
        [creatorId, amount, clientRequestId],
      );

      if (result.rows.length) {
        deposit = result.rows[0];

        idempotent = false;
      } else {
        result = await db.query(
          `
            SELECT *

            FROM creator_wallet_deposits

            WHERE creator_id = $1
              AND client_request_id = $2

            LIMIT 1
          `,
          [creatorId, clientRequestId],
        );

        deposit = result.rows[0] || null;

        idempotent = true;
      }
    }

    if (!deposit) {
      throw new Error("Creator wallet deposit could not be initialized.");
    }

    const stripe = getStripeClient();

    let paymentIntent;

    if (deposit.provider_payment_id) {
      paymentIntent = await stripe.paymentIntents.retrieve(
        deposit.provider_payment_id,
      );

      if (
        paymentIntent.metadata?.transaction_purpose !==
          "creator_wallet_deposit" ||
        paymentIntent.metadata?.deposit_id !== deposit.id ||
        paymentIntent.metadata?.creator_id !== creatorId ||
        Number(paymentIntent.amount) !== requestedCents ||
        String(paymentIntent.currency || "").toLowerCase() !== "usd"
      ) {
        return sendError(
          res,
          409,
          "The Stripe PaymentIntent does not match the creator wallet deposit record.",
        );
      }
    } else {
      /*
      This is an old replay of an existing local deposit row
      but no PaymentIntent ID was ever persisted.

      Do not blindly reuse the same Stripe v1 idempotency key
      outside the conservative replay window.
      */
      if (idempotent && isDepositCreationPastSafeReplayWindow(deposit)) {
        return sendError(
          res,
          409,
          "This creator wallet deposit is too old to recreate safely without reconciling Stripe first.",
          {
            code: "CREATOR_DEPOSIT_MANUAL_RECONCILIATION_REQUIRED",

            deposit_id: deposit.id,
          },
        );
      }

      try {
        paymentIntent = await stripe.paymentIntents.create(
          {
            amount: requestedCents,

            currency: "usd",

            payment_method_types: ["card"],

            description: "Creator wallet deposit",

            metadata: {
              transaction_purpose: "creator_wallet_deposit",

              deposit_id: deposit.id,

              creator_id: creatorId,

              client_request_id: clientRequestId,

              amount_cents: String(requestedCents),
            },
          },
          {
            idempotencyKey: `creator-wallet-deposit:${deposit.id}`,
          },
        );
      } catch (stripeError) {
        await db.query(
          `
            UPDATE creator_wallet_deposits

            SET
              failure_reason = $1,
              updated_at = NOW()

            WHERE id = $2
              AND creator_id = $3
              AND provider_payment_id IS NULL
          `,
          [
            cleanText(stripeError?.message || "Stripe request failed.", 1000),

            deposit.id,

            creatorId,
          ],
        );

        throw stripeError;
      }

      result = await db.query(
        `
          UPDATE creator_wallet_deposits

          SET
            provider_payment_id = $1,

            status =
              CASE
                WHEN status = 'pending'
                  THEN 'processing'

                ELSE status
              END,

            failure_reason = NULL,

            updated_at = NOW()

          WHERE id = $2
            AND creator_id = $3

            AND (
              provider_payment_id IS NULL
              OR provider_payment_id = $1
            )

          RETURNING *
        `,
        [paymentIntent.id, deposit.id, creatorId],
      );

      if (!result.rows.length) {
        throw new Error("Stripe PaymentIntent could not be linked safely.");
      }

      deposit = result.rows[0];
    }

    return res.status(idempotent ? 200 : 201).json({
      status: "success",

      idempotent,

      message:
        deposit.credited_at || deposit.status === "succeeded"
          ? "This creator wallet deposit has already been credited."
          : "Creator wallet deposit initialized successfully.",

      clientSecret: paymentIntent.client_secret,

      paymentIntentId: paymentIntent.id,

      data: {
        deposit: serializeDeposit(deposit),

        payment: {
          provider: "stripe",

          payment_intent_id: paymentIntent.id,

          status: paymentIntent.status,

          amount: money(amount),

          currency: "usd",
        },
      },
    });
  } catch (error) {
    console.error("Creator wallet deposit initialization failed:", error);

    return sendError(
      res,
      500,
      "The creator wallet deposit could not be initialized.",
    );
  }
};

/*=========================================================
4. Trusted Creator Deposit Webhook Processor
=========================================================*/

exports.processWalletDepositSucceededInternal = async (
  paymentIntent,
  client,
) => {
  if (!paymentIntent || !client) {
    return {
      success: false,

      reason: "PaymentIntent or database context is missing.",
    };
  }

  if (paymentIntent.status !== "succeeded") {
    return {
      success: false,

      reason: "The Stripe PaymentIntent has not succeeded.",
    };
  }

  const paymentIntentId = String(paymentIntent.id || "").trim();

  const metadata = paymentIntent.metadata || {};

  const depositId = String(metadata.deposit_id || "").trim();

  const creatorId = String(metadata.creator_id || "").trim();

  const clientRequestId = String(metadata.client_request_id || "").trim();

  if (metadata.transaction_purpose !== "creator_wallet_deposit") {
    return {
      success: false,

      reason: "The Stripe PaymentIntent is not a creator wallet deposit.",
    };
  }

  if (!isUuid(depositId) || !isUuid(creatorId) || !clientRequestId) {
    return {
      success: false,

      reason: "Creator wallet deposit metadata is incomplete or invalid.",
    };
  }

  const depositResult = await client.query(
    `
      SELECT *

      FROM creator_wallet_deposits

      WHERE id = $1
        AND creator_id = $2

      LIMIT 1

      FOR UPDATE
    `,
    [depositId, creatorId],
  );

  const deposit = depositResult.rows[0];

  if (!deposit) {
    return {
      success: false,

      reason: "Creator wallet deposit was not found.",
    };
  }

  if (
    deposit.payment_provider !== "stripe" ||
    deposit.client_request_id !== clientRequestId ||
    (deposit.provider_payment_id &&
      deposit.provider_payment_id !== paymentIntentId)
  ) {
    return {
      success: false,

      reason: "The creator wallet deposit does not match Stripe metadata.",
    };
  }

  const expectedCents = moneyToCents(deposit.amount);

  const metadataCents = Number(metadata.amount_cents);

  const intentCents = Number(paymentIntent.amount);

  const receivedCents = Number(paymentIntent.amount_received ?? 0);

  const currency = String(paymentIntent.currency || "").toLowerCase();

  if (
    !Number.isSafeInteger(expectedCents) ||
    expectedCents <= 0 ||
    metadataCents !== expectedCents ||
    intentCents !== expectedCents ||
    receivedCents !== expectedCents ||
    currency !== String(deposit.currency || "usd").toLowerCase() ||
    currency !== "usd"
  ) {
    return {
      success: false,

      reason: "Stripe wallet deposit amount or currency does not match.",
    };
  }

  if (deposit.credited_at) {
    return {
      success: true,

      idempotent: true,

      depositId,

      creatorId,

      paymentIntentId,

      status: deposit.status,
    };
  }

  await ensureCreatorWalletRow(client, creatorId);

  const amount = centsToMoney(expectedCents);

  const walletResult = await client.query(
    `
      UPDATE creator_wallets

      SET
        available_balance =
          available_balance + $1,

        lifetime_deposited =
          lifetime_deposited + $1,

        updated_at =
          NOW()

      WHERE creator_id = $2

      RETURNING *
    `,
    [amount, creatorId],
  );

  if (!walletResult.rows.length) {
    throw new Error("Creator wallet could not be credited.");
  }

  const chargeId = getStripeObjectId(paymentIntent.latest_charge);

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
        'wallet_deposit',
        $4,
        'stripe',
        $4,
        $5,
        'usd',
        NOW()

      WHERE NOT EXISTS (
        SELECT 1

        FROM transactions

        WHERE transaction_type =
          'wallet_deposit'

          AND payment_provider =
            'stripe'

          AND provider_payment_id =
            $4
      )
    `,
    [creatorId, depositId, amount, paymentIntentId, chargeId],
  );

  const updatedDepositResult = await client.query(
    `
        UPDATE creator_wallet_deposits

        SET
          provider_payment_id =
            $1,

          remaining_refundable_amount =
            amount,

          status =
            'succeeded',

          failure_reason =
            NULL,

          credited_at =
            NOW(),

          updated_at =
            NOW()

        WHERE id = $2
          AND creator_id = $3
          AND credited_at IS NULL

        RETURNING *
      `,
    [paymentIntentId, depositId, creatorId],
  );

  if (!updatedDepositResult.rows.length) {
    throw new Error(
      "Creator wallet deposit could not be marked credited safely.",
    );
  }

  return {
    success: true,

    idempotent: false,

    depositId,

    creatorId,

    paymentIntentId,

    status: "succeeded",

    amount: money(amount),

    currency: "usd",

    wallet: serializeCreatorWallet(walletResult.rows[0]),

    deposit: serializeDeposit(updatedDepositResult.rows[0]),
  };
};

/*=========================================================
5. Withdraw Unused Creator Wallet Balance
=========================================================*/

exports.withdrawUnusedBalance = async (req, res) => {
  const creatorId = getAuthenticatedUserId(req);

  const clientRequestId = getClientRequestId(req);

  const requestedCents = moneyToCents(req.body?.amount);

  if (!isUuid(creatorId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!clientRequestId) {
    return sendError(
      res,
      400,
      "A client_request_id or Idempotency-Key is required.",
    );
  }

  if (
    !Number.isSafeInteger(requestedCents) ||
    requestedCents < MIN_CREATOR_REFUND_CENTS ||
    requestedCents > STRIPE_MAX_AMOUNT_CENTS
  ) {
    return sendError(
      res,
      400,
      "A valid positive withdrawal amount is required.",
    );
  }

  const requestedAmount = centsToMoney(requestedCents);

  const client = await db.connect();

  let request = null;

  let items = [];

  let idempotent = false;

  try {
    await client.query("BEGIN");

    /*
    Serialize concurrent requests using the same creator +
    client request identity.
    */
    await client.query(
      `
        SELECT pg_advisory_xact_lock(
          hashtext($1),
          hashtext($2)
        )
      `,
      ["creator-wallet-refund", `${creatorId}:${clientRequestId}`],
    );

    await ensureCreatorWalletRow(client, creatorId);

    /*
    IMPORTANT:

    Existing requests are checked BEFORE the NEW-operation
    email verification gate.

    Existing already-reserved money must remain recoverable
    even if account verification later changes.
    */
    const existingResult = await client.query(
      `
          SELECT *

          FROM creator_wallet_refund_requests

          WHERE creator_id = $1
            AND client_request_id = $2

          LIMIT 1

          FOR UPDATE
        `,
      [creatorId, clientRequestId],
    );

    request = existingResult.rows[0] || null;

    if (request) {
      idempotent = true;

      if (
        moneyToCents(request.amount) !== requestedCents ||
        String(request.currency || "usd").toLowerCase() !== "usd"
      ) {
        await rollbackQuietly(client);

        return sendError(
          res,
          409,
          "This client_request_id belongs to a different wallet withdrawal.",
        );
      }

      items = await loadRefundRequestItems(client, request.id);

      await client.query("COMMIT");
    } else {
      /*
      NEW creator financial action:

      verified email required;
      admin approval deliberately NOT required.
      */
      if (req.user?.isEmailVerified !== true) {
        await rollbackQuietly(client);

        return sendError(
          res,
          403,
          "Please verify your email before withdrawing creator wallet funds.",
          {
            code: "EMAIL_VERIFICATION_REQUIRED",
          },
        );
      }

      const walletResult = await client.query(
        `
            SELECT *

            FROM creator_wallets

            WHERE creator_id = $1

            LIMIT 1

            FOR UPDATE
          `,
        [creatorId],
      );

      const wallet = walletResult.rows[0];

      const availableCents = moneyToCents(wallet?.available_balance);

      if (
        !wallet ||
        !Number.isSafeInteger(availableCents) ||
        availableCents < requestedCents
      ) {
        await rollbackQuietly(client);

        return sendError(
          res,
          400,
          "Insufficient available creator wallet balance.",
          {
            available_balance: money(wallet?.available_balance || 0),
          },
        );
      }

      /*
      Before building the FIFO pool, quarantine historical
      Stripe funding sources that already have a real failed
      Stripe refund (an re_ ID linked to a failed item).

      This cleans up legacy rows from older controller
      versions and prevents the same bad source from blocking
      every future withdrawal.
      */
      const historicalQuarantineResult = await client.query(
        `
            UPDATE creator_wallet_deposits AS d

            SET
              remaining_refundable_amount = 0,
              updated_at = NOW()

            WHERE d.creator_id = $1
              AND d.payment_provider = 'stripe'
              AND d.remaining_refundable_amount > 0

              AND EXISTS (
                SELECT 1

                FROM creator_wallet_refund_items AS i

                WHERE i.deposit_id = d.id
                  AND i.payment_provider = 'stripe'
                  AND i.provider_refund_id IS NOT NULL
                  AND i.status = 'failed'
              )

            RETURNING d.id
          `,
        [creatorId],
      );

      for (const row of historicalQuarantineResult.rows) {
        await recomputeDepositStatus(client, row.id);
      }

      /*
      Only unused value originating from successful Stripe
      wallet deposits can be returned through this endpoint.

      The NOT EXISTS condition is a second defensive barrier
      against selecting a source with a known failed Stripe
      refund, even if legacy cleanup above ever becomes a
      no-op because of concurrent state changes.
      */
      const depositResult = await client.query(
        `
            SELECT *

            FROM creator_wallet_deposits

            WHERE creator_id = $1
              AND payment_provider = 'stripe'
              AND credited_at IS NOT NULL
              AND provider_payment_id IS NOT NULL
              AND remaining_refundable_amount > 0

              AND NOT EXISTS (
                SELECT 1

                FROM creator_wallet_refund_items AS failed_item

                WHERE failed_item.deposit_id =
                    creator_wallet_deposits.id

                  AND failed_item.payment_provider =
                    'stripe'

                  AND failed_item.provider_refund_id
                    IS NOT NULL

                  AND failed_item.status =
                    'failed'
              )

            ORDER BY
              credited_at ASC,
              created_at ASC,
              id ASC

            FOR UPDATE
          `,
        [creatorId],
      );

      const refundableCents = depositResult.rows.reduce((sum, deposit) => {
        const cents = moneyToCents(deposit.remaining_refundable_amount);

        return sum + (Number.isSafeInteger(cents) ? cents : 0);
      }, 0);

      if (refundableCents < requestedCents) {
        await rollbackQuietly(client);

        return sendError(
          res,
          400,
          "The requested amount exceeds the balance refundable to original Stripe funding sources.",
          {
            available_balance: money(wallet.available_balance),

            refundable_balance: money(refundableCents / 100),
          },
        );
      }

      const requestResult = await client.query(
        `
            INSERT INTO creator_wallet_refund_requests (
              creator_id,
              amount,
              currency,
              status,
              client_request_id,
              processing_at
            )

            VALUES (
              $1,
              $2,
              'usd',
              'processing',
              $3,
              NOW()
            )

            RETURNING *
          `,
        [creatorId, requestedAmount, clientRequestId],
      );

      request = requestResult.rows[0];

      let remaining = requestedCents;

      for (const deposit of depositResult.rows) {
        if (remaining <= 0) {
          break;
        }

        const depositCents = moneyToCents(deposit.remaining_refundable_amount);

        if (!Number.isSafeInteger(depositCents) || depositCents <= 0) {
          continue;
        }

        const allocationCents = Math.min(remaining, depositCents);

        const allocation = centsToMoney(allocationCents);

        const itemResult = await client.query(
          `
              WITH generated AS (
                SELECT gen_random_uuid() AS id
              )

              INSERT INTO creator_wallet_refund_items (
                id,
                refund_request_id,
                deposit_id,
                amount,
                payment_provider,
                provider_payment_id,
                provider_idempotency_key,
                submission_attempt_count,
                status
              )

              SELECT
                generated.id,
                $1,
                $2,
                $3,
                'stripe',
                $4,
                'creator-wallet-refund:' ||
                  generated.id::text,
                0,
                'pending'

              FROM generated

              RETURNING *
            `,
          [request.id, deposit.id, allocation, deposit.provider_payment_id],
        );

        items.push(itemResult.rows[0]);

        const reserveDepositResult = await client.query(
          `
              UPDATE creator_wallet_deposits

              SET
                remaining_refundable_amount =
                  remaining_refundable_amount -
                  $1,

                updated_at =
                  NOW()

              WHERE id = $2
                AND remaining_refundable_amount >= $1

              RETURNING id
            `,
          [allocation, deposit.id],
        );

        if (!reserveDepositResult.rows.length) {
          throw new Error(
            "Creator deposit refund allocation could not be reserved.",
          );
        }

        remaining -= allocationCents;
      }

      if (remaining !== 0) {
        throw new Error(
          "Creator wallet refund allocation did not match request amount.",
        );
      }

      const reserveWalletResult = await client.query(
        `
            UPDATE creator_wallets

            SET
              available_balance =
                available_balance -
                $1,

              pending_refund_balance =
                pending_refund_balance +
                $1,

              updated_at =
                NOW()

            WHERE creator_id = $2
              AND available_balance >= $1

            RETURNING *
          `,
        [requestedAmount, creatorId],
      );

      if (!reserveWalletResult.rows.length) {
        throw new Error("Creator wallet refund balance could not be reserved.");
      }

      /*
      No Stripe API request occurs before this COMMIT.
      */
      await client.query("COMMIT");
    }
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Creator wallet withdrawal initialization failed:", error);

    return sendError(
      res,
      500,
      "Creator wallet withdrawal could not be initialized.",
    );
  } finally {
    client.release();
  }

  /*
  The initialization transaction is now finished.

  No database money lock is held across Stripe network calls.
  */
  let stripe;

  try {
    stripe = getStripeClient();
  } catch (error) {
    let uncertainReservationExists = false;

    for (const originalItem of items) {
      const currentItem = await loadRefundItemContext(db, originalItem.id);

      if (!currentItem || REFUND_TERMINAL_STATUSES.has(currentItem.status)) {
        continue;
      }

      /*
      Nothing was ever submitted to Stripe. Safe local
      restoration is allowed.
      */
      if (
        !currentItem.provider_refund_id &&
        Number(currentItem.submission_attempt_count || 0) === 0
      ) {
        await failRefundItemAndRestore(currentItem.id, error.message);
      } else {
        /*
        There is evidence of a possible external submission.
        Keep funds reserved until reconciled.
        */
        uncertainReservationExists = true;

        await markRefundItemReconciliationIssue(currentItem.id, error.message);
      }
    }

    return sendError(
      res,
      500,
      uncertainReservationExists
        ? "Stripe refund processing is unavailable. Existing refund submissions remain reserved for safe reconciliation."
        : "Stripe refund processing is not configured. Unsubmitted reserved wallet funds were restored.",
      {
        retry_safe: true,
      },
    );
  }

  let unknownOutcome = false;

  for (const item of items) {
    try {
      const outcome = await processRefundItemWithStripe({
        stripe,

        itemId: item.id,

        requestId: request.id,

        creatorId,

        clientRequestId,
      });

      if (outcome?.uncertain || outcome?.inFlight) {
        unknownOutcome = true;
      }
    } catch (error) {
      unknownOutcome = true;

      console.error(
        `Creator wallet refund item ${item.id} processing failed:`,
        error,
      );

      await markRefundItemReconciliationIssue(
        item.id,
        error?.message ||
          "Creator wallet refund item could not be processed safely.",
      );
    }
  }

  const statusClient = await db.connect();

  let finalRequest = request;

  try {
    await statusClient.query("BEGIN");

    finalRequest =
      (await refreshRefundRequestStatus(statusClient, request.id)) || request;

    await statusClient.query("COMMIT");
  } catch (error) {
    await rollbackQuietly(statusClient);

    unknownOutcome = true;

    console.error("Creator wallet refund request refresh failed:", error);
  } finally {
    statusClient.release();
  }

  const finalItems = await loadRefundRequestItems(db, request.id);

  const walletResult = await db.query(
    `
        SELECT *

        FROM creator_wallets

        WHERE creator_id = $1

        LIMIT 1
      `,
    [creatorId],
  );

  const stillProcessing =
    finalRequest.status === "processing" ||
    finalItems.some((item) => REFUND_ACTIVE_STATUSES.has(item.status)) ||
    unknownOutcome;

  return res.status(stillProcessing ? 202 : idempotent ? 200 : 201).json({
    status: "success",

    idempotent,

    processing: stillProcessing,

    retry_safe: stillProcessing,

    message:
      finalRequest.status === "completed"
        ? "Unused creator wallet balance was returned successfully."
        : finalRequest.status === "failed"
          ? "The wallet withdrawal failed and reserved funds were restored."
          : finalRequest.status === "partially_completed"
            ? "The withdrawal was partially completed; failed allocations were restored."
            : "The creator wallet withdrawal is processing or awaiting Stripe reconciliation.",

    data: {
      wallet: serializeCreatorWallet(walletResult.rows[0] || {}),

      refund_request: serializeRefundRequest(finalRequest, finalItems),
    },
  });
};

/*=========================================================
6. Trusted Stripe Refund State Processor
=========================================================*/

async function processWalletRefundStateInternal(refund, client) {
  if (!refund || !client) {
    return {
      success: false,

      reason: "Refund object or database context is missing.",
    };
  }

  const metadata = refund.metadata || {};

  const refundId = String(refund.id || "").trim();

  const requestId = String(metadata.refund_request_id || "").trim();

  const itemId = String(metadata.refund_item_id || "").trim();

  const depositId = String(metadata.deposit_id || "").trim();

  const creatorId = String(metadata.creator_id || "").trim();

  const clientRequestId = String(metadata.client_request_id || "").trim();

  const status = normalizeStripeRefundStatus(refund.status);

  if (metadata.transaction_purpose !== "creator_wallet_refund") {
    return {
      success: false,

      reason: "Stripe refund is not a creator wallet refund.",
    };
  }

  if (
    !refundId.startsWith("re_") ||
    !isUuid(requestId) ||
    !isUuid(itemId) ||
    !isUuid(depositId) ||
    !isUuid(creatorId) ||
    !clientRequestId ||
    !status
  ) {
    return {
      success: false,

      reason: "Creator wallet refund metadata is invalid.",
    };
  }

  const itemResult = await client.query(
    `
        SELECT
          i.*,

          r.creator_id
            AS request_creator_id,

          r.currency
            AS request_currency,

          r.client_request_id,

          d.creator_id
            AS deposit_creator_id

        FROM creator_wallet_refund_items i

        JOIN creator_wallet_refund_requests r
          ON r.id =
            i.refund_request_id

        JOIN creator_wallet_deposits d
          ON d.id =
            i.deposit_id

        WHERE i.id =
          $1::uuid

          AND i.refund_request_id =
            $2::uuid

          AND i.deposit_id =
            $3::uuid

          AND r.creator_id =
            $4::uuid

        LIMIT 1

        FOR UPDATE OF i, r, d
      `,
    [itemId, requestId, depositId, creatorId],
  );

  const item = itemResult.rows[0];

  if (!item) {
    return {
      success: false,

      reason: "Creator wallet refund item was not found.",
    };
  }

  const paymentIntentId = getStripeObjectId(refund.payment_intent);

  const expectedCents = moneyToCents(item.amount);

  const providerCents = Number(refund.amount);

  const metadataCents = Number(metadata.amount_cents);

  const currency = String(refund.currency || "").toLowerCase();

  if (
    item.payment_provider !== "stripe" ||
    item.request_creator_id !== creatorId ||
    item.deposit_creator_id !== creatorId ||
    item.client_request_id !== clientRequestId ||
    (item.provider_refund_id && item.provider_refund_id !== refundId) ||
    paymentIntentId !== item.provider_payment_id ||
    !Number.isSafeInteger(expectedCents) ||
    expectedCents <= 0 ||
    providerCents !== expectedCents ||
    metadataCents !== expectedCents ||
    currency !== String(item.request_currency || "usd").toLowerCase() ||
    currency !== "usd"
  ) {
    return {
      success: false,

      reason: "Stripe refund does not match internal refund records.",
    };
  }

  const failureBalanceTransactionId =
    getStripeRefundFailureBalanceTransactionId(refund);

  /*
  IMPORTANT ORDERING RULE

  Stripe event delivery is not ordered.

  The synchronous refunds.create response can also race
  refund.updated/refund.failed webhooks.

  Therefore we bind only the re_ identity here. We do NOT
  overwrite provider_status before evaluating the internal
  transition.

  This prevents:
      succeeded -> pending
      failed    -> pending
  provider-state downgrades caused by stale events.
  */
  const providerStateResult = await client.query(
    `
        WITH input AS (
          SELECT
            $1::varchar AS refund_id,
            $2::uuid AS refund_item_id
        )

        UPDATE creator_wallet_refund_items AS i

        SET
          provider_refund_id =
            COALESCE(
              i.provider_refund_id,
              input.refund_id
            ),

          last_reconciled_at =
            NOW(),

          updated_at =
            NOW()

        FROM input

        WHERE i.id =
          input.refund_item_id

          AND (
            i.provider_refund_id IS NULL
            OR i.provider_refund_id =
              input.refund_id
          )

        RETURNING i.*
      `,
    [refundId, itemId],
  );

  if (!providerStateResult.rows.length) {
    return {
      success: false,

      reason:
        "Stripe refund provider identity could not be linked safely to the refund item.",
    };
  }

  /*=======================================================
  Refund Succeeded
  =======================================================*/

  if (status === "succeeded") {
    /*
    Exact replay of a success already finalized internally.
    */
    if (item.status === "succeeded") {
      await client.query(
        `
          UPDATE creator_wallet_refund_items

          SET
            provider_status =
              'succeeded',

            provider_failure_balance_transaction_id =
              NULL,

            failure_reason =
              NULL,

            last_reconciled_at =
              NOW(),

            status_unknown_at =
              NULL,

            updated_at =
              NOW()

          WHERE id =
            $1::uuid
        `,
        [itemId],
      );

      const updatedRequest = await refreshRefundRequestStatus(
        client,
        requestId,
      );

      return {
        success: true,

        idempotent: true,

        refundRequestId: requestId,

        refundItemId: itemId,

        creatorId,

        refundId,

        refundStatus: status,

        status: updatedRequest?.status || "completed",
      };
    }

    /*
    Once an allocation has been definitively failed/cancelled
    and restored, an older success event must not charge the
    internal wallet again.
    */
    if (["failed", "cancelled"].includes(item.status)) {
      return {
        success: true,

        ignored: true,

        idempotent: true,

        reason:
          "A succeeded refund event arrived after the internal refund item had already been restored as failed or cancelled.",
      };
    }

    const amount = Number(item.amount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(
        "Creator wallet refund amount is invalid during success reconciliation.",
      );
    }

    /*
    available_balance was reduced when the refund request was
    reserved.

    Final success only:
      pending_refund_balance -= amount
      lifetime_withdrawn     += amount
    */
    const walletResult = await client.query(
      `
          UPDATE creator_wallets

          SET
            pending_refund_balance =
              pending_refund_balance -
              $1::numeric,

            lifetime_withdrawn =
              lifetime_withdrawn +
              $1::numeric,

            updated_at =
              NOW()

          WHERE creator_id =
            $2::uuid

            AND pending_refund_balance >=
              $1::numeric

          RETURNING *
        `,
      [amount, creatorId],
    );

    if (!walletResult.rows.length) {
      throw new Error("Pending creator refund balance could not be finalized.");
    }

    const completedItemResult = await client.query(
      `
          WITH input AS (
            SELECT
              $1::varchar
                AS refund_id,

              $2::uuid
                AS refund_item_id
          )

          UPDATE creator_wallet_refund_items AS i

          SET
            provider_refund_id =
              input.refund_id,

            provider_status =
              'succeeded',

            status =
              'succeeded',

            failure_reason =
              NULL,

            provider_failure_balance_transaction_id =
              NULL,

            completed_at =
              COALESCE(
                i.completed_at,
                NOW()
              ),

            failed_at =
              NULL,

            status_unknown_at =
              NULL,

            last_reconciled_at =
              NOW(),

            updated_at =
              NOW()

          FROM input

          WHERE i.id =
            input.refund_item_id

          RETURNING i.*
        `,
      [refundId, itemId],
    );

    if (!completedItemResult.rows.length) {
      throw new Error(
        "Creator wallet refund item could not be finalized as succeeded.",
      );
    }

    /*
    Successful refund transaction projection.

    provider_transaction_id = Stripe re_ ID is used as the
    durable idempotent identity.
    */
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
          $1::uuid,
          $2::uuid,
          $3::numeric,
          0,
          $3::numeric,
          'refund',
          NULL,
          'stripe',
          $4::varchar,
          $5::varchar,
          'usd',
          NOW()

        WHERE NOT EXISTS (
          SELECT 1

          FROM transactions

          WHERE transaction_type =
            'refund'

            AND payment_provider =
              'stripe'

            AND provider_transaction_id =
              $5::varchar
        )
      `,
      [creatorId, requestId, amount, paymentIntentId, refundId],
    );

    const deposit = await recomputeDepositStatus(client, depositId);

    const updatedRequest = await refreshRefundRequestStatus(client, requestId);

    return {
      success: true,

      idempotent: false,

      refundRequestId: requestId,

      refundItemId: itemId,

      depositId,

      creatorId,

      refundId,

      refundStatus: status,

      status: updatedRequest?.status || "processing",

      amount: money(amount),

      currency,

      wallet: serializeCreatorWallet(walletResult.rows[0]),

      deposit: serializeDeposit(deposit),

      refundItem: serializeRefundItem(completedItemResult.rows[0]),
    };
  }

  /*=======================================================
  Refund Failed / Canceled
  =======================================================*/

  if (status === "failed" || status === "canceled") {
    const internalStatus = status === "canceled" ? "cancelled" : "failed";

    const amount = Number(item.amount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(
        "Creator wallet refund amount is invalid during failure reconciliation.",
      );
    }

    const failureReason =
      getStripeRefundFailureReason(refund) || `Stripe refund ${status}.`;

    /*
    Exact replay of an already-restored terminal failure.
    Wallet balances are deliberately untouched.
    */
    if (["failed", "cancelled"].includes(item.status)) {
      const terminalItemResult = await client.query(
        `
            WITH input AS (
              SELECT
                $1::varchar
                  AS refund_id,

                $2::varchar
                  AS provider_status,

                $3::varchar
                  AS internal_status,

                $4::varchar
                  AS failure_balance_transaction_id,

                $5::text
                  AS failure_reason,

                $6::uuid
                  AS refund_item_id
            )

            UPDATE creator_wallet_refund_items AS i

            SET
              provider_refund_id =
                input.refund_id,

              provider_status =
                input.provider_status,

              status =
                input.internal_status,

              provider_failure_balance_transaction_id =
                input.failure_balance_transaction_id,

              failure_reason =
                input.failure_reason,

              failed_at =
                CASE
                  WHEN input.internal_status = 'failed'
                    THEN COALESCE(
                      i.failed_at,
                      NOW()
                    )

                  ELSE i.failed_at
                END,

              status_unknown_at =
                NULL,

              last_reconciled_at =
                NOW(),

              updated_at =
                NOW()

            FROM input

            WHERE i.id =
              input.refund_item_id

            RETURNING i.*
          `,
        [
          refundId,
          status,
          internalStatus,
          failureBalanceTransactionId,
          failureReason,
          itemId,
        ],
      );

      if (!terminalItemResult.rows.length) {
        throw new Error(
          "Terminal creator wallet refund item could not be reconciled.",
        );
      }

      /*
      Historical failed items from older controller versions
      may still show a positive refundable amount. Replaying
      a real failed Stripe refund also repairs that source.

      Canceled refunds are not quarantined automatically.
      */
      if (status === "failed") {
        await quarantineCreatorDepositRefundSource(client, depositId);

        await recomputeDepositStatus(client, depositId);
      }

      const updatedRequest = await refreshRefundRequestStatus(
        client,
        requestId,
      );

      return {
        success: true,

        idempotent: true,

        failed: status === "failed",

        cancelled: status === "canceled",

        refundRequestId: requestId,

        refundItemId: itemId,

        creatorId,

        refundId,

        refundStatus: status,

        status: updatedRequest?.status || "failed",

        failureReason,

        failureBalanceTransactionId,

        refundItem: serializeRefundItem(terminalItemResult.rows[0]),
      };
    }

    /*
    Stripe can report a refund failure after the application
    previously finalized the refund as successful.

    Reverse only the accounting that success finalized:
      available_balance   += amount
      lifetime_withdrawn  -= amount

    pending_refund_balance is already zero from the earlier
    success and must NOT be touched here.
    */
    if (item.status === "succeeded") {
      const walletResult = await client.query(
        `
            UPDATE creator_wallets

            SET
              available_balance =
                available_balance +
                $1::numeric,

              lifetime_withdrawn =
                lifetime_withdrawn -
                $1::numeric,

              updated_at =
                NOW()

            WHERE creator_id =
              $2::uuid

              AND lifetime_withdrawn >=
                $1::numeric

            RETURNING *
          `,
        [amount, creatorId],
      );

      if (!walletResult.rows.length) {
        throw new Error(
          "Late Stripe refund failure could not reverse creator withdrawal accounting safely.",
        );
      }

      if (status === "failed") {
        /*
        A real Stripe refund has now failed. Restore the
        creator's internal wallet value, but quarantine the
        original Stripe funding source from future automatic
        refund allocation instead of making it refundable
        again.
        */
        await quarantineCreatorDepositRefundSource(client, depositId);
      } else {
        /*
        A canceled refund did not establish that the original
        source is permanently unusable. Restore its reserved
        refundable amount.
        */
        await client.query(
          `
            UPDATE creator_wallet_deposits

            SET
              remaining_refundable_amount =
                LEAST(
                  amount,
                  remaining_refundable_amount +
                    $1::numeric
                ),

              updated_at =
                NOW()

            WHERE id =
              $2::uuid
          `,
          [amount, depositId],
        );
      }

      const failedItemResult = await client.query(
        `
            WITH input AS (
              SELECT
                $1::varchar
                  AS refund_id,

                $2::varchar
                  AS provider_status,

                $3::varchar
                  AS internal_status,

                $4::varchar
                  AS failure_balance_transaction_id,

                $5::text
                  AS failure_reason,

                $6::uuid
                  AS refund_item_id
            )

            UPDATE creator_wallet_refund_items AS i

            SET
              provider_refund_id =
                input.refund_id,

              provider_status =
                input.provider_status,

              status =
                input.internal_status,

              provider_failure_balance_transaction_id =
                input.failure_balance_transaction_id,

              failure_reason =
                input.failure_reason,

              completed_at =
                NULL,

              failed_at =
                CASE
                  WHEN input.internal_status = 'failed'
                    THEN COALESCE(
                      i.failed_at,
                      NOW()
                    )

                  ELSE i.failed_at
                END,

              status_unknown_at =
                NULL,

              last_reconciled_at =
                NOW(),

              updated_at =
                NOW()

            FROM input

            WHERE i.id =
              input.refund_item_id

            RETURNING i.*
          `,
        [
          refundId,
          status,
          internalStatus,
          failureBalanceTransactionId,
          failureReason,
          itemId,
        ],
      );

      if (!failedItemResult.rows.length) {
        throw new Error(
          "Late failed creator wallet refund item could not be reconciled.",
        );
      }

      /*
      transactions represents successful financial projections.

      Remove the old success projection because Stripe has now
      definitively failed this refund.

      creator_wallet_refund_items remains the durable failed
      provider-operation audit record.
      */
      await client.query(
        `
          DELETE FROM transactions

          WHERE transaction_type =
            'refund'

            AND payment_provider =
              'stripe'

            AND provider_transaction_id =
              $1::varchar

            AND reference_id =
              $2::uuid
        `,
        [refundId, requestId],
      );

      const deposit = await recomputeDepositStatus(client, depositId);

      const updatedRequest = await refreshRefundRequestStatus(
        client,
        requestId,
      );

      return {
        success: true,

        idempotent: false,

        lateFailure: true,

        failed: status === "failed",

        cancelled: status === "canceled",

        fundsRestoredToWallet: true,

        refundRequestId: requestId,

        refundItemId: itemId,

        depositId,

        creatorId,

        refundId,

        refundStatus: status,

        status: updatedRequest?.status || "failed",

        failureReason,

        failureBalanceTransactionId,

        wallet: serializeCreatorWallet(walletResult.rows[0]),

        deposit: serializeDeposit(deposit),

        refundItem: serializeRefundItem(failedItemResult.rows[0]),
      };
    }

    /*
    Failure before success finalization.

    Money is still reserved in pending_refund_balance.

    Restore:
      available_balance      += amount
      pending_refund_balance -= amount
    */
    const walletResult = await client.query(
      `
          UPDATE creator_wallets

          SET
            available_balance =
              available_balance +
              $1::numeric,

            pending_refund_balance =
              pending_refund_balance -
              $1::numeric,

            updated_at =
              NOW()

          WHERE creator_id =
            $2::uuid

            AND pending_refund_balance >=
              $1::numeric

          RETURNING *
        `,
      [amount, creatorId],
    );

    if (!walletResult.rows.length) {
      throw new Error("Failed creator refund could not be restored.");
    }

    if (status === "failed") {
      /*
      Stripe produced a real refund object and that refund
      definitively failed.

      Restore the creator's internal wallet reservation, but
      do not put this original Stripe source back into the
      automatic refundable FIFO pool.
      */
      await quarantineCreatorDepositRefundSource(client, depositId);
    } else {
      /*
      A canceled refund does not by itself prove that the
      original funding source is unusable. Restore its
      refundable allocation.
      */
      await client.query(
        `
          UPDATE creator_wallet_deposits

          SET
            remaining_refundable_amount =
              LEAST(
                amount,
                remaining_refundable_amount +
                  $1::numeric
              ),

            updated_at =
              NOW()

          WHERE id =
            $2::uuid
        `,
        [amount, depositId],
      );
    }

    const failedItemResult = await client.query(
      `
          WITH input AS (
            SELECT
              $1::varchar
                AS refund_id,

              $2::varchar
                AS provider_status,

              $3::varchar
                AS internal_status,

              $4::varchar
                AS failure_balance_transaction_id,

              $5::text
                AS failure_reason,

              $6::uuid
                AS refund_item_id
          )

          UPDATE creator_wallet_refund_items AS i

          SET
            provider_refund_id =
              input.refund_id,

            provider_status =
              input.provider_status,

            status =
              input.internal_status,

            provider_failure_balance_transaction_id =
              input.failure_balance_transaction_id,

            failure_reason =
              input.failure_reason,

            completed_at =
              NULL,

            failed_at =
              CASE
                WHEN input.internal_status = 'failed'
                  THEN COALESCE(
                    i.failed_at,
                    NOW()
                  )

                ELSE i.failed_at
              END,

            status_unknown_at =
              NULL,

            last_reconciled_at =
              NOW(),

            updated_at =
              NOW()

          FROM input

          WHERE i.id =
            input.refund_item_id

          RETURNING i.*
        `,
      [
        refundId,
        status,
        internalStatus,
        failureBalanceTransactionId,
        failureReason,
        itemId,
      ],
    );

    if (!failedItemResult.rows.length) {
      throw new Error(
        "Failed creator wallet refund item could not be reconciled.",
      );
    }

    const deposit = await recomputeDepositStatus(client, depositId);

    const updatedRequest = await refreshRefundRequestStatus(client, requestId);

    return {
      success: true,

      idempotent: false,

      failed: status === "failed",

      cancelled: status === "canceled",

      fundsRestoredToWallet: true,

      refundRequestId: requestId,

      refundItemId: itemId,

      depositId,

      creatorId,

      refundId,

      refundStatus: status,

      status: updatedRequest?.status || "failed",

      failureReason,

      failureBalanceTransactionId,

      wallet: serializeCreatorWallet(walletResult.rows[0]),

      deposit: serializeDeposit(deposit),

      refundItem: serializeRefundItem(failedItemResult.rows[0]),
    };
  }

  /*=======================================================
  Refund Pending / Requires Action
  =======================================================*/

  /*
  A stale non-terminal event after a terminal local state must
  not downgrade either the internal status or provider_status.
  */
  if (REFUND_TERMINAL_STATUSES.has(item.status)) {
    return {
      success: true,

      ignored: true,

      idempotent: true,

      reason:
        "A non-terminal Stripe refund event arrived after a terminal internal state.",
    };
  }

  const processingItemResult = await client.query(
    `
        WITH input AS (
          SELECT
            $1::varchar
              AS refund_id,

            $2::varchar
              AS provider_status,

            $3::text
              AS failure_reason,

            $4::uuid
              AS refund_item_id
        )

        UPDATE creator_wallet_refund_items AS i

        SET
          provider_refund_id =
            input.refund_id,

          provider_status =
            input.provider_status,

          status =
            'processing',

          failure_reason =
            input.failure_reason,

          status_unknown_at =
            NULL,

          last_reconciled_at =
            NOW(),

          processing_at =
            COALESCE(
              i.processing_at,
              NOW()
            ),

          updated_at =
            NOW()

        FROM input

        WHERE i.id =
          input.refund_item_id

        RETURNING i.*
      `,
    [refundId, status, getStripeRefundFailureReason(refund), itemId],
  );

  if (!processingItemResult.rows.length) {
    throw new Error(
      "Processing creator wallet refund item could not be reconciled.",
    );
  }

  const updatedRequest = await refreshRefundRequestStatus(client, requestId);

  return {
    success: true,

    idempotent: false,

    pending: true,

    refundRequestId: requestId,

    refundItemId: itemId,

    depositId,

    creatorId,

    refundId,

    refundStatus: status,

    status: updatedRequest?.status || "processing",

    refundItem: serializeRefundItem(processingItemResult.rows[0]),
  };
}

/*=========================================================
Trusted Webhook Exports

These must NOT be exposed directly as normal HTTP routes.
=========================================================*/

exports.processWalletRefundUpdatedInternal = async (refund, client) =>
  processWalletRefundStateInternal(refund, client);

exports.processWalletRefundFailedInternal = async (refund, client) =>
  processWalletRefundStateInternal(refund, client);

/*=========================================================
Stripe Metadata Purpose Constants
=========================================================*/

exports.CREATOR_WALLET_DEPOSIT_PURPOSE = "creator_wallet_deposit";

exports.CREATOR_WALLET_REFUND_PURPOSE = "creator_wallet_refund";
