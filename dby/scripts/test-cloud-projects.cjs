const assert = require("node:assert/strict");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const esbuild = require("esbuild");
const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/" });
for (const key of ["window", "document", "HTMLElement", "HTMLInputElement", "Event", "MouseEvent"]) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react"), { act } = React, { createRoot } = require("react-dom/client"), { MemoryRouter } = require("react-router-dom");
const h = React.createElement, host = document.getElementById("root");
let root;
async function load(relative) {
  const result = await esbuild.build({ entryPoints: [path.resolve(__dirname, relative)], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
    plugins: [{ name: "api-stub", setup(build) {
      build.onResolve({ filter: /api\/axios$/ }, () => ({ path: "api", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default globalThis.__projectsAPI;" }));
    } }],
  });
  const module = { exports: {} }; new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports); return module.exports;
}
(async () => {
  const { default: autosave } = await load("../src/pages/sketches/editor/useCloudAutosave.js");
  const timers = new Map(); let timerId = 0, saves = 0;
  window.setTimeout = (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; };
  window.clearTimeout = id => timers.delete(id);
  function Probe(props) { autosave(props); return null; }
  root = createRoot(host);
  const defaults = { dirty: false, revision: 0, saving: false, blocked: false, failed: false, onSave: () => saves++ };
  const render = async props => act(() => root.render(h(Probe, { ...defaults, ...props })));
  await render({}); assert.equal(timers.size, 0);
  await render({ dirty: true, revision: 1 }); assert.equal([...timers.values()][0].delay, 1500);
  await render({ dirty: true, revision: 2 }); assert.equal(timers.size, 1);
  const scheduled = [...timers.values()][0]; timers.clear(); await act(() => scheduled.callback()); assert.equal(saves, 1);
  await render({ dirty: true, revision: 3, saving: true }); assert.equal(timers.size, 0);
  await render({ dirty: true, revision: 4, blocked: true }); assert.equal(timers.size, 0);
  await render({ dirty: true, revision: 4, failed: true }); assert.equal([...timers.values()][0].delay, 15000);
  await render({ dirty: false, revision: 4 }); assert.equal(timers.size, 0);
  console.log("PASS Autosave debounce, in-flight exclusion, conflict pause and retry delay");
  await act(() => root.unmount());
  const storeExports = await load("../src/pages/sketches/useFashionEditorStore.js");
  const store = storeExports.default || storeExports.useFashionEditorStore;
  store.getState().newDocument(); store.getState().setDocumentName("First change");
  const savedRevision = store.getState().revision;
  store.getState().setDocumentName("Change while saving"); store.getState().markSaved(savedRevision);
  assert.equal(store.getState().persistence.dirty, true);
  store.getState().markSaved(store.getState().revision); assert.equal(store.getState().persistence.dirty, false);
  console.log("PASS Edits made during a save remain dirty until their own save succeeds");
  globalThis.__projectsAPI = { get: async () => ({ data: { data: [{ id: "123", title: "Summer shirt", updated_at: "2026-11-12T12:00:00Z" }] } }) };
  const { default: Projects } = await load("../src/pages/Creator/CreatorProjects.jsx");
  root = createRoot(host);
  await act(async () => root.render(h(MemoryRouter, {}, h(Projects))));
  assert.ok(host.querySelector('a[href="/creator/fashion-editor/123"]'));
  const input = host.querySelector("input");
  await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "missing"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  assert.match(host.textContent, /No matching projects/);
  console.log("PASS Saved-project list, reopen link and search empty state");
  await act(() => root.unmount()); dom.window.close();
})().catch(error => { console.error(error); process.exitCode = 1; dom.window.close(); });
