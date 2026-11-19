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

// ========================================================
// Configuration
// ========================================================

const ENDPOINT = "/creators/ai/text-to-image";

const RATIOS = ["1:1", "3:4", "4:5", "2:3", "9:16", "16:9"];

const MODES = [
  {
    value: "fast",
    label: "Fast",
  },
  {
    value: "balanced",
    label: "Balanced",
  },
  {
    value: "quality",
    label: "Quality",
  },
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

// ========================================================
// Helpers
// ========================================================

function getErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function isActive(job) {
  return Boolean(job && ACTIVE_STATUSES.has(job.status));
}

function getResultUrl(job) {
  const url = job?.status === "completed" ? job?.result_urls?.[0] : null;

  if (typeof url !== "string") {
    return "";
  }

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

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getStatusLabel(status) {
  const labels = {
    submitting: "Submitting prompt",
    processing: "Generating your image",
    queued: "Waiting in the generation queue",
    saving: "Saving your image",
    completed: "Ready to download",
    failed: "Generation failed",
  };

  return labels[status] || "Preparing";
}

function getDownloadFilename(job, extension = "png") {
  const shortId = String(job?.id || "fashion")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 8);

  return `designbyyou-text-to-image-` + `${shortId || "image"}.${extension}`;
}

// ========================================================
// Cloudinary Download URL
// ========================================================

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

    if (!after) {
      return null;
    }

    const basename = getDownloadFilename(job).replace(/\.png$/, "");

    url.pathname = `${before}fl_attachment:${basename}/${after}`;

    return url.toString();
  } catch {
    return null;
  }
}

// ========================================================
// Creator Text to Image
// ========================================================

