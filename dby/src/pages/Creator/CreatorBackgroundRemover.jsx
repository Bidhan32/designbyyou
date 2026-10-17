"use strict";

/*
 * DesignByYou — Creator Background Remover
 * Version 1.0
 *
 * Backend: POST /api/v1/creator-tools/background-remove
 * Multipart field: image
 * Uses the existing authenticated Axios client.
 * Results are temporary; no account saving in this version.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileImage,
  ImagePlus,
  Loader2,
  RefreshCcw,
  Scissors,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import API from "../../api/axios";

const ENDPOINT = "/creator-tools/background-remove";
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPT_ATTRIBUTE = "image/jpeg,image/png,image/webp";
const REQUEST_TIMEOUT_MS = 110000;

const CHECKERBOARD = {
  backgroundColor: "#f2f2f2",
  backgroundImage:
    "linear-gradient(45deg,#dedede 25%,transparent 25%),linear-gradient(-45deg,#dedede 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#dedede 75%),linear-gradient(-45deg,transparent 75%,#dedede 75%)",
  backgroundPosition: "0 0,0 12px,12px -12px,-12px 0",
  backgroundSize: "24px 24px",
};

function formattedBytes(value) {
  const n = Number(value) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function decodePngDataUri(dataUri) {
  if (
    typeof dataUri !== "string" ||
    !dataUri.startsWith("data:image/png;base64,")
  ) {
    throw new Error("The server did not return a valid transparent PNG.");
  }

  const base64 = dataUri.slice("data:image/png;base64,".length);
  let binary;
  try {
    binary = atob(base64);
  } catch {
    throw new Error("Unable to decode the generated PNG.");
  }

  // Decode in chunks to avoid an extra large typed-array allocation.
  const chunks = [];
  const CHUNK_SIZE = 64 * 1024;
  for (let offset = 0; offset < binary.length; offset += CHUNK_SIZE) {
    const part = binary.slice(offset, offset + CHUNK_SIZE);
    const bytes = new Uint8Array(part.length);
    for (let i = 0; i < part.length; i += 1) bytes[i] = part.charCodeAt(i);
    chunks.push(bytes);
  }
  return new Blob(chunks, { type: "image/png" });
}

function friendlyError(error) {
  if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError") {
    return "The request was cancelled.";
  }
  const status = error?.response?.status;
  const message = error?.response?.data?.message;
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "This tool requires a verified Creator account.";
  if (status === 413) return "Your image exceeds the 12 MB upload limit.";
  if (status === 429)
    return message || "Too many requests. Please wait before retrying.";
  if (status === 504)
    return "AI processing took too long. Please try again later.";
  if (typeof message === "string" && message.trim()) return message;
  if (error?.code === "ECONNABORTED")
    return "The request timed out. Please try again.";
  if (!error?.response)
    return "Cannot connect to the server. Check your connection and try again.";
  return "We couldn't remove the background. Please try another photo.";
}

export default function CreatorBackgroundRemover() {
  const inputRef = useRef(null);
  const originalUrlRef = useRef(null);
  const outputUrlRef = useRef(null);
  const requestRef = useRef(null);
  const processingRef = useRef(false);

  const [file, setFile] = useState(null);
  const [originalUrl, setOriginalUrl] = useState("");
  const [outputUrl, setOutputUrl] = useState("");
  const [outputBytes, setOutputBytes] = useState(0);
  const [outputDimensions, setOutputDimensions] = useState(null);
  const [originalDimensions, setOriginalDimensions] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [slider, setSlider] = useState(50);
  const [view, setView] = useState("compare");
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    return () => {
      requestRef.current?.abort();
      if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
      if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    };
  }, []);

  const clearOutput = useCallback(() => {
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    outputUrlRef.current = null;
    setOutputUrl("");
    setOutputBytes(0);
    setOutputDimensions(null);
    setSlider(50);
    setView("compare");
    setUsage(null);
  }, []);

  const chooseFile = useCallback(
    (nextFile) => {
      if (processingRef.current || !nextFile) return;
      setError("");
      if (!ACCEPTED_TYPES.has(nextFile.type)) {
        setError("Choose a JPG, PNG or WebP image.");
        return;
      }
      if (nextFile.size === 0 || nextFile.size > MAX_FILE_BYTES) {
        setError("Choose a non-empty image of 12 MB or less.");
        return;
      }
      if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
      clearOutput();
      const url = URL.createObjectURL(nextFile);
      originalUrlRef.current = url;
      setOriginalUrl(url);
      setOriginalDimensions(null);
      setFile(nextFile);
    },
    [clearOutput],
  );

  const resetAll = useCallback(() => {
    if (processingRef.current) return;
    if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
    originalUrlRef.current = null;
    setOriginalUrl("");
    setOriginalDimensions(null);
    setFile(null);
    setError("");
    clearOutput();
    if (inputRef.current) inputRef.current.value = "";
  }, [clearOutput]);

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    if (!processingRef.current) chooseFile(event.dataTransfer?.files?.[0]);
  };

  const generate = async () => {
    if (!file || processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    setError("");
    clearOutput();

    const controller = new AbortController();
    requestRef.current = controller;

    try {
      const form = new FormData();
      form.append("image", file, file.name);

      // Let Axios/browser set the multipart boundary automatically.
      const response = await API.post(ENDPOINT, form, {
        signal: controller.signal,
        timeout: REQUEST_TIMEOUT_MS,
      });
      const payload = response?.data;
      if (payload?.status !== "success" || !payload?.data?.image) {
        throw new Error("Invalid background removal response.");
      }
      const blob = decodePngDataUri(payload.data.image);
      const url = URL.createObjectURL(blob);
      outputUrlRef.current = url;
      setOutputUrl(url);
      setOutputBytes(blob.size);
      setUsage(payload.data.usage || null);
      setView("compare");
    } catch (caught) {
      if (caught?.code !== "ERR_CANCELED" && caught?.name !== "CanceledError") {
        const isInvalidResponse = [
          "Invalid background",
          "The server",
          "Unable to decode",
        ].some((prefix) => String(caught?.message || "").startsWith(prefix));
        setError(isInvalidResponse ? caught.message : friendlyError(caught));
      }
    } finally {
      requestRef.current = null;
      processingRef.current = false;
      setProcessing(false);
    }
  };

  const download = () => {
    if (!outputUrl) return;
    const stem = (file?.name || "designbyyou-image")
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .slice(0, 65);
    const a = document.createElement("a");
    a.href = outputUrl;
    a.download = `${stem || "designbyyou"}-no-background.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const hasResult = Boolean(outputUrl);
  const dimensionLabel = (value) =>
    value ? `${value.width} × ${value.height}px` : "";

  return (
    <main className="min-h-screen bg-[#faf9f6] pb-24 text-slate-900 dark:bg-[#080808] dark:text-white">
      <section className="relative overflow-hidden border-b border-[#d7bb78]/20 bg-[#12100e] px-5 py-12 text-white sm:px-8 sm:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-48 h-96 w-96 rounded-full bg-[#d3aa52]/15 blur-3xl"
        />
        <div className="relative mx-auto max-w-7xl">
          <Link
            to="/creator/tools"
            className="inline-flex items-center gap-2 text-xs text-white/65 transition hover:text-[#e5c67d]"
          >
            <ArrowLeft size={16} /> Back to Creative Hub
          </Link>
          <div className="mt-10 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[.25em] text-[#e5c67d]">
            <Sparkles size={16} /> DesignByYou AI Studio
          </div>
          <h1 className="mt-4 max-w-3xl font-serif text-4xl leading-tight sm:text-5xl lg:text-6xl">
            Background <span className="italic text-[#e5c67d]">Remover</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-white/65 sm:text-base">
            Turn fashion photographs, accessories and creative assets into
            clean, transparent PNGs in a few clicks.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-[11px] text-white/65">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2">
              <ShieldCheck size={14} className="text-[#e5c67d]" /> Creator-only
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2">
              <FileImage size={14} className="text-[#e5c67d]" /> Transparent PNG
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2">
              <Scissors size={14} className="text-[#e5c67d]" /> Powered by AI
            </span>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-7 px-5 pt-9 sm:px-8 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-9">
        <section
          className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414] sm:p-6"
          aria-labelledby="upload-title"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.19em] text-[#ad8128] dark:text-[#e5c67d]">
                Step 01
              </p>
              <h2 id="upload-title" className="mt-2 font-serif text-2xl">
                Choose your image
              </h2>
            </div>
            <ImagePlus
              className="text-[#b38d43]"
              size={22}
              aria-hidden="true"
            />
          </div>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            disabled={processing}
            onChange={(event) => {
              chooseFile(event.target.files?.[0]);
              event.target.value = "";
            }}
            aria-label="Choose a photo to remove its background"
          />
          <div
            onDragEnter={(event) => {
              event.preventDefault();
              if (!processing) setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (!event.currentTarget.contains(event.relatedTarget))
                setDragging(false);
            }}
            onDrop={onDrop}
            className={`mt-6 rounded-2xl border-2 border-dashed p-5 text-center transition ${dragging ? "border-[#c9a250] bg-[#fff8e6] dark:bg-[#e5c67d]/10" : "border-slate-200 bg-slate-50 dark:border-white/15 dark:bg-white/[.035]"}`}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e5c67d]/15 text-[#ad8128] dark:text-[#e5c67d]">
              <UploadCloud size={26} aria-hidden="true" />
            </div>
            <p className="mt-4 text-sm font-bold">Drag an image here</p>
            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-white/50">
              Or browse from your device
            </p>
            <button
              type="button"
              disabled={processing}
              onClick={() => inputRef.current?.click()}
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-[#c9a250] px-5 text-xs font-bold text-[#8e671c] transition hover:bg-[#e5c67d] hover:text-black disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#e5c67d]"
            >
              Browse images
            </button>
            <p className="mt-4 text-[11px] text-slate-400 dark:text-white/40">
              JPG, PNG, WebP · Up to 12 MB
            </p>
          </div>

          {file && (
            <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold" title={file.name}>
                  {file.name}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-white/50">
                  {formattedBytes(file.size)}{" "}
                  {originalDimensions
                    ? `· ${dimensionLabel(originalDimensions)}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={resetAll}
                disabled={processing}
                aria-label="Remove selected image"
                className="rounded-lg p-1 text-slate-400 hover:text-red-600 disabled:opacity-40"
              >
                <X size={17} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={generate}
            disabled={!file || processing}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e5c67d] px-4 text-sm font-bold text-black transition hover:bg-[#f3d790] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-white/10 dark:disabled:text-white/30"
          >
            {processing ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Removing
                background...
              </>
            ) : (
              <>
                <Scissors size={17} /> Remove background{" "}
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200"
            >
              <AlertCircle size={17} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
          <p className="mt-4 text-[11px] leading-5 text-slate-500 dark:text-white/40">
            Your image is sent to FASHN AI for processing. It is not
            automatically saved to your DesignByYou profile.
          </p>
          {usage && (
            <p className="mt-3 text-[11px] text-slate-500 dark:text-white/50">
              Usage this hour: {usage.used} of {usage.limit} successful
              generations
            </p>
          )}
        </section>

        <section
          className="min-w-0 overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#141414]"
          aria-labelledby="preview-title"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 dark:border-white/10 sm:px-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.19em] text-[#ad8128] dark:text-[#e5c67d]">
                Step 02
              </p>
              <h2 id="preview-title" className="mt-1 font-serif text-2xl">
                Your workspace
              </h2>
            </div>
            {hasResult && (
              <div
                role="group"
                aria-label="Image viewing mode"
                className="flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-white/10"
              >
                {[
                  { id: "compare", title: "Compare" },
                  { id: "result", title: "Result" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setView(item.id)}
                    aria-pressed={view === item.id}
                    className={`rounded-lg px-3 py-2 font-semibold transition ${view === item.id ? "bg-white text-black shadow-sm dark:bg-[#e5c67d]" : "text-slate-500 dark:text-white/60"}`}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 sm:p-6">
            <div
              className="relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-[#f0efed] dark:border-white/10 sm:min-h-[430px]"
              style={
                !file || (hasResult && view === "result")
                  ? CHECKERBOARD
                  : undefined
              }
            >
              {!file && (
                <div className="px-5 text-center">
                  <FileImage
                    size={37}
                    className="mx-auto text-slate-400"
                    aria-hidden="true"
                  />
                  <p className="mt-4 font-serif text-xl text-slate-700">
                    Your image will appear here
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Choose a photo to get started.
                  </p>
                </div>
              )}

              {file && originalUrl && (
                <div
                  className="relative flex h-[340px] w-full items-center justify-center sm:h-[465px]"
                  style={
                    hasResult && view === "compare" ? CHECKERBOARD : undefined
                  }
                >
                  <img
                    src={originalUrl}
                    alt="Original uploaded image"
                    className={`h-full w-full object-contain ${hasResult && view === "result" ? "hidden" : ""}`}
                    onLoad={(event) =>
                      setOriginalDimensions({
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      })
                    }
                  />
                  {hasResult && (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{
                        ...CHECKERBOARD,
                        clipPath:
                          view === "compare"
                            ? `inset(0 ${100 - slider}% 0 0)`
                            : undefined,
                      }}
                    >
                      <img
                        src={outputUrl}
                        alt="Image with background removed"
                        className="h-full w-full object-contain"
                        onLoad={(event) =>
                          setOutputDimensions({
                            width: event.currentTarget.naturalWidth,
                            height: event.currentTarget.naturalHeight,
                          })
                        }
                      />
                    </div>
                  )}
                  {hasResult && view === "compare" && (
                    <>
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 z-10 w-[2px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.2)]"
                        style={{ left: `${slider}%` }}
                      />
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1/2 z-20 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#171717] text-xs font-bold text-white shadow-lg"
                        style={{ left: `${slider}%` }}
                      >
                        ↔
                      </div>
                      <span className="pointer-events-none absolute left-3 top-3 z-20 rounded-md bg-black/65 px-2 py-1 text-[10px] font-bold text-white">
                        AFTER
                      </span>
                      <span className="pointer-events-none absolute right-3 top-3 z-20 rounded-md bg-black/65 px-2 py-1 text-[10px] font-bold text-white">
                        BEFORE
                      </span>
                    </>
                  )}
                  {processing && (
                    <div
                      className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#141414]/75 px-5 text-center text-white backdrop-blur-sm"
                      role="status"
                      aria-live="polite"
                    >
                      <Loader2
                        size={35}
                        className="animate-spin text-[#e5c67d]"
                      />
                      <p className="mt-5 font-serif text-xl">
                        Removing background
                      </p>
                      <p className="mt-2 text-xs text-white/65">
                        AI is separating your subject from the background.
                        Please keep this page open.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {hasResult && view === "compare" && (
              <div className="mt-5">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[.13em] text-slate-500 dark:text-white/60">
                  <span>Background removed</span>
                  <span>Original</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={slider}
                  onChange={(event) => setSlider(Number(event.target.value))}
                  aria-label="Reveal percentage of the background-removed image"
                  className="mt-3 w-full cursor-ew-resize accent-[#b68b36]"
                />
              </div>
            )}

            {hasResult && (
              <div className="mt-6 flex flex-col justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <CheckCircle2
                    size={23}
                    className="shrink-0 text-emerald-600 dark:text-emerald-300"
                  />
                  <div>
                    <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                      Background removed
                    </p>
                    <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-200/70">
                      Transparent PNG · {formattedBytes(outputBytes)}{" "}
                      {outputDimensions
                        ? `· ${dimensionLabel(outputDimensions)}`
                        : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={download}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#171717] px-5 text-xs font-bold text-white hover:bg-black dark:bg-[#e5c67d] dark:text-black"
                >
                  <Download size={17} /> Download PNG
                </button>
              </div>
            )}

            {file && !processing && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500 dark:text-white/50">
                  {hasResult
                    ? "Want to try another photo?"
                    : "Ready when you are."}
                </p>
                <button
                  type="button"
                  onClick={resetAll}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-[#987126] transition hover:text-black dark:text-[#e5c67d] dark:hover:text-white"
                >
                  <RefreshCcw size={15} /> Start over
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="mx-auto mt-8 max-w-7xl px-5 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d7bb78]/30 bg-[#e5c67d]/10 px-5 py-4 dark:bg-[#e5c67d]/[.06]">
          <p className="text-xs leading-6 text-slate-600 dark:text-white/65">
            Your generated image is temporary. Download the PNG before leaving
            this page.
          </p>
          <Link
            to="/creator/tools"
            className="inline-flex items-center gap-2 text-xs font-bold text-[#906819] dark:text-[#e5c67d]"
          >
            Explore more tools <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </main>
  );
}
