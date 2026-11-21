const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { once } = require("node:events");
const express = require("express");
const sharp = require("sharp");
const cloud = require("cloudinary").v2;
const { isolatedServer } = require("./support/isolated-app.cjs");
const { sandboxDatabase } = require("./support/sandbox-database.cjs");

test("large GLBs keep geometry and aligned buffer views when an embedded texture is reduced", async () => {
  const { prepareModel } = require("../services/ai/modelStorage");
  const pixels = require("node:crypto").randomBytes(1800 * 1800 * 3);
  const texture = await sharp(pixels, { raw: { width: 1800, height: 1800, channels: 3 } }).png().toBuffer();
  const offset = Math.ceil(texture.length / 4) * 4;
  const bin = Buffer.alloc(offset + 12);
  texture.copy(bin);
  bin.writeFloatLE(2.5, offset);
  const doc = { asset: {version: "2.0"}, buffers: [{byteLength: bin.length}],
    bufferViews: [{buffer: 0, byteLength: texture.length}, {buffer: 0, byteOffset: offset, byteLength: 12}],
    images: [{bufferView: 0, mimeType: "image/png"}] };
  const json = Buffer.from(JSON.stringify(doc));
  const length = Math.ceil(json.length / 4) * 4;
  const header = Buffer.alloc(20);
  header.write("glTF"); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + length + bin.length, 8);
  header.writeUInt32LE(length, 12); header.write("JSON", 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length); binHeader.write("BIN", 4);
  const output = await prepareModel(Buffer.concat([header, json, Buffer.alloc(length - json.length, 32), binHeader, bin]));
  assert.equal(output.readUInt32LE(8), output.length);
  assert.ok(output.length < texture.length);
  const end = 20 + output.readUInt32LE(12);
  const result = JSON.parse(output.toString("utf8", 20, end));
  assert.equal(result.images[0].mimeType, "image/jpeg");
  assert.equal(result.bufferViews[1].byteOffset % 4, 0);
  assert.deepEqual(output.subarray(end + 8 + result.bufferViews[1].byteOffset), bin.subarray(offset));
});

test("3D handoff reserves once, stores privately, isolates owners and refunds failed jobs", async () => {
  require("dotenv").config({ quiet: true });
  const sandbox = await sandboxDatabase();
  const db = sandbox.pool;
  let server;
  const storageDirectory = await require("node:fs/promises").mkdtemp(require("node:path").join(require("node:os").tmpdir(), "model-route-"));
  const fixturePath = require("node:path").join(storageDirectory, "fixture.glb");
  try {
    const owner = randomUUID(), other = randomUUID();
    for (const id of [owner, other]) await db.query("INSERT INTO users(id,role,full_name,email,password_hash) VALUES($1,'creator','Model test',$2,'fixture')", [id, id + "@example.invalid"]);
    process.env.FAL_KEY = "fixture";
    cloud.config({ cloud_name: "fixture", api_key: "fixture", api_secret: "fixture" });
    let submissions = 0, saves = 0, failed = false, storageOffline = true;
    const auth = (req,res,next) => { req.user = { id: req.headers["x-owner"] || owner }; next(); };
    const pass = (req,res,next) => next();
    const app = express();
    app.use(isolatedServer({ db, overrides: {
      "services/ai/modelStorage.js": { localModelPath: () => fixturePath, storeModel: async (url, asset) => {
        assert.equal(url, "https://fal.media/fixture.glb");
        assert.ok(asset.startsWith("designbyyou_ai/models/" + owner + "/"));
        if (storageOffline) throw new Error("Injected temporary storage failure");
        saves++;
        return asset;
      } },
      "middlewares/authMiddleware.js": { protect: auth, authorize: () => pass, requireVerifiedEmail: pass },
      "services/ai/falImageQueue.js": { submitImage: async (_model, input) => {
        assert.match(input.input_image_url, /^data:image\/png;base64,/);
        return "model-job-" + ++submissions;
      } },
      "services/ai/falFashionService.js": { getFalClient: async () => ({ queue: {
        status: async () => failed ? { error: "fixture" } : { status: "COMPLETED" },
        result: async () => ({ data: { model_glb: { url: "https://fal.media/fixture.glb" } } }),
      } }) },
    } }).load("routes/creatorModelRoutes.js"));
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const url = "http://127.0.0.1:" + server.address().port + "/jobs";
    const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: "red" } }).avif().toBuffer();
    const create = (key, content = bytes) => {
      const body = new FormData(); body.append("request_key", key); body.append("image", new Blob([content], {type:"image/avif"}), "dress.avif");
      return fetch(url, {method:"POST", body});
    };
    const balance = async () => Number((await db.query("SELECT available FROM ai_image_balance($1,false)", [owner])).rows[0].available);
    assert.equal((await create(randomUUID(), Buffer.from("invalid"))).status, 400);
    const key = randomUUID();
    const jobs = await Promise.all([create(key), create(key)]);
    const [a,b] = await Promise.all(jobs.map(async r => { assert.ok(r.ok, await r.clone().text()); return r.json(); }));
    assert.equal(a.id, b.id);
    assert.equal(submissions, 1);
    assert.equal(await balance(), 40);
    assert.equal((await create(randomUUID())).status, 409);
    assert.equal((await fetch(url + "/" + a.id, {headers:{"x-owner":other}})).status, 404);
    const retry = await fetch(url + "/" + a.id);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).status, "saving");
    assert.equal(await balance(), 40);
    storageOffline = false;
    await db.query("UPDATE creator_model_jobs SET next_check=now() WHERE id=$1", [a.id]);
    const completed = await (await fetch(url + "/" + a.id)).json();
    assert.equal(completed.status, "completed");
    assert.match(completed.model_url, /signature=/);
    await fetch(url + "/" + a.id);
    assert.equal(saves, 1);
    await require("node:fs/promises").writeFile(fixturePath, "glTF fixture");
    await db.query("UPDATE creator_model_jobs SET model_asset=$2 WHERE id=$1",[a.id, "local:" + a.id]);
    const local = await (await fetch(url + "/" + a.id)).json();
    assert.ok(local.file_path.endsWith(a.id + "/file"));
    assert.equal((await fetch(url + "/" + a.id + "/file", {headers:{"x-owner":other}})).status, 404);
    const file = await fetch(url + "/" + a.id + "/file");
    assert.equal(file.status, 200);
    assert.equal(await file.text(), "glTF fixture");
    const second = await (await create(randomUUID())).json();
    failed = true;
    assert.equal((await (await fetch(url + "/" + second.id)).json()).status, "failed");
    assert.equal(await balance(), 40);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await require("node:fs/promises").rm(fixturePath, {force:true});
    await require("node:fs/promises").rmdir(storageDirectory);
    await sandbox.dispose();
  }
});
