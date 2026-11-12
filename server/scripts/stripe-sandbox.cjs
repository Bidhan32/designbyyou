"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const Stripe = require("stripe");
const jwt = require("jsonwebtoken");
const { isolatedServer, assertTestKey } = require("./support/isolated-app.cjs");
const { sandboxDatabase } = require("./support/sandbox-database.cjs");

require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
const run = crypto.randomUUID();
const reportPath = path.resolve(__dirname, "../stripe-sandbox-report.json");
const report = { run, started_at: new Date().toISOString(), mode: "stripe_test", result: "running", checks: [],
  webhook_transport: "locally signed sandbox objects through actual HTTP router; not Stripe outbound delivery",
  payment_intents: [], cleanup: [] };
let stripe, isolated, server, origin;
const intentIds = new Set();
const actors = { creator: crypto.randomUUID(), designer: crypto.randomUUID(), outsider: crypto.randomUUID() };
const signingSecret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
const authSecret = crypto.randomBytes(48).toString("hex");

function safeError(error) {
  if (String(error.type || "").startsWith("Stripe")) {
    const code = error.code || error.detail?.code;
    return `${error.type}${code ? ` (${code})` : ""}`;
  }
  if (error.code && !String(error.code).startsWith("ERR_ASSERTION")) return `Operation failed (${error.code})`;
  return error.message || "Unknown test failure";
}
async function step(name, action) {
  try { await action(); report.checks.push({ name, result: "passed" }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, result: "failed", error: safeError(error) }); throw error; }
}
function expectStatus(response, expected, label) {
  assert.ok([expected].flat().includes(response.status), `${label}: HTTP ${response.status}; ${response.body?.message || "unexpected response"}`);
  return response.body;
}
async function request(route, { actor = "creator", method = "POST", body = {}, headers = {} } = {}) {
  const token = actor ? jwt.sign({ id: actors[actor], tokenVersion: 0 }, authSecret, { algorithm: "HS256", expiresIn: "1h" }) : null;
  const response = await fetch(`${origin}/api/v1/p2p-bookings${route}`, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000),
  });
  return { status: response.status, body: await response.json() };
}
function eventFor(type, object, id = `evt_dby_${crypto.randomBytes(12).toString("hex")}`) {
  return { id, object: "event", type, livemode: false, created: Math.floor(Date.now() / 1000), data: { object } };
}
async function deliver(event, { invalidSignature = false, tamper = false } = {}) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: invalidSignature ? "wrong-secret" : signingSecret });
  const response = await fetch(`${origin}/api/v1/webhooks/stripe`, { method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": signature },
    body: tamper ? `${payload} ` : payload, signal: AbortSignal.timeout(30000) });
  return { status: response.status, body: await response.json() };
}
let day = 10;
async function createBooking(amount, overrides = {}) {
  const body = { client_request_id: crypto.randomUUID(), receiver_id: actors.designer,
    brief_text: `Isolated Stripe sandbox booking ${run}`, agreed_price: amount,
    deadline: new Date(Date.now() + day++ * 86400000).toISOString(), booking_type: "commission", ...overrides };
  const result = await request("/create", { body });
  expectStatus(result, 201, "Create booking");
  intentIds.add(result.body.booking.stripe_payment_intent_id);
  return { body, booking: result.body.booking, payment: result.body.payment };
}
async function confirm(booking, paymentMethod = "pm_card_visa") {
  return stripe.paymentIntents.confirm(booking.stripe_payment_intent_id, { payment_method: paymentMethod,
    return_url: "https://example.invalid/dby-sandbox-return" });
}
async function bookingRow(id) { return (await isolated.pool.query("SELECT * FROM bookings WHERE id=$1", [id])).rows[0]; }
async function wallet() { return (await isolated.pool.query("SELECT * FROM designer_wallets WHERE user_id=$1", [actors.designer])).rows[0]; }
async function ledgerCount(id, type) {
  return Number((await isolated.pool.query("SELECT count(*)::int AS count FROM transactions WHERE reference_id=$1 AND transaction_type=$2", [id, type])).rows[0].count);
}

