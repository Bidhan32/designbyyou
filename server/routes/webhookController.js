"use strict";

/*
=========================================================
DesignByYou / FashionVision
Stripe Webhook Controller
Version 5.7
=========================================================

Version 5.7:

- Preserves P2P, wallet, refund and Connect payout handling.
- Serializes Creator subscription webhook processing.
- Retrieves CURRENT Stripe Subscription state instead of
  trusting stale customer.subscription.* snapshots.
- Protects against out-of-order subscription webhooks.
- Checkout completion links identities AND synchronizes
  current subscription state.
- Stripe network reads happen before PostgreSQL BEGIN.
=========================================================
*/

const express = require("express");
const Stripe = require("stripe");

const db = require("../config/db");

const p2pController = require("../controllers/P2PBookingController");

const designerFinanceController = require("../controllers/designerFinanceController");

const creatorFinanceController = require("../controllers/creators/creatorFinanceController");

const subscriptionController = require("../controllers/creators/subscriptionController");

const router = express.Router();

/*=========================================================
Stripe Configuration
=========================================================*/

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripeConnectWebhookSecret = String(
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET || "",
).trim();

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY is missing from the backend environment.");
}

if (!stripeWebhookSecret) {
  console.warn(
    "WARNING: STRIPE_WEBHOOK_SECRET is not configured. Stripe platform webhooks will return 503 until it is added.",
  );
}

if (!stripeConnectWebhookSecret) {
  console.warn(
    "WARNING: STRIPE_CONNECT_WEBHOOK_SECRET is not configured. Stripe Connect webhooks will return 503 until it is added.",
  );
}

const stripe = new Stripe(stripeSecretKey);

/*=========================================================
Supported Stripe Events
=========================================================*/

