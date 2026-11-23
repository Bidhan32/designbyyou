import MetricList from "../../components/MetricList";
import CreatorCreditBalance from "../../components/CreatorCreditBalance";
"use strict";

/*
=========================================================
DesignByYou
Creator Wallet & Billing
Version 3.1
=========================================================

Responsibilities:

1. Creator wallet overview
2. Add wallet funds through Stripe
3. Return unused wallet balance to original Stripe source
4. Creator subscription purchase
5. Creator subscription management
6. Transaction ledger
7. Ledger filtering / pagination
8. Creator light / dark theme support

=========================================================
IMPORTANT FINANCIAL MODEL
=========================================================

Creator wallet withdrawal means:

Return UNUSED wallet value
        ↓
original Stripe funding source

It is NOT:

- creator earnings payout
- Stripe Connect payout
- arbitrary bank withdrawal


Creator subscriptions are also separate from wallet funds.

Subscription:
Creator
    ↓
Stripe Checkout
    ↓
Stripe recurring subscription

Wallet:
Creator
    ↓
Stripe PaymentIntent
    ↓
internal creator wallet

=========================================================
*/

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Crown,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";

import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import { loadStripe } from "@stripe/stripe-js";

import { useLocation } from "react-router-dom";
import API from "../../api/axios";

import { useTheme } from "../../context/ThemeContext.helpers.js";

/*=========================================================
Stripe Elements
=========================================================

This key is PUBLIC and belongs in the frontend environment:

VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...

The Stripe SECRET key remains backend-only.
=========================================================*/



const STRIPE_PUBLISHABLE_KEY = String(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "",
).trim();

const stripePromise = STRIPE_PUBLISHABLE_KEY
  ? loadStripe(STRIPE_PUBLISHABLE_KEY)
  : null;

/*=========================================================
Configuration
=========================================================*/

const LEDGER_LIMIT = 25;

const LEDGER_TYPES = [
  {
    value: "",
    label: "All Activity",
  },
  {
    value: "wallet_deposit",
    label: "Wallet Deposits",
  },
  {
    value: "escrow_lock",
    label: "Booking Funding",
  },
  {
    value: "escrow_release",
    label: "Designer Releases",
  },
  {
    value: "booking_deposit",
    label: "Booking Deposits",
  },
  {
    value: "refund",
    label: "Refunds / Returns",
  },
];

const LEDGER_PROVIDERS = [
  {
    value: "",
    label: "All Providers",
  },
  {
    value: "stripe",
    label: "Stripe",
  },
  {
    value: "paypal",
    label: "PayPal",
  },
];


function createCardElementOptions(theme) {
  const isDark = theme === "dark";

  return {
    style: {
      base: {
        color: isDark ? "#ffffff" : "#0f172a",
        fontSize: "16px",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",

        "::placeholder": {
          color: isDark ? "#737373" : "#94a3b8",
        },

        iconColor: "#D4AF37",
      },

      invalid: {
        color: isDark ? "#fb7185" : "#be123c",
        iconColor: isDark ? "#fb7185" : "#be123c",
      },
    },
  };
}

/*=========================================================
Default Data
=========================================================*/

const EMPTY_SUMMARY = {
  available_balance: "0.00",
  pending_escrow_balance: "0.00",
  pending_payout_balance: "0.00",
  pending_refund_balance: "0.00",
  total_wallet_balance: "0.00",

  lifetime_deposited: "0.00",
  lifetime_spent: "0.00",
  lifetime_withdrawn: "0.00",
  lifetime_refunded: "0.00",

  locked_escrow_balance: "0.00",
  active_escrow_count: 0,

  total_p2p_charged: "0.00",
  total_p2p_refunded: "0.00",
  net_p2p_spend: "0.00",
  total_lifespan_spend: "0.00",

  currency: "usd",
};

