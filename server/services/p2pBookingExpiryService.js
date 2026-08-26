"use strict";

/*
=========================================================
DesignByYou / FashionVision
P2P Unpaid Booking Expiry Service
Version 1.1
=========================================================

Purpose:

- Find stale unpaid P2P bookings.
- Read the authoritative Stripe PaymentIntent state.
- Reconcile succeeded payments instead of expiring them.
- Support both current and validated legacy P2P metadata.
- Leave Stripe "processing" payments untouched.
- Cancel genuinely unpaid PaymentIntents.
- Cancel the corresponding local booking only after Stripe
  confirms the PaymentIntent is cancelled / not payable.
- Avoid duplicate financial reconciliation.
- Prevent multiple server instances from running the sweep
  concurrently through a PostgreSQL advisory lock.

Only these booking states are expiry candidates:

- pending
- awaiting_payment

And only when:

- escrow_locked = false
=========================================================
*/

const Stripe = require("stripe");

const db = require("../config/db");

const p2pBookingController = require("../controllers/p2pBookingController");

/*=========================================================
Stripe
=========================================================*/

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      /*
      Keep background sweeps from being held by one Stripe
      network call for an excessive amount of time.

      A failed network request is safe: the booking remains
      untouched and a later sweep retries it.
      */

      maxNetworkRetries: 1,

      timeout: 10000,
    })
  : null;

/*=========================================================
Configuration
=========================================================*/

const DEFAULT_TTL_MINUTES = 30;

const DEFAULT_BATCH_SIZE = 25;

const EXPIRABLE_BOOKING_STATUSES = Object.freeze([
  "pending",

  "awaiting_payment",
]);

const CANCELLABLE_PAYMENT_INTENT_STATUSES = new Set([
  "requires_payment_method",

  "requires_confirmation",

  "requires_action",

  "requires_capture",
]);

const STRIPE_PROCESSING_STATUS = "processing";

const STRIPE_SUCCEEDED_STATUS = "succeeded";

const STRIPE_CANCELLED_STATUS = "canceled";

const P2P_TRANSACTION_PURPOSE = "p2p_escrow_deposit";

const ESCROW_TRANSACTION_TYPE = "escrow_lock";

/*=========================================================
Environment Helpers
=========================================================*/

function readPositiveInteger(
  name,
  fallback,
  {
    min = 1,

    max = 100000,
  } = {},
) {
  const value = Number(process.env[name]);

  if (!Number.isInteger(value) || value < min || value > max) {
    return fallback;
  }

  return value;
}

function getConfig() {
  return {
    ttlMinutes: readPositiveInteger(
      "P2P_UNPAID_BOOKING_TTL_MINUTES",

      DEFAULT_TTL_MINUTES,

      {
        min: 1,

        max: 1440,
      },
    ),

    batchSize: readPositiveInteger(
      "P2P_UNPAID_BOOKING_BATCH_SIZE",

      DEFAULT_BATCH_SIZE,

      {
        min: 1,

        max: 100,
      },
    ),
  };
}

/*=========================================================
General Helpers
=========================================================*/

function getStripeClient() {
  if (!stripe) {
    throw new Error(
      "P2P booking expiry cannot run because STRIPE_SECRET_KEY is not configured.",
    );
  }

  return stripe;
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );
}

