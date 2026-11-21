import ToolHandoffAction from "./ToolHandoffAction";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/axios";
import { useAuth } from "../context/AuthContext.helpers.js";

async function preview(src) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = src;
  await image.decode();
  for (const side of [1280, 960, 640, 400, 256]) {
    const scale = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", 0.88);
    // Browsers without a WebP canvas encoder return PNG, including its transparency.
    if (/^data:image\/(webp|png);base64,/.test(data) && data.length <= 380000) return data;
  }
  throw new Error("Preview unavailable");
}

export default function ToolBookingAction({ tool, src, views, bookingUrl, bookingId, onSaved }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [excluded, setExcluded] = useState([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const options = (views || [{ label: "Result", src }]).filter(view => view.src);
  if (!options.length || !user?.id) return null;
  const selected = options.filter(view => !excluded.includes(view.label));
  const personal = tool === "Virtual Try-On";
  async function attach() {
    setBusy(true);
    setMessage("");
    try {
      const images = await Promise.all(selected.map(async view => ({ label: view.label, src: await preview(view.src) })));
      const reference = { tool, images };
      if (bookingId) {
        await API.put(`/p2p-bookings/${encodeURIComponent(bookingId)}/try-on-reference`, { reference });
        onSaved?.();
        setMessage("Try-on reference saved to this booking.");
      } else {
        const id = crypto.randomUUID();
        sessionStorage.setItem("booking-tool:" + user.id, JSON.stringify({ id, reference }));
        const destination = new URL(bookingUrl || "/creator/bookings/new", window.location.origin);
        destination.searchParams.set("tool_draft", id);
        navigate(destination.pathname + destination.search);
      }
    } catch (err) {
      const fallback = err.name === "QuotaExceededError"
        ? "Your browser has run out of space to save this booking draft."
        : bookingId ? "Could not save the reference to this booking. Please try again."
          : "Could not prepare the image or save the booking draft in this browser. Please try again.";
      setMessage(err.response?.data?.message || fallback);
    } finally { setBusy(false); }
  }
  return <div className="my-3 space-y-2 text-sm">
    {user.role === "creator" && <ToolHandoffAction options={options} owner={user.id} />}
    {views && <fieldset><legend className="text-xs font-semibold">Views to share with the designer</legend>
      <div className="flex flex-wrap gap-3">{options.map(({ label }) => <label key={label}>
        <input type="checkbox" checked={!excluded.includes(label)} onChange={e => setExcluded(e.target.checked ? excluded.filter(v => v !== label) : [...excluded, label])} /> {label}
      </label>)}</div></fieldset>}
    {personal && <label className="block"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> Share this generated try-on image with the designer</label>}
    <button type="button" disabled={busy || !selected.length || (personal && !consent)} onClick={attach}
      className="min-h-9 rounded-md bg-action px-4 py-2 text-sm font-semibold text-on-action disabled:opacity-50">
      {busy ? "Preparing reference…" : bookingId ? "Save as booking try-on reference" : "Book a designer"}
    </button>
    {message && <p role="status">{message}</p>}
  </div>;
}
