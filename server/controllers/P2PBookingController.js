"use strict";

const Stripe = require("stripe");
const db = require("../config/db");

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const DEFAULT_DESIGNER_COMMISSION_RATE = 0.1;
const DEFAULT_CREATOR_CONNECTION_FEE_RATE = 0.1;
const DEFAULT_BOOKING_TIMEZONE = "Asia/Kathmandu";

function readEnvironmentRate(name, fallback) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

const DESIGNER_COMMISSION_RATE = readEnvironmentRate(
  "PLATFORM_COMMISSION_RATE",
  DEFAULT_DESIGNER_COMMISSION_RATE,
);

const CREATOR_CONNECTION_FEE_RATE = readEnvironmentRate(
  "P2P_CONNECTION_FEE_RATE",
  DEFAULT_CREATOR_CONNECTION_FEE_RATE,
);

const BOOKING_TIMEZONE = String(
  process.env.BOOKING_TIMEZONE || DEFAULT_BOOKING_TIMEZONE,
).trim();

const BOOKING_TYPES = new Set(["commission", "marketplace"]);

const BOOKING_STATUS = Object.freeze({
  PENDING: "pending",
  AWAITING_PAYMENT: "awaiting_payment",
  FUNDED: "funded",
  PROGRESS: "progress",
  REVIEW_PROTOTYPE: "review_prototype",
  FINAL_PRODUCTION: "final_production",
  REVIEW_FINAL: "review_final",
  CANCELLATION_PENDING: "cancellation_pending",
  REFUND_PENDING: "refund_pending",
  REFUND_FAILED: "refund_failed",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

const ACTIVE_SCHEDULE_STATUSES = Object.freeze([
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.FUNDED,
  BOOKING_STATUS.PROGRESS,
  BOOKING_STATUS.REVIEW_PROTOTYPE,
  BOOKING_STATUS.FINAL_PRODUCTION,
  BOOKING_STATUS.REVIEW_FINAL,
  BOOKING_STATUS.CANCELLATION_PENDING,
  BOOKING_STATUS.REFUND_PENDING,
  BOOKING_STATUS.REFUND_FAILED,
  "accepted",
  "review",
]);

const AUTOMATIC_CANCELLATION_STATUSES = new Set([
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.FUNDED,
]);

const DESIGNER_REJECTION_STATUSES = new Set([
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.FUNDED,
]);

const REFUND_PENDING_STATUSES = new Set(["pending", "requires_action"]);

const REFUND_FAILED_STATUSES = new Set(["failed", "canceled"]);

const CREATOR_PAID_ACCESS_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
]);

const CREATOR_PAID_TIERS = new Set(["monthly", "quarterly", "yearly"]);

function getStripeClient() {
  if (!stripe) {
    const error = new Error(
      "Stripe is unavailable because STRIPE_SECRET_KEY is not configured.",
    );

    error.statusCode = 503;

    throw error;
  }

  return stripe;
}

function getAuthenticatedUserId(req) {
  return req?.user?.id || null;
}

function getAuthenticatedRole(req) {
  return String(req?.user?.role || "")
    .trim()
    .toLowerCase();
}

function isAdmin(req) {
  return ["admin", "superadmin"].includes(getAuthenticatedRole(req));
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );
}

