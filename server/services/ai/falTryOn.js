"use strict";

const { submitImage, getImageStatus } = require("./falImageQueue");

const FAL_MODEL = "fal-ai/fashn/tryon/v1.6";

function startPrediction({ personImage, garmentImage, category, mode, garmentPhotoType }) {
  return submitImage(FAL_MODEL, {
    model_image: personImage,
    garment_image: garmentImage,
    category,
    mode,
    garment_photo_type: garmentPhotoType,
    num_samples: 1,
    output_format: "jpeg",
    sync_mode: true,
    enable_safety_checker: true,
  }, { privateInputs: true });
}

function getPredictionStatus(requestId) {
  return getImageStatus(FAL_MODEL, requestId);
}

module.exports = { FAL_MODEL, startPrediction, getPredictionStatus };
