/*
=========================================================
DesignByYou / FashionVision
Designer Wallet
Version 5.1 - Manual Bank Payout Only
=========================================================

Current designer finance model:

- Designers cannot deposit or top up their wallets.
- Designer available balance comes from internal earnings.
- Withdrawals use a verified manual bank payout account.
- Stripe Connect is disabled for new designer payouts.
- Historical wallet_deposit ledger rows remain visible for
  audit/history only.
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

import API from "../../api/axios";

/*=========================================================
Constants
=========================================================*/

const PAGE_SIZE = 20;

const MIN_PAYOUT_AMOUNT = Number(
  import.meta.env.VITE_DESIGNER_MIN_PAYOUT_AMOUNT || 10,
);

const PAYOUT_REQUEST_KEY = "designer-wallet-payout-request-id";

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

const EMPTY_PAYOUT_OPTIONS = {
  designer_country: null,
  payout_method: null,
  stripe_connect_available: false,
  manual_bank_available: false,
  country_required: false,
  bank_account: null,
};

const EMPTY_BANK_FORM = {
  country_code: "",
  account_holder_name: "",
  bank_name: "",
  currency: "USD",
  account_number: "",
  iban: "",
  swift_bic: "",
  routing_number: "",
  sort_code: "",
  branch_code: "",
  bank_address: "",
  intermediary_bank: "",
};

/*=========================================================
General Helpers
=========================================================*/

function apiError(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function apiErrorCode(error) {
  return (
    error?.response?.data?.details?.code || error?.response?.data?.code || ""
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
    throw new Error("Secure UUID generation is unavailable in this browser.");
  }

  if (typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);

  cryptoApi.getRandomValues(bytes);

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));

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

  return stringValue ? `#${stringValue.slice(0, 8).toUpperCase()}` : "—";
}

function transactionLabel(type) {
  const labels = {
    escrow_release: "Completed project earning",
    wallet_deposit: "Historical wallet deposit",
  };

  return labels[type] || String(type || "Transaction").replaceAll("_", " ");
}

function payoutMethodLabel(method) {
  const labels = {
    manual: "Bank transfer",
  };

  return labels[method] || "Bank transfer";
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

function bankStatusClasses(status) {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "verified") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300";
  }

  if (normalized === "rejected") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300";
}

