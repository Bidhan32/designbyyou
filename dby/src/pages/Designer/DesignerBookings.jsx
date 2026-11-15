import MetricList from "../../components/MetricList";
import { deadlineMessage as getDeadlineMessage, paymentLabel } from "../../components/bookingProgress";
/*
=========================================================
FashionVision Designer Bookings
Designer Bookings
Version 2.1
=========================================================
*/

import React, { useCallback, useEffect, useMemo, useState } from "react";

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
  PlayCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserRound,
} from "lucide-react";

import { Link } from "react-router-dom";

import API from "../../api/axios";

/*=========================================================
Booking Status Configuration
=========================================================*/

const BOOKING_STATUS = Object.freeze({
  PENDING: "pending",
  AWAITING_PAYMENT: "awaiting_payment",
  FUNDED: "funded",
  ACCEPTED: "accepted",
  PROGRESS: "progress",
  REVIEW_PROTOTYPE: "review_prototype",
  FINAL_PRODUCTION: "final_production",
  REVIEW_FINAL: "review_final",
  REVIEW: "review",
  REFUND_PENDING: "refund_pending",
  REFUND_FAILED: "refund_failed",
  CANCELLATION_PENDING: "cancellation_pending",
  COMPLETED: "completed",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
});

const TAB_DEFINITIONS = Object.freeze([
  {
    id: "pending",
    label: "New Requests",
    statuses: [BOOKING_STATUS.PENDING, BOOKING_STATUS.FUNDED],
  },
  {
    id: "active",
    label: "In Progress",
    statuses: [
      BOOKING_STATUS.AWAITING_PAYMENT,
      BOOKING_STATUS.ACCEPTED,
      BOOKING_STATUS.PROGRESS,
      BOOKING_STATUS.REVIEW_PROTOTYPE,
      BOOKING_STATUS.FINAL_PRODUCTION,
      BOOKING_STATUS.REVIEW_FINAL,
      BOOKING_STATUS.REVIEW,
      BOOKING_STATUS.CANCELLATION_PENDING,
      BOOKING_STATUS.REFUND_PENDING,
      BOOKING_STATUS.REFUND_FAILED,
    ],
  },
  {
    id: "completed",
    label: "Archive",
    statuses: [
      BOOKING_STATUS.COMPLETED,
      BOOKING_STATUS.DELIVERED,
      BOOKING_STATUS.CANCELLED,
    ],
  },
]);

const STATUS_PROGRESS = Object.freeze({
  [BOOKING_STATUS.PENDING]: 8,
  [BOOKING_STATUS.AWAITING_PAYMENT]: 18,
  [BOOKING_STATUS.FUNDED]: 24,
  [BOOKING_STATUS.ACCEPTED]: 32,
  [BOOKING_STATUS.PROGRESS]: 42,
  [BOOKING_STATUS.REVIEW_PROTOTYPE]: 56,
  [BOOKING_STATUS.FINAL_PRODUCTION]: 72,
  [BOOKING_STATUS.REVIEW_FINAL]: 88,
  [BOOKING_STATUS.REVIEW]: 88,
  [BOOKING_STATUS.CANCELLATION_PENDING]: 92,
  [BOOKING_STATUS.COMPLETED]: 100,
  [BOOKING_STATUS.DELIVERED]: 100,
  [BOOKING_STATUS.CANCELLED]: 100,
});

/*=========================================================
Helpers
=========================================================*/

function safelyParseJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getStoredUserId() {
  const directId = localStorage.getItem("userId");

  if (directId) {
    return directId;
  }

  const storedUser = safelyParseJson(localStorage.getItem("user"));

  return storedUser?.id || storedUser?._id || null;
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getFirstName(value) {
  const name = String(value || "").trim();

  return name ? name.split(/\s+/)[0] : "Creator";
}

function formatCurrency(value) {
  const amount = Number(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getApiErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    "The booking list could not be loaded."
  );
}

function getStatusDetails(status) {
  switch (normalizeStatus(status)) {
    case BOOKING_STATUS.PENDING:
      return {
        label: "New Request",
        description:
          "Review the Creator's brief and decide whether to accept this booking.",
        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",
        icon: Hourglass,
      };

    case BOOKING_STATUS.AWAITING_PAYMENT:
      return {
        label: "Awaiting Payment",
        description:
          "You accepted this project. Begin work after the Creator completes payment.",
        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",
        icon: LockKeyhole,
      };

    case BOOKING_STATUS.FUNDED:
      return {
        label: "Payment Secured",
        description:
          "The payment is secured. Accept the project to begin prototype production.",
        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",
        icon: ShieldCheck,
      };

    case BOOKING_STATUS.ACCEPTED:
    case BOOKING_STATUS.PROGRESS:
      return {
        label: "Prototype Production",
        description: "Build and submit the first prototype for creator review.",
        badgeClass:
          "border-line bg-subtle text-action",
        icon: PlayCircle,
      };

    case BOOKING_STATUS.REVIEW_PROTOTYPE:
      return {
        label: "Prototype Review",
        description:
          "Your prototype is with the creator. No action is needed right now.",
        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",
        icon: Clock3,
      };

    case BOOKING_STATUS.FINAL_PRODUCTION:
      return {
        label: "Final Production",
        description:
          "The prototype was approved. Prepare and submit the final deliverables.",
        badgeClass:
          "border-line bg-subtle text-action",
        icon: UploadCloud,
      };

    case BOOKING_STATUS.REVIEW_FINAL:
    case BOOKING_STATUS.REVIEW:
      return {
        label: "Final Review",
        description:
          "The Creator is reviewing your final delivery before your payment is released.",
        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",
        icon: FileCheck2,
      };

    case BOOKING_STATUS.REFUND_PENDING:
    case BOOKING_STATUS.REFUND_FAILED:
      return {
        ...getStatusDetails(BOOKING_STATUS.CANCELLATION_PENDING),
        label: paymentLabel({status}),
        description: status === BOOKING_STATUS.REFUND_FAILED ? "Support needs to review the refund." : "Wait for refund confirmation.",
      };
    case BOOKING_STATUS.CANCELLATION_PENDING:
      return {
        label: "Cancellation Processing",
        description:
          "Cancellation and any required refund reconciliation are being processed.",
        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",
        icon: Ban,
      };

    case BOOKING_STATUS.COMPLETED:
    case BOOKING_STATUS.DELIVERED:
      return {
        label: "Completed & Paid",
        description:
          "The booking is complete and your Designer payment has been released.",
        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",
        icon: CheckCircle2,
      };

    case BOOKING_STATUS.CANCELLED:
      return {
        label: "Cancelled",
        description: "This booking is closed and no further work is required.",
        badgeClass:
          "border-line bg-subtle text-muted",
        icon: Ban,
      };

    default:
      return {
        label: status || "Unknown",
        description: "Open the booking to review its current status.",
        badgeClass:
          "border-line bg-subtle text-muted",
        icon: Clock3,
      };
  }
}

function getNextAction(status) {
  switch (normalizeStatus(status)) {
    case BOOKING_STATUS.PENDING:
      return {
        label: "Review Request",
        detail: "Accept or reject",
        icon: ArrowRight,
        accentClass: "text-action",
        panelClass:
          "border-line bg-subtle",
      };

    case BOOKING_STATUS.FUNDED:
      return {
        label: "Accept & Begin",
        detail: "Payment is secured",
        icon: ShieldCheck,
        accentClass: "text-action",
        panelClass:
          "border-line bg-subtle",
      };

    case BOOKING_STATUS.ACCEPTED:
    case BOOKING_STATUS.PROGRESS:
      return {
        label: "Submit Prototype",
        detail: "Phase one deliverable",
        icon: PlayCircle,
        accentClass: "text-action",
        panelClass: "border-line bg-subtle",
      };

    case BOOKING_STATUS.FINAL_PRODUCTION:
      return {
        label: "Submit Final Files",
        detail: "Send the final files for creator approval",
        icon: UploadCloud,
        accentClass: "text-action",
        panelClass: "border-line bg-subtle",
      };

    case BOOKING_STATUS.AWAITING_PAYMENT:
      return {
        label: "Awaiting Creator",
        detail: "Creator payment pending",
        icon: LockKeyhole,
        accentClass: "text-action",
        panelClass:
          "border-line bg-subtle",
      };

    case BOOKING_STATUS.REVIEW_PROTOTYPE:
      return {
        label: "Awaiting Review",
        detail: "Prototype submitted",
        icon: Clock3,
        accentClass: "text-action",
        panelClass:
          "border-line bg-subtle",
      };

    case BOOKING_STATUS.REVIEW_FINAL:
    case BOOKING_STATUS.REVIEW:
      return {
        label: "Awaiting Approval",
        detail: "Final approval pending",
        icon: FileCheck2,
        accentClass: "text-action",
        panelClass:
          "border-line bg-subtle",
      };

    case BOOKING_STATUS.CANCELLATION_PENDING:
      return {
        label: "Processing",
        detail: "Cancellation reconciliation",
        icon: Loader2,
        accentClass: "text-action",
        panelClass:
          "border-line bg-subtle",
        spinning: true,
      };

    case BOOKING_STATUS.COMPLETED:
    case BOOKING_STATUS.DELIVERED:
      return {
        label: "View Record",
        detail: "Completed booking",
        icon: CheckCircle2,
        accentClass: "text-action",
        panelClass:
          "border-line bg-subtle",
      };

    default:
      return {
        label: "View Booking",
        detail: "Open full workspace",
        icon: ArrowRight,
        accentClass: "text-ink dark:text-muted",
        panelClass:
          "border-line bg-canvas dark:bg-subtle",
      };
  }
}

/*=========================================================
Component
=========================================================*/

function DesignerBookings() {
  const currentUserId = useMemo(() => getStoredUserId(), []);

  const [bookings, setBookings] = useState([]);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState("active");

  const [searchQuery, setSearchQuery] = useState("");

  const fetchBookings = useCallback(
    async ({ silent = false } = {}) => {
      if (!currentUserId) {
        setLoading(false);
        setError(
          "Your account session could not be identified. Please sign in again.",
        );

        return;
      }

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const response = await API.get("/p2p-bookings/pipeline");

        const pipeline = Array.isArray(response?.data?.data)
          ? response.data.data
          : [];

        const designerBookings = pipeline.filter(
          (booking) =>
            String(booking?.designer_id || "") === String(currentUserId),
        );

        setBookings(designerBookings);
      } catch (requestError) {
        console.error("Unable to load designer bookings:", requestError);

        setError(getApiErrorMessage(requestError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentUserId],
  );

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const tabCounts = useMemo(() => {
    return TAB_DEFINITIONS.reduce((counts, tab) => {
      counts[tab.id] = bookings.filter((booking) =>
        tab.statuses.includes(normalizeStatus(booking.status)),
      ).length;

      return counts;
    }, {});
  }, [bookings]);

  const summary = useMemo(
    () => ({
      total: bookings.length,

      actionRequired: bookings.filter((booking) =>
        [
          BOOKING_STATUS.PENDING,
          BOOKING_STATUS.FUNDED,
          BOOKING_STATUS.PROGRESS,
          BOOKING_STATUS.ACCEPTED,
          BOOKING_STATUS.FINAL_PRODUCTION,
        ].includes(normalizeStatus(booking.status)),
      ).length,

      awaitingCreator: bookings.filter((booking) =>
        [
          BOOKING_STATUS.AWAITING_PAYMENT,
          BOOKING_STATUS.REVIEW_PROTOTYPE,
          BOOKING_STATUS.REVIEW_FINAL,
          BOOKING_STATUS.REVIEW,
        ].includes(normalizeStatus(booking.status)),
      ).length,

      completed: bookings.filter((booking) =>
        [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.DELIVERED].includes(
          normalizeStatus(booking.status),
        ),
      ).length,
    }),
    [bookings],
  );

  const visibleBookings = useMemo(() => {
    const activeDefinition =
      TAB_DEFINITIONS.find((tab) => tab.id === activeTab) || TAB_DEFINITIONS[1];

    const query = searchQuery.trim().toLowerCase();

    return [...bookings]
      .filter((booking) =>
        activeDefinition.statuses.includes(normalizeStatus(booking.status)),
      )
      .filter((booking) => {
        if (!query) {
          return true;
        }

        const searchableText = [
          booking.id,
          booking.reference_design_title,
          booking.brief_text,
          booking.sender_name,
          booking.creator_name,
          booking.booking_type,
          booking.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(query);
      })
      .sort(
        (first, second) =>
          new Date(second.created_at || 0).getTime() -
          new Date(first.created_at || 0).getTime(),
      );
  }, [activeTab, bookings, searchQuery]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-canvas pb-20 text-ink antialiased transition-colors duration-300">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">


      </div>

      <header className="sticky top-0 z-40 border-b border-line bg-subtle">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-5 py-7 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-10">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-normal text-action">
              <Compass size={14} />
              Designer Operations
            </div>

            <h1 className="font-sans text-4xl font-light tracking-tight sm:text-5xl">
              Booking
              <span className="ml-3 italic text-action">
                Pipeline
              </span>
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Review new requests, track secured payments and deliver every
              project from one focused workspace.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              fetchBookings({
                silent: true,
              })
            }
            disabled={refreshing}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 text-xs font-semibold uppercase tracking-[0.18em] text-ink transition hover:-translate-y-0.5 hover:border-line hover:text-action disabled:cursor-not-allowed disabled:opacity-50 dark:bg-subtle dark:text-muted"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-[1280px] space-y-8 px-5 pt-8 sm:px-8 lg:px-10">
        <MetricList label="Bookings summary" rows={[
          ["All bookings", summary.total],
          ["Action required", summary.actionRequired],
          ["Awaiting creator", summary.awaitingCreator],
          ["Completed", summary.completed],
        ]} />

        <section className="overflow-hidden rounded-md border border-line bg-subtle">
          <div className="border-b border-line p-4">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex gap-7 overflow-x-auto border-b border-line">
                {TAB_DEFINITIONS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex shrink-0 items-center gap-2 pb-4 text-[10px] font-semibold uppercase tracking-normal transition ${
                      activeTab === tab.id
                        ? "text-ink"
                        : "text-muted hover:text-ink dark:hover:text-muted"
                    }`}
                  >
                    {tab.label}

                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] ${
                        activeTab === tab.id
                          ? "border-line bg-subtle text-action"
                          : "border-line bg-subtle text-muted"
                      }`}
                    >
                      {tabCounts[tab.id] || 0}
                    </span>

                    {activeTab === tab.id && (
                      <span className="absolute inset-x-0 -bottom-px h-0.5 bg-action text-on-action" />
                    )}
                  </button>
                ))}
              </div>

              <label className="relative block w-full xl:max-w-sm">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
                />

                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search bookings, Creators or IDs"
                  className="h-11 w-full rounded-md border border-line bg-canvas pl-11 pr-4 text-sm text-ink outline-none transition placeholder:text-muted focus:border-line focus:bg-surface focus:ring-4 focus:ring-action dark:bg-subtle dark:focus:bg-subtle"
                />
              </label>
            </div>
          </div>

          {error ? (
            <div className="m-5 rounded-md border border-line bg-canvas p-4 dark:bg-subtle sm:m-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-subtle text-action">
                    <AlertCircle size={21} />
                  </div>

                  <div>
                    <h2 className="font-semibold text-action">
                      Could not load bookings
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      {error}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => fetchBookings()}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-action px-4 text-xs font-semibold uppercase tracking-[0.16em] text-on-action transition hover:bg-action hover:text-on-action"
                >
                  <RefreshCw size={14} />
                  Retry
                </button>
              </div>
            </div>
          ) : loading ? (
            <div className="space-y-4 p-4">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-56 animate-pulse rounded-md border border-line bg-subtle"
                />
              ))}
            </div>
          ) : visibleBookings.length === 0 ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-20 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-md border border-line bg-canvas text-action dark:bg-subtle">
                {searchQuery ? <Search size={30} /> : <Inbox size={30} />}
              </div>

              <h2 className="mt-6 font-sans text-3xl font-light">
                {searchQuery
                  ? "No matching bookings"
                  : `No ${TAB_DEFINITIONS.find((tab) => tab.id === activeTab)?.label.toLowerCase()} yet`}
              </h2>

              <p className="mt-3 max-w-lg text-sm leading-6 text-muted">
                {searchQuery
                  ? "Try a different client name, booking ID, project title or status."
                  : "Bookings for this stage will appear here automatically as the workflow moves forward."}
              </p>
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {visibleBookings.map((booking) => {
                const status = normalizeStatus(booking.status);

                const statusDetails = getStatusDetails(status);

                const actionDetails = getNextAction(status);

                const StatusIcon = statusDetails.icon;

                const ActionIcon = actionDetails.icon;

                const creatorName =
                  booking.sender_name ||
                  booking.creator_name ||
                  "Project Creator";

                const creatorAvatar =
                  booking.sender_avatar || booking.creator_avatar || null;

                const projectTitle =
                  booking.reference_design_title || "Bespoke Design Commission";

                const progress = STATUS_PROGRESS[status] ?? 0;

                return (
                  <Link
                    key={booking.id}
                    to={`/designer/bookings/${booking.id}`}
                    className="group block overflow-hidden rounded-md border border-line bg-surface transition duration-300 hover:-translate-y-0.5 hover:border-line"
                  >
                    <div className="grid gap-0 xl:grid-cols-[1fr_270px]">
                      <div className="p-4">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span
                            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.17em] ${statusDetails.badgeClass}`}
                          >
                            <StatusIcon size={13} />
                            {statusDetails.label}
                          </span>

                          <span className="rounded-md border border-line bg-canvas px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-muted dark:bg-subtle">
                            {String(booking.id || "")
                              .slice(0, 8)
                              .toUpperCase()}
                          </span>

                          <span className="rounded-md border border-line bg-subtle px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.17em] text-action">
                            {booking.booking_type || "commission"}
                          </span>
                        </div>

                        <div className="mt-5">
                          <div className="flex items-start justify-between gap-5">
                            <div>
                              <h2 className="font-sans text-2xl font-light tracking-tight text-ink transition group-hover:text-action sm:text-3xl">
                                {projectTitle}
                              </h2>

                              <p className="mt-3 line-clamp-2 max-w-3xl text-sm leading-6 text-muted">
                                {booking.brief_text ||
                                  "No project brief was supplied."}
                              </p>
                            </div>

                            <ArrowRight className="hidden shrink-0 -translate-x-2 text-action opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100 sm:block" />
                          </div>
                        </div>

                        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="rounded-md border border-line bg-canvas p-3.5 dark:bg-subtle">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                              <UserRound size={13} />
                              Creator
                            </div>

                            <div className="mt-2 flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface dark:bg-subtle">
                                {creatorAvatar ? (
                                  <img
                                    src={creatorAvatar}
                                    alt={creatorName}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="text-xs font-bold text-muted">
                                    {getFirstName(creatorName)
                                      .charAt(0)
                                      .toUpperCase()}
                                  </span>
                                )}
                              </div>

                              <span className="truncate text-sm font-semibold">
                                {creatorName}
                              </span>
                            </div>
                          </div>

                          <div className="rounded-md border border-line bg-canvas p-3.5 dark:bg-subtle">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                              <BadgeDollarSign size={13} />
                              Agreed Value
                            </div>
                            <p className="mt-2 font-mono text-lg font-semibold text-action">
                              {formatCurrency(booking.agreed_price)}
                            </p>
                          </div>

                          <div className="rounded-md border border-line bg-canvas p-3.5 dark:bg-subtle">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                              <CalendarDays size={13} />
                              Deadline
                            </div>
                            <p className="mt-2 text-sm font-semibold">
                              {formatDate(booking.deadline)}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted">
                              {getDeadlineMessage(booking.deadline, booking.status)}
                            </p>
                          </div>

                          <div className="rounded-md border border-line bg-canvas p-3.5 dark:bg-subtle">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                              <ShieldCheck size={13} />
                              Payment
                            </div>
                            <p
                              className={`mt-2 text-sm font-semibold ${
                                booking.escrow_locked
                                  ? "text-action"
                                  : "text-muted"
                              }`}
                            >
                              {paymentLabel(booking)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-6">
                          <div className="mb-2 flex items-center justify-between gap-4">
                            <p className="text-[10px] font-semibold uppercase tracking-normal text-muted">
                              Workflow Progress
                            </p>
                            <p className="text-[10px] font-semibold text-muted">
                              {progress}%
                            </p>
                          </div>

                          <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
                            <div
                              className="h-full rounded-full bg-surface transition-all duration-700"
                              style={{
                                width: `${progress}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      <aside
                        className={`flex flex-col justify-between border-t p-4 dark:border-line xl:border-l xl:border-t-0 ${actionDetails.panelClass}`}
                      >
                        <div>
                          <div
                            className={`flex h-12 w-12 items-center justify-center rounded-md border border-current/15 bg-subtle ${actionDetails.accentClass} dark:bg-subtle`}
                          >
                            <ActionIcon
                              size={22}
                              className={
                                actionDetails.spinning ? "animate-spin" : ""
                              }
                            />
                          </div>

                          <p
                            className={`mt-5 text-[10px] font-semibold uppercase tracking-normal ${actionDetails.accentClass}`}
                          >
                            Next Step
                          </p>

                          <h3 className="mt-2 text-lg font-semibold">
                            {actionDetails.label}
                          </h3>

                          <p className="mt-1 text-xs leading-5 text-muted">
                            {actionDetails.detail}
                          </p>
                        </div>

                        <div className="mt-6 border-t border-current/10 pt-4">
                          <p className="text-xs leading-5 text-muted">
                            {statusDetails.description}
                          </p>

                          <div className="mt-4 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink transition group-hover:text-action dark:text-muted">
                            Open workspace
                            <ArrowRight size={14} />
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
    </main>
  );
}

export default DesignerBookings;
