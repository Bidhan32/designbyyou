"use strict";

/*
=========================================================
DesignByYou
Creator Create Booking
Version 4.5 — Unified Final Price
=========================================================

Responsibilities:

1. Select an available approved designer
2. Create a direct/showcase commission
3. Collect project terms
4. Create an idempotent booking request
5. Present the authoritative backend payment total
6. Confirm Stripe PaymentIntent
7. Reconcile escrow with the backend
8. Surface Creator subscription benefits
9. Explain privacy-safe WhatsApp coordination availability

=========================================================
IMPORTANT SECURITY / FINANCIAL RULES
=========================================================

- AuthContext is the frontend identity source.
- Backend authentication remains authoritative.
- Designer discovery uses the safe P2P directory endpoint.
- client_request_id is reused for the SAME booking attempt.
- Frontend does NOT decide the final Stripe charge.
- Backend response is authoritative for:
    - base amount
    - connection fee
    - total charge
    - fee waiver
- Stripe payment success does NOT directly mutate escrow.
- Backend verification / signed webhook processing owns
  escrow state.
- Creator subscription management lives in Creator Wallet.
- WhatsApp numbers are never exposed from this setup page.
- Private WhatsApp contact remains booking-scoped and is only
  available after the backend confirms an eligible booking state
  and the other participant has enabled contact sharing.
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
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Compass,
  CreditCard,
  FileText,
  Loader2,
  LockKeyhole,
  MessageCircle,
  Video,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import { loadStripe } from "@stripe/stripe-js";

import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { bookingRewardEstimate } from "./bookingRewards";
import API from "../../api/axios";
import useModalFocus from "../../components/useModalFocus";

import { useAuth } from "../../context/AuthContext.helpers.js";

/*=========================================================
Stripe
=========================================================

Canonical frontend environment variable:

VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...

VITE_STRIPE_PUBLIC_KEY is temporarily accepted as a
backward-compatible fallback.

Once every environment has migrated, the old fallback can
be removed.
=========================================================*/



const STRIPE_PUBLISHABLE_KEY = String(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_STRIPE_PUBLIC_KEY ||
    "",
).trim();

const stripePromise = STRIPE_PUBLISHABLE_KEY
  ? loadStripe(STRIPE_PUBLISHABLE_KEY)
  : null;

/*=========================================================
Stripe Card Styling
=========================================================*/

const CARD_ELEMENT_OPTIONS = {
  hidePostalCode: false,

  style: {
    base: {
      fontSize: "16px",

      color: "#f8fafc",

      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",

      "::placeholder": {
        color: "#64748b",
      },

      iconColor: "#D4AF37",
    },

    invalid: {
      color: "#fb7185",

      iconColor: "#fb7185",
    },
  },
};

/*=========================================================
General Helpers
=========================================================*/

function cleanParam(searchParams, key) {
  const value = searchParams.get(key)?.trim();

  if (!value || ["undefined", "null"].includes(value.toLowerCase())) {
    return null;
  }

  return value;
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function parseMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Number(amount.toFixed(2));
}

function formatMoney(value, currency = "usd") {
  const amount = Number(value);

  const safeAmount = Number.isFinite(amount) ? amount : 0;

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
    }).format(safeAmount);
  } catch {
    return `$${safeAmount.toFixed(2)}`;
  }
}

