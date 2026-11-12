const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { isolatedServer } = require("./support/isolated-app.cjs");
process.env.JWT_SECRET = crypto.randomBytes(48).toString("hex");
process.env.OTP_SECRET = crypto.randomBytes(32).toString("hex");
process.env.NODE_ENV = "test";
const id = crypto.randomUUID();
const current = { id, role: "creator", is_email_verified: true, approval_status: "approved", token_version: 0 };
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function challenge(payload = {}, expiresIn = "10m") {
  return jwt.sign({ id, email: "test@example.invalid", purpose: "email_verification_login", version: 0, ...payload }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn });
}
function token(payload = {}, options = {}) { return jwt.sign({ id, tokenVersion: 0, ...payload }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "1h", ...options }); }
function setup(row = current, failDb = false) {
  const calls = [];
  const db = { async query(sql, values) { calls.push({ sql, values }); if (failDb) throw new Error("Injected DB outage"); return { rows: row ? [row] : [] }; } };
  const loaded = isolatedServer({ db, stripe: {}, overrides: { "utils/sendMail.js": async () => { throw new Error("Unexpected mail send"); } } });
  return { calls, auth: loaded.load("middlewares/authMiddleware.js"), controller: loaded.load("controllers/authController.js"), users: loaded.load("controllers/userController.js") };
}
async function protect(s, signed, header) {
  const req = { headers: { ...(signed ? { authorization: `Bearer ${signed}` } : {}), ...header } }, res = response(); let next = false;
  await s.auth.protect(req, res, () => { next = true; }); return { req, res, next };
}
for (const [name, make] of [
  ["missing token", () => null], ["bad signature", () => jwt.sign({ id, tokenVersion: 0 }, "wrong-key", { expiresIn: "1h" })],
  ["wrong algorithm", () => token({}, { algorithm: "HS384" })], ["expired token", () => token({}, { expiresIn: -1 })],
  ["future token", () => token({}, { notBefore: "1h" })], ["invalid UUID", () => token({ id: "not-a-uuid" })],
  ["missing version", () => token({ tokenVersion: undefined })], ["negative version", () => token({ tokenVersion: -1 })],
  ["string version", () => token({ tokenVersion: "0" })], ["boolean version", () => token({ tokenVersion: false })],
  ["unsafe version", () => token({ tokenVersion: Number.MAX_SAFE_INTEGER + 1 })],
  ["no expiration", () => jwt.sign({ id, tokenVersion: 0 }, process.env.JWT_SECRET)],
]) test(`authentication rejects ${name} before account lookup`, async () => {
  const s = setup(); const result = await protect(s, make()); assert.equal(result.res.statusCode, 401); assert.equal(result.next, false); assert.equal(s.calls.length, 0);
});
for (const header of ["Basic abc", "Bearer abc extra", ["Bearer abc"]]) test(`malformed bearer header ${JSON.stringify(header)} is rejected`, async () => {
  const s = setup(); const result = await protect(s, null, { authorization: header }); assert.equal(result.res.statusCode, 401); assert.equal(s.calls.length, 0);
});
test("database role overrides forged privileged claims in an otherwise valid JWT", async () => {
  const s = setup(); const result = await protect(s, token({ role: "superadmin", approvalStatus: "approved" }));
  assert.equal(result.next, true); assert.equal(result.req.user.role, "creator");
  const res = response(); s.auth.authorize("superadmin")(result.req, res, () => assert.fail("Privilege escalation")); assert.equal(res.statusCode, 403);
});
for (const role of ["creator", "designer", "admin", "superadmin"]) test(`suspended ${role} is blocked globally`, async () => {
  const result = await protect(setup({ ...current, role, approval_status: "suspended" }), token());
  assert.equal(result.res.statusCode, 403); assert.equal(result.res.body.code, "ACCOUNT_SUSPENDED"); assert.equal(result.next, false);
});
test("deleted account and revoked token are rejected", async () => {
  assert.equal((await protect(setup(null), token())).res.body.code, "ACCOUNT_NOT_FOUND");
  assert.equal((await protect(setup({ ...current, token_version: 1 }), token())).res.body.code, "SESSION_REVOKED");
});
test("DB outage is a service failure rather than invalid credentials", async () => {
  const result = await protect(setup(current, true), token()); assert.equal(result.res.statusCode, 500); assert.equal(result.res.body.code, "AUTH_SERVICE_UNAVAILABLE");
});
test("current verification and designer approval gates use fresh database state", async () => {
  const s = setup({ ...current, role: "designer", is_email_verified: false, approval_status: "pending" });
  const result = await protect(s, token({ role: "designer", isEmailVerified: true, approvalStatus: "approved" }));
  assert.equal(result.next, true);
  for (const gate of [s.auth.requireApprovedAccount, s.auth.requireVerifiedEmail]) { const res = response(); gate(result.req, res, () => assert.fail("Stale claim bypass")); assert.equal(res.statusCode, 403); }
});
for (const password of ["short", "a".repeat(73), "\u00e9".repeat(37), "\u{1f510}".repeat(19)]) test(`registration/reset/change reject invalid password of ${Buffer.byteLength(password)} bytes before DB access`, async () => {
  const s = setup(); const body = { role: "creator", full_name: "Test User", email: "test@example.invalid", password, confirm_password: password };
  let res = response(); await s.controller.register({ body }, res); assert.equal(res.statusCode, 400);
  res = response(); await s.controller.resetPassword({ body: { email: body.email, otp: "123456", newPassword: password } }, res); assert.equal(res.statusCode, 400);
  res = response(); await s.users.updateSecurity({ user: { id }, body: { currentPassword: "Current-Test-123", newPassword: password } }, res); assert.equal(res.statusCode, 400);
  assert.equal(s.calls.length, 0);
});
test("login rejects overlong bcrypt password aliases without account lookup", async () => {
  const s = setup(); const res = response(); await s.controller.login({ body: { email: "test@example.invalid", password: "a".repeat(72) + "ignored" } }, res);
  assert.equal(res.statusCode, 401); assert.equal(s.calls.length, 0);
});
for (const role of ["admin", "superadmin", "owner"]) test(`public registration cannot select ${role}`, async () => {
  const s = setup(); const res = response(); await s.controller.register({ body: { role } }, res); assert.equal(res.statusCode, 400); assert.equal(s.calls.length, 0);
});

