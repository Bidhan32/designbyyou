/*
 * DesignByYou | GarmentArtworkCleanup.js
 * Phase 3.5 — Pure, non-destructive region artwork cleanup helpers.
 * Only garment artwork is changed; never modify clothingColours.
 */

export const GARMENT_ARTWORK_CLEANUP_OPERATIONS = Object.freeze([
  "remove-layer", "clear-logos", "clear-text", "clear-patterns", "clear-all", "reset-garment",
]);

const hasLayer = (entry) => Boolean(entry && typeof entry === "object" && typeof entry.source === "string" && entry.source);

/** For interface counts: prefer an explicitly saved layered stack over legacy flat artwork. */
export function summarizeGarmentArtwork(stack, legacyEntry = null) {
  const structured = Boolean(stack && typeof stack === "object" && !Array.isArray(stack) &&
    (Object.prototype.hasOwnProperty.call(stack, "pattern") || Array.isArray(stack.logos) || Array.isArray(stack.texts)));
  const raw = structured ? stack : null;
  const pattern = hasLayer(raw?.pattern) ? raw.pattern : (!structured && hasLayer(legacyEntry) && legacyEntry.type === "pattern")
    ? { ...legacyEntry, id: "legacy-pattern" } : null;
  const logos = (raw?.logos || []).filter(hasLayer);
  const texts = (raw?.texts || []).filter(hasLayer);
  if (!structured && hasLayer(legacyEntry) && legacyEntry.type !== "pattern") {
    logos.push({ ...legacyEntry, id: "legacy-logo" });
  }
  const layers = [
    ...(pattern ? [{ id: pattern.id, kind: "pattern", label: "Fabric pattern" }] : []),
    ...logos.map((item, i) => ({ id: item.id, kind: "logo", label: `Logo ${i + 1}` })),
    ...texts.map((item, i) => ({ id: item.id, kind: "text", label: item.text ? `Text: ${item.text}` : `Text ${i + 1}` })),
  ];
  return { pattern: Number(Boolean(pattern)), logos: logos.length, texts: texts.length, total: layers.length, layers };
}

/** A pure immutable transformation of a normalized garment region stack. */
export function cleanGarmentRegionStack(stack, operation, layerId = "") {
  if (!GARMENT_ARTWORK_CLEANUP_OPERATIONS.includes(operation)) {
    throw new Error("Unsupported garment artwork cleanup operation.");
  }
  const current = {
    pattern: stack?.pattern || null,
    logos: Array.isArray(stack?.logos) ? stack.logos : [],
    texts: Array.isArray(stack?.texts) ? stack.texts : [],
  };
  let pattern = current.pattern;
  let logos = current.logos;
  let texts = current.texts;
  if (operation === "remove-layer") {
    if (typeof layerId !== "string" || !layerId.trim()) throw new Error("Choose an artwork layer first.");
    if (pattern?.id === layerId) pattern = null;
    logos = logos.filter((item) => item.id !== layerId);
    texts = texts.filter((item) => item.id !== layerId);
  } else if (operation === "clear-patterns") {
    pattern = null;
  } else if (operation === "clear-logos") {
    logos = [];
  } else if (operation === "clear-text") {
    texts = [];
  } else if (operation === "clear-all" || operation === "reset-garment") {
    pattern = null;
    logos = [];
    texts = [];
  }
  const before = Number(Boolean(current.pattern)) + current.logos.length + current.texts.length;
  const after = Number(Boolean(pattern)) + logos.length + texts.length;
  return {
    stack: { ...stack, pattern, logos, texts },
    removed: before - after,
    changed: before > after,
  };
}
