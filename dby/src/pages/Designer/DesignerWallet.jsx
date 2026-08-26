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
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  Filter,
  Info,
  Landmark,
  ListFilter,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
  XCircle,
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
Stripe Configuration
=========================================================*/

const STRIPE_PUBLIC_KEY =
  import.meta.env.VITE_STRIPE_PUBLIC_KEY;

const stripePromise = STRIPE_PUBLIC_KEY
  ? loadStripe(STRIPE_PUBLIC_KEY)
  : null;

/*=========================================================
Constants
=========================================================*/

const PAGE_SIZE = 20;

const MIN_PAYOUT_AMOUNT = Number(
  import.meta.env.VITE_DESIGNER_MIN_PAYOUT_AMOUNT || 10,
);

const MAX_DEPOSIT_AMOUNT = 1000000;

const PAYOUT_REQUEST_KEY =
  "designer-wallet-payout-request-id";

const DEPOSIT_REQUEST_KEY =
  "designer-wallet-deposit-request-id";

const PENDING_DEPOSIT_KEY =
  "designer-wallet-pending-deposit";

const EMPTY_WALLET = {
  available_balance: "0.00",
  pending_escrow_balance: "0.00",
  pending_payout_balance: "0.00",
  total_wallet_balance: "0.00",
  lifetime_earnings: "0.00",
  lifetime_deposits: "0.00",
  lifetime_withdrawn: "0.00",
  queued_payouts: "0.00",
  currency: "usd",
};

/*=========================================================
General Helpers
=========================================================*/

function apiError(error, fallback) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function safeNumber(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeNumber(value));
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function createUuid() {
  const cryptoApi = globalThis.crypto;

  if (!cryptoApi?.getRandomValues) {
    throw new Error(
      "Secure UUID generation is unavailable in this browser.",
    );
  }

  if (typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);

  cryptoApi.getRandomValues(bytes);

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  );

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

function getOrCreateSessionUuid(key) {
  try {
    const existing = sessionStorage.getItem(key);

    if (existing) {
      return existing;
    }

    const next = createUuid();

    sessionStorage.setItem(key, next);

    return next;
  } catch {
    return createUuid();
  }
}

function resetSessionUuid(key) {
  const next = createUuid();

  try {
    sessionStorage.setItem(key, next);
  } catch {
    // Browser storage may be unavailable.
  }

  return next;
}

