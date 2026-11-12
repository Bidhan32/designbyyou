import test from "node:test";
import assert from "node:assert/strict";
import { screenPointToDocumentPoint } from "../src/pages/sketches/editor/EditorCanvas.helpers.js";
import { projectedUvToArtworkOffset } from "../src/pages/sketches/editor/Garment3DViewer.helpers.js";
import { findKonvaNodeById, readNodeTransform } from "../src/pages/sketches/editor/SelectionTransformer.helpers.js";
import { calculateTextOverlayLayout } from "../src/pages/sketches/editor/TextEditOverlay.helpers.js";
import { COMMAND_TYPES, canMergeCommands } from "../src/pages/sketches/history/Commands.js";
import { IMAGE_RESOURCE_CACHE, clearImageObjectCache } from "../src/pages/sketches/objects/ImageObject.helpers.js";

test("drawing coordinates stay correct after pan and zoom", () => {
  assert.deepEqual(screenPointToDocumentPoint({ x: 300, y: 220 }, { x: 100, y: 20, zoom: 2 }), { x: 100, y: 100 });
  assert.equal(screenPointToDocumentPoint({ x: NaN, y: 0 }, {}), null);
});

test("3D artwork placement retains SVG axis direction and bounds", () => {
  const box = { width: 200, height: 100 };
  assert.deepEqual(projectedUvToArtworkOffset({ x: 0.5, y: 0.5 }, box), { offsetX: 0, offsetY: 0 });
  assert.deepEqual(projectedUvToArtworkOffset({ x: 2, y: -1 }, box), { offsetX: 100, offsetY: 50 });
  assert.equal(projectedUvToArtworkOffset({ x: Infinity, y: 0 }, box), null);
});

test("selection lookup and transforms preserve mirrored artwork", () => {
  const node = { id: () => "logo", x: () => 15.123456, y: () => -3, rotation: () => 450,
    scaleX: () => -2, scaleY: () => 0 };
  assert.equal(findKonvaNodeById({ getChildren: () => [node] }, "logo"), node);
  const transform = readNodeTransform(node);
  assert.equal(transform.x, 15.1235);
  assert.equal(transform.rotation, 90);
  assert.equal(transform.scaleX, -2);
  assert.equal(transform.scaleY, 0.0001);
});

test("HTML text overlay follows canvas CSS scaling", () => {
  const layout = calculateTextOverlayLayout({
    stage: { width: () => 1000, height: () => 800 },
    node: { getAbsoluteTransform: () => ({ getMatrix: () => [2, 0, 0, 2, 100, 80] }) },
    container: { getBoundingClientRect: () => ({ left: 20, top: 40, width: 500, height: 400 }) },
    width: 240, height: 64,
  });
  assert.deepEqual(layout, { left: 20, top: 40, width: 240, height: 64, matrix: [1, 0, 0, 1, 50, 40] });
});

for (const type of [COMMAND_TYPES.UPDATE_OBJECTS, COMMAND_TYPES.MOVE_OBJECTS, COMMAND_TYPES.TRANSFORM_OBJECTS]) {
  test(`${type} only merges edits to the same objects`, () => {
    const first = { type, mergeable: true, payload: { objectIds: ["shirt", "logo"] } };
    assert.equal(canMergeCommands(first, { ...first, payload: { objectIds: ["logo", "shirt"] } }), true);
    assert.equal(canMergeCommands(first, { ...first, payload: { objectIds: ["other"] } }), false);
    assert.equal(canMergeCommands({ ...first, transactionId: "one" }, { ...first, transactionId: "two" }), false);
  });
}

test("viewport history retains intentional command grouping", () => {
  for (const type of [COMMAND_TYPES.SET_VIEWPORT, COMMAND_TYPES.SET_ZOOM, COMMAND_TYPES.PAN_VIEWPORT]) {
    const command = { type, mergeable: true, payload: {} };
    assert.equal(canMergeCommands(command, command), true);
    assert.equal(canMergeCommands(command, { ...command, mergeable: false }), false);
  }
});

test("image cache invalidation shares the renderer cache and preserves other sources", () => {
  IMAGE_RESOURCE_CACHE.set("first", { loaded: true });
  IMAGE_RESOURCE_CACHE.set("second", { loaded: true });
  clearImageObjectCache("first");
  assert.equal(IMAGE_RESOURCE_CACHE.has("first"), false);
  assert.equal(IMAGE_RESOURCE_CACHE.has("second"), true);
  clearImageObjectCache();
  assert.equal(IMAGE_RESOURCE_CACHE.size, 0);
});
