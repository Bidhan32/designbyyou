"use strict";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, Clock3, Download, ExternalLink, History,
  ImageIcon, ImagePlus, Loader2, RefreshCw, Sparkles, UploadCloud,
  WandSparkles, X,
} from "lucide-react";
import API from "../../api/axios";

const ENDPOINT = "/creators/ai/sketch-to-image";
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
const ACTIVE = new Set(["submitting", "processing", "saving"]);

const FABRICS = [
  ["as-drawn", "As drawn"], ["cotton", "Cotton"], ["satin", "Satin"],
  ["silk", "Silk"], ["denim", "Denim"], ["linen", "Linen"],
  ["wool", "Wool"], ["leather", "Leather"], ["chiffon", "Chiffon"],
];
const MODES = [
  ["fast", "Fast · 1 credit"],
  ["balanced", "Balanced · 2 credits"],
  ["quality", "Quality · 3 credits"],
];

function isActive(job) { return Boolean(job && ACTIVE.has(job.status)); }
function errorText(err, fallback) { return err?.response?.data?.message || err?.message || fallback; }
function validImageUrl(url) {
  if (typeof url !== "string") return "";
  try { const parsed = new URL(url); return parsed.protocol === "https:" ? parsed.toString() : ""; }
  catch { return ""; }
}
function outputUrl(job) {
  return job?.status === "completed" ? validImageUrl(job?.result_urls?.[0]) : "";
}
function niceDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
function statusLabel(status) {
  return ({ submitting: "Submitting to FASHN", processing: "Rendering garment",
    saving: "Saving to your library", completed: "Completed", failed: "Failed" })[status] || "Ready";
}
function filename(job, ext = "png") {
  const id = String(job?.id || "fashion").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 8);
  return `designbyyou-sketch-render-${id}.${ext}`;
}
function attachmentUrl(raw, job) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.pathname.includes("/s--")) return null;
    const mark = "/image/upload/";
    const pos = url.pathname.indexOf(mark);
    if (pos === -1) return null;
    const before = url.pathname.slice(0, pos + mark.length);
    const rest = url.pathname.slice(pos + mark.length);
    if (!rest) return null;
    url.pathname = `${before}fl_attachment:${filename(job).replace(/\.png$/, "")}/${rest}`;
    return url.toString();
  } catch { return null; }
}

