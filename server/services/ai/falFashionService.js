/*
=========================================================
DesignByYou AI Fashion Generation Service
FLUX.1 Kontext Pro via fal.ai
Version 1.0.0
=========================================================
*/

const DEFAULT_MODEL =
  process.env.AI_FASHION_MODEL || "fal-ai/flux-pro/kontext";

let falClientPromise = null;

/*=========================================================
Load fal Client
=========================================================*/

async function getFalClient() {
  if (!process.env.FAL_KEY) {
    throw new Error(
      "FAL_KEY is missing. Add it to the backend environment variables.",
    );
  }

  if (!falClientPromise) {
    falClientPromise = import("@fal-ai/client").then(({ fal }) => {
      fal.config({
        credentials: process.env.FAL_KEY,
      });

      return fal;
    });
  }

  return falClientPromise;
}

/*=========================================================
Validation Helpers
=========================================================*/

function validateImageSource(imageSource) {
  if (typeof imageSource !== "string" || !imageSource.trim()) {
    throw new Error("An input fashion image is required.");
  }

  const source = imageSource.trim();

  const isHttpUrl =
    /^https?:\/\/.+/i.test(source);

  const isImageDataUri =
    /^data:image\/(?:png|jpe?g|webp)(?:;[^,]*)?,/i.test(source);

  if (!isHttpUrl && !isImageDataUri) {
    throw new Error(
      "The fashion image must be a public image URL or image data URI.",
    );
  }

  return source;
}

function validatePrompt(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("An AI fashion prompt is required.");
  }

  const safePrompt = prompt.trim();

  if (safePrompt.length > 5000) {
    throw new Error(
      "The AI fashion prompt is too long.",
    );
  }

  return safePrompt;
}

/*=========================================================
Generate Fashion Image
=========================================================*/

async function generateFashionImage({
  imageSource,
  prompt,
  aspectRatio = "1:1",
  outputFormat = "png",
  guidanceScale = 3.5,
  enhancePrompt = true,
} = {}) {
  const source = validateImageSource(imageSource);
  const safePrompt = validatePrompt(prompt);

  const fal = await getFalClient();

  // Submit exactly once. The SDK's queue.submit automatically retries POSTs.
  const signal = AbortSignal.timeout(120000);
  const submission = await fetch(`https://queue.fal.run/${DEFAULT_MODEL}`, {
    method: "POST",
    redirect: "error",
    signal,
    headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: source,
      prompt: safePrompt,

      aspect_ratio: aspectRatio,

      output_format: outputFormat,

      guidance_scale: guidanceScale,

      enhance_prompt: enhancePrompt,

      num_images: 1,

      safety_tolerance: "2",
    }),
  });
  if (!submission.ok) throw new Error("Preview submission could not be confirmed.");
  const { request_id: requestId } = await submission.json();
  if (!requestId) throw new Error("Preview submission returned no request ID.");
  await fal.queue.subscribeToStatus(DEFAULT_MODEL, { requestId, logs: false, abortSignal: signal });
  const result = await fal.queue.result(DEFAULT_MODEL, { requestId, abortSignal: signal });

  const images = Array.isArray(result?.data?.images)
    ? result.data.images
    : [];

  const image = images[0];

  if (!image?.url) {
    throw new Error(
      "fal.ai completed the request but did not return a generated image.",
    );
  }

  return {
    requestId:
      result?.requestId ||
      result?.request_id ||
      null,

    model: DEFAULT_MODEL,

    image: {
      url: image.url,

      width:
        Number.isFinite(Number(image.width))
          ? Number(image.width)
          : null,

      height:
        Number.isFinite(Number(image.height))
          ? Number(image.height)
          : null,

      contentType:
        image.content_type ||
        image.contentType ||
        null,
    },

    seed:
      Number.isFinite(Number(result?.data?.seed))
        ? Number(result.data.seed)
        : null,

    prompt:
      typeof result?.data?.prompt === "string"
        ? result.data.prompt
        : safePrompt,

    hasNsfwConcepts:
      Array.isArray(result?.data?.has_nsfw_concepts)
        ? result.data.has_nsfw_concepts
        : [],
  };
}

/*=========================================================
Exports
=========================================================*/

module.exports = {
  getFalClient,
  generateFashionImage,
};
