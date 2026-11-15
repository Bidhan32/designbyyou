const normalize = value => String(value || "").trim().toLowerCase();
const completed = new Set(["completed", "delivered"]);
const closed = new Set(["cancelled", "rejected", "refunded"]);
const paused = new Set(["refund_pending", "refund_failed", "cancellation_pending"]);

export function canCancelBooking(status) {
  return ["pending", "awaiting_payment", "funded"].includes(normalize(status));
}

export function canResumePayment(booking) {
  return ["pending", "awaiting_payment"].includes(normalize(booking.status)) &&
    !booking.escrow_locked && Boolean(booking.stripe_payment_intent_id);
}

export function paymentLabel(booking) {
  const status = normalize(booking.status);
  if (status === "refund_pending") return "Refund processing";
  if (status === "refund_failed") return "Refund needs attention";
  if (status === "refunded") return "Refunded";
  if (status === "cancellation_pending") return "Cancellation processing";
  if (completed.has(status)) return "Released";
  if (closed.has(status)) return "Closed — see payment history";
  return booking.escrow_locked === true ? "Secured" : "Not yet confirmed";
}

export function deadlineMessage(value, status, now = new Date()) {
  const stage = normalize(status);
  if (completed.has(stage)) return "Booking completed";
  if (closed.has(stage)) return "Booking closed";
  if (paused.has(stage)) return "Work paused";
  if (!value) return "No deadline set";
  // Date-only deadlines refer to a calendar day, not midnight UTC.
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "Deadline unavailable";
  const day = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(date) - day(now)) / 86400000);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} overdue`;
  return `${days} days remaining`;
}

export function nextStep(booking, role) {
  const status = normalize(booking.status), designer = role === "designer";
  if (status === "refund_failed") return "Contact support with this booking ID. Do not make another payment.";
  if (status === "refund_pending") return "Wait for refund confirmation. No further design work is needed.";
  if (status === "cancellation_pending") return "Wait for cancellation and payment checks to finish.";
  if (completed.has(status)) return designer ? "This booking is complete. Review the earnings in your wallet." : "This booking is complete. You can access the delivered files below.";
  if (closed.has(status)) return "No further work is required. Check the cancellation and payment details below.";
  if (status === "pending" || status === "funded") {
    if (designer) return "Review the brief, deadline and payment status, then accept or reject the request.";
    if (canResumePayment(booking)) return "Continue payment, or check payment status if you already paid. Do not submit another booking.";
    return "Wait for the designer to accept your request.";
  }
  if (status === "awaiting_payment") return designer ? "Wait for payment confirmation before starting work." : canResumePayment(booking) ? "Continue payment, or check payment status if you already paid." : "Refresh the booking. Contact support if payment is still unavailable.";
  if (["accepted", "progress", "final_production"].includes(status) && !booking.escrow_locked) return "Payment is not confirmed. Refresh the booking or contact support before continuing.";
  if (["accepted", "progress"].includes(status)) return designer ? "Prepare the prototype and submit it for the creator to review." : "Wait for the designer's prototype. You will review it before final production.";
  if (status === "review_prototype") return designer ? "Wait for the creator to approve the prototype or request changes." : "Review the prototype below. Approve it to begin final production, or request changes.";
  if (status === "final_production") return designer ? "Prepare and submit the final files for review." : "Wait for the final files. Payment is released when you approve completion.";
  if (["review_final", "review"].includes(status)) return designer ? "Wait for the creator's final review. They may approve completion or request changes." : "Review the final files below. Approving completion releases payment; request changes if needed.";
  return "Refresh for the latest status. Contact support if the next step remains unclear.";
}