function moneyToCents(value) {
  const amount = Number(value);

  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

async function rollbackQuietly(client) {
  if (!client) {
    return;
  }

  try {
    await client.query("ROLLBACK");
  } catch {
    /*
    Preserve the original error.
    */
  }
}

function isExpirableBookingState(booking) {
  return Boolean(
    booking &&
    EXPIRABLE_BOOKING_STATUSES.includes(normalizeStatus(booking.status)) &&
    booking.escrow_locked === false,
  );
}

/*=========================================================
Find Expired Candidates
=========================================================*/

async function findExpiredCandidates(ttlMinutes, batchSize) {
  const result = await db.query(
    `
        SELECT
          id,

          creator_id,

          designer_id,

          status,

          escrow_locked,

          stripe_payment_intent_id,

          created_at

        FROM bookings

        WHERE
          status = ANY(
            $1::varchar[]
          )

          AND escrow_locked =
            FALSE

          AND created_at <=
            NOW() -
            (
              $2::int *
              INTERVAL '1 minute'
            )

        ORDER BY
          created_at ASC,

          id ASC

        LIMIT $3::int
      `,
    [EXPIRABLE_BOOKING_STATUSES, ttlMinutes, batchSize],
  );

  return result.rows;
}

/*=========================================================
Finalize Local Unpaid Booking Cancellation
=========================================================*/

async function finalizeExpiredBooking(bookingId, paymentIntentId = null) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const currentResult = await client.query(
      `
          SELECT
            id,

            status,

            escrow_locked,

            stripe_payment_intent_id

          FROM bookings

          WHERE id = $1

          FOR UPDATE
        `,
      [bookingId],
    );

    const current = currentResult.rows[0];

    if (!current) {
      await client.query("COMMIT");

      return {
        cancelled: false,

        reason: "booking_missing",
      };
    }

    /*
    Another process/webhook may have funded or advanced the
    booking after this sweep first discovered it.
    */

    if (!isExpirableBookingState(current)) {
      await client.query("COMMIT");

      return {
        cancelled: false,

        reason: "booking_no_longer_expirable",
      };
    }

    /*
    Protect against the stored PaymentIntent changing
    between candidate discovery and finalization.
    */

    if (
      paymentIntentId &&
      current.stripe_payment_intent_id &&
      current.stripe_payment_intent_id !== paymentIntentId
    ) {
      await client.query("COMMIT");

      return {
        cancelled: false,

        reason: "payment_intent_changed",
      };
    }

    const updated = await client.query(
      `
          UPDATE bookings

          SET
            status =
              'cancelled',

            escrow_locked =
              FALSE,

            cancellation_reason =
              'Automatically cancelled because payment was not completed within the allowed time.',

            cancellation_requested_by =
              NULL,

            cancelled_at =
              COALESCE(
                cancelled_at,
                NOW()
              ),

            updated_at =
              NOW()

          WHERE id = $1

          RETURNING *
        `,
      [bookingId],
    );

    await client.query("COMMIT");

    return {
      cancelled: true,

      booking: updated.rows[0],
    };
  } catch (error) {
    await rollbackQuietly(client);

    throw error;
  } finally {
    client.release();
  }
}

/*=========================================================
Current Stripe Metadata Recognition
=========================================================*/

function hasCurrentP2PMetadata(metadata) {
  return Boolean(
    metadata &&
    isUuid(metadata.booking_id) &&
    isUuid(metadata.creator_id) &&
    isUuid(metadata.designer_id) &&
    normalizeStatus(metadata.transaction_purpose) === P2P_TRANSACTION_PURPOSE &&
    metadata.booking_type &&
    metadata.base_price_cents !== undefined &&
    metadata.connection_fee_cents !== undefined &&
    metadata.total_charge_cents !== undefined,
  );
}

/*=========================================================
Legacy Stripe Metadata Recognition
=========================================================

Legacy P2P PaymentIntents used:

sender_id
receiver_id
booking_id
transaction_purpose

Some later legacy records additionally used:

base_price
platform_fee

They did not contain modern fields such as:

creator_id
designer_id
client_request_id
booking_type
base_price_cents
connection_fee_cents
total_charge_cents
=========================================================*/

function hasLegacyP2PMetadata(metadata) {
  return Boolean(
    metadata &&
    isUuid(metadata.booking_id) &&
    isUuid(metadata.sender_id) &&
    isUuid(metadata.receiver_id) &&
    normalizeStatus(metadata.transaction_purpose) === P2P_TRANSACTION_PURPOSE,
  );
}

/*=========================================================
Legacy Metadata Normalization
=========================================================*/