const PLATFORM_SUPPORTED_EVENT_TYPES = new Set([
  "payment_intent.succeeded",

  "refund.created",
  "refund.updated",
  "refund.failed",

  "checkout.session.completed",

  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",

  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

const CONNECT_SUPPORTED_EVENT_TYPES = new Set([
  "payout.created",
  "payout.updated",
  "payout.paid",
  "payout.failed",
  "payout.canceled",
]);

const SUBSCRIPTION_OBJECT_EVENT_TYPES = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

const SUBSCRIPTION_INVOICE_EVENT_TYPES = new Set([
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

/*=========================================================
Workflow Types
=========================================================*/

const WORKFLOW_TYPES = Object.freeze({
  P2P_ESCROW: "p2p_escrow",

  P2P_REFUND: "p2p_refund",

  DESIGNER_WALLET_DEPOSIT: "designer_wallet_deposit",

  CREATOR_WALLET_DEPOSIT: "creator_wallet_deposit",

  CREATOR_WALLET_REFUND: "creator_wallet_refund",

  CREATOR_SUBSCRIPTION_CHECKOUT: "creator_subscription_checkout",

  CREATOR_SUBSCRIPTION: "creator_subscription",

  CREATOR_SUBSCRIPTION_INVOICE: "creator_subscription_invoice",

  STRIPE_PAYOUT: "stripe_payout",
});

const ORDERED_CREATOR_SUBSCRIPTION_WORKFLOWS = new Set([
  WORKFLOW_TYPES.CREATOR_SUBSCRIPTION_CHECKOUT,

  WORKFLOW_TYPES.CREATOR_SUBSCRIPTION,

  WORKFLOW_TYPES.CREATOR_SUBSCRIPTION_INVOICE,
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/*=========================================================
General Helpers
=========================================================*/

async function rollbackQuietly(client) {
  if (!client) {
    return;
  }

  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error("Stripe webhook rollback failed:", rollbackError);
  }
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

function getEventObject(event) {
  return event?.data?.object || null;
}

function getObjectId(eventObject) {
  return eventObject?.id || null;
}

function getMetadata(eventObject) {
  return eventObject?.metadata || {};
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

function getProcessingReason(result) {
  return (
    result?.reason ||
    result?.message ||
    "The Stripe event could not be applied safely."
  );
}

function isRetryableProcessingResult(result) {
  return Boolean(result?.retryable);
}

/*=========================================================
Creator Subscription Ordering Helpers
=========================================================*/

function requiresOrderedCreatorSubscriptionProcessing(workflowType) {
  return ORDERED_CREATOR_SUBSCRIPTION_WORKFLOWS.has(workflowType);
}

function getInvoiceSubscriptionId(invoice) {
  return (
    getStripeObjectId(invoice?.subscription) ||
    getStripeObjectId(invoice?.parent?.subscription_details?.subscription) ||
    null
  );
}

function getCreatorSubscriptionLockIdentity(event, workflowType) {
  const eventObject = getEventObject(event);

  if (!eventObject) {
    return null;
  }

  /*
  Prefer cus_ for every workflow so Checkout,
  Subscription and Invoice events for the same billing
  relationship use the same lock.
  */

  if (workflowType === WORKFLOW_TYPES.CREATOR_SUBSCRIPTION_CHECKOUT) {
    return (
      getStripeObjectId(eventObject.customer) ||
      getStripeObjectId(eventObject.subscription) ||
      null
    );
  }

  if (workflowType === WORKFLOW_TYPES.CREATOR_SUBSCRIPTION) {
    return (
      getStripeObjectId(eventObject.customer) ||
      getStripeObjectId(eventObject.id) ||
      null
    );
  }

  if (workflowType === WORKFLOW_TYPES.CREATOR_SUBSCRIPTION_INVOICE) {
    return (
      getStripeObjectId(eventObject.customer) ||
      getInvoiceSubscriptionId(eventObject) ||
      null
    );
  }

  return null;
}

async function acquireCreatorSubscriptionLock(client, lockIdentity) {
  if (!client || !lockIdentity) {
    return false;
  }

  const result = await client.query(
    `
        SELECT
          pg_try_advisory_lock(
            hashtext($1),
            hashtext($2)
          )
            AS locked
      `,
    ["creator-subscription-sync", lockIdentity],
  );

  return result.rows[0]?.locked === true;
}

async function releaseCreatorSubscriptionLock(client, lockIdentity) {
  if (!client || !lockIdentity) {
    return;
  }

  try {
    await client.query(
      `
        SELECT
          pg_advisory_unlock(
            hashtext($1),
            hashtext($2)
          )
      `,
      ["creator-subscription-sync", lockIdentity],
    );
  } catch (error) {
    console.error("Creator subscription advisory-lock release failed:", error);
  }
}

/*=========================================================
Creator Subscription Helpers
=========================================================*/

function isCreatorSubscriptionMetadata(metadata) {
  return (
    cleanText(metadata?.transaction_purpose, 100) ===
    subscriptionController.CREATOR_SUBSCRIPTION_PURPOSE
  );
}

/*=========================================================
Stripe Payout Helpers
=========================================================*/

function normalizeStripePayoutStatus(value, fallback = "pending") {
  const status = cleanText(value, 50).toLowerCase();

  if (!status) {
    return fallback;
  }

  return status.replace(/[^a-z0-9_]+/g, "_").slice(0, 50);
}

function buildStripePayoutFailureReason(payout) {
  const failureCode = cleanText(payout?.failure_code, 100);

  const failureMessage = cleanText(payout?.failure_message, 750);

  const reason = [failureCode, failureMessage].filter(Boolean).join(": ");

  return reason || "Stripe reported that the connected-account payout failed.";
}

function buildStripePayoutCancellationReason(payout) {
  const failureCode = cleanText(payout?.failure_code, 100);

  const failureMessage = cleanText(payout?.failure_message, 750);

  const reason = [failureCode, failureMessage].filter(Boolean).join(": ");

  return (
    reason || "Stripe reported that the connected-account payout was canceled."
  );
}

/*=========================================================
Workflow Resolver
=========================================================*/

function getWorkflowType(event) {
  const eventObject = getEventObject(event);

  if (!eventObject) {
    return null;
  }

  const metadata = getMetadata(eventObject);

  if (event.type === "payment_intent.succeeded") {
    if (metadata.transaction_purpose === "p2p_escrow_deposit") {
      return WORKFLOW_TYPES.P2P_ESCROW;
    }

    if (metadata.transaction_purpose === "wallet_deposit") {
      return WORKFLOW_TYPES.DESIGNER_WALLET_DEPOSIT;
    }

    if (metadata.transaction_purpose === "creator_wallet_deposit") {
      return WORKFLOW_TYPES.CREATOR_WALLET_DEPOSIT;
    }

    return null;
  }

  if (
    event.type === "refund.created" ||
    event.type === "refund.updated" ||
    event.type === "refund.failed"
  ) {
    if (metadata.transaction_purpose === "creator_wallet_refund") {
      return WORKFLOW_TYPES.CREATOR_WALLET_REFUND;
    }

    if (metadata.booking_id) {
      return WORKFLOW_TYPES.P2P_REFUND;
    }

    return null;
  }

  if (event.type === "checkout.session.completed") {
    if (
      eventObject.object !== "checkout.session" ||
      eventObject.mode !== "subscription"
    ) {
      return null;
    }

    if (isCreatorSubscriptionMetadata(metadata)) {
      return WORKFLOW_TYPES.CREATOR_SUBSCRIPTION_CHECKOUT;
    }

    return null;
  }

  if (SUBSCRIPTION_OBJECT_EVENT_TYPES.has(event.type)) {
    if (eventObject.object !== "subscription") {
      return null;
    }

    if (isCreatorSubscriptionMetadata(metadata)) {
      return WORKFLOW_TYPES.CREATOR_SUBSCRIPTION;
    }

    return null;
  }

  if (SUBSCRIPTION_INVOICE_EVENT_TYPES.has(event.type)) {
    if (eventObject.object !== "invoice") {
      return null;
    }

    const subscriptionId = getInvoiceSubscriptionId(eventObject);

    if (subscriptionId?.startsWith("sub_")) {
      return WORKFLOW_TYPES.CREATOR_SUBSCRIPTION_INVOICE;
    }

    return null;
  }

  if (CONNECT_SUPPORTED_EVENT_TYPES.has(event.type)) {
    return WORKFLOW_TYPES.STRIPE_PAYOUT;
  }

  return null;
}

/*=========================================================
Provider Preparation
=========================================================*/

async function prepareSupportedEvent(event, workflowType) {
  if (!requiresOrderedCreatorSubscriptionProcessing(workflowType)) {
    return {};
  }

  const eventObject = getEventObject(event);

  let subscriptionId = null;

  if (workflowType === WORKFLOW_TYPES.CREATOR_SUBSCRIPTION_CHECKOUT) {
    subscriptionId = getStripeObjectId(eventObject?.subscription);
  } else if (workflowType === WORKFLOW_TYPES.CREATOR_SUBSCRIPTION) {
    subscriptionId = getStripeObjectId(eventObject?.id);
  } else if (workflowType === WORKFLOW_TYPES.CREATOR_SUBSCRIPTION_INVOICE) {
    subscriptionId = getInvoiceSubscriptionId(eventObject);
  }

  if (!subscriptionId?.startsWith("sub_")) {
    return {
      subscription: null,

      subscriptionId: subscriptionId || null,
    };
  }

  /*
  IMPORTANT:

  handleStripeWebhook() acquires the Creator subscription
  advisory lock BEFORE reaching this provider request.

  This means an old event cannot fetch/apply an older
  snapshot after a newer event has already synchronized
  the same Customer.
  */

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  return {
    subscription,

    subscriptionId,
  };
}

/*=========================================================
Webhook Event Idempotency
=========================================================*/

async function claimWebhookEvent(client, event) {
  const eventObject = getEventObject(event);

  const insertResult = await client.query(
    `
        INSERT INTO stripe_webhook_events (
          event_id,
          event_type,
          object_id,
          processing_status,
          error_message,
          received_at,
          processed_at
        )

        VALUES (
          $1,
          $2,
          $3,
          'processing',
          NULL,
          NOW(),
          NULL
        )

        ON CONFLICT (
          event_id
        )
        DO NOTHING

        RETURNING
          event_id
      `,
    [event.id, event.type, getObjectId(eventObject)],
  );

  if (insertResult.rows.length > 0) {
    return {
      claimed: true,

      existing: null,
    };
  }

  const existingResult = await client.query(
    `
        SELECT
          event_id,
          event_type,
          object_id,
          processing_status,
          error_message,
          received_at,
          processed_at

        FROM stripe_webhook_events

        WHERE event_id =
          $1

        LIMIT 1
      `,
    [event.id],
  );

  return {
    claimed: false,

    existing: existingResult.rows[0] || null,
  };
}

async function markWebhookEvent(
  client,
  eventId,
  processingStatus,
  errorMessage = null,
) {
  await client.query(
    `
      UPDATE stripe_webhook_events

      SET
        processing_status =
          $1,

        error_message =
          $2,

        processed_at =
          NOW()

      WHERE event_id =
        $3
    `,
    [processingStatus, errorMessage, eventId],
  );
}

/*=========================================================
Stripe Connect Payout Attempt Resolution
=========================================================*/

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

function isBackfilledPayoutAttempt(attempt) {
  return payoutAttemptProviderMetadata(attempt).backfilled === true;
}

function payoutAttemptAllowsMissingPreviousPayoutId(attempt) {
  return Boolean(
    Number(attempt?.attempt_number || 0) > 1 &&
    payoutAttemptProviderMetadata(attempt).allow_missing_previous_payout_id ===
      true,
  );
}

function normalizeAttemptNumber(value) {
  const attemptNumber = Number(value);

  return Number.isSafeInteger(attemptNumber) && attemptNumber > 0
    ? attemptNumber
    : null;
}

function resolveStripePayoutAttemptStatus(event, payout) {
  if (event.type === "payout.paid") {
    return "paid";
  }

  if (event.type === "payout.failed") {
    return "failed";
  }

  if (event.type === "payout.canceled") {
    return "canceled";
  }

  const stripeStatus = normalizeStripePayoutStatus(payout?.status, "");

  if (
    ["pending", "in_transit", "paid", "failed", "canceled"].includes(
      stripeStatus,
    )
  ) {
    return stripeStatus;
  }

  return "pending";
}

function payoutAttemptStatusToProviderStatus(status) {
  switch (status) {
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

    default:
      return "payout_pending";
  }
}

function payoutAttemptStatusToRequestStatus(status) {
  if (status === "paid") {
    return "completed";
  }

  if (status === "failed" || status === "canceled") {
    return "failed";
  }

  return "processing";
}

function shouldApplyPayoutAttemptTransition(currentStatus, incomingStatus) {
  const current = cleanText(currentStatus, 50).toLowerCase();

  const incoming = cleanText(incomingStatus, 50).toLowerCase();

  if (!current || current === incoming) {
    return {
      apply: current !== incoming,

      idempotent: current === incoming,

      reason:
        current === incoming
          ? "The payout attempt already has this state."
          : null,
    };
  }

  if (current === "failed") {
    return {
      apply: false,

      idempotent: true,

      reason:
        "The payout attempt is already failed and will not be downgraded by a later event.",
    };
  }

  if (current === "canceled") {
    return {
      apply: false,

      idempotent: true,

      reason:
        "The payout attempt is already canceled and will not be rewritten by a later event.",
    };
  }

  if (current === "paid") {
    if (incoming === "failed") {
      return {
        apply: true,

        idempotent: false,

        reason: null,
      };
    }

    return {
      apply: false,

      idempotent: true,

      reason:
        "The payout attempt is already paid and will not be downgraded by this event.",
    };
  }

  return {
    apply: true,

    idempotent: false,

    reason: null,
  };
}

async function queryStripePayoutAttemptByProviderPayoutId(
  client,
  payoutId,
  connectedAccountId,
) {
  const result = await client.query(
    `
        SELECT
          row_to_json(dpat)
            AS payout_attempt,

          row_to_json(dpr)
            AS payout_request,

          COALESCE(
            dpat.provider_account_id,
            dpa.provider_account_id
          )
            AS connected_account_id

        FROM designer_payout_attempts dpat

        INNER JOIN designer_payout_requests dpr
          ON dpr.id =
            dpat.payout_request_id

        LEFT JOIN designer_payout_accounts dpa
          ON dpa.id =
            dpat.payout_account_id

        WHERE
          dpat.provider =
            'stripe'

          AND
          dpat.provider_payout_id =
            $1

          AND
          dpr.provider =
            'stripe'

          AND
          dpr.payout_method =
            'stripe'

          AND
          COALESCE(
            dpat.provider_account_id,
            dpa.provider_account_id
          ) =
            $2

        LIMIT 1

        FOR UPDATE OF dpat, dpr
      `,
    [payoutId, connectedAccountId],
  );

  return result.rows[0] || null;
}

async function queryStripePayoutAttemptByMetadata(
  client,
  { payoutAttemptId, payoutRequestId, payoutId, connectedAccountId },
) {
  if (!isUuid(payoutAttemptId)) {
    return null;
  }

  const values = [payoutAttemptId, payoutId, connectedAccountId];

  const requestCondition = isUuid(payoutRequestId) ? `AND dpr.id = $4` : "";

  if (isUuid(payoutRequestId)) {
    values.push(payoutRequestId);
  }

  const result = await client.query(
    `
        SELECT
          row_to_json(dpat)
            AS payout_attempt,

          row_to_json(dpr)
            AS payout_request,

          COALESCE(
            dpat.provider_account_id,
            dpa.provider_account_id
          )
            AS connected_account_id

        FROM designer_payout_attempts dpat

        INNER JOIN designer_payout_requests dpr
          ON dpr.id =
            dpat.payout_request_id

        LEFT JOIN designer_payout_accounts dpa
          ON dpa.id =
            dpat.payout_account_id

        WHERE
          dpat.id =
            $1

          AND
          dpat.provider =
            'stripe'

          AND
          dpr.provider =
            'stripe'

          AND
          dpr.payout_method =
            'stripe'

          ${requestCondition}

          AND (
            dpat.provider_payout_id
              IS NULL

            OR

            dpat.provider_payout_id =
              $2
          )

          AND
          COALESCE(
            dpat.provider_account_id,
            dpa.provider_account_id
          ) =
            $3

        LIMIT 1

        FOR UPDATE OF dpat, dpr
      `,
    values,
  );

  return result.rows[0] || null;
}

async function findStripePayoutRequestWithoutAttempt(client, event, payout) {
  const connectedAccountId = String(event?.account || "").trim();

  const payoutId = String(payout?.id || "").trim();

  const metadata = getMetadata(payout);

  const metadataRequestId = String(metadata.payout_request_id || "").trim();

  if (!isUuid(metadataRequestId)) {
    return null;
  }

  const result = await client.query(
    `
        SELECT
          row_to_json(dpr)
            AS payout_request,

          dpa.provider_account_id
            AS connected_account_id

        FROM designer_payout_requests dpr

        INNER JOIN designer_payout_accounts dpa
          ON dpa.id =
            dpr.payout_account_id

        WHERE
          dpr.id =
            $1

          AND
          dpr.provider =
            'stripe'

          AND
          dpr.payout_method =
            'stripe'

          AND
          dpa.provider =
            'stripe'

          AND
          dpa.provider_account_id =
            $2

          AND
          dpr.provider_payout_id =
            $3

        LIMIT 1

        FOR UPDATE OF dpr
      `,
    [metadataRequestId, connectedAccountId, payoutId],
  );

  return result.rows[0] || null;
}

async function findStripePayoutAttempt(client, event, payout) {
  const connectedAccountId = String(event?.account || "").trim();

  if (!connectedAccountId.startsWith("acct_")) {
    return {
      success: false,

      reason:
        "The Stripe Connect payout event does not contain a valid connected account ID.",
    };
  }

  const payoutId = String(payout?.id || "").trim();

  if (!payoutId.startsWith("po_")) {
    return {
      success: false,

      reason: "The Stripe Connect event does not contain a valid payout ID.",
    };
  }

  const metadata = getMetadata(payout);

  const metadataRequestId = String(metadata.payout_request_id || "").trim();

  const metadataAttemptId = String(metadata.payout_attempt_id || "").trim();

  const metadataAttemptNumber = normalizeAttemptNumber(
    metadata.payout_attempt_number,
  );

  const metadataDesignerId = String(metadata.designer_id || "").trim();

  const metadataTransferId = String(metadata.transfer_id || "").trim();

  const metadataPreviousPayoutId = String(
    metadata.retry_of_payout_id || "",
  ).trim();

  const metadataTransactionPurpose = String(
    metadata.transaction_purpose || "",
  ).trim();

  const metadataPayoutProvider = String(metadata.payout_provider || "")
    .trim()
    .toLowerCase();

  let resolved = await queryStripePayoutAttemptByProviderPayoutId(
    client,

    payoutId,

    connectedAccountId,
  );

  if (!resolved && isUuid(metadataAttemptId)) {
    resolved = await queryStripePayoutAttemptByMetadata(client, {
      payoutAttemptId: metadataAttemptId,

      payoutRequestId: metadataRequestId,

      payoutId,

      connectedAccountId,
    });
  }

  if (!resolved && isUuid(metadataRequestId)) {
    const requestWithoutAttempt = await findStripePayoutRequestWithoutAttempt(
      client,

      event,

      payout,
    );

    if (requestWithoutAttempt) {
      return {
        success: false,

        retryable: true,

        reason:
          "The Stripe payout belongs to a recorded designer withdrawal, but its payout-attempt row is missing.",
      };
    }
  }

  if (!resolved) {
    return {
      success: true,

      found: false,

      connectedAccountId,

      payoutId,

      reason:
        "This connected-account payout does not belong to a recorded designer payout attempt.",
    };
  }

  const payoutAttempt = resolved.payout_attempt;

  const payoutRequest = resolved.payout_request;

  if (!payoutAttempt || !payoutRequest) {
    return {
      success: false,

      retryable: true,

      reason:
        "The payout-attempt lookup returned an incomplete internal payout record.",
    };
  }

  if (payoutAttempt.payout_request_id !== payoutRequest.id) {
    return {
      success: false,

      retryable: true,

      reason: "The payout attempt is linked to an unexpected payout request.",
    };
  }

  if (
    payoutAttempt.provider_payout_id &&
    payoutAttempt.provider_payout_id !== payoutId
  ) {
    return {
      success: false,

      reason:
        "The payout attempt is already associated with a different Stripe payout.",
    };
  }

  if (metadataRequestId && metadataRequestId !== payoutRequest.id) {
    return {
      success: false,

      reason:
        "The Stripe payout metadata does not match the recorded payout request.",
    };
  }

  if (metadataDesignerId && metadataDesignerId !== payoutRequest.designer_id) {
    return {
      success: false,

      reason:
        "The Stripe payout metadata does not match the recorded designer.",
    };
  }

  if (
    metadataTransferId &&
    payoutAttempt.provider_transfer_id &&
    metadataTransferId !== payoutAttempt.provider_transfer_id
  ) {
    return {
      success: false,

      reason:
        "The Stripe payout metadata does not match the recorded Stripe transfer.",
    };
  }

  if (
    metadataTransferId &&
    payoutRequest.provider_transaction_id &&
    metadataTransferId !== payoutRequest.provider_transaction_id
  ) {
    return {
      success: false,

      reason:
        "The Stripe payout metadata does not match the payout request's original Stripe transfer.",
    };
  }

  const backfilledAttempt = isBackfilledPayoutAttempt(payoutAttempt);

  if (!backfilledAttempt) {
    if (metadataTransactionPurpose !== "designer_bank_payout") {
      return {
        success: false,

        reason:
          "The Stripe payout metadata has an unexpected transaction purpose.",
      };
    }

    if (metadataPayoutProvider !== "stripe") {
      return {
        success: false,

        reason:
          "The Stripe payout metadata does not identify Stripe as the payout provider.",
      };
    }

    if (!isUuid(metadataAttemptId)) {
      return {
        success: false,

        reason:
          "A current Stripe payout is missing payout_attempt_id metadata.",
      };
    }

    if (metadataAttemptId !== payoutAttempt.id) {
      return {
        success: false,

        reason:
          "The Stripe payout metadata does not match the recorded payout attempt ID.",
      };
    }

    if (!metadataAttemptNumber) {
      return {
        success: false,

        reason:
          "A current Stripe payout is missing a valid payout attempt number.",
      };
    }

    if (metadataAttemptNumber !== Number(payoutAttempt.attempt_number)) {
      return {
        success: false,

        reason:
          "The Stripe payout metadata does not match the recorded payout attempt number.",
      };
    }

    const expectedPreviousPayoutId = String(
      payoutAttempt.previous_provider_payout_id || "",
    ).trim();

    const allowMissingPreviousPayoutId =
      payoutAttemptAllowsMissingPreviousPayoutId(payoutAttempt);

    if (expectedPreviousPayoutId) {
      if (metadataPreviousPayoutId !== expectedPreviousPayoutId) {
        return {
          success: false,

          reason:
            "The Stripe payout metadata does not match the previous failed/canceled payout.",
        };
      }
    } else if (metadataPreviousPayoutId) {
      return {
        success: false,

        reason:
          "The Stripe payout unexpectedly references a previous Stripe payout that is not recorded on the payout attempt.",
      };
    } else if (
      Number(payoutAttempt.attempt_number || 0) > 1 &&
      !allowMissingPreviousPayoutId
    ) {
      return {
        success: false,

        reason:
          "A replacement Stripe payout attempt is missing its recorded previous-payout linkage.",
      };
    }
  }

  const payoutAmountCents = Number(payout?.amount);

  const attemptAmountCents = Number(payoutAttempt.amount_cents);

  const requestAmountCents = Math.round(
    Number(payoutRequest.amount || 0) * 100,
  );

  if (
    !Number.isSafeInteger(payoutAmountCents) ||
    payoutAmountCents <= 0 ||
    payoutAmountCents !== attemptAmountCents ||
    payoutAmountCents !== requestAmountCents
  ) {
    return {
      success: false,

      reason:
        "The Stripe payout amount does not match the recorded payout attempt and withdrawal amount.",
    };
  }

  const payoutCurrency = String(payout?.currency || "")
    .trim()
    .toLowerCase();

  const attemptCurrency = String(payoutAttempt.currency || "usd")
    .trim()
    .toLowerCase();

  const requestCurrency = String(payoutRequest.currency || "usd")
    .trim()
    .toLowerCase();

  if (
    !payoutCurrency ||
    payoutCurrency !== attemptCurrency ||
    payoutCurrency !== requestCurrency
  ) {
    return {
      success: false,

      reason:
        "The Stripe payout currency does not match the recorded payout attempt and withdrawal currency.",
    };
  }

  return {
    success: true,

    found: true,

    connectedAccountId,

    payoutId,

    payoutAttempt,

    payoutRequest,

    backfilledAttempt,
  };
}

/*=========================================================
Stripe Connect Payout Processing
=========================================================*/

async function getLatestPayoutAttemptForRequest(client, payoutRequestId) {
  const result = await client.query(
    `
        SELECT *

        FROM designer_payout_attempts

        WHERE payout_request_id =
          $1

        ORDER BY
          attempt_number DESC,
          created_at DESC

        LIMIT 1

        FOR UPDATE
      `,
    [payoutRequestId],
  );

  return result.rows[0] || null;
}

async function updatePayoutAttemptFromStripe(
  client,
  { event, payout, payoutAttempt, payoutId, incomingStatus },
) {
  const transition = shouldApplyPayoutAttemptTransition(
    payoutAttempt.status,

    incomingStatus,
  );

  if (!transition.apply) {
    return {
      updated: false,

      idempotent: Boolean(transition.idempotent),

      payoutAttempt,

      reason: transition.reason,
    };
  }

  const failureReason =
    incomingStatus === "failed"
      ? buildStripePayoutFailureReason(payout)
      : incomingStatus === "canceled"
        ? buildStripePayoutCancellationReason(payout)
        : null;

  const failureCode =
    incomingStatus === "failed" || incomingStatus === "canceled"
      ? cleanText(payout?.failure_code, 100) || null
      : null;

  const updateResult = await client.query(
    `
        UPDATE designer_payout_attempts

        SET
          provider_payout_id =
            COALESCE(
              provider_payout_id,
              $1::varchar
            ),

          status =
            $2::varchar,

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

          provider_metadata =
            COALESCE(
              provider_metadata,
              '{}'::jsonb
            )
            ||
            jsonb_build_object(
              'last_webhook_event_id',
                $5::text,

              'last_webhook_event_type',
                $6::text,

              'last_stripe_payout_status',
                $7::text,

              'last_webhook_event_created',
                $8::bigint
            ),

          updated_at =
            NOW()

        WHERE id =
          $9::uuid

          AND
          payout_request_id =
            $10::uuid

        RETURNING *
      `,
    [
      payoutId,

      incomingStatus,

      failureCode,

      failureReason,

      event.id,

      event.type,

      cleanText(payout?.status, 50) || null,

      Number.isFinite(Number(event?.created)) ? Number(event.created) : null,

      payoutAttempt.id,

      payoutAttempt.payout_request_id,
    ],
  );

  return {
    updated: true,

    idempotent: false,

    payoutAttempt: updateResult.rows[0] || payoutAttempt,

    failureReason,
  };
}

async function markStalePaidAttemptForManualReconciliation(
  client,
  { event, payoutAttempt, latestAttempt },
) {
  const result = await client.query(
    `
        UPDATE designer_payout_attempts

        SET
          provider_metadata =
            COALESCE(
              provider_metadata,
              '{}'::jsonb
            )
            ||
            jsonb_build_object(
              'manual_reconciliation_required',
                TRUE,

              'manual_reconciliation_reason',
                'historical_attempt_paid_after_newer_attempt',

              'manual_reconciliation_event_id',
                $1::text,

              'manual_reconciliation_latest_attempt_id',
                $2::text,

              'manual_reconciliation_latest_attempt_number',
                $3::integer,

              'manual_reconciliation_detected_at',
                NOW()
            ),

          updated_at =
            NOW()

        WHERE id =
          $4::uuid

          AND
          payout_request_id =
            $5::uuid

        RETURNING *
      `,
    [
      event.id,

      latestAttempt.id,

      Number(latestAttempt.attempt_number || 0),

      payoutAttempt.id,

      payoutAttempt.payout_request_id,
    ],
  );

  return result.rows[0] || payoutAttempt;
}

async function mirrorLatestPayoutAttemptToRequest(
  client,
  { payoutRequest, payoutAttempt },
) {
  const providerStatus = payoutAttemptStatusToProviderStatus(
    payoutAttempt.status,
  );

  const requestStatus = payoutAttemptStatusToRequestStatus(
    payoutAttempt.status,
  );

  const failureReason =
    payoutAttempt.status === "failed" || payoutAttempt.status === "canceled"
      ? payoutAttempt.failure_reason || `Stripe payout ${payoutAttempt.status}.`
      : null;

  const updateResult = await client.query(
    `
        UPDATE designer_payout_requests

        SET
          provider =
            'stripe',

          provider_payout_id =
            $1::varchar,

          provider_status =
            $2::varchar,

          status =
            $3::varchar,

          failure_reason =
            $4::text,

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

          updated_at =
            NOW()

        WHERE id =
          $5::uuid

          AND
          designer_id =
            $6::uuid

        RETURNING *
      `,
    [
      payoutAttempt.provider_payout_id,

      providerStatus,

      requestStatus,

      failureReason,

      payoutRequest.id,

      payoutRequest.designer_id,
    ],
  );

  return updateResult.rows[0] || payoutRequest;
}

async function processStripePayoutEvent(event, client) {
  const payout = getEventObject(event);

  if (!payout || payout.object !== "payout") {
    return {
      success: false,

      reason: "The Stripe Connect event does not contain a payout object.",
    };
  }

  const resolved = await findStripePayoutAttempt(
    client,

    event,

    payout,
  );

  if (!resolved.success) {
    return resolved;
  }

  if (!resolved.found) {
    return {
      success: true,

      ignored: true,

      idempotent: false,

      payoutId: resolved.payoutId,

      connectedAccountId: resolved.connectedAccountId,

      reason: resolved.reason,
    };
  }

  let payoutAttempt = resolved.payoutAttempt;

  let payoutRequest = resolved.payoutRequest;

  const payoutId = resolved.payoutId;

  const connectedAccountId = resolved.connectedAccountId;

  const designerId = payoutRequest.designer_id;

  const incomingStatus = resolveStripePayoutAttemptStatus(
    event,

    payout,
  );

  const attemptUpdate = await updatePayoutAttemptFromStripe(client, {
    event,

    payout,

    payoutAttempt,

    payoutId,

    incomingStatus,
  });

  payoutAttempt = attemptUpdate.payoutAttempt;

  const latestAttempt = await getLatestPayoutAttemptForRequest(
    client,

    payoutRequest.id,
  );

  if (!latestAttempt) {
    return {
      success: false,

      retryable: true,

      reason: "The payout request no longer has a persistent payout attempt.",
    };
  }

  const isLatestAttempt = latestAttempt.id === payoutAttempt.id;

  if (!isLatestAttempt) {
    const staleAttemptPaid = payoutAttempt.status === "paid";

    if (staleAttemptPaid) {
      payoutAttempt = await markStalePaidAttemptForManualReconciliation(
        client,
        {
          event,

          payoutAttempt,

          latestAttempt,
        },
      );

      console.error(
        "CRITICAL Stripe payout reconciliation warning: an older payout attempt is paid after a newer attempt exists.",
        {
          payoutRequestId: payoutRequest.id,

          designerId,

          payoutAttemptId: payoutAttempt.id,

          payoutAttemptNumber: payoutAttempt.attempt_number,

          payoutId,

          latestAttemptId: latestAttempt.id,

          latestAttemptNumber: latestAttempt.attempt_number,

          latestPayoutId: latestAttempt.provider_payout_id || null,
        },
      );
    }

    return {
      success: true,

      idempotent: Boolean(attemptUpdate.idempotent),

      staleForRequest: true,

      manualReconciliationRequired: staleAttemptPaid,

      payoutRequestId: payoutRequest.id,

      payoutAttemptId: payoutAttempt.id,

      payoutAttemptNumber: Number(payoutAttempt.attempt_number || 0),

      designerId,

      payoutId,

      payoutStatus: payoutAttemptStatusToProviderStatus(payoutAttempt.status),

      payoutAttemptStatus: payoutAttempt.status,

      status: payoutRequest.status,

      connectedAccountId,

      fundsRestoredToWallet:
        payoutAttempt.status === "failed" || payoutAttempt.status === "canceled"
          ? false
          : null,

      failureReason: payoutAttempt.failure_reason || null,

      reason: staleAttemptPaid
        ? "A historical Stripe payout attempt is paid after a newer attempt exists. The current payout request was not overwritten and requires reconciliation."
        : "The Stripe event updated a historical payout attempt. The current payout request was not overwritten.",
    };
  }

  payoutRequest = await mirrorLatestPayoutAttemptToRequest(client, {
    payoutRequest,

    payoutAttempt,
  });

  if (!attemptUpdate.updated && attemptUpdate.reason) {
    return {
      success: true,

      idempotent: true,

      payoutRequestId: payoutRequest.id,

      payoutAttemptId: payoutAttempt.id,

      payoutAttemptNumber: Number(payoutAttempt.attempt_number || 0),

      designerId,

      payoutId,

      payoutStatus: payoutAttemptStatusToProviderStatus(payoutAttempt.status),

      payoutAttemptStatus: payoutAttempt.status,

      status: payoutRequest.status,

      connectedAccountId,

      fundsRestoredToWallet:
        payoutAttempt.status === "failed" || payoutAttempt.status === "canceled"
          ? false
          : null,

      failureReason: payoutAttempt.failure_reason || null,

      reason: attemptUpdate.reason,
    };
  }

  return {
    success: true,

    idempotent: Boolean(attemptUpdate.idempotent),

    payoutRequestId: payoutRequest.id,

    payoutAttemptId: payoutAttempt.id,

    payoutAttemptNumber: Number(payoutAttempt.attempt_number || 0),

    designerId,

    payoutId,

    payoutStatus: payoutAttemptStatusToProviderStatus(payoutAttempt.status),

    payoutAttemptStatus: payoutAttempt.status,

    status: payoutRequest.status,

    connectedAccountId,

    fundsRestoredToWallet:
      payoutAttempt.status === "failed" || payoutAttempt.status === "canceled"
        ? false
        : null,

    failureReason: payoutAttempt.failure_reason || null,
  };
}

/*=========================================================
Event Dispatcher
=========================================================*/

async function processSupportedEvent(
  event,
  workflowType,
  client,
  preparedContext = {},
) {
  const eventObject = getEventObject(event);

  /*=======================================================
  PaymentIntents
  =======================================================*/

  if (event.type === "payment_intent.succeeded") {
    if (workflowType === WORKFLOW_TYPES.P2P_ESCROW) {
      return p2pController.processEscrowLockInternal(
        eventObject,

        client,
      );
    }

    if (workflowType === WORKFLOW_TYPES.DESIGNER_WALLET_DEPOSIT) {
      return designerFinanceController.processWalletDepositInternal(
        eventObject,

        client,
      );
    }

    if (workflowType === WORKFLOW_TYPES.CREATOR_WALLET_DEPOSIT) {
      return creatorFinanceController.processWalletDepositSucceededInternal(
        eventObject,

        client,
      );
    }
  }

  /*=======================================================
  P2P Refund
  =======================================================*/

  if (workflowType === WORKFLOW_TYPES.P2P_REFUND) {
    if (event.type === "refund.created" || event.type === "refund.updated") {
      return p2pController.processRefundUpdatedInternal(
        eventObject,

        client,
      );
    }

    if (event.type === "refund.failed") {
      return p2pController.processRefundFailedInternal(
        eventObject,

        client,
      );
    }
  }

  /*=======================================================
  Creator Wallet Refund
  =======================================================*/

  if (workflowType === WORKFLOW_TYPES.CREATOR_WALLET_REFUND) {
    if (event.type === "refund.created" || event.type === "refund.updated") {
      return creatorFinanceController.processWalletRefundUpdatedInternal(
        eventObject,

        client,
      );
    }

    if (event.type === "refund.failed") {
      return creatorFinanceController.processWalletRefundFailedInternal(
        eventObject,

        client,
      );
    }
  }

  /*=======================================================
  Creator Subscription Checkout
  =======================================================*/

  if (workflowType === WORKFLOW_TYPES.CREATOR_SUBSCRIPTION_CHECKOUT) {
    const linked =
      await subscriptionController.processCheckoutSessionCompletedInternal(
        eventObject,

        client,
      );

    if (!linked?.success || linked?.ignored) {
      return linked;
    }

    const subscription = preparedContext?.subscription;

    if (!subscription || subscription.object !== "subscription") {
      return {
        success: false,

        retryable: true,

        reason:
          "The current Stripe Subscription could not be prepared after Checkout completion.",
      };
    }

    if (subscription.id !== linked.subscriptionId) {
      return {
        success: false,

        reason:
          "The prepared Stripe Subscription does not match the Checkout Session subscription.",
      };
    }

    if (getStripeObjectId(subscription.customer) !== linked.customerId) {
      return {
        success: false,

        reason:
          "The prepared Stripe Subscription customer does not match the Checkout Session customer.",
      };
    }

    if (!isCreatorSubscriptionMetadata(getMetadata(subscription))) {
      return {
        success: false,

        reason:
          "The Checkout Subscription does not belong to the Creator subscription workflow.",
      };
    }

    const applied =
      await subscriptionController.applySubscriptionObjectInternal(
        subscription,

        client,
      );

    if (!applied?.success) {
      return applied;
    }

    return {
      ...applied,

      checkoutSessionId: eventObject?.id || null,
    };
  }

  /*=======================================================
  Creator Subscription Lifecycle
  =======================================================*/

  if (workflowType === WORKFLOW_TYPES.CREATOR_SUBSCRIPTION) {
    const subscription = preparedContext?.subscription;

    if (!subscription || subscription.object !== "subscription") {
      return {
        success: false,

        retryable: true,

        reason:
          "The current Stripe Subscription could not be prepared for lifecycle reconciliation.",
      };
    }

    /*
    Do NOT apply event.data.object.

    The event may be older than another event already
    processed by this endpoint.

    The prepared object came from a fresh Stripe read
    performed while holding the per-Customer ordering lock.
    */

    if (subscription.id !== eventObject?.id) {
      return {
        success: false,

        reason:
          "The prepared Stripe Subscription does not match the webhook subscription identity.",
      };
    }

    if (!isCreatorSubscriptionMetadata(getMetadata(subscription))) {
      return {
        success: false,

        reason:
          "The current Stripe Subscription no longer belongs to the Creator subscription workflow.",
      };
    }

    const result = await subscriptionController.applySubscriptionObjectInternal(
      subscription,

      client,
    );

    if (!result?.success) {
      return result;
    }

    return {
      ...result,

      sourceSubscriptionEventType: event.type,

      sourceSubscriptionEventCreated: Number.isFinite(Number(event?.created))
        ? Number(event.created)
        : null,
    };
  }

  /*=======================================================
  Creator Subscription Invoice
  =======================================================*/

  if (workflowType === WORKFLOW_TYPES.CREATOR_SUBSCRIPTION_INVOICE) {
    const subscription = preparedContext?.subscription;

    if (!subscription || subscription.object !== "subscription") {
      return {
        success: false,

        retryable: true,

        reason:
          "The current Stripe Subscription could not be prepared for invoice reconciliation.",
      };
    }

    if (!isCreatorSubscriptionMetadata(getMetadata(subscription))) {
      return {
        success: true,

        ignored: true,

        idempotent: false,

        reason:
          "This subscription invoice does not belong to the Creator subscription workflow.",
      };
    }

    const result = await subscriptionController.applySubscriptionObjectInternal(
      subscription,

      client,
    );

    if (!result?.success) {
      return result;
    }

    return {
      ...result,

      invoiceId: eventObject?.id || null,

      invoiceEventType: event.type,
    };
  }

  /*=======================================================
  Stripe Connect Payout
  =======================================================*/

  if (workflowType === WORKFLOW_TYPES.STRIPE_PAYOUT) {
    return processStripePayoutEvent(
      event,

      client,
    );
  }

  return {
    success: false,

    reason:
      "This Stripe event is not supported by the selected financial workflow.",
  };
}

/*=========================================================
Response Builder
=========================================================*/

function buildSuccessResponse(event, workflowType, result) {
  return {
    received: true,

    handled: true,

    ignored: false,

    idempotent: Boolean(result?.idempotent),

    eventId: event.id,

    eventType: event.type,

    workflowType,

    objectId: getObjectId(getEventObject(event)),

    connectedAccountId: event?.account || result?.connectedAccountId || null,

    bookingId: result?.bookingId || null,

    bookingStatus: result?.bookingStatus || result?.status || null,

    refundId: result?.refundId || null,

    refundStatus: result?.refundStatus || null,

    refundPending: Boolean(result?.pending),

    refundFailed: Boolean(result?.failed),

    refundCancelled: Boolean(result?.cancelled),

    refundRequestId: result?.refundRequestId || null,

    refundItemId: result?.refundItemId || null,

    designerId: result?.designerId || null,

    creatorId: result?.creatorId || null,

    depositId: result?.depositId || null,

    subscriptionId: result?.subscriptionId || null,

    subscriptionCustomerId: result?.customerId || null,

    subscriptionPriceId: result?.priceId || null,

    subscriptionPlan: result?.plan || result?.configuredPlan || null,

    subscriptionStatus: result?.providerStatus || null,

    subscriptionPriceRecognized:
      result?.priceRecognized === undefined
        ? null
        : Boolean(result.priceRecognized),

    subscriptionCancelAtPeriodEnd:
      result?.cancelAtPeriodEnd === undefined
        ? null
        : Boolean(result.cancelAtPeriodEnd),

    subscriptionCurrentPeriodStart: result?.currentPeriodStart || null,

    subscriptionCurrentPeriodEnd: result?.currentPeriodEnd || null,

    invoiceId: result?.invoiceId || null,

    payoutRequestId: result?.payoutRequestId || null,

    payoutAttemptId: result?.payoutAttemptId || null,

    payoutAttemptNumber:
      result?.payoutAttemptNumber === undefined ||
      result?.payoutAttemptNumber === null
        ? null
        : Number(result.payoutAttemptNumber),

    payoutId: result?.payoutId || null,

    payoutStatus: result?.payoutStatus || null,

    payoutAttemptStatus: result?.payoutAttemptStatus || null,

    staleForRequest: Boolean(result?.staleForRequest),

    manualReconciliationRequired: Boolean(result?.manualReconciliationRequired),

    payoutFailureReason: result?.failureReason || null,

    fundsRestoredToWallet:
      result?.fundsRestoredToWallet === undefined
        ? null
        : Boolean(result.fundsRestoredToWallet),

    paymentIntentId:
      result?.paymentIntentId ||
      (event.type === "payment_intent.succeeded"
        ? getObjectId(getEventObject(event))
        : null),

    depositAmount: result?.amount ?? null,
  };
}

/*=========================================================
Shared Stripe Webhook Handler
=========================================================*/

async function handleStripeWebhook(
  req,
  res,
  {
    webhookSecret,
    supportedEventTypes,
    endpointName,
    requireConnectedAccount = false,
  },
) {
  if (!webhookSecret) {
    console.error(`${endpointName} webhook secret is not configured.`);

   return res.status(503).json({
      status: "error",

      message: `${endpointName} webhook signing secret is not configured.`,
    });
  }

  const signature = req.get("stripe-signature");

  if (!signature) {
    return res.status(400).json({
      status: "fail",

      message: "The Stripe-Signature header is missing.",
    });
  }

  /*
  Signature verification requires the untouched raw body.
  */

  if (!Buffer.isBuffer(req.body)) {
    console.error(
      `${endpointName} webhook configuration error: req.body is not a raw Buffer.`,
    );

    return res.status(500).json({
      status: "error",

      message: "Stripe webhook body parsing is misconfigured.",
    });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,

      signature,

      webhookSecret,
    );
  } catch (error) {
    console.error(
      `${endpointName} webhook signature verification failed:`,

      error.message,
    );

    return res.status(400).json({
      status: "fail",

      message: "Invalid Stripe webhook signature.",
    });
  }

  if (requireConnectedAccount && !event?.account) {
    return res.status(200).json({
      received: true,

      handled: false,

      ignored: true,

      eventId: event.id,

      eventType: event.type,

      reason:
        "This webhook endpoint only handles events from Stripe connected accounts.",
    });
  }

  if (!supportedEventTypes.has(event.type)) {
    return res.status(200).json({
      received: true,

      handled: false,

      ignored: true,

      eventId: event.id,

      eventType: event.type,

      connectedAccountId: event?.account || null,

      reason:
        "This event type is not used by the supported financial workflows.",
    });
  }

  const workflowType = getWorkflowType(event);

  if (!workflowType) {
    return res.status(200).json({
      received: true,

      handled: false,

      ignored: true,

      eventId: event.id,

      eventType: event.type,

      objectId: getObjectId(getEventObject(event)),

      connectedAccountId: event?.account || null,

      reason:
        "This Stripe event does not belong to a supported financial workflow.",
    });
  }

  let client = null;

  let preparedContext = {};

  let subscriptionLockIdentity = null;

  let subscriptionLockAcquired = false;

  try {
    /*
    SUBSCRIPTION ORDERING

    For Creator subscriptions:

    advisory lock
        ↓
    Stripe current-state read
        ↓
    PostgreSQL BEGIN
        ↓
    event claim + state apply
        ↓
    COMMIT
        ↓
    advisory unlock

    The transaction is NOT held during Stripe network I/O.
    */

    if (requiresOrderedCreatorSubscriptionProcessing(workflowType)) {
      subscriptionLockIdentity = getCreatorSubscriptionLockIdentity(
        event,

        workflowType,
      );

      if (!subscriptionLockIdentity) {
        console.error("Creator subscription webhook has no lock identity:", {
          endpointName,

          eventId: event.id,

          eventType: event.type,

          workflowType,

          objectId: getObjectId(getEventObject(event)),
        });

        return res.status(500).json({
          status: "error",

          message:
            "The Creator subscription event could not be serialized safely.",
        });
      }

      client = await db.connect();

      subscriptionLockAcquired = await acquireCreatorSubscriptionLock(
        client,

        subscriptionLockIdentity,
      );

      if (!subscriptionLockAcquired) {
        /*
        Another request is currently processing the same
        subscription/customer.

        No event claim has been written yet.

        Returning 500 lets Stripe retry this event.
        */

        return res.status(500).json({
          status: "error",

          message:
            "The Creator subscription is currently being synchronized. Stripe should retry this event.",
        });
      }
    }

    /*
    Retrieve CURRENT Stripe Subscription.

    For subscription workflows this occurs only after
    acquiring the ordering lock.
    */

    try {
      preparedContext = await prepareSupportedEvent(
        event,

        workflowType,
      );
    } catch (error) {
      console.error("Stripe webhook provider preparation failed:", {
        endpointName,

        eventId: event.id,

        eventType: event.type,

        workflowType,

        objectId: getObjectId(getEventObject(event)),

        error: error.message,
      });

      return res.status(500).json({
        status: "error",

        message:
          "The Stripe event could not be prepared safely for processing.",
      });
    }

    if (!client) {
      client = await db.connect();
    }

    await client.query("BEGIN");

    const claim = await claimWebhookEvent(
      client,

      event,
    );

    if (!claim.claimed) {
      await client.query("COMMIT");

      return res.status(200).json({
        received: true,

        handled: false,

        ignored: false,

        idempotent: true,

        duplicate: true,

        eventId: event.id,

        eventType: event.type,

        workflowType,

        objectId:
          claim.existing?.object_id || getObjectId(getEventObject(event)),

        connectedAccountId: event?.account || null,

        previousStatus: claim.existing?.processing_status || null,

        reason: "This Stripe event was already recorded.",
      });
    }

    const result = await processSupportedEvent(
      event,

      workflowType,

      client,

      preparedContext,
    );

    /*
    Retryable failure.

    ROLLBACK removes both:

    - workflow changes
    - event claim

    Stripe can retry the same event later.
    */

    if (!result?.success && isRetryableProcessingResult(result)) {
      const retryableError = new Error(getProcessingReason(result));

      retryableError.code = "RETRYABLE_STRIPE_WEBHOOK_FAILURE";

      throw retryableError;
    }

    /*
    Permanent validation rejection.
    */

    if (!result?.success) {
      const reason = getProcessingReason(result);

      await markWebhookEvent(
        client,

        event.id,

        "ignored",

        reason,
      );

      await client.query("COMMIT");

      console.error("Stripe financial event was ignored:", {
        endpointName,

        eventId: event.id,

        eventType: event.type,

        workflowType,

        objectId: getObjectId(getEventObject(event)),

        connectedAccountId: event?.account || null,

        reason,
      });

      return res.status(200).json({
        received: true,

        handled: false,

        ignored: true,

        idempotent: false,

        eventId: event.id,

        eventType: event.type,

        workflowType,

        objectId: getObjectId(getEventObject(event)),

        connectedAccountId: event?.account || null,

        reason,
      });
    }

    /*
    Deliberately ignored valid event.
    */

    if (result.ignored) {
      const reason = getProcessingReason(result);

      await markWebhookEvent(
        client,

        event.id,

        "ignored",

        reason,
      );

      await client.query("COMMIT");

      return res.status(200).json({
        received: true,

        handled: false,

        ignored: true,

        idempotent: Boolean(result.idempotent),

        eventId: event.id,

        eventType: event.type,

        workflowType,

        objectId: getObjectId(getEventObject(event)),

        connectedAccountId: event?.account || result.connectedAccountId || null,

        bookingId: result.bookingId || null,

        bookingStatus: result.bookingStatus || result.status || null,

        designerId: result.designerId || null,

        creatorId: result.creatorId || null,

        depositId: result.depositId || null,

        refundRequestId: result.refundRequestId || null,

        refundItemId: result.refundItemId || null,

        refundId: result.refundId || null,

        refundStatus: result.refundStatus || null,

        subscriptionId: result.subscriptionId || null,

        subscriptionStatus: result.providerStatus || null,

        payoutRequestId: result.payoutRequestId || null,

        payoutAttemptId: result.payoutAttemptId || null,

        payoutAttemptNumber:
          result.payoutAttemptNumber === undefined ||
          result.payoutAttemptNumber === null
            ? null
            : Number(result.payoutAttemptNumber),

        payoutId: result.payoutId || null,

        payoutStatus: result.payoutStatus || null,

        payoutAttemptStatus: result.payoutAttemptStatus || null,

        staleForRequest: Boolean(result.staleForRequest),

        manualReconciliationRequired: Boolean(
          result.manualReconciliationRequired,
        ),

        fundsRestoredToWallet:
          result.fundsRestoredToWallet === undefined
            ? null
            : Boolean(result.fundsRestoredToWallet),

        reason,
      });
    }

    await markWebhookEvent(
      client,

      event.id,

      "processed",

      null,
    );

    await client.query("COMMIT");

    return res.status(200).json(
      buildSuccessResponse(
        event,

        workflowType,

        result,
      ),
    );
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Stripe webhook processing failed:", {
      endpointName,

      eventId: event.id,

      eventType: event.type,

      workflowType,

      objectId: getObjectId(getEventObject(event)),

      connectedAccountId: event?.account || null,

      error: error.message,

      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });

    return res.status(500).json({
      status: "error",

      message: "The Stripe event could not be processed safely.",
    });
  } finally {
    if (subscriptionLockAcquired) {
      await releaseCreatorSubscriptionLock(
        client,

        subscriptionLockIdentity,
      );
    }

    client?.release();
  }
}

/*=========================================================
Platform Stripe Webhook
=========================================================*/

router.post("/stripe", async (req, res) => {
  return handleStripeWebhook(
    req,

    res,

    {
      webhookSecret: stripeWebhookSecret,

      supportedEventTypes: PLATFORM_SUPPORTED_EVENT_TYPES,

      endpointName: "Stripe platform",

      requireConnectedAccount: false,
    },
  );
});

/*=========================================================
Stripe Connect Webhook
=========================================================*/

router.post("/stripe/connect", async (req, res) => {
  return handleStripeWebhook(
    req,

    res,

    {
      webhookSecret: stripeConnectWebhookSecret,

      supportedEventTypes: CONNECT_SUPPORTED_EVENT_TYPES,

      endpointName: "Stripe Connect",

      requireConnectedAccount: true,
    },
  );
});

/*=========================================================
Export
=========================================================*/

module.exports = router;
