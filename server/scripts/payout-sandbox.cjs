"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { isolatedServer } = require("./support/isolated-app.cjs");
const { sandboxDatabase } = require("./support/sandbox-database.cjs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
const reportPath = path.resolve(__dirname, "../payout-sandbox-report.json");
const report = { started_at: new Date().toISOString(), result: "running", checks: [],
  scope: "Local manual payout accounting; no external bank transfers or Stripe API requests" };
const authSecret = crypto.randomBytes(48).toString("hex");
let isolated, server, origin, admin, creator, failCompletion = false;
let bankPause;
async function step(name, action) {
  await action(); report.checks.push(name); console.log(`PASS ${name}`);
}
async function user(role = "designer", country = "Nepal") {
  const id = crypto.randomUUID();
  await isolated.pool.query(`INSERT INTO users (id,role,full_name,email,password_hash,is_email_verified,approval_status,token_version)
    VALUES ($1,$2,$3,$4,'isolated-no-login',true,'approved',0)`, [id, role, `Payout Test ${role}`, `${id}@example.invalid`]);
  if (role === "designer") {
    await isolated.pool.query("INSERT INTO designer_profiles (user_id,portfolio_url,country,tier,total_completed_bookings,commission_rate) VALUES ($1,$2,$3,'bronze',0,10)", [id, "https://example.invalid/portfolio", country]);
    await isolated.pool.query("INSERT INTO designer_wallets (user_id,available_balance,pending_escrow_balance,pending_payout_balance) VALUES ($1,0,100,0)", [id]);
  }
  return id;
}
async function api(actor, route, body = {}, method = "POST") {
  const token = actor ? jwt.sign({ id: actor, tokenVersion: 0 }, authSecret, { algorithm: "HS256", expiresIn: "15m" }) : null;
  const response = await fetch(`${origin}/api/v1${route}`, { method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
  return { status: response.status, body: await response.json() };
}
function expect(response, status) { assert.ok([status].flat().includes(response.status), `Expected HTTP ${status}, received ${response.status}: ${response.body.message || "unexpected response"}`); return response.body; }
const finance = "/designer-finance";
const adminBase = "/superadmin/finance/manual-payouts";
const bankBody = (suffix = "1234") => ({ country_code: "NP", currency: "USD", account_holder_name: "Synthetic Designer", bank_name: "Sandbox Bank", account_number: `00000000${suffix}` });
async function saveBank(id, suffix) { return expect(await api(id, `${finance}/payout-accounts/bank`, bankBody(suffix), "PUT"), [200, 201]).data; }
async function verifyBank(bank) { expect(await api(admin, `/superadmin/finance/bank-accounts/${bank}/verification`, { status: "verified" }, "PATCH"), 200); }
async function fixture(available = 100) {
  const id = await user(); const bank = await saveBank(id); await verifyBank(bank.id);
  await isolated.pool.query("UPDATE designer_wallets SET available_balance=$1 WHERE user_id=$2", [available, id]);
  return { id, bank };
}
async function create(f, amount = 20, key = crypto.randomUUID(), bank = f.bank.id) {
  return api(f.id, `${finance}/payouts`, { amount, client_request_id: key, bank_account_id: bank });
}
async function balances(id, available, pending) {
  const w = (await isolated.pool.query("SELECT * FROM designer_wallets WHERE user_id=$1", [id])).rows[0];
  assert.equal(Number(w.available_balance), available); assert.equal(Number(w.pending_payout_balance), pending);
  assert.equal(Number(w.pending_escrow_balance), 100, "Payouts must never spend pending escrow");
}
async function main() {
  // Override only this process: no provider calls or production encryption keys.
  process.env.NODE_ENV = "test"; process.env.JWT_SECRET = authSecret;
  process.env.BANK_DETAILS_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  process.env.STRIPE_SECRET_KEY = "sk_test_isolatedNoProviderCalls";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_isolatedNoProviderCalls";
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.DESIGNER_MIN_PAYOUT_AMOUNT = "10";
  isolated = await sandboxDatabase();
  const pool = isolated.pool;
  const db = { query: pool.query.bind(pool), async connect() {
    const client = await pool.connect();
    return { release: () => client.release(), async query(sql, values) {
      if (bankPause?.held && /pg_advisory_xact_lock/.test(sql) && values?.[0] === "designer-bank-account") bankPause.attempted();
      if (failCompletion && /UPDATE designer_payout_requests[\s\S]*'completed'/.test(sql)) {
        failCompletion = false; throw new Error("Injected payout completion failure");
      }
      const result = await client.query(sql, values);
      if (bankPause && !bankPause.held && /FROM designer_bank_accounts[\s\S]*FOR SHARE/.test(sql)) {
        bankPause.held = true; bankPause.reached(); await bankPause.unblock;
      }
      return result;
    } };
  } };
  const stripe = new Proxy({}, { get() { throw new Error("External Stripe access is forbidden in manual payout tests"); } });
  const { app } = isolatedServer({ db, stripe, secretKey: process.env.STRIPE_SECRET_KEY }).load("index.js");
  server = await new Promise((resolve, reject) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); s.once("error", reject); });
  origin = `http://127.0.0.1:${server.address().port}`;
  admin = await user("superadmin"); creator = await user("creator");
  await step("Anonymous and creator accounts cannot request designer payouts or administer them", async () => {
    expect(await api(null, `${finance}/payouts`), 401); expect(await api(creator, `${finance}/payouts`), 403);
    expect(await api(creator, `${adminBase}/${crypto.randomUUID()}/processing`), 403);
  });
  await step("UAE and Nepal designers both receive manual payout routing; Connect is disabled", async () => {
    for (const country of ["Nepal", "United Arab Emirates"]) {
      const id = await user("designer", country);
      const body = expect(await api(id, `${finance}/payout-options`, {}, "GET"), 200);
      assert.equal(body.data.payout_method, "manual"); assert.equal(body.data.stripe_connect_available, false);
      expect(await api(id, `${finance}/payout-accounts/stripe/connect`), 410);
    }
  });
  await step("Bank details are encrypted and designer responses expose only masked account values", async () => {
    const id = await user(); const bank = await saveBank(id);
    const read = expect(await api(id, `${finance}/payout-accounts/bank`, {}, "GET"), 200);
    assert.equal(JSON.stringify(read).includes("000000001234"), false);
    for (const field of ["details_ciphertext", "details_iv", "details_auth_tag", "account_number"]) assert.equal(Object.hasOwn(read.data.bank_account, field), false);
    const stored = (await pool.query("SELECT details_ciphertext FROM designer_bank_accounts WHERE id=$1", [bank.id])).rows[0];
    assert.ok(stored.details_ciphertext); assert.equal(stored.details_ciphertext.includes("000000001234"), false);
  });
  await step("Unverified designers and unapproved designers cannot initiate withdrawals", async () => {
    const f = await fixture();
    await pool.query("UPDATE users SET is_email_verified=false WHERE id=$1", [f.id]); expect(await create(f), 403);
    await pool.query("UPDATE users SET is_email_verified=true,approval_status='pending' WHERE id=$1", [f.id]); expect(await create(f), 403);
    await balances(f.id, 100, 0);
  });
  await step("Pending escrow cannot fund withdrawals and unverified banks are rejected", async () => {
    const f = await fixture(0); expect(await create(f), 400); await balances(f.id, 0, 0);
    await pool.query("UPDATE designer_bank_accounts SET verification_status='pending' WHERE id=$1", [f.bank.id]); expect(await create(f), 409);
  });
  await step("Concurrent identical withdrawal requests reserve once; changed amount or destination is rejected", async () => {
    const f = await fixture(); const key = crypto.randomUUID();
    const results = await Promise.all([create(f, 20, key), create(f, 20, key)]);
    for (const r of results) expect(r, [200, 201]); assert.equal(results[0].body.data.request_id, results[1].body.data.request_id);
    await balances(f.id, 80, 20); expect(await create(f, 21, key), 409);
    expect(await create(f, 20, key, crypto.randomUUID()), 409);
  });
  await step("Concurrent different requests cannot overspend available earnings", async () => {
    const f = await fixture(30); const results = await Promise.all([create(f, 20), create(f, 20)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]); await balances(f.id, 10, 20);
  });
  await step("Concurrent cancellation restores reserved funds exactly once; outsiders are rejected", async () => {
    const f = await fixture(); const payout = expect(await create(f), 201).data;
    const outsider = await user(); expect(await api(outsider, `${finance}/payouts/${payout.request_id}/cancel`), 404);
    for (const r of await Promise.all([api(f.id, `${finance}/payouts/${payout.request_id}/cancel`), api(f.id, `${finance}/payouts/${payout.request_id}/cancel`)])) expect(r, 200);
    await balances(f.id, 100, 0);
  });
  await step("Admin processing blocks designer cancellation; failure requires funds_sent=false and restores once", async () => {
    const f = await fixture(); const payout = expect(await create(f), 201).data;
    expect(await api(f.id, `${adminBase}/${payout.request_id}/processing`), 403);
    expect(await api(admin, `${adminBase}/${payout.request_id}/processing`), 200);
    expect(await api(f.id, `${finance}/payouts/${payout.request_id}/cancel`), 409);
    expect(await api(admin, `${adminBase}/${payout.request_id}/fail`, { reason: "Synthetic rejection" }), 400);
    for (const r of await Promise.all([api(admin, `${adminBase}/${payout.request_id}/fail`, { reason: "Synthetic rejection", funds_sent: false }), api(admin, `${adminBase}/${payout.request_id}/fail`, { reason: "Synthetic rejection", funds_sent: false })])) expect(r, 200);
    await balances(f.id, 100, 0);
  });
  await step("External transfer references block designer cancellation and admin fund restoration", async () => {
    const f = await fixture(); const payout = expect(await create(f), 201).data;
    await pool.query("UPDATE designer_payout_requests SET provider_transaction_id='SYNTHETIC-SENT' WHERE id=$1", [payout.request_id]);
    expect(await api(f.id, `${finance}/payouts/${payout.request_id}/cancel`), 409);
    expect(await api(admin, `${adminBase}/${payout.request_id}/fail`, { reason: "Must reconcile", funds_sent: false }), 409);
    await balances(f.id, 80, 20);
  });
  await step("Completion failure rolls back wallet and ledger; concurrent retry records one payout", async () => {
    const f = await fixture(); const payout = expect(await create(f), 201).data;
    expect(await api(admin, `${adminBase}/${payout.request_id}/complete`, { transfer_reference: "SYNTHETIC-REF-ONE" }), 409);
    expect(await api(admin, `${adminBase}/${payout.request_id}/processing`), 200);
    failCompletion = true;
    expect(await api(admin, `${adminBase}/${payout.request_id}/complete`, { transfer_reference: "SYNTHETIC-REF-ONE" }), 500);
    await balances(f.id, 80, 20);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM transactions WHERE reference_id=$1 AND transaction_type='payout'", [payout.request_id])).rows[0].count, 0);
    for (const r of await Promise.all([api(admin, `${adminBase}/${payout.request_id}/complete`, { transfer_reference: "SYNTHETIC-REF-ONE" }), api(admin, `${adminBase}/${payout.request_id}/complete`, { transfer_reference: "SYNTHETIC-REF-ONE" })])) expect(r, 200);
    await balances(f.id, 80, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM transactions WHERE reference_id=$1 AND transaction_type='payout'", [payout.request_id])).rows[0].count, 1);
    expect(await api(f.id, `${finance}/payouts/${payout.request_id}/cancel`), 409);
    expect(await api(admin, `${adminBase}/${payout.request_id}/fail`, { reason: "Cannot reverse completion", funds_sent: false }), 409);
    const other = expect(await create(f), 201).data;
    expect(await api(admin, `${adminBase}/${other.request_id}/processing`), 200);
    expect(await api(admin, `${adminBase}/${other.request_id}/complete`, { transfer_reference: "SYNTHETIC-REF-ONE" }), 409);
    await balances(f.id, 60, 20);
  });
  await step("Bank replacement preserves historical payout destination and retries", async () => {
    const f = await fixture(); const key = crypto.randomUUID(); const payout = expect(await create(f, 20, key), 201).data;
    const replacement = await saveBank(f.id, "5678"); assert.notEqual(replacement.id, f.bank.id);
    const old = (await pool.query("SELECT * FROM designer_bank_accounts WHERE id=$1", [f.bank.id])).rows[0];
    assert.equal(old.account_number_last4, "1234"); assert.equal(old.is_active, false);
    expect(await create(f, 20, key), 200);
    expect(await api(admin, `${adminBase}/${payout.request_id}/processing`), 200);
    assert.equal((await pool.query("SELECT bank_account_id FROM designer_payout_requests WHERE id=$1", [payout.request_id])).rows[0].bank_account_id, f.bank.id);
  });
  await step("A bank edit racing payout creation cannot mutate the attached verified destination", async () => {
    const f = await fixture();
    let reached, attempted, unblock;
    const ready = new Promise((resolve) => { reached = resolve; });
    const waiting = new Promise((resolve) => { attempted = resolve; });
    bankPause = { reached, attempted, held: false, unblock: new Promise((resolve) => { unblock = resolve; }) };
    let withdrawal, edit;
    try {
      withdrawal = create(f);
      await Promise.race([ready, withdrawal.then(() => { throw new Error("Payout did not reach bank validation barrier"); }), new Promise((_, reject) => { const t = setTimeout(() => reject(new Error("Bank validation barrier timed out")), 10000); t.unref(); })]);
      edit = saveBank(f.id, "5678");
      await Promise.race([waiting, edit.then(() => { throw new Error("Bank replacement bypassed its transaction lock"); }), new Promise((_, reject) => { const t = setTimeout(() => reject(new Error("Bank replacement lock timed out")), 10000); t.unref(); })]);
    } finally { unblock(); }
    try {
      const payout = expect(await withdrawal, 201).data; const replacement = await edit;
      assert.notEqual(replacement.id, f.bank.id);
      assert.equal(payout.bank_account_id, f.bank.id);
      const old = (await pool.query("SELECT account_number_last4,verification_status FROM designer_bank_accounts WHERE id=$1", [f.bank.id])).rows[0];
      assert.equal(old.account_number_last4, "1234"); assert.equal(old.verification_status, "verified");
    } finally { bankPause = null; }
  });
  report.result = "passed";
}
(async () => {
  try { await main(); } catch (error) { report.result = "failed"; report.error = error.code ? `Operation failed (${error.code})` : error.message; console.error(`FAIL ${report.error}`); process.exitCode = 1; }
  finally {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeIdleConnections?.(); });
    if (isolated) try { await isolated.dispose(); report.database_cleanup = "completed"; console.log(`Removed isolated database: ${isolated.name}`); }
    catch { report.result = "cleanup_failed"; report.database = isolated.name; process.exitCode = 1; }
    report.finished_at = new Date().toISOString(); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`Manual payout suite: ${report.result.toUpperCase()} (${report.checks.length} checks passed)`); console.log(`Payout report: ${reportPath}`);
  }
})();
