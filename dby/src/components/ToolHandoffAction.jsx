import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { destinations, prepareHandoff, toolPath } from "./toolHandoff";

export default function ToolHandoffAction({ options, owner }) {
  const navigate = useNavigate();
  const [view, setView] = useState("");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = options.find(option => option.label === view) || options[0];
  async function open() {
    setBusy(true);
    setError("");
    try {
      const id = await prepareHandoff(selected.src, owner, destination);
      navigate(toolPath(destination), { state: { handoff: id } });
    } catch {
      setError("Could not open this image. Download it and upload it in the next tool.");
    } finally { setBusy(false); }
  }
  return <details className="rounded-md border border-line p-3">
    <summary className="cursor-pointer font-semibold">Use in another tool</summary>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {options.length > 1 && <select aria-label="Result to use" className="bg-surface p-2" value={selected.label} onChange={e => setView(e.target.value)}>
        {options.map(v => <option key={v.label}>{v.label}</option>)}
      </select>}
      <select aria-label="Destination tool" className="bg-surface p-2" value={destination} onChange={e => setDestination(e.target.value)}>
        <option value="">Choose a tool</option>
        {Object.entries(destinations).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <button type="button" className="rounded-md border border-line px-3 py-2" disabled={busy || !destination} onClick={open}>{busy ? "Preparing image…" : "Open tool"}</button>
    </div>
    {error && <p role="alert">{error}</p>}
  </details>;
}
