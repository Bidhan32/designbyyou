/*
=========================================================
FashionVision Designer Booking Detail
Designer Contract Workspace
Version 2.3 - 2D + 3D + Virtual Try-On Garment Support
=========================================================
*/

import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  Ban,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileCheck2,
  FileText,
  Hourglass,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  PackageCheck,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";

import { Link, useParams } from "react-router-dom";

import API from "../../api/axios";

import BookingModelViewer from "../../components/BookingModelViewer";

/*=========================================================
Booking Statuses
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
  CANCELLATION_PENDING: "cancellation_pending",
  COMPLETED: "completed",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
});

const WORKFLOW_STEPS = Object.freeze([
  {
    id: "request",
    label: "Request",
    statuses: [BOOKING_STATUS.PENDING],
  },
  {
    id: "escrow",
    label: "Escrow",
    statuses: [BOOKING_STATUS.AWAITING_PAYMENT, BOOKING_STATUS.FUNDED],
  },
  {
    id: "prototype",
    label: "Prototype",
    statuses: [
      BOOKING_STATUS.ACCEPTED,
      BOOKING_STATUS.PROGRESS,
      BOOKING_STATUS.REVIEW_PROTOTYPE,
    ],
  },
  {
    id: "final",
    label: "Final Assets",
    statuses: [
      BOOKING_STATUS.FINAL_PRODUCTION,
      BOOKING_STATUS.REVIEW_FINAL,
      BOOKING_STATUS.REVIEW,
    ],
  },
  {
    id: "complete",
    label: "Complete",
    statuses: [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.DELIVERED],
  },
]);

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

function cleanText(value) {
  return String(value || "").trim();
}

function getFirstName(value) {
  const name = cleanText(value);

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

function formatDate(value, options = {}) {
  if (!value) {
    return "Not provided";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  });
}

function formatDateTime(value) {
  if (!value) {
    return "Not provided";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDeadlineMessage(value) {
  if (!value) {
    return "No deadline has been set.";
  }

  const deadline = new Date(value);

  if (Number.isNaN(deadline.getTime())) {
    return "Deadline is unavailable.";
  }

  const days = Math.ceil((deadline.getTime() - Date.now()) / 86400000);

  if (days < 0) {
    const overdueDays = Math.abs(days);

    return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
  }

  if (days === 0) {
    return "Due today";
  }

  if (days === 1) {
    return "Due tomorrow";
  }

  return `${days} days remaining`;
}

function getApiErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    "The requested action could not be completed."
  );
}

function getStatusDetails(status) {
  switch (normalizeStatus(status)) {
    case BOOKING_STATUS.PENDING:
      return {
        label: "New Request",

        title: "Review this booking request",

        description:
          "Read the creator's brief, confirm the scope and accept or reject the contract.",

        icon: Hourglass,

        badgeClass:
          "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",

        accentClass: "text-amber-700 dark:text-amber-300",
      };

    case BOOKING_STATUS.AWAITING_PAYMENT:
      return {
        label: "Awaiting Escrow",

        title: "Creator payment is pending",

        description:
          "You accepted the project. Begin work only after escrow is confirmed as secured.",

        icon: LockKeyhole,

        badgeClass:
          "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-300",

        accentClass: "text-orange-700 dark:text-orange-300",
      };

    case BOOKING_STATUS.FUNDED:
      return {
        label: "Escrow Funded",

        title: "Payment is secured",

        description:
          "Accept the funded contract to begin prototype production.",

        icon: ShieldCheck,

        badgeClass:
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",

        accentClass: "text-emerald-700 dark:text-emerald-300",
      };

    case BOOKING_STATUS.ACCEPTED:
    case BOOKING_STATUS.PROGRESS:
      return {
        label: "Prototype Production",

        title: "Build the first prototype",

        description:
          "Submit the first 2D prototype and, when available, an optional 3D model for creator review.",

        icon: PlayCircle,

        badgeClass:
          "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#8F7118] dark:text-[#E4C760]",

        accentClass: "text-[#987719] dark:text-[#D4AF37]",
      };

    case BOOKING_STATUS.REVIEW_PROTOTYPE:
      return {
        label: "Prototype Review",

        title: "Waiting for creator feedback",

        description:
          "The prototype has been submitted. The creator can approve it or request changes.",

        icon: Clock3,

        badgeClass:
          "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300",

        accentClass: "text-indigo-700 dark:text-indigo-300",
      };

    case BOOKING_STATUS.FINAL_PRODUCTION:
      return {
        label: "Final Production",

        title: "Prepare final deliverables",

        description:
          "The prototype is approved. Submit the polished final 2D work and optional 3D model for payout review.",

        icon: UploadCloud,

        badgeClass:
          "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#8F7118] dark:text-[#E4C760]",

        accentClass: "text-[#987719] dark:text-[#D4AF37]",
      };

    case BOOKING_STATUS.REVIEW_FINAL:
    case BOOKING_STATUS.REVIEW:
      return {
        label: "Final Review",

        title: "Waiting for final approval",

        description:
          "The creator is reviewing your final delivery. Payout is released after approval.",

        icon: FileCheck2,

        badgeClass:
          "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300",

        accentClass: "text-violet-700 dark:text-violet-300",
      };

    case BOOKING_STATUS.CANCELLATION_PENDING:
      return {
        label: "Cancellation Processing",

        title: "Cancellation is being reconciled",

        description:
          "Payment and wallet records are being safely reconciled. No further action is available.",

        icon: Loader2,

        badgeClass:
          "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300",

        accentClass: "text-rose-700 dark:text-rose-300",

        spinning: true,
      };

    case BOOKING_STATUS.COMPLETED:
    case BOOKING_STATUS.DELIVERED:
      return {
        label: "Completed & Paid",

        title: "Contract successfully completed",

        description:
          "The final delivery was approved and payout was released to your wallet.",

        icon: CheckCircle2,

        badgeClass:
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",

        accentClass: "text-emerald-700 dark:text-emerald-300",
      };

    case BOOKING_STATUS.CANCELLED:
      return {
        label: "Cancelled",

        title: "This contract is closed",

        description: "No further work is required for this booking.",

        icon: Ban,

        badgeClass:
          "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/45",

        accentClass: "text-slate-600 dark:text-white/50",
      };

    default:
      return {
        label: status || "Unknown",

        title: "Contract status",

        description: "Review the contract information below.",

        icon: Clock3,

        badgeClass:
          "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/50",

        accentClass: "text-slate-600 dark:text-white/50",
      };
  }
}

function getCurrentWorkflowIndex(status) {
  const normalized = normalizeStatus(status);

  if (
    normalized === BOOKING_STATUS.CANCELLED ||
    normalized === BOOKING_STATUS.CANCELLATION_PENDING
  ) {
    return -1;
  }

  return WORKFLOW_STEPS.findIndex((step) => step.statuses.includes(normalized));
}

function getAvailablePrimaryAction(status, escrowLocked) {
  const normalized = normalizeStatus(status);

  if (normalized === BOOKING_STATUS.PENDING) {
    return {
      type: "accept",

      label: "Accept Contract",

      helper: "Move the project to escrow funding",

      icon: Check,
    };
  }

  if (normalized === BOOKING_STATUS.FUNDED) {
    return {
      type: "accept",

      label: "Accept & Begin",

      helper: "Escrow is already secured",

      icon: ShieldCheck,
    };
  }

  if (
    [BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.PROGRESS].includes(normalized) &&
    escrowLocked
  ) {
    return {
      type: "prototype",

      label: "Submit Prototype",

      helper: "Send phase-one work for review",

      icon: PlayCircle,
    };
  }

  if (normalized === BOOKING_STATUS.FINAL_PRODUCTION) {
    return {
      type: "final",

      label: "Submit Final Files",

      helper: "Send polished deliverables",

      icon: UploadCloud,
    };
  }

  return null;
}

/*=========================================================
Action Modal
=========================================================*/

