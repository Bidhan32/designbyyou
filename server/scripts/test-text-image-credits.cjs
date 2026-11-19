const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { isolatedServer } = require("./support/isolated-app.cjs");
const { sandboxDatabase } = require("./support/sandbox-database.cjs");

test("Text-to-Image reserves once, settles after saving, refunds failures and enforces the balance", async () => {
  require("dotenv").config({ quiet: true });
  const sandbox = await sandboxDatabase();
  const db = sandbox.pool;
  try {
    process.env.TEXT_TO_IMAGE_ENABLED = "true";
    process.env.TEXT_TO_IMAGE_DAILY_LIMIT = "20";
    process.env.FAL_KEY = "test-fixture";
    const user = { id: randomUUID(), role: "creator" };
    await db.query("INSERT INTO users(id,role,full_name,email,password_hash) VALUES($1,'creator','Credit test',$2,'fixture')", [user.id, user.id + "@example.invalid"]);
    let starts = 0;
    let providerFails = false;
    let storageFails = true;
    const controller = isolatedServer({ db, overrides: {
      "services/FalTextToImageService.js": {
        MODEL: "fal-ai/flux/dev",
        startTextToImage: async () => String(++starts),
        getTextToImageStatus: async () => providerFails ? { status: "failed" } : { status: "completed", output: ["fixture"] },
      },
      "services/FashnTextToImageService.js": { saveOutputToCloudinary: async () => {
        if (storageFails) throw new Error("Injected save failure");
        return { url: "fixture", publicId: "fixture" };
      } },
    } }).load("controllers/creators/textToImageController.js");
    async function call(method, args = {}) {
      const res = { status(code) { this.code = code; return this; }, json(body) { return { code: this.code, ...body }; } };
      return controller[method]({ user, ...args }, res);
    }
    const available = async () => (await call("history")).credits.available;
    const start = (key = randomUUID()) => call("start", { body: { prompt: "A fitted green dress", request_key: key } });
    const poll = jobId => call("status", { params: { jobId } });
    assert.equal(await available(), 50);
    const key = randomUUID();
    const responses = await Promise.all([start(key), start(key)]);
    const jobId = responses[0].data.id;
    assert.equal(responses[1].data.id, jobId);
    assert.equal(starts, 1);
    assert.equal(await available(), 40);
    assert.equal((await poll(jobId)).code, "IMAGE_SAVE_RETRY");
    storageFails = false;
    await db.query("UPDATE creator_text_to_image_jobs SET updated_at=now()-interval '3 minutes' WHERE id=$1", [jobId]);
    assert.equal(Number((await poll(jobId)).data.credits_used), 10);
    await poll(jobId);
    assert.equal(await available(), 40);
    providerFails = true;
    const failed = await start();
    assert.equal((await poll(failed.data.id)).data.status, "failed");
    assert.equal(await available(), 40);
    await db.query("SELECT grant_paid_ai_credit_period($1,'pro',1,now()-interval '1 day',now()+interval '29 days','in_fixture')", [user.id]);
    assert.equal(await available(), 4500);
    await db.query("UPDATE membership_ai_credit_periods SET spent=4490 WHERE user_id=$1", [user.id]);
    providerFails = false;
    const last = await start();
    await poll(last.data.id);
    assert.equal(await available(), 0);
    assert.equal((await start()).code, "INSUFFICIENT_AI_CREDITS");
    assert.equal(starts, 3);
  } finally { await sandbox.dispose(); }
});
