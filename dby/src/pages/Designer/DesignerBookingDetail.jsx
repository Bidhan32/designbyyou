import BookingNextStep from "../../components/BookingNextStep";
import { deadlineMessage as getDeadlineMessage, canCancelBooking, paymentLabel } from "../../components/bookingProgress";
import BookingDesignAttachment from "../../components/BookingDesignAttachment";
/*
=========================================================
FashionVision Designer Booking Detail
Designer Booking Workspace
Version 2.5 - Simple Payment Language + 2D + 3D + Virtual Try-On + Private WhatsApp Contact
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
  MessageCircle,
  MessageSquareText,
  PackageCheck,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Video,
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
  REFUND_PENDING: "refund_pending",
  REFUND_FAILED: "refund_failed",
  COMPLETED: "completed",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
});

/*=========================================================
Private WhatsApp Booking Contact

These states intentionally mirror the backend contact policy.

Not included:
- pending
- funded
- cancellation_pending
- cancelled
- legacy accepted/review/delivered
=========================================================*/

const WHATSAPP_CONTACT_STATUSES = new Set([
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.PROGRESS,
  BOOKING_STATUS.REVIEW_PROTOTYPE,
  BOOKING_STATUS.FINAL_PRODUCTION,
  BOOKING_STATUS.REVIEW_FINAL,
  BOOKING_STATUS.COMPLETED,
]);

const WORKFLOW_STEPS = Object.freeze([
  {
    id: "request",
    label: "Request",
    statuses: [BOOKING_STATUS.PENDING],
  },
  {
    id: "escrow",
    label: "Payment",
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

function getApiErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    "The requested action could not be completed."
  );
}

/*=========================================================
Safe WhatsApp URL Validation
=========================================================*/

function isSafeWhatsAppUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      ["wa.me", "www.wa.me", "api.whatsapp.com"].includes(
        url.hostname.toLowerCase(),
      )
    );
  } catch {
    return false;
  }
}

