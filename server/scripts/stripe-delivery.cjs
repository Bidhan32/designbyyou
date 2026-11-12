"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const Stripe = require("stripe");
const jwt = require("jsonwebtoken");
const { isolatedServer, assertTestKey } = require("./support/isolated-app.cjs");
const { sandboxDatabase } = require("./support/sandbox-database.cjs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const run = crypto.randomUUID();
const reportPath = path.resolve(__dirname, "../stripe-delivery-report.json");
const report = { run, started_at: new Date().toISOString(), result: "running", checks: [],
  webhook_transport: "Stripe CLI forwarding Stripe-generated payment_intent.succeeded" };
const stopped = new AbortController();
process.once("SIGINT", () => stopped.abort(new Error("Test interrupted; cleaning up.")));
process.once("SIGTERM", () => stopped.abort(new Error("Test interrupted; cleaning up.")));
let stripe, database, server, cli, app, intent, cliFailure;
function checkRunning() { stopped.signal.throwIfAborted(); if (cliFailure) throw cliFailure; }
function pass(name) { report.checks.push(name); console.log(`PASS ${name}`); }
function safeError(error) {
  // CLI output and SDK messages can contain credentials; never persist either.
  if (error.type?.startsWith("Stripe")) return `${error.type}${error.code ? ` (${error.code})` : ""}`;
  if (error.code) return `Operation failed (${error.code})`;
  return String(error.message || "Test failed").replace(/(?:sk|rk|pk)_test_\w+|whsec_\w+/g, "[redacted]");
}
async function waitFor(test, timeout, message) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    checkRunning(); const result = await test(); if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(message);
}
async function main() {
  assertTestKey(process.env.STRIPE_SECRET_KEY);
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 1 });
  assert.equal((await stripe.balance.retrieve()).livemode, false);
  pass("Stripe account is reachable and test-mode");
  server = http.createServer((req, res) => {
    if (app) return app(req, res);
    res.writeHead(503); res.end("Sandbox initializing");
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const bundled = path.resolve(__dirname, "../stripe.exe");
  const executable = process.env.STRIPE_CLI_PATH || (fs.existsSync(bundled) ? bundled : "stripe");
  let listenerSecret;
  let output = "";
  cli = spawn(executable, ["listen", "--events", "payment_intent.succeeded", "--forward-to", `${origin}/api/v1/webhooks/stripe`], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, STRIPE_API_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_DEVICE_NAME: "dby-isolated-delivery-test", STRIPE_NO_AUTO_UPDATE: "1" },
  });
  cli.on("error", (error) => { cliFailure = new Error(`Stripe CLI could not start (${error.code || "execution blocked"}). Check server/stripe.exe or STRIPE_CLI_PATH.`); });
  cli.on("exit", (code) => { cliFailure = new Error(`Stripe CLI stopped (exit ${code}). Check CLI access and connectivity.`); });
  const capture = (chunk) => {
    output = (output + chunk.toString()).slice(-16384);
    const found = output.match(/whsec_[A-Za-z0-9]+/);
    if (found) listenerSecret = found[0];
  };
  cli.stdout.on("data", capture); cli.stderr.on("data", capture);
  console.log("Waiting for Stripe CLI connection (up to 45 seconds)...");
  await waitFor(() => listenerSecret, 45000, "Stripe CLI did not become ready. Check CLI access and connectivity.");
  output = "";
  pass("Stripe CLI connected using this run's test key");
  database = await sandboxDatabase();
  process.env.NODE_ENV = "test";
  const authSecret = crypto.randomBytes(48).toString("hex");
  process.env.JWT_SECRET = authSecret;
  process.env.STRIPE_WEBHOOK_SECRET = listenerSecret;
  const creator = crypto.randomUUID(), designer = crypto.randomUUID();
  for (const [id, role] of [[creator, "creator"], [designer, "designer"]]) {
    await database.pool.query(`INSERT INTO users (id,role,full_name,email,password_hash,is_email_verified,approval_status,token_version)
      VALUES ($1,$2,$3,$4,$5,true,'approved',0)`, [id, role, `Delivery ${role}`, `${role}.${run}@example.invalid`, "isolated-no-login"]);
  }
  await database.pool.query("INSERT INTO designer_profiles (user_id,portfolio_url,tier,total_completed_bookings,commission_rate) VALUES ($1,$2,'bronze',0,10)", [designer, "https://example.invalid/portfolio"]);
  // Track provider acceptance even if booking creation later fails.
  const create = stripe.paymentIntents.create.bind(stripe.paymentIntents);
  stripe.paymentIntents.create = async (...args) => { intent = await create(...args); assert.equal(intent.livemode, false); return intent; };
  app = isolatedServer({ db: database.pool, stripe, secretKey: process.env.STRIPE_SECRET_KEY }).load("index.js").app;
  const token = jwt.sign({ id: creator, tokenVersion: 0 }, authSecret, { algorithm: "HS256", expiresIn: "10m" });
  async function post(route, body) {
    checkRunning();
    const response = await fetch(`${origin}/api/v1/p2p-bookings${route}`, { method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    assert.ok(response.ok, `Booking API returned HTTP ${response.status}`); return response.json();
  }
  const created = await post("/create", { client_request_id: crypto.randomUUID(), receiver_id: designer,
    brief_text: `Stripe-delivered webhook test ${run}`, agreed_price: 10, booking_type: "commission",
    deadline: new Date(Date.now() + 7 * 86400000).toISOString() });
  assert.equal(created.booking.stripe_payment_intent_id, intent.id);
  const paid = await stripe.paymentIntents.confirm(intent.id, { payment_method: "pm_card_visa", return_url: "https://example.invalid/sandbox-return" });
  assert.equal(paid.status, "succeeded");
  assert.equal(paid.amount_received, Math.round(created.payment.totalCharged * 100));
  pass("Real test payment succeeded with the booking's exact charge");
  console.log("Waiting for Stripe-delivered webhook (up to 60 seconds)...");
  const event = await waitFor(async () => {
    const result = await database.pool.query("SELECT event_id FROM stripe_webhook_events WHERE object_id=$1 AND event_type='payment_intent.succeeded' AND processing_status='processed'", [intent.id]);
    return result.rows[0];
  }, 60000, "No processed Stripe-delivered payment event arrived within 60 seconds.");
  report.event_id = event.event_id;
  assert.ok(event.event_id.startsWith("evt_"));
  async function assertAccounting() {
    const booking = (await database.pool.query("SELECT escrow_locked FROM bookings WHERE id=$1", [created.booking.id])).rows[0];
    assert.equal(booking.escrow_locked, true);
    const wallet = (await database.pool.query("SELECT pending_escrow_balance FROM designer_wallets WHERE user_id=$1", [designer])).rows[0];
    assert.equal(Number(wallet.pending_escrow_balance), 10);
    const ledger = await database.pool.query("SELECT count(*)::int AS count FROM transactions WHERE reference_id=$1 AND transaction_type='escrow_lock'", [created.booking.id]);
    assert.equal(ledger.rows[0].count, 1);
  }
  await assertAccounting();
  pass("Stripe-originated event passed signature verification and funded escrow once");
  await Promise.all([post("/verify-escrow", { bookingId: created.booking.id }), post("/verify-escrow", { bookingId: created.booking.id })]);
  await assertAccounting();
  pass("Browser reconciliation after provider delivery does not duplicate escrow");
  report.result = "passed";
}
async function cleanup() {
  if (cli && cli.exitCode === null && cli.signalCode === null) {
    await new Promise((resolve) => { cli.once("exit", resolve); cli.kill(); const timer = setTimeout(resolve, 5000); timer.unref(); });
  }
  if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections?.(); });
  if (intent) {
    const latest = await stripe.paymentIntents.retrieve(intent.id); assert.equal(latest.livemode, false);
    if (latest.status === "succeeded") await stripe.refunds.create({ payment_intent: intent.id,
      metadata: { transaction_purpose: "sandbox_test_cleanup", dby_test_run: run } }, { idempotencyKey: `dby-delivery-cleanup:${run}` });
    else if (latest.status !== "canceled") await stripe.paymentIntents.cancel(intent.id);
    report.payment_cleanup = "completed";
  }
}
(async () => {
  try { await main(); } catch (error) { report.result = "failed"; report.error = safeError(error); console.error(`FAIL ${report.error}`); process.exitCode = 1; }
  finally {
    try { await cleanup(); } catch (error) { report.result = "cleanup_failed"; report.cleanup_error = safeError(error); process.exitCode = 1; }
    if (database) try { await database.dispose(); report.database_cleanup = "completed"; console.log(`Removed isolated database: ${database.name}`); }
    catch { report.result = "cleanup_failed"; report.database_cleanup = "failed"; report.database = database.name; process.exitCode = 1; }
    report.payment_intent = intent?.id; report.finished_at = new Date().toISOString();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`Stripe delivery check: ${report.result.toUpperCase()} (${report.checks.length} checks passed)`);
    console.log(`Delivery report: ${reportPath}`);
  }
})();
