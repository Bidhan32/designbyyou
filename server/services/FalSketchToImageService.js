"use strict";

const { getFalClient } = require("./ai/falFashionService");
const MODEL = "fal-ai/flux-pro/kontext";

async function startSketchEdit({ sketchBuffer, instruction }) {
  const response = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: `Key ${process.env.FAL_KEY.trim()}`,
      "Content-Type": "application/json",
      "X-Fal-No-Retry": "1",
    },
    body: JSON.stringify({
      image_url: `data:image/jpeg;base64,${sketchBuffer.toString("base64")}`,
      prompt: instruction,
      output_format: "png",
      num_images: 1,
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw Object.assign(new Error("Sketch submission was rejected."), { status: response.status });
  }
  const { request_id: requestId } = await response.json();
  if (typeof requestId !== "string" || !/^[a-zA-Z0-9-]{8,150}$/.test(requestId)) {
    throw new Error("Invalid sketch submission ID.");
  }
  return requestId;
}

async function getSketchStatus(requestId) {
  const fal = await getFalClient();
  const options = { requestId, abortSignal: AbortSignal.timeout(30000) };
  try {
    const status = await fal.queue.status(MODEL, options);
    if (status.error) return { status: "failed" };
    if (status.status !== "COMPLETED") return { status: "processing" };
    const { data } = await fal.queue.result(MODEL, options);
    return { status: "completed", output: [data?.images?.[0]?.url], credits: null };
  } catch (error) {
    if ([400, 404, 410, 422].includes(error.status)) return { status: "failed" };
    throw error;
  }
}

module.exports = { MODEL, startSketchEdit, getSketchStatus };