const EMPTY_PAGINATION = {
  page: 1,
  limit: LEDGER_LIMIT,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

const EMPTY_SUBSCRIPTION = {
  plan: "free",
  status: "free",

  active_until: null,
  current_period_start: null,
  current_period_end: null,

  cancel_at_period_end: false,

  is_active: false,
  needs_billing_attention: false,

  has_billing_profile: false,
  has_subscription: false,
  can_manage_billing: false,

  provider_sync: "database",
};

/*=========================================================
General Helpers
=========================================================*/

function isCanceledRequest(error) {
  return (
    error?.code === "ERR_CANCELED" ||
    error?.name === "CanceledError" ||
    error?.name === "AbortError"
  );
}

function safeNumber(value) {
  const number = Number.parseFloat(value);

  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value, currency = "usd") {
  const amount = safeNumber(value);

  let normalizedCurrency = String(currency || "usd")
    .trim()
    .toUpperCase();

  if (normalizedCurrency.length !== 3) {
    normalizedCurrency = "USD";
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function shortenReference(value, length = 18) {
  if (!value) {
    return "N/A";
  }

  const text = String(value);

  if (text.length <= length) {
    return text;
  }

  return `${text.slice(0, length)}…`;
}

function titleCase(value) {
  if (!value) {
    return "Unknown";
  }

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function createClientRequestId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const bytes = new Uint8Array(16);

    crypto.getRandomValues(bytes);

    bytes[6] = (bytes[6] & 0x0f) | 0x40;

    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  }

  throw new Error(
    "Secure request identity generation is unavailable in this browser.",
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/*=========================================================
Transaction Helpers
=========================================================*/

function getTransactionReference(transaction) {
  return (
    transaction?.provider_transaction_id ||
    transaction?.provider_payment_id ||
    transaction?.stripe_payment_intent_id ||
    transaction?.reference_id ||
    transaction?.transaction_id ||
    null
  );
}

function getProviderLabel(transaction) {
  const provider = String(transaction?.payment_provider || "")
    .trim()
    .toLowerCase();

  if (provider === "stripe") {
    return "Stripe";
  }

  if (provider === "paypal") {
    return "PayPal";
  }

  return "Internal";
}

function getDirectionLabel(direction) {
  switch (direction) {
    case "credit":
      return "Credit";

    case "debit":
      return "Debit";

    case "internal_release":
      return "Released";

    default:
      return "Activity";
  }
}

function getDirectionAmountPrefix(direction) {
  if (direction === "credit") {
    return "+";
  }

  if (direction === "debit") {
    return "−";
  }

  return "";
}

function getDirectionBadgeClasses(direction) {
  switch (direction) {
    case "credit":
      return "border-line bg-subtle text-action";

    case "debit":
      return "border-line bg-subtle text-action";

    case "internal_release":
      return "border-line bg-subtle text-action";

    default:
      return "border-line bg-subtle text-muted";
  }
}

function getDirectionAmountClasses(direction) {
  switch (direction) {
    case "credit":
      return "text-action";

    case "debit":
      return "text-action";

    default:
      return "text-action";
  }
}

/*=========================================================
Subscription Helpers
=========================================================*/

const membershipCardDetails = {
  free: {
    description: "Try the AI tools and book a designer as you need one.",
    benefits: [
      "50 AI credits each month",
      "$5 connection fee per booking",
      "Standard booking prices (0% discount)",
      "No booking reward points",
      "1 alteration per booking",
    ],
  },
  basic: {
    description: "For creators exploring ideas and booking custom design work.",
    benefits: [
      "1,500 AI credits each month",
      "10% of unused credits roll into the next month for AI tools",
      "Booking connection fee waived",
      "6% off eligible booking design charges",
      "5 reward points per $1,000 spent on eligible bookings",
      "2 alterations per booking",
    ],
  },
  pro: {
    description: "For frequent design work with more generations and revisions.",
    benefits: [
      "4,500 AI credits each month",
      "10% of unused credits roll into the next month for AI tools",
      "Booking connection fee waived",
      "16% off eligible booking design charges",
      "10 reward points per $1,000 spent on eligible bookings",
      "3 alterations per booking",
    ],
  },
};

function getSubscriptionPlanLabel(plan) {
  switch (plan) {
    case "basic":
      return "Basic";
    case "pro":
      return "Pro";
    case "monthly":
      return "Monthly";

    case "quarterly":
      return "Quarterly";

    case "yearly":
      return "Yearly";

    default:
      return "Free";
  }
}

function getSubscriptionStatusClasses(status) {
  switch (status) {
    case "active":
    case "trialing":
      return "border-line bg-subtle text-action";

    case "past_due":
    case "incomplete":
      return "border-line bg-subtle text-action";

    case "unpaid":
      return "border-line bg-subtle text-action";

    case "canceled":
    case "incomplete_expired":
      return "border-line bg-subtle text-muted";

    default:
      return "border-line bg-subtle text-muted";
  }
}


/*=========================================================
Modal
=========================================================*/

function WalletModal({ open, title, subtitle, onClose, children }) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);

      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 dark:bg-black/80 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg overflow-hidden rounded-md border border-line bg-surface"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-start justify-between gap-4 border-b border-line p-4"
        >
          <div>
            <h2
              className="font-sans text-2xl text-ink"
            >
              {title}
            </h2>

            <p
              className="mt-2 text-xs leading-5 text-muted"
            >
              {subtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-10 shrink-0 place-items-center rounded-md border border-line bg-subtle text-muted transition hover:bg-subtle hover:text-ink"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/*=========================================================
Creator Wallet Core
=========================================================*/

function CreatorWalletCore({ stripe, elements, stripeElementsEnabled }) {
  const { theme } = useTheme();

  const cardElementOptions = useMemo(
    () => createCardElementOptions(theme),
    [theme],
  );

  /*=======================================================
  Summary State
  =======================================================*/

  const [metrics, setMetrics] = useState(null);

  const [summaryLoading, setSummaryLoading] = useState(true);

  const [summaryError, setSummaryError] = useState("");

  /*=======================================================
  Ledger State
  =======================================================*/

  const [ledger, setLedger] = useState([]);

  const [pagination, setPagination] = useState(EMPTY_PAGINATION);

  const [ledgerLoading, setLedgerLoading] = useState(true);

  const [ledgerError, setLedgerError] = useState("");

  const [ledgerPage, setLedgerPage] = useState(1);

  const [ledgerSearch, setLedgerSearch] = useState("");

  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [ledgerType, setLedgerType] = useState("");

  const [ledgerProvider, setLedgerProvider] = useState("");

  /*=======================================================
  Subscription State
  =======================================================*/

  const [subscription, setSubscription] = useState(null);

  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  const [subscriptionError, setSubscriptionError] = useState("");


  const subscriptionRequestRef = useRef(null);
  const [checkoutPlanLoading, setCheckoutPlanLoading] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);

  /*=======================================================
  Page Notice
  =======================================================*/

  const [notice, setNotice] = useState(null);

  /*=======================================================
  Deposit State
  =======================================================*/

  const [depositOpen, setDepositOpen] = useState(false);

  const [depositAmount, setDepositAmount] = useState("");

  const [depositLoading, setDepositLoading] = useState(false);

  const [depositError, setDepositError] = useState("");

  const depositRequestRef = useRef(null);

  /*=======================================================
  Withdrawal State
  =======================================================*/

  const [withdrawalOpen, setWithdrawalOpen] = useState(false);

  const [withdrawalAmount, setWithdrawalAmount] = useState("");

  const [withdrawalLoading, setWithdrawalLoading] = useState(false);

  const [withdrawalError, setWithdrawalError] = useState("");

  const withdrawalRequestRef = useRef(null);

  /*=======================================================
  Subscription Checkout Request Identity
  =======================================================*/


  /*=======================================================
  Derived
  =======================================================*/

  const wallet = metrics || EMPTY_SUMMARY;

  const currentSubscription = subscription || EMPTY_SUBSCRIPTION;

  const currency = wallet.currency || "usd";

  const availableBalance = safeNumber(wallet.available_balance);

  const activeEscrowCount =
    Number.parseInt(wallet.active_escrow_count, 10) || 0;

  const location = useLocation();

  /*=======================================================
  Debounce Ledger Search
  =======================================================*/

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(ledgerSearch.trim());
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [ledgerSearch]);

  /*=======================================================
  Load Summary
  =======================================================*/

  const fetchSummary = useCallback(async ({ signal, silent = false } = {}) => {
    if (!silent) {
      setSummaryLoading(true);
    }

    setSummaryError("");

    try {
      const response = await API.get("/creator-finance/summary", {
        signal,
      });

      const data = response?.data?.data;

      setMetrics({
        ...EMPTY_SUMMARY,
        ...(data || {}),
      });

      return data;
    } catch (error) {
      if (isCanceledRequest(error)) {
        return null;
      }

      if (import.meta.env.DEV) {
        console.error(
          "Creator wallet summary failed:",
          error?.response?.data || error,
        );
      }

      setSummaryError(
        error?.response?.data?.message || "Unable to load your wallet balance.",
      );

      return null;
    } finally {
      if (!silent) {
        setSummaryLoading(false);
      }
    }
  }, []);

  /*=======================================================
  Load Ledger
  =======================================================*/

  const fetchLedger = useCallback(
    async ({ signal, silent = false } = {}) => {
      if (!silent) {
        setLedgerLoading(true);
      }

      setLedgerError("");

      try {
        const params = {
          page: ledgerPage,

          limit: LEDGER_LIMIT,
        };

        if (debouncedSearch) {
          params.search = debouncedSearch;
        }

        if (ledgerType) {
          params.type = ledgerType;
        }

        if (ledgerProvider) {
          params.provider = ledgerProvider;
        }

        const response = await API.get("/creator-finance/ledger", {
          params,
          signal,
        });

        setLedger(
          Array.isArray(response?.data?.data) ? response.data.data : [],
        );

        setPagination({
          ...EMPTY_PAGINATION,
          ...(response?.data?.pagination || {}),
        });

        return response.data;
      } catch (error) {
        if (isCanceledRequest(error)) {
          return null;
        }

        if (import.meta.env.DEV) {
          console.error(
            "Creator ledger request failed:",
            error?.response?.data || error,
          );
        }

        setLedgerError(
          error?.response?.data?.message ||
            "Unable to load transaction history.",
        );

        return null;
      } finally {
        if (!silent) {
          setLedgerLoading(false);
        }
      }
    },
    [ledgerPage, debouncedSearch, ledgerType, ledgerProvider],
  );

  /*=======================================================
  Load Subscription
  =======================================================*/

  const fetchSubscription = useCallback(
    async ({ refresh = false, signal, silent = false } = {}) => {
      if (!silent) {
        setSubscriptionLoading(true);
      }

      setSubscriptionError("");

      try {
        const response = await API.get("/subscription/status", {
          params: { offers: 1, ...(refresh ? { refresh: 1 } : {}) },

          signal,
        });

        const data = response?.data?.data;

        setSubscription({
          ...EMPTY_SUBSCRIPTION,
          ...(data || {}),
        });

        return data;
      } catch (error) {
        if (isCanceledRequest(error)) {
          return null;
        }

        if (import.meta.env.DEV) {
          console.error(
            "Creator subscription status failed:",
            error?.response?.data || error,
          );
        }

        setSubscriptionError(
          error?.response?.data?.message ||
            "Unable to load subscription status.",
        );

        return null;
      } finally {
        if (!silent) {
          setSubscriptionLoading(false);
        }
      }
    },
    [],
  );

  /*=======================================================
  Initial Summary
  =======================================================*/

  useEffect(() => {
    const controller = new AbortController();

    void fetchSummary({
      signal: controller.signal,
    });

    return () => {
      controller.abort();
    };
  }, [fetchSummary]);

  /*=======================================================
  Ledger Effect
  =======================================================*/

  useEffect(() => {
    const controller = new AbortController();

    void fetchLedger({
      signal: controller.signal,
    });

    return () => {
      controller.abort();
    };
  }, [fetchLedger]);

  /*=======================================================
  Initial Subscription + Checkout Return
  =======================================================*/

  useEffect(() => {
    const controller = new AbortController();

    const query = new URLSearchParams(window.location.search);

    const returnState = query.get("subscription");

    const cleanReturnUrl = () => {
      const url = new URL(window.location.href);

      url.searchParams.delete("subscription");

      url.searchParams.delete("session_id");

      window.history.replaceState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    };

    const synchronize = async () => {
      if (returnState === "cancelled") {
        setNotice({
          type: "info",
          message:
            "Subscription checkout was cancelled. No new subscription was activated.",
        });

        await fetchSubscription({
          signal: controller.signal,
        });

        cleanReturnUrl();

        return;
      }

      if (returnState !== "success") {
        await fetchSubscription({
          signal: controller.signal,
        });

        return;
      }

      setNotice({
        type: "info",
        message:
          "Stripe Checkout completed. Synchronizing your subscription status…",
      });

      /*
        Checkout can redirect slightly before the webhook has
        linked the Stripe subscription ID.

        Poll briefly, while still treating Stripe/database
        state—not the query string—as authoritative.
        */

      let latest = null;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (controller.signal.aborted) {
          return;
        }

        latest = await fetchSubscription({
          refresh: true,
          signal: controller.signal,
          silent: attempt > 0,
        });

        if (
          latest?.has_subscription ||
          latest?.is_active ||
          latest?.status !== "free"
        ) {
          break;
        }

        await delay(1200);
      }

      if (controller.signal.aborted) {
        return;
      }

      if (latest?.is_active) {
        setNotice({
          type: "success",
          message:
            "Your Creator subscription is active and synchronized with Stripe.",
        });
      } else if (latest?.has_subscription) {
        setNotice({
          type: "info",
          message:
            "Your subscription was found and is still being finalized by Stripe.",
        });
      } else {
        setNotice({
          type: "info",
          message:
            "Checkout returned successfully. Stripe is still finalizing the subscription; refresh shortly if the plan has not appeared yet.",
        });
      }

      cleanReturnUrl();
    };

    void synchronize();

    return () => {
      controller.abort();
    };
  }, [fetchSubscription]);

  /*=======================================================
  Refresh Everything
  =======================================================*/

  const handleRefreshAll = async () => {
    setNotice(null);

    await Promise.allSettled([
      fetchSummary(),
      fetchSubscription({
        refresh: true,
      }),
      fetchLedger(),
    ]);
  };

  /*=======================================================
  Billing Portal
  =======================================================*/

  const handleSubscribe = async ({ plan, price_id }) => {
    if (checkoutPlanLoading) {
      return;
    }

    setSubscriptionError("");
    setNotice(null);

    setCheckoutPlanLoading(plan);

    try {
      if (
        !subscriptionRequestRef.current ||
        subscriptionRequestRef.current.plan !== plan
      ) {
        subscriptionRequestRef.current = {
          plan,

          id: createClientRequestId(),
        };
      }

      const response = await API.post("/subscription/create-checkout-session", {
        plan,
        expected_price_id: price_id,
        client_request_id: subscriptionRequestRef.current.id,
      });

      const url = response?.data?.url;

      if (!url) {
        throw new Error("Stripe Checkout URL was not returned.");
      }

      window.location.assign(url);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error(
          "Subscription Checkout failed:",
          error?.response?.data || error,
        );
      }

      const code = error?.response?.data?.code;

      if (code === "CREATOR_SUBSCRIPTION_ALREADY_EXISTS") {
        setNotice({
          type: "info",
          message:
            "A Stripe subscription already exists for this account. Use Manage Billing instead.",
        });

        await fetchSubscription({
          refresh: true,
        });
      } else {
        setSubscriptionError(
          error?.response?.data?.message ||
            error?.message ||
            "Unable to start subscription checkout.",
        );
      }
    } finally {
      setCheckoutPlanLoading("");
    }
  };

  const handleManageBilling = async () => {
    if (portalLoading) {
      return;
    }

    setPortalLoading(true);
    setSubscriptionError("");
    setNotice(null);

    try {
      const response = await API.post("/subscription/create-portal-session");

      const url = response?.data?.url;

      if (!url) {
        throw new Error("Stripe Billing Portal URL was not returned.");
      }

      window.location.assign(url);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Billing Portal failed:", error?.response?.data || error);
      }

      setSubscriptionError(
        error?.response?.data?.message ||
          error?.message ||
          "Unable to open Stripe Billing Portal.",
      );
    } finally {
      setPortalLoading(false);
    }
  };

  /*=======================================================
  Add Wallet Funds
  =======================================================*/

  const handleDeposit = async (event) => {
    event.preventDefault();

    setDepositError("");

    const amount = safeNumber(depositAmount);

    if (amount <= 0) {
      setDepositError("Enter a valid deposit amount.");

      return;
    }

    if (!stripeElementsEnabled || !stripe || !elements) {
      setDepositError(
        "Stripe card entry is unavailable. Check the frontend Stripe publishable-key configuration.",
      );

      return;
    }

    const card = elements.getElement(CardElement);

    if (!card) {
      setDepositError("Stripe card entry is still loading. Please try again.");

      return;
    }

    setDepositLoading(true);
    setNotice(null);

    try {
      const amountKey = amount.toFixed(2);

      if (
        !depositRequestRef.current ||
        depositRequestRef.current.amount !== amountKey
      ) {
        depositRequestRef.current = {
          amount: amountKey,

          id: createClientRequestId(),
        };
      }

      const response = await API.post("/creator-finance/wallet/deposit", {
        amount,

        paymentProvider: "stripe",

        client_request_id: depositRequestRef.current.id,
      });

      const clientSecret = response?.data?.clientSecret;

      const paymentIntentId = response?.data?.paymentIntentId;

      const depositStatus = response?.data?.data?.deposit?.status;

      /*
        Existing request may already be credited.
        */

      if (depositStatus === "succeeded") {
        setDepositOpen(false);

        setDepositAmount("");

        depositRequestRef.current = null;

        card.clear();

        setNotice({
          type: "success",
          message: "This wallet deposit was already credited.",
        });

        await Promise.allSettled([fetchSummary(), fetchLedger()]);

        return;
      }

      if (!clientSecret) {
        throw new Error(
          "Stripe payment confirmation information was not returned.",
        );
      }

      const confirmation = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card,
        },
      });

      if (confirmation.error) {
        throw new Error(
          confirmation.error.message || "Stripe could not confirm the payment.",
        );
      }

      if (confirmation?.paymentIntent?.status !== "succeeded") {
        throw new Error(
          `Stripe payment is currently ${confirmation?.paymentIntent?.status || "pending"}.`,
        );
      }

      /*
        Wallet credit is webhook-driven.

        Poll the ledger briefly for the PaymentIntent to let
        the webhook complete before presenting the final
        synced message.
        */

      let credited = false;

      if (paymentIntentId) {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await delay(1000);

          try {
            const ledgerResponse = await API.get("/creator-finance/ledger", {
              params: {
                page: 1,
                limit: 5,
                search: paymentIntentId,
              },
            });

            if (
              Array.isArray(ledgerResponse?.data?.data) &&
              ledgerResponse.data.data.length > 0
            ) {
              credited = true;
              break;
            }
          } catch {
            /*
              The final summary refresh below still provides
              the normal recovery path.
              */
          }
        }
      }

      setDepositOpen(false);
      setDepositAmount("");

      depositRequestRef.current = null;

      card.clear();

      setNotice({
        type: credited ? "success" : "info",

        message: credited
          ? "Wallet deposit succeeded and has been credited."
          : "Stripe received your payment. Your wallet will update as soon as the signed webhook is processed.",
      });

      await Promise.allSettled([fetchSummary(), fetchLedger()]);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error(
          "Creator wallet deposit failed:",
          error?.response?.data || error,
        );
      }

      setDepositError(
        error?.response?.data?.message ||
          error?.message ||
          "Unable to complete the wallet deposit.",
      );
    } finally {
      setDepositLoading(false);
    }
  };

  /*=======================================================
  Return Unused Wallet Balance
  =======================================================*/

  const handleWithdrawal = async (event) => {
    event.preventDefault();

    setWithdrawalError("");

    const amount = safeNumber(withdrawalAmount);

    if (amount <= 0) {
      setWithdrawalError("Enter a valid amount to return.");

      return;
    }

    if (amount > availableBalance) {
      setWithdrawalError(
        `The amount exceeds your available wallet balance of ${formatMoney(
          availableBalance,
          currency,
        )}.`,
      );

      return;
    }

    setWithdrawalLoading(true);

    setNotice(null);

    try {
      const amountKey = amount.toFixed(2);

      /*
        Same amount + same unfinished operation must keep
        the SAME client_request_id for reconciliation.
        */

      if (
        !withdrawalRequestRef.current ||
        withdrawalRequestRef.current.amount !== amountKey
      ) {
        withdrawalRequestRef.current = {
          amount: amountKey,

          id: createClientRequestId(),
        };
      }

      const response = await API.post("/creator-finance/wallet/withdraw", {
        amount,

        client_request_id: withdrawalRequestRef.current.id,
      });

      const processing = Boolean(response?.data?.processing);

      const refundRequest = response?.data?.data?.refund_request;

      const status = refundRequest?.status;

      setNotice({
        type:
          status === "completed"
            ? "success"
            : status === "failed" || status === "partially_completed"
              ? "info"
              : "info",

        message:
          response?.data?.message ||
          (processing
            ? "Your unused-balance return is processing."
            : "Your unused-balance return was updated."),
      });

      await Promise.allSettled([fetchSummary(), fetchLedger()]);

      /*
        Keep identity while processing so pressing the action
        again safely reconciles the SAME request.

        Terminal result means a future return should receive
        a new request identity.
        */

      if (!processing) {
        withdrawalRequestRef.current = null;

        setWithdrawalAmount("");

        setWithdrawalOpen(false);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error(
          "Creator unused-balance return failed:",
          error?.response?.data || error,
        );
      }

      const serverData = error?.response?.data;

      const refundableBalance = serverData?.refundable_balance;

      setWithdrawalError(
        refundableBalance !== undefined
          ? `${serverData?.message || "The return could not be created."} Refundable balance: ${formatMoney(
              refundableBalance,
              currency,
            )}.`
          : serverData?.message ||
              error?.message ||
              "Unable to return the unused wallet balance.",
      );

      /*
        Do not discard the request ID after a network/server
        uncertainty.

        Reusing the same amount will replay/reconcile the
        SAME durable refund request.
        */
    } finally {
      setWithdrawalLoading(false);
    }
  };

  /*=======================================================
  Ledger Filters
  =======================================================*/

  const handleLedgerType = (event) => {
    setLedgerPage(1);

    setLedgerType(event.target.value);
  };

  const handleLedgerProvider = (event) => {
    setLedgerPage(1);

    setLedgerProvider(event.target.value);
  };

  const handleLedgerSearch = (event) => {
    setLedgerPage(1);

    setLedgerSearch(event.target.value);
  };

  /*=======================================================
  Page Loading
  =======================================================*/

  const firstLoad =
    metrics === null &&
    subscription === null &&
    summaryLoading &&
    subscriptionLoading;

  useEffect(() => {
    if (!firstLoad && location.hash === "#subscription") {
      document.getElementById("subscription")?.scrollIntoView({ block: "start" });
    }
  }, [firstLoad, location.key, location.hash]);

  if (firstLoad) {
    return (
      <div
        className="relative flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center gap-4 overflow-hidden bg-canvas transition-colors duration-300"
      >
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[40vw] w-[40vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-subtle blur-[150px]"
        />

        <div className="relative z-10">
          <div
            className="absolute inset-0 animate-spin rounded-full border-t-2 border-line"
          />

          <Loader2
            className="animate-spin text-muted"
            size={40}
          />
        </div>

        <span
          className="relative z-10 animate-pulse text-xs font-bold tracking-normal text-action"
        >
          Synchronizing Wallet
        </span>
      </div>
    );
  }

  /*=======================================================
  Render
  =======================================================*/

  return (
    <>
      <div
        className="relative min-h-screen overflow-x-hidden bg-canvas pb-32 font-sans text-ink transition-colors duration-300 selection:bg-action selection:text-on-action"
      >
        {/*=================================================
        Ambient
        =================================================*/}

        <div
          className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        >

        </div>

        <div
          className="relative z-10 mx-auto max-w-[1450px] px-4 pt-10 sm:px-6 lg:px-10 lg:pt-12"
        >
          {/*=================================================
          Header
          =================================================*/}

          <div
            className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"
          >
            <div>
              <p
                className="mb-3 text-xs font-semibold tracking-normal text-action"
              >
                Billing
              </p>

              <h1
                className="font-semibold tracking-tight text-ink text-3xl sm:text-4xl"
              >
                Wallet{" "}
                <span
                  className="italic text-action"
                >
                  & Billing
                </span>
              </h1>
              <CreatorCreditBalance />

              <p
                className="mt-3 max-w-2xl text-xs leading-6 text-muted sm:text-sm"
              >
                View your balance, payment history, and membership.
              </p>
            </div>

            <button
              type="button"
              onClick={handleRefreshAll}
              className="inline-flex w-fit items-center gap-2 rounded-md border border-line bg-subtle px-5 py-3 text-xs font-semibold tracking-normal text-muted transition hover:border-line hover:text-action"
            >
              <RefreshCw
                size={13}
                className={
                  summaryLoading || subscriptionLoading || ledgerLoading
                    ? "animate-spin"
                    : ""
                }
              />
              Refresh
            </button>
          </div>

          {/*=================================================
          Global Notice
          =================================================*/}

          {notice && (
            <div
              className={`
                mb-8 flex items-start gap-3 rounded-md border p-4 text-xs leading-5

                ${
                  notice.type === "success"
                    ? "border-line bg-subtle text-action"
                    : "border-line bg-subtle text-action"
                }
              `}
            >
              {notice.type === "success" ? (
                <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
              ) : (
                <AlertCircle size={17} className="mt-0.5 shrink-0" />
              )}

              <span className="flex-1">{notice.message}</span>

              <button
                type="button"
                onClick={() => setNotice(null)}
                className="shrink-0 opacity-60 transition hover:opacity-100"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/*=================================================
          Summary Error
          =================================================*/}

          {summaryError && (
            <div
              className="mb-8 flex items-center justify-between gap-4 rounded-md border border-line bg-subtle p-4"
            >
              <div
                className="flex items-center gap-3 text-xs text-action"
              >
                <AlertCircle size={16} />

                {summaryError}
              </div>

              <button
                type="button"
                onClick={() => fetchSummary()}
                className="text-xs font-semibold tracking-widest text-muted hover:text-ink"
              >
                Retry
              </button>
            </div>
          )}

          {/*=================================================
          Primary Wallet Metrics
          =================================================*/}

          <MetricList label="Wallet balances" rows={[
            ["Available balance", formatMoney(wallet.available_balance, currency)],
            ["Active escrow", formatMoney(wallet.locked_escrow_balance, currency), activeEscrowCount + (activeEscrowCount === 1 ? " active booking" : " active bookings")],
            ["Pending return", formatMoney(wallet.pending_refund_balance, currency), "Awaiting Stripe"],
            ["Net booking spend", formatMoney(wallet.net_p2p_spend || wallet.total_lifespan_spend, currency), "After refunds"],
          ]} />

          {/*=================================================
          Wallet Actions + Lifetime Stats
          =================================================*/}

          <div
            className="mb-12 grid gap-5 lg:grid-cols-[1.2fr_1fr]"
          >
            <div
              className="rounded-md border border-line bg-surface p-4"
            >
              <div
                className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h2
                    className="font-sans text-2xl"
                  >
                    Wallet Actions
                  </h2>

                  <p
                    className="mt-2 max-w-xl text-xs leading-5 text-muted"
                  >
                    Fund your Creator wallet or return unused Stripe-funded
                    wallet value to its original payment source.
                  </p>
                </div>

                <ShieldCheck
                  size={28}
                  className="hidden text-action sm:block"
                />
              </div>

              <div
                className="mt-7 grid gap-3 sm:grid-cols-2"
              >
                <button
                  type="button"
                  onClick={() => {
                    setDepositError("");

                    setDepositOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 rounded-md bg-action px-5 py-4 text-xs font-semibold tracking-normal text-on-action transition hover:bg-action dark:hover:bg-surface"
                >
                  <CreditCard size={14} />
                  Add Funds
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setWithdrawalError("");

                    setWithdrawalOpen(true);
                  }}
                  disabled={availableBalance <= 0}
                  className="flex items-center justify-center gap-2 rounded-md border border-line bg-subtle px-5 py-4 text-xs font-semibold tracking-normal text-muted transition hover:border-line hover:text-action disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ArrowUpRight size={14} />
                  Return Unused Balance
                </button>
              </div>
            </div>

            <div
              className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-subtle sm:grid-cols-4 lg:grid-cols-2"
            >
              {[
                {
                  label: "Lifetime Deposited",
                  value: wallet.lifetime_deposited,
                },
                {
                  label: "Lifetime Returned",
                  value: wallet.lifetime_withdrawn,
                },
                {
                  label: "Wallet Total",
                  value: wallet.total_wallet_balance,
                },
                {
                  label: "Ledger Entries",
                  value: pagination.total,
                  count: true,
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-surface p-4"
                >
                  <p
                    className="text-xs font-semibold tracking-normal text-muted"
                  >
                    {stat.label}
                  </p>

                  <p
                    className="mt-2 font-serif text-xl text-ink"
                  >
                    {stat.count
                      ? Number(stat.value || 0).toLocaleString()
                      : formatMoney(stat.value, currency)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/*=================================================
          Subscription
          =================================================*/}

          <section
            id="subscription" aria-label="Subscription"
            className="mb-12 scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-surface"
          >
            <div
              className="relative border-b border-line bg-subtle p-6 sm:p-8"
            >
              <Crown
                size={130}
                strokeWidth={1}
                className="pointer-events-none absolute -right-7 -top-8 text-action opacity-[0.035]"
              />

              <div
                className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <p
                    className="text-xs font-semibold tracking-normal text-action"
                  >
                    Membership
                  </p>

                  <h2
                    className="mt-2 font-serif text-4xl tracking-tight"
                  >
                    Subscription
                  </h2>

                  <p
                    className="mt-3 max-w-xl text-xs leading-6 text-muted"
                  >
                    View your plan, compare creator benefits and manage billing.
                  </p>
                </div>

                {subscriptionLoading ? (
                  <Loader2
                    size={24}
                    className="animate-spin text-action"
                  />
                ) : subscription && (
                  <div
                    className="min-w-[240px] rounded-md border border-line bg-subtle p-4"
                  >
                    <div
                      className="flex items-start justify-between gap-4"
                    >
                      <div>
                        <p
                          className="text-xs font-semibold tracking-normal text-muted"
                        >
                          Current Plan
                        </p>

                        <p
                          className="mt-2 font-sans text-2xl"
                        >
                          {getSubscriptionPlanLabel(currentSubscription.membership_tier || currentSubscription.plan)}
                        </p>
                      </div>

                      <span
                        className={`
                          rounded-md border px-3 py-1.5 text-xs font-semibold tracking-widest

                          ${getSubscriptionStatusClasses(
                            currentSubscription.status,
                          )}
                        `}
                      >
                        {titleCase(currentSubscription.status)}
                      </span>
                    </div>

                    {currentSubscription.current_period_end && (
                      <div
                        className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-xs text-muted"
                      >
                        <CalendarDays size={12} className="text-action" />

                        {currentSubscription.cancel_at_period_end
                          ? "Active until"
                          : "Current period ends"}

                        <span className="text-ink dark:text-muted">
                          {formatDate(currentSubscription.current_period_end)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div
              className="p-4 sm:p-6"
            >
              {subscriptionError && (
                <div
                  className="mb-6 flex items-center justify-between gap-4 rounded-md border border-line bg-subtle p-4 text-xs text-action"
                >
                  <span>{subscriptionError}</span>

                  <button
                    type="button"
                    onClick={() =>
                      fetchSubscription({
                        refresh: true,
                      })
                    }
                    className="shrink-0 text-xs font-semibold tracking-widest"
                  >
                    Retry
                  </button>
                </div>
              )}

              {currentSubscription.needs_billing_attention && (
                <div
                  className="mb-6 flex items-start gap-3 rounded-md border border-line bg-subtle p-4 text-xs leading-5 text-action"
                >
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  Your Stripe subscription requires billing attention. Open
                  Billing Portal to review the payment method or invoice.
                </div>
              )}

              {currentSubscription.cancel_at_period_end && (
                <div
                  className="mb-6 rounded-md border border-line bg-subtle p-4 text-xs leading-5 text-muted"
                >
                  Cancellation is scheduled. Your current access remains
                  governed by Stripe until the end of the current billing
                  period.
                </div>
              )}

              {subscription && (
                <div className="mb-3 grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
                  {[{ plan: "free", amount: 0, currency: "USD" },
                    ...["basic","pro"].map(plan => subscription.offers?.find(offer => offer.plan === plan) ||
                      { plan, amount: plan === "basic" ? 50 : 100, currency: "USD" }),
                    ...(subscription.offers || []).filter(offer => !["basic","pro"].includes(offer.plan))
                  ].map(offer => {
                    const details = membershipCardDetails[offer.plan];
                    return (
                    <article key={offer.plan} className={`flex flex-col rounded-xl border border-line border-t-4 bg-surface p-6 sm:p-8 ${offer.plan === "pro" ? "border-t-[#547566]" : offer.plan === "free" ? "border-t-slate-400" : "border-t-[#b0966e]"}`}>
                      <div>
                        <h3 className="font-serif text-3xl">{getSubscriptionPlanLabel(offer.plan)}</h3>
                        {details && <p className="mt-2 text-sm leading-6 text-muted">{details.description}</p>}
                        <p className="my-5 flex flex-wrap items-baseline gap-2">
                          <strong className="text-3xl font-semibold tracking-tight">{new Intl.NumberFormat(undefined, { style: "currency", currency: offer.currency, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(offer.amount)}</strong>
                          <span className="text-sm text-muted">{offer.currency} / {{ free: "month", basic: "month", pro: "month", monthly: "month", quarterly: "3 months", yearly: "year" }[offer.plan]}</span>
                        </p>
                        {details && <ul className="mb-6 space-y-3 border-t border-line pt-5">
                          {details.benefits.map(benefit => <li key={benefit} className="flex items-start gap-3 text-sm"><CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0" />{benefit}</li>)}
                        </ul>}
                      </div>
                      {offer.plan === "free" ? (
                        <p className="mt-auto py-3 text-center text-sm font-semibold text-muted">Included with a creator account</p>
                      ) : <button type="button" disabled={Boolean(checkoutPlanLoading) || !offer.price_id || !subscription.signups_enabled} onClick={() => handleSubscribe(offer)}
                        aria-label={`Subscribe to the ${offer.plan} plan`}
                        className="mt-auto min-h-11 rounded-lg bg-action px-4 text-sm font-semibold text-on-action disabled:opacity-50">
                        {!offer.price_id || !subscription.signups_enabled ? "Signup unavailable" : checkoutPlanLoading === offer.plan ? "Opening checkout..." : "Subscribe"}
                      </button>}
                    </article>
                    );
                  })}
                  <article className="rounded-xl border border-line bg-surface p-6 sm:p-8">
                    <h3 className="text-xl font-semibold">Enterprise</h3>
                    <p className="my-5 text-2xl font-semibold">Custom pricing</p>
                    <p className="text-sm text-muted">Terms tailored to your team, including your own branding. Save 35% on the full design price of each eligible booking of $10,000 or more.</p>
                  </article>
                  {subscription.signups_enabled && !subscription.offers?.length && <p className="p-3 text-sm">Subscription prices are unavailable. <button type="button" className="underline" onClick={() => fetchSubscription({ refresh: true })}>Retry</button></p>}
                </div>
              )}
              {subscription && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted">
                    {currentSubscription.can_manage_billing
                      ? "Review invoices, update your payment method or manage your subscription in Stripe."
                      : currentSubscription.signups_enabled === false ? "New subscriptions are currently paused." : ""}
                  </p>
                  {currentSubscription.can_manage_billing && (
                    <button type="button" onClick={handleManageBilling} disabled={portalLoading}
                      className="inline-flex h-9 items-center gap-2 rounded-md bg-action px-3 text-sm text-on-action">
                      <ExternalLink size={16} />{portalLoading ? "Opening billing…" : "Manage billing"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/*=================================================
          Ledger
          =================================================*/}

          <section
            className="overflow-hidden rounded-md border border-line bg-surface"
          >
            <div
              className="border-b border-line bg-subtle p-4"
            >
              <div
                className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"
              >
                <div
                  className="flex items-center gap-4"
                >
                  <div
                    className="grid h-11 w-11 place-items-center rounded-md border border-line bg-surface dark:bg-canvas"
                  >
                    <FileText size={17} className="text-action" />
                  </div>

                  <div>
                    <h2
                      className="font-serif text-xl"
                    >
                      Transaction History
                    </h2>

                    <p
                      className="mt-1 text-xs font-bold tracking-normal text-muted"
                    >
                      {pagination.total} recorded{" "}
                      {pagination.total === 1 ? "transaction" : "transactions"}
                    </p>
                  </div>
                </div>

                <div
                  className="grid gap-2 sm:grid-cols-3 xl:min-w-[650px]"
                >
                  <label
                    className="relative"
                  >
                    <span className="sr-only">Search transactions</span>

                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                    />

                    <input
                      type="search"
                      value={ledgerSearch}
                      onChange={handleLedgerSearch}
                      maxLength={100}
                      placeholder="Search ledger"
                      className="w-full rounded-md border border-line bg-surface dark:bg-canvas py-3 pl-9 pr-3 text-xs text-ink outline-none placeholder:text-muted focus:border-line"
                    />
                  </label>

                  <select
                    value={ledgerType}
                    onChange={handleLedgerType}
                    className="rounded-md border border-line bg-surface dark:bg-canvas px-3 py-3 text-xs text-muted outline-none"
                  >
                    {LEDGER_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={ledgerProvider}
                    onChange={handleLedgerProvider}
                    className="rounded-md border border-line bg-surface dark:bg-canvas px-3 py-3 text-xs text-muted outline-none"
                  >
                    {LEDGER_PROVIDERS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {ledgerError && (
              <div
                className="m-5 flex items-center justify-between gap-4 rounded-md border border-line bg-subtle p-4 text-xs text-action"
              >
                <span>{ledgerError}</span>

                <button
                  type="button"
                  onClick={() => fetchLedger()}
                  className="text-xs font-semibold tracking-widest"
                >
                  Retry
                </button>
              </div>
            )}

            {ledgerLoading ? (
              <div
                className="flex min-h-[300px] items-center justify-center"
              >
                <Loader2
                  size={28}
                  className="animate-spin text-action"
                />
              </div>
            ) : ledger.length === 0 ? (
              <div
                className="flex min-h-[300px] flex-col items-center justify-center gap-4 p-4 text-center"
              >
                <div
                  className="grid h-16 w-16 place-items-center rounded-full border border-line bg-canvas dark:bg-surface"
                >
                  <Sparkles size={24} className="text-muted" />
                </div>

                <p
                  className="text-xs font-semibold tracking-normal text-muted"
                >
                  No matching transactions found
                </p>
              </div>
            ) : (
              <>
                {/*=========================================
                Mobile Ledger
                =========================================*/}

                <div
                  className="divide-y divide-line md:hidden"
                >
                  {ledger.map((transaction) => {
                    const direction = transaction?.direction || "informational";

                    const reference = getTransactionReference(transaction);

                    return (
                      <article
                        key={transaction.transaction_id}
                        className="space-y-4 p-4"
                      >
                        <div
                          className="flex items-start justify-between gap-4"
                        >
                          <div className="min-w-0">
                            <span
                              className={`
                                  inline-flex rounded-md border px-2.5 py-1.5 text-xs font-semibold tracking-normal

                                  ${getDirectionBadgeClasses(direction)}
                                `}
                            >
                              {getDirectionLabel(direction)}
                            </span>

                            <h3
                              className="mt-3 font-serif text-lg"
                            >
                              {transaction.transaction_label ||
                                titleCase(transaction.transaction_type)}
                            </h3>

                            <p
                              className="mt-1 truncate text-xs text-muted"
                            >
                              {transaction.counterparty_name ||
                                "Platform / Stripe"}
                            </p>
                          </div>

                          <p
                            className={`
                                shrink-0 font-mono text-base font-semibold

                                ${getDirectionAmountClasses(direction)}
                              `}
                          >
                            {getDirectionAmountPrefix(direction)}
                            {formatMoney(
                              transaction.gross_amount,
                              transaction.currency,
                            )}
                          </p>
                        </div>

                        <div
                          className="grid grid-cols-2 gap-3 rounded-md bg-subtle p-3 text-xs"
                        >
                          <div>
                            <p
                              className="tracking-widest text-muted"
                            >
                              Provider
                            </p>

                            <p
                              className="mt-1 text-muted"
                            >
                              {getProviderLabel(transaction)}
                            </p>
                          </div>

                          <div>
                            <p
                              className="tracking-widest text-muted"
                            >
                              Date
                            </p>

                            <p
                              className="mt-1 text-muted"
                            >
                              {formatDate(transaction.created_at)}
                            </p>
                          </div>

                          <div
                            className="col-span-2"
                          >
                            <p
                              className="tracking-widest text-muted"
                            >
                              Reference
                            </p>

                            <p
                              className="mt-1 break-all font-mono text-muted"
                            >
                              {shortenReference(reference, 30)}
                            </p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/*=========================================
                Desktop Ledger
                =========================================*/}

                <div
                  className="hidden overflow-x-auto md:block"
                >
                  <table
                    className="w-full border-collapse text-left"
                  >
                    <thead>
                      <tr
                        className="border-b border-line bg-surface dark:bg-canvas text-xs font-semibold tracking-normal text-muted"
                      >
                        <th className="px-7 py-5">Transaction</th>

                        <th className="px-7 py-5">Counterparty</th>

                        <th className="px-7 py-5">Date</th>

                        <th className="px-7 py-5">Provider / Reference</th>

                        <th
                          className="px-7 py-5 text-right"
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>

                    <tbody
                      className="divide-y divide-line"
                    >
                      {ledger.map((transaction) => {
                        const direction =
                          transaction?.direction || "informational";

                        const reference = getTransactionReference(transaction);

                        return (
                          <tr
                            key={transaction.transaction_id}
                            className="transition hover:bg-canvas dark:hover:bg-surface"
                          >
                            <td className="px-7 py-5">
                              <span
                                className={`
                                    inline-flex rounded-md border px-2.5 py-1.5 text-xs font-semibold tracking-normal

                                    ${getDirectionBadgeClasses(direction)}
                                  `}
                              >
                                {transaction.transaction_label ||
                                  titleCase(transaction.transaction_type)}
                              </span>

                              <p
                                className="mt-2 font-mono text-xs text-muted"
                              >
                                ID:{" "}
                                {shortenReference(
                                  transaction.transaction_id,
                                  14,
                                )}
                              </p>
                            </td>

                            <td
                              className="px-7 py-5 font-serif text-sm text-ink dark:text-muted"
                            >
                              {transaction.counterparty_name ||
                                "Platform / Stripe"}
                            </td>

                            <td
                              className="px-7 py-5 text-xs text-muted"
                            >
                              {formatDateTime(transaction.created_at)}
                            </td>

                            <td className="px-7 py-5">
                              <p
                                className="mb-1 text-xs font-semibold tracking-widest text-muted"
                              >
                                {getProviderLabel(transaction)}
                              </p>

                              <span
                                title={reference || ""}
                                className="inline-block max-w-[230px] truncate rounded-md border border-line bg-surface dark:bg-canvas px-3 py-1.5 font-mono text-xs text-muted"
                              >
                                {shortenReference(reference, 24)}
                              </span>
                            </td>

                            <td
                              className={`
                                  px-7 py-5 text-right font-mono text-base font-semibold

                                  ${getDirectionAmountClasses(direction)}
                                `}
                            >
                              {getDirectionAmountPrefix(direction)}
                              {formatMoney(
                                transaction.gross_amount,
                                transaction.currency,
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/*=========================================
                Pagination
                =========================================*/}

                <div
                  className="flex flex-col gap-4 border-t border-line p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p
                    className="text-xs font-bold tracking-normal text-muted"
                  >
                    Page {pagination.page} of{" "}
                    {Math.max(pagination.totalPages, 1)}
                  </p>

                  <div
                    className="flex gap-2"
                  >
                    <button
                      type="button"
                      disabled={!pagination.hasPreviousPage || ledgerLoading}
                      onClick={() =>
                        setLedgerPage((current) => Math.max(1, current - 1))
                      }
                      className="flex items-center gap-1.5 rounded-md border border-line bg-subtle px-4 py-2.5 text-xs font-semibold tracking-widest text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronLeft size={12} />
                      Previous
                    </button>

                    <button
                      type="button"
                      disabled={!pagination.hasNextPage || ledgerLoading}
                      onClick={() => setLedgerPage((current) => current + 1)}
                      className="flex items-center gap-1.5 rounded-md border border-line bg-subtle px-4 py-2.5 text-xs font-semibold tracking-widest text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Next
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {/*===================================================
      Add Funds Modal
      ===================================================*/}

      <WalletModal
        open={depositOpen}
        title="Add Wallet Funds"
        subtitle="Stripe securely processes your card. Wallet credit occurs only after the signed Stripe success webhook is verified."
        onClose={() => {
          if (depositLoading) {
            return;
          }

          setDepositOpen(false);
        }}
      >
        <form onSubmit={handleDeposit} className="space-y-5">
          <label className="block">
            <span
              className="mb-2 block text-xs font-semibold tracking-normal text-muted"
            >
              Deposit Amount
            </span>

            <div className="relative">
              <span
                className="absolute left-4 top-1/2 -translate-y-1/2 font-serif text-lg text-action"
              >
                $
              </span>

              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={depositAmount}
                disabled={depositLoading}
                onChange={(event) => {
                  setDepositAmount(event.target.value);

                  setDepositError("");
                }}
                placeholder="50.00"
                className="w-full rounded-md border border-line bg-surface dark:bg-canvas py-4 pl-10 pr-4 text-ink outline-none focus:border-line"
              />
            </div>
          </label>

          <div>
            <span
              className="mb-2 block text-xs font-semibold tracking-normal text-muted"
            >
              Card
            </span>

            <div
              className="min-h-[54px] rounded-md border border-line bg-surface dark:bg-canvas px-4 py-[17px]"
            >
              {stripeElementsEnabled ? (
                <CardElement options={cardElementOptions} />
              ) : (
                <p
                  className="text-xs text-action"
                >
                  Card payments are temporarily unavailable. Please try again later.
                </p>
              )}
            </div>
          </div>

          {depositError && (
            <div
              className="flex items-start gap-2 rounded-md border border-line bg-subtle p-3 text-xs leading-5 text-action"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" />

              {depositError}
            </div>
          )}

          <div
            className="rounded-md border border-line bg-subtle p-4 text-xs leading-5 text-muted"
          >
            Wallet deposits are separate from subscription payments. Unused
            eligible wallet funds may later be returned only to their original
            refundable Stripe funding sources.
          </div>

          <button
            type="submit"
            disabled={depositLoading || !stripeElementsEnabled}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-action py-4 text-xs font-semibold tracking-normal text-on-action transition hover:bg-action dark:hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {depositLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CreditCard size={14} />
            )}

            {depositLoading ? "Processing Securely" : "Add Funds"}
          </button>
        </form>
      </WalletModal>

      {/*===================================================
      Return Unused Balance Modal
      ===================================================*/}

      <WalletModal
        open={withdrawalOpen}
        title="Return Unused Balance"
        subtitle="This is not a cash payout. Eligible unused wallet funds are returned to their original Stripe funding sources."
        onClose={() => {
          if (withdrawalLoading) {
            return;
          }

          setWithdrawalOpen(false);
        }}
      >
        <form onSubmit={handleWithdrawal} className="space-y-5">
          <div
            className="rounded-md border border-line bg-canvas dark:bg-surface p-4"
          >
            <p
              className="text-xs font-semibold tracking-normal text-muted"
            >
              Available Wallet Balance
            </p>

            <p
              className="mt-2 font-sans text-2xl text-ink"
            >
              {formatMoney(wallet.available_balance, currency)}
            </p>
          </div>

          <label className="block">
            <span
              className="mb-2 block text-xs font-semibold tracking-normal text-muted"
            >
              Amount to Return
            </span>

            <div className="relative">
              <span
                className="absolute left-4 top-1/2 -translate-y-1/2 font-serif text-lg text-action"
              >
                $
              </span>

              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={withdrawalAmount}
                disabled={withdrawalLoading}
                onChange={(event) => {
                  setWithdrawalAmount(event.target.value);

                  setWithdrawalError("");
                }}
                placeholder="25.00"
                className="w-full rounded-md border border-line bg-surface dark:bg-canvas py-4 pl-10 pr-4 text-ink outline-none focus:border-line"
              />
            </div>
          </label>

          {withdrawalError && (
            <div
              className="flex items-start gap-2 rounded-md border border-line bg-subtle p-3 text-xs leading-5 text-action"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" />

              {withdrawalError}
            </div>
          )}

          <div
            className="rounded-md border border-line bg-subtle p-4 text-xs leading-5 text-muted"
          >
            Only eligible funds can be returned to the original payment method. We’ll check the refundable amount when you submit your request.
          </div>

          <button
            type="submit"
            disabled={withdrawalLoading || availableBalance <= 0}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-action py-4 text-xs font-semibold tracking-normal text-on-action transition hover:bg-action dark:hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {withdrawalLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ArrowDownLeft size={14} />
            )}

            {withdrawalLoading
              ? "Processing / Reconciling"
              : "Return Unused Balance"}
          </button>
        </form>
      </WalletModal>
    </>
  );
}

/*=========================================================
Stripe Elements Bridge
=========================================================*/

function CreatorWalletStripeBridge() {
  const stripe = useStripe();

  const elements = useElements();

  return (
    <CreatorWalletCore
      stripe={stripe}
      elements={elements}
      stripeElementsEnabled={Boolean(stripePromise)}
    />
  );
}

/*=========================================================
Export

Subscription Checkout and Billing Portal do NOT require
Stripe Elements.

Only wallet card deposits require Stripe Elements.

Therefore if the frontend publishable key is accidentally
missing, the Wallet page still loads and subscription
management still works; Add Funds displays a configuration
warning instead of crashing the whole finance page.
=========================================================*/

export default function CreatorWallet() {
  if (!stripePromise) {
    return (
      <CreatorWalletCore
        stripe={null}
        elements={null}
        stripeElementsEnabled={false}
      />
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <CreatorWalletStripeBridge />
    </Elements>
  );
}