function normalizeLegacySucceededPaymentIntent(paymentIntent, booking) {
  const metadata = paymentIntent?.metadata || {};

  if (!hasLegacyP2PMetadata(metadata)) {
    throw new Error(
      "The succeeded Stripe payment does not contain a supported legacy P2P metadata format.",
    );
  }

  if (!booking || !isUuid(booking.id)) {
    throw new Error("The legacy P2P booking context is invalid.");
  }

  /*
  Verify the old Stripe metadata against PostgreSQL.

  The database remains authoritative for participant
  identities and booking price.
  */

  if (metadata.booking_id !== booking.id) {
    throw new Error(
      "Legacy Stripe booking metadata does not match the booking.",
    );
  }

  if (metadata.sender_id !== booking.creator_id) {
    throw new Error(
      "Legacy Stripe sender metadata does not match the booking creator.",
    );
  }

  if (metadata.receiver_id !== booking.designer_id) {
    throw new Error(
      "Legacy Stripe receiver metadata does not match the booking designer.",
    );
  }

  if (String(paymentIntent.currency || "").toLowerCase() !== "usd") {
    throw new Error("Legacy P2P reconciliation only supports USD payments.");
  }

  if (paymentIntent.status !== STRIPE_SUCCEEDED_STATUS) {
    throw new Error(
      "Legacy metadata normalization requires a succeeded payment.",
    );
  }

  const baseCents = moneyToCents(booking.agreed_price);

  const intentAmountCents = Number(paymentIntent.amount);

  const receivedCents = Number(paymentIntent.amount_received);

  if (!Number.isInteger(baseCents) || baseCents <= 0) {
    throw new Error("The legacy booking contains an invalid agreed price.");
  }

  if (!Number.isInteger(intentAmountCents) || intentAmountCents <= 0) {
    throw new Error("The legacy Stripe PaymentIntent amount is invalid.");
  }

  if (!Number.isInteger(receivedCents) || receivedCents <= 0) {
    throw new Error("The legacy Stripe received amount is invalid.");
  }

  /*
  Current escrow reconciliation requires the PaymentIntent
  amount and amount_received to represent the same complete
  charge.

  If they differ, automatic legacy normalization is refused
  rather than guessing.
  */

  if (intentAmountCents !== receivedCents) {
    throw new Error(
      "The legacy Stripe PaymentIntent amount and received amount do not match.",
    );
  }

  /*
  Stripe must have received at least the agreed Designer
  amount.

  Any amount above the agreed price is interpreted as the
  historical Creator-side connection/platform fee.
  */

  if (receivedCents < baseCents) {
    throw new Error(
      "The legacy Stripe payment is lower than the booking's agreed price.",
    );
  }

  const connectionFeeCents = receivedCents - baseCents;

  /*
  Some intermediate legacy versions stored dollar-based:

  base_price
  platform_fee

  Validate these when present.

  They are NOT required because older legacy records do not
  contain them.
  */

  if (metadata.base_price !== undefined && metadata.base_price !== "") {
    const legacyBaseCents = moneyToCents(metadata.base_price);

    if (legacyBaseCents !== baseCents) {
      throw new Error(
        "Legacy Stripe base_price metadata does not match the booking.",
      );
    }
  }

  if (metadata.platform_fee !== undefined && metadata.platform_fee !== "") {
    const legacyFeeCents = moneyToCents(metadata.platform_fee);

    if (legacyFeeCents !== connectionFeeCents) {
      throw new Error(
        "Legacy Stripe platform_fee metadata does not match the derived connection fee.",
      );
    }
  }

  /*
  Build a NORMALIZED IN-MEMORY PaymentIntent.

  IMPORTANT:

  This does NOT modify the Stripe PaymentIntent.

  These normalized metadata fields are used only when
  calling the existing authoritative P2P escrow
  reconciliation function.
  */

  return {
    ...paymentIntent,

    metadata: {
      ...metadata,

      booking_id: booking.id,

      creator_id: booking.creator_id,

      designer_id: booking.designer_id,

      booking_type: booking.booking_type || "commission",

      base_price_cents: String(baseCents),

      connection_fee_cents: String(connectionFeeCents),

      total_charge_cents: String(receivedCents),

      transaction_purpose: P2P_TRANSACTION_PURPOSE,

      ...(booking.client_request_id
        ? {
            client_request_id: booking.client_request_id,
          }
        : {}),
    },
  };
}

/*=========================================================
Succeeded Payment Reconciliation Safety Checks
=========================================================*/

