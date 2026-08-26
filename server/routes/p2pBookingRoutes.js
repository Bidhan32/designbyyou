"use strict";

/*
=========================================================
DesignByYou / FashionVision
P2P Booking Routes
Secure Escrow, Refund and Milestone Workflow
Version 3.3
=========================================================

SECURITY MODEL
---------------------------------------------------------

CREATOR

Creator accounts require:

- authentication
- creator role

Creator accounts DO NOT require admin approval.

A NEW booking/payment commitment additionally requires:

- verified email


DESIGNER

Designer accounts require:

- authentication
- designer role

A Designer may receive NEW bookings only when the
controller confirms:

- role = designer
- approval_status = approved
- is_email_verified = true

Accepting or actively performing work additionally requires:

- approved account
- verified email


EXISTING FINANCIAL RECOVERY

Existing booking reconciliation, cancellation, rejection,
refund recovery, Creator review, and final escrow release
must not become inaccessible merely because account
verification/approval state changes after money is already
involved.

=========================================================
GLOBAL SUSPENSION
=========================================================

The protect middleware blocks suspended accounts globally.

Therefore:

approval_status = suspended

cannot access protected application routes.

This is enforced centrally in authMiddleware.js.

=========================================================
IMPORTANT
=========================================================

Stripe webhook routes are NOT defined here.

P2P Stripe events continue through:

POST
/api/v1/webhooks/stripe

=========================================================
*/

const express = require("express");

const p2pController = require("../controllers/P2PBookingController");

const {
  p2pBookingCreateLimiter,
} = require("../middlewares/financialRateLimitMiddleware");

const {
  protect,
  authorize,
  requireApprovedAccount,
  requireVerifiedEmail,
} = require("../middlewares/authMiddleware");

const router = express.Router();

/*=========================================================
Reusable Middleware Groups
=========================================================*/

/*
---------------------------------------------------------
Creator Base Access

Used for EXISTING Creator booking actions.

Creator accounts DO NOT require admin approval.

Current verified-email state is intentionally not required
for EXISTING financial recovery / workflow actions where
blocking access could strand an existing booking.
---------------------------------------------------------
*/

const creatorAccess = [protect, authorize("creator")];

/*
---------------------------------------------------------
New Creator Booking Access

Creating a booking also creates/reuses a Stripe
PaymentIntent.

This is a NEW external financial commitment.

Requires:

- authenticated Creator
- Creator role
- verified Creator email

Creator admin approval is intentionally NOT required.

The controller separately validates the selected Designer:

- designer role
- approved account
- verified email
---------------------------------------------------------
*/

const newCreatorBookingAccess = [
  protect,
  authorize("creator"),
  requireVerifiedEmail,
];

/*
---------------------------------------------------------
Designer Base Access

Used where access to an EXISTING financial booking must
remain available even if approval/email state changes.

Examples:

- rejecting existing work
- refund/cancellation recovery
---------------------------------------------------------
*/

const designerAccess = [protect, authorize("designer")];

/*
---------------------------------------------------------
Approved Designer Work Access

Used when the Designer accepts or actively performs work.

Requires:

- authenticated Designer
- Designer role
- approved account
- verified email

Suspended accounts are already blocked by protect.
---------------------------------------------------------
*/

const approvedDesignerAccess = [
  protect,
  authorize("designer"),
  requireApprovedAccount,
  requireVerifiedEmail,
];

/*=========================================================
1. Static Routes
=========================================================

IMPORTANT:

Static routes must remain ABOVE routes beginning with:

/:id

Otherwise Express could interpret:

/pipeline
/designers
/verify-escrow

as booking IDs.
=========================================================*/

/*=========================================================
Authenticated Booking Pipeline

GET
/api/v1/p2p-bookings/pipeline
=========================================================

The controller returns only bookings where the
authenticated user is:

- the Creator
OR
- the assigned Designer

The frontend must not send or trust a localStorage user ID
for authorization.

Requires only authentication because this is an EXISTING
booking view and may be needed for financial recovery.
=========================================================*/

router.get(
  "/pipeline",

  protect,

  p2pController.getUnifiedPeerPipeline,
);

/*=========================================================
Safe Designer Booking Directory

GET
/api/v1/p2p-bookings/designers
=========================================================

Creator-facing list of Designers currently eligible for
NEW booking discovery.

The controller returns only Designers satisfying:

role = designer
approval_status = approved
is_email_verified = TRUE

The controller intentionally exposes only safe directory
fields.

It does NOT expose:

- email
- is_email_verified
- password/authentication data
- Stripe identities
- payout information
- private financial information

IMPORTANT:

The selected Designer is validated AGAIN inside
createP2PBooking before any booking or Stripe financial
commitment is accepted.

The Designer is also revalidated transactionally during
booking creation to close race conditions.
=========================================================*/

router.get(
  "/designers",

  ...creatorAccess,

  p2pController.getAvailableDesigners,
);

