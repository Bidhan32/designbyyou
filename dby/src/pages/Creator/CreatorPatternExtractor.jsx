"use strict";

import React, {useCallback, useEffect, useRef, useState} from "react";
import {Link} from "react-router-dom";
import {
  AlertCircle, ArrowLeft, CheckCircle2, Download, Grid3X3, ImagePlus,
  Loader2, RefreshCw, ScanLine, Scissors, ShieldCheck, Sparkles,
  Trash2, UploadCloud, WandSparkles, X,
} from "lucide-react";
import API from "../../api/axios";

const API_ROOT = "/creator-tools/pattern-extractor";
const JOB_KEY = "dby.pattern-extractor.job-id";
const ATTEMPT_KEY = "dby.pattern-extractor.pending-attempt";
const CLEARED_KEY = "dby.pattern-extractor.cleared-job-id";
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 12 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE = new Set(["starting", "in_queue", "processing"]);
const CHECKER = {
  backgroundColor: "#f8fafc",
  backgroundImage:
    "linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%)",
  backgroundSize: "20px 20px",
  backgroundPosition: "0 0,0 10px,10px -10px,-10px 0",
};
const STATUS_LABEL = {
  pending: "Ready", submitting: "Submitting", submission_unknown: "Needs review",
  starting: "Starting", in_queue: "Queued", processing: "Processing",
  completed: "Completed", failed: "Failed",
};

