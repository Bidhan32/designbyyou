import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
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

test("fashion drawing tools commit editable objects and preserve garment artwork on reload", async () => {
  const { build } = await import("esbuild");
  const { createRequire } = await import("node:module");
  const names = ["Pencil", "Pen", "Brush", "Line", "Shape", "Fill", "Text", "Clothing", "Image", "Pattern", "PatternMask", "Eraser"];
  const entries = names.map(name => `export {default as ${name}} from "./tools/${name}Tool";`);
  entries.push('export {createToolManager} from "./tools/ToolManager";', 'export {useFashionEditorStore as store} from "./useFashionEditorStore";');
  const bundle = await build({
    stdin: { contents: entries.join("\n"), resolveDir: fileURLToPath(new URL("../src/pages/sketches/", import.meta.url)) },
    bundle: true, platform: "node", format: "cjs", write: false,
  });
  const mod = { exports: {} };
  new Function("module", "require", bundle.outputFiles[0].text)(mod, createRequire(import.meta.url));
  const { store, createToolManager } = mod.exports;
  let point;
  const stage = { getPointerPosition: () => point, getPointersPositions: () => [point], batchDraw() {} };
  const manager = createToolManager({
    getContext: () => ({ store, state: store.getState(), actions: store.getState(), stage, toDocumentPoint: p => p }),
    onError: error => { throw error; },
  });
  async function draw(name, targetId, gesture = [["handlePointerDown",50,40], ["handlePointerMove",80,60], ["handlePointerUp",100,100]]) {
    const tool = mod.exports[name];
    if (!manager.hasTool(tool.id)) manager.register(tool);
    store.getState().setActiveTool(tool.id);
    manager.activate(tool.id);
    const target = { getStage: () => stage, getAttr: key => key === "editorObjectId" ? targetId : undefined };
    for (const [method, x, y] of gesture) {
      point = { x, y };
      await manager[method]({ evt: { clientX:x, clientY:y, pointerId:1, button:0 }, target });
    }
  }
  const asset = { fileName: "garment.png", naturalWidth: 100, naturalHeight: 150, dataUrl: "data:image/png;base64,AAAA" };
  let shapeId;
  for (const name of ["Pencil", "Brush", "Line", "Shape", "Text", "Clothing", "Image", "Pattern"]) {
    if (mod.exports[name].queueAsset) await mod.exports[name].queueAsset(asset);
    const before = new Set(Object.keys(store.getState().objects));
    await draw(name);
    const created = Object.keys(store.getState().objects).filter(id => !before.has(id));
    assert.equal(created.length, 1, name);
    if (name === "Shape") shapeId = created[0];
  }
  store.getState().setFillSettings({ color: "#337799", opacity: 0.4 });
  await draw("Fill", shapeId);
  assert.equal(store.getState().objects[shapeId].fill, "#337799");
  assert.equal(store.getState().objects[shapeId].fillOpacity, 0.4);
  await mod.exports.PatternMask.queueAsset(asset);
  await draw("PatternMask", shapeId);
  assert.ok(JSON.stringify(store.getState().objects[shapeId]).includes(asset.dataUrl));
  const tap = (x, y) => draw("Pen", null, [["handlePointerDown", x, y], ["handlePointerUp", x, y]]);
  const lastObject = () => store.getState().objects[store.getState().selectedObjectIds[0]];
  await draw("Pen");
  assert.equal(lastObject().penNodes.length, 3);
  store.getState().setShapeSettings({ penMode: "curvature" });
  await tap(200, 200);
  await tap(240, 160);
  await tap(280, 200);
  manager.handleKeyDown({ key: "Enter" });
  const curve = lastObject();
  assert.equal(curve.penNodes.length, 3);
  assert.ok(curve.points.length > 3);
  store.getState().updateObject(curve.id, { x: 30, y: 10 });
  store.getState().setShapeSettings({ penMode: "add" });
  const middle = curve.points[Math.floor(curve.points.length / 4)];
  await tap(middle.x + 30, middle.y + 10);
  assert.equal(lastObject().penNodes.length, 4);
  const inserted = lastObject().penNodes[1];
  const x = inserted.x + 30, y = inserted.y + 10;
  await draw("Pen", null, [["handlePointerDown", x, y], ["handlePointerMove", x, y+20], ["handlePointerUp", x, y+20]]);
  assert.ok(Math.abs(lastObject().penNodes[1].y - inserted.y - 20) < 0.01);
  store.getState().setShapeSettings({ penMode: "delete" });
  await tap(x, y+20);
  assert.equal(lastObject().penNodes.length, 3);
  store.getState().undo();
  assert.equal(lastObject().penNodes.length, 4);
  store.getState().setShapeSettings({ snapLineAngle: true, drawFromCenter: true });
  await draw("Line", null, [["handlePointerDown",200,200], ["handlePointerUp",300,204]]);
  const line = Object.values(store.getState().objects).at(-1);
  assert.equal(line.objectKind, "line");
  assert.equal(line.points[0].y, line.points[1].y);
  await draw("Shape", null, [["handlePointerDown",200,200], ["handlePointerUp",230,220]]);
  const centeredShape = Object.values(store.getState().objects).at(-1);
  assert.equal(centeredShape.width, 60);
  assert.equal(centeredShape.height, 40);
  const saved = JSON.parse(JSON.stringify(store.getState().getProjectData()));
  await draw("Eraser");
  assert.notDeepEqual(store.getState().objects, saved.objects);
  store.getState().undo();
  assert.deepEqual(JSON.parse(JSON.stringify(store.getState().objects)), saved.objects);
  store.getState().loadProject(saved);
  assert.deepEqual(store.getState().objects, saved.objects);
});