function ActionModal({ mode, booking, submitting, onClose, onSubmit }) {
  const [reason, setReason] = useState("");

  const [fileUrl, setFileUrl] = useState("");

  const [modelUrl, setModelUrl] = useState("");

  const [tryonImageUrl, setTryonImageUrl] = useState("");

  const [message, setMessage] = useState("");

  if (!mode) {
    return null;
  }

  const isSubmission = mode === "prototype" || mode === "final";

  const isReject = mode === "reject";

  const isCancel = mode === "cancel";

  const title =
    mode === "prototype"
      ? "Submit prototype"
      : mode === "final"
        ? "Submit final deliverables"
        : mode === "reject"
          ? "Reject contract"
          : "Cancel contract";

  const subtitle =
    mode === "prototype"
      ? "Provide the required 2D prototype URL, optional 3D model URL, optional Virtual Try-On garment image URL, and a short note for the creator."
      : mode === "final"
        ? "Provide the required final 2D URL, optional 3D model URL, optional Virtual Try-On garment image URL, and completion notes."
        : mode === "reject"
          ? "Tell the creator why you are declining this request."
          : "Explain why this active contract should be cancelled.";

  const buttonLabel =
    mode === "prototype"
      ? "Submit Prototype"
      : mode === "final"
        ? "Submit Final Files"
        : mode === "reject"
          ? "Reject Contract"
          : "Request Cancellation";

  const canSubmit = isSubmission
    ? Boolean(cleanText(fileUrl))
    : Boolean(cleanText(reason));

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!canSubmit || submitting) {
      return;
    }

    onSubmit({
      reason: cleanText(reason),

      fileUrl: cleanText(fileUrl),

      modelUrl: cleanText(modelUrl),

      tryonImageUrl: cleanText(tryonImageUrl),

      message: cleanText(message),
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close modal"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0B0B0B]"
      >
        <div className="border-b border-slate-200 p-6 dark:border-white/10">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#9B791D] dark:text-[#D4AF37]">
                Contract{" "}
                {String(booking?.id || "")
                  .slice(0, 8)
                  .toUpperCase()}
              </p>

              <h2 className="mt-2 font-serif text-3xl font-light text-slate-950 dark:text-white">
                {title}
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-white/45">
                {subtitle}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/10 dark:text-white/45 dark:hover:bg-white/5"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-6">
          {isSubmission ? (
            <>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-white/40">
                  {mode === "prototype"
                    ? "2D Prototype URL"
                    : "2D Final Deliverable URL"}{" "}
                  <span className="text-rose-500">*</span>
                </span>

                <input
                  type="url"
                  value={fileUrl}
                  onChange={(event) => setFileUrl(event.target.value)}
                  placeholder={
                    mode === "prototype"
                      ? "https://example.com/prototype-preview.png"
                      : "https://example.com/final-deliverable.png"
                  }
                  required
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#D4AF37]/60 focus:bg-white focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/25"
                />

                <p className="mt-2 text-[11px] leading-5 text-slate-400 dark:text-white/30">
                  This is the main 2D image, preview or deliverable the creator
                  will review.
                </p>
              </label>

              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-white/40">
                  3D Model URL{" "}
                  <span className="font-semibold normal-case tracking-normal text-slate-400 dark:text-white/25">
                    (optional)
                  </span>
                </span>

                <input
                  type="url"
                  value={modelUrl}
                  onChange={(event) => setModelUrl(event.target.value)}
                  placeholder={
                    mode === "prototype"
                      ? "https://example.com/prototype.glb"
                      : "https://example.com/final.glb"
                  }
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#D4AF37]/60 focus:bg-white focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/25"
                />

                <p className="mt-2 text-[11px] leading-5 text-slate-400 dark:text-white/30">
                  Optional HTTP/HTTPS link to a GLB or GLTF model.
                </p>
              </label>

              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-white/40">
                  Virtual Try-On Garment Image URL{" "}
                  <span className="font-semibold normal-case tracking-normal text-slate-400 dark:text-white/25">
                    (optional)
                  </span>
                </span>

                <input
                  type="url"
                  value={tryonImageUrl}
                  onChange={(event) => setTryonImageUrl(event.target.value)}
                  placeholder={
                    mode === "prototype"
                      ? "https://example.com/prototype-garment.png"
                      : "https://example.com/final-garment.png"
                  }
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#D4AF37]/60 focus:bg-white focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/25"
                />

                <p className="mt-2 text-[11px] leading-5 text-slate-400 dark:text-white/30">
                  Optional public HTTP/HTTPS image of the garment for Creator
                  Virtual Try-On. Use a clean garment-focused image that FASHN
                  can access.
                </p>
              </label>

              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-white/40">
                  Delivery message
                </span>

                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={5}
                  placeholder={
                    mode === "prototype"
                      ? "Explain the prototype choices and what feedback you need."
                      : "Summarize the final files, formats and usage notes."
                  }
                  className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#D4AF37]/60 focus:bg-white focus:ring-4 focus:ring-[#D4AF37]/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/25"
                />
              </label>
            </>
          ) : (
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-white/40">
                {isReject ? "Rejection reason" : "Cancellation reason"}{" "}
                <span className="text-rose-500">*</span>
              </span>

              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={6}
                required
                placeholder={
                  isReject
                    ? "Explain why this request is not a suitable fit."
                    : "Explain why the contract must be cancelled."
                }
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-rose-400 focus:bg-white focus:ring-4 focus:ring-rose-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/25"
              />
            </label>
          )}

          {(isReject || isCancel) && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />

                <p>
                  {isReject
                    ? "Rejecting closes an unfunded pending request. This action cannot be resumed from this page."
                    : "Funded cancellations may trigger Stripe refund and wallet reconciliation processing."}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 p-6 dark:border-white/10 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-5 text-xs font-black uppercase tracking-[0.16em] text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/10 dark:text-white/55 dark:hover:bg-white/5"
          >
            Keep Contract
          </button>

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-xs font-black uppercase tracking-[0.16em] text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isReject || isCancel
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-[#A98520] hover:bg-[#8E701B]"
            }`}
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isSubmission ? (
              <UploadCloud size={16} />
            ) : (
              <Ban size={16} />
            )}

            {buttonLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

/*=========================================================
Main Component
=========================================================*/

function DesignerBookingDetail() {
  const { id } = useParams();

  const currentUserId = useMemo(() => getStoredUserId(), []);

  const [booking, setBooking] = useState(null);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  const [modalMode, setModalMode] = useState(null);

  const [copied, setCopied] = useState(false);

  const fetchBooking = useCallback(
    async ({ silent = false } = {}) => {
      if (!currentUserId) {
        setLoading(false);

        setError(
          "Your account session could not be identified. Please sign in again.",
        );

        return;
      }

      if (!id) {
        setLoading(false);

        setError("A booking identifier was not supplied.");

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

        const matchedBooking = pipeline.find(
          (item) => String(item?.id) === String(id),
        );

        if (!matchedBooking) {
          setBooking(null);

          setError(
            "This booking was not found or you no longer have access to it.",
          );

          return;
        }

        if (String(matchedBooking.designer_id) !== String(currentUserId)) {
          setBooking(null);

          setError("This contract is not assigned to your designer account.");

          return;
        }

        setBooking(matchedBooking);
      } catch (requestError) {
        console.error("Unable to load designer booking:", requestError);

        setError(getApiErrorMessage(requestError));
      } finally {
        setLoading(false);

        setRefreshing(false);
      }
    },
    [currentUserId, id],
  );

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }

    const timer = setTimeout(() => setSuccessMessage(""), 4500);

    return () => clearTimeout(timer);
  }, [successMessage]);

  const runAction = useCallback(
    async ({ endpoint, payload, success }) => {
      setSubmitting(true);

      setError("");

      try {
        await API.post(endpoint, payload);

        setModalMode(null);

        setSuccessMessage(success);

        await fetchBooking({
          silent: true,
        });
      } catch (requestError) {
        console.error("Designer booking action failed:", requestError);

        setError(getApiErrorMessage(requestError));
      } finally {
        setSubmitting(false);
      }
    },
    [fetchBooking],
  );

  const handleAccept = async () => {
    if (!booking || submitting) {
      return;
    }

    await runAction({
      endpoint: `/p2p-bookings/${booking.id}/accept`,

      payload: {},

      success: booking.escrow_locked
        ? "Contract accepted. Prototype production can begin."
        : "Contract accepted. Waiting for creator escrow funding.",
    });
  };

  const handleModalSubmit = async ({
    reason,
    fileUrl,
    modelUrl,
    tryonImageUrl,
    message,
  }) => {
    if (!booking) {
      return;
    }

    if (modalMode === "reject") {
      await runAction({
        endpoint: `/p2p-bookings/${booking.id}/reject`,

        payload: {
          reason,
        },

        success: "The contract request was rejected.",
      });

      return;
    }

    if (modalMode === "cancel") {
      await runAction({
        endpoint: `/p2p-bookings/${booking.id}/cancel`,

        payload: {
          reason,
        },

        success: "The cancellation request was processed.",
      });

      return;
    }

    if (modalMode === "prototype") {
      await runAction({
        endpoint: `/p2p-bookings/${booking.id}/submit-prototype`,

        payload: {
          file_url: fileUrl,

          model_url: modelUrl || null,

          tryon_image_url: tryonImageUrl || null,

          message,
        },

        success: "Prototype submitted for creator review.",
      });

      return;
    }

    if (modalMode === "final") {
      await runAction({
        endpoint: `/p2p-bookings/${booking.id}/submit-final`,

        payload: {
          file_url: fileUrl,

          model_url: modelUrl || null,

          tryon_image_url: tryonImageUrl || null,

          message,
        },

        success: "Final deliverables submitted for creator approval.",
      });
    }
  };

  const copyBookingId = async () => {
    if (!booking?.id) {
      return;
    }

    try {
      await navigator.clipboard.writeText(booking.id);

      setCopied(true);

      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("The booking ID could not be copied.");
    }
  };

  const status = normalizeStatus(booking?.status);

  const statusDetails = getStatusDetails(status);

  const StatusIcon = statusDetails.icon;

  const workflowIndex = getCurrentWorkflowIndex(status);

  const primaryAction = getAvailablePrimaryAction(
    status,
    Boolean(booking?.escrow_locked),
  );

  const PrimaryIcon = primaryAction?.icon || ArrowRight;

  const canReject =
    status === BOOKING_STATUS.PENDING && !booking?.escrow_locked;

  const canCancel =
    Boolean(booking) &&
    ![
      BOOKING_STATUS.COMPLETED,
      BOOKING_STATUS.DELIVERED,
      BOOKING_STATUS.CANCELLED,
      BOOKING_STATUS.CANCELLATION_PENDING,
    ].includes(status);

  const creatorName =
    booking?.sender_name || booking?.creator_name || "Project Creator";

  const creatorAvatar =
    booking?.sender_avatar || booking?.creator_avatar || null;

  const projectTitle =
    booking?.reference_design_title || "Bespoke Design Booking";

  /*=====================================================
    Loading
    =====================================================*/

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-950 dark:bg-[#030303] dark:text-white">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/10 text-[#9B791D] dark:text-[#D4AF37]">
            <Loader2 size={28} className="animate-spin" />
          </div>

          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 dark:text-white/40">
            Loading contract workspace
          </p>
        </div>
      </main>
    );
  }

  /*=====================================================
    Booking unavailable
    =====================================================*/

  if (!booking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-950 dark:bg-[#030303] dark:text-white">
        <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl dark:border-white/10 dark:bg-[#0A0A0A]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300">
            <AlertCircle size={28} />
          </div>

          <h1 className="mt-6 font-serif text-3xl font-light">
            Contract unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-white/45">
            {error || "This contract could not be loaded."}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/designer/bookings"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 text-xs font-black uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:text-white/65 dark:hover:bg-white/5"
            >
              <ArrowLeft size={15} />
              Back to Pipeline
            </Link>

            <button
              type="button"
              onClick={() => fetchBooking()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#A98520] px-5 text-xs font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#8E701B]"
            >
              <RefreshCw size={15} />
              Retry
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 pb-20 text-slate-950 antialiased dark:bg-[#030303] dark:text-white">
      {/*=====================================================
            Background
            =====================================================*/}

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -right-[12rem] -top-[14rem] h-[36rem] w-[36rem] rounded-full bg-[#D4AF37]/10 blur-[160px] dark:bg-[#D4AF37]/15" />

        <div className="absolute -bottom-[17rem] -left-[15rem] h-[40rem] w-[40rem] rounded-full bg-indigo-500/5 blur-[180px] dark:bg-indigo-500/10" />

        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.025)_1px,transparent_1px)] bg-[size:38px_38px] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.018)_1px,transparent_1px)]" />
      </div>

      {/*=====================================================
            Header
            =====================================================*/}

      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-2xl dark:border-white/5 dark:bg-[#070707]/80">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
          <Link
            to="/designer/bookings"
            className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 transition hover:text-[#9B791D] dark:text-white/45 dark:hover:text-[#D4AF37]"
          >
            <ArrowLeft size={16} />
            Contract Pipeline
          </Link>

          <button
            type="button"
            onClick={() =>
              fetchBooking({
                silent: true,
              })
            }
            disabled={refreshing}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 transition hover:border-[#D4AF37]/50 hover:text-[#9B791D] disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55 dark:hover:text-[#D4AF37]"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-[1280px] space-y-7 px-5 pt-8 sm:px-8 lg:px-10">
        {/*=================================================
                Success message
                =================================================*/}

        {successMessage && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
            <CheckCircle2 size={19} className="mt-0.5 shrink-0" />

            <div className="flex-1">
              <p className="text-sm font-semibold">{successMessage}</p>
            </div>

            <button
              type="button"
              onClick={() => setSuccessMessage("")}
              className="text-emerald-700/70 hover:text-emerald-900 dark:text-emerald-200/70"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {/*=================================================
                Error message
                =================================================*/}

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 shadow-sm dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">
            <AlertCircle size={19} className="mt-0.5 shrink-0" />

            <div className="flex-1">
              <p className="text-sm font-semibold">{error}</p>
            </div>

            <button
              type="button"
              onClick={() => setError("")}
              className="text-rose-700/70 hover:text-rose-900 dark:text-rose-200/70"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {/*=================================================
                Contract hero
                =================================================*/}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-sm backdrop-blur dark:border-white/5 dark:bg-[#0A0A0A]/90 dark:shadow-2xl">
          <div className="grid gap-0 xl:grid-cols-[1fr_350px]">
            <div className="p-6 sm:p-8 lg:p-10">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.17em] ${statusDetails.badgeClass}`}
                >
                  <StatusIcon
                    size={13}
                    className={statusDetails.spinning ? "animate-spin" : ""}
                  />

                  {statusDetails.label}
                </span>

                <button
                  type="button"
                  onClick={copyBookingId}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-slate-500 transition hover:border-[#D4AF37]/40 hover:text-[#9B791D] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/35 dark:hover:text-[#D4AF37]"
                >
                  {String(booking.id).slice(0, 8).toUpperCase()}

                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>

                <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.17em] text-[#8F7118] dark:text-[#D4AF37]">
                  {booking.booking_type || "commission"}
                </span>
              </div>

              <h1 className="mt-6 max-w-4xl font-serif text-4xl font-light tracking-tight sm:text-5xl lg:text-6xl">
                {projectTitle}
              </h1>

              <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-500 dark:text-white/45 sm:text-base">
                {booking.brief_text || "No project brief was supplied."}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-5 border-t border-slate-200 pt-6 dark:border-white/10">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
                    {creatorAvatar ? (
                      <img
                        src={creatorAvatar}
                        alt={creatorName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-bold text-slate-500 dark:text-white/45">
                        {getFirstName(creatorName).charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                      Project Creator
                    </p>

                    <p className="mt-1 text-sm font-semibold">{creatorName}</p>
                  </div>
                </div>

                <div className="hidden h-10 w-px bg-slate-200 sm:block dark:bg-white/10" />

                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                    Created
                  </p>

                  <p className="mt-1 text-sm font-semibold">
                    {formatDate(booking.created_at)}
                  </p>
                </div>
              </div>
            </div>

            {/*=========================================
                        Current phase
                        =========================================*/}

            <aside className="border-t border-slate-200 bg-slate-50/80 p-6 dark:border-white/5 dark:bg-white/[0.025] sm:p-8 xl:border-l xl:border-t-0">
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-2xl border border-current/15 bg-white shadow-sm dark:bg-black/20 ${statusDetails.accentClass}`}
              >
                <StatusIcon
                  size={25}
                  className={statusDetails.spinning ? "animate-spin" : ""}
                />
              </div>

              <p
                className={`mt-6 text-[10px] font-black uppercase tracking-[0.2em] ${statusDetails.accentClass}`}
              >
                Current Phase
              </p>

              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                {statusDetails.title}
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-white/45">
                {statusDetails.description}
              </p>

              <div className="mt-7 space-y-3">
                {primaryAction && (
                  <button
                    type="button"
                    onClick={
                      primaryAction.type === "accept"
                        ? handleAccept
                        : () => setModalMode(primaryAction.type)
                    }
                    disabled={submitting}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#A98520] px-5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-[#D4AF37]/10 transition hover:-translate-y-0.5 hover:bg-[#8E701B] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <PrimaryIcon size={17} />
                    )}

                    {primaryAction.label}
                  </button>
                )}

                {canReject && (
                  <button
                    type="button"
                    onClick={() => setModalMode("reject")}
                    disabled={submitting}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-5 text-xs font-black uppercase tracking-[0.16em] text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-400/20 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-400/10"
                  >
                    <XCircle size={16} />
                    Reject Request
                  </button>
                )}

                {canCancel && (
                  <button
                    type="button"
                    onClick={() => setModalMode("cancel")}
                    disabled={submitting}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-xs font-black uppercase tracking-[0.16em] text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:text-white/40 dark:hover:border-rose-400/20 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
                  >
                    <Ban size={16} />
                    Cancel Contract
                  </button>
                )}
              </div>

              {primaryAction && (
                <p className="mt-4 text-center text-[11px] leading-5 text-slate-400 dark:text-white/30">
                  {primaryAction.helper}
                </p>
              )}
            </aside>
          </div>
        </section>

        {/*=================================================
                Workflow
                =================================================*/}

        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur dark:border-white/5 dark:bg-[#0A0A0A]/90 sm:p-8">
          <div className="flex items-center justify-between gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#9B791D] dark:text-[#D4AF37]">
                Milestone Journey
              </p>

              <h2 className="mt-2 font-serif text-3xl font-light">
                Contract workflow
              </h2>
            </div>

            <Sparkles className="text-[#D4AF37]" size={22} />
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-5">
            {WORKFLOW_STEPS.map((step, index) => {
              const active = index === workflowIndex;

              const complete = workflowIndex >= 0 && index < workflowIndex;

              const terminalComplete =
                [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.DELIVERED].includes(
                  status,
                ) && index <= workflowIndex;

              const reached = complete || terminalComplete;

              return (
                <div
                  key={step.id}
                  className={`relative rounded-2xl border p-4 transition ${
                    active
                      ? "border-[#D4AF37]/45 bg-[#D4AF37]/10"
                      : reached
                        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-400/15 dark:bg-emerald-400/5"
                        : "border-slate-200 bg-slate-50 dark:border-white/5 dark:bg-white/[0.025]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-black ${
                        active
                          ? "border-[#D4AF37]/40 bg-[#D4AF37] text-black"
                          : reached
                            ? "border-emerald-300 bg-emerald-500 text-white dark:border-emerald-400"
                            : "border-slate-200 bg-white text-slate-400 dark:border-white/10 dark:bg-black/20 dark:text-white/30"
                      }`}
                    >
                      {reached ? <Check size={14} /> : index + 1}
                    </div>

                    <span
                      className={`text-[10px] font-black uppercase tracking-[0.16em] ${
                        active
                          ? "text-[#8F7118] dark:text-[#D4AF37]"
                          : reached
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-slate-400 dark:text-white/30"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {[
            BOOKING_STATUS.CANCELLED,
            BOOKING_STATUS.CANCELLATION_PENDING,
          ].includes(status) && (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">
              <Ban size={18} className="mt-0.5 shrink-0" />

              <p>
                {status === BOOKING_STATUS.CANCELLED
                  ? "This workflow ended because the contract was cancelled."
                  : "This workflow is temporarily paused while cancellation is processed."}
              </p>
            </div>
          )}
        </section>

        {/*=================================================
                Main details grid
                =================================================*/}

        <div className="grid gap-7 xl:grid-cols-[1fr_360px]">
          <div className="space-y-7">
            {/*=========================================
                        Project scope
                        =========================================*/}

            <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur dark:border-white/5 dark:bg-[#0A0A0A]/90 sm:p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/10 text-[#9B791D] dark:text-[#D4AF37]">
                  <FileText size={20} />
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/30">
                    Project Scope
                  </p>

                  <h2 className="mt-1 text-xl font-semibold">Creator brief</h2>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-600 dark:border-white/5 dark:bg-white/[0.025] dark:text-white/55">
                {booking.brief_text || "No project brief was supplied."}
              </div>

              {booking.revision_notes && (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-400/20 dark:bg-amber-400/10">
                  <div className="flex items-start gap-3">
                    <MessageSquareText
                      size={19}
                      className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
                    />

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                        Revision Requested
                      </p>

                      <p className="mt-2 text-sm leading-6 text-amber-800/85 dark:text-amber-100/80">
                        {booking.revision_notes}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/*=========================================
                        Submitted Deliverables
                        =========================================*/}

            <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur dark:border-white/5 dark:bg-[#0A0A0A]/90 sm:p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300">
                  <PackageCheck size={20} />
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/30">
                    Deliverables
                  </p>

                  <h2 className="mt-1 text-xl font-semibold">Submitted work</h2>
                </div>
              </div>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500 dark:text-white/40">
                Each milestone keeps the required 2D deliverable and, when
                supplied, an interactive 3D model and Virtual Try-On garment
                image.
              </p>

              {/*=====================================
                            Prototype
                            =====================================*/}

              <article className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/5 dark:bg-white/[0.025]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300">
                    <PlayCircle size={19} />
                  </div>

                  <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-white/30">
                    Prototype
                  </span>
                </div>

                <h3 className="mt-5 text-base font-semibold">
                  Phase-one submission
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-white/40">
                  {booking.prototype_message ||
                    "No prototype has been submitted yet."}
                </p>

                {booking.prototype_file_url ? (
                  <a
                    href={booking.prototype_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-400/20 dark:bg-white/[0.03] dark:text-indigo-300 dark:hover:bg-indigo-400/10"
                  >
                    Open 2D Prototype
                    <ExternalLink size={13} />
                  </a>
                ) : (
                  <p className="mt-5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-white/25">
                    2D prototype not submitted
                  </p>
                )}

                {booking.prototype_tryon_image_url && (
                  <a
                    href={booking.prototype_tryon_image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex w-fit items-center gap-2 rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-[#8F7118] transition hover:border-[#D4AF37]/45 hover:bg-[#D4AF37]/10 dark:text-[#D4AF37]"
                  >
                    Open Try-On Garment
                    <Sparkles size={13} />
                  </a>
                )}

                {booking.prototype_model_url && (
                  <div className="mt-6">
                    <BookingModelViewer
                      modelUrl={booking.prototype_model_url}
                      title="Prototype 3D Model"
                      height={390}
                    />
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  {booking.prototype_file_url && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-white/30">
                      <CheckCircle2 size={13} className="text-emerald-500" />
                      2D prototype available
                    </div>
                  )}

                  {booking.prototype_model_url && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-white/30">
                      <CheckCircle2 size={13} className="text-cyan-500" />
                      Interactive 3D model available
                    </div>
                  )}

                  {booking.prototype_tryon_image_url && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-white/30">
                      <CheckCircle2 size={13} className="text-[#B89122]" />
                      Virtual Try-On garment available
                    </div>
                  )}
                </div>
              </article>

              {/*=====================================
                            Final delivery
                            =====================================*/}

              <article className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/5 dark:bg-white/[0.025]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300">
                    <FileCheck2 size={19} />
                  </div>

                  <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-white/30">
                    Final
                  </span>
                </div>

                <h3 className="mt-5 text-base font-semibold">Final delivery</h3>

                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-white/40">
                  {booking.delivery_message ||
                    "Final files have not been submitted yet."}
                </p>

                {booking.delivery_file_url ? (
                  <a
                    href={booking.delivery_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-violet-700 transition hover:border-violet-300 hover:bg-violet-50 dark:border-violet-400/20 dark:bg-white/[0.03] dark:text-violet-300 dark:hover:bg-violet-400/10"
                  >
                    Open Final 2D
                    <ExternalLink size={13} />
                  </a>
                ) : (
                  <p className="mt-5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-white/25">
                    Final 2D deliverable not submitted
                  </p>
                )}

                {booking.delivery_tryon_image_url && (
                  <a
                    href={booking.delivery_tryon_image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex w-fit items-center gap-2 rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-[#8F7118] transition hover:border-[#D4AF37]/45 hover:bg-[#D4AF37]/10 dark:text-[#D4AF37]"
                  >
                    Open Try-On Garment
                    <Sparkles size={13} />
                  </a>
                )}

                {booking.delivery_model_url && (
                  <div className="mt-6">
                    <BookingModelViewer
                      modelUrl={booking.delivery_model_url}
                      title="Final 3D Model"
                      height={390}
                    />
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  {booking.delivery_file_url && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-white/30">
                      <CheckCircle2 size={13} className="text-emerald-500" />
                      Final 2D deliverable available
                    </div>
                  )}

                  {booking.delivery_model_url && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-white/30">
                      <CheckCircle2 size={13} className="text-cyan-500" />
                      Interactive final 3D model available
                    </div>
                  )}

                  {booking.delivery_tryon_image_url && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-white/30">
                      <CheckCircle2 size={13} className="text-[#B89122]" />
                      Virtual Try-On garment available
                    </div>
                  )}
                </div>
              </article>
            </section>
          </div>

          {/*=================================================
                    Sidebar
                    =================================================*/}

          <aside className="space-y-7">
            {/*=========================================
                        Contract summary
                        =========================================*/}

            <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur dark:border-white/5 dark:bg-[#0A0A0A]/90">
              <div className="flex items-center gap-3">
                <BadgeDollarSign
                  size={20}
                  className="text-[#9B791D] dark:text-[#D4AF37]"
                />

                <h2 className="text-lg font-semibold">Contract summary</h2>
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10">
                  <span className="text-sm text-slate-500 dark:text-white/40">
                    Agreed value
                  </span>

                  <strong className="font-mono text-lg text-[#9B791D] dark:text-[#D4AF37]">
                    {formatCurrency(booking.agreed_price)}
                  </strong>
                </div>

                <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10">
                  <span className="text-sm text-slate-500 dark:text-white/40">
                    Escrow
                  </span>

                  <span
                    className={`inline-flex items-center gap-2 text-sm font-semibold ${
                      booking.escrow_locked
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-slate-600 dark:text-white/55"
                    }`}
                  >
                    {booking.escrow_locked ? (
                      <ShieldCheck size={15} />
                    ) : (
                      <LockKeyhole size={15} />
                    )}

                    {booking.escrow_locked ? "Secured" : "Not funded"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-500 dark:text-white/40">
                    Booking type
                  </span>

                  <span className="text-sm font-semibold capitalize">
                    {booking.booking_type || "commission"}
                  </span>
                </div>
              </div>
            </section>

            {/*=========================================
                        Schedule
                        =========================================*/}

            <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur dark:border-white/5 dark:bg-[#0A0A0A]/90">
              <div className="flex items-center gap-3">
                <CalendarDays
                  size={20}
                  className="text-[#9B791D] dark:text-[#D4AF37]"
                />

                <h2 className="text-lg font-semibold">Schedule</h2>
              </div>

              <div className="mt-6 space-y-5">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                    Deadline
                  </p>

                  <p className="mt-2 text-base font-semibold">
                    {formatDate(booking.deadline)}
                  </p>

                  <p className="mt-1 text-xs text-slate-500 dark:text-white/40">
                    {getDeadlineMessage(booking.deadline)}
                  </p>
                </div>

                <div className="border-t border-slate-200 pt-5 dark:border-white/10">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                    Scheduled start
                  </p>

                  <p className="mt-2 text-sm font-semibold">
                    {formatDateTime(booking.scheduled_at)}
                  </p>
                </div>
              </div>
            </section>

            {/*=========================================
                        Cancellation record
                        =========================================*/}

            {(booking.cancellation_reason || booking.cancelled_at) && (
              <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 shadow-sm dark:border-rose-400/20 dark:bg-rose-400/10">
                <div className="flex items-center gap-3 text-rose-700 dark:text-rose-300">
                  <Ban size={20} />

                  <h2 className="text-lg font-semibold">Cancellation record</h2>
                </div>

                <p className="mt-4 text-sm leading-6 text-rose-800/80 dark:text-rose-100/75">
                  {booking.cancellation_reason ||
                    "No cancellation reason was recorded."}
                </p>

                {booking.cancelled_at && (
                  <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-rose-700/70 dark:text-rose-200/60">
                    Closed {formatDateTime(booking.cancelled_at)}
                  </p>
                )}
              </section>
            )}
          </aside>
        </div>
      </div>

      {/*=====================================================
            Action modal
            =====================================================*/}

      <ActionModal
        mode={modalMode}
        booking={booking}
        submitting={submitting}
        onClose={() => {
          if (!submitting) {
            setModalMode(null);
          }
        }}
        onSubmit={handleModalSubmit}
      />
    </main>
  );
}

export default DesignerBookingDetail;