function readPendingDeposit() {
  try {
    const stored = localStorage.getItem(
      PENDING_DEPOSIT_KEY,
    );

    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function storePendingDeposit(value) {
  try {
    localStorage.setItem(
      PENDING_DEPOSIT_KEY,
      JSON.stringify(value),
    );
  } catch {
    // Verification can still continue without local storage.
  }
}

function clearPendingDeposit() {
  try {
    localStorage.removeItem(PENDING_DEPOSIT_KEY);
  } catch {
    // Nothing else is required.
  }
}

function arrayFromResponse(response) {
  const value = response?.data?.data;

  return Array.isArray(value) ? value : [];
}

function paginationFromResponse(response) {
  return (
    response?.data?.pagination || {
      page: 1,
      limit: PAGE_SIZE,
      total: 0,
      totalPages: 0,
    }
  );
}

function shortReference(value) {
  const stringValue = String(value || "");

  return stringValue
    ? `#${stringValue.slice(0, 8).toUpperCase()}`
    : "—";
}

function transactionLabel(type) {
  const labels = {
    escrow_release: "P2P project earning",
    marketplace_purchase: "Marketplace earning",
    marketplace_sale: "Marketplace sale",
    wallet_deposit: "Wallet deposit",
  };

  return (
    labels[type] ||
    String(type || "Transaction").replaceAll("_", " ")
  );
}

function payoutMethodLabel(method) {
  const labels = {
    manual: "Internal request",
    bank_transfer: "Bank transfer",
    stripe_connect: "Stripe payout",
  };

  return labels[method] || "Payout";
}

function statusClasses(status) {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300";
  }

  if (normalized === "failed") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300";
  }

  if (normalized === "cancelled") {
    return "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/45";
  }

  if (normalized === "processing") {
    return "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300";
}

function escapeCsv(value) {
  const stringValue = String(value ?? "");

  return `"${stringValue.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);

  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

/*=========================================================
Stripe Checkout Form
=========================================================*/

function CheckoutForm({
  clientSecret,
  totalAmount,
  verifying,
  verificationError,
  paymentSucceeded,
  onPaymentSucceeded,
  onRetryVerification,
  onProcessingChange,
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { theme } = useTheme();

  const [processing, setProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const setBusy = (value) => {
    setProcessing(value);
    onProcessingChange?.(value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (
      !stripe ||
      !elements ||
      processing ||
      verifying ||
      paymentSucceeded
    ) {
      return;
    }

    const card = elements.getElement(CardElement);

    if (!card) {
      setPaymentError(
        "The secure card field could not be loaded.",
      );

      return;
    }

    setBusy(true);
    setPaymentError("");

    try {
      const result = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card,
          },
        },
      );

      if (result.error) {
        setPaymentError(
          result.error.message ||
            "Stripe could not complete the wallet deposit.",
        );

        return;
      }

      if (result.paymentIntent?.status !== "succeeded") {
        setPaymentError(
          `Payment status is ${
            result.paymentIntent?.status || "unknown"
          }.`,
        );

        return;
      }

      await onPaymentSucceeded(result.paymentIntent.id);
    } catch (error) {
      setPaymentError(
        apiError(
          error,
          "The payment connection was interrupted.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  if (paymentSucceeded) {
    return (
      <div className="space-y-5">
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-400/20 dark:bg-emerald-400/10"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2
              className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300"
              size={20}
            />

            <div>
              <h4 className="font-semibold text-emerald-900 dark:text-emerald-100">
                Stripe payment succeeded
              </h4>

              <p className="mt-1 text-sm leading-6 text-emerald-700/80 dark:text-emerald-200/70">
                The server is verifying the Stripe payment and
                synchronizing your wallet ledger.
              </p>
            </div>
          </div>
        </div>

        {verificationError && (
          <div
            role="alert"
            className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
          >
            {verificationError}
          </div>
        )}

        <button
          type="button"
          onClick={onRetryVerification}
          disabled={verifying}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] text-[10px] font-black uppercase tracking-[0.2em] text-black transition hover:bg-[#E2C45D] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {verifying ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}

          {verifying ? "Syncing Wallet" : "Retry Wallet Sync"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-inner transition focus-within:border-[#D4AF37]/60 focus-within:ring-4 focus-within:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303]">
        <CardElement
          options={{
            hidePostalCode: false,

            style: {
              base: {
                fontSize: "15px",

                color:
                  theme === "dark" ? "#ffffff" : "#0f172a",

                fontFamily:
                  "Inter, ui-sans-serif, system-ui, sans-serif",

                "::placeholder": {
                  color:
                    theme === "dark"
                      ? "#ffffff55"
                      : "#94a3b8",
                },

                iconColor: "#D4AF37",
              },

              invalid: {
                color: "#e11d48",
                iconColor: "#e11d48",
              },
            },
          }}
        />
      </div>

      {(paymentError || verificationError) && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"
        >
          <AlertCircle
            size={17}
            className="mt-0.5 shrink-0"
          />

          <p>{verificationError || paymentError}</p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/5 dark:bg-white/[0.025]">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-white/40">
            Wallet credit
          </span>

          <strong className="font-mono text-xl text-[#98761A] dark:text-[#D4AF37]">
            {money(totalAmount)}
          </strong>
        </div>
      </div>

      <button
        type="submit"
        disabled={
          !stripe ||
          !elements ||
          processing ||
          verifying
        }
        className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-5 text-[10px] font-black uppercase tracking-[0.22em] text-black shadow-[0_12px_35px_rgba(212,175,55,0.22)] transition hover:-translate-y-0.5 hover:bg-[#E2C45D] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:bg-white/5 dark:disabled:text-white/25"
      >
        {processing || verifying ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <LockKeyhole size={16} />
        )}

        {processing
          ? "Processing Deposit"
          : verifying
            ? "Verifying Deposit"
            : `Deposit ${money(totalAmount)}`}
      </button>
    </form>
  );
}

/*=========================================================
Designer Wallet
=========================================================*/

export default function DesignerWallet() {
  const [walletData, setWalletData] =
    useState(EMPTY_WALLET);

  const [earnings, setEarnings] = useState([]);
  const [payouts, setPayouts] = useState([]);

  const [ledgerPagination, setLedgerPagination] =
    useState({
      page: 1,
      limit: PAGE_SIZE,
      total: 0,
      totalPages: 0,
    });

  const [payoutPagination, setPayoutPagination] =
    useState({
      page: 1,
      limit: PAGE_SIZE,
      total: 0,
      totalPages: 0,
    });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");

  const [actionType, setActionType] =
    useState("payout");

  const [activeTab, setActiveTab] =
    useState("earnings");

  /*=======================================================
  Internal Payout State
  =======================================================*/

  const [withdrawAmount, setWithdrawAmount] =
    useState("");

  const [payoutNote, setPayoutNote] = useState("");

  const [isSubmittingPayout, setIsSubmittingPayout] =
    useState(false);

  const [cancellingPayoutId, setCancellingPayoutId] =
    useState("");

  /*=======================================================
  Deposit State
  =======================================================*/

  const [depositAmount, setDepositAmount] = useState("");

  const [checkout, setCheckout] = useState(null);

  const [checkoutProcessing, setCheckoutProcessing] =
    useState(false);

  const [verifyingDeposit, setVerifyingDeposit] =
    useState(false);

  const [verificationError, setVerificationError] =
    useState("");

  const [pendingDeposit, setPendingDeposit] = useState(
    () => readPendingDeposit(),
  );

  /*=======================================================
  Filters and Pagination
  =======================================================*/

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] =
    useState("");

  const [ledgerType, setLedgerType] = useState("");
  const [payoutStatus, setPayoutStatus] = useState("");

  const [ledgerPage, setLedgerPage] = useState(1);
  const [payoutPage, setPayoutPage] = useState(1);

  /*=======================================================
  Idempotency Keys
  =======================================================*/

  const payoutRequestIdRef = useRef(
    getOrCreateSessionUuid(PAYOUT_REQUEST_KEY),
  );

  const depositRequestIdRef = useRef(
    getOrCreateSessionUuid(DEPOSIT_REQUEST_KEY),
  );

  const requestSequenceRef = useRef(0);

  /*=======================================================
  Search Debounce
  =======================================================*/

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setLedgerPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [search]);

  /*=======================================================
  Fetch Wallet Data
  =======================================================*/

  const fetchWalletData = useCallback(
    async ({ silent = false } = {}) => {
      const sequence = ++requestSequenceRef.current;

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const [walletRes, ledgerRes, payoutsRes] =
          await Promise.all([
            API.get("/designer-finance/wallet"),

            API.get("/designer-finance/ledger", {
              params: {
                page: ledgerPage,
                limit: PAGE_SIZE,
                type: ledgerType || undefined,
                search: debouncedSearch || undefined,
              },
            }),

            API.get("/designer-finance/payouts", {
              params: {
                page: payoutPage,
                limit: PAGE_SIZE,
                status: payoutStatus || undefined,
              },
            }),
          ]);

        if (sequence !== requestSequenceRef.current) {
          return;
        }

        setWalletData({
          ...EMPTY_WALLET,
          ...(walletRes?.data?.data || {}),
        });

        setEarnings(arrayFromResponse(ledgerRes));
        setPayouts(arrayFromResponse(payoutsRes));

        setLedgerPagination(
          paginationFromResponse(ledgerRes),
        );

        setPayoutPagination(
          paginationFromResponse(payoutsRes),
        );
      } catch (requestError) {
        if (sequence === requestSequenceRef.current) {
          setError(
            apiError(
              requestError,
              "The designer wallet could not be synchronized.",
            ),
          );
        }
      } finally {
        if (sequence === requestSequenceRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [
      debouncedSearch,
      ledgerPage,
      ledgerType,
      payoutPage,
      payoutStatus,
    ],
  );

  useEffect(() => {
    void fetchWalletData();
  }, [fetchWalletData]);

  /*=======================================================
  Success Message Timer
  =======================================================*/

  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setSuccessMessage("");
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [successMessage]);

  /*=======================================================
  Deposit Modal Accessibility
  =======================================================*/

  useEffect(() => {
    if (!checkout?.open) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (
        event.key === "Escape" &&
        !checkoutProcessing &&
        !verifyingDeposit
      ) {
        setCheckout((current) =>
          current
            ? {
                ...current,
                open: false,
              }
            : null,
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    checkout?.open,
    checkoutProcessing,
    verifyingDeposit,
  ]);

  /*=======================================================
  Wallet Metrics
  =======================================================*/

  const metrics = useMemo(
    () => ({
      available: safeNumber(
        walletData.available_balance,
      ),

      pendingEscrow: safeNumber(
        walletData.pending_escrow_balance,
      ),

      pendingPayout: safeNumber(
        walletData.pending_payout_balance,
      ),

      total: safeNumber(
        walletData.total_wallet_balance,
      ),

      lifetimeEarnings: safeNumber(
        walletData.lifetime_earnings,
      ),

      lifetimeDeposits: safeNumber(
        walletData.lifetime_deposits,
      ),

      lifetimeWithdrawn: safeNumber(
        walletData.lifetime_withdrawn,
      ),

      queuedPayouts: safeNumber(
        walletData.queued_payouts,
      ),
    }),
    [walletData],
  );

  const parsedWithdrawAmount = safeNumber(withdrawAmount);
  const parsedDepositAmount = safeNumber(depositAmount);

  const payoutAmountIsValid =
    parsedWithdrawAmount >= MIN_PAYOUT_AMOUNT &&
    parsedWithdrawAmount <= metrics.available;

  const depositAmountIsValid =
    parsedDepositAmount > 0 &&
    parsedDepositAmount <= MAX_DEPOSIT_AMOUNT;

  const clearMessages = () => {
    setError("");
    setSuccessMessage("");
  };

  /*=======================================================
  Create Internal Payout Request
  =======================================================*/

  const handleWithdrawalRequest = async (event) => {
    event.preventDefault();

    clearMessages();

    const amount = safeNumber(withdrawAmount);

    if (amount <= 0) {
      setError("Enter a valid payout amount.");
      return;
    }

    if (amount < MIN_PAYOUT_AMOUNT) {
      setError(
        `The minimum payout amount is ${money(
          MIN_PAYOUT_AMOUNT,
        )}.`,
      );

      return;
    }

    if (amount > metrics.available) {
      setError(
        "The requested payout exceeds your available balance.",
      );

      return;
    }

    setIsSubmittingPayout(true);

    try {
      const response = await API.post(
        "/designer-finance/payouts",
        {
          amount,

          payoutMethod: "manual",

          destinationSummary:
            payoutNote.trim() || null,

          client_request_id:
            payoutRequestIdRef.current,
        },
      );

      payoutRequestIdRef.current = resetSessionUuid(
        PAYOUT_REQUEST_KEY,
      );

      setWithdrawAmount("");
      setPayoutNote("");

      setActiveTab("payouts");
      setPayoutPage(1);

      setSuccessMessage(
        response?.data?.message ||
          "The internal payout request was created and the funds were reserved.",
      );

      await fetchWalletData({
        silent: true,
      });
    } catch (requestError) {
      setError(
        apiError(
          requestError,
          "The internal payout request could not be created.",
        ),
      );
    } finally {
      setIsSubmittingPayout(false);
    }
  };

  /*=======================================================
  Cancel Pending Payout
  =======================================================*/

  const handleCancelPayout = async (request) => {
    const requestId = request?.request_id;

    if (!requestId) {
      return;
    }

    const confirmed = window.confirm(
      `Cancel this ${money(
        request.amount,
      )} payout request and restore the funds to your available balance?`,
    );

    if (!confirmed) {
      return;
    }

    clearMessages();
    setCancellingPayoutId(requestId);

    try {
      const response = await API.post(
        `/designer-finance/payouts/${requestId}/cancel`,
      );

      setSuccessMessage(
        response?.data?.message ||
          "The payout request was cancelled and the funds were restored.",
      );

      await fetchWalletData({
        silent: true,
      });
    } catch (requestError) {
      setError(
        apiError(
          requestError,
          "The payout request could not be cancelled.",
        ),
      );
    } finally {
      setCancellingPayoutId("");
    }
  };

  /*=======================================================
  Deposit Amount Change
  =======================================================*/

  const updateDepositAmount = (nextValue) => {
    if (
      checkout &&
      !checkout.paymentSucceeded &&
      nextValue !== String(checkout.amount)
    ) {
      setCheckout(null);
      setVerificationError("");

      depositRequestIdRef.current = resetSessionUuid(
        DEPOSIT_REQUEST_KEY,
      );
    }

    setDepositAmount(nextValue);
  };

  const handleDepositAmountChange = (event) => {
    updateDepositAmount(event.target.value);
  };

  /*=======================================================
  Create Deposit PaymentIntent
  =======================================================*/

  const handleDepositRequest = async (event) => {
    event.preventDefault();

    clearMessages();
    setVerificationError("");

    const amount = safeNumber(depositAmount);

    if (amount <= 0) {
      setError("Enter a valid wallet deposit amount.");
      return;
    }

    if (amount > MAX_DEPOSIT_AMOUNT) {
      setError(
        `The maximum wallet deposit is ${money(
          MAX_DEPOSIT_AMOUNT,
        )}.`,
      );

      return;
    }

    if (!STRIPE_PUBLIC_KEY || !stripePromise) {
      setError(
        "VITE_STRIPE_PUBLIC_KEY is missing from the frontend environment.",
      );

      return;
    }

    if (checkout && !checkout.paymentSucceeded) {
      setCheckout((current) => ({
        ...current,
        open: true,
      }));

      return;
    }

    setCheckoutProcessing(true);

    try {
      const response = await API.post(
        "/designer-finance/wallet/deposit",
        {
          amount,

          client_request_id:
            depositRequestIdRef.current,
        },
      );

      const clientSecret =
        response?.data?.clientSecret;

      const paymentIntentId =
        response?.data?.paymentIntentId;

      const authoritativeAmount = safeNumber(
        response?.data?.amount || amount,
      );

      if (!clientSecret || !paymentIntentId) {
        throw new Error(
          "The server did not return a complete Stripe deposit session.",
        );
      }

      setCheckout({
        open: true,
        clientSecret,
        paymentIntentId,
        amount: authoritativeAmount,
        paymentSucceeded: false,
      });
    } catch (requestError) {
      setError(
        apiError(
          requestError,
          "The secure wallet deposit could not be initialized.",
        ),
      );
    } finally {
      setCheckoutProcessing(false);
    }
  };

  /*=======================================================
  Verify Wallet Deposit
  =======================================================*/

  const verifyDeposit = async (
    paymentIntentId,
    amount,
  ) => {
    if (!paymentIntentId) {
      return;
    }

    setVerifyingDeposit(true);
    setVerificationError("");

    try {
      const response = await API.post(
        "/designer-finance/wallet/verify-deposit",
        {
          paymentIntentId,
        },
      );

      clearPendingDeposit();

      setPendingDeposit(null);
      setCheckout(null);
      setDepositAmount("");

      depositRequestIdRef.current = resetSessionUuid(
        DEPOSIT_REQUEST_KEY,
      );

      setSuccessMessage(
        response?.data?.message ||
          `${money(amount)} was credited to your wallet.`,
      );

      setActiveTab("earnings");
      setLedgerType("wallet_deposit");
      setLedgerPage(1);

      await fetchWalletData({
        silent: true,
      });
    } catch (requestError) {
      const message = apiError(
        requestError,
        "Stripe payment succeeded, but wallet synchronization is still pending.",
      );

      setVerificationError(message);
      setError(message);
    } finally {
      setVerifyingDeposit(false);
    }
  };

  /*=======================================================
  Stripe Payment Success
  =======================================================*/

  const handleDepositSuccess = async (
    paymentIntentId,
  ) => {
    const amount = safeNumber(
      checkout?.amount || depositAmount,
    );

    const pending = {
      paymentIntentId,
      amount,
      createdAt: new Date().toISOString(),
    };

    storePendingDeposit(pending);
    setPendingDeposit(pending);

    setCheckout((current) => ({
      ...current,
      paymentIntentId,
      paymentSucceeded: true,
    }));

    await verifyDeposit(paymentIntentId, amount);
  };

  const retryPendingDepositVerification = async () => {
    const paymentIntentId =
      checkout?.paymentIntentId ||
      pendingDeposit?.paymentIntentId;

    const amount = safeNumber(
      checkout?.amount || pendingDeposit?.amount,
    );

    await verifyDeposit(paymentIntentId, amount);
  };

  const closeCheckout = () => {
    if (checkoutProcessing || verifyingDeposit) {
      return;
    }

    setCheckout((current) =>
      current
        ? {
            ...current,
            open: false,
          }
        : null,
    );
  };

  /*=======================================================
  CSV Export
  =======================================================*/

  const exportCurrentView = () => {
    if (activeTab === "earnings") {
      downloadCsv("designer-earnings.csv", [
        [
          "Transaction ID",
          "Reference",
          "Type",
          "Sender",
          "Gross",
          "Platform Fee",
          "Net",
          "Booking Status",
          "Created At",
        ],

        ...earnings.map((entry) => [
          entry.transaction_id,
          entry.reference_id,
          entry.transaction_type,
          entry.sender_name,
          entry.gross_amount,
          entry.platform_fee_deducted,
          entry.net_amount,
          entry.booking_status,
          entry.created_at,
        ]),
      ]);

      return;
    }

    downloadCsv("designer-payouts.csv", [
      [
        "Request ID",
        "Amount",
        "Method",
        "Note",
        "Status",
        "Requested At",
        "Completed At",
        "Failure Reason",
      ],

      ...payouts.map((entry) => [
        entry.request_id,
        entry.amount,
        entry.payout_method,
        entry.destination_summary,
        entry.status,
        entry.requested_at,
        entry.completed_at,
        entry.failure_reason,
      ]),
    ]);
  };

  /*=======================================================
  Pagination
  =======================================================*/

  const activePagination =
    activeTab === "earnings"
      ? ledgerPagination
      : payoutPagination;

  const goToPreviousPage = () => {
    if (activeTab === "earnings") {
      setLedgerPage((page) => Math.max(1, page - 1));
    } else {
      setPayoutPage((page) => Math.max(1, page - 1));
    }
  };

  const goToNextPage = () => {
    if (activeTab === "earnings") {
      setLedgerPage((page) =>
        Math.min(
          ledgerPagination.totalPages || 1,
          page + 1,
        ),
      );
    } else {
      setPayoutPage((page) =>
        Math.min(
          payoutPagination.totalPages || 1,
          page + 1,
        ),
      );
    }
  };

  /*=======================================================
  Dashboard Cards
  =======================================================*/

  const metricCards = [
    {
      title: "Available Balance",

      value: metrics.available,

      description:
        "Available for platform use or payout reservation",

      icon: Wallet,

      iconClass:
        "text-emerald-600 dark:text-emerald-300",

      panelClass:
        "border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-400/10 dark:bg-emerald-400/[0.06]",
    },

    {
      title: "Project Funds Pending",

      value: metrics.pendingEscrow,

      description:
        "Funds become available after project approval",

      icon: LockKeyhole,

      iconClass:
        "text-[#9B791D] dark:text-[#D4AF37]",

      panelClass:
        "border-[#D4AF37]/25 bg-[#D4AF37]/[0.07]",
    },

    {
      title: "Pending Payouts",

      value: metrics.pendingPayout,

      description:
        "Reserved inside your wallet for processing",

      icon: Clock3,

      iconClass:
        "text-indigo-600 dark:text-indigo-300",

      panelClass:
        "border-indigo-200/70 bg-indigo-50/60 dark:border-indigo-400/10 dark:bg-indigo-400/[0.06]",
    },

    {
      title: "Lifetime Earnings",

      value: metrics.lifetimeEarnings,

      description:
        "Net project and marketplace earnings",

      icon: TrendingUp,

      iconClass:
        "text-sky-600 dark:text-sky-300",

      panelClass:
        "border-sky-200/70 bg-sky-50/60 dark:border-sky-400/10 dark:bg-sky-400/[0.06]",
    },
  ];

  const exportDisabled =
    activeTab === "earnings"
      ? earnings.length === 0
      : payouts.length === 0;

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 pb-20 text-slate-950 transition-colors duration-300 dark:bg-[#030303] dark:text-white">
      {/* Background decoration */}

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-[#D4AF37]/10 blur-[170px]" />

        <div className="absolute -bottom-48 -left-40 h-[38rem] w-[38rem] rounded-full bg-indigo-500/5 blur-[180px] dark:bg-indigo-500/10" />
      </div>

      {/*===================================================
      Header
      ===================================================*/}

      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-2xl dark:border-white/5 dark:bg-[#070707]/80">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-5 py-6 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.32em] text-[#9B791D] dark:text-[#D4AF37]">
              <Sparkles size={14} />

              Studio Ledger
            </div>

            <h1 className="mt-2 font-serif text-3xl font-light sm:text-4xl">
              Designer{" "}

              <span className="italic text-[#9B791D] dark:text-[#D4AF37]">
                Wallet
              </span>
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-white/40">
              Track project earnings, wallet deposits and
              internal payout requests from one secure
              financial ledger.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={exportCurrentView}
              disabled={exportDisabled}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[9px] font-black uppercase tracking-[0.18em] text-slate-600 transition hover:border-[#D4AF37]/50 hover:text-[#8F7118] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-white/55 dark:hover:text-[#D4AF37]"
            >
              <Download size={15} />

              Export
            </button>

            <button
              type="button"
              onClick={() =>
                void fetchWalletData({
                  silent: true,
                })
              }
              disabled={refreshing}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-[9px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-[#D4AF37]"
            >
              <RefreshCw
                size={15}
                className={refreshing ? "animate-spin" : ""}
              />

              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-[1500px] space-y-8 px-5 pt-8 sm:px-8 lg:px-10">
        {/*=================================================
        Error and Success Messages
        =================================================*/}

        {(error || successMessage) && (
          <div
            role={error ? "alert" : "status"}
            aria-live="polite"
            className={`flex items-start justify-between gap-4 rounded-2xl border p-4 text-sm ${
              error
                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
            }`}
          >
            <div className="flex items-start gap-3">
              {error ? (
                <AlertCircle
                  size={18}
                  className="mt-0.5 shrink-0"
                />
              ) : (
                <CheckCircle2
                  size={18}
                  className="mt-0.5 shrink-0"
                />
              )}

              <p>{error || successMessage}</p>
            </div>

            <button
              type="button"
              onClick={clearMessages}
              aria-label="Dismiss message"
              className="shrink-0 opacity-60 transition hover:opacity-100"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {/*=================================================
        Pending Deposit Verification
        =================================================*/}

        {pendingDeposit?.paymentIntentId && (
          <section className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-400/20 dark:bg-amber-400/10 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Clock3
                className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
                size={20}
              />

              <div>
                <h2 className="font-semibold text-amber-900 dark:text-amber-100">
                  Wallet deposit awaiting confirmation
                </h2>

                <p className="mt-1 text-sm leading-6 text-amber-700/80 dark:text-amber-200/70">
                  Stripe payment{" "}
                  {shortReference(
                    pendingDeposit.paymentIntentId,
                  )}{" "}
                  for {money(pendingDeposit.amount)} can be
                  safely verified again.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={retryPendingDepositVerification}
              disabled={verifyingDeposit}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 text-[9px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-amber-800 disabled:opacity-60"
            >
              {verifyingDeposit ? (
                <Loader2
                  size={14}
                  className="animate-spin"
                />
              ) : (
                <RefreshCw size={14} />
              )}

              Verify Deposit
            </button>
          </section>
        )}

        {/*=================================================
        Wallet Metrics
        =================================================*/}

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({
              length: 4,
            }).map((_, index) => (
              <div
                key={index}
                className="h-40 animate-pulse rounded-3xl border border-slate-200 bg-white dark:border-white/5 dark:bg-[#0A0A0A]"
              />
            ))}
          </div>
        ) : (
          <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {metricCards.map((metric) => (
              <article
                key={metric.title}
                className={`group rounded-3xl border p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg dark:shadow-2xl ${metric.panelClass}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-500 dark:text-white/35">
                      {metric.title}
                    </p>

                    <p className="mt-3 font-serif text-4xl tracking-tight">
                      {money(metric.value)}
                    </p>

                    <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-white/35">
                      {metric.description}
                    </p>
                  </div>

                  <div
                    className={`rounded-2xl bg-white/70 p-3 shadow-sm transition group-hover:scale-105 dark:bg-white/5 ${metric.iconClass}`}
                  >
                    <metric.icon size={20} />
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

        {/*=================================================
        Secondary Metrics
        =================================================*/}

        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#0A0A0A] dark:shadow-2xl sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Total wallet value", metrics.total],
            ["Lifetime deposits", metrics.lifetimeDeposits],
            ["Processed payouts", metrics.lifetimeWithdrawn],
            ["Queued payouts", metrics.queuedPayouts],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-transparent bg-slate-50 p-4 transition hover:border-slate-200 dark:bg-white/[0.025] dark:hover:border-white/10"
            >
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                {label}
              </p>

              <p className="mt-2 font-mono text-lg font-semibold">
                {money(value)}
              </p>
            </div>
          ))}
        </section>

        <div className="grid gap-8 xl:grid-cols-[390px_1fr]">
          {/*===============================================
          Wallet Actions
          ===============================================*/}

          <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-[#0A0A0A] dark:shadow-2xl sm:p-7 xl:sticky xl:top-32">
            <div className="rounded-2xl border border-slate-200 bg-slate-100 p-1.5 dark:border-white/10 dark:bg-[#111]">
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  ["payout", ArrowUpRight, "Request payout"],
                  ["deposit", ArrowDownLeft, "Add funds"],
                ].map(([type, Icon, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setActionType(type);
                      clearMessages();
                    }}
                    className={`flex h-11 items-center justify-center gap-2 rounded-xl text-[9px] font-black uppercase tracking-[0.16em] transition ${
                      actionType === type
                        ? "border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-transparent dark:bg-[#030303] dark:text-white"
                        : "text-slate-400 hover:text-slate-700 dark:text-white/35 dark:hover:text-white/70"
                    }`}
                  >
                    <Icon size={14} />

                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/*=============================================
            Internal Payout Request
            =============================================*/}

            {actionType === "payout" ? (
              <form
                onSubmit={handleWithdrawalRequest}
                className="mt-7 space-y-5"
              >
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="payout-amount"
                      className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-white/40"
                    >
                      Payout amount
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        setWithdrawAmount(
                          metrics.available.toFixed(2),
                        )
                      }
                      disabled={metrics.available <= 0}
                      className="text-[9px] font-black uppercase tracking-[0.16em] text-[#98761A] transition hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#D4AF37]"
                    >
                      Use maximum
                    </button>
                  </div>

                  <div className="relative mt-2.5">
                    <BadgeDollarSign
                      size={17}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9B791D] dark:text-[#D4AF37]"
                    />

                    <input
                      id="payout-amount"
                      type="number"
                      min={MIN_PAYOUT_AMOUNT}
                      max={metrics.available || undefined}
                      step="0.01"
                      inputMode="decimal"
                      value={withdrawAmount}
                      onChange={(event) =>
                        setWithdrawAmount(event.target.value)
                      }
                      placeholder={`Minimum ${money(
                        MIN_PAYOUT_AMOUNT,
                      )}`}
                      className="h-[52px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 font-mono text-sm outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303] dark:text-white"
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 dark:text-white/30">
                    <span>
                      Minimum {money(MIN_PAYOUT_AMOUNT)}
                    </span>

                    <span>
                      Available {money(metrics.available)}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-white/40">
                    Payout method
                  </span>

                  <div className="relative mt-2.5">
                    <Landmark
                      size={16}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />

                    <select
                      value="manual"
                      disabled
                      aria-label="Payout method"
                      className="h-[52px] w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-11 text-sm font-medium outline-none disabled:cursor-default disabled:opacity-100 dark:border-white/10 dark:bg-[#030303] dark:text-white"
                    >
                      <option value="manual">
                        Internal payout request
                      </option>
                    </select>

                    <ChevronDown
                      size={16}
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/25">
                      Bank transfer — Coming soon
                    </div>

                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/25">
                      Stripe payout — Coming soon
                    </div>
                  </div>
                </div>

                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-white/40">
                    Request note
                  </span>

                  <div className="relative mt-2.5">
                    <FileText
                      size={16}
                      className="absolute left-4 top-4 text-slate-400"
                    />

                    <textarea
                      rows={3}
                      maxLength={255}
                      value={payoutNote}
                      onChange={(event) =>
                        setPayoutNote(event.target.value)
                      }
                      placeholder="Optional instructions or note"
                      className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 text-sm leading-6 outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303] dark:text-white"
                    />
                  </div>

                  <div className="mt-1 text-right text-[10px] text-slate-400 dark:text-white/25">
                    {payoutNote.length}/255
                  </div>
                </label>

                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-400/20 dark:bg-indigo-400/10">
                  <div className="flex items-start gap-3">
                    <Info
                      size={18}
                      className="mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-300"
                    />

                    <div>
                      <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                        Internal wallet reservation
                      </p>

                      <p className="mt-1 text-xs leading-5 text-indigo-700/80 dark:text-indigo-200/70">
                        This moves funds from your available
                        balance into pending payouts inside the
                        platform. Version 1 does not transfer
                        money to a bank account.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={
                    isSubmittingPayout ||
                    !payoutAmountIsValid
                  }
                  className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] text-[10px] font-black uppercase tracking-[0.2em] text-black shadow-[0_12px_35px_rgba(212,175,55,0.18)] transition hover:-translate-y-0.5 hover:bg-[#E2C45D] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:bg-white/5 dark:disabled:text-white/25"
                >
                  {isSubmittingPayout ? (
                    <Loader2
                      size={16}
                      className="animate-spin"
                    />
                  ) : (
                    <ArrowUpRight size={16} />
                  )}

                  {isSubmittingPayout
                    ? "Reserving Funds"
                    : "Create Payout Request"}
                </button>
              </form>
            ) : (
              /*===========================================
              Stripe Deposit
              ===========================================*/

              <form
                onSubmit={handleDepositRequest}
                className="mt-7 space-y-5"
              >
                <div>
                  <label
                    htmlFor="deposit-amount"
                    className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-white/40"
                  >
                    Deposit amount
                  </label>

                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {[10, 25, 50, 100].map((amount) => {
                      const selected =
                        parsedDepositAmount === amount;

                      return (
                        <button
                          key={amount}
                          type="button"
                          onClick={() =>
                            updateDepositAmount(String(amount))
                          }
                          className={`rounded-xl border px-2 py-3 text-xs font-bold transition ${
                            selected
                              ? "border-[#D4AF37] bg-[#D4AF37]/10 text-[#98761A] shadow-sm dark:text-[#D4AF37]"
                              : "border-slate-200 bg-slate-50 text-slate-500 hover:border-[#D4AF37]/50 hover:text-[#98761A] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/40 dark:hover:text-[#D4AF37]"
                          }`}
                        >
                          ${amount}
                        </button>
                      );
                    })}
                  </div>

                  <div className="relative mt-3">
                    <ArrowDownToLine
                      size={17}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9B791D] dark:text-[#D4AF37]"
                    />

                    <input
                      id="deposit-amount"
                      type="number"
                      min="1"
                      max={MAX_DEPOSIT_AMOUNT}
                      step="0.01"
                      inputMode="decimal"
                      value={depositAmount}
                      onChange={handleDepositAmountChange}
                      placeholder="Enter custom deposit"
                      className="h-[52px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 font-mono text-sm outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303] dark:text-white"
                    />
                  </div>
                </div>

                {parsedDepositAmount > 0 && (
                  <div className="flex items-center justify-between rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] px-4 py-3">
                    <span className="text-xs text-slate-500 dark:text-white/40">
                      Wallet credit
                    </span>

                    <strong className="font-mono text-lg text-[#98761A] dark:text-[#D4AF37]">
                      {money(parsedDepositAmount)}
                    </strong>
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/[0.025]">
                  <div className="flex items-start gap-3">
                    <ShieldCheck
                      size={18}
                      className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300"
                    />

                    <div>
                      <p className="text-sm font-semibold">
                        Stripe-secured deposit
                      </p>

                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-white/35">
                        Stripe processes your payment. The
                        server verifies the real PaymentIntent
                        amount before updating your wallet.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={
                    checkoutProcessing ||
                    !depositAmountIsValid
                  }
                  className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] text-[10px] font-black uppercase tracking-[0.2em] text-black shadow-[0_12px_35px_rgba(212,175,55,0.18)] transition hover:-translate-y-0.5 hover:bg-[#E2C45D] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:bg-white/5 dark:disabled:text-white/25"
                >
                  {checkoutProcessing ? (
                    <Loader2
                      size={16}
                      className="animate-spin"
                    />
                  ) : (
                    <LockKeyhole size={16} />
                  )}

                  {checkoutProcessing
                    ? "Opening Stripe"
                    : checkout &&
                        !checkout.paymentSucceeded
                      ? "Continue Deposit"
                      : "Secure Deposit"}
                </button>
              </form>
            )}
          </aside>

          {/*===============================================
          Ledger and Payout History
          ===============================================*/}

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/5 dark:bg-[#0A0A0A] dark:shadow-2xl">
            <div className="border-b border-slate-200 p-5 dark:border-white/5 sm:p-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex gap-7 overflow-x-auto">
                  {[
                    ["earnings", "Earnings ledger"],
                    ["payouts", "Payout requests"],
                  ].map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`shrink-0 border-b-2 pb-3 text-[10px] font-black uppercase tracking-[0.2em] transition ${
                        activeTab === tab
                          ? "border-[#D4AF37] text-[#98761A] dark:text-[#D4AF37]"
                          : "border-transparent text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white/60"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  {activeTab === "earnings" ? (
                    <>
                      <label className="relative block min-w-[220px]">
                        <span className="sr-only">
                          Search earnings
                        </span>

                        <Search
                          size={15}
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                        />

                        <input
                          type="search"
                          value={search}
                          onChange={(event) =>
                            setSearch(event.target.value)
                          }
                          placeholder="Search reference or sender"
                          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-xs outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                        />
                      </label>

                      <label className="relative block min-w-[190px]">
                        <span className="sr-only">
                          Filter transaction type
                        </span>

                        <Filter
                          size={14}
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                        />

                        <select
                          value={ledgerType}
                          onChange={(event) => {
                            setLedgerType(event.target.value);
                            setLedgerPage(1);
                          }}
                          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-9 text-xs outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                        >
                          <option value="">All credits</option>

                          <option value="escrow_release">
                            P2P earnings
                          </option>

                          <option value="marketplace_purchase">
                            Marketplace earnings
                          </option>

                          <option value="marketplace_sale">
                            Marketplace sales
                          </option>

                          <option value="wallet_deposit">
                            Wallet deposits
                          </option>
                        </select>

                        <ChevronDown
                          size={14}
                          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                      </label>
                    </>
                  ) : (
                    <label className="relative block min-w-[190px]">
                      <span className="sr-only">
                        Filter payout status
                      </span>

                      <ListFilter
                        size={14}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      />

                      <select
                        value={payoutStatus}
                        onChange={(event) => {
                          setPayoutStatus(event.target.value);
                          setPayoutPage(1);
                        }}
                        className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-9 text-xs outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                      >
                        <option value="">All statuses</option>
                        <option value="pending">Pending</option>

                        <option value="processing">
                          Processing
                        </option>

                        <option value="completed">
                          Completed
                        </option>

                        <option value="failed">Failed</option>

                        <option value="cancelled">
                          Cancelled
                        </option>
                      </select>

                      <ChevronDown
                        size={14}
                        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex min-h-80 items-center justify-center">
                  <Loader2
                    className="animate-spin text-[#9B791D] dark:text-[#D4AF37]"
                    size={28}
                  />
                </div>
              ) : activeTab === "earnings" ? (
                /*=========================================
                Earnings Table
                =========================================*/

                <table className="w-full min-w-[920px] text-left">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 dark:bg-white/[0.02] dark:text-white/30">
                    <tr>
                      <th className="px-6 py-4">
                        Transaction
                      </th>

                      <th className="px-6 py-4">Source</th>

                      <th className="px-6 py-4 text-right">
                        Gross
                      </th>

                      <th className="px-6 py-4 text-right">
                        Fee
                      </th>

                      <th className="px-6 py-4 text-right">
                        Net credit
                      </th>

                      <th className="px-6 py-4">Date</th>
                    </tr>
                  </thead>

                  <tbody>
                    {earnings.map((entry) => (
                      <tr
                        key={entry.transaction_id}
                        className="border-t border-slate-100 text-sm transition hover:bg-slate-50/70 dark:border-white/5 dark:hover:bg-white/[0.025]"
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
                              <ArrowDownLeft size={16} />
                            </div>

                            <div>
                              <p className="font-semibold">
                                {transactionLabel(
                                  entry.transaction_type,
                                )}
                              </p>

                              <p className="mt-1 font-mono text-[10px] text-slate-400 dark:text-white/25">
                                {shortReference(
                                  entry.transaction_id,
                                )}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-5">
                          <p className="font-medium text-slate-700 dark:text-white/70">
                            {entry.sender_name ||
                              "Wallet funding"}
                          </p>

                          <p className="mt-1 font-mono text-[10px] text-slate-400 dark:text-white/25">
                            {shortReference(
                              entry.reference_id,
                            )}
                          </p>
                        </td>

                        <td className="px-6 py-5 text-right font-mono text-slate-600 dark:text-white/55">
                          {money(entry.gross_amount)}
                        </td>

                        <td className="px-6 py-5 text-right font-mono text-rose-500">
                          {safeNumber(
                            entry.platform_fee_deducted,
                          ) > 0
                            ? `-${money(
                                entry.platform_fee_deducted,
                              )}`
                            : money(0)}
                        </td>

                        <td className="px-6 py-5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-300">
                          +{money(entry.net_amount)}
                        </td>

                        <td className="px-6 py-5 text-xs text-slate-500 dark:text-white/35">
                          {formatDate(entry.created_at)}
                        </td>
                      </tr>
                    ))}

                    {earnings.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-6 py-20 text-center"
                        >
                          <FileText
                            className="mx-auto text-slate-300 dark:text-white/15"
                            size={32}
                          />

                          <p className="mt-4 text-sm font-semibold">
                            No earnings found
                          </p>

                          <p className="mt-2 text-xs text-slate-400 dark:text-white/25">
                            Adjust the filters or complete a
                            project to create a credit entry.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                /*=========================================
                Payout Table
                =========================================*/

                <table className="w-full min-w-[980px] text-left">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 dark:bg-white/[0.02] dark:text-white/30">
                    <tr>
                      <th className="px-6 py-4">Request</th>
                      <th className="px-6 py-4">Method</th>
                      <th className="px-6 py-4">Note</th>

                      <th className="px-6 py-4 text-right">
                        Amount
                      </th>

                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Requested</th>

                      <th className="px-6 py-4 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {payouts.map((entry) => (
                      <tr
                        key={entry.request_id}
                        className="border-t border-slate-100 text-sm transition hover:bg-slate-50/70 dark:border-white/5 dark:hover:bg-white/[0.025]"
                      >
                        <td className="px-6 py-5 font-mono text-xs">
                          {shortReference(entry.request_id)}
                        </td>

                        <td className="px-6 py-5 font-medium">
                          {payoutMethodLabel(
                            entry.payout_method,
                          )}
                        </td>

                        <td
                          title={
                            entry.destination_summary || ""
                          }
                          className="max-w-[220px] truncate px-6 py-5 text-slate-500 dark:text-white/40"
                        >
                          {entry.destination_summary || "—"}
                        </td>

                        <td className="px-6 py-5 text-right font-mono font-bold">
                          {money(entry.amount)}
                        </td>

                        <td className="px-6 py-5">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${statusClasses(
                              entry.status,
                            )}`}
                          >
                            {entry.status}
                          </span>
                        </td>

                        <td className="px-6 py-5 text-xs text-slate-500 dark:text-white/35">
                          {formatDate(entry.requested_at)}
                        </td>

                        <td className="px-6 py-5 text-right">
                          {entry.status === "pending" ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleCancelPayout(entry)
                              }
                              disabled={
                                cancellingPayoutId ===
                                entry.request_id
                              }
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-[9px] font-black uppercase tracking-[0.14em] text-rose-700 transition hover:bg-rose-100 disabled:opacity-60 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300"
                            >
                              {cancellingPayoutId ===
                              entry.request_id ? (
                                <Loader2
                                  size={13}
                                  className="animate-spin"
                                />
                              ) : (
                                <XCircle size={13} />
                              )}

                              Cancel
                            </button>
                          ) : (
                            <span className="text-xs text-slate-300 dark:text-white/15">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}

                    {payouts.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-6 py-20 text-center"
                        >
                          <ArrowUpRight
                            className="mx-auto text-slate-300 dark:text-white/15"
                            size={32}
                          />

                          <p className="mt-4 text-sm font-semibold">
                            No payout requests found
                          </p>

                          <p className="mt-2 text-xs text-slate-400 dark:text-white/25">
                            Internal payout requests will
                            appear here.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/*=============================================
            Pagination
            =============================================*/}

            <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 dark:border-white/5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs text-slate-400 dark:text-white/25">
                {activePagination.total > 0
                  ? `${activePagination.total} total record${
                      activePagination.total === 1 ? "" : "s"
                    }`
                  : "No records"}
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={goToPreviousPage}
                  disabled={activePagination.page <= 1}
                  className="flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 transition hover:border-[#D4AF37]/50 hover:text-[#98761A] disabled:cursor-not-allowed disabled:opacity-35 dark:border-white/10 dark:text-white/40"
                >
                  <ArrowLeft size={13} />

                  Previous
                </button>

                <span className="min-w-[90px] text-center text-xs text-slate-500 dark:text-white/35">
                  Page {activePagination.page || 1} of{" "}
                  {Math.max(
                    activePagination.totalPages || 1,
                    1,
                  )}
                </span>

                <button
                  type="button"
                  onClick={goToNextPage}
                  disabled={
                    !activePagination.totalPages ||
                    activePagination.page >=
                      activePagination.totalPages
                  }
                  className="flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 transition hover:border-[#D4AF37]/50 hover:text-[#98761A] disabled:cursor-not-allowed disabled:opacity-35 dark:border-white/10 dark:text-white/40"
                >
                  Next

                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/*===================================================
      Stripe Deposit Modal
      ===================================================*/}

      {checkout?.open && (
        <div
          className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-md dark:bg-black/85"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCheckout();
            }
          }}
        >
          <div className="flex min-h-full items-center justify-center py-8">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="wallet-deposit-title"
              className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-white p-7 shadow-[0_35px_100px_rgba(0,0,0,0.45)] dark:bg-[#0A0A0A] sm:p-8"
            >
              <div className="absolute -right-20 -top-20 h-52 w-52 rounded-full bg-[#D4AF37]/15 blur-[70px]" />

              <div className="relative z-10">
                <div className="flex items-start justify-between gap-5 border-b border-slate-200 pb-5 dark:border-white/5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#9B791D] dark:text-[#D4AF37]">
                      Stripe Secure Gateway
                    </p>

                    <h2
                      id="wallet-deposit-title"
                      className="mt-2 font-serif text-3xl font-light"
                    >
                      Add Wallet Funds
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-white/40">
                      Stripe processes the payment. The server
                      verifies the PaymentIntent before
                      crediting your wallet.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeCheckout}
                    disabled={
                      checkoutProcessing ||
                      verifyingDeposit
                    }
                    aria-label="Close checkout"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
                  >
                    <X size={17} />
                  </button>
                </div>

                <div className="mt-6">
                  {stripePromise ? (
                    <Elements
                      key={checkout.clientSecret}
                      stripe={stripePromise}
                    >
                      <CheckoutForm
                        clientSecret={checkout.clientSecret}
                        totalAmount={checkout.amount}
                        verifying={verifyingDeposit}
                        verificationError={verificationError}
                        paymentSucceeded={
                          checkout.paymentSucceeded
                        }
                        onPaymentSucceeded={
                          handleDepositSuccess
                        }
                        onRetryVerification={
                          retryPendingDepositVerification
                        }
                        onProcessingChange={
                          setCheckoutProcessing
                        }
                      />
                    </Elements>
                  ) : (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">
                      Stripe checkout is unavailable because
                      VITE_STRIPE_PUBLIC_KEY is missing.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}