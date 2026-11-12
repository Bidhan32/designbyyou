"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { createRequire } = require("node:module");
const assert = require("node:assert/strict");
const Stripe = require("stripe");
const jwt = require("jsonwebtoken");
const { isolatedServer, assertTestKey } = require("./support/isolated-app.cjs");
const { sandboxDatabase } = require("./support/sandbox-database.cjs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const run = crypto.randomUUID();
const reportPath = path.resolve(__dirname, "../stripe-browser-report.json");
const report = { run, started_at: new Date().toISOString(), result: "not_started",
  scope: "Manual browser session; observations do not certify UI or 3DS completion", cleanup: [] };
const intentIds = new Set();
let stripe, database, backend, vite, timeout, cacheDir;
let stop;
const finished = new Promise((resolve) => { stop = resolve; });
let stopping = false;
function requestStop() { stopping = true; stop(); }
process.once("SIGINT", requestStop); process.once("SIGTERM", requestStop);
function checkStopped() { if (stopping) throw new Error("Session interrupted during setup."); }
function safeError(error) {
  if (error.type?.startsWith("Stripe")) return `${error.type}${error.code ? ` (${error.code})` : ""}`;
  if (error.code) return `Operation failed (${error.code})`;
  return String(error.message || "Session failed").replace(/(?:sk|rk|pk)_(?:test|live)_\w+|whsec_\w+/g, "[redacted]");
}
async function main() {
  assertTestKey(process.env.STRIPE_SECRET_KEY);
  const frontendRoot = path.resolve(__dirname, "../../dby");
  const frontendRequire = createRequire(path.join(frontendRoot, "package.json"));
  const { createServer, loadEnv } = await import(pathToFileURL(frontendRequire.resolve("vite")).href);
  const frontendEnv = loadEnv("development", frontendRoot, "VITE_");
  const publishable = String(frontendEnv.VITE_STRIPE_PUBLISHABLE_KEY || frontendEnv.VITE_STRIPE_PUBLIC_KEY || "").trim();
  if (!/^pk_test_[A-Za-z0-9]+$/.test(publishable)) throw new Error("Configure a test VITE_STRIPE_PUBLISHABLE_KEY in dby/.env before starting this session.");
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 1 });
  assert.equal((await stripe.balance.retrieve()).livemode, false);
  console.log("PASS Stripe test secret and frontend test publishable key guards");
  // A test prefix proves mode, not account/sandbox ownership. Verify the exact
  // browser key can read an intent created by the backend before opening any UI.
  const probe = await stripe.paymentIntents.create({ amount: 100, currency: "usd", payment_method_types: ["card"],
    metadata: { transaction_purpose: "sandbox_key_pair_check", dby_test_run: run } });
  intentIds.add(probe.id);
  assert.equal(probe.livemode, false);
  const publicClient = new Stripe(publishable, { timeout: 10000, maxNetworkRetries: 1 });
  try {
    const visible = await publicClient.paymentIntents.retrieve(probe.id, { client_secret: probe.client_secret });
    assert.equal(visible.id, probe.id);
  } catch (error) {
    if (error.statusCode === 404 || error.code === "resource_missing") {
      throw new Error("Frontend Stripe publishable key cannot access the backend's test PaymentIntent. Copy the test publishable key from the SAME Stripe account and sandbox as server/.env STRIPE_SECRET_KEY into dby/.env VITE_STRIPE_PUBLISHABLE_KEY, then restart this command. Do not share secret keys.");
    }
    throw error;
  }
  await stripe.paymentIntents.cancel(probe.id);
  console.log("PASS Frontend publishable key can access backend test PaymentIntents (same account/sandbox)");
  checkStopped();
  database = await sandboxDatabase();
  checkStopped();
  const creator = crypto.randomUUID(), designer = crypto.randomUUID();
  for (const [id, role] of [[creator, "creator"], [designer, "designer"]]) {
    await database.pool.query(`INSERT INTO users (id,role,full_name,email,password_hash,is_email_verified,approval_status,token_version)
      VALUES ($1,$2,$3,$4,$5,true,'approved',0)`, [id, role, `Browser Test ${role}`, `${role}.${run}@example.invalid`, "isolated-no-password-login"]);
  }
  await database.pool.query("INSERT INTO designer_profiles (user_id,portfolio_url,tier,total_completed_bookings,commission_rate) VALUES ($1,$2,'bronze',0,10)", [designer, "https://example.invalid/portfolio"]);
  const createIntent = stripe.paymentIntents.create.bind(stripe.paymentIntents);
  stripe.paymentIntents.create = async (...args) => {
    if (stopping) throw new Error("Browser session is closing.");
    const intent = await createIntent(...args); assert.equal(intent.livemode, false); intentIds.add(intent.id); return intent;
  };
  process.env.NODE_ENV = "test";
  const authSecret = crypto.randomBytes(48).toString("hex");
  process.env.JWT_SECRET = authSecret;
  // This stage tests browser reconciliation; no CLI listener or production secret.
  process.env.STRIPE_WEBHOOK_SECRET = `whsec_${crypto.randomBytes(24).toString("hex")}`;
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const { app } = isolatedServer({ db: database.pool, stripe, secretKey: process.env.STRIPE_SECRET_KEY }).load("index.js");
  backend = await new Promise((resolve, reject) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); server.once("error", reject); });
  const api = `http://127.0.0.1:${backend.address().port}/api/v1`;
  const token = jwt.sign({ id: creator, tokenVersion: 0 }, authSecret, { algorithm: "HS256", expiresIn: "1h" });
  const preflight = await fetch(`${api}/auth/me`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  assert.equal(preflight.status, 200, "Synthetic creator session must pass normal authentication");
  const directory = await fetch(`${api}/p2p-bookings/designers`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  assert.equal(directory.status, 200, "Synthetic designer directory must be available");
  checkStopped();
  const nonce = crypto.randomBytes(24).toString("hex");
  const entry = `/__stripe_browser/${nonce}`;
  const checkout = `/creator/bookings/new?designer_id=${designer}&budget=10`;
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "dby-stripe-vite-"));
  vite = await createServer({ root: frontendRoot, mode: "development", cacheDir,
    server: { host: "127.0.0.1", port: 0, open: false },
    define: { "import.meta.env.VITE_API_URL": JSON.stringify(api),
      "import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY": JSON.stringify(publishable),
      "import.meta.env.VITE_STRIPE_PUBLIC_KEY": JSON.stringify(publishable) },
    plugins: [{ name: "isolated-stripe-browser-entry", configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== entry) return next();
        if (req.method !== "GET") { res.statusCode = 405; return res.end(); }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer");
        res.end(`<!doctype html><html><head><title>Stripe browser sandbox</title></head><body>
          <h1>Isolated Stripe browser session</h1><p>Test creator and designer only. Keep the PowerShell session running.</p>
          <p><a href="${checkout}">Open real booking checkout</a> (right-click to open in a new tab).</p>
          <ol><li>Create a $10 booking: 4242 4242 4242 4242. Expect payment verified.</li>
          <li>Create a new booking: 4000 0000 0000 9995. Expect decline; retry the SAME booking with 4242.</li>
          <li>Create a new booking: 4000 0000 0000 3220. Complete the 3DS test challenge; expect payment verified.</li>
          <li>Create a new booking with the 3DS card, cancel/fail the challenge, and verify it stays unpaid. Retry that booking.</li>
          <li>On a separate unpaid booking, refresh before paying. Check whether the app resumes it or creates another booking. Record IDs.</li></ol>
          <p>Use expiry 12/34, CVC 123, any postal code. Use a different future deadline for each new scenario.</p>
          <p>Return to this page for a new scenario. Do not navigate to subscriptions or other payment products.</p>
          <p>When done, close checkout tabs and press Ctrl+C in PowerShell. The command records database/Stripe observations,
          refunds this run's successful test payments, cancels unused intents, and removes its database.</p>
          <p><a href="https://docs.stripe.com/testing" target="_blank" rel="noreferrer">Stripe test card reference</a></p>
          <script>localStorage.setItem("token",${JSON.stringify(token)});localStorage.removeItem("user");</script>
          </body></html>`);
      });
    } }],
  });
  await vite.listen();
  const address = vite.httpServer.address();
  report.result = "manual_session_started";
  console.log("PASS Synthetic creator authentication and designer directory");
  console.log(`Open this PRIVATE session URL in your browser:\nhttp://127.0.0.1:${address.port}${entry}`);
  console.log("Follow the checklist on that page. Keep this terminal running; Ctrl+C ends the session and cleans up.");
  console.log("Session limit: 45 minutes. Browser/3DS outcomes require manual review; this command does not mark them passed.");
  timeout = setTimeout(requestStop, 45 * 60 * 1000);
  await finished;
  report.result = "manual_review_required";
}
async function cleanup() {
  clearTimeout(timeout); stopping = true;
  await vite?.close();
  if (backend) await new Promise((resolve) => { backend.close(resolve); backend.closeIdleConnections?.(); });
  if (database) {
    try { report.bookings = (await database.pool.query(`SELECT b.id,b.status,b.escrow_locked,b.stripe_payment_intent_id,
      (SELECT count(*)::int FROM transactions t WHERE t.reference_id=b.id AND t.transaction_type='escrow_lock') AS escrow_ledger_entries
      FROM bookings b ORDER BY b.id`)).rows; }
    catch (error) { report.observation_error = safeError(error); process.exitCode = 1; }
  }
  for (const id of intentIds) {
    try {
      const intent = await stripe.paymentIntents.retrieve(id); assert.equal(intent.livemode, false);
      const observation = { payment_intent: id, status_before_cleanup: intent.status };
      if (intent.latest_charge) {
        const charge = await stripe.charges.retrieve(intent.latest_charge);
        observation.three_d_secure = charge.payment_method_details?.card?.three_d_secure || null;
      }
      if (intent.status === "succeeded") {
        const refunds = await stripe.refunds.list({ payment_intent: id, limit: 100 });
        const reserved = refunds.data.filter((r) => !["failed", "canceled"].includes(r.status)).reduce((total, r) => total + r.amount, 0);
        if (intent.amount_received > reserved) await stripe.refunds.create({ payment_intent: id, amount: intent.amount_received - reserved,
          metadata: { transaction_purpose: "sandbox_test_cleanup", dby_test_run: run } }, { idempotencyKey: `dby-browser-cleanup:${run}:${id}` });
      } else if (intent.status !== "canceled") await stripe.paymentIntents.cancel(id);
      report.cleanup.push({ ...observation, result: "completed" });
    } catch (error) { report.cleanup.push({ payment_intent: id, result: "failed", error: safeError(error) }); process.exitCode = 1; }
  }
}
(async () => {
  try { await main(); } catch (error) { report.result = "failed"; report.error = safeError(error); console.error(`FAIL ${report.error}`); process.exitCode = 1; }
  finally {
    try { await cleanup(); } catch (error) { report.cleanup_error = safeError(error); process.exitCode = 1; }
    if (database) try { await database.dispose(); report.database_cleanup = "completed"; console.log(`Removed isolated database: ${database.name}`); }
    catch { report.database_cleanup = "failed"; report.database = database.name; process.exitCode = 1; }
    if (cacheDir) try {
      const resolved = path.resolve(cacheDir);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("dby-stripe-vite-")) throw new Error("Unexpected Vite cache path");
      fs.rmSync(resolved, { recursive: true, force: true });
    } catch { /* Reproducible Vite cache only. */ }
    if (process.exitCode && report.result !== "failed") report.result = "cleanup_failed";
    report.finished_at = new Date().toISOString();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`Browser session: ${report.result.toUpperCase()}`);
    console.log(`Browser report: ${reportPath}`);
  }
})();