export default function CreatorTextToImage() {
  // ------------------------------------------------------
  // Generator State
  // ------------------------------------------------------

  const [prompt, setPrompt] = useState("");

  const [aspectRatio, setAspectRatio] = useState("3:4");

  const [generationMode, setGenerationMode] = useState("fast");

  const [generating, setGenerating] = useState(false);

  const [job, setJob] = useState(null);

  // ------------------------------------------------------
  // Generation History
  // ------------------------------------------------------

  const [history, setHistory] = useState([]);
  const [credits, setCredits] = useState(null);

  const [historyLoading, setHistoryLoading] = useState(true);

  const [historyError, setHistoryError] = useState("");

  // ------------------------------------------------------
  // Feedback and Downloads
  // ------------------------------------------------------

  const [error, setError] = useState("");

  const [progressError, setProgressError] = useState("");

  const [downloadError, setDownloadError] = useState("");

  const [downloadingId, setDownloadingId] = useState(null);

  // ------------------------------------------------------
  // Refs
  // ------------------------------------------------------

  const requestKey = useRef(null);

  const promptInputRef = useRef(null);

  // ======================================================
  // Refresh Generation History
  // ======================================================

  const refreshHistory = useCallback(async () => {
    const response = await API.get(`${ENDPOINT}/history`);

    const list = Array.isArray(response.data?.data) ? response.data.data : [];

    setHistory(list);
    setCredits(response.data.credits);
    setHistoryError("");

    return list;
  }, []);

  // ======================================================
  // Initial History Load
  // ======================================================

  useEffect(() => {
    let mounted = true;

    API.get(`${ENDPOINT}/history`)
      .then((response) => {
        if (!mounted) return;

        const list = Array.isArray(response.data?.data)
          ? response.data.data
          : [];

        setHistory(list);
        setCredits(response.data.credits);

        // Resume unfinished work, or show the newest job.
        setJob(list.find(isActive) || list[0] || null);
      })
      .catch((err) => {
        if (!mounted) return;

        setHistoryError(
          getErrorMessage(err, "Could not load generation history."),
        );
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

  // ======================================================
  // Active Generation
  // ======================================================

  const activeJob = history.find(isActive) || (isActive(job) ? job : null);

  const activeJobId = activeJob?.id || null;

  // ======================================================
  // Poll Generation Status
  // ======================================================

  useEffect(() => {
    if (!activeJobId) {
      return undefined;
    }

    let alive = true;
    let timer;
    let delay = 3500;

    const check = async () => {
      try {
        const response = await API.get(
          `${ENDPOINT}/${encodeURIComponent(activeJobId)}`,
          { timeout: 120000 },
        );

        const current = response.data?.data;

        if (!alive || !current) return;

        setHistory((previous) => {
          const found = previous.some((item) => item.id === current.id);

          if (found) {
            return previous.map((item) =>
              item.id === current.id ? current : item,
            );
          }

          return [current, ...previous];
        });

        setJob((previous) =>
          previous?.id === current.id ? current : previous,
        );

        setProgressError("");
        delay = 3500;

        if (current.status === "completed" || current.status === "failed") {
          try {
            await refreshHistory();
          } catch {
            // Current status is already available.
          }

          return;
        }
      } catch (err) {
        if (alive) {
          delay = Math.min(delay * 2, 30000);
          if (err.response?.data?.code === "IMAGE_SAVE_RETRY") {
            const markSaving = (item) => item?.id === activeJobId
              ? { ...item, status: "saving", queued: false }
              : item;
            setJob(markSaving);
            setHistory((list) => list.map(markSaving));
          }
          setProgressError(
            getErrorMessage(err, "Could not check progress. Retrying..."),
          );
        }
      }

      if (alive) {
        timer = setTimeout(check, delay);
      }
    };

    timer = setTimeout(check, 1500);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [activeJobId, refreshHistory]);

  // ======================================================
  // Update Prompt
  // ======================================================

  const updatePrompt = (value) => {
    setPrompt(value);

    requestKey.current = null;

    setError("");
  };

  // ======================================================
  // Submit Image Generation
  // ======================================================

  const submit = async (event) => {
    event.preventDefault();

    if (generating || activeJobId) {
      return;
    }

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

      if (err?.response?.data?.code === "TEXT_SUBMISSION_FAILED") {
        requestKey.current = null;
      }
      if (err?.response?.status === 402) await refreshHistory().catch(() => {});
    } finally {
      setGenerating(false);
    }
  };

  // ======================================================
  // Download Generated Image
  // ======================================================

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

      // Cloudinary attachment download.
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

      // Fallback for other HTTPS image URLs.
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

  // ======================================================
  // Current Result State
  // ======================================================

  const resultUrl = getResultUrl(job);

  const selectedStatus = job?.queued ? "queued" : job?.status;

  const busy = Boolean(activeJobId || generating);

  // ======================================================
  // NEW: Clear Result & Create New
  // ======================================================

  const clearAndCreateNew = () => {
    // Never interrupt an active generation.
    if (busy) {
      return;
    }

    // Clear the currently selected image.
    setJob(null);

    // Clear the written prompt.
    setPrompt("");

    // Reset feedback messages.
    setError("");
    setProgressError("");
    setDownloadError("");

    // A new generation must use a fresh request key.
    requestKey.current = null;

    // Keep saved generation history unchanged.

    // Focus the prompt field for the next idea.
    promptInputRef.current?.focus();
  };

  // ======================================================
  // Render
  // ======================================================

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 text-ink dark:bg-surface sm:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Back Navigation */}

        <Link
          to="/creator/tools"
          className="inline-flex items-center gap-2 text-xs font-semibold text-muted transition hover:text-action"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to tools
        </Link>

        {/* Header */}

        <header className="mt-7 flex flex-wrap items-start gap-4">
          <div className="rounded-md bg-subtle p-3 text-action">
            <WandSparkles size={27} aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-normal text-action">
              Creative tools
            </p>

            <h1 className="mt-1 font-sans text-3xl tracking-tight sm:text-4xl">
              AI Text to Image
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Describe your fashion idea, generate an image, and download it to
              your device. Your results stay in your private generation history.
            </p>
            <p role="status" className="mt-3 text-sm font-semibold text-ink">
              Available AI credits: {credits?.available ?? (historyLoading ? "Loading…" : "Unavailable")}
              {credits && <span className="ml-2 font-normal text-muted">· {credits.cost} credits per image</span>}
            </p>
          </div>
        </header>

        {/* Generator and Result */}

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
          {/* Generator Form */}

          <form
            onSubmit={submit}
            className="rounded-md border border-line bg-surface p-4"
          >
            <div className="flex items-center gap-2">
              <Sparkles
                size={18}
                className="text-action"
                aria-hidden="true"
              />

              <h2 className="font-serif text-xl">Create your image</h2>
            </div>

            {/* Prompt */}

            <label
              htmlFor="t2i-prompt"
              className="mt-6 block text-xs font-bold uppercase tracking-wider"
            >
              Describe your image
            </label>

            <textarea
              ref={promptInputRef}
              id="t2i-prompt"
              value={prompt}
              onChange={(event) => updatePrompt(event.target.value)}
              rows={7}
              maxLength={1200}
              placeholder="A full-body fashion photograph of a model wearing an emerald-green satin evening gown..."
              className="mt-3 w-full resize-y rounded-md border border-line bg-canvas p-4 text-sm leading-6 outline-none transition focus:border-line focus:ring-2 focus:ring-action dark:bg-surface"
            />

            <div className="mt-1 flex justify-between text-xs text-muted">
              <span>
                Be specific about the garment, fabric, colors and setting.
              </span>

              <span className="shrink-0 pl-2">{prompt.length} / 1200</span>
            </div>

            {/* Example Prompts */}

            <p className="mt-5 text-xs font-bold uppercase tracking-wider">
              Try an example
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => updatePrompt(example.prompt)}
                  className="rounded-md border border-line bg-subtle px-3 py-2 text-xs font-medium text-action transition hover:bg-subtle"
                >
                  {example.label}
                </button>
              ))}
            </div>

            {/* Generation Settings */}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {/* Aspect Ratio */}

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
                  className="mt-2 w-full rounded-md border border-line bg-surface p-3 text-sm"
                >
                  {RATIOS.map((ratio) => (
                    <option key={ratio} value={ratio}>
                      {ratio}
                    </option>
                  ))}
                </select>
              </div>

              {/* Generation Quality */}

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
                  className="mt-2 w-full rounded-md border border-line bg-surface p-3 text-sm"
                >
                  {MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Information */}

            <p className="mt-4 text-xs leading-5 text-muted">
              One image per generation. Testing limit: five requests per Creator
              per rolling 24 hours (unless changed on the server). Images are
              not automatically published to Showcase.
            </p>

            {/* Submission Error */}

            {error && (
              <div
                role="alert"
                className="mt-4 rounded-md border border-line bg-canvas p-3 text-sm text-action dark:bg-subtle"
              >
                {error}
              </div>
            )}

            {/* Generate Button */}

            <button
              type="submit"
              disabled={busy || prompt.trim().length < 12 || (!!credits && credits.available < credits.cost)}
              className="mt-6 flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-subtle px-5 text-sm font-bold text-ink transition hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:cursor-not-allowed disabled:opacity-50"
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
                  : `Generate · ${credits?.cost ?? 10} credits`}
            </button>

            {activeJobId && (
              <p className="mt-3 text-center text-xs text-muted">
                You can browse previous results while your image generates.
              </p>
            )}
          </form>

          {/* ==================================================
              Result Panel
              ================================================== */}

          <section
            aria-label="AI image result"
            className="rounded-md border border-line bg-surface p-4"
          >
            {/* Result Header */}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-serif text-xl">Your Result</h2>

              {job && (
                <div className="flex flex-wrap items-center gap-2">
                  {/* NEW: Clear & Create New */}

                  <button
                    type="button"
                    onClick={clearAndCreateNew}
                    disabled={busy}
                    title="Clear preview and start a new generation"
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-line bg-subtle px-3 text-xs font-semibold text-action transition hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-action disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                    Clear &amp; Create New
                  </button>

                  {/* Status */}

                  <span className="inline-flex items-center gap-1.5 rounded-md bg-subtle px-3 py-1.5 text-xs font-semibold text-muted">
                    {selectedStatus === "completed" ? (
                      <CheckCircle2 size={14} className="text-action" />
                    ) : selectedStatus === "failed" ? (
                      <X size={14} className="text-action" />
                    ) : (
                      <Clock3 size={14} />
                    )}

                    {getStatusLabel(selectedStatus)}
                  </span>
                </div>
              )}
            </div>

            {/* Image Preview */}

            <div className="mt-4 flex min-h-[380px] items-center justify-center overflow-hidden rounded-md bg-subtle dark:bg-surface">
              {resultUrl ? (
                <img
                  src={resultUrl}
                  alt={job.prompt || "AI-generated fashion image"}
                  className="max-h-[570px] w-full object-contain"
                />
              ) : isActive(job) ? (
                <div className="px-6 text-center text-muted">
                  <Loader2
                    size={32}
                    className="mx-auto animate-spin text-action"
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
                <div className="px-6 text-center text-action">
                  <X className="mx-auto" size={34} aria-hidden="true" />

                  <p className="mt-3 text-sm">
                    {job.error_message ||
                      "This generation could not be completed."}
                  </p>
                </div>
              ) : (
                <div className="px-6 text-center text-muted">
                  <ImageIcon className="mx-auto" size={39} aria-hidden="true" />

                  <p className="mt-4 text-sm">
                    Your generated image will appear here.
                  </p>
                </div>
              )}
            </div>

            {/* Generation Metadata */}

            {job?.created_at && (
              <p className="mt-3 text-xs text-muted">
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

            {/* Download and View Buttons */}

            {resultUrl && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={downloadingId === job.id}
                  onClick={() => downloadImage(job)}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-subtle px-4 text-sm font-bold text-ink transition hover:bg-subtle disabled:opacity-60"
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
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-ink transition hover:border-line"
                >
                  <ExternalLink size={17} aria-hidden="true" />
                  View Full Image
                </a>
              </div>
            )}

            {/* Download Error */}

            {downloadError && (
              <p
                role="alert"
                className="mt-3 text-xs leading-5 text-action"
              >
                {downloadError}
              </p>
            )}

            {/* Progress Error */}

            {progressError && activeJobId && (
              <p
                role="status"
                className="mt-3 text-xs leading-5 text-action"
              >
                {progressError}
              </p>
            )}

            {/* Privacy Notice */}

            <p className="mt-4 text-xs leading-5 text-muted">
              Generated images are saved to your history and are not published
              to Showcase automatically. Anyone with a direct image link may be
              able to view that image.
            </p>
          </section>
        </div>

        {/* ==================================================
            Generation History
            ================================================== */}

        <section className="mt-9" aria-label="Previous AI generations">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <History
                size={19}
                className="text-action"
                aria-hidden="true"
              />

              <h2 className="font-sans text-2xl">Recent Generations</h2>
            </div>

            {/* Refresh History */}

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
              className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-xs font-semibold hover:border-line disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={historyLoading ? "animate-spin" : ""}
                aria-hidden="true"
              />
              Refresh
            </button>
          </div>

          {/* History Error */}

          {historyError && (
            <p role="alert" className="mt-3 text-sm text-action">
              {historyError}
            </p>
          )}

          {/* History Content */}

          {historyLoading && history.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              Loading your history...
            </p>
          ) : history.length === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-line bg-surface px-6 py-10 text-center text-sm text-muted">
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
                    className={`overflow-hidden rounded-md border bg-surface transition ${
                      selected
                        ? "border-line ring-1 ring-action"
                        : "border-line"
                    }`}
                  >
                    {/* Select Historical Result */}

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
                        <div className="flex aspect-[3/4] items-center justify-center bg-subtle text-xs text-muted dark:bg-surface">
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

                        <p className="mt-2 text-[11px] capitalize text-muted">
                          {item.status}
                          {" · "}
                          {formatDate(item.created_at)}
                        </p>
                      </div>
                    </button>

                    {/* Download Historical Image */}

                    {imageUrl && (
                      <div className="border-t border-line p-3">
                        <button
                          type="button"
                          onClick={() => downloadImage(item)}
                          disabled={downloadingId === item.id}
                          className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-subtle text-xs font-bold text-action transition hover:bg-subtle disabled:opacity-60"
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
