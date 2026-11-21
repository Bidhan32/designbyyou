const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { isolatedServer } = require("./support/isolated-app.cjs");
const { cleanupRecordedPortalConfiguration } = require("./support/subscription-cleanup.cjs");
process.env.CREATOR_SUBSCRIPTION_SIGNUPS_ENABLED = "true";
process.env.STRIPE_SECRET_KEY = "sk_test_offline";
process.env.CREATOR_SUBSCRIPTION_MONTHLY_PRICE_ID = "price_monthly";
process.env.CREATOR_SUBSCRIPTION_QUARTERLY_PRICE_ID = "price_quarterly";
process.env.CREATOR_SUBSCRIPTION_YEARLY_PRICE_ID = "price_yearly";
process.env.FRONTEND_URL = "http://127.0.0.1:5173";
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function setup() {
  const owner = { id: randomUUID(), role: "creator", email: "test@example.invalid", full_name: "Synthetic Creator", stripe_customer_id: "cus_owned", subscription_tier: "free", subscription_status: null };
  const calls = [], sessions = [], subscriptions = [];
  let locked = true, unlockFails = false, writes = 0, portals = 0, creates = 0, metadata = { user_id: owner.id, customer_purpose: "creator_subscription" };
  const db = { async query(sql, values) {
    calls.push({ sql, values });
    if (/SELECT/.test(sql) && /FROM users/.test(sql)) return { rows: [owner] };
    if (/UPDATE users/.test(sql)) { writes++; return { rows: [owner] }; }
    throw new Error("Unexpected query");
  }, async connect() { return { async query(sql) {
    calls.push({ sql });
    if (/pg_try_advisory_lock/.test(sql)) return { rows: [{ locked }] };
    if (/pg_advisory_unlock/.test(sql)) { if (unlockFails) throw new Error("Injected unlock failure"); return { rows: [] }; }
    throw new Error("Unexpected checkout transaction");
  }, release(discard) { calls.push({ release: true, discard }); } }; } };
  const stripe = { prices: { async retrieve(id) {
    return { id, active: true, billing_scheme: "per_unit", unit_amount: { price_monthly: 4000, price_quarterly: 10500, price_yearly: 29900 }[id], currency: "usd",
      recurring: { interval: "month", interval_count: { price_monthly: 1, price_quarterly: 3, price_yearly: 12 }[id], usage_type: "licensed" } };
  } }, customers: {
    async retrieve() { return { id: "cus_owned", email: owner.email, name: owner.full_name, metadata }; },
    async update() { calls.push({ customerUpdate: true }); },
  }, subscriptions: { async list() { return { data: subscriptions, has_more: false }; } }, checkout: { sessions: {
    async list() { return { data: sessions.filter((s) => s.status === "open"), has_more: false }; },
    async listLineItems(id) { return { data: [{ price: { id: sessions.find((s) => s.id === id).price }, quantity: 1 }], has_more: false }; },
    async create(payload) { creates++; const session = { id: `cs_test_${creates}`, url: "https://checkout.stripe.com/test", status: "open", mode: "subscription", metadata: payload.metadata, price: payload.line_items[0].price }; sessions.push(session); return session; },
    async expire(id) { sessions.find((s) => s.id === id).status = "expired"; },
  } }, billingPortal: { sessions: { async create() { portals++; return { url: "https://billing.stripe.com/test" }; } } } };
  const controller = isolatedServer({ db, stripe }).load("controllers/creators/subscriptionController.js");
  return { owner, db, controller, stripe, calls, sessions, subscriptions,
    setMetadata(value) { metadata = value; }, setLocked(value) { locked = value; }, setUnlockFails() { unlockFails = true; },
    stats() { return { writes, portals, creates }; } };
}
async function checkout(s, plan = "monthly") { const res = response(); await s.controller.createCheckoutSession({ user: { id: s.owner.id }, body: { plan, client_request_id: randomUUID() } }, res); return res; }
test("eligible creators see the configured recurring prices and can checkout by default", async () => {
  delete process.env.CREATOR_SUBSCRIPTION_SIGNUPS_ENABLED;
  try {
    const s = setup();
    const result = response();
    await s.controller.getSubscriptionStatus({ user: { id: s.owner.id }, query: { offers: "1" } }, result);
    assert.deepEqual(result.body.data.offers.map(offer => [offer.plan, offer.amount, offer.currency]), [
      ["monthly", 40, "USD"], ["quarterly", 105, "USD"], ["yearly", 299, "USD"],
    ]);
    assert.equal((await checkout(s)).statusCode, 201);
  } finally {
    process.env.CREATOR_SUBSCRIPTION_SIGNUPS_ENABLED = "true";
  }
});
test("a previous price renews existing access and cannot be sold as a new offer", async () => {
  process.env.CREATOR_SUBSCRIPTION_MONTHLY_LEGACY_PRICE_IDS = "price_previous";
  try {
    const s = setup();
    const result = await s.controller.applySubscriptionObjectInternal({ object: "subscription", id: "sub_owned", customer: "cus_owned", status: "active", metadata: { user_id: s.owner.id }, items: { data: [{ price: { id: "price_previous" } }] } }, s.db);
    assert.equal(result.plan, "monthly");
    const price = await s.stripe.prices.retrieve("price_monthly");
    s.stripe.prices.retrieve = async () => ({ ...price, unit_amount: 3500 });
    assert.equal((await checkout(s)).statusCode, 503);
    assert.equal(s.stats().creates, 0);
  } finally { delete process.env.CREATOR_SUBSCRIPTION_MONTHLY_LEGACY_PRICE_IDS; }
});
test("sandbox checkout offers Basic and Pro and rejects live or mispriced offers", async () => {
  const names = ["CREATOR_SUBSCRIPTION_BASIC_TEST_PRICE_ID", "CREATOR_SUBSCRIPTION_PRO_TEST_PRICE_ID"];
  const previous = names.map(name => process.env[name]);
  try {
    process.env[names[0]] = "price_basic";
    process.env[names[1]] = "price_pro";
    const s = setup();
    const template = await s.stripe.prices.retrieve("price_monthly");
    s.stripe.prices.retrieve = async id => ({ ...template, id, livemode: false, unit_amount: id === "price_basic" ? 5000 : 10000 });
    const res = response();
    await s.controller.getSubscriptionStatus({ user: { id: s.owner.id }, query: { offers: "1" } }, res);
    assert.deepEqual(res.body.data.offers.map(o => [o.plan, o.amount]), [["basic", 50], ["pro", 100]]);
    for (const plan of ["basic", "pro"]) assert.equal((await checkout(s, plan)).statusCode, 201);
    s.stripe.prices.retrieve = async () => ({ ...template, id: "price_basic", livemode: true, unit_amount: 5000 });
    assert.equal((await checkout(s, "basic")).statusCode, 503);
    s.stripe.prices.retrieve = async () => ({ ...template, id: "price_basic", livemode: false, unit_amount: 4000 });
    assert.equal((await checkout(s, "basic")).statusCode, 503);
  } finally {
    names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; });
  }
});
test("a mismatched billing interval cannot be purchased", async () => {
  const s = setup();
  const monthly = await s.stripe.prices.retrieve("price_monthly");
  s.stripe.prices.retrieve = async () => monthly;
  assert.equal((await checkout(s, "quarterly")).statusCode, 503);
  assert.equal(s.stats().creates, 0);
});
test("explicit pause blocks checkout before contacting Stripe", async () => {
  const s = setup();
  process.env.CREATOR_SUBSCRIPTION_SIGNUPS_ENABLED = "false";
  try {
    const result = await checkout(s);
    assert.equal(result.statusCode, 409);
    assert.equal(result.body.code, "SUBSCRIPTION_SIGNUPS_PAUSED");
    assert.equal(s.stats().creates, 0);
  } finally {
    process.env.CREATOR_SUBSCRIPTION_SIGNUPS_ENABLED = "true";
  }
});
test("repeated checkout requests resume the same open session even with a new request UUID", async () => {
  const s = setup(); const first = await checkout(s), again = await checkout(s);
  assert.equal(first.statusCode, 201); assert.equal(again.statusCode, 201);
  assert.equal(first.body.checkout_session_id, again.body.checkout_session_id); assert.equal(again.body.idempotent, true); assert.equal(s.stats().creates, 1);
});
test("changing billing plan expires the old payable checkout before creating a replacement", async () => {
  const s = setup(); await checkout(s); const next = await checkout(s, "yearly");
  assert.equal(next.statusCode, 201); assert.equal(s.sessions[0].status, "expired"); assert.equal(s.sessions[1].price, "price_yearly");
});
test("checkout already being prepared returns conflict without contacting Stripe", async () => {
  const s = setup(); s.setLocked(false); const res = await checkout(s);
  assert.equal(res.statusCode, 409); assert.equal(res.body.code, "SUBSCRIPTION_CHECKOUT_IN_PROGRESS"); assert.equal(s.stats().creates, 0);
});
test("checkout lock is released after provider errors", async () => {
  const s = setup(); s.stripe.checkout.sessions.list = async () => { throw new Error("Injected provider failure"); };
  assert.equal((await checkout(s)).statusCode, 500);
  assert.ok(s.calls.some(({ sql }) => sql?.includes("pg_advisory_unlock")));
  assert.ok(s.calls.some(({ release, discard }) => release && discard === false));
});
test("failed advisory unlock discards the pooled connection", async () => {
  const s = setup(); s.setUnlockFails(); assert.equal((await checkout(s)).statusCode, 201);
  assert.ok(s.calls.some(({ release, discard }) => release && discard === true));
});
for (const action of ["checkout", "portal"]) test(`${action} refuses a foreign Stripe customer instead of rewriting its ownership metadata`, async () => {
  const s = setup(); s.setMetadata({ user_id: randomUUID(), customer_purpose: "creator_subscription" });
  let res;
  if (action === "checkout") res = await checkout(s);
  else { res = response(); await s.controller.createPortalSession({ user: { id: s.owner.id } }, res); }
  assert.equal(res.statusCode, 409); assert.equal(s.stats().portals, 0); assert.equal(s.stats().creates, 0);
  assert.equal(s.calls.some(({ customerUpdate }) => customerUpdate), false);
});
test("incomplete subscription history cannot silently allow another checkout", async () => {
  const s = setup(); s.stripe.subscriptions.list = async () => ({ data: [], has_more: true });
  assert.equal((await checkout(s)).statusCode, 409); assert.equal(s.stats().creates, 0);
});
test("multiple open subscription checkouts require reconciliation", async () => {
  const s = setup(); await checkout(s); s.sessions.push({ ...s.sessions[0], id: "cs_test_duplicate" });
  assert.equal((await checkout(s)).statusCode, 409); assert.equal(s.stats().creates, 1);
});
for (const status of ["incomplete", "trialing", "active", "past_due", "unpaid", "paused"]) test(`${status} subscription blocks a second checkout`, async () => {
  const s = setup(); s.subscriptions.push({ object: "subscription", id: "sub_owned", customer: "cus_owned", status, metadata: { user_id: s.owner.id }, items: { data: [{ price: { id: "price_monthly" } }] } });
  assert.equal((await checkout(s)).statusCode, 409); assert.equal(s.stats().creates, 0);
});
for (const [status, tier] of [["active", "monthly"], ["trialing", "monthly"], ["past_due", "monthly"], ["incomplete", "free"], ["incomplete_expired", "free"], ["canceled", "free"], ["unpaid", "free"], ["paused", "free"]]) test(`${status} maps to ${tier} access`, async () => {
  const s = setup(); const result = await s.controller.applySubscriptionObjectInternal({ object: "subscription", id: "sub_owned", customer: "cus_owned", status, metadata: { user_id: s.owner.id }, items: { data: [{ price: { id: "price_monthly" } }] } }, s.db);
  assert.equal(result.success, true); assert.equal(result.plan, tier);
  assert.equal(s.calls.find(({ sql }) => /UPDATE users/.test(sql)).values[3], tier);
});
test("unrecognized Stripe price never grants paid access", async () => {
  const s = setup(); const result = await s.controller.applySubscriptionObjectInternal({ object: "subscription", id: "sub_owned", customer: "cus_owned", status: "active", metadata: { user_id: s.owner.id }, items: { data: [{ price: { id: "price_foreign" } }] } }, s.db);
  assert.equal(result.plan, "free");
});
test("checkout completion with conflicting creator identities cannot link or activate billing", async () => {
  const s = setup(); const result = await s.controller.processCheckoutSessionCompletedInternal({ object: "checkout.session", mode: "subscription", client_reference_id: s.owner.id, metadata: { user_id: randomUUID() }, customer: "cus_owned", subscription: "sub_owned" }, s.db);
  assert.equal(result.success, false); assert.equal(s.stats().writes, 0);
});