test("suspended login never issues a token even with the correct password", async () => {
  const bcrypt = require("bcryptjs");
  const s = setup({ ...current, approval_status: "suspended", password_hash: await bcrypt.hash("Current-Test-123", 4) });
  const res = response();
  await s.controller.login({ body: { email: "test@example.invalid", password: "Current-Test-123" } }, res);
  assert.equal(res.statusCode, 403); assert.equal(res.body.code, "ACCOUNT_SUSPENDED"); assert.equal(res.body.token, undefined);
});

for (const role of ["creator", "designer"]) test(`unverified ${role} receives a limited challenge only after a correct password`, async () => {
  const s = setup({ ...current, role, is_email_verified: false, password_hash: await require("bcryptjs").hash("Current-Test-123", 4) });
  let res = response(); await s.controller.login({ body: { email: "test@example.invalid", password: "wrong" } }, res);
  assert.equal(res.statusCode, 401); assert.equal(res.body.login_challenge, undefined);
  res = response(); await s.controller.login({ body: { email: "test@example.invalid", password: "Current-Test-123" } }, res);
  assert.equal(res.statusCode, 403); assert.ok(res.body.login_challenge); assert.equal(res.body.token, undefined);
  const access = await protect(setup(), res.body.login_challenge); assert.equal(access.next, false); assert.equal(access.res.statusCode, 401);
});

for (const [name, value] of [["expired", () => challenge({}, -1)], ["wrong email", () => challenge({ email: "other@example.invalid" })], ["access token", () => token()], ["forged", () => "forged"]]) {
  test(`verification rejects ${name} login challenge before DB access`, async () => {
    const s = setup(); const res = response();
    await s.controller.verifyEmail({ body: { email: "test@example.invalid", otp: "123456", login_challenge: value() } }, res);
    assert.equal(res.statusCode, 401); assert.equal(s.calls.length, 0); assert.equal(res.body.token, undefined);
  });
}
test("only atomic code consumption with a login challenge can issue a session", async () => {
  const s = setup(); const res = response();
  await s.controller.verifyEmail({ body: { email: "test@example.invalid", otp: "123456", login_challenge: challenge() } }, res);
  assert.equal(res.statusCode, 200); assert.equal(jwt.verify(res.body.token, process.env.JWT_SECRET).tokenVersion, 0);
  assert.match(s.calls[0].sql, /token_version = \$4/); assert.match(s.calls[0].sql, /<> 'suspended'/);
  assert.equal(s.calls[0].values[2], id);
  const standalone = response(); await setup().controller.verifyEmail({ body: { email: "test@example.invalid", otp: "123456" } }, standalone);
  assert.equal(standalone.body.token, undefined);
});
test("already-verified code replays never grant a session", async () => {
  let count = 0;
  const controller = isolatedServer({ stripe: {}, db: { async query() { return { rows: count++ ? [{ is_email_verified: true }] : [] }; } } }).load("controllers/authController.js");
  const res = response(); await controller.verifyEmail({ body: { email: "test@example.invalid", otp: "123456", login_challenge: challenge() } }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.token, undefined);
});

