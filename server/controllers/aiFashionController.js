/*
=========================================================
DesignByYou AI Fashion Controller
Sketch / Drawing / Template → Realistic Fashion Image
Version 1.0.0
=========================================================
*/

const {
  generateFashionImage,
} = require("../services/ai/falFashionService");

const {
  buildFashionPrompt,
} = require("../utils/buildFashionPrompt");

/*=========================================================
Helpers
=========================================================*/

function cleanString(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normaliseBoolean(value, fallback = true) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalised = value
      .trim()
      .toLowerCase();

    if (normalised === "true") {
      return true;
    }

    if (normalised === "false") {
      return false;
    }
  }

  return fallback;
}

function getImageSource(body = {}) {
  return cleanString(
    body.imageSource ||
      body.imageDataUrl ||
      body.imageUrl ||
      "",
  );
}

/*=========================================================
Generate Realistic Fashion Preview
=========================================================*/

exports.generateFashionPreview = async (
  req,
  res,
) => {
  try {
    const body =
      req.body &&
      typeof req.body === "object"
        ? req.body
        : {};

    /*=====================================================
    Validate Reference Image
    =====================================================*/

    const imageSource =
      getImageSource(body);

    if (!imageSource) {
      return res.status(400).json({
        success: false,

        message:
          "A fashion sketch, drawing, template, or reference image is required.",
      });
    }

    const isHttpImage =
      /^https?:\/\/.+/i.test(
        imageSource,
      );

    const isImageDataUri =
      /^data:image\/(?:png|jpe?g|webp)(?:;[^,]*)?,/i.test(
        imageSource,
      );

    if (
      !isHttpImage &&
      !isImageDataUri
    ) {
      return res.status(400).json({
        success: false,

        message:
          "The supplied fashion image must be an image URL or PNG/JPEG/WebP data URI.",
      });
    }

    /*=====================================================
    Read Fashion Options
    =====================================================*/

    const garmentType =
      cleanString(
        body.garmentType,
      );

    const material =
      cleanString(
        body.material,
      );

    const style =
      cleanString(
        body.style,
      );

    const designNotes =
      cleanString(
        body.designNotes ||
          body.notes,
      );

    const view =
      cleanString(
        body.view,
      ) || "front";

    const background =
      cleanString(
        body.background,
      ) || "studio";

    const preserveGraphics =
      normaliseBoolean(
        body.preserveGraphics,
        true,
      );

    const preserveText =
      normaliseBoolean(
        body.preserveText,
        true,
      );

    /*=====================================================
    Build AI Prompt
    =====================================================*/

    const prompt =
      buildFashionPrompt({
        garmentType,
        material,
        style,
        designNotes,
        view,
        background,
        preserveGraphics,
        preserveText,
      });

    /*=====================================================
    Generate with FLUX Kontext
    =====================================================*/

    const generation =
      await generateFashionImage({
        imageSource,

        prompt,

        aspectRatio:
          cleanString(
            body.aspectRatio,
          ) || "1:1",

        outputFormat:
          cleanString(
            body.outputFormat,
          ) || "png",
      });

    /*=====================================================
    Success
    =====================================================*/

    return res.status(200).json({
      success: true,

      message:
        "AI fashion preview generated successfully.",

      data: {
        requestId:
          generation.requestId,

        model:
          generation.model,

        image:
          generation.image,

        seed:
          generation.seed,

        prompt:
          generation.prompt,

        garmentType:
          garmentType || null,

        material:
          material || null,

        style:
          style || null,

        view,

        background,
      },
    });
  } catch (error) {
    console.error(
      "[AI Fashion] Generation failed:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "AI fashion generation failed.";

    /*
    Known configuration problem.
    This should not normally happen once deployed correctly.
    */

    if (
      message.includes("FAL_KEY")
    ) {
      return res.status(503).json({
        success: false,

        message:
          "AI fashion generation is currently unavailable.",
      });
    }

    /*
    Validation errors originating from our service.
    */

    if (
      message.includes(
        "input fashion image",
      ) ||
      message.includes(
        "fashion image must",
      ) ||
      message.includes(
        "AI fashion prompt",
      )
    ) {
      return res.status(400).json({
        success: false,

        message,
      });
    }

    /*
    Provider / generation failure.
    Avoid returning API keys or internal provider details.
    */

    return res.status(502).json({
      success: false,

      message:
        "The AI provider could not generate the fashion preview. Please try again.",
    });
  }
};