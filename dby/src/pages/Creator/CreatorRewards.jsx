import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import API from "../../api/axios";
import { bookingRewardBands } from "./bookingRewards";

export default function CreatorRewards() {
  const { rewardPoints } = useOutletContext();
  const [bookings, setBookings] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    API.get("/p2p-bookings/pipeline", { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) {
          setBookings(data.data.filter(booking =>
            booking.creator_reward_awarded_at && Number(booking.creator_reward_points) > 0
          ).sort((a, b) => new Date(b.creator_reward_awarded_at) - new Date(a.creator_reward_awarded_at)));
        }
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [attempt]);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 text-ink">
      <h1 className="text-2xl font-semibold">Booking rewards</h1>
      <p className="font-mono text-lg">{rewardPoints} points</p>
      <p className="text-sm text-muted">Earn points once per completed booking, on the design price after your membership discount. Booking fees are excluded. Fractional points carry forward.</p>
      <details className="rounded-md border border-line bg-surface p-3">
        <summary className="cursor-pointer text-sm font-semibold">Membership reward rates</summary>
        <table className="mt-3 w-full text-left text-sm">
          <thead><tr><th scope="col">Plan</th><th scope="col" className="text-right">Points per $1,000</th></tr></thead>
          <tbody>{bookingRewardBands.map(band => <tr key={band.label} className="border-t border-line"><td className="py-1">{band.label}</td><td className="text-right font-mono">{band.points}</td></tr>)}</tbody>
        </table>
      </details>
      <section className="rounded-md border border-line bg-surface p-4">
        <h2 className="mb-2 font-semibold">Bookings that earned points</h2>
        {failed ? <p role="alert">Booking history could not be loaded. <button className="underline" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Retry</button></p>
          : bookings === null ? <p role="status">Loading booking history…</p>
          : bookings.length === 0 ? <p className="text-sm text-muted">Your first booking that earns points will appear here after completion.</p>
          : <ul>{bookings.map(booking => (
            <li key={booking.id} className="border-t border-line">
              <Link className="flex items-center justify-between gap-3 py-3 text-sm hover:underline" to={`/creator/bookings/${booking.id}`}>
                <span>{booking.reference_design_title || booking.receiver_name || "Booking"}<small className="block font-mono text-muted">{new Date(booking.creator_reward_awarded_at).toLocaleDateString()} · {booking.id.slice(0, 8)}</small></span>
                <span className="shrink-0 font-mono">+{booking.creator_reward_points} points</span>
              </Link>
            </li>
          ))}</ul>}
      </section>
    </main>
  );
}
