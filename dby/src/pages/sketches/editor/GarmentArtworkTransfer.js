/*
 * DesignByYou 3D Studio V3 — Phase 3.2
 * Pure, non-destructive clipboard + transfer operations for saved garment artwork.
 * The editor performs one atomic updateSelectedImage after preparing all targets.
 */
export const GARMENT_ARTWORK_LAYER_LIMIT = 24;

const clamp = (value, low, high) => Math.min(high, Math.max(low, Number(value) || 0));
const emptyStack = () => ({ pattern: null, logos: [], texts: [] });
const makeId = () => globalThis.crypto?.randomUUID?.() ||
  `art-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const cloneEntry = (entry) => entry ? { ...entry } : null;

/** Find a left/right counterpart only when that exact region exists. */
export function getGarmentMirrorPartner(regionId, regionIds) {
  const id = String(regionId || "");
  const candidate = id.includes("Left") ? id.replace("Left", "Right")
    : id.includes("Right") ? id.replace("Right", "Left") : "";
  return candidate && regionIds?.includes(candidate) ? candidate : null;
}

/** Snapshot the selected layer or entire region. The snapshot is frozen in time. */
export function createGarmentArtworkClipboard({
  templateId, garmentObjectId, sourceRegionId, stack, layerId = "all",
}) {
  if (!templateId || !garmentObjectId || !sourceRegionId || !stack) return null;
  const source = {
    pattern: cloneEntry(stack.pattern),
    logos: (stack.logos || []).map(cloneEntry),
    texts: (stack.texts || []).map(cloneEntry),
  };
  let selection = source;
  let label = "All region artwork";
  if (layerId !== "all") {
    selection = emptyStack();
    if (source.pattern?.id === layerId) {
      selection.pattern = source.pattern;
      label = "Fabric pattern";
    } else {
      const logo = source.logos.find((item) => item.id === layerId);
      const text = source.texts.find((item) => item.id === layerId);
      if (logo) { selection.logos = [logo]; label = "Logo"; }
      else if (text) { selection.texts = [text]; label = "Text"; }
      else return null;
    }
  }
  if (!selection.pattern && !selection.logos.length && !selection.texts.length) return null;
  return {
    templateId, garmentObjectId, sourceRegionId,
    scope: layerId === "all" ? "region" : "layer",
    label, stack: selection,
  };
}

/**
 * Reproject center-relative offsets to the destination artwork box. "mirrorX"
 * mirrors POSITION and angle, NOT the pixels in logos or readable text.
 * Each copied layer gets a fresh ID, so subsequent edits are independent.
 */
export function applyGarmentArtworkTransfer({
  clipboard, targetStack, sourceBox, targetBox, operation = "paste", mirrorX = false,
}) {
  if (!clipboard?.stack || !sourceBox || !targetBox) throw new Error("Invalid artwork transfer.");
  if (operation !== "paste" && operation !== "sync") throw new Error("Invalid transfer action.");
  if (operation === "sync" && clipboard.scope !== "region") {
    throw new Error("Copy the full source region before synchronizing artwork.");
  }
  const source = clipboard.stack;
  const target = targetStack || emptyStack();
  const sourceW = Math.max(1, Number(sourceBox.width) || 1);
  const sourceH = Math.max(1, Number(sourceBox.height) || 1);
  const targetW = Math.max(1, Number(targetBox.width) || 1);
  const targetH = Math.max(1, Number(targetBox.height) || 1);
  const project = (item) => item ? {
    ...item,
    id: makeId(),
    offsetX: clamp((Number(item.offsetX) || 0) * targetW / sourceW * (mirrorX ? -1 : 1), -2000, 2000),
    offsetY: clamp((Number(item.offsetY) || 0) * targetH / sourceH, -2000, 2000),
    rotation: clamp((Number(item.rotation) || 0) * (mirrorX ? -1 : 1), -3600, 3600),
  } : null;
  const copied = {
    pattern: project(source.pattern),
    logos: (source.logos || []).map(project),
    texts: (source.texts || []).map(project),
  };
  const next = operation === "sync" ? copied : {
    pattern: copied.pattern || target.pattern || null,
    logos: [...(target.logos || []), ...copied.logos],
    texts: [...(target.texts || []), ...copied.texts],
  };
  if (next.logos.length > GARMENT_ARTWORK_LAYER_LIMIT ||
      next.texts.length > GARMENT_ARTWORK_LAYER_LIMIT) {
    throw new Error(`One target would exceed the ${GARMENT_ARTWORK_LAYER_LIMIT}-layer limit.`);
  }
  return next;
}
