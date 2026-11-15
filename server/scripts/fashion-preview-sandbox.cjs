"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { test } = require("node:test");
const { sandboxDatabase } = require("./support/sandbox-database.cjs");
const { isolatedServer } = require("./support/isolated-app.cjs");
require("dotenv").config({ path: require("node:path").join(__dirname, "../.env"), quiet: true });

test("preview reservations, retries, provider failures, and rolling limits", async (t) => {
  process.env.FASHION_PREVIEW_USER_DAILY_LIMIT = "2";
  process.env.FASHION_PREVIEW_GLOBAL_DAILY_LIMIT = "3";
  const sandbox = await sandboxDatabase();
  t.after(() => sandbox.dispose());
  const { renderOnce } = isolatedServer({ db: sandbox.pool }).load("services/ai/fashionPreviewQuota.js");
  const user = randomUUID();
  let calls = 0;
  const generate = async () => ({ requestId: String(++calls) });
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const first = renderOnce(user, "one", async () => {
    started.resolve();
    await finish.promise;
    return generate();
  });
  await started.promise;
  try {
    assert.equal((await renderOnce(user, "one", generate)).status, 409);
    assert.equal((await renderOnce(user, "two", generate)).status, 409);
  } finally {
    finish.resolve();
  }
  assert.deepEqual(await first, await renderOnce(user, "one", generate));
  assert.equal(calls, 1);
  await assert.rejects(renderOnce(user, "two", async () => {
    calls++;
    throw new Error("unconfirmed dispatch");
  }), /unconfirmed dispatch/);
  assert.equal((await renderOnce(user, "two", generate)).status, 409);
  assert.equal((await renderOnce(user, "three", generate)).status, 429);
  const race = await Promise.all([1, 2, 3].map(() => renderOnce(randomUUID(), "one", generate)));
  assert.equal(race.filter(item => item.status === 429).length, 2);
  assert.equal(calls, 3);
  await sandbox.pool.query("UPDATE fashion_preview_attempts SET created_at=now()-interval '25 hours'");
  assert.ok((await renderOnce(user, "one", generate)).result);
  assert.equal(calls, 4);
});