/*=========================================================
Create New P2P Booking

POST
/api/v1/p2p-bookings/create
=========================================================

Creates:

booking
    ↓
Stripe PaymentIntent

A stable client_request_id UUID must be generated by the
frontend and reused for retries of the SAME logical booking.

Example:

{
  "client_request_id":
    "550e8400-e29b-41d4-a716-446655440000",

  "receiver_id":
    "designer-uuid",

  "design_id":
    "optional-design-uuid",

  "brief_text":
    "Project requirements...",

  "agreed_price":
    100,

  "deadline":
    "2026-09-20T23:59:59.999Z",

  "scheduled_at":
    "2026-09-10T12:00:00.000Z",

  "booking_type":
    "commission"
}

booking_type may internally be:

commission
marketplace

"marketplace" is retained only as a legacy/internal origin
value for bookings initiated from a published Showcase
design.

Creator-facing UI should describe this as a:

Showcase Commission

not a product/store purchase.

=========================================================
NEW BOOKING SECURITY
=========================================================

Requires:

protect
→ Creator role
→ verified Creator email
→ rate limiter
→ controller validation

Controller additionally requires the selected Designer to
currently satisfy:

role = designer
approval_status = approved
is_email_verified = TRUE

The controller also re-checks Designer eligibility inside
the database transaction before committing the booking.

Does NOT require Creator admin approval.
=========================================================*/

router.post(
  "/create",

  ...newCreatorBookingAccess,

  p2pBookingCreateLimiter,

  p2pController.createP2PBooking,
);

/*=========================================================
Verify / Reconcile Stripe Escrow

POST
/api/v1/p2p-bookings/verify-escrow
=========================================================

Body:

{
  "bookingId":
    "booking-uuid"
}

IMPORTANT:

This does NOT trust the browser saying:

"payment succeeded"

The controller retrieves the real PaymentIntent from
Stripe and verifies:

- booking ownership/admin authorization
- PaymentIntent identity
- Stripe succeeded status
- transaction purpose
- Creator ID
- Designer ID
- booking ID
- client_request_id
- currency
- base amount
- connection fee
- total amount received

Only then may escrow be secured.

=========================================================
WHY NO EMAIL-VERIFICATION MIDDLEWARE?
=========================================================

Stripe may already have charged the Creator.

If email verification changes after payment, we must still
allow reconciliation of EXISTING money rather than strand
the booking.

Controller authorization remains authoritative.
=========================================================*/

router.post(
  "/verify-escrow",

  protect,

  p2pController.verifyEscrowPayment,
);

/*=========================================================
2. Designer Contract Decisions
=========================================================*/

/*=========================================================
Designer Accepts Booking

POST
/api/v1/p2p-bookings/:id/accept
=========================================================

When escrow is already funded:

funded
→ progress

When escrow is not funded:

pending
→ awaiting_payment

Requires:

- Designer authentication
- Designer role
- approved Designer account
- verified email

Accepting the project is a NEW work commitment.

Suspended Designers are blocked globally by protect.
=========================================================*/

router.post(
  "/:id/accept",

  ...approvedDesignerAccess,

  p2pController.acceptProject,
);

/*=========================================================
Designer Rejects Booking

POST
/api/v1/p2p-bookings/:id/reject
=========================================================

Body:

{
  "reason":
    "Optional rejection reason"
}

May result in:

UNPAID
---------------------------------------------------------

PaymentIntent cancellation
→ booking cancelled


FUNDED
---------------------------------------------------------

Stripe refund
→ refund_pending
→ cancelled

or:

→ refund_failed

=========================================================
WHY BASE DESIGNER ACCESS?
=========================================================

Rejecting an EXISTING financial booking may be necessary to
cancel/refund Creator money.

If the Designer later loses approval or email verification,
financial recovery must not become impossible.

The controller verifies that the authenticated Designer is
actually assigned to the booking.

NOTE:

A globally suspended account is still blocked by protect.
=========================================================*/

router.post(
  "/:id/reject",

  ...designerAccess,

  p2pController.rejectProject,
);

/*=========================================================
3. Prototype Milestone
=========================================================*/

/*=========================================================
Designer Submits Prototype

POST
/api/v1/p2p-bookings/:id/submit-prototype
=========================================================

Body:

{
  "file_url":
    "https://example.com/prototype-file",

  "message":
    "Optional prototype notes"
}

Requires:

- assigned Designer
- approved Designer
- verified email
- funded escrow
- valid booking workflow state
=========================================================*/

router.post(
  "/:id/submit-prototype",

  ...approvedDesignerAccess,

  p2pController.submitPrototype,
);

/*=========================================================
Creator Approves Prototype

POST
/api/v1/p2p-bookings/:id/approve-prototype
=========================================================

Workflow:

review_prototype
→ final_production

This acts on an EXISTING funded booking.

Therefore Creator admin approval and current email
verification are intentionally NOT required.

The controller verifies:

- Creator owns the booking
- escrow is funded
- booking is in the correct workflow state
=========================================================*/

router.post(
  "/:id/approve-prototype",

  ...creatorAccess,

  p2pController.approvePrototype,
);

/*=========================================================
4. Final Deliverable Milestone
=========================================================*/

