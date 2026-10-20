"use strict";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  History,
  ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import API from "../../api/axios";

const ENDPOINT = "/creators/ai/text-to-image";

const RATIOS = ["1:1", "3:4", "4:5", "2:3", "9:16", "16:9"];

const MODES = [
  { value: "fast", label: "Fast · 1 credit" },
  { value: "balanced", label: "Balanced · 2 credits" },
  { value: "quality", label: "Quality · 3 credits" },
];

const ACTIVE_STATUSES = new Set(["submitting", "processing", "saving"]);

const EXAMPLES = [
  {
    label: "Evening gown",
    prompt:
      "Full-body studio fashion photograph of a model wearing an emerald green satin evening gown with a structured bodice, embroidered sleeves, flowing skirt and soft cinematic lighting.",
  },
  {
    label: "Streetwear",
    prompt:
      "Editorial fashion photograph of a model in oversized modern streetwear, layered neutral hoodie, tailored cargo pants and chunky sneakers, urban concrete setting, realistic fabric detail.",
  },
  {
    label: "Bridal fashion",
    prompt:
      "Full-length luxury bridal fashion photography, model wearing an elegant ivory gown with delicate lace embroidery, sculpted waist and long flowing train, natural daylight, refined editorial style.",
  },
];

function getErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function isActive(job) {
  return Boolean(job && ACTIVE_STATUSES.has(job.status));
}

function getResultUrl(job) {
  const url = job?.status === "completed" ? job?.result_urls?.[0] : null;

  if (typeof url !== "string") return "";

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function getStatusLabel(status) {
  return (
    {
      submitting: "Submitting to FASHN",
      processing: "Generating your image",
      saving: "Saving your image",
      completed: "Ready to download",
      failed: "Generation failed",
    }[status] || "Preparing"
  );
}

function getDownloadFilename(job, extension = "png") {
  const shortId = String(job?.id || "fashion")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 8);

  return `designbyyou-text-to-image-${shortId || "image"}.${extension}`;
}

/*
 * Cloudinary's fl_attachment transformation asks the
 * image CDN to send Content-Disposition: attachment.
 *
 * This avoids relying on the HTML download attribute
 * for cross-origin images.
 */
function getCloudinaryAttachmentUrl(rawUrl, job) {
  try {
    const url = new URL(rawUrl);

    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") {
      return null;
    }

    const marker = "/image/upload/";
    const position = url.pathname.indexOf(marker);

    if (position === -1 || url.pathname.includes("/s--")) {
      return null;
    }

    const before = url.pathname.slice(0, position + marker.length);

    const after = url.pathname.slice(position + marker.length);

    if (!after) return null;

    const basename = getDownloadFilename(job).replace(/\.png$/, "");

    url.pathname = `${before}fl_attachment:${basename}/${after}`;

    return url.toString();
  } catch {
    return null;
  }
}

