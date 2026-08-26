"use strict";

/*
=========================================================
DesignByYou Stripe Connect Payout Service
Marketplace Transfers and Connected-Account Bank Payouts
Version 1.3
=========================================================

Responsibilities:

1. Create exactly one Stripe Transfer for one designer
   withdrawal request.

2. Retrieve an existing Stripe Transfer.

3. Read and configure the connected account payout schedule.

4. Preserve the legacy one-request/one-payout API temporarily
   while the controller is migrated.

5. Create payout-attempt-aware Stripe Payouts where one
   withdrawal can have multiple po_ attempts but only one tr_.

6. Retrieve and validate Stripe Payout attempts using the
   metadata stored on the Stripe Payout object.

7. Centralize deterministic idempotency-key generation for
   transfers and payout attempts.

8. Enforce that a persisted payout-attempt idempotency key
   exactly matches the deterministic key derived from the
   payout request and payout attempt IDs.

9. Support a fresh payout attempt after a deterministic
   payout-creation failure where no previous po_ payout was
   ever created.

Important:

- This service does NOT modify designer wallet balances.
- This service does NOT write PostgreSQL payout-attempt rows.
- This service does NOT mark payout requests completed.
- This service does NOT store bank/card details.

The database/controller layer owns the financial state
machine. This service only validates and executes Stripe API
operations.
=========================================================
*/

const Stripe = require("stripe");

/*=========================================================
Constants
=========================================================*/

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STRIPE_ACCOUNT_PATTERN = /^acct_[A-Za-z0-9]+$/;

const STRIPE_TRANSFER_PATTERN = /^tr_[A-Za-z0-9]+$/;

const STRIPE_PAYOUT_PATTERN = /^po_[A-Za-z0-9]+$/;

const CURRENCY_PATTERN = /^[a-z]{3}$/;

/*
100,000,000 cents = $1,000,000
*/

const MAX_MONEY_CENTS = 100000000;

/*
Keep attempt counts bounded.

This is not a Stripe limit. It is an application safety
boundary against corrupted data or an accidental infinite
retry loop.
*/

const MAX_PAYOUT_ATTEMPT_NUMBER = 1000;

const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

/*=========================================================
Stripe Client
=========================================================*/

let stripeClient = null;

function getStripeClient() {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();

  if (!secretKey) {
    const error = new Error("STRIPE_SECRET_KEY is not configured.");

    error.statusCode = 500;

    error.code = "STRIPE_SECRET_KEY_MISSING";

    throw error;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

/*=========================================================
Error / String Helpers
=========================================================*/

function createValidationError(message, code) {
  const error = new Error(message);

  error.statusCode = 400;

  error.code = code;

  return error;
}

function createConflictError(message, code, details = undefined) {
  const error = new Error(message);

  error.statusCode = 409;

  error.code = code;

  if (details !== undefined) {
    error.details = details;
  }

  return error;
}

function cleanString(value, maxLength = 255) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim().slice(0, maxLength);
}

/*=========================================================
Connected Account Validation
=========================================================*/

function normalizeConnectedAccountId(value) {
  const accountId = cleanString(value, 255);

  if (!accountId || !STRIPE_ACCOUNT_PATTERN.test(accountId)) {
    throw createValidationError(
      "A valid Stripe connected account ID is required.",
      "INVALID_STRIPE_CONNECTED_ACCOUNT_ID",
    );
  }

  return accountId;
}

/*=========================================================
Transfer ID Validation
=========================================================*/

function normalizeTransferId(value) {
  const transferId = cleanString(value, 255);

  if (!transferId || !STRIPE_TRANSFER_PATTERN.test(transferId)) {
    throw createValidationError(
      "A valid Stripe transfer ID is required.",
      "INVALID_STRIPE_TRANSFER_ID",
    );
  }

  return transferId;
}

/*=========================================================
Payout ID Validation
=========================================================*/

function normalizePayoutId(value) {
  const payoutId = cleanString(value, 255);

  if (!payoutId || !STRIPE_PAYOUT_PATTERN.test(payoutId)) {
    throw createValidationError(
      "A valid Stripe payout ID is required.",
      "INVALID_STRIPE_PAYOUT_ID",
    );
  }

  return payoutId;
}

function normalizeOptionalPayoutId(value) {
  const payoutId = cleanString(value, 255);

  if (!payoutId) {
    return null;
  }

  return normalizePayoutId(payoutId);
}

/*=========================================================
UUID Validation
=========================================================*/

function normalizeUuid(value, fieldName, errorCode) {
  const normalized = cleanString(value, 64);

  if (!UUID_PATTERN.test(normalized)) {
    throw createValidationError(
      `${fieldName} must be a valid UUID.`,
      errorCode,
    );
  }

  return normalized;
}

/*=========================================================
Money Validation
=========================================================*/

function normalizeAmountCents(value) {
  const amountCents = Number(value);

  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    amountCents > MAX_MONEY_CENTS
  ) {
    throw createValidationError(
      "Amount must be a positive integer expressed in the smallest currency unit.",
      "INVALID_STRIPE_PAYOUT_AMOUNT",
    );
  }

  return amountCents;
}

