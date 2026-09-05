"use strict";

/*
=========================================================
DesignByYou
Creator Create Booking
Version 4.1
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

import API from "../../api/axios";

import { useAuth } from "../../context/AuthContext";

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
  if (normalize(candidate?.role) !== "designer") {
    return false;
  }

  const approval = normalize(candidate?.approval_status);

  /*
  The safe P2P directory currently returns approval_status.

  The booking controller still performs the authoritative
  approval check again when creating a booking.
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
}) {
  const stripe = useStripe();

  const elements = useElements();

  const [processing, setProcessing] = useState(false);

  const [cardError, setCardError] = useState("");

  const paymentCurrency = payment?.currency || "usd";

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements || processing || verifying) {
      return;
    }

    const card = elements.getElement(CardElement);

    if (!card) {
      setCardError("The secure card field could not be loaded.");

      return;
    }

    setProcessing(true);

    setCardError("");

    try {
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
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Card */}

      <div>
        <p
          className="
            mb-2
            text-[9px]
            font-black
            uppercase
            tracking-[0.18em]
            text-slate-400

            dark:text-white/35
          "
        >
          Card Details
        </p>

        <div
          className="
            rounded-2xl
            border
            border-slate-200
            bg-slate-950
            p-4
            shadow-inner
            transition

            focus-within:border-[#D4AF37]/60
            focus-within:ring-4
            focus-within:ring-[#D4AF37]/10

            dark:border-white/10
            dark:bg-[#050505]
          "
        >
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>
      </div>

      {/* Errors */}

      {(cardError || verificationError) && (
        <div
          className="
            flex
            items-start
            gap-3
            rounded-xl
            border
            border-rose-200
            bg-rose-50
            p-4
            text-sm
            leading-6
            text-rose-700

            dark:border-rose-400/20
            dark:bg-rose-400/10
            dark:text-rose-200
          "
        >
          <AlertCircle
            size={17}
            className="
              mt-0.5
              shrink-0
            "
          />

          <p>{verificationError || cardError}</p>
        </div>
      )}

      {/* Authoritative Payment */}

      <div
        className="
          overflow-hidden
          rounded-2xl
          border
          border-slate-200
          bg-slate-50

          dark:border-white/[0.06]
          dark:bg-white/[0.025]
        "
      >
        <div
          className="
            flex
            items-center
            justify-between
            gap-4
            border-b
            border-slate-200
            px-5
            py-4

            dark:border-white/[0.06]
          "
        >
          <div>
            <p
              className="
                text-[8px]
                font-black
                uppercase
                tracking-[0.18em]
                text-slate-400

                dark:text-white/30
              "
            >
              Contract Reference
            </p>

            <p
              className="
                mt-1
                font-mono
                text-xs
                text-slate-700

                dark:text-white/60
              "
            >
              #
              {String(bookingId || "")
                .slice(0, 8)
                .toUpperCase()}
            </p>
          </div>

          <ShieldCheck size={21} className="text-emerald-500" />
        </div>

        <div
          className="
            space-y-3
            px-5
            py-4
            text-sm
          "
        >
          <div
            className="
              flex
              justify-between
              gap-4
            "
          >
            <span
              className="
                text-slate-500

                dark:text-white/40
              "
            >
              Designer escrow
            </span>

            <span className="font-mono">
              {formatMoney(payment?.baseAmount, paymentCurrency)}
            </span>
          </div>

          <div
            className="
              flex
              justify-between
              gap-4
            "
          >
            <span
              className="
                text-slate-500

                dark:text-white/40
              "
            >
              Connection fee
            </span>

            {payment?.connectionFeeWaived ? (
              <span
                className="
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[0.15em]
                  text-emerald-600

                  dark:text-emerald-300
                "
              >
                Waived
              </span>
            ) : (
              <span className="font-mono">
                {formatMoney(payment?.connectionFee, paymentCurrency)}
              </span>
            )}
          </div>

          <div
            className="
              flex
              items-end
              justify-between
              gap-4
              border-t
              border-slate-200
              pt-4

              dark:border-white/[0.06]
            "
          >
            <div>
              <p
                className="
                  text-[8px]
                  font-black
                  uppercase
                  tracking-[0.18em]
                  text-slate-400

                  dark:text-white/30
                "
              >
                Stripe Authorization
              </p>

              <p
                className="
                  mt-1
                  text-[10px]
                  text-slate-500

                  dark:text-white/35
                "
              >
                Final backend-confirmed amount
              </p>
            </div>

            <strong
              className="
                font-mono
                text-2xl
                text-[#98761A]

                dark:text-[#D4AF37]
              "
            >
              {formatMoney(payment?.totalCharged, paymentCurrency)}
            </strong>
          </div>
        </div>
      </div>

      {/* Payment Button */}

      <button
        type="submit"
        disabled={!stripe || !elements || processing || verifying}
        className="
          flex
          h-[54px]
          w-full
          items-center
          justify-center
          gap-2
          rounded-xl
          bg-[#D4AF37]
          px-5
          text-[9px]
          font-black
          uppercase
          tracking-[0.2em]
          text-black
          shadow-[0_14px_35px_rgba(212,175,55,0.25)]
          transition

          hover:-translate-y-0.5
          hover:bg-[#E4C65D]

          disabled:cursor-not-allowed
          disabled:bg-slate-200
          disabled:text-slate-400
          disabled:shadow-none

          dark:disabled:bg-white/5
          dark:disabled:text-white/25
        "
      >
        {processing || verifying ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <LockKeyhole size={15} />
        )}

        {verifying
          ? "Securing Escrow"
          : processing
            ? "Processing Stripe Payment"
            : `Pay ${formatMoney(payment?.totalCharged, paymentCurrency)}`}
      </button>

      <p
        className="
          text-center
          text-[9px]
          leading-5
          text-slate-400

          dark:text-white/25
        "
      >
        Stripe processes the card payment. Designer payout remains governed by
        the booking workflow and final approval.
      </p>
    </form>
  );
}

/*=========================================================
Creator Create Booking
=========================================================*/

export default function CreatorCreateBooking() {
  const [searchParams] = useSearchParams();

  const navigate = useNavigate();

  const { user } = useAuth();

  /*=======================================================
  URL Context
  =======================================================*/

  const designerIdFromUrl = cleanParam(searchParams, "designer_id");

  const designIdFromUrl = cleanParam(searchParams, "design_id");

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
  Contract Form
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

  const [verificationError, setVerificationError] = useState("");

  const [success, setSuccess] = useState(false);

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

  /*
  Do NOT hard-code the platform connection fee here.

  P2P_CONNECTION_FEE_RATE belongs to backend configuration.

  Before booking creation:

  - active subscriber
      → fee can safely display as waived

  - free creator
      → backend calculates final fee

  After booking creation:

  payment is the authoritative backend response.
  */

  const displayedPayment = payment || {
    currency: "usd",

    baseAmount,

    connectionFee: subscribed ? 0 : null,

    totalCharged: subscribed ? baseAmount : null,

    connectionFeeWaived: subscribed,
  };

  /*=======================================================
  Form Completion
  =======================================================*/

  const completion = useMemo(() => {
    let completed = 0;

    const total = 4;

    if (selectedDesigner) {
      completed += 1;
    }

    if (baseAmount > 0) {
      completed += 1;
    }

    if (deadline) {
      completed += 1;
    }

    if (brief.trim().length >= 20) {
      completed += 1;
    }

    return Math.round((completed / total) * 100);
  }, [selectedDesigner, baseAmount, deadline, brief]);

  /*=======================================================
  Validation
  =======================================================*/

  const validate = () => {
    if (!selectedDesigner || !designerId(selectedDesigner)) {
      return "Select a valid designer.";
    }

    if (user?.id && String(designerId(selectedDesigner)) === String(user.id)) {
      return "You cannot create a commission with your own account.";
    }

    if (!baseAmount) {
      return "Enter an agreed contract value greater than zero.";
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

    setSubmitting(true);

    setFormError("");

    setVerificationError("");

    try {
      const response = await API.post("/p2p-bookings/create", {
        client_request_id: clientRequestIdRef.current,

        receiver_id: designerId(selectedDesigner),

        design_id: designIdFromUrl || null,

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

      setClientSecret(secret);

      setPayment({
        currency: authoritativePayment?.currency || "usd",

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
          "This booking request identity was already used with different contract details. Refresh the page before starting a different booking.",
        );
      } else if (code === "PAYMENT_INTENT_ALREADY_CANCELLED") {
        setFormError(
          "The Stripe payment for this booking attempt was already cancelled. Refresh the page before starting a new contract attempt.",
        );
      } else {
        setFormError(
          apiError(
            requestError,
            "The booking contract could not be created.",
          ),
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  /*=======================================================
  Verify Escrow

  This reconciliation endpoint remains safe to retry after
  Stripe succeeds.
  =======================================================*/

  const verifyEscrow = useCallback(async () => {
    if (!createdBooking?.id) {
      return;
    }

    setVerifying(true);

    setVerificationError("");

    try {
      const response = await API.post("/p2p-bookings/verify-escrow", {
        bookingId: createdBooking.id,
      });

      if (response?.data?.status !== "success") {
        throw new Error("Escrow verification did not complete.");
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
          "Escrow verification failed:",
          error?.response?.data || error,
        );
      }

      setVerificationError(
        apiError(
          error,
          "Stripe accepted the payment, but escrow has not been synchronized yet. Retry verification using this same booking.",
        ),
      );
    } finally {
      setVerifying(false);
    }
  }, [createdBooking?.id]);

  /*=======================================================
  Success Screen
  =======================================================*/

  if (success && createdBooking) {
    return (
      <div
        className="
          relative
          flex
          min-h-[calc(100vh-5rem)]
          items-center
          justify-center
          overflow-hidden
          bg-slate-50
          px-4
          py-14
          text-slate-950

          dark:bg-[#030303]
          dark:text-white
        "
      >
        <div
          className="
            pointer-events-none
            absolute
            left-1/2
            top-1/2
            h-[38rem]
            w-[38rem]
            -translate-x-1/2
            -translate-y-1/2
            rounded-full
            bg-[#D4AF37]/15
            blur-[170px]
          "
        />

        <section
          className="
            relative
            z-10
            w-full
            max-w-xl
            overflow-hidden
            rounded-[2rem]
            border
            border-slate-200
            bg-white
            p-7
            text-center
            shadow-[0_35px_100px_rgba(15,23,42,0.12)]

            sm:p-10

            dark:border-white/[0.08]
            dark:bg-[#090909]
            dark:shadow-[0_40px_120px_rgba(0,0,0,0.65)]
          "
        >
          <div
            className="
              pointer-events-none
              absolute
              -right-20
              -top-20
              h-56
              w-56
              rounded-full
              bg-emerald-400/10
              blur-[70px]
            "
          />

          <div
            className="
              relative
              mx-auto
              grid
              h-20
              w-20
              place-items-center
              rounded-3xl
              border
              border-emerald-200
              bg-emerald-50
              text-emerald-600

              dark:border-emerald-400/20
              dark:bg-emerald-400/10
              dark:text-emerald-300
            "
          >
            <ShieldCheck size={35} />
          </div>

          <p
            className="
              relative
              mt-7
              text-[9px]
              font-black
              uppercase
              tracking-[0.28em]
              text-[#997619]

              dark:text-[#D4AF37]
            "
          >
            Stripe Payment Verified
          </p>

          <h1
            className="
              relative
              mt-3
              font-serif
              text-4xl
              font-light

              sm:text-5xl
            "
          >
            Escrow{" "}
            <span
              className="
                italic
                text-[#A17D1C]

                dark:text-[#D4AF37]
              "
            >
              secured.
            </span>
          </h1>

          <p
            className="
              relative
              mx-auto
              mt-4
              max-w-md
              text-sm
              leading-7
              text-slate-500

              dark:text-white/45
            "
          >
            Your payment has been reconciled with the booking. The booking
            will now continue through the designer workflow.
          </p>

          <div
            className="
              relative
              mt-8
              overflow-hidden
              rounded-2xl
              border
              border-slate-200
              bg-slate-50
              text-left

              dark:border-white/[0.06]
              dark:bg-white/[0.025]
            "
          >
            <div
              className="
                flex
                justify-between
                gap-4
                border-b
                border-slate-200
                p-4
                text-xs

                dark:border-white/[0.06]
              "
            >
              <span
                className="
                  text-slate-500

                  dark:text-white/40
                "
              >
                Booking
              </span>

              <span
                className="
                  font-mono
                  text-slate-900

                  dark:text-white/75
                "
              >
                #{String(createdBooking.id).slice(0, 8).toUpperCase()}
              </span>
            </div>

            <div
              className="
                flex
                justify-between
                gap-4
                p-4
              "
            >
              <span
                className="
                  text-xs
                  text-slate-500

                  dark:text-white/40
                "
              >
                Stripe total
              </span>

              <strong
                className="
                  font-mono
                  text-lg
                  text-[#997619]

                  dark:text-[#D4AF37]
                "
              >
                {formatMoney(payment?.totalCharged, payment?.currency)}
              </strong>
            </div>
          </div>

          <div
            className="
              relative
              mt-8
              grid
              gap-3

              sm:grid-cols-2
            "
          >
            <button
              type="button"
              onClick={() => navigate("/creator/bookings")}
              className="
                h-12
                rounded-xl
                border
                border-slate-200
                bg-white
                text-[9px]
                font-black
                uppercase
                tracking-[0.18em]
                text-slate-600
                transition

                hover:border-[#D4AF37]/50
                hover:text-[#98751B]

                dark:border-white/10
                dark:bg-white/[0.04]
                dark:text-white/60
                dark:hover:text-[#D4AF37]
              "
            >
              View Pipeline
            </button>

            <button
              type="button"
              onClick={() => navigate(`/creator/bookings/${createdBooking.id}`)}
              className="
                flex
                h-12
                items-center
                justify-center
                gap-2
                rounded-xl
                bg-[#D4AF37]
                text-[9px]
                font-black
                uppercase
                tracking-[0.18em]
                text-black
                transition

                hover:bg-[#E4C65D]
              "
            >
              Open Contract
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
        className="
          relative
          min-h-screen
          overflow-hidden
          bg-slate-50
          pb-24
          text-slate-950

          dark:bg-[#030303]
          dark:text-white
        "
      >
        {/*===============================================
        Ambient Background
        ===============================================*/}

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
              -left-[15rem]
              top-[6rem]
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
              -right-[18rem]
              bottom-[-10rem]
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
              bg-[linear-gradient(to_right,rgba(15,23,42,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.02)_1px,transparent_1px)]
              bg-[size:42px_42px]

              dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.014)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.014)_1px,transparent_1px)]
            "
          />
        </div>

        <div
          className="
            relative
            z-10
            mx-auto
            max-w-[1450px]
            px-4
            pt-9

            sm:px-6

            lg:px-10
            lg:pt-12
          "
        >
          {/*=============================================
          Hero
          =============================================*/}

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
                -right-24
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
                relative
                z-10
                flex
                flex-col
                gap-7

                lg:flex-row
                lg:items-end
                lg:justify-between
              "
            >
              <div>
                <button
                  type="button"
                  onClick={() =>
                    directMode ? navigate(-1) : navigate("/creator/bookings")
                  }
                  className="
                    mb-5
                    inline-flex
                    items-center
                    gap-2
                    text-[8px]
                    font-black
                    uppercase
                    tracking-[0.2em]
                    text-slate-400
                    transition

                    hover:text-[#98751A]

                    dark:text-white/30
                    dark:hover:text-[#D4AF37]
                  "
                >
                  <ArrowLeft size={12} />

                  {directMode ? "Back to discovery" : "Back to bookings"}
                </button>

                <div
                  className="
                    mb-4
                    flex
                    items-center
                    gap-2
                    text-[9px]
                    font-black
                    uppercase
                    tracking-[0.28em]
                    text-[#98751A]

                    dark:text-[#D4AF37]
                  "
                >
                  <Compass size={13} />
                  Creator Booking Desk
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
                  Build a{" "}
                  <span
                    className="
                      italic
                      text-[#A17D1C]

                      dark:text-[#D4AF37]
                    "
                  >
                    Booking.
                  </span>
                </h1>

                <p
                  className="
                    mt-5
                    max-w-2xl
                    text-sm
                    leading-7
                    text-slate-500

                    dark:text-white/42
                  "
                >
                  Choose a designer, define the project terms, review the
                  backend-confirmed payment amount, and secure the contract
                  through Stripe.
                </p>
              </div>

              <div
                className="
                  flex
                  flex-wrap
                  gap-2
                "
              >
                <div
                  className="
                    inline-flex
                    items-center
                    gap-2
                    rounded-full
                    border
                    border-emerald-200
                    bg-emerald-50
                    px-4
                    py-2
                    text-[8px]
                    font-black
                    uppercase
                    tracking-[0.17em]
                    text-emerald-700

                    dark:border-emerald-400/20
                    dark:bg-emerald-400/10
                    dark:text-emerald-300
                  "
                >
                  <LockKeyhole size={12} />
                  Stripe Secured
                </div>

                {designIdFromUrl && (
                  <div
                    className="
                      inline-flex
                      items-center
                      gap-2
                      rounded-full
                      border
                      border-[#D4AF37]/25
                      bg-[#D4AF37]/10
                      px-4
                      py-2
                      text-[8px]
                      font-black
                      uppercase
                      tracking-[0.17em]
                      text-[#98751A]

                      dark:text-[#D4AF37]
                    "
                  >
                    <Sparkles size={12} />
                    Showcase Reference
                  </div>
                )}
              </div>
            </div>

            {/* Progress */}

            <div
              className="
                relative
                z-10
                mt-9
              "
            >
              <div
                className="
                  mb-2
                  flex
                  items-center
                  justify-between
                  gap-4
                "
              >
                <span
                  className="
                    text-[8px]
                    font-black
                    uppercase
                    tracking-[0.18em]
                    text-slate-400

                    dark:text-white/25
                  "
                >
                  Contract setup
                </span>

                <span
                  className="
                    font-mono
                    text-[9px]
                    text-slate-500

                    dark:text-white/35
                  "
                >
                  {completion}%
                </span>
              </div>

              <div
                className="
                  h-1
                  overflow-hidden
                  rounded-full
                  bg-slate-100

                  dark:bg-white/[0.05]
                "
              >
                <div
                  className="
                    h-full
                    rounded-full
                    bg-gradient-to-r
                    from-[#A98520]
                    via-[#D4AF37]
                    to-[#E7CE74]
                    transition-all
                    duration-500
                  "
                  style={{
                    width: `${completion}%`,
                  }}
                />
              </div>
            </div>
          </section>

          {/*=============================================
          Workspace
          =============================================*/}

          <div
            className={`
              grid
              gap-7

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
                className="
                  flex
                  max-h-[780px]
                  min-h-[600px]
                  flex-col
                  overflow-hidden
                  rounded-[2rem]
                  border
                  border-slate-200/80
                  bg-white/90
                  shadow-sm
                  backdrop-blur

                  dark:border-white/[0.06]
                  dark:bg-[#090909]/90
                  dark:shadow-[0_25px_70px_rgba(0,0,0,0.4)]
                "
              >
                <div
                  className="
                    border-b
                    border-slate-200/80
                    p-6

                    dark:border-white/[0.06]
                  "
                >
                  <div
                    className="
                      flex
                      items-start
                      justify-between
                      gap-4
                    "
                  >
                    <div>
                      <p
                        className="
                          text-[8px]
                          font-black
                          uppercase
                          tracking-[0.2em]
                          text-[#98751A]

                          dark:text-[#D4AF37]
                        "
                      >
                        Step 01
                      </p>

                      <h2
                        className="
                          mt-2
                          font-serif
                          text-2xl
                        "
                      >
                        Choose a designer
                      </h2>
                    </div>

                    <UserRound
                      size={21}
                      className="
                        text-slate-300

                        dark:text-white/20
                      "
                    />
                  </div>

                  <label
                    className="
                      relative
                      mt-5
                      block
                    "
                  >
                    <span className="sr-only">Search designers</span>

                    <Search
                      size={15}
                      className="
                        pointer-events-none
                        absolute
                        left-4
                        top-1/2
                        -translate-y-1/2
                        text-slate-400
                      "
                    />

                    <input
                      type="search"
                      value={query}
                      maxLength={100}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search designers"
                      className="
                        h-11
                        w-full
                        rounded-xl
                        border
                        border-slate-200
                        bg-slate-50
                        pl-11
                        pr-10
                        text-sm
                        outline-none
                        transition

                        focus:border-[#D4AF37]/55
                        focus:bg-white
                        focus:ring-4
                        focus:ring-[#D4AF37]/10

                        dark:border-white/10
                        dark:bg-white/[0.035]
                        dark:text-white
                      "
                    />

                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label="Clear designer search"
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
                      >
                        <X size={12} />
                      </button>
                    )}
                  </label>
                </div>

                <div
                  className="
                    custom-scrollbar
                    flex-1
                    space-y-3
                    overflow-y-auto
                    p-4
                  "
                >
                  {loadingDesigners ? (
                    <div
                      className="
                        flex
                        min-h-80
                        flex-col
                        items-center
                        justify-center
                        gap-3
                        text-[#98751A]

                        dark:text-[#D4AF37]
                      "
                    >
                      <Loader2 size={24} className="animate-spin" />

                      <p
                        className="
                          text-[8px]
                          font-black
                          uppercase
                          tracking-[0.2em]
                        "
                      >
                        Loading designers
                      </p>
                    </div>
                  ) : designerError ? (
                    <div
                      className="
                        rounded-2xl
                        border
                        border-rose-200
                        bg-rose-50
                        p-5

                        dark:border-rose-400/20
                        dark:bg-rose-400/[0.08]
                      "
                    >
                      <div
                        className="
                          flex
                          items-start
                          gap-3
                          text-sm
                          leading-6
                          text-rose-700

                          dark:text-rose-200
                        "
                      >
                        <AlertCircle
                          size={17}
                          className="
                            mt-0.5
                            shrink-0
                          "
                        />

                        <p>{designerError}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setDesignerRefreshKey((value) => value + 1)
                        }
                        className="
                          mt-4
                          inline-flex
                          items-center
                          gap-2
                          text-[8px]
                          font-black
                          uppercase
                          tracking-[0.16em]
                          text-rose-700

                          dark:text-rose-200
                        "
                      >
                        <RefreshCw size={12} />
                        Retry
                      </button>
                    </div>
                  ) : filteredDesigners.length === 0 ? (
                    <div
                      className="
                        flex
                        min-h-80
                        flex-col
                        items-center
                        justify-center
                        rounded-2xl
                        border
                        border-dashed
                        border-slate-200
                        p-6
                        text-center

                        dark:border-white/10
                      "
                    >
                      <UserRound
                        size={29}
                        className="
                          text-slate-300

                          dark:text-white/20
                        "
                      />

                      <p
                        className="
                          mt-4
                          font-serif
                          text-xl
                        "
                      >
                        No designers found
                      </p>

                      <p
                        className="
                          mt-2
                          text-xs
                          leading-5
                          text-slate-500

                          dark:text-white/35
                        "
                      >
                        Try another name or tier.
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
                              group
                              flex
                              w-full
                              items-center
                              gap-3
                              rounded-2xl
                              border
                              p-3.5
                              text-left
                              transition
                              duration-200

                              disabled:cursor-not-allowed
                              disabled:opacity-50

                              ${
                                selected
                                  ? "border-[#D4AF37]/50 bg-[#D4AF37]/10 shadow-[0_10px_30px_rgba(212,175,55,0.08)]"
                                  : "border-slate-200 bg-slate-50/70 hover:border-[#D4AF37]/25 hover:bg-white dark:border-white/[0.06] dark:bg-white/[0.025] dark:hover:bg-white/[0.05]"
                              }
                            `}
                        >
                          <div
                            className="
                                grid
                                h-12
                                w-12
                                shrink-0
                                place-items-center
                                overflow-hidden
                                rounded-xl
                                border
                                border-slate-200
                                bg-white
                                font-serif
                                text-lg
                                text-slate-500

                                dark:border-white/10
                                dark:bg-white/5
                                dark:text-white/50
                              "
                          >
                            {avatar ? (
                              <img
                                src={avatar}
                                alt=""
                                loading="lazy"
                                className="
                                    h-full
                                    w-full
                                    object-cover
                                  "
                              />
                            ) : (
                              designerName(candidate).charAt(0).toUpperCase()
                            )}
                          </div>

                          <div
                            className="
                                min-w-0
                                flex-1
                              "
                          >
                            <p
                              className="
                                  truncate
                                  font-serif
                                  text-base
                                "
                            >
                              {designerName(candidate)}
                            </p>

                            <div
                              className="
                                  mt-1
                                  flex
                                  flex-wrap
                                  items-center
                                  gap-1.5
                                  text-[8px]
                                  font-black
                                  uppercase
                                  tracking-[0.13em]
                                  text-slate-400

                                  dark:text-white/28
                                "
                            >
                              <span>Designer</span>

                              {candidate?.tier && (
                                <>
                                  <span>•</span>

                                  <span
                                    className="
                                        text-[#9B791D]

                                        dark:text-[#D4AF37]
                                      "
                                  >
                                    {candidate.tier}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div
                            className={`
                                grid
                                h-6
                                w-6
                                shrink-0
                                place-items-center
                                rounded-full
                                border
                                transition

                                ${
                                  selected
                                    ? "border-[#D4AF37] bg-[#D4AF37] text-black"
                                    : "border-slate-300 text-transparent dark:border-white/15"
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
                  className="
                    border-t
                    border-slate-200
                    p-4

                    dark:border-white/[0.06]
                  "
                >
                  <Link
                    to="/creator/directory"
                    className="
                      flex
                      items-center
                      justify-center
                      gap-2
                      rounded-xl
                      border
                      border-slate-200
                      bg-slate-50
                      py-3
                      text-[8px]
                      font-black
                      uppercase
                      tracking-[0.17em]
                      text-slate-500
                      transition

                      hover:border-[#D4AF37]/30
                      hover:text-[#967319]

                      dark:border-white/10
                      dark:bg-white/[0.03]
                      dark:text-white/40
                      dark:hover:text-[#D4AF37]
                    "
                  >
                    Explore Full Directory
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </aside>
            )}

            {/*===========================================
            Contract Form
            ===========================================*/}

            <section
              className="
                overflow-hidden
                rounded-[2rem]
                border
                border-slate-200/80
                bg-white/90
                shadow-sm
                backdrop-blur

                dark:border-white/[0.06]
                dark:bg-[#090909]/90
                dark:shadow-[0_25px_75px_rgba(0,0,0,0.4)]
              "
            >
              <form
                onSubmit={createBooking}
                className="
                  p-5

                  sm:p-7

                  lg:p-9
                "
              >
                {/* Form Heading */}

                <div
                  className="
                    flex
                    flex-col
                    gap-5
                    border-b
                    border-slate-200
                    pb-7

                    sm:flex-row
                    sm:items-start
                    sm:justify-between

                    dark:border-white/[0.06]
                  "
                >
                  <div>
                    <p
                      className="
                        text-[8px]
                        font-black
                        uppercase
                        tracking-[0.2em]
                        text-[#98751A]

                        dark:text-[#D4AF37]
                      "
                    >
                      Step 02
                    </p>

                    <h2
                      className="
                        mt-2
                        font-serif
                        text-3xl

                        sm:text-4xl
                      "
                    >
                      Define the contract
                    </h2>

                    <p
                      className="
                        mt-3
                        max-w-xl
                        text-sm
                        leading-6
                        text-slate-500

                        dark:text-white/40
                      "
                    >
                      Set the agreed project value, timing, and creative
                      requirements before Stripe funding.
                    </p>
                  </div>

                  <div
                    className={`
                      inline-flex
                      w-fit
                      items-center
                      gap-2
                      rounded-full
                      border
                      px-4
                      py-2
                      text-[8px]
                      font-black
                      uppercase
                      tracking-[0.15em]

                      ${
                        subscribed
                          ? "border-[#D4AF37]/25 bg-[#D4AF37]/10 text-[#8F7118] dark:text-[#D4AF37]"
                          : "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-white/40"
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
                          )} • Fee waived`
                        : "Pay-as-you-go"}
                  </div>
                </div>

                {subscriptionError && (
                  <div
                    className="
                      mt-6
                      flex
                      items-start
                      gap-3
                      rounded-xl
                      border
                      border-amber-200
                      bg-amber-50
                      p-4
                      text-xs
                      leading-5
                      text-amber-700

                      dark:border-amber-400/20
                      dark:bg-amber-400/[0.08]
                      dark:text-amber-200
                    "
                  >
                    <AlertCircle
                      size={15}
                      className="
                        mt-0.5
                        shrink-0
                      "
                    />

                    <div>
                      <p>{subscriptionError}</p>

                      <p
                        className="
                          mt-1
                          opacity-75
                        "
                      >
                        The backend will still determine your actual connection
                        fee before payment.
                      </p>
                    </div>
                  </div>
                )}

                {formError && (
                  <div
                    role="alert"
                    className="
                      mt-6
                      flex
                      items-start
                      gap-3
                      rounded-2xl
                      border
                      border-rose-200
                      bg-rose-50
                      p-5
                      text-sm
                      leading-6
                      text-rose-700

                      dark:border-rose-400/20
                      dark:bg-rose-400/[0.08]
                      dark:text-rose-200
                    "
                  >
                    <AlertCircle
                      size={17}
                      className="
                        mt-0.5
                        shrink-0
                      "
                    />

                    <p>{formError}</p>
                  </div>
                )}

                {createdBooking && (
                  <div
                    className="
                      mt-6
                      flex
                      flex-col
                      gap-4
                      rounded-2xl
                      border
                      border-amber-200
                      bg-amber-50
                      p-5

                      sm:flex-row
                      sm:items-center
                      sm:justify-between

                      dark:border-amber-400/20
                      dark:bg-amber-400/[0.08]
                    "
                  >
                    <div
                      className="
                        flex
                        items-start
                        gap-3
                      "
                    >
                      <Clock3
                        size={18}
                        className="
                          mt-0.5
                          shrink-0
                          text-amber-700

                          dark:text-amber-300
                        "
                      />

                      <div>
                        <h3
                          className="
                            font-semibold
                            text-amber-900

                            dark:text-amber-100
                          "
                        >
                          Contract created — payment pending
                        </h3>

                        <p
                          className="
                            mt-1
                            text-xs
                            leading-5
                            text-amber-700/75

                            dark:text-amber-200/65
                          "
                        >
                          Booking #
                          {String(createdBooking.id).slice(0, 8).toUpperCase()}{" "}
                          already exists. Continue that Stripe payment instead
                          of creating another contract.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setCheckoutOpen(true)}
                      className="
                        inline-flex
                        h-10
                        shrink-0
                        items-center
                        justify-center
                        gap-2
                        rounded-xl
                        bg-amber-700
                        px-4
                        text-[8px]
                        font-black
                        uppercase
                        tracking-[0.15em]
                        text-white

                        dark:bg-amber-300
                        dark:text-black
                      "
                    >
                      <CreditCard size={13} />
                      Continue Payment
                    </button>
                  </div>
                )}

                {/* Fields */}

                <div
                  className="
                    mt-7
                    space-y-7
                  "
                >
                  {/* Selected Designer */}

                  <div
                    className="
                      relative
                      overflow-hidden
                      rounded-2xl
                      border
                      border-slate-200
                      bg-slate-50
                      p-5

                      dark:border-white/[0.06]
                      dark:bg-white/[0.025]
                    "
                  >
                    <div
                      className="
                        pointer-events-none
                        absolute
                        -right-10
                        -top-10
                        h-32
                        w-32
                        rounded-full
                        bg-[#D4AF37]/10
                        blur-[50px]
                      "
                    />

                    <div
                      className="
                        relative
                        flex
                        items-center
                        justify-between
                        gap-4
                      "
                    >
                      <div>
                        <p
                          className="
                            text-[8px]
                            font-black
                            uppercase
                            tracking-[0.18em]
                            text-slate-400

                            dark:text-white/28
                          "
                        >
                          Selected Designer
                        </p>

                        {loadingDesigners && directMode ? (
                          <div
                            className="
                              mt-3
                              flex
                              items-center
                              gap-2
                              text-sm
                              text-[#98751A]

                              dark:text-[#D4AF37]
                            "
                          >
                            <Loader2 size={15} className="animate-spin" />
                            Loading designer
                          </div>
                        ) : selectedDesigner ? (
                          <div
                            className="
                              mt-3
                              flex
                              min-w-0
                              items-center
                              gap-3
                            "
                          >
                            <div
                              className="
                                grid
                                h-12
                                w-12
                                shrink-0
                                place-items-center
                                overflow-hidden
                                rounded-xl
                                border
                                border-[#D4AF37]/25
                                bg-[#D4AF37]/10
                                font-serif
                                text-lg
                                text-[#98751A]

                                dark:text-[#D4AF37]
                              "
                            >
                              {designerAvatar(selectedDesigner) ? (
                                <img
                                  src={designerAvatar(selectedDesigner)}
                                  alt=""
                                  className="
                                    h-full
                                    w-full
                                    object-cover
                                  "
                                />
                              ) : (
                                designerName(selectedDesigner)
                                  .charAt(0)
                                  .toUpperCase()
                              )}
                            </div>

                            <div className="min-w-0">
                              <h3
                                className="
                                  truncate
                                  font-serif
                                  text-xl

                                  sm:text-2xl
                                "
                              >
                                {designerName(selectedDesigner)}
                              </h3>

                              <p
                                className="
                                  mt-1
                                  text-[8px]
                                  font-black
                                  uppercase
                                  tracking-[0.16em]
                                  text-[#98751A]

                                  dark:text-[#D4AF37]
                                "
                              >
                                {designIdFromUrl
                                  ? "Showcase booking"
                                  : "Direct booking"}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p
                            className="
                              mt-3
                              text-sm
                              text-slate-500

                              dark:text-white/35
                            "
                          >
                            {designerError || "Select a designer to continue."}
                          </p>
                        )}
                      </div>

                      {selectedDesigner && (
                        <CheckCircle2
                          size={22}
                          className="
                            shrink-0
                            text-emerald-500
                          "
                        />
                      )}
                    </div>
                  </div>

                  {/* Amount + Deadline */}

                  <div
                    className="
                      grid
                      gap-5

                      md:grid-cols-2
                    "
                  >
                    <label className="block">
                      <span
                        className="
                          mb-2.5
                          flex
                          items-center
                          gap-2
                          text-[9px]
                          font-black
                          uppercase
                          tracking-[0.17em]
                          text-slate-500

                          dark:text-white/40
                        "
                      >
                        <BadgeDollarSign
                          size={13}
                          className="
                            text-[#A17D1C]

                            dark:text-[#D4AF37]
                          "
                        />
                        Agreed Contract Value
                      </span>

                      <div className="relative">
                        <span
                          className="
                            absolute
                            left-4
                            top-1/2
                            -translate-y-1/2
                            font-serif
                            text-lg
                            text-[#98751A]

                            dark:text-[#D4AF37]
                          "
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
                          className="
                            h-[54px]
                            w-full
                            rounded-xl
                            border
                            border-slate-200
                            bg-slate-50
                            pl-10
                            pr-4
                            text-sm
                            outline-none
                            transition

                            focus:border-[#D4AF37]/60
                            focus:bg-white
                            focus:ring-4
                            focus:ring-[#D4AF37]/10

                            disabled:cursor-not-allowed
                            disabled:opacity-50

                            dark:border-white/10
                            dark:bg-white/[0.035]
                            dark:text-white
                            dark:focus:bg-white/[0.05]
                          "
                        />
                      </div>

                      {budgetFromUrl && !createdBooking && (
                        <p
                          className="
                              mt-2
                              text-[9px]
                              leading-4
                              text-slate-400

                              dark:text-white/25
                            "
                        >
                          Pre-filled from the designer's indicative booking
                          starting budget. You may adjust it before creating the
                          contract.
                        </p>
                      )}
                    </label>

                    <label className="block">
                      <span
                        className="
                          mb-2.5
                          flex
                          items-center
                          gap-2
                          text-[9px]
                          font-black
                          uppercase
                          tracking-[0.17em]
                          text-slate-500

                          dark:text-white/40
                        "
                      >
                        <CalendarDays
                          size={13}
                          className="
                            text-[#A17D1C]

                            dark:text-[#D4AF37]
                          "
                        />
                        Final Deadline
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
                        className="
                          h-[54px]
                          w-full
                          rounded-xl
                          border
                          border-slate-200
                          bg-slate-50
                          px-4
                          text-sm
                          outline-none
                          transition

                          focus:border-[#D4AF37]/60
                          focus:bg-white
                          focus:ring-4
                          focus:ring-[#D4AF37]/10

                          disabled:cursor-not-allowed
                          disabled:opacity-50

                          dark:border-white/10
                          dark:bg-white/[0.035]
                          dark:text-white
                          dark:[color-scheme:dark]
                        "
                      />
                    </label>
                  </div>

                  {/* Schedule */}

                  <label className="block">
                    <span
                      className="
                        mb-2.5
                        flex
                        flex-wrap
                        items-center
                        gap-2
                        text-[9px]
                        font-black
                        uppercase
                        tracking-[0.17em]
                        text-slate-500

                        dark:text-white/40
                      "
                    >
                      <Clock3
                        size={13}
                        className="
                          text-[#A17D1C]

                          dark:text-[#D4AF37]
                        "
                      />
                      Preferred Start Time
                      <span
                        className="
                          rounded-full
                          bg-slate-100
                          px-2
                          py-0.5
                          text-[7px]
                          tracking-[0.12em]
                          text-slate-400

                          dark:bg-white/5
                          dark:text-white/25
                        "
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
                      className="
                        h-[54px]
                        w-full
                        rounded-xl
                        border
                        border-slate-200
                        bg-slate-50
                        px-4
                        text-sm
                        outline-none
                        transition

                        focus:border-[#D4AF37]/60
                        focus:bg-white
                        focus:ring-4
                        focus:ring-[#D4AF37]/10

                        disabled:cursor-not-allowed
                        disabled:opacity-50

                        dark:border-white/10
                        dark:bg-white/[0.035]
                        dark:text-white
                        dark:[color-scheme:dark]
                      "
                    />

                    <p
                      className="
                        mt-2
                        text-[9px]
                        text-slate-400

                        dark:text-white/25
                      "
                    >
                      Designer availability is revalidated by the backend when
                      the booking is created.
                    </p>
                  </label>

                  {/* Brief */}

                  <label className="block">
                    <span
                      className="
                        mb-2.5
                        flex
                        items-center
                        justify-between
                        gap-4
                        text-[9px]
                        font-black
                        uppercase
                        tracking-[0.17em]
                        text-slate-500

                        dark:text-white/40
                      "
                    >
                      <span
                        className="
                          flex
                          items-center
                          gap-2
                        "
                      >
                        <FileText
                          size={13}
                          className="
                            text-[#A17D1C]

                            dark:text-[#D4AF37]
                          "
                        />
                        Project Brief
                      </span>

                      <span
                        className="
                          font-mono
                          text-[8px]
                          text-slate-400

                          dark:text-white/25
                        "
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
                      className="
                        w-full
                        resize-none
                        rounded-xl
                        border
                        border-slate-200
                        bg-slate-50
                        p-4
                        text-sm
                        leading-7
                        outline-none
                        transition

                        focus:border-[#D4AF37]/60
                        focus:bg-white
                        focus:ring-4
                        focus:ring-[#D4AF37]/10

                        disabled:cursor-not-allowed
                        disabled:opacity-50

                        dark:border-white/10
                        dark:bg-white/[0.035]
                        dark:text-white
                        dark:placeholder:text-white/20
                      "
                    />

                    <div
                      className="
                        mt-2
                        flex
                        items-center
                        justify-between
                        gap-4
                      "
                    >
                      <p
                        className={`
                          text-[9px]

                          ${
                            brief.length > 0 && brief.trim().length < 20
                              ? "text-amber-600 dark:text-amber-300"
                              : "text-slate-400 dark:text-white/25"
                          }
                        `}
                      >
                        Minimum 20 characters.
                      </p>

                      {brief.trim().length >= 20 && (
                        <span
                          className="
                            inline-flex
                            items-center
                            gap-1
                            text-[8px]
                            font-black
                            uppercase
                            tracking-[0.14em]
                            text-emerald-600

                            dark:text-emerald-300
                          "
                        >
                          <CheckCircle2 size={10} />
                          Ready
                        </span>
                      )}
                    </div>
                  </label>

                  {/* Payment Preview */}

                  <section
                    className="
                      relative
                      overflow-hidden
                      rounded-2xl
                      border
                      border-slate-200
                      bg-slate-50
                      p-5

                      dark:border-white/[0.06]
                      dark:bg-white/[0.025]
                    "
                  >
                    <div
                      className="
                        pointer-events-none
                        absolute
                        -right-12
                        -top-12
                        h-36
                        w-36
                        rounded-full
                        bg-emerald-400/[0.08]
                        blur-[50px]
                      "
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
                            text-[8px]
                            font-black
                            uppercase
                            tracking-[0.2em]
                            text-[#98751A]

                            dark:text-[#D4AF37]
                          "
                        >
                          Step 03
                        </p>

                        <h3
                          className="
                            mt-2
                            font-serif
                            text-2xl
                          "
                        >
                          Payment preview
                        </h3>

                        <p
                          className="
                            mt-2
                            max-w-lg
                            text-xs
                            leading-5
                            text-slate-500

                            dark:text-white/35
                          "
                        >
                          The exact connection fee and Stripe charge are
                          calculated by the backend before you enter payment.
                        </p>
                      </div>

                      <WalletCards
                        size={23}
                        className="
                          shrink-0
                          text-emerald-500
                        "
                      />
                    </div>

                    <div
                      className="
                        relative
                        mt-5
                        space-y-3
                        text-sm
                      "
                    >
                      <div
                        className="
                          flex
                          items-center
                          justify-between
                          gap-4
                        "
                      >
                        <span
                          className="
                            text-slate-500

                            dark:text-white/40
                          "
                        >
                          Agreed designer value
                        </span>

                        <span className="font-mono">
                          {formatMoney(baseAmount)}
                        </span>
                      </div>

                      <div
                        className="
                          flex
                          items-center
                          justify-between
                          gap-4
                        "
                      >
                        <span
                          className="
                            text-slate-500

                            dark:text-white/40
                          "
                        >
                          Platform connection fee
                        </span>

                        {createdBooking ? (
                          displayedPayment.connectionFeeWaived ? (
                            <span
                              className="
                                text-[8px]
                                font-black
                                uppercase
                                tracking-[0.14em]
                                text-emerald-600

                                dark:text-emerald-300
                              "
                            >
                              Waived
                            </span>
                          ) : (
                            <span className="font-mono">
                              {formatMoney(
                                displayedPayment.connectionFee,
                                displayedPayment.currency,
                              )}
                            </span>
                          )
                        ) : subscribed ? (
                          <span
                            className="
                              text-[8px]
                              font-black
                              uppercase
                              tracking-[0.14em]
                              text-emerald-600

                              dark:text-emerald-300
                            "
                          >
                            Membership Waiver
                          </span>
                        ) : subscriptionLoading ? (
                          <span
                            className="
                              inline-flex
                              items-center
                              gap-1.5
                              text-[9px]
                              text-slate-400
                            "
                          >
                            <Loader2 size={11} className="animate-spin" />
                            Checking
                          </span>
                        ) : (
                          <span
                            className="
                              text-[9px]
                              font-semibold
                              text-slate-500

                              dark:text-white/35
                            "
                          >
                            Calculated by backend
                          </span>
                        )}
                      </div>

                      <div
                        className="
                          flex
                          items-end
                          justify-between
                          gap-4
                          border-t
                          border-slate-200
                          pt-4

                          dark:border-white/[0.06]
                        "
                      >
                        <div>
                          <p
                            className="
                              text-[8px]
                              font-black
                              uppercase
                              tracking-[0.18em]
                              text-slate-400

                              dark:text-white/28
                            "
                          >
                            Total Charge
                          </p>

                          <p
                            className="
                              mt-1
                              text-[9px]
                              text-slate-400

                              dark:text-white/25
                            "
                          >
                            Confirmed before card payment
                          </p>
                        </div>

                        {createdBooking || subscribed ? (
                          <strong
                            className="
                              font-mono
                              text-xl
                              text-[#98751A]

                              dark:text-[#D4AF37]
                            "
                          >
                            {formatMoney(
                              displayedPayment.totalCharged,
                              displayedPayment.currency,
                            )}
                          </strong>
                        ) : (
                          <strong
                            className="
                              text-xs
                              font-semibold
                              text-slate-500

                              dark:text-white/40
                            "
                          >
                            Finalized at checkout
                          </strong>
                        )}
                      </div>
                    </div>

                    {!subscribed && !createdBooking && !subscriptionLoading && (
                      <Link
                        to="/creator/wallet"
                        className="
                            relative
                            mt-5
                            flex
                            items-center
                            justify-center
                            gap-2
                            rounded-xl
                            border
                            border-[#D4AF37]/30
                            bg-[#D4AF37]/10
                            px-4
                            py-3
                            text-[8px]
                            font-black
                            uppercase
                            tracking-[0.17em]
                            text-[#8F7118]
                            transition

                            hover:bg-[#D4AF37]/15

                            dark:text-[#D4AF37]
                          "
                      >
                        <Sparkles size={12} />
                        Explore Creator Membership
                      </Link>
                    )}
                  </section>
                </div>

                {/* Footer */}

                <div
                  className="
                    mt-8
                    flex
                    flex-col
                    gap-5
                    border-t
                    border-slate-200
                    pt-7

                    sm:flex-row
                    sm:items-center
                    sm:justify-between

                    dark:border-white/[0.06]
                  "
                >
                  <div
                    className="
                      flex
                      max-w-xl
                      items-start
                      gap-3
                    "
                  >
                    <ShieldCheck
                      size={16}
                      className="
                        mt-0.5
                        shrink-0
                        text-emerald-500
                      "
                    />

                    <p
                      className="
                        text-xs
                        leading-5
                        text-slate-500

                        dark:text-white/35
                      "
                    >
                      Creating the contract prepares a Stripe PaymentIntent. You
                      will see the backend-confirmed total before submitting
                      your card payment.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || !selectedDesigner}
                    className="
                      inline-flex
                      h-12
                      shrink-0
                      items-center
                      justify-center
                      gap-2
                      rounded-xl
                      bg-[#D4AF37]
                      px-6
                      text-[9px]
                      font-black
                      uppercase
                      tracking-[0.18em]
                      text-black
                      shadow-[0_14px_35px_rgba(212,175,55,0.22)]
                      transition

                      hover:-translate-y-0.5
                      hover:bg-[#E4C65D]

                      disabled:cursor-not-allowed
                      disabled:bg-slate-200
                      disabled:text-slate-400
                      disabled:shadow-none

                      dark:disabled:bg-white/5
                      dark:disabled:text-white/25
                    "
                  >
                    {submitting ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : createdBooking ? (
                      <CreditCard size={15} />
                    ) : (
                      <LockKeyhole size={15} />
                    )}

                    {submitting
                      ? "Preparing Contract"
                      : createdBooking
                        ? "Continue Payment"
                        : "Review & Fund"}
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
          className="
              fixed
              inset-0
              z-[100]
              overflow-y-auto
              bg-slate-950/80
              p-4
              backdrop-blur-md

              dark:bg-black/85
            "
          onMouseDown={() => {
            if (!verifying) {
              setCheckoutOpen(false);
            }
          }}
        >
          <div
            className="
                flex
                min-h-full
                items-center
                justify-center
                py-8
              "
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Fund booking escrow"
              onMouseDown={(event) => event.stopPropagation()}
              className="
                  relative
                  w-full
                  max-w-lg
                  overflow-hidden
                  rounded-[2rem]
                  border
                  border-white/10
                  bg-white
                  p-6
                  shadow-[0_40px_120px_rgba(0,0,0,0.5)]

                  sm:p-8

                  dark:bg-[#090909]
                "
            >
              <div
                className="
                    pointer-events-none
                    absolute
                    -right-20
                    -top-20
                    h-56
                    w-56
                    rounded-full
                    bg-[#D4AF37]/15
                    blur-[70px]
                  "
              />

              <div className="relative z-10">
                <div
                  className="
                      flex
                      items-start
                      justify-between
                      gap-5
                      border-b
                      border-slate-200
                      pb-5

                      dark:border-white/[0.06]
                    "
                >
                  <div>
                    <p
                      className="
                          text-[8px]
                          font-black
                          uppercase
                          tracking-[0.2em]
                          text-[#98751A]

                          dark:text-[#D4AF37]
                        "
                    >
                      Stripe Secure Checkout
                    </p>

                    <h2
                      className="
                          mt-2
                          font-serif
                          text-3xl
                        "
                    >
                      Fund escrow
                    </h2>

                    <p
                      className="
                          mt-2
                          text-xs
                          leading-5
                          text-slate-500

                          dark:text-white/40
                        "
                    >
                      Review the final backend-confirmed amount before
                      authorizing your card.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={verifying}
                    onClick={() => setCheckoutOpen(false)}
                    aria-label="Close checkout"
                    className="
                        grid
                        h-10
                        w-10
                        shrink-0
                        place-items-center
                        rounded-xl
                        border
                        border-slate-200
                        text-slate-500
                        transition

                        hover:bg-slate-100

                        disabled:cursor-not-allowed
                        disabled:opacity-40

                        dark:border-white/10
                        dark:hover:bg-white/5
                      "
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
                      />
                    </Elements>
                  ) : (
                    <div
                      className="
                          rounded-2xl
                          border
                          border-rose-200
                          bg-rose-50
                          p-5
                          text-sm
                          leading-6
                          text-rose-700

                          dark:border-rose-400/20
                          dark:bg-rose-400/10
                          dark:text-rose-200
                        "
                    >
                      Stripe card payments are unavailable because
                      VITE_STRIPE_PUBLISHABLE_KEY is not configured.
                    </div>
                  )}
                </div>

                {verificationError && (
                  <button
                    type="button"
                    onClick={verifyEscrow}
                    disabled={verifying}
                    className="
                        mt-4
                        flex
                        h-11
                        w-full
                        items-center
                        justify-center
                        gap-2
                        rounded-xl
                        border
                        border-amber-300
                        bg-amber-50
                        text-[8px]
                        font-black
                        uppercase
                        tracking-[0.17em]
                        text-amber-800

                        disabled:opacity-50

                        dark:border-amber-400/25
                        dark:bg-amber-400/10
                        dark:text-amber-200
                      "
                  >
                    {verifying ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    Retry Escrow Verification
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