test("chat initialization rejects wrong roles and unavailable targets", async () => {
  let queries = 0;
  const loaded = isolatedServer({ db: { async query() { queries++; return { rows: [] }; } }, stripe: {} });
  const chat = loaded.load("controllers/chatController.js");
  let res = response(); await chat.createOrGetRoom({ user: { id, role: "designer" }, body: { designer_id: id } }, res);
  assert.equal(res.statusCode, 403); assert.equal(queries, 0);
  res = response(); await chat.createOrGetRoom({ user: { id, role: "creator" }, body: { designer_id: "invalid" } }, res);
  assert.equal(res.statusCode, 400); assert.equal(queries, 0);
  res = response(); await chat.createOrGetRoom({ user: { id, role: "creator" }, body: { designer_id: crypto.randomUUID() } }, res);
  assert.equal(res.statusCode, 404); assert.equal(queries, 1);
});

test("protected route sweep rejects anonymous requests before DB access", async () => {
  const express = require("express");
  const loaded = isolatedServer({ db: { query() { assert.fail("Anonymous DB access"); }, connect() { assert.fail("Anonymous DB connection"); } }, stripe: {} });
  const files = ["creatorRoutes.js", "designerFinanceRoutes.js", "creatorFinanceRoute.js", "superAdminRoutes.js", "chatRoutes.js", "designRoutes.js", "p2pBookingRoutes.js", "subscriptionRoute.js"];
  const app = express(); app.use(express.json());
  const cases = [];
  for (const [index, file] of files.entries()) {
    const router = loaded.load(`routes/${file}`); const prefix = `/sweep${index}`; app.use(prefix, router);
    for (const layer of router.stack) {
      if (!layer.route) continue;
      assert.equal(typeof layer.route.path, "string");
      const route = layer.route.path.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, id);
      for (const method of Object.keys(layer.route.methods)) cases.push({ url: prefix + route, method });
    }
  }

  try {
    for (const c of cases) {
      const res = await dispatch(app, c.method.toUpperCase(), c.url);
      assert.equal(res.status, 401, `${c.method} ${c.url}`);
    }
    assert.ok(cases.length > 50); console.log(`Anonymous access sweep: ${cases.length} route/method pairs`);
  } finally { /* No sockets or external services are used. */ }
});

test("login throttling cannot be bypassed using spoofed forwarding headers", async () => {
  const express = require("express");
  const loaded = isolatedServer({ db: { query() { assert.fail("Malformed login reached DB"); } }, stripe: {}, overrides: { "utils/sendMail.js": async () => assert.fail("Mail sent") } });
  const app = express(); app.use(express.json()); app.use(loaded.load("routes/authRoutes.js"));

  try {
    for (let i = 0; i < 11; i++) {
      const res = await dispatch(app, "POST", "/login", i ? { "x-forwarded-for": `192.0.2.${i + 1}` } : {});
      assert.equal(res.status, i === 10 ? 429 : 401);
    }
  } finally { /* No sockets or external services are used. */ }
});

function dispatch(app, method, url, headers = {}) {
  const { IncomingMessage, ServerResponse } = require("node:http");
  const { PassThrough } = require("node:stream");
  return new Promise((resolve, reject) => {
    const socket = new PassThrough(); socket.remoteAddress = "127.0.0.1";
    const req = new IncomingMessage(socket); req.method = method; req.url = url; req.headers = headers; req.body = {};
    const res = new ServerResponse(req);
    const timer = setTimeout(() => reject(new Error("Route did not respond: " + method + " " + url)), 5000);
    res.end = function(body) { clearTimeout(timer); resolve({ status: this.statusCode, body }); return this; };
    app.handle(req, res, error => { clearTimeout(timer); reject(error || new Error("Route not matched: " + url)); });
  });
}

test("password change clears outstanding reset codes and increments the session version atomically", async () => {
  const bcrypt = require("bcryptjs");
  const hash = await bcrypt.hash("Current-Test-123", 4);
  const calls = [];
  const client = { release() {}, async query(sql) {
    calls.push(sql);
    if (/SELECT/.test(sql)) return { rows: [{ id, password_hash: hash, token_version: 0 }] };
    if (/UPDATE users/.test(sql)) {
      assert.match(sql, /password_reset_otp_hash\s*=\s*NULL/);
      assert.match(sql, /password_reset_otp_expires_at\s*=\s*NULL/);
      assert.match(sql, /COALESCE\(\s*token_version,\s*0\s*\)\s*\+ 1/);
      return { rows: [{ token_version: 1 }] };
    }
    return { rows: [] };
  } };
  const users = isolatedServer({ db: { connect: async () => client }, stripe: {} }).load("controllers/userController.js");
  const res = response();
  await users.updateSecurity({ user: { id }, body: { currentPassword: "Current-Test-123", newPassword: "Changed-Test-456" } }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.requires_reauthentication, true);
  assert.match(calls[1], /FOR UPDATE/); assert.equal(calls.at(-1), "COMMIT");
});