export default function CreatorSketchToImage() {
  const [sketch, setSketch] = useState(null);
  const [sketchPreview, setSketchPreview] = useState("");
  const [instruction, setInstruction] = useState("");
  const [fabric, setFabric] = useState("as-drawn");
  const [generationMode, setGenerationMode] = useState("fast");
  const [generating, setGenerating] = useState(false);
  const [job, setJob] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);
  const fileInputRef = useRef(null);
  const requestKey = useRef(null);

  useEffect(() => {
    if (!sketch) { setSketchPreview(""); return undefined; }
    const url = URL.createObjectURL(sketch);
    setSketchPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [sketch]);

  const refreshHistory = useCallback(async () => {
    const response = await API.get(`${ENDPOINT}/history`);
    const rows = Array.isArray(response.data?.data) ? response.data.data : [];
    setHistory(rows);
    setHistoryError("");
    return rows;
  }, []);

  useEffect(() => {
    let mounted = true;
    API.get(`${ENDPOINT}/history`).then((response) => {
      if (!mounted) return;
      const rows = Array.isArray(response.data?.data) ? response.data.data : [];
      setHistory(rows);
      setJob(rows.find(isActive) || rows[0] || null);
    }).catch((err) => {
      if (mounted) setHistoryError(errorText(err, "Could not load generation history."));
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
    const check = async () => {
      try {
        const response = await API.get(`${ENDPOINT}/${encodeURIComponent(activeJobId)}`);
        const current = response.data?.data;
        if (!alive || !current) return;
        setHistory((previous) => previous.some((row) => row.id === current.id)
          ? previous.map((row) => row.id === current.id ? current : row)
          : [current, ...previous]);
        setJob((previous) => previous?.id === current.id ? current : previous);
        setPollError("");
        if (current.status === "completed" || current.status === "failed") {
          await refreshHistory().catch(() => {});
          return;
        }
      } catch (err) {
        if (alive) setPollError(errorText(err, "Status temporarily unavailable. Retrying..."));
      }
      if (alive) timer = setTimeout(check, 3500);
    };
    timer = setTimeout(check, 1500);
    return () => { alive = false; clearTimeout(timer); };
  }, [activeJobId, refreshHistory]);

  function chooseFile(file) {
    setError("");
    if (!file) return;
    if (!ACCEPTED.includes(file.type) || file.size < 20 || file.size > MAX_FILE_BYTES) {
      setError("Choose a JPG, PNG, or WebP sketch smaller than 6 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSketch(null);
      return;
    }
    setSketch(file);
    setJob(null);
    requestKey.current = null;
  }

  function clearAndCreateNew() {
    if (busy) return;
    setSketch(null);
    setJob(null);
    setInstruction("");
    setFabric("as-drawn");
    setGenerationMode("fast");
    setError("");
    setPollError("");
    setDownloadError("");
    requestKey.current = null;
    if (fileInputRef.current) { fileInputRef.current.value = ""; fileInputRef.current.focus(); }
    // Historical jobs and stored images remain untouched.
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!sketch) { setError("Upload a sketch before generating."); return; }
    if (instruction.trim().length > 500) { setError("Instructions must be 500 characters or fewer."); return; }
    setGenerating(true);
    setError(""); setPollError(""); setDownloadError("");
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    const body = new FormData();
    body.append("sketch", sketch);
    body.append("instruction", instruction.trim());
    body.append("fabric", fabric);
    body.append("generation_mode", generationMode);
    body.append("request_key", requestKey.current);
    try {
      // Axios sets the multipart boundary for FormData.
      const response = await API.post(ENDPOINT, body);
      const created = response.data?.data;
      if (!created?.id) throw new Error("Generation response was incomplete.");
      setJob(created);
      setHistory((previous) => [created, ...previous.filter((row) => row.id !== created.id)]);
      setSketch(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      requestKey.current = null;
      await refreshHistory().catch(() => {});
    } catch (err) {
      setError(errorText(err, "Could not start sketch generation."));
      if (err?.response?.data?.code === "FASHN_SUBMISSION_FAILED") requestKey.current = null;
    } finally { setGenerating(false); }
  }

  async function downloadImage(selected) {
    const url = outputUrl(selected);
    if (!url) { setDownloadError("No downloadable result is available."); return; }
    setDownloadError(""); setDownloadingId(selected.id);
    try {
      const cloudinary = attachmentUrl(url, selected);
      if (cloudinary) {
        const a = document.createElement("a");
        a.href = cloudinary; a.download = filename(selected); a.rel = "noopener noreferrer";
        document.body.appendChild(a); a.click(); a.remove();
        return;
      }
      const response = await fetch(url, { mode: "cors", credentials: "omit" });
      if (!response.ok) throw new Error("Could not retrieve image.");
      const contentType = (response.headers.get("content-type") || "").split(";")[0].trim();
      const ext = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" })[contentType];
      if (!ext) throw new Error("Unexpected file format.");
      const blob = await response.blob();
      if (!blob.size || blob.size > 25 * 1024 * 1024) throw new Error("Image is empty or too large.");
      const objectUrl = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = objectUrl; a.download = filename(selected, ext);
        document.body.appendChild(a); a.click(); a.remove();
      } finally { setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); }
    } catch (err) {
      setDownloadError("Download was blocked. Open the full image to save it from your browser. " + (err?.message || ""));
    } finally { setDownloadingId(null); }
  }

  const original = sketchPreview || validImageUrl(job?.source_url);
  const output = outputUrl(job);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-[#090909] dark:text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link to="/creator/tools" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-[#ab802c] dark:text-white/60">
          <ArrowLeft size={16} /> Back to Creative Hub
        </Link>
        <header className="mt-7 flex items-start gap-4">
          <div className="rounded-2xl bg-[#e5c67d]/20 p-3 text-[#ab802c]"><WandSparkles size={27} /></div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#a78032] dark:text-[#e5c67d]">FASHN AI · Creator tools</p>
            <h1 className="mt-1 font-serif text-3xl tracking-tight sm:text-4xl">AI Sketch to Image</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-white/55">
              Upload a fashion sketch and visualize it as a realistic garment. Download the result or revisit it in your private history.
            </p>
          </div>
        </header>
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
          <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151515] sm:p-7">
            <div className="flex items-center gap-2"><Sparkles size={18} className="text-[#b38a35]" /><h2 className="font-serif text-xl">Sketch rendering settings</h2></div>
            <label htmlFor="sketch-upload" className="mt-6 block text-xs font-bold uppercase tracking-wider">Upload your fashion sketch</label>
            <label htmlFor="sketch-upload" className="mt-3 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#d8bd83]/70 bg-[#e5c67d]/5 px-4 py-6 text-center transition hover:bg-[#e5c67d]/10 dark:border-white/20">
              <UploadCloud size={28} className="text-[#ad8433]" />
              <span className="mt-2 text-sm font-semibold">{sketch ? sketch.name : "Click to choose a sketch"}</span>
              <span className="mt-1 text-xs text-slate-500 dark:text-white/50">JPG, PNG, WebP · up to 6 MB · minimum 128 × 128 px</span>
            </label>
            <input id="sketch-upload" ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} className="sr-only" />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sketch-fabric" className="block text-xs font-bold uppercase tracking-wider">Fabric appearance</label>
                <select id="sketch-fabric" value={fabric} onChange={(event) => { setFabric(event.target.value); requestKey.current = null; }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-[#202020]">
                  {FABRICS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="sketch-mode" className="block text-xs font-bold uppercase tracking-wider">Rendering quality · 1K</label>
                <select id="sketch-mode" value={generationMode} onChange={(event) => { setGenerationMode(event.target.value); requestKey.current = null; }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-[#202020]">
                  {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
            <label htmlFor="sketch-instruction" className="mt-5 block text-xs font-bold uppercase tracking-wider">Additional instructions (optional)</label>
            <textarea id="sketch-instruction" rows={4} maxLength={500} value={instruction}
              onChange={(event) => { setInstruction(event.target.value); requestKey.current = null; }}
              placeholder="Preserve the waist pleats, use a burgundy color, and keep the asymmetrical neckline."
              className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 outline-none focus:border-[#c9a14c] dark:border-white/10 dark:bg-[#0d0d0d]" />
            <p className="mt-1 text-right text-xs text-slate-400">{instruction.length} / 500</p>
            <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-white/50">One image per request. Experimental preview: the AI may change details from your drawing. Five tests per Creator per rolling 24 hours by default.</p>
            {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</div>}
            <button type="submit" disabled={busy || !sketch} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e5c67d] px-5 text-sm font-bold text-[#17130b] hover:bg-[#f4d995] disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <Loader2 size={18} className="animate-spin" /> : <WandSparkles size={18} />}
              {generating ? "Submitting..." : activeJobId ? "Rendering in progress" : "Render Realistic Garment"}
            </button>
          </form>
          <section aria-label="Sketch conversion result" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151515] sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-serif text-xl">Your Result</h2>
              <div className="flex flex-wrap items-center gap-2">
                {(job || sketch) && <button type="button" onClick={clearAndCreateNew} disabled={busy}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#e5c67d]/60 bg-[#e5c67d]/10 px-3 text-xs font-semibold text-[#9b7424] hover:bg-[#e5c67d]/20 disabled:opacity-50 dark:text-[#e5c67d]">
                  <RefreshCw size={14} /> Clear &amp; Create New
                </button>}
                {job && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-600 dark:bg-white/10 dark:text-white/75">
                  {job.status === "completed" ? <CheckCircle2 size={14} className="text-emerald-600" /> : job.status === "failed" ? <X size={14} className="text-red-500" /> : <Clock3 size={14} />}
                  {statusLabel(job.status)}
                </span>}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Original sketch</p>
                <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-[#0b0b0b]">
                  {original ? <img src={original} alt="Original uploaded fashion sketch" className="h-full w-full object-contain" /> : <ImagePlus size={32} className="text-slate-300 dark:text-white/20" />}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Realistic render</p>
                <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-[#0b0b0b]">
                  {output ? <img src={output} alt="AI-rendered realistic garment" className="h-full w-full object-contain" />
                    : isActive(job) ? <div className="px-2 text-center text-slate-500 dark:text-white/50"><Loader2 size={26} className="mx-auto animate-spin text-[#b38a35]" /><p className="mt-3 text-xs">{statusLabel(job.status)}...</p></div>
                    : job?.status === "failed" ? <p className="p-3 text-center text-xs text-red-600">{job.error_message || "Rendering failed."}</p>
                    : <ImageIcon size={32} className="text-slate-300 dark:text-white/20" />}
                </div>
              </div>
            </div>
            {job?.created_at && <p className="mt-3 text-xs text-slate-400">{niceDate(job.created_at)} · {job.fabric} · {job.generation_mode}{job.credits_used != null ? ` · ${job.credits_used} credit(s)` : ""}</p>}
            {output && <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => downloadImage(job)} disabled={downloadingId === job.id}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e5c67d] px-4 text-sm font-bold text-[#17130b] hover:bg-[#f4d995] disabled:opacity-60">
                {downloadingId === job.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download Image
              </button>
              <a href={output} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold dark:border-white/20"><ExternalLink size={16} /> View Full Image</a>
            </div>}
            {downloadError && <p role="alert" className="mt-3 text-xs text-red-600">{downloadError}</p>}
            {pollError && activeJobId && <p role="status" className="mt-3 text-xs text-amber-700 dark:text-amber-300">{pollError}</p>}
            <p className="mt-4 text-xs leading-5 text-slate-400">Source sketches and results are saved to your history and never automatically published to Showcase. Anyone with a direct Cloudinary link may be able to view the image.</p>
          </section>
        </div>
        <section className="mt-9" aria-label="Saved sketch generations">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-serif text-2xl"><History size={20} className="text-[#ab802c]" /> Recent Sketch Renders</h2>
            <button type="button" disabled={historyLoading} onClick={async () => { setHistoryLoading(true); try { await refreshHistory(); } catch (err) { setHistoryError(errorText(err, "Unable to refresh.")); } finally { setHistoryLoading(false); } }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-white/15"><RefreshCw size={14} className={historyLoading ? "animate-spin" : ""} /> Refresh</button>
          </div>
          {historyError && <p role="alert" className="mt-3 text-sm text-red-600">{historyError}</p>}
          {historyLoading && !history.length ? <p className="mt-4 text-sm text-slate-500">Loading history...</p> :
            !history.length ? <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-slate-500 dark:border-white/10">No sketch generations yet.</p> :
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {history.map((item) => {
                  const url = outputUrl(item);
                  const source = validImageUrl(item.source_url);
                  const selected = item.id === job?.id;
                  return <article key={item.id} className={`overflow-hidden rounded-xl border bg-white dark:bg-[#151515] ${selected ? "border-[#d7b66b]" : "border-slate-200 dark:border-white/10"}`}>
                    <button type="button" aria-pressed={selected} className="block w-full text-left" onClick={() => { setJob(item); setSketch(null); if (fileInputRef.current) fileInputRef.current.value = ""; setDownloadError(""); }}>
                      {url || source ? <img src={url || source} alt="Previously rendered sketch" loading="lazy" className="aspect-[3/4] w-full object-cover" /> : <div className="flex aspect-[3/4] items-center justify-center bg-slate-100 text-xs text-slate-500 dark:bg-[#202020]">{isActive(item) ? <Loader2 size={20} className="animate-spin" /> : statusLabel(item.status)}</div>}
                      <div className="p-3"><p className="line-clamp-2 min-h-8 text-xs">{item.instruction || "Realistic garment from sketch"}</p><p className="mt-2 text-[11px] text-slate-400">{statusLabel(item.status)} · {niceDate(item.created_at)}</p></div>
                    </button>
                    {url && <div className="border-t border-slate-100 p-3 dark:border-white/10"><button type="button" disabled={downloadingId === item.id} onClick={() => downloadImage(item)} className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#e5c67d]/20 text-xs font-bold text-[#997325] hover:bg-[#e5c67d]/30 disabled:opacity-50 dark:text-[#e5c67d]"><Download size={14} /> Download</button></div>}
                  </article>;
                })}
              </div>}
        </section>
      </div>
    </main>
  );
}
