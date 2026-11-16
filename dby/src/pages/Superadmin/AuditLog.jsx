import { useEffect, useState } from "react";
import API from "../../api/axios";

const actions = {
  designer_review: "Designer application",
  account_status: "Account status",
  account_role: "Account role",
  bank_verification: "Bank verification",
  manual_payout: "Manual payout",
};
const control = "min-h-9 rounded-md border border-line bg-surface px-3 text-sm";

function Results({ query, action }) {
  const [cursors, setCursors] = useState([null]);
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const before = cursors.at(-1);
  useEffect(() => {
    const controller = new AbortController();
    API.get("/superadmin/activity", { params: { q: query, action, before }, signal: controller.signal })
      .then(({ data }) => {
        if (!Array.isArray(data.data)) throw new Error("Invalid activity response");
        if (!controller.signal.aborted) setPage(data);
      }).catch(() => {
        if (!controller.signal.aborted) setError("Unable to load activity.");
      });
    return () => controller.abort();
  }, [query, action, before, revision]);
  function move(next) {
    setPage(null);
    setError("");
    setCursors(next);
  }
  if (error) return <div role="alert">{error} <button className={control} onClick={() => { setError(""); setRevision(n => n+1); }}>Retry</button></div>;
  if (!page) return <p role="status">Loading activity…</p>;
  return <>
    {page.data.length === 0 ? <p>No matching activity.</p> :
      <ol className="divide-y divide-line rounded-md border border-line bg-surface">{page.data.map(event =>
        <li key={event.id} className="grid gap-2 p-3 text-sm sm:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <strong>{actions[event.action]}</strong> · {event.previous_value || "Unset"} → {event.new_value}
            <p>By {event.actor_name || "Administrator"} <span className="break-all font-mono text-xs text-muted">{event.actor_id}</span></p>
            <p className="break-all text-muted">Target ID <span className="font-mono text-xs">{event.target_id}</span></p>
          </div>
          <time dateTime={event.occurred_at} className="font-mono text-xs text-muted">{new Date(event.occurred_at).toLocaleString()}</time>
        </li>)}</ol>}
    {(cursors.length > 1 || page.next) && <div className="flex items-center gap-2 text-sm">
      <button className={control} disabled={cursors.length === 1} onClick={() => move(cursors.slice(0,-1))}>Previous</button>
      Page {cursors.length}
      <button className={control} disabled={!page.next} onClick={() => move([...cursors,page.next])}>Next</button>
    </div>}
  </>;
}

export default function AuditLog() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const [revision, setRevision] = useState(0);
  return <section className="mx-auto max-w-5xl space-y-3 text-ink">
    <h1 className="text-xl font-semibold">Admin activity</h1>
    <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); setQuery(input.trim()); setRevision(n => n+1); }}>
      <input type="search" className={control + " min-w-0 flex-auto"} placeholder="Admin name, admin ID or target ID"
        aria-label="Search by admin name, admin ID or target ID" maxLength={120} value={input} onChange={e => setInput(e.target.value)} />
      <select className={control} aria-label="Action type" value={action} onChange={e => setAction(e.target.value)}>
        <option value="">All actions</option>{Object.entries(actions).map(([id,label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <button className={control}>Search</button>
    </form>
    <Results key={JSON.stringify([query, action, revision])} query={query} action={action} />
  </section>;
}
