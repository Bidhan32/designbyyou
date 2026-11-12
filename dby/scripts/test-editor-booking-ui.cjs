const assert = require("node:assert/strict");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const esbuild = require("esbuild");
const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/creator/fashion-editor/123" });
for (const key of ["window", "document", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "Event", "MouseEvent", "KeyboardEvent"]) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react"), { act } = React, { createRoot } = require("react-dom/client"), { MemoryRouter } = require("react-router-dom");
const h = React.createElement, host = document.getElementById("root");
let root, closes = 0, saves = 0, posts = [], confirmations = 0, verificationAttempts = 0;
globalThis.__booking = { API: {
  get: async () => ({ data: { data: [{ id: "designer-1", full_name: "Test designer" }] } }),
  post: async (url, body) => {
    posts.push({ url, body });
    if (url.endsWith("/create")) {
      if (posts.filter(p => p.url.endsWith("/create")).length === 1) throw new Error("Temporary network failure");
      return { data: { booking: { id: "booking-1" }, clientSecret: "test_secret", payment: { baseAmount: 100, connectionFee: 5, totalCharged: 105 } } };
    }
    if (++verificationAttempts === 1) throw new Error("Temporary verification failure");
    return { data: { status: "success" } };
  },
} };
window.Stripe = () => ({
  elements: () => ({ create: () => {
    let ready;
    return { on: (name, callback) => { if (name === "ready") ready = callback; }, mount: () => ready(), destroy() {} };
  } }),
  confirmPayment: async () => { confirmations++; return { paymentIntent: { status: "succeeded" } }; },
});
async function load(relative) {
  const result = await esbuild.build({ entryPoints: [path.resolve(__dirname, relative)], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
    define: { "import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY": '"pk_test_mock"', "import.meta.env.VITE_STRIPE_PUBLIC_KEY": '""', "import.meta.env.DEV": "true" },
    plugins: [{ name: "api-stub", setup(build) {
      build.onResolve({ filter: /api\/axios$/ }, () => ({ path: "api", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default globalThis.__booking.API;" }));
    } }],
  });
  const module = { exports: {} }; new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports); return module.exports.default;
}
async function input(id, value) {
  const node = document.getElementById(id);
  const prototype = node.tagName === "SELECT" ? HTMLSelectElement.prototype : node.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(() => { Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, value); node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
}
async function submit() { await act(async () => host.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
async function click(text) { const node = [...host.querySelectorAll("button")].find(b => b.textContent === text); assert.ok(node, text); await act(async () => node.click()); }
(async () => {
  const Modal = await load("../src/pages/sketches/editor/FashionEditorBookingModal.jsx");
  root = createRoot(host);
  await act(async () => root.render(h(MemoryRouter, {}, h(Modal, { open: true, onClose: () => closes++, previewDataUrl: "data:image/png;base64,AAAA", onSaveProject: async (_, options) => { saves++; assert.equal(options.bookingPreview, "data:image/png;base64,AAAA"); return { id: "123", version: 7 }; } }))));
  await submit(); assert.equal(saves, 0); assert.match(host.textContent, /Select an eligible designer/);
  await input("booking-designer", "designer-1"); await input("booking-brief", "Please make a prototype from my private design."); await input("booking-price", "100");
  await input("booking-deadline", new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  await submit(); assert.equal(saves, 1); assert.equal(posts.length, 1);
  await submit(); assert.equal(saves, 1); assert.deepEqual(posts[0], posts[1]); assert.equal(posts[0].body.editor_project_version, 7);
  console.log("PASS Validation, current design save with preview, and identical booking retry");
  window.confirm = () => false;
  await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(closes, 0);
  console.log("PASS Escape respects the pending-payment close warning");
  await click("Pay $105.00"); assert.equal(confirmations, 1); assert.equal(verificationAttempts, 1);
  await click("Retry payment verification"); assert.equal(confirmations, 1); assert.equal(verificationAttempts, 2);
  assert.equal(host.querySelector("a").getAttribute("href"), "/creator/bookings/booking-1");
  console.log("PASS Verification retries do not charge again; success links to booking details");
  await act(() => root.unmount());
  const Attachment = await load("../src/components/BookingDesignAttachment.jsx");
  globalThis.__booking.API.get = async () => ({ data: { data: { design_title: "Saved design", source_project_version: 7, snapshot_data: { bookingPreview: "data:image/png;base64,AAAA" } } } });
  root = createRoot(host);
  await act(async () => root.render(h(Attachment, { bookingId: "booking-1" })));
  assert.ok(host.querySelector("img")); assert.match(host.textContent, /Version 7/); assert.match(host.textContent, /Download design file/);
  globalThis.__booking.API.get = async () => { throw { response: { status: 404 } }; };
  await act(async () => root.render(h(Attachment, { bookingId: "legacy-booking" })));
  assert.equal(host.textContent, "");
  console.log("PASS Private attachment preview and clean legacy-booking fallback");
  await act(() => root.unmount()); dom.window.close();
})().catch(error => { console.error(error); process.exitCode = 1; dom.window.close(); });