function readSession(key) {try {return sessionStorage.getItem(key);} catch {return null;}}
function saveSession(key, value) {try {sessionStorage.setItem(key, value);} catch { /* unavailable */ }}
function dropSession(key) {try {sessionStorage.removeItem(key);} catch { /* unavailable */ }}
function errorMessage(error) {return error?.response?.data?.message || error?.message || "Something went wrong.";}
function requestId() {
  if (!globalThis.crypto?.randomUUID) throw new Error("Use HTTPS or localhost for secure requests.");
  return globalThis.crypto.randomUUID();
}
function pngDownload(dataUri) {
  if (typeof dataUri !== "string" || !dataUri.startsWith("data:image/png;base64,"))
    throw new Error("No valid generated PNG available.");
  const binary = atob(dataUri.slice("data:image/png;base64,".length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], {type: "image/png"}));
  const a = document.createElement("a");
  a.href = url;
  a.download = `designbyyou-fabric-pattern-${new Date().toISOString().slice(0, 10)}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function normalizeCrop(a, b) {
  return {
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y),
  };
}
function pointInElement(event, element) {
  const box = element.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
    y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
  };
}
async function croppedFile(file, crop) {
  if (!crop || crop.width < 0.04 || crop.height < 0.04) {
    throw new Error("Select a printed fabric area before extracting a pattern.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 32 * 1024 * 1024) {
      throw new Error("Image dimensions are too large. Use an image below 32 megapixels.");
    }
    const sx = Math.max(0, Math.floor(bitmap.width * crop.x));
    const sy = Math.max(0, Math.floor(bitmap.height * crop.y));
    const sw = Math.min(bitmap.width - sx, Math.round(bitmap.width * crop.width));
    const sh = Math.min(bitmap.height - sy, Math.round(bitmap.height * crop.height));
    if (sw < 64 || sh < 64) {
      throw new Error("Select a larger print area (at least 64 × 64 source pixels). A higher-resolution photo may help.");
    }
    // Small photographed motifs often need an enlarged input for the AI model.
    // Scaling preserves the aspect ratio but cannot recover missing print detail.
    const factor = Math.min(2048 / Math.max(sw, sh), Math.max(1, 256 / Math.min(sw, sh)));
    const width = Math.round(sw * factor);
    const height = Math.round(sh * factor);
    if (Math.min(width, height) < 128) {
      throw new Error("Crop is too narrow. Select a more balanced fabric patch.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Cannot initialize the image crop canvas.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Cannot export the selected area.");
    if (blob.size > MAX_BYTES) throw new Error("Selected crop exceeds 12 MB; select a smaller area.");
    return new File([blob], "fabric-pattern-crop.png", {type: "image/png"});
  } finally {
    bitmap.close?.();
  }
}

export default function CreatorPatternExtractor() {
  const inputRef = useRef(null);
  const imageSurfaceRef = useRef(null);
  const dragStartRef = useRef(null);
  const workRef = useRef(false);
  const epochRef = useRef(0);
  const fetchAttemptRef = useRef(false);
  const currentJobRef = useRef(null);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [draggingFile, setDraggingFile] = useState(false);
  const [crop, setCrop] = useState(null);
  const [draftCrop, setDraftCrop] = useState(null);
  const [cropPreview, setCropPreview] = useState("");
  const [cropError, setCropError] = useState("");
  const [mode, setMode] = useState("faithful");
  const [instructions, setInstructions] = useState("");
  const [job, setJob] = useState(null);
  const [pendingAttempt, setPendingAttempt] = useState(null);
  const [image, setImage] = useState("");
  const [cleared, setCleared] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!file) {setPreview(""); return undefined;}
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Show exactly what will be sent to FASHN BEFORE the user creates a paid job.
  // Never fall back to the full clothing photograph when no crop is selected.
  useEffect(() => {
    let alive = true;
    let url = null;
    if (!file || !crop) {
      setCropPreview("");
      setCropError("");
      return undefined;
    }
    setCropPreview("");
    setCropError("");
    croppedFile(file, crop).then((patch) => {
      if (!alive) return;
      url = URL.createObjectURL(patch);
      setCropPreview(url);
    }).catch((cropFailure) => {
      if (!alive) return;
      setCropError(errorMessage(cropFailure));
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, crop]);

  const refresh = useCallback(async (id) => {
    const response = await API.get(`${API_ROOT}/jobs/${id}?refresh=true`);
    const item = response?.data?.data?.job;
    if (!item || item.id !== id) throw new Error("Invalid pattern job response.");
    if (currentJobRef.current === id) setJob(item);
    return item;
  }, []);

  useEffect(() => {
    let alive = true;
    const restore = async () => {
      const rawAttempt = readSession(ATTEMPT_KEY);
      if (rawAttempt) {
        try {
          const entry = JSON.parse(rawAttempt);
          if (UUID.test(entry.request_key) && ["faithful", "seamless"].includes(entry.mode) &&
              typeof entry.instructions === "string") {
            if (alive) {
              setPendingAttempt(entry);
              setMode(entry.mode);
              setInstructions(entry.instructions);
            }
          } else dropSession(ATTEMPT_KEY);
        } catch {dropSession(ATTEMPT_KEY);}
      }
      const id = readSession(JOB_KEY);
      if (id && UUID.test(id)) {
        currentJobRef.current = id;
        try {
          const restored = await refresh(id);
          if (!alive) return;
          setMode(restored.mode);
          setInstructions(restored.instructions || "");
          setPendingAttempt(null); dropSession(ATTEMPT_KEY);
          setCleared(readSession(CLEARED_KEY) === id);
        } catch (e) {
          if (!alive) return;
          if ([403, 404].includes(e?.response?.status)) {
            dropSession(JOB_KEY); currentJobRef.current = null;
          } else setError("Could not restore your extraction. Refresh or retry before starting another job.");
        }
      } else if (id) dropSession(JOB_KEY);
      if (alive) setRestoring(false);
    };
    void restore();
    return () => {alive = false;};
  }, [refresh]);

  useEffect(() => {
    if (!job?.id || !ACTIVE.has(job.status)) return undefined;
    let disposed = false;
    let timer;
    const tick = async () => {
      try {await refresh(job.id);} catch (e) {if (!disposed) console.warn("Pattern job polling failed:", errorMessage(e));}
      if (!disposed) timer = window.setTimeout(tick, 8000);
    };
    timer = window.setTimeout(tick, 5000);
    return () => {disposed = true; window.clearTimeout(timer);};
  }, [job?.id, job?.status, refresh]);

  const loadResult = useCallback(async (force = false) => {
    const id = job?.id;
    if (!id || job.status !== "completed" || (cleared && !force) || fetchAttemptRef.current) return;
    fetchAttemptRef.current = true;
    const epoch = epochRef.current;
    setLoadingImage(true); setError("");
    try {
      const response = await API.get(`${API_ROOT}/jobs/${id}/result`);
      const result = response?.data?.data?.image;
      if (typeof result !== "string" || !result.startsWith("data:image/png;base64,"))
        throw new Error("Server returned an invalid pattern image.");
      if (currentJobRef.current === id && epochRef.current === epoch) {
        setImage(result); setCleared(false); dropSession(CLEARED_KEY);
      }
    } catch (e) {
      if (currentJobRef.current === id && epochRef.current === epoch) setError(errorMessage(e));
    } finally {
      fetchAttemptRef.current = false;
      if (epochRef.current === epoch) setLoadingImage(false);
    }
  }, [job?.id, job?.status, cleared]);

  const autoloadedForRef = useRef(null);
  useEffect(() => {
    if (job?.status === "completed" && !image && !cleared && !loadingImage &&
        autoloadedForRef.current !== job.id) {
      autoloadedForRef.current = job.id;
      void loadResult();
    }
  }, [job?.id, job?.status, image, cleared, loadingImage, loadResult]);

  function acceptFile(candidate) {
    if (!candidate || busy || restoring || (job && job.status !== "pending")) return;
    if (!TYPES.has(candidate.type)) {setError("Choose JPG, PNG or WebP."); return;}
    if (!candidate.size || candidate.size > MAX_BYTES) {setError("Image must be at most 12 MB."); return;}
    setFile(candidate); setCrop(null); setDraftCrop(null); setError(""); setNotice("");
  }

  function pointerDown(event) {
    if (busy || restoring || (job && job.status !== "pending")) return;
    if (!imageSurfaceRef.current) return;
    const start = pointInElement(event, imageSurfaceRef.current);
    dragStartRef.current = start;
    setDraftCrop({x: start.x, y: start.y, width: 0, height: 0});
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event) {
    if (!dragStartRef.current || !imageSurfaceRef.current) return;
    setDraftCrop(normalizeCrop(dragStartRef.current, pointInElement(event, imageSurfaceRef.current)));
  }
  function pointerUp(event) {
    if (!dragStartRef.current || !imageSurfaceRef.current) return;
    const next = normalizeCrop(dragStartRef.current, pointInElement(event, imageSurfaceRef.current));
    setCrop(next.width >= 0.04 && next.height >= 0.04 ? next : null);
    setDraftCrop(null);
    dragStartRef.current = null;
  }

  async function generate() {
    if (workRef.current || restoring || !file || (job && job.status !== "pending")) return;
    if (!crop || !cropPreview || cropError) {
      setError(cropError || "Select and preview a printed fabric patch before generating. Full garment photos are not accepted.");
      return;
    }
    workRef.current = true; setBusy(true); setError(""); setNotice("");
    try {
      // Validate and prepare the actual crop before creating a database job.
      // An invalid crop must NOT consume an hourly job allocation.
      setStatusText("Preparing the selected fabric patch...");
      const source = await croppedFile(file, crop);
      let current = job;
      if (!current) {
        setStatusText("Creating a private job...");
        let attempt = pendingAttempt;
        if (!attempt) {
          attempt = {request_key: requestId(), mode, instructions: instructions.trim()};
          saveSession(ATTEMPT_KEY, JSON.stringify(attempt));
          setPendingAttempt(attempt);
        }
        let response;
        try {
          response = await API.post(`${API_ROOT}/jobs`, attempt);
        } catch (creationError) {
          // A definitive quota rejection happens BEFORE the backend inserts a job.
          // It is safe to clear this attempt. Keep the key for uncertain network errors.
          if (
            creationError?.response?.status === 429 &&
            creationError?.response?.data?.code === "PATTERN_JOB_LIMIT"
          ) {
            dropSession(ATTEMPT_KEY);
            setPendingAttempt(null);
            const seconds = Number(creationError.response.data.retry_after_seconds);
            const wait = Number.isFinite(seconds) && seconds > 0
              ? ` Your next slot should open in about ${Math.ceil(seconds / 60)} minute(s).`
              : " Try again after the oldest recent job reaches one hour.";
            setError(`Hourly limit reached (2 pattern jobs per Creator). Failed jobs count too.${wait} No new AI generation was submitted.`);
            return;
          }
          throw creationError;
        }
        current = response?.data?.data?.job;
        if (!current?.id || !UUID.test(current.id)) throw new Error("Server did not return a job ID.");
        currentJobRef.current = current.id;
        saveSession(JOB_KEY, current.id);
        dropSession(ATTEMPT_KEY); setPendingAttempt(null);
        dropSession(CLEARED_KEY); setCleared(false); setImage("");
        autoloadedForRef.current = null;
        setJob(current);
      } else {
        // Refresh state before submitting a paid request; don't trust stale UI state.
        current = await refresh(current.id);
        if (current.status !== "pending") {
          setNotice("This job is already reserved or started. Check its current status.");
          return;
        }
      }
      const form = new FormData(); form.append("image", source);
      setStatusText("Submitting pattern extraction once...");
      // No automatic POST retry: an uncertain submission may already cost credits.
      try {
        await API.post(`${API_ROOT}/jobs/${current.id}/start`, form);
      } catch (submissionError) {
        setError(`${errorMessage(submissionError)} Check job status before any new extraction. Do not resubmit an uncertain request.`);
        try {await refresh(current.id);} catch { /* original error remains visible */ }
        return;
      }
      setStatusText("Checking AI progress...");
      await refresh(current.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      workRef.current = false; setBusy(false); setStatusText("");
    }
  }

  async function downloadSelectedCrop() {
    if (!file || !crop || cropError) return;
    try {
      const patch = await croppedFile(file, crop);
      const url = URL.createObjectURL(patch);
      const link = document.createElement("a");
      link.href = url;
      link.download = `designbyyou-exact-fabric-crop-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Downloaded the exact selected fabric crop. No FASHN credit was used.");
    } catch (cropFailure) {
      setError(errorMessage(cropFailure));
    }
  }

  function clearImage() {
    if (!job?.id) return;
    epochRef.current += 1;
    setImage(""); setLoadingImage(false); setCleared(true);
    saveSession(CLEARED_KEY, job.id);
    setNotice("Preview cleared from this browser. Your job and provider output were not deleted.");
  }
  function reset() {
    if (busy || restoring || !job || !["completed", "failed"].includes(job.status)) return;
    epochRef.current += 1; currentJobRef.current = null; fetchAttemptRef.current = false;
    autoloadedForRef.current = null;
    setFile(null); setCrop(null); setDraftCrop(null); setJob(null);
    setImage(""); setCleared(false); setMode("faithful"); setInstructions("");
    setError(""); setNotice(""); setPendingAttempt(null);
    dropSession(JOB_KEY); dropSession(ATTEMPT_KEY); dropSession(CLEARED_KEY);
    if (inputRef.current) inputRef.current.value = "";
  }
  function discardAttempt() {
    if (busy || job || !pendingAttempt) return;
    if (!window.confirm("Discard this unconfirmed job-creation attempt? A server job may already exist and count toward your limit.")) return;
    dropSession(ATTEMPT_KEY); setPendingAttempt(null); setError("");
  }

  const active = Boolean(job && ACTIVE.has(job.status));
  const blocking = busy || restoring || job?.status === "submitting" || job?.status === "submission_unknown";
  const canGenerate = Boolean(file && crop && cropPreview && !cropError && !blocking && (!job || job.status === "pending"));
  const selection = draftCrop || crop;

  return (
    <main className="min-h-screen bg-slate-50 pb-20 text-slate-900 dark:bg-[#090909] dark:text-white">
      <header className="border-b border-slate-200 bg-white dark:border-white/10 dark:bg-[#111111]">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
          <Link to="/creator/tools" className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-[#b58a32] dark:text-white/60">
            <ArrowLeft size={15}/> Back to Creative Hub
          </Link>
          <p className="mt-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.23em] text-[#a67c2c] dark:text-[#e5c67d]">
            <WandSparkles size={16}/> DesignByYou AI Creative Tools
          </p>
          <h1 className="mt-3 font-serif text-3xl tracking-tight sm:text-5xl">AI Pattern Extractor</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 dark:text-white/60">
            Select an area containing printed fabric, then reconstruct its motifs as 2D textile artwork. Do not select the entire garment. AI output may differ from the original print.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 pt-7 sm:px-8 lg:grid-cols-[350px_minmax(0,1fr)] lg:px-10">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151515]">
          <h2 className="flex items-center gap-2 font-serif text-xl"><ImagePlus size={18} className="text-[#b58a32]"/> Source Fabric</h2>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Upload fabric photo" onChange={(e) => acceptFile(e.target.files?.[0])}/>
          <div className={`mt-4 overflow-hidden rounded-xl border-2 border-dashed ${draggingFile ? "border-[#c9a353] bg-[#e5c67d]/10" : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.035]"}`}
            onDragOver={(e) => {e.preventDefault(); setDraggingFile(true);}}
            onDragLeave={(e) => {e.preventDefault(); setDraggingFile(false);}}
            onDrop={(e) => {e.preventDefault(); setDraggingFile(false); acceptFile(e.dataTransfer.files?.[0]);}}>
            {preview ? (
              <div className="flex justify-center p-2">
                <div ref={imageSurfaceRef} className={`relative inline-block max-w-full overflow-hidden ${!job || job.status === "pending" ? "cursor-crosshair touch-none" : ""}`}
                  onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => {dragStartRef.current = null; setDraftCrop(null);}}>
                  <img src={preview} alt="Uploaded fabric or garment" draggable={false} className="block max-h-[360px] max-w-full select-none object-contain"/>
                  {selection && <div className="pointer-events-none absolute border-2 border-[#e5c67d] bg-[#e5c67d]/20 shadow-[0_0_0_999px_rgba(0,0,0,0.22)]"
                    style={{left: `${selection.x * 100}%`, top: `${selection.y * 100}%`, width: `${selection.width * 100}%`, height: `${selection.height * 100}%`}}/>}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[230px] flex-col items-center justify-center gap-2 px-5 text-center">
                <UploadCloud size={32} className="text-[#b58a32]"/>
                <p className="text-sm font-semibold">Drop your fabric image here</p>
                <p className="text-xs text-slate-500 dark:text-white/50">JPG, PNG or WebP · Maximum 12 MB</p>
              </div>
            )}
          </div>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy || restoring || Boolean(job && job.status !== "pending")}
            className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-semibold hover:border-[#b58a32] disabled:opacity-40 dark:border-white/20">
            <UploadCloud size={15}/> {file ? "Change Image" : "Choose Image"}
          </button>
          {file && <p className="mt-2 truncate text-xs text-slate-500" title={file.name}>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
            {file && (!job || job.status === "pending") && <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-white/65">
              <span><Scissors size={13} className="inline"/> Required: drag a rectangle around the printed fabric only. Avoid garment edges, collars, buttons and belts.</span>
              {crop && <button type="button" onClick={() => setCrop(null)} className="shrink-0 font-semibold text-[#9a752c] underline">Clear crop</button>}
            </div>}
            {file && !crop && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200" role="status">
              Select a printed fabric patch first. Only the selected region will be sent to AI, so avoid including the full garment.
            </p>}
            {file && crop && <div className="mt-3 rounded-xl border border-[#c9a353]/50 bg-[#e5c67d]/10 p-3">
              <p className="text-xs font-semibold">Selected fabric patch — this is the only image sent to AI</p>
              {cropPreview ? <img src={cropPreview} alt="Preview of the exact fabric crop sent to AI" className="mx-auto mt-3 max-h-48 w-full rounded-lg object-contain" />
                : <p className={`mt-2 text-xs ${cropError ? "text-rose-600" : "text-slate-500"}`}>{cropError || "Preparing crop preview..."}</p>}
              <p className="mt-2 text-[11px] leading-5 text-slate-600 dark:text-white/65">
                Check this crop carefully: if it contains a dress outline, seams or accessories, select a different patch. Small original details cannot be recovered by upscaling.
              </p>
              <button type="button" onClick={() => void downloadSelectedCrop()} disabled={!cropPreview || Boolean(cropError)}
                className="mt-2 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#c9a353] px-3 text-xs font-semibold text-[#866320] hover:bg-[#e5c67d]/20 disabled:opacity-40 dark:text-[#f3d693]">
                <Download size={14}/> Download exact source crop (no AI credit)
              </button>
            </div>}
          {job?.status === "pending" && !file && <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">Reattach your original fabric image to submit this saved job.</p>}

          <div className="mt-6 border-t border-slate-200 pt-5 dark:border-white/10">
            <h2 className="font-serif text-lg">Extraction Mode</h2>
            <div className="mt-3 grid gap-2">
              {[{value: "faithful", title: "Original print", description: "Preserve source colors and motifs."},
                {value: "seamless", title: "Repeatable tile (experimental)", description: "Ask AI for a repeating design; verify seams."}].map((option) => (
                <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${mode === option.value ? "border-[#c9a353] bg-[#e5c67d]/10" : "border-slate-200 dark:border-white/10"}`}>
                  <input type="radio" name="pattern-mode" value={option.value} checked={mode === option.value} onChange={() => setMode(option.value)} disabled={Boolean(job || pendingAttempt) || busy || restoring} className="mt-1 accent-[#b58a32]"/>
                  <span><span className="block text-xs font-semibold">{option.title}</span><span className="mt-1 block text-[11px] text-slate-500 dark:text-white/55">{option.description}</span></span>
                </label>
              ))}
            </div>
            <label htmlFor="pattern-instructions" className="mt-4 block text-xs font-semibold">Optional instructions</label>
            <textarea id="pattern-instructions" rows={3} maxLength={500} value={instructions} onChange={(e) => setInstructions(e.target.value)}
              disabled={Boolean(job || pendingAttempt) || busy || restoring} placeholder="e.g. Extract the blue floral section and preserve the small white petals."
              className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-5 outline-none focus:border-[#b58a32] disabled:opacity-60 dark:border-white/15 dark:bg-[#111111]"/>
            <p className="mt-2 text-xs text-slate-500 dark:text-white/50">AI reconstruction: 1 estimated FASHN credit (Fast / 1K). Up to four new jobs per Creator per hour. The exact-crop download above is free.</p>
          </div>

          <button type="button" disabled={!canGenerate} onClick={() => void generate()}
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e5c67d] px-4 text-sm font-bold text-black transition hover:bg-[#f4d995] disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <Loader2 size={18} className="animate-spin"/> : <Sparkles size={18}/>}
              {busy ? "Submitting..." : job?.status === "pending" ? "Start Saved Extraction" : "AI Reconstruct Flat Pattern"}
          </button>
            {!crop && file && !job && <p className="mt-2 text-center text-xs text-amber-700 dark:text-amber-300">Select a fabric crop to enable AI extraction.</p>}
            {statusText && <p className="mt-2 text-center text-xs" role="status">{statusText}</p>}
          {pendingAttempt && !job && <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            Previous creation attempt is unconfirmed. The same request ID will be reused to avoid duplicate jobs.
            <button type="button" onClick={discardAttempt} className="mt-2 block font-semibold underline">Discard unconfirmed attempt</button>
          </div>}
          {error && <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">
            <AlertCircle size={16} className="shrink-0"/><span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X size={15}/></button>
          </div>}
          {job && <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
            <p className="flex items-center justify-between text-xs"><span className="font-semibold">Job status</span><span>{STATUS_LABEL[job.status] || job.status}</span></p>
            <p className="mt-2 break-all text-[10px] text-slate-500 dark:text-white/45">Job ID: {job.id}</p>
            {active && <p className="mt-2 flex items-center gap-2 text-xs text-slate-500"><Loader2 size={13} className="animate-spin"/> Checking status every 8 seconds</p>}
            {job.status === "submission_unknown" && <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">Submission outcome is uncertain. Do not retry; investigate the provider request.</p>}
            {job.status === "failed" && <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">AI generation failed. A new job requires a new request.</p>}
            {!["submitting", "submission_unknown"].includes(job.status) && !active && <button type="button" onClick={() => void refresh(job.id).catch((e) => setError(errorMessage(e)))} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#9a752c]"><RefreshCw size={13}/> Refresh status</button>}
            {["completed", "failed"].includes(job.status) && <button type="button" onClick={reset} className="ml-4 mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#9a752c]"><RefreshCw size={13}/> Start new extraction</button>}
          </div>}
            <p className="mt-5 flex items-start gap-2 text-[11px] leading-5 text-slate-500 dark:text-white/50"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#b58a32]"/>
              The crop download preserves source pixels; AI reconstructions may still contain clothing shapes or modified motifs and must be reviewed. Results are temporary. This is not a cutting-pattern tool.</p>
        </section>

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a67c2c] dark:text-[#e5c67d]">Fabric artwork studio</p>
              <h2 className="mt-1.5 font-serif text-2xl">Your Extracted Pattern</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-white/50">Compare the source with the reconstructed print.</p></div>
            {image && <div className="flex gap-2">
              <button type="button" onClick={() => {try {pngDownload(image);} catch(e) {setError(errorMessage(e));}}}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#e5c67d] px-4 text-xs font-bold text-black hover:bg-[#f4d995]"><Download size={15}/> Download PNG</button>
              <button type="button" onClick={clearImage} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:text-rose-300"><Trash2 size={14}/> Clear</button>
            </div>}
          </div>
          {notice && <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-[#e5c67d]/40 bg-[#e5c67d]/10 p-3 text-xs"><CheckCircle2 size={16}/><span>{notice}</span></div>}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#151515]">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10">
              <h3 className="font-serif text-lg">Pattern Output</h3>
              <span className="text-[11px] text-slate-500 dark:text-white/50">{job ? STATUS_LABEL[job.status] : "Not generated"}</span>
            </div>
            <div className="flex min-h-[350px] items-center justify-center p-4" style={CHECKER}>
              {image ? <img src={image} alt="AI-reconstructed flat textile pattern" className="max-h-[520px] w-full object-contain"/>
                : loadingImage || active || busy ? <div className="flex flex-col items-center gap-3 rounded-xl bg-white/90 p-6 text-center text-slate-700"><Loader2 className="animate-spin text-[#b58a32]" size={28}/><p className="text-sm">{loadingImage ? "Retrieving generated pattern..." : "Preparing your fabric print..."}</p></div>
                : <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl bg-white/90 p-6 text-center text-slate-600"><ScanLine size={30} className="text-[#b58a32]"/><p className="text-sm">{cleared ? "Preview cleared" : job?.status === "completed" ? "Your output is ready to load" : "Upload a fabric photograph to begin"}</p>
                    {job?.status === "completed" && <button type="button" onClick={() => void loadResult(true)} className="rounded-lg bg-[#e5c67d] px-4 py-2 text-xs font-bold text-black">{loadingImage ? "Loading..." : "Load Result"}</button>}</div>}
            </div>
          </div>
          {image && mode === "seamless" && <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#151515]">
            <h3 className="flex items-center gap-2 font-serif text-lg"><Grid3X3 size={18} className="text-[#b58a32]"/> 3 × 3 Repeat Preview</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/50">Check for visible joins; AI may not create mathematically seamless edges.</p>
            <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-lg border border-slate-200 dark:border-white/10">
              {Array.from({length: 9}, (_, i) => <img key={i} src={image} alt={i === 0 ? "Repeated textile tile preview" : ""} className="aspect-square w-full object-fill" draggable={false}/>)}
            </div>
          </div>}
          <p className="mt-5 text-[11px] leading-5 text-slate-500 dark:text-white/45">AI-extracted patterns are reconstructed artwork. Fine print details may change; confirm rights before commercial reproduction. Outputs are not guaranteed color-accurate or print-ready.</p>
        </section>
      </div>
    </main>
  );
}