async function loadBookingAndLedgerForSucceededPayment(client, paymentIntent) {
  const bookingId = paymentIntent?.metadata?.booking_id;

  if (!isUuid(bookingId)) {
    throw new Error(
      "The succeeded Stripe payment does not contain a valid booking_id.",
    );
  }

  /*
  Lock the booking before inspecting its ledger.

  This prevents a webhook and expiry worker from
  concurrently crediting the same booking.
  */

  const bookingResult = await client.query(
    `
        SELECT *

        FROM bookings

        WHERE id = $1

        FOR UPDATE
      `,
    [bookingId],
  );

  const booking = bookingResult.rows[0];

  if (!booking) {
    throw new Error("The booking referenced by Stripe was not found.");
  }

  if (
    booking.stripe_payment_intent_id &&
    booking.stripe_payment_intent_id !== paymentIntent.id
  ) {
    throw new Error("The Stripe PaymentIntent does not match this booking.");
  }

  /*
  Search both by Stripe PaymentIntent and by booking
  reference.

  This handles both modern and older ledger layouts.
  */

  const transactionResult = await client.query(
    `
        SELECT
          id,

          reference_id,

          transaction_type,

          stripe_payment_intent_id

        FROM transactions

        WHERE
          (
            stripe_payment_intent_id =
              $1
          )

          OR

          (
            reference_id =
              $2

            AND transaction_type =
              $3
          )

        LIMIT 1
      `,
    [paymentIntent.id, booking.id, ESCROW_TRANSACTION_TYPE],
  );

  return {
    booking,

    existingEscrowTransaction: transactionResult.rows[0] || null,
  };
}

/*=========================================================
Reconcile Payment That Already Succeeded
=========================================================*/

async function reconcileSucceededPayment(paymentIntent) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const {
      booking,

      existingEscrowTransaction,
    } = await loadBookingAndLedgerForSucceededPayment(
      client,

      paymentIntent,
    );

    /*
    Another webhook/process may have completed reconciliation
    after candidate discovery.

    Because the booking is now locked and escrow_locked is
    already true, do NOT run the crediting logic again.

    Confirm that a ledger row exists and treat the payment as
    already reconciled.
    */

    if (booking.escrow_locked === true) {
      if (!existingEscrowTransaction) {
        await rollbackQuietly(client);

        throw new Error(
          "The booking is escrow-locked but no escrow transaction exists. Manual reconciliation is required.",
        );
      }

      await client.query("COMMIT");

      return {
        success: true,

        idempotent: true,

        bookingId: booking.id,

        status: booking.status,

        legacyNormalized: false,

        message: "Escrow was already reconciled by another process.",
      };
    }

    /*
    CRITICAL DUPLICATE-CREDIT PROTECTION

    If:

      escrow_locked = false

    but an escrow_lock ledger record already exists, the
    database is inconsistent.

    We MUST NOT call processEscrowLockInternal() because that
    function credits designer_wallets before its transaction
    INSERT ... ON CONFLICT.

    Calling it could double-credit the Designer.

    Leave this condition for explicit/manual reconciliation.
    */

    if (existingEscrowTransaction) {
      await rollbackQuietly(client);

      throw new Error(
        "The booking has an existing escrow transaction while escrow_locked is false. Manual reconciliation is required to prevent duplicate wallet credit.",
      );
    }

    let paymentIntentForReconciliation = paymentIntent;

    let legacyNormalized = false;

    /*
    Current metadata can go directly to the authoritative
    P2P escrow processor.

    Legacy metadata must first be verified and normalized.
    */

    if (!hasCurrentP2PMetadata(paymentIntent.metadata || {})) {
      if (!hasLegacyP2PMetadata(paymentIntent.metadata || {})) {
        await rollbackQuietly(client);

        throw new Error(
          "The succeeded Stripe payment metadata is neither current nor a supported legacy P2P format.",
        );
      }

      /*
      Legacy records are expected to predate the modern
      client_request_id flow.

      Do not reinterpret a modern booking as legacy merely
      because its Stripe metadata is malformed.
      */

      if (booking.client_request_id) {
        await rollbackQuietly(client);

        throw new Error(
          "A modern booking contains legacy Stripe metadata and requires manual review.",
        );
      }

      paymentIntentForReconciliation = normalizeLegacySucceededPaymentIntent(
        paymentIntent,

        booking,
      );

      legacyNormalized = true;
    }

    /*
    Reuse the existing authoritative financial logic.

    This handles:

    - booking state
    - escrow_locked
    - Designer pending escrow
    - transaction ledger
    - amount verification
    - participant metadata verification

    We intentionally do not create a second financial
    implementation in this worker.
    */

    const result = await p2pBookingController.processEscrowLockInternal(
      paymentIntentForReconciliation,

      client,
    );

    if (!result?.success) {
      await rollbackQuietly(client);

      throw new Error(
        result?.reason ||
          "A succeeded P2P payment could not be reconciled during expiry processing.",
      );
    }

    await client.query("COMMIT");

    return {
      ...result,

      legacyNormalized,
    };
  } catch (error) {
    await rollbackQuietly(client);

    throw error;
  } finally {
    client.release();
  }
}

