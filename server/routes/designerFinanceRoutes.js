"use strict";

/*
=========================================================
FashionVision Designer Finance Routes
Universal Manual Designer Payouts
Version 5.1
=========================================================

CURRENT DESIGNER FINANCE MODEL
---------------------------------------------------------

CUSTOMER / CREATOR PAYMENTS
→ DesignByYou Stripe platform account

DESIGNER EARNINGS
→ completed booking
→ internal designer wallet

DESIGNER WITHDRAWAL
→ verified manual bank payout account
→ payout request
→ admin verification
→ DesignByYou performs external bank transfer
→ admin records transfer reference
→ payout completed

=========================================================
IMPORTANT DESIGNER WALLET POLICY
=========================================================

Designers DO NOT fund or deposit money into their wallet.

There is NO:

- designer Stripe wallet deposit
- designer manual wallet deposit
- designer bank wallet deposit
- designer wallet top-up
- designer deposit verification endpoint

Designer wallet balances come from legitimate internal
earnings/accounting flows such as completed bookings.

Historical wallet/deposit records, if any, remain in the
database for audit and reconciliation only.

=========================================================
UNIVERSAL PAYOUT POLICY
=========================================================

ALL DESIGNERS

UAE
Nepal
India
UK
US
and every other supported country

→ Manual bank payout

Every designer
      ↓
Encrypted bank payout account
      ↓
Internal earned balance
      ↓
Manual payout request
      ↓
Admin payout workflow

=========================================================
STRIPE CONNECT
=========================================================

Stripe Connect is disabled for NEW designer payouts.

Historical Stripe records remain in the database for:

- accounting history
- audit history
- reconciliation
- existing transaction references

Compatibility endpoints remain temporarily:

POST /payout-accounts/stripe/connect
POST /payouts/:id/retry
GET  /payout-accounts/stripe/status

They do NOT create:

- connected accounts
- Stripe Transfers
- connected-account payouts
- new Stripe designer payout activity

=========================================================
MANUAL BANK PAYOUT ARCHITECTURE
=========================================================

Designer available balance
      ↓
withdrawal request
      ↓
available_balance decreases
      ↓
pending_payout_balance increases
      ↓
status = pending
      ↓
provider_status =
  awaiting_admin_bank_transfer
      ↓
Super Admin reviews
      ↓
Super Admin transfers money externally
      ↓
Super Admin records bank transfer reference
      ↓
status = completed

If a pending request is cancelled before admin processing:

pending_payout_balance
      ↓
available_balance

=========================================================
BANK SECURITY
=========================================================

Full bank details are encrypted using:

BANK_DETAILS_ENCRYPTION_KEY

Designer read APIs NEVER return:

- full account number
- full IBAN
- SWIFT/BIC
- routing number
- sort code
- branch code
- bank address
- intermediary bank
- ciphertext
- IV
- authentication tag

Only safe masked information is returned.

=========================================================
FINANCIAL ACTION SECURITY
=========================================================

All routes require:

protect
→ authenticated user

authorize("designer")
→ designer role

Sensitive NEW financial actions additionally require:

requireApprovedAccount
requireVerifiedEmail

Rate limiting is applied to payout creation.

=========================================================
*/

const express = require("express");

const designerFinanceController = require("../controllers/designerFinanceController");

const {
  protect,
  authorize,
  requireApprovedAccount,
  requireVerifiedEmail,
} = require("../middlewares/authMiddleware");

const {
  designerPayoutLimiter,
} = require("../middlewares/financialRateLimitMiddleware");

const router = express.Router();

/*=========================================================
Global Designer Access
=========================================================*/

router.use(protect);
router.use(authorize("designer"));

/*=========================================================
Sensitive Financial Action Protection
=========================================================*/

const secureFinancialAction = [requireApprovedAccount, requireVerifiedEmail];

/*=========================================================
1. Wallet Overview
=========================================================

GET
/api/v1/designer-finance/wallet

Read-only internal wallet information.

The wallet is NOT user-fundable.

Balances represent internal designer accounting such as:

- completed booking earnings
- pending project funds
- pending withdrawal reservations

Historical aggregate fields may remain for backwards
compatibility/audit purposes.

=========================================================*/

router.get("/wallet", designerFinanceController.getWalletBalance);

/*=========================================================
2. Earnings and Credit Ledger
=========================================================

GET
/api/v1/designer-finance/ledger

Optional:

?page=1
&limit=25
&type=escrow_release
&search=...

Current earning flow:

- escrow_release

Historical transaction types may remain visible for audit
purposes but cannot be newly created through designer
wallet-funding endpoints.

=========================================================*/

router.get("/ledger", designerFinanceController.getEarningsLedger);

/*=========================================================
3. Designer Payout Options
=========================================================

GET
/api/v1/designer-finance/payout-options

For designers with a valid profile country:

{
  "payout_method": "manual",
  "stripe_connect_available": false,
  "manual_bank_available": true,
  "country_required": false
}

If country is missing:

{
  "payout_method": null,
  "stripe_connect_available": false,
  "manual_bank_available": false,
  "country_required": true
}

=========================================================*/

router.get("/payout-options", designerFinanceController.getPayoutOptions);