function cleanText(value, maximumLength = 10000) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function parseHttpUrl(value, maximumLength = 5000) {
  const cleaned = cleanText(value, maximumLength);

  if (!cleaned) {
    return null;
  }

  try {
    const parsed = new URL(cleaned);

    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function centsToMoney(value) {
  const cents = Number(value);

  return Number.isFinite(cents) ? Number((cents / 100).toFixed(2)) : null;
}

function moneyToCents(value) {
  const amount = Number(value);

  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

/*
=========================================================
CREATOR BOOKING REWARD POINTS
=========================================================

Rewards are based on the booking's agreed base price:

- $100.00+      -> 20 points
- $50.00-99.99  -> 10 points
- $40.00-49.99  -> 8 points
- $30.00-39.99  -> 6 points
- $20.00-29.99  -> 4 points
- $10.00-19.99  -> 2 points
- below $10.00  -> 0 points

The booking row is the idempotency source of truth via:
- creator_reward_points
- creator_reward_awarded_at
=========================================================
*/

function calculateCreatorRewardPoints(agreedPrice) {
  const priceCents = moneyToCents(agreedPrice);

  if (!Number.isInteger(priceCents) || priceCents < 0) {
    return null;
  }

  if (priceCents >= 10000) {
    return 20;
  }

  if (priceCents >= 5000) {
    return 10;
  }

  if (priceCents >= 4000) {
    return 8;
  }

  if (priceCents >= 3000) {
    return 6;
  }

  if (priceCents >= 2000) {
    return 4;
  }

  if (priceCents >= 1000) {
    return 2;
  }

  return 0;
}

async function awardCreatorRewardForCompletedBooking(client, booking) {
  if (!client || !booking) {
    throw new Error(
      "Creator reward processing requires a booking and database transaction.",
    );
  }

  if (!isUuid(booking.id) || !isUuid(booking.creator_id)) {
    throw new Error(
      "The completed booking does not contain valid creator reward identifiers.",
    );
  }

  const rewardPoints = calculateCreatorRewardPoints(booking.agreed_price);

  if (!Number.isInteger(rewardPoints) || rewardPoints < 0) {
    throw new Error(
      "The booking contains an invalid agreed price for creator rewards.",
    );
  }

  /*
  This booking UPDATE is the idempotency gate.

  Because the booking is already locked FOR UPDATE by the payout
  transaction, only the first successful transaction can set
  creator_reward_awarded_at. A retry therefore cannot increment
  creator_profiles.xp_points twice.
  */
  const markerResult = await client.query(
    `
      UPDATE bookings

      SET
        creator_reward_points =
          $1,

        creator_reward_awarded_at =
          NOW(),

        updated_at =
          NOW()

      WHERE
        id = $2

        AND status =
          $3

        AND creator_reward_awarded_at
          IS NULL

      RETURNING
        creator_reward_points,
        creator_reward_awarded_at
    `,
    [rewardPoints, booking.id, BOOKING_STATUS.COMPLETED],
  );

  if (markerResult.rows.length === 0) {
    return {
      awarded: false,
      points: 0,
      alreadyAwarded: true,
    };
  }

  /*
  A booking below $10 earns zero points, but it is still marked
  as processed so it cannot be reconsidered or awarded later.
  */
  if (rewardPoints === 0) {
    return {
      awarded: true,
      points: 0,
      totalPoints: null,
      alreadyAwarded: false,
    };
  }

  const creatorProfileResult = await client.query(
    `
      UPDATE creator_profiles

      SET
        xp_points =
          COALESCE(
            xp_points,
            0
          ) + $1,

        updated_at =
          NOW()

      WHERE user_id = $2

      RETURNING
        xp_points
    `,
    [rewardPoints, booking.creator_id],
  );

  if (creatorProfileResult.rows.length === 0) {
    throw new Error(
      "The creator profile required for booking rewards was not found.",
    );
  }

  return {
    awarded: true,
    points: rewardPoints,
    totalPoints: Number(creatorProfileResult.rows[0].xp_points),
    alreadyAwarded: false,
  };
}

function parsePositiveMoney(value) {
  const cents = moneyToCents(value);

  if (!Number.isInteger(cents) || cents <= 0) {
    return null;
  }

  return {
    cents,
    amount: centsToMoney(cents),
  };
}

function parseRequiredFutureDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    return null;
  }

  return date;
}

function parseOptionalFutureDate(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return parseRequiredFutureDate(value);
}

function normalizeBookingType(value, designId) {
  const requested = String(value || (designId ? "marketplace" : "commission"))
    .trim()
    .toLowerCase();

  return BOOKING_TYPES.has(requested) ? requested : null;
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeRate(value, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  if (number <= 1) {
    return number;
  }

  if (number <= 100) {
    return number / 100;
  }

  return fallback;
}

function isActiveSubscription(user) {
  if (!user) {
    return false;
  }

  const tier = normalizeStatus(user.subscription_tier);

  const status = normalizeStatus(user.subscription_status);

  return Boolean(
    CREATOR_PAID_TIERS.has(tier) && CREATOR_PAID_ACCESS_STATUSES.has(status),
  );
}

function isApprovedAccount(user) {
  return normalizeStatus(user?.approval_status) === "approved";
}

/*
=========================================================
NEW BOOKING DESIGNER ELIGIBILITY
=========================================================

A Designer can receive a NEW booking only when:

- role = designer
- approval_status = approved
- is_email_verified = true

Existing funded-booking recovery remains separate.
=========================================================
*/

function isEligibleDesignerForNewBooking(user) {
  return Boolean(
    user &&
    normalizeStatus(user.role) === "designer" &&
    isApprovedAccount(user) &&
    user.is_email_verified === true,
  );
}

function sendError(res, statusCode, message, code = null) {
  return res.status(statusCode).json({
    status: "error",

    ...(code
      ? {
          code,
        }
      : {}),

    message,
  });
}

async function rollbackQuietly(client) {
  if (!client) {
    return;
  }

  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve original error.
  }
}

function bookingParticipantAllowed(booking, userId) {
  return Boolean(
    booking &&
    userId &&
    (booking.creator_id === userId || booking.designer_id === userId),
  );
}

async function loadBookingForUpdate(client, bookingId) {
  const result = await client.query(
    `
        SELECT *

        FROM bookings

        WHERE id = $1

        FOR UPDATE
      `,
    [bookingId],
  );

  return result.rows[0] || null;
}

function getCalendarDateKey(date, timeZone = BOOKING_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${map.year}-${map.month}-${map.day}`;
}

function sameDateValue(left, right) {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  const leftTime = new Date(left).getTime();

  const rightTime = new Date(right).getTime();

  return Boolean(
    !Number.isNaN(leftTime) &&
    !Number.isNaN(rightTime) &&
    leftTime === rightTime,
  );
}

function paymentIntentIdFromValue(value) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id || null;
}

function refundStatusMessage(status) {
  switch (status) {
    case "succeeded":
      return "The booking was cancelled and the refund succeeded.";

    case "pending":
      return "The booking cancellation was accepted and the refund is processing.";

    case "requires_action":
      return "The refund requires additional processing before cancellation can be finalized.";

    case "failed":
      return "The refund failed and requires administrator review.";

    case "canceled":
      return "The refund was cancelled and requires administrator review.";

    default:
      return "The refund state was updated.";
  }
}

function buildPaymentSummary(booking, paymentIntent) {
  const metadata = paymentIntent?.metadata || {};

  const baseCents = Number.isInteger(Number(metadata.base_price_cents))
    ? Number(metadata.base_price_cents)
    : moneyToCents(booking.agreed_price);

  const connectionFeeCents = Number.isInteger(
    Number(metadata.connection_fee_cents),
  )
    ? Number(metadata.connection_fee_cents)
    : 0;

  const totalCents = Number.isInteger(Number(metadata.total_charge_cents))
    ? Number(metadata.total_charge_cents)
    : baseCents + connectionFeeCents;

  return {
    currency: paymentIntent?.currency || "usd",

    baseAmount: centsToMoney(baseCents),

    connectionFee: centsToMoney(connectionFeeCents),

    totalCharged: centsToMoney(totalCents),

    connectionFeeWaived: connectionFeeCents === 0,
  };
}

function bookingMatchesCreationRequest(booking, context) {
  return Boolean(
    booking.creator_id === context.creatorId &&
    booking.designer_id === context.receiverId &&
    (booking.design_id || null) === (context.designId || null) &&
    cleanText(booking.brief_text, 20000) === context.briefText &&
    moneyToCents(booking.agreed_price) === context.price.cents &&
    sameDateValue(booking.deadline, context.deadline) &&
    sameDateValue(booking.scheduled_at, context.scheduledAt) &&
    normalizeStatus(booking.booking_type) === context.bookingType,
  );
}

async function returnExistingBookingResponse(res, booking, context) {
  if (!bookingMatchesCreationRequest(booking, context)) {
    return sendError(
      res,
      409,
      "This client_request_id has already been used for a different booking request.",
      "CLIENT_REQUEST_ID_REUSED",
    );
  }

  if (!booking.stripe_payment_intent_id) {
    return sendError(
      res,
      409,
      "The existing booking does not have a Stripe PaymentIntent.",
      "BOOKING_PAYMENT_CONTEXT_MISSING",
    );
  }

  const paymentIntent = await getStripeClient().paymentIntents.retrieve(
    booking.stripe_payment_intent_id,
  );

  if (paymentIntent.status === "canceled") {
    return sendError(
      res,
      409,
      "This booking's Stripe PaymentIntent was cancelled. Start a new booking request.",
      "PAYMENT_INTENT_ALREADY_CANCELLED",
    );
  }

  /*
  Prevent idempotent retries from bypassing current
  Designer eligibility for an UNFUNDED booking.

  If payment has already succeeded or escrow is locked,
  reconciliation remains available.
  */

  if (!booking.escrow_locked && paymentIntent.status !== "succeeded") {
    const eligibilityResult = await db.query(
      `
          SELECT id

          FROM users

          WHERE
            id = $1

            AND role =
              'designer'

            AND approval_status =
              'approved'

            AND is_email_verified =
              TRUE

          LIMIT 1
        `,
      [booking.designer_id],
    );

    if (eligibilityResult.rows.length === 0) {
      await cancelPaymentIntentQuietly(paymentIntent.id);

      return sendError(
        res,
        409,
        "The selected designer is not currently available for new bookings.",
        "DESIGNER_UNAVAILABLE",
      );
    }
  }

  return res.status(200).json({
    status: "success",

    idempotent: true,

    message: "The existing booking was returned for this request.",

    booking,

    clientSecret: paymentIntent.client_secret,

    paymentIntentStatus: paymentIntent.status,

    payment: buildPaymentSummary(booking, paymentIntent),
  });
}

async function cancelPaymentIntentQuietly(paymentIntentId) {
  if (!stripe || !paymentIntentId) {
    return;
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (
      [
        "requires_payment_method",
        "requires_confirmation",
        "requires_action",
        "requires_capture",
        "processing",
      ].includes(paymentIntent.status)
    ) {
      await stripe.paymentIntents.cancel(paymentIntentId);
    }
  } catch (error) {
    console.error(
      "Unable to cancel orphaned Stripe PaymentIntent:",
      error.message,
    );
  }
}

async function reversePendingEscrowIfNecessary(client, booking) {
  if (!booking.escrow_locked) {
    return false;
  }

  const amount = centsToMoney(moneyToCents(booking.agreed_price));

  const result = await client.query(
    `
        UPDATE designer_wallets

        SET
          pending_escrow_balance =
            pending_escrow_balance -
            $1

        WHERE
          user_id = $2

          AND
          pending_escrow_balance >=
            $1

        RETURNING
          user_id
      `,
    [amount, booking.designer_id],
  );

  if (result.rows.length === 0) {
    throw new Error(
      "The pending designer wallet balance could not be reconciled.",
    );
  }

  return true;
}

async function insertRefundTransaction(client, booking, refundObject) {
  const refundedCents = Number(refundObject.amount || 0);

  const baseCents = moneyToCents(booking.agreed_price);

  const connectionFeeCents = Math.max(0, refundedCents - baseCents);

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

      SELECT
        gen_random_uuid(),
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        'refund',
        NULL,
        'stripe',
        $7,
        $8,
        NOW()

      WHERE NOT EXISTS (
        SELECT 1

        FROM transactions

        WHERE
          reference_id = $3

          AND
          transaction_type =
            'refund'
      )
    `,
    [
      booking.designer_id,
      booking.creator_id,
      booking.id,
      centsToMoney(refundedCents),
      centsToMoney(connectionFeeCents),
      centsToMoney(Math.min(baseCents, refundedCents)),
      refundObject.id,
      String(refundObject.currency || "usd").toLowerCase(),
    ],
  );
}

/*
=========================================================
REVISION RESOLUTION

A revision may now record:

- 2D file URL
- optional 3D model URL

Both are stored in project_revisions.attachments.
=========================================================
*/

async function resolveLatestRevision(client, bookingId, attachmentUrls) {
  const normalizedAttachments = Array.from(
    new Set(
      (Array.isArray(attachmentUrls) ? attachmentUrls : [attachmentUrls])
        .map((value) => parseHttpUrl(value, 5000))
        .filter(Boolean),
    ),
  );

  if (normalizedAttachments.length === 0) {
    return null;
  }

  const result = await client.query(
    `
        WITH latest_open_revision AS (
          SELECT id

          FROM project_revisions

          WHERE
            booking_id = $1

            AND status IN (
              'pending',
              'in_progress'
            )

          ORDER BY
            created_at DESC

          LIMIT 1

          FOR UPDATE
        )

        UPDATE project_revisions pr

        SET
          attachments =
            COALESCE(
              pr.attachments,
              ARRAY[]::varchar[]
            ) || $2::varchar[],

          status =
            'resolved',

          updated_at =
            NOW()

        WHERE
          pr.id IN (
            SELECT id

            FROM latest_open_revision
          )

        RETURNING
          pr.*
      `,
    [bookingId, normalizedAttachments],
  );

  return result.rows[0] || null;
}

