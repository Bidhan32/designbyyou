import { useEffect, useState } from "react";
import API from "../api/axios";

export default function BookingDesignAttachment({ bookingId }) {
  return <Attachment key={bookingId} bookingId={bookingId} />;
}

function Attachment({ bookingId }) {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    API.get(`/p2p-bookings/${encodeURIComponent(bookingId)}/design-snapshot`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setSnapshot(data.data); })
      .catch(cause => {
        if (!controller.signal.aborted && cause.response?.status !== 404) setError("The attached design could not be loaded.");
      });
    return () => controller.abort();
  }, [bookingId, attempt]);
  if (error) return <div role="alert" className="mt-5 text-sm">{error} <button type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }} className="underline">Try again</button></div>;
  if (!snapshot) return null;
  const preview = snapshot.snapshot_data?.bookingPreview;
  const safePreview = typeof preview === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(preview) ? preview : null;
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot.snapshot_data)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `booking-design-${bookingId}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-white/10" aria-label="Attached design">
    <h3 className="font-semibold">Attached design</h3>
    <p className="mt-1 text-sm">{snapshot.design_title}</p>
    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Version {snapshot.source_project_version}, saved when this booking was created. Visible only to you and the other participant.</p>
    {safePreview && <img src={safePreview} alt={snapshot.design_title || "Attached Fashion Editor design"} className="mt-4 max-h-96 w-full rounded-lg bg-white object-contain" />}
    <button type="button" onClick={download} className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-white/20">Download design file</button>
    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">The file includes the saved layers and objects.</p>
  </section>;
}
