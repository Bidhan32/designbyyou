"use strict";

/**
 * =========================================================
 * DesignByYou / FashionVision
 * Creator AI Costume Extractor — Version 2.1
 * Flexible View Selection + Clear Generated Images
 * =========================================================
 *
 * - Choose any 1–4 costume views
 * - Generate only selected angles
 * - Resume jobs and avoid duplicate paid submissions
 * - Check status and download individual PNG images
 * - Clear ALL locally loaded generated images in one click
 * - Do not auto-reload cleared images, even after a refresh
 * - Preserve existing job and source when clearing results
 *
 * Clear Generated Images affects browser previews only.
 * It does NOT delete PostgreSQL records, cancel FASHN jobs,
 * remove files already downloaded, or refund credits.
 * =========================================================
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

import { Link } from "react-router-dom";

import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  ImagePlus,
  Loader2,
  RefreshCw,
  Scissors,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  WandSparkles,
  X,
} from "lucide-react";

import API from "../../api/axios";

/* =========================================================
   Configuration
   ========================================================= */

const API_ROOT = "/creator-tools/costume-extractor";

const SESSION_JOB_KEY = "dby.costume-extractor.job-id";

const SESSION_ATTEMPT_KEY = "dby.costume-extractor.pending-attempt-v2";

const SESSION_CLEARED_JOB_KEY = "dby.costume-extractor.cleared-images-job-id";

const MAX_FILE_BYTES = 12 * 1024 * 1024;

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const JOB_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VIEWS = Object.freeze([
  {
    key: "front",
    label: "Front View",
    short: "Front",
    detail: "Front garment presentation",
  },
  {
    key: "back",
    label: "Back View",
    short: "Back",
    detail: "AI-inferred rear details",
  },
  {
    key: "left",
    label: "Left Side",
    short: "Left",
    detail: "AI-inferred left profile",
  },
  {
    key: "right",
    label: "Right Side",
    short: "Right",
    detail: "AI-inferred right profile",
  },
]);

const VIEW_KEYS = VIEWS.map((view) => view.key);

const PRESETS = Object.freeze([
  {
    label: "Front only",
    keys: ["front"],
  },
  {
    label: "Back only",
    keys: ["back"],
  },
  {
    label: "Both sides",
    keys: ["left", "right"],
  },
  {
    label: "All four",
    keys: ["front", "back", "left", "right"],
  },
]);

const POLL_STATES = new Set([
  "starting",
  "in_queue",
  "processing",
  "submitting",
]);

const BLOCK_RESET_STATES = new Set([...POLL_STATES, "submission_unknown"]);

const CHECKER_STYLE = {
  backgroundColor: "#f8fafc",

  backgroundImage:
    "linear-gradient(45deg,#e2e8f0 25%,transparent 25%)," +
    "linear-gradient(-45deg,#e2e8f0 25%,transparent 25%)," +
    "linear-gradient(45deg,transparent 75%,#e2e8f0 75%)," +
    "linear-gradient(-45deg,transparent 75%,#e2e8f0 75%)",

  backgroundSize: "20px 20px",

  backgroundPosition: "0 0,0 10px,10px -10px,-10px 0",
};

/* =========================================================
   Helpers
   ========================================================= */

function errorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    "Something went wrong. Please try again."
  );
}

function makeRequestKey() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error(
      "A secure browser context (HTTPS or localhost) is required.",
    );
  }

  return globalThis.crypto.randomUUID();
}

function validSelection(keys) {
  return (
    Array.isArray(keys) &&
    keys.length >= 1 &&
    keys.length <= 4 &&
    keys.every((key) => VIEW_KEYS.includes(key)) &&
    new Set(keys).size === keys.length
  );
}

function orderedSelection(keys) {
  return VIEW_KEYS.filter((key) => keys.includes(key));
}

function sameSelection(a, b) {
  return a.length === b.length && a.every((key) => b.includes(key));
}

function selectedFromJob(job) {
  const keys = Array.isArray(job?.selected_views)
    ? job.selected_views
    : job?.views?.map((row) => row.view);

  return validSelection(keys) ? orderedSelection(keys) : [];
}

function safeGet(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Session storage may be unavailable.
  }
}

function safeRemove(key) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Session storage may be unavailable.
  }
}

/* =========================================================
   PNG Download
   ========================================================= */

function downloadPng(dataUri, filename) {
  const prefix = "data:image/png;base64,";

  if (typeof dataUri !== "string" || !dataUri.startsWith(prefix)) {
    throw new Error("A valid generated PNG is required.");
  }

  const raw = atob(dataUri.slice(prefix.length));

  const bytes = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }

  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: "image/png",
    }),
  );

  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* =========================================================
   Status Labels
   ========================================================= */

