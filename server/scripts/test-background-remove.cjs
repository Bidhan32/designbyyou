
"use strict";

/*
=========================================================
DesignByYou
FASHN Background Remover API Test
=========================================================

Run from backend project root:

node scripts/test-background-remove.cjs "./test-image.jpg"

Requires:
- Node.js 18+
- dotenv
- FASHN_API_KEY in backend .env

=========================================================
*/

require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");

const API_BASE = "https://api.fashn.ai/v1";

const API_KEY = process.env.FASHN_API_KEY;

const imagePath = process.argv[2];

const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!API_KEY) {
    throw new Error("FASHN_API_KEY is missing.");
  }

  if (!imagePath || !fs.existsSync(imagePath)) {
    throw new Error("Provide a valid local image path.");
  }

  const extension = path.extname(imagePath).toLowerCase();
  const mimeType = MIME_TYPES[extension];

  if (!mimeType) {
    throw new Error("Use a JPG, PNG or WebP image.");
  }

  const imageBuffer = fs.readFileSync(imagePath);

  if (imageBuffer.length > 5 * 1024 * 1024) {
    throw new Error("Use an image smaller than 5 MB for this test.");
  }

  const imageDataUri =
    `data:${mimeType};base64,${imageBuffer.toString("base64")}`;

  const headers = {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };

  console.log("Submitting background removal...");

  const runResponse = await fetch(`${API_BASE}/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model_name: "background-remove",
      inputs: {
        image: imageDataUri,
        return_base64: true,
      },
    }),
    signal: AbortSignal.timeout(30000),
  });

  const runData = await runResponse.json();

  if (!runResponse.ok || !runData.id) {
    throw new Error(JSON.stringify(runData.error || runData));
  }

  console.log("Prediction ID:", runData.id);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(2000);

    const statusResponse = await fetch(
      `${API_BASE}/status/${encodeURIComponent(runData.id)}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
        signal: AbortSignal.timeout(15000),
      },
    );

    const statusData = await statusResponse.json();

    if (!statusResponse.ok) {
      throw new Error(
        JSON.stringify(statusData.error || statusData),
      );
    }

    console.log("Status:", statusData.status);

    if (statusData.status === "completed") {
      const result = statusData.output?.[0];

      if (
        typeof result !== "string" ||
        !result.startsWith("data:image/png;base64,")
      ) {
        throw new Error("Expected a base64 PNG output.");
      }

      const encoded = result.split(",")[1];

      const outputFile = path.resolve(
        "background-removed.png",
      );

      fs.writeFileSync(
        outputFile,
        Buffer.from(encoded, "base64"),
      );

      console.log("SUCCESS");
      console.log("Image saved:", outputFile);

      return;
    }

    if (statusData.status === "failed") {
      throw new Error(
        JSON.stringify(statusData.error || "Generation failed."),
      );
    }
  }

  throw new Error(
    "Prediction did not complete within the test polling window.",
  );
}

main().catch((error) => {
  console.error("Background removal test failed:", error.message);
  process.exitCode = 1;
});
