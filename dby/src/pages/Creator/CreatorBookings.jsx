import MetricList from "../../components/MetricList";
import { paymentLabel, canResumePayment } from "../../components/bookingProgress";
"use strict";

/*
=========================================================
DesignByYou
Creator Bookings / Bookings
Version 4.1
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

    description: "Requests and payments",
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
    "The booking list could not be loaded."
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
          ? "Booking closed"
          : "Booking completed",

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
Payment Display
=========================================================*/

function getEscrowDetails(booking) {
  const status = normalizeStatus(booking?.status);

  if (booking?.escrow_locked === true) {
    return {
      label: "Secured",

      className: "text-action",
    };
  }

  if (
    status === BOOKING_STATUS.COMPLETED ||
    status === BOOKING_STATUS.DELIVERED
  ) {
    return {
      label: "Released",

      className: "text-action",
    };
  }

  if (status === BOOKING_STATUS.CANCELLED) {
    return {
      label: "Closed",

      className: "text-muted",
    };
  }

  if (ATTENTION_STATUSES.has(status)) {
    return {
      label: "Reconciling",

      className: "text-action",
    };
  }

  return {
    label: "Not secured",

    className: "text-muted",
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
          "border-line bg-canvas text-action dark:bg-subtle",

        icon: Hourglass,
      };

    case BOOKING_STATUS.AWAITING_PAYMENT:
      return {
        label: "Payment Required",

        description:
          "The booking is ready for payment. Complete payment to secure the agreed amount.",

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        icon: WalletCards,
      };

    case BOOKING_STATUS.FUNDED:
      return {
        label: "Payment Secured",

        description: `Your payment is secured while ${shortName} moves the booking into production.`,

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        icon: ShieldCheck,
      };

    case BOOKING_STATUS.ACCEPTED:
    case BOOKING_STATUS.PROGRESS:
      return {
        label: "Prototype Production",

        description: `${shortName} is preparing the initial work for your review.`,

        badgeClass:
          "border-line bg-subtle text-action",

        icon: Clock3,
      };

    case BOOKING_STATUS.REVIEW_PROTOTYPE:
      return {
        label: "Prototype Ready",

        description:
          "A prototype is ready. Review it in the booking workspace and approve it or request changes.",

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        icon: FileCheck2,
      };

    case BOOKING_STATUS.FINAL_PRODUCTION:
      return {
        label: "Final Production",

        description: `${shortName} is preparing the final deliverables.`,

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        icon: Clock3,
      };

    case BOOKING_STATUS.REVIEW_FINAL:
    case BOOKING_STATUS.REVIEW:
      return {
        label: "Final Review",

        description:
          "Final work is ready for review. Approval completes the booking and releases the designer payment.",

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        icon: FileCheck2,
      };

    case BOOKING_STATUS.CANCELLATION_PENDING:
      return {
        label: "Cancellation Processing",

        description:
          "The booking is being closed while any required payment or refund checks are still processing.",

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        icon: Loader2,

        spinning: true,
      };

    case BOOKING_STATUS.REFUND_PENDING:
      return {
        label: "Refund Processing",

        description:
          "Stripe is processing the refund. This booking will remain under review until Stripe confirms the result.",

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        icon: Loader2,

        spinning: true,
      };

    case BOOKING_STATUS.REFUND_FAILED:
      return {
        label: "Refund Needs Attention",

        description:
          "Stripe could not complete the refund. Open the booking to review what happened and the available next steps.",

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        icon: TriangleAlert,
      };

    case BOOKING_STATUS.COMPLETED:
      return {
        label: "Completed",

        description:
          "The final work was approved and the booking workflow is complete.",

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        icon: CheckCircle2,
      };

    case BOOKING_STATUS.DELIVERED:
      return {
        label: "Delivered",

        description: "This legacy booking is recorded as delivered.",

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        icon: CheckCircle2,
      };

    case BOOKING_STATUS.CANCELLED:
      return {
        label: "Cancelled",

        description:
          "This booking is closed. Open it to review the cancellation and payment history.",

        badgeClass:
          "border-line bg-subtle text-muted",

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
          "This booking has a status that needs review. Open the workspace for the latest details.",

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

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

        accentClass: "text-action",

        panelClass:
          "border-line bg-surface",
      };

    case BOOKING_STATUS.AWAITING_PAYMENT:
      return {
        label: "Complete Payment",

        detail: "Complete the agreed payment to secure this booking.",

        icon: WalletCards,

        accentClass: "text-action",

        panelClass:
          "border-line bg-surface",
      };

    case BOOKING_STATUS.FUNDED:
      return {
        label: "Payment Secured",

        detail: "Your payment is secured while the booking progresses.",

        icon: ShieldCheck,

        accentClass: "text-action",

        panelClass:
          "border-line bg-surface",
      };

    case BOOKING_STATUS.ACCEPTED:
    case BOOKING_STATUS.PROGRESS:
      return {
        label: "Track Production",

        detail: "The designer is working on your prototype.",

        icon: Clock3,

        accentClass: "text-action",

        panelClass:
          "border-line bg-surface",
      };

    case BOOKING_STATUS.REVIEW_PROTOTYPE:
      return {
        label: "Review Prototype",

        detail: "Your review or revision decision is required.",

        icon: FileCheck2,

        accentClass: "text-action",

        panelClass:
          "border-line bg-surface",
      };

    case BOOKING_STATUS.FINAL_PRODUCTION:
      return {
        label: "Final Work Underway",

        detail: "The final deliverables are being prepared.",

        icon: Clock3,

        accentClass: "text-action",

        panelClass:
          "border-line bg-surface",
      };

    case BOOKING_STATUS.REVIEW_FINAL:
    case BOOKING_STATUS.REVIEW:
      return {
        label: "Approve Final Work",

        detail: "Review the final delivery before completion.",

        icon: FileCheck2,

        accentClass: "text-action",

        panelClass:
          "border-line bg-surface",
      };

    case BOOKING_STATUS.CANCELLATION_PENDING:
      return {
        label: "Cancellation Processing",

        detail: "Financial reconciliation is still underway.",

        icon: Loader2,

        spinning: true,

        accentClass: "text-action",

        panelClass:
          "border-line bg-surface",
      };

    case BOOKING_STATUS.REFUND_PENDING:
      return {
        label: "Refund Processing",

        detail: "Waiting for Stripe to confirm the refund.",

        icon: Loader2,

        spinning: true,

        accentClass: "text-action",

        panelClass:
          "border-line bg-surface",
      };

    case BOOKING_STATUS.REFUND_FAILED:
      return {
        label: "Review Refund",

        detail: "The refund could not be finalized automatically.",

        icon: TriangleAlert,

        accentClass: "text-action",

        panelClass:
          "border-line bg-surface",
      };

    case BOOKING_STATUS.COMPLETED:
    case BOOKING_STATUS.DELIVERED:
      return {
        label: "View Completed Booking",

        detail: "Review final files and booking history.",

        icon: CheckCircle2,

        accentClass: "text-action",

        panelClass:
          "border-line bg-surface",
      };

    case BOOKING_STATUS.CANCELLED:
      return {
        label: "View Closed Booking",

        detail: "Review its cancellation and financial history.",

        icon: Ban,

        accentClass: "text-muted",

        panelClass:
          "border-line bg-surface",
      };

    default:
      return {
        label: "Review Booking",

        detail: "Open the workspace to inspect this status.",

        icon: ShieldAlert,

        accentClass: "text-action",

        panelClass:
          "border-line bg-surface",
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
      className="relative min-h-screen overflow-hidden bg-canvas pb-24 text-ink antialiased transition-colors duration-300"
    >
      {/*===================================================
      Ambient Background
      ===================================================*/}

      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >


      </div>

      <div
        className="relative z-10 mx-auto max-w-[1400px] px-4 pt-9 sm:px-6 lg:px-10 lg:pt-12"
      >
        {/*=================================================
        Hero
        =================================================*/}

        <section
          className="relative mb-8 overflow-hidden rounded-md border border-line bg-subtle p-4 lg:p-4"
        >
          <div
            className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-subtle blur-[80px]"
          />

          <div
            className="pointer-events-none absolute bottom-0 right-10 hidden font-serif text-[11rem] leading-none text-muted xl:block"
          >
            DBY
          </div>

          <div
            className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between"
          >
            <div>
              <div
                className="mb-4 inline-flex items-center gap-2 rounded-md border border-line bg-subtle px-3 py-1.5 text-xs font-semibold tracking-normal text-action"
              >
                <Compass size={12} />
                Bookings
              </div>

              <h1
                className="max-w-3xl font-semibold leading-[1.05] tracking-tight text-3xl sm:text-4xl"
              >
                Your bookings{" "}
                
              </h1>

              <p
                className="mt-5 max-w-2xl text-sm leading-7 text-muted"
              >
                Track progress, review deliveries, and see what needs your attention.
              </p>
            </div>

            <div
              className="flex flex-col gap-3 sm:flex-row"
            >
              <button
                type="button"
                onClick={() =>
                  fetchBookings({
                    silent: true,
                  })
                }
                disabled={refreshing}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 text-xs font-semibold tracking-normal text-muted transition hover:border-line hover:text-action disabled:cursor-not-allowed disabled:opacity-50 dark:bg-subtle"
              >
                <RefreshCw
                  size={14}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </button>

              <Link
                to="/creator/bookings/new"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-action px-6 text-xs font-semibold tracking-normal text-on-action transition hover:bg-action"
              >
                <Plus size={15} />
                New Booking
              </Link>
            </div>
          </div>
        </section>

        {/*=================================================
        Summary Cards
        =================================================*/}

        <MetricList label="Bookings summary" rows={[
          ["All bookings", summary.total],
          ["Action required", summary.actionRequired],
          ["Payment secured", summary.escrowProtected],
          ["Completed", summary.completed],
        ]} />

        {/*=================================================
        Bookings Panel
        =================================================*/}

        <section
          className="overflow-hidden rounded-md border border-line bg-subtle"
        >
          {/*===============================================
          Tabs / Search
          ===============================================*/}

          <div
            className="border-b border-line p-4"
          >
            <div
              className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"
            >
              <div
                className="-mx-1 flex gap-1 overflow-x-auto rounded-md bg-subtle p-1"
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
                          relative flex shrink-0 items-center gap-2 rounded-md px-4 py-3 text-xs font-semibold tracking-normal transition

                          ${
                            isActive
                              ? "bg-surface text-ink dark:bg-subtle"
                              : "text-muted hover:text-ink dark:hover:text-muted"
                          }
                        `}
                    >
                      {tab.label}

                      <span
                        className={`
                            min-w-6 rounded-md border px-1.5 py-0.5 text-center text-xs

                            ${
                              attention
                                ? "border-line bg-canvas text-action dark:bg-subtle"
                                : isActive
                                  ? "border-line bg-subtle text-action"
                                  : "border-line bg-canvas text-muted dark:bg-subtle"
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
                className="relative block w-full xl:max-w-md"
              >
                <span className="sr-only">Search bookings</span>

                <Search
                  size={15}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
                />

                <input
                  type="search"
                  value={searchQuery}
                  maxLength={100}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search designer, booking, title or ID"
                  className="h-12 w-full rounded-md border border-line bg-subtle pl-11 pr-11 text-sm text-ink outline-none transition placeholder:text-muted focus:border-line focus:bg-surface focus:ring-4 focus:ring-action dark:focus:bg-subtle"
                />

                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted transition hover:bg-subtle hover:text-ink"
                    aria-label="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </label>
            </div>

            <div
              className="mt-4 flex items-center justify-between gap-4"
            >
              <p
                className="text-xs text-muted"
              >
                {activeTabDefinition.description}
              </p>

              <p
                className="text-xs font-semibold tracking-normal text-muted"
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
              className="m-5 rounded-md border border-line bg-subtle p-4 sm:m-6"
            >
              <div
                className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div
                  className="flex items-start gap-4"
                >
                  <div
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-subtle text-action"
                  >
                    <AlertCircle size={20} />
                  </div>

                  <div>
                    <h2
                      className="font-semibold text-action"
                    >
                      Could not load bookings
                    </h2>

                    <p
                      className="mt-1 max-w-2xl text-sm leading-6 text-muted"
                    >
                      {error}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => fetchBookings()}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-action px-4 text-xs font-semibold tracking-normal text-on-action transition hover:bg-action hover:text-on-action"
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
              className="space-y-4 p-4"
            >
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="overflow-hidden rounded-md border border-line bg-surface"
                >
                  <div
                    className="animate-pulse space-y-5 p-4"
                  >
                    <div
                      className="h-6 w-48 rounded-full bg-subtle"
                    />

                    <div
                      className="h-8 w-2/3 rounded-md bg-subtle"
                    />

                    <div
                      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                    >
                      {[1, 2, 3, 4].map((block) => (
                        <div
                          key={block}
                          className="h-24 rounded-md bg-subtle"
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
              className="flex min-h-[430px] flex-col items-center justify-center px-6 py-20 text-center"
            >
              <div
                className="relative grid h-20 w-20 place-items-center rounded-md border border-line bg-canvas text-action dark:bg-subtle"
              >
                <div
                  className="pointer-events-none absolute inset-0 rounded-md bg-subtle blur-xl"
                />

                {searchQuery ? (
                  <Search size={29} className="relative" />
                ) : (
                  <Inbox size={29} className="relative" />
                )}
              </div>

              <h2
                className="mt-7 font-sans text-3xl font-light"
              >
                {searchQuery
                  ? "No matching bookings"
                  : `No ${activeTabDefinition.label.toLowerCase()} bookings`}
              </h2>

              <p
                className="mt-3 max-w-lg text-sm leading-7 text-muted"
              >
                {searchQuery
                  ? "Try another designer name, booking ID, design title, booking type, or workflow state."
                  : activeTab === "attention"
                    ? "Good news — there are no cancellation, refund, or unexpected workflow states requiring attention."
                    : "Bookings will move into this section automatically as their workflow status changes."}
              </p>

              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="mt-7 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 text-xs font-semibold tracking-normal text-muted transition hover:border-line hover:text-action dark:bg-subtle"
                >
                  <X size={13} />
                  Clear Search
                </button>
              ) : (
                bookings.length === 0 && (
                  <Link
                    to="/creator/bookings/new"
                    className="mt-7 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-action px-5 text-xs font-semibold tracking-normal text-on-action transition hover:bg-action hover:text-on-action"
                  >
                    <Plus size={14} />
                    Create First Booking
                  </Link>
                )
              )}
            </div>
          ) : (
            /*=============================================
            Booking Cards
            =============================================*/

            <div
              className="space-y-4 p-4"
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

                const actionDetails = getNextAction(canResumePayment(booking) ? BOOKING_STATUS.AWAITING_PAYMENT : status);

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
                    className="group block overflow-hidden rounded-md border border-line bg-surface transition duration-300 hover:border-line"
                  >
                    <div
                      className="grid xl:grid-cols-[minmax(0,1fr)_290px]"
                    >
                      {/*=================================
                        Main Card
                        =================================*/}

                      <div
                        className="p-4"
                      >
                        {/* Badges */}

                        <div
                          className="flex flex-wrap items-center gap-2"
                        >
                          <span
                            className={`
                                inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold tracking-normal

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
                            className="rounded-md border border-line bg-canvas px-3 py-1.5 font-mono text-xs tracking-normal text-muted dark:bg-subtle"
                          >
                            #{shortId}
                          </span>

                          <span
                            className="rounded-md border border-line bg-subtle px-3 py-1.5 text-xs font-semibold tracking-normal text-action"
                          >
                            {formatBookingType(booking?.booking_type)}
                          </span>

                          {CREATOR_ACTION_STATUSES.has(status) && (
                            <span
                              className="inline-flex items-center gap-1 rounded-md border border-line bg-canvas px-3 py-1.5 text-xs font-semibold tracking-normal text-action dark:bg-subtle"
                            >
                              <Sparkles size={10} />
                              Your Action
                            </span>
                          )}
                        </div>

                        {/* Title */}

                        <div
                          className="mt-5 flex items-start justify-between gap-5"
                        >
                          <div className="min-w-0">
                            <h2
                              className="font-sans text-2xl font-light leading-tight tracking-tight text-ink transition duration-300 group-hover:text-action sm:text-3xl"
                            >
                              {projectTitle}
                            </h2>

                            <p
                              className="mt-3 line-clamp-2 max-w-3xl text-sm leading-6 text-muted"
                            >
                              {booking?.brief_text ||
                                "No project brief was supplied for this booking."}
                            </p>

                            <p
                              className="mt-3 text-xs font-bold tracking-normal text-muted"
                            >
                              Created {formatCreatedDate(booking?.created_at)}
                            </p>
                          </div>

                          <div
                            className="hidden h-10 w-10 shrink-0 -translate-x-2 place-items-center rounded-full border border-line bg-subtle text-action opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100 sm:grid"
                          >
                            <ArrowRight size={16} />
                          </div>
                        </div>

                        {/* Details */}

                        <div
                          className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                        >
                          {/* Designer */}

                          <div
                            className="rounded-md border border-line bg-subtle p-4"
                          >
                            <div
                              className="flex items-center gap-2 text-xs font-semibold tracking-normal text-muted"
                            >
                              <UserRound size={12} />
                              Designer
                            </div>

                            <div
                              className="mt-3 flex min-w-0 items-center gap-2.5"
                            >
                              <div
                                className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface dark:bg-subtle"
                              >
                                {designerAvatar ? (
                                  <img
                                    src={designerAvatar}
                                    alt=""
                                    loading="lazy"
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span
                                    className="text-xs font-bold text-muted"
                                  >
                                    {getFirstName(designerName)
                                      .charAt(0)
                                      .toUpperCase()}
                                  </span>
                                )}
                              </div>

                              <span
                                className="truncate text-sm font-semibold"
                              >
                                {designerName}
                              </span>
                            </div>
                          </div>

                          {/* Value */}

                          <div
                            className="rounded-md border border-line bg-subtle p-4"
                          >
                            <div
                              className="flex items-center gap-2 text-xs font-semibold tracking-normal text-muted"
                            >
                              <BadgeDollarSign size={12} />
                              Agreed Value
                            </div>

                            <p
                              className="mt-3 font-mono text-lg font-semibold text-action"
                            >
                              {formatCurrency(booking?.agreed_price, currency)}
                            </p>
                          </div>

                          {/* Deadline */}

                          <div
                            className="rounded-md border border-line bg-subtle p-4"
                          >
                            <div
                              className="flex items-center gap-2 text-xs font-semibold tracking-normal text-muted"
                            >
                              <CalendarDays size={12} />
                              Deadline
                            </div>

                            <p
                              className="mt-3 text-sm font-semibold"
                            >
                              {formatDate(booking?.deadline)}
                            </p>

                            <p
                              className={`
                                  mt-1 text-xs

                                  ${
                                    deadline.urgent
                                      ? "font-semibold text-action"
                                      : "text-muted"
                                  }
                                `}
                            >
                              {deadline.label}
                            </p>
                          </div>

                          {/* Payment */}

                          <div
                            className="rounded-md border border-line bg-subtle p-4"
                          >
                            <div
                              className="flex items-center gap-2 text-xs font-semibold tracking-normal text-muted"
                            >
                              <LockKeyhole size={12} />
                              Payment
                            </div>

                            <p
                              className={`
                                  mt-3 text-sm font-semibold

                                  ${escrow.className}
                                `}
                            >
                              {paymentLabel(booking)}
                            </p>

                            {booking?.refund_status && (
                              <p
                                className="mt-1 truncate text-xs text-muted"
                              >
                                Refund: {booking.refund_status}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Progress */}

                        <div className="mt-7">
                          <div
                            className="mb-2.5 flex items-center justify-between gap-4"
                          >
                            <p
                              className="text-xs font-semibold tracking-normal text-muted"
                            >
                              Workflow Progress
                            </p>

                            <p
                              className="text-xs font-semibold text-muted"
                            >
                              {progress === undefined
                                ? "Review"
                                : `${progress}%`}
                            </p>
                          </div>

                          <div
                            className="h-1.5 overflow-hidden rounded-full bg-subtle"
                          >
                            <div
                              className={`
                                  h-full rounded-full transition-all duration-700

                                  ${
                                    status === BOOKING_STATUS.REFUND_FAILED
                                      ? "bg-surface"
                                      : ATTENTION_STATUSES.has(status)
                                        ? "bg-surface"
                                        : "bg-surface"
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
                            flex flex-col justify-between border-t p-4 xl:border-l xl:border-t-0

                            ${actionDetails.panelClass}
                          `}
                      >
                        <div>
                          <div
                            className={`
                                grid h-12 w-12 place-items-center rounded-md border border-current/15 bg-subtle

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
                                mt-5 text-xs font-semibold tracking-normal

                                ${actionDetails.accentClass}
                              `}
                          >
                            Next Step
                          </p>

                          <h3
                            className="mt-2 text-lg font-semibold tracking-tight"
                          >
                            {actionDetails.label}
                          </h3>

                          <p
                            className="mt-1.5 text-xs leading-5 text-muted"
                          >
                            {actionDetails.detail}
                          </p>
                        </div>

                        <div
                          className="mt-7 border-t border-current/10 pt-5"
                        >
                          <p
                            className="text-xs leading-5 text-muted"
                          >
                            {statusDetails.description}
                          </p>

                          <div
                            className="mt-5 inline-flex items-center gap-2 text-xs font-semibold tracking-normal text-ink transition group-hover:text-action dark:text-muted"
                          >
                            View booking
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