function statusLabel(value) {
  const labels = {
    pending: "Waiting",
    submitting: "Submitting",
    submission_unknown: "Check required",
    starting: "Starting",
    in_queue: "Queued",
    processing: "Generating",
    completed: "Completed",
    failed: "Failed",
  };

  return labels[value] || value || "Waiting";
}

/* =========================================================
   Costume Result Card
   ========================================================= */

function ResultCard({
  view,
  record,
  image,
  loading,
  error,
  cleared,
  onLoad,
  onDownload,
}) {
  const status = record?.status || "pending";

  const complete = status === "completed";

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#151515]">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-serif text-lg font-semibold text-slate-900 dark:text-white">
            {view.label}
          </h3>

          <p className="text-[11px] text-slate-500 dark:text-white/45">
            {view.detail}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
            complete
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
              : status === "failed" || status === "submission_unknown"
                ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70"
          }`}
        >
          {statusLabel(status)}
        </span>
      </div>

      <div
        className="relative flex aspect-[3/4] items-center justify-center overflow-hidden"
        style={CHECKER_STYLE}
      >
        {image ? (
          <img
            src={image}
            alt={`${view.label} of the extracted costume`}
            className="h-full w-full object-contain"
          />
        ) : loading || POLL_STATES.has(status) ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-white/90 px-5 py-4 text-center text-slate-700 shadow-sm">
            <Loader2
              size={25}
              className="animate-spin text-[#b58a32]"
              aria-hidden="true"
            />

            <span className="text-xs">
              {complete ? "Loading image..." : "AI is preparing this view"}
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-white/85 px-5 py-4 text-center text-slate-500">
            <Scissors size={25} aria-hidden="true" />

            <span className="text-xs text-center">
              {complete && cleared
                ? "Preview cleared"
                : complete
                  ? "Image not loaded"
                  : status === "pending"
                    ? "Awaiting generation"
                    : statusLabel(status)}
            </span>
          </div>
        )}
      </div>

      <div className="min-h-[70px] p-3">
        {image ? (
          <button
            type="button"
            onClick={() => onDownload(view.key)}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#e5c67d] px-3 text-xs font-bold text-black transition hover:bg-[#f4d995]"
          >
            <Download size={15} aria-hidden="true" />
            Download PNG
          </button>
        ) : complete ? (
          <button
            type="button"
            onClick={() => onLoad(view.key)}
            disabled={loading}
            className="flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white"
          >
            {loading ? "Loading..." : "Load Result"}
          </button>
        ) : (
          <div className="flex min-h-10 items-center justify-center text-center text-[11px] text-slate-500 dark:text-white/50">
            {status === "submission_unknown"
              ? "Submission uncertain — do not retry automatically"
              : status === "failed"
                ? "Generation failed — review before another job"
                : status === "pending"
                  ? "Ready to submit"
                  : "Please wait for the result"}
          </div>
        )}

        {error && (
          <p className="mt-1.5 text-[11px] text-rose-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}

/* =========================================================
   Main Component
   ========================================================= */

export default function CreatorCostumeExtractor() {
  const fileInputRef = useRef(null);

  const requestKeyRef = useRef(null);

  const workingRef = useRef(false);

  const activeJobIdRef = useRef(null);

  const requestedResultsRef = useRef(new Set());

  // An increment invalidates result fetches that were
  // still running when the images were cleared.

  const resultsEpochRef = useRef(0);

  const autoLoadEnabledRef = useRef(true);

  /* -------------------------------------------------------
     State
     ------------------------------------------------------- */

  const [file, setFile] = useState(null);

  const [sourcePreview, setSourcePreview] = useState("");

  const [dragging, setDragging] = useState(false);

  const [selectedViews, setSelectedViews] = useState(["front"]);

  const [attemptLocked, setAttemptLocked] = useState(false);

  const [job, setJob] = useState(null);

  const [unresolvedJobId, setUnresolvedJobId] = useState(null);

  const [results, setResults] = useState({});

  const [loadingResults, setLoadingResults] = useState({});

  const [resultErrors, setResultErrors] = useState({});

  const [autoLoadEnabled, setAutoLoadEnabled] = useState(true);

  const [busy, setBusy] = useState(false);

  const [stage, setStage] = useState("");

  const [error, setError] = useState("");

  const [notice, setNotice] = useState("");

  const [restoring, setRestoring] = useState(true);

  /* -------------------------------------------------------
     Source Preview
     ------------------------------------------------------- */

  useEffect(() => {
    if (!file) {
      setSourcePreview("");
      return undefined;
    }

    const url = URL.createObjectURL(file);

    setSourcePreview(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  /* -------------------------------------------------------
     Refresh Existing Job
     ------------------------------------------------------- */

  const refreshJob = useCallback(async (jobId) => {
    const response = await API.get(`${API_ROOT}/jobs/${jobId}?refresh=true`);

    const updated = response?.data?.data?.job;

    if (!updated || updated.id !== jobId) {
      throw new Error("Invalid extraction job response.");
    }

    if (activeJobIdRef.current === jobId) {
      setJob(updated);
    }

    return updated;
  }, []);

  /* -------------------------------------------------------
     Restore Saved Job
     ------------------------------------------------------- */

  const restoreSavedJob = useCallback(async (jobId) => {
    if (!JOB_ID_REGEX.test(jobId)) {
      throw new Error("Invalid saved job ID.");
    }

    activeJobIdRef.current = jobId;

    const response = await API.get(`${API_ROOT}/jobs/${jobId}?refresh=true`);

    const restoredJob = response?.data?.data?.job;

    const keys = selectedFromJob(restoredJob);

    if (!restoredJob || restoredJob.id !== jobId || !keys.length) {
      throw new Error("Invalid saved job response.");
    }

    if (activeJobIdRef.current !== jobId) {
      return;
    }

    const keepCleared = safeGet(SESSION_CLEARED_JOB_KEY) === jobId;

    autoLoadEnabledRef.current = !keepCleared;

    setAutoLoadEnabled(!keepCleared);

    setJob(restoredJob);

    setSelectedViews(keys);

    setUnresolvedJobId(null);

    setAttemptLocked(false);

    requestKeyRef.current = null;

    safeRemove(SESSION_ATTEMPT_KEY);
  }, []);

  /* -------------------------------------------------------
     Initial Job Recovery
     ------------------------------------------------------- */

  useEffect(() => {
    let alive = true;

    const restore = async () => {
      const savedId = safeGet(SESSION_JOB_KEY);

      const rawAttempt = safeGet(SESSION_ATTEMPT_KEY);

      if (rawAttempt) {
        try {
          const attempt = JSON.parse(rawAttempt);

          if (
            JOB_ID_REGEX.test(attempt.request_key) &&
            validSelection(attempt.selected_views)
          ) {
            requestKeyRef.current = attempt.request_key;

            if (alive) {
              setSelectedViews(orderedSelection(attempt.selected_views));

              setAttemptLocked(true);
            }
          } else {
            safeRemove(SESSION_ATTEMPT_KEY);
          }
        } catch {
          safeRemove(SESSION_ATTEMPT_KEY);
        }
      }

      if (!savedId) {
        if (alive) {
          setRestoring(false);
        }

        return;
      }

      if (!JOB_ID_REGEX.test(savedId)) {
        safeRemove(SESSION_JOB_KEY);

        if (alive) {
          setRestoring(false);
        }

        return;
      }

      if (alive) {
        setUnresolvedJobId(savedId);
      }

      try {
        await restoreSavedJob(savedId);
      } catch (restoreError) {
        if (!alive) return;

        const status = restoreError?.response?.status;

        if (status === 403 || status === 404) {
          safeRemove(SESSION_JOB_KEY);

          activeJobIdRef.current = null;

          setUnresolvedJobId(null);
        } else {
          setError(
            "Could not restore the previous job. Retry recovery before starting another extraction.",
          );
        }
      } finally {
        if (alive) {
          setRestoring(false);
        }
      }
    };

    void restore();

    return () => {
      alive = false;
    };
  }, [restoreSavedJob]);

  /* -------------------------------------------------------
     Manual Recovery
     ------------------------------------------------------- */

  const recoverJob = async () => {
    if (!unresolvedJobId || workingRef.current) {
      return;
    }

    setRestoring(true);
    setError("");

    try {
      await restoreSavedJob(unresolvedJobId);
    } catch (restoreError) {
      setError(`Could not recover this job: ${errorMessage(restoreError)}`);
    } finally {
      setRestoring(false);
    }
  };

  /* -------------------------------------------------------
     Generation Status Polling
     ------------------------------------------------------- */

  const needsPolling = Boolean(
    job?.views?.some((record) => POLL_STATES.has(record.status)),
  );

  useEffect(() => {
    if (!job?.id || !needsPolling) {
      return undefined;
    }

    const jobId = job.id;

    let stopped = false;

    let timer;

    const poll = async () => {
      try {
        await refreshJob(jobId);
      } catch (pollError) {
        if (!stopped) {
          console.warn(
            "Costume status refresh failed:",
            errorMessage(pollError),
          );
        }
      } finally {
        if (!stopped) {
          timer = window.setTimeout(poll, 8000);
        }
      }
    };

    timer = window.setTimeout(poll, 5000);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [job?.id, needsPolling, refreshJob]);

  /* -------------------------------------------------------
     Retrieve Completed Result
     ------------------------------------------------------- */

  const loadResult = useCallback(
    async (viewKey, force = false) => {
      const jobId = job?.id;

      if (!jobId) return;

      if (!force && !autoLoadEnabledRef.current) {
        return;
      }

      const token = `${jobId}:${viewKey}`;

      if (requestedResultsRef.current.has(token) && !force) {
        return;
      }

      requestedResultsRef.current.add(token);

      const requestEpoch = resultsEpochRef.current;

      const isCurrent = () =>
        activeJobIdRef.current === jobId &&
        resultsEpochRef.current === requestEpoch;

      setLoadingResults((current) => ({
        ...current,
        [viewKey]: true,
      }));

      setResultErrors((current) => ({
        ...current,
        [viewKey]: "",
      }));

      try {
        const response = await API.get(
          `${API_ROOT}/jobs/${jobId}/views/${viewKey}/result`,
        );

        const image = response?.data?.data?.image;

        if (
          typeof image !== "string" ||
          !image.startsWith("data:image/png;base64,")
        ) {
          throw new Error("Invalid PNG returned by the server.");
        }

        if (isCurrent()) {
          setResults((current) => ({
            ...current,
            [viewKey]: image,
          }));
        }
      } catch (loadError) {
        if (isCurrent()) {
          setResultErrors((current) => ({
            ...current,
            [viewKey]: errorMessage(loadError),
          }));
        }
      } finally {
        if (isCurrent()) {
          setLoadingResults((current) => ({
            ...current,
            [viewKey]: false,
          }));
        }
      }
    },
    [job?.id],
  );

  /* -------------------------------------------------------
     Automatically Load Completed Results
     ------------------------------------------------------- */

  useEffect(() => {
    if (!job?.views || !autoLoadEnabled) {
      return;
    }

    for (const record of job.views) {
      if (record.status === "completed" && !results[record.view]) {
        void loadResult(record.view);
      }
    }
  }, [job?.views, loadResult, results, autoLoadEnabled]);

  /* -------------------------------------------------------
     Handle Upload
     ------------------------------------------------------- */

  const handleFile = (candidate) => {
    if (!candidate || busy || restoring || unresolvedJobId) {
      return;
    }

    if (job && file) {
      setError("Start a new extraction before changing the source image.");

      return;
    }

    if (!ALLOWED_TYPES.has(candidate.type)) {
      setError("Please choose a JPG, PNG or WebP image.");

      return;
    }

    if (candidate.size < 1 || candidate.size > MAX_FILE_BYTES) {
      setError("Image must be 12 MB or smaller.");

      return;
    }

    setFile(candidate);

    setError("");

    setNotice("");
  };

  /* -------------------------------------------------------
     Flexible View Selection
     ------------------------------------------------------- */

  const selectionLocked = Boolean(
    job || attemptLocked || busy || restoring || unresolvedJobId,
  );

  const toggleView = (key) => {
    if (selectionLocked) return;

    setSelectedViews((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : orderedSelection([...current, key]),
    );
  };

  const usePreset = (keys) => {
    if (!selectionLocked) {
      setSelectedViews([...keys]);
    }
  };

  /* -------------------------------------------------------
     Generate Selected Views
     ------------------------------------------------------- */

  const generate = async () => {
    if (!file || busy || restoring || unresolvedJobId || workingRef.current) {
      return;
    }

    if (!job && !validSelection(selectedViews)) {
      setError("Select at least one costume view before generating.");

      return;
    }

    if (job && !job.views?.some((record) => record.status === "pending")) {
      return;
    }

    if (job?.views?.some((record) => record.status === "submission_unknown")) {
      setError(
        "Resolve the uncertain submission before submitting more views.",
      );

      return;
    }

    workingRef.current = true;

    setBusy(true);
    setError("");
    setNotice("");

    let currentJob = job;

    try {
      if (!currentJob) {
        setStage("Creating an extraction job...");

        if (!requestKeyRef.current) {
          requestKeyRef.current = makeRequestKey();

          safeSet(
            SESSION_ATTEMPT_KEY,
            JSON.stringify({
              request_key: requestKeyRef.current,

              selected_views: orderedSelection(selectedViews),
            }),
          );

          setAttemptLocked(true);
        }

        const response = await API.post(`${API_ROOT}/jobs`, {
          request_key: requestKeyRef.current,

          selected_views: orderedSelection(selectedViews),
        });

        currentJob = response?.data?.data?.job;

        if (!currentJob?.id || !selectedFromJob(currentJob).length) {
          throw new Error("Server did not return a valid extraction job.");
        }

        activeJobIdRef.current = currentJob.id;

        resultsEpochRef.current += 1;

        requestedResultsRef.current.clear();

        autoLoadEnabledRef.current = true;

        setAutoLoadEnabled(true);

        safeRemove(SESSION_CLEARED_JOB_KEY);

        setJob(currentJob);

        setSelectedViews(selectedFromJob(currentJob));

        setAttemptLocked(false);

        setResults({});
        setLoadingResults({});
        setResultErrors({});

        safeSet(SESSION_JOB_KEY, currentJob.id);

        safeRemove(SESSION_ATTEMPT_KEY);

        requestKeyRef.current = null;
      } else {
        // Refresh server status before resuming.
        // Never rely on stale frontend state.

        currentJob = await refreshJob(currentJob.id);
      }

      // Submit only views that exist in the
      // job and are still pending.

      for (const view of VIEWS) {
        const record = currentJob.views?.find((item) => item.view === view.key);

        if (!record || record.status !== "pending") {
          continue;
        }

        setStage(`Submitting ${view.label.toLowerCase()}...`);

        const payload = new FormData();

        payload.append("image", file);

        try {
          await API.post(
            `${API_ROOT}/jobs/${currentJob.id}/views/${view.key}/start`,
            payload,
          );
        } catch (submitError) {
          setError(
            `Could not confirm ${view.label.toLowerCase()} submission: ${errorMessage(submitError)}. ` +
              "Check the job status before retrying any view; uncertain submissions may use credits.",
          );

          break;
        }
      }

      setStage("Checking generation progress...");

      await refreshJob(currentJob.id);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
      setStage("");

      workingRef.current = false;
    }
  };

  /* -------------------------------------------------------
     Discard Unconfirmed Job-Creation Attempt
     ------------------------------------------------------- */

  const discardAttempt = () => {
    if (busy || job || unresolvedJobId) {
      return;
    }

    if (
      !window.confirm(
        "Discard this unconfirmed request? The server might already have created a job that counts toward your hourly limit.",
      )
    ) {
      return;
    }

    requestKeyRef.current = null;

    safeRemove(SESSION_ATTEMPT_KEY);

    setAttemptLocked(false);

    setError("");
  };

  /* -------------------------------------------------------
     NEW: Clear All Generated Image Previews
     -------------------------------------------------------
     - Clear only locally loaded image data.
     - Keep current job, source, selection and progress.
     - Prevent automatic image reloading.
     - Remember cleared state across page refreshes.
     - Invalidate image requests already in progress.
     - Allow manual loading of individual results.
     - No API deletion or FASHN generation request.
     ------------------------------------------------------- */

  const clearGeneratedImages = () => {
    if (!job || restoring || workingRef.current) {
      return;
    }

    if (
      !window.confirm(
        "Clear all generated image previews from this page?\n\n" +
          "Any images you already downloaded will stay on your device. " +
          "Your job and FASHN results will not be deleted or cancelled. " +
          "You can load individual results again while they remain available.",
      )
    ) {
      return;
    }

    // Ignore result requests that were already in flight.
    resultsEpochRef.current += 1;

    // Disable automatic loading for the current job.
    autoLoadEnabledRef.current = false;

    setAutoLoadEnabled(false);

    // Clear all generated PNGs and their associated states.
    setResults({});
    setLoadingResults({});
    setResultErrors({});

    requestedResultsRef.current.clear();

    // Preserve the cleared state through page refresh.
    safeSet(SESSION_CLEARED_JOB_KEY, job.id);

    setNotice(
      "All generated image previews were cleared from this page. Use Load Result on any completed view to retrieve it again while available.",
    );

    setError("");
  };

  /* -------------------------------------------------------
     Reset for a New Extraction
     ------------------------------------------------------- */

  const reset = () => {
    if (busy || restoring || unresolvedJobId) {
      return;
    }

    if (job?.views?.some((record) => BLOCK_RESET_STATES.has(record.status))) {
      setError(
        "This job has processing or uncertain submissions. Wait or investigate before starting a new extraction.",
      );

      return;
    }

    activeJobIdRef.current = null;

    resultsEpochRef.current += 1;

    autoLoadEnabledRef.current = true;

    setAutoLoadEnabled(true);

    setJob(null);
    setFile(null);

    setSelectedViews(["front"]);

    setResults({});
    setLoadingResults({});
    setResultErrors({});

    requestedResultsRef.current.clear();

    requestKeyRef.current = null;

    setAttemptLocked(false);

    safeRemove(SESSION_JOB_KEY);

    safeRemove(SESSION_ATTEMPT_KEY);

    safeRemove(SESSION_CLEARED_JOB_KEY);

    setError("");
    setNotice("");
    setStage("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  /* -------------------------------------------------------
     Download View
     ------------------------------------------------------- */

  const downloadView = (key) => {
    try {
      downloadPng(results[key], `designbyyou-costume-${key}.png`);
    } catch (downloadError) {
      setError(errorMessage(downloadError));
    }
  };

  /* -------------------------------------------------------
     Dynamic Progress and Selection
     ------------------------------------------------------- */

  const displayKeys = job ? selectedFromJob(job) : selectedViews;

  const displayViews = VIEWS.filter((view) => displayKeys.includes(view.key));

  const totalCount = displayViews.length;

  const completedCount =
    job?.views?.filter((record) => record.status === "completed").length || 0;

  const failedCount =
    job?.views?.filter((record) => record.status === "failed").length || 0;

  const pendingCount =
    job?.views?.filter((record) => record.status === "pending").length || 0;

  const generating = Boolean(
    job?.views?.some((record) => POLL_STATES.has(record.status)),
  );

  const uncertain = Boolean(
    job?.views?.some((record) => record.status === "submission_unknown"),
  );

  const mayStart = Boolean(
    file &&
    !busy &&
    !restoring &&
    !unresolvedJobId &&
    !uncertain &&
    totalCount > 0 &&
    (!job || pendingCount > 0),
  );

  const allComplete = Boolean(
    job && totalCount > 0 && completedCount === totalCount,
  );

  const estimatedCredits = job?.estimated_credits ?? totalCount;

  const hasLoadedImages = Object.values(results).some(Boolean);

  const hasPendingLoads = Object.values(loadingResults).some(Boolean);

  const canClear = Boolean(
    job &&
    completedCount > 0 &&
    (hasLoadedImages || hasPendingLoads || autoLoadEnabled),
  );

  /* =========================================================
     Render
     ========================================================= */

  return (
    <main className="min-h-screen bg-slate-50 pb-20 text-slate-900 dark:bg-[#090909] dark:text-white">
      {/* ===============================================
          HEADER
          =============================================== */}

      <section className="border-b border-slate-200 bg-white dark:border-white/10 dark:bg-[#111111]">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
          <Link
            to="/creator/tools"
            className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-[#b58a32] dark:text-white/60"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Back to Creative Hub
          </Link>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.23em] text-[#a67c2c] dark:text-[#e5c67d]">
            <WandSparkles size={16} aria-hidden="true" />
            DesignByYou AI Creative Tools
          </div>

          <h1 className="mt-3 font-serif text-3xl tracking-tight sm:text-5xl">
            AI Costume Extractor
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 dark:text-white/60">
            Upload a costume photo and choose exactly which garment-only angles
            to generate. Unseen back and side details are AI-inferred, not
            verified construction details.
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 pt-7 sm:px-8 lg:grid-cols-[330px_minmax(0,1fr)] lg:px-10">
        {/* ===========================================
            SOURCE IMAGE AND VIEW SELECTION
            =========================================== */}

        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151515]">
          <div className="mb-4 flex items-center gap-2">
            <ImagePlus
              size={18}
              className="text-[#b58a32]"
              aria-hidden="true"
            />

            <h2 className="font-serif text-xl">Source Costume</h2>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Select a costume image"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />

          <div
            onDragOver={(event) => {
              event.preventDefault();

              if (!busy) {
                setDragging(true);
              }
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);

              handleFile(event.dataTransfer.files?.[0]);
            }}
            className={`overflow-hidden rounded-xl border-2 border-dashed transition ${
              dragging
                ? "border-[#b58a32] bg-[#e5c67d]/10"
                : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.035]"
            }`}
          >
            {sourcePreview ? (
              <div className="flex aspect-[4/5] items-center justify-center bg-[#f1f1f1]">
                <img
                  src={sourcePreview}
                  alt="Uploaded source costume"
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex min-h-[210px] flex-col items-center justify-center gap-2 px-5 text-center">
                <UploadCloud
                  size={29}
                  className="text-[#b58a32]"
                  aria-hidden="true"
                />

                <p className="text-sm font-semibold">
                  Drag your costume image here
                </p>

                <p className="text-xs text-slate-500 dark:text-white/50">
                  JPG, PNG or WebP · Up to 12 MB
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={
              busy ||
              restoring ||
              Boolean(job && file) ||
              Boolean(unresolvedJobId)
            }
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold transition hover:border-[#b58a32] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20"
          >
            <UploadCloud size={15} aria-hidden="true" />

            {file
              ? "Change Image"
              : job
                ? "Reattach Original Image"
                : "Choose Image"}
          </button>

          {file && (
            <p
              className="mt-2 truncate text-xs text-slate-500 dark:text-white/50"
              title={file.name}
            >
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          )}

          {job && !file && pendingCount > 0 && (
            <p className="mt-2 text-[11px] leading-5 text-amber-700 dark:text-amber-300">
              Reattach the same original image before submitting pending angles.
              The original upload is not saved here.
            </p>
          )}

          {/* =======================================
              VIEW SELECTOR
              ======================================= */}

          <div className="mt-6 border-t border-slate-200 pt-5 dark:border-white/10">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-serif text-lg font-semibold">Choose Views</h2>

              <span className="text-[11px] font-semibold text-[#a67c2c] dark:text-[#e5c67d]">
                {totalCount} of 4
              </span>
            </div>

            <p className="mt-1.5 text-[11px] leading-5 text-slate-500 dark:text-white/50">
              Pick one angle or combine any views. Selections are fixed once the
              job is created.
            </p>

            <div
              className="mt-3 grid grid-cols-2 gap-2"
              role="group"
              aria-label="Select costume views"
            >
              {VIEWS.map((view) => {
                const isSelected = displayKeys.includes(view.key);

                return (
                  <button
                    key={view.key}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={selectionLocked}
                    onClick={() => toggleView(view.key)}
                    className={`flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3 text-left text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b58a32] disabled:cursor-not-allowed ${
                      isSelected
                        ? "border-[#c9a353] bg-[#e5c67d]/15 text-[#795919] dark:text-[#f3d693]"
                        : "border-slate-200 bg-slate-50 text-slate-600 hover:border-[#c9a353] dark:border-white/10 dark:bg-white/5 dark:text-white/70"
                    }`}
                  >
                    <span>{view.short}</span>

                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                        isSelected
                          ? "border-[#c9a353] bg-[#e5c67d] text-[#17130b]"
                          : "border-slate-300 dark:border-white/30"
                      }`}
                    >
                      {isSelected && <Check size={13} aria-hidden="true" />}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ===================================
                QUICK SELECTION PRESETS
                =================================== */}

            {!selectionLocked && (
              <div
                className="mt-3 flex flex-wrap gap-1.5"
                aria-label="Quick view selection presets"
              >
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => usePreset(preset.keys)}
                    className={`rounded-full border px-2.5 py-1.5 text-[10px] font-semibold transition ${
                      sameSelection(selectedViews, preset.keys)
                        ? "border-[#c9a353] bg-[#e5c67d]/20 text-[#795919] dark:text-[#f3d693]"
                        : "border-slate-200 text-slate-600 hover:border-[#c9a353] dark:border-white/15 dark:text-white/65"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}

            {/* ===================================
                ESTIMATED CREDITS
                =================================== */}

            <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 dark:bg-white/5">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-white/50">
                  Estimated FASHN credits
                </p>

                <p className="mt-0.5 text-lg font-bold">{estimatedCredits}</p>
              </div>

              <p className="max-w-[110px] text-right text-[10px] leading-4 text-slate-500 dark:text-white/50">
                Based on 1 estimated credit per view
              </p>
            </div>
          </div>

          {/* =======================================
              GENERATE BUTTON
              ======================================= */}

          <button
            type="button"
            disabled={!mayStart}
            onClick={generate}
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e5c67d] px-4 text-sm font-bold text-black transition hover:bg-[#f4d995] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles size={18} aria-hidden="true" />
            )}

            {busy
              ? "Submitting selected views..."
              : job && pendingCount > 0
                ? `Submit ${pendingCount} Remaining ${
                    pendingCount === 1 ? "View" : "Views"
                  }`
                : `Generate ${totalCount} ${
                    totalCount === 1 ? "View" : "Views"
                  }`}
          </button>

          {stage && (
            <p
              className="mt-2 text-center text-xs text-slate-600 dark:text-white/60"
              role="status"
            >
              {stage}
            </p>
          )}

          {/* =======================================
              UNCONFIRMED REQUEST
              ======================================= */}

          {attemptLocked && !job && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              A job-creation request was attempted. Retry with the same
              selection and request key to avoid duplicates.
              <button
                type="button"
                onClick={discardAttempt}
                className="mt-1 block font-semibold underline"
              >
                Discard unconfirmed attempt
              </button>
            </div>
          )}

          {/* =======================================
              RECOVERY
              ======================================= */}

          {unresolvedJobId && (
            <button
              type="button"
              onClick={recoverJob}
              disabled={restoring}
              className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-amber-300 text-xs font-semibold text-amber-800 disabled:opacity-50 dark:text-amber-200"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Retry previous job recovery
            </button>
          )}

          {/* =======================================
              ERROR MESSAGE
              ======================================= */}

          {error && (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200"
            >
              <AlertCircle
                size={16}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />

              <span className="flex-1">{error}</span>

              <button
                type="button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* =======================================
              JOB PROGRESS
              ======================================= */}

          {job && (
            <div className="mt-5 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold">Job progress</span>

                <span>
                  {completedCount} / {totalCount} completed
                </span>
              </div>

              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/15">
                <div
                  className="h-full rounded-full bg-[#c49a3d] transition-all"
                  style={{
                    width: `${
                      totalCount ? (completedCount / totalCount) * 100 : 0
                    }%`,
                  }}
                />
              </div>

              <p className="mt-2 break-all text-[10px] text-slate-500 dark:text-white/45">
                Job ID: {job.id}
              </p>

              {generating && (
                <p className="mt-2 text-[11px] text-slate-500 dark:text-white/60">
                  Checking status about every 8 seconds.
                </p>
              )}

              {uncertain && (
                <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                  An uncertain submission needs investigation before starting a
                  new job.
                </p>
              )}

              {!busy && !generating && !uncertain && (
                <button
                  type="button"
                  onClick={reset}
                  className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#9a752c] hover:underline"
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  Start New Extraction
                </button>
              )}
            </div>
          )}

          {/* =======================================
              TEMPORARY RESULT NOTICE
              ======================================= */}

          <p className="mt-5 flex items-start gap-2 text-[11px] leading-5 text-slate-500 dark:text-white/50">
            <ShieldCheck
              size={16}
              className="mt-0.5 shrink-0 text-[#b58a32]"
              aria-hidden="true"
            />
            Generated images are temporarily retrieved from FASHN. Download them
            promptly; they are not saved to My Creations.
          </p>
        </section>

        {/* ===========================================
            SELECTED ANGLE RESULTS
            =========================================== */}

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a67c2c] dark:text-[#e5c67d]">
                Custom-angle studio
              </p>

              <h2 className="mt-1.5 font-serif text-2xl">Your Costume Views</h2>

              <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
                Only selected angles are shown. Each is generated independently
                from the same source image.
              </p>
            </div>

            {/* ===================================
                NEW: CLEAR ALL IMAGES BUTTON
                =================================== */}

            <div className="flex flex-wrap items-center gap-2">
              {job && (
                <span className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] text-slate-600 dark:border-white/15 dark:text-white/60">
                  {completedCount} of {totalCount} ready
                </span>
              )}

              {job && completedCount > 0 && (
                <button
                  type="button"
                  onClick={clearGeneratedImages}
                  disabled={!canClear || restoring || busy}
                  aria-label="Clear all generated image previews"
                  title="Clear generated previews from this page, not from FASHN or your downloads"
                  className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 text-[11px] font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-500/30 dark:bg-[#151515] dark:text-rose-300 dark:hover:bg-rose-500/10"
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Clear All Generated Images
                </button>
              )}
            </div>
          </div>

          {/* ===================================
              CLEAR CONFIRMATION MESSAGE
              =================================== */}

          {notice && (
            <div
              role="status"
              className="mb-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-700 dark:border-white/10 dark:bg-[#151515] dark:text-white/70"
            >
              <CheckCircle2
                size={16}
                className="mt-0.5 shrink-0 text-[#b58a32]"
                aria-hidden="true"
              />

              <span className="flex-1">{notice}</span>

              <button
                type="button"
                onClick={() => setNotice("")}
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* ===================================
              RESULT CARDS
              =================================== */}

          {displayViews.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {displayViews.map((view) => (
                <ResultCard
                  key={view.key}
                  view={view}
                  record={job?.views?.find((item) => item.view === view.key)}
                  image={results[view.key]}
                  loading={Boolean(loadingResults[view.key])}
                  error={resultErrors[view.key]}
                  cleared={!autoLoadEnabled}
                  onLoad={(key) => loadResult(key, true)}
                  onDownload={downloadView}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-[#151515]">
              Select one or more angles to see your result cards.
            </div>
          )}

          {/* ===================================
              SUCCESS MESSAGE
              =================================== */}

          {allComplete && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-[#e5c67d]/40 bg-[#e5c67d]/10 p-4 text-sm text-slate-800 dark:text-[#f3deb0]">
              <CheckCircle2
                size={18}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              All {totalCount} selected{" "}
              {totalCount === 1 ? "angle is" : "angles are"} complete.
              {!autoLoadEnabled
                ? " Previews are cleared; use Load Result if you need them again."
                : " Download the PNG results before the temporary provider files expire."}
            </div>
          )}

          {/* ===================================
              FAILED GENERATIONS
              =================================== */}

          {job && failedCount > 0 && (
            <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              {failedCount} selected{" "}
              {failedCount === 1 ? "view failed" : "views failed"}. Review the
              result; the application will not automatically resubmit it.
            </div>
          )}

          <p className="mt-5 text-[11px] leading-5 text-slate-500 dark:text-white/45">
            Back and side views are AI-inferred illustrations of unseen garment
            details, not validated sewing patterns, tailoring measurements or
            manufacturing drawings.
          </p>
        </section>
      </div>
    </main>
  );
}
