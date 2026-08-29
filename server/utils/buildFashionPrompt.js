/*
=========================================================
DesignByYou AI Fashion Prompt Builder
Sketch / Drawing / Template → Realistic Fashion Render
Version 1.0.0
=========================================================
*/

const MAX_USER_NOTES_LENGTH = 1200;

const ALLOWED_VIEWS = new Set([
  "front",
  "back",
  "front-back",
]);

const ALLOWED_BACKGROUNDS = new Set([
  "studio",
  "white",
  "neutral",
  "transparent-style",
]);

/*=========================================================
Helpers
=========================================================*/

function cleanText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value
    .replace(/\s+/g, " ")
    .trim();
}

function limitText(value, maxLength) {
  const text = cleanText(value);

  if (!text) {
    return "";
  }

  return text.slice(0, maxLength);
}

function normaliseView(value) {
  const requested = cleanText(value).toLowerCase();

  return ALLOWED_VIEWS.has(requested)
    ? requested
    : "front";
}

function normaliseBackground(value) {
  const requested = cleanText(value).toLowerCase();

  return ALLOWED_BACKGROUNDS.has(requested)
    ? requested
    : "studio";
}

function describeView(view) {
  switch (view) {
    case "back":
      return "Show the garment or fashion item from the back view.";

    case "front-back":
      return [
        "Show both the front and back views.",
        "Present them clearly side by side as a professional fashion product visualization.",
        "Keep the front and back design consistent with the supplied reference image.",
      ].join(" ");

    case "front":
    default:
      return "Show the garment or fashion item primarily from the front view.";
  }
}

function describeBackground(background) {
  switch (background) {
    case "white":
      return "Use a clean pure-white product photography background.";

    case "neutral":
      return "Use a subtle neutral studio background with no distracting objects.";

    case "transparent-style":
      return [
        "Present the item isolated like a transparent-background product asset.",
        "Do not add scenery or unnecessary props.",
      ].join(" ");

    case "studio":
    default:
      return [
        "Use a premium clean fashion studio background.",
        "Keep the background simple and unobtrusive.",
      ].join(" ");
  }
}

/*=========================================================
Prompt Builder
=========================================================*/

function buildFashionPrompt({
  garmentType = "",
  material = "",
  style = "",
  designNotes = "",
  view = "front",
  background = "studio",
  preserveGraphics = true,
  preserveText = true,
} = {}) {
  const safeGarmentType =
    cleanText(garmentType) || "fashion garment or accessory";

  const safeMaterial =
    cleanText(material);

  const safeStyle =
    cleanText(style);

  const safeNotes =
    limitText(
      designNotes,
      MAX_USER_NOTES_LENGTH,
    );

  const safeView =
    normaliseView(view);

  const safeBackground =
    normaliseBackground(background);

  const instructions = [
    /*
    =====================================================
    Core transformation
    =====================================================
    */

    "Transform the supplied fashion sketch, drawing, flat design, clothing template, or reference image into a highly realistic finished fashion product image.",

    `The intended fashion item is: ${safeGarmentType}.`,

    /*
    =====================================================
    Fidelity requirements
    =====================================================
    */

    "Treat the supplied image as the primary design reference.",

    "Preserve the original silhouette, proportions, overall shape, neckline, sleeve structure, garment length, panel layout, seams, construction details, color blocking, and major design elements as faithfully as possible.",

    "Do not redesign the item into a substantially different garment.",

    "Do not randomly add pockets, zippers, buttons, collars, sleeves, straps, logos, patterns, decorations, or construction details that are not supported by the reference.",

    /*
    =====================================================
    Graphics / artwork
    =====================================================
    */

    preserveGraphics
      ? [
          "Preserve visible graphics, logos, prints, patterns, artwork, embroidery-like details, and their placement as closely as possible.",
          "Keep their scale and location consistent with the reference design.",
        ].join(" ")
      : "",

    preserveText
      ? [
          "If readable text or lettering appears in the supplied design, preserve its wording, approximate typography, orientation, and placement as closely as possible.",
          "Do not invent additional text.",
        ].join(" ")
      : "",

    /*
    =====================================================
    Realism
    =====================================================
    */

    "Convert flat sketch lines and simplified shapes into believable real-world garment construction.",

    "Add realistic fabric thickness, natural folds, stitching, seams, edge finishing, subtle shadows, material texture, and physically believable structure.",

    "The result should look professionally manufactured rather than illustrated, painted, cartoon-like, or obviously AI-generated.",

    /*
    =====================================================
    Optional material
    =====================================================
    */

    safeMaterial
      ? `Render the item using realistic ${safeMaterial} material characteristics while preserving the original design.`
      : "Choose a realistic material treatment appropriate for the supplied fashion design without changing its core appearance.",

    /*
    =====================================================
    Optional style
    =====================================================
    */

    safeStyle
      ? `Visual direction: ${safeStyle}.`
      : "",

    /*
    =====================================================
    View
    =====================================================
    */

    describeView(safeView),

    /*
    =====================================================
    Background
    =====================================================
    */

    describeBackground(safeBackground),

    /*
    =====================================================
    Composition
    =====================================================
    */

    "Keep the entire fashion item clearly visible and centered in the frame.",

    "Avoid cropping important parts of the garment or accessory.",

    "Use professional fashion product photography lighting with realistic shadows and high-quality detail.",

    /*
    =====================================================
    User notes
    =====================================================
    */

    safeNotes
      ? `Additional design instructions from the user: ${safeNotes}`
      : "",

    /*
    =====================================================
    Final constraint
    =====================================================
    */

    "Prioritize faithfulness to the supplied design over creative reinterpretation.",
  ];

  return instructions
    .filter(Boolean)
    .join("\n");
}

/*=========================================================
Exports
=========================================================*/

module.exports = {
  buildFashionPrompt,
};