function localDateInput(date = new Date()) {
  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function localDateTimeInput(date = new Date()) {
  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  const hours = String(date.getHours()).padStart(2, "0");

  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function deadlineToIso(value) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  /*
  Deadline represents the END of the selected local date.
  */

  const date = new Date(year, month - 1, day, 23, 59, 59, 999);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateTimeToIso(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function apiError(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function isCancelledRequest(error) {
  return (
    error?.code === "ERR_CANCELED" ||
    error?.name === "CanceledError" ||
    error?.name === "AbortError"
  );
}

function createClientRequestId() {
  const cryptoApi = globalThis.crypto;

  if (!cryptoApi?.getRandomValues) {
    throw new Error(
      "Secure request identity generation is unavailable in this browser.",
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
  ).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

/*=========================================================
Designer Helpers
=========================================================*/

function usersFrom(response) {
  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.data?.data)) {
    return response.data.data;
  }

  if (Array.isArray(response?.data?.users)) {
    return response.data.users;
  }

  if (Array.isArray(response?.data?.designers)) {
    return response.data.designers;
  }

  if (Array.isArray(response?.data?.data?.users)) {
    return response.data.data.users;
  }

  if (Array.isArray(response?.data?.data?.designers)) {
    return response.data.data.designers;
  }

  return [];
}

function designerId(designer) {
  return designer?.id || designer?._id || null;
}

function designerName(designer) {
  return (
    designer?.full_name ||
    designer?.name ||
    designer?.username ||
    "Unnamed Designer"
  );
}

function designerAvatar(designer) {
  return (
    designer?.profile_image_url ||
    designer?.profile_image ||
    designer?.avatar_url ||
    null
  );
}

function approvedDesigner(candidate) {
  if (!candidate || !designerId(candidate)) {
    return false;
  }

  const role = normalize(candidate?.role);

  /*
  The dedicated P2P designer directory is authoritative and
  already returns only booking-eligible Designers.

  Some older deployed API responses did not include `role`,
  so treat a missing role as compatible while still rejecting
  any explicit non-Designer role.
  */

  if (role && role !== "designer") {
    return false;
  }

  const approval = normalize(candidate?.approval_status);

  /*
  Likewise, tolerate an omitted approval_status for backwards
  compatibility, but reject any explicit non-approved state.

  The booking controller performs the authoritative Designer
  eligibility check again when the booking is created.
  */

  return !approval || approval === "approved";
}

/*=========================================================
Subscription Helpers
=========================================================*/

function subscriptionPlanLabel(plan) {
  switch (normalize(plan)) {
    case "monthly":
      return "Monthly Creator";

    case "quarterly":
      return "Quarterly Creator";

    case "yearly":
      return "Yearly Creator";

    default:
      return "Free Creator";
  }
}

/*=========================================================
Checkout Form
=========================================================*/

function CheckoutForm({
  clientSecret,

  bookingId,

  payment,

  billingName,

  billingEmail,

  verifying,

  verificationError,

  onPaymentSuccess,
  paymentNeedsVerification,
  onPaymentAccepted,
  processing,
  setProcessing,
}) {
  const stripe = useStripe();

  const elements = useElements();

  const submitLock = useRef(false);

  const [cardError, setCardError] = useState("");

  const paymentCurrency = payment?.currency || "usd";

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submitLock.current || processing || verifying) return;
    if (paymentNeedsVerification) { await onPaymentSuccess(); return; }
    if (!stripe || !elements) {
      return;
    }

    const card = elements.getElement(CardElement);

    if (!card) {
      setCardError("The secure card field could not be loaded.");

      return;
    }

    submitLock.current = true;
    setProcessing(true);

    setCardError("");

    try {
      const existing = await stripe.retrievePaymentIntent(clientSecret);
      if (existing.error) throw new Error(existing.error.message || "Could not check payment status. Please retry.");
      if (["succeeded", "processing"].includes(existing.paymentIntent?.status)) {
        onPaymentAccepted();
        await onPaymentSuccess();
        return;
      }
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card,

          billing_details: {
            name: billingName || undefined,

            email: billingEmail || undefined,
          },
        },
      });

      if (result.error) {
        setCardError(
          result.error.message || "Stripe could not complete the payment.",
        );

        return;
      }

      if (["succeeded", "processing"].includes(result?.paymentIntent?.status)) onPaymentAccepted();
      if (result?.paymentIntent?.status === "processing") { await onPaymentSuccess(); return; }
      if (result?.paymentIntent?.status !== "succeeded") {
        setCardError(
          `Stripe returned payment status ${
            result?.paymentIntent?.status || "unknown"
          }.`,
        );

        return;
      }

      await onPaymentSuccess(result.paymentIntent);
    } catch (error) {
      setCardError(
        apiError(error, "The Stripe payment connection was interrupted."),
      );
    } finally {
      submitLock.current = false;
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Card */}

      <div>
        <p
          className="mb-2 text-xs font-semibold tracking-normal text-muted"
        >
          Card Details
        </p>

        <div
          className="rounded-md border border-line bg-surface p-4 transition focus-within:border-line focus-within:ring-4 focus-within:ring-action dark:bg-canvas"
        >
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>
      </div>

      {/* Errors */}

      {(cardError || verificationError) && (
        <div
          className="flex items-start gap-3 rounded-md border border-line bg-canvas p-4 text-sm leading-6 text-action dark:bg-subtle"
        >
          <AlertCircle
            size={17}
            className="mt-0.5 shrink-0"
          />

          <p>{verificationError || cardError}</p>
        </div>
      )}

      {/* Authoritative Payment */}

      <div
        className="overflow-hidden rounded-md border border-line bg-canvas dark:bg-subtle"
      >
        <div
          className="flex items-center justify-between gap-4 border-b border-line px-5 py-4"
        >
          <div>
            <p
              className="text-xs font-semibold tracking-normal text-muted"
            >
              Booking Reference
            </p>

            <p
              className="mt-1 font-mono text-xs text-ink dark:text-muted"
            >
              #
              {String(bookingId || "")
                .slice(0, 8)
                .toUpperCase()}
            </p>
          </div>

          <ShieldCheck size={21} className="text-action" />
        </div>

        <div className="px-5 py-5 text-sm">
          <p className="mb-3 text-xs text-muted">Designer price {formatMoney(payment?.baseAmount, paymentCurrency)} · Membership discount {formatMoney(payment?.discount || 0, paymentCurrency)} · Booking fee {formatMoney(payment?.connectionFee, paymentCurrency)}</p>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-normal text-muted">
                Total to pay
              </p>
              <p className="mt-2 text-xs leading-5 text-muted">
                Total amount payable for this booking, including applicable
                charges.
              </p>
            </div>
            <strong className="shrink-0 font-mono text-2xl text-action">
              {formatMoney(payment?.totalCharged, paymentCurrency)}
            </strong>
          </div>
        </div>
      </div>

      {/* Payment Button */}

      <button
        type="submit"
        disabled={(!paymentNeedsVerification && (!stripe || !elements)) || processing || verifying}
        className="flex h-[54px] w-full items-center justify-center gap-2 rounded-md bg-action px-5 text-xs font-semibold tracking-normal text-on-action transition hover:bg-action disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted hover:text-on-action"
      >
        {processing || verifying ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <LockKeyhole size={15} />
        )}

        {verifying
          ? "Securing Payment"
          : processing
            ? "Processing Stripe Payment"
            : paymentNeedsVerification ? "Check payment confirmation" : `Pay ${formatMoney(payment?.totalCharged, paymentCurrency)}`}
      </button>

      <p
        className="text-center text-xs leading-5 text-muted"
      >
        Stripe processes the card payment. Designer payment remains governed by
        the booking workflow and final approval.
      </p>
    </form>
  );
}

/*=========================================================
Creator Create Booking
=========================================================*/

