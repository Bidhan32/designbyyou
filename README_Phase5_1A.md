# DesignByYou — Phase 5.1A backend patch

Status: code patch created and syntax checked; **not deployed**, **not connected to the Fashion Editor UI**, and **not tested against a real database or Stripe**.

## Prerequisite

You have already executed the SQL migration adding `public.booking_design_snapshots` with these fields:
`id`, `booking_id`, `creator_id`, `source_editor_project_id`, `source_project_version`, `source_schema_version`, `design_title`, `snapshot_data`, `preview_image_key`, `created_at`.

The table must exist **before deploying this patch**, including for legacy bookings, because the idempotent retry path now queries it.

## What's changed

- Patches `server/controllers/P2PBookingController.js` in place with guarded, exact-match anchors.
- Patches `server/routes/p2pBookingRoutes.js`, keeping existing middleware and routes.
- New optional request body: `editor_project_id` (decimal BIGINT **string**) and `editor_project_version` (positive integer), both required together for a `commission` booking with no `design_id`.
- Checks creator ownership and exact project version before Stripe and again inside the booking transaction using `FOR SHARE`.
- Inserts exactly one snapshot in the same transaction that creates the booking, and preserves the original `editor_projects` record.
- A booking retry with the same `client_request_id` must refer to the **same Editor project/version**; otherwise returns 409.
- Adds `GET /api/v1/p2p-bookings/:id/design-snapshot` accessible only to booking Creator or assigned Designer, with no-store cache headers.
- Keeps legacy commission bookings and published Showcase `design_id` rules intact; no new payment endpoint.

## Install (PowerShell; from project root)

First back up/commit your current source code. Place `Apply_Phase5_1A.cjs` and `Smoke_Test_Phase5_1A.cjs` in your repository root (or refer to their full paths). Run:

```powershell
node .\Apply_Phase5_1A.cjs --check
node .\Apply_Phase5_1A.cjs --apply
node --check .\server\controllers\P2PBookingController.js
node --check .\server\routes\p2pBookingRoutes.js
node .\Smoke_Test_Phase5_1A.cjs
git diff --check
git diff --stat
git diff -- server/controllers/P2PBookingController.js server/routes/p2pBookingRoutes.js
```

The script will halt **without writing any files** if any required anchor is missing. When applying, it creates a backup directory in the Windows OS temp folder and prints its absolute path. The `--check` command does not modify project files.

**Do not run `--apply` twice.** It is intentionally guarded against double insertion.

## Sample request (new feature)

`POST /api/v1/p2p-bookings/create` (existing endpoint, with existing protections):

```json
{
  "client_request_id": "550e8400-e29b-41d4-a716-446655440000",
  "receiver_id": "22222222-2222-4222-8222-222222222222",
  "booking_type": "commission",
  "editor_project_id": "125",
  "editor_project_version": 3,
  "brief_text": "Please develop a professional prototype from the attached private Fashion Editor design.",
  "agreed_price": 100,
  "deadline": "2026-11-30T12:00:00.000Z"
}
```

Do **not** send `design_id` when attaching a private Editor project. Do **not** send raw private project JSON; the backend reads the authoritative, saved project from its own DB. `editor_project_version` must come from the response to the actual editor save request.

The `create` endpoint still creates a Stripe PaymentIntent; do **not** test with real funds. Use an isolated test environment + Stripe test keys and existing payment frontend. The local `Smoke_Test` file intercepts dependencies and **never** calls a real Stripe/DB service.

## Test plan before deployment

- Creator owns project; designer is approved and verified; create commission booking in Stripe test mode.
- Confirm one row in `booking_design_snapshots` references booking; `bookings.design_id` remains NULL.
- Read via assigned Designer/Creator; unrelated account gets 404; project owner edits subsequently do not change the snapshot.
- Retry identical UUID/request; verify one booking and one Stripe PaymentIntent only.
- Retry same UUID with different Editor version/ID or no Editor attachment; get 409.
- Missing/foreign/stale Editor project denied before Stripe creation.
- Test existing commission booking with no Editor attachment and existing Showcase-based booking.
- Test Stripe failure rollback, designer unavailable, schedule conflict, duplicate concurrent creates.
- Test cancellation/refund and existing escrow functionality as regression coverage.
- Ensure private image assets referenced from editor JSON don't have unintended public availability; this patch does not generate private preview images.

## Limitations

This patch is **backend Phase 5.1A only**. It does not add the Fashion Editor button, designer-selection modal, checkout UI or design preview rendering. Those are subsequent frontend/booking-detail steps. Preview_image_key is left NULL. Application code does not update snapshots after creation, but the table is not made database-trigger immutable; use DB permissions/triggers if DB-level enforcement is required.
