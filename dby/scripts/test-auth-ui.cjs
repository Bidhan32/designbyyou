const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const esbuild = require("esbuild");
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
for (const key of ["window", "document", "HTMLElement", "HTMLInputElement", "Event", "MouseEvent", "CustomEvent", "sessionStorage", "localStorage"]) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const { MemoryRouter, useLocation } = require("react-router-dom");
const h = React.createElement;
const container = document.getElementById("root");
let root, location, checks = 0;
const calls = [];
globalThis.__authUI = { API: { get: async (...args) => globalThis.__authUI.get(...args), post: async (...args) => { calls.push(args); return globalThis.__authUI.respond(...args); } }, login: (...args) => { globalThis.__authUI.loggedIn = args; } };
function Probe() { location = useLocation(); return null; }
async function component(name) {
  const result = await esbuild.build({ entryPoints: [path.resolve(__dirname, `../src/pages/auth/${name}.jsx`)], bundle: true,
    write: false, platform: "node", format: "cjs", packages: "external", loader: { ".css": "empty" }, define: { "import.meta.env.DEV": "false" },
    plugins: [{ name: "auth-test-services", setup(build) {
      build.onResolve({ filter: /api\/axios$/ }, () => ({ path: "api", namespace: "stub" }));
      build.onResolve({ filter: /AuthContext.helpers.js$/ }, () => ({ path: "auth", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: args.path === "api"
        ? "export default globalThis.__authUI.API;"
        : "export function useAuth(){return {login: globalThis.__authUI.login}}" }));
    } }] });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
  return module.exports.default;
}
async function mount(Component, state = {}, stored = {}) {
  if (root) await act(() => root.unmount());
  sessionStorage.clear(); localStorage.clear(); calls.length = 0; globalThis.__authUI.loggedIn = null;
  globalThis.__authUI.respond = async () => ({ data: { status: "success" } });
  for (const [key, value] of Object.entries(stored)) sessionStorage.setItem(key, value);
  root = createRoot(container);
  await act(() => root.render(h(MemoryRouter, { initialEntries: [{ pathname: "/test", state }] }, h(Component), h(Probe))));
}
async function input(id, value) {
  const node = document.getElementById(id); assert.ok(node, `Missing ${id}`);
  await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function click(node) { assert.ok(node, "Missing button"); await act(async () => { node.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }
async function submit() { await act(async () => { container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
const button = text => [...container.querySelectorAll("button")].find(node => node.textContent === text);
const denied = (status, code, message) => ({ response: { status, data: { code, message } } });
async function check(name, run) { await run(); console.log(`PASS ${name}`); checks++; }

(async () => {
  const pages = {};
  for (const name of ["Login", "Register", "VerifyOTP", "ForgotPassword", "ResetPassword"]) pages[name] = await component(name);
  await check("All auth screens provide one heading and persistent labels", async () => {
    for (const [name, Component] of Object.entries(pages)) {
      await mount(Component);
      assert.equal(container.querySelectorAll("h1").length, 1, name);
      for (const node of container.querySelectorAll("input:not([type=radio]),textarea")) {
        assert.ok(node.id && container.querySelector(`label[for='${node.id}']`), `${name}: unlabeled ${node.name}`);
      }
      assert.equal(container.querySelectorAll("img[src^='https://']").length, 0);
      if (process.env.AUTH_UI_PREVIEW_DIR) {
        const dir = path.resolve(process.env.AUTH_UI_PREVIEW_DIR); fs.mkdirSync(dir, { recursive: true });
        const css = fs.readFileSync(path.resolve(__dirname, "../src/Layouts/AuthLayout.css"), "utf8");
        fs.writeFileSync(path.join(dir, `${name}.html`), `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}button,input,textarea{font:inherit}button{background:none;border:0}a{color:inherit}fieldset{margin:0}${css}</style>${container.innerHTML}`);
      }
    }
  });
  await check("Login validates email, reveals password, and preserves creator redirect", async () => {
    await mount(pages.Login); await input("login-email", "invalid"); await input("login-password", "Password-123"); await submit(); assert.equal(calls.length, 0);
    assert.equal(document.activeElement.getAttribute("role"), "alert");
    await input("login-email", "USER@example.com");
    await click(container.querySelector('[aria-label="Show password"]')); assert.equal(document.getElementById("login-password").type, "text");
    globalThis.__authUI.respond = async () => ({ data: { status: "success", user: { role: "creator" }, token: "test-token" } });
    await submit(); assert.equal(location.pathname, "/creator/showcase"); assert.equal(calls[0][1].email, "user@example.com"); assert.ok(globalThis.__authUI.loggedIn);
  });
  await check("Only unverified login goes to verification; suspended and rate-limited accounts stay on sign-in", async () => {
    for (const [status, code] of [[403, "EMAIL_NOT_VERIFIED"], [403, "ACCOUNT_SUSPENDED"], [429, "LOGIN_RATE_LIMITED"]]) {
      await mount(pages.Login); await input("login-email", "test@example.com"); await input("login-password", "Password-123");
      globalThis.__authUI.respond = async () => { throw denied(status, code, "Test account message"); };
      await submit(); assert.equal(location.pathname, code === "EMAIL_NOT_VERIFIED" ? "/verify-otp" : "/test");
      if (code !== "EMAIL_NOT_VERIFIED") assert.equal(container.querySelector('[role="alert"]').textContent, "Test account message");
    }
  });
  await check("Unverified login requests a code automatically; sign-in has no verification panel", async () => {
    await mount(pages.Login); assert.equal(container.querySelector("details"), null);
    await input("login-email", "test@example.com"); await input("login-password", "Password-123");
    globalThis.__authUI.respond = async route => {
      if (route === "/auth/login") throw { response: { status: 403, data: { code: "EMAIL_NOT_VERIFIED", login_challenge: "limited-challenge" } } };
      return { data: { status: "success" } };
    };
    await submit(); assert.deepEqual(calls.map(c => c[0]), ["/auth/login", "/auth/resend-otp"]);
    assert.equal(location.pathname, "/verify-otp"); assert.equal(location.state.codeRequested, true);
    assert.equal(sessionStorage.getItem("pending_verification_login").includes("Password-123"), false);
  });
  await check("Valid verification finishes login and retries profile loading without reusing the code", async () => {
    await mount(pages.VerifyOTP, { email: "test@example.com" }, { pending_verification_login: JSON.stringify({ email: "test@example.com", token: "limited-challenge" }) });
    globalThis.__authUI.respond = async () => ({ data: { status: "success", token: "access-token" } });
    globalThis.__authUI.get = async () => { throw { response: { status: 503 } }; };
    await input("verify-code", "123456"); await submit(); assert.equal(globalThis.__authUI.loggedIn, null);
    globalThis.__authUI.get = async (route, options) => { assert.equal(route, "/auth/me"); assert.equal(options.headers.Authorization, "Bearer access-token"); return { data: { status: "success", data: { id: "test-user", role: "creator" } } }; };
    await submit(); assert.equal(calls.length, 1); assert.equal(calls[0][1].login_challenge, "limited-challenge");
    assert.equal(location.pathname, "/creator/showcase"); assert.equal(globalThis.__authUI.loggedIn[1], "access-token");
    assert.equal(sessionStorage.getItem("pending_verification_login"), null);
  });
  await check("Registration preserves roles, validates password bytes, and recovers duplicate email", async () => {
    await mount(pages.Register); await input("register-name", "Test User"); await input("register-email", "test@example.com");
    await input("register-password", "é".repeat(37)); await input("register-confirm", "é".repeat(37)); await submit(); assert.equal(calls.length, 0);
    await input("register-password", "Password-123"); await input("register-confirm", "Password-123");
    await click(container.querySelector('input[value="designer"]')); assert.ok(container.textContent.includes("needs approval"));
    globalThis.__authUI.respond = async () => { throw denied(409, "EMAIL_ALREADY_EXISTS", "Already registered"); };
    await submit(); assert.equal(calls[0][1].get("role"), "designer");
    await click(button("Verify email")); assert.equal(location.pathname, "/verify-otp"); assert.equal(location.state.email, "test@example.com");
  });
  await check("Verification accepts a full code, rejects wrong codes, and keeps success visible", async () => {
    await mount(pages.VerifyOTP, { email: "test@example.com" }); await input("verify-code", "123456");
    globalThis.__authUI.respond = async () => { throw denied(400, "", "Invalid or expired code"); };
    await submit(); assert.equal(document.getElementById("verify-code").value, "123456"); assert.ok(container.querySelector('[role="alert"]'));
    globalThis.__authUI.respond = async () => ({ data: { status: "success" } }); await submit();
    assert.ok(container.textContent.includes("Email verified")); assert.ok(container.querySelector('a[href="/login"]')); assert.equal(location.pathname, "/test");
  });
  await check("Resending verification clears the old code and starts a cooldown", async () => {
    await mount(pages.VerifyOTP, { email: "test@example.com" }); await input("verify-code", "123456"); await click(button("Resend code"));
    assert.equal(document.getElementById("verify-code").value, ""); assert.ok(button("Resend in 30s").disabled);
  });
  await check("Pasted codes accept spaces and corrected emails survive refresh state", async () => {
    for (const [name, emailId, codeId, key] of [
      ["VerifyOTP", "verify-email", "verify-code", "pending_verification_email"],
      ["ResetPassword", "reset-email", "reset-code", "pending_password_reset_email"],
    ]) {
      await mount(pages[name], { email: "old@example.com" });
      await input(emailId, "correct@example.com");
      assert.equal(location.state.email, "correct@example.com");
      assert.equal(sessionStorage.getItem(key), "correct@example.com");
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: { getData: () => "123 456" } });
      await act(() => document.getElementById(codeId).dispatchEvent(event));
      assert.equal(document.getElementById(codeId).value, "123456");
      await mount(pages[name], location.state);
      assert.equal(document.getElementById(emailId).value, "correct@example.com");
    }
  });
  await check("Forgot-password carries the email forward without disclosing account existence", async () => {
    await mount(pages.ForgotPassword, { email: "test@example.com" }); await submit();
    assert.equal(location.pathname, "/reset-password"); assert.equal(location.state.email, "test@example.com");
    assert.equal(sessionStorage.getItem("pending_password_reset_email"), "test@example.com");
  });
  await check("Password reset validates confirmation, clears stale session, and provides explicit sign-in", async () => {
    await mount(pages.ResetPassword, { email: "test@example.com" }); await input("reset-code", "123456"); await input("reset-password", "New-Password-123"); await input("reset-confirm", "different");
    await submit(); assert.equal(calls.length, 0);
    await input("reset-confirm", "New-Password-123"); localStorage.setItem("token", "old-session"); let invalidated = false;
    const listener = () => { invalidated = true; }; window.addEventListener("auth:session-invalidated", listener);
    await submit(); assert.equal(localStorage.getItem("token"), null); assert.ok(invalidated); assert.ok(container.textContent.includes("Password updated"));
    assert.equal(location.pathname, "/test"); window.removeEventListener("auth:session-invalidated", listener);
  });
  console.log(`Authentication UI: ${checks} checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (root) await act(() => root.unmount()); dom.window.close(); });
