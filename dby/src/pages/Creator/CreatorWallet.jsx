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
  Zap,
} from "lucide-react";

import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import { loadStripe } from "@stripe/stripe-js";

import API from "../../api/axios";

import { useTheme } from "../../context/ThemeContext";

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

const SUBSCRIPTION_PLANS = [
  {
    id: "monthly",
    name: "Monthly",
    description: "Flexible month-to-month Creator membership.",
  },
  {
    id: "quarterly",
    name: "Quarterly",
    description: "Creator membership billed every three months.",
  },
  {
    id: "yearly",
    name: "Yearly",
    description: "Annual Creator membership through Stripe.",
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
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";

    case "debit":
      return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400";

    case "internal_release":
      return "border-[#D4AF37]/20 bg-[#D4AF37]/10 text-[#D4AF37]";

    default:
      return "border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/50";
  }
}

function getDirectionAmountClasses(direction) {
  switch (direction) {
    case "credit":
      return "text-emerald-700 dark:text-emerald-400";

    case "debit":
      return "text-rose-700 dark:text-rose-400";

    default:
      return "text-[#D4AF37]";
  }
}

/*=========================================================
Subscription Helpers
=========================================================*/

function getSubscriptionPlanLabel(plan) {
  switch (plan) {
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
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";

    case "past_due":
    case "incomplete":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";

    case "unpaid":
      return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400";

    case "canceled":
    case "incomplete_expired":
      return "border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/45";

    default:
      return "border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/45";
  }
}

