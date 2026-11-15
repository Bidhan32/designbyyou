const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomUUID } = require("node:crypto");
const { sandboxDatabase } = require("./support/sandbox-database.cjs");
const { isolatedServer } = require("./support/isolated-app.cjs");
require("dotenv").config({ path: require("node:path").join(__dirname, "../.env"), quiet: true });

test("designer queue, concurrent decisions and suspension history", async t => {
  const sandbox = await sandboxDatabase();
  t.after(() => sandbox.dispose());
  const ctrl = isolatedServer({ db: sandbox.pool }).load("controllers/superAdminController.js");
  async function call(handler, request) {
    const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler(request, response);
    return response;
  }
  const id = randomUUID();
  await sandbox.pool.query("INSERT INTO users(id,full_name,email,password_hash,role,approval_status) VALUES ($1,'Applicant',$2,'unused','designer','pending')", [id, id+"@example.invalid"]);
  await sandbox.pool.query("INSERT INTO designer_profiles(user_id,portfolio_url,bio) VALUES ($1,'https://example.org/portfolio','Example bio')", [id]);
  const queue = () => call(ctrl.getPendingDesigners, {});
  const change = (status, reviewApplication = false) => call(ctrl.manageUserStatus, { params: { userId: id }, body: { status, reviewApplication } });
  const person = (await queue()).body.data.find(row => row.id === id);
  assert.equal(person.portfolio_url, "https://example.org/portfolio");
  const decisions = await Promise.all([change("approved", true), change("rejected", true)]);
  assert.deepEqual(decisions.map(r => r.code).sort(), [200,409]);
  const saved = decisions.find(r => r.code === 200).body.data.status;
  assert.ok(!(await queue()).body.data.some(row => row.id === id));
  assert.equal((await change("suspended")).body.data.status, "suspended");
  assert.equal((await change("restore")).body.data.status, saved);
  const list = await call(ctrl.getUsers, { query: {} });
  assert.equal(list.body.find(row => row.id === id).status, saved);
  await sandbox.pool.query("UPDATE users SET approval_status='suspended',status_before_suspension=NULL WHERE id=$1",[id]);
  assert.equal((await change("restore")).body.data.status, "pending");
});
