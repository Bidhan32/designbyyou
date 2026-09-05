"use strict";

/*
=========================================================
DesignByYou
Creator Bookings / Contract Pipeline
Version 4.0
=========================================================

Responsibilities:

1. Display authenticated Creator booking pipeline
2. Show booking workflow state accurately
3. Surface actions requiring Creator attention
4. Surface cancellation / refund reconciliation
5. Preserve legacy booking states
6. Never hide unknown future states
7. Provide responsive Creator booking workspace navigation

=========================================================
IMPORTANT
=========================================================

The backend pipeline already scopes results using the
authenticated user.

DO NOT:

- trust localStorage user IDs for booking ownership
- re-filter authorization on the frontend
- hide unknown booking statuses
- treat refund failures as ordinary progress

Authorization remains a backend responsibility.

=========================================================
*/

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Link } from "react-router-dom";

import {
  AlertCircle,
  ArrowRight,
  BadgeDollarSign,
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Compass,
  FileCheck2,
  Hourglass,
  Inbox,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

import API from "../../api/axios";

/*=========================================================
Booking Status
=========================================================*/

const BOOKING_STATUS = Object.freeze({
  PENDING: "pending",

  AWAITING_PAYMENT: "awaiting_payment",

  FUNDED: "funded",

  /*
  Legacy state retained for older bookings.
  */
  ACCEPTED: "accepted",

  PROGRESS: "progress",

  REVIEW_PROTOTYPE: "review_prototype",

  FINAL_PRODUCTION: "final_production",

  REVIEW_FINAL: "review_final",

  /*
  Legacy state retained for older bookings.
  */
  REVIEW: "review",

  CANCELLATION_PENDING: "cancellation_pending",

  REFUND_PENDING: "refund_pending",

  REFUND_FAILED: "refund_failed",

  COMPLETED: "completed",

  /*
  Legacy terminal state.
  */
  DELIVERED: "delivered",

  CANCELLED: "cancelled",
});

/*=========================================================
Status Groups
=========================================================*/

const WAITING_STATUSES = new Set([
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.FUNDED,
]);

const ACTIVE_STATUSES = new Set([
  BOOKING_STATUS.ACCEPTED,
  BOOKING_STATUS.PROGRESS,
  BOOKING_STATUS.REVIEW_PROTOTYPE,
  BOOKING_STATUS.FINAL_PRODUCTION,
  BOOKING_STATUS.REVIEW_FINAL,
  BOOKING_STATUS.REVIEW,
]);

const ATTENTION_STATUSES = new Set([
  BOOKING_STATUS.CANCELLATION_PENDING,
  BOOKING_STATUS.REFUND_PENDING,
  BOOKING_STATUS.REFUND_FAILED,
]);

const ARCHIVE_STATUSES = new Set([
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.DELIVERED,
  BOOKING_STATUS.CANCELLED,
]);

const CREATOR_ACTION_STATUSES = new Set([
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.REVIEW_PROTOTYPE,
  BOOKING_STATUS.REVIEW_FINAL,
  BOOKING_STATUS.REVIEW,
  BOOKING_STATUS.REFUND_FAILED,
]);

/*=========================================================
Tabs
=========================================================*/

const TAB_DEFINITIONS = Object.freeze([
  {
    id: "waiting",

    label: "Waiting",

    description: "Requests and funding",
  },

  {
    id: "active",

    label: "In Progress",

    description: "Active bookings",
  },

  {
    id: "attention",

    label: "Needs Attention",

    description: "Cancellation & refunds",
  },

  {
    id: "archive",

    label: "Archive",

    description: "Completed or closed",
  },
]);

/*=========================================================
Progress
=========================================================*/

const STATUS_PROGRESS = Object.freeze({
  [BOOKING_STATUS.PENDING]: 10,

  [BOOKING_STATUS.AWAITING_PAYMENT]: 18,

  [BOOKING_STATUS.FUNDED]: 26,

  [BOOKING_STATUS.ACCEPTED]: 34,

  [BOOKING_STATUS.PROGRESS]: 42,

  [BOOKING_STATUS.REVIEW_PROTOTYPE]: 58,

  [BOOKING_STATUS.FINAL_PRODUCTION]: 74,

  [BOOKING_STATUS.REVIEW_FINAL]: 90,

  [BOOKING_STATUS.REVIEW]: 90,

  [BOOKING_STATUS.CANCELLATION_PENDING]: 92,

  [BOOKING_STATUS.REFUND_PENDING]: 95,

  [BOOKING_STATUS.REFUND_FAILED]: 95,

  [BOOKING_STATUS.COMPLETED]: 100,

  [BOOKING_STATUS.DELIVERED]: 100,

  [BOOKING_STATUS.CANCELLED]: 100,
});

/*=========================================================
General Helpers
=========================================================*/

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isCancelledRequest(error) {
  return (
    error?.code === "ERR_CANCELED" ||
    error?.name === "CanceledError" ||
    error?.name === "AbortError"
  );
}

function getFirstName(value) {
  const name = String(value || "").trim();

  return name ? name.split(/\s+/)[0] : "Designer";
}

function safeNumber(value) {
  const number = Number.parseFloat(value);

  return Number.isFinite(number) ? number : 0;
}

function formatCurrency(value, currency = "usd") {
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
    return "Not scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",

    day: "numeric",

    year: "numeric",
  }).format(date);
}

function formatCreatedDate(value) {
  if (!value) {
    return "Date unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",

    day: "numeric",

    year: "numeric",
  }).format(date);
}

function getTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getApiErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    "The contract pipeline could not be loaded."
  );
}

