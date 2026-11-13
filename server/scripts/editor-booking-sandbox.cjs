"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const { sandboxDatabase } = require("./support/sandbox-database.cjs");
const { isolatedServer } = require("./support/isolated-app.cjs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
let isolated, server, origin, created = 0;
const intents = new Map();
const stripe = { paymentIntents: {
  async create(options) { const pi = { ...options, id: `pi_mock_${++created}`, client_secret: "mock_secret", status: "requires_payment_method" }; intents.set(pi.id, pi); return pi; },
  async retrieve(id) { return intents.get(id); },
  async cancel(id) { const pi = intents.get(id); pi.status = "canceled"; return pi; },
} };
const refunds = new Map();
stripe.refunds = {
  async create(options) { const refund = { ...options, id: `re_mock_${refunds.size + 1}`, amount: intents.get(options.payment_intent).amount, currency: 'usd', status: 'succeeded' }; refunds.set(refund.id, refund); return refund; },
  async retrieve(id) { return refunds.get(id); },
};
async function api(route, token, body, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(origin + "/api/v1" + route, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
function expect(response, status) { assert.equal(response.status, status, JSON.stringify(response.body)); return response.body; }
async function fixture(role) {
  const id = crypto.randomUUID();
  await isolated.pool.query("INSERT INTO users(id,role,full_name,email,password_hash,is_email_verified,approval_status,token_version) VALUES($1,$2,'Booking Test',$3,'unused',true,'approved',0)", [id, role, `${id}@example.invalid`]);
  return { id, token: jwt.sign({ id, tokenVersion: 0 }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "15m" }) };
}
(async () => {
  try {
    isolated = await sandboxDatabase();
    const { app } = isolatedServer({ db: isolated.pool, stripe, overrides: { "utils/sendMail.js": async () => {} } }).load("index.js");
    server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    origin = `http://127.0.0.1:${server.address().port}`;
    const creator = await fixture("creator"), designer = await fixture("designer"), outsider = await fixture("creator");
    const directory = expect(await api("/p2p-bookings/designers", creator.token), 200);
    assert.ok(directory.data.some(row => row.id === designer.id));
    const project = { schemaVersion: 2, document: { name: "Private booking design", width: 1200, height: 1200 }, layers: [], objects: {}, bookingPreview: "data:image/png;base64,AAAA" };
    const savedResponse = expect(await api("/creators/editor-projects", creator.token, { title: project.document.name, project_data: project }), 201);
    const saved = savedResponse.data?.project || savedResponse.data || savedResponse.project;
    assert.ok(saved.id, JSON.stringify(savedResponse));
    const body = { client_request_id: crypto.randomUUID(), receiver_id: designer.id, booking_type: "commission", editor_project_id: String(saved.id), editor_project_version: saved.version, brief_text: "Please create a prototype from this private design.", agreed_price: 100, deadline: new Date(Date.now() + 30 * 86400000).toISOString() };
    expect(await api("/p2p-bookings/create", outsider.token, body), 404);
    expect(await api("/p2p-bookings/create", creator.token, { ...body, editor_project_version: saved.version + 1 }), 409);
    assert.equal(created, 0);
    console.log("PASS Designer directory, project save, ownership and stale-version checks");
    const result = expect(await api("/p2p-bookings/create", creator.token, body), 201);
    const booking = result.booking;
    assert.equal(booking.design_id, null);
    assert.equal(created, 1);
    const retry = expect(await api("/p2p-bookings/create", creator.token, body), 200);
    assert.equal(retry.booking.id, booking.id); assert.equal(created, 1);
    expect(await api("/p2p-bookings/create", creator.token, { ...body, editor_project_version: saved.version + 1 }), 409);
    console.log("PASS Booking creation attaches design atomically and retries do not duplicate payment");
    const endpoint = `/p2p-bookings/${booking.id}/design-snapshot`;
    expect(await api(endpoint, outsider.token), 404);
    for (const user of [creator, designer]) {
      const snapshot = expect(await api(endpoint, user.token), 200).data;
      assert.deepEqual(snapshot.snapshot_data, project);
    }
    await isolated.pool.query("UPDATE editor_projects SET project_data = jsonb_set(project_data,'{document,name}','\"Changed\"'), version=version+1 WHERE id=$1", [saved.id]);
    assert.equal(expect(await api(endpoint, designer.token), 200).data.design_title, project.document.name);
    console.log("PASS Both participants can read the original design; outsiders cannot; later edits leave it intact");
    const saveKey = crypto.randomUUID();
    const saveBody = { title: "Autosaved design", project_data: project, client_save_id: saveKey };
    const concurrent = await Promise.all([api("/creators/editor-projects", creator.token, saveBody), api("/creators/editor-projects", creator.token, saveBody)]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 201]);
    const cloud = concurrent[0].body.data;
    assert.equal(cloud.id, concurrent[1].body.data.id);
    const updated = expect(await api(`/creators/editor-projects/${cloud.id}`, creator.token, { title: "Updated design", project_data: project, expected_version: cloud.version }, "PUT"), 200).data;
    assert.equal(updated.version, cloud.version + 1);
    assert.equal(expect(await api("/creators/editor-projects", creator.token, saveBody), 200).data.id, cloud.id);
    expect(await api(`/creators/editor-projects/${cloud.id}`, creator.token, { project_data: project, expected_version: cloud.version }, "PUT"), 409);
    const listing = expect(await api("/creators/editor-projects", creator.token), 200).data;
    assert.ok(listing.some(row => row.id === cloud.id && row.title === "Updated design"));
    assert.equal(expect(await api("/creators/editor-projects", outsider.token), 200).data.length, 0);
    assert.equal(expect(await api(`/creators/editor-projects/${cloud.id}`, creator.token), 200).data.title, "Updated design");
    console.log("PASS Concurrent autosave creation, version-safe updates, private project listing and reopening");
    expect(await api("/p2p-bookings/verify-escrow", creator.token, { bookingId: booking.id }), 400);
    const pi = intents.get(booking.stripe_payment_intent_id); pi.status = "succeeded"; pi.amount_received = pi.amount;
    expect(await api("/p2p-bookings/verify-escrow", outsider.token, { bookingId: booking.id }), 403);
    expect(await api("/p2p-bookings/verify-escrow", creator.token, { bookingId: booking.id }), 200);
    expect(await api("/p2p-bookings/verify-escrow", creator.token, { bookingId: booking.id }), 200);
    assert.equal((await isolated.pool.query("SELECT escrow_locked FROM bookings WHERE id=$1", [booking.id])).rows[0].escrow_locked, true);
    console.log("PASS Payment verification rejects unpaid/outsider requests and safely reconciles successful payments");

    const transition = async (action, user, data = {}) => expect(await api(`/p2p-bookings/${booking.id}/${action}`, user.token, data), 200);
    const state = async () => (await isolated.pool.query("SELECT * FROM bookings WHERE id=$1", [booking.id])).rows[0];
    await isolated.pool.query("INSERT INTO designer_profiles(user_id,portfolio_url,tier,total_completed_bookings,commission_rate) VALUES($1,'https://example.invalid/portfolio','bronze',0,10) ON CONFLICT(user_id) DO NOTHING", [designer.id]);
    expect(await api(`/p2p-bookings/${booking.id}/release`, creator.token, {}), 400);
    await transition('accept', designer);
    assert.equal((await state()).status, 'progress');
    expect(await api(`/p2p-bookings/${booking.id}/submit-final`, designer.token, { file_url: 'https://example.invalid/final.png' }), 400);
    await transition('submit-prototype', designer, { file_url: 'https://example.invalid/prototype.png', message: 'First prototype' });
    assert.equal((await state()).status, 'review_prototype');
    expect(await api(`/p2p-bookings/${booking.id}/approve-prototype`, outsider.token, {}), 403);
    await transition('request-revision', creator, { notes: 'Please adjust the collar.' });
    assert.equal((await state()).status, 'progress');
    await transition('submit-prototype', designer, { file_url: 'https://example.invalid/prototype-v2.png' });
    await transition('approve-prototype', creator);
    assert.equal((await state()).status, 'final_production');
    await transition('submit-final', designer, { file_url: 'https://example.invalid/final.png' });
    assert.equal((await state()).status, 'review_final');
    await transition('request-revision', creator, { notes: 'Please adjust the final hem.' });
    assert.equal((await state()).status, 'final_production');
    await transition('submit-final', designer, { file_url: 'https://example.invalid/final-v2.png' });
    const releases = await Promise.all([transition('release', creator), transition('release', creator)]);
    assert.equal(releases.filter(row => row.idempotent === false).length, 1);
    assert.equal((await state()).status, 'completed');
    assert.equal((await state()).escrow_locked, false);
    const wallet = (await isolated.pool.query("SELECT * FROM designer_wallets WHERE user_id=$1", [designer.id])).rows[0];
    assert.equal(Number(wallet.available_balance), 10);
    assert.equal(Number(wallet.pending_escrow_balance), 0);
    assert.equal(Number((await isolated.pool.query("SELECT count(*) FROM transactions WHERE reference_id=$1 AND transaction_type='escrow_release'", [booking.id])).rows[0].count), 1);
    console.log('PASS Acceptance, prototype and final revisions, ownership, stage ordering and concurrent completion credit earnings once');
    const unpaid = expect(await api('/p2p-bookings/create', creator.token, { ...body, client_request_id: crypto.randomUUID(), editor_project_id: undefined, editor_project_version: undefined }), 201).booking;
    const resumed = expect(await api(`/p2p-bookings/${unpaid.id}/payment`, creator.token), 200);
    assert.equal(resumed.booking.id, unpaid.id);
    assert.equal(resumed.clientSecret, 'mock_secret');
    expect(await api(`/p2p-bookings/${unpaid.id}/payment`, outsider.token), 404);
    expect(await api(`/p2p-bookings/${unpaid.id}/payment`, designer.token), 403);
    expect(await api(`/p2p-bookings/${unpaid.id}/cancel`, creator.token, { reason: 'Changed requirements' }), 200);
    assert.equal((await isolated.pool.query('SELECT status FROM bookings WHERE id=$1', [unpaid.id])).rows[0].status, 'cancelled');
    assert.equal(intents.get(unpaid.stripe_payment_intent_id).status, 'canceled');
    console.log('PASS Unpaid cancellation cancels the original payment intent');

    expect(await api(`/p2p-bookings/${unpaid.id}/payment`, creator.token), 409);
    assert.equal(Number((await state()).creator_reward_points), 20);
    const paid = expect(await api('/p2p-bookings/create', creator.token, { ...body, client_request_id: crypto.randomUUID(), editor_project_id: undefined, editor_project_version: undefined }), 201).booking;
    const paidIntent = intents.get(paid.stripe_payment_intent_id); paidIntent.status = 'succeeded'; paidIntent.amount_received = paidIntent.amount;
    expect(await api('/p2p-bookings/verify-escrow', creator.token, { bookingId: paid.id }), 200);
    expect(await api(`/p2p-bookings/${paid.id}/reject`, designer.token, { reason: 'Unavailable for this project' }), 200);
    expect(await api(`/p2p-bookings/${paid.id}/cancel`, creator.token, { reason: 'Already rejected' }), 200);
    assert.equal(refunds.size, 1);
    const cancelled = (await isolated.pool.query('SELECT * FROM bookings WHERE id=$1', [paid.id])).rows[0];
    assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.escrow_locked, false);
    const finalWallet = (await isolated.pool.query('SELECT * FROM designer_wallets WHERE user_id=$1', [designer.id])).rows[0];
    assert.equal(Number(finalWallet.pending_escrow_balance), 0);
    assert.equal(Number(finalWallet.available_balance), 10);
    console.log('PASS Private payment resume, cancelled-payment rejection, creator rewards and funded rejection/refund without duplicate refund or earnings');
    console.log("Editor booking sandbox: PASSED (real HTTP and disposable PostgreSQL; Stripe mocked, no charges).");
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (isolated) { await isolated.dispose(); console.log(`Removed isolated database: ${isolated.name}`); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
