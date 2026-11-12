"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { isolatedServer } = require("./support/isolated-app.cjs");
const { sandboxDatabase } = require("./support/sandbox-database.cjs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
const reportPath = path.resolve(__dirname, "../auth-sandbox-report.json");
const report = { started_at: new Date().toISOString(), result: "running", checks: [], scope: "Disposable database, real HTTP routes and bcrypt; email captured in memory; no payment or upload calls" };
const password = "Auth-Sandbox-Initial-42!";
let isolated, server, origin;
const mails = [];
async function step(name, action) { await action(); report.checks.push(name); console.log(`PASS ${name}`); }
function expect(r, status) { assert.ok([status].flat().includes(r.status), `Expected ${status}, received ${r.status}: ${r.body.message || "unexpected response"}`); return r.body; }
async function api(route, body, token, method = body === undefined ? "GET" : "POST") {
  const r = await fetch(origin + "/api/v1" + route, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
  return { status: r.status, body: await r.json() };
}
const signed = (id, version = 0, claims = {}) => jwt.sign({ id, tokenVersion: version, ...claims }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "15m" });
const hashOtp = code => crypto.createHmac("sha256", process.env.OTP_SECRET).update(code).digest("hex");
async function row(id) { return (await isolated.pool.query("SELECT * FROM users WHERE id=$1", [id])).rows[0]; }
async function fixture(role = "creator", approval = "approved") {
  const id = crypto.randomUUID(), email = `${id}@example.invalid`;
  await isolated.pool.query("INSERT INTO users (id,role,full_name,email,password_hash,is_email_verified,approval_status,token_version) VALUES ($1,$2,'Auth Test',$3,$4,true,$5,0)", [id, role, email, await bcrypt.hash(password, 4), approval]);
  return { id, email, token: signed(id) };
}
function code(email) {
  const mail = mails.filter(m => m.email === email).at(-1); assert.ok(mail, "Expected captured email");
  const match = mail.html.match(/>\s*(\d{6})\s*</); assert.ok(match, "Expected six-digit email code"); return match[1];
}
async function main() {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = crypto.randomBytes(48).toString("hex");
  process.env.OTP_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.STRIPE_SECRET_KEY = "sk_test_noProviderCalls";
  isolated = await sandboxDatabase();
  const stripe = new Proxy({}, { get() { throw new Error("Provider calls forbidden in authentication suite"); } });
  const { app } = isolatedServer({ db: isolated.pool, stripe, overrides: { "utils/sendMail.js": async mail => { mails.push(mail); } } }).load("index.js");
  server = await new Promise((resolve, reject) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); s.once("error", reject); });
  origin = `http://127.0.0.1:${server.address().port}`;
  let registered, loginToken, loginChallenge;
  const email = `${crypto.randomUUID()}@example.invalid`;
  await step("Registration hashes passwords and OTPs, ignores privileged fields, and blocks duplicate email", async () => {
    const body = { role: "creator", full_name: "Auth Test", email, password, confirm_password: password, is_email_verified: true, token_version: 99, approval_status: "approved" };
    registered = expect(await api("/auth/register", body), 201).userId;
    const u = await row(registered); assert.equal(u.is_email_verified, false); assert.equal(u.token_version, 0);
    assert.notEqual(u.password_hash, password); assert.ok(await bcrypt.compare(password, u.password_hash));
    assert.equal(u.email_verification_otp_hash, hashOtp(code(email)));
    expect(await api("/auth/register", { ...body, email: email.toUpperCase() }), 409);
    expect(await api("/auth/register", { ...body, role: "superadmin" }), 400);
  });
  await step("Unverified login is blocked; wrong and expired OTPs fail; resend rotates the code", async () => {
    const unverified = expect(await api("/auth/login", { email, password }), 403);
    assert.equal(unverified.code, "EMAIL_NOT_VERIFIED"); loginChallenge = unverified.login_challenge; assert.ok(loginChallenge);
    expect(await api("/auth/me", undefined, loginChallenge), 401);
    expect(await api("/auth/verify-otp", { email, otp: "000000" }), 400);
    const old = code(email);
    await isolated.pool.query("UPDATE users SET email_verification_otp_expires_at=NOW()-interval '1 minute' WHERE id=$1", [registered]);
    expect(await api("/auth/verify-otp", { email, otp: old }), 400);
    expect(await api("/auth/resend-otp", { email }), 200);
    assert.equal((await row(registered)).email_verification_otp_hash, hashOtp(code(email)));
    if (code(email) !== old) expect(await api("/auth/verify-otp", { email, otp: old }), 400);
    const verified = expect(await api("/auth/verify-otp", { email, otp: code(email), login_challenge: loginChallenge }), 200);
    assert.ok(verified.token); expect(await api("/auth/me", undefined, verified.token), 200);
    const replay = expect(await api("/auth/verify-otp", { email, otp: code(email), login_challenge: loginChallenge }), 200);
    assert.equal(replay.token, undefined);
    const u = await row(registered); assert.equal(u.is_email_verified, true); assert.equal(u.email_verification_otp_hash, null);
    loginToken = expect(await api("/auth/login", { email, password }), 200).token;
    const me = expect(await api("/auth/me", undefined, loginToken), 200).data;
    assert.equal(me.id, registered); assert.equal(me.password_hash, undefined); assert.equal(me.password_reset_otp_hash, undefined);
  });
  await step("Forgot-password response hides account existence; reset codes are hashed and expire", async () => {
    const known = expect(await api("/auth/forgot-password", { email }), 200);
    const unknown = expect(await api("/auth/forgot-password", { email: "unknown@example.invalid" }), 200);
    assert.deepEqual(known, unknown);
    assert.equal((await row(registered)).password_reset_otp_hash, hashOtp(code(email)));
    expect(await api("/auth/reset-password", { email, otp: "000000", newPassword: "New-Password-123!" }), 400);
    await isolated.pool.query("UPDATE users SET password_reset_otp_expires_at=NOW()-interval '1 minute' WHERE id=$1", [registered]);
    expect(await api("/auth/reset-password", { email, otp: code(email), newPassword: "New-Password-123!" }), 400);
    expect(await api("/auth/forgot-password", { email }), 200);
  });
  await step("Concurrent reset consumes one code once and revokes existing sessions", async () => {
    const body = { email, otp: code(email), newPassword: "Auth-Sandbox-Reset-42!" };
    const results = await Promise.all([api("/auth/reset-password", body), api("/auth/reset-password", body)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
    const u = await row(registered); assert.equal(u.token_version, 1); assert.equal(u.password_reset_otp_hash, null);
    assert.ok(await bcrypt.compare(body.newPassword, u.password_hash));
    expect(await api("/auth/me", undefined, loginToken), 401);
    expect(await api("/auth/login", { email, password }), 401);
    loginToken = expect(await api("/auth/login", { email, password: body.newPassword }), 200).token;
  });
  await step("Concurrent password changes revoke once and invalidate outstanding recovery codes", async () => {
    expect(await api("/auth/forgot-password", { email }), 200); const resetCode = code(email);
    expect(await api("/users/security", { currentPassword: "wrong", newPassword: "Auth-Sandbox-Final-42!" }, loginToken, "PUT"), 401);
    const body = { currentPassword: "Auth-Sandbox-Reset-42!", newPassword: "Auth-Sandbox-Final-42!" };
    const results = await Promise.all([api("/users/security", body, loginToken, "PUT"), api("/users/security", body, loginToken, "PUT")]);
    assert.equal(results.filter(r => r.status === 200).length, 1); assert.equal(results.filter(r => r.status === 401).length, 1);
    const u = await row(registered); assert.equal(u.token_version, 2); assert.equal(u.password_reset_otp_hash, null);
    expect(await api("/auth/reset-password", { email, otp: resetCode, newPassword: "Attacker-Password-42!" }), 400);
    expect(await api("/auth/me", undefined, loginToken), 401);
  });
  const creator = await fixture(), outsider = await fixture(), designer = await fixture("designer"), pending = await fixture("designer", "pending");
  await step("Fresh account state defeats forged roles, suspension, deletion, and old token versions", async () => {
    expect(await api("/designer/me", undefined, signed(creator.id, 0, { role: "designer" })), 403);
    expect(await api("/creators/editor-projects", undefined, designer.token), 403);
    await isolated.pool.query("UPDATE users SET approval_status='suspended' WHERE id=$1", [creator.id]);
    expect(await api("/auth/me", undefined, creator.token), 403);
    assert.equal(expect(await api("/auth/login", { email: creator.email, password }), 403).code, "ACCOUNT_SUSPENDED");
    await isolated.pool.query("UPDATE users SET approval_status='approved',token_version=1 WHERE id=$1", [creator.id]);
    expect(await api("/auth/me", undefined, creator.token), 401); creator.token = signed(creator.id, 1);
    const deleted = await fixture(); await isolated.pool.query("DELETE FROM users WHERE id=$1", [deleted.id]);
    expect(await api("/auth/me", undefined, deleted.token), 401);
  });
  await step("Profile updates cannot change another account or escalate role and verification", async () => {
    expect(await api("/users/profile", { id: outsider.id, user_id: outsider.id, role: "superadmin", is_email_verified: true, token_version: 0, full_name: "Changed Own Name" }, creator.token, "PUT"), 200);
    assert.equal((await row(creator.id)).full_name, "Changed Own Name"); assert.equal((await row(creator.id)).role, "creator");
    assert.equal((await row(outsider.id)).full_name, "Auth Test");
    const publicProfile = expect(await api(`/users/${creator.id}`), 200);
    const serialized = JSON.stringify(publicProfile);
    for (const secret of [creator.email, "password_hash", "password_reset_otp_hash", "token_version"]) assert.equal(serialized.includes(secret), false);
    expect(await api(`/users/${pending.id}`), 404);
  });
  await step("Private editor projects reject outsider reads, updates, and publishing", async () => {
    const project = (await isolated.pool.query("INSERT INTO editor_projects (owner_id,title,project_data,schema_version,version) VALUES ($1,'Private','{\"document\":{},\"layers\":[],\"objects\":[]}',2,1) RETURNING id", [creator.id])).rows[0].id;
    expect(await api(`/creators/editor-projects/${project}`, undefined, creator.token), 200);
    expect(await api(`/creators/editor-projects/${project}`, undefined, outsider.token), [403, 404]);
    expect(await api(`/creators/editor-projects/${project}`, { title: "Stolen", project_data: { document: {}, layers: [], objects: [] } }, outsider.token, "PUT"), 404);
    expect(await api(`/creators/editor-projects/${project}/share`, { title: "Stolen" }, outsider.token), 404);
    assert.equal((await isolated.pool.query("SELECT title FROM editor_projects WHERE id=$1", [project])).rows[0].title, "Private");
  });
  await step("Chat requires eligible participants and rejects outsider history and messages", async () => {
    expect(await api("/chat/initialize", { designer_id: designer.id }, designer.token), 403);
    expect(await api("/chat/initialize", { designer_id: outsider.id }, creator.token), 404);
    expect(await api("/chat/initialize", { designer_id: pending.id }, creator.token), 404);
    const room = expect(await api("/chat/initialize", { designer_id: designer.id }, creator.token), 200).data.id;
    expect(await api("/chat/send", { room_id: room, content: "Private test message" }, creator.token), 201);
    expect(await api(`/chat/history/${room}`, undefined, designer.token), 200);
    expect(await api(`/chat/history/${room}`, undefined, outsider.token), 403);
    expect(await api("/chat/send", { room_id: room, content: "Unauthorized" }, outsider.token), 403);
  });
  report.result = "passed";
}
(async () => {
  try { await main(); } catch (error) { report.result = "failed"; report.error = error.code ? `Operation failed (${error.code})` : error.message; console.error(`FAIL ${report.error}`); process.exitCode = 1; }
  finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeIdleConnections?.(); });
    if (isolated) try { await isolated.dispose(); report.database_cleanup = "completed"; console.log(`Removed isolated database: ${isolated.name}`); }
    catch { report.result = "cleanup_failed"; report.database = isolated.name; process.exitCode = 1; }
    report.finished_at = new Date().toISOString(); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`Authentication suite: ${report.result.toUpperCase()} (${report.checks.length} checks passed)`);
    console.log(`Authentication report: ${reportPath}`);
  }
})();