async function processRefundStateInternal(refundObject, client) {
  if (!refundObject || !client) {
    return {
      success: false,
      reason: "Refund or database context is missing.",
    };
  }

  const refundId = refundObject.id;

  const refundStatus = normalizeStatus(refundObject.status);

  const bookingId = refundObject.metadata?.booking_id;

  const paymentIntentId = paymentIntentIdFromValue(refundObject.payment_intent);

  if (!refundId || !isUuid(bookingId)) {
    return {
      success: false,
      reason: "The refund does not contain valid booking metadata.",
    };
  }

  if (
    !["pending", "requires_action", "succeeded", "failed", "canceled"].includes(
      refundStatus,
    )
  ) {
    return {
      success: false,
      reason: `Unsupported Stripe refund status: ${refundStatus || "unknown"}.`,
    };
  }

  const booking = await loadBookingForUpdate(client, bookingId);

  if (!booking) {
    return {
      success: false,
      reason: "The booking referenced by the refund was not found.",
    };
  }

  if (
    paymentIntentId &&
    booking.stripe_payment_intent_id &&
    paymentIntentId !== booking.stripe_payment_intent_id
  ) {
    return {
      success: false,
      reason: "The Stripe payment does not match this booking.",
    };
  }

  if (booking.stripe_refund_id && booking.stripe_refund_id !== refundId) {
    return {
      success: false,
      reason:
        "The Stripe refund does not match the refund recorded for this booking.",
    };
  }

  const refundCents = Number(refundObject.amount);

  const expectedCents = Number(refundObject.metadata?.expected_refund_cents);

  if (!Number.isInteger(refundCents) || refundCents <= 0) {
    return {
      success: false,
      reason: "The Stripe refund amount is invalid.",
    };
  }

  if (Number.isInteger(expectedCents) && expectedCents !== refundCents) {
    return {
      success: false,
      reason:
        "The Stripe refund amount does not match its expected metadata amount.",
    };
  }

  const escrowResult = await client.query(
    `
        SELECT
          gross_amount

        FROM transactions

        WHERE
          reference_id = $1

          AND
          transaction_type =
            'escrow_lock'

        ORDER BY
          created_at DESC

        LIMIT 1
      `,
    [bookingId],
  );

  const escrowGrossCents = escrowResult.rows[0]
    ? moneyToCents(escrowResult.rows[0].gross_amount)
    : null;

  if (Number.isInteger(escrowGrossCents) && escrowGrossCents !== refundCents) {
    return {
      success: false,
      reason: "Only a full refund can automatically cancel this booking.",
    };
  }

  if (refundCents < moneyToCents(booking.agreed_price)) {
    return {
      success: false,
      reason: "The refund is lower than the booking's base amount.",
    };
  }

  if (
    normalizeStatus(booking.refund_status) === "succeeded" &&
    normalizeStatus(booking.status) === BOOKING_STATUS.CANCELLED &&
    booking.escrow_locked === false
  ) {
    return {
      success: true,
      idempotent: true,
      bookingId,
      refundId,
      refundStatus: "succeeded",
      bookingStatus: booking.status,
    };
  }

  if (refundStatus === "succeeded") {
    await reversePendingEscrowIfNecessary(client, booking);

    await client.query(
      `
        UPDATE bookings

        SET
          status = $1,

          escrow_locked =
            false,

          stripe_refund_id =
            $2,

          refund_status =
            'succeeded',

          refund_requested_at =
            COALESCE(
              refund_requested_at,
              NOW()
            ),

          refunded_at =
            NOW(),

          cancelled_at =
            COALESCE(
              cancelled_at,
              NOW()
            ),

          updated_at =
            NOW()

        WHERE id = $3
      `,
      [BOOKING_STATUS.CANCELLED, refundId, bookingId],
    );

    await insertRefundTransaction(client, booking, refundObject);

    return {
      success: true,
      bookingId,
      refundId,
      refundStatus,
      bookingStatus: BOOKING_STATUS.CANCELLED,
    };
  }

  if (REFUND_PENDING_STATUSES.has(refundStatus)) {
    await client.query(
      `
        UPDATE bookings

        SET
          status = $1,

          stripe_refund_id =
            $2,

          refund_status =
            $3,

          refund_requested_at =
            COALESCE(
              refund_requested_at,
              NOW()
            ),

          updated_at =
            NOW()

        WHERE id = $4
      `,
      [BOOKING_STATUS.REFUND_PENDING, refundId, refundStatus, bookingId],
    );

    return {
      success: true,
      pending: true,
      bookingId,
      refundId,
      refundStatus,
      bookingStatus: BOOKING_STATUS.REFUND_PENDING,
    };
  }

  if (REFUND_FAILED_STATUSES.has(refundStatus)) {
    await client.query(
      `
        UPDATE bookings

        SET
          status = $1,

          stripe_refund_id =
            $2,

          refund_status =
            $3,

          refund_requested_at =
            COALESCE(
              refund_requested_at,
              NOW()
            ),

          updated_at =
            NOW()

        WHERE id = $4
      `,
      [BOOKING_STATUS.REFUND_FAILED, refundId, refundStatus, bookingId],
    );

    return {
      success: true,
      failed: true,
      bookingId,
      refundId,
      refundStatus,
      bookingStatus: BOOKING_STATUS.REFUND_FAILED,
    };
  }

  return {
    success: false,
    reason: "The refund state could not be processed.",
  };
}

exports.processRefundUpdatedInternal = processRefundStateInternal;

exports.processRefundFailedInternal = processRefundStateInternal;

async function finalizeUnpaidCancellation(
  client,
  bookingId,
  reason,
  requestedBy,
) {
  const booking = await loadBookingForUpdate(client, bookingId);

  if (!booking) {
    throw new Error(
      "The booking disappeared during cancellation finalization.",
    );
  }

  if (normalizeStatus(booking.status) === BOOKING_STATUS.CANCELLED) {
    return {
      idempotent: true,
      booking,
    };
  }

  if (booking.escrow_locked) {
    throw new Error(
      "An escrow-funded booking cannot be finalized as an unpaid cancellation.",
    );
  }

  const result = await client.query(
    `
        UPDATE bookings

        SET
          status = $1,

          cancellation_reason =
            $2,

          cancellation_requested_by =
            $3,

          cancelled_at =
            COALESCE(
              cancelled_at,
              NOW()
            ),

          escrow_locked =
            false,

          updated_at =
            NOW()

        WHERE id = $4

        RETURNING *
      `,
    [BOOKING_STATUS.CANCELLED, reason, requestedBy, bookingId],
  );

  return {
    idempotent: false,
    booking: result.rows[0],
  };
}

function cancellationAllowedForRequest(req, booking, mode) {
  const currentStatus = normalizeStatus(booking.status);

  if (isAdmin(req)) {
    return currentStatus !== BOOKING_STATUS.COMPLETED;
  }

  if (mode === "designer_rejection") {
    return DESIGNER_REJECTION_STATUSES.has(currentStatus);
  }

  return AUTOMATIC_CANCELLATION_STATUSES.has(currentStatus);
}