export default function CreatorCreateBooking() {
  const [searchParams, setSearchParams] = useSearchParams();
  const resumeBookingId = cleanParam(searchParams, "booking_id");

  const navigate = useNavigate();

  const { user } = useAuth();

  /*=======================================================
  URL Context
  =======================================================*/

  const draftId = cleanParam(searchParams, "tool_draft");
  const toolReference = useMemo(() => {
    if (!draftId || !user?.id) return null;
    try {
      const draft = JSON.parse(sessionStorage.getItem("booking-tool:" + user.id));
      return draft?.id === draftId ? draft.reference : null;
    } catch { return null; }
  }, [draftId, user?.id]);

  const designerIdFromUrl = cleanParam(searchParams, "designer_id");

  const designIdFromUrl = cleanParam(searchParams, "design_id");

  const designLabel = cleanParam(searchParams, "design_title") || `Design #${designIdFromUrl?.slice(0, 8)}`;

  const budgetFromUrl = parseMoney(cleanParam(searchParams, "budget"));

  const directMode = Boolean(designerIdFromUrl);

  /*=======================================================
  Designer State
  =======================================================*/

  const [designers, setDesigners] = useState([]);

  const [loadingDesigners, setLoadingDesigners] = useState(true);

  const [designerError, setDesignerError] = useState("");

  const [designerRefreshKey, setDesignerRefreshKey] = useState(0);

  const [query, setQuery] = useState("");

  const [selectedDesigner, setSelectedDesigner] = useState(null);

  /*=======================================================
  Subscription State
  =======================================================*/

  const [subscription, setSubscription] = useState(null);

  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  const [subscriptionError, setSubscriptionError] = useState("");

  /*=======================================================
  Booking Form
  =======================================================*/

  const [agreedPrice, setAgreedPrice] = useState(
    budgetFromUrl ? String(budgetFromUrl) : "",
  );

  const [deadline, setDeadline] = useState("");

  const [scheduledAt, setScheduledAt] = useState("");

  const [brief, setBrief] = useState("");

  const [formError, setFormError] = useState("");

  const [submitting, setSubmitting] = useState(false);

  /*=======================================================
  Persistent Booking Request Identity

  One UUID represents ONE logical booking creation attempt.

  It survives component re-renders and is reused for safe
  retries of the same booking request.
  =======================================================*/

  const clientRequestIdRef = useRef(null);

  if (!clientRequestIdRef.current) {
    clientRequestIdRef.current = createClientRequestId();
  }

  /*=======================================================
  Created Booking / Stripe
  =======================================================*/

  const [createdBooking, setCreatedBooking] = useState(null);

  const [clientSecret, setClientSecret] = useState("");

  const [payment, setPayment] = useState(null);

  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [verifying, setVerifying] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentNeedsVerification, setPaymentNeedsVerification] = useState(false);
  const createLock = useRef(false);
  const verifyLock = useRef(false);
  const checkoutRef = useModalFocus(checkoutOpen && Boolean(createdBooking && clientSecret && payment), () => setCheckoutOpen(false), !verifying && !paymentProcessing);

  const [verificationError, setVerificationError] = useState("");

  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!resumeBookingId || createdBooking?.id === resumeBookingId) return;
    const controller = new AbortController();
    API.get(`/p2p-bookings/${encodeURIComponent(resumeBookingId)}/payment`, { signal: controller.signal }).then(response => {
      if (controller.signal.aborted) return;
      const data = response.data;
      setCreatedBooking(data.booking);
      setClientSecret(data.clientSecret || "");
      setPayment(data.payment);
      setPaymentNeedsVerification(["succeeded", "processing"].includes(data.paymentIntentStatus));
      setAgreedPrice(String(data.booking.agreed_price));
      setBrief(data.booking.brief_text || "");
      setDeadline(data.booking.deadline ? localDateInput(new Date(data.booking.deadline)) : "");
      setSelectedDesigner({ id: data.booking.designer_id, full_name: data.designerName || "Your selected designer" });
      if (data.booking.escrow_locked) setSuccess(true);
      else setCheckoutOpen(true);
    }).catch(error => {
      if (!controller.signal.aborted) setFormError(apiError(error, "Could not resume this booking. Open it from My bookings and try again."));
    });
    return () => controller.abort();
  }, [resumeBookingId, createdBooking?.id]);

  /*=======================================================
  Date Minimums
  =======================================================*/

  const minimumDeadline = localDateInput();

  const minimumSchedule = localDateTimeInput(
    new Date(Date.now() + 30 * 60 * 1000),
  );

  /*=======================================================
  Subscription Status

  Use the same authoritative subscription API as
  CreatorWallet rather than trusting a possibly stale user
  object.
  =======================================================*/

  useEffect(() => {
    const controller = new AbortController();

    const loadSubscription = async () => {
      setSubscriptionLoading(true);

      setSubscriptionError("");

      try {
        const response = await API.get("/subscription/status", {
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        setSubscription(response?.data?.data || null);
      } catch (error) {
        if (isCancelledRequest(error)) {
          return;
        }

        if (import.meta.env.DEV) {
          console.error(
            "Creator subscription status failed:",
            error?.response?.data || error,
          );
        }

        setSubscriptionError(
          apiError(error, "Membership status could not be loaded."),
        );
      } finally {
        if (!controller.signal.aborted) {
          setSubscriptionLoading(false);
        }
      }
    };

    void loadSubscription();

    return () => {
      controller.abort();
    };
  }, []);

  const subscribed = Boolean(subscription?.is_active);

  /*=======================================================
  Load Safe Designer Directory

  Uses:

  GET /api/v1/p2p-bookings/designers

  instead of the broad generic /users endpoint.

  Backend already restricts the endpoint to Creators and
  returns approved Designers using safe public fields.
  =======================================================*/

  useEffect(() => {
    const controller = new AbortController();

    const loadDesigners = async () => {
      setLoadingDesigners(true);

      setDesignerError("");

      try {
        if (
          designerIdFromUrl &&
          user?.id &&
          String(designerIdFromUrl) === String(user.id)
        ) {
          setSelectedDesigner(null);

          setDesignerError(
            "You cannot create a booking with your own account.",
          );

          return;
        }

        const response = await API.get("/p2p-bookings/designers", {
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        /*
          The backend endpoint already limits results to
          approved Designers.

          Frontend filtering remains defensive only.
          */

        const available = usersFrom(response)
          .filter(approvedDesigner)
          .filter(
            (candidate) =>
              !user?.id || String(designerId(candidate)) !== String(user.id),
          );

        setDesigners(available);

        if (designerIdFromUrl) {
          const match = available.find(
            (candidate) =>
              String(designerId(candidate)) === String(designerIdFromUrl),
          );

          if (match) {
            setSelectedDesigner(match);
          } else {
            setSelectedDesigner(null);

            setDesignerError(
              "The selected designer could not be found or is not currently available for booking.",
            );
          }
        }
      } catch (error) {
        if (isCancelledRequest(error)) {
          return;
        }

        if (import.meta.env.DEV) {
          console.error(
            "Designer directory request failed:",
            error?.response?.data || error,
          );
        }

        setDesignerError(
          apiError(error, "The designer directory could not be loaded."),
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDesigners(false);
        }
      }
    };

    void loadDesigners();

    return () => {
      controller.abort();
    };
  }, [designerIdFromUrl, designerRefreshKey, user?.id]);

  /*=======================================================
  Filter Designers

  Email is deliberately NOT used as searchable/public
  Creator-facing directory information.
  =======================================================*/

  const filteredDesigners = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) {
      return designers;
    }

    return designers.filter((designer) =>
      [
        designerName(designer),

        designer?.city,

        designer?.country,

        designer?.tier,

        designer?.bio,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [designers, query]);

  /*=======================================================
  Payment Preview
  =======================================================*/

  const baseAmount = parseMoney(agreedPrice) || 0;
  const rewardEstimate = bookingRewardEstimate(baseAmount);

  /*=======================================================
  Validation
  =======================================================*/

  const validate = () => {
    if (draftId && !toolReference) return "Return to the tool result and attach the reference again.";
    if (!selectedDesigner || !designerId(selectedDesigner)) {
      return "Select a valid designer.";
    }

    if (user?.id && String(designerId(selectedDesigner)) === String(user.id)) {
      return "You cannot create a commission with your own account.";
    }

    if (!baseAmount) {
      return "Enter an agreed project value greater than zero.";
    }

    if (brief.trim().length < 20) {
      return "Provide a project brief containing at least 20 characters.";
    }

    const deadlineIso = deadlineToIso(deadline);

    if (!deadlineIso || new Date(deadlineIso).getTime() <= Date.now()) {
      return "Select a valid future project deadline.";
    }

    if (scheduledAt) {
      const scheduleIso = dateTimeToIso(scheduledAt);

      if (!scheduleIso || new Date(scheduleIso).getTime() <= Date.now()) {
        return "Select a valid future preferred start time.";
      }

      if (new Date(scheduleIso).getTime() >= new Date(deadlineIso).getTime()) {
        return "The preferred start time must be earlier than the final deadline.";
      }
    }

    if (!STRIPE_PUBLISHABLE_KEY) {
      return "Stripe card payments are not configured. Add VITE_STRIPE_PUBLISHABLE_KEY to the frontend environment.";
    }

    return "";
  };

  /*=======================================================
  Create Booking
  =======================================================*/

  const createBooking = async (event) => {
    event.preventDefault();
    if (createLock.current || submitting || (resumeBookingId && !createdBooking)) return;

    /*
      Once a durable booking has been created, never create
      another booking from the same form.

      Reopen the existing payment instead.
      */

    if (createdBooking) {
      setCheckoutOpen(true);

      return;
    }

    const validationError = validate();

    if (validationError) {
      setFormError(validationError);

      return;
    }

    createLock.current = true;
    setSubmitting(true);

    setFormError("");

    setVerificationError("");

    try {
      const response = await API.post("/p2p-bookings/create", {
        client_request_id: clientRequestIdRef.current,

        receiver_id: designerId(selectedDesigner),

        design_id: designIdFromUrl || null,

        tool_reference: toolReference,
        brief_text: brief.trim(),

        agreed_price: baseAmount,

        deadline: deadlineToIso(deadline),

        scheduled_at: scheduledAt ? dateTimeToIso(scheduledAt) : null,

        /*
              Backend database still uses "marketplace" as
              the legacy booking-origin value for bookings
              initiated from published showcase designs.

              Creator-facing UI calls this:

              Showcase Commission
              */

        booking_type: designIdFromUrl ? "marketplace" : "commission",
      });

      const booking = response?.data?.booking;

      const secret = response?.data?.clientSecret;

      const authoritativePayment = response?.data?.payment;

      if (!booking?.id || !secret || !authoritativePayment) {
        throw new Error(
          "The server did not return the complete booking payment context.",
        );
      }

      setCreatedBooking(booking);
      if (toolReference) sessionStorage.removeItem("booking-tool:" + user.id);
      setPaymentNeedsVerification(["succeeded", "processing"].includes(response.data.paymentIntentStatus));
      setSearchParams(previous => { const next = new URLSearchParams(previous); next.set("booking_id", booking.id); next.delete("tool_draft"); return next; }, { replace: true });

      setClientSecret(secret);

      setPayment({
        currency: authoritativePayment?.currency || "usd",

        discount: Number(authoritativePayment.discount || 0),
        baseAmount: Number(authoritativePayment?.baseAmount ?? baseAmount),

        connectionFee: Number(authoritativePayment?.connectionFee ?? 0),

        totalCharged: Number(authoritativePayment?.totalCharged ?? 0),

        connectionFeeWaived: Boolean(authoritativePayment?.connectionFeeWaived),
      });

      setCheckoutOpen(true);
    } catch (requestError) {
      if (import.meta.env.DEV) {
        console.error(
          "Booking creation failed:",
          requestError?.response?.data || requestError,
        );
      }

      const code = requestError?.response?.data?.code;

      if (code === "CLIENT_REQUEST_ID_REUSED") {
        setFormError(
          "This booking request was already used with different booking details. Refresh the page before starting a different booking.",
        );
      } else if (code === "PAYMENT_INTENT_ALREADY_CANCELLED") {
        setFormError(
          "The Stripe payment for this booking attempt was already cancelled. Refresh the page before starting a new booking attempt.",
        );
      } else {
        setFormError(
          apiError(requestError, "The booking could not be created."),
        );
      }
    } finally {
      createLock.current = false;
      setSubmitting(false);
    }
  };

  /*=======================================================
  Verify Secured Payment

  This reconciliation endpoint remains safe to retry after
  Stripe succeeds.
  =======================================================*/

  const verifyEscrow = useCallback(async () => {
    if (verifyLock.current || !createdBooking?.id) {
      return;
    }

    verifyLock.current = true;
    setVerifying(true);

    setVerificationError("");

    try {
      const response = await API.post("/p2p-bookings/verify-escrow", {
        bookingId: createdBooking.id,
      });

      if (response?.data?.status !== "success") {
        throw new Error("Payment confirmation did not complete.");
      }

      setCheckoutOpen(false);

      setSuccess(true);

      /*
          A future booking attempt requires a new UUID.

          The completed booking itself permanently keeps its
          original request identity in the backend.
          */

      clientRequestIdRef.current = createClientRequestId();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error(
          "Payment confirmation failed:",
          error?.response?.data || error,
        );
      }

      setVerificationError(
        apiError(
          error,
          "Stripe accepted the payment, but the booking payment has not been confirmed yet. Retry payment confirmation using this same booking.",
        ),
      );
    } finally {
      verifyLock.current = false;
      setVerifying(false);
    }
  }, [createdBooking?.id]);

  /*=======================================================
  Success Screen
  =======================================================*/

  if (success && createdBooking) {
    return (
      <div
        className="relative flex min-h-[calc(100vh-5rem)] items-center justify-center overflow-hidden bg-canvas px-4 py-14 text-ink"
      >
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-subtle blur-[170px]"
        />

        <section
          className="relative z-10 w-full max-w-xl overflow-hidden rounded-md border border-line bg-surface p-4 text-center sm:p-4"
        >
          <div
            className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-subtle blur-[70px]"
          />

          <div
            className="relative mx-auto grid h-20 w-20 place-items-center rounded-md border border-line bg-canvas text-action dark:bg-subtle"
          >
            <ShieldCheck size={35} />
          </div>

          <p
            className="relative mt-7 text-xs font-semibold tracking-normal text-action"
          >
            Payment confirmed
          </p>

          <h1
            className="relative mt-3 font-semibold text-3xl sm:text-4xl"
          >
            Payment{" "}
            <span
              className="italic text-action"
            >
              confirmed.
            </span>
          </h1>

          <p
            className="relative mx-auto mt-4 max-w-md text-sm leading-7 text-muted"
          >
            Your payment is confirmed. Open your booking to follow the next steps.
          </p>

          <div
            className="relative mt-8 overflow-hidden rounded-md border border-line bg-canvas text-left dark:bg-subtle"
          >
            <div
              className="flex justify-between gap-4 border-b border-line p-4 text-xs"
            >
              <span
                className="text-muted"
              >
                Booking
              </span>

              <span
                className="font-mono text-ink dark:text-muted"
              >
                #{String(createdBooking.id).slice(0, 8).toUpperCase()}
              </span>
            </div>

            <div
              className="flex justify-between gap-4 p-4"
            >
              <span
                className="text-xs text-muted"
              >
                Total to pay
              </span>

              <strong
                className="font-mono text-lg text-action"
              >
                {formatMoney(payment?.totalCharged, payment?.currency)}
              </strong>
            </div>
          </div>

          <div
            className="relative mt-5 rounded-md border border-line bg-subtle p-4 text-left"
          >
            <div className="flex items-start gap-3">
              <MessageCircle
                size={17}
                className="mt-0.5 shrink-0 text-action"
              />

              <div>
                <p
                  className="text-xs font-semibold tracking-normal text-action"
                >
                  WhatsApp Coordination
                </p>

                <p
                  className="mt-1 text-xs leading-5 text-muted"
                >
                  WhatsApp remains private until the Designer accepts the
                  booking and contact-sharing rules are satisfied. Open the
                  booking workspace when the booking becomes eligible.
                </p>
              </div>
            </div>
          </div>

          <div
            className="relative mt-8 grid gap-3 sm:grid-cols-2"
          >
            <button
              type="button"
              onClick={() => navigate("/creator/bookings")}
              className="h-9 rounded-md border border-line bg-surface text-xs font-semibold tracking-normal text-muted transition hover:border-line hover:text-action dark:bg-subtle"
            >
              View bookings
            </button>

            <button
              type="button"
              onClick={() => navigate(`/creator/bookings/${createdBooking.id}`)}
              className="flex h-9 items-center justify-center gap-2 rounded-md bg-action text-xs font-semibold tracking-normal text-on-action transition hover:bg-action hover:text-on-action"
            >
              Open Booking
              <ArrowRight size={14} />
            </button>
          </div>
        </section>
      </div>
    );
  }

  /*=======================================================
  Main Page
  =======================================================*/

  return (
    <>
      <div
        className="relative min-h-screen overflow-hidden bg-canvas pb-24 text-ink"
      >
        {/*===============================================
        Ambient Background
        ===============================================*/}

        <div
          className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        >


        </div>

        <div
          className="relative z-10 mx-auto max-w-[1450px] px-4 pt-3 sm:px-6 lg:px-10 lg:pt-6"
        >
          {/*=============================================
          Hero
          =============================================*/}

          <header className="mb-4 rounded-md border border-line bg-surface p-4">
            <button type="button" onClick={() => directMode && window.history.state?.idx > 0 ? navigate(-1) : navigate(designIdFromUrl ? "/creator/showcase" : directMode ? "/creator/directory" : "/creator/bookings")} className="mb-2 inline-flex h-8 items-center gap-2 text-sm text-muted hover:text-ink">
              <ArrowLeft size={16} /> {directMode ? "Back to discovery" : "Back to bookings"}
            </button>
            <h1 className="break-words text-2xl font-semibold">{designIdFromUrl ? designLabel : "Book a designer"}</h1>
            {designIdFromUrl && <p className="mt-1 text-sm text-muted" aria-live="polite">
              {selectedDesigner ? "Booking with " + designerName(selectedDesigner) : loadingDesigners ? "Loading designer" : designerError}
            </p>}
            {designIdFromUrl && designerError && !selectedDesigner && <button type="button" className="mt-2 h-8 rounded-md border border-line px-3 text-sm" onClick={() => setDesignerRefreshKey(value => value + 1)}>Retry designer lookup</button>}
            {!directMode && <p className="mt-1 text-sm text-muted">Choose a designer, then enter your project details.</p>}
            {toolReference && <section className="mt-4"><h2 className="text-sm font-semibold">{toolReference.tool} reference for your designer</h2>
              <div className="mt-2 flex flex-wrap gap-2">{toolReference.images.map(image => <figure key={image.label}>
                <img src={image.src} alt={image.label} className="h-24 max-w-36 rounded object-contain" /><figcaption className="text-xs">{image.label}</figcaption>
              </figure>)}</div></section>}
            {draftId && !toolReference && <p role="alert">This reference is unavailable. Return to the tool result and attach it again.</p>}
          </header>

          {/*=============================================
          Workspace
          =============================================*/}

          <div
            className={`
              grid gap-7

              ${
                directMode
                  ? "mx-auto max-w-5xl"
                  : "xl:grid-cols-[360px_minmax(0,1fr)]"
              }
            `}
          >
            {/*===========================================
            Designer Directory
            ===========================================*/}

            {!directMode && (
              <aside
                className="flex max-h-[780px] min-h-[600px] flex-col overflow-hidden rounded-md border border-line bg-subtle"
              >
                <div
                  className="border-b border-line p-4"
                >
                  <div
                    className="flex items-start justify-between gap-4"
                  >
                    <div>
                      <p
                        className="text-xs font-semibold tracking-normal text-action"
                      >
                        Step 01
                      </p>

                      <h2
                        className="mt-2 font-sans text-2xl"
                      >
                        Choose a designer
                      </h2>
                    </div>

                    <UserRound
                      size={21}
                      className="text-muted"
                    />
                  </div>

                  <label
                    className="relative mt-5 block"
                  >
                    <span className="sr-only">Search designers</span>

                    <Search
                      size={15}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
                    />

                    <input
                      type="search"
                      value={query}
                      maxLength={100}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search designers"
                      className="h-11 w-full rounded-md border border-line bg-canvas pl-11 pr-10 text-sm text-ink caret-slate-900 outline-none transition placeholder:text-muted focus:border-line focus:bg-surface focus:ring-4 focus:ring-action [color-scheme:light] dark:bg-surface dark:caret-white dark:[color-scheme:dark]"
                    />

                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label="Clear designer search"
                        className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted transition hover:bg-subtle hover:text-ink"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </label>
                </div>

                <div
                  className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4"
                >
                  {loadingDesigners ? (
                    <div
                      className="flex min-h-80 flex-col items-center justify-center gap-3 text-action"
                    >
                      <Loader2 size={24} className="animate-spin" />

                      <p
                        className="text-xs font-semibold tracking-normal"
                      >
                        Loading designers
                      </p>
                    </div>
                  ) : designerError ? (
                    <div
                      className="rounded-md border border-line bg-canvas p-4 dark:bg-subtle"
                    >
                      <div
                        className="flex items-start gap-3 text-sm leading-6 text-action"
                      >
                        <AlertCircle
                          size={17}
                          className="mt-0.5 shrink-0"
                        />

                        <p>{designerError}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setDesignerRefreshKey((value) => value + 1)
                        }
                        className="mt-4 inline-flex items-center gap-2 text-xs font-semibold tracking-normal text-action"
                      >
                        <RefreshCw size={12} />
                        Retry
                      </button>
                    </div>
                  ) : filteredDesigners.length === 0 ? (
                    <div
                      className="flex min-h-80 flex-col items-center justify-center rounded-md border border-dashed border-line p-4 text-center"
                    >
                      <UserRound
                        size={29}
                        className="text-muted"
                      />

                      <p
                        className="mt-4 font-serif text-xl"
                      >
                        No designers found
                      </p>

                      <p
                        className="mt-2 text-xs leading-5 text-muted"
                      >
                        {query
                          ? "Try another designer name, country, or tier."
                          : "No approved and verified designers are currently available for booking."}
                      </p>
                    </div>
                  ) : (
                    filteredDesigners.map((candidate) => {
                      const id = designerId(candidate);

                      const selected =
                        String(designerId(selectedDesigner)) === String(id);

                      const avatar = designerAvatar(candidate);

                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={Boolean(createdBooking)}
                          onClick={() => {
                            setSelectedDesigner(candidate);

                            setFormError("");
                          }}
                          className={`
                              group flex w-full items-center gap-3 rounded-md border p-3.5 text-left transition duration-200 disabled:cursor-not-allowed disabled:opacity-50

                              ${
                                selected
                                  ? "border-line bg-subtle"
                                  : "border-line bg-subtle hover:border-line hover:bg-surface dark:hover:bg-subtle"
                              }
                            `}
                        >
                          <div
                            className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface font-serif text-lg text-muted dark:bg-subtle"
                          >
                            {avatar ? (
                              <img
                                src={avatar}
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              designerName(candidate).charAt(0).toUpperCase()
                            )}
                          </div>

                          <div
                            className="min-w-0 flex-1"
                          >
                            <p
                              className="truncate font-serif text-base text-ink"
                            >
                              {designerName(candidate)}
                            </p>

                            <div
                              className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold tracking-normal text-muted"
                            >
                              <span>Designer</span>

                              {candidate?.tier && (
                                <>
                                  <span>•</span>

                                  <span
                                    className="text-action"
                                  >
                                    {candidate.tier}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div
                            className={`
                                grid h-6 w-6 shrink-0 place-items-center rounded-full border transition

                                ${
                                  selected
                                    ? "border-line bg-action text-on-action"
                                    : "border-line text-transparent"
                                }
                              `}
                          >
                            <CheckCircle2 size={13} />
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div
                  className="border-t border-line p-4"
                >
                  <Link
                    to="/creator/directory"
                    className="flex items-center justify-center gap-2 rounded-md border border-line bg-canvas py-3 text-xs font-semibold tracking-normal text-muted transition hover:border-line hover:text-action dark:bg-subtle"
                  >
                    Explore Full Directory
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </aside>
            )}

            {/*===========================================
            Booking Form
            ===========================================*/}

            <section
              className="overflow-hidden rounded-md border border-line bg-subtle"
            >
              <form
                onSubmit={createBooking}
                className="p-4 lg:p-4"
              >
                {/* Form Heading */}

                <div
                  className="flex flex-col gap-5 border-b border-line pb-7 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div>
                    <h2
                      className="text-xl font-semibold"
                    >
                      Project details
                    </h2>

                    <p
                      className="mt-3 max-w-xl text-sm leading-6 text-muted"
                    >
                      Enter the price agreed with your designer, your deadline, and what you need.
                    </p>
                  </div>

                  <div
                    className={`
                      inline-flex w-fit items-center gap-2 rounded-md border px-4 py-2 text-xs font-semibold tracking-normal

                      ${
                        subscribed
                          ? "border-line bg-subtle text-action"
                          : "border-line bg-canvas text-muted dark:bg-subtle"
                      }
                    `}
                  >
                    {subscriptionLoading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Sparkles size={12} />
                    )}

                    {subscriptionLoading
                      ? "Checking membership"
                      : subscribed
                        ? `${subscriptionPlanLabel(
                            subscription?.plan,
                          )} • Membership active`
                        : "Pay-as-you-go"}
                  </div>
                </div>

                {subscriptionError && (
                  <div
                    className="mt-6 flex items-start gap-3 rounded-md border border-line bg-canvas p-4 text-xs leading-5 text-action dark:bg-subtle"
                  >
                    <AlertCircle
                      size={15}
                      className="mt-0.5 shrink-0"
                    />

                    <div>
                      <p>{subscriptionError}</p>

                      <p
                        className="mt-1 opacity-75"
                      >
                        You can review the total before paying.
                      </p>
                    </div>
                  </div>
                )}

                {formError && (
                  <div
                    role="alert"
                    className="mt-6 flex items-start gap-3 rounded-md border border-line bg-canvas p-4 text-sm leading-6 text-action dark:bg-subtle"
                  >
                    <AlertCircle
                      size={17}
                      className="mt-0.5 shrink-0"
                    />

                    <p>{formError}</p>
                  </div>
                )}

                {createdBooking && (
                  <div
                    className="mt-6 flex flex-col gap-4 rounded-md border border-line bg-canvas p-4 sm:flex-row sm:items-center sm:justify-between dark:bg-subtle"
                  >
                    <div
                      className="flex items-start gap-3"
                    >
                      <Clock3
                        size={18}
                        className="mt-0.5 shrink-0 text-action"
                      />

                      <div>
                        <h3
                          className="font-semibold text-action"
                        >
                          Booking created — payment pending
                        </h3>

                        <p
                          className="mt-1 text-xs leading-5 text-muted"
                        >
                          Booking #
                          {String(createdBooking.id).slice(0, 8).toUpperCase()}{" "}
                          already exists. Continue that Stripe payment instead
                          of creating another booking.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setCheckoutOpen(true)}
                      className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-action px-4 text-xs font-semibold tracking-normal text-on-action"
                    >
                      <CreditCard size={13} />
                      Continue Payment
                    </button>
                  </div>
                )}

                {/* Fields */}

                <div
                  className="mt-7 space-y-7"
                >
                  {/* Direct Showcase bookings identify the designer in the heading. */}
                  {!designIdFromUrl && (

                  <div
                    className="relative overflow-hidden rounded-md border border-line bg-canvas p-4 dark:bg-subtle"
                  >
                    <div
                      className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-subtle blur-[50px]"
                    />

                    <div
                      className="relative flex items-center justify-between gap-4"
                    >
                      <div>
                        <p
                          className="text-xs font-semibold tracking-normal text-muted"
                        >
                          Selected Designer
                        </p>

                        {loadingDesigners && directMode ? (
                          <div
                            className="mt-3 flex items-center gap-2 text-sm text-action"
                          >
                            <Loader2 size={15} className="animate-spin" />
                            Loading designer
                          </div>
                        ) : selectedDesigner ? (
                          <div
                            className="mt-3 flex min-w-0 items-center gap-3"
                          >
                            <div
                              className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-subtle font-serif text-lg text-action"
                            >
                              {designerAvatar(selectedDesigner) ? (
                                <img
                                  src={designerAvatar(selectedDesigner)}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                designerName(selectedDesigner)
                                  .charAt(0)
                                  .toUpperCase()
                              )}
                            </div>

                            <div className="min-w-0">
                              <h3
                                className="truncate font-serif text-xl text-ink sm:text-2xl"
                              >
                                {designerName(selectedDesigner)}
                              </h3>

                              <p
                                className="mt-1 text-xs font-semibold tracking-normal text-action"
                              >
                                {designIdFromUrl
                                  ? "Showcase booking"
                                  : "Direct booking"}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p
                            className="mt-3 text-sm text-muted"
                          >
                            {designerError || "Select a designer to continue."}
                          </p>
                        )}
                      </div>

                      {selectedDesigner && (
                        <CheckCircle2
                          size={22}
                          className="shrink-0 text-action"
                        />
                      )}
                    </div>
                  </div>
                  )}

                  {/*=================================================
                  Private WhatsApp Coordination

                  Informational only.

                  This page never receives or exposes the Designer's
                  WhatsApp number. Actual contact access remains behind
                  the private booking-specific endpoint and is available
                  only after the booking reaches an eligible accepted
                  state and the Designer has enabled contact sharing.
                  =================================================*/}

                  {selectedDesigner && (
                    <p className="mt-4 text-sm leading-6 text-muted">Contact options appear in your booking after the designer accepts, when they have enabled contact sharing.</p>
                  )}

                  {/* Amount + Deadline */}

                  <div
                    className="grid gap-5 md:grid-cols-2"
                  >
                    <label className="block">
                      <span
                        className="mb-2.5 flex items-center gap-2 text-xs font-semibold tracking-normal text-muted"
                      >
                        <BadgeDollarSign
                          size={13}
                          className="text-action"
                        />
                        Agreed price
                      </span>

                      <div className="relative">
                        <span
                          className="absolute left-4 top-1/2 -translate-y-1/2 font-serif text-lg text-action"
                        >
                          $
                        </span>

                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          inputMode="decimal"
                          required
                          disabled={
                            !selectedDesigner || Boolean(createdBooking)
                          }
                          value={agreedPrice}
                          onChange={(event) => {
                            setAgreedPrice(event.target.value);

                            setFormError("");
                          }}
                          placeholder="500.00"
                          className="h-[54px] w-full rounded-md border border-line bg-canvas pl-10 pr-4 text-sm outline-none transition focus:border-line focus:bg-surface focus:ring-4 focus:ring-action disabled:cursor-not-allowed disabled:opacity-50 dark:bg-subtle dark:text-ink dark:focus:bg-subtle"
                        />
                      </div>

                      {budgetFromUrl && !createdBooking && (
                        <p
                          className="mt-2 text-xs leading-4 text-muted"
                        >
                          Pre-filled from the designer's indicative booking
                          starting budget. You may adjust it before creating the
                          booking.
                        </p>
                      )}
                    </label>

                    <label className="block">
                      <span
                        className="mb-2.5 flex items-center gap-2 text-xs font-semibold tracking-normal text-muted"
                      >
                        <CalendarDays
                          size={13}
                          className="text-action"
                        />
                        Deadline
                      </span>

                      <input
                        type="date"
                        min={minimumDeadline}
                        required
                        disabled={!selectedDesigner || Boolean(createdBooking)}
                        value={deadline}
                        onChange={(event) => {
                          setDeadline(event.target.value);

                          setFormError("");
                        }}
                        className="h-[54px] w-full rounded-md border border-line bg-canvas px-4 text-sm outline-none transition focus:border-line focus:bg-surface focus:ring-4 focus:ring-action disabled:cursor-not-allowed disabled:opacity-50 dark:bg-subtle dark:text-ink dark:[color-scheme:dark] dark:focus:bg-subtle"
                      />
                    </label>
                  </div>

                  {/* Schedule */}

                  <label className="block">
                    <span
                      className="mb-2.5 flex flex-wrap items-center gap-2 text-xs font-semibold tracking-normal text-muted"
                    >
                      <Clock3
                        size={13}
                        className="text-action"
                      />
                      Preferred start time
                      <span
                        className="rounded-md bg-subtle px-2 py-0.5 text-xs tracking-normal text-muted"
                      >
                        Optional
                      </span>
                    </span>

                    <input
                      type="datetime-local"
                      min={minimumSchedule}
                      disabled={!selectedDesigner || Boolean(createdBooking)}
                      value={scheduledAt}
                      onChange={(event) => {
                        setScheduledAt(event.target.value);

                        setFormError("");
                      }}
                      className="h-[54px] w-full rounded-md border border-line bg-canvas px-4 text-sm outline-none transition focus:border-line focus:bg-surface focus:ring-4 focus:ring-action disabled:cursor-not-allowed disabled:opacity-50 dark:bg-subtle dark:text-ink dark:[color-scheme:dark] dark:focus:bg-subtle"
                    />

                    <p
                      className="mt-2 text-xs text-muted"
                    >
                      Availability is checked when you continue.
                    </p>
                  </label>

                  {/* Brief */}

                  <label className="block">
                    <span
                      className="mb-2.5 flex items-center justify-between gap-4 text-xs font-semibold tracking-normal text-muted"
                    >
                      <span
                        className="flex items-center gap-2"
                      >
                        <FileText
                          size={13}
                          className="text-action"
                        />
                        What would you like designed?
                      </span>

                      <span
                        className="font-mono text-xs text-muted"
                      >
                        {brief.length}
                        /20,000
                      </span>
                    </span>

                    <textarea
                      required
                      rows={7}
                      minLength={20}
                      maxLength={20000}
                      disabled={!selectedDesigner || Boolean(createdBooking)}
                      value={brief}
                      onChange={(event) => {
                        setBrief(event.target.value);

                        setFormError("");
                      }}
                      placeholder="Describe the concept, style direction, intended use, deliverables, dimensions, references, technical requirements and anything the designer should know..."
                      className="w-full resize-none rounded-md border border-line bg-canvas p-4 text-sm leading-7 outline-none transition focus:border-line focus:bg-surface focus:ring-4 focus:ring-action disabled:cursor-not-allowed disabled:opacity-50 dark:bg-subtle dark:text-ink dark:placeholder:text-muted dark:focus:bg-subtle"
                    />

                    <div
                      className="mt-2 flex items-center justify-between gap-4"
                    >
                      <p
                        className={`
                          text-xs

                          ${
                            brief.length > 0 && brief.trim().length < 20
                              ? "text-action"
                              : "text-muted"
                          }
                        `}
                      >
                        Minimum 20 characters.
                      </p>

                      {brief.trim().length >= 20 && (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-semibold tracking-normal text-action"
                        >
                          <CheckCircle2 size={10} />
                          Ready
                        </span>
                      )}
                    </div>
                  </label>

                  {/* Payment Preview */}

                  <section
                    className="relative overflow-hidden rounded-md border border-line bg-canvas p-4 dark:bg-subtle"
                  >
                    <div
                      className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-subtle blur-[50px]"
                    />

                    <div
                      className="relative flex items-start justify-between gap-4"
                    >
                      <div>
                        <p
                          className="text-xs font-semibold tracking-normal text-action"
                        >
                          Step 03
                        </p>

                        <h3
                          className="mt-2 font-sans text-2xl"
                        >
                          Review your total
                        </h3>

                        <p
                          className="mt-2 max-w-lg text-xs leading-5 text-muted"
                        >
                          Your total includes any applicable fees.
                        </p>
                      </div>

                      <WalletCards
                        size={23}
                        className="shrink-0 text-action"
                      />
                    </div>

                    <div className="relative mt-5 space-y-3 text-sm">
                      {baseAmount > 0 && <p className="text-sm text-muted">{rewardEstimate}</p>}
                      <div className="flex items-end justify-between gap-4">
                        <div>
                          <p className="text-xs font-bold tracking-normal text-muted">
                            Total to pay
                          </p>
                          <p className="mt-2 text-xs leading-5 text-muted">
                            The total amount payable, including applicable
                            charges.
                          </p>
                        </div>

                        {createdBooking && payment ? (
                          <strong className="shrink-0 font-mono text-2xl text-action">
                            {formatMoney(
                              payment.totalCharged,
                              payment.currency,
                            )}
                          </strong>
                        ) : (
                          <strong className="text-xs font-semibold text-muted">
                            Confirmed at checkout
                          </strong>
                        )}
                      </div>
                    </div>

                    
                  </section>
                </div>

                {/* Footer */}

                <div
                  className="mt-8 flex flex-col gap-5 border-t border-line pt-7 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div
                    className="flex max-w-xl items-start gap-3"
                  >
                    <ShieldCheck
                      size={16}
                      className="mt-0.5 shrink-0 text-action"
                    />

                    <p
                      className="text-xs leading-5 text-muted"
                    >
                      Next, review your total and enter your card details. You will only be charged when you confirm payment.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || !selectedDesigner || Boolean(resumeBookingId && !createdBooking)}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-action px-6 text-xs font-semibold tracking-normal text-on-action transition hover:bg-action disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted hover:text-on-action"
                  >
                    {submitting ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : createdBooking ? (
                      <CreditCard size={15} />
                    ) : (
                      <LockKeyhole size={15} />
                    )}

                    {submitting
                      ? "Preparing Booking"
                      : createdBooking
                        ? "Continue Payment"
                        : "Review & Pay"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>
      </div>

      {/*===================================================
      Stripe Checkout Modal
      ===================================================*/}

      {checkoutOpen && createdBooking && clientSecret && payment && (
        <div
          className="fixed inset-0 z-[100] overflow-y-auto bg-subtle p-4 dark:bg-black/85"
          onMouseDown={() => {
            if (!verifying && !paymentProcessing) {
              setCheckoutOpen(false);
            }
          }}
        >
          <div
            className="flex min-h-full items-center justify-center py-8"
          >
            <section
              ref={checkoutRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Secure booking payment"
              onMouseDown={(event) => event.stopPropagation()}
              className="relative w-full max-w-lg overflow-hidden rounded-md border border-line bg-surface p-4"
            >
              <div
                className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-subtle blur-[70px]"
              />

              <div className="relative z-10">
                <div
                  className="flex items-start justify-between gap-5 border-b border-line pb-5"
                >
                  <div>
                    <p
                      className="text-xs font-semibold tracking-normal text-action"
                    >
                      Stripe Secure Checkout
                    </p>

                    <h2
                      className="mt-2 font-sans text-3xl"
                    >
                      Secure Payment
                    </h2>

                    <p
                      className="mt-2 text-xs leading-5 text-muted"
                    >
                      {designIdFromUrl && selectedDesigner ? designLabel + " · " + designerName(selectedDesigner) : "Check your total before confirming payment."}
                    </p>
                    {baseAmount > 0 && <p className="mt-2 text-xs text-muted">{rewardEstimate}</p>}
                  </div>

                  <button
                    type="button"
                    disabled={verifying || paymentProcessing}
                    onClick={() => setCheckoutOpen(false)}
                    aria-label="Close checkout"
                    className="grid h-9 w-10 shrink-0 place-items-center rounded-md border border-line text-muted transition hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-muted"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="mt-6">
                  {stripePromise ? (
                    <Elements key={clientSecret} stripe={stripePromise}>
                      <CheckoutForm
                        clientSecret={clientSecret}
                        bookingId={createdBooking.id}
                        payment={payment}
                        billingName={user?.full_name || user?.name}
                        billingEmail={user?.email}
                        verifying={verifying}
                        verificationError={verificationError}
                        onPaymentSuccess={verifyEscrow}
                        processing={paymentProcessing}
                        setProcessing={setPaymentProcessing}
                        paymentNeedsVerification={paymentNeedsVerification}
                        onPaymentAccepted={() => setPaymentNeedsVerification(true)}
                      />
                    </Elements>
                  ) : (
                    <div
                      className="rounded-md border border-line bg-canvas p-4 text-sm leading-6 text-action dark:bg-subtle"
                    >
                      Card payments are temporarily unavailable. Please try again later.
                    </div>
                  )}
                </div>

                {verificationError && (
                  <button
                    type="button"
                    onClick={verifyEscrow}
                    disabled={verifying}
                    className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-canvas text-xs font-semibold tracking-normal text-action disabled:opacity-50 dark:bg-subtle"
                  >
                    {verifying ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    Retry Payment Confirmation
                  </button>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
