"use strict";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, Clock3, Download, ExternalLink, ImagePlus,
  Images, Loader2, RefreshCw, Sparkles, Trash2, X,
} from "lucide-react";
import API from "../../api/axios";

const ENDPOINT = "/creators/ai/multi-view";
const ACTIVE = new Set(["submitting", "processing"]);
const MODES = [
  ["fast", "Fast · 1 credit per generated view"],
  ["balanced", "Balanced · 2 credits per generated view"],
  ["quality", "Quality · 3 credits per generated view"],
];
function isActive(job) { return Boolean(job && ACTIVE.has(job.status)); }
function errorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}
function dateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}
function statusLabel(status) {
  return {
    submitting: "Submitting", processing: "Generating",
    saving: "Saving", completed: "Ready", partial: "Partial result", failed: "Failed",
  }[status] || "Preparing";
}

function UploadBox({ id, label, help, file, preview, disabled, inputRef, onChange, optional }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-xs font-bold uppercase tracking-wider">
        {label}{optional ? <span className="ml-1 font-normal normal-case text-slate-400">(optional)</span> : null}
      </label>
      <label htmlFor={id} className={`flex min-h-48 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#cbb376]/70 bg-[#e5c67d]/5 transition hover:bg-[#e5c67d]/10 ${disabled ? "pointer-events-none opacity-60" : ""}`}>
        {preview ? (
          <img src={preview} alt={`${label} preview`} className="max-h-60 w-full object-contain" />
        ) : (
          <div className="px-5 py-8 text-center text-slate-500 dark:text-white/60">
            <ImagePlus size={30} className="mx-auto mb-3 text-[#ac8534]" />
            <p className="text-sm font-semibold">Choose an image</p>
            <p className="mt-2 text-xs">JPG, PNG, WebP · up to 8 MB</p>
          </div>
        )}
      </label>
      <input id={id} ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp"
        className="sr-only" disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0] || null)} />
      <div className="mt-2 flex items-start justify-between gap-2 text-xs text-slate-500 dark:text-white/50">
        <span>{help}</span>
        {file && <span className="max-w-28 truncate text-[#ab802c]">{file.name}</span>}
      </div>
    </div>
  );
}

