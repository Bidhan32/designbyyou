"use strict";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, Clock3, Download, ExternalLink,
  ImagePlus, Loader2, RefreshCw, Shirt, Trash2, WandSparkles, X,
} from "lucide-react";
import API from "../../api/axios";

const ENDPOINT = "/creators/ai/virtual-try-on";
const ACTIVE = new Set(["submitting", "processing", "saving"]);
const OPTIONS = {
  category: [
    ["auto", "Automatic"], ["tops", "Tops"],
    ["bottoms", "Bottoms"], ["one-pieces", "Dresses / One-pieces"],
  ],
  mode: [
    ["performance", "Performance (fastest)"],
    ["balanced", "Balanced (recommended)"],
    ["quality", "Quality"],
  ],
  garmentPhotoType: [
    ["auto", "Automatic"], ["flat-lay", "Flat-lay / mannequin"],
    ["model", "Garment worn by a model"],
  ],
};

function getMessage(err, fallback) {
  return err?.response?.data?.message || err?.message || fallback;
}
function isActive(job) { return Boolean(job && ACTIVE.has(job.status)); }
function dateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function UploadField({ id, label, help, file, preview, disabled, onChange, inputRef }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-xs font-bold uppercase tracking-wider">
        {label}
      </label>
      <label
        htmlFor={id}
        className={`flex min-h-52 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#cbb376]/70 bg-[#e5c67d]/5 text-center transition hover:bg-[#e5c67d]/10 ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        {preview ? (
          <img src={preview} alt={label} className="max-h-72 w-full object-contain" />
        ) : (
          <div className="px-5 py-9 text-slate-500 dark:text-white/60">
            <ImagePlus className="mx-auto mb-3 text-[#ac8534]" size={32} />
            <p className="text-sm font-semibold">Choose an image</p>
            <p className="mt-2 text-xs">JPG, PNG or WebP · max 12 MB</p>
          </div>
        )}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />
      <div className="mt-2 flex items-start justify-between gap-3 text-xs text-slate-500 dark:text-white/50">
        <span>{help}</span>
        {file && <span className="max-w-28 truncate text-[#ab802c]">{file.name}</span>}
      </div>
    </div>
  );
}

export default function CreatorVirtualTryOn() {
  const [person, setPerson] = useState(null);
  const [garment, setGarment] = useState(null);
  const [personUrl, setPersonUrl] = useState("");
  const [garmentUrl, setGarmentUrl] = useState("");
  const [category, setCategory] = useState("auto");
  const [mode, setMode] = useState("balanced");
  const [garmentPhotoType, setGarmentPhotoType] = useState("auto");
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
  const personInput = useRef(null);
  const garmentInput = useRef(null);

  useEffect(() => {
    if (!person) { setPersonUrl(""); return undefined; }
    const url = URL.createObjectURL(person);
    setPersonUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [person]);
  useEffect(() => {
    if (!garment) { setGarmentUrl(""); return undefined; }
    const url = URL.createObjectURL(garment);
    setGarmentUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [garment]);

  const refreshHistory = useCallback(async () => {
    const response = await API.get(`${ENDPOINT}/history`);
    const items = Array.isArray(response.data?.data) ? response.data.data : [];
    setHistory(items);
    setHistoryError("");
    return items;
  }, []);

  useEffect(() => {
    let mounted = true;
    API.get(`${ENDPOINT}/history`).then((response) => {
      if (!mounted) return;
      const items = Array.isArray(response.data?.data) ? response.data.data : [];
      setHistory(items);
      setJob(items.find(isActive) || items[0] || null);
    }).catch((err) => {
      if (mounted) setHistoryError(getMessage(err, "Could not load history."));
    }).finally(() => {
      if (mounted) setHistoryLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const activeJob = history.find(isActive) || (isActive(job) ? job : null);
  const activeJobId = activeJob?.id || null;
  const busy = Boolean(generating || activeJobId);

  useEffect(() => {
    if (!activeJobId) return undefined;
    let live = true;
    let timer;
    const poll = async () => {
      try {
        const response = await API.get(`${ENDPOINT}/${encodeURIComponent(activeJobId)}`);
        const latest = response.data?.data;
        if (!live || !latest) return;
        setHistory((old) => {
          const found = old.some((entry) => entry.id === latest.id);
          return found
            ? old.map((entry) => entry.id === latest.id ? latest : entry)
            : [latest, ...old];
        });
        setJob((old) => old?.id === latest.id ? latest : old);
        setProgressError("");
        if (!isActive(latest)) {
          try { await refreshHistory(); } catch { /* Existing status is enough. */ }
          return;
        }
      } catch (err) {
        if (live) setProgressError(getMessage(err, "Checking generation status failed; retrying..."));
      }
      if (live) timer = setTimeout(poll, 3500);
    };
    timer = setTimeout(poll, 1500);
    return () => { live = false; clearTimeout(timer); };
  }, [activeJobId, refreshHistory]);

  const updateFile = (kind, selected) => {
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type) || selected.size < 1 || selected.size > 12 * 1024 * 1024) {
      setError("Choose a JPG, PNG or WebP image no larger than 12 MB.");
      return;
    }
    kind === "person" ? setPerson(selected) : setGarment(selected);
    requestKey.current = null;
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!person || !garment) return setError("Upload both a person photo and a garment photo.");
    if (!consent) return setError("Confirm that you have permission to use this photo and save the result.");
    setGenerating(true);
    setError(""); setProgressError("");
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    const form = new FormData();
    form.append("person_image", person);
    form.append("garment_image", garment);
    form.append("category", category);
    form.append("mode", mode);
    form.append("garment_photo_type", garmentPhotoType);
    form.append("request_key", requestKey.current);
    form.append("consent", "true");
    try {
      const response = await API.post(ENDPOINT, form);
      const created = response.data?.data;
      if (!created?.id) throw new Error("Generation response was incomplete.");
      requestKey.current = null;
      setJob(created);
      setHistory((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      try { await refreshHistory(); } catch { /* Poll from returned job. */ }
    } catch (err) {
      setError(getMessage(err, "Could not start Virtual Try-On."));
      if (err?.response?.data?.code === "FASHN_SUBMISSION_FAILED") requestKey.current = null;
    } finally {
      setGenerating(false);
    }
  };

  const clearNew = () => {
    if (busy) return;
    setJob(null); setPerson(null); setGarment(null);
    setCategory("auto"); setMode("balanced"); setGarmentPhotoType("auto");
    setConsent(false); setError(""); setProgressError("");
    requestKey.current = null;
    if (personInput.current) personInput.current.value = "";
    if (garmentInput.current) garmentInput.current.value = "";
  };

  const selectJob = async (entry) => {
    setJob(entry);
    setError("");
    if (entry.status === "completed") {
      try {
        // Regenerates short-lived Cloudinary viewing and download URLs.
        const response = await API.get(`${ENDPOINT}/${encodeURIComponent(entry.id)}`);
        setJob(response.data?.data || entry);
      } catch { /* Older signed URL may still be valid. */ }
    }
  };

  const openLink = async (entry, download) => {
    // Open placeholder synchronously to avoid pop-up blocking after await.
    const popup = window.open("", "_blank");
    try {
      const response = await API.get(`${ENDPOINT}/${encodeURIComponent(entry.id)}`);
      const latest = response.data?.data;
      const url = download ? latest?.download_url : latest?.image_url;
      if (!url) throw new Error("Result image is not available yet.");
      if (popup) popup.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      popup?.close();
      setError(getMessage(err, "Could not open the saved image."));
    }
  };

  const deleteJob = async (entry) => {
    if (isActive(entry) || deletingId) return;
    if (!window.confirm("Delete this saved Virtual Try-On image permanently?")) return;
    setDeletingId(entry.id);
    try {
      await API.delete(`${ENDPOINT}/${encodeURIComponent(entry.id)}`);
      setHistory((old) => old.filter((item) => item.id !== entry.id));
      if (job?.id === entry.id) setJob(null);
    } catch (err) {
      setError(getMessage(err, "Could not delete this generation."));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-[#090909] dark:text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link to="/creator/tools" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-[#ae852e] dark:text-white/60">
          <ArrowLeft size={16} /> Back to Creative Hub
        </Link>
        <header className="mt-7 flex items-start gap-4">
          <div className="rounded-2xl bg-[#e5c67d]/20 p-3 text-[#ab802c]"><Shirt size={27} /></div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#a78032] dark:text-[#e5c67d]">FASHN AI · Creative tools</p>
            <h1 className="mt-1 font-serif text-3xl sm:text-4xl">AI Virtual Try-On</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-white/55">
              Upload a person photo and a garment image to preview how the clothing may look when worn.
              Results are AI visualizations, not an accurate prediction of physical fit.
            </p>
          </div>
        </header>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
          <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151515] sm:p-7">
            <h2 className="font-serif text-xl">Create your try-on</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <UploadField id="tryon-person" label="Person photo" help="Use a clear, front-facing photo." file={person} preview={personUrl} disabled={busy} inputRef={personInput} onChange={(f) => updateFile("person", f)} />
              <UploadField id="tryon-garment" label="Garment photo" help="Use a clear, unobstructed clothing image." file={garment} preview={garmentUrl} disabled={busy} inputRef={garmentInput} onChange={(f) => updateFile("garment", f)} />
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div><label className="block text-xs font-bold uppercase tracking-wider" htmlFor="tryon-category">Garment category</label>
                <select id="tryon-category" value={category} disabled={busy} onChange={(e) => { setCategory(e.target.value); requestKey.current = null; }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-[#202020]">
                  {OPTIONS.category.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-bold uppercase tracking-wider" htmlFor="tryon-mode">Processing mode</label>
                <select id="tryon-mode" value={mode} disabled={busy} onChange={(e) => { setMode(e.target.value); requestKey.current = null; }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-[#202020]">
                  {OPTIONS.mode.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2"><label className="block text-xs font-bold uppercase tracking-wider" htmlFor="tryon-type">Garment photograph type</label>
                <select id="tryon-type" value={garmentPhotoType} disabled={busy} onChange={(e) => { setGarmentPhotoType(e.target.value); requestKey.current = null; }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-[#202020]">
                  {OPTIONS.garmentPhotoType.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <label className="mt-6 flex items-start gap-3 text-xs leading-5 text-slate-600 dark:text-white/70">
              <input type="checkbox" className="mt-1 accent-[#b38a35]" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} />
              <span>I own this photo or have the person's permission to use it for AI try-on. I agree to save the generated result in my private Creator history. Original uploaded photos are not saved in DesignByYou history.</span>
            </label>
            <p className="mt-3 text-xs text-slate-500 dark:text-white/50">Testing limit: 5 generations per rolling 24 hours, unless configured differently on the backend.</p>
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
            <button type="submit" disabled={busy || !person || !garment || !consent} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e5c67d] px-4 text-sm font-bold text-[#17130b] hover:bg-[#f4d995] disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <Loader2 size={18} className="animate-spin" /> : <WandSparkles size={18} />}
              {generating ? "Submitting..." : activeJobId ? "Generation in progress" : "Generate Virtual Try-On"}
            </button>
          </form>

          <section aria-label="Virtual Try-On result" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151515] sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-serif text-xl">Your Result</h2>
              <div className="flex flex-wrap items-center gap-2">
                {job && <button type="button" disabled={busy} onClick={clearNew} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d7b66b] px-3 py-2 text-xs font-semibold text-[#9b7424] disabled:opacity-50 dark:text-[#e5c67d]"><RefreshCw size={14} /> Clear &amp; Create New</button>}
                {job && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-2 text-xs dark:bg-white/10">{job.status === "completed" ? <CheckCircle2 size={14} /> : job.status === "failed" ? <X size={14} /> : <Clock3 size={14} />}{job.status}</span>}
              </div>
            </div>
            <div className="mt-4 flex min-h-[370px] items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-[#0b0b0b]">
              {job?.image_url ? (
                <img src={job.image_url} alt="AI Virtual Try-On output" className="max-h-[570px] w-full object-contain" />
              ) : isActive(job) ? (
                <div className="px-5 text-center text-slate-500"><Loader2 size={32} className="mx-auto animate-spin text-[#ab802c]" /><p className="mt-3 text-sm">Preparing your Virtual Try-On...</p></div>
              ) : job?.status === "failed" ? (
                <div className="px-5 text-center text-sm text-red-600">{job.error_message || "The generation failed."}</div>
              ) : (
                <div className="px-5 text-center text-slate-400"><Shirt size={36} className="mx-auto" /><p className="mt-3 text-sm">Your generated image will appear here.</p></div>
              )}
            </div>
            {job?.created_at && <p className="mt-3 text-xs text-slate-400">{dateLabel(job.created_at)} · {job.category} · {job.mode}</p>}
            {job?.status === "completed" && <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => openLink(job, true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#e5c67d] px-4 text-sm font-bold text-[#17130b]"><Download size={17} /> Download Image</button>
              <button type="button" onClick={() => openLink(job, false)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold dark:border-white/20"><ExternalLink size={17} /> View Full Image</button>
            </div>}
            {progressError && <p role="status" className="mt-4 text-xs text-amber-700 dark:text-amber-300">{progressError}</p>}
            <p className="mt-4 text-xs leading-5 text-slate-400">Your original photos are processed temporarily and are not kept in your generation history. Generated results are stored as protected Cloudinary assets and can be deleted below.</p>
          </section>
        </div>

        <section className="mt-9" aria-label="Virtual Try-On history">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-2xl">Recent Try-Ons</h2>
            <button type="button" onClick={async () => { setHistoryLoading(true); try { await refreshHistory(); } catch (err) { setHistoryError(getMessage(err, "Could not refresh history.")); } finally { setHistoryLoading(false); } }} disabled={historyLoading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-white/15"><RefreshCw size={15} className={historyLoading ? "animate-spin" : ""} /> Refresh</button>
          </div>
          {historyError && <p role="alert" className="mt-3 text-sm text-red-600">{historyError}</p>}
          {historyLoading && history.length === 0 ? <p className="mt-4 text-sm text-slate-500">Loading...</p> : history.length === 0 ? <p className="mt-4 text-sm text-slate-500">No saved Virtual Try-On generations yet.</p> :
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {history.map((entry) => (
                <article key={entry.id} className={`overflow-hidden rounded-xl border bg-white dark:bg-[#151515] ${job?.id === entry.id ? "border-[#d7b66b]" : "border-slate-200 dark:border-white/10"}`}>
                  <button type="button" className="block w-full text-left" onClick={() => selectJob(entry)}>
                    {entry.image_url ? <img src={entry.image_url} loading="lazy" alt="Saved Virtual Try-On" className="aspect-[3/4] w-full object-cover" /> : <div className="flex aspect-[3/4] items-center justify-center bg-slate-100 text-xs text-slate-500 dark:bg-white/5">{isActive(entry) ? "Generating..." : entry.status}</div>}
                    <div className="p-3"><p className="text-xs font-semibold capitalize">{entry.category} · {entry.mode}</p><p className="mt-1 text-xs text-slate-400">{dateLabel(entry.created_at)}</p></div>
                  </button>
                  {!isActive(entry) && <button type="button" disabled={deletingId === entry.id} onClick={() => deleteJob(entry)} className="flex min-h-9 w-full items-center justify-center gap-2 border-t border-slate-100 p-2 text-xs text-red-600 disabled:opacity-50 dark:border-white/10"><Trash2 size={14} />{deletingId === entry.id ? "Deleting..." : "Delete result"}</button>}
                </article>
              ))}
            </div>}
        </section>
      </div>
    </main>
  );
}