/*=========================================================
Cancel Stripe PaymentIntent
=========================================================*/

async function cancelPaymentIntentForExpiry(paymentIntent) {
  const stripeClient = getStripeClient();

  /*
  Already cancelled is safe to finalize locally.
  */

  if (paymentIntent.status === STRIPE_CANCELLED_STATUS) {
    return {
      outcome: STRIPE_CANCELLED_STATUS,

      paymentIntent,
    };
  }

  /*
  Succeeded means money exists.

  NEVER expire locally.

  Reconciliation owns this state.
  */

  if (paymentIntent.status === STRIPE_SUCCEEDED_STATUS) {
    return {
      outcome: STRIPE_SUCCEEDED_STATUS,

      paymentIntent,
    };
  }

  /*
  Do not automatically cancel while Stripe is processing.

  A later sweep retries it.
  */

  if (paymentIntent.status === STRIPE_PROCESSING_STATUS) {
    return {
      outcome: STRIPE_PROCESSING_STATUS,

      paymentIntent,
    };
  }

  if (!CANCELLABLE_PAYMENT_INTENT_STATUSES.has(paymentIntent.status)) {
    return {
      outcome: "unsupported",

      paymentIntent,
    };
  }

  try {
    const cancelled = await stripeClient.paymentIntents.cancel(
      paymentIntent.id,

      {},

      {
        idempotencyKey: `p2p-booking-expiry:${paymentIntent.id}:cancel`,
      },
    );

    return {
      outcome:
        cancelled.status === STRIPE_CANCELLED_STATUS
          ? STRIPE_CANCELLED_STATUS
          : cancelled.status,

      paymentIntent: cancelled,
    };
  } catch (error) {
    /*
    Race protection:

    Stripe may have changed between retrieve() and cancel().

    Retrieve the provider state again rather than assuming
    the PaymentIntent remained unpaid.
    */

    const latest = await stripeClient.paymentIntents.retrieve(paymentIntent.id);

    if (latest.status === STRIPE_SUCCEEDED_STATUS) {
      return {
        outcome: STRIPE_SUCCEEDED_STATUS,

        paymentIntent: latest,
      };
    }

    if (latest.status === STRIPE_CANCELLED_STATUS) {
      return {
        outcome: STRIPE_CANCELLED_STATUS,

        paymentIntent: latest,
      };
    }

    if (latest.status === STRIPE_PROCESSING_STATUS) {
      return {
        outcome: STRIPE_PROCESSING_STATUS,

        paymentIntent: latest,
      };
    }

    /*
    We still cannot prove the payment is safely cancellable.

    Leave PostgreSQL untouched and retry on a later sweep.
    */

    throw error;
  }
}

/*=========================================================
Process One Expired Candidate
=========================================================*/