/*=========================================================
Currency Validation
=========================================================*/

function normalizeCurrency(value = "usd") {
  const currency = cleanString(value || "usd", 3).toLowerCase();

  if (!CURRENCY_PATTERN.test(currency)) {
    throw createValidationError(
      "Currency must be a three-letter lowercase ISO currency code.",
      "INVALID_STRIPE_PAYOUT_CURRENCY",
    );
  }

  return currency;
}

/*=========================================================
Description Validation
=========================================================*/

function normalizeDescription(value) {
  const description = cleanString(value, 500);

  return description || null;
}

/*=========================================================
Payout Attempt Validation
=========================================================*/

function normalizeAttemptNumber(value) {
  const attemptNumber = Number(value);

  if (
    !Number.isSafeInteger(attemptNumber) ||
    attemptNumber <= 0 ||
    attemptNumber > MAX_PAYOUT_ATTEMPT_NUMBER
  ) {
    throw createValidationError(
      `Payout attempt number must be an integer between 1 and ${MAX_PAYOUT_ATTEMPT_NUMBER}.`,
      "INVALID_PAYOUT_ATTEMPT_NUMBER",
    );
  }

  return attemptNumber;
}

/*=========================================================
Idempotency Keys
=========================================================*/

function normalizeIdempotencyKey(value) {
  if (value === null || value === undefined) {
    throw createValidationError(
      "A Stripe idempotency key is required.",
      "INVALID_STRIPE_IDEMPOTENCY_KEY",
    );
  }

  const key = String(value).trim();

  if (!key) {
    throw createValidationError(
      "A Stripe idempotency key is required.",
      "INVALID_STRIPE_IDEMPOTENCY_KEY",
    );
  }

  /*
  Do not silently truncate idempotency keys.

  Truncating a key could cause the persisted local key and
  the key submitted to Stripe to stop representing the same
  logical operation.
  */

  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw createValidationError(
      `Stripe idempotency keys cannot exceed ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
      "STRIPE_IDEMPOTENCY_KEY_TOO_LONG",
    );
  }

  return key;
}

/*
One payout request gets exactly one platform -> connected
account Transfer.
*/

function buildTransferIdempotencyKey(payoutRequestId) {
  const requestId = normalizeUuid(
    payoutRequestId,
    "Payout request ID",
    "INVALID_PAYOUT_REQUEST_ID",
  );

  return normalizeIdempotencyKey(`designer-payout-transfer:${requestId}`);
}

/*
Legacy key retained while any historical/backfilled flow may
still require the old one-request/one-payout behavior.

New attempt-aware payout execution must use
buildPayoutAttemptIdempotencyKey().
*/

function buildBankPayoutIdempotencyKey(payoutRequestId) {
  const requestId = normalizeUuid(
    payoutRequestId,
    "Payout request ID",
    "INVALID_PAYOUT_REQUEST_ID",
  );

  return normalizeIdempotencyKey(`designer-bank-payout:${requestId}`);
}

/*
Each payout-attempt row receives its own immutable Stripe
idempotency key.

A genuinely new payout attempt must never reuse another
attempt's key.

The same persistent attempt may safely replay its own key
while its external result remains uncertain and while the
controller's safe replay policy permits it.
*/

function buildPayoutAttemptIdempotencyKey(payoutRequestId, payoutAttemptId) {
  const requestId = normalizeUuid(
    payoutRequestId,
    "Payout request ID",
    "INVALID_PAYOUT_REQUEST_ID",
  );

  const attemptId = normalizeUuid(
    payoutAttemptId,
    "Payout attempt ID",
    "INVALID_PAYOUT_ATTEMPT_ID",
  );

  return normalizeIdempotencyKey(
    `designer-bank-payout-attempt:${requestId}:${attemptId}`,
  );
}

/*
The payout-attempt row persists the idempotency key before
Stripe is contacted.

If the controller provides that persisted key here, it MUST
equal the deterministic key derived from the immutable
payout request ID + payout attempt ID.

This prevents an unrelated valid-looking idempotency key
from being accidentally submitted for the attempt.
*/

function resolvePayoutAttemptIdempotencyKey({
  payoutRequestId,
  payoutAttemptId,
  persistedIdempotencyKey,
}) {
  const expectedKey = buildPayoutAttemptIdempotencyKey(
    payoutRequestId,
    payoutAttemptId,
  );

  if (
    persistedIdempotencyKey !== null &&
    persistedIdempotencyKey !== undefined &&
    String(persistedIdempotencyKey).trim()
  ) {
    const normalizedPersistedKey = normalizeIdempotencyKey(
      persistedIdempotencyKey,
    );

    if (normalizedPersistedKey !== expectedKey) {
      throw createConflictError(
        "The persisted Stripe payout-attempt idempotency key does not match the payout attempt identity.",
        "PAYOUT_ATTEMPT_IDEMPOTENCY_KEY_MISMATCH",
        {
          payoutRequestId,
          payoutAttemptId,
        },
      );
    }
  }

  return expectedKey;
}

/*=========================================================
Internal Connected-Account Payout Executor
=========================================================*/

async function createConnectedAccountPayout({
  amountCents,
  connectedAccountId,
  currency,
  description,
  metadata,
  idempotencyKey,
}) {
  const stripe = getStripeClient();

  return stripe.payouts.create(
    {
      amount: normalizeAmountCents(amountCents),

      currency: normalizeCurrency(currency || "usd"),

      method: "standard",

      description:
        normalizeDescription(description) || "DesignByYou designer bank payout",

      metadata,
    },
    {
      stripeAccount: normalizeConnectedAccountId(connectedAccountId),

      idempotencyKey: normalizeIdempotencyKey(idempotencyKey),
    },
  );
}

/*=========================================================
1. Create Platform -> Connected Account Transfer
=========================================================*/

/**
 * Creates the one Stripe Transfer associated with one
 * internal designer payout request.
 *
 * The Stripe idempotency key is deterministic from the
 * payout request ID, so retries of the SAME internal payout
 * request continue to address the same logical Transfer.
 */

async function createTransfer(options = {}) {
  const stripe = getStripeClient();

  const amountCents = normalizeAmountCents(options.amountCents);

  const connectedAccountId = normalizeConnectedAccountId(
    options.connectedAccountId,
  );

  const payoutRequestId = normalizeUuid(
    options.payoutRequestId,
    "Payout request ID",
    "INVALID_PAYOUT_REQUEST_ID",
  );

  const designerId = normalizeUuid(
    options.designerId,
    "Designer ID",
    "INVALID_DESIGNER_ID",
  );

  const currency = normalizeCurrency(options.currency || "usd");

  const description =
    normalizeDescription(options.description) ||
    "DesignByYou designer withdrawal transfer";

  const idempotencyKey = buildTransferIdempotencyKey(payoutRequestId);

  return stripe.transfers.create(
    {
      amount: amountCents,

      currency,

      destination: connectedAccountId,

      description,

      metadata: {
        transaction_purpose: "designer_payout_transfer",

        payout_request_id: payoutRequestId,

        designer_id: designerId,

        payout_provider: "stripe",
      },
    },
    {
      idempotencyKey,
    },
  );
}

/*=========================================================
2. Retrieve Transfer
=========================================================*/

async function retrieveTransfer(transferId) {
  const stripe = getStripeClient();

  const normalizedTransferId = normalizeTransferId(transferId);

  return stripe.transfers.retrieve(normalizedTransferId);
}

/*=========================================================
3. Get Connected Account Payout Schedule
=========================================================*/

async function getPayoutSchedule(connectedAccountId) {
  const stripe = getStripeClient();

  const accountId = normalizeConnectedAccountId(connectedAccountId);

  const balanceSettings = await stripe.balanceSettings.retrieve(
    {},
    {
      stripeAccount: accountId,
    },
  );

  const interval =
    balanceSettings?.payments?.payouts?.schedule?.interval || null;

  return {
    connectedAccountId: accountId,

    interval,

    settings: balanceSettings,
  };
}

/*=========================================================
4. Set Connected Account to Manual Payouts
=========================================================*/

async function setManualPayoutSchedule(connectedAccountId) {
  const stripe = getStripeClient();

  const accountId = normalizeConnectedAccountId(connectedAccountId);

  const current = await getPayoutSchedule(accountId);

  if (current.interval === "manual") {
    return {
      changed: false,

      previousInterval: "manual",

      interval: "manual",

      settings: current.settings,
    };
  }

  const updatedSettings = await stripe.balanceSettings.update(
    {
      payments: {
        payouts: {
          schedule: {
            interval: "manual",
          },
        },
      },
    },
    {
      stripeAccount: accountId,
    },
  );

  const updatedInterval =
    updatedSettings?.payments?.payouts?.schedule?.interval || null;

  return {
    changed: true,

    previousInterval: current.interval,

    interval: updatedInterval,

    settings: updatedSettings,
  };
}

/*=========================================================
5. Legacy Create Connected Account -> Bank Payout
=========================================================*/

/**
 * Backward-compatible payout creator retained for
 * historical/backfilled compatibility.
 *
 * New persistent payout-attempt flows should use:
 *
 * createPayoutAttempt()
 */

async function createPayout(options = {}) {
  const amountCents = normalizeAmountCents(options.amountCents);

  const connectedAccountId = normalizeConnectedAccountId(
    options.connectedAccountId,
  );

  const payoutRequestId = normalizeUuid(
    options.payoutRequestId,
    "Payout request ID",
    "INVALID_PAYOUT_REQUEST_ID",
  );

  const designerId = normalizeUuid(
    options.designerId,
    "Designer ID",
    "INVALID_DESIGNER_ID",
  );

  const transferId = options.transferId
    ? normalizeTransferId(options.transferId)
    : null;

  const metadata = {
    transaction_purpose: "designer_bank_payout",

    payout_request_id: payoutRequestId,

    designer_id: designerId,

    payout_provider: "stripe",
  };

  if (transferId) {
    metadata.transfer_id = transferId;
  }

  return createConnectedAccountPayout({
    amountCents,

    connectedAccountId,

    currency: options.currency || "usd",

    description:
      normalizeDescription(options.description) ||
      "DesignByYou designer bank payout",

    metadata,

    idempotencyKey: buildBankPayoutIdempotencyKey(payoutRequestId),
  });
}

/*=========================================================
6. Create Payout Attempt
=========================================================*/

/**
 * Creates one Stripe po_ payout for one persistent
 * designer_payout_attempts row.
 *
 * One withdrawal request may have multiple payout attempts,
 * but every attempt continues to reference the SAME
 * original tr_ Transfer.
 *
 * Normal replacement rule:
 *
 *   failed/canceled po_ attempt
 *        ↓
 *   next attempt references previousPayoutId
 *
 * Special create-failure rule:
 *
 *   create_failed attempt
 *   (no po_ ever existed)
 *        ↓
 *   next persistent attempt
 *   new UUID + new idempotency key
 *   previousPayoutId = NULL
 *
 * The controller must explicitly set
 * allowMissingPreviousPayoutId = true for that special
 * case.
 *
 * @param {Object} options
 * @param {number} options.amountCents
 * @param {string} options.connectedAccountId
 * @param {string} options.payoutRequestId
 * @param {string} options.payoutAttemptId
 * @param {number} options.attemptNumber
 * @param {string} options.designerId
 * @param {string} options.transferId
 * @param {string} [options.previousPayoutId]
 * @param {boolean} [options.allowMissingPreviousPayoutId=false]
 * @param {string} [options.currency="usd"]
 * @param {string} [options.description]
 * @param {string} [options.idempotencyKey]
 */

async function createPayoutAttempt(options = {}) {
  const amountCents = normalizeAmountCents(options.amountCents);

  const connectedAccountId = normalizeConnectedAccountId(
    options.connectedAccountId,
  );

  const payoutRequestId = normalizeUuid(
    options.payoutRequestId,
    "Payout request ID",
    "INVALID_PAYOUT_REQUEST_ID",
  );

  const payoutAttemptId = normalizeUuid(
    options.payoutAttemptId,
    "Payout attempt ID",
    "INVALID_PAYOUT_ATTEMPT_ID",
  );

  const attemptNumber = normalizeAttemptNumber(options.attemptNumber);

  const designerId = normalizeUuid(
    options.designerId,
    "Designer ID",
    "INVALID_DESIGNER_ID",
  );

  /*
  The original Stripe Transfer is mandatory for every
  attempt-aware payout.

  Retrying a bank payout must NEVER create or imply a second
  platform -> connected-account Transfer.
  */

  const transferId = normalizeTransferId(options.transferId);

  const previousPayoutId = normalizeOptionalPayoutId(options.previousPayoutId);

  const allowMissingPreviousPayoutId =
    options.allowMissingPreviousPayoutId === true;

  /*
  Attempt #1 can never be a replacement.
  */

  if (attemptNumber === 1 && previousPayoutId) {
    throw createValidationError(
      "The first payout attempt cannot reference a previous Stripe payout.",
      "FIRST_PAYOUT_ATTEMPT_HAS_PREVIOUS_PAYOUT",
    );
  }

  if (attemptNumber === 1 && allowMissingPreviousPayoutId) {
    throw createValidationError(
      "The first payout attempt cannot use replacement-payout recovery options.",
      "FIRST_PAYOUT_ATTEMPT_INVALID_RECOVERY_MODE",
    );
  }

  /*
  For normal attempt #2+ replacements, require the previous
  failed/canceled po_ payout.

  The ONLY supported exception is a fresh attempt following
  a deterministic create_failed attempt where no po_ object
  existed at all.

  The controller must opt into that exception explicitly.
  */

  if (attemptNumber > 1 && !previousPayoutId && !allowMissingPreviousPayoutId) {
    throw createValidationError(
      "A replacement payout attempt must reference the previous failed or canceled Stripe payout unless it follows a payout-creation failure where no Stripe payout object existed.",
      "RETRY_PAYOUT_PREVIOUS_PAYOUT_REQUIRED",
    );
  }

  /*
  The idempotency key submitted to Stripe is derived from
  the immutable payout request ID + attempt ID.

  If the database supplied a persisted key, verify that it
  is EXACTLY the same key.
  */

  const idempotencyKey = resolvePayoutAttemptIdempotencyKey({
    payoutRequestId,

    payoutAttemptId,

    persistedIdempotencyKey: options.idempotencyKey,
  });

  const metadata = {
    transaction_purpose: "designer_bank_payout",

    payout_provider: "stripe",

    payout_request_id: payoutRequestId,

    payout_attempt_id: payoutAttemptId,

    payout_attempt_number: String(attemptNumber),

    designer_id: designerId,

    transfer_id: transferId,
  };

  /*
  retry_of_payout_id only exists when an actual previous
  Stripe po_ payout exists.

  A fresh attempt after create_failed intentionally omits
  this field.
  */

  if (previousPayoutId) {
    metadata.retry_of_payout_id = previousPayoutId;
  }

  return createConnectedAccountPayout({
    amountCents,

    connectedAccountId,

    currency: options.currency || "usd",

    description:
      normalizeDescription(options.description) ||
      `DesignByYou bank payout attempt ${attemptNumber}`,

    metadata,

    idempotencyKey,
  });
}

/*=========================================================
7. Retrieve Connected Account Payout
=========================================================*/

async function retrievePayout(payoutId, connectedAccountId) {
  const stripe = getStripeClient();

  const normalizedPayoutId = normalizePayoutId(payoutId);

  const accountId = normalizeConnectedAccountId(connectedAccountId);

  return stripe.payouts.retrieve(normalizedPayoutId, undefined, {
    stripeAccount: accountId,
  });
}

/*=========================================================
8. Validate Payout Attempt Metadata
=========================================================*/

function assertPayoutAttemptMetadata(payout, expected = {}) {
  if (!payout || payout.object !== "payout") {
    throw createConflictError(
      "Stripe did not return a valid payout object.",
      "INVALID_STRIPE_PAYOUT_OBJECT",
    );
  }

  const metadata = payout.metadata || {};

  const expectedPayoutRequestId = expected.payoutRequestId
    ? normalizeUuid(
        expected.payoutRequestId,
        "Payout request ID",
        "INVALID_PAYOUT_REQUEST_ID",
      )
    : null;

  const expectedPayoutAttemptId = expected.payoutAttemptId
    ? normalizeUuid(
        expected.payoutAttemptId,
        "Payout attempt ID",
        "INVALID_PAYOUT_ATTEMPT_ID",
      )
    : null;

  const expectedDesignerId = expected.designerId
    ? normalizeUuid(expected.designerId, "Designer ID", "INVALID_DESIGNER_ID")
    : null;

  const expectedTransferId = expected.transferId
    ? normalizeTransferId(expected.transferId)
    : null;

  const expectedAttemptNumber =
    expected.attemptNumber === null || expected.attemptNumber === undefined
      ? null
      : normalizeAttemptNumber(expected.attemptNumber);

  const expectedPreviousPayoutId =
    expected.previousPayoutId === null ||
    expected.previousPayoutId === undefined
      ? null
      : normalizePayoutId(expected.previousPayoutId);

  const mismatches = [];

  if (metadata.transaction_purpose !== "designer_bank_payout") {
    mismatches.push("transaction_purpose");
  }

  if (metadata.payout_provider !== "stripe") {
    mismatches.push("payout_provider");
  }

  if (
    expectedPayoutRequestId &&
    metadata.payout_request_id !== expectedPayoutRequestId
  ) {
    mismatches.push("payout_request_id");
  }

  if (
    expectedPayoutAttemptId &&
    metadata.payout_attempt_id !== expectedPayoutAttemptId
  ) {
    mismatches.push("payout_attempt_id");
  }

  if (expectedDesignerId && metadata.designer_id !== expectedDesignerId) {
    mismatches.push("designer_id");
  }

  if (expectedTransferId && metadata.transfer_id !== expectedTransferId) {
    mismatches.push("transfer_id");
  }

  if (
    expectedAttemptNumber !== null &&
    Number(metadata.payout_attempt_number) !== expectedAttemptNumber
  ) {
    mismatches.push("payout_attempt_number");
  }

  /*
  retry_of_payout_id must match exactly when expected.

  If the internal payout-attempt row says there is NO
  previous payout ID, Stripe metadata must not invent one.

  This also correctly supports a new attempt after
  create_failed:
    attempt_number > 1
    previous_provider_payout_id = NULL
    retry_of_payout_id absent
  */

  if (expectedPreviousPayoutId) {
    if (metadata.retry_of_payout_id !== expectedPreviousPayoutId) {
      mismatches.push("retry_of_payout_id");
    }
  } else if (metadata.retry_of_payout_id) {
    mismatches.push("retry_of_payout_id");
  }

  if (mismatches.length > 0) {
    throw createConflictError(
      "The Stripe payout metadata does not match the expected payout attempt.",
      "STRIPE_PAYOUT_ATTEMPT_METADATA_MISMATCH",
      {
        payoutId: payout.id || null,

        mismatches,
      },
    );
  }

  return true;
}

/*=========================================================
9. Retrieve and Validate Payout Attempt
=========================================================*/

/**
 * Retrieves a connected-account payout and validates that
 * it belongs to the expected persistent payout-attempt row.
 */

async function retrievePayoutAttempt(options = {}) {
  const connectedAccountId = normalizeConnectedAccountId(
    options.connectedAccountId,
  );

  const payoutId = normalizePayoutId(options.payoutId);

  const payout = await retrievePayout(payoutId, connectedAccountId);

  assertPayoutAttemptMetadata(payout, {
    payoutRequestId: options.payoutRequestId,

    payoutAttemptId: options.payoutAttemptId,

    attemptNumber: options.attemptNumber,

    designerId: options.designerId,

    transferId: options.transferId,

    previousPayoutId: options.previousPayoutId,
  });

  return payout;
}

/*=========================================================
Exports
=========================================================*/

module.exports = {
  /*
  Idempotency helpers are exported so the controller can
  persist exactly the same deterministic identity BEFORE
  contacting Stripe.
  */

  buildTransferIdempotencyKey,

  buildBankPayoutIdempotencyKey,

  buildPayoutAttemptIdempotencyKey,

  createTransfer,

  retrieveTransfer,

  getPayoutSchedule,

  setManualPayoutSchedule,

  /*
  Legacy method retained for historical/backfilled
  compatibility.
  */

  createPayout,

  createPayoutAttempt,

  retrievePayout,

  retrievePayoutAttempt,

  assertPayoutAttemptMetadata,
};