async function main() {
  assertTestKey(process.env.STRIPE_SECRET_KEY);
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 1 });
  await step("Stripe account is reachable and test-mode", async () => {
    assert.equal((await stripe.balance.retrieve()).livemode, false);
  });
  // Track only PaymentIntents created by this isolated run, including failures
  // after provider acceptance but before a booking response reaches the caller.
  const createIntent = stripe.paymentIntents.create.bind(stripe.paymentIntents);
  stripe.paymentIntents.create = async (...args) => {
    const intent = await createIntent(...args); assert.equal(intent.livemode, false); intentIds.add(intent.id); return intent;
  };
  isolated = await sandboxDatabase();
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = authSecret;
  process.env.STRIPE_WEBHOOK_SECRET = signingSecret;
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = signingSecret;
  const pool = isolated.pool;
  for (const [actor, id] of Object.entries(actors)) {
    await pool.query(`INSERT INTO users (id,role,full_name,email,password_hash,is_email_verified,approval_status,token_version)
      VALUES ($1,$2,$3,$4,$5,true,'approved',0)`, [id, actor === "designer" ? "designer" : "creator",
      `Sandbox ${actor}`, `${actor}.${run}@example.invalid`, "isolated-test-no-login"]);
  }
  await pool.query("INSERT INTO designer_profiles (user_id,portfolio_url,tier,total_completed_bookings,commission_rate) VALUES ($1,$2,'bronze',4,10)", [actors.designer, "https://example.invalid/portfolio"]);
  let failNextEscrowLedger = false;
  const db = { query: pool.query.bind(pool), async connect() {
    const client = await pool.connect();
    return { release: () => client.release(), async query(sql, values) {
      if (failNextEscrowLedger && /INSERT\s+INTO\s+transactions[\s\S]*'escrow_lock'/i.test(sql)) {
        failNextEscrowLedger = false; throw new Error("Injected sandbox ledger-write failure");
      }
      return client.query(sql, values);
    } };
  } };
  const { app } = isolatedServer({ db, stripe, secretKey: process.env.STRIPE_SECRET_KEY }).load("index.js");
  server = await new Promise((resolve, reject) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); listener.once("error", reject); });
  origin = `http://127.0.0.1:${server.address().port}`;

  await step("Anonymous booking creation is rejected", async () => {
    expectStatus(await request("/create", { actor: null }), 401, "Anonymous create");
  });
  await step("Unverified creators and pending designers cannot initiate new payments", async () => {
    const before = intentIds.size;
    await pool.query("UPDATE users SET is_email_verified=false WHERE id=$1", [actors.creator]);
    try { expectStatus(await request("/create"), 403, "Unverified creator"); }
    finally { await pool.query("UPDATE users SET is_email_verified=true WHERE id=$1", [actors.creator]); }
    await pool.query("UPDATE users SET approval_status='pending' WHERE id=$1", [actors.designer]);
    try {
      const body = { client_request_id: crypto.randomUUID(), receiver_id: actors.designer,
        brief_text: "Sandbox pending designer eligibility test", agreed_price: 10,
        deadline: new Date(Date.now() + 6 * 86400000).toISOString(), booking_type: "commission" };
      expectStatus(await request("/create", { body }), 409, "Pending designer");
    } finally { await pool.query("UPDATE users SET approval_status='approved' WHERE id=$1", [actors.designer]); }
    assert.equal(intentIds.size, before);
  });
  let primary;
  await step("Concurrent identical booking requests create one booking and PaymentIntent", async () => {
    const body = { client_request_id: crypto.randomUUID(), receiver_id: actors.designer,
      brief_text: `Concurrent isolated Stripe sandbox test ${run}`, agreed_price: 100,
      deadline: new Date(Date.now() + 5 * 86400000).toISOString(), booking_type: "commission" };
    const results = await Promise.all([request("/create", { body }), request("/create", { body })]);
    for (const response of results) expectStatus(response, [200, 201], "Concurrent create");
    assert.equal(results[0].body.booking.id, results[1].body.booking.id);
    assert.equal(results[0].body.clientSecret, results[1].body.clientSecret);
    primary = { body, booking: results[0].body.booking, payment: results[0].body.payment };
    assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM bookings WHERE client_request_id=$1", [body.client_request_id])).rows[0].count), 1);
    const pi = await stripe.paymentIntents.retrieve(primary.booking.stripe_payment_intent_id);
    assert.equal(pi.amount, Math.round(primary.payment.totalCharged * 100));
    assert.equal(pi.metadata.base_price_cents, "10000");
  });
  await step("Request key cannot be reused for changed price or by another creator", async () => {
    expectStatus(await request("/create", { body: { ...primary.body, agreed_price: 120 } }), 409, "Changed request");
    expectStatus(await request("/create", { actor: "outsider", body: primary.body }), 409, "Foreign request key");
  });
  await step("Unpaid and outsider verification cannot fund escrow", async () => {
    expectStatus(await request("/verify-escrow", { body: { bookingId: primary.booking.id } }), 400, "Unpaid verification");
    expectStatus(await request("/verify-escrow", { actor: "outsider", body: { bookingId: primary.booking.id } }), 403, "Foreign verification");
    assert.equal((await bookingRow(primary.booking.id)).escrow_locked, false);
  });
  let paid, paymentEvent;
  await step("Real Stripe test payment succeeds with the exact charged amount", async () => {
    paid = await confirm(primary.booking); assert.equal(paid.status, "succeeded");
    assert.equal(paid.amount_received, Math.round(primary.payment.totalCharged * 100));
    paymentEvent = eventFor("payment_intent.succeeded", paid);
  });
  await step("Invalid signatures and modified raw webhook bytes are rejected", async () => {
    expectStatus(await deliver(paymentEvent, { invalidSignature: true }), 400, "Bad signature");
    expectStatus(await deliver(paymentEvent, { tamper: true }), 400, "Modified raw body");
    assert.equal((await bookingRow(primary.booking.id)).escrow_locked, false);
  });
  await step("Failed webhook transaction rolls back, then the same event retries successfully", async () => {
    failNextEscrowLedger = true;
    expectStatus(await deliver(paymentEvent), 500, "Injected webhook failure");
    assert.equal((await bookingRow(primary.booking.id)).escrow_locked, false);
    assert.equal(await ledgerCount(primary.booking.id, "escrow_lock"), 0);
    assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM stripe_webhook_events WHERE event_id=$1", [paymentEvent.id])).rows[0].count), 0);
    expectStatus(await deliver(paymentEvent), 200, "Retried webhook");
    assert.equal((await bookingRow(primary.booking.id)).status, "funded");
    assert.equal(Number((await wallet()).pending_escrow_balance), 100);
    assert.equal(await ledgerCount(primary.booking.id, "escrow_lock"), 1);
  });
  await step("Concurrent webhook replays and browser reconciliation do not double-credit escrow", async () => {
    for (const response of await Promise.all([deliver(paymentEvent), deliver(paymentEvent),
      request("/verify-escrow", { body: { bookingId: primary.booking.id } })])) expectStatus(response, 200, "Payment replay");
    expectStatus(await deliver(eventFor("payment_intent.succeeded", paid)), 200, "Distinct event for same payment");
    assert.equal(Number((await wallet()).pending_escrow_balance), 100);
    assert.equal(await ledgerCount(primary.booking.id, "escrow_lock"), 1);
  });
  await step("Milestones enforce participant ownership and complete the funded workflow", async () => {
    expectStatus(await request(`/${primary.booking.id}/release`, { actor: "outsider" }), 403, "Foreign release");
    expectStatus(await request(`/${primary.booking.id}/release`), 400, "Premature release");
    expectStatus(await request(`/${primary.booking.id}/accept`, { actor: "designer" }), 200, "Accept");
    expectStatus(await request(`/${primary.booking.id}/submit-prototype`, { actor: "designer", body: { file_url: "https://example.invalid/prototype.png" } }), 200, "Prototype");
    expectStatus(await request(`/${primary.booking.id}/approve-prototype`), 200, "Approve prototype");
    expectStatus(await request(`/${primary.booking.id}/submit-final`, { actor: "designer", body: { file_url: "https://example.invalid/final.png" } }), 200, "Final deliverable");
  });
  await step("Concurrent releases pay Silver commission and award creator points once", async () => {
    for (const response of await Promise.all([request(`/${primary.booking.id}/release`), request(`/${primary.booking.id}/release`)])) expectStatus(response, 200, "Release");
    assert.equal(Number((await wallet()).available_balance), 15);
    assert.equal(Number((await wallet()).pending_escrow_balance), 0);
    assert.equal(await ledgerCount(primary.booking.id, "escrow_release"), 1);
    const profile = (await pool.query("SELECT total_completed_bookings,tier FROM designer_profiles WHERE user_id=$1", [actors.designer])).rows[0];
    assert.equal(profile.total_completed_bookings, 5); assert.equal(profile.tier, "silver");
    assert.equal((await pool.query("SELECT xp_points FROM creator_profiles WHERE user_id=$1", [actors.creator])).rows[0].xp_points, 20);
  });
  await step("Completed bookings reject cancellation and flag external refunds for manual reconciliation", async () => {
    expectStatus(await request(`/${primary.booking.id}/cancel`, { body: { reason: "Sandbox cancellation after completion" } }), 400, "Completed cancellation");
    const simulated = eventFor("refund.updated", { id: `re_dby_${run}`, object: "refund", payment_intent: paid.id,
      amount: paid.amount_received, status: "succeeded", metadata: { booking_id: primary.booking.id, expected_refund_cents: String(paid.amount_received) } });
    const response = expectStatus(await deliver(simulated), 200, "External completed refund");
    assert.equal(response.manualReconciliationRequired, true);
    assert.equal((await bookingRow(primary.booking.id)).status, "completed");
    assert.equal(Number((await wallet()).available_balance), 15);
  });
  await step("Concurrent funded cancellations create one full Stripe refund and reverse escrow once", async () => {
    const fixture = await createBooking(20); const pi = await confirm(fixture.booking);
    expectStatus(await deliver(eventFor("payment_intent.succeeded", pi)), 200, "Fund refundable booking");
    for (const response of await Promise.all([request(`/${fixture.booking.id}/cancel`, { body: { reason: "Sandbox full refund" } }),
      request(`/${fixture.booking.id}/cancel`, { body: { reason: "Sandbox full refund" } })])) expectStatus(response, [200, 202], "Concurrent cancellation");
    const refunds = await stripe.refunds.list({ payment_intent: pi.id, limit: 10 });
    assert.equal(refunds.data.length, 1);
    let refund = refunds.data[0];
    for (let attempt = 0; attempt < 10 && refund.status !== "succeeded"; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500)); refund = await stripe.refunds.retrieve(refund.id);
    }
    assert.equal(refund.status, "succeeded"); assert.equal(refund.amount, pi.amount_received);
    const event = eventFor("refund.updated", refund);
    for (const response of await Promise.all([deliver(event), deliver(event)])) expectStatus(response, 200, "Refund replay");
    expectStatus(await deliver(eventFor("refund.updated", { ...refund, status: "pending" })), 200, "Late pending refund event");
    expectStatus(await deliver(eventFor("payment_intent.succeeded", pi)), 200, "Late payment event");
    assert.equal((await bookingRow(fixture.booking.id)).status, "cancelled");
    assert.equal(Number((await wallet()).pending_escrow_balance), 0);
    assert.equal(Number((await wallet()).available_balance), 15);
    assert.equal(await ledgerCount(fixture.booking.id, "refund"), 1);
  });
  await step("Unpaid cancellation cancels its PaymentIntent without a refund", async () => {
    const fixture = await createBooking(10);
    expectStatus(await request(`/${fixture.booking.id}/cancel`, { body: { reason: "Sandbox unpaid cancellation" } }), 200, "Unpaid cancellation");
    assert.equal((await stripe.paymentIntents.retrieve(fixture.booking.stripe_payment_intent_id)).status, "canceled");
    assert.equal(await ledgerCount(fixture.booking.id, "refund"), 0);
  });
  await step("Declined card does not secure escrow", async () => {
    const fixture = await createBooking(10); let declined = false;
    try { await confirm(fixture.booking, "pm_card_visa_chargeDeclined"); } catch (error) { if (error.type !== "StripeCardError") throw error; declined = true; }
    assert.equal(declined, true);
    expectStatus(await request("/verify-escrow", { body: { bookingId: fixture.booking.id } }), 400, "Declined verification");
    assert.equal((await bookingRow(fixture.booking.id)).escrow_locked, false);
  });
  await step("Designer acceptance before payment transitions to progress after payment", async () => {
    const fixture = await createBooking(10);
    expectStatus(await request(`/${fixture.booking.id}/accept`, { actor: "designer" }), 200, "Accept before funding");
    assert.equal((await bookingRow(fixture.booking.id)).status, "awaiting_payment");
    const pi = await confirm(fixture.booking);
    expectStatus(await deliver(eventFor("payment_intent.succeeded", pi)), 200, "Fund accepted booking");
    assert.equal((await bookingRow(fixture.booking.id)).status, "progress");
  });
  await step("Authentication-required payment cannot fund escrow without authentication", async () => {
    const fixture = await createBooking(10);
    let authenticationError = false;
    try {
      await stripe.paymentIntents.confirm(fixture.booking.stripe_payment_intent_id, {
        payment_method: "pm_card_authenticationRequired", off_session: true,
        return_url: "https://example.invalid/dby-sandbox-return",
      });
    } catch (error) {
      if (error.type !== "StripeCardError" || error.code !== "authentication_required") throw error;
      authenticationError = true;
    }
    const pi = await stripe.paymentIntents.retrieve(fixture.booking.stripe_payment_intent_id);
    assert.notEqual(pi.status, "succeeded");
    assert.ok(authenticationError || pi.next_action, "Expected authentication-required state");
    expectStatus(await request("/verify-escrow", { body: { bookingId: fixture.booking.id } }), 400, "Authentication pending");
    assert.equal((await bookingRow(fixture.booking.id)).escrow_locked, false);
  });
  report.result = "passed";
}