/*=========================================================
Designer Submits Final Deliverables

POST
/api/v1/p2p-bookings/:id/submit-final
=========================================================

Body:

{
  "file_url":
    "https://example.com/final-delivery-file",

  "message":
    "Optional final-delivery notes"
}

Workflow:

final_production
→ review_final

Requires:

- assigned Designer
- approved account
- verified email
- funded escrow
=========================================================*/

router.post(
  "/:id/submit-final",

  ...approvedDesignerAccess,

  p2pController.submitFinalDeliverables,
);

/*=========================================================
Creator Requests Revision

POST
/api/v1/p2p-bookings/:id/request-revision
=========================================================

Body:

{
  "notes":
    "Describe the required changes"
}

Possible workflow:

review_prototype
→ progress

or:

review_final
→ final_production

The frontend does NOT control the resulting status.

The controller determines the correct workflow transition.

Existing funded booking operation:

- no Creator approval requirement
- no current verified-email requirement
=========================================================*/

router.post(
  "/:id/request-revision",

  ...creatorAccess,

  p2pController.requestRevision,
);

/*=========================================================
5. Final Approval / Internal Escrow Release
=========================================================*/

/*=========================================================
Creator Releases Designer Earnings

POST
/api/v1/p2p-bookings/:id/release
=========================================================

IMPORTANT:

This is NOT a Stripe Connect payout.

This operation moves the Designer's EXISTING booking escrow:

designer_wallets.pending_escrow_balance
        ↓
designer_wallets.available_balance

The Designer may later withdraw eligible available wallet
funds through the separate Designer Finance / Stripe
Connect system.

=========================================================
WHY NO VERIFIED-EMAIL GATE?
=========================================================

The Creator is finalizing EXISTING reserved escrow.

Blocking this because the Creator's verification status
changed could strand the Designer's earned money.

The controller verifies:

- Creator ownership
- review_final state
- funded escrow
- wallet balances
- commission calculation
- idempotent transaction record
=========================================================*/

router.post(
  "/:id/release",

  ...creatorAccess,

  p2pController.releaseP2PPayout,
);

/*=========================================================
6. Cancellation / Refund
=========================================================*/

/*=========================================================
Participant Requests Cancellation

POST
/api/v1/p2p-bookings/:id/cancel
=========================================================

Body:

{
  "reason":
    "Required cancellation reason"
}

May be requested by:

- booking Creator
- assigned Designer
- administrator

The controller performs participant authorization.

=========================================================
AUTOMATIC PARTICIPANT CANCELLATION
=========================================================

Only available before work begins:

pending
awaiting_payment
funded

Later workflow states require administrator/dispute
handling.

=========================================================
FINANCIAL RECOVERY RULE
=========================================================

This route intentionally uses only:

protect

and lets the controller determine authorization.

It intentionally does NOT require:

- Creator admin approval
- Designer current approval
- current verified email

An account-state change must not prevent cancellation or
refund reconciliation of an EXISTING financial booking.

NOTE:

Suspended users remain globally blocked by protect.
=========================================================*/

router.post(
  "/:id/cancel",

  protect,

  p2pController.requestCancellation,
);

/*=========================================================
Route Summary
=========================================================

READ
---------------------------------------------------------

GET
/pipeline

Requires:
authenticated user


GET
/designers

Requires:
authenticated Creator

Controller returns only:
approved + verified Designers


NEW CREATOR BOOKING
---------------------------------------------------------

POST
/create

Requires:
authenticated Creator
verified Creator email

Controller additionally requires:
eligible Designer
approved Designer
verified Designer email

Does NOT require:
Creator admin approval


PAYMENT RECONCILIATION
---------------------------------------------------------

POST
/verify-escrow

Requires:
authentication

Controller performs:
Creator/admin authorization
Stripe verification


DESIGNER ACCEPTANCE
---------------------------------------------------------

POST
/:id/accept

Requires:
Designer
approved account
verified email


DESIGNER ACTIVE WORK
---------------------------------------------------------

POST
/:id/submit-prototype

POST
/:id/submit-final

Requires:
Designer
approved account
verified email


DESIGNER REJECTION / REFUND RECOVERY
---------------------------------------------------------

POST
/:id/reject

Requires:
Designer authentication

Controller verifies:
assigned Designer

Current approval/email verification intentionally does not
block recovery.


CREATOR EXISTING BOOKING MANAGEMENT
---------------------------------------------------------

POST
/:id/approve-prototype

POST
/:id/request-revision

POST
/:id/release

Requires:
Creator authentication

Does NOT require:
Creator admin approval
current email verification


CANCELLATION / REFUND
---------------------------------------------------------

POST
/:id/cancel

Requires:
authentication

Controller performs:
participant/admin authorization


GLOBAL SUSPENSION
---------------------------------------------------------

All protected routes:

protect
→ blocks approval_status = suspended


STRIPE WEBHOOK
---------------------------------------------------------

NOT handled in this router.

P2P PaymentIntent/refund events use:

POST
/api/v1/webhooks/stripe

=========================================================
Export
=========================================================*/

module.exports = router;