export default function CreatorTextToImage() {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("3:4");
  const [generationMode, setGenerationMode] = useState("fast");

  const [generating, setGenerating] = useState(false);
  const [job, setJob] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  const [error, setError] = useState("");
  const [progressError, setProgressError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);

  const requestKey = useRef(null);

  /*
   * ========================================================
   * Load generation history
   * ========================================================
   */
  const refreshHistory = useCallback(async () => {
    const response = await API.get(`${ENDPOINT}/history`);

    const list = Array.isArray(response.data?.data) ? response.data.data : [];

    setHistory(list);
    setHistoryError("");

    return list;
  }, []);

  useEffect(() => {
    let mounted = true;

    API.get(`${ENDPOINT}/history`)
      .then((response) => {
        if (!mounted) return;

        const list = Array.isArray(response.data?.data)
          ? response.data.data
          : [];

        setHistory(list);

        // Resume an unfinished job, otherwise show latest.
        setJob(list.find(isActive) || list[0] || null);
      })
      .catch((err) => {
        if (mounted) {
          setHistoryError(
            getErrorMessage(err, "Could not load generation history."),
          );
        }
      })
      .finally(() => {
        if (mounted) {
          setHistoryLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * ========================================================
   * Track active generation
   *
   * A Creator can view an older completed image while
   * a newer generation is still processing.
   * ========================================================
   */
  const activeJob = history.find(isActive) || (isActive(job) ? job : null);

  const activeJobId = activeJob?.id || null;

  useEffect(() => {
    if (!activeJobId) return undefined;

    let alive = true;
    let timer;

    const check = async () => {
      try {
        const response = await API.get(
          `${ENDPOINT}/${encodeURIComponent(activeJobId)}`,
        );

        const current = response.data?.data;

        if (!alive || !current) return;

        setHistory((previous) => {
          const found = previous.some((item) => item.id === current.id);

          return found
            ? previous.map((item) => (item.id === current.id ? current : item))
            : [current, ...previous];
        });

        setJob((previous) =>
          previous?.id === current.id ? current : previous,
        );

        setProgressError("");

        if (current.status === "completed" || current.status === "failed") {
          try {
            await refreshHistory();
          } catch {
            // Status response already contains current job.
          }

          return;
        }
      } catch (err) {
        if (alive) {
          setProgressError(
            getErrorMessage(err, "Could not check progress. Retrying..."),
          );
        }
      }

      if (alive) {
        timer = setTimeout(check, 3500);
      }
    };

    timer = setTimeout(check, 1500);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [activeJobId, refreshHistory]);

  /*
   * ========================================================
   * Prompt changes
   * ========================================================
   */
  const updatePrompt = (value) => {
    setPrompt(value);
    requestKey.current = null;
    setError("");
  };

  /*
   * ========================================================
   * Submit generation
   * ========================================================
   */
  const submit = async (event) => {
    event.preventDefault();

    if (generating || activeJobId) return;

    const cleaned = prompt.trim();

    if (cleaned.length < 12 || cleaned.length > 1200) {
      setError("Enter a fashion prompt between 12 and 1,200 characters.");
      return;
    }

    setGenerating(true);
    setError("");
    setDownloadError("");
    setProgressError("");

    if (!requestKey.current) {
      requestKey.current = crypto.randomUUID();
    }

    try {
      const response = await API.post(ENDPOINT, {
        prompt: cleaned,
        aspect_ratio: aspectRatio,
        generation_mode: generationMode,
        request_key: requestKey.current,
      });

      const created = response.data?.data;

      if (!created?.id) {
        throw new Error("Generation response was incomplete.");
      }

      setJob(created);

      setHistory((previous) => [
        created,
        ...previous.filter((item) => item.id !== created.id),
      ]);

      requestKey.current = null;

      try {
        await refreshHistory();
      } catch {
        // The returned job can still be polled.
      }
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          "The generation could not be started. Please try again.",
        ),
      );

      if (err?.response?.data?.code === "FASHN_SUBMISSION_FAILED") {
        requestKey.current = null;
      }
    } finally {
      setGenerating(false);
    }
  };

  /*
   * ========================================================
   * DOWNLOAD IMAGE
   *
   * Cloudinary images:
   *   Use fl_attachment to force browser download.
   *
   * Other HTTPS images:
   *   Fetch image bytes and save through Blob URL,
   *   subject to the image host's CORS permissions.
   * ========================================================
   */
  const downloadImage = async (selectedJob) => {
    const imageUrl = getResultUrl(selectedJob);

    if (!imageUrl) {
      setDownloadError("This generation does not have a downloadable image.");
      return;
    }

    setDownloadError("");
    setDownloadingId(selectedJob.id);

    try {
      const attachmentUrl = getCloudinaryAttachmentUrl(imageUrl, selectedJob);

      if (attachmentUrl) {
        const link = document.createElement("a");

        link.href = attachmentUrl;
        link.download = getDownloadFilename(selectedJob);
        link.rel = "noopener noreferrer";

        document.body.appendChild(link);
        link.click();
        link.remove();

        return;
      }

      // Fallback: download via image Blob.
      const response = await fetch(imageUrl, {
        mode: "cors",
        credentials: "omit",
      });

      if (!response.ok) {
        throw new Error("Image download request failed.");
      }

      const type = (response.headers.get("content-type") || "")
        .split(";")[0]
        .toLowerCase();

      const extensions = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
      };

      if (!extensions[type]) {
        throw new Error("Unsupported image format.");
      }

      const blob = await response.blob();

      if (blob.size === 0 || blob.size > 25 * 1024 * 1024) {
        throw new Error("Image is empty or too large to download.");
      }

      const objectUrl = URL.createObjectURL(blob);

      try {
        const link = document.createElement("a");

        link.href = objectUrl;
        link.download = getDownloadFilename(selectedJob, extensions[type]);

        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
    } catch (err) {
      setDownloadError(
        "Automatic download was blocked. " +
          "Select 'View Full Image' and save the image " +
          "from your browser. " +
          (err?.message || ""),
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const resultUrl = getResultUrl(job);
  const selectedStatus = job?.status;

  const busy = Boolean(activeJobId || generating);

  /*
   * ========================================================
   * UI
   * ========================================================
   */
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-[#090909] dark:text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Back navigation */}
        <Link
          to="/creator/tools"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-[#ae852e] dark:text-white/60"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to Creative Hub
        </Link>

        {/* Page header */}
        <header className="mt-7 flex flex-wrap items-start gap-4">
          <div className="rounded-2xl bg-[#e5c67d]/20 p-3 text-[#ab802c]">
            <WandSparkles size={27} aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#a78032] dark:text-[#e5c67d]">
              FASHN AI · Creative tools
            </p>

            <h1 className="mt-1 font-serif text-3xl tracking-tight sm:text-4xl">
              AI Text to Image
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-white/55">
              Describe your fashion idea, generate an image, and download it to
              your device. Your results stay in your private generation history.
            </p>
          </div>
        </header>

        {/* Generator and result */}
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
          {/* Generator */}
          <form
            onSubmit={submit}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151515] sm:p-7"
          >
            <div className="flex items-center gap-2">
              <Sparkles
                size={18}
                className="text-[#b38a35]"
                aria-hidden="true"
              />

              <h2 className="font-serif text-xl">Create your image</h2>
            </div>

            <label
              htmlFor="t2i-prompt"
              className="mt-6 block text-xs font-bold uppercase tracking-wider"
            >
              Describe your image
            </label>

            <textarea
              id="t2i-prompt"
              value={prompt}
              onChange={(event) => updatePrompt(event.target.value)}
              rows={7}
              maxLength={1200}
              placeholder="A full-body fashion photograph of a model wearing an emerald-green satin evening gown..."
              className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 outline-none transition focus:border-[#c9a14c] focus:ring-2 focus:ring-[#e5c67d]/20 dark:border-white/10 dark:bg-[#0d0d0d]"
            />

            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>
                Be specific about the garment, fabric, colors and setting.
              </span>

              <span className="shrink-0 pl-2">{prompt.length} / 1200</span>
            </div>

            {/* Example prompts */}
            <p className="mt-5 text-xs font-bold uppercase tracking-wider">
              Try an example
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => updatePrompt(example.prompt)}
                  className="rounded-full border border-[#d7b66b]/50 bg-[#e5c67d]/10 px-3 py-2 text-xs font-medium text-[#9b7424] transition hover:bg-[#e5c67d]/20 dark:text-[#e5c67d]"
                >
                  {example.label}
                </button>
              ))}
            </div>

            {/* Generation settings */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="t2i-ratio"
                  className="block text-xs font-bold uppercase tracking-wider"
                >
                  Aspect ratio
                </label>

                <select
                  id="t2i-ratio"
                  value={aspectRatio}
                  onChange={(event) => {
                    setAspectRatio(event.target.value);
                    requestKey.current = null;
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-[#202020]"
                >
                  {RATIOS.map((ratio) => (
                    <option value={ratio} key={ratio}>
                      {ratio}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="t2i-mode"
                  className="block text-xs font-bold uppercase tracking-wider"
                >
                  Generation quality · 1K
                </label>

                <select
                  id="t2i-mode"
                  value={generationMode}
                  onChange={(event) => {
                    setGenerationMode(event.target.value);
                    requestKey.current = null;
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-[#202020]"
                >
                  {MODES.map((mode) => (
                    <option value={mode.value} key={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-white/50">
              One image per generation. Testing limit: five requests per Creator
              per rolling 24 hours (unless changed on the server). Images are
              not automatically published to Showcase.
            </p>

            {/* Submission errors */}
            {error && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
              >
                {error}
              </div>
            )}

            {/* Generate */}
            <button
              type="submit"
              disabled={busy || prompt.trim().length < 12}
              className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e5c67d] px-5 text-sm font-bold text-[#17130b] transition hover:bg-[#f4d995] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b58a32] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2
                  size={18}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <WandSparkles size={18} aria-hidden="true" />
              )}

              {generating
                ? "Submitting..."
                : activeJobId
                  ? "Generation in progress"
                  : "Generate Fashion Image"}
            </button>

            {activeJobId && (
              <p className="mt-3 text-center text-xs text-slate-500 dark:text-white/50">
                You can browse previous results while your image generates.
              </p>
            )}
          </form>

          {/* Result */}
          <section
            aria-label="AI image result"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151515] sm:p-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-serif text-xl">Your Result</h2>

              {job && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-white/75">
                  {selectedStatus === "completed" ? (
                    <CheckCircle2 size={14} className="text-emerald-600" />
                  ) : selectedStatus === "failed" ? (
                    <X size={14} className="text-red-500" />
                  ) : (
                    <Clock3 size={14} />
                  )}

                  {getStatusLabel(selectedStatus)}
                </span>
              )}
            </div>

            {/* Image preview */}
            <div className="mt-4 flex min-h-[380px] items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-[#0b0b0b]">
              {resultUrl ? (
                <img
                  src={resultUrl}
                  alt={job.prompt || "AI-generated fashion image"}
                  className="max-h-[570px] w-full object-contain"
                />
              ) : isActive(job) ? (
                <div className="px-6 text-center text-slate-500 dark:text-white/60">
                  <Loader2
                    size={32}
                    className="mx-auto animate-spin text-[#ab802c]"
                    aria-hidden="true"
                  />

                  <p className="mt-4 text-sm font-medium">
                    {getStatusLabel(selectedStatus)}...
                  </p>

                  <p className="mt-2 text-xs">
                    This usually takes a little time. Please keep the page open.
                  </p>
                </div>
              ) : job?.status === "failed" ? (
                <div className="px-6 text-center text-red-600 dark:text-red-400">
                  <X className="mx-auto" size={34} aria-hidden="true" />

                  <p className="mt-3 text-sm">
                    {job.error_message ||
                      "This generation could not be completed."}
                  </p>
                </div>
              ) : (
                <div className="px-6 text-center text-slate-400">
                  <ImageIcon className="mx-auto" size={39} aria-hidden="true" />

                  <p className="mt-4 text-sm">
                    Your generated image will appear here.
                  </p>
                </div>
              )}
            </div>

            {/* Generation metadata */}
            {job?.created_at && (
              <p className="mt-3 text-xs text-slate-400">
                {formatDate(job.created_at)}
                {" · "}
                {job.aspect_ratio}
                {" · "}
                {job.generation_mode}

                {job.credits_used != null
                  ? ` · ${job.credits_used} credit(s) used`
                  : ""}
              </p>
            )}

            {/* DOWNLOAD AND VIEW */}
            {resultUrl && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={downloadingId === job.id}
                  onClick={() => downloadImage(job)}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e5c67d] px-4 text-sm font-bold text-[#17130b] transition hover:bg-[#f4d995] disabled:opacity-60"
                >
                  {downloadingId === job.id ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : (
                    <Download size={17} />
                  )}
                  Download Image
                </button>

                <a
                  href={resultUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:border-[#d4ae57] dark:border-white/20 dark:text-white"
                >
                  <ExternalLink size={17} aria-hidden="true" />
                  View Full Image
                </a>
              </div>
            )}

            {downloadError && (
              <p
                role="alert"
                className="mt-3 text-xs leading-5 text-red-600 dark:text-red-400"
              >
                {downloadError}
              </p>
            )}

            {progressError && activeJobId && (
              <p
                role="status"
                className="mt-3 text-xs leading-5 text-amber-700 dark:text-amber-300"
              >
                {progressError}
              </p>
            )}

            <p className="mt-4 text-xs leading-5 text-slate-400">
              Generated images are saved to your history and are not published
              to Showcase automatically. Anyone with a direct image link may be
              able to view that image.
            </p>
          </section>
        </div>

        {/* History */}
        <section className="mt-9" aria-label="Previous AI generations">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <History
                size={19}
                className="text-[#ab802c]"
                aria-hidden="true"
              />

              <h2 className="font-serif text-2xl">Recent Generations</h2>
            </div>

            <button
              type="button"
              onClick={async () => {
                setHistoryLoading(true);

                try {
                  await refreshHistory();
                } catch (err) {
                  setHistoryError(
                    getErrorMessage(err, "Could not refresh history."),
                  );
                } finally {
                  setHistoryLoading(false);
                }
              }}
              disabled={historyLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:border-[#d4ae57] disabled:opacity-50 dark:border-white/15"
            >
              <RefreshCw
                size={15}
                className={historyLoading ? "animate-spin" : ""}
                aria-hidden="true"
              />
              Refresh
            </button>
          </div>

          {historyError && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {historyError}
            </p>
          )}

          {historyLoading && history.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              Loading your history...
            </p>
          ) : history.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-[#151515]">
              No generations yet. Create your first fashion image above.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {history.map((item) => {
                const imageUrl = getResultUrl(item);

                const selected = item.id === job?.id;

                return (
                  <article
                    key={item.id}
                    className={`overflow-hidden rounded-xl border bg-white transition dark:bg-[#151515] ${
                      selected
                        ? "border-[#d7b66b] ring-1 ring-[#e5c67d]/60"
                        : "border-slate-200 dark:border-white/10"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setJob(item);
                        setDownloadError("");
                      }}
                      aria-pressed={selected}
                      className="block w-full text-left"
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={item.prompt || "Generated fashion image"}
                          loading="lazy"
                          className="aspect-[3/4] w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[3/4] items-center justify-center bg-slate-100 text-xs text-slate-400 dark:bg-[#202020]">
                          {isActive(item) ? (
                            <Loader2 size={22} className="animate-spin" />
                          ) : (
                            getStatusLabel(item.status)
                          )}
                        </div>
                      )}

                      <div className="p-3">
                        <p className="line-clamp-2 min-h-9 text-xs leading-5">
                          {item.prompt}
                        </p>

                        <p className="mt-2 text-[11px] capitalize text-slate-400">
                          {item.status}
                          {" · "}
                          {formatDate(item.created_at)}
                        </p>
                      </div>
                    </button>

                    {/* Download previous images */}
                    {imageUrl && (
                      <div className="border-t border-slate-100 p-3 dark:border-white/10">
                        <button
                          type="button"
                          onClick={() => downloadImage(item)}
                          disabled={downloadingId === item.id}
                          className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#e5c67d]/20 text-xs font-bold text-[#997325] transition hover:bg-[#e5c67d]/30 disabled:opacity-60 dark:text-[#e5c67d]"
                        >
                          {downloadingId === item.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Download size={14} />
                          )}
                          Download
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
