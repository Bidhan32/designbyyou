import ToolBookingAction from "../../components/ToolBookingAction";
import CreatorCreditBalance from "../../components/CreatorCreditBalance";
import BookingNextStep from "../../components/BookingNextStep";
import { deadlineMessage as getDeadlineMessage, canResumePayment, canCancelBooking, paymentLabel } from "../../components/bookingProgress";
import BookingDesignAttachment from "../../components/BookingDesignAttachment";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  Hourglass,
  Info,
  Loader2,
  LockKeyhole,
  MessageCircle,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Video,
  WalletCards,
  X,
} from "lucide-react";
import API from "../../api/axios";
import { useToast } from "../../context/ToastContext.helpers.js";
import BookingModelViewer from "../../components/BookingModelViewer";

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

const REVIEW_STATUSES = new Set([
  BOOKING_STATUS.REVIEW_PROTOTYPE,
  BOOKING_STATUS.REVIEW_FINAL,
  BOOKING_STATUS.REVIEW,
]);



/*
=========================================================
WHATSAPP CONTACT STATES

These exactly match the protected backend contact policy.

IMPORTANT:
- funded is intentionally NOT included
- pending is intentionally NOT included
- legacy accepted is intentionally NOT included
- cancelled is intentionally NOT included
=========================================================
*/

const WHATSAPP_CONTACT_STATUSES = new Set([
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.PROGRESS,
  BOOKING_STATUS.REVIEW_PROTOTYPE,
  BOOKING_STATUS.FINAL_PRODUCTION,
  BOOKING_STATUS.REVIEW_FINAL,
  BOOKING_STATUS.COMPLETED,
]);

