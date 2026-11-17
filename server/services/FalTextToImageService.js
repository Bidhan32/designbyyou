"use strict";

const { submitImage, getImageStatus } = require("./ai/falImageQueue");

const MODEL = "fal-ai/flux/dev";
const SIZES = {
  "1:1": { width: 1024, height: 1024 },
  "3:4": { width: 768, height: 1024 },
  "4:5": { width: 832, height: 1040 },
  "2:3": { width: 704, height: 1056 },
  "9:16": { width: 576, height: 1024 },
  "16:9": { width: 1024, height: 576 },
};
const STEPS = { fast: 16, balanced: 28, quality: 40 };

function startTextToImage({ prompt, aspectRatio, generationMode }) {
  return submitImage(MODEL, {
    prompt,
    image_size: SIZES[aspectRatio],
    num_inference_steps: STEPS[generationMode],
    num_images: 1,
    output_format: "png",
    enable_safety_checker: true,
  });
}

function getTextToImageStatus(requestId) {
  return getImageStatus(MODEL, requestId);
}

module.exports = { MODEL, startTextToImage, getTextToImageStatus };