async function cancelBookingSafely({
  req,
  res,
  bookingId,
  reason,
  mode = "participant_cancellation",
}) {
  const userId = getAuthenticatedUserId(req);

  let booking;
  let previousStatus = null;
  let externalStripeActionCompleted = false;
  let preparationClient = null;

  try {
    preparationClient = await db.connect();

    await preparationClient.query("BEGIN");

    booking = await loadBookingForUpdate(preparationClient, bookingId);

    if (!booking) {
      await rollbackQuietly(preparationClient);

      return sendError(res, 404, "The booking was not found.");
    }

    const currentStatus = normalizeStatus(booking.status);

    if (mode === "designer_rejection") {
      if (booking.designer_id !== userId) {
        await rollbackQuietly(preparationClient);

        return sendError(
          res,
          403,
          "Only the assigned designer can reject this booking.",
        );
      }
    } else if (!bookingParticipantAllowed(booking, userId) && !isAdmin(req)) {
      await rollbackQuietly(preparationClient);

      return sendError(
        res,
        403,
        "Only booking participants can request cancellation.",
      );
    }

    if (currentStatus === BOOKING_STATUS.CANCELLED) {
      await preparationClient.query("COMMIT");

      return res.status(200).json({
        status: "success",

        idempotent: true,

        message:
          mode === "designer_rejection"
            ? "The booking was already rejected."
            : "The booking was already cancelled.",
      });
    }

    if (currentStatus === BOOKING_STATUS.COMPLETED) {
      await rollbackQuietly(preparationClient);

      return sendError(res, 400, "Completed bookings cannot be cancelled.");
    }

    if (currentStatus === BOOKING_STATUS.REFUND_FAILED) {
      await rollbackQuietly(preparationClient);

      return sendError(
        res,
        409,
        "The previous refund failed. This booking requires administrator review.",
        "REFUND_REQUIRES_REVIEW",
      );
    }

    const retryingCancellation = [
      BOOKING_STATUS.CANCELLATION_PENDING,
      BOOKING_STATUS.REFUND_PENDING,
    ].includes(currentStatus);

    if (
      !retryingCancellation &&
      !cancellationAllowedForRequest(req, booking, mode)
    ) {
      await rollbackQuietly(preparationClient);

      return sendError(
        res,
        409,
        "Automatic cancellation is no longer available after work has started. Contact support or use the dispute process.",
        "CANCELLATION_REQUIRES_REVIEW",
      );
    }

    previousStatus = currentStatus;

    if (!booking.stripe_payment_intent_id) {
      const finalized = await finalizeUnpaidCancellation(
        preparationClient,
        bookingId,
        reason,
        userId,
      );

      await preparationClient.query("COMMIT");

      return res.status(200).json({
        status: "success",

        idempotent: finalized.idempotent,

        message:
          mode === "designer_rejection"
            ? "The booking was rejected."
            : "The booking was cancelled.",

        booking: finalized.booking,
      });
    }

    await preparationClient.query(
      `
        UPDATE bookings

        SET
          status =
            CASE
              WHEN status = $1
                THEN $1
              ELSE $2
            END,

          cancellation_reason =
            $3,

          cancellation_requested_by =
            $4,

          updated_at =
            NOW()

        WHERE id = $5
      `,
      [
        BOOKING_STATUS.REFUND_PENDING,
        BOOKING_STATUS.CANCELLATION_PENDING,
        reason,
        userId,
        bookingId,
      ],
    );

    await preparationClient.query("COMMIT");
  } catch (error) {
    await rollbackQuietly(preparationClient);

    console.error("Cancellation preparation failed:", error);

    return sendError(
      res,
      500,
      mode === "designer_rejection"
        ? "The booking rejection could not be prepared."
        : "The cancellation request could not be prepared.",
    );
  } finally {
    preparationClient?.release();
  }

  try {
    const stripeClient = getStripeClient();

    let refund = null;

    if (booking.stripe_refund_id) {
      refund = await stripeClient.refunds.retrieve(booking.stripe_refund_id);
    } else {
      const paymentIntent = await stripeClient.paymentIntents.retrieve(
        booking.stripe_payment_intent_id,
      );

      if (paymentIntent.status === "succeeded") {
        refund = await stripeClient.refunds.create(
          {
            payment_intent: booking.stripe_payment_intent_id,

            reason: "requested_by_customer",

            metadata: {
              booking_id: bookingId,

              requested_by: userId,

              cancellation_mode: mode,

              expected_refund_cents: String(
                paymentIntent.amount_received || paymentIntent.amount,
              ),
            },
          },
          {
            idempotencyKey: `p2p-booking:${bookingId}:refund`,
          },
        );

        externalStripeActionCompleted = true;
      } else if (paymentIntent.status === "canceled") {
        externalStripeActionCompleted = true;

        const finalClient = await db.connect();

        try {
          await finalClient.query("BEGIN");

          const finalized = await finalizeUnpaidCancellation(
            finalClient,
            bookingId,
            reason,
            userId,
          );

          await finalClient.query("COMMIT");

          return res.status(200).json({
            status: "success",

            idempotent: finalized.idempotent,

            message:
              mode === "designer_rejection"
                ? "The booking was rejected before payment completed."
                : "The booking was cancelled before payment completed.",

            paymentIntentCancelled: true,

            booking: finalized.booking,
          });
        } catch (error) {
          await rollbackQuietly(finalClient);

          throw error;
        } finally {
          finalClient.release();
        }
      } else {
        const cancelledIntent = await stripeClient.paymentIntents.cancel(
          booking.stripe_payment_intent_id,
          {},
          {
            idempotencyKey: `p2p-booking:${bookingId}:cancel-payment-intent`,
          },
        );

        if (cancelledIntent.status !== "canceled") {
          throw new Error(
            `Stripe returned an unexpected PaymentIntent status: ${cancelledIntent.status}`,
          );
        }

        externalStripeActionCompleted = true;

        const finalClient = await db.connect();

        try {
          await finalClient.query("BEGIN");

          const finalized = await finalizeUnpaidCancellation(
            finalClient,
            bookingId,
            reason,
            userId,
          );

          await finalClient.query("COMMIT");

          return res.status(200).json({
            status: "success",

            idempotent: finalized.idempotent,

            message:
              mode === "designer_rejection"
                ? "The booking was rejected before payment completed."
                : "The booking was cancelled before payment completed.",

            paymentIntentCancelled: true,

            booking: finalized.booking,
          });
        } catch (error) {
          await rollbackQuietly(finalClient);

          throw error;
        } finally {
          finalClient.release();
        }
      }
    }

    if (!refund) {
      throw new Error("Stripe did not return a refund object.");
    }

    externalStripeActionCompleted = true;

    const refundClient = await db.connect();

    let result;

    try {
      await refundClient.query("BEGIN");

      result = await processRefundStateInternal(refund, refundClient);

      if (!result.success) {
        await rollbackQuietly(refundClient);

        return sendError(
          res,
          409,
          result.reason || "The refund could not be reconciled.",
        );
      }

      await refundClient.query("COMMIT");
    } catch (error) {
      await rollbackQuietly(refundClient);

      throw error;
    } finally {
      refundClient.release();
    }

    const responseStatus = result.pending ? 202 : result.failed ? 409 : 200;

    return res.status(responseStatus).json({
      status: result.failed ? "error" : "success",

      message:
        mode === "designer_rejection" && result.refundStatus === "succeeded"
          ? "The booking was rejected and the creator was refunded."
          : refundStatusMessage(result.refundStatus),

      data: result,
    });
  } catch (error) {
    console.error("Cancellation Stripe processing failed:", error);

    if (!externalStripeActionCompleted) {
      try {
        await db.query(
          `
            UPDATE bookings

            SET
              status = $1,

              updated_at =
                NOW()

            WHERE
              id = $2

              AND
              status = $3
          `,
          [
            previousStatus || BOOKING_STATUS.PENDING,

            bookingId,

            BOOKING_STATUS.CANCELLATION_PENDING,
          ],
        );
      } catch (restoreError) {
        console.error(
          "Unable to restore booking status after Stripe failure:",
          restoreError,
        );
      }
    }

    return sendError(
      res,
      error.statusCode || 500,
      error.statusCode
        ? error.message
        : mode === "designer_rejection"
          ? "The booking rejection could not be completed safely."
          : "The cancellation could not be completed safely.",
    );
  }
}

/*
=========================================================
AVAILABLE DESIGNERS

Only Designers currently eligible for NEW bookings appear.
=========================================================
*/

