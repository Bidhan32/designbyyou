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
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import API from "../../api/axios";
import { useToast } from "../../context/ToastContext";
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
  COMPLETED: "completed",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
});

const REVIEW_STATUSES = new Set([
  BOOKING_STATUS.REVIEW_PROTOTYPE,
  BOOKING_STATUS.REVIEW_FINAL,
  BOOKING_STATUS.REVIEW,
]);

const TERMINAL_STATUSES = new Set([
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.DELIVERED,
  BOOKING_STATUS.CANCELLED,
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

function getDeadlineMessage(value) {
  if (!value) {
    return "No deadline was provided.";
  }

  const deadline = new Date(value);

  if (Number.isNaN(deadline.getTime())) {
    return "Deadline is unavailable.";
  }

  const difference = deadline.getTime() - Date.now();

  const days = Math.ceil(difference / 86400000);

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
          "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",

        panelClass:
          "border-amber-200 bg-amber-50/80 dark:border-amber-400/15 dark:bg-amber-400/5",
      };

    case BOOKING_STATUS.AWAITING_PAYMENT:
      return {
        label: "Payment Required",

        title: "Designer accepted",

        description:
          "The designer accepted your request, but escrow has not yet been confirmed.",

        icon: WalletCards,

        badgeClass:
          "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-300",

        panelClass:
          "border-orange-200 bg-orange-50/80 dark:border-orange-400/15 dark:bg-orange-400/5",
      };

    case BOOKING_STATUS.FUNDED:
      return {
        label: "Escrow Secured",

        title: "Payment protected",

        description:
          "Your payment is secured while the designer reviews or accepts the project.",

        icon: ShieldCheck,

        badgeClass:
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",

        panelClass:
          "border-emerald-200 bg-emerald-50/80 dark:border-emerald-400/15 dark:bg-emerald-400/5",
      };

    case BOOKING_STATUS.ACCEPTED:
    case BOOKING_STATUS.PROGRESS:
      return {
        label: "Prototype Production",

        title: "Work in progress",

        description: `${firstName} is preparing your first prototype.`,

        icon: Clock3,

        badgeClass:
          "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#8F7118] dark:text-[#E4C760]",

        panelClass: "border-[#D4AF37]/25 bg-[#D4AF37]/5",
      };

    case BOOKING_STATUS.REVIEW_PROTOTYPE:
      return {
        label: "Review Prototype",

        title: "Your decision is needed",

        description: "Review the prototype, approve it or request a revision.",

        icon: FileCheck2,

        badgeClass:
          "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300",

        panelClass:
          "border-indigo-200 bg-indigo-50/80 dark:border-indigo-400/15 dark:bg-indigo-400/5",
      };

    case BOOKING_STATUS.FINAL_PRODUCTION:
      return {
        label: "Final Production",

        title: "Prototype approved",

        description: `${firstName} is preparing the final deliverables.`,

        icon: Clock3,

        badgeClass:
          "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-300",

        panelClass:
          "border-cyan-200 bg-cyan-50/80 dark:border-cyan-400/15 dark:bg-cyan-400/5",
      };

    case BOOKING_STATUS.REVIEW_FINAL:
    case BOOKING_STATUS.REVIEW:
      return {
        label: "Review Final Delivery",

        title: "Final approval required",

        description:
          "Review the final 2D and optional 3D deliverables before releasing the designer payout.",

        icon: FileCheck2,

        badgeClass:
          "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300",

        panelClass:
          "border-violet-200 bg-violet-50/80 dark:border-violet-400/15 dark:bg-violet-400/5",
      };

    case BOOKING_STATUS.CANCELLATION_PENDING:
      return {
        label: "Cancellation Processing",

        title: "Reconciliation underway",

        description:
          "Cancellation and any required Stripe refund reconciliation are being processed.",

        icon: Loader2,

        spinning: true,

        badgeClass:
          "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300",

        panelClass:
          "border-rose-200 bg-rose-50/80 dark:border-rose-400/15 dark:bg-rose-400/5",
      };

    case BOOKING_STATUS.COMPLETED:
    case BOOKING_STATUS.DELIVERED:
      return {
        label: "Completed & Paid",

        title: "Contract completed",

        description:
          "The final work was approved and the designer payout was released.",

        icon: CheckCircle2,

        badgeClass:
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",

        panelClass:
          "border-emerald-200 bg-emerald-50/80 dark:border-emerald-400/15 dark:bg-emerald-400/5",
      };

    case BOOKING_STATUS.CANCELLED:
      return {
        label: "Cancelled",

        title: "Contract closed",

        description:
          "No further work or creator action is required for this contract.",

        icon: Ban,

        badgeClass:
          "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/45",

        panelClass:
          "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]",
      };

    default:
      return {
        label: normalized || "Unknown",

        title: "Contract status",

        description: "Refresh this page to retrieve the latest contract state.",

        icon: Info,

        badgeClass:
          "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/50",

        panelClass:
          "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]",
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
      label: "Contract created",

      description: "The project request was recorded.",

      complete: true,
    },

    {
      label: "Designer accepted",

      description: "The designer agreed to the contract.",

      complete: designerAccepted,
    },

    {
      label: "Escrow secured",

      description: "Stripe payment was verified and protected.",

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

      description: "The final payout was released.",

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

  const [tryOnResultImage, setTryOnResultImage] = useState("");

  const [tryOnLoading, setTryOnLoading] = useState(false);

  const [tryOnError, setTryOnError] = useState("");

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
          throw new Error("The requested contract was not found.");
        }

        if (String(target.creator_id) !== String(currentUserId)) {
          throw new Error(
            "You are not authorized to access this creator contract.",
          );
        }

        setBooking(target);
      } catch (error) {
        setPageError(
          getApiErrorMessage(
            error,
            "The contract workspace could not be loaded.",
          ),
        );
      } finally {
        setLoading(false);

        setRefreshing(false);
      }
    },
    [bookingId, currentUserId],
  );

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

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

  const runAction = async ({
  name,
  request,
  successMessage,
  afterSuccess,
}) => {
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
      customMessage ||
      response?.data?.message ||
      "Action completed.";

    showToast(message, "success");

    if (afterSuccess) {
      await afterSuccess(response);
    }

    await fetchBooking({
      silent: true,
    });
  } catch (error) {
    showToast(
      getApiErrorMessage(
        error,
        "The action could not be completed.",
      ),
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

      successMessage: "Stripe payment verified and escrow secured.",
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

    request: () =>
      API.post(
        `/p2p-bookings/${bookingId}/release`,
      ),

    successMessage: (response) => {
      const reward =
        response?.data?.creatorReward;

      const rewardPoints = Number(
        reward?.points ?? 0,
      );

      const totalPoints = Number(
        reward?.totalPoints,
      );

      if (
        reward?.awarded === true &&
        rewardPoints > 0
      ) {
        return Number.isFinite(totalPoints)
          ? `Final delivery approved and payout released. +${rewardPoints} reward points earned. Total points: ${totalPoints}.`
          : `Final delivery approved and payout released. +${rewardPoints} reward points earned.`;
      }

      if (
        reward?.awarded === true &&
        rewardPoints === 0
      ) {
        return "Final delivery approved and payout released. This booking does not qualify for reward points.";
      }

      if (response?.data?.idempotent === true) {
        return "This booking was already completed and its reward was already processed.";
      }

      return "Final delivery approved and payout released.";
    },

    afterSuccess: (response) => {
      setRevisionOpen(false);

      setRevisionNotes("");

      const reward =
        response?.data?.creatorReward;

      const totalPoints = Number(
        reward?.totalPoints,
      );

      /*
      Tell CreatorLayout that the reward total changed.

      CreatorLayout listens for this event and updates the
      navbar immediately.
      */
      if (Number.isFinite(totalPoints)) {
        window.dispatchEvent(
          new CustomEvent(
            "creator-reward-updated",
            {
              detail: {
                totalPoints,
              },
            },
          ),
        );
      } else if (reward?.awarded === true) {
        /*
        For a zero-point reward or a response without a total,
        ask CreatorLayout to reload the authoritative total
        from /auth/me.
        */
        window.dispatchEvent(
          new CustomEvent(
            "creator-reward-updated",
          ),
        );
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
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#030303]">
        <div className="text-center">
          <Loader2
            size={38}
            className="mx-auto animate-spin text-[#B89122] dark:text-[#D4AF37]"
          />

          <p className="mt-4 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400 dark:text-white/35">
            Loading contract workspace
          </p>
        </div>
      </main>
    );
  }

  if (pageError || !booking) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-6 text-slate-950 dark:bg-[#030303] dark:text-white">
        <div className="absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500/10 blur-[170px]" />

        <section className="relative z-10 w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-2xl dark:border-white/5 dark:bg-[#0A0A0A]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
            <AlertCircle size={28} />
          </div>

          <h1 className="mt-6 font-serif text-3xl font-light">
            Contract unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-white/45">
            {pageError || "The contract could not be loaded."}
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <Link
              to="/creator/bookings"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-[0.18em] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/65"
            >
              Back to pipeline
            </Link>

            <button
              type="button"
              onClick={() => fetchBooking()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] text-[10px] font-black uppercase tracking-[0.18em] text-black"
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

  const finalReview =
    status === BOOKING_STATUS.REVIEW_FINAL || status === BOOKING_STATUS.REVIEW;

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

  const paymentCheckAvailable =
    status === BOOKING_STATUS.AWAITING_PAYMENT &&
    !booking.escrow_locked &&
    Boolean(booking.stripe_payment_intent_id);

  const cancellationAllowed =
    !TERMINAL_STATUSES.has(status) &&
    status !== BOOKING_STATUS.CANCELLATION_PENDING;

  const escrowLabel = booking.escrow_locked
    ? "Secured"
    : [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.DELIVERED].includes(status)
      ? "Released"
      : status === BOOKING_STATUS.CANCELLED
        ? "Closed"
        : "Not secured";

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 pb-20 text-slate-950 antialiased dark:bg-[#030303] dark:text-white">
      {/* Background */}

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -right-[12rem] -top-[14rem] h-[36rem] w-[36rem] rounded-full bg-[#D4AF37]/10 blur-[160px] dark:bg-[#D4AF37]/15" />

        <div className="absolute -bottom-[17rem] -left-[16rem] h-[40rem] w-[40rem] rounded-full bg-indigo-500/5 blur-[180px] dark:bg-indigo-500/10" />

        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.025)_1px,transparent_1px)] bg-[size:40px_40px] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.018)_1px,transparent_1px)]" />
      </div>

      {/* Header */}

      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-2xl dark:border-white/5 dark:bg-[#070707]/80">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-5 py-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div>
            <Link
              to="/creator/bookings"
              className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 transition hover:text-[#9B791D] dark:text-white/35 dark:hover:text-[#D4AF37]"
            >
              <ArrowLeft size={14} />
              Back to pipeline
            </Link>

            <h1 className="mt-3 font-serif text-3xl font-light tracking-tight sm:text-4xl">
              Contract
              <span className="ml-2 italic text-[#A17D1C] dark:text-[#D4AF37]">
                Workspace
              </span>
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-white/45">
              Review milestones, 2D/3D deliverables, creator decisions,
              protected funds and final delivery records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/40">
              {String(booking.id || "")
                .slice(0, 8)
                .toUpperCase()}
            </span>

            <span
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[9px] font-black uppercase tracking-[0.16em] ${statusDetails.badgeClass}`}
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
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-600 transition hover:border-[#D4AF37]/50 hover:text-[#9B791D] disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60 dark:hover:text-[#D4AF37]"
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

      <div className="relative z-10 mx-auto max-w-[1280px] px-5 pt-8 sm:px-8 lg:px-10">
        {/* Current stage */}

        <section
          className={`mb-7 rounded-3xl border p-6 sm:p-7 ${statusDetails.panelClass}`}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-current/10 bg-white/70 text-[#9B791D] dark:bg-black/20 dark:text-[#D4AF37]">
                <StatusIcon
                  size={22}
                  className={statusDetails.spinning ? "animate-spin" : ""}
                />
              </div>

              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
                  Current stage
                </p>

                <h2 className="mt-1 text-xl font-semibold">
                  {statusDetails.title}
                </h2>

                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-white/50">
                  {statusDetails.description}
                </p>
              </div>
            </div>

            {paymentCheckAvailable && (
              <button
                type="button"
                onClick={handleVerifyEscrow}
                disabled={Boolean(actionName)}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 text-[9px] font-black uppercase tracking-[0.17em] text-white transition hover:bg-orange-800 disabled:opacity-50"
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
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-orange-200 bg-white/60 p-4 text-sm text-orange-800 dark:border-orange-400/15 dark:bg-black/15 dark:text-orange-200">
              <Info size={17} className="mt-0.5 shrink-0" />

              <p>
                This button only checks whether Stripe already completed the
                payment. It does not charge a card. A resumable checkout needs a
                dedicated backend payment-resume endpoint.
              </p>
            </div>
          )}
        </section>

        {/* Cancelled */}

        {status === BOOKING_STATUS.CANCELLED && (
          <section className="mb-7 rounded-3xl border border-rose-200 bg-rose-50 p-6 dark:border-rose-400/20 dark:bg-rose-400/10">
            <div className="flex items-start gap-4">
              <Ban
                size={22}
                className="mt-0.5 shrink-0 text-rose-700 dark:text-rose-300"
              />

              <div>
                <h2 className="font-semibold text-rose-900 dark:text-rose-100">
                  Contract cancelled
                </h2>

                <p className="mt-2 text-sm leading-6 text-rose-700/80 dark:text-rose-200/70">
                  {booking.cancellation_reason || "No reason was provided."}
                </p>

                {booking.cancelled_at && (
                  <p className="mt-2 text-xs text-rose-600/70 dark:text-rose-200/50">
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
              <section className="overflow-hidden rounded-3xl border border-[#D4AF37]/30 bg-white shadow-sm dark:bg-[#0B0B0B] dark:shadow-2xl">
                <div className="border-b border-slate-200 bg-[#D4AF37]/5 p-6 dark:border-white/5 sm:p-7">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 text-[#9B791D] dark:text-[#D4AF37]">
                      <Sparkles size={22} />
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#9B791D] dark:text-[#D4AF37]">
                        Creator review required
                      </p>

                      <h2 className="mt-1 font-serif text-2xl font-light">
                        {prototypeReview
                          ? "Prototype Review"
                          : "Final Delivery Review"}
                      </h2>

                      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-white/45">
                        Review the submitted 2D work and any optional 3D model
                        carefully before approving it or asking for revisions.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6 p-6 sm:p-7">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/5 dark:bg-white/[0.025]">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {/* 2D */}

                      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/5 dark:bg-black/20">
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                          2D deliverable
                        </p>

                        {isHttpUrl(currentReviewUrl) ? (
                          <a
                            href={currentReviewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#9B791D] transition hover:text-slate-950 dark:text-[#D4AF37] dark:hover:text-white"
                          >
                            <FileText size={16} />

                            {prototypeReview
                              ? "Open 2D prototype"
                              : "Open final 2D"}

                            <ArrowUpRight size={14} />
                          </a>
                        ) : (
                          <div className="mt-3 flex items-start gap-3 text-sm text-rose-700 dark:text-rose-300">
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

                      <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-400/15 dark:bg-cyan-400/[0.05]">
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-700/70 dark:text-cyan-300/70">
                          3D model
                        </p>

                        {isHttpUrl(currentReviewModelUrl) ? (
                          <a
                            href={currentReviewModelUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700 transition hover:text-cyan-950 dark:text-cyan-300 dark:hover:text-white"
                          >
                            <Sparkles size={16} />
                            Open 3D model
                            <ArrowUpRight size={14} />
                          </a>
                        ) : (
                          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-white/35">
                            No optional 3D model was submitted for this
                            milestone.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Interactive current milestone 3D review */}

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
                      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/5 dark:bg-black/20">
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                          Designer message
                        </p>

                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-white/55">
                          {currentReviewMessage}
                        </p>
                      </div>
                    )}

                    <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-400/15 dark:bg-violet-400/[0.06]">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
                            Virtual Try-On
                          </p>

                          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-white/45">
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
                            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 text-[9px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-violet-800 disabled:opacity-50 dark:bg-violet-500 dark:hover:bg-violet-400"
                          >
                            <Sparkles size={15} />
                            Try it on
                          </button>
                        ) : (
                          <p className="text-xs leading-5 text-slate-500 dark:text-white/35">
                            The designer has not supplied a Virtual Try-On
                            garment image for this milestone.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Revision */}

                  {revisionOpen ? (
                    <form
                      onSubmit={handleRevisionSubmit}
                      className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-400/20 dark:bg-rose-400/10"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">
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
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-white/60 text-rose-700 disabled:opacity-50 dark:border-rose-400/20 dark:bg-black/15 dark:text-rose-300"
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
                        className="mt-4 w-full resize-none rounded-xl border border-rose-200 bg-white p-4 text-sm leading-6 text-slate-900 outline-none transition focus:border-rose-400 focus:ring-4 focus:ring-rose-500/10 dark:border-rose-400/20 dark:bg-black/20 dark:text-white"
                      />

                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setRevisionOpen(false);

                            setRevisionNotes("");
                          }}
                          disabled={Boolean(actionName)}
                          className="h-11 rounded-xl border border-rose-200 bg-white px-4 text-[9px] font-black uppercase tracking-[0.17em] text-rose-700 disabled:opacity-50 dark:border-rose-400/20 dark:bg-black/15 dark:text-rose-300"
                        >
                          Keep current delivery
                        </button>

                        <button
                          type="submit"
                          disabled={
                            Boolean(actionName) || !revisionNotes.trim()
                          }
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-700 px-5 text-[9px] font-black uppercase tracking-[0.17em] text-white transition hover:bg-rose-800 disabled:opacity-50"
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
                        disabled={Boolean(actionName)}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-5 text-[9px] font-black uppercase tracking-[0.18em] text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300 dark:hover:bg-rose-400/15"
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
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-5 text-[9px] font-black uppercase tracking-[0.18em] text-black shadow-[0_12px_30px_rgba(212,175,55,0.2)] transition hover:bg-[#E2C45D] disabled:opacity-50"
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
                          : "Approve and release payout"}
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Project Brief */}

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-[#0B0B0B] dark:shadow-2xl sm:p-7">
              <div className="flex items-start justify-between gap-5 border-b border-slate-200 pb-5 dark:border-white/5">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/30">
                    Project information
                  </p>

                  <h2 className="mt-1 font-serif text-2xl font-light">
                    Project Brief
                  </h2>
                </div>

                <FileText className="text-[#9B791D] dark:text-[#D4AF37]" />
              </div>

              <p className="mt-5 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-600 dark:border-white/5 dark:bg-white/[0.025] dark:text-white/55">
                {booking.brief_text || "No project brief was supplied."}
              </p>

              {booking.revision_notes && (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-400/20 dark:bg-amber-400/10">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                    <MessageSquareText size={17} />

                    <h3 className="text-[10px] font-black uppercase tracking-[0.17em]">
                      Latest revision request
                    </h3>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-amber-800/80 dark:text-amber-200/70">
                    {booking.revision_notes}
                  </p>
                </div>
              )}
            </section>

            {/* =====================================================
                Delivery Archive
                ===================================================== */}

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-[#0B0B0B] dark:shadow-2xl sm:p-7">
              <div className="border-b border-slate-200 pb-5 dark:border-white/5">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/30">
                  Delivery archive
                </p>

                <h2 className="mt-1 font-serif text-2xl font-light">
                  Submitted Assets
                </h2>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {/* Prototype Archive */}

                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/5 dark:bg-white/[0.025]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                        Milestone one
                      </p>

                      <h3 className="mt-1 font-semibold">Prototype</h3>
                    </div>

                    <FileCheck2 className="text-indigo-600 dark:text-indigo-300" />
                  </div>

                  {isHttpUrl(booking.prototype_file_url) ? (
                    <a
                      href={booking.prototype_file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.17em] text-indigo-700 hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-200"
                    >
                      Open 2D prototype
                      <ArrowUpRight size={14} />
                    </a>
                  ) : (
                    <p className="mt-5 text-sm text-slate-500 dark:text-white/35">
                      No prototype has been submitted.
                    </p>
                  )}

                  {isHttpUrl(booking.prototype_model_url) && (
                    <>
                      <a
                        href={booking.prototype_model_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 flex w-fit items-center gap-2 text-[9px] font-black uppercase tracking-[0.17em] text-cyan-700 hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-200"
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
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-500 dark:text-white/45">
                      {booking.prototype_message}
                    </p>
                  )}

                  {isHttpUrl(booking.prototype_tryon_image_url) && (
                    <button
                      type="button"
                      onClick={() => openTryOn("prototype")}
                      disabled={tryOnLoading}
                      className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 text-[9px] font-black uppercase tracking-[0.17em] text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300 dark:hover:bg-violet-400/15"
                    >
                      <Sparkles size={14} />
                      Virtual Try-On
                    </button>
                  )}
                </article>

                {/* Final Archive */}

                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/5 dark:bg-white/[0.025]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                        Milestone two
                      </p>

                      <h3 className="mt-1 font-semibold">Final Delivery</h3>
                    </div>

                    <CheckCircle2 className="text-emerald-600 dark:text-emerald-300" />
                  </div>

                  {isHttpUrl(booking.delivery_file_url) ? (
                    <a
                      href={booking.delivery_file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.17em] text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-200"
                    >
                      Open final 2D
                      <ArrowUpRight size={14} />
                    </a>
                  ) : (
                    <p className="mt-5 text-sm text-slate-500 dark:text-white/35">
                      No final delivery has been submitted.
                    </p>
                  )}

                  {isHttpUrl(booking.delivery_model_url) && (
                    <>
                      <a
                        href={booking.delivery_model_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 flex w-fit items-center gap-2 text-[9px] font-black uppercase tracking-[0.17em] text-cyan-700 hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-200"
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
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-500 dark:text-white/45">
                      {booking.delivery_message}
                    </p>
                  )}

                  {isHttpUrl(booking.delivery_tryon_image_url) && (
                    <button
                      type="button"
                      onClick={() => openTryOn("final")}
                      disabled={tryOnLoading}
                      className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 text-[9px] font-black uppercase tracking-[0.17em] text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300 dark:hover:bg-violet-400/15"
                    >
                      <Sparkles size={14} />
                      Virtual Try-On
                    </button>
                  )}
                </article>
              </div>
            </section>

            {/* Timeline */}

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-[#0B0B0B] dark:shadow-2xl sm:p-7">
              <div className="border-b border-slate-200 pb-5 dark:border-white/5">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/30">
                  Contract progress
                </p>

                <h2 className="mt-1 font-serif text-2xl font-light">
                  Production Timeline
                </h2>
              </div>

              <div className="relative mt-6 space-y-7 before:absolute before:bottom-4 before:left-[17px] before:top-4 before:w-px before:bg-slate-200 dark:before:bg-white/10">
                {timeline.map((step) => (
                  <div key={step.label} className="relative pl-12">
                    <div
                      className={`absolute left-0 top-0 z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 bg-white dark:bg-[#0B0B0B] ${
                        step.complete
                          ? "border-[#D4AF37] text-[#9B791D] shadow-[0_0_18px_rgba(212,175,55,0.16)] dark:text-[#D4AF37]"
                          : "border-slate-200 text-slate-300 dark:border-white/10 dark:text-white/20"
                      }`}
                    >
                      {step.complete ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-current" />
                      )}
                    </div>

                    <h3
                      className={`text-sm font-semibold ${
                        step.complete
                          ? "text-slate-900 dark:text-white"
                          : "text-slate-400 dark:text-white/30"
                      }`}
                    >
                      {step.label}
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-white/35">
                      {step.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* =====================================================
              Right Sidebar
              ===================================================== */}

          <aside className="space-y-6 xl:sticky xl:top-28 xl:self-start">
            {/* Escrow Ledger */}

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/5 dark:bg-[#0B0B0B] dark:shadow-2xl">
              <div className="border-b border-slate-200 bg-slate-50 p-6 dark:border-white/5 dark:bg-white/[0.025]">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/30">
                  Escrow ledger
                </p>

                <div className="mt-3 flex items-end justify-between gap-4">
                  <h2 className="font-serif text-4xl font-light">
                    {formatCurrency(booking.agreed_price)}
                  </h2>

                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.15em] ${
                      booking.escrow_locked
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"
                        : "border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-white/40"
                    }`}
                  >
                    {booking.escrow_locked ? (
                      <ShieldCheck size={13} />
                    ) : (
                      <LockKeyhole size={13} />
                    )}

                    {escrowLabel}
                  </span>
                </div>
              </div>

              <div className="space-y-4 p-6">
                <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/[0.025]">
                  <CalendarDays
                    size={17}
                    className="mt-0.5 shrink-0 text-[#9B791D] dark:text-[#D4AF37]"
                  />

                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-white/30">
                      Final deadline
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      {formatDate(booking.deadline)}
                    </p>

                    <p className="mt-1 text-xs text-slate-500 dark:text-white/35">
                      {getDeadlineMessage(booking.deadline)}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/[0.025]">
                  <Clock3
                    size={17}
                    className="mt-0.5 shrink-0 text-[#9B791D] dark:text-[#D4AF37]"
                  />

                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-white/30">
                      Preferred start
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      {formatDate(booking.scheduled_at, true)}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/[0.025]">
                  <BadgeDollarSign
                    size={17}
                    className="mt-0.5 shrink-0 text-[#9B791D] dark:text-[#D4AF37]"
                  />

                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-white/30">
                      Contract type
                    </p>

                    <p className="mt-1 text-sm font-semibold capitalize">
                      {booking.booking_type || "commission"}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Designer */}

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-[#0B0B0B] dark:shadow-2xl">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/30">
                Creative partner
              </p>

              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
                  {designerAvatar ? (
                    <img
                      src={designerAvatar}
                      alt={designerName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserRound className="text-slate-400 dark:text-white/30" />
                  )}
                </div>

                <div className="min-w-0">
                  <h2 className="truncate font-serif text-xl">
                    {designerName}
                  </h2>

                  <p className="mt-1 text-[9px] font-black uppercase tracking-[0.17em] text-[#9B791D] dark:text-[#D4AF37]">
                    Assigned designer
                  </p>
                </div>
              </div>
            </section>

            {/* Completed */}

            {status === BOOKING_STATUS.COMPLETED ||
            status === BOOKING_STATUS.DELIVERED ? (
              <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-400/20 dark:bg-emerald-400/10">
                <CheckCircle2 className="text-emerald-700 dark:text-emerald-300" />

                <h2 className="mt-4 font-semibold text-emerald-900 dark:text-emerald-100">
                  Contract settled
                </h2>

                <p className="mt-2 text-sm leading-6 text-emerald-700/80 dark:text-emerald-200/70">
                  The final payout was released. Your 2D and 3D delivery links
                  remain available in the archive.
                </p>

                {booking.creator_reward_awarded_at && (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-white/70 p-4 dark:border-emerald-400/20 dark:bg-black/15">
                    <div className="flex items-center gap-3">
                      <Sparkles
                        size={18}
                        className="shrink-0 text-[#9B791D] dark:text-[#D4AF37]"
                      />

                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.17em] text-emerald-700 dark:text-emerald-300">
                          Creator reward
                        </p>

                        <p className="mt-1 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                          +{Number(booking.creator_reward_points || 0)} points
                          earned from this booking
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            ) : status === BOOKING_STATUS.CANCELLATION_PENDING ? (
              <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 dark:border-rose-400/20 dark:bg-rose-400/10">
                <Loader2 className="animate-spin text-rose-700 dark:text-rose-300" />

                <h2 className="mt-4 font-semibold text-rose-900 dark:text-rose-100">
                  Cancellation processing
                </h2>

                <p className="mt-2 text-sm leading-6 text-rose-700/80 dark:text-rose-200/70">
                  Wait for reconciliation to finish before submitting another
                  action.
                </p>
              </section>
            ) : status !== BOOKING_STATUS.CANCELLED && cancellationAllowed ? (
              <section className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm dark:border-rose-400/15 dark:bg-[#0B0B0B] dark:shadow-2xl">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-rose-600 dark:text-rose-300">
                  Contract management
                </p>

                <h2 className="mt-2 font-serif text-2xl font-light">
                  Need to cancel?
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-white/40">
                  Cancellation may trigger a Stripe refund when escrow was
                  funded.
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
                      placeholder="Explain why this contract should be cancelled..."
                      className="w-full resize-none rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-slate-900 outline-none transition focus:border-rose-400 focus:ring-4 focus:ring-rose-500/10 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-white"
                    />

                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCancellationOpen(false);

                          setCancellationReason("");
                        }}
                        disabled={Boolean(actionName)}
                        className="h-11 rounded-xl border border-slate-200 bg-white text-[9px] font-black uppercase tracking-[0.17em] text-slate-600 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/55"
                      >
                        Keep contract
                      </button>

                      <button
                        type="submit"
                        disabled={
                          Boolean(actionName) || !cancellationReason.trim()
                        }
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-700 text-[9px] font-black uppercase tracking-[0.17em] text-white transition hover:bg-rose-800 disabled:opacity-50"
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
                    className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-[9px] font-black uppercase tracking-[0.17em] text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300 dark:hover:bg-rose-400/15"
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
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-600 transition hover:border-[#D4AF37]/50 hover:text-[#9B791D] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55 dark:hover:text-[#D4AF37]"
          >
            Return to pipeline
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {tryOnOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Virtual Try-On"
        >
          <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/10 bg-white shadow-2xl dark:bg-[#090909]">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 p-5 backdrop-blur-xl dark:border-white/10 dark:bg-[#090909]/95 sm:p-6">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-700 dark:text-violet-300">
                  AI Virtual Try-On
                </p>

                <h2 className="mt-1 font-serif text-2xl font-light text-slate-950 dark:text-white">
                  Preview the{" "}
                  {tryOnPhase === "prototype" ? "prototype" : "final garment"}
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-white/45">
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
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
              >
                <X size={17} />
              </button>
            </div>

            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/5 dark:bg-white/[0.025]">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                    Your photo
                  </p>

                  <label className="mt-4 block cursor-pointer rounded-2xl border border-dashed border-violet-300 bg-violet-50/60 p-5 text-center transition hover:bg-violet-50 dark:border-violet-400/25 dark:bg-violet-400/[0.06] dark:hover:bg-violet-400/10">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleTryOnFileChange}
                      disabled={tryOnLoading}
                      className="sr-only"
                    />

                    <Sparkles className="mx-auto text-violet-700 dark:text-violet-300" />

                    <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                      {tryOnFile
                        ? "Choose a different photo"
                        : "Choose your photo"}
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-white/35">
                      JPEG, PNG or WEBP · maximum 12 MB
                    </p>
                  </label>

                  {tryOnPreviewUrl && (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-black/5 dark:border-white/10 dark:bg-black/30">
                      <img
                        src={tryOnPreviewUrl}
                        alt="Selected Virtual Try-On person"
                        className="max-h-[430px] w-full object-contain"
                      />
                    </div>
                  )}

                  {tryOnError && (
                    <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">
                      <AlertCircle size={17} className="mt-0.5 shrink-0" />

                      <p>{tryOnError}</p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleGenerateTryOn}
                    disabled={tryOnLoading || !tryOnFile}
                    className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 text-[9px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-violet-500 dark:hover:bg-violet-400"
                  >
                    {tryOnLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Sparkles size={16} />
                    )}

                    {tryOnLoading ? "Generating..." : "Generate Virtual Try-On"}
                  </button>

                  <p className="mt-3 text-center text-xs leading-5 text-slate-400 dark:text-white/30">
                    Generation can take several seconds. Keep this window open
                    until the result is ready.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/5 dark:bg-white/[0.025]">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                  Generated result
                </p>

                {tryOnResultImage ? (
                  <>
                    <div className="mt-4 overflow-hidden rounded-2xl border border-violet-200 bg-black/5 dark:border-violet-400/20 dark:bg-black/30">
                      <img
                        src={tryOnResultImage}
                        alt="Generated Virtual Try-On result"
                        className="max-h-[620px] w-full object-contain"
                      />
                    </div>

                    <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
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
                      className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[9px] font-black uppercase tracking-[0.17em] text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
                    >
                      <RefreshCw size={14} />
                      Try another result
                    </button>
                  </>
                ) : (
                  <div className="mt-4 flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-white/10 dark:bg-black/20">
                    {tryOnLoading ? (
                      <Loader2
                        size={34}
                        className="animate-spin text-violet-700 dark:text-violet-300"
                      />
                    ) : (
                      <Sparkles
                        size={34}
                        className="text-violet-700 dark:text-violet-300"
                      />
                    )}

                    <h3 className="mt-4 font-serif text-xl font-light text-slate-900 dark:text-white">
                      {tryOnLoading
                        ? "Creating your preview"
                        : "Your result will appear here"}
                    </h3>

                    <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-white/35">
                      {tryOnLoading
                        ? "FASHN is generating the Virtual Try-On. Please keep this window open."
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