function safeJsonParse(value) {
  if (!value) return null;

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

  const storedUser = safeJsonParse(localStorage.getItem("user"));

  return storedUser?.id || storedUser?._id || null;
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
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

function formatDate(value, includeTime = false) {
  if (!value) {
    return "Not provided";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleString(
    undefined,
    includeTime
      ? {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }
      : {
          month: "short",
          day: "numeric",
          year: "numeric",
        },
  );
}

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function isHttpUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/*
=========================================================
WHATSAPP LINK VALIDATION

Even though the backend creates the URL, the browser still
validates that it points to an expected WhatsApp host before
opening a new tab.
=========================================================
*/

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

function getStatusDetails(status, designerName) {
  const normalized = normalizeStatus(status);

  const firstName =
    String(designerName || "Designer")
      .trim()
      .split(/\s+/)[0] || "Designer";

  switch (normalized) {
    case BOOKING_STATUS.PENDING:
      return {
        label: "Awaiting Designer",
        title: "Request sent",
        description: `${firstName} is reviewing your project request.`,
        icon: Hourglass,
        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",
        panelClass:
          "border-line bg-subtle",
      };

    case BOOKING_STATUS.AWAITING_PAYMENT:
      return {
        label: "Payment Required",
        title: "Designer accepted",
        description:
          "The designer accepted your request, but the payment has not yet been confirmed.",
        icon: WalletCards,
        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",
        panelClass:
          "border-line bg-subtle",
      };

    case BOOKING_STATUS.FUNDED:
      return {
        label: "Payment Secured",
        title: "Payment protected",
        description:
          "Your payment is secured while the designer reviews or accepts the project.",
        icon: ShieldCheck,
        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",
        panelClass:
          "border-line bg-subtle",
      };

    case BOOKING_STATUS.ACCEPTED:
    case BOOKING_STATUS.PROGRESS:
      return {
        label: "Prototype Production",
        title: "Work in progress",
        description: `${firstName} is preparing your first prototype.`,
        icon: Clock3,
        badgeClass:
          "border-line bg-subtle text-action",
        panelClass: "border-line bg-subtle",
      };

    case BOOKING_STATUS.REVIEW_PROTOTYPE:
      return {
        label: "Review Prototype",
        title: "Your decision is needed",
        description: "Review the prototype, approve it or request a revision.",
        icon: FileCheck2,
        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",
        panelClass:
          "border-line bg-subtle",
      };

    case BOOKING_STATUS.FINAL_PRODUCTION:
      return {
        label: "Final Production",
        title: "Prototype approved",
        description: `${firstName} is preparing the final deliverables.`,
        icon: Clock3,
        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",
        panelClass:
          "border-line bg-subtle",
      };

    case BOOKING_STATUS.REVIEW_FINAL:
    case BOOKING_STATUS.REVIEW:
      return {
        label: "Review Final Delivery",
        title: "Final approval required",
        description:
          "Review the final 2D and optional 3D deliverables before approving the Designer payment.",
        icon: FileCheck2,
        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",
        panelClass:
          "border-line bg-subtle",
      };

    case BOOKING_STATUS.REFUND_PENDING:
      return { ...getStatusDetails(BOOKING_STATUS.CANCELLATION_PENDING), label: "Refund processing", title: "Your refund is processing", description: "The refund has been requested. This booking is closed to further work while payment records are updated." };
    case BOOKING_STATUS.REFUND_FAILED:
      return { ...getStatusDetails(BOOKING_STATUS.CANCELLATION_PENDING), label: "Refund needs attention", title: "Refund needs administrator review", description: "The refund could not be completed. Contact support with this booking ID; do not make another payment.", spinning: false };
    case BOOKING_STATUS.CANCELLATION_PENDING:
      return {
        label: "Cancellation Processing",
        title: "Reconciliation underway",
        description:
          "Cancellation and any required Stripe refund reconciliation are being processed.",
        icon: Loader2,
        spinning: true,
        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",
        panelClass:
          "border-line bg-subtle",
      };

    case BOOKING_STATUS.COMPLETED:
    case BOOKING_STATUS.DELIVERED:
      return {
        label: "Completed & Paid",
        title: "Booking completed",
        description:
          "The final work was approved and the Designer payment was released.",
        icon: CheckCircle2,
        badgeClass:
          "border-line bg-canvas text-action dark:bg-subtle",
        panelClass:
          "border-line bg-subtle",
      };

    case BOOKING_STATUS.CANCELLED:
      return {
        label: "Cancelled",
        title: "Booking closed",
        description:
          "No further work or Creator action is required for this booking.",
        icon: Ban,
        badgeClass:
          "border-line bg-subtle text-muted",
        panelClass:
          "border-line bg-canvas dark:bg-subtle",
      };

    default:
      return {
        label: normalized || "Unknown",
        title: "Booking status",
        description: "Refresh this page to get the latest booking status.",
        icon: Info,
        badgeClass:
          "border-line bg-subtle text-muted",
        panelClass:
          "border-line bg-canvas dark:bg-subtle",
      };
  }
}

function getTimeline(status, escrowLocked) {
  const normalized = normalizeStatus(status);

  const paymentComplete =
    escrowLocked ||
    [
      BOOKING_STATUS.FUNDED,
      BOOKING_STATUS.ACCEPTED,
      BOOKING_STATUS.PROGRESS,
      BOOKING_STATUS.REVIEW_PROTOTYPE,
      BOOKING_STATUS.FINAL_PRODUCTION,
      BOOKING_STATUS.REVIEW_FINAL,
      BOOKING_STATUS.REVIEW,
      BOOKING_STATUS.COMPLETED,
      BOOKING_STATUS.DELIVERED,
    ].includes(normalized);

  const designerAccepted = [
    BOOKING_STATUS.AWAITING_PAYMENT,
    BOOKING_STATUS.ACCEPTED,
    BOOKING_STATUS.PROGRESS,
    BOOKING_STATUS.REVIEW_PROTOTYPE,
    BOOKING_STATUS.FINAL_PRODUCTION,
    BOOKING_STATUS.REVIEW_FINAL,
    BOOKING_STATUS.REVIEW,
    BOOKING_STATUS.COMPLETED,
    BOOKING_STATUS.DELIVERED,
  ].includes(normalized);

  const prototypeSubmitted = [
    BOOKING_STATUS.REVIEW_PROTOTYPE,
    BOOKING_STATUS.FINAL_PRODUCTION,
    BOOKING_STATUS.REVIEW_FINAL,
    BOOKING_STATUS.REVIEW,
    BOOKING_STATUS.COMPLETED,
    BOOKING_STATUS.DELIVERED,
  ].includes(normalized);

  const prototypeApproved = [
    BOOKING_STATUS.FINAL_PRODUCTION,
    BOOKING_STATUS.REVIEW_FINAL,
    BOOKING_STATUS.REVIEW,
    BOOKING_STATUS.COMPLETED,
    BOOKING_STATUS.DELIVERED,
  ].includes(normalized);

  const finalSubmitted = [
    BOOKING_STATUS.REVIEW_FINAL,
    BOOKING_STATUS.REVIEW,
    BOOKING_STATUS.COMPLETED,
    BOOKING_STATUS.DELIVERED,
  ].includes(normalized);

  const completed = [
    BOOKING_STATUS.COMPLETED,
    BOOKING_STATUS.DELIVERED,
  ].includes(normalized);

  return [
    {
      label: "Booking created",
      description: "Your booking request was created.",
      complete: true,
    },
    {
      label: "Designer accepted",
      description: "The Designer accepted the booking.",
      complete: designerAccepted,
    },
    {
      label: "Payment secured",
      description: "Your Stripe payment was confirmed and secured.",
      complete: paymentComplete,
    },
    {
      label: "Prototype submitted",
      description: "The first milestone was delivered for review.",
      complete: prototypeSubmitted,
    },
    {
      label: "Prototype approved",
      description: "Final production was authorized.",
      complete: prototypeApproved,
    },
    {
      label: "Final files submitted",
      description: "The final milestone was delivered.",
      complete: finalSubmitted,
    },
    {
      label: "Completed and paid",
      description: "The Designer payment was released.",
      complete: completed,
    },
  ];
}

export default function CreatorBookingDetail() {
  const { id: bookingId } = useParams();

  const { showToast } = useToast();

  const currentUserId = useMemo(() => getStoredUserId(), []);

  const [booking, setBooking] = useState(null);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [pageError, setPageError] = useState("");

  const [actionName, setActionName] = useState("");

  const [revisionOpen, setRevisionOpen] = useState(false);

  const [revisionNotes, setRevisionNotes] = useState("");

  const [cancellationOpen, setCancellationOpen] = useState(false);

  const [cancellationReason, setCancellationReason] = useState("");

  const [tryOnOpen, setTryOnOpen] = useState(false);

  const [tryOnPhase, setTryOnPhase] = useState("prototype");

  const [tryOnFile, setTryOnFile] = useState(null);

  const [tryOnPreviewUrl, setTryOnPreviewUrl] = useState("");

  const [referenceVersion, setReferenceVersion] = useState(0);
  const [tryOnResultImage, setTryOnResultImage] = useState("");

  const [tryOnLoading, setTryOnLoading] = useState(false);

  const [tryOnError, setTryOnError] = useState("");

  /*
  =========================================================
  Private WhatsApp Booking Contact
  =========================================================
  */

  const [whatsappContact, setWhatsappContact] = useState(null);

  const [whatsappLoading, setWhatsappLoading] = useState(false);

  const [whatsappError, setWhatsappError] = useState("");

  const fetchBooking = useCallback(
    async ({ silent = false } = {}) => {
      if (!bookingId) {
        setPageError("The booking reference is missing.");

        setLoading(false);

        return;
      }

      if (!currentUserId) {
        setPageError(
          "Your account session could not be identified. Please sign in again.",
        );

        setLoading(false);

        return;
      }

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setPageError("");

      try {
        const response = await API.get("/p2p-bookings/pipeline");

        const bookings = Array.isArray(response?.data?.data)
          ? response.data.data
          : [];

        const target = bookings.find(
          (item) => String(item?.id) === String(bookingId),
        );

        if (!target) {
          throw new Error("The requested booking was not found.");
        }

        if (String(target.creator_id) !== String(currentUserId)) {
          throw new Error("You are not authorized to access this booking.");
        }

        setBooking(target);
      } catch (error) {
        setPageError(
          getApiErrorMessage(
            error,
            "The booking workspace could not be loaded.",
          ),
        );
      } finally {
        setLoading(false);

        setRefreshing(false);
      }
    },
    [bookingId, currentUserId],
  );

  /*
  =========================================================
  Load protected WhatsApp contact

  This API is called only after the booking has reached one
  of the backend-approved post-acceptance states.

  The normal /pipeline response never receives the number.
  =========================================================
  */

  const fetchWhatsAppContact = useCallback(async () => {
    if (!bookingId) {
      return;
    }

    setWhatsappLoading(true);

    setWhatsappError("");

    try {
      const response = await API.get(
        `/p2p-bookings/${bookingId}/whatsapp-contact`,
      );

      const contact = response?.data?.data;

      if (!contact || typeof contact !== "object" || Array.isArray(contact)) {
        throw new Error("The WhatsApp contact response was invalid.");
      }

      setWhatsappContact(contact);
    } catch (error) {
      const responseCode = error?.response?.data?.code;

      /*
      A booking can change state between loading /pipeline
      and loading the private contact endpoint.

      A 409 caused by that state race should simply remove
      contact access from the page.
      */
      if (
        error?.response?.status === 409 &&
        responseCode === "WHATSAPP_CONTACT_UNAVAILABLE"
      ) {
        setWhatsappContact(null);

        setWhatsappError("");

        return;
      }

      setWhatsappContact(null);

      setWhatsappError(
        getApiErrorMessage(
          error,
          "WhatsApp contact could not be loaded for this booking.",
        ),
      );
    } finally {
      setWhatsappLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  /*
  Load WhatsApp only when the current workflow state allows it.
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
    if (!tryOnFile) {
      setTryOnPreviewUrl("");

      return undefined;
    }

    const objectUrl = URL.createObjectURL(tryOnFile);

    setTryOnPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [tryOnFile]);

  const runAction = async ({ name, request, successMessage, afterSuccess }) => {
    if (actionName) {
      return;
    }

    setActionName(name);

    try {
      const response = await request();

      const customMessage =
        typeof successMessage === "function"
          ? successMessage(response)
          : successMessage;

      const message =
        customMessage || response?.data?.message || "Action completed.";

      showToast(message, "success");

      if (afterSuccess) {
        await afterSuccess(response);
      }

      await fetchBooking({
        silent: true,
      });
    } catch (error) {
      showToast(
        getApiErrorMessage(error, "The action could not be completed."),
        "error",
      );
    } finally {
      setActionName("");
    }
  };

  const handleVerifyEscrow = () =>
    runAction({
      name: "verify-escrow",

      request: () =>
        API.post("/p2p-bookings/verify-escrow", {
          bookingId,
        }),

      successMessage: "Stripe payment confirmed and secured.",
    });

  const handleApprovePrototype = () =>
    runAction({
      name: "approve-prototype",

      request: () => API.post(`/p2p-bookings/${bookingId}/approve-prototype`),

      successMessage: "Prototype approved. Final production can begin.",

      afterSuccess: () => {
        setRevisionOpen(false);

        setRevisionNotes("");
      },
    });

  const handleReleasePayout = () =>
    runAction({
      name: "release",

      request: () => API.post(`/p2p-bookings/${bookingId}/release`),

      successMessage: (response) => {
        const reward = response?.data?.creatorReward;

        const rewardPoints = Number(reward?.points ?? 0);

        const totalPoints = Number(reward?.totalPoints);

        if (reward?.awarded === true && rewardPoints > 0) {
          return Number.isFinite(totalPoints)
            ? `Final delivery approved and Designer payment released. +${rewardPoints} reward points earned. Total points: ${totalPoints}.`
            : `Final delivery approved and Designer payment released. +${rewardPoints} reward points earned.`;
        }

        if (reward?.awarded === true && rewardPoints === 0) {
          return "Final delivery approved and Designer payment released. This booking does not qualify for reward points.";
        }

        if (response?.data?.idempotent === true) {
          return "This booking was already completed and its reward was already processed.";
        }

        return "Final delivery approved and Designer payment released.";
      },

      afterSuccess: (response) => {
        setRevisionOpen(false);

        setRevisionNotes("");

        const reward = response?.data?.creatorReward;

        const totalPoints = Number(reward?.totalPoints);

        /*
        Tell CreatorLayout that the reward total changed.

        CreatorLayout listens for this event and updates the
        navbar immediately.
        */
        if (Number.isFinite(totalPoints)) {
          window.dispatchEvent(
            new CustomEvent("creator-reward-updated", {
              detail: {
                totalPoints,
              },
            }),
          );
        } else if (reward?.awarded === true) {
          /*
          For a zero-point reward or a response without a total,
          ask CreatorLayout to reload the authoritative total
          from /auth/me.
          */
          window.dispatchEvent(new CustomEvent("creator-reward-updated"));
        }
      },
    });

  const handleRevisionSubmit = async (event) => {
    event.preventDefault();

    const notes = revisionNotes.trim();

    if (!notes) {
      showToast("Please provide clear revision notes.", "error");

      return;
    }

    await runAction({
      name: "request-revision",

      request: () =>
        API.post(`/p2p-bookings/${bookingId}/request-revision`, {
          notes,
        }),

      successMessage: "Revision requested. The designer was notified.",

      afterSuccess: () => {
        setRevisionOpen(false);

        setRevisionNotes("");
      },
    });
  };

  const handleCancellationSubmit = async (event) => {
    event.preventDefault();

    const reason = cancellationReason.trim();

    if (!reason) {
      showToast("Please provide a cancellation reason.", "error");

      return;
    }

    await runAction({
      name: "cancel",

      request: () =>
        API.post(`/p2p-bookings/${bookingId}/cancel`, {
          reason,
        }),

      successMessage: "Cancellation request processed.",

      afterSuccess: () => {
        setCancellationOpen(false);

        setCancellationReason("");
      },
    });
  };

  /*
  =========================================================
  Open WhatsApp

  The raw phone number is deliberately not rendered anywhere
  on this page. Only the server-generated safe wa.me URL is
  used for navigation.
  =========================================================
  */

  const handleOpenWhatsApp = (url, mode) => {
    if (!isSafeWhatsAppUrl(url)) {
      showToast(
        "The WhatsApp link is unavailable or invalid. Refresh the booking and try again.",
        "error",
      );

      return;
    }

    const openedWindow = window.open(url, "_blank");

    if (!openedWindow) {
      showToast(
        mode === "video"
          ? "Your browser blocked WhatsApp. Allow pop-ups and try opening the video-call chat again."
          : "Your browser blocked WhatsApp. Allow pop-ups and try opening the chat again.",
        "error",
      );

      return;
    }

    openedWindow.opener = null;
  };

  const resetTryOn = () => {
    setTryOnFile(null);

    setTryOnResultImage("");

    setTryOnError("");
  };

  const closeTryOn = () => {
    if (tryOnLoading) {
      return;
    }

    setTryOnOpen(false);

    resetTryOn();
  };

  const openTryOn = (phase) => {
    const normalizedPhase = phase === "final" ? "final" : "prototype";

    const garmentUrl =
      normalizedPhase === "prototype"
        ? booking?.prototype_tryon_image_url
        : booking?.delivery_tryon_image_url;

    if (!isHttpUrl(garmentUrl)) {
      showToast(
        normalizedPhase === "prototype"
          ? "This prototype does not have a Virtual Try-On garment image."
          : "This final delivery does not have a Virtual Try-On garment image.",
        "error",
      );

      return;
    }

    setTryOnPhase(normalizedPhase);

    resetTryOn();

    setTryOnOpen(true);
  };

  const handleTryOnFileChange = (event) => {
    const file = event.target.files?.[0] || null;

    setTryOnResultImage("");

    setTryOnError("");

    if (!file) {
      setTryOnFile(null);

      return;
    }

    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

    if (!allowedTypes.has(file.type)) {
      event.target.value = "";

      setTryOnFile(null);

      setTryOnError("Please choose a JPEG, PNG, or WEBP photo.");

      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      event.target.value = "";

      setTryOnFile(null);

      setTryOnError("Your photo must be 12 MB or smaller.");

      return;
    }

    setTryOnFile(file);
  };

  const handleGenerateTryOn = async () => {
    if (tryOnLoading) {
      return;
    }

    if (!tryOnFile) {
      setTryOnError("Please choose a photo before generating Virtual Try-On.");

      return;
    }

    setTryOnLoading(true);

    setTryOnError("");

    setTryOnResultImage("");

    try {
      const formData = new FormData();

      formData.append("person_image", tryOnFile);

      formData.append("phase", tryOnPhase);
      formData.append("request_key", crypto.randomUUID());

      formData.append("category", "auto");

      const response = await API.post(
        `/virtual-tryon/bookings/${bookingId}`,
        formData,
      );

      const image = response?.data?.data?.image;

      if (typeof image !== "string" || !image.trim()) {
        throw new Error(
          "Virtual Try-On completed but no generated image was returned.",
        );
      }

      setTryOnResultImage(image);

      showToast(
        response?.data?.message || "Virtual Try-On generated successfully.",
        "success",
      );
    } catch (error) {
      setTryOnError(
        getApiErrorMessage(
          error,
          "The Virtual Try-On could not be generated. Please try again.",
        ),
      );
    } finally {
      setTryOnLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="text-center">
          <Loader2
            size={38}
            className="mx-auto animate-spin text-action"
          />

          <p className="mt-4 text-xs font-semibold tracking-normal text-muted">
            Loading booking workspace
          </p>
        </div>
      </main>
    );
  }

  if (pageError || !booking) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas p-4 text-ink">


        <section className="relative z-10 w-full max-w-lg rounded-md border border-line bg-surface p-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-md border border-line bg-canvas text-action dark:bg-subtle">
            <AlertCircle size={28} />
          </div>

          <h1 className="mt-6 font-semibold text-3xl sm:text-4xl">
            Booking unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-muted">
            {pageError || "The booking could not be loaded."}
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <Link
              to="/creator/bookings"
              className="inline-flex h-9 items-center justify-center rounded-md border border-line bg-surface text-xs font-semibold tracking-normal text-ink dark:bg-subtle dark:text-muted"
            >
              Back to bookings
            </Link>

            <button
              type="button"
              onClick={() => fetchBooking()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-action text-xs font-semibold tracking-normal text-on-action"
            >
              <RefreshCw size={15} />
              Retry
            </button>
          </div>
        </section>
      </main>
    );
  }

  const status = normalizeStatus(booking.status);

  const designerName =
    booking.receiver_name || booking.designer_name || "Hired Designer";

  const designerAvatar =
    booking.receiver_avatar || booking.designer_avatar || null;

  const statusDetails = getStatusDetails(status, designerName);

  const StatusIcon = statusDetails.icon;

  const timeline = getTimeline(status, booking.escrow_locked);

  const reviewState = REVIEW_STATUSES.has(status);

  const prototypeReview = status === BOOKING_STATUS.REVIEW_PROTOTYPE;


  const currentReviewUrl = prototypeReview
    ? booking.prototype_file_url
    : booking.delivery_file_url;

  const currentReviewModelUrl = prototypeReview
    ? booking.prototype_model_url
    : booking.delivery_model_url;

  const currentReviewTryOnUrl = prototypeReview
    ? booking.prototype_tryon_image_url
    : booking.delivery_tryon_image_url;

  const currentReviewMessage = prototypeReview
    ? booking.prototype_message
    : booking.delivery_message;

  const paymentCheckAvailable = canResumePayment(booking);
  const cancellationAllowed = canCancelBooking(status);

  const whatsappContactEligible = WHATSAPP_CONTACT_STATUSES.has(status);

  const whatsappAvailable =
    whatsappContactEligible &&
    whatsappContact?.available === true &&
    isSafeWhatsAppUrl(whatsappContact?.message_url);

  const whatsappPartnerName =
    whatsappContact?.participant?.display_name || designerName;

  const paymentStatusLabel = paymentLabel(booking);

  return (
    <main className="relative min-h-screen overflow-hidden bg-canvas pb-20 text-ink antialiased">
      {/* Background */}

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">




      </div>

      {/* Header */}

      <header className="lg:sticky lg:top-0 z-40 border-b border-line bg-subtle">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-2 px-4 py-3 sm:gap-5 sm:py-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div>
            <Link
              to="/creator/bookings"
              className="inline-flex items-center gap-2 text-xs font-semibold tracking-normal text-muted transition hover:text-action"
            >
              <ArrowLeft size={14} />
              Back to bookings
            </Link>

            <h1 className="mt-3 font-semibold text-3xl tracking-tight sm:text-4xl">
              Booking
              <span className="ml-2 italic text-action">
                details
              </span>
            </h1>

            <p className="mt-2 hidden max-w-2xl text-sm leading-6 sm:block text-muted">
              Review your designer’s work and see what happens next.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-md border border-line bg-surface px-3.5 py-2 font-mono text-xs tracking-normal text-muted dark:bg-subtle">
              {String(booking.id || "")
                .slice(0, 8)
                .toUpperCase()}
            </span>

            <span
              className={`inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-xs font-semibold tracking-normal ${statusDetails.badgeClass}`}
            >
              <StatusIcon
                size={13}
                className={statusDetails.spinning ? "animate-spin" : ""}
              />

              {statusDetails.label}
            </span>

            <button
              type="button"
              onClick={() =>
                fetchBooking({
                  silent: true,
                })
              }
              disabled={refreshing || Boolean(actionName)}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-surface px-3.5 text-xs font-semibold tracking-normal text-muted transition hover:border-line hover:text-action disabled:opacity-50 dark:bg-subtle"
            >
              <RefreshCw
                size={14}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 pt-3 sm:pt-8 sm:px-8 lg:px-10">
        {/* Current stage */}

        <section
          className={`mb-4 rounded-md border p-4 ${statusDetails.panelClass}`}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-current/10 bg-subtle text-action">
                <StatusIcon
                  size={22}
                  className={statusDetails.spinning ? "animate-spin" : ""}
                />
              </div>

              <div>
                <p className="text-xs font-semibold tracking-normal text-muted">
                  Current stage
                </p>

                <h2 className="mt-1 text-xl font-semibold">
                  {statusDetails.title}
                </h2>

                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                  {statusDetails.description}
                </p>
              </div>
            </div>

            {reviewState && (
              <a href="#booking-review" className="inline-flex min-h-9 items-center justify-center rounded-md bg-action px-4 text-sm font-semibold text-on-action dark:bg-surface dark:text-ink">{prototypeReview ? "Review prototype" : "Review final files"}</a>
            )}
            {paymentCheckAvailable && (
              <Link
                to={`/creator/bookings/new?booking_id=${encodeURIComponent(bookingId)}`}
                className="mt-4 inline-flex min-h-9 items-center rounded-md bg-action px-5 text-sm font-semibold text-on-action"
              >
                Continue payment
              </Link>
            )}
            {paymentCheckAvailable && (
              <button
                type="button"
                onClick={handleVerifyEscrow}
                disabled={Boolean(actionName)}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-action px-4 text-xs font-semibold tracking-normal text-on-action transition hover:bg-action disabled:opacity-50 hover:text-on-action"
              >
                {actionName === "verify-escrow" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <RefreshCw size={15} />
                )}
                Check payment status
              </button>
            )}
          </div>

          {paymentCheckAvailable && (
            <div className="mt-5 flex items-start gap-3 rounded-md border border-line bg-subtle p-4 text-sm text-action">
              <Info size={17} className="mt-0.5 shrink-0" />

              <p>
                Check for a completed payment. This will not charge your card.
              </p>
            </div>
          )}
        </section>

        <div className="mb-7"><BookingNextStep booking={booking} role="creator" /></div>

        {/* Cancelled */}

        {status === BOOKING_STATUS.CANCELLED && (
          <section className="mb-7 rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
            <div className="flex items-start gap-4">
              <Ban
                size={22}
                className="mt-0.5 shrink-0 text-action"
              />

              <div>
                <h2 className="font-semibold text-action">
                  Booking cancelled
                </h2>

                <p className="mt-2 text-sm leading-6 text-muted">
                  {booking.cancellation_reason || "No reason was provided."}
                </p>

                {booking.cancelled_at && (
                  <p className="mt-2 text-xs text-muted">
                    Closed {formatDate(booking.cancelled_at, true)}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        <div className="grid gap-8 xl:grid-cols-[1fr_390px]">
          <div className="space-y-7">
            {/* =====================================================
                Review Panel
                ===================================================== */}

            {reviewState && (
              <section id="booking-review" tabIndex={-1} className="scroll-mt-24 overflow-hidden rounded-md border border-line bg-surface">
                <div className="border-b border-line bg-subtle p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-line bg-subtle text-action">
                      <Sparkles size={22} />
                    </div>

                    <div>
                      <p className="text-xs font-semibold tracking-normal text-action">
                        Your review is needed
                      </p>

                      <h2 className="mt-1 font-sans text-2xl font-light">
                        {prototypeReview
                          ? "Prototype Review"
                          : "Final Delivery Review"}
                      </h2>

                      <p className="mt-2 text-sm leading-6 text-muted">
                        Review the submitted 2D work and any optional 3D model
                        carefully before approving it or asking for revisions.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6 p-4">
                  <div className="rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {/* 2D */}

                      <div className="rounded-md border border-line bg-surface p-4 dark:bg-subtle">
                        <p className="text-xs font-semibold tracking-normal text-muted">
                          2D deliverable
                        </p>

                        {isHttpUrl(currentReviewUrl) ? (
                          <a
                            href={currentReviewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center gap-2 text-xs font-semibold tracking-normal text-action transition hover:text-ink"
                          >
                            <FileText size={16} />

                            {prototypeReview
                              ? "Open 2D prototype"
                              : "Open final 2D"}

                            <ArrowUpRight size={14} />
                          </a>
                        ) : (
                          <div className="mt-3 flex items-start gap-3 text-sm text-action">
                            <AlertCircle
                              size={17}
                              className="mt-0.5 shrink-0"
                            />

                            <p>
                              A valid HTTP or HTTPS 2D delivery link was not
                              provided.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* 3D */}

                      <div className="rounded-md border border-line bg-subtle p-4">
                        <p className="text-xs font-semibold tracking-normal text-muted">
                          3D model
                        </p>

                        {isHttpUrl(currentReviewModelUrl) ? (
                          <a
                            href={currentReviewModelUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center gap-2 text-xs font-semibold tracking-normal text-action transition hover:text-action dark:hover:text-ink"
                          >
                            <Sparkles size={16} />
                            Open 3D model
                            <ArrowUpRight size={14} />
                          </a>
                        ) : (
                          <p className="mt-3 text-sm leading-6 text-muted">
                            No optional 3D model was submitted for this
                            milestone.
                          </p>
                        )}
                      </div>
                    </div>

                    {isHttpUrl(currentReviewModelUrl) && (
                      <div className="mt-5">
                        <BookingModelViewer
                          modelUrl={currentReviewModelUrl}
                          title={
                            prototypeReview
                              ? "Prototype 3D Model"
                              : "Final 3D Model"
                          }
                          height={420}
                        />
                      </div>
                    )}

                    {currentReviewMessage && (
                      <div className="mt-4 rounded-md border border-line bg-surface p-4 dark:bg-subtle">
                        <p className="text-xs font-semibold tracking-normal text-muted">
                          Designer message
                        </p>

                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
                          {currentReviewMessage}
                        </p>
                      </div>
                    )}

                    <div className="mt-4 rounded-md border border-line bg-subtle p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold tracking-normal text-action">
                            Virtual Try-On
                          </p>

                          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
                            Upload your own photo to preview this garment on you
                            before making your milestone decision.
                          </p>
                        </div>

                        {isHttpUrl(currentReviewTryOnUrl) ? (
                          <button
                            type="button"
                            onClick={() =>
                              openTryOn(prototypeReview ? "prototype" : "final")
                            }
                            disabled={Boolean(actionName) || tryOnLoading}
                            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-action px-5 text-xs font-semibold tracking-normal text-on-action transition hover:bg-action disabled:opacity-50 hover:text-on-action"
                          >
                            <Sparkles size={15} />
                            Try it on
                          </button>
                        ) : (
                          <p className="text-xs leading-5 text-muted">
                            The designer has not supplied a Virtual Try-On
                            garment image for this milestone.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {booking.alterations_remaining != null && <p className="text-sm text-muted">Alterations remaining: {booking.alterations_remaining} of {booking.membership_terms.alterations}</p>}
                  {revisionOpen ? (
                    <form
                      onSubmit={handleRevisionSubmit}
                      className="rounded-md border border-line bg-canvas p-4 dark:bg-subtle"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold tracking-normal text-action">
                            Request revision
                          </p>

                          <h3 className="mt-1 font-semibold">
                            Explain exactly what must change
                          </h3>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setRevisionOpen(false);

                            setRevisionNotes("");
                          }}
                          disabled={Boolean(actionName)}
                          aria-label="Close revision form"
                          className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-subtle text-action disabled:opacity-50"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <textarea
                        value={revisionNotes}
                        onChange={(event) =>
                          setRevisionNotes(event.target.value)
                        }
                        rows={5}
                        maxLength={10000}
                        placeholder="Describe the required corrections, files, dimensions, 2D changes or 3D model changes..."
                        className="mt-4 w-full resize-none rounded-md border border-line bg-surface p-4 text-sm leading-6 text-ink outline-none transition focus:border-line focus:ring-4 focus:ring-action dark:bg-subtle"
                      />

                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setRevisionOpen(false);

                            setRevisionNotes("");
                          }}
                          disabled={Boolean(actionName)}
                          className="h-9 rounded-md border border-line bg-surface px-4 text-xs font-semibold tracking-normal text-action disabled:opacity-50 dark:bg-subtle"
                        >
                          Keep current delivery
                        </button>

                        <button
                          type="submit"
                          disabled={
                            Boolean(actionName) || !revisionNotes.trim()
                          }
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-action px-5 text-xs font-semibold tracking-normal text-on-action transition hover:bg-action disabled:opacity-50 hover:text-on-action"
                        >
                          {actionName === "request-revision" ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <RotateCcw size={15} />
                          )}
                          Submit revision
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setRevisionOpen(true)}
                        disabled={Boolean(actionName) || booking.alterations_remaining === 0}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-canvas px-5 text-xs font-semibold tracking-normal text-action transition hover:bg-subtle disabled:opacity-50 dark:bg-subtle"
                      >
                        <RotateCcw size={15} />
                        Request changes
                      </button>

                      <button
                        type="button"
                        onClick={
                          prototypeReview
                            ? handleApprovePrototype
                            : handleReleasePayout
                        }
                        disabled={Boolean(actionName)}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-action px-5 text-xs font-semibold tracking-normal text-on-action transition hover:bg-action disabled:opacity-50 hover:text-on-action"
                      >
                        {["approve-prototype", "release"].includes(
                          actionName,
                        ) ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={15} />
                        )}

                        {prototypeReview
                          ? "Approve prototype"
                          : "Approve final & pay Designer"}
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Project Brief */}

            <section className="rounded-md border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-5 border-b border-line pb-5">
                <div>
                  <p className="text-xs font-semibold tracking-normal text-muted">
                    Project information
                  </p>

                  <h2 className="mt-1 font-sans text-2xl font-light">
                    What would you like designed?
                  </h2>
                </div>

                <FileText className="text-action" />
              </div>

              <p className="mt-5 whitespace-pre-wrap rounded-md border border-line bg-canvas p-4 text-sm leading-7 text-muted dark:bg-subtle">
                {booking.brief_text || "No project brief was supplied."}
              </p>

              <BookingDesignAttachment key={referenceVersion} bookingId={bookingId} />

              {booking.revision_notes && (
                <div className="mt-5 rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                  <div className="flex items-center gap-2 text-action">
                    <MessageSquareText size={17} />

                    <h3 className="text-xs font-semibold tracking-normal">
                      Latest revision request
                    </h3>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">
                    {booking.revision_notes}
                  </p>
                </div>
              )}
            </section>

            {/* Delivery Archive */}

            <section className="rounded-md border border-line bg-surface p-4">
              <div className="border-b border-line pb-5">
                <p className="text-xs font-semibold tracking-normal text-muted">
                  Delivery archive
                </p>

                <h2 className="mt-1 font-sans text-2xl font-light">
                  Files
                </h2>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {/* Prototype Archive */}

                <article className="rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold tracking-normal text-muted">
                        Milestone one
                      </p>

                      <h3 className="mt-1 font-semibold">Prototype</h3>
                    </div>

                    <FileCheck2 className="text-action" />
                  </div>

                  {isHttpUrl(booking.prototype_file_url) ? (
                    <a
                      href={booking.prototype_file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex items-center gap-2 text-xs font-semibold tracking-normal text-action hover:text-action"
                    >
                      Open 2D prototype
                      <ArrowUpRight size={14} />
                    </a>
                  ) : (
                    <p className="mt-5 text-sm text-muted">
                      No prototype has been submitted.
                    </p>
                  )}

                  {isHttpUrl(booking.prototype_model_url) && (
                    <>
                      <a
                        href={booking.prototype_model_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 flex w-fit items-center gap-2 text-xs font-semibold tracking-normal text-action hover:text-action"
                      >
                        Open 3D prototype
                        <ArrowUpRight size={14} />
                      </a>

                      <div className="mt-5">
                        <BookingModelViewer
                          modelUrl={booking.prototype_model_url}
                          title="Prototype 3D Model"
                          height={340}
                        />
                      </div>
                    </>
                  )}

                  {booking.prototype_message && (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted">
                      {booking.prototype_message}
                    </p>
                  )}

                  {isHttpUrl(booking.prototype_tryon_image_url) && (
                    <button
                      type="button"
                      onClick={() => openTryOn("prototype")}
                      disabled={tryOnLoading}
                      className="mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-canvas px-4 text-xs font-semibold tracking-normal text-action transition hover:bg-subtle disabled:opacity-50 dark:bg-subtle"
                    >
                      <Sparkles size={14} />
                      Virtual Try-On
                    </button>
                  )}
                </article>

                {/* Final Archive */}

                <article className="rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold tracking-normal text-muted">
                        Milestone two
                      </p>

                      <h3 className="mt-1 font-semibold">Final Delivery</h3>
                    </div>

                    <CheckCircle2 className="text-action" />
                  </div>

                  {isHttpUrl(booking.delivery_file_url) ? (
                    <a
                      href={booking.delivery_file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex items-center gap-2 text-xs font-semibold tracking-normal text-action hover:text-action"
                    >
                      Open final 2D
                      <ArrowUpRight size={14} />
                    </a>
                  ) : (
                    <p className="mt-5 text-sm text-muted">
                      No final delivery has been submitted.
                    </p>
                  )}

                  {isHttpUrl(booking.delivery_model_url) && (
                    <>
                      <a
                        href={booking.delivery_model_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 flex w-fit items-center gap-2 text-xs font-semibold tracking-normal text-action hover:text-action"
                      >
                        Open final 3D
                        <ArrowUpRight size={14} />
                      </a>

                      <div className="mt-5">
                        <BookingModelViewer
                          modelUrl={booking.delivery_model_url}
                          title="Final 3D Model"
                          height={340}
                        />
                      </div>
                    </>
                  )}

                  {booking.delivery_message && (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted">
                      {booking.delivery_message}
                    </p>
                  )}

                  {isHttpUrl(booking.delivery_tryon_image_url) && (
                    <button
                      type="button"
                      onClick={() => openTryOn("final")}
                      disabled={tryOnLoading}
                      className="mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-canvas px-4 text-xs font-semibold tracking-normal text-action transition hover:bg-subtle disabled:opacity-50 dark:bg-subtle"
                    >
                      <Sparkles size={14} />
                      Virtual Try-On
                    </button>
                  )}
                </article>
              </div>
            </section>

            {/* Timeline */}

            <section className="rounded-md border border-line bg-surface p-4">
              <div className="border-b border-line pb-5">
                <p className="text-xs font-semibold tracking-normal text-muted">
                  Booking progress
                </p>

                <h2 className="mt-1 font-sans text-2xl font-light">
                  Progress
                </h2>
              </div>

              <div className="relative mt-6 space-y-7 before:absolute before:bottom-4 before:left-[17px] before:top-4 before:w-px before:bg-subtle">
                {timeline.map((step) => (
                  <div key={step.label} className="relative pl-12">
                    <div
                      className={`absolute left-0 top-0 z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 bg-surface ${
                        step.complete
                          ? "border-line text-action"
                          : "border-line text-muted"
                      }`}
                    >
                      {step.complete ? (<CheckCircle2 size={16} />) : (<span className="h-2 w-2 rounded-full bg-current" />)}
                    </div>

                    <h3
                      className={`text-sm font-semibold ${
                        step.complete
                          ? "text-ink"
                          : "text-muted"
                      }`}
                    >
                      {step.label}
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-muted">
                      {step.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Sidebar */}

          <aside className="space-y-6 xl:sticky xl:top-28 xl:self-start">
            {/* Payment Summary */}

            <section className="overflow-hidden rounded-md border border-line bg-surface">
              <div className="border-b border-line bg-canvas p-4 dark:bg-subtle">
                <p className="text-xs font-semibold tracking-normal text-muted">
                  Payment summary
                </p>

                <div className="mt-3 flex items-end justify-between gap-4">
                  <h2 className="font-sans text-4xl font-light">
                    {formatCurrency(booking.agreed_price)}
                  </h2>

                  <span
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold tracking-normal ${
                      booking.escrow_locked
                        ? "border-line bg-canvas text-action dark:bg-subtle"
                        : "border-line bg-surface text-muted dark:bg-subtle"
                    }`}
                  >
                    {booking.escrow_locked ? (
                      <ShieldCheck size={13} />
                    ) : (
                      <LockKeyhole size={13} />
                    )}

                    {paymentStatusLabel}
                  </span>
                </div>
              </div>

              <div className="space-y-4 p-4">
                <div className="flex items-start gap-3 rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                  <CalendarDays
                    size={17}
                    className="mt-0.5 shrink-0 text-action"
                  />

                  <div>
                    <p className="text-xs font-semibold tracking-normal text-muted">
                      Final deadline
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      {formatDate(booking.deadline)}
                    </p>

                    <p className="mt-1 text-xs text-muted">
                      {getDeadlineMessage(booking.deadline, booking.status)}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                  <Clock3
                    size={17}
                    className="mt-0.5 shrink-0 text-action"
                  />

                  <div>
                    <p className="text-xs font-semibold tracking-normal text-muted">
                      Preferred start
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      {formatDate(booking.scheduled_at, true)}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                  <BadgeDollarSign
                    size={17}
                    className="mt-0.5 shrink-0 text-action"
                  />

                  <div>
                    <p className="text-xs font-semibold tracking-normal text-muted">
                      Booking type
                    </p>

                    <p className="mt-1 text-sm font-semibold capitalize">
                      {booking.booking_type || "commission"}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Designer */}

            <section className="rounded-md border border-line bg-surface p-4">
              <p className="text-xs font-semibold tracking-normal text-muted">
                Your designer
              </p>

              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-canvas dark:bg-subtle">
                  {designerAvatar ? (
                    <img
                      src={designerAvatar}
                      alt={designerName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserRound className="text-muted" />
                  )}
                </div>

                <div className="min-w-0">
                  <h2 className="truncate font-serif text-xl">
                    {designerName}
                  </h2>

                  <p className="mt-1 text-xs font-semibold tracking-normal text-action">
                    Assigned designer
                  </p>
                </div>
              </div>
            </section>

            {/* =====================================================
                Private WhatsApp Booking Contact
                ===================================================== */}

            {whatsappContactEligible && (
              <section className="overflow-hidden rounded-md border border-line bg-surface">
                <div className="border-b border-line bg-subtle p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-action dark:bg-subtle">
                        <MessageCircle size={20} />
                      </div>

                      <div>
                        <p className="text-xs font-semibold tracking-normal text-action">
                          Contact your designer
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
                              Their contact is available to you through this
                              active booking. The phone number is intentionally
                              not displayed on this page.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenWhatsApp(
                              whatsappContact?.message_url,
                              "message",
                            )
                          }
                          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-action px-4 text-xs font-semibold tracking-normal text-on-action transition hover:bg-action focus:outline-none focus:ring-4 focus:ring-action hover:text-on-action"
                        >
                          <MessageCircle size={16} />
                          Message on WhatsApp
                          <ArrowUpRight size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleOpenWhatsApp(
                              whatsappContact?.video_call_url,
                              "video",
                            )
                          }
                          disabled={
                            !isSafeWhatsAppUrl(whatsappContact?.video_call_url)
                          }
                          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 text-xs font-semibold tracking-normal text-action transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50 dark:bg-subtle dark:hover:bg-subtle"
                        >
                          <Video size={16} />
                          Open WhatsApp for Video Call
                          <ArrowUpRight size={14} />
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
                          only. Keep acceptance, revisions, milestone approvals,
                          cancellations, payments and final approval inside
                          DesignByYou.
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

            {/* Completed */}

            {status === BOOKING_STATUS.COMPLETED ||
            status === BOOKING_STATUS.DELIVERED ? (
              <section className="rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                <CheckCircle2 className="text-action" />

                <h2 className="mt-4 font-semibold text-action">
                  Booking completed
                </h2>

                <p className="mt-2 text-sm leading-6 text-muted">
                  The Designer payment was released. Your 2D and 3D delivery
                  links remain available in the archive.
                </p>

                {booking.creator_reward_awarded_at && (
                  <div className="mt-4 rounded-md border border-line bg-subtle p-4">
                    <div className="flex items-center gap-3">
                      <Sparkles
                        size={18}
                        className="shrink-0 text-action"
                      />

                      <div>
                        <p className="text-xs font-semibold tracking-normal text-action">
                          Creator reward
                        </p>

                        <p className="mt-1 text-sm font-semibold text-action">
                          +{Number(booking.creator_reward_points || 0)} points
                          earned from this booking
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            ) : status === BOOKING_STATUS.CANCELLATION_PENDING ? (
              <section className="rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                <Loader2 className="animate-spin text-action" />

                <h2 className="mt-4 font-semibold text-action">
                  Cancellation in progress
                </h2>

                <p className="mt-2 text-sm leading-6 text-muted">
                  We’re checking the cancellation and payment status. Please wait before trying again.
                </p>
              </section>
            ) : status !== BOOKING_STATUS.CANCELLED && cancellationAllowed ? (
              <section className="rounded-md border border-line bg-surface p-4">
                <p className="text-xs font-semibold tracking-normal text-action">
                  Booking management
                </p>

                <h2 className="mt-2 font-sans text-2xl font-light">
                  Need to cancel?
                </h2>

                <p className="mt-2 text-sm leading-6 text-muted">
                  Cancellation may trigger a Stripe refund when the payment was
                  already secured.
                </p>

                {cancellationOpen ? (
                  <form onSubmit={handleCancellationSubmit} className="mt-5">
                    <textarea
                      value={cancellationReason}
                      onChange={(event) =>
                        setCancellationReason(event.target.value)
                      }
                      rows={4}
                      maxLength={5000}
                      placeholder="Explain why this booking should be cancelled..."
                      className="w-full resize-none rounded-md border border-line bg-canvas p-4 text-sm leading-6 text-ink outline-none transition focus:border-line focus:ring-4 focus:ring-action dark:bg-subtle"
                    />

                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCancellationOpen(false);

                          setCancellationReason("");
                        }}
                        disabled={Boolean(actionName)}
                        className="h-9 rounded-md border border-line bg-surface text-xs font-semibold tracking-normal text-muted disabled:opacity-50 dark:bg-subtle"
                      >
                        Keep booking
                      </button>

                      <button
                        type="submit"
                        disabled={
                          Boolean(actionName) || !cancellationReason.trim()
                        }
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-action text-xs font-semibold tracking-normal text-on-action transition hover:bg-action disabled:opacity-50 hover:text-on-action"
                      >
                        {actionName === "cancel" ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Ban size={15} />
                        )}
                        Confirm cancellation
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCancellationOpen(true)}
                    disabled={Boolean(actionName)}
                    className="mt-5 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-canvas text-xs font-semibold tracking-normal text-action transition hover:bg-subtle disabled:opacity-50 dark:bg-subtle"
                  >
                    <Ban size={15} />
                    Request cancellation
                  </button>
                )}
              </section>
            ) : null}
          </aside>
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            to="/creator/bookings"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 text-xs font-semibold tracking-normal text-muted transition hover:border-line hover:text-action dark:bg-subtle"
          >
            Back to bookings
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* =========================================================
          Virtual Try-On Modal
          ========================================================= */}

      {tryOnOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Virtual Try-On"
        >
          <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-md border border-line bg-surface">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-subtle p-4">
              <div>
                <p className="text-xs font-semibold tracking-normal text-action">
                  AI Virtual Try-On
                </p>

                <h2 className="mt-1 font-sans text-2xl font-light text-ink">
                  Preview the{" "}
                  {tryOnPhase === "prototype" ? "prototype" : "final garment"}
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                  Choose a clear photo of yourself. Your photo is used for this
                  generation and is not written to the booking record by this
                  feature.
                </p>
              </div>

              <button
                type="button"
                onClick={closeTryOn}
                disabled={tryOnLoading}
                aria-label="Close Virtual Try-On"
                className="flex h-9 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-muted transition hover:bg-subtle disabled:opacity-40 dark:bg-subtle"
              >
                <X size={17} />
              </button>
            </div>

            <div className="grid gap-6 p-4 lg:grid-cols-2">
              <div className="space-y-5">
                <div className="rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                  <p className="text-xs font-semibold tracking-normal text-muted">
                    Your photo
                  </p>

                  <label className="mt-4 block cursor-pointer rounded-md border border-dashed border-line bg-subtle p-4 text-center transition hover:bg-canvas dark:hover:bg-subtle">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleTryOnFileChange}
                      disabled={tryOnLoading}
                      className="sr-only"
                    />

                    <Sparkles className="mx-auto text-action" />

                    <p className="mt-3 text-sm font-semibold text-ink">
                      {tryOnFile
                        ? "Choose a different photo"
                        : "Choose your photo"}
                    </p>

                    <p className="mt-1 text-xs leading-5 text-muted">
                      JPEG, PNG or WEBP · maximum 12 MB
                    </p>
                  </label>

                  {tryOnPreviewUrl && (
                    <div className="mt-4 overflow-hidden rounded-md border border-line bg-subtle">
                      <img
                        src={tryOnPreviewUrl}
                        alt="Selected Virtual Try-On person"
                        className="max-h-[430px] w-full object-contain"
                      />
                    </div>
                  )}

                  {tryOnError && (
                    <div className="mt-4 flex items-start gap-3 rounded-md border border-line bg-canvas p-4 text-sm leading-6 text-action dark:bg-subtle">
                      <AlertCircle size={17} className="mt-0.5 shrink-0" />

                      <p>{tryOnError}</p>
                    </div>
                  )}

                  <CreatorCreditBalance refreshKey={tryOnLoading} costLabel="10 credits per image" />
                  <button
                    type="button"
                    onClick={handleGenerateTryOn}
                    disabled={tryOnLoading || !tryOnFile}
                    className="mt-5 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-action px-5 text-xs font-semibold tracking-normal text-on-action transition hover:bg-action disabled:cursor-not-allowed disabled:opacity-50 hover:text-on-action"
                  >
                    {tryOnLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Sparkles size={16} />
                    )}

                    {tryOnLoading ? "Generating..." : "Generate Virtual Try-On"}
                  </button>

                  <p className="mt-3 text-center text-xs leading-5 text-muted">
                    Generation can take several seconds. Keep this window open
                    until the result is ready.
                  </p>
                </div>
              </div>

              <div className="rounded-md border border-line bg-canvas p-4 dark:bg-subtle">
                <p className="text-xs font-semibold tracking-normal text-muted">
                  Generated result
                </p>

                {tryOnResultImage ? (
                  <>
                    <ToolBookingAction key={tryOnResultImage.slice(-64)} tool="Virtual Try-On" src={tryOnResultImage} bookingId={bookingId} onSaved={() => setReferenceVersion(v => v + 1)} />
                    <div className="mt-4 overflow-hidden rounded-md border border-line bg-subtle">
                      <img
                        src={tryOnResultImage}
                        alt="Generated Virtual Try-On result"
                        className="max-h-[620px] w-full object-contain"
                      />
                    </div>

                    <div className="mt-4 flex items-start gap-3 rounded-md border border-line bg-canvas p-4 text-sm leading-6 text-action dark:bg-subtle">
                      <CheckCircle2 size={17} className="mt-0.5 shrink-0" />

                      <p>
                        Virtual Try-On completed. This preview is temporary and
                        does not approve the milestone or release any payment.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setTryOnResultImage("");

                        setTryOnError("");
                      }}
                      disabled={tryOnLoading}
                      className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 text-xs font-semibold tracking-normal text-ink transition hover:bg-canvas disabled:opacity-50 dark:bg-subtle dark:text-muted dark:hover:bg-subtle"
                    >
                      <RefreshCw size={14} />
                      Try another result
                    </button>
                  </>
                ) : (
                  <div className="mt-4 flex min-h-[360px] flex-col items-center justify-center rounded-md border border-dashed border-line bg-surface p-4 text-center dark:bg-subtle">
                    {tryOnLoading ? (
                      <Loader2
                        size={34}
                        className="animate-spin text-action"
                      />
                    ) : (
                      <Sparkles
                        size={34}
                        className="text-action"
                      />
                    )}

                    <h3 className="mt-4 font-serif text-xl font-light text-ink">
                      {tryOnLoading
                        ? "Creating your preview"
                        : "Your result will appear here"}
                    </h3>

                    <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
                      {tryOnLoading
                        ? "Generating your virtual try-on. Please keep this window open."
                        : "Choose a clear, front-facing photo and generate the preview when you are ready."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