function getStatusDetails(status) {
  switch (normalizeStatus(status)) {
    case BOOKING_STATUS.PENDING:
      return {
        label: "New Request",

        title: "Review this booking request",

        description:
          "Read the Creator's brief, confirm the scope, then accept or reject the booking.",

        icon: Hourglass,

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        accentClass: "text-action",
      };

    case BOOKING_STATUS.AWAITING_PAYMENT:
      return {
        label: "Awaiting Payment",

        title: "Creator payment is pending",

        description:
          "You accepted the project. Begin work only after the payment is confirmed as secured.",

        icon: LockKeyhole,

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        accentClass: "text-action",
      };

    case BOOKING_STATUS.FUNDED:
      return {
        label: "Payment Secured",

        title: "Payment is secured",

        description:
          "Accept the secured booking to begin prototype production.",

        icon: ShieldCheck,

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        accentClass: "text-action",
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
          "border-line bg-subtle text-action",

        accentClass: "text-action",
      };

    case BOOKING_STATUS.REVIEW_PROTOTYPE:
      return {
        label: "Prototype Review",

        title: "Waiting for creator feedback",

        description:
          "The prototype has been submitted. The creator can approve it or request changes.",

        icon: Clock3,

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        accentClass: "text-action",
      };

    case BOOKING_STATUS.FINAL_PRODUCTION:
      return {
        label: "Final Production",

        title: "Prepare final deliverables",

        description:
          "The prototype is approved. Submit the polished final 2D work and optional 3D model for Creator review.",

        icon: UploadCloud,

        badgeClass:
          "border-line bg-subtle text-action",

        accentClass: "text-action",
      };

    case BOOKING_STATUS.REVIEW_FINAL:
    case BOOKING_STATUS.REVIEW:
      return {
        label: "Final Review",

        title: "Waiting for final approval",

        description:
          "The Creator is reviewing your final delivery. Your payment is released after approval.",

        icon: FileCheck2,

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        accentClass: "text-action",
      };

    case BOOKING_STATUS.REFUND_PENDING:
      return { ...getStatusDetails(BOOKING_STATUS.CANCELLATION_PENDING), label: "Refund processing", title: "The creator's refund is processing", description: "The refund has been requested. This booking is closed to further work while payment records are updated." };
    case BOOKING_STATUS.REFUND_FAILED:
      return { ...getStatusDetails(BOOKING_STATUS.CANCELLATION_PENDING), label: "Refund needs attention", title: "Refund needs administrator review", description: "The refund could not be completed. Contact support with this booking ID; do not make another payment.", spinning: false };
    case BOOKING_STATUS.CANCELLATION_PENDING:
      return {
        label: "Cancellation Processing",

        title: "Cancellation is being reconciled",

        description:
          "Payment and wallet records are being safely reconciled. No further action is available.",

        icon: Loader2,

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        accentClass: "text-action",

        spinning: true,
      };

    case BOOKING_STATUS.COMPLETED:
    case BOOKING_STATUS.DELIVERED:
      return {
        label: "Completed & Paid",

        title: "Booking successfully completed",

        description:
          "The final delivery was approved and your Designer payment was released to your wallet.",

        icon: CheckCircle2,

        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",

        accentClass: "text-action",
      };

    case BOOKING_STATUS.CANCELLED:
      return {
        label: "Cancelled",

        title: "This booking is closed",

        description: "No further work is required for this booking.",

        icon: Ban,

        badgeClass:
          "border-line bg-subtle text-muted",

        accentClass: "text-muted",
      };

    default:
      return {
        label: status || "Unknown",

        title: "Booking status",

        description: "Review the booking information below.",

        icon: Clock3,

        badgeClass:
          "border-line bg-subtle text-muted",

        accentClass: "text-muted",
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

      label: "Accept Booking",

      helper: "Move the booking to payment",

      icon: Check,
    };
  }

  if (normalized === BOOKING_STATUS.FUNDED) {
    return {
      type: "accept",

      label: "Accept & Begin",

      helper: "Payment is already secured",

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

  if (normalized === BOOKING_STATUS.FINAL_PRODUCTION && escrowLocked) {
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
          ? "Reject booking"
          : "Cancel booking";

  const subtitle =
    mode === "prototype"
      ? "Provide the required 2D prototype URL, optional 3D model URL, optional Virtual Try-On garment image URL, and a short note for the creator."
      : mode === "final"
        ? "Provide the required final 2D URL, optional 3D model URL, optional Virtual Try-On garment image URL, and completion notes."
        : mode === "reject"
          ? "Tell the creator why you are declining this request."
          : "Explain why this active booking should be cancelled.";

  const buttonLabel =
    mode === "prototype"
      ? "Submit Prototype"
      : mode === "final"
        ? "Submit Final Files"
        : mode === "reject"
          ? "Reject Booking"
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4">
      <button
        type="button"
        aria-label="Close modal"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-md border border-line bg-surface"
      >
        <div className="border-b border-line p-4">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-normal text-action">
                Booking{" "}
                {String(booking?.id || "")
                  .slice(0, 8)
                  .toUpperCase()}
              </p>

              <h2 className="mt-2 font-sans text-3xl font-light text-ink">
                {title}
              </h2>

              <p className="mt-2 text-sm leading-6 text-muted">
                {subtitle}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex h-9 w-10 shrink-0 items-center justify-center rounded-md border border-line text-muted transition hover:bg-subtle disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-4">
          {isSubmission ? (
            <>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {mode === "prototype"
                    ? "2D Prototype URL"
                    : "2D Final Deliverable URL"}{" "}
                  <span className="text-action">*</span>
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
                  className="mt-2 h-12 w-full rounded-md border border-line bg-canvas px-4 text-sm text-ink outline-none transition placeholder:text-muted focus:border-line focus:bg-surface focus:ring-4 focus:ring-action dark:bg-subtle dark:focus:bg-subtle"
                />

                <p className="mt-2 text-[11px] leading-5 text-muted">
                  This is the main 2D image, preview or deliverable the creator
                  will review.
                </p>
              </label>

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  3D Model URL{" "}
                  <span className="font-semibold normal-case tracking-normal text-muted">
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
                  className="mt-2 h-12 w-full rounded-md border border-line bg-canvas px-4 text-sm text-ink outline-none transition placeholder:text-muted focus:border-line focus:bg-surface focus:ring-4 focus:ring-action dark:bg-subtle dark:focus:bg-subtle"
                />

                <p className="mt-2 text-[11px] leading-5 text-muted">
                  Optional HTTP/HTTPS link to a GLB or GLTF model.
                </p>
              </label>

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Virtual Try-On Garment Image URL{" "}
                  <span className="font-semibold normal-case tracking-normal text-muted">
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
                  className="mt-2 h-12 w-full rounded-md border border-line bg-canvas px-4 text-sm text-ink outline-none transition placeholder:text-muted focus:border-line focus:bg-surface focus:ring-4 focus:ring-action dark:bg-subtle dark:focus:bg-subtle"
                />

                <p className="mt-2 text-[11px] leading-5 text-muted">
                  Optional public HTTP/HTTPS image of the garment for Creator
                  Virtual Try-On. Use a clean garment-focused image that fal.ai
                  can access.
                </p>
              </label>

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
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
                  className="mt-2 w-full resize-none rounded-md border border-line bg-canvas px-4 py-3 text-sm leading-6 text-ink outline-none transition placeholder:text-muted focus:border-line focus:bg-surface focus:ring-4 focus:ring-action dark:bg-subtle dark:focus:bg-subtle"
                />
              </label>
            </>
          ) : (
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                {isReject ? "Rejection reason" : "Cancellation reason"}{" "}
                <span className="text-action">*</span>
              </span>

              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={6}
                required
                placeholder={
                  isReject
                    ? "Explain why this request is not a suitable fit."
                    : "Explain why the booking must be cancelled."
                }
                className="mt-2 w-full resize-none rounded-md border border-line bg-canvas px-4 py-3 text-sm leading-6 text-ink outline-none transition placeholder:text-muted focus:border-line focus:bg-surface focus:ring-4 focus:ring-action dark:bg-subtle dark:focus:bg-subtle"
              />
            </label>
          )}

          {(isReject || isCancel) && (
            <div className="rounded-md border border-line bg-canvas p-4 text-sm leading-6 text-action dark:bg-subtle">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />

                <p>
                  {isReject
                    ? "Rejecting ends this request. If payment was secured, its refund status will appear on the booking."
                    : "Funded cancellations may trigger Stripe refund and wallet reconciliation processing."}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-line p-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-9 items-center justify-center rounded-md border border-line px-5 text-xs font-semibold uppercase tracking-[0.16em] text-muted transition hover:bg-subtle disabled:opacity-50"
          >
            Keep Booking
          </button>

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-5 text-xs font-semibold uppercase tracking-[0.16em] text-ink transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isReject || isCancel
                ? "bg-action hover:bg-action text-on-action hover:text-on-action"
                : "bg-action hover:bg-action text-on-action hover:text-on-action"
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

  /*=======================================================
  Private WhatsApp Contact State
  =======================================================*/

  const [whatsappContact, setWhatsappContact] = useState(null);

  const [whatsappLoading, setWhatsappLoading] = useState(false);

  const [whatsappError, setWhatsappError] = useState("");

  /*=======================================================
  Load Booking
  =======================================================*/

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

          setError("This booking is not assigned to your Designer account.");

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

  /*=======================================================
  Load Private WhatsApp Contact
  =======================================================*/

  const fetchWhatsAppContact = useCallback(async () => {
    if (!id) {
      return;
    }

    setWhatsappLoading(true);

    setWhatsappError("");

    try {
      const response = await API.get(`/p2p-bookings/${id}/whatsapp-contact`);

      const contact = response?.data?.data;

      if (!contact || typeof contact !== "object" || Array.isArray(contact)) {
        throw new Error("The WhatsApp contact response was invalid.");
      }

      setWhatsappContact(contact);
    } catch (requestError) {
      const responseCode = requestError?.response?.data?.code;

      /*
      A booking may change state after /pipeline was loaded.

      If the backend says WhatsApp is unavailable because the
      booking state changed, simply remove contact access.
      */
      if (
        requestError?.response?.status === 409 &&
        responseCode === "WHATSAPP_CONTACT_UNAVAILABLE"
      ) {
        setWhatsappContact(null);

        setWhatsappError("");

        return;
      }

      console.error(
        "Unable to load private WhatsApp booking contact:",
        requestError,
      );

      setWhatsappContact(null);

      setWhatsappError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "WhatsApp contact could not be loaded for this booking.",
      );
    } finally {
      setWhatsappLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  /*
  Request private contact only after the booking reaches an
  approved post-acceptance state.

  WhatsApp information remains outside /pipeline.
  */
  useEffect(() => {
    const currentStatus = normalizeStatus(booking?.status);

    if (!booking?.id || !WHATSAPP_CONTACT_STATUSES.has(currentStatus)) {
      setWhatsappContact(null);

      setWhatsappError("");

      setWhatsappLoading(false);

      return;
    }

    void fetchWhatsAppContact();
  }, [booking?.id, booking?.status, fetchWhatsAppContact]);

  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }

    const timer = setTimeout(() => setSuccessMessage(""), 4500);

    return () => clearTimeout(timer);
  }, [successMessage]);

  /*=======================================================
  Generic Booking Action
  =======================================================*/

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

  /*=======================================================
  Accept
  =======================================================*/

  const handleAccept = async () => {
    if (!booking || submitting) {
      return;
    }

    await runAction({
      endpoint: `/p2p-bookings/${booking.id}/accept`,

      payload: {},

      success: booking.escrow_locked
        ? "Booking accepted. Prototype production can begin."
        : "Booking accepted. Waiting for Creator payment.",
    });
  };

  /*=======================================================
  Modal Actions
  =======================================================*/

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

        success: "The booking request was rejected.",
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

  /*=======================================================
  Copy Booking ID
  =======================================================*/

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

  /*=======================================================
  Open WhatsApp

  The raw phone number is intentionally not rendered.
  The URL must also pass local WhatsApp host validation.
  =======================================================*/

  const handleOpenWhatsApp = (url) => {
    if (!isSafeWhatsAppUrl(url)) {
      setWhatsappError(
        "The WhatsApp link is unavailable or invalid. Refresh the contact and try again.",
      );

      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  };

  /*=======================================================
  Derived State
  =======================================================*/

  const status = normalizeStatus(booking?.status);

  const statusDetails = getStatusDetails(status);

  const StatusIcon = statusDetails.icon;

  const workflowIndex = getCurrentWorkflowIndex(status);

  const primaryAction = getAvailablePrimaryAction(
    status,
    Boolean(booking?.escrow_locked),
  );

  const PrimaryIcon = primaryAction?.icon || ArrowRight;

  const canReject = [BOOKING_STATUS.PENDING, BOOKING_STATUS.FUNDED].includes(status);
  const canCancel = canCancelBooking(status) && !canReject;

  const creatorName =
    booking?.sender_name || booking?.creator_name || "Project Creator";

  const creatorAvatar =
    booking?.sender_avatar || booking?.creator_avatar || null;

  const projectTitle =
    booking?.reference_design_title || "Bespoke Design Booking";

  const whatsappContactEligible = WHATSAPP_CONTACT_STATUSES.has(status);

  const whatsappAvailable =
    whatsappContactEligible &&
    whatsappContact?.available === true &&
    isSafeWhatsAppUrl(whatsappContact?.message_url);

  const whatsappPartnerName =
    whatsappContact?.participant?.display_name || creatorName;

  /*=====================================================
  Loading
  =====================================================*/

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-6 text-ink">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-md border border-line bg-subtle text-action">
            <Loader2 size={28} className="animate-spin" />
          </div>

          <p className="mt-5 text-[10px] font-semibold uppercase tracking-normal text-muted">
            Loading booking workspace
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
      <main className="flex min-h-screen items-center justify-center bg-canvas px-6 text-ink">
        <div className="w-full max-w-lg rounded-md border border-line bg-surface p-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-md bg-canvas text-action dark:bg-subtle">
            <AlertCircle size={28} />
          </div>

          <h1 className="mt-6 font-sans text-3xl font-light">
            Booking unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-muted">
            {error || "This booking could not be loaded."}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/designer/bookings"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-5 text-xs font-semibold uppercase tracking-[0.16em] text-ink transition hover:bg-subtle dark:text-muted"
            >
              <ArrowLeft size={15} />
              Back to bookings
            </Link>

            <button
              type="button"
              onClick={() => fetchBooking()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-action px-5 text-xs font-semibold uppercase tracking-[0.16em] text-on-action transition hover:bg-action hover:text-on-action"
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
    <main className="relative min-h-screen overflow-hidden bg-canvas pb-20 text-ink antialiased">
      {/*=====================================================
      Background
      =====================================================*/}

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">




      </div>

      {/*=====================================================
      Header
      =====================================================*/}

      <header className="lg:sticky lg:top-0 z-40 border-b border-line bg-subtle">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
          <Link
            to="/designer/bookings"
            className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted transition hover:text-action"
          >
            <ArrowLeft size={16} />
            Bookings
          </Link>

          <button
            type="button"
            onClick={() =>
              fetchBooking({
                silent: true,
              })
            }
            disabled={refreshing}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted transition hover:border-line hover:text-action disabled:opacity-50 dark:bg-subtle"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-[1280px] space-y-4 px-4 pt-3 sm:space-y-7 sm:pt-8 sm:px-8 lg:px-10">
        {/*=================================================
        Success message
        =================================================*/}

        {successMessage && (
          <div className="flex items-start gap-3 rounded-md border border-line bg-canvas p-4 text-action dark:bg-subtle">
            <CheckCircle2 size={19} className="mt-0.5 shrink-0" />

            <div className="flex-1">
              <p className="text-sm font-semibold">{successMessage}</p>
            </div>

            <button
              type="button"
              onClick={() => setSuccessMessage("")}
              className="text-muted hover:text-action"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {/*=================================================
        Error message
        =================================================*/}

        {error && (
          <div className="flex items-start gap-3 rounded-md border border-line bg-canvas p-4 text-action dark:bg-subtle">
            <AlertCircle size={19} className="mt-0.5 shrink-0" />

            <div className="flex-1">
              <p className="text-sm font-semibold">{error}</p>
            </div>

            <button
              type="button"
              onClick={() => setError("")}
              className="text-muted hover:text-action"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {/*=================================================
        Booking hero
        =================================================*/}

        <section className="overflow-hidden rounded-md border border-line bg-subtle">
          <div className="grid gap-0 xl:grid-cols-[1fr_350px]">
            <div className="p-4 lg:p-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.17em] ${statusDetails.badgeClass}`}
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
                  className="inline-flex items-center gap-2 rounded-md border border-line bg-canvas px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-muted transition hover:border-line hover:text-action dark:bg-subtle"
                >
                  {String(booking.id).slice(0, 8).toUpperCase()}

                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>

                <span className="rounded-md border border-line bg-subtle px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.17em] text-action">
                  {booking.booking_type || "commission"}
                </span>
              </div>

              <h1 className="mt-6 max-w-4xl font-sans text-4xl font-light tracking-tight sm:text-5xl lg:text-6xl">
                {projectTitle}
              </h1>

              <p className="mt-5 max-w-3xl text-sm leading-7 text-muted sm:text-base">
                {booking.brief_text || "No project brief was supplied."}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-5 border-t border-line pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-line bg-canvas dark:bg-subtle">
                    {creatorAvatar ? (
                      <img
                        src={creatorAvatar}
                        alt={creatorName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-bold text-muted">
                        {getFirstName(creatorName).charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                      Project Creator
                    </p>

                    <p className="mt-1 text-sm font-semibold">{creatorName}</p>
                  </div>
                </div>

                <div className="hidden h-10 w-px bg-subtle sm:block" />

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
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

            <aside className="order-first border-b border-line bg-subtle p-4 xl:order-none xl:border-b-0 sm:p-4 xl:border-l xl:border-t-0">
              <div
                className={`hidden h-14 w-14 items-center xl:flex justify-center rounded-md border border-current/15 bg-surface dark:bg-subtle ${statusDetails.accentClass}`}
              >
                <StatusIcon
                  size={25}
                  className={statusDetails.spinning ? "animate-spin" : ""}
                />
              </div>

              <p
                className={`xl:mt-6 text-[10px] font-semibold uppercase tracking-normal ${statusDetails.accentClass}`}
              >
                Current Phase
              </p>

              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                {statusDetails.title}
              </h2>

              <p className="mt-3 hidden text-sm leading-6 text-muted xl:block">
                {statusDetails.description}
              </p>

              <BookingNextStep booking={booking} role="designer" />

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
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-action px-5 text-xs font-semibold uppercase tracking-[0.16em] text-on-action transition hover:-translate-y-0.5 hover:bg-action disabled:cursor-not-allowed disabled:opacity-50 hover:text-on-action"
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
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 text-xs font-semibold uppercase tracking-[0.16em] text-action transition hover:bg-canvas disabled:opacity-50 dark:bg-transparent dark:hover:bg-subtle"
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
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 text-xs font-semibold uppercase tracking-[0.16em] text-muted transition hover:border-line hover:bg-canvas hover:text-action disabled:opacity-50 dark:bg-transparent dark:hover:bg-subtle"
                  >
                    <Ban size={16} />
                    Cancel Booking
                  </button>
                )}
              </div>

              {primaryAction && (
                <p className="mt-4 text-center text-[11px] leading-5 text-muted">
                  {primaryAction.helper}
                </p>
              )}
            </aside>
          </div>
        </section>

        {/*=================================================
        Workflow
        =================================================*/}

        <section className="rounded-md border border-line bg-subtle p-4">
          <div className="flex items-center justify-between gap-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-normal text-action">
                Milestone Journey
              </p>

              <h2 className="mt-2 font-sans text-3xl font-light">
                Booking workflow
              </h2>
            </div>

            <Sparkles className="text-action" size={22} />
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
                  className={`relative rounded-md border p-4 transition ${
                    active
                      ? "border-line bg-subtle"
                      : reached
                        ? "border-line bg-canvas dark:bg-subtle"
                        : "border-line bg-canvas dark:bg-subtle"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
                        active
                          ? "border-line bg-action text-on-action"
                          : reached
                            ? "border-line bg-action text-on-action"
                            : "border-line bg-surface text-muted dark:bg-subtle"
                      }`}
                    >
                      {reached ? <Check size={14} /> : index + 1}
                    </div>

                    <span
                      className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
                        active
                          ? "text-action"
                          : reached
                            ? "text-action"
                            : "text-muted"
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
            BOOKING_STATUS.REFUND_PENDING,
            BOOKING_STATUS.REFUND_FAILED,
          ].includes(status) && (
            <div className="mt-5 flex items-start gap-3 rounded-md border border-line bg-canvas p-4 text-sm leading-6 text-action dark:bg-subtle">
              <Ban size={18} className="mt-0.5 shrink-0" />

              <p>
                {status === BOOKING_STATUS.CANCELLED
                  ? "This workflow ended because the booking was cancelled."
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

            <section className="rounded-md border border-line bg-subtle p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-subtle text-action">
                  <FileText size={20} />
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-normal text-muted">
                    Project Scope
                  </p>

                  <h2 className="mt-1 text-xl font-semibold">Creator brief</h2>
                </div>
              </div>

              <div className="mt-6 rounded-md border border-line bg-canvas p-4 text-sm leading-7 text-muted dark:bg-subtle">
                {booking.brief_text || "No project brief was supplied."}
              </div>

              <BookingDesignAttachment bookingId={id} />

              {booking.revision_notes && (
                <div className="mt-5 rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                  <div className="flex items-start gap-3">
                    <MessageSquareText
                      size={19}
                      className="mt-0.5 shrink-0 text-action"
                    />

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-action">
                        Revision Requested
                      </p>

                      <p className="mt-2 text-sm leading-6 text-muted">
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

            <section className="rounded-md border border-line bg-subtle p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-canvas text-action dark:bg-subtle">
                  <PackageCheck size={20} />
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-normal text-muted">
                    Deliverables
                  </p>

                  <h2 className="mt-1 text-xl font-semibold">Submitted work</h2>
                </div>
              </div>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
                Each milestone keeps the required 2D deliverable and, when
                supplied, an interactive 3D model and Virtual Try-On garment
                image.
              </p>

              {/*=====================================
              Prototype
              =====================================*/}

              <article className="mt-6 rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-subtle text-action">
                    <PlayCircle size={19} />
                  </div>

                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Prototype
                  </span>
                </div>

                <h3 className="mt-5 text-base font-semibold">
                  Phase-one submission
                </h3>

                <p className="mt-2 text-sm leading-6 text-muted">
                  {booking.prototype_message ||
                    "No prototype has been submitted yet."}
                </p>

                {booking.prototype_file_url ? (
                  <a
                    href={booking.prototype_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-action transition hover:border-line hover:bg-canvas dark:bg-subtle dark:hover:bg-subtle"
                  >
                    Open 2D Prototype
                    <ExternalLink size={13} />
                  </a>
                ) : (
                  <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    2D prototype not submitted
                  </p>
                )}

                {booking.prototype_tryon_image_url && (
                  <a
                    href={booking.prototype_tryon_image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex w-fit items-center gap-2 rounded-md border border-line bg-subtle px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-action transition hover:border-line hover:bg-subtle"
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
                    <div className="flex items-center gap-2 text-[10px] text-muted">
                      <CheckCircle2 size={13} className="text-action" />
                      2D prototype available
                    </div>
                  )}

                  {booking.prototype_model_url && (
                    <div className="flex items-center gap-2 text-[10px] text-muted">
                      <CheckCircle2 size={13} className="text-action" />
                      Interactive 3D model available
                    </div>
                  )}

                  {booking.prototype_tryon_image_url && (
                    <div className="flex items-center gap-2 text-[10px] text-muted">
                      <CheckCircle2 size={13} className="text-action" />
                      Virtual Try-On garment available
                    </div>
                  )}
                </div>
              </article>

              {/*=====================================
              Final delivery
              =====================================*/}

              <article className="mt-5 rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-subtle text-action">
                    <FileCheck2 size={19} />
                  </div>

                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Final
                  </span>
                </div>

                <h3 className="mt-5 text-base font-semibold">Final delivery</h3>

                <p className="mt-2 text-sm leading-6 text-muted">
                  {booking.delivery_message ||
                    "Final files have not been submitted yet."}
                </p>

                {booking.delivery_file_url ? (
                  <a
                    href={booking.delivery_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-action transition hover:border-line hover:bg-canvas dark:bg-subtle dark:hover:bg-subtle"
                  >
                    Open Final 2D
                    <ExternalLink size={13} />
                  </a>
                ) : (
                  <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Final 2D deliverable not submitted
                  </p>
                )}

                {booking.delivery_tryon_image_url && (
                  <a
                    href={booking.delivery_tryon_image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex w-fit items-center gap-2 rounded-md border border-line bg-subtle px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-action transition hover:border-line hover:bg-subtle"
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
                    <div className="flex items-center gap-2 text-[10px] text-muted">
                      <CheckCircle2 size={13} className="text-action" />
                      Final 2D deliverable available
                    </div>
                  )}

                  {booking.delivery_model_url && (
                    <div className="flex items-center gap-2 text-[10px] text-muted">
                      <CheckCircle2 size={13} className="text-action" />
                      Interactive final 3D model available
                    </div>
                  )}

                  {booking.delivery_tryon_image_url && (
                    <div className="flex items-center gap-2 text-[10px] text-muted">
                      <CheckCircle2 size={13} className="text-action" />
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
            Booking summary
            =========================================*/}

            <section className="rounded-md border border-line bg-subtle p-4">
              <div className="flex items-center gap-3">
                <BadgeDollarSign
                  size={20}
                  className="text-action"
                />

                <h2 className="text-lg font-semibold">Booking summary</h2>
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between gap-4 border-b border-line pb-4">
                  <span className="text-sm text-muted">
                    Agreed value
                  </span>

                  <strong className="font-mono text-lg text-action">
                    {formatCurrency(booking.agreed_price)}
                  </strong>
                </div>

                <div className="flex items-center justify-between gap-4 border-b border-line pb-4">
                  <span className="text-sm text-muted">
                    Payment status
                  </span>

                  <span
                    className={`inline-flex items-center gap-2 text-sm font-semibold ${
                      booking.escrow_locked
                        ? "text-action"
                        : "text-muted"
                    }`}
                  >
                    {booking.escrow_locked ? (
                      <ShieldCheck size={15} />
                    ) : (
                      <LockKeyhole size={15} />
                    )}

                    {paymentLabel(booking)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted">
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

            <section className="rounded-md border border-line bg-subtle p-4">
              <div className="flex items-center gap-3">
                <CalendarDays
                  size={20}
                  className="text-action"
                />

                <h2 className="text-lg font-semibold">Schedule</h2>
              </div>

              <div className="mt-6 space-y-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Deadline
                  </p>

                  <p className="mt-2 text-base font-semibold">
                    {formatDate(booking.deadline)}
                  </p>

                  <p className="mt-1 text-xs text-muted">
                    {getDeadlineMessage(booking.deadline, booking.status)}
                  </p>
                </div>

                <div className="border-t border-line pt-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Scheduled start
                  </p>

                  <p className="mt-2 text-sm font-semibold">
                    {formatDateTime(booking.scheduled_at)}
                  </p>
                </div>
              </div>
            </section>

            {/*=========================================
            Private WhatsApp Contact
            =========================================*/}

            {whatsappContactEligible && (
              <section className="overflow-hidden rounded-md border border-line bg-subtle">
                <div className="border-b border-line bg-subtle p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-action dark:bg-subtle">
                        <MessageCircle size={20} />
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-normal text-action">
                          Booking communication
                        </p>

                        <h2 className="mt-1 font-serif text-xl font-light text-ink">
                          WhatsApp Contact
                        </h2>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void fetchWhatsAppContact()}
                      disabled={whatsappLoading}
                      title="Refresh WhatsApp availability"
                      aria-label="Refresh WhatsApp contact availability"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-action transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50 dark:bg-subtle dark:hover:bg-subtle"
                    >
                      <RefreshCw
                        size={14}
                        className={whatsappLoading ? "animate-spin" : ""}
                      />
                    </button>
                  </div>
                </div>

                <div className="p-4">
                  {whatsappLoading ? (
                    <div className="flex items-center gap-3 rounded-md border border-line bg-canvas p-4 text-sm text-muted dark:bg-subtle">
                      <Loader2
                        size={17}
                        className="shrink-0 animate-spin text-action"
                      />

                      <p>Checking private booking contact availability...</p>
                    </div>
                  ) : whatsappError ? (
                    <div className="rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                      <div className="flex items-start gap-3">
                        <AlertCircle
                          size={17}
                          className="mt-0.5 shrink-0 text-action"
                        />

                        <div>
                          <p className="text-sm font-semibold text-action">
                            Contact could not be loaded
                          </p>

                          <p className="mt-1 text-xs leading-5 text-muted">
                            {whatsappError}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : whatsappAvailable ? (
                    <div className="space-y-4">
                      <div className="rounded-md border border-line bg-subtle p-4">
                        <div className="flex items-start gap-3">
                          <CheckCircle2
                            size={18}
                            className="mt-0.5 shrink-0 text-action"
                          />

                          <div>
                            <p className="text-sm font-semibold text-action">
                              {whatsappPartnerName} is available on WhatsApp
                            </p>

                            <p className="mt-1 text-xs leading-5 text-muted">
                              The Creator has chosen to share WhatsApp contact
                              through this booking. The raw phone number is not
                              displayed on this page.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenWhatsApp(whatsappContact?.message_url)
                          }
                          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-action px-4 text-[11px] font-semibold uppercase tracking-[0.17em] text-on-action transition hover:bg-action focus:outline-none focus:ring-4 focus:ring-action hover:text-on-action"
                        >
                          <MessageCircle size={16} />
                          Message on WhatsApp
                          <ExternalLink size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleOpenWhatsApp(whatsappContact?.video_call_url)
                          }
                          disabled={
                            !isSafeWhatsAppUrl(whatsappContact?.video_call_url)
                          }
                          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 text-[11px] font-semibold uppercase tracking-[0.17em] text-action transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50 dark:bg-subtle dark:hover:bg-subtle"
                        >
                          <Video size={16} />
                          Open WhatsApp for Video Call
                          <ExternalLink size={14} />
                        </button>
                      </div>

                      <div className="rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                        <p className="text-xs leading-5 text-muted">
                          {whatsappContact?.video_call_instruction ||
                            "Open the WhatsApp chat, then use WhatsApp's video icon to start a video call."}
                        </p>
                      </div>

                      <div className="flex items-start gap-3 rounded-md border border-line bg-subtle p-4">
                        <ShieldCheck
                          size={17}
                          className="mt-0.5 shrink-0 text-action"
                        />

                        <p className="text-xs leading-5 text-muted">
                          Use WhatsApp for communication or call coordination
                          only. Keep acceptance, revisions, milestone
                          submissions, cancellations, payments and final
                          approval inside DesignByYou.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                      <div className="flex items-start gap-3">
                        <LockKeyhole
                          size={17}
                          className="mt-0.5 shrink-0 text-muted"
                        />

                        <div>
                          <p className="text-sm font-semibold text-ink dark:text-muted">
                            WhatsApp contact unavailable
                          </p>

                          <p className="mt-1 text-xs leading-5 text-muted">
                            {whatsappContact?.message ||
                              "WhatsApp contact is not available for this booking."}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/*=========================================
            Cancellation record
            =========================================*/}

            {(booking.cancellation_reason || booking.cancelled_at) && (
              <section className="rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                <div className="flex items-center gap-3 text-action">
                  <Ban size={20} />

                  <h2 className="text-lg font-semibold">Cancellation record</h2>
                </div>

                <p className="mt-4 text-sm leading-6 text-muted">
                  {booking.cancellation_reason ||
                    "No cancellation reason was recorded."}
                </p>

                {booking.cancelled_at && (
                  <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
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
