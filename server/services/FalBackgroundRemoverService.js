"use strict";

const { randomUUID } = require("node:crypto");

const BACKGROUND_REMOVE_MODEL = "fal-ai/birefnet/v2";
const MAX_RESULT_BYTES = 36 * 1024 * 1024;

function providerError(message, code, httpStatus) {
  return Object.assign(new Error(message), { code, httpStatus });
}

async function removeBackground(imageDataUri) {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw providerError("Background removal is not configured.", "NOT_CONFIGURED", 503);

  try {
    const response = await fetch(`https://fal.run/${BACKGROUND_REMOVE_MODEL}`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(90000),
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
        "X-Fal-Store-IO": "0",
        "X-Fal-No-Retry": "1",
      },
      body: JSON.stringify({ image_url: imageDataUri, output_format: "png", sync_mode: true }),
    });

    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) throw providerError("The AI service is busy. Please retry shortly.", "PROVIDER_RATE_LIMIT", 429);
      if ([401, 402, 403].includes(response.status)) throw providerError("Background removal is temporarily unavailable.", "PROVIDER_AUTH_ERROR", 503);
      if ([400, 413, 422].includes(response.status)) throw providerError("The AI provider could not process this image.", "PROVIDER_REJECTED_IMAGE", 422);
      throw providerError("The AI provider is temporarily unavailable.", "PROVIDER_UNAVAILABLE", 502);
    }

    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > MAX_RESULT_BYTES) throw providerError("The background removal result is too large.", "BAD_PROVIDER_OUTPUT", 502);
      chunks.push(chunk);
    }
    const dataUri = JSON.parse(Buffer.concat(chunks).toString("utf8"))?.image?.url;
    if (typeof dataUri !== "string" || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(dataUri)) {
      throw providerError("The AI provider returned an invalid PNG image.", "BAD_PROVIDER_OUTPUT", 502);
    }
    return { predictionId: response.headers.get("x-fal-request-id") || randomUUID(), dataUri };
  } catch (error) {
    if (error.httpStatus) throw error;
    if (["AbortError", "TimeoutError"].includes(error.name)) {
      throw providerError("Background removal timed out.", "PROVIDER_TIMEOUT", 504);
    }
    throw providerError("Unable to read the AI provider response.", "BAD_PROVIDER_RESPONSE", 502);
  }
}

module.exports = { removeBackground, BACKGROUND_REMOVE_MODEL };
