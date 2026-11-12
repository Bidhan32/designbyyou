"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), Stripe = require("stripe"), jwt = require("jsonwebtoken");
const { isolatedServer, assertTestKey } = require("./support/isolated-app.cjs");
const { sandboxDatabase } = require("./support/sandbox-database.cjs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
const run = crypto.randomUUID(), reportPath = path.resolve(__dirname, "../subscription-sandbox-report.json");
const report = { run, result: "running", started_at: new Date().toISOString(), checks: [], cleanup: [],
  webhook_transport: "Locally signed events; subscription state retrieved from real Stripe test objects",
  scope: "API checkout and plan lifecycle, test-clock renewal/failure; no hosted UI/3DS or Stripe outbound delivery" };
const authSecret = crypto.randomBytes(48).toString("hex"), secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
const customers = new Set(), subscriptions = new Set(), sessions = new Set(), prices = [];
let stripe, isolated, server, origin, product, portalConfig, clock, creator, designer;
let failSync = false;
function safeError(e) { return e.type?.startsWith("Stripe") ? `${e.type}${e.code ? ` (${e.code})` : ""}` : e.code ? `Operation failed (${e.code})` : String(e.message || "Failure").replace(/(?:sk|rk|pk)_(?:test|live)_\w+|whsec_\w+/g, "[redacted]"); }
async function step(name, fn) { await fn(); report.checks.push(name); console.log(`PASS ${name}`); }
function expect(r, status) { assert.ok([status].flat().includes(r.status), `Expected HTTP ${status}, received ${r.status}: ${r.body.message || "unexpected response"}`); return r.body; }
async function api(actor, route, body = {}, method = "POST") {
  const token = actor ? jwt.sign({ id: actor, tokenVersion: 0 }, authSecret, { algorithm: "HS256", expiresIn: "1h" }) : null;
  const r = await fetch(`${origin}/api/v1/subscription${route}`, { method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
  return { status: r.status, body: await r.json() };
}
async function user(role = "creator") {
  const id = crypto.randomUUID(); await isolated.pool.query(`INSERT INTO users (id,role,full_name,email,password_hash,is_email_verified,approval_status,token_version)
    VALUES ($1,$2,$3,$4,'isolated-no-login',true,'approved',0)`, [id, role, "Subscription Test", `${id}@example.invalid`]); return id;
}
async function row(id) { return (await isolated.pool.query("SELECT * FROM users WHERE id=$1", [id])).rows[0]; }
async function deliver(type, object, event = `evt_dby_${crypto.randomBytes(12).toString("hex")}`) {
  const payload = JSON.stringify({ id: event, object: "event", type, livemode: false, created: Math.floor(Date.now() / 1000), data: { object } });
  for (let attempt = 0; attempt < 15; attempt++) {
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const r = await fetch(`${origin}/api/v1/webhooks/stripe`, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": signature }, body: payload, signal: AbortSignal.timeout(30000) });
    const result = { status: r.status, body: await r.json() };
    // Subscription sync uses try-locks: concurrent deliveries must be retried.
    const lockBusy = r.status === 500 && result.body.message === "The Creator subscription is currently being synchronized. Stripe should retry this event.";
    if (!lockBusy) return result;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Subscription webhook lock did not become available");
}
async function checkout(id, plan = "monthly") { return api(id, "/create-checkout-session", { plan, client_request_id: crypto.randomUUID() }); }
function periodEnd(sub) { return sub.items.data[0].current_period_end || sub.current_period_end; }
async function advance(to) {
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: to });
  console.log("Waiting for Stripe test-clock simulation (up to 90 seconds)...");
  for (let n = 0; n < 90; n++) {
    const state = await stripe.testHelpers.testClocks.retrieve(clock.id);
    if (state.status === "ready") { clock = state; return; }
    if (state.status !== "advancing") throw new Error(`Stripe test clock entered ${state.status}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Stripe test-clock advance timed out");
}
async function ensureInvoiceAttempt(sub, shouldPay) {
  // Clock advancement may leave a newly-created invoice waiting to finalize.
  let invoice = await stripe.invoices.retrieve(typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice.id);
  if (invoice.status === "draft") invoice = await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: false });
  if (invoice.status === "open") try { invoice = await stripe.invoices.pay(invoice.id); }
  catch (e) { if (shouldPay || e.type !== "StripeCardError") throw e; invoice = await stripe.invoices.retrieve(invoice.id); }
  if (shouldPay) assert.equal(invoice.status, "paid");
  else { assert.equal(invoice.status, "open"); assert.ok(invoice.attempt_count > 0); }
  return invoice;
}
async function main() {
  assertTestKey(process.env.STRIPE_SECRET_KEY);
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 1 });
  await step("Stripe account is reachable and test-mode", async () => assert.equal((await stripe.balance.retrieve()).livemode, false));
  // Read an existing configuration; creating the account's first configuration
  // can make it a default that Stripe will not allow cleanup to deactivate.
  const configuredPortal = String(process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID || "").trim();
  portalConfig = configuredPortal
    ? await stripe.billingPortal.configurations.retrieve(configuredPortal)
    : (await stripe.billingPortal.configurations.list({ active: true, is_default: true, limit: 1 })).data[0];
  if (!portalConfig || !portalConfig.active || portalConfig.livemode !== false) throw new Error("An active test-mode Billing Portal configuration is required. Configure one in Stripe before running this suite.");
  report.portal_configuration = { id: portalConfig.id, usage: "existing configuration; read only" };
  // Capture only this run's resources, including acceptance before response loss.
  for (const [api, method, ids] of [[stripe.customers, "create", customers], [stripe.subscriptions, "create", subscriptions], [stripe.checkout.sessions, "create", sessions]]) {
    const original = api[method].bind(api); api[method] = async (...args) => { const object = await original(...args); assert.equal(object.livemode, false); ids.add(object.id); return object; };
  }
  isolated = await sandboxDatabase();
  product = await stripe.products.create({ name: `DBY isolated subscription ${run}`, metadata: { dby_test_run: run } });
  for (const [plan, count, amount] of [["monthly", 1, 100], ["quarterly", 3, 250], ["yearly", 12, 900]]) {
    const price = await stripe.prices.create({ product: product.id, currency: "usd", unit_amount: amount, recurring: { interval: "month", interval_count: count }, metadata: { dby_test_run: run } });
    prices.push(price); process.env[`CREATOR_SUBSCRIPTION_${plan.toUpperCase()}_PRICE_ID`] = price.id;
  }
  process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID = portalConfig.id;
  process.env.NODE_ENV = "test"; process.env.JWT_SECRET = authSecret;
  process.env.STRIPE_WEBHOOK_SECRET = secret; process.env.STRIPE_CONNECT_WEBHOOK_SECRET = secret;
  process.env.FRONTEND_URL = "http://127.0.0.1:5173";
  const pool = isolated.pool;
  const db = { query: pool.query.bind(pool), async connect() {
    const client = await pool.connect(); return { release: (...args) => client.release(...args), async query(sql, values) {
      if (failSync && /UPDATE users[\s\S]*subscription_tier/.test(sql)) { failSync = false; throw new Error("Injected subscription state-write failure"); }
      return client.query(sql, values);
    } };
  } };
  const { app } = isolatedServer({ db, stripe, secretKey: process.env.STRIPE_SECRET_KEY }).load("index.js");
  server = await new Promise((resolve, reject) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); s.once("error", reject); });
  origin = `http://127.0.0.1:${server.address().port}`; creator = await user(); designer = await user("designer");
  await step("Checkout enforces authentication, creator role, verified email, and trusted plan names", async () => {
    expect(await checkout(null), 401); expect(await checkout(designer), 403);
    await pool.query("UPDATE users SET is_email_verified=false WHERE id=$1", [creator]); expect(await checkout(creator), 403);
    await pool.query("UPDATE users SET is_email_verified=true,approval_status='pending' WHERE id=$1", [creator]);
    expect(await checkout(creator, "arbitrary"), 400);
  });
  await step("Concurrent checkout requests create one customer and one open payable session", async () => {
    const results = await Promise.all([checkout(creator), checkout(creator)]);
    assert.equal(results.filter((r) => r.status === 201).length, 1); assert.equal(results.filter((r) => r.status === 409).length, 1);
    const again = expect(await checkout(creator), 201);
    assert.equal(again.checkout_session_id, results.find((r) => r.status === 201).body.checkout_session_id);
    const current = await row(creator); assert.ok(customers.has(current.stripe_customer_id));
    assert.equal((await stripe.checkout.sessions.list({ customer: current.stripe_customer_id, status: "open", limit: 100 })).data.length, 1);
    assert.equal(current.subscription_tier, "free");
  });
  await step("Choosing a different plan expires the old checkout before offering its replacement", async () => {
    const old = expect(await checkout(creator), 201); const replacement = expect(await checkout(creator, "yearly"), 201);
    assert.notEqual(old.checkout_session_id, replacement.checkout_session_id);
    assert.equal((await stripe.checkout.sessions.retrieve(old.checkout_session_id)).status, "expired");
    await stripe.checkout.sessions.expire(replacement.checkout_session_id);
  });
  let trial;
  await step("Real subscription state activates access; duplicate webhook processing is idempotent", async () => {
    const customer = (await row(creator)).stripe_customer_id;
    trial = await stripe.subscriptions.create({ customer, items: [{ price: prices[0].id }], trial_period_days: 7,
      metadata: { transaction_purpose: "creator_subscription", user_id: creator } });
    const event = `evt_dby_${crypto.randomBytes(12).toString("hex")}`;
    failSync = true; expect(await deliver("customer.subscription.created", trial, event), 500);
    assert.equal((await row(creator)).subscription_tier, "free");
    for (const r of await Promise.all([deliver("customer.subscription.created", trial, event), deliver("customer.subscription.created", trial, event)])) expect(r, 200);
    assert.equal((await row(creator)).subscription_tier, "monthly");
    expect(await checkout(creator), 409);
    expect(await api(creator, "/create-portal-session"), 200);
  });
  await step("API plan changes synchronize quarterly/yearly/monthly tiers from current provider prices", async () => {
    for (const [index, tier] of [[1, "quarterly"], [2, "yearly"], [0, "monthly"]]) {
      trial = await stripe.subscriptions.update(trial.id, { items: [{ id: trial.items.data[0].id, price: prices[index].id }], proration_behavior: "none" });
      expect(await deliver("customer.subscription.updated", trial), 200); assert.equal((await row(creator)).subscription_tier, tier);
    }
  });
  await step("Period-end cancellation retains access; cancellation completion revokes it despite stale active payloads", async () => {
    trial = await stripe.subscriptions.update(trial.id, { cancel_at_period_end: true });
    expect(await deliver("customer.subscription.updated", trial), 200);
    assert.equal((await row(creator)).subscription_cancel_at_period_end, true); assert.equal((await row(creator)).subscription_tier, "monthly");
    const old = trial; trial = await stripe.subscriptions.cancel(trial.id);
    expect(await deliver("customer.subscription.deleted", trial), 200);
    expect(await deliver("customer.subscription.updated", { ...old, status: "active" }), 200);
    assert.equal((await row(creator)).subscription_tier, "free"); assert.equal((await row(creator)).subscription_status, "canceled");
  });
  let renewOwner, renewSub;
  await step("Test clock converts a trial to a paid subscription using a real test invoice", async () => {
    renewOwner = await user(); clock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now() / 1000), name: `DBY ${run}` });
    const customer = await stripe.customers.create({ test_clock: clock.id, metadata: { user_id: renewOwner, customer_purpose: "creator_subscription" } });
    await pool.query("UPDATE users SET stripe_customer_id=$1 WHERE id=$2", [customer.id, renewOwner]);
    const method = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: method.id } });
    renewSub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: prices[0].id }], trial_end: clock.frozen_time + 7 * 86400,
      metadata: { transaction_purpose: "creator_subscription", user_id: renewOwner } });
    await advance(periodEnd(renewSub) + 7200); renewSub = await stripe.subscriptions.retrieve(renewSub.id);
    const invoice = await ensureInvoiceAttempt(renewSub, true);
    expect(await deliver("invoice.paid", invoice), 200);
    assert.equal((await row(renewOwner)).subscription_status, "active");
  });
  await step("A successful clock-driven renewal extends the stored billing period", async () => {
    renewSub = await stripe.subscriptions.retrieve(renewSub.id); const previous = periodEnd(renewSub);
    await advance(previous + 7200); renewSub = await stripe.subscriptions.retrieve(renewSub.id);
    expect(await deliver("invoice.payment_succeeded", await ensureInvoiceAttempt(renewSub, true)), 200);
    assert.ok(periodEnd(renewSub) > previous);
    assert.equal(new Date((await row(renewOwner)).subscription_active_until).getTime(), periodEnd(renewSub) * 1000);
  });
  await step("Failed clock-driven renewal retains past-due grace access and synchronizes collection state", async () => {
    const method = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: renewSub.customer });
    await stripe.customers.update(renewSub.customer, { invoice_settings: { default_payment_method: method.id } });
    await advance(periodEnd(renewSub) + 7200); renewSub = await stripe.subscriptions.retrieve(renewSub.id);
    const invoice = await ensureInvoiceAttempt(renewSub, false);
    expect(await deliver("invoice.payment_failed", invoice), 200);
    const current = await row(renewOwner); assert.equal(current.subscription_status, "past_due"); assert.equal(current.subscription_tier, "monthly");
    // Uncollectible is an actual provider action, not a fabricated status update.
    await stripe.invoices.markUncollectible(invoice.id);
    renewSub = await stripe.subscriptions.retrieve(renewSub.id);
    expect(await deliver("customer.subscription.updated", renewSub), 200);
    // Stripe account policies may retain active/past_due after uncollectible;
    // unpaid entitlement mapping is verified by the offline state matrix.
    assert.equal((await row(renewOwner)).subscription_status, renewSub.status);
  });
  report.result = "passed";
}
async function clean(name, action) { try { await action(); report.cleanup.push({ resource: name, result: "completed" }); } catch (e) { report.cleanup.push({ resource: name, result: "failed", error: safeError(e) }); process.exitCode = 1; } }
async function cleanup() {
  if (server) await new Promise((resolve) => { server.close(resolve); server.closeIdleConnections?.(); });
  for (const id of sessions) await clean(id, async () => { if ((await stripe.checkout.sessions.retrieve(id)).status === "open") await stripe.checkout.sessions.expire(id); });
  for (const id of subscriptions) await clean(id, async () => { if ((await stripe.subscriptions.retrieve(id)).status !== "canceled") await stripe.subscriptions.cancel(id); });
  for (const id of customers) await clean(`refunds:${id}`, async () => {
    const charges = await stripe.charges.list({ customer: id, limit: 100 });
    for (const charge of charges.data) if (charge.paid && charge.amount > charge.amount_refunded) await stripe.refunds.create({ charge: charge.id, amount: charge.amount - charge.amount_refunded,
      metadata: { transaction_purpose: "sandbox_test_cleanup", dby_test_run: run } }, { idempotencyKey: `dby-sub-cleanup:${run}:${charge.id}` });
  });
  for (const id of customers) await clean(id, async () => { const c = await stripe.customers.retrieve(id); if (!c.deleted) await stripe.customers.del(id); });
  if (clock) await clean(clock.id, () => stripe.testHelpers.testClocks.del(clock.id));
  for (const price of prices) await clean(price.id, () => stripe.prices.update(price.id, { active: false }));
  if (product) await clean(product.id, () => stripe.products.update(product.id, { active: false }));
}
(async () => {
  try { await main(); } catch (e) { report.result = "failed"; report.error = safeError(e); console.error(`FAIL ${report.error}`); process.exitCode = 1; }
  finally {
    try { await cleanup(); } catch (e) { report.cleanup_error = safeError(e); process.exitCode = 1; }
    if (isolated) try { await isolated.dispose(); report.database_cleanup = "completed"; console.log(`Removed isolated database: ${isolated.name}`); }
    catch { report.database_cleanup = "failed"; report.database = isolated.name; process.exitCode = 1; }
    if (process.exitCode && report.result === "passed") report.result = "cleanup_failed";
    report.finished_at = new Date().toISOString(); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`Subscription suite: ${report.result.toUpperCase()} (${report.checks.length} checks passed)`); console.log(`Subscription report: ${reportPath}`);
  }
})();
