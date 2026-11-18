"use strict";

const { getFalClient } = require("./falFashionService");

async function submitImage(model, input, { privateInputs = false } = {}) {
  const response = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: `Key ${process.env.FAL_KEY.trim()}`,
      "Content-Type": "application/json",
      "X-Fal-No-Retry": "1",
      ...(privateInputs ? { "X-Fal-Store-IO": "0" } : {}),
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw Object.assign(new Error("Image submission was rejected."), { status: response.status });
  }
  const { request_id: requestId } = await response.json();
  if (typeof requestId !== "string" || !/^[a-zA-Z0-9-]{8,150}$/.test(requestId)) {
    throw new Error("Invalid image submission ID.");
  }
  return requestId;
}

async function getImageStatus(model, requestId) {
  const fal = await getFalClient();
  const options = { requestId, abortSignal: AbortSignal.timeout(30000) };
  try {
    const status = await fal.queue.status(model, options);
    if (status.error) return { status: "failed" };
    if (status.status !== "COMPLETED") {
      return { status: "processing", queued: status.status === "IN_QUEUE" };
    }
    const { data } = await fal.queue.result(model, options);
    return { status: "completed", output: [data?.images?.[0]?.url], credits: null };
  } catch (error) {
    if ([400, 404, 410, 422].includes(error.status)) return { status: "failed" };
    throw error;
  }
}

module.exports = { submitImage, getImageStatus };
