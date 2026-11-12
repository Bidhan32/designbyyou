const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Stripe = require("stripe");
const { isolatedServer, assertTestKey } = require("./support/isolated-app.cjs");
process.env.STRIPE_SECRET_KEY = "sk_test_offline";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_dby_offline_test";
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_dby_offline_test";

const creator = crypto.randomUUID(), designer = crypto.randomUUID(), bookingId = crypto.randomUUID();
const booking = { id: bookingId, creator_id: creator, designer_id: designer, agreed_price: "100.00",
  booking_type: "commission", client_request_id: bookingId, stripe_payment_intent_id: "pi_test_owned",
  status: "pending", escrow_locked: false };
function controllerFor(current = booking) {
  const queries = [];
  const client = { async query(sql) {
    queries.push(sql);
    if (/SELECT \*\s+FROM bookings/i.test(sql)) return { rows: [current] };
    if (/SELECT\s+gross_amount\s+FROM transactions/i.test(sql)) return { rows: [{ gross_amount: "110.00" }] };
    throw new Error("Unexpected financial write or query");
  } };
  return { controller: isolatedServer({ db: client, stripe: {} }).load("controllers/P2PBookingController.js"), client, queries };
}
function payment() {
  return { id: "pi_test_owned", status: "succeeded", amount: 11000, amount_received: 11000, currency: "usd",
    metadata: { booking_id: bookingId, creator_id: creator, designer_id: designer, client_request_id: bookingId,
      booking_type: "commission", base_price_cents: "10000", connection_fee_cents: "1000",
      total_charge_cents: "11000", transaction_purpose: "p2p_escrow_deposit" } };
}

test("sandbox runner refuses live and unknown keys before side effects", () => {
  assert.doesNotThrow(() => assertTestKey("sk_test_example"));
  assert.doesNotThrow(() => assertTestKey("rk_test_example"));
  for (const key of ["sk_live_example", "rk_live_example", "", "unknown"]) assert.throws(() => assertTestKey(key), /test key/);
});

for (const [label, mutate] of [
  ["unpaid intent", (pi) => { pi.status = "requires_payment_method"; }],
  ["wrong currency", (pi) => { pi.currency = "npr"; }],
  ["wrong purpose", (pi) => { pi.metadata.transaction_purpose = "other"; }],
  ["wrong creator", (pi) => { pi.metadata.creator_id = crypto.randomUUID(); }],
  ["wrong designer", (pi) => { pi.metadata.designer_id = crypto.randomUUID(); }],
  ["wrong intent", (pi) => { pi.id = "pi_other"; }],
  ["partial receipt", (pi) => { pi.amount_received = 10000; }],
  ["forged total", (pi) => { pi.metadata.total_charge_cents = "1"; }],
]) {
  test(`escrow rejects ${label} before financial writes`, async () => {
    const { controller, client } = controllerFor();
    const pi = payment(); mutate(pi);
    const result = await controller.processEscrowLockInternal(pi, client);
    assert.equal(result.success, false);
  });
}

test("a repeated succeeded payment cannot credit escrow twice", async () => {
  const { controller, client } = controllerFor({ ...booking, status: "funded", escrow_locked: true });
  const result = await controller.processEscrowLockInternal(payment(), client);
  assert.equal(result.success, true);
  assert.equal(result.idempotent, true);
});

test("late payment cannot reopen a cancelled booking", async () => {
  const { controller, client } = controllerFor({ ...booking, status: "cancelled" });
  const result = await controller.processEscrowLockInternal(payment(), client);
  assert.equal(result.ignored, true);
});

test("partial refund cannot release reserved escrow", async () => {
  const { controller, client } = controllerFor({ ...booking, status: "refund_pending", escrow_locked: true });
  const result = await controller.processRefundUpdatedInternal({ id: "re_test", payment_intent: "pi_test_owned",
    amount: 10000, status: "succeeded", metadata: { booking_id: bookingId, expected_refund_cents: "10000" } }, client);
  assert.equal(result.success, false);
  assert.match(result.reason, /full refund/);
});