function escapeCsv(value) {
  const stringValue = String(value ?? "");

  return `"${stringValue.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");

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
Designer Wallet
=========================================================*/

export default function DesignerWallet() {
  const [walletData, setWalletData] = useState(EMPTY_WALLET);

  const [payoutOptions, setPayoutOptions] = useState(EMPTY_PAYOUT_OPTIONS);

  const [earnings, setEarnings] = useState([]);
  const [payouts, setPayouts] = useState([]);

  const [ledgerPagination, setLedgerPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  const [payoutPagination, setPayoutPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  const [actionType, setActionType] = useState("payout");

  const [activeTab, setActiveTab] = useState("earnings");

  /*=======================================================
  Withdrawal State
  =======================================================*/

  const [withdrawAmount, setWithdrawAmount] = useState("");

  const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);

  const [cancellingPayoutId, setCancellingPayoutId] = useState("");

  /*=======================================================
  Bank Payout Account State
  =======================================================*/

  const [bankForm, setBankForm] = useState(EMPTY_BANK_FORM);

  const [isSavingBank, setIsSavingBank] = useState(false);

  const bankFormAccountRef = useRef("");

  /*=======================================================
  Filters and Pagination
  =======================================================*/

  const [search, setSearch] = useState("");

  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [ledgerType, setLedgerType] = useState("");

  const [payoutStatus, setPayoutStatus] = useState("");

  const [ledgerPage, setLedgerPage] = useState(1);

  const [payoutPage, setPayoutPage] = useState(1);

  /*=======================================================
  Idempotency Keys
  =======================================================*/

  const payoutRequestIdRef = useRef(getOrCreateSessionUuid(PAYOUT_REQUEST_KEY));

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
  Fetch Finance Data
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
        const [walletRes, payoutOptionsRes, ledgerRes, payoutsRes] =
          await Promise.all([
            API.get("/designer-finance/wallet"),

            API.get("/designer-finance/payout-options"),

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

        setPayoutOptions({
          ...EMPTY_PAYOUT_OPTIONS,
          ...(payoutOptionsRes?.data?.data || {}),
        });

        setEarnings(arrayFromResponse(ledgerRes));

        setPayouts(arrayFromResponse(payoutsRes));

        setLedgerPagination(paginationFromResponse(ledgerRes));

        setPayoutPagination(paginationFromResponse(payoutsRes));
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
    [debouncedSearch, ledgerPage, ledgerType, payoutPage, payoutStatus],
  );

  useEffect(() => {
    void fetchWalletData();
  }, [fetchWalletData]);

  /*=======================================================
  Current Bank Form Initialization
  =======================================================*/

  const bankAccount = payoutOptions?.bank_account || null;

  useEffect(() => {
    const accountKey = bankAccount?.id || "no-bank-account";

    if (bankFormAccountRef.current === accountKey) {
      return;
    }

    bankFormAccountRef.current = accountKey;

    setBankForm({
      ...EMPTY_BANK_FORM,

      country_code: bankAccount?.country_code || "",

      account_holder_name: bankAccount?.account_holder_name || "",

      bank_name: bankAccount?.bank_name || "",

      currency: bankAccount?.currency || "USD",
    });
  }, [bankAccount]);

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
  Wallet Metrics
  =======================================================*/

  const metrics = useMemo(
    () => ({
      available: safeNumber(walletData.available_balance),

      pendingEscrow: safeNumber(walletData.pending_escrow_balance),

      pendingPayout: safeNumber(walletData.pending_payout_balance),

      total: safeNumber(walletData.total_wallet_balance),

      lifetimeEarnings: safeNumber(walletData.lifetime_earnings),

      lifetimeDeposits: safeNumber(walletData.lifetime_deposits),

      lifetimeWithdrawn: safeNumber(walletData.lifetime_withdrawn),

      queuedPayouts: safeNumber(walletData.queued_payouts),
    }),
    [walletData],
  );

  const parsedWithdrawAmount = safeNumber(withdrawAmount);

  const manualPayoutAvailable =
    payoutOptions?.payout_method === "manual" &&
    payoutOptions?.manual_bank_available === true &&
    payoutOptions?.country_required !== true;

  const bankVerified =
    Boolean(bankAccount) &&
    bankAccount?.verification_status === "verified" &&
    bankAccount?.is_active === true &&
    bankAccount?.is_default === true;

  const payoutAmountIsValid =
    manualPayoutAvailable &&
    bankVerified &&
    parsedWithdrawAmount >= MIN_PAYOUT_AMOUNT &&
    parsedWithdrawAmount <= metrics.available;

  const clearMessages = () => {
    setError("");
    setSuccessMessage("");
  };

  /*=======================================================
  Save Bank Account
  =======================================================*/

  const handleBankFieldChange = (field, value) => {
    setBankForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSaveBankAccount = async (event) => {
    event.preventDefault();

    clearMessages();

    const countryCode = String(bankForm.country_code || "")
      .trim()
      .toUpperCase();

    const currency = String(bankForm.currency || "")
      .trim()
      .toUpperCase();

    const accountHolderName = String(bankForm.account_holder_name || "").trim();

    const bankName = String(bankForm.bank_name || "").trim();

    const accountNumber = String(bankForm.account_number || "").trim();

    const iban = String(bankForm.iban || "")
      .replace(/\s+/g, "")
      .trim()
      .toUpperCase();

    const swiftBic = String(bankForm.swift_bic || "")
      .replace(/\s+/g, "")
      .trim()
      .toUpperCase();

    if (!/^[A-Z]{2}$/.test(countryCode)) {
      setError(
        "Enter a valid two-letter bank country code, for example AE or NP.",
      );

      return;
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
      setError("Enter a valid three-letter currency code, for example USD.");

      return;
    }

    if (!accountHolderName) {
      setError("Enter the bank account holder name.");

      return;
    }

    if (!bankName) {
      setError("Enter the bank name.");

      return;
    }

    if (!accountNumber && !iban) {
      setError("Provide either the full bank account number or the full IBAN.");

      return;
    }

    if (iban && !/^[A-Z0-9]{15,34}$/.test(iban)) {
      setError("The IBAN format is invalid.");

      return;
    }

    if (swiftBic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(swiftBic)) {
      setError("The SWIFT/BIC format is invalid.");

      return;
    }

    setIsSavingBank(true);

    try {
      const response = await API.put("/designer-finance/payout-accounts/bank", {
        country_code: countryCode,

        account_holder_name: accountHolderName,

        bank_name: bankName,

        currency,

        account_number: accountNumber || undefined,

        iban: iban || undefined,

        swift_bic: swiftBic || undefined,

        routing_number: bankForm.routing_number.trim() || undefined,

        sort_code: bankForm.sort_code.trim() || undefined,

        branch_code: bankForm.branch_code.trim() || undefined,

        bank_address: bankForm.bank_address.trim() || undefined,

        intermediary_bank: bankForm.intermediary_bank.trim() || undefined,
      });

      const savedAccount = response?.data?.data || null;

      bankFormAccountRef.current = "";

      setBankForm({
        ...EMPTY_BANK_FORM,

        country_code: savedAccount?.country_code || countryCode,

        account_holder_name:
          savedAccount?.account_holder_name || accountHolderName,

        bank_name: savedAccount?.bank_name || bankName,

        currency: savedAccount?.currency || currency,
      });

      setPayoutOptions((current) => ({
        ...current,
        payout_method: "manual",
        stripe_connect_available: false,
        manual_bank_available: true,
        bank_account: savedAccount,
      }));

      setSuccessMessage(
        `${
          response?.data?.message ||
          "The bank payout account was saved successfully."
        } ${
          savedAccount?.verification_status === "pending"
            ? "Super Admin verification is required before you can request a withdrawal."
            : ""
        }`.trim(),
      );

      await fetchWalletData({
        silent: true,
      });
    } catch (requestError) {
      setError(
        apiError(requestError, "The bank payout account could not be saved."),
      );
    } finally {
      setIsSavingBank(false);
    }
  };

  /*=======================================================
  Create Manual Bank Payout Request
  =======================================================*/

  const handleWithdrawalRequest = async (event) => {
    event.preventDefault();

    clearMessages();

    const amount = safeNumber(withdrawAmount);

    if (payoutOptions?.country_required) {
      setError(
        "Add your country to your designer profile before setting up payouts.",
      );

      return;
    }

    if (!manualPayoutAvailable) {
      setError(
        "Manual bank payouts are currently unavailable for this account.",
      );

      return;
    }

    if (!bankAccount) {
      setError("Add a bank payout account before requesting a withdrawal.");

      setActionType("bank");

      return;
    }

    if (!bankVerified) {
      setError(
        "Your bank payout account must be verified before requesting a withdrawal.",
      );

      setActionType("bank");

      return;
    }

    if (amount <= 0) {
      setError("Enter a valid payout amount.");

      return;
    }

    if (amount < MIN_PAYOUT_AMOUNT) {
      setError(`The minimum payout amount is ${money(MIN_PAYOUT_AMOUNT)}.`);

      return;
    }

    if (amount > metrics.available) {
      setError("The requested payout exceeds your available balance.");

      return;
    }

    setIsSubmittingPayout(true);

    try {
      const response = await API.post("/designer-finance/payouts", {
        amount,

        payoutMethod: "manual",

        bankAccountId: bankAccount.id,

        client_request_id: payoutRequestIdRef.current,
      });

      payoutRequestIdRef.current = resetSessionUuid(PAYOUT_REQUEST_KEY);

      setWithdrawAmount("");

      setActiveTab("payouts");
      setPayoutPage(1);

      setSuccessMessage(
        response?.data?.message ||
          "The bank payout request was created and the amount was reserved.",
      );

      await fetchWalletData({
        silent: true,
      });
    } catch (requestError) {
      const code = apiErrorCode(requestError);

      if (code === "VERIFIED_BANK_ACCOUNT_REQUIRED") {
        setActionType("bank");
      }

      setError(
        apiError(requestError, "The bank payout request could not be created."),
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
      )} bank payout request and restore the funds to your available balance?`,
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
        apiError(requestError, "The payout request could not be cancelled."),
      );
    } finally {
      setCancellingPayoutId("");
    }
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
        "Destination",
        "Status",
        "Provider Status",
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
        entry.provider_status,
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
    activeTab === "earnings" ? ledgerPagination : payoutPagination;

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
        Math.min(ledgerPagination.totalPages || 1, page + 1),
      );
    } else {
      setPayoutPage((page) =>
        Math.min(payoutPagination.totalPages || 1, page + 1),
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

      description: "Available for verified bank payout reservation",

      icon: Wallet,

      iconClass: "text-emerald-600 dark:text-emerald-300",

      panelClass:
        "border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-400/10 dark:bg-emerald-400/[0.06]",
    },

    {
      title: "Project Funds Pending",

      value: metrics.pendingEscrow,

      description: "Project funds awaiting release to your wallet",

      icon: LockKeyhole,

      iconClass: "text-[#9B791D] dark:text-[#D4AF37]",

      panelClass: "border-[#D4AF37]/25 bg-[#D4AF37]/[0.07]",
    },

    {
      title: "Pending Payouts",

      value: metrics.pendingPayout,

      description: "Reserved for pending or processing bank transfers",

      icon: Clock3,

      iconClass: "text-indigo-600 dark:text-indigo-300",

      panelClass:
        "border-indigo-200/70 bg-indigo-50/60 dark:border-indigo-400/10 dark:bg-indigo-400/[0.06]",
    },

    {
      title: "Lifetime Earnings",

      value: metrics.lifetimeEarnings,

      description: "Net earnings released from completed projects",

      icon: TrendingUp,

      iconClass: "text-sky-600 dark:text-sky-300",

      panelClass:
        "border-sky-200/70 bg-sky-50/60 dark:border-sky-400/10 dark:bg-sky-400/[0.06]",
    },
  ];

  const exportDisabled =
    activeTab === "earnings" ? earnings.length === 0 : payouts.length === 0;

  /*=======================================================
  Bank Payout Status UI
  =======================================================*/

  const bankStatus = bankAccount?.verification_status || null;

  const bankStatusText =
    bankStatus === "verified"
      ? "Verified"
      : bankStatus === "rejected"
        ? "Rejected"
        : bankStatus === "pending"
          ? "Pending verification"
          : "Not configured";

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
              Track project earnings, available balances and verified bank
              payout requests from one secure financial ledger.
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
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
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

            ["Historical deposits", metrics.lifetimeDeposits],

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

        <div className="grid gap-8 xl:grid-cols-[410px_1fr]">
          {/*===============================================
          Wallet Actions
          ===============================================*/}

          <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-[#0A0A0A] dark:shadow-2xl sm:p-7 xl:sticky xl:top-32">
            <div className="rounded-2xl border border-slate-200 bg-slate-100 p-1.5 dark:border-white/10 dark:bg-[#111]">
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  ["payout", ArrowUpRight, "Withdraw"],

                  ["bank", Landmark, "Bank"],
                ].map(([type, Icon, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setActionType(type);

                      clearMessages();
                    }}
                    className={`flex h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-[8px] font-black uppercase tracking-[0.12em] transition ${
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
            Manual Bank Withdrawal
            =============================================*/}

            {actionType === "payout" && (
              <form
                onSubmit={handleWithdrawalRequest}
                className="mt-7 space-y-5"
              >
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-white/40">
                    Withdrawal destination
                  </p>

                  {bankAccount ? (
                    <div className="mt-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.025]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="rounded-xl bg-[#D4AF37]/10 p-2.5 text-[#98761A] dark:text-[#D4AF37]">
                            <Landmark size={17} />
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {bankAccount.destination_summary ||
                                bankAccount.bank_name}
                            </p>

                            <p className="mt-1 text-xs text-slate-500 dark:text-white/35">
                              {bankAccount.account_holder_name} ·{" "}
                              {bankAccount.country_code} ·{" "}
                              {bankAccount.currency}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.12em] ${bankStatusClasses(
                            bankStatus,
                          )}`}
                        >
                          {bankStatusText}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActionType("bank")}
                        className="mt-4 text-[9px] font-black uppercase tracking-[0.14em] text-[#98761A] transition hover:underline dark:text-[#D4AF37]"
                      >
                        Manage bank details
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
                      <div className="flex items-start gap-3">
                        <AlertCircle
                          size={18}
                          className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
                        />

                        <div>
                          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                            Bank setup required
                          </p>

                          <p className="mt-1 text-xs leading-5 text-amber-700/80 dark:text-amber-200/70">
                            Add and verify a bank payout account before
                            requesting a withdrawal.
                          </p>

                          <button
                            type="button"
                            onClick={() => setActionType("bank")}
                            className="mt-3 text-[9px] font-black uppercase tracking-[0.14em] text-amber-800 underline dark:text-amber-200"
                          >
                            Set up bank
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="payout-amount"
                      className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-white/40"
                    >
                      Withdrawal amount
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        setWithdrawAmount(metrics.available.toFixed(2))
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
                      placeholder={`Minimum ${money(MIN_PAYOUT_AMOUNT)}`}
                      className="h-[52px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 font-mono text-sm outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303] dark:text-white"
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 dark:text-white/30">
                    <span>Minimum {money(MIN_PAYOUT_AMOUNT)}</span>

                    <span>Available {money(metrics.available)}</span>
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
                      <option value="manual">Verified bank transfer</option>
                    </select>

                    <ChevronDown
                      size={16}
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </div>

                {!bankVerified && bankAccount && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                    This bank account is{" "}
                    <strong>{bankStatusText.toLowerCase()}</strong>. Withdrawals
                    are available only after Super Admin verification.
                  </div>
                )}

                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-400/20 dark:bg-indigo-400/10">
                  <div className="flex items-start gap-3">
                    <Info
                      size={18}
                      className="mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-300"
                    />

                    <div>
                      <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                        Manual bank payout
                      </p>

                      <p className="mt-1 text-xs leading-5 text-indigo-700/80 dark:text-indigo-200/70">
                        Your withdrawal is reserved from your available balance.
                        DesignByYou reviews the request and transfers the funds
                        to your verified bank account. You can cancel only while
                        the request is still pending.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingPayout || !payoutAmountIsValid}
                  className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] text-[10px] font-black uppercase tracking-[0.2em] text-black shadow-[0_12px_35px_rgba(212,175,55,0.18)] transition hover:-translate-y-0.5 hover:bg-[#E2C45D] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:bg-white/5 dark:disabled:text-white/25"
                >
                  {isSubmittingPayout ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ArrowUpRight size={16} />
                  )}

                  {isSubmittingPayout
                    ? "Reserving Funds"
                    : "Request Bank Payout"}
                </button>
              </form>
            )}

            {/*=============================================
            Bank Payout Account
            =============================================*/}

            {actionType === "bank" && (
              <form onSubmit={handleSaveBankAccount} className="mt-7 space-y-5">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-white/40">
                        Bank payout account
                      </p>

                      <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-white/35">
                        Full bank details are sent securely to the backend and
                        encrypted before storage.
                      </p>
                    </div>

                    {bankAccount && (
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.12em] ${bankStatusClasses(
                          bankStatus,
                        )}`}
                      >
                        {bankStatusText}
                      </span>
                    )}
                  </div>

                  {bankAccount && (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.025]">
                      <div className="flex items-start gap-3">
                        <Landmark
                          size={18}
                          className="mt-0.5 shrink-0 text-[#98761A] dark:text-[#D4AF37]"
                        />

                        <div>
                          <p className="text-sm font-semibold">
                            {bankAccount.destination_summary ||
                              bankAccount.bank_name}
                          </p>

                          <p className="mt-1 text-xs text-slate-500 dark:text-white/35">
                            {bankAccount.account_holder_name} ·{" "}
                            {bankAccount.country_code} · {bankAccount.currency}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {bankAccount && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
                    <div className="flex items-start gap-3">
                      <Info
                        size={17}
                        className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
                      />

                      <p className="text-xs leading-5 text-amber-800 dark:text-amber-200">
                        For security, the full account number and IBAN are never
                        returned by the API. When replacing bank details, enter
                        the complete destination again. The updated account will
                        require verification before new withdrawals.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/40">
                      Bank country
                    </span>

                    <input
                      type="text"
                      maxLength={2}
                      value={bankForm.country_code}
                      onChange={(event) =>
                        handleBankFieldChange(
                          "country_code",
                          event.target.value.toUpperCase(),
                        )
                      }
                      placeholder="AE"
                      className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm uppercase outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303]"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/40">
                      Currency
                    </span>

                    <input
                      type="text"
                      maxLength={3}
                      value={bankForm.currency}
                      onChange={(event) =>
                        handleBankFieldChange(
                          "currency",
                          event.target.value.toUpperCase(),
                        )
                      }
                      placeholder="USD"
                      className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm uppercase outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303]"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/40">
                    Account holder
                  </span>

                  <input
                    type="text"
                    maxLength={160}
                    value={bankForm.account_holder_name}
                    onChange={(event) =>
                      handleBankFieldChange(
                        "account_holder_name",
                        event.target.value,
                      )
                    }
                    placeholder="Full legal name"
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303]"
                  />
                </label>

                <label className="block">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/40">
                    Bank name
                  </span>

                  <input
                    type="text"
                    maxLength={160}
                    value={bankForm.bank_name}
                    onChange={(event) =>
                      handleBankFieldChange("bank_name", event.target.value)
                    }
                    placeholder="Bank name"
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303]"
                  />
                </label>

                <label className="block">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/40">
                    Account number
                  </span>

                  <input
                    type="text"
                    autoComplete="off"
                    value={bankForm.account_number}
                    onChange={(event) =>
                      handleBankFieldChange(
                        "account_number",
                        event.target.value,
                      )
                    }
                    placeholder="Full account number"
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-sm outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303]"
                  />
                </label>

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />

                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-white/25">
                    or
                  </span>

                  <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                </div>

                <label className="block">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/40">
                    IBAN
                  </span>

                  <input
                    type="text"
                    autoComplete="off"
                    value={bankForm.iban}
                    onChange={(event) =>
                      handleBankFieldChange(
                        "iban",
                        event.target.value.toUpperCase(),
                      )
                    }
                    placeholder="Full IBAN"
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-sm uppercase outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303]"
                  />
                </label>

                <label className="block">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/40">
                    SWIFT / BIC
                  </span>

                  <input
                    type="text"
                    maxLength={11}
                    autoComplete="off"
                    value={bankForm.swift_bic}
                    onChange={(event) =>
                      handleBankFieldChange(
                        "swift_bic",
                        event.target.value.toUpperCase(),
                      )
                    }
                    placeholder="Optional SWIFT/BIC"
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-sm uppercase outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303]"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/40">
                      Routing number
                    </span>

                    <input
                      type="text"
                      autoComplete="off"
                      value={bankForm.routing_number}
                      onChange={(event) =>
                        handleBankFieldChange(
                          "routing_number",
                          event.target.value,
                        )
                      }
                      placeholder="Optional"
                      className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303]"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/40">
                      Branch code
                    </span>

                    <input
                      type="text"
                      autoComplete="off"
                      value={bankForm.branch_code}
                      onChange={(event) =>
                        handleBankFieldChange("branch_code", event.target.value)
                      }
                      placeholder="Optional"
                      className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303]"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/40">
                    Sort code
                  </span>

                  <input
                    type="text"
                    autoComplete="off"
                    value={bankForm.sort_code}
                    onChange={(event) =>
                      handleBankFieldChange("sort_code", event.target.value)
                    }
                    placeholder="Optional"
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303]"
                  />
                </label>

                <label className="block">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/40">
                    Bank address
                  </span>

                  <textarea
                    rows={2}
                    maxLength={300}
                    value={bankForm.bank_address}
                    onChange={(event) =>
                      handleBankFieldChange("bank_address", event.target.value)
                    }
                    placeholder="Optional bank address"
                    className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303]"
                  />
                </label>

                <label className="block">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/40">
                    Intermediary bank
                  </span>

                  <input
                    type="text"
                    maxLength={200}
                    value={bankForm.intermediary_bank}
                    onChange={(event) =>
                      handleBankFieldChange(
                        "intermediary_bank",
                        event.target.value,
                      )
                    }
                    placeholder="Optional"
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-[#030303]"
                  />
                </label>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-400/20 dark:bg-emerald-400/10">
                  <div className="flex items-start gap-3">
                    <ShieldCheck
                      size={18}
                      className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300"
                    />

                    <p className="text-xs leading-5 text-emerald-800 dark:text-emerald-200">
                      Full account details are encrypted by the backend.
                      Designer read endpoints return only masked information
                      such as the last four characters.
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSavingBank}
                  className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] text-[10px] font-black uppercase tracking-[0.2em] text-black shadow-[0_12px_35px_rgba(212,175,55,0.18)] transition hover:-translate-y-0.5 hover:bg-[#E2C45D] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingBank ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Landmark size={16} />
                  )}

                  {isSavingBank
                    ? "Saving Securely"
                    : bankAccount
                      ? "Update Bank Account"
                      : "Save Bank Account"}
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

                    ["payouts", "Bank payouts"],
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
                        <span className="sr-only">Search earnings</span>

                        <Search
                          size={15}
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                        />

                        <input
                          type="search"
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Search reference or sender"
                          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-xs outline-none transition focus:border-[#D4AF37]/60 focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                        />
                      </label>

                      <label className="relative block min-w-[190px]">
                        <span className="sr-only">Filter transaction type</span>

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
                            Project earnings
                          </option>

                          <option value="wallet_deposit">
                            Historical deposits
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
                      <span className="sr-only">Filter payout status</span>

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

                        <option value="processing">Processing</option>

                        <option value="completed">Completed</option>

                        <option value="failed">Failed</option>

                        <option value="cancelled">Cancelled</option>
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
                      <th className="px-6 py-4">Transaction</th>

                      <th className="px-6 py-4">Source</th>

                      <th className="px-6 py-4 text-right">Gross</th>

                      <th className="px-6 py-4 text-right">Fee</th>

                      <th className="px-6 py-4 text-right">Net credit</th>

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
                                {transactionLabel(entry.transaction_type)}
                              </p>

                              <p className="mt-1 font-mono text-[10px] text-slate-400 dark:text-white/25">
                                {shortReference(entry.transaction_id)}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-5">
                          <p className="font-medium text-slate-700 dark:text-white/70">
                            {entry.sender_name ||
                              (entry.transaction_type === "wallet_deposit"
                                ? "Historical wallet funding"
                                : "Booking payment")}
                          </p>

                          <p className="mt-1 font-mono text-[10px] text-slate-400 dark:text-white/25">
                            {shortReference(entry.reference_id)}
                          </p>
                        </td>

                        <td className="px-6 py-5 text-right font-mono text-slate-600 dark:text-white/55">
                          {money(entry.gross_amount)}
                        </td>

                        <td className="px-6 py-5 text-right font-mono text-rose-500">
                          {safeNumber(entry.platform_fee_deducted) > 0
                            ? `-${money(entry.platform_fee_deducted)}`
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
                        <td colSpan={6} className="px-6 py-20 text-center">
                          <FileText
                            className="mx-auto text-slate-300 dark:text-white/15"
                            size={32}
                          />

                          <p className="mt-4 text-sm font-semibold">
                            No earnings found
                          </p>

                          <p className="mt-2 text-xs text-slate-400 dark:text-white/25">
                            Adjust the filters or complete a project to create
                            an earning entry.
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

                <table className="w-full min-w-[1080px] text-left">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 dark:bg-white/[0.02] dark:text-white/30">
                    <tr>
                      <th className="px-6 py-4">Request</th>

                      <th className="px-6 py-4">Method</th>

                      <th className="px-6 py-4">Destination</th>

                      <th className="px-6 py-4 text-right">Amount</th>

                      <th className="px-6 py-4">Status</th>

                      <th className="px-6 py-4">Requested</th>

                      <th className="px-6 py-4 text-right">Action</th>
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
                          {payoutMethodLabel(entry.payout_method)}
                        </td>

                        <td
                          title={entry.destination_summary || ""}
                          className="max-w-[240px] truncate px-6 py-5 text-slate-500 dark:text-white/40"
                        >
                          {entry.destination_summary || "—"}
                        </td>

                        <td className="px-6 py-5 text-right font-mono font-bold">
                          {money(entry.amount)}
                        </td>

                        <td className="px-6 py-5">
                          <div className="space-y-1.5">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${statusClasses(
                                entry.status,
                              )}`}
                            >
                              {entry.status}
                            </span>

                            {entry.provider_status && (
                              <p className="max-w-[180px] truncate text-[9px] text-slate-400 dark:text-white/25">
                                {String(entry.provider_status).replaceAll(
                                  "_",
                                  " ",
                                )}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-5 text-xs text-slate-500 dark:text-white/35">
                          {formatDate(entry.requested_at)}
                        </td>

                        <td className="px-6 py-5 text-right">
                          {entry.status === "pending" ? (
                            <button
                              type="button"
                              onClick={() => handleCancelPayout(entry)}
                              disabled={cancellingPayoutId === entry.request_id}
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-[9px] font-black uppercase tracking-[0.14em] text-rose-700 transition hover:bg-rose-100 disabled:opacity-60 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300"
                            >
                              {cancellingPayoutId === entry.request_id ? (
                                <Loader2 size={13} className="animate-spin" />
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
                        <td colSpan={7} className="px-6 py-20 text-center">
                          <ArrowUpRight
                            className="mx-auto text-slate-300 dark:text-white/15"
                            size={32}
                          />

                          <p className="mt-4 text-sm font-semibold">
                            No bank payout requests found
                          </p>

                          <p className="mt-2 text-xs text-slate-400 dark:text-white/25">
                            Verified bank withdrawal requests will appear here.
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
                  {Math.max(activePagination.totalPages || 1, 1)}
                </span>

                <button
                  type="button"
                  onClick={goToNextPage}
                  disabled={
                    !activePagination.totalPages ||
                    activePagination.page >= activePagination.totalPages
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
    </main>
  );
}
