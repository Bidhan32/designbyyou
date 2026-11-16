const assert = require("node:assert/strict");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const esbuild = require("esbuild");
const dom = new JSDOM("<section></section><section></section>", { url: "https://dby.test" });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const { MemoryRouter } = require("react-router-dom");

async function main() {
  const built = await esbuild.build({
    entryPoints: [path.resolve(__dirname, "../src/pages/Superadmin/AdminFinance.jsx")],
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
    plugins: [{ name: "finance-api", setup(build) {
      build.onResolve({ filter: /api\/axios$/ }, () => ({ path: "api", namespace: "mock" }));
      build.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: "export default globalThis.financeApi" }));
    } }],
  });
  let status = "processing";
  let submissions = 0;
  global.financeApi = {
    async get(url, { params }) {
      assert.equal(url, "/superadmin/finance/manual-payouts");
      return { data: { data: params.status === status ? [{ id: "p1", status, amount: 20, currency: "USD" }] : [] } };
    },
    async post(url, payload) {
      assert.equal(url, "/superadmin/finance/manual-payouts/p1/complete");
      assert.ok(payload.transfer_reference);
      submissions++;
      if (status === "completed") throw { response: { status: 409, data: { message: "Already completed with another reference." } } };
      status = "completed";
      return { data: { status: "success" } };
    },
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", built.outputFiles[0].text)(require, mod, mod.exports);
  const hosts = [...document.querySelectorAll("section")];
  const roots = hosts.map(host => createRoot(host));
  const click = node => act(async () => node.click());
  const button = (host, label) => [...host.querySelectorAll("button")].find(b => b.textContent === label);
  const change = (node, value, type) => act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), "value").set.call(node, value);
    node.dispatchEvent(new window.Event(type, { bubbles: true }));
  });
  for (const [i, root] of roots.entries()) {
    await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: ["/superadmin/finance?tab=payouts"] },
      React.createElement(mod.exports.default))));
    const host = hosts[i];
    await change(host.querySelector("select"), "processing", "change");
    await click(button(host, "Review"));
    await click(button(host, "Record completed transfer"));
    await change(host.querySelector("form input:not([type=checkbox])"), "TEST-REF-" + i, "input");
    await click(host.querySelector("input[type=checkbox]"));
  }
  await click(button(hosts[0], "Confirm"));
  await click(button(hosts[1], "Confirm"));
  assert.equal(submissions, 2);
  assert.match(hosts[1].textContent, /Already completed/);
  assert.equal(button(hosts[1], "Confirm"), undefined);
  await change(hosts[1].querySelector("select"), "completed", "change");
  assert.ok(button(hosts[1], "Review"));
  for (const root of roots) await act(async () => root.unmount());
  console.log("PASS two payout review screens reconcile a stale completion and show the completed record.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
