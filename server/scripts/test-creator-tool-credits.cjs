const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { isolatedServer } = require("./support/isolated-app.cjs");
const { sandboxDatabase } = require("./support/sandbox-database.cjs");

test("creator tools share one balance and settle each delivered image once", async t => {
  require("dotenv").config({quiet:true});
  const sandbox = await sandboxDatabase();
  t.after(() => sandbox.dispose());
  const db = sandbox.pool;
  const app = isolatedServer({db});
  const { generateTemporaryImage } = app.load("services/temporaryImageCredits.js");
  const { renderOnce } = app.load("services/ai/fashionPreviewQuota.js");
  const owner = randomUUID();
  await db.query("INSERT INTO users(id,role,full_name,email,password_hash) VALUES($1,'creator','Creator',$2,'test')", [owner, owner+"@example.invalid"]);
  async function available() {
    return (await db.query("SELECT available FROM ai_image_balance($1,false)",[owner])).rows[0].available;
  }
  async function job(table, extra = "") {
    const insert = table === "creator_pattern_extraction_jobs" ? ",mode" : "";
    const result = await db.query(`INSERT INTO ${table}(creator_id,request_key${insert}) VALUES($1,$2${extra}) RETURNING id`,[owner,randomUUID()]);
    return result.rows[0].id;
  }
  async function state(table,id,value) {
    await db.query(`UPDATE ${table} SET status=$2 WHERE id=$1`,[id,value]);
  }
  const sketchTable="creator_sketch_to_image_jobs";
  const sketch=await job(sketchTable);
  await state(sketchTable,sketch,"completed");
  await state(sketchTable,sketch,"completed");
  assert.equal(await available(),40);

  const tryonTable="creator_virtual_tryon_jobs";
  const tryon=await job(tryonTable);
  await state(tryonTable,tryon,"failed");
  assert.equal(await available(),40);
  await state(tryonTable,tryon,"saving");
  await state(tryonTable,tryon,"completed");
  assert.equal(await available(),30);

  const multi=await job("creator_multi_view_jobs");
  const views = await db.query("INSERT INTO creator_multi_view_images(job_id,view) VALUES($1,'front'),($1,'side'),($1,'back') RETURNING id",[multi]);
  assert.equal(await available(),0);
  await assert.rejects(job(sketchTable), {code:"DB402"});
  await state("creator_multi_view_images",views.rows[0].id,"completed");
  await state("creator_multi_view_images",views.rows[1].id,"failed");
  await state("creator_multi_view_images",views.rows[2].id,"failed");
  assert.equal(await available(),20);
  const anotherSet = await job("creator_multi_view_jobs");
  await assert.rejects(db.query("INSERT INTO creator_multi_view_images(job_id,view) VALUES($1,'front'),($1,'side'),($1,'back')",[anotherSet]),{code:"DB402"});
  assert.equal(await available(),20);

  const pattern=await job("creator_pattern_extraction_jobs",",'faithful'");
  const costume=await job("creator_costume_extraction_jobs");
  const view=(await db.query("INSERT INTO creator_costume_extraction_views(job_id,view_name) VALUES($1,'front') RETURNING id",[costume])).rows[0].id;
  assert.equal(await available(),20);
  await state("creator_pattern_extraction_jobs",pattern,"submitting");
  await state("creator_costume_extraction_views",view,"submitting");
  assert.equal(await available(),0);
  await state("creator_pattern_extraction_jobs",pattern,"submission_unknown");
  await state("creator_costume_extraction_views",view,"failed");
  assert.equal(await available(),20);

  const key=randomUUID();
  let calls=0;
  const generate=async () => ++calls;
  const duplicate=await Promise.allSettled([1,2].map(()=>generateTemporaryImage(owner,"background_remover",key,generate)));
  assert.equal(duplicate.filter(r => r.status==="fulfilled").length,1);
  assert.equal(calls,1);
  assert.equal(await available(),10);
  await assert.rejects(generateTemporaryImage(owner,"booking_tryon",randomUUID(),async () => { throw Error("provider failure"); }),/provider failure/);
  assert.equal(await available(),10);
  const preview=async () => ({requestId:"fixture"});
  const first=await renderOnce(owner,"design",preview);
  assert.deepEqual(await renderOnce(owner,"design",preview),first);
  assert.equal(await available(),0);
  await assert.rejects(generateTemporaryImage(owner,"booking_tryon",randomUUID(),generate),{httpStatus:402});
  assert.equal(calls,1);
});
