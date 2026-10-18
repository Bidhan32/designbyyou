
"use strict";

/*
 * =========================================================
 * DesignByYou / FashionVision
 * FASHN Costume Extractor Service
 * Version 1.0
 * =========================================================
 *
 * MODEL
 *   FASHN Edit
 *
 * PURPOSE
 *   Generate garment-only costume visualizations:
 *   - Front
 *   - Back
 *   - Left side
 *   - Right side
 *
 * IMPORTANT
 *   Back and side views may contain AI-inferred details.
 *   They are creative visualizations, not technical
 *   manufacturing or tailoring specifications.
 *
 * SECURITY
 *   - API key never exposed to browser
 *   - Accepts image data URIs, not arbitrary remote URLs
 *   - Validates requested view and prediction IDs
 *   - Uses request timeouts
 *   - Does not automatically retry charged submissions
 *   - Returns controlled error messages
 *
 * EXECUTION
 *   startCostumeView() submits a prediction.
 *   getCostumeViewStatus() checks its current status.
 *
 * No HTTP request is kept open for the entire generation.
 * =========================================================
 */

const API_BASE = "https://api.fashn.ai/v1";

const MODEL_NAME = "edit";

const GENERATION_MODE = "fast";
const OUTPUT_RESOLUTION = "1k";
const OUTPUT_FORMAT = "png";

const REQUEST_TIMEOUT_MS = 30000;

const MAX_INPUT_DATA_URI_CHARS = 24 * 1024 * 1024;
const MAX_OUTPUT_DATA_URI_CHARS = 36 * 1024 * 1024;

const VIEW_KEYS = Object.freeze([
  "front",
  "back",
  "left",
  "right",
]);

const VIEW_CONFIG = Object.freeze({
  front: Object.freeze({
    label: "Front View",
    seed: 42,
    instruction: "Show the full FRONT view.",
  }),

  back: Object.freeze({
    label: "Back View",
    seed: 43,
    instruction:
      "Generate the full BACK view of the same costume.",
  }),

  left: Object.freeze({
    label: "Left Side View",
    seed: 44,
    instruction:
      "Generate the full LEFT SIDE view of the same costume.",
  }),

  right: Object.freeze({
    label: "Right Side View",
    seed: 45,
    instruction:
      "Generate the full RIGHT SIDE view of the same costume.",
  }),
});

const COMMON_PROMPT =
  "Extract only the costume from the source image. " +
  "Remove the person completely. " +
  "Show the full costume alone as a garment-only " +
  "presentation on a ghost mannequin with no visible " +
  "human body. " +
  "Preserve the costume's color, silhouette, fabric, " +
  "trims, embroidery, structure, accessories, and " +
  "overall design details as faithfully as possible. " +
  "Place it centered against a clean plain studio " +
  "background.";

/*
 * =========================================================
 * Error Helpers
 * =========================================================
 */

function serviceError(
  message,
  code = "COSTUME_EXTRACTOR_ERROR",
  httpStatus = 500
) {
  const error = new Error(message);

  error.code = code;
  error.httpStatus = httpStatus;
  error.statusCode = httpStatus;

  return error;
}

/*
 * =========================================================
 * API Key
 * =========================================================
 */

function getApiKey() {
  const apiKey = String(
    process.env.FASHN_API_KEY || ""
  ).trim();

  if (!apiKey) {
    throw serviceError(
      "The AI Costume Extractor is not configured.",
      "FASHN_NOT_CONFIGURED",
      503
    );
  }

  return apiKey;
}

function getHeaders() {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

/*
 * =========================================================
 * Validate Costume View
 * =========================================================
 */

function validateView(view) {
  if (
    typeof view !== "string" ||
    !Object.prototype.hasOwnProperty.call(
      VIEW_CONFIG,
      view
    )
  ) {
    throw serviceError(
      "Invalid costume view. Choose front, back, left or right.",
      "INVALID_COSTUME_VIEW",
      400
    );
  }

  return view;
}

/*
 * =========================================================
 * Validate Image Data URI
 *
 * The controller will preprocess the uploaded image
 * using Sharp before passing it to this service.
 * =========================================================
 */

function validateImageDataUri(imageDataUri) {
  if (
    typeof imageDataUri !== "string" ||
    imageDataUri.length >
      MAX_INPUT_DATA_URI_CHARS ||
    !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
      imageDataUri
    )
  ) {
    throw serviceError(
      "A valid JPG, PNG or WebP image is required.",
      "INVALID_COSTUME_IMAGE",
      400
    );
  }

  return imageDataUri;
}

/*
 * =========================================================
 * Validate Prediction ID
 * =========================================================
 */

function validatePredictionId(predictionId) {
  if (
    typeof predictionId !== "string" ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(
      predictionId
    )
  ) {
    throw serviceError(
      "Invalid costume generation reference.",
      "INVALID_PREDICTION_ID",
      400
    );
  }

  return predictionId;
}

/*
 * =========================================================
 * Build View Prompt
 *
 * Keep the same wording used in our successful
 * four-view proof-of-concept.
 * =========================================================
 */

function buildCostumePrompt(view) {
  const validView = validateView(view);

  return (
    COMMON_PROMPT +
    " " +
    VIEW_CONFIG[validView].instruction
  );
}

