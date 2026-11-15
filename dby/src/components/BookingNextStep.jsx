import { deadlineMessage, nextStep, paymentLabel } from "./bookingProgress";

export default function BookingNextStep({ booking, role }) {
  return <div className="mt-4 border-t border-slate-200 pt-4 text-sm dark:border-white/10">
    <h3 className="font-semibold text-slate-900 dark:text-white">Next step</h3>
    <p className="mt-1 max-w-2xl leading-6 text-slate-600 dark:text-slate-300">{nextStep(booking, role)}</p>
    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
      <div><dt className="inline font-semibold">Payment: </dt><dd className="inline">{paymentLabel(booking)}</dd></div>
      <div><dt className="inline font-semibold">Deadline: </dt><dd className="inline">{deadlineMessage(booking.deadline, booking.status)}</dd></div>
    </dl>
  </div>;
}