async function processCandidate(candidate) {
  /*
  Legacy/local unpaid booking with no Stripe PaymentIntent.

  There is no provider-side payment to cancel.
  */

  if (!candidate.stripe_payment_intent_id) {
    const finalized = await finalizeExpiredBooking(
      candidate.id,

      null,
    );

    return finalized.cancelled ? "cancelled" : "skipped";
  }

  const stripeClient = getStripeClient();

  /*
  Stripe remains the source of truth.

  A timeout/error here does NOT modify the booking.
  */

  const paymentIntent = await stripeClient.paymentIntents.retrieve(
    candidate.stripe_payment_intent_id,
  );

  /*
  Stripe already received the money.

  NEVER expire this booking.

  Reconcile escrow instead.
  */

  if (paymentIntent.status === STRIPE_SUCCEEDED_STATUS) {
    await reconcileSucceededPayment(paymentIntent);

    return "reconciled";
  }

  const cancellationResult = await cancelPaymentIntentForExpiry(paymentIntent);

  /*
  Payment succeeded during the retrieve/cancel race.
  */

  if (cancellationResult.outcome === STRIPE_SUCCEEDED_STATUS) {
    await reconcileSucceededPayment(cancellationResult.paymentIntent);

    return "reconciled";
  }

  /*
  Stripe confirms there is no payable PaymentIntent left.

  Only now may the local booking become cancelled.
  */

  if (cancellationResult.outcome === STRIPE_CANCELLED_STATUS) {
    const finalized = await finalizeExpiredBooking(
      candidate.id,

      candidate.stripe_payment_intent_id,
    );

    return finalized.cancelled ? "cancelled" : "skipped";
  }

  /*
  Stripe is still processing.

  Leave the booking unchanged and retry later.
  */

  if (cancellationResult.outcome === STRIPE_PROCESSING_STATUS) {
    return "skipped";
  }

  console.warn(
    `P2P booking expiry skipped booking ${candidate.id}: unsupported Stripe PaymentIntent status ${
      cancellationResult.paymentIntent?.status || "unknown"
    }.`,
  );

  return "skipped";
}

/*=========================================================
One Expiry Sweep
=========================================================*/

async function expireUnpaidBookingsOnce() {
  const config = getConfig();

  /*
  Session-level PostgreSQL advisory lock.

  Only one application instance is allowed to execute the
  expiry sweep at a time.

  Multiple Render/Railway/etc instances can therefore run
  the same job safely without simultaneously processing the
  same batch.
  */

  const lockClient = await db.connect();

  const summary = {
    lockAcquired: false,

    scanned: 0,

    cancelled: 0,

    reconciled: 0,

    skipped: 0,

    failed: 0,
  };

  try {
    const lockResult = await lockClient.query(
      `
          SELECT
            pg_try_advisory_lock(
              hashtext($1),
              hashtext($2)
            )
            AS locked
        `,
      ["designbyyou", "p2p-unpaid-booking-expiry"],
    );

    if (lockResult.rows[0]?.locked !== true) {
      return summary;
    }

    summary.lockAcquired = true;

    const candidates = await findExpiredCandidates(
      config.ttlMinutes,

      config.batchSize,
    );

    summary.scanned = candidates.length;

    /*
    Process sequentially.

    Financial reconciliation is intentionally not blasted
    concurrently at Stripe/PostgreSQL.
    */

    for (const candidate of candidates) {
      try {
        const outcome = await processCandidate(candidate);

        if (outcome === "cancelled") {
          summary.cancelled += 1;
        } else if (outcome === "reconciled") {
          summary.reconciled += 1;
        } else {
          summary.skipped += 1;
        }
      } catch (error) {
        summary.failed += 1;

        /*
        A failure on one booking must not cancel or corrupt
        any of the other candidates.

        The failed booking remains untouched and can be
        retried during the next sweep.
        */

        console.error(
          `P2P booking expiry failed for booking ${candidate.id}:`,

          error,
        );
      }
    }

    return summary;
  } finally {
    if (summary.lockAcquired) {
      try {
        await lockClient.query(
          `
            SELECT
              pg_advisory_unlock(
                hashtext($1),
                hashtext($2)
              )
          `,
          ["designbyyou", "p2p-unpaid-booking-expiry"],
        );
      } catch (error) {
        console.error(
          "Unable to release P2P booking expiry advisory lock:",

          error,
        );
      }
    }

    lockClient.release();
  }
}

/*=========================================================
Exports
=========================================================*/

module.exports = {
  expireUnpaidBookingsOnce,

  getP2PBookingExpiryConfig: getConfig,
};