for (const [label, override, expected, writes] of [
  ["default", { is_default: true }, "retained_default_configuration", 0],
  ["non-default", { is_default: false }, "completed", 1],
  ["already inactive", { active: false, is_default: false }, "completed", 0],
]) test(`cleanup handles ${label} run-owned portal configuration safely`, async () => {
  let updates = 0;
  const stripe = { billingPortal: { configurations: {
    async retrieve() { return { id: "bpc_test", livemode: false, active: true, metadata: { dby_test_run: "run-test" }, ...override }; },
    async update(id, change) { updates++; assert.equal(id, "bpc_test"); assert.deepEqual(change, { active: false }); return { active: false }; },
  } } };
  const result = await cleanupRecordedPortalConfiguration(stripe, { resource: "bpc_test" }, { run: "run-test" });
  assert.equal(result.result, expected); assert.equal(updates, writes);
});
test("cleanup refuses a foreign or live portal configuration without updating it", async () => {
  for (const config of [{ livemode: true, metadata: { dby_test_run: "run-test" } }, { livemode: false, metadata: { dby_test_run: "someone-else" } }]) {
    const stripe = { billingPortal: { configurations: {
      async retrieve() { return { id: "bpc_test", active: true, ...config }; },
      async update() { assert.fail("Unsafe configuration mutation"); },
    } } };
    await assert.rejects(cleanupRecordedPortalConfiguration(stripe, { resource: "bpc_test" }, { run: "run-test" }));
  }
});

test("live monthly offers require matching live prices and key", async () => {
  const env = {STRIPE_SECRET_KEY:"sk_live_offline", CREATOR_SUBSCRIPTION_BASIC_LIVE_PRICE_ID:"price_live_basic", CREATOR_SUBSCRIPTION_PRO_LIVE_PRICE_ID:"price_live_pro"};
  const previous = Object.fromEntries(Object.keys(env).map(name => [name,process.env[name]]));
  Object.assign(process.env,env);
  try {
    const s = setup();
    const template = await s.stripe.prices.retrieve("price_monthly");
    s.stripe.prices.retrieve = async id => ({ ...template, id, livemode:true, unit_amount:id === "price_live_basic" ? 5000 : 10000 });
    for (const plan of ["basic","pro"]) assert.equal((await checkout(s,plan)).statusCode,201);
    s.stripe.prices.retrieve = async id => ({ ...template,id,livemode:false,unit_amount:5000 });
    assert.equal((await checkout(s,"basic")).statusCode,503);
  } finally {
    for (const [name,value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