exports.getAvailableDesigners = async (req, res) => {
  const creatorId = getAuthenticatedUserId(req);

  if (!creatorId || !isUuid(creatorId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (getAuthenticatedRole(req) !== "creator") {
    return sendError(
      res,
      403,
      "Only creator accounts can access the booking designer directory.",
    );
  }

  try {
    const result = await db.query(
      `
            SELECT
              u.id,
              u.role,
              u.full_name,
              u.profile_image_url,
              u.approval_status,

              dp.tier,
              dp.total_completed_bookings

            FROM users u

            LEFT JOIN designer_profiles dp
              ON dp.user_id =
                u.id

            WHERE
              u.role =
                'designer'

              AND
              u.approval_status =
                'approved'

              AND
              u.is_email_verified =
                TRUE

              AND
              u.id <> $1

            ORDER BY
              COALESCE(
                dp.total_completed_bookings,
                0
              ) DESC,

              u.full_name ASC
          `,
      [creatorId],
    );

    return res.status(200).json({
      status: "success",

      data: result.rows,
    });
  } catch (error) {
    console.error("Unable to load available designers:", error);

    return sendError(res, 500, "The designer directory could not be loaded.");
  }
};

/*
=========================================================
CREATE P2P BOOKING
=========================================================
*/

exports.createP2PBooking = async (req, res) => {
  const creatorId = getAuthenticatedUserId(req);

  const clientRequestId = String(req.body?.client_request_id || "").trim();

  const receiverId = String(req.body?.receiver_id || "").trim();

  const designId = req.body?.design_id
    ? String(req.body.design_id).trim()
    : null;

  const briefText = cleanText(req.body?.brief_text, 20000);

  const price = parsePositiveMoney(req.body?.agreed_price);

  const deadline = parseRequiredFutureDate(req.body?.deadline);

  const scheduledAt = parseOptionalFutureDate(req.body?.scheduled_at);

  const bookingType = normalizeBookingType(req.body?.booking_type, designId);

  if (!creatorId || !isUuid(creatorId)) {
    return sendError(
      res,
      401,
      "Your authenticated account could not be verified.",
    );
  }

  if (getAuthenticatedRole(req) !== "creator") {
    return sendError(
      res,
      403,
      "Only creator accounts can initiate designer bookings.",
    );
  }

  if (!isUuid(clientRequestId)) {
    return sendError(
      res,
      400,
      "A valid client_request_id UUID is required.",
      "CLIENT_REQUEST_ID_REQUIRED",
    );
  }

  if (!isUuid(receiverId)) {
    return sendError(res, 400, "A valid designer identifier is required.");
  }

  if (creatorId === receiverId) {
    return sendError(res, 400, "You cannot create a booking with yourself.");
  }

  if (designId && !isUuid(designId)) {
    return sendError(res, 400, "The supplied design identifier is invalid.");
  }

  if (!briefText) {
    return sendError(res, 400, "A project brief is required.");
  }

  if (briefText.length < 20) {
    return sendError(
      res,
      400,
      "The project brief must contain at least 20 characters.",
    );
  }

  if (!price) {
    return sendError(res, 400, "The agreed price must be greater than zero.");
  }

  if (!deadline) {
    return sendError(res, 400, "The deadline must be a valid future date.");
  }

  if (req.body?.scheduled_at && !scheduledAt) {
    return sendError(
      res,
      400,
      "The scheduled date must be a valid future date.",
    );
  }

  if (scheduledAt && scheduledAt.getTime() >= deadline.getTime()) {
    return sendError(
      res,
      400,
      "The scheduled date must be earlier than the project deadline.",
    );
  }

  if (!bookingType) {
    return sendError(
      res,
      400,
      "booking_type must be either 'commission' or 'marketplace'.",
    );
  }

  if (bookingType === "marketplace" && !designId) {
    return sendError(
      res,
      400,
      "A marketplace-origin booking requires a design_id.",
    );
  }

  const bookingId = clientRequestId;

  const requestContext = {
    creatorId,
    receiverId,
    designId,
    briefText,
    price,
    deadline,
    scheduledAt,
    bookingType,
  };

  let paymentIntent = null;

  let bookingPersisted = false;

  try {
    /*
      Existing idempotent request.
    */

    const existingResult = await db.query(
      `
            SELECT *

            FROM bookings

            WHERE
              client_request_id =
                $1

              OR

              id =
                $1

            LIMIT 1
          `,
      [clientRequestId],
    );

    if (existingResult.rows[0]) {
      return await returnExistingBookingResponse(
        res,
        existingResult.rows[0],
        requestContext,
      );
    }

    /*
      Load current Creator and Designer state.

      IMPORTANT:
      is_email_verified must be selected.
    */

    const userResult = await db.query(
      `
            SELECT
              id,
              role,
              email,
              approval_status,
              is_email_verified,

              subscription_tier,
              subscription_status,
              subscription_active_until,
              subscription_cancel_at_period_end,
              subscription_current_period_start

            FROM users

            WHERE id = ANY(
              $1::uuid[]
            )
          `,
      [[creatorId, receiverId]],
    );

    const creator = userResult.rows.find((user) => user.id === creatorId);

    const designer = userResult.rows.find((user) => user.id === receiverId);

    if (!creator) {
      return sendError(res, 404, "Your creator account no longer exists.");
    }

    if (normalizeStatus(creator.role) !== "creator") {
      return sendError(
        res,
        403,
        "Only creator accounts can initiate designer bookings.",
      );
    }

    /*
      Privacy-safe eligibility response.

      Missing, rejected, suspended or unverified Designers
      receive the same result.
    */

    if (!isEligibleDesignerForNewBooking(designer)) {
      return sendError(
        res,
        409,
        "The selected designer is not currently available for new bookings.",
        "DESIGNER_UNAVAILABLE",
      );
    }

    /*
      Optional Showcase design must belong to this Designer
      and still be publicly visible.
    */

    if (designId) {
      const designResult = await db.query(
        `
              SELECT
                id,
                owner_id,
                is_public,
                is_published

              FROM designs

              WHERE id = $1

              LIMIT 1
            `,
        [designId],
      );

      const design = designResult.rows[0];

      if (
        !design ||
        design.owner_id !== receiverId ||
        design.is_public !== true ||
        design.is_published !== true
      ) {
        return sendError(
          res,
          409,
          "The referenced design is not currently available for this booking.",
          "DESIGN_UNAVAILABLE",
        );
      }
    }

    const scheduleReference = scheduledAt || deadline;

    const scheduleDateKey = getCalendarDateKey(scheduleReference);

    const preliminaryConflict = await db.query(
      `
            SELECT id

            FROM bookings

            WHERE
              designer_id = $1

              AND DATE(
                COALESCE(
                  scheduled_at,
                  deadline
                )
                AT TIME ZONE $4
              ) = DATE(
                $2::timestamptz
                AT TIME ZONE $4
              )

              AND status = ANY(
                $3::varchar[]
              )

            LIMIT 1
          `,
      [
        receiverId,
        scheduleReference.toISOString(),
        ACTIVE_SCHEDULE_STATUSES,
        BOOKING_TIMEZONE,
      ],
    );

    if (preliminaryConflict.rows.length > 0) {
      return sendError(
        res,
        409,
        "The designer already has an active booking on the selected date.",
      );
    }

    const creatorSubscribed = isActiveSubscription(creator);

    const connectionFeeCents = creatorSubscribed
      ? 0
      : Math.round(price.cents * CREATOR_CONNECTION_FEE_RATE);

    const totalChargeCents = price.cents + connectionFeeCents;

    /*
      Create Stripe PaymentIntent only AFTER initial
      Designer eligibility is confirmed.
    */

    paymentIntent = await getStripeClient().paymentIntents.create(
      {
        amount: totalChargeCents,

        currency: "usd",

        automatic_payment_methods: {
          enabled: true,
        },

        description: `FashionVision P2P booking ${bookingId}`,

        metadata: {
          booking_id: bookingId,

          client_request_id: clientRequestId,

          creator_id: creatorId,

          designer_id: receiverId,

          booking_type: bookingType,

          base_price_cents: String(price.cents),

          connection_fee_cents: String(connectionFeeCents),

          total_charge_cents: String(totalChargeCents),

          transaction_purpose: "p2p_escrow_deposit",
        },
      },
      {
        idempotencyKey: `p2p-booking:create:${clientRequestId}`,
      },
    );

    if (paymentIntent.status === "canceled") {
      return sendError(
        res,
        409,
        "This booking request previously produced a cancelled PaymentIntent. Submit again with a new client_request_id.",
        "PAYMENT_INTENT_ALREADY_CANCELLED",
      );
    }

    const client = await db.connect();

    let concurrentExisting = null;

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
        ["p2p-create", clientRequestId],
      );

      const existingInsideTransaction = await client.query(
        `
              SELECT *

              FROM bookings

              WHERE
                client_request_id =
                  $1

                OR

                id =
                  $1

              LIMIT 1

              FOR UPDATE
            `,
        [clientRequestId],
      );

      if (existingInsideTransaction.rows[0]) {
        concurrentExisting = existingInsideTransaction.rows[0];

        await client.query("COMMIT");

        bookingPersisted = true;
      } else {
        /*
          CRITICAL RACE-CLOSING CHECK.

          Re-check Designer AFTER PaymentIntent creation and
          inside the transaction.

          FOR SHARE prevents the relevant account row from
          changing until transaction completion.
        */

        const finalDesignerEligibility = await client.query(
          `
                SELECT id

                FROM users

                WHERE
                  id = $1

                  AND role =
                    'designer'

                  AND approval_status =
                    'approved'

                  AND is_email_verified =
                    TRUE

                LIMIT 1

                FOR SHARE
              `,
          [receiverId],
        );

        if (finalDesignerEligibility.rows.length === 0) {
          await rollbackQuietly(client);

          await cancelPaymentIntentQuietly(paymentIntent.id);

          return sendError(
            res,
            409,
            "The selected designer is not currently available for new bookings.",
            "DESIGNER_UNAVAILABLE",
          );
        }

        /*
          Also close the race for a supplied Showcase design.
        */

        if (designId) {
          const finalDesignEligibility = await client.query(
            `
                  SELECT id

                  FROM designs

                  WHERE
                    id = $1

                    AND owner_id = $2

                    AND is_public =
                      TRUE

                    AND is_published =
                      TRUE

                  LIMIT 1

                  FOR SHARE
                `,
            [designId, receiverId],
          );

          if (finalDesignEligibility.rows.length === 0) {
            await rollbackQuietly(client);

            await cancelPaymentIntentQuietly(paymentIntent.id);

            return sendError(
              res,
              409,
              "The referenced design is not currently available for this booking.",
              "DESIGN_UNAVAILABLE",
            );
          }
        }

        /*
          Serialize bookings for this Designer + calendar day.
        */

        await client.query(
          `
              SELECT
                pg_advisory_xact_lock(
                  hashtext($1),
                  hashtext($2)
                )
            `,
          [receiverId, scheduleDateKey],
        );

        const finalConflict = await client.query(
          `
                SELECT id

                FROM bookings

                WHERE
                  designer_id = $1

                  AND DATE(
                    COALESCE(
                      scheduled_at,
                      deadline
                    )
                    AT TIME ZONE $4
                  ) = DATE(
                    $2::timestamptz
                    AT TIME ZONE $4
                  )

                  AND status = ANY(
                    $3::varchar[]
                  )

                LIMIT 1

                FOR UPDATE
              `,
          [
            receiverId,
            scheduleReference.toISOString(),
            ACTIVE_SCHEDULE_STATUSES,
            BOOKING_TIMEZONE,
          ],
        );

        if (finalConflict.rows.length > 0) {
          await rollbackQuietly(client);

          await cancelPaymentIntentQuietly(paymentIntent.id);

          return sendError(
            res,
            409,
            "The designer became unavailable for the selected date.",
          );
        }

        const bookingResult = await client.query(
          `
                INSERT INTO bookings (
                  id,
                  creator_id,
                  designer_id,
                  design_id,
                  brief_text,
                  agreed_price,
                  deadline,
                  status,
                  escrow_locked,
                  booking_type,
                  scheduled_at,
                  stripe_payment_intent_id,
                  client_request_id,
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
                  false,
                  $9,
                  $10,
                  $11,
                  $12,
                  NOW(),
                  NOW()
                )

                RETURNING *
              `,
          [
            bookingId,
            creatorId,
            receiverId,
            designId,
            briefText,
            price.amount,
            deadline.toISOString(),
            BOOKING_STATUS.PENDING,
            bookingType,
            scheduledAt?.toISOString() || null,
            paymentIntent.id,
            clientRequestId,
          ],
        );

        await client.query(
          `
              UPDATE users

              SET
                bookings_made_count =
                  COALESCE(
                    bookings_made_count,
                    0
                  ) + 1,

                updated_at =
                  NOW()

              WHERE id = $1
            `,
          [creatorId],
        );

        await client.query("COMMIT");

        bookingPersisted = true;

        return res.status(201).json({
          status: "success",

          idempotent: false,

          booking: bookingResult.rows[0],

          clientSecret: paymentIntent.client_secret,

          paymentIntentStatus: paymentIntent.status,

          payment: {
            currency: "usd",

            baseAmount: price.amount,

            connectionFee: centsToMoney(connectionFeeCents),

            totalCharged: centsToMoney(totalChargeCents),

            connectionFeeWaived: creatorSubscribed,
          },
        });
      }
    } catch (error) {
      await rollbackQuietly(client);

      throw error;
    } finally {
      client.release();
    }

    if (concurrentExisting) {
      return await returnExistingBookingResponse(
        res,
        concurrentExisting,
        requestContext,
      );
    }

    throw new Error("The booking creation state could not be resolved.");
  } catch (error) {
    if (!bookingPersisted && paymentIntent?.id) {
      await cancelPaymentIntentQuietly(paymentIntent.id);
    }

    console.error("P2P booking creation failed:", error);

    return sendError(
      res,
      error.statusCode || 500,
      error.statusCode ? error.message : "The booking could not be created.",
    );
  }
};