/*=========================================================
4. Legacy Provider Payout Accounts
=========================================================

GET
/api/v1/designer-finance/payout-accounts

Historical Stripe payout-account records may remain in the
database but are not selectable for new payouts.

=========================================================*/

router.get("/payout-accounts", designerFinanceController.getPayoutAccounts);

/*=========================================================
5. Get Manual Bank Payout Account
=========================================================

GET
/api/v1/designer-finance/payout-accounts/bank

Available to designers in all supported countries.

Only safe masked information is returned.

=========================================================*/

router.get(
  "/payout-accounts/bank",
  designerFinanceController.getBankPayoutAccount,
);

/*=========================================================
6. Create or Update Manual Bank Payout Account
=========================================================

PUT
/api/v1/designer-finance/payout-accounts/bank

Requires:

protect
authorize("designer")
requireApprovedAccount
requireVerifiedEmail

Sensitive bank details are encrypted at rest.

=========================================================*/

router.put(
  "/payout-accounts/bank",
  ...secureFinancialAction,
  designerFinanceController.saveBankPayoutAccount,
);

/*=========================================================
7. Stripe Connect Onboarding
Disabled Compatibility Route
=========================================================

POST
/api/v1/designer-finance/payout-accounts/stripe/connect

Expected controller behavior:

HTTP 410
STRIPE_CONNECT_DISABLED

No Stripe connected account is created.

=========================================================*/

router.post(
  "/payout-accounts/stripe/connect",
  designerFinanceController.startStripeConnectOnboarding,
);

/*=========================================================
8. Stripe Connect Status
Compatibility Route
=========================================================

GET
/api/v1/designer-finance/payout-accounts/stripe/status

Expected:

connected = false
onboarding_required = false
stripe_connect_available = false
payout_method = manual

=========================================================*/

router.get(
  "/payout-accounts/stripe/status",
  designerFinanceController.getStripeConnectStatus,
);

/*=========================================================
9. Payout Request History
=========================================================

GET
/api/v1/designer-finance/payouts

Optional:

?page=1
&limit=25
&status=pending

Current statuses:

pending
processing
completed
failed
cancelled

Historical Stripe payout rows remain visible for audit.

=========================================================*/

router.get("/payouts", designerFinanceController.getPayoutHistory);

/*=========================================================
10. Create Manual Designer Withdrawal Request
=========================================================

POST
/api/v1/designer-finance/payouts

Recommended body:

{
  "amount": 25,
  "client_request_id": "UUID"
}

Optional explicit bank destination:

{
  "amount": 25,
  "payoutMethod": "manual",
  "bank_account_id": "BANK-UUID",
  "client_request_id": "UUID"
}

All new designer withdrawals use manual bank payout.

Flow:

available_balance
      ↓
pending_payout_balance
      ↓
admin verification
      ↓
external corporate bank transfer
      ↓
completed

If an old frontend explicitly requests:

{
  "payoutMethod": "stripe"
}

the controller must return:

STRIPE_CONNECT_DISABLED

=========================================================*/

router.post(
  "/payouts",
  ...secureFinancialAction,
  designerPayoutLimiter,
  designerFinanceController.requestPayout,
);

/*=========================================================
11. Stripe Payout Retry
Disabled Compatibility Route
=========================================================

POST
/api/v1/designer-finance/payouts/:id/retry

Expected:

HTTP 410
STRIPE_CONNECT_DISABLED

Historical Stripe payout records must never be reused.

=========================================================*/

router.post("/payouts/:id/retry", designerFinanceController.retryStripePayout);

/*=========================================================
12. Cancel Pending Manual Withdrawal
=========================================================

POST
/api/v1/designer-finance/payouts/:id/cancel

Allowed only while a manual payout remains cancellable.

Restores:

pending_payout_balance
      ↓
available_balance

No new financial movement occurs.

=========================================================*/

router.post(
  "/payouts/:id/cancel",
  designerFinanceController.cancelPayoutRequest,
);

/*=========================================================
FINAL VERSION 5.1 ROUTE CONTRACT
=========================================================

READ
---------------------------------------------------------

GET /wallet

GET /ledger

GET /payout-options

GET /payout-accounts

GET /payout-accounts/bank

GET /payout-accounts/stripe/status

GET /payouts


BANK PAYOUT SETUP
---------------------------------------------------------

PUT /payout-accounts/bank


CURRENT DESIGNER WITHDRAWAL
---------------------------------------------------------

POST /payouts


WITHDRAWAL CANCELLATION
---------------------------------------------------------

POST /payouts/:id/cancel


LEGACY STRIPE CONNECT COMPATIBILITY
---------------------------------------------------------

POST /payout-accounts/stripe/connect
→ disabled / HTTP 410

GET /payout-accounts/stripe/status
→ reports Stripe Connect unavailable

POST /payouts/:id/retry
→ disabled / HTTP 410


DESIGNER DEPOSITS
---------------------------------------------------------

NO ROUTES.

There is intentionally NO:

POST /wallet/deposit

POST /wallet/verify-deposit

Designers cannot add money to their own wallet.


ADMIN MANUAL BANK PAYOUT
---------------------------------------------------------

Handled by Super Admin finance routes.

=========================================================
*/

module.exports = router;
