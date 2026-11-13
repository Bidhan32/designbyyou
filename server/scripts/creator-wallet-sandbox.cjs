"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const Stripe = require("stripe");
const jwt = require("jsonwebtoken");
const { isolatedServer, assertTestKey } = require("./support/isolated-app.cjs");
const { sandboxDatabase, sandboxToken } = require("./support/sandbox-database.cjs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
const run = crypto.randomUUID();
const reportPath = path.resolve(__dirname, "../creator-wallet-sandbox-report.json");
const report = { run, started_at: new Date().toISOString(), result: "running", checks: [], cleanup: [],
  webhook_transport: "Locally signed snapshots of real Stripe test objects; not outbound provider delivery",
  faults: "Injected ledger failure, definitive refund rejection, and dropped refund response are simulated" };
const authSecret = crypto.randomBytes(48).toString("hex"), signingSecret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
const intentIds = new Set();
let stripe, isolated, server, origin, creator, outsider, designer;
let failDepositLedger = false, refundFault = null, refundCreates = 0;
function safeError(error) {
  if (error.type?.startsWith("Stripe")) return `${error.type}${error.code ? ` (${error.code})` : ""}`;
  if (error.code) return `Operation failed (${error.code})`;
  return String(error.message || "Unknown failure").replace(/(?:sk|rk|pk)_(?:test|live)_\w+|whsec_\w+|pi_\w+_secret_\w+/g, "[redacted]");
}
async function step(name, fn) { await fn(); report.checks.push(name); console.log(`PASS ${name}`); }
function expect(result, status) { assert.ok([status].flat().includes(result.status), `Expected HTTP ${status}, received ${result.status}: ${result.body.message || "unexpected response"}`); return result.body; }
async function api(actor, route, body = {}) {
  const token = actor ? await sandboxToken(isolated.pool, actor, authSecret) : null;
  const response = await fetch(`${origin}/api/v1/creator-finance${route}`, { method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  return { status: response.status, body: await response.json() };
}
async function user(role = "creator") {
  const id = crypto.randomUUID();
  await isolated.pool.query(`INSERT INTO users (id,role,full_name,email,password_hash,is_email_verified,approval_status,token_version)
    VALUES ($1,$2,$3,$4,'isolated-no-login',true,'approved',0)`, [id, role, `Wallet Test ${role}`, `${id}@example.invalid`]);
  return id;
}
async function deliver(type, object, eventId = `evt_dby_${crypto.randomBytes(12).toString("hex")}`) {
  const payload = JSON.stringify({ id: eventId, object: "event", type, livemode: false, created: Math.floor(Date.now() / 1000), data: { object } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: signingSecret });
  const res = await fetch(`${origin}/api/v1/webhooks/stripe`, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": signature }, body: payload, signal: AbortSignal.timeout(30000) });
  return { status: res.status, body: await res.json() };
}
async function deposit(actor, amount, key = crypto.randomUUID()) {
  const body = expect(await api(actor, "/wallet/deposit", { amount, client_request_id: key }), [200, 201]);
  return { body, id: body.data.deposit.id, pi: body.paymentIntentId, key };
}
async function fund(actor, amount) {
  const d = await deposit(actor, amount);
  const pi = await stripe.paymentIntents.confirm(d.pi, { payment_method: "pm_card_visa", return_url: "https://example.invalid/wallet-test" });
  assert.equal(pi.status, "succeeded"); expect(await deliver("payment_intent.succeeded", pi), 200); return { ...d, paid: pi };
}
async function balances(actor, available, pending, withdrawn = 0) {
  const w = (await isolated.pool.query("SELECT * FROM creator_wallets WHERE creator_id=$1", [actor])).rows[0];
  assert.equal(Number(w?.available_balance || 0), available); assert.equal(Number(w?.pending_refund_balance || 0), pending);
  assert.equal(Number(w?.lifetime_withdrawn || 0), withdrawn);
}
async function withdraw(actor, amount, key = crypto.randomUUID()) { return api(actor, "/wallet/withdraw", { amount, client_request_id: key }); }
async function settled(actor, amount, key, initial) {
  let result = initial || await withdraw(actor, amount, key);
  for (let n = 0; n < 12; n++) {
    expect(result, [200, 201, 202]);
    if (result.body.data.refund_request.status !== "processing") return result.body.data.refund_request;
    await new Promise((resolve) => setTimeout(resolve, 500)); result = await withdraw(actor, amount, key);
  }
  throw new Error("Refund did not settle during bounded sandbox retries");
}
async function main() {
  assertTestKey(process.env.STRIPE_SECRET_KEY);
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 1 });
  await step("Stripe account is reachable and test-mode", async () => assert.equal((await stripe.balance.retrieve()).livemode, false));
  const createIntent = stripe.paymentIntents.create.bind(stripe.paymentIntents);
  stripe.paymentIntents.create = async (...args) => { const pi = await createIntent(...args); assert.equal(pi.livemode, false); intentIds.add(pi.id); return pi; };
  const createRefund = stripe.refunds.create.bind(stripe.refunds);
  stripe.refunds.create = async (...args) => {
    refundCreates++;
    const fault = refundFault; refundFault = null;
    if (fault === "reject") throw Object.assign(new Error("Injected definitive refund rejection before provider call"), { type: "StripeInvalidRequestError" });
    if (fault === "timeout_before") throw Object.assign(new Error("Injected uncertain connection failure"), { type: "StripeConnectionError" });
    const refund = await createRefund(...args);
    if (fault === "drop_response") throw Object.assign(new Error("Injected lost response after provider accepted refund"), { type: "StripeConnectionError" });
    return refund;
  };
  isolated = await sandboxDatabase();
  process.env.NODE_ENV = "test"; process.env.JWT_SECRET = authSecret;
  process.env.STRIPE_WEBHOOK_SECRET = signingSecret; process.env.STRIPE_CONNECT_WEBHOOK_SECRET = signingSecret;
  process.env.CREATOR_MIN_DEPOSIT_AMOUNT = "1";
  const pool = isolated.pool;
  const db = { query: pool.query.bind(pool), async connect() {
    const client = await pool.connect();
    return { release: () => client.release(), async query(sql, values) {
      if (failDepositLedger && /INSERT INTO transactions[\s\S]*'wallet_deposit'/.test(sql)) {
        failDepositLedger = false; throw new Error("Injected creator deposit ledger failure");
      }
      return client.query(sql, values);
    } };
  } };
  const { app } = isolatedServer({ db, stripe, secretKey: process.env.STRIPE_SECRET_KEY }).load("index.js");
  server = await new Promise((resolve, reject) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); s.once("error", reject); });
  origin = `http://127.0.0.1:${server.address().port}`;
  creator = await user(); outsider = await user(); designer = await user("designer");
  await step("Anonymous and designer accounts cannot use creator wallet funding or withdrawals", async () => {
    for (const route of ["/wallet/deposit", "/wallet/withdraw"]) { expect(await api(null, route), 401); expect(await api(designer, route), 403); }
  });
  await step("New financial actions require email verification; non-Stripe deposits are rejected", async () => {
    await pool.query("UPDATE users SET is_email_verified=false WHERE id=$1", [creator]);
    expect(await api(creator, "/wallet/deposit", { amount: 10, client_request_id: crypto.randomUUID() }), 403);
    expect(await withdraw(creator, 1), 403);
    await pool.query("UPDATE users SET is_email_verified=true,approval_status='pending' WHERE id=$1", [creator]);
    expect(await api(creator, "/wallet/deposit", { amount: 10, client_request_id: crypto.randomUUID(), payment_provider: "paypal" }), 400);
    expect(await api(creator, "/wallet/deposit", { amount: 0.1, client_request_id: crypto.randomUUID() }), 400);
  });
  let primary;
  await step("Deposit request retries reuse one PaymentIntent and reject changed amounts", async () => {
    primary = await deposit(creator, 10);
    const again = await deposit(creator, 10, primary.key); assert.equal(again.id, primary.id); assert.equal(again.pi, primary.pi);
    expect(await api(creator, "/wallet/deposit", { amount: 11, client_request_id: primary.key }), 409);
    await balances(creator, 0, 0);
  });
  await step("Unpaid deposits cannot create refundable wallet balance", async () => { expect(await withdraw(creator, 1), 400); await balances(creator, 0, 0); });
  await step("Deposit webhook ledger failure rolls back; replay credits the exact amount once", async () => {
    primary.paid = await stripe.paymentIntents.confirm(primary.pi, { payment_method: "pm_card_visa", return_url: "https://example.invalid/wallet-test" });
    assert.equal(primary.paid.amount_received, 1000);
    const event = `evt_dby_${crypto.randomBytes(12).toString("hex")}`;
    failDepositLedger = true; expect(await deliver("payment_intent.succeeded", primary.paid, event), 500); await balances(creator, 0, 0);
    expect(await deliver("payment_intent.succeeded", primary.paid, event), 200);
    for (const response of await Promise.all([deliver("payment_intent.succeeded", primary.paid, event), deliver("payment_intent.succeeded", primary.paid)])) expect(response, 200);
    await balances(creator, 10, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM transactions WHERE reference_id=$1 AND transaction_type='wallet_deposit'", [primary.id])).rows[0].count, 1);
  });
  await step("Concurrent identical withdrawals split FIFO deposits once and create one refund per allocation", async () => {
    const second = await fund(creator, 20); const key = crypto.randomUUID();
    const responses = await Promise.all([withdraw(creator, 15, key), withdraw(creator, 15, key)]);
    for (const r of responses) expect(r, [200, 201, 202]);
    assert.equal(responses[0].body.data.refund_request.id, responses[1].body.data.refund_request.id);
    const request = await settled(creator, 15, key, responses[0]);
    assert.equal(request.status, "completed"); assert.equal(request.items.length, 2);
    assert.equal(Number(request.items.find((i) => i.deposit_id === primary.id).amount), 10);
    assert.equal(Number(request.items.find((i) => i.deposit_id === second.id).amount), 5);
    await balances(creator, 15, 0, 15);
    for (const item of request.items) {
      const refund = await stripe.refunds.retrieve(item.provider_refund_id);
      expect(await deliver("refund.updated", refund), 200);
      expect(await deliver("refund.updated", { ...refund, status: "pending" }), 200);
      assert.equal((await stripe.refunds.list({ payment_intent: item.provider_payment_id, limit: 100 })).data.length, 1);
    }
    await balances(creator, 15, 0, 15);
    expect(await withdraw(creator, 16, key), 409);
    expect(await withdraw(outsider, 15, key), 400);
    await pool.query("UPDATE users SET is_email_verified=false WHERE id=$1", [creator]);
    expect(await withdraw(creator, 15, key), 200);
    await pool.query("UPDATE users SET is_email_verified=true WHERE id=$1", [creator]);
  });
  await step("Concurrent different withdrawals cannot overspend available balance or original funding", async () => {
    const id = await user(); await fund(id, 10); const a = crypto.randomUUID(), b = crypto.randomUUID();
    const result = await Promise.all([withdraw(id, 8, a), withdraw(id, 8, b)]);
    assert.equal(result.filter((r) => r.status === 400).length, 1);
    const winner = result.findIndex((r) => r.status !== 400);
    assert.equal((await settled(id, 8, winner === 0 ? a : b, result[winner])).status, "completed");
    await balances(id, 2, 0, 8);
  });
  await step("Definitive refund creation failure restores reservation once without a provider refund", async () => {
    const id = await user(); const source = await fund(id, 10); const key = crypto.randomUUID();
    refundFault = "reject";
    const request = await settled(id, 5, key); assert.equal(request.status, "failed"); await balances(id, 10, 0);
    expect(await withdraw(id, 5, key), 200); await balances(id, 10, 0);
    assert.equal((await stripe.refunds.list({ payment_intent: source.pi, limit: 100 })).data.length, 0);
  });
  await step("Lost provider response keeps funds reserved; retry discovers the real refund without creating another", async () => {
    const id = await user(); const source = await fund(id, 10); const key = crypto.randomUUID(); const before = refundCreates;
    refundFault = "drop_response"; expect(await withdraw(id, 5, key), 202); await balances(id, 5, 5);
    const request = await settled(id, 5, key); assert.equal(request.status, "completed"); await balances(id, 5, 0, 5);
    assert.equal(refundCreates - before, 1);
    assert.equal((await stripe.refunds.list({ payment_intent: source.pi, limit: 100 })).data.length, 1);
  });
  await step("Old uncertain refund submissions stay reserved for reconciliation instead of blind recreation", async () => {
    const id = await user(); await fund(id, 10); const key = crypto.randomUUID();
    refundFault = "timeout_before"; const first = expect(await withdraw(id, 5, key), 202);
    const requestId = first.data.refund_request.id;
    await pool.query("UPDATE creator_wallet_refund_items SET created_at=NOW()-interval '2 days',last_submission_at=NOW()-interval '2 days',processing_at=NOW()-interval '2 days',status_unknown_at=NOW()-interval '2 days' WHERE refund_request_id=$1", [requestId]);
    const before = refundCreates; expect(await withdraw(id, 5, key), 202); assert.equal(refundCreates, before); await balances(id, 5, 5);
  });
  await step("Old unlinked deposit attempts cannot recreate a potentially expired provider idempotency key", async () => {
    const id = await user(), key = crypto.randomUUID();
    await pool.query("INSERT INTO creator_wallet_deposits (creator_id,amount,remaining_refundable_amount,payment_provider,currency,status,client_request_id,created_at) VALUES ($1,10,0,'stripe','usd','pending',$2,NOW()-interval '2 days')", [id, key]);
    const before = intentIds.size; const result = expect(await api(id, "/wallet/deposit", { amount: 10, client_request_id: key }), 409);
    assert.equal(result.code, "CREATOR_DEPOSIT_MANUAL_RECONCILIATION_REQUIRED"); assert.equal(intentIds.size, before);
  });
  report.result = "passed";
}
async function cleanup() {
  if (server) await new Promise((resolve) => { server.close(resolve); server.closeIdleConnections?.(); });
  for (const id of intentIds) try {
    const pi = await stripe.paymentIntents.retrieve(id); assert.equal(pi.livemode, false);
    if (pi.status === "succeeded") {
      const refunds = await stripe.refunds.list({ payment_intent: id, limit: 100 });
      const reserved = refunds.data.filter((r) => !["failed", "canceled"].includes(r.status)).reduce((sum, r) => sum + r.amount, 0);
      if (pi.amount_received > reserved) await stripe.refunds.create({ payment_intent: id, amount: pi.amount_received - reserved,
        metadata: { transaction_purpose: "sandbox_test_cleanup", dby_test_run: run } }, { idempotencyKey: `dby-wallet-cleanup:${run}:${id}` });
    } else if (pi.status !== "canceled") await stripe.paymentIntents.cancel(id);
    report.cleanup.push({ payment_intent: id, result: "completed" });
  } catch (error) { report.cleanup.push({ payment_intent: id, result: "failed", error: safeError(error) }); process.exitCode = 1; }
}
(async () => {
  try { await main(); } catch (error) { report.result = "failed"; report.error = safeError(error); console.error(`FAIL ${report.error}`); process.exitCode = 1; }
  finally {
    refundFault = null;
    try { await cleanup(); } catch (error) { report.cleanup_error = safeError(error); process.exitCode = 1; }
    if (isolated) try { await isolated.dispose(); report.database_cleanup = "completed"; console.log(`Removed isolated database: ${isolated.name}`); }
    catch { report.database_cleanup = "failed"; report.database = isolated.name; process.exitCode = 1; }
    if (process.exitCode && report.result === "passed") report.result = "cleanup_failed";
    report.finished_at = new Date().toISOString(); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`Creator wallet suite: ${report.result.toUpperCase()} (${report.checks.length} checks passed)`); console.log(`Wallet report: ${reportPath}`);
  }
})();
