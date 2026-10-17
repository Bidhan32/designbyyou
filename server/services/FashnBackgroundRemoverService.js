
"use strict";

/*
 * =========================================================
 * DesignByYou / FashionVision
 * FASHN AI Background Remover Service
 * Version 1.0
 * =========================================================
 *
 * PURPOSE
 * ---------------------------------------------------------
 * - Submit images to FASHN Background Remove
 * - Poll prediction status until completion
 * - Return transparent PNG as a base64 data URI
 * - Handle provider errors and request timeouts
 *
 * PRIVACY
 * ---------------------------------------------------------
 * - No input image is written to disk
 * - No generated output is written to disk
 * - No database records are created
 * - FASHN API key stays on the backend
 *
 * Model: background-remove
 *
 * Compatible with:
 * creatorBackgroundRemoverController.js
 * =========================================================
 */

const API_BASE = "https://api.fashn.ai/v1";

const MODEL_NAME = "background-remove";

const POLL_INTERVAL_MS = 2000;

const MAX_POLL_MS = 70000;

const HTTP_TIMEOUT_MS = 20000;

const MAX_OUTPUT_BASE64_CHARS = 36 * 1024 * 1024;

/*
 * =========================================================
 * Provider Error Helper
 * =========================================================
 */

function providerError(message, code, httpStatus) {
  const error = new Error(message);

  error.code = code;
  error.httpStatus = httpStatus;

  return error;
}

/*
 * =========================================================
 * FASHN Authentication Headers
 * =========================================================
 */

function getHeaders() {
  const apiKey = String(
    process.env.FASHN_API_KEY || ""
  ).trim();

  if (!apiKey) {
    throw providerError(
      "Background removal is not configured.",
      "NOT_CONFIGURED",
      503
    );
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

/*
 * =========================================================
 * Safe FASHN HTTP Request
 * =========================================================
 */

async function requestFashn(url, options) {
  let response;

  try {
    response = await fetch(url, {
      ...options,

      signal: AbortSignal.timeout(
        HTTP_TIMEOUT_MS
      ),
    });
  } catch (error) {
    if (
      error?.name === "TimeoutError" ||
      error?.name === "AbortError"
    ) {
      throw providerError(
        "The AI provider did not respond in time.",
        "PROVIDER_TIMEOUT",
        504
      );
    }

    throw providerError(
      "Unable to reach the AI provider.",
      "PROVIDER_UNAVAILABLE",
      502
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw providerError(
      "The AI provider returned an invalid response.",
      "BAD_PROVIDER_RESPONSE",
      502
    );
  }

  /*
   * Provider Error Handling
   */

  if (!response.ok) {
    if (response.status === 429) {
      throw providerError(
        "The AI service is busy. Please retry shortly.",
        "PROVIDER_RATE_LIMIT",
        429
      );
    }

    if (
      [401, 403].includes(response.status)
    ) {
      throw providerError(
        "Background removal is temporarily unavailable.",
        "PROVIDER_AUTH_ERROR",
        503
      );
    }

    if (
      response.status >= 400 &&
      response.status < 500
    ) {
      throw providerError(
        "The AI provider could not process this image.",
        "PROVIDER_REJECTED_IMAGE",
        422
      );
    }

    throw providerError(
      "The AI provider is temporarily unavailable.",
      "PROVIDER_UNAVAILABLE",
      502
    );
  }

  return data;
}

/*
 * =========================================================
 * Polling Delay Helper
 * =========================================================
 */

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/*
 * =========================================================
 * Remove Background
 *
 * INPUT:
 * imageDataUri:
 * data:image/jpeg;base64,...
 *
 * OUTPUT:
 * {
 *   predictionId: "...",
 *   dataUri: "data:image/png;base64,..."
 * }
 * =========================================================
 */

async function removeBackground(imageDataUri) {
  /*
   * Authentication configuration
   */

  const headers = getHeaders();

  /*
   * Start background removal prediction
   */

  const started = await requestFashn(
    `${API_BASE}/run`,
    {
      method: "POST",

      headers,

      body: JSON.stringify({
        model_name: MODEL_NAME,

        inputs: {
          image: imageDataUri,

          return_base64: true,
        },
      }),
    }
  );

  /*
   * Validate prediction identifier
   */

  const predictionId = started?.id;

  if (
    typeof predictionId !== "string" ||
    !/^[A-Za-z0-9-]{8,100}$/.test(
      predictionId
    )
  ) {
    throw providerError(
      "The AI provider did not return a valid prediction ID.",
      "BAD_PROVIDER_RESPONSE",
      502
    );
  }

  /*
   * Poll until completed or timed out
   */

  const expiresAt =
    Date.now() + MAX_POLL_MS;

  while (Date.now() < expiresAt) {
    const result = await requestFashn(
      `${API_BASE}/status/${encodeURIComponent(
        predictionId
      )}`,
      {
        method: "GET",
        headers,
      }
    );

    /*
     * Successful prediction
     */

    if (result?.status === "completed") {
      const dataUri = result?.output?.[0];

      /*
       * Ensure the returned result is a PNG
       * base64 data URI.
       */

      if (
        typeof dataUri !== "string" ||
        dataUri.length > MAX_OUTPUT_BASE64_CHARS ||
        !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(
          dataUri
        )
      ) {
        throw providerError(
          "The AI provider returned an invalid PNG image.",
          "BAD_PROVIDER_OUTPUT",
          502
        );
      }

      /*
       * Return one generated result.
       * No Cloudinary or database writes.
       */

      return {
        predictionId,
        dataUri,
      };
    }

    /*
     * Failed prediction
     */

    if (result?.status === "failed") {
      throw providerError(
        "The AI could not remove the background from this image.",
        "GENERATION_FAILED",
        422
      );
    }

    /*
     * Validate processing status
     */

    if (
      ![
        "starting",
        "in_queue",
        "processing",
      ].includes(result?.status)
    ) {
      throw providerError(
        "The AI provider returned an unexpected status.",
        "BAD_PROVIDER_RESPONSE",
        502
      );
    }

    /*
     * Wait before checking again
     */

    await wait(POLL_INTERVAL_MS);
  }

  /*
   * Prediction exceeded time limit
   */

  throw providerError(
    "Background removal is taking too long. Please try again later.",
    "POLL_TIMEOUT",
    504
  );
}

/*
 * =========================================================
 * Exports
 * =========================================================
 */

module.exports = {
  removeBackground,

  BACKGROUND_REMOVE_MODEL: MODEL_NAME,
};