test("an external refund after earnings release requires manual reconciliation", async () => {
  const { controller, client } = controllerFor({ ...booking, status: "completed", escrow_locked: false });
  const result = await controller.processRefundUpdatedInternal({ id: "re_test", payment_intent: "pi_test_owned",
    amount: 11000, status: "succeeded", metadata: { booking_id: bookingId, expected_refund_cents: "11000" } }, client);
  assert.equal(result.success, true);
  assert.equal(result.ignored, true);
  assert.equal(result.manualReconciliationRequired, true);
});

for (const [completed, expectedTier, expectedCommission] of [[0, "bronze", 10], [4, "silver", 15], [19, "gold", 20], [34, "platinum", 25], [49, "diamond", 30]]) {
  test(`completed booking ${completed + 1} pays ${expectedTier} designer commission`, async () => {
    let walletMovement;
    const db = { async query(sql, values) {
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
      if (/SELECT \*\s+FROM bookings/i.test(sql)) return { rows: [{ ...booking, status: "review_final", escrow_locked: true }] };
      if (/FROM designer_profiles/i.test(sql)) return { rows: [{ tier: "bronze", total_completed_bookings: completed }] };
      if (/UPDATE designer_wallets/i.test(sql)) { walletMovement = values; return { rows: [{ user_id: designer }] }; }
      if (/UPDATE bookings[\s\S]*RETURNING\s+creator_reward_points/i.test(sql)) return { rows: [{ creator_reward_points: 20 }] };
      if (/INSERT INTO creator_profiles/i.test(sql)) return { rows: [{ xp_points: 20 }] };
      if (/UPDATE (bookings|designer_profiles)|INSERT INTO transactions/i.test(sql)) return { rows: [] };
      throw new Error("Unexpected release SQL");
    }, release() {} };
    const controller = isolatedServer({ db: { connect: async () => db }, stripe: {} }).load("controllers/P2PBookingController.js");
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await controller.releaseP2PPayout({ user: { id: creator, role: "creator" }, params: { id: bookingId } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.payout.tier, expectedTier);
    assert.equal(res.body.payout.designerCommission, expectedCommission);
    assert.equal(res.body.payout.platformRetained, 100 - expectedCommission);
    assert.deepEqual(walletMovement, [100, expectedCommission, designer]);
  });
}

function webhookHandler() {
  const stripe = new Stripe("sk_test_offline");
  const db = { connect() { throw new Error("Invalid or unsupported webhooks must not access the database"); } };
  const router = isolatedServer({ db, stripe }).load("routes/webhookController.js");
  return { stripe, handle: router.stack.find((layer) => layer.route?.path === "/stripe").route.stack[0].handle };
}
for (const scenario of ["valid unsupported", "missing signature", "bad signature", "tampered bytes", "stale signature", "parsed JSON"]) {
  test(`webhook signature boundary: ${scenario}`, async (t) => {
    t.mock.method(console, "error", () => {});
    const { stripe, handle } = webhookHandler();
    const payload = JSON.stringify({ id: "evt_offline", type: "unhandled.event", livemode: false, data: { object: {} } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload,
      secret: scenario === "bad signature" ? "incorrect" : process.env.STRIPE_WEBHOOK_SECRET,
      timestamp: scenario === "stale signature" ? Math.floor(Date.now() / 1000) - 3600 : undefined });
    const body = scenario === "parsed JSON" ? JSON.parse(payload) : Buffer.from(scenario === "tampered bytes" ? payload + " " : payload);
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await handle({ body, get: () => scenario === "missing signature" ? undefined : signature }, res);
    assert.equal(res.statusCode, scenario === "valid unsupported" ? 200 : scenario === "parsed JSON" ? 500 : 400);
    if (scenario === "valid unsupported") assert.equal(res.body.ignored, true);
  });
}
