"use strict";

/*
=========================================================
DesignByYou / FashionVision
FASHN Edit API Proof-of-Concept Test
AI Costume Extractor (Garment-only multi-view)
Version 1.0
=========================================================

PURPOSE
---------------------------------------------------------
- Test whether FASHN Edit can convert a costume image
  into garment-only front/back/left/right views.
- Save each generated view as a PNG file.
- Keep implementation local and isolated before
  integrating into the app.

RUN
---------------------------------------------------------
node scripts/test-costume-extractor-edit.cjs ".\test-costume.jpg"

REQUIREMENTS
---------------------------------------------------------
- Node.js 18+
- dotenv installed
- FASHN_API_KEY in server/.env
- input image exists locally

OUTPUT
---------------------------------------------------------
server/costume-extractor-output/
  front.png
  back.png
  left.png
  right.png
  summary.json
=========================================================
*/

require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");

const API_BASE = "https://api.fashn.ai/v1";
const API_KEY = String(process.env.FASHN_API_KEY || "").trim();

const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const VIEWS = [
  {
    key: "front",
    label: "front view",
    prompt:
      "Extract only the costume from the source image. Remove the person completely. Show the full costume alone as a garment-only presentation on a ghost mannequin with no visible human body. Preserve the costume's color, silhouette, fabric, trims, embroidery, structure, accessories, and overall design details as faithfully as possible. Place it centered against a clean plain studio background. Show the full FRONT view.",
  },
  {
    key: "back",
    label: "back view",
    prompt:
      "Extract only the costume from the source image. Remove the person completely. Show the full costume alone as a garment-only presentation on a ghost mannequin with no visible human body. Preserve the costume's color, silhouette, fabric, trims, embroidery, structure, accessories, and overall design details as faithfully as possible. Place it centered against a clean plain studio background. Generate the full BACK view of the same costume.",
  },
  {
    key: "left",
    label: "left side view",
    prompt:
      "Extract only the costume from the source image. Remove the person completely. Show the full costume alone as a garment-only presentation on a ghost mannequin with no visible human body. Preserve the costume's color, silhouette, fabric, trims, embroidery, structure, accessories, and overall design details as faithfully as possible. Place it centered against a clean plain studio background. Generate the full LEFT SIDE view of the same costume.",
  },
  {
    key: "right",
    label: "right side view",
    prompt:
      "Extract only the costume from the source image. Remove the person completely. Show the full costume alone as a garment-only presentation on a ghost mannequin with no visible human body. Preserve the costume's color, silhouette, fabric, trims, embroidery, structure, accessories, and overall design details as faithfully as possible. Place it centered against a clean plain studio background. Generate the full RIGHT SIDE view of the same costume.",
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureApiKey() {
  if (!API_KEY) {
    throw new Error("FASHN_API_KEY is missing in .env");
  }
}

function ensureInputImage(filePath) {
  if (!filePath) {
    throw new Error("Please provide a local image path.");
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Input image not found: ${filePath}`);
  }

  const extension = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[extension];

  if (!mimeType) {
    throw new Error("Use a JPG, PNG or WebP image.");
  }

  return mimeType;
}

function toDataUri(filePath, mimeType) {
  const buffer = fs.readFileSync(filePath);

  if (buffer.length > 30 * 1024 * 1024) {
    throw new Error("Input image exceeds FASHN Edit's 30 MiB file limit.");
  }

  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function requestJson(url, options = {}) {
  let response;

  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    if (error?.name === "AbortError" || error?.name === "TimeoutError") {
      throw new Error("Request to FASHN timed out.");
    }
    throw new Error(`Unable to reach FASHN: ${error.message}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("FASHN returned non-JSON data.");
  }

  if (!response.ok) {
    throw new Error(
      `FASHN error (${response.status}): ${JSON.stringify(data)}`
    );
  }

  return data;
}

async function submitEditJob(imageDataUri, prompt, seed) {
  return requestJson(`${API_BASE}/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_name: "edit",
      inputs: {
        image: imageDataUri,
        prompt,
        seed,
        num_images: 1,
        output_format: "png",
        return_base64: true,
      },
    }),
  });
}

async function pollPrediction(predictionId) {
  const startedAt = Date.now();
  const maxWaitMs = 120000;

  while (Date.now() - startedAt < maxWaitMs) {
    await sleep(2500);

    const data = await requestJson(
      `${API_BASE}/status/${encodeURIComponent(predictionId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
      }
    );

    if (data.status === "completed") {
      return data;
    }

    if (data.status === "failed") {
      throw new Error(
        `Prediction failed: ${JSON.stringify(data.error || data)}`
      );
    }

    process.stdout.write(`Status for ${predictionId}: ${data.status}\n`);
  }

  throw new Error(`Prediction timed out for ID ${predictionId}`);
}

function writeBase64Png(dataUri, outputPath) {
  if (
    typeof dataUri !== "string" ||
    !dataUri.startsWith("data:image/png;base64,")
  ) {
    throw new Error("Expected data:image/png;base64 output.");
  }

  const base64 = dataUri.split(",")[1];
  fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));
}

async function generateView({ imageDataUri, outputDir, view, seed }) {
  console.log(`\nSubmitting ${view.label}...`);

  const submission = await submitEditJob(imageDataUri, view.prompt, seed);

  if (!submission?.id) {
    throw new Error(`No prediction ID returned for ${view.key}`);
  }

  console.log(`Prediction ID (${view.key}): ${submission.id}`);

  const result = await pollPrediction(submission.id);
  const output = result?.output?.[0];

  const filePath = path.join(outputDir, `${view.key}.png`);
  writeBase64Png(output, filePath);

  console.log(`Saved ${view.key}: ${filePath}`);

  return {
    view: view.key,
    prediction_id: submission.id,
    file: filePath,
    status: result.status,
  };
}

async function main() {
  ensureApiKey();

  const inputPath = process.argv[2];
  const mimeType = ensureInputImage(inputPath);
  const imageDataUri = toDataUri(inputPath, mimeType);

  const outputDir = path.resolve("costume-extractor-output");
  fs.mkdirSync(outputDir, { recursive: true });

  const baseSeed = 42;
  const summary = {
    input: path.resolve(inputPath),
    generated_at: new Date().toISOString(),
    model: "edit",
    outputs: [],
  };

  for (let index = 0; index < VIEWS.length; index += 1) {
    const view = VIEWS[index];
    const result = await generateView({
      imageDataUri,
      outputDir,
      view,
      seed: baseSeed + index,
    });

    summary.outputs.push(result);
  }

  const summaryPath = path.join(outputDir, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log("\nSUCCESS");
  console.log(`Output directory: ${outputDir}`);
  console.log(`Summary file: ${summaryPath}`);
}

main().catch((error) => {
  console.error("\nCostume extractor POC failed:");
  console.error(error.message);
  process.exitCode = 1;
});