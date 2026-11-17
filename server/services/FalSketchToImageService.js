"use strict";

const { submitImage, getImageStatus } = require("./ai/falImageQueue");
const MODEL = "fal-ai/flux-pro/kontext";

function startSketchEdit({ sketchBuffer, instruction }) {
  return submitImage(MODEL, {
    image_url: `data:image/jpeg;base64,${sketchBuffer.toString("base64")}`,
    prompt: instruction,
    output_format: "png",
    num_images: 1,
  });
}

function getSketchStatus(requestId) {
  return getImageStatus(MODEL, requestId);
}

module.exports = { MODEL, startSketchEdit, getSketchStatus };