/*
 * =========================================================
 * FASHN HTTP Request
 * =========================================================
 */

async function requestFashn(
  url,
  options = {}
) {
  let response;

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...getHeaders(),
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(
        REQUEST_TIMEOUT_MS
      ),
    });
  } catch (error) {
    if (
      error?.name === "TimeoutError" ||
      error?.name === "AbortError"
    ) {
      throw serviceError(
        "The AI provider did not respond in time.",
        "FASHN_TIMEOUT",
        504
      );
    }

    throw serviceError(
      "Unable to connect to the AI provider.",
      "FASHN_UNAVAILABLE",
      502
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw serviceError(
      "The AI provider returned an invalid response.",
      "FASHN_INVALID_RESPONSE",
      502
    );
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw serviceError(
        "The AI provider is busy. Please try again shortly.",
        "FASHN_RATE_LIMITED",
        429
      );
    }

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      throw serviceError(
        "The AI service is temporarily unavailable.",
        "FASHN_AUTH_ERROR",
        503
      );
    }

    if (
      response.status >= 400 &&
      response.status < 500
    ) {
      throw serviceError(
        "The AI provider rejected the costume generation request.",
        "FASHN_REQUEST_REJECTED",
        422
      );
    }

    throw serviceError(
      "The AI provider encountered a temporary error.",
      "FASHN_PROVIDER_ERROR",
      502
    );
  }

  return data;
}

/*
 * =========================================================
 * Start Costume View
 *
 * One invocation starts ONE FASHN prediction.
 *
 * The controller will decide which views to submit.
 *
 * Do not automatically retry this POST request:
 * an uncertain network result could create duplicate
 * paid generations.
 * =========================================================
 */

async function startCostumeView({
  imageDataUri,
  view,
}) {
  const selectedView = validateView(view);

  validateImageDataUri(imageDataUri);

  const config = VIEW_CONFIG[selectedView];

  const payload = {
    model_name: MODEL_NAME,

    inputs: {
      image: imageDataUri,

      prompt: buildCostumePrompt(
        selectedView
      ),

      seed: config.seed,

      num_images: 1,

      generation_mode: GENERATION_MODE,

      resolution: OUTPUT_RESOLUTION,

      output_format: OUTPUT_FORMAT,

      return_base64: true,
    },
  };

  const response = await requestFashn(
    `${API_BASE}/run`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );

  const predictionId = response?.id;

  if (
    typeof predictionId !== "string" ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(
      predictionId
    )
  ) {
    throw serviceError(
      "The AI provider did not return a valid generation reference.",
      "FASHN_INVALID_PREDICTION",
      502
    );
  }

  return {
    predictionId,
    view: selectedView,
    label: config.label,
    status: "submitted",
    provider: "fashn",
    model: MODEL_NAME,
    outputFormat: OUTPUT_FORMAT,
  };
}

/*
 * =========================================================
 * Validate Generated PNG
 * =========================================================
 */

function validateOutputDataUri(output) {
  if (
    typeof output !== "string" ||
    output.length >
      MAX_OUTPUT_DATA_URI_CHARS ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(
      output
    )
  ) {
    throw serviceError(
      "The AI provider returned an invalid generated image.",
      "FASHN_INVALID_OUTPUT",
      502
    );
  }

  return output;
}

/*
 * =========================================================
 * Check Costume View Status
 *
 * States:
 * - starting
 * - in_queue
 * - processing
 * - completed
 * - failed
 *
 * No automatic polling loop here.
 *
 * The controller or job manager will call this method
 * whenever a status update is required.
 * =========================================================
 */

async function getCostumeViewStatus(
  predictionId
) {
  const validId = validatePredictionId(
    predictionId
  );

  const response = await requestFashn(
    `${API_BASE}/status/${encodeURIComponent(
      validId
    )}`,
    {
      method: "GET",
    }
  );

  const status = response?.status;

  if (
    status === "starting" ||
    status === "in_queue" ||
    status === "processing"
  ) {
    return {
      predictionId: validId,
      status,
      completed: false,
      failed: false,
      imageDataUri: null,
    };
  }

  if (status === "failed") {
    return {
      predictionId: validId,
      status: "failed",
      completed: false,
      failed: true,
      imageDataUri: null,
      errorCode: "GENERATION_FAILED",
    };
  }

  if (status === "completed") {
    const output =
      response?.output?.[0];

    const imageDataUri =
      validateOutputDataUri(output);

    return {
      predictionId: validId,
      status: "completed",
      completed: true,
      failed: false,
      imageDataUri,
      outputFormat: OUTPUT_FORMAT,
    };
  }

  throw serviceError(
    "The AI provider returned an unexpected generation status.",
    "FASHN_UNKNOWN_STATUS",
    502
  );
}

/*
 * =========================================================
 * Export
 * =========================================================
 */

module.exports = {
  startCostumeView,
  getCostumeViewStatus,
  buildCostumePrompt,

  COSTUME_VIEW_KEYS: VIEW_KEYS,
  COSTUME_VIEW_CONFIG: VIEW_CONFIG,

  COSTUME_MODEL: MODEL_NAME,
  COSTUME_GENERATION_MODE: GENERATION_MODE,
  COSTUME_OUTPUT_RESOLUTION: OUTPUT_RESOLUTION,
};
