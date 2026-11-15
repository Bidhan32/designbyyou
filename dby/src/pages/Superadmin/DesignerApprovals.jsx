import { useEffect, useState } from "react";
import API from "../../api/axios";

const button = "h-9 rounded-md border border-line px-3 text-sm hover:bg-subtle disabled:opacity-50";

function portfolioLink(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export default function DesignerApprovals() {
  const [applications, setApplications] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    API.get("/superadmin/pending-designers", { signal: controller.signal }).then(({ data }) => {
      if (!Array.isArray(data.data)) throw new Error("Invalid queue");
      if (!controller.signal.aborted) setApplications(data.data);
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError("Unable to load applications.");
    });
    return () => controller.abort();
  }, [revision]);

  function refresh() {
    setApplications(null);
    setLoadError("");
    setRevision(n => n + 1);
  }

  async function review(person, status) {
    if (status === "rejected" && !window.confirm(`Reject the application from ${person.full_name}?`)) return;
    setBusy(person.id);
    setFeedback("");
    try {
      await API.patch(`/superadmin/update-status/${person.id}`, { status, reviewApplication: true });
      setApplications(rows => rows.filter(row => row.id !== person.id));
      setFeedback(`${person.full_name}: application ${status}.`);
    } catch (error) {
      setFeedback(error.response?.data?.message || "Unable to save the decision. Try again.");
      if (error.response?.status === 409) refresh();
    } finally {
      setBusy(null);
    }
  }

  return <section className="mx-auto max-w-4xl space-y-3 text-ink">
    <h1 className="text-xl font-semibold">Designer approvals</h1>
    <p role="status" className="text-sm">{feedback}</p>
    {loadError ? <div role="alert">{loadError} <button className={button} onClick={refresh}>Retry</button></div>
      : applications === null ? <p>Loading applications…</p>
      : applications.length === 0 ? <p className="rounded-md border border-line p-4">No pending applications.</p>
      : applications.map(person => {
        const portfolio = portfolioLink(person.portfolio_url);
        return <article key={person.id} className="space-y-2 rounded-md border border-line bg-surface p-4 text-sm">
          <h2 className="font-semibold">{person.full_name}</h2>
          <p className="break-words">{person.email} · {person.is_email_verified ? "Email verified" : "Email unverified"}</p>
          <p className="text-muted">Applied <time dateTime={person.created_at} className="tabular-nums">{new Date(person.created_at).toLocaleDateString()}</time>
            {person.country && ` · ${[person.city, person.country].filter(Boolean).join(", ")}`}</p>
          {person.bio && <p className="break-words">{person.bio}</p>}
          {portfolio ? <a href={portfolio} target="_blank" rel="noopener noreferrer" className="underline">View portfolio</a> : <p className="text-muted">Portfolio unavailable</p>}
          <div className="flex gap-2">
            <button className="h-9 rounded-md bg-action px-3 text-on-action disabled:opacity-50" disabled={busy !== null} onClick={() => review(person, "approved")}>Approve</button>
            <button className={button} disabled={busy !== null} onClick={() => review(person, "rejected")}>Reject</button>
          </div>
        </article>;
      })}
  </section>;
}
