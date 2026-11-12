/*
 * DesignByYou — Phase 5.1B: Fashion Editor -> Private Commission Booking
 * This component does NOT publish a design to Showcase.
 * Requires Phase 5.1A backend & booking_design_snapshots migration.
 * Uses Stripe.js from https://js.stripe.com/v3/ (no npm dependency).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import API from "/src/api/axios";
import { Link } from "react-router-dom";

const BASE = "/p2p-bookings";
const PUBLISHABLE_KEY = String(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_STRIPE_PUBLIC_KEY || "",
).trim();

const INPUT = "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400 disabled:opacity-50";
const LABEL = "mb-1.5 block text-xs font-semibold text-slate-300";
const BUTTON = "min-h-10 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";

function apiMessage(error, fallback) {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback;
}

let stripeJsPromise = null;
function loadStripeJs() {
  if (typeof window === "undefined") return Promise.reject(new Error("Stripe requires a browser."));
  if (typeof window.Stripe === "function") return Promise.resolve(window.Stripe);
  if (!stripeJsPromise) {
    stripeJsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="https://js.stripe.com/v3/"]');
      const script = existing || document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.async = true;
      const finished = () => {
        if (typeof window.Stripe !== "function") reject(new Error("Stripe.js could not initialize."));
        else resolve(window.Stripe);
      };
      script.addEventListener("load", finished, { once: true });
      script.addEventListener("error", () => reject(new Error("Stripe.js could not be loaded. Check the network or content security policy.")), { once: true });
      if (!existing) document.head.appendChild(script);
    }).catch((error) => { stripeJsPromise = null; throw error; });
  }
  return stripeJsPromise;
}

function formatDollars(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `$${number.toFixed(2)}` : "$0.00";
}

function localDeadlineAsIso(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
  const date = new Date(`${dateString}T23:59:00`);
  return Number.isNaN(date.getTime()) || date.getTime() <= Date.now() ? null : date.toISOString();
}

export default function FashionEditorBookingModal({
  open,
  onClose,
  onSaveProject,
  documentTitle = "Fashion Design",
  previewDataUrl = "",
  onComplete,
}) {
  const [designers, setDesigners] = useState([]);
  const [loadingDesigners, setLoadingDesigners] = useState(false);
  const [designerId, setDesignerId] = useState("");
  const [brief, setBrief] = useState("");
  const [price, setPrice] = useState("");
  const [deadline, setDeadline] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("details");
  const [booking, setBooking] = useState(null);
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [clientSecret, setClientSecret] = useState("");
  const [stripeReady, setStripeReady] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);
  const [verifiedPayment, setVerifiedPayment] = useState(false);
  const [stripePaymentSucceeded, setStripePaymentSucceeded] = useState(false);
  const preparedRequestRef = useRef(null);
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const paymentElementRef = useRef(null);
  const paymentHostRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setLoadingDesigners(true);
    setError("");
    API.get(`${BASE}/designers`, { signal: controller.signal })
      .then(({ data }) => {
        if (Array.isArray(data?.data)) setDesigners(data.data);
        else throw new Error("Unexpected designer directory response.");
      })
      .catch((cause) => {
        if (cause?.name !== "CanceledError" && cause?.code !== "ERR_CANCELED") {
          setError(apiMessage(cause, "Could not load approved designers."));
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingDesigners(false); });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPhase("details");
      setBooking(null);
      setClientSecret("");
      setPaymentSummary(null);
      setDesignerId("");
      setBrief("");
      setPrice("");
      setDeadline("");
      setScheduledAt("");
      setVerifiedPayment(false);
      setStripePaymentSucceeded(false);
      setError("");
      setPaymentReady(false);
      setStripeReady(false);
      preparedRequestRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open || phase !== "payment" || !clientSecret) return undefined;
    let cancelled = false;
    let paymentElement = null;
    setStripeReady(false);
    setPaymentReady(false);
    const mount = async () => {
      try {
        const Stripe = await loadStripeJs();
        if (cancelled) return;
        const stripe = Stripe(PUBLISHABLE_KEY);
        const elements = stripe.elements({
          clientSecret,
          appearance: { theme: "night", variables: { colorPrimary: "#a78bfa" } },
        });
        paymentElement = elements.create("payment", { layout: "tabs" });
        paymentElement.on("ready", () => { if (!cancelled) setPaymentReady(true); });
        paymentElement.on("change", (event) => {
          if (!cancelled) setError(event.error?.message || "");
        });
        if (!paymentHostRef.current) return;
        paymentElement.mount(paymentHostRef.current);
        stripeRef.current = stripe;
        elementsRef.current = elements;
        paymentElementRef.current = paymentElement;
        setStripeReady(true);
      } catch (cause) {
        if (!cancelled) setError(cause.message || "Could not initialize Stripe checkout.");
      }
    };
    void mount();
    return () => {
      cancelled = true;
      try { paymentElement?.destroy(); } catch { /* may have already unmounted */ }
      stripeRef.current = null;
      elementsRef.current = null;
      paymentElementRef.current = null;
    };
  }, [open, phase, clientSecret]);

  useEffect(() => {
    if (!open) return undefined;
    const escape = (event) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      event.stopPropagation();
      if (phase === "payment" && !window.confirm("Payment is still pending. Close checkout and return to this booking later?")) return;
      onClose();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [open, busy, onClose, phase]);

  const createBooking = useCallback(async (event) => {
    event?.preventDefault?.();
    if (busy) return;
    setError("");
    if (!/^pk_(test|live)_/.test(PUBLISHABLE_KEY)) {
      setError("Payments are temporarily unavailable. Please try again later.");
      return;
    }
    if (import.meta.env.DEV && !PUBLISHABLE_KEY.startsWith("pk_test_")) {
      setError("Local testing requires a Stripe test publishable key (pk_test_...).");
      return;
    }
    if (!preparedRequestRef.current) {
      if (!designerId || !designers.some((item) => item.id === designerId)) {
        setError("Select an eligible designer."); return;
      }
      if (brief.trim().length < 20) { setError("Your project brief needs at least 20 characters."); return; }
      const dollars = Number(price);
      if (!Number.isFinite(dollars) || dollars < 0.5 || Math.round(dollars * 100) < 50) {
        setError("Enter an agreed price of at least $0.50 (Stripe minimum for USD)."); return;
      }
      const deadlineIso = localDeadlineAsIso(deadline);
      if (!deadlineIso) { setError("Select a future project deadline."); return; }
      let scheduledIso = null;
      if (scheduledAt) {
        const appointment = new Date(scheduledAt);
        if (Number.isNaN(appointment.getTime()) || appointment.getTime() <= Date.now() || appointment.getTime() >= new Date(deadlineIso).getTime()) {
          setError("The optional appointment must be in the future and before the deadline."); return;
        }
        scheduledIso = appointment.toISOString();
      }
      if (!globalThis.crypto?.randomUUID) {
        setError("Your browser cannot generate a secure booking request ID."); return;
      }
      setBusy(true);
      try {
        // Always save the CURRENT canvas; never book an old cloud-project version.
        const saved = await onSaveProject(null, { silent: true, bookingPreview: previewDataUrl });
        const editorProjectId = String(saved?.id ?? "").trim();
        const version = Number(saved?.version);
        if (!/^[1-9]\d*$/.test(editorProjectId) || !Number.isInteger(version) || version < 1) {
          throw new Error("Could not save the current Fashion Editor project. No booking was created.");
        }
        // Prepared only ONCE: on a network retry, use the identical version and idempotency key.
        preparedRequestRef.current = {
          client_request_id: globalThis.crypto.randomUUID(),
          receiver_id: designerId,
          booking_type: "commission",
          editor_project_id: editorProjectId,
          editor_project_version: version,
          brief_text: brief.trim(),
          agreed_price: Number(dollars.toFixed(2)),
          deadline: deadlineIso,
          ...(scheduledIso ? { scheduled_at: scheduledIso } : {}),
        };
      } catch (cause) {
        setError(apiMessage(cause, "Could not save the design."));
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    setBusy(true);
    try {
      const { data } = await API.post(`${BASE}/create`, preparedRequestRef.current);
      if (!data?.booking?.id || !data?.clientSecret) throw new Error("Booking response has no Stripe checkout details.");
      setBooking(data.booking);
      setClientSecret(data.clientSecret);
      setPaymentSummary(data.payment || null);
      setPhase("payment");
      onComplete?.({ type: "booking_created", bookingId: data.booking.id });
    } catch (cause) {
      setError(apiMessage(cause, "Could not create a booking. Retry uses the same request ID."));
    } finally {
      setBusy(false);
    }
  }, [busy, designerId, designers, brief, price, deadline, scheduledAt, onSaveProject, onComplete, previewDataUrl]);

  const confirmPayment = useCallback(async () => {
    if (busy || !stripeRef.current || !elementsRef.current || !booking?.id || !paymentReady) return;
    setBusy(true);
    setError("");
    try {
      if (!stripePaymentSucceeded) {
        const returnUrl = new URL(window.location.href);
        returnUrl.searchParams.set("editor_booking_id", booking.id);
        const result = await stripeRef.current.confirmPayment({
          elements: elementsRef.current,
          confirmParams: { return_url: returnUrl.toString() },
          redirect: "if_required",
        });
        if (result.error) throw new Error(result.error.message || "Payment could not be completed.");
        if (result.paymentIntent?.status === "processing") {
          setError("Stripe is processing your payment. Check the booking status before retrying.");
          return;
        }
        if (result.paymentIntent?.status !== "succeeded") {
          setError("Payment has not completed. Check the payment details and try again.");
          return;
        }
        // Never reconfirm Stripe on a server/API verification retry.
        setStripePaymentSucceeded(true);
      }
      await API.post(`${BASE}/verify-escrow`, { bookingId: booking.id });
      setVerifiedPayment(true);
      setPhase("success");
      onComplete?.({ type: "payment_verified", bookingId: booking.id });
    } catch (cause) {
      // A payment may have succeeded before verification timed out. Don't start a second booking.
      setError(apiMessage(cause, "Could not verify payment. Check your booking before retrying."));
    } finally {
      setBusy(false);
    }
  }, [busy, booking, paymentReady, onComplete, stripePaymentSucceeded]);

  if (!open) return null;
  const requestClose = () => {
    if (busy) return;
    if (phase === "payment" && !window.confirm(
      `Booking ${booking?.id || ""} already exists. Payment is not verified yet. Save this booking ID and check its status before starting another. Close checkout?`,
    )) return;
    onClose();
  };
  const selectedDesigner = designers.find((item) => item.id === designerId);
  const card = "rounded-xl border border-slate-700 bg-slate-900/70 p-3";

  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6">
      <button type="button" aria-label="Close designer booking" disabled={busy} onClick={requestClose} className="absolute inset-0 cursor-default disabled:cursor-wait" />
      <section role="dialog" aria-modal="true" aria-labelledby="editor-booking-title" className="relative z-10 flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-violet-500/30 bg-slate-950 text-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 p-4 sm:p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-violet-300">Private commissioned design</p>
            <h2 id="editor-booking-title" className="mt-1 text-lg font-bold">Book a Designer</h2>
            <p className="mt-1 text-xs text-slate-400">A private copy of your design is attached to your booking. It will not be posted to Showcase.</p>
          </div>
          <button type="button" onClick={requestClose} disabled={busy} aria-label="Close designer booking" className="rounded-lg border border-slate-700 px-3 py-1.5 text-lg hover:bg-slate-800 disabled:opacity-40">×</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {error && <div role="alert" className="mb-4 rounded-lg border border-red-700 bg-red-950/50 p-3 text-xs text-red-200">{error}</div>}
          {phase === "details" && (
            <form id="editor-booking-form" onSubmit={createBooking} className="space-y-4">
              <div className={card}>
                <p className="mb-2 text-xs font-bold text-violet-300">Design attached from Fashion Editor</p>
                <div className="flex items-center gap-3">
                  {previewDataUrl ? <img src={previewDataUrl} alt="Current design preview" className="h-24 w-20 shrink-0 rounded-md bg-white object-contain" /> : null}
                  <div className="min-w-0"><p className="break-words text-sm font-semibold">{documentTitle}</p><p className="mt-1 text-xs text-slate-400">A copy of this version will be attached to the booking.</p></div>
                </div>
              </div>
              <div>
                <label htmlFor="booking-designer" className={LABEL}>Choose an approved designer *</label>
                <select id="booking-designer" required value={designerId} onChange={(event) => setDesignerId(event.target.value)} disabled={loadingDesigners || busy || !!preparedRequestRef.current} className={INPUT}>
                  <option value="">{loadingDesigners ? "Loading designers…" : "Select a designer"}</option>
                  {designers.map((designer) => <option key={designer.id} value={designer.id}>{designer.full_name || "Designer"} {designer.tier ? `(${designer.tier})` : ""}</option>)}
                </select>
                {!loadingDesigners && designers.length === 0 && <p className="mt-1 text-xs text-amber-300">No designers are available right now. Please try again later.</p>}
              </div>
              <div>
                <label htmlFor="booking-brief" className={LABEL}>What should the designer do? *</label>
                <textarea id="booking-brief" required minLength={20} maxLength={20000} rows={4} value={brief} onChange={(event) => setBrief(event.target.value)} disabled={busy || !!preparedRequestRef.current} className={INPUT} placeholder="Describe required changes, fabric, fit, dimensions, references, and deliverables…" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label htmlFor="booking-price" className={LABEL}>Agreed designer price (USD) *</label><input id="booking-price" required type="number" min="0.5" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} disabled={busy || !!preparedRequestRef.current} className={INPUT} placeholder="e.g. 100.00" /></div>
                <div><label htmlFor="booking-deadline" className={LABEL}>Project deadline *</label><input id="booking-deadline" required type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} disabled={busy || !!preparedRequestRef.current} className={INPUT} /></div>
              </div>
              <div><label htmlFor="booking-schedule" className={LABEL}>Scheduled meeting (optional)</label><input id="booking-schedule" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} disabled={busy || !!preparedRequestRef.current} className={INPUT} /></div>
              {selectedDesigner && <p className="text-xs text-slate-400">Selected: <span className="font-semibold text-slate-200">{selectedDesigner.full_name}</span>. Your booking price and deadline must already be agreed.</p>}
              <p className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-3 text-xs leading-5 text-amber-100">Creating a booking starts your existing Stripe checkout and may reserve this designer’s date. Your actual total, including any applicable connection fee, appears on the payment screen. Please confirm the price with the designer before proceeding.</p>
              {preparedRequestRef.current && <p className="text-xs text-amber-300">Retrying the same booking request and saved design version. Do not open another booking for this request.</p>}
            </form>
          )}
          {phase === "payment" && (
            <div className="space-y-4">
              <div className={card}>
                <p className="text-xs font-semibold text-violet-200">Private design booking created</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-300">Booking #{booking?.id}</p>
                <div className="mt-3 flex justify-between text-sm"><span className="text-slate-400">Designer price</span><span>{formatDollars(paymentSummary?.baseAmount)}</span></div>
                <div className="mt-1 flex justify-between text-sm"><span className="text-slate-400">Connection fee</span><span>{formatDollars(paymentSummary?.connectionFee)}</span></div>
                <div className="mt-2 flex justify-between border-t border-slate-700 pt-2 text-base font-bold"><span>Total charge</span><span>{formatDollars(paymentSummary?.totalCharged)}</span></div>
              </div>
              <div className={card}>
                <p className="mb-3 text-sm font-semibold">Secure Stripe payment</p>
                <div ref={paymentHostRef} aria-label="Stripe payment details" />
                {!stripeReady && <p className="mt-2 text-xs text-slate-400">Loading secure payment options…</p>}
              </div>
              <p className="text-xs text-amber-200">The booking exists but is not paid until Stripe confirms payment. Do not create another booking if confirmation fails; use the same booking ID for recovery.</p>
            </div>
          )}
          {phase === "success" && (
            <div className="space-y-4 py-6 text-center">
              <div className="text-4xl" aria-hidden="true">✓</div>
              <h3 className="text-xl font-semibold text-emerald-300">{verifiedPayment ? "Payment secured" : "Booking created"}</h3>
              <p className="text-sm text-slate-300">Your design is attached privately. You and your designer can view it from the booking details.</p>
              <p className="text-xs text-slate-400">Track acceptance, reviews, and delivery from your booking.</p>
            </div>
          )}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-800 p-4 sm:p-5">
          <button type="button" onClick={requestClose} disabled={busy} className={`${BUTTON} border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800`}>{phase === "success" ? "Close" : phase === "payment" ? "Close (payment pending)" : "Cancel"}</button>
          {phase === "details" && <button type="submit" form="editor-booking-form" disabled={busy || loadingDesigners || !designers.length} className={`${BUTTON} bg-violet-600 text-white hover:bg-violet-500`}>{busy ? "Saving and creating…" : "Save design & continue to payment"}</button>}
          {phase === "payment" && <button type="button" onClick={confirmPayment} disabled={busy || !paymentReady} className={`${BUTTON} bg-violet-600 text-white hover:bg-violet-500`}>{busy ? "Processing payment…" : stripePaymentSucceeded ? "Retry payment verification" : `Pay ${formatDollars(paymentSummary?.totalCharged)}`}</button>}
          {phase === "success" && <Link to={`/creator/bookings/${booking.id}`} className={`${BUTTON} bg-violet-600 text-white hover:bg-violet-500`}>View booking</Link>}
        </footer>
      </section>
    </div>
  );
}
