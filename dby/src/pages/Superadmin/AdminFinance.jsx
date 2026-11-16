import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import API from "../../api/axios";

const base = "/superadmin/finance";
const button = "min-h-9 rounded-md border border-line px-3 text-sm hover:bg-subtle disabled:opacity-50";
const input = "min-h-9 w-full rounded-md border border-line bg-surface px-2";
const tabs = { banks: "Bank verification", payouts: "Payout requests", transactions: "Transactions" };
const endpoints = { banks: "bank-accounts", payouts: "manual-payouts", transactions: "transactions" };

function amount(value, currency) {
  return `${currency || ""} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SensitiveDetails({ url, hide }) {
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const close = () => { if (document.hidden) hide(false); };
    const timeout = window.setTimeout(() => hide(false), 60000);
    document.addEventListener("visibilitychange", close);
    API.get(url, { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setDetails(data.data.bank_details);
    }).catch(err => {
      if (!controller.signal.aborted) setError(err.response?.data?.message || "Unable to retrieve transfer details.");
    });
    return () => {
      controller.abort();
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", close);
    };
  }, [url, hide]);
  return <div className="space-y-2 rounded-md border border-line p-3">
    {error ? <p role="alert">{error}</p> : !details ? <p>Loading bank details…</p> :
      <dl className="grid gap-2 sm:grid-cols-2">{Object.entries(details).filter(([,v]) => v).map(([key,value]) =>
        <div key={key}><dt className="capitalize text-muted">{key.replaceAll("_"," ")}</dt><dd className="break-all font-mono">{value}</dd></div>)}</dl>}
    <button className={button} onClick={() => hide(false)}>Close bank details</button>
  </div>;
}

function Review({ row, banks, onSaved }) {
  const [reveal, setReveal] = useState(false);
  const [action, setAction] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = row.status === "pending";
  const processing = row.status === "processing";
  const actions = banks ? { verified: "Verify account", rejected: "Reject account" } : {
    ...(pending ? { processing: "Start processing" } : {}),
    ...(processing ? { complete: "Record completed transfer" } : {}),
    ...((pending || processing) && !row.provider_transaction_id ? { fail: "Record failed payout" } : {}),
  };
  function select(next) {
    setAction(next); setConfirmed(false); setNote(""); setError(""); setReveal(false);
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      if (banks) {
        await API.patch(`${base}/bank-accounts/${row.id}/verification`, { status: action, review_version: row.review_version, ...(action === "rejected" ? { reason: note.trim() } : {}) });
      } else {
        const payload = action === "complete" ? { transfer_reference: note.trim() }
          : action === "fail" ? { reason: note.trim(), funds_sent: false } : {};
        const { data } = await API.post(`${base}/manual-payouts/${row.id}/${action}`, payload);
        if (data.idempotent) return onSaved(data.message || "This payout was already updated.");
      }
      onSaved(banks ? `Bank account ${action}.` : "Payout updated.");
    } catch (err) {
      if (err.response?.status === 409) return onSaved(err.response.data?.message || "The record changed. The queue has been refreshed.");
      setError(err.response?.data?.message || "Unable to confirm the update. Refresh to check its status.");
    } finally { setBusy(false); }
  }
  const url = banks ? `${base}/bank-accounts/${row.id}?version=${encodeURIComponent(row.review_version)}` : `${base}/manual-payouts/${row.id}`;
  return <div className="mt-3 space-y-3 border-t border-line pt-3">
    <p className="break-all font-mono text-xs">{row.id}</p>
    {row.failure_reason && <p>Reason: {row.failure_reason}</p>}
    {row.provider_transaction_id && <p>Transfer reference: {row.provider_transaction_id}</p>}
    {row.bank_account_snapshot_warning && <p role="alert">{row.bank_account_snapshot_warning}</p>}
    {!action && <div className="flex flex-wrap gap-2">
      {(banks || (processing && row.bank_account_snapshot_consistent)) && !reveal &&
        <button className={button} onClick={() => setReveal(true)}>View bank details</button>}
      {Object.entries(actions).map(([key,label]) => <button key={key} className={button} onClick={() => select(key)}>{label}</button>)}
    </div>}
    {reveal && <SensitiveDetails url={url} hide={setReveal} />}
    {action && <form className="max-w-lg space-y-3" onSubmit={submit}>
      <h3 className="font-semibold">{actions[action]}</h3>
      {action === "rejected" && <label className="block">Reason shown to designer
        <textarea className={input} required minLength={3} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>}
      {(action === "complete" || action === "fail") && <label className="block">{action === "complete" ? "Bank transfer reference" : "Reason for failure"}
        <input className={input} required minLength={3} maxLength={action === "complete" ? 160 : 1000} value={note} onChange={e => setNote(e.target.value)} /></label>}
      <label className="flex items-start gap-2"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
        {action === "complete" ? "I confirmed the external bank transfer was sent." : action === "fail" ? "I confirmed no funds were sent. Restore the reserved amount to the designer’s wallet." :
          banks ? "I reviewed this account and confirm this decision." : "I am taking this payout for processing."}</label>
      <div className="flex gap-2"><button className={button} disabled={!confirmed || busy}>{busy ? "Saving…" : "Confirm"}</button>
        <button type="button" className={button} disabled={busy} onClick={() => select("")}>Cancel</button></div>
    </form>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

function Queue({ tab }) {
  const [status, setStatus] = useState("pending");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(null);
  function refresh() {
    setRows(null); setError(""); setOpen(null); setRevision(n => n+1);
  }
  useEffect(() => {
    const controller = new AbortController();
    API.get(`${base}/${endpoints[tab]}`, { params: { limit: 25, offset, ...(tab === "payouts" ? { status } : {}) }, signal: controller.signal })
      .then(({ data }) => {
        if (!Array.isArray(data.data)) throw new Error("Unexpected queue response");
        if (!controller.signal.aborted) setRows(data.data);
      }).catch(err => {
        if (!controller.signal.aborted) setError(err.response?.data?.message || "Unable to load this list.");
      });
    return () => controller.abort();
  }, [tab, status, offset, revision]);
  return <section className="space-y-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      {tab === "payouts" ? <label>Status <select className={button} value={status} onChange={e => { setStatus(e.target.value); setOffset(0); refresh(); }}>
        {["pending","processing","completed","failed","cancelled"].map(s => <option key={s}>{s}</option>)}</select></label> :
        <h2 className="font-semibold">{tab === "banks" ? "Awaiting verification" : "Transaction history"}</h2>}
      <button className={button} onClick={refresh}>Refresh</button>
    </div>
    {message && <p role="status">{message}</p>}
    {error ? <p role="alert">{error}</p> : rows === null ? <p role="status">Loading…</p> : !rows.length ? <p>No records on this page.</p> :
      <ul className="divide-y divide-line rounded-md border border-line bg-surface">{rows.map(row =>
        <li className="p-3" key={row.id}>{tab === "transactions" ? <>
          <p className="font-medium">{row.transaction_type} · {amount(row.gross_amount,row.currency)}</p>
          <p className="break-all font-mono text-xs text-muted">{new Date(row.created_at).toLocaleString()} · {row.id}</p>
        </> : <>
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0">
            <p className="font-semibold">{row.full_name}</p><p className="break-all text-muted">{row.email}</p>
            {tab === "banks" ? <p>{row.account_holder_name} · {row.bank_name} · {row.country_code} · {row.currency} · ending {row.iban_last4 || row.account_number_last4 || "unavailable"}</p> :
              <p>{amount(row.amount,row.currency)} · {row.destination_summary} · {row.status}</p>}
          </div><button className={button} aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? null : row.id)}>{open === row.id ? "Close" : "Review"}</button></div>
          {open === row.id && <Review row={row} banks={tab === "banks"} onSaved={msg => { setMessage(msg); refresh(); }} />}
        </>}</li>)}</ul>}
    {(offset > 0 || rows?.length === 25) && <div className="flex items-center gap-2">
      <button className={button} disabled={!offset} onClick={() => { setOffset(offset-25); refresh(); }}>Previous</button>
      <span>Page {offset/25+1}</span><button className={button} disabled={rows?.length !== 25} onClick={() => { setOffset(offset+25); refresh(); }}>Next</button>
    </div>}
  </section>;
}

export default function AdminFinance() {
  const [params] = useSearchParams();
  const tab = Object.hasOwn(tabs, params.get("tab")) ? params.get("tab") : "banks";
  return <main className="mx-auto max-w-5xl space-y-4 text-ink">
    <h1 className="text-xl font-semibold">Finance</h1>
    <nav aria-label="Finance" className="flex flex-wrap gap-2">{Object.entries(tabs).map(([key,label]) =>
      <Link key={key} to={`?tab=${key}`} aria-current={tab === key ? "page" : undefined} className={button + " inline-flex items-center " + (key === tab ? "bg-subtle font-semibold" : "")}>{label}</Link>)}</nav>
    <Queue key={tab} tab={tab} />
  </main>;
}
