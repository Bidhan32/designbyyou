"use strict";

/**
 * DesignByYou - Fabric print reconstruction from a USER-SELECTED FABRIC CROP.
 * The FASHN Edit model is an image editor, NOT a dedicated textile extractor.
 * A crop containing clothing structure may still yield a garment: UI must require
 * and preview a crop of printed fabric before submitting a paid prediction.
 * This service never automatically retries a paid submission.
 */
const API_BASE = "https://api.fashn.ai/v1";
const API_TIMEOUT_MS = 30000;
const MODEL = "edit";

// Place the requested FINAL IMAGE FIRST: some edit models strongly retain the
// source composition unless the prompt clearly changes the subject itself.
const BASE_INSTRUCTIONS = [
  "FINAL IMAGE: a flat, continuous, edge-to-edge 2D TEXTILE PRINT SWATCH, not a photograph of clothing.",
  "Treat the uploaded image ONLY as a reference for its colored fabric motifs and stripe arrangements.",
  "Reconstruct those motifs as if printed on a perfectly flat rectangular sheet of fabric viewed directly from above.",
  "Fill 100% of the canvas with printed fabric design: every corner and every edge must contain the textile artwork.",
  "There must be NO dress, shirt, sleeves, collar, neckline, waistband, belt, cuffs, buttons, zipper, seams, mannequin, body, garment outline or recognizable clothing silhouette.",
  "There must be NO white studio backdrop, cutout silhouette, drop shadow, folds, fabric drape, 3D perspective, labels, margins, frames, or product mockup.",
  "Match the source's print colors, motif shapes, relative spacing and ornamental details as faithfully as possible.",
  "Extend/repeat the visible motif naturally into a full rectangular swatch, inventing as little detail as possible.",
  "This is a new 2D graphic pattern sheet derived from the fabric print, NOT an edit of the original garment photograph."
].join(" ");

const MODE_CONFIG = Object.freeze({
  faithful: Object.freeze({
    seed: 42,
    prompt:
      "TASK: Recover the printed textile artwork from the source fabric patch. " +
      "Create a uniform, front-facing fabric print sample, preserving the visible color palette, " +
      "motifs and any stripe ordering in the selected patch. "
  }),
  seamless: Object.freeze({
    seed: 43,
    prompt:
      "TASK: Create ONE square repeating tile using the motifs in the source fabric patch. " +
      "The tile's left and right borders should match and its top and bottom borders should match. " +
      "Keep the source colors and visual rhythm. Do not insert other unrelated motifs. "
  }),
});

function providerError(message, code, httpStatus = 502) {
  const error = new Error(message);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function checkMode(mode) {
  if (!Object.prototype.hasOwnProperty.call(MODE_CONFIG, mode)) {
    throw providerError("Invalid fabric extraction mode.", "INVALID_PATTERN_MODE", 400);
  }
  return MODE_CONFIG[mode];
}

function checkDataUri(uri) {
  if (typeof uri !== "string" || uri.length > 24 * 1024 * 1024 ||
      !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(uri)) {
    throw providerError("Invalid source image.", "INVALID_PATTERN_IMAGE", 400);
  }
  return uri;
}

function checkPredictionId(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(id)) {
    throw providerError("Invalid prediction reference.", "INVALID_PREDICTION_ID", 400);
  }
  return id;
}

function getKey() {
  const key = String(process.env.FASHN_API_KEY || "").trim();
  if (!key) {
    throw providerError("AI pattern extraction is not configured.", "FASHN_NOT_CONFIGURED", 503);
  }
  return key;
}

function buildPatternPrompt(mode, instructions = "") {
  const config = checkMode(mode);
  const extra = String(instructions || "").trim();
  if (extra.length > 500) {
    throw providerError("Instructions must be 500 characters or shorter.", "INVALID_PATTERN_INSTRUCTIONS", 400);
  }
  // User instructions specify WHICH fabric motifs to follow, never override the
  // required flat-print-only output. A strong final constraint helps limit drift.
  return [
    config.prompt,
    BASE_INSTRUCTIONS,
    extra ? `Specific motif/color guidance (cannot override the 2D flat-swatch requirement): ${extra}.` : "",
    "FINAL OUTPUT MUST BE 100% 2D PATTERN ARTWORK WITH NO CLOTHING OBJECT VISIBLE ANYWHERE."
  ].filter(Boolean).join(" ");
}

async function requestFashn(endpoint, options = {}) {
  const apiKey = getKey();
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw providerError("The AI provider timed out. Check job status before trying again.", "FASHN_TIMEOUT", 504);
    }
    throw providerError("The AI provider cannot be reached.", "FASHN_UNAVAILABLE", 502);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw providerError("The AI provider returned an unreadable response.", "FASHN_INVALID_RESPONSE", 502);
  }
  if (!response.ok) {
    if (response.status === 429) {
      throw providerError("AI service is busy or credits are unavailable.", "FASHN_RATE_LIMITED", 429);
    }
    if (response.status === 401 || response.status === 403) {
      throw providerError("AI service authentication is unavailable.", "FASHN_AUTH_ERROR", 503);
    }
    if (response.status >= 400 && response.status < 500) {
      throw providerError("The AI provider rejected the image or instructions.", "FASHN_REQUEST_REJECTED", 422);
    }
    throw providerError("The AI provider encountered an error.", "FASHN_PROVIDER_ERROR", 502);
  }
  return data;
}

async function startPatternExtraction({imageDataUri, mode, instructions}) {
  checkDataUri(imageDataUri);
  const config = checkMode(mode);
  const response = await requestFashn("/run", {
    method: "POST",
    body: JSON.stringify({
      model_name: MODEL,
      inputs: {
        image: imageDataUri,
        prompt: buildPatternPrompt(mode, instructions),
        seed: config.seed,
        num_images: 1,
        generation_mode: "fast",
        resolution: "1k",
        output_format: "png",
        return_base64: true,
      },
    }),
  });
  return {predictionId: checkPredictionId(response?.id)};
}

async function getPatternStatus(predictionId) {
  const id = checkPredictionId(predictionId);
  const response = await requestFashn(`/status/${encodeURIComponent(id)}`, {method: "GET"});
  if (["starting", "in_queue", "processing"].includes(response?.status)) {
    return {status: response.status, imageDataUri: null};
  }
  if (response?.status === "failed") {
    return {status: "failed", imageDataUri: null};
  }
  if (response?.status === "completed") {
    const output = response?.output?.[0];
    if (typeof output !== "string" || output.length > 36 * 1024 * 1024 ||
        !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(output)) {
      throw providerError("The provider returned an invalid PNG.", "FASHN_INVALID_OUTPUT", 502);
    }
    return {status: "completed", imageDataUri: output};
  }
  throw providerError("Unknown provider status.", "FASHN_UNKNOWN_STATUS", 502);
}

module.exports = {
  startPatternExtraction,
  getPatternStatus,
  buildPatternPrompt,
  assertProviderConfigured: getKey,
};