exports.processEscrowLockInternal = async (paymentIntentObject, client) => {
  if (!paymentIntentObject || !client) {
    return {
      success: false,
      reason: "Payment or database context is missing.",
    };
  }

  if (paymentIntentObject.status !== "succeeded") {
    return {
      success: false,
      reason: "The Stripe payment has not succeeded.",
    };
  }

  const paymentIntentId = paymentIntentObject.id;

  const metadata = paymentIntentObject.metadata || {};

  const bookingId = metadata.booking_id;

  if (!paymentIntentId || !isUuid(bookingId)) {
    return {
      success: false,
      reason: "The payment does not contain valid booking metadata.",
    };
  }

  if (
    String(paymentIntentObject.currency || "").toLowerCase() !== "usd" ||
    metadata.transaction_purpose !== "p2p_escrow_deposit"
  ) {
    return {
      success: false,
      reason: "The Stripe payment purpose or currency is invalid.",
    };
  }

  const booking = await loadBookingForUpdate(client, bookingId);

  if (!booking) {
    return {
      success: false,
      reason: "The booking referenced by Stripe was not found.",
    };
  }

  if (
    booking.stripe_payment_intent_id &&
    booking.stripe_payment_intent_id !== paymentIntentId
  ) {
    return {
      success: false,
      reason: "The Stripe payment does not match this booking.",
    };
  }

  const currentStatus = normalizeStatus(booking.status);

  if (
    [
      BOOKING_STATUS.CANCELLED,
      BOOKING_STATUS.COMPLETED,
      BOOKING_STATUS.CANCELLATION_PENDING,
      BOOKING_STATUS.REFUND_PENDING,
      BOOKING_STATUS.REFUND_FAILED,
    ].includes(currentStatus)
  ) {
    return {
      success: true,
      ignored: true,
      bookingId,
      status: currentStatus,
      message:
        "The payment event was ignored because the booking is closed or being cancelled.",
    };
  }

  if (booking.escrow_locked) {
    return {
      success: true,
      idempotent: true,
      bookingId,
      status: booking.status,
      message: "Escrow was already locked.",
    };
  }

  if (
    metadata.creator_id !== booking.creator_id ||
    metadata.designer_id !== booking.designer_id ||
    (booking.client_request_id &&
      metadata.client_request_id !== booking.client_request_id) ||
    normalizeBookingType(metadata.booking_type, booking.design_id) !==
      normalizeBookingType(booking.booking_type, booking.design_id)
  ) {
    return {
      success: false,
      reason: "Stripe booking metadata is invalid.",
    };
  }

  const baseCents = moneyToCents(booking.agreed_price);

  const metadataBaseCents = Number(metadata.base_price_cents);

  const connectionFeeCents = Number(metadata.connection_fee_cents);

  const metadataTotalCents = Number(metadata.total_charge_cents);

  const intentAmount = Number(paymentIntentObject.amount);

  const receivedCents = Number(paymentIntentObject.amount_received ?? 0);

  if (
    !Number.isInteger(baseCents) ||
    baseCents <= 0 ||
    !Number.isInteger(metadataBaseCents) ||
    !Number.isInteger(connectionFeeCents) ||
    connectionFeeCents < 0 ||
    !Number.isInteger(metadataTotalCents) ||
    !Number.isInteger(intentAmount) ||
    !Number.isInteger(receivedCents)
  ) {
    return {
      success: false,
      reason: "The Stripe payment amount metadata is incomplete or invalid.",
    };
  }

  const expectedTotalCents = baseCents + connectionFeeCents;

  if (metadataBaseCents !== baseCents) {
    return {
      success: false,
      reason: "Stripe base-price metadata does not match the booking.",
    };
  }

  if (
    metadataTotalCents !== expectedTotalCents ||
    intentAmount !== expectedTotalCents ||
    receivedCents !== expectedTotalCents
  ) {
    return {
      success: false,
      reason:
        "The received Stripe amount does not exactly match the booking total.",
    };
  }

  const nextStatus = [BOOKING_STATUS.AWAITING_PAYMENT, "accepted"].includes(
    currentStatus,
  )
    ? BOOKING_STATUS.PROGRESS
    : BOOKING_STATUS.FUNDED;

  await client.query(
    `
        UPDATE bookings

        SET
          escrow_locked =
            true,

          status = $1,

          stripe_payment_intent_id =
            $2,

          updated_at =
            NOW()

        WHERE id = $3
      `,
    [nextStatus, paymentIntentId, bookingId],
  );

  await client.query(
    `
        INSERT INTO designer_wallets (
          user_id,
          available_balance,
          pending_escrow_balance
        )

        VALUES (
          $1,
          0.00,
          $2
        )

        ON CONFLICT (
          user_id
        )

        DO UPDATE SET
          pending_escrow_balance =
            designer_wallets
              .pending_escrow_balance
            +
            EXCLUDED
              .pending_escrow_balance
      `,
    [booking.designer_id, centsToMoney(baseCents)],
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
          $2,
          $3,
          $4,
          $5,
          $6,
          'escrow_lock',
          $7,
          'stripe',
          $7,
          $8,
          NOW()
        )

        ON CONFLICT (
          stripe_payment_intent_id
        )
        DO NOTHING
      `,
    [
      booking.creator_id,
      booking.designer_id,
      bookingId,
      centsToMoney(receivedCents),
      centsToMoney(connectionFeeCents),
      centsToMoney(baseCents),
      paymentIntentId,
      String(paymentIntentObject.currency || "usd").toLowerCase(),
    ],
  );

  return {
    success: true,
    bookingId,
    status: nextStatus,

    payment: {
      baseAmount: centsToMoney(baseCents),

      connectionFee: centsToMoney(connectionFeeCents),

      totalCharged: centsToMoney(receivedCents),

      currency: "usd",
    },
  };
};

exports.verifyEscrowPayment = async (req, res) => {
  const userId = getAuthenticatedUserId(req);

  const bookingId = String(req.body?.bookingId || "").trim();

  if (!userId) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!isUuid(bookingId)) {
    return sendError(res, 400, "A valid bookingId is required.");
  }

  try {
    const bookingResult = await db.query(
      `
            SELECT
              id,
              creator_id,
              stripe_payment_intent_id

            FROM bookings

            WHERE id = $1

            LIMIT 1
          `,
      [bookingId],
    );

    const booking = bookingResult.rows[0];

    if (!booking) {
      return sendError(res, 404, "The booking was not found.");
    }

    if (booking.creator_id !== userId && !isAdmin(req)) {
      return sendError(
        res,
        403,
        "You are not authorized to verify this booking payment.",
      );
    }

    if (!booking.stripe_payment_intent_id) {
      return sendError(
        res,
        400,
        "This booking does not have a Stripe PaymentIntent.",
      );
    }

    const paymentIntent = await getStripeClient().paymentIntents.retrieve(
      booking.stripe_payment_intent_id,
    );

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const result = await exports.processEscrowLockInternal(
        paymentIntent,
        client,
      );

      if (!result.success) {
        await rollbackQuietly(client);

        return sendError(
          res,
          400,
          result.reason || "Escrow could not be verified.",
        );
      }

      await client.query("COMMIT");

      if (result.ignored) {
        return sendError(
          res,
          409,
          result.message ||
            "The payment cannot fund this booking in its current state.",
        );
      }

      return res.status(200).json({
        status: "success",

        message: result.idempotent
          ? "Escrow was already secured."
          : "Stripe payment verified and escrow secured.",

        data: result,
      });
    } catch (error) {
      await rollbackQuietly(client);

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Escrow verification failed:", error);

    return sendError(
      res,
      error.statusCode || 500,
      error.statusCode ? error.message : "Escrow verification failed.",
    );
  }
};

exports.getUnifiedPeerPipeline = async (req, res) => {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    return sendError(res, 401, "Authentication is required.");
  }

  try {
    const pipeline = await db.query(
      `
            SELECT
              b.*,

              creator.full_name
                AS sender_name,

              creator.profile_image_url
                AS sender_avatar,

              designer.full_name
                AS receiver_name,

              designer.profile_image_url
                AS receiver_avatar,

              d.title
                AS reference_design_title

            FROM bookings b

            JOIN users creator
              ON b.creator_id =
                creator.id

            JOIN users designer
              ON b.designer_id =
                designer.id

            LEFT JOIN designs d
              ON b.design_id =
                d.id

            WHERE
              b.creator_id =
                $1

              OR

              b.designer_id =
                $1

            ORDER BY
              b.updated_at DESC,
              b.created_at DESC
          `,
      [userId],
    );

    return res.status(200).json({
      status: "success",

      data: pipeline.rows,
    });
  } catch (error) {
    console.error("Unable to load the P2P pipeline:", error);

    return sendError(res, 500, "The booking pipeline could not be loaded.");
  }
};

exports.acceptProject = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  const bookingId = String(req.params?.id || "").trim();

  if (!designerId || !isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!isUuid(bookingId)) {
    return sendError(res, 400, "A valid booking ID is required.");
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const booking = await loadBookingForUpdate(client, bookingId);

    if (!booking) {
      await rollbackQuietly(client);

      return sendError(res, 404, "The booking was not found.");
    }

    if (booking.designer_id !== designerId) {
      await rollbackQuietly(client);

      return sendError(
        res,
        403,
        "Only the assigned designer can accept this booking.",
      );
    }

    const currentStatus = normalizeStatus(booking.status);

    if (
      [
        BOOKING_STATUS.CANCELLED,
        BOOKING_STATUS.COMPLETED,
        BOOKING_STATUS.CANCELLATION_PENDING,
        BOOKING_STATUS.REFUND_PENDING,
        BOOKING_STATUS.REFUND_FAILED,
      ].includes(currentStatus)
    ) {
      await rollbackQuietly(client);

      return sendError(res, 400, "This booking can no longer be accepted.");
    }

    if (
      [BOOKING_STATUS.AWAITING_PAYMENT, BOOKING_STATUS.PROGRESS].includes(
        currentStatus,
      )
    ) {
      await client.query("COMMIT");

      return res.status(200).json({
        status: "success",

        idempotent: true,

        message: "The booking was already accepted.",

        booking,
      });
    }

    if (
      ![BOOKING_STATUS.PENDING, BOOKING_STATUS.FUNDED, "accepted"].includes(
        currentStatus,
      )
    ) {
      await rollbackQuietly(client);

      return sendError(res, 400, "The booking is not in an acceptable state.");
    }

    const nextStatus = booking.escrow_locked
      ? BOOKING_STATUS.PROGRESS
      : BOOKING_STATUS.AWAITING_PAYMENT;

    const updated = await client.query(
      `
            UPDATE bookings

            SET
              status = $1,

              updated_at =
                NOW()

            WHERE id = $2

            RETURNING *
          `,
      [nextStatus, bookingId],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      status: "success",

      message: booking.escrow_locked
        ? "Project accepted. Escrow is funded and work can begin."
        : "Project accepted. The creator can now fund escrow.",

      booking: updated.rows[0],
    });
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Project acceptance failed:", error);

    return sendError(res, 500, "The project could not be accepted.");
  } finally {
    client.release();
  }
};

exports.rejectProject = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  const bookingId = String(req.params?.id || "").trim();

  const reason =
    cleanText(req.body?.reason, 3000) ||
    "Declined by the designer without additional feedback.";

  if (!designerId || !isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!isUuid(bookingId)) {
    return sendError(res, 400, "A valid booking ID is required.");
  }

  return cancelBookingSafely({
    req,
    res,
    bookingId,
    reason,
    mode: "designer_rejection",
  });
};

/*
=========================================================
SUBMIT PROTOTYPE

Required:
- file_url       -> prototype_file_url

Optional:
- model_url      -> prototype_model_url
- message        -> prototype_message

/*=========================================================
8. Designer Submits Prototype
=========================================================*/

exports.submitPrototype = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  const bookingId = String(req.params?.id || "").trim();

  const fileUrl = parseHttpUrl(req.body?.file_url, 5000);

  const message = cleanText(req.body?.message, 10000);

  /*
  Optional clean garment image used only for
  Virtual Try-On.

  Existing prototype submission continues working
  even when this field is not supplied.
  */
  const tryonImageInput = cleanText(req.body?.tryon_image_url, 5000);

  const tryonImageUrl = tryonImageInput
    ? parseHttpUrl(tryonImageInput, 5000)
    : null;

  if (!designerId || !isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!isUuid(bookingId)) {
    return sendError(res, 400, "A valid booking ID is required.");
  }

  if (!fileUrl) {
    return sendError(
      res,
      400,
      "A valid HTTP or HTTPS prototype file URL is required.",
    );
  }

  /*
  Only reject tryon_image_url when the Designer actually
  supplied a value and that value is invalid.

  This keeps Virtual Try-On optional and does not break
  existing bookings/submissions.
  */
  if (tryonImageInput && !tryonImageUrl) {
    return sendError(
      res,
      400,
      "The Virtual Try-On garment image must be a valid HTTP or HTTPS URL.",
    );
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const booking = await loadBookingForUpdate(client, bookingId);

    if (!booking) {
      await rollbackQuietly(client);

      return sendError(res, 404, "The booking was not found.");
    }

    if (booking.designer_id !== designerId) {
      await rollbackQuietly(client);

      return sendError(
        res,
        403,
        "Only the assigned designer can submit the prototype.",
      );
    }

    if (!booking.escrow_locked) {
      await rollbackQuietly(client);

      return sendError(
        res,
        400,
        "Escrow must be funded before prototype submission.",
      );
    }

    if (
      ![BOOKING_STATUS.PROGRESS, "accepted"].includes(
        normalizeStatus(booking.status),
      )
    ) {
      await rollbackQuietly(client);

      return sendError(
        res,
        400,
        "The booking is not ready for prototype submission.",
      );
    }

    const updated = await client.query(
      `
          UPDATE bookings

          SET
            prototype_file_url =
              $1,

            prototype_message =
              $2,

            prototype_tryon_image_url =
              $3,

            status =
              $4,

            revision_notes =
              NULL,

            updated_at =
              NOW()

          WHERE id =
            $5

          RETURNING *
        `,
      [
        fileUrl,

        message || null,

        tryonImageUrl,

        BOOKING_STATUS.REVIEW_PROTOTYPE,

        bookingId,
      ],
    );

    /*
    Keep existing revision behavior exactly as-is.
    The normal deliverable URL remains the revision
    attachment. The Try-On image is separate.
    */
    const revision = await resolveLatestRevision(client, bookingId, fileUrl);

    await client.query("COMMIT");

    return res.status(200).json({
      status: "success",

      message: "Prototype submitted for creator review.",

      booking: updated.rows[0],

      revision,
    });
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Prototype submission failed:", error);

    return sendError(res, 500, "The prototype could not be submitted.");
  } finally {
    client.release();
  }
};

exports.approvePrototype = async (req, res) => {
  const creatorId = getAuthenticatedUserId(req);

  const bookingId = String(req.params?.id || "").trim();

  if (!creatorId || !isUuid(creatorId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!isUuid(bookingId)) {
    return sendError(res, 400, "A valid booking ID is required.");
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const booking = await loadBookingForUpdate(client, bookingId);

    if (!booking) {
      await rollbackQuietly(client);

      return sendError(res, 404, "The booking was not found.");
    }

    if (booking.creator_id !== creatorId) {
      await rollbackQuietly(client);

      return sendError(
        res,
        403,
        "Only the booking creator can approve the prototype.",
      );
    }

    if (!booking.escrow_locked) {
      await rollbackQuietly(client);

      return sendError(res, 400, "Escrow is not active for this booking.");
    }

    if (normalizeStatus(booking.status) !== BOOKING_STATUS.REVIEW_PROTOTYPE) {
      await rollbackQuietly(client);

      return sendError(
        res,
        400,
        "The booking is not awaiting prototype approval.",
      );
    }

    const updated = await client.query(
      `
            UPDATE bookings

            SET
              status =
                $1,

              revision_notes =
                NULL,

              updated_at =
                NOW()

            WHERE id = $2

            RETURNING *
          `,
      [BOOKING_STATUS.FINAL_PRODUCTION, bookingId],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      status: "success",

      message: "Prototype approved. Final production can begin.",

      booking: updated.rows[0],
    });
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Prototype approval failed:", error);

    return sendError(res, 500, "The prototype could not be approved.");
  } finally {
    client.release();
  }
};

/*=========================================================
10. Designer Submits Final Deliverables
=========================================================*/

exports.submitFinalDeliverables = async (req, res) => {
  const designerId = getAuthenticatedUserId(req);

  const bookingId = String(req.params?.id || "").trim();

  const fileUrl = parseHttpUrl(req.body?.file_url, 5000);

  const message = cleanText(req.body?.message, 10000);

  /*
  Optional clean final garment image used only for
  Virtual Try-On.
  */
  const tryonImageInput = cleanText(req.body?.tryon_image_url, 5000);

  const tryonImageUrl = tryonImageInput
    ? parseHttpUrl(tryonImageInput, 5000)
    : null;

  if (!designerId || !isUuid(designerId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!isUuid(bookingId)) {
    return sendError(res, 400, "A valid booking ID is required.");
  }

  if (!fileUrl) {
    return sendError(
      res,
      400,
      "A valid HTTP or HTTPS final-deliverable file URL is required.",
    );
  }

  if (tryonImageInput && !tryonImageUrl) {
    return sendError(
      res,
      400,
      "The Virtual Try-On garment image must be a valid HTTP or HTTPS URL.",
    );
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const booking = await loadBookingForUpdate(client, bookingId);

    if (!booking) {
      await rollbackQuietly(client);

      return sendError(res, 404, "The booking was not found.");
    }

    if (booking.designer_id !== designerId) {
      await rollbackQuietly(client);

      return sendError(
        res,
        403,
        "Only the assigned designer can submit final deliverables.",
      );
    }

    if (!booking.escrow_locked) {
      await rollbackQuietly(client);

      return sendError(
        res,
        400,
        "Escrow must remain funded until final approval.",
      );
    }

    if (normalizeStatus(booking.status) !== BOOKING_STATUS.FINAL_PRODUCTION) {
      await rollbackQuietly(client);

      return sendError(res, 400, "The booking is not in final production.");
    }

    const updated = await client.query(
      `
          UPDATE bookings

          SET
            delivery_file_url =
              $1,

            delivery_message =
              $2,

            delivery_tryon_image_url =
              $3,

            status =
              $4,

            revision_notes =
              NULL,

            updated_at =
              NOW()

          WHERE id =
            $5

          RETURNING *
        `,
      [
        fileUrl,

        message || null,

        tryonImageUrl,

        BOOKING_STATUS.REVIEW_FINAL,

        bookingId,
      ],
    );

    /*
    Preserve existing revision behavior.
    */
    const revision = await resolveLatestRevision(client, bookingId, fileUrl);

    await client.query("COMMIT");

    return res.status(200).json({
      status: "success",

      message: "Final deliverables submitted for creator approval.",

      booking: updated.rows[0],

      revision,
    });
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Final-deliverable submission failed:", error);

    return sendError(
      res,
      500,
      "The final deliverables could not be submitted.",
    );
  } finally {
    client.release();
  }
};

exports.requestRevision = async (req, res) => {
  const creatorId = getAuthenticatedUserId(req);

  const bookingId = String(req.params?.id || "").trim();

  const notes = cleanText(req.body?.notes, 10000);

  if (!creatorId || !isUuid(creatorId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!isUuid(bookingId)) {
    return sendError(res, 400, "A valid booking ID is required.");
  }

  if (!notes) {
    return sendError(res, 400, "Revision notes are required.");
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const booking = await loadBookingForUpdate(client, bookingId);

    if (!booking) {
      await rollbackQuietly(client);

      return sendError(res, 404, "The booking was not found.");
    }

    if (booking.creator_id !== creatorId) {
      await rollbackQuietly(client);

      return sendError(
        res,
        403,
        "Only the booking creator can request revisions.",
      );
    }

    if (!booking.escrow_locked) {
      await rollbackQuietly(client);

      return sendError(res, 400, "Escrow is not active for this booking.");
    }

    const currentStatus = normalizeStatus(booking.status);

    let nextStatus;

    if (currentStatus === BOOKING_STATUS.REVIEW_PROTOTYPE) {
      nextStatus = BOOKING_STATUS.PROGRESS;
    } else if (currentStatus === BOOKING_STATUS.REVIEW_FINAL) {
      nextStatus = BOOKING_STATUS.FINAL_PRODUCTION;
    } else {
      await rollbackQuietly(client);

      return sendError(
        res,
        400,
        "Revisions can only be requested while reviewing a prototype or final delivery.",
      );
    }

    const updated = await client.query(
      `
            UPDATE bookings

            SET
              status =
                $1,

              revision_notes =
                $2,

              updated_at =
                NOW()

            WHERE id =
              $3

            RETURNING *
          `,
      [nextStatus, notes, bookingId],
    );

    const revisionResult = await client.query(
      `
            INSERT INTO project_revisions (
              id,
              booking_id,
              creator_id,
              feedback_text,
              attachments,
              status,
              created_at,
              updated_at
            )

            VALUES (
              gen_random_uuid(),
              $1,
              $2,
              $3,
              ARRAY[]::text[],
              'pending',
              NOW(),
              NOW()
            )

            RETURNING *
          `,
      [bookingId, creatorId, notes],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      status: "success",

      message: "Revision requested. The designer can continue working.",

      booking: updated.rows[0],

      revision: revisionResult.rows[0],
    });
  } catch (error) {
    await rollbackQuietly(client);

    console.error("Revision request failed:", error);

    return sendError(res, 500, "The revision request could not be submitted.");
  } finally {
    client.release();
  }
};

exports.releaseP2PPayout = async (req, res) => {
  const creatorId = getAuthenticatedUserId(req);

  const bookingId = String(req.params?.id || "").trim();

  if (!creatorId || !isUuid(creatorId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!isUuid(bookingId)) {
    return sendError(res, 400, "A valid booking ID is required.");
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const booking = await loadBookingForUpdate(client, bookingId);

    if (!booking) {
      await rollbackQuietly(client);

      return sendError(res, 404, "The booking was not found.");
    }

    if (booking.creator_id !== creatorId) {
      await rollbackQuietly(client);

      return sendError(
        res,
        403,
        "Only the booking creator can release this payout.",
      );
    }

    /*
    A completed booking may have been completed before the
    reward feature existed.

    This branch safely backfills the missing reward without
    releasing escrow or incrementing designer earnings again.
    */
    if (
      normalizeStatus(booking.status) === BOOKING_STATUS.COMPLETED &&
      booking.escrow_locked === false
    ) {
      const creatorReward = await awardCreatorRewardForCompletedBooking(
        client,
        booking,
      );

      await client.query("COMMIT");

      return res.status(200).json({
        status: "success",

        idempotent: true,

        message: "The payout was already released.",

        creatorReward,
      });
    }

    if (
      ![BOOKING_STATUS.REVIEW_FINAL, "review"].includes(
        normalizeStatus(booking.status),
      ) ||
      !booking.escrow_locked
    ) {
      await rollbackQuietly(client);

      return sendError(
        res,
        400,
        "Final deliverables must be under review with funded escrow before payout.",
      );
    }

    const rateResult = await client.query(
      `
            SELECT
              commission_rate

            FROM designer_profiles

            WHERE user_id = $1

            FOR UPDATE
          `,
      [booking.designer_id],
    );

    const commissionRate = normalizeRate(
      rateResult.rows[0]?.commission_rate,
      DESIGNER_COMMISSION_RATE,
    );

    const grossCents = moneyToCents(booking.agreed_price);

    if (!Number.isInteger(grossCents) || grossCents <= 0) {
      throw new Error("The booking contains an invalid agreed price.");
    }

    const platformFeeCents = Math.round(grossCents * commissionRate);

    const netCents = grossCents - platformFeeCents;

    const grossAmount = centsToMoney(grossCents);

    const platformFee = centsToMoney(platformFeeCents);

    const netAmount = centsToMoney(netCents);

    const walletResult = await client.query(
      `
            UPDATE designer_wallets

            SET
              pending_escrow_balance =
                pending_escrow_balance -
                $1,

              available_balance =
                available_balance +
                $2

            WHERE
              user_id =
                $3

              AND
              pending_escrow_balance >=
                $1

            RETURNING *
          `,
      [grossAmount, netAmount, booking.designer_id],
    );

    if (walletResult.rows.length === 0) {
      throw new Error(
        "The designer wallet does not contain the expected escrow balance.",
      );
    }

    /*
    First move the booking to completed.

    The Creator reward helper only awards a booking whose
    database status is already completed.
    */
    await client.query(
      `
          UPDATE bookings

          SET
            status =
              $1,

            escrow_locked =
              false,

            updated_at =
              NOW()

          WHERE id = $2
        `,
      [BOOKING_STATUS.COMPLETED, bookingId],
    );

    /*
    Award Creator XP inside this SAME transaction.

    If this fails, PostgreSQL rolls back:
    - booking completion
    - wallet escrow release
    - Creator reward
    - Designer completed-booking increment
    - escrow_release transaction

    Therefore there cannot be a partially completed payout.
    */
    const creatorReward = await awardCreatorRewardForCompletedBooking(client, {
      ...booking,
      id: bookingId,
      status: BOOKING_STATUS.COMPLETED,
    });

    await client.query(
      `
          UPDATE designer_profiles

          SET
            total_completed_bookings =
              COALESCE(
                total_completed_bookings,
                0
              ) + 1,

            tier = (
              CASE

                WHEN
                  COALESCE(
                    total_completed_bookings,
                    0
                  ) + 1 >= 50

                  THEN
                    'diamond'

                WHEN
                  COALESCE(
                    total_completed_bookings,
                    0
                  ) + 1 >= 20

                  THEN
                    'gold'

                WHEN
                  COALESCE(
                    total_completed_bookings,
                    0
                  ) + 1 >= 5

                  THEN
                    'silver'

                ELSE
                  'bronze'

              END
            )::designer_tier

          WHERE user_id = $1
        `,
      [booking.designer_id],
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
            currency,
            created_at
          )

          SELECT
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            'escrow_release',
            NULL,
            'usd',
            NOW()

          WHERE NOT EXISTS (
            SELECT 1

            FROM transactions

            WHERE
              reference_id =
                $3

              AND
              transaction_type =
                'escrow_release'
          )
        `,
      [
        creatorId,
        booking.designer_id,
        bookingId,
        grossAmount,
        platformFee,
        netAmount,
      ],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      status: "success",

      idempotent: false,

      message:
        "Final work approved and the internal wallet payout was released.",

      payout: {
        grossAmount,
        platformFee,
        netAmount,
        commissionRate,
        currency: "usd",
        destination: "internal_wallet",
      },

      creatorReward,
    });
  } catch (error) {
    await rollbackQuietly(client);

    console.error("P2P payout release failed:", error);

    return sendError(res, 500, "The payout could not be released safely.");
  } finally {
    client.release();
  }
};

exports.requestCancellation = async (req, res) => {
  const userId = getAuthenticatedUserId(req);

  const bookingId = String(req.params?.id || "").trim();

  const reason = cleanText(req.body?.reason, 5000);

  if (!userId || !isUuid(userId)) {
    return sendError(res, 401, "Authentication is required.");
  }

  if (!isUuid(bookingId)) {
    return sendError(res, 400, "A valid booking ID is required.");
  }

  if (!reason) {
    return sendError(res, 400, "A cancellation reason is required.");
  }

  return cancelBookingSafely({
    req,
    res,
    bookingId,
    reason,
    mode: "participant_cancellation",
  });
};

exports.BOOKING_STATUS = BOOKING_STATUS;