function ViewCard({ title, subtitle, url, state, error, onOpen, onDownload }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-[#101010]">
      <div className="flex items-center justify-between gap-2 p-3">
        <strong className="text-sm">{title}</strong>
        <span className="text-[11px] capitalize text-slate-400">{subtitle || statusLabel(state)}</span>
      </div>
      <div className="flex aspect-[3/4] items-center justify-center bg-slate-100 dark:bg-[#0b0b0b]">
        {url ? <img src={url} alt={`${title} view`} className="h-full w-full object-contain" /> : (
          <div className="px-3 text-center text-xs text-slate-500 dark:text-white/50">
            {!["failed", "completed"].includes(state) ? <Loader2 size={22} className="mx-auto mb-2 animate-spin text-[#ab802c]" /> : <Images size={22} className="mx-auto mb-2" />}
            {error || (state === "failed" ? "Generation failed" : "View pending")}
          </div>
        )}
      </div>
      {url && onOpen && <div className="grid grid-cols-2 gap-2 p-2">
        <button type="button" onClick={onOpen} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-semibold dark:border-white/15"><ExternalLink size={13} /> View</button>
        <button type="button" onClick={onDownload} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg bg-[#e5c67d] px-2 text-xs font-semibold text-[#17130b]"><Download size={13} /> Download</button>
      </div>}
    </div>
  );
}

export default function CreatorMultiViewGenerator() {
  const [source, setSource] = useState(null);
  const [context, setContext] = useState(null);
  const [sourcePreview, setSourcePreview] = useState("");
  const [contextPreview, setContextPreview] = useState("");
  const [subject, setSubject] = useState("garment");
  const [mode, setMode] = useState("fast");
  const [keepBackground, setKeepBackground] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [consent, setConsent] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [job, setJob] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [progressError, setProgressError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const requestKey = useRef(null);
  const sourceInput = useRef(null);
  const contextInput = useRef(null);

  useEffect(() => {
    if (!source) { setSourcePreview(""); return undefined; }
    const url = URL.createObjectURL(source);
    setSourcePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);
  useEffect(() => {
    if (!context) { setContextPreview(""); return undefined; }
    const url = URL.createObjectURL(context);
    setContextPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [context]);

  const refreshHistory = useCallback(async () => {
    const response = await API.get(`${ENDPOINT}/history`);
    const items = Array.isArray(response.data?.data) ? response.data.data : [];
    setHistory(items);
    setHistoryError("");
    return items;
  }, []);
  useEffect(() => {
    let mounted = true;
    API.get(`${ENDPOINT}/history`).then(response => {
      if (!mounted) return;
      const items = Array.isArray(response.data?.data) ? response.data.data : [];
      setHistory(items);
      setJob(items.find(isActive) || items[0] || null);
    }).catch(err => {
      if (mounted) setHistoryError(errorMessage(err, "Could not load history."));
    }).finally(() => { if (mounted) setHistoryLoading(false); });
    return () => { mounted = false; };
  }, []);

  const activeJob = history.find(isActive) || (isActive(job) ? job : null);
  const activeJobId = activeJob?.id || null;
  const busy = Boolean(generating || activeJobId);

  useEffect(() => {
    if (!activeJobId) return undefined;
    let alive = true;
    let timer;
    const poll = async () => {
      try {
        const response = await API.get(`${ENDPOINT}/${encodeURIComponent(activeJobId)}`);
        const latest = response.data?.data;
        if (!alive || !latest) return;
        setHistory(old => old.some(item => item.id === latest.id)
          ? old.map(item => item.id === latest.id ? latest : item)
          : [latest, ...old]);
        setJob(old => old?.id === latest.id ? latest : old);
        setProgressError("");
        if (!isActive(latest)) {
          try { await refreshHistory(); } catch { /* Final status is already in the UI. */ }
          return;
        }
      } catch (err) {
        if (alive) setProgressError(errorMessage(err, "Could not check generation status. Retrying..."));
      }
      if (alive) timer = setTimeout(poll, 4000);
    };
    timer = setTimeout(poll, 1500);
    return () => { alive = false; clearTimeout(timer); };
  }, [activeJobId, refreshHistory]);

  const updateFile = (kind, selected) => {
    if (busy) return;
    if (!selected && kind === "context") {
      setContext(null); requestKey.current = null; setError(""); return;
    }
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type) ||
        selected.size < 32 || selected.size > 8 * 1024 * 1024) {
      setError("Choose a JPG, PNG or WebP image no larger than 8 MB.");
      return;
    }
    if (kind === "source") setSource(selected);
    else setContext(selected);
    requestKey.current = null;
    setError("");
  };

  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    if (!source) return setError("Upload a front-view garment or model image first.");
    if (!consent) return setError("Confirm that you own or have permission to use the uploaded images.");
    setGenerating(true);
    setError(""); setProgressError("");
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    const form = new FormData();
    form.append("source_image", source);
    if (context) form.append("context_image", context);
    form.append("subject_type", subject);
    form.append("generation_mode", mode);
    form.append("keep_background", String(keepBackground));
    form.append("instruction", instruction.trim());
    form.append("request_key", requestKey.current);
    form.append("consent", "true");
    try {
      // Do not set multipart Content-Type: the browser supplies its boundary.
      const response = await API.post(ENDPOINT, form);
      const created = response.data?.data;
      if (!created?.id) throw new Error("Multi-view response was incomplete.");
      requestKey.current = null;
      setJob(created);
      setHistory(old => [created, ...old.filter(item => item.id !== created.id)]);
      try { await refreshHistory(); } catch { /* Poll returned job. */ }
    } catch (err) {
      const recorded = err?.response?.data?.data;
      if (recorded?.id) {
        // Provider submission can be partially successful: don't issue a new paid job.
        setJob(recorded);
        setHistory(old => [recorded, ...old.filter(item => item.id !== recorded.id)]);
        requestKey.current = null;
      }
      setError(errorMessage(err, "Could not start the multi-view generation."));
    } finally { setGenerating(false); }
  };

  const clearNew = () => {
    if (busy) return;
    setJob(null); setSource(null); setContext(null);
    setSubject("garment"); setMode("fast"); setKeepBackground(false);
    setInstruction(""); setConsent(false); setError(""); setProgressError("");
    requestKey.current = null;
    if (sourceInput.current) sourceInput.current.value = "";
    if (contextInput.current) contextInput.current.value = "";
  };
  const selectJob = async entry => {
    setJob(entry); setError("");
    try {
      const response = await API.get(`${ENDPOINT}/${encodeURIComponent(entry.id)}`);
      const current = response.data?.data;
      if (current) {
        setJob(current);
        setHistory(old => old.map(item => item.id === current.id ? current : item));
      }
    } catch { /* History URLs may remain valid for up to 15 minutes. */ }
  };
  const openOriginal = async (entry) => {
    const windowRef = window.open("", "_blank");
    try {
      const response = await API.get(`${ENDPOINT}/${encodeURIComponent(entry.id)}`);
      const url = response.data?.data?.source?.image_url;
      if (!url) throw new Error("Original upload is unavailable.");
      if (windowRef) windowRef.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      windowRef?.close();
      setError(errorMessage(err, "Could not open the original image."));
    }
  };
  const openAsset = async (entry, key, download = false) => {
    const windowRef = window.open("", "_blank");
    try {
      const response = await API.get(`${ENDPOINT}/${encodeURIComponent(entry.id)}`);
      const result = response.data?.data;
      const target = key === "front" ? result?.front : result?.views?.[key];
      const url = download ? target?.download_url : target?.image_url;
      if (!url) throw new Error("This view is not yet available.");
      if (windowRef) windowRef.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      windowRef?.close();
      setError(errorMessage(err, "Could not open the saved image."));
    }
  };
  const remove = async entry => {
    if (isActive(entry) || deletingId) return;
    if (!window.confirm("Permanently delete this multi-view set and its stored images?")) return;
    setDeletingId(entry.id);
    try {
      await API.delete(`${ENDPOINT}/${encodeURIComponent(entry.id)}`);
      setHistory(old => old.filter(item => item.id !== entry.id));
      if (job?.id === entry.id) setJob(null);
    } catch (err) { setError(errorMessage(err, "Could not delete this set.")); }
    finally { setDeletingId(null); }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-[#090909] dark:text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Link to="/creator/tools" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-[#ae852e] dark:text-white/60">
          <ArrowLeft size={16} /> Back to Creative Hub
        </Link>
        <header className="mt-7 flex items-start gap-4">
          <div className="rounded-2xl bg-[#e5c67d]/20 p-3 text-[#ab802c]"><Images size={27} /></div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#a78032] dark:text-[#e5c67d]">FASHN AI · Creative tools</p>
            <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Front, Side &amp; Back Views</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-white/55">Create matching product-only front, right-side and back garment views, or keep the person for on-model views. Garment-only mode first extracts a standalone front product view before rotating it.</p>
          </div>
        </header>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(310px,0.9fr)_minmax(0,1.55fr)]">
          <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151515] sm:p-6">
            <div className="flex items-center gap-2"><Sparkles size={18} className="text-[#b38a35]" /><h2 className="font-serif text-xl">Configure your views</h2></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <UploadBox id="mv-source" label="Front / original image" help="Your source of truth for garment details." file={source} preview={sourcePreview} disabled={busy} inputRef={sourceInput} onChange={f => updateFile("source", f)} />
              <div>
                <UploadBox id="mv-context" label="Additional reference" help="Extra visual guidance for garment extraction. Side and back are generated from the isolated front." file={context} preview={contextPreview} optional disabled={busy} inputRef={contextInput} onChange={f => updateFile("context", f)} />
                {context && <button type="button" disabled={busy} onClick={() => { setContext(null); requestKey.current = null; if (contextInput.current) contextInput.current.value = ""; }} className="mt-2 text-xs font-semibold text-red-600 disabled:opacity-50">Remove reference</button>}
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="mv-subject" className="block text-xs font-bold uppercase tracking-wider">Generation type</label>
                <select id="mv-subject" value={subject} disabled={busy} onChange={e => { setSubject(e.target.value); if (e.target.value === "garment") setKeepBackground(false); requestKey.current = null; }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-[#202020]">
                  <option value="garment">Garment only</option>
                  <option value="model">Model wearing garment</option>
                </select>
              </div>
              <div>
                <label htmlFor="mv-mode" className="block text-xs font-bold uppercase tracking-wider">AI quality · 1K</label>
                <select id="mv-mode" value={mode} disabled={busy} onChange={e => { setMode(e.target.value); requestKey.current = null; }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-[#202020]">
                  {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
            <label className="mt-5 flex items-center gap-3 text-sm">
              <input type="checkbox" checked={subject === "garment" ? false : keepBackground} disabled={busy || subject === "garment"} onChange={e => { setKeepBackground(e.target.checked); requestKey.current = null; }} className="accent-[#b38a35]" /> Keep original background
            </label>
            {subject === "garment" && <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-white/55">Garment-only uses the same neutral product-photo background in all three views. People and mannequins are excluded from the requested results.</p>}
            <label htmlFor="mv-instruction" className="mt-5 block text-xs font-bold uppercase tracking-wider">Additional instructions (optional)</label>
            <textarea id="mv-instruction" rows={4} maxLength={500} value={instruction} disabled={busy} onChange={e => { setInstruction(e.target.value); requestKey.current = null; }} placeholder="Extract only the gray blazer (not the black turtleneck). Preserve its exact check pattern, collar, buttons, pockets and seams..." className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 outline-none focus:border-[#c9a14c] dark:border-white/10 dark:bg-[#0d0d0d]" />
            <p className="mt-2 text-xs text-slate-400">{instruction.length}/500 characters</p>
            <label className="mt-5 flex items-start gap-3 text-xs leading-5 text-slate-600 dark:text-white/65">
              <input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} className="mt-1 accent-[#b38a35]" />
              <span>I own or have permission to use these images. I understand that uploaded references and generated views are stored in protected Creator history and processed by FASHN.</span>
            </label>
            <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-white/55">{subject === "garment" ? "Garment-only creates three AI views (front extraction, side and back). Fast: 3 credits · Balanced: 6 · Quality: 9 at 1K." : "On-model uses the original front plus two AI views. Fast: 2 credits · Balanced: 4 · Quality: 6 at 1K."} Testing limit: 5 sets per rolling 24 hours unless changed on the server.</p>
            {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
            <button type="submit" disabled={busy || !source || !consent} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e5c67d] px-5 text-sm font-bold text-[#17130b] transition hover:bg-[#f4d995] disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {generating ? "Submitting views..." : activeJobId ? "Generation in progress" : subject === "garment" ? "Generate 3 Garment Views" : "Generate Side & Back Views"}
            </button>
          </form>

          <section aria-label="Generated multi-view result" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151515] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-serif text-xl">Your three views</h2>
              <div className="flex flex-wrap items-center gap-2">
                {job && <button type="button" onClick={clearNew} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#d7b66b] px-3 text-xs font-semibold text-[#997325] disabled:opacity-50 dark:text-[#e5c67d]"><RefreshCw size={14} /> Clear &amp; Create New</button>}
                {job && <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-slate-100 px-3 text-xs dark:bg-white/10">{job.status === "completed" ? <CheckCircle2 size={14} /> : job.status === "failed" ? <X size={14} /> : <Clock3 size={14} />}{statusLabel(job.status)}</span>}
              </div>
            </div>
            {job ? (
              <>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <ViewCard title="Front" subtitle={job.front_generated ? undefined : "Original"} url={job.front?.image_url} state={job.front_status || "completed"} error={job.front_error} onOpen={() => openAsset(job, "front")} onDownload={() => openAsset(job, "front", true)} />
                  <ViewCard title="Right Side" url={job.views?.side?.image_url} state={job.views?.side?.status} error={job.views?.side?.error_message} onOpen={() => openAsset(job, "side")} onDownload={() => openAsset(job, "side", true)} />
                  <ViewCard title="Back" url={job.views?.back?.image_url} state={job.views?.back?.status} error={job.views?.back?.error_message} onOpen={() => openAsset(job, "back")} onDownload={() => openAsset(job, "back", true)} />
                </div>
                <p className="mt-3 text-xs text-slate-400">{dateLabel(job.created_at)} · {job.subject_type} · {job.generation_mode}{job.credits_used != null ? ` · ${job.credits_used} FASHN credits reported` : ""}</p>
                {job.front_generated && job.source?.image_url && <p className="mt-3 text-xs text-slate-500 dark:text-white/50">Front is an AI-generated garment-only packshot. <button type="button" onClick={() => openOriginal(job)} className="font-semibold underline decoration-[#d7b66b] underline-offset-2">View original upload</button> for comparison.</p>}
                {job.status === "partial" && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Only some views completed. Existing results have been preserved. Review the failed view before starting a new set.</p>}
                {progressError && <p role="status" className="mt-3 text-xs text-amber-700 dark:text-amber-300">{progressError}</p>}
                <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-white/50">AI infers unseen details. Review every view carefully before using it as a garment production reference. Results are private and are never automatically published to Showcase.</p>
              </>
            ) : (
              <div className="mt-5 flex min-h-[380px] flex-col items-center justify-center rounded-xl bg-slate-100 p-6 text-center text-slate-400 dark:bg-[#0b0b0b]">
                <Images size={43} />
                <p className="mt-4 text-sm">Upload a garment image to generate two matching alternate perspectives.</p>
                <p className="mt-2 text-xs">Front (original) · Right Side · Back</p>
              </div>
            )}
          </section>
        </div>

        <section aria-label="Recent multi-view sets" className="mt-9">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-2xl">Recent View Sets</h2>
            <button type="button" disabled={historyLoading} onClick={async () => { setHistoryLoading(true); try { await refreshHistory(); } catch (err) { setHistoryError(errorMessage(err, "Could not refresh history.")); } finally { setHistoryLoading(false); } }} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold disabled:opacity-50 dark:border-white/15"><RefreshCw size={15} className={historyLoading ? "animate-spin" : ""} /> Refresh</button>
          </div>
          {historyError && <p role="alert" className="mt-3 text-sm text-red-600">{historyError}</p>}
          {historyLoading && history.length === 0 ? <p className="mt-4 text-sm text-slate-500">Loading history...</p> : history.length === 0 ? <p className="mt-4 text-sm text-slate-500">No multi-view sets yet.</p> : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {history.map(entry => (
                <article key={entry.id} className={`overflow-hidden rounded-xl border bg-white dark:bg-[#151515] ${job?.id === entry.id ? "border-[#d7b66b]" : "border-slate-200 dark:border-white/10"}`}>
                  <button type="button" onClick={() => selectJob(entry)} className="block w-full text-left">
                    {(entry.front?.image_url || entry.source?.image_url) ? <img src={entry.front?.image_url || entry.source?.image_url} alt="Garment view set preview" loading="lazy" className="aspect-[3/4] w-full object-contain bg-slate-100 dark:bg-[#0b0b0b]" /> : <div className="flex aspect-[3/4] items-center justify-center bg-slate-100 text-xs text-slate-500 dark:bg-[#111]">View set</div>}
                    <div className="p-3"><p className="text-xs font-semibold capitalize">{statusLabel(entry.status)} · {entry.subject_type}</p><p className="mt-1 text-xs text-slate-400">{dateLabel(entry.created_at)}</p></div>
                  </button>
                  {!isActive(entry) && <button type="button" disabled={deletingId === entry.id} onClick={() => remove(entry)} className="flex min-h-9 w-full items-center justify-center gap-2 border-t border-slate-100 p-2 text-xs text-red-600 disabled:opacity-50 dark:border-white/10"><Trash2 size={14}/>{deletingId === entry.id ? "Deleting..." : "Delete view set"}</button>}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