function canStartNewSubscription(subscription) {
  const status = String(subscription?.status || "free").toLowerCase();

  return ["free", "canceled", "incomplete_expired"].includes(status);
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
      className="
        fixed
        inset-0
        z-[100]
        flex
        items-center
        justify-center
        bg-black/50 dark:bg-black/80
        p-4
        backdrop-blur-md
      "
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="
          w-full
          max-w-lg
          overflow-hidden
          rounded-[2rem]
          border
          border-slate-200 dark:border-white/10
          bg-white dark:bg-[#0a0a0a]
          shadow-2xl
          shadow-slate-300/50
          dark:shadow-[0_40px_120px_rgba(0,0,0,0.8)]
        "
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          className="
            flex
            items-start
            justify-between
            gap-4
            border-b
            border-slate-200/80 dark:border-white/5
            p-6
          "
        >
          <div>
            <h2
              className="
                font-serif
                text-2xl
                text-slate-900 dark:text-white
              "
            >
              {title}
            </h2>

            <p
              className="
                mt-2
                text-xs
                leading-5
                text-slate-500 dark:text-white/45
              "
            >
              {subtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="
              grid
              h-10
              w-10
              shrink-0
              place-items-center
              rounded-full
              border
              border-slate-200 dark:border-white/10
              bg-slate-100 dark:bg-white/5
              text-slate-500 dark:text-white/50
              transition

              hover:bg-slate-200 dark:hover:bg-white/10
              hover:text-slate-950 dark:hover:text-white
            "
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6">{children}</div>
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

  const subscriptionRequestRef = useRef(null);

  /*=======================================================
  Derived
  =======================================================*/

  const wallet = metrics || EMPTY_SUMMARY;

  const currentSubscription = subscription || EMPTY_SUBSCRIPTION;

  const currency = wallet.currency || "usd";

  const availableBalance = safeNumber(wallet.available_balance);

  const activeEscrowCount =
    Number.parseInt(wallet.active_escrow_count, 10) || 0;

  const subscriptionCanStart = canStartNewSubscription(currentSubscription);

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
          params: refresh
            ? {
                refresh: 1,
              }
            : undefined,

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
  Subscription Checkout
  =======================================================*/

  const handleSubscribe = async (plan) => {
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

  /*=======================================================
  Billing Portal
  =======================================================*/

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

  if (firstLoad) {
    return (
      <div
        className="
          relative
          flex
          min-h-[calc(100vh-5rem)]
          flex-col
          items-center
          justify-center
          gap-4
          overflow-hidden
          bg-slate-50
          transition-colors
          duration-300
          dark:bg-[#030303]
        "
      >
        <div
          className="
            pointer-events-none
            absolute
            left-1/2
            top-1/2
            h-[40vw]
            w-[40vw]
            -translate-x-1/2
            -translate-y-1/2
            rounded-full
            bg-[#D4AF37]/5
            blur-[150px]
          "
        />

        <div className="relative z-10">
          <div
            className="
              absolute
              inset-0
              animate-spin
              rounded-full
              border-t-2
              border-[#D4AF37]
            "
          />

          <Loader2
            className="
              animate-spin
              text-slate-300 dark:text-white/20
            "
            size={40}
          />
        </div>

        <span
          className="
            relative
            z-10
            animate-pulse
            text-[10px]
            font-bold
            uppercase
            tracking-[0.3em]
            text-[#D4AF37]
          "
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
        className="
          relative
          min-h-screen
          overflow-x-hidden
          bg-slate-50
          pb-32
          font-sans
          text-slate-900
          transition-colors
          duration-300
          dark:bg-[#030303]
          dark:text-white
          selection:bg-[#D4AF37]
          selection:text-black
        "
      >
        {/*=================================================
        Ambient
        =================================================*/}

        <div
          className="
            pointer-events-none
            fixed
            inset-0
            z-0
            overflow-hidden
          "
        >
          <div
            className="
              absolute
              -right-[5%]
              -top-[10%]
              h-[40vw]
              w-[40vw]
              rounded-full
              bg-[#D4AF37]/5
              blur-[150px]
            "
          />

          <div
            className="
              absolute
              -bottom-[20%]
              -left-[10%]
              h-[40vw]
              w-[40vw]
              rounded-full
              bg-indigo-500/[0.03]
              blur-[150px]
            "
          />
        </div>

        <div
          className="
            relative
            z-10
            mx-auto
            max-w-[1450px]
            px-4
            pt-10

            sm:px-6

            lg:px-10
            lg:pt-12
          "
        >
          {/*=================================================
          Header
          =================================================*/}

          <div
            className="
              mb-10
              flex
              flex-col
              gap-6

              lg:flex-row
              lg:items-end
              lg:justify-between
            "
          >
            <div>
              <p
                className="
                  mb-3
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.3em]
                  text-[#D4AF37]
                "
              >
                Creator Finance
              </p>

              <h1
                className="
                  font-serif
                  text-4xl
                  font-light
                  tracking-tight
                  text-slate-900 dark:text-white

                  md:text-5xl
                "
              >
                Wallet{" "}
                <span
                  className="
                    italic
                    text-[#D4AF37]
                  "
                >
                  & Billing
                </span>
              </h1>

              <p
                className="
                  mt-3
                  max-w-2xl
                  text-xs
                  leading-6
                  text-slate-500 dark:text-white/45

                  sm:text-sm
                "
              >
                Manage wallet funds, booking escrow, subscription billing, and
                your verified transaction history.
              </p>
            </div>

            <button
              type="button"
              onClick={handleRefreshAll}
              className="
                inline-flex
                w-fit
                items-center
                gap-2
                rounded-full
                border
                border-slate-200 dark:border-white/10
                bg-slate-100 dark:bg-white/5
                px-5
                py-3
                text-[9px]
                font-black
                uppercase
                tracking-[0.18em]
                text-slate-600 dark:text-white/60
                transition

                hover:border-[#D4AF37]/30
                hover:text-[#D4AF37]
              "
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
                mb-8
                flex
                items-start
                gap-3
                rounded-2xl
                border
                p-4
                text-xs
                leading-5

                ${
                  notice.type === "success"
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-[#D4AF37]/20 bg-[#D4AF37]/10 text-amber-700 dark:text-[#e9d181]"
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
                className="
                  shrink-0
                  opacity-60
                  transition
                  hover:opacity-100
                "
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
              className="
                mb-8
                flex
                items-center
                justify-between
                gap-4
                rounded-2xl
                border
                border-rose-500/20
                bg-rose-500/5
                p-4
              "
            >
              <div
                className="
                  flex
                  items-center
                  gap-3
                  text-xs
                  text-rose-700 dark:text-rose-300
                "
              >
                <AlertCircle size={16} />

                {summaryError}
              </div>

              <button
                type="button"
                onClick={() => fetchSummary()}
                className="
                  text-[9px]
                  font-black
                  uppercase
                  tracking-widest
                  text-slate-600 dark:text-white/60
                  hover:text-slate-950 dark:hover:text-white
                "
              >
                Retry
              </button>
            </div>
          )}

          {/*=================================================
          Primary Wallet Metrics
          =================================================*/}

          <div
            className="
              mb-8
              grid
              grid-cols-1
              gap-5

              sm:grid-cols-2

              xl:grid-cols-4
            "
          >
            {/* Available */}

            <div
              className="
                group
                relative
                overflow-hidden
                rounded-3xl
                border
                border-[#D4AF37]/20
                bg-slate-50 dark:bg-[#111]
                p-7
                shadow-2xl
              "
            >
              <WalletCards
                size={110}
                strokeWidth={1}
                className="
                  pointer-events-none
                  absolute
                  -right-5
                  -top-4
                  rotate-12
                  text-[#D4AF37]
                  opacity-[0.05]
                  transition
                  duration-700

                  group-hover:scale-110
                "
              />

              <div className="relative z-10">
                <p
                  className="
                    mb-4
                    text-[9px]
                    font-black
                    uppercase
                    tracking-[0.2em]
                    text-[#D4AF37]
                  "
                >
                  Available Balance
                </p>

                <p
                  className="
                    font-serif
                    text-4xl
                    tracking-tight
                  "
                >
                  {formatMoney(wallet.available_balance, currency)}
                </p>

                <p
                  className="
                    mt-2
                    text-[9px]
                    uppercase
                    tracking-widest
                    text-slate-500 dark:text-white/35
                  "
                >
                  Ready for bookings
                </p>
              </div>
            </div>

            {/* Escrow */}

            <div
              className="
                group
                relative
                overflow-hidden
                rounded-3xl
                border
                border-slate-200/80 dark:border-white/5
                bg-white dark:bg-[#0a0a0a]
                p-7
                shadow-2xl
              "
            >
              <ShieldCheck
                size={110}
                strokeWidth={1}
                className="
                  pointer-events-none
                  absolute
                  -right-5
                  -top-4
                  text-indigo-500 dark:text-indigo-400
                  opacity-[0.035]
                "
              />

              <p
                className="
                  mb-4
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.2em]
                  text-slate-500 dark:text-white/40
                "
              >
                Active Escrow
              </p>

              <p
                className="
                  font-serif
                  text-4xl
                  tracking-tight
                "
              >
                {formatMoney(wallet.locked_escrow_balance, currency)}
              </p>

              <p
                className="
                  mt-2
                  text-[9px]
                  uppercase
                  tracking-widest
                  text-indigo-600 dark:text-indigo-300/70
                "
              >
                {activeEscrowCount}{" "}
                {activeEscrowCount === 1 ? "active booking" : "active bookings"}
              </p>
            </div>

            {/* Pending Return */}

            <div
              className="
                relative
                overflow-hidden
                rounded-3xl
                border
                border-slate-200/80 dark:border-white/5
                bg-white dark:bg-[#0a0a0a]
                p-7
                shadow-2xl
              "
            >
              <RotateCcw
                size={110}
                strokeWidth={1}
                className="
                  pointer-events-none
                  absolute
                  -right-5
                  -top-4
                  text-rose-700 dark:text-rose-400
                  opacity-[0.03]
                "
              />

              <p
                className="
                  mb-4
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.2em]
                  text-slate-500 dark:text-white/40
                "
              >
                Pending Return
              </p>

              <p
                className="
                  font-serif
                  text-4xl
                  tracking-tight
                "
              >
                {formatMoney(wallet.pending_refund_balance, currency)}
              </p>

              <p
                className="
                  mt-2
                  text-[9px]
                  uppercase
                  tracking-widest
                  text-slate-500 dark:text-white/35
                "
              >
                Awaiting Stripe
              </p>
            </div>

            {/* Booking Spend */}

            <div
              className="
                relative
                overflow-hidden
                rounded-3xl
                border
                border-slate-200/80 dark:border-white/5
                bg-white dark:bg-[#0a0a0a]
                p-7
                shadow-2xl
              "
            >
              <CircleDollarSign
                size={110}
                strokeWidth={1}
                className="
                  pointer-events-none
                  absolute
                  -right-5
                  -top-4
                  text-slate-900 dark:text-white
                  opacity-[0.025]
                "
              />

              <p
                className="
                  mb-4
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.2em]
                  text-slate-500 dark:text-white/40
                "
              >
                Net Booking Spend
              </p>

              <p
                className="
                  font-serif
                  text-4xl
                  tracking-tight
                "
              >
                {formatMoney(
                  wallet.net_p2p_spend || wallet.total_lifespan_spend,
                  currency,
                )}
              </p>

              <p
                className="
                  mt-2
                  text-[9px]
                  uppercase
                  tracking-widest
                  text-slate-500 dark:text-white/35
                "
              >
                After booking refunds
              </p>
            </div>
          </div>

          {/*=================================================
          Wallet Actions + Lifetime Stats
          =================================================*/}

          <div
            className="
              mb-12
              grid
              gap-5

              lg:grid-cols-[1.2fr_1fr]
            "
          >
            <div
              className="
                rounded-3xl
                border
                border-slate-200/80 dark:border-white/5
                bg-white dark:bg-[#0a0a0a]
                p-6
                shadow-2xl

                sm:p-7
              "
            >
              <div
                className="
                  flex
                  flex-col
                  gap-5

                  sm:flex-row
                  sm:items-center
                  sm:justify-between
                "
              >
                <div>
                  <h2
                    className="
                      font-serif
                      text-2xl
                    "
                  >
                    Wallet Actions
                  </h2>

                  <p
                    className="
                      mt-2
                      max-w-xl
                      text-xs
                      leading-5
                      text-slate-500 dark:text-white/40
                    "
                  >
                    Fund your Creator wallet or return unused Stripe-funded
                    wallet value to its original payment source.
                  </p>
                </div>

                <ShieldCheck
                  size={28}
                  className="
                    hidden
                    text-[#D4AF37]

                    sm:block
                  "
                />
              </div>

              <div
                className="
                  mt-7
                  grid
                  gap-3

                  sm:grid-cols-2
                "
              >
                <button
                  type="button"
                  onClick={() => {
                    setDepositError("");

                    setDepositOpen(true);
                  }}
                  className="
                    flex
                    items-center
                    justify-center
                    gap-2
                    rounded-xl
                    bg-[#D4AF37]
                    px-5
                    py-4
                    text-[9px]
                    font-black
                    uppercase
                    tracking-[0.18em]
                    text-black
                    transition

                    hover:bg-slate-100 dark:hover:bg-white
                  "
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
                  className="
                    flex
                    items-center
                    justify-center
                    gap-2
                    rounded-xl
                    border
                    border-slate-200 dark:border-white/10
                    bg-slate-100 dark:bg-white/5
                    px-5
                    py-4
                    text-[9px]
                    font-black
                    uppercase
                    tracking-[0.18em]
                    text-slate-600 dark:text-white/70
                    transition

                    hover:border-[#D4AF37]/30
                    hover:text-[#D4AF37]

                    disabled:cursor-not-allowed
                    disabled:opacity-35
                  "
                >
                  <ArrowUpRight size={14} />
                  Return Unused Balance
                </button>
              </div>
            </div>

            <div
              className="
                grid
                grid-cols-2
                gap-px
                overflow-hidden
                rounded-3xl
                border
                border-slate-200/80 dark:border-white/5
                bg-slate-100 dark:bg-white/5
                shadow-2xl

                sm:grid-cols-4

                lg:grid-cols-2
              "
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
                  className="
                      bg-white dark:bg-[#0a0a0a]
                      p-5
                    "
                >
                  <p
                    className="
                        text-[8px]
                        font-black
                        uppercase
                        tracking-[0.15em]
                        text-slate-500 dark:text-white/35
                      "
                  >
                    {stat.label}
                  </p>

                  <p
                    className="
                        mt-2
                        font-serif
                        text-xl
                        text-slate-900 dark:text-white
                      "
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
            className="
              mb-12
              overflow-hidden
              rounded-[2rem]
              border
              border-[#D4AF37]/20
              bg-white dark:bg-[#0a0a0a]
              shadow-xl
              shadow-slate-200/60
              dark:shadow-[0_25px_70px_rgba(0,0,0,0.5)]
            "
          >
            <div
              className="
                relative
                border-b
                border-slate-200/80 dark:border-white/5
                bg-gradient-to-r
                from-[#D4AF37]/10
                to-transparent
                p-6

                sm:p-8
              "
            >
              <Crown
                size={130}
                strokeWidth={1}
                className="
                  pointer-events-none
                  absolute
                  -right-7
                  -top-8
                  text-[#D4AF37]
                  opacity-[0.035]
                "
              />

              <div
                className="
                  relative
                  z-10
                  flex
                  flex-col
                  gap-6

                  lg:flex-row
                  lg:items-center
                  lg:justify-between
                "
              >
                <div>
                  <p
                    className="
                      text-[9px]
                      font-black
                      uppercase
                      tracking-[0.28em]
                      text-[#D4AF37]
                    "
                  >
                    Creator Membership
                  </p>

                  <h2
                    className="
                      mt-2
                      font-serif
                      text-3xl
                    "
                  >
                    Subscription
                  </h2>

                  <p
                    className="
                      mt-3
                      max-w-xl
                      text-xs
                      leading-6
                      text-slate-500 dark:text-white/45
                    "
                  >
                    Subscribe securely through Stripe and manage billing,
                    invoices, payment methods, and cancellation through Stripe
                    Billing Portal.
                  </p>
                </div>

                {subscriptionLoading ? (
                  <Loader2
                    size={24}
                    className="
                      animate-spin
                      text-[#D4AF37]
                    "
                  />
                ) : (
                  <div
                    className="
                      min-w-[240px]
                      rounded-2xl
                      border
                      border-slate-200 dark:border-white/10
                      bg-slate-100/80 dark:bg-black/20
                      p-5
                    "
                  >
                    <div
                      className="
                        flex
                        items-start
                        justify-between
                        gap-4
                      "
                    >
                      <div>
                        <p
                          className="
                            text-[8px]
                            font-black
                            uppercase
                            tracking-[0.18em]
                            text-slate-500 dark:text-white/35
                          "
                        >
                          Current Plan
                        </p>

                        <p
                          className="
                            mt-2
                            font-serif
                            text-2xl
                          "
                        >
                          {getSubscriptionPlanLabel(currentSubscription.plan)}
                        </p>
                      </div>

                      <span
                        className={`
                          rounded-full
                          border
                          px-3
                          py-1.5
                          text-[8px]
                          font-black
                          uppercase
                          tracking-widest

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
                        className="
                          mt-4
                          flex
                          items-center
                          gap-2
                          border-t
                          border-slate-200/80 dark:border-white/5
                          pt-4
                          text-[9px]
                          text-slate-500 dark:text-white/45
                        "
                      >
                        <CalendarDays size={12} className="text-[#D4AF37]" />

                        {currentSubscription.cancel_at_period_end
                          ? "Active until"
                          : "Current period ends"}

                        <span className="text-slate-700 dark:text-white/75">
                          {formatDate(currentSubscription.current_period_end)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div
              className="
                p-6

                sm:p-8
              "
            >
              {subscriptionError && (
                <div
                  className="
                    mb-6
                    flex
                    items-center
                    justify-between
                    gap-4
                    rounded-xl
                    border
                    border-rose-500/20
                    bg-rose-500/5
                    p-4
                    text-xs
                    text-rose-700 dark:text-rose-300
                  "
                >
                  <span>{subscriptionError}</span>

                  <button
                    type="button"
                    onClick={() =>
                      fetchSubscription({
                        refresh: true,
                      })
                    }
                    className="
                      shrink-0
                      text-[8px]
                      font-black
                      uppercase
                      tracking-widest
                    "
                  >
                    Retry
                  </button>
                </div>
              )}

              {currentSubscription.needs_billing_attention && (
                <div
                  className="
                    mb-6
                    flex
                    items-start
                    gap-3
                    rounded-xl
                    border
                    border-amber-500/20
                    bg-amber-500/10
                    p-4
                    text-xs
                    leading-5
                    text-amber-700 dark:text-amber-200
                  "
                >
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  Your Stripe subscription requires billing attention. Open
                  Billing Portal to review the payment method or invoice.
                </div>
              )}

              {currentSubscription.cancel_at_period_end && (
                <div
                  className="
                    mb-6
                    rounded-xl
                    border
                    border-slate-200 dark:border-white/10
                    bg-slate-100 dark:bg-white/5
                    p-4
                    text-xs
                    leading-5
                    text-slate-600 dark:text-white/55
                  "
                >
                  Cancellation is scheduled. Your current access remains
                  governed by Stripe until the end of the current billing
                  period.
                </div>
              )}

              {subscriptionCanStart ? (
                <div
                  className="
                    grid
                    gap-4

                    md:grid-cols-3
                  "
                >
                  {SUBSCRIPTION_PLANS.map((plan) => (
                    <div
                      key={plan.id}
                      className="
                          flex
                          flex-col
                          rounded-2xl
                          border
                          border-slate-200 dark:border-white/10
                          bg-slate-50 dark:bg-[#111]
                          p-5
                          transition

                          hover:border-[#D4AF37]/30
                        "
                    >
                      <Sparkles size={18} className="text-[#D4AF37]" />

                      <h3
                        className="
                            mt-5
                            font-serif
                            text-2xl
                          "
                      >
                        {plan.name}
                      </h3>

                      <p
                        className="
                            mt-3
                            flex-1
                            text-xs
                            leading-5
                            text-slate-500 dark:text-white/40
                          "
                      >
                        {plan.description}
                      </p>

                      <button
                        type="button"
                        disabled={Boolean(checkoutPlanLoading)}
                        onClick={() => handleSubscribe(plan.id)}
                        className="
                            mt-6
                            flex
                            items-center
                            justify-center
                            gap-2
                            rounded-xl
                            bg-[#D4AF37]
                            px-4
                            py-3.5
                            text-[9px]
                            font-black
                            uppercase
                            tracking-[0.16em]
                            text-black
                            transition

                            hover:bg-slate-100 dark:hover:bg-white

                            disabled:cursor-wait
                            disabled:opacity-50
                          "
                      >
                        {checkoutPlanLoading === plan.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Zap size={13} />
                        )}
                        Subscribe
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="
                    flex
                    flex-col
                    gap-5
                    rounded-2xl
                    border
                    border-slate-200/80 dark:border-white/5
                    bg-slate-50 dark:bg-[#111]
                    p-6

                    sm:flex-row
                    sm:items-center
                    sm:justify-between
                  "
                >
                  <div>
                    <p
                      className="
                        text-[9px]
                        font-black
                        uppercase
                        tracking-[0.18em]
                        text-[#D4AF37]
                      "
                    >
                      Stripe Managed
                    </p>

                    <p
                      className="
                        mt-2
                        text-sm
                        text-slate-600 dark:text-white/60
                      "
                    >
                      Your current subscription should be managed through Stripe
                      Billing Portal.
                    </p>
                  </div>

                  {currentSubscription.can_manage_billing && (
                    <button
                      type="button"
                      onClick={handleManageBilling}
                      disabled={portalLoading}
                      className="
                        flex
                        shrink-0
                        items-center
                        justify-center
                        gap-2
                        rounded-xl
                        bg-[#D4AF37]
                        px-5
                        py-3.5
                        text-[9px]
                        font-black
                        uppercase
                        tracking-[0.16em]
                        text-black
                        transition

                        hover:bg-slate-100 dark:hover:bg-white

                        disabled:cursor-wait
                        disabled:opacity-50
                      "
                    >
                      {portalLoading ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <ExternalLink size={13} />
                      )}
                      Manage Billing
                    </button>
                  )}
                </div>
              )}

              {subscriptionCanStart &&
                currentSubscription.can_manage_billing && (
                  <div
                    className="
                      mt-5
                      flex
                      justify-end
                    "
                  >
                    <button
                      type="button"
                      onClick={handleManageBilling}
                      disabled={portalLoading}
                      className="
                        inline-flex
                        items-center
                        gap-2
                        text-[9px]
                        font-black
                        uppercase
                        tracking-[0.16em]
                        text-slate-500 dark:text-white/45
                        transition

                        hover:text-[#D4AF37]
                      "
                    >
                      {portalLoading ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <ExternalLink size={12} />
                      )}
                      Billing History
                    </button>
                  </div>
                )}
            </div>
          </section>

          {/*=================================================
          Ledger
          =================================================*/}

          <section
            className="
              overflow-hidden
              rounded-[2rem]
              border
              border-slate-200/80 dark:border-white/5
              bg-white dark:bg-[#0a0a0a]
              shadow-2xl
            "
          >
            <div
              className="
                border-b
                border-slate-200/80 dark:border-white/5
                bg-slate-100/70 dark:bg-[#111]/50
                p-6

                sm:p-8
              "
            >
              <div
                className="
                  flex
                  flex-col
                  gap-5

                  xl:flex-row
                  xl:items-end
                  xl:justify-between
                "
              >
                <div
                  className="
                    flex
                    items-center
                    gap-4
                  "
                >
                  <div
                    className="
                      grid
                      h-11
                      w-11
                      place-items-center
                      rounded-xl
                      border
                      border-slate-200 dark:border-white/10
                      bg-white dark:bg-[#030303]
                    "
                  >
                    <FileText size={17} className="text-[#D4AF37]" />
                  </div>

                  <div>
                    <h2
                      className="
                        font-serif
                        text-xl
                      "
                    >
                      Transaction History
                    </h2>

                    <p
                      className="
                        mt-1
                        text-[9px]
                        font-bold
                        uppercase
                        tracking-[0.16em]
                        text-slate-500 dark:text-white/35
                      "
                    >
                      {pagination.total} recorded{" "}
                      {pagination.total === 1 ? "transaction" : "transactions"}
                    </p>
                  </div>
                </div>

                <div
                  className="
                    grid
                    gap-2

                    sm:grid-cols-3

                    xl:min-w-[650px]
                  "
                >
                  <label
                    className="
                      relative
                    "
                  >
                    <span className="sr-only">Search transactions</span>

                    <Search
                      size={14}
                      className="
                        absolute
                        left-3
                        top-1/2
                        -translate-y-1/2
                        text-slate-400 dark:text-white/30
                      "
                    />

                    <input
                      type="search"
                      value={ledgerSearch}
                      onChange={handleLedgerSearch}
                      maxLength={100}
                      placeholder="Search ledger"
                      className="
                        w-full
                        rounded-xl
                        border
                        border-slate-200 dark:border-white/10
                        bg-white dark:bg-[#030303]
                        py-3
                        pl-9
                        pr-3
                        text-xs
                        text-slate-900 dark:text-white
                        outline-none
                        placeholder:text-slate-400 dark:placeholder:text-white/25

                        focus:border-[#D4AF37]/40
                      "
                    />
                  </label>

                  <select
                    value={ledgerType}
                    onChange={handleLedgerType}
                    className="
                      rounded-xl
                      border
                      border-slate-200 dark:border-white/10
                      bg-white dark:bg-[#030303]
                      px-3
                      py-3
                      text-xs
                      text-slate-600 dark:text-white/70
                      outline-none
                    "
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
                    className="
                      rounded-xl
                      border
                      border-slate-200 dark:border-white/10
                      bg-white dark:bg-[#030303]
                      px-3
                      py-3
                      text-xs
                      text-slate-600 dark:text-white/70
                      outline-none
                    "
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
                className="
                  m-5
                  flex
                  items-center
                  justify-between
                  gap-4
                  rounded-xl
                  border
                  border-rose-500/20
                  bg-rose-500/5
                  p-4
                  text-xs
                  text-rose-700 dark:text-rose-300
                "
              >
                <span>{ledgerError}</span>

                <button
                  type="button"
                  onClick={() => fetchLedger()}
                  className="
                    text-[8px]
                    font-black
                    uppercase
                    tracking-widest
                  "
                >
                  Retry
                </button>
              </div>
            )}

            {ledgerLoading ? (
              <div
                className="
                  flex
                  min-h-[300px]
                  items-center
                  justify-center
                "
              >
                <Loader2
                  size={28}
                  className="
                    animate-spin
                    text-[#D4AF37]
                  "
                />
              </div>
            ) : ledger.length === 0 ? (
              <div
                className="
                  flex
                  min-h-[300px]
                  flex-col
                  items-center
                  justify-center
                  gap-4
                  p-10
                  text-center
                "
              >
                <div
                  className="
                    grid
                    h-16
                    w-16
                    place-items-center
                    rounded-full
                    border
                    border-slate-200/80 dark:border-white/5
                    bg-slate-50 dark:bg-[#111]
                  "
                >
                  <Sparkles size={24} className="text-slate-300 dark:text-white/20" />
                </div>

                <p
                  className="
                    text-[9px]
                    font-black
                    uppercase
                    tracking-[0.18em]
                    text-slate-500 dark:text-white/35
                  "
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
                  className="
                    divide-y
                    divide-slate-200 dark:divide-white/5

                    md:hidden
                  "
                >
                  {ledger.map((transaction) => {
                    const direction = transaction?.direction || "informational";

                    const reference = getTransactionReference(transaction);

                    return (
                      <article
                        key={transaction.transaction_id}
                        className="
                            space-y-4
                            p-5
                          "
                      >
                        <div
                          className="
                              flex
                              items-start
                              justify-between
                              gap-4
                            "
                        >
                          <div className="min-w-0">
                            <span
                              className={`
                                  inline-flex
                                  rounded-lg
                                  border
                                  px-2.5
                                  py-1.5
                                  text-[8px]
                                  font-black
                                  uppercase
                                  tracking-[0.14em]

                                  ${getDirectionBadgeClasses(direction)}
                                `}
                            >
                              {getDirectionLabel(direction)}
                            </span>

                            <h3
                              className="
                                  mt-3
                                  font-serif
                                  text-lg
                                "
                            >
                              {transaction.transaction_label ||
                                titleCase(transaction.transaction_type)}
                            </h3>

                            <p
                              className="
                                  mt-1
                                  truncate
                                  text-xs
                                  text-slate-500 dark:text-white/40
                                "
                            >
                              {transaction.counterparty_name ||
                                "Platform / Stripe"}
                            </p>
                          </div>

                          <p
                            className={`
                                shrink-0
                                font-mono
                                text-base
                                font-black

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
                          className="
                              grid
                              grid-cols-2
                              gap-3
                              rounded-xl
                              bg-slate-100/70 dark:bg-white/[0.03]
                              p-3
                              text-[9px]
                            "
                        >
                          <div>
                            <p
                              className="
                                  uppercase
                                  tracking-widest
                                  text-slate-400 dark:text-white/25
                                "
                            >
                              Provider
                            </p>

                            <p
                              className="
                                  mt-1
                                  text-slate-600 dark:text-white/55
                                "
                            >
                              {getProviderLabel(transaction)}
                            </p>
                          </div>

                          <div>
                            <p
                              className="
                                  uppercase
                                  tracking-widest
                                  text-slate-400 dark:text-white/25
                                "
                            >
                              Date
                            </p>

                            <p
                              className="
                                  mt-1
                                  text-slate-600 dark:text-white/55
                                "
                            >
                              {formatDate(transaction.created_at)}
                            </p>
                          </div>

                          <div
                            className="
                                col-span-2
                              "
                          >
                            <p
                              className="
                                  uppercase
                                  tracking-widest
                                  text-slate-400 dark:text-white/25
                                "
                            >
                              Reference
                            </p>

                            <p
                              className="
                                  mt-1
                                  break-all
                                  font-mono
                                  text-slate-500 dark:text-white/45
                                "
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
                  className="
                    hidden
                    overflow-x-auto

                    md:block
                  "
                >
                  <table
                    className="
                      w-full
                      border-collapse
                      text-left
                    "
                  >
                    <thead>
                      <tr
                        className="
                          border-b
                          border-slate-200/80 dark:border-white/5
                          bg-white dark:bg-[#030303]
                          text-[8px]
                          font-black
                          uppercase
                          tracking-[0.18em]
                          text-slate-400 dark:text-white/30
                        "
                      >
                        <th className="px-7 py-5">Transaction</th>

                        <th className="px-7 py-5">Counterparty</th>

                        <th className="px-7 py-5">Date</th>

                        <th className="px-7 py-5">Provider / Reference</th>

                        <th
                          className="
                            px-7
                            py-5
                            text-right
                          "
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>

                    <tbody
                      className="
                        divide-y
                        divide-slate-200 dark:divide-white/5
                      "
                    >
                      {ledger.map((transaction) => {
                        const direction =
                          transaction?.direction || "informational";

                        const reference = getTransactionReference(transaction);

                        return (
                          <tr
                            key={transaction.transaction_id}
                            className="
                                transition
                                hover:bg-slate-50 dark:hover:bg-[#111]
                              "
                          >
                            <td className="px-7 py-5">
                              <span
                                className={`
                                    inline-flex
                                    rounded-lg
                                    border
                                    px-2.5
                                    py-1.5
                                    text-[8px]
                                    font-black
                                    uppercase
                                    tracking-[0.14em]

                                    ${getDirectionBadgeClasses(direction)}
                                  `}
                              >
                                {transaction.transaction_label ||
                                  titleCase(transaction.transaction_type)}
                              </span>

                              <p
                                className="
                                    mt-2
                                    font-mono
                                    text-[9px]
                                    text-slate-400 dark:text-white/25
                                  "
                              >
                                ID:{" "}
                                {shortenReference(
                                  transaction.transaction_id,
                                  14,
                                )}
                              </p>
                            </td>

                            <td
                              className="
                                  px-7
                                  py-5
                                  font-serif
                                  text-sm
                                  text-slate-700 dark:text-white/80
                                "
                            >
                              {transaction.counterparty_name ||
                                "Platform / Stripe"}
                            </td>

                            <td
                              className="
                                  px-7
                                  py-5
                                  text-xs
                                  text-slate-500 dark:text-white/45
                                "
                            >
                              {formatDateTime(transaction.created_at)}
                            </td>

                            <td className="px-7 py-5">
                              <p
                                className="
                                    mb-1
                                    text-[8px]
                                    font-black
                                    uppercase
                                    tracking-widest
                                    text-slate-500 dark:text-white/35
                                  "
                              >
                                {getProviderLabel(transaction)}
                              </p>

                              <span
                                title={reference || ""}
                                className="
                                    inline-block
                                    max-w-[230px]
                                    truncate
                                    rounded-lg
                                    border
                                    border-slate-200/80 dark:border-white/5
                                    bg-white dark:bg-[#030303]
                                    px-3
                                    py-1.5
                                    font-mono
                                    text-[9px]
                                    text-slate-500 dark:text-white/40
                                  "
                              >
                                {shortenReference(reference, 24)}
                              </span>
                            </td>

                            <td
                              className={`
                                  px-7
                                  py-5
                                  text-right
                                  font-mono
                                  text-base
                                  font-black

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
                  className="
                    flex
                    flex-col
                    gap-4
                    border-t
                    border-slate-200/80 dark:border-white/5
                    p-5

                    sm:flex-row
                    sm:items-center
                    sm:justify-between
                  "
                >
                  <p
                    className="
                      text-[9px]
                      font-bold
                      uppercase
                      tracking-[0.15em]
                      text-slate-400 dark:text-white/30
                    "
                  >
                    Page {pagination.page} of{" "}
                    {Math.max(pagination.totalPages, 1)}
                  </p>

                  <div
                    className="
                      flex
                      gap-2
                    "
                  >
                    <button
                      type="button"
                      disabled={!pagination.hasPreviousPage || ledgerLoading}
                      onClick={() =>
                        setLedgerPage((current) => Math.max(1, current - 1))
                      }
                      className="
                        flex
                        items-center
                        gap-1.5
                        rounded-xl
                        border
                        border-slate-200 dark:border-white/10
                        bg-slate-100 dark:bg-white/5
                        px-4
                        py-2.5
                        text-[8px]
                        font-black
                        uppercase
                        tracking-widest
                        text-slate-600 dark:text-white/55
                        transition

                        hover:text-slate-950 dark:hover:text-white

                        disabled:cursor-not-allowed
                        disabled:opacity-30
                      "
                    >
                      <ChevronLeft size={12} />
                      Previous
                    </button>

                    <button
                      type="button"
                      disabled={!pagination.hasNextPage || ledgerLoading}
                      onClick={() => setLedgerPage((current) => current + 1)}
                      className="
                        flex
                        items-center
                        gap-1.5
                        rounded-xl
                        border
                        border-slate-200 dark:border-white/10
                        bg-slate-100 dark:bg-white/5
                        px-4
                        py-2.5
                        text-[8px]
                        font-black
                        uppercase
                        tracking-widest
                        text-slate-600 dark:text-white/55
                        transition

                        hover:text-slate-950 dark:hover:text-white

                        disabled:cursor-not-allowed
                        disabled:opacity-30
                      "
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
              className="
                mb-2
                block
                text-[9px]
                font-black
                uppercase
                tracking-[0.18em]
                text-slate-500 dark:text-white/40
              "
            >
              Deposit Amount
            </span>

            <div className="relative">
              <span
                className="
                  absolute
                  left-4
                  top-1/2
                  -translate-y-1/2
                  font-serif
                  text-lg
                  text-[#D4AF37]
                "
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
                className="
                  w-full
                  rounded-xl
                  border
                  border-slate-200 dark:border-white/10
                  bg-white dark:bg-[#030303]
                  py-4
                  pl-10
                  pr-4
                  text-slate-900 dark:text-white
                  outline-none

                  focus:border-[#D4AF37]/50
                "
              />
            </div>
          </label>

          <div>
            <span
              className="
                mb-2
                block
                text-[9px]
                font-black
                uppercase
                tracking-[0.18em]
                text-slate-500 dark:text-white/40
              "
            >
              Card
            </span>

            <div
              className="
                min-h-[54px]
                rounded-xl
                border
                border-slate-200 dark:border-white/10
                bg-white dark:bg-[#030303]
                px-4
                py-[17px]
              "
            >
              {stripeElementsEnabled ? (
                <CardElement options={cardElementOptions} />
              ) : (
                <p
                  className="
                    text-xs
                    text-rose-700 dark:text-rose-300
                  "
                >
                  Stripe card entry is unavailable because
                  VITE_STRIPE_PUBLISHABLE_KEY is not configured.
                </p>
              )}
            </div>
          </div>

          {depositError && (
            <div
              className="
                flex
                items-start
                gap-2
                rounded-xl
                border
                border-rose-500/20
                bg-rose-500/5
                p-3
                text-xs
                leading-5
                text-rose-700 dark:text-rose-300
              "
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" />

              {depositError}
            </div>
          )}

          <div
            className="
              rounded-xl
              border
              border-[#D4AF37]/10
              bg-[#D4AF37]/5
              p-4
              text-[10px]
              leading-5
              text-slate-500 dark:text-white/45
            "
          >
            Wallet deposits are separate from subscription payments. Unused
            eligible wallet funds may later be returned only to their original
            refundable Stripe funding sources.
          </div>

          <button
            type="submit"
            disabled={depositLoading || !stripeElementsEnabled}
            className="
              flex
              w-full
              items-center
              justify-center
              gap-2
              rounded-xl
              bg-[#D4AF37]
              py-4
              text-[9px]
              font-black
              uppercase
              tracking-[0.18em]
              text-black
              transition

              hover:bg-slate-100 dark:hover:bg-white

              disabled:cursor-not-allowed
              disabled:opacity-50
            "
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
            className="
              rounded-xl
              border
              border-slate-200/80 dark:border-white/5
              bg-slate-50 dark:bg-[#111]
              p-4
            "
          >
            <p
              className="
                text-[8px]
                font-black
                uppercase
                tracking-[0.18em]
                text-slate-500 dark:text-white/35
              "
            >
              Available Wallet Balance
            </p>

            <p
              className="
                mt-2
                font-serif
                text-2xl
                text-slate-900 dark:text-white
              "
            >
              {formatMoney(wallet.available_balance, currency)}
            </p>
          </div>

          <label className="block">
            <span
              className="
                mb-2
                block
                text-[9px]
                font-black
                uppercase
                tracking-[0.18em]
                text-slate-500 dark:text-white/40
              "
            >
              Amount to Return
            </span>

            <div className="relative">
              <span
                className="
                  absolute
                  left-4
                  top-1/2
                  -translate-y-1/2
                  font-serif
                  text-lg
                  text-[#D4AF37]
                "
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
                className="
                  w-full
                  rounded-xl
                  border
                  border-slate-200 dark:border-white/10
                  bg-white dark:bg-[#030303]
                  py-4
                  pl-10
                  pr-4
                  text-slate-900 dark:text-white
                  outline-none

                  focus:border-[#D4AF37]/50
                "
              />
            </div>
          </label>

          {withdrawalError && (
            <div
              className="
                flex
                items-start
                gap-2
                rounded-xl
                border
                border-rose-500/20
                bg-rose-500/5
                p-3
                text-xs
                leading-5
                text-rose-700 dark:text-rose-300
              "
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" />

              {withdrawalError}
            </div>
          )}

          <div
            className="
              rounded-xl
              border
              border-slate-200 dark:border-white/10
              bg-slate-100/70 dark:bg-white/[0.03]
              p-4
              text-[10px]
              leading-5
              text-slate-500 dark:text-white/45
            "
          >
            Your available wallet balance can include value that is not
            currently refundable to an original Stripe funding source. The
            backend will calculate the actual refundable amount before creating
            any refund.
          </div>

          <button
            type="submit"
            disabled={withdrawalLoading || availableBalance <= 0}
            className="
              flex
              w-full
              items-center
              justify-center
              gap-2
              rounded-xl
              bg-[#D4AF37]
              py-4
              text-[9px]
              font-black
              uppercase
              tracking-[0.18em]
              text-black
              transition

              hover:bg-slate-100 dark:hover:bg-white

              disabled:cursor-not-allowed
              disabled:opacity-50
            "
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
