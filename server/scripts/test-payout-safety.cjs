const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { isolatedServer } = require("./support/isolated-app.cjs");
const designer = randomUUID(), bank = randomUUID(), requestId = randomUUID(), key = randomUUID();
const payout = { id: requestId, designer_id: designer, bank_account_id: bank, amount: "20.00", payout_method: "manual", provider: null, status: "pending" };
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function setup(row = payout, bankRow = null) {
  const calls = [];
  const client = { release() {}, async query(sql, values) {
    calls.push({ sql, values });
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
    if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
    if (/FROM designer_payout_requests/.test(sql)) return { rows: row ? [row] : [] };
    if (/FROM designer_bank_accounts/.test(sql)) return { rows: bankRow ? [bankRow] : [] };
    if (/FROM designer_wallets/.test(sql)) return { rows: [{ available_balance: 80, pending_payout_balance: 20 }] };
    throw new Error("Unexpected financial write");
  } };
  const db = { async connect() { return client; }, async query(sql, values) {
    calls.push({ sql, values, outsideTransaction: true });
    if (/dp.country/.test(sql)) return { rows: [{ id: designer, country: "Nepal" }] };
    throw new Error("Bank validation must happen inside the payout transaction");
  } };
  return { calls, controller: isolatedServer({ db, stripe: {} }).load("controllers/designerFinanceController.js") };
}
function request(body = {}) { return { user: { id: designer }, params: { id: requestId }, headers: {}, body: { amount: 20, client_request_id: key, ...body } }; }
test("payout retry rejects a changed explicit bank destination without writing money", async () => {
  const { controller } = setup(); const res = response();
  await controller.requestPayout(request({ bank_account_id: randomUUID() }), res);
  assert.equal(res.statusCode, 409);
});
test("payout retry succeeds even when the old bank is no longer selectable", async () => {
  const { controller, calls } = setup(); const res = response();
  await controller.requestPayout(request({ bank_account_id: bank }), res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.idempotent, true);
  assert.equal(calls.some(({ sql }) => /FROM designer_bank_accounts/.test(sql)), false);
});
test("changed payout amount cannot reuse a request key", async () => {
  const { controller } = setup(); const res = response();
  await controller.requestPayout(request({ amount: 21 }), res); assert.equal(res.statusCode, 409);
});
test("new payout validates a verified bank under the bank replacement lock", async () => {
  const { controller, calls } = setup(null); const res = response();
  await controller.requestPayout(request(), res); assert.equal(res.statusCode, 409);
  const bankLookup = calls.findIndex(({ sql }) => /FROM designer_bank_accounts/.test(sql));
  const lock = calls.findIndex(({ values }) => values?.[0] === "designer-bank-account");
  assert.ok(lock > 0 && lock < bankLookup);
  assert.match(calls[bankLookup].sql, /FOR SHARE/);
  assert.equal(calls[bankLookup].outsideTransaction, undefined);
});
for (const [name, change] of [
  ["external transfer reference", { provider_transaction_id: "BANK-SENT-123" }],
  ["historical provider", { provider: "stripe" }],
  ["processing payout", { status: "processing" }],
  ["completed payout", { status: "completed" }],
]) test(`designer cancellation rejects ${name} without restoring funds`, async () => {
  const { controller } = setup({ ...payout, ...change }); const res = response();
  await controller.cancelPayoutRequest(request(), res); assert.equal(res.statusCode, 409);
});
test("repeated cancellation is idempotent without another wallet write", async () => {
  const { controller } = setup({ ...payout, status: "cancelled" }); const res = response();
  await controller.cancelPayoutRequest(request(), res); assert.equal(res.statusCode, 200); assert.equal(res.body.idempotent, true);
});