async function cleanup() {
  if (server) await new Promise((resolve) => { server.close(resolve); server.closeIdleConnections?.(); });
  if (stripe) for (const id of intentIds) {
    try {
      const pi = await stripe.paymentIntents.retrieve(id); assert.equal(pi.livemode, false);
      if (pi.status === "succeeded") {
        const existing = await stripe.refunds.list({ payment_intent: id, limit: 100 });
        const reserved = existing.data.filter((item) => !["failed", "canceled"].includes(item.status)).reduce((sum, item) => sum + item.amount, 0);
        if (pi.amount_received > reserved) await stripe.refunds.create({ payment_intent: id, amount: pi.amount_received - reserved,
          metadata: { transaction_purpose: "sandbox_test_cleanup", dby_test_run: run } }, { idempotencyKey: `dby-sandbox-cleanup:${run}:${id}` });
      } else if (pi.status !== "canceled") await stripe.paymentIntents.cancel(id, {}, { idempotencyKey: `dby-sandbox-cancel:${run}:${id}` });
      report.cleanup.push({ payment_intent: id, result: "completed" });
    } catch (error) { report.cleanup.push({ payment_intent: id, result: "failed", error: safeError(error) }); process.exitCode = 1; }
  }
  if (isolated) {
    try { await isolated.dispose(); report.database_cleanup = "completed"; console.log(`Removed isolated database: ${isolated.name}`); }
    catch (error) { report.database_cleanup = "failed"; report.database = isolated.name; process.exitCode = 1; }
  }
}

(async () => {
  try { await main(); } catch (error) { report.result = "failed"; report.error = safeError(error); console.error(`FAIL ${report.error}`); process.exitCode = 1; }
  finally {
    try { await cleanup(); } catch (error) { report.result = "failed"; report.cleanup_error = safeError(error); process.exitCode = 1; }
    report.payment_intents = [...intentIds]; report.finished_at = new Date().toISOString();
    if (process.exitCode && report.result === "passed") report.result = "cleanup_failed";
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Stripe sandbox suite: ${report.result.toUpperCase()} (${report.checks.filter((check) => check.result === "passed").length} checks passed)`);
    console.log(`Sandbox report: ${reportPath}`);
  }
})();
