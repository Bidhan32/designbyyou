import { deadlineMessage, nextStep, paymentLabel } from "./bookingProgress";

export default function BookingNextStep({ booking, role }) {
  return <div className="mt-4 border-t border-line pt-4 text-sm">
    <h3 className="font-semibold text-ink">Next step</h3>
    <p className="mt-1 max-w-2xl leading-6 text-muted">{nextStep(booking, role)}</p>
    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
      <div><dt className="inline font-semibold">Payment: </dt><dd className="inline">{paymentLabel(booking)}</dd></div>
      <div><dt className="inline font-semibold">Deadline: </dt><dd className="inline">{deadlineMessage(booking.deadline, booking.status)}</dd></div>
    </dl>
  </div>;
}
