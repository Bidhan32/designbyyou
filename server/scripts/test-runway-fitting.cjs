const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { once } = require("node:events");
const express = require("express");
const sharp = require("sharp");
const { isolatedServer } = require("./support/isolated-app.cjs");
const { sandboxDatabase } = require("./support/sandbox-database.cjs");

test("zero-credit runway fitting supports uploads, retries and weekly looks while standalone try-on stays paid", async t => {
  require("dotenv").config({quiet:true});
  const sandbox = await sandboxDatabase();
  const db = sandbox.pool, owner = randomUUID();
  let server;
  try {
    await db.query("INSERT INTO users(id,role,full_name,email,password_hash) VALUES($1,'creator','Runway test',$2,'fixture')",[owner,owner+"@example.invalid"]);
    const image = await sharp({create:{width:40,height:80,channels:4,background:"red"}}).png().toBuffer();
    let rejected = false;
    const pass = (_req,_res,next)=>next();
    const app = express();
    const keys=["CREATOR_TRYON_ENABLED","FAL_KEY"];
    const previous=keys.map(key=>process.env[key]);
    t.after(()=>keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];}));
    process.env.CREATOR_TRYON_ENABLED="true";
    process.env.FAL_KEY="test-fixture";
    const loader=isolatedServer({db,overrides:{
      "services/FashnCreatorTryOnService.js":{
        FAL_MODEL:"fal-ai/fashn/tryon/v1.6",prepareImage:async()=>image,startPrediction:async()=>randomUUID(),
        getPrediction:async()=>({data:{status:"completed",output:["fixture"]},credits:10}),
        savePrivateResult:async()=>"fixture",signedResultUrls:()=>({image_url:null})
      },
      "middlewares/authMiddleware.js":{protect:(req,res,next)=>{req.user={id:owner,role:"creator"};next();},authorize:()=>pass,requireVerifiedEmail:pass},
      "services/FalBackgroundRemoverService.js":{removeBackground:async()=>{
        if(rejected) throw Object.assign(new Error("Image could not be processed."),{httpStatus:422});
        return {dataUri:"data:image/png;base64,"+image.toString("base64")};
      }}
    }});
    app.use(loader.load("routes/creatorRunwayRoutes.js"));
    app.get("/job/:jobId",(req,res)=>{req.user={id:owner,role:"creator"};return loader.load("controllers/creators/creatorVirtualTryOnController.js").status(req,res);});
    server=app.listen(0,"127.0.0.1"); await once(server,"listening");
    const root="http://127.0.0.1:"+server.address().port;
    const balance=async()=>Number((await db.query("SELECT available FROM ai_image_balance($1,false)",[owner])).rows[0].available);
    async function save(id=randomUUID(),bytes=image) {
      const form=new FormData();
      form.append("photo_id",id); form.append("image",new Blob([bytes],{type:"image/png"}),"photo.png");
      return fetch(root+"/photos/prepare",{method:"POST",body:form});
    }
    await balance();
    await db.query("UPDATE free_ai_credit_months SET allocated=allowance WHERE user_id=$1",[owner]);
    const start=await balance();
    assert.equal(start,0);
    assert.equal((await save(randomUUID(),Buffer.from("broken"))).status,400);
    rejected=true;
    assert.equal((await save()).status,422);
    rejected=false;
    assert.equal(await balance(),start);
    // A failed photo write must leave the saved list empty.
    await db.query(`CREATE FUNCTION reject_fitting() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected settlement failure'; END $$;
      CREATE TRIGGER reject_fitting BEFORE INSERT ON creator_runway_photos FOR EACH ROW
      EXECUTE FUNCTION reject_fitting()`);
    assert.equal((await save()).status,503);
    assert.equal(await balance(),start);
    assert.deepEqual(await (await fetch(root+"/photos")).json(),[]);
    await db.query("DROP TRIGGER reject_fitting ON creator_runway_photos");
    const id=randomUUID();
    const retry=await Promise.all([save(id),save(id)]);
    assert.deepEqual(retry.map(r=>r.status).sort(),[200,201]);
    assert.equal(await balance(),start);
    const insertJob=weekly=>db.query("INSERT INTO creator_virtual_tryon_jobs(creator_id,request_key,weekly_runway) VALUES ($1,$2,$3) RETURNING id",[owner,randomUUID(),weekly]);
    const {rows:[job]}=await insertJob(true);
    for(const status of ["processing","failed","saving","completed"]){
      await db.query("UPDATE creator_virtual_tryon_jobs SET status=$2 WHERE id=$1",[job.id,status]);
    }
    assert.equal((await db.query("SELECT 1 FROM ai_image_reservations WHERE creator_id=$1",[owner])).rowCount,0);
    await assert.rejects(insertJob(false),{code:"DB402"});
    // Process a saved upload with no browser polling or generation requests.
    const queued=await db.query("SELECT request_key FROM creator_runway_looks WHERE photo_id=$1 AND process_after IS NOT NULL",[id]);
    assert.equal(queued.rowCount,10);
    const worker=loader.load("services/runwayWorker.js");
    await worker.processNext();
    const {rows:[generated]}=await db.query("SELECT id,request_key FROM creator_virtual_tryon_jobs WHERE creator_id=$1 AND status='processing'",[owner]);
    assert.ok(generated);
    await db.query("UPDATE creator_runway_looks SET process_after=now() WHERE request_key=$1",[generated.request_key]);
    await worker.processNext();
    const completed=await (await fetch(root+"/job/"+generated.id)).json();
    assert.equal(completed.data.status,"completed");
    assert.equal(Number(completed.data.credits_used),0);
    const lineup=await (await fetch(root+"/weekly")).json();
    assert.equal(lineup.length,10);
    const done=lineup.find(look=>look.job_id===generated.id);
    assert.equal((await (await fetch(root+"/weekly/"+done.id,{method:"POST"})).json()).reused,true);
    assert.ok(lineup.every(look=>look.photo_id===id));
    assert.equal((await fetch(root+"/photos/"+id+"/file")).status,200);
    for(let i=0;i<3;i++) assert.equal((await save()).status,201);
    const last=await Promise.all([save(),save()]);
    assert.deepEqual(last.map(r=>r.status).sort(),[201,409]);
    assert.equal((await save()).status,409);
    assert.equal(await balance(),start);
    assert.equal((await (await fetch(root+"/photos")).json()).length,5);
    assert.equal(new Set((await (await fetch(root+"/weekly")).json()).map(l=>l.photo_id)).size,5);
  } finally {
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    await sandbox.dispose();
  }
});

test("runway cutouts keep the full figure while removing transparent margins", async()=>{
  const frame=require("../services/frameRunwayCutout");
  const subject=await sharp({create:{width:24,height:110,channels:4,background:"red"}}).png().toBuffer();
  const padded=await sharp({create:{width:320,height:400,channels:4,background:{r:0,g:0,b:0,alpha:0.01}}})
    .composite([{input:subject,left:35,top:232}]).png().toBuffer();
  const {width,height,hasAlpha}=await sharp(await frame(padded)).metadata();
  assert.deepEqual([width,height,hasAlpha],[28,114,true]);
});
