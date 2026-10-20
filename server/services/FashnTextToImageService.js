"use strict";

const cloudinary = require("cloudinary").v2;

const FASHN_BASE = "https://api.fashn.ai/v1";
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ALLOWED_DELIVERY_HOSTS = new Set(["cdn.fashn.ai", "media.fashn.ai"]);

class ProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

function apiKey() {
  const key = String(process.env.FASHN_API_KEY || "").trim();
  if (!key) throw new ProviderError("FASHN_API_KEY is not configured.", 503);
  return key;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (text.length > 500000) throw new ProviderError("FASHN response was too large.");
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new ProviderError("FASHN returned an invalid JSON response.");
  }
  if (!response.ok) {
    const code = typeof payload.error === "string" ? payload.error : "PROVIDER_ERROR";
    const message = String(payload.message || "Request rejected by FASHN.").slice(0, 180);
    throw new ProviderError(`${code}: ${message}`, response.status === 429 ? 429 : 502);
  }
  return payload;
}

async function fashnFetch(path, options = {}) {
  let response;
  try {
    response = await fetch(`${FASHN_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("FASHN could not be reached in time.");
  }
  return { data: await readJsonResponse(response), response };
}

async function startTextToImage({ prompt, aspectRatio, generationMode }) {
  const { data } = await fashnFetch("/run", {
    method: "POST",
    body: JSON.stringify({
      model_name: "model-create",
      inputs: {
        prompt,
        aspect_ratio: aspectRatio,
        resolution: "1k",
        generation_mode: generationMode,
        num_images: 1,
        output_format: "png",
        return_base64: false,
      },
    }),
  });
  if (typeof data.id !== "string" || !/^[a-zA-Z0-9-]{8,150}$/.test(data.id)) {
    throw new ProviderError("FASHN did not return a valid prediction ID.");
  }
  return data.id;
}

async function getTextToImageStatus(predictionId) {
  if (typeof predictionId !== "string" || !/^[a-zA-Z0-9-]{8,150}$/.test(predictionId)) {
    throw new ProviderError("Invalid FASHN prediction ID.");
  }
  const { data, response } = await fashnFetch(`/status/${encodeURIComponent(predictionId)}`);
  const creditHeader = response.headers.get("x-fashn-credits-used");
  const credits = creditHeader && Number.isFinite(Number(creditHeader))
    ? Number(creditHeader)
    : null;
  return { ...data, credits };
}

function validateFashnOutputUrl(value) {
  if (typeof value !== "string") throw new ProviderError("Missing generated image URL.");
  let parsed;
  try { parsed = new URL(value); } catch { throw new ProviderError("Invalid generated image URL."); }
  if (parsed.protocol !== "https:" || !ALLOWED_DELIVERY_HOSTS.has(parsed.hostname) ||
      parsed.username || parsed.password || parsed.port !== "") {
    throw new ProviderError("Generated image is not served by a trusted FASHN host.");
  }
  return parsed.toString();
}

async function fetchImageBytes(url) {
  let response;
  try {
    response = await fetch(validateFashnOutputUrl(url), {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new ProviderError("Could not retrieve the generated image from FASHN.");
  }
  if (!response.ok) throw new ProviderError("Generated image download failed.");
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "image/png" && type !== "image/jpeg") {
    throw new ProviderError("Generated image has an unsupported file type.");
  }
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_IMAGE_BYTES) throw new ProviderError("Generated image exceeds the size limit.");
  if (!response.body) throw new ProviderError("Generated image response is empty.");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new ProviderError("Generated image exceeds the size limit.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  const buffer = Buffer.concat(chunks);
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if ((type === "image/png" && !png) || (type === "image/jpeg" && !jpeg)) {
    throw new ProviderError("Generated image signature is invalid.");
  }
  return buffer;
}

async function saveFashnOutputToCloudinary({ fashnUrl, creatorId, jobId }) {
  const buffer = await fetchImageBytes(fashnUrl);
  const publicId = `t2i_${creatorId}_${jobId}`;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      folder: "designbyyou_ai/text_to_image",
      public_id: publicId,
      resource_type: "image",
      overwrite: true,
      secure: true,
    }, (error, result) => {
      if (error) return reject(new ProviderError("Cloudinary could not save the generated image."));
      if (!result || typeof result.secure_url !== "string" || !result.secure_url.startsWith("https://")) {
        return reject(new ProviderError("Cloudinary did not return a secure image URL."));
      }
      return resolve({ url: result.secure_url, publicId: result.public_id });
    });
    stream.on("error", () => reject(new ProviderError("Cloudinary upload stream failed.")));
    stream.end(buffer);
  });
}

module.exports = {
  ProviderError,
  startTextToImage,
  getTextToImageStatus,
  saveFashnOutputToCloudinary,
};
