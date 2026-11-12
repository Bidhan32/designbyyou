const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { isolatedServer } = require("./support/isolated-app.cjs");
process.env.STRIPE_SECRET_KEY = "sk_test_offline";
const creator = randomUUID(), depositId = randomUUID(), key = randomUUID();
const deposit = { id: depositId, creator_id: creator, client_request_id: key, amount: "10.00", currency: "usd", payment_provider: "stripe", provider_payment_id: "pi_wallet_owned" };
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
for (const [label, changed] of [["amount", { amount: "20.00" }], ["currency", { currency: "eur" }], ["provider", { payment_provider: "paypal" }]]) {
  test(`concurrent deposit INSERT loser rejects conflicting ${label} before Stripe access`, async () => {
    let selects = 0;
    const db = { async query(sql) {
      if (/INSERT INTO creator_wallets/.test(sql)) return { rows: [] };
      if (/INSERT INTO creator_wallet_deposits/.test(sql)) return { rows: [] };
      if (/FROM creator_wallet_deposits/.test(sql)) return { rows: ++selects === 1 ? [] : [{ ...deposit, ...changed }] };
      throw new Error("Unexpected financial write");
    } };
    const stripe = new Proxy({}, { get() { throw new Error("Conflicting request reached Stripe"); } });
    const controller = isolatedServer({ db, stripe }).load("controllers/creators/creatorFinanceController.js");
    const res = response(); await controller.createWalletDeposit({ user: { id: creator }, headers: {}, body: { amount: 10, client_request_id: key } }, res);
    assert.equal(selects, 2); assert.equal(res.statusCode, 409);
  });
}
function pi() { return { id: "pi_wallet_owned", status: "succeeded", amount: 1000, amount_received: 1000, currency: "usd",
  metadata: { transaction_purpose: "creator_wallet_deposit", deposit_id: depositId, creator_id: creator, client_request_id: key, amount_cents: "1000" } }; }
for (const [label, mutate] of [
  ["unpaid intent", (p) => { p.status = "requires_action"; }],
  ["wrong purpose", (p) => { p.metadata.transaction_purpose = "p2p_escrow_deposit"; }],
  ["foreign creator", (p) => { p.metadata.creator_id = randomUUID(); }],
  ["wrong request key", (p) => { p.metadata.client_request_id = "foreign"; }],
  ["wrong payment intent", (p) => { p.id = "pi_foreign"; }],
  ["wrong currency", (p) => { p.currency = "eur"; }],
  ["partial receipt", (p) => { p.amount_received = 999; }],
  ["wrong metadata amount", (p) => { p.metadata.amount_cents = "999"; }],
]) test(`creator deposit webhook rejects ${label} before wallet writes`, async () => {
  const controller = isolatedServer({ db: {}, stripe: {} }).load("controllers/creators/creatorFinanceController.js");
  const client = { async query(sql, values) {
    assert.match(sql, /SELECT \*\s+FROM creator_wallet_deposits/);
    return { rows: values[0] === depositId && values[1] === creator ? [deposit] : [] };
  } };
  const payment = pi(); mutate(payment);
  assert.equal((await controller.processWalletDepositSucceededInternal(payment, client)).success, false);
});
test("replayed credited deposit does not write wallet or ledger again", async () => {
  const controller = isolatedServer({ db: {}, stripe: {} }).load("controllers/creators/creatorFinanceController.js");
  const client = { async query(sql) { assert.match(sql, /SELECT \*\s+FROM creator_wallet_deposits/); return { rows: [{ ...deposit, credited_at: new Date(), status: "succeeded" }] }; } };
  const result = await controller.processWalletDepositSucceededInternal(pi(), client);
  assert.equal(result.success, true); assert.equal(result.idempotent, true);
});