function formatBookingType(value) {
  const type = String(value || "")
    .trim()
    .toLowerCase();

  /*
  "marketplace" is retained as a legacy/backend booking
  origin value, but the Creator-facing product is a
  showcase/discovery experience rather than direct product
  sales.
  */

  if (type === "marketplace") {
    return "Showcase Booking";
  }

  if (type === "commission") {
    return "Direct Booking";
  }

  if (!type) {
    return "Commission";
  }

  return type
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/*=========================================================
Tab Resolution

IMPORTANT:

Unknown future statuses intentionally go to:

Needs Attention

rather than disappearing from the Creator UI.
=========================================================*/

function getTabForStatus(value) {
  const status = normalizeStatus(value);

  if (WAITING_STATUSES.has(status)) {
    return "waiting";
  }

  if (ACTIVE_STATUSES.has(status)) {
    return "active";
  }

  if (ARCHIVE_STATUSES.has(status)) {
    return "archive";
  }

  /*
  Explicit attention states AND unknown states.
  */

  return "attention";
}

/*=========================================================
Deadline
=========================================================*/

function getDeadlineDetails(value, statusValue) {
  const status = normalizeStatus(statusValue);

  if (ARCHIVE_STATUSES.has(status)) {
    return {
      label:
        status === BOOKING_STATUS.CANCELLED
          ? "Contract closed"
          : "Contract completed",

      urgent: false,
    };
  }

  if (ATTENTION_STATUSES.has(status)) {
    return {
      label: "Timeline paused during reconciliation",

      urgent: false,
    };
  }

  if (!value) {
    return {
      label: "Deadline not set",

      urgent: false,
    };
  }

  const deadline = new Date(value);

  if (Number.isNaN(deadline.getTime())) {
    return {
      label: "Deadline unavailable",

      urgent: false,
    };
  }

  const now = new Date();

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();

  const startOfDeadline = new Date(
    deadline.getFullYear(),
    deadline.getMonth(),
    deadline.getDate(),
  ).getTime();

  const days = Math.round((startOfDeadline - startOfToday) / 86400000);

  if (days < 0) {
    const overdueDays = Math.abs(days);

    return {
      label: `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`,

      urgent: true,
    };
  }

  if (days === 0) {
    return {
      label: "Due today",

      urgent: true,
    };
  }

  if (days === 1) {
    return {
      label: "Due tomorrow",

      urgent: true,
    };
  }

  return {
    label: `${days} days remaining`,

    urgent: days <= 3,
  };
}

/*=========================================================
Escrow Display
=========================================================*/

function getEscrowDetails(booking) {
  const status = normalizeStatus(booking?.status);

  if (booking?.escrow_locked === true) {
    return {
      label: "Secured",

      className: "text-emerald-600 dark:text-emerald-300",
    };
  }

  if (
    status === BOOKING_STATUS.COMPLETED ||
    status === BOOKING_STATUS.DELIVERED
  ) {
    return {
      label: "Released",

      className: "text-[#9B791D] dark:text-[#D4AF37]",
    };
  }

  if (status === BOOKING_STATUS.CANCELLED) {
    return {
      label: "Closed",

      className: "text-slate-500 dark:text-white/45",
    };
  }

  if (ATTENTION_STATUSES.has(status)) {
    return {
      label: "Reconciling",

      className: "text-rose-600 dark:text-rose-300",
    };
  }

  return {
    label: "Not secured",

    className: "text-slate-500 dark:text-white/45",
  };
}

/*=========================================================
Status Presentation
=========================================================*/

function getStatusDetails(statusValue, designerName) {
  const status = normalizeStatus(statusValue);

  const shortName = getFirstName(designerName);

  switch (status) {
    case BOOKING_STATUS.PENDING:
      return {
        label: "Awaiting Designer",

        description: `${shortName} is reviewing your booking request.`,

        badgeClass:
          "border-amber-300/60 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",

        icon: Hourglass,
      };

    case BOOKING_STATUS.AWAITING_PAYMENT:
      return {
        label: "Payment Required",

        description:
          "The booking is ready for funding. Complete payment to secure the agreed amount in escrow.",

        badgeClass:
          "border-orange-300/60 bg-orange-50 text-orange-700 dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-300",

        icon: WalletCards,
      };

    case BOOKING_STATUS.FUNDED:
      return {
        label: "Escrow Secured",

        description: `Your payment is protected in escrow while ${shortName} moves the booking into production.`,

        badgeClass:
          "border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",

        icon: ShieldCheck,
      };

    case BOOKING_STATUS.ACCEPTED:
    case BOOKING_STATUS.PROGRESS:
      return {
        label: "Prototype Production",

        description: `${shortName} is preparing the initial work for your review.`,

        badgeClass:
          "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#8F7118] dark:text-[#E4C760]",

        icon: Clock3,
      };

    case BOOKING_STATUS.REVIEW_PROTOTYPE:
      return {
        label: "Prototype Ready",

        description:
          "A prototype is ready. Review it in the contract workspace and approve it or request changes.",

        badgeClass:
          "border-indigo-300/60 bg-indigo-50 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300",

        icon: FileCheck2,
      };

    case BOOKING_STATUS.FINAL_PRODUCTION:
      return {
        label: "Final Production",

        description: `${shortName} is preparing the final deliverables.`,

        badgeClass:
          "border-cyan-300/60 bg-cyan-50 text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-300",

        icon: Clock3,
      };

    case BOOKING_STATUS.REVIEW_FINAL:
    case BOOKING_STATUS.REVIEW:
      return {
        label: "Final Review",

        description:
          "Final work is ready for review. Approval completes the booking and releases the designer payment.",

        badgeClass:
          "border-violet-300/60 bg-violet-50 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300",

        icon: FileCheck2,
      };

    case BOOKING_STATUS.CANCELLATION_PENDING:
      return {
        label: "Cancellation Processing",

        description:
          "The contract is being closed and any required payment or refund reconciliation is still processing.",

        badgeClass:
          "border-rose-300/60 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300",

        icon: Loader2,

        spinning: true,
      };

    case BOOKING_STATUS.REFUND_PENDING:
      return {
        label: "Refund Processing",

        description:
          "Stripe is processing the refund. The contract remains under reconciliation until the provider confirms the final state.",

        badgeClass:
          "border-sky-300/60 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300",

        icon: Loader2,

        spinning: true,
      };

    case BOOKING_STATUS.REFUND_FAILED:
      return {
        label: "Refund Needs Attention",

        description:
          "Stripe could not complete the refund. Open the contract to review the failure and available recovery state.",

        badgeClass:
          "border-rose-300/70 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-300",

        icon: TriangleAlert,
      };

    case BOOKING_STATUS.COMPLETED:
      return {
        label: "Completed",

        description:
          "The final work was approved and the booking workflow is complete.",

        badgeClass:
          "border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",

        icon: CheckCircle2,
      };

    case BOOKING_STATUS.DELIVERED:
      return {
        label: "Delivered",

        description: "This legacy booking is recorded as delivered.",

        badgeClass:
          "border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",

        icon: CheckCircle2,
      };

    case BOOKING_STATUS.CANCELLED:
      return {
        label: "Cancelled",

        description:
          "This contract is closed. Open it to review its cancellation and financial record.",

        badgeClass:
          "border-slate-300 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/45",

        icon: Ban,
      };

    default:
      return {
        label: status
          ? status
              .replaceAll("_", " ")
              .replace(/\b\w/g, (character) => character.toUpperCase())
          : "Status Review",

        description:
          "This contract has a workflow state that requires review. Open the workspace for the latest details.",

        badgeClass:
          "border-amber-300/60 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",

        icon: ShieldAlert,
      };
  }
}

/*=========================================================
Next Action
=========================================================*/

function getNextAction(statusValue) {
  const status = normalizeStatus(statusValue);

  switch (status) {
    case BOOKING_STATUS.PENDING:
      return {
        label: "Waiting for Response",

        detail: "The designer is reviewing your request.",

        icon: Hourglass,

        accentClass: "text-amber-700 dark:text-amber-300",

        panelClass:
          "border-amber-200/80 bg-gradient-to-br from-amber-50 to-white dark:border-amber-400/15 dark:from-amber-400/[0.07] dark:to-transparent",
      };

    case BOOKING_STATUS.AWAITING_PAYMENT:
      return {
        label: "Complete Payment",

        detail: "Fund the agreed amount to secure escrow.",

        icon: WalletCards,

        accentClass: "text-orange-700 dark:text-orange-300",

        panelClass:
          "border-orange-200/80 bg-gradient-to-br from-orange-50 to-white dark:border-orange-400/15 dark:from-orange-400/[0.07] dark:to-transparent",
      };

    case BOOKING_STATUS.FUNDED:
      return {
        label: "Escrow Protected",

        detail: "Funding is secured while the booking progresses.",

        icon: ShieldCheck,

        accentClass: "text-emerald-700 dark:text-emerald-300",

        panelClass:
          "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-400/15 dark:from-emerald-400/[0.07] dark:to-transparent",
      };

    case BOOKING_STATUS.ACCEPTED:
    case BOOKING_STATUS.PROGRESS:
      return {
        label: "Track Production",

        detail: "The designer is working on your prototype.",

        icon: Clock3,

        accentClass: "text-[#967319] dark:text-[#D4AF37]",

        panelClass:
          "border-[#D4AF37]/25 bg-gradient-to-br from-[#D4AF37]/10 to-white dark:from-[#D4AF37]/[0.08] dark:to-transparent",
      };

    case BOOKING_STATUS.REVIEW_PROTOTYPE:
      return {
        label: "Review Prototype",

        detail: "Your review or revision decision is required.",

        icon: FileCheck2,

        accentClass: "text-indigo-700 dark:text-indigo-300",

        panelClass:
          "border-indigo-200/80 bg-gradient-to-br from-indigo-50 to-white dark:border-indigo-400/15 dark:from-indigo-400/[0.07] dark:to-transparent",
      };

    case BOOKING_STATUS.FINAL_PRODUCTION:
      return {
        label: "Final Work Underway",

        detail: "The final deliverables are being prepared.",

        icon: Clock3,

        accentClass: "text-cyan-700 dark:text-cyan-300",

        panelClass:
          "border-cyan-200/80 bg-gradient-to-br from-cyan-50 to-white dark:border-cyan-400/15 dark:from-cyan-400/[0.07] dark:to-transparent",
      };

    case BOOKING_STATUS.REVIEW_FINAL:
    case BOOKING_STATUS.REVIEW:
      return {
        label: "Approve Final Work",

        detail: "Review the final delivery before completion.",

        icon: FileCheck2,

        accentClass: "text-violet-700 dark:text-violet-300",

        panelClass:
          "border-violet-200/80 bg-gradient-to-br from-violet-50 to-white dark:border-violet-400/15 dark:from-violet-400/[0.07] dark:to-transparent",
      };

    case BOOKING_STATUS.CANCELLATION_PENDING:
      return {
        label: "Cancellation Processing",

        detail: "Financial reconciliation is still underway.",

        icon: Loader2,

        spinning: true,

        accentClass: "text-rose-700 dark:text-rose-300",

        panelClass:
          "border-rose-200/80 bg-gradient-to-br from-rose-50 to-white dark:border-rose-400/15 dark:from-rose-400/[0.07] dark:to-transparent",
      };

    case BOOKING_STATUS.REFUND_PENDING:
      return {
        label: "Refund Processing",

        detail: "Waiting for Stripe to confirm the refund.",

        icon: Loader2,

        spinning: true,

        accentClass: "text-sky-700 dark:text-sky-300",

        panelClass:
          "border-sky-200/80 bg-gradient-to-br from-sky-50 to-white dark:border-sky-400/15 dark:from-sky-400/[0.07] dark:to-transparent",
      };

    case BOOKING_STATUS.REFUND_FAILED:
      return {
        label: "Review Refund",

        detail: "The refund could not be finalized automatically.",

        icon: TriangleAlert,

        accentClass: "text-rose-700 dark:text-rose-300",

        panelClass:
          "border-rose-300 bg-gradient-to-br from-rose-50 to-white dark:border-rose-400/25 dark:from-rose-400/[0.09] dark:to-transparent",
      };

    case BOOKING_STATUS.COMPLETED:
    case BOOKING_STATUS.DELIVERED:
      return {
        label: "View Completed Contract",

        detail: "Review final files and contract history.",

        icon: CheckCircle2,

        accentClass: "text-emerald-700 dark:text-emerald-300",

        panelClass:
          "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-400/15 dark:from-emerald-400/[0.07] dark:to-transparent",
      };

    case BOOKING_STATUS.CANCELLED:
      return {
        label: "View Closed Contract",

        detail: "Review its cancellation and financial history.",

        icon: Ban,

        accentClass: "text-slate-600 dark:text-white/50",

        panelClass:
          "border-slate-200 bg-gradient-to-br from-slate-50 to-white dark:border-white/10 dark:from-white/[0.035] dark:to-transparent",
      };

    default:
      return {
        label: "Review Contract",

        detail: "Open the workspace to inspect this status.",

        icon: ShieldAlert,

        accentClass: "text-amber-700 dark:text-amber-300",

        panelClass:
          "border-amber-200 bg-gradient-to-br from-amber-50 to-white dark:border-amber-400/15 dark:from-amber-400/[0.07] dark:to-transparent",
      };
  }
}

/*=========================================================
Creator Bookings
=========================================================*/

export default function CreatorBookings() {
  const [bookings, setBookings] = useState([]);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState("active");

  const [searchQuery, setSearchQuery] = useState("");

  const requestControllerRef = useRef(null);

  /*=======================================================
  Fetch Pipeline

  Backend authentication is authoritative.

  No localStorage user ID is used here.
  =======================================================*/

  const fetchBookings = useCallback(async ({ silent = false } = {}) => {
    /*
        Cancel previous request so an older response cannot
        overwrite a newer refresh.
        */

    requestControllerRef.current?.abort();

    const controller = new AbortController();

    requestControllerRef.current = controller;

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const response = await API.get("/p2p-bookings/pipeline", {
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      const pipeline = Array.isArray(response?.data?.data)
        ? response.data.data
        : [];

      /*
          The protected backend pipeline is already scoped to
          the authenticated participant.

          CreatorBookings therefore renders the trusted
          pipeline directly.
          */

      setBookings(pipeline);
    } catch (requestError) {
      if (isCancelledRequest(requestError)) {
        return;
      }

      if (import.meta.env.DEV) {
        console.error(
          "Unable to load Creator bookings:",
          requestError?.response?.data || requestError,
        );
      }

      setError(getApiErrorMessage(requestError));
    } finally {
      if (requestControllerRef.current === controller) {
        setLoading(false);

        setRefreshing(false);

        requestControllerRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    void fetchBookings();

    return () => {
      requestControllerRef.current?.abort();
    };
  }, [fetchBookings]);

  /*=======================================================
  Counts
  =======================================================*/

  const tabCounts = useMemo(() => {
    const counts = {
      waiting: 0,
      active: 0,
      attention: 0,
      archive: 0,
    };

    for (const booking of bookings) {
      const tab = getTabForStatus(booking?.status);

      counts[tab] += 1;
    }

    return counts;
  }, [bookings]);

  /*=======================================================
  Summary
  =======================================================*/

  const summary = useMemo(() => {
    let actionRequired = 0;

    let escrowProtected = 0;

    let completed = 0;

    for (const booking of bookings) {
      const status = normalizeStatus(booking?.status);

      if (CREATOR_ACTION_STATUSES.has(status)) {
        actionRequired += 1;
      }

      if (booking?.escrow_locked === true && !ARCHIVE_STATUSES.has(status)) {
        escrowProtected += 1;
      }

      if (
        status === BOOKING_STATUS.COMPLETED ||
        status === BOOKING_STATUS.DELIVERED
      ) {
        completed += 1;
      }
    }

    return {
      total: bookings.length,

      actionRequired,

      escrowProtected,

      completed,
    };
  }, [bookings]);

  /*=======================================================
  Visible Bookings
  =======================================================*/

  const visibleBookings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return [...bookings]
      .filter((booking) => getTabForStatus(booking?.status) === activeTab)
      .filter((booking) => {
        if (!query) {
          return true;
        }

        const searchableText = [
          booking?.id,

          booking?.reference_design_title,

          booking?.brief_text,

          booking?.receiver_name,

          booking?.designer_name,

          booking?.booking_type,

          booking?.status,

          booking?.stripe_refund_id,

          booking?.refund_status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(query);
      })
      .sort(
        (first, second) =>
          getTimestamp(second?.updated_at || second?.created_at) -
          getTimestamp(first?.updated_at || first?.created_at),
      );
  }, [activeTab, bookings, searchQuery]);

  const activeTabDefinition =
    TAB_DEFINITIONS.find((tab) => tab.id === activeTab) || TAB_DEFINITIONS[1];

  /*=======================================================
  Render
  =======================================================*/

  return (
    <div
      className="
        relative
        min-h-screen
        overflow-hidden
        bg-slate-50
        pb-24
        text-slate-950
        antialiased
        transition-colors
        duration-300

        dark:bg-[#030303]
        dark:text-white
      "
    >
      {/*===================================================
      Ambient Background
      ===================================================*/}

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
            -right-[14rem]
            -top-[18rem]
            h-[40rem]
            w-[40rem]
            rounded-full
            bg-[#D4AF37]/10
            blur-[170px]

            dark:bg-[#D4AF37]/10
          "
        />

        <div
          className="
            absolute
            -bottom-[18rem]
            -left-[16rem]
            h-[42rem]
            w-[42rem]
            rounded-full
            bg-indigo-500/[0.04]
            blur-[180px]

            dark:bg-indigo-500/[0.07]
          "
        />

        <div
          className="
            absolute
            inset-0
            bg-[linear-gradient(to_right,rgba(15,23,42,0.022)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.022)_1px,transparent_1px)]
            bg-[size:40px_40px]

            dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.014)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.014)_1px,transparent_1px)]
          "
        />
      </div>

      <div
        className="
          relative
          z-10
          mx-auto
          max-w-[1400px]
          px-4
          pt-9

          sm:px-6

          lg:px-10
          lg:pt-12
        "
      >
        {/*=================================================
        Hero
        =================================================*/}

        <section
          className="
            relative
            mb-8
            overflow-hidden
            rounded-[2rem]
            border
            border-slate-200/80
            bg-white/85
            p-6
            shadow-[0_24px_70px_rgba(15,23,42,0.06)]
            backdrop-blur-xl

            sm:p-8

            lg:p-10

            dark:border-white/[0.06]
            dark:bg-[#090909]/90
            dark:shadow-[0_30px_90px_rgba(0,0,0,0.45)]
          "
        >
          <div
            className="
              pointer-events-none
              absolute
              -right-20
              -top-24
              h-72
              w-72
              rounded-full
              bg-[#D4AF37]/10
              blur-[80px]
            "
          />

          <div
            className="
              pointer-events-none
              absolute
              bottom-0
              right-10
              hidden
              font-serif
              text-[11rem]
              leading-none
              text-slate-950/[0.018]

              xl:block

              dark:text-white/[0.018]
            "
          >
            DBY
          </div>

          <div
            className="
              relative
              z-10
              flex
              flex-col
              gap-8

              lg:flex-row
              lg:items-end
              lg:justify-between
            "
          >
            <div>
              <div
                className="
                  mb-4
                  inline-flex
                  items-center
                  gap-2
                  rounded-full
                  border
                  border-[#D4AF37]/20
                  bg-[#D4AF37]/10
                  px-3
                  py-1.5
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.28em]
                  text-[#95731B]

                  dark:text-[#D4AF37]
                "
              >
                <Compass size={12} />
                Creator Operations
              </div>

              <h1
                className="
                  max-w-3xl
                  font-serif
                  text-4xl
                  font-light
                  leading-[1.05]
                  tracking-tight

                  sm:text-5xl

                  lg:text-6xl
                "
              >
                Your Booking{" "}
                <span
                  className="
                    italic
                    text-[#A27E1D]

                    dark:text-[#D4AF37]
                  "
                >
                  Pipeline
                </span>
              </h1>

              <p
                className="
                  mt-5
                  max-w-2xl
                  text-sm
                  leading-7
                  text-slate-500

                  dark:text-white/45
                "
              >
                Follow every design contract from request and secure escrow
                through prototype review, final delivery, cancellation, and
                refund reconciliation.
              </p>
            </div>

            <div
              className="
                flex
                flex-col
                gap-3

                sm:flex-row
              "
            >
              <button
                type="button"
                onClick={() =>
                  fetchBookings({
                    silent: true,
                  })
                }
                disabled={refreshing}
                className="
                  inline-flex
                  h-12
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  border
                  border-slate-200
                  bg-white
                  px-5
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.18em]
                  text-slate-600
                  shadow-sm
                  transition

                  hover:-translate-y-0.5
                  hover:border-[#D4AF37]/50
                  hover:text-[#94711A]

                  disabled:cursor-not-allowed
                  disabled:opacity-50

                  dark:border-white/10
                  dark:bg-white/[0.04]
                  dark:text-white/60
                  dark:hover:text-[#D4AF37]
                "
              >
                <RefreshCw
                  size={14}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </button>

              <Link
                to="/creator/bookings/new"
                className="
                  inline-flex
                  h-12
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  bg-[#D4AF37]
                  px-6
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.19em]
                  text-black
                  shadow-[0_14px_35px_rgba(212,175,55,0.24)]
                  transition

                  hover:-translate-y-0.5
                  hover:bg-[#E6C962]
                  hover:shadow-[0_18px_45px_rgba(212,175,55,0.3)]
                "
              >
                <Plus size={15} />
                New Contract
              </Link>
            </div>
          </div>
        </section>

        {/*=================================================
        Summary Cards
        =================================================*/}

        <section
          className="
            mb-8
            grid
            gap-4

            sm:grid-cols-2

            xl:grid-cols-4
          "
        >
          {[
            {
              label: "All Contracts",

              value: summary.total,

              helper: "Your booking history",

              icon: Inbox,

              iconClass: "text-[#9B791D] dark:text-[#D4AF37]",

              glowClass: "bg-[#D4AF37]/10",
            },

            {
              label: "Action Required",

              value: summary.actionRequired,

              helper: "Payment, review or recovery",

              icon: Sparkles,

              iconClass:
                summary.actionRequired > 0
                  ? "text-violet-600 dark:text-violet-300"
                  : "text-slate-500 dark:text-white/40",

              glowClass: "bg-violet-500/[0.08]",
            },

            {
              label: "Escrow Protected",

              value: summary.escrowProtected,

              helper: "Funds currently secured",

              icon: ShieldCheck,

              iconClass: "text-emerald-600 dark:text-emerald-300",

              glowClass: "bg-emerald-500/[0.08]",
            },

            {
              label: "Completed",

              value: summary.completed,

              helper: "Finished bookings",

              icon: CheckCircle2,

              iconClass: "text-cyan-600 dark:text-cyan-300",

              glowClass: "bg-cyan-500/[0.07]",
            },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <article
                key={item.label}
                className="
                    group
                    relative
                    overflow-hidden
                    rounded-2xl
                    border
                    border-slate-200/80
                    bg-white/90
                    p-5
                    shadow-sm
                    backdrop-blur
                    transition
                    duration-300

                    hover:-translate-y-1
                    hover:border-[#D4AF37]/25
                    hover:shadow-[0_18px_50px_rgba(15,23,42,0.08)]

                    dark:border-white/[0.06]
                    dark:bg-[#0B0B0B]/90
                    dark:hover:border-[#D4AF37]/20
                    dark:hover:shadow-[0_24px_70px_rgba(0,0,0,0.45)]
                  "
              >
                <div
                  className={`
                      pointer-events-none
                      absolute
                      -right-8
                      -top-8
                      h-28
                      w-28
                      rounded-full
                      blur-[45px]

                      ${item.glowClass}
                    `}
                />

                <div
                  className="
                      relative
                      flex
                      items-start
                      justify-between
                      gap-4
                    "
                >
                  <div>
                    <p
                      className="
                          text-[9px]
                          font-black
                          uppercase
                          tracking-[0.2em]
                          text-slate-400

                          dark:text-white/30
                        "
                    >
                      {item.label}
                    </p>

                    <p
                      className="
                          mt-3
                          font-serif
                          text-4xl
                          tracking-tight
                        "
                    >
                      {item.value}
                    </p>

                    <p
                      className="
                          mt-2
                          text-xs
                          text-slate-500

                          dark:text-white/35
                        "
                    >
                      {item.helper}
                    </p>
                  </div>

                  <div
                    className={`
                        grid
                        h-11
                        w-11
                        shrink-0
                        place-items-center
                        rounded-xl
                        border
                        border-slate-200
                        bg-slate-50
                        transition
                        duration-300

                        group-hover:scale-105

                        dark:border-white/10
                        dark:bg-white/[0.035]

                        ${item.iconClass}
                      `}
                  >
                    <Icon size={19} />
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/*=================================================
        Contract Pipeline Panel
        =================================================*/}

        <section
          className="
            overflow-hidden
            rounded-[2rem]
            border
            border-slate-200/80
            bg-white/90
            shadow-[0_20px_60px_rgba(15,23,42,0.05)]
            backdrop-blur-xl

            dark:border-white/[0.06]
            dark:bg-[#090909]/90
            dark:shadow-[0_30px_80px_rgba(0,0,0,0.4)]
          "
        >
          {/*===============================================
          Tabs / Search
          ===============================================*/}

          <div
            className="
              border-b
              border-slate-200/80
              p-5

              sm:p-6

              dark:border-white/[0.06]
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
                  -mx-1
                  flex
                  gap-1
                  overflow-x-auto
                  rounded-xl
                  bg-slate-100/80
                  p-1

                  dark:bg-white/[0.035]
                "
              >
                {TAB_DEFINITIONS.map((tab) => {
                  const isActive = activeTab === tab.id;

                  const count = tabCounts[tab.id] || 0;

                  const attention = tab.id === "attention" && count > 0;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`
                          relative
                          flex
                          shrink-0
                          items-center
                          gap-2
                          rounded-lg
                          px-4
                          py-3
                          text-[9px]
                          font-black
                          uppercase
                          tracking-[0.16em]
                          transition

                          ${
                            isActive
                              ? "bg-white text-slate-950 shadow-sm dark:bg-white/10 dark:text-white"
                              : "text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white/65"
                          }
                        `}
                    >
                      {tab.label}

                      <span
                        className={`
                            min-w-6
                            rounded-full
                            border
                            px-1.5
                            py-0.5
                            text-center
                            text-[8px]

                            ${
                              attention
                                ? "border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-300"
                                : isActive
                                  ? "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#927019] dark:text-[#D4AF37]"
                                  : "border-slate-200 bg-slate-50 text-slate-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/30"
                            }
                          `}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <label
                className="
                  relative
                  block
                  w-full

                  xl:max-w-md
                "
              >
                <span className="sr-only">Search contracts</span>

                <Search
                  size={15}
                  className="
                    pointer-events-none
                    absolute
                    left-4
                    top-1/2
                    -translate-y-1/2
                    text-slate-400

                    dark:text-white/30
                  "
                />

                <input
                  type="search"
                  value={searchQuery}
                  maxLength={100}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search designer, contract, title or ID"
                  className="
                    h-12
                    w-full
                    rounded-xl
                    border
                    border-slate-200
                    bg-slate-50/80
                    pl-11
                    pr-11
                    text-sm
                    text-slate-900
                    outline-none
                    transition
                    placeholder:text-slate-400

                    focus:border-[#D4AF37]/50
                    focus:bg-white
                    focus:ring-4
                    focus:ring-[#D4AF37]/10

                    dark:border-white/10
                    dark:bg-white/[0.035]
                    dark:text-white
                    dark:placeholder:text-white/25
                    dark:focus:bg-white/[0.05]
                  "
                />

                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="
                      absolute
                      right-3
                      top-1/2
                      grid
                      h-7
                      w-7
                      -translate-y-1/2
                      place-items-center
                      rounded-full
                      text-slate-400
                      transition

                      hover:bg-slate-200
                      hover:text-slate-700

                      dark:hover:bg-white/10
                      dark:hover:text-white
                    "
                    aria-label="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </label>
            </div>

            <div
              className="
                mt-4
                flex
                items-center
                justify-between
                gap-4
              "
            >
              <p
                className="
                  text-xs
                  text-slate-400

                  dark:text-white/30
                "
              >
                {activeTabDefinition.description}
              </p>

              <p
                className="
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.16em]
                  text-slate-400

                  dark:text-white/25
                "
              >
                {visibleBookings.length} visible
              </p>
            </div>
          </div>

          {/*===============================================
          Error
          ===============================================*/}

          {error ? (
            <div
              role="alert"
              className="
                m-5
                rounded-2xl
                border
                border-rose-200
                bg-rose-50/80
                p-6

                sm:m-6

                dark:border-rose-400/20
                dark:bg-rose-400/[0.07]
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
                <div
                  className="
                    flex
                    items-start
                    gap-4
                  "
                >
                  <div
                    className="
                      grid
                      h-11
                      w-11
                      shrink-0
                      place-items-center
                      rounded-xl
                      bg-rose-100
                      text-rose-700

                      dark:bg-rose-400/10
                      dark:text-rose-300
                    "
                  >
                    <AlertCircle size={20} />
                  </div>

                  <div>
                    <h2
                      className="
                        font-semibold
                        text-rose-900

                        dark:text-rose-100
                      "
                    >
                      Could not load contracts
                    </h2>

                    <p
                      className="
                        mt-1
                        max-w-2xl
                        text-sm
                        leading-6
                        text-rose-700/75

                        dark:text-rose-200/65
                      "
                    >
                      {error}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => fetchBookings()}
                  className="
                    inline-flex
                    h-10
                    shrink-0
                    items-center
                    justify-center
                    gap-2
                    rounded-xl
                    bg-rose-700
                    px-4
                    text-[9px]
                    font-black
                    uppercase
                    tracking-[0.16em]
                    text-white
                    transition

                    hover:bg-rose-800
                  "
                >
                  <RefreshCw size={13} />
                  Retry
                </button>
              </div>
            </div>
          ) : loading ? (
            /*=============================================
            Loading Skeleton
            =============================================*/

            <div
              className="
                space-y-4
                p-5

                sm:p-6
              "
            >
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="
                      overflow-hidden
                      rounded-2xl
                      border
                      border-slate-200
                      bg-white

                      dark:border-white/[0.06]
                      dark:bg-[#0D0D0D]
                    "
                >
                  <div
                    className="
                        animate-pulse
                        space-y-5
                        p-6
                      "
                  >
                    <div
                      className="
                          h-6
                          w-48
                          rounded-full
                          bg-slate-100

                          dark:bg-white/[0.05]
                        "
                    />

                    <div
                      className="
                          h-8
                          w-2/3
                          rounded-lg
                          bg-slate-100

                          dark:bg-white/[0.05]
                        "
                    />

                    <div
                      className="
                          grid
                          gap-3

                          sm:grid-cols-2

                          lg:grid-cols-4
                        "
                    >
                      {[1, 2, 3, 4].map((block) => (
                        <div
                          key={block}
                          className="
                                h-24
                                rounded-xl
                                bg-slate-100

                                dark:bg-white/[0.04]
                              "
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : visibleBookings.length === 0 ? (
            /*=============================================
            Empty
            =============================================*/

            <div
              className="
                flex
                min-h-[430px]
                flex-col
                items-center
                justify-center
                px-6
                py-20
                text-center
              "
            >
              <div
                className="
                  relative
                  grid
                  h-20
                  w-20
                  place-items-center
                  rounded-3xl
                  border
                  border-slate-200
                  bg-slate-50
                  text-[#A17D1D]
                  shadow-inner

                  dark:border-white/10
                  dark:bg-white/[0.03]
                  dark:text-[#D4AF37]
                "
              >
                <div
                  className="
                    pointer-events-none
                    absolute
                    inset-0
                    rounded-3xl
                    bg-[#D4AF37]/10
                    blur-xl
                  "
                />

                {searchQuery ? (
                  <Search size={29} className="relative" />
                ) : (
                  <Inbox size={29} className="relative" />
                )}
              </div>

              <h2
                className="
                  mt-7
                  font-serif
                  text-3xl
                  font-light
                "
              >
                {searchQuery
                  ? "No matching contracts"
                  : `No ${activeTabDefinition.label.toLowerCase()} contracts`}
              </h2>

              <p
                className="
                  mt-3
                  max-w-lg
                  text-sm
                  leading-7
                  text-slate-500

                  dark:text-white/40
                "
              >
                {searchQuery
                  ? "Try another designer name, contract ID, design title, booking type, or workflow state."
                  : activeTab === "attention"
                    ? "Good news — there are no cancellation, refund, or unexpected workflow states requiring attention."
                    : "Contracts will move into this section automatically as their workflow state changes."}
              </p>

              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="
                    mt-7
                    inline-flex
                    h-11
                    items-center
                    justify-center
                    gap-2
                    rounded-xl
                    border
                    border-slate-200
                    bg-white
                    px-5
                    text-[9px]
                    font-black
                    uppercase
                    tracking-[0.18em]
                    text-slate-600
                    transition

                    hover:border-[#D4AF37]/40
                    hover:text-[#98751A]

                    dark:border-white/10
                    dark:bg-white/[0.04]
                    dark:text-white/60
                    dark:hover:text-[#D4AF37]
                  "
                >
                  <X size={13} />
                  Clear Search
                </button>
              ) : (
                bookings.length === 0 && (
                  <Link
                    to="/creator/bookings/new"
                    className="
                      mt-7
                      inline-flex
                      h-11
                      items-center
                      justify-center
                      gap-2
                      rounded-xl
                      bg-[#D4AF37]
                      px-5
                      text-[9px]
                      font-black
                      uppercase
                      tracking-[0.18em]
                      text-black
                      transition

                      hover:bg-[#E4C65E]
                    "
                  >
                    <Plus size={14} />
                    Create First Contract
                  </Link>
                )
              )}
            </div>
          ) : (
            /*=============================================
            Booking Cards
            =============================================*/

            <div
              className="
                space-y-4
                p-4

                sm:p-6
              "
            >
              {visibleBookings.map((booking) => {
                const status = normalizeStatus(booking?.status);

                const designerName =
                  booking?.receiver_name ||
                  booking?.designer_name ||
                  "Hired Designer";

                const designerAvatar =
                  booking?.receiver_avatar || booking?.designer_avatar || null;

                const projectTitle =
                  booking?.reference_design_title || "Custom Design Booking";

                const statusDetails = getStatusDetails(status, designerName);

                const actionDetails = getNextAction(status);

                const StatusIcon = statusDetails.icon;

                const ActionIcon = actionDetails.icon;

                const progress = STATUS_PROGRESS[status];

                const deadline = getDeadlineDetails(booking?.deadline, status);

                const escrow = getEscrowDetails(booking);

                const currency = booking?.currency || "usd";

                const contractId = String(booking?.id || "");

                const shortId = contractId
                  ? contractId.slice(0, 8).toUpperCase()
                  : "UNKNOWN";

                return (
                  <Link
                    key={booking.id}
                    to={`/creator/bookings/${booking.id}`}
                    className="
                        group
                        block
                        overflow-hidden
                        rounded-2xl
                        border
                        border-slate-200/90
                        bg-white
                        shadow-sm
                        transition
                        duration-300

                        hover:-translate-y-0.5
                        hover:border-[#D4AF37]/45
                        hover:shadow-[0_22px_60px_rgba(15,23,42,0.10)]

                        dark:border-white/[0.06]
                        dark:bg-[#0C0C0C]
                        dark:hover:border-[#D4AF37]/25
                        dark:hover:shadow-[0_28px_80px_rgba(0,0,0,0.5)]
                      "
                  >
                    <div
                      className="
                          grid

                          xl:grid-cols-[minmax(0,1fr)_290px]
                        "
                    >
                      {/*=================================
                        Main Card
                        =================================*/}

                      <div
                        className="
                            p-5

                            sm:p-7
                          "
                      >
                        {/* Badges */}

                        <div
                          className="
                              flex
                              flex-wrap
                              items-center
                              gap-2
                            "
                        >
                          <span
                            className={`
                                inline-flex
                                items-center
                                gap-1.5
                                rounded-full
                                border
                                px-3
                                py-1.5
                                text-[8px]
                                font-black
                                uppercase
                                tracking-[0.16em]

                                ${statusDetails.badgeClass}
                              `}
                          >
                            <StatusIcon
                              size={12}
                              className={
                                statusDetails.spinning ? "animate-spin" : ""
                              }
                            />

                            {statusDetails.label}
                          </span>

                          <span
                            className="
                                rounded-full
                                border
                                border-slate-200
                                bg-slate-50
                                px-3
                                py-1.5
                                font-mono
                                text-[8px]
                                uppercase
                                tracking-[0.14em]
                                text-slate-500

                                dark:border-white/10
                                dark:bg-white/[0.03]
                                dark:text-white/35
                              "
                          >
                            #{shortId}
                          </span>

                          <span
                            className="
                                rounded-full
                                border
                                border-[#D4AF37]/20
                                bg-[#D4AF37]/[0.07]
                                px-3
                                py-1.5
                                text-[8px]
                                font-black
                                uppercase
                                tracking-[0.15em]
                                text-[#90701A]

                                dark:text-[#D4AF37]
                              "
                          >
                            {formatBookingType(booking?.booking_type)}
                          </span>

                          {CREATOR_ACTION_STATUSES.has(status) && (
                            <span
                              className="
                                  inline-flex
                                  items-center
                                  gap-1
                                  rounded-full
                                  border
                                  border-violet-300/70
                                  bg-violet-50
                                  px-3
                                  py-1.5
                                  text-[8px]
                                  font-black
                                  uppercase
                                  tracking-[0.14em]
                                  text-violet-700

                                  dark:border-violet-400/20
                                  dark:bg-violet-400/10
                                  dark:text-violet-300
                                "
                            >
                              <Sparkles size={10} />
                              Your Action
                            </span>
                          )}
                        </div>

                        {/* Title */}

                        <div
                          className="
                              mt-5
                              flex
                              items-start
                              justify-between
                              gap-5
                            "
                        >
                          <div className="min-w-0">
                            <h2
                              className="
                                  font-serif
                                  text-2xl
                                  font-light
                                  leading-tight
                                  tracking-tight
                                  text-slate-950
                                  transition
                                  duration-300

                                  group-hover:text-[#997619]

                                  sm:text-3xl

                                  dark:text-white
                                  dark:group-hover:text-[#D4AF37]
                                "
                            >
                              {projectTitle}
                            </h2>

                            <p
                              className="
                                  mt-3
                                  line-clamp-2
                                  max-w-3xl
                                  text-sm
                                  leading-6
                                  text-slate-500

                                  dark:text-white/42
                                "
                            >
                              {booking?.brief_text ||
                                "No project brief was supplied for this booking."}
                            </p>

                            <p
                              className="
                                  mt-3
                                  text-[9px]
                                  font-bold
                                  uppercase
                                  tracking-[0.14em]
                                  text-slate-400

                                  dark:text-white/25
                                "
                            >
                              Created {formatCreatedDate(booking?.created_at)}
                            </p>
                          </div>

                          <div
                            className="
                                hidden
                                h-10
                                w-10
                                shrink-0
                                -translate-x-2
                                place-items-center
                                rounded-full
                                border
                                border-[#D4AF37]/20
                                bg-[#D4AF37]/10
                                text-[#98751A]
                                opacity-0
                                transition
                                duration-300

                                group-hover:translate-x-0
                                group-hover:opacity-100

                                sm:grid

                                dark:text-[#D4AF37]
                              "
                          >
                            <ArrowRight size={16} />
                          </div>
                        </div>

                        {/* Details */}

                        <div
                          className="
                              mt-7
                              grid
                              gap-3

                              sm:grid-cols-2

                              lg:grid-cols-4
                            "
                        >
                          {/* Designer */}

                          <div
                            className="
                                rounded-xl
                                border
                                border-slate-200/80
                                bg-slate-50/80
                                p-4

                                dark:border-white/[0.06]
                                dark:bg-white/[0.025]
                              "
                          >
                            <div
                              className="
                                  flex
                                  items-center
                                  gap-2
                                  text-[8px]
                                  font-black
                                  uppercase
                                  tracking-[0.18em]
                                  text-slate-400

                                  dark:text-white/28
                                "
                            >
                              <UserRound size={12} />
                              Designer
                            </div>

                            <div
                              className="
                                  mt-3
                                  flex
                                  min-w-0
                                  items-center
                                  gap-2.5
                                "
                            >
                              <div
                                className="
                                    grid
                                    h-9
                                    w-9
                                    shrink-0
                                    place-items-center
                                    overflow-hidden
                                    rounded-full
                                    border
                                    border-slate-200
                                    bg-white

                                    dark:border-white/10
                                    dark:bg-white/5
                                  "
                              >
                                {designerAvatar ? (
                                  <img
                                    src={designerAvatar}
                                    alt=""
                                    loading="lazy"
                                    className="
                                        h-full
                                        w-full
                                        object-cover
                                      "
                                  />
                                ) : (
                                  <span
                                    className="
                                        text-xs
                                        font-bold
                                        text-slate-500

                                        dark:text-white/40
                                      "
                                  >
                                    {getFirstName(designerName)
                                      .charAt(0)
                                      .toUpperCase()}
                                  </span>
                                )}
                              </div>

                              <span
                                className="
                                    truncate
                                    text-sm
                                    font-semibold
                                  "
                              >
                                {designerName}
                              </span>
                            </div>
                          </div>

                          {/* Value */}

                          <div
                            className="
                                rounded-xl
                                border
                                border-slate-200/80
                                bg-slate-50/80
                                p-4

                                dark:border-white/[0.06]
                                dark:bg-white/[0.025]
                              "
                          >
                            <div
                              className="
                                  flex
                                  items-center
                                  gap-2
                                  text-[8px]
                                  font-black
                                  uppercase
                                  tracking-[0.18em]
                                  text-slate-400

                                  dark:text-white/28
                                "
                            >
                              <BadgeDollarSign size={12} />
                              Agreed Value
                            </div>

                            <p
                              className="
                                  mt-3
                                  font-mono
                                  text-lg
                                  font-semibold
                                  text-[#937119]

                                  dark:text-[#D4AF37]
                                "
                            >
                              {formatCurrency(booking?.agreed_price, currency)}
                            </p>
                          </div>

                          {/* Deadline */}

                          <div
                            className="
                                rounded-xl
                                border
                                border-slate-200/80
                                bg-slate-50/80
                                p-4

                                dark:border-white/[0.06]
                                dark:bg-white/[0.025]
                              "
                          >
                            <div
                              className="
                                  flex
                                  items-center
                                  gap-2
                                  text-[8px]
                                  font-black
                                  uppercase
                                  tracking-[0.18em]
                                  text-slate-400

                                  dark:text-white/28
                                "
                            >
                              <CalendarDays size={12} />
                              Deadline
                            </div>

                            <p
                              className="
                                  mt-3
                                  text-sm
                                  font-semibold
                                "
                            >
                              {formatDate(booking?.deadline)}
                            </p>

                            <p
                              className={`
                                  mt-1
                                  text-[10px]

                                  ${
                                    deadline.urgent
                                      ? "font-semibold text-rose-600 dark:text-rose-300"
                                      : "text-slate-500 dark:text-white/35"
                                  }
                                `}
                            >
                              {deadline.label}
                            </p>
                          </div>

                          {/* Escrow */}

                          <div
                            className="
                                rounded-xl
                                border
                                border-slate-200/80
                                bg-slate-50/80
                                p-4

                                dark:border-white/[0.06]
                                dark:bg-white/[0.025]
                              "
                          >
                            <div
                              className="
                                  flex
                                  items-center
                                  gap-2
                                  text-[8px]
                                  font-black
                                  uppercase
                                  tracking-[0.18em]
                                  text-slate-400

                                  dark:text-white/28
                                "
                            >
                              <LockKeyhole size={12} />
                              Escrow
                            </div>

                            <p
                              className={`
                                  mt-3
                                  text-sm
                                  font-semibold

                                  ${escrow.className}
                                `}
                            >
                              {escrow.label}
                            </p>

                            {booking?.refund_status && (
                              <p
                                className="
                                    mt-1
                                    truncate
                                    text-[10px]
                                    text-slate-500

                                    dark:text-white/30
                                  "
                              >
                                Refund: {booking.refund_status}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Progress */}

                        <div className="mt-7">
                          <div
                            className="
                                mb-2.5
                                flex
                                items-center
                                justify-between
                                gap-4
                              "
                          >
                            <p
                              className="
                                  text-[8px]
                                  font-black
                                  uppercase
                                  tracking-[0.2em]
                                  text-slate-400

                                  dark:text-white/28
                                "
                            >
                              Workflow Progress
                            </p>

                            <p
                              className="
                                  text-[9px]
                                  font-semibold
                                  text-slate-500

                                  dark:text-white/35
                                "
                            >
                              {progress === undefined
                                ? "Review"
                                : `${progress}%`}
                            </p>
                          </div>

                          <div
                            className="
                                h-1.5
                                overflow-hidden
                                rounded-full
                                bg-slate-100

                                dark:bg-white/[0.05]
                              "
                          >
                            <div
                              className={`
                                  h-full
                                  rounded-full
                                  transition-all
                                  duration-700

                                  ${
                                    status === BOOKING_STATUS.REFUND_FAILED
                                      ? "bg-gradient-to-r from-rose-500 to-orange-400"
                                      : ATTENTION_STATUSES.has(status)
                                        ? "bg-gradient-to-r from-orange-400 to-rose-400"
                                        : "bg-gradient-to-r from-[#A98520] via-[#D4AF37] to-[#E6CC70]"
                                  }
                                `}
                              style={{
                                width: `${progress ?? 50}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/*=================================
                        Next Action Panel
                        =================================*/}

                      <aside
                        className={`
                            flex
                            flex-col
                            justify-between
                            border-t
                            p-5

                            sm:p-6

                            xl:border-l
                            xl:border-t-0

                            ${actionDetails.panelClass}
                          `}
                      >
                        <div>
                          <div
                            className={`
                                grid
                                h-12
                                w-12
                                place-items-center
                                rounded-2xl
                                border
                                border-current/15
                                bg-white/60
                                shadow-sm

                                dark:bg-black/20

                                ${actionDetails.accentClass}
                              `}
                          >
                            <ActionIcon
                              size={21}
                              className={
                                actionDetails.spinning ? "animate-spin" : ""
                              }
                            />
                          </div>

                          <p
                            className={`
                                mt-5
                                text-[8px]
                                font-black
                                uppercase
                                tracking-[0.2em]

                                ${actionDetails.accentClass}
                              `}
                          >
                            Next Step
                          </p>

                          <h3
                            className="
                                mt-2
                                text-lg
                                font-semibold
                                tracking-tight
                              "
                          >
                            {actionDetails.label}
                          </h3>

                          <p
                            className="
                                mt-1.5
                                text-xs
                                leading-5
                                text-slate-500

                                dark:text-white/40
                              "
                          >
                            {actionDetails.detail}
                          </p>
                        </div>

                        <div
                          className="
                              mt-7
                              border-t
                              border-current/10
                              pt-5
                            "
                        >
                          <p
                            className="
                                text-xs
                                leading-5
                                text-slate-500

                                dark:text-white/40
                              "
                          >
                            {statusDetails.description}
                          </p>

                          <div
                            className="
                                mt-5
                                inline-flex
                                items-center
                                gap-2
                                text-[9px]
                                font-black
                                uppercase
                                tracking-[0.17em]
                                text-slate-700
                                transition

                                group-hover:text-[#967319]

                                dark:text-white/60
                                dark:group-hover:text-[#D4AF37]
                              "
                          >
                            Open workspace
                            <ArrowRight size={13} />
                          </div>
                        </div>
                      </aside>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
