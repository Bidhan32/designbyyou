const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { once } = require("node:events");
const express = require("express");
const sharp = require("sharp");
const { isolatedServer } = require("./support/isolated-app.cjs");
const { sandboxDatabase } = require("./support/sandbox-database.cjs");

test("runway charges only for saved cutouts, reuses retries, and fits one to five photos", async () => {
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
    app.use(isolatedServer({db,overrides:{
      "middlewares/authMiddleware.js":{protect:(req,res,next)=>{req.user={id:owner};next();},authorize:()=>pass,requireVerifiedEmail:pass},
      "services/FalBackgroundRemoverService.js":{removeBackground:async()=>{
        if(rejected) throw Object.assign(new Error("Image could not be processed."),{httpStatus:422});
        return {dataUri:"data:image/png;base64,"+image.toString("base64")};
      }}
    }}).load("routes/creatorRunwayRoutes.js"));
    server=app.listen(0,"127.0.0.1"); await once(server,"listening");
    const root="http://127.0.0.1:"+server.address().port;
    const balance=async()=>Number((await db.query("SELECT available FROM ai_image_balance($1,false)",[owner])).rows[0].available);
    async function save(id=randomUUID(),bytes=image) {
      const form=new FormData();
      form.append("photo_id",id); form.append("image",new Blob([bytes],{type:"image/png"}),"photo.png");
      return fetch(root+"/photos/prepare",{method:"POST",body:form});
    }
    const start=await balance();
    assert.equal((await save(randomUUID(),Buffer.from("broken"))).status,400);
    rejected=true;
    assert.equal((await save()).status,422);
    rejected=false;
    assert.equal(await balance(),start);
    // Fail the transaction after the photo INSERT and credit reservation.
    await db.query(`CREATE FUNCTION reject_fitting() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected settlement failure'; END $$;
      CREATE TRIGGER reject_fitting BEFORE UPDATE ON ai_image_reservations FOR EACH ROW
      WHEN (NEW.tool='runway_fitting') EXECUTE FUNCTION reject_fitting()`);
    assert.equal((await save()).status,503);
    assert.equal(await balance(),start);
    assert.deepEqual(await (await fetch(root+"/photos")).json(),[]);
    await db.query("DROP TRIGGER reject_fitting ON ai_image_reservations");
    const id=randomUUID();
    const retry=await Promise.all([save(id),save(id)]);
    assert.deepEqual(retry.map(r=>r.status).sort(),[200,201]);
    assert.equal(await balance(),start-10);
    const lineup=await (await fetch(root+"/weekly")).json();
    assert.equal(lineup.length,10);
    assert.ok(lineup.every(look=>look.photo_id===id));
    assert.equal((await fetch(root+"/photos/"+id+"/file")).status,200);
    for(let i=0;i<3;i++) assert.equal((await save()).status,201);
    const last=await Promise.all([save(),save()]);
    assert.deepEqual(last.map(r=>r.status).sort(),[201,409]);
    assert.equal((await save()).status,409);
    assert.equal(await balance(),start-50);
    assert.equal((await (await fetch(root+"/photos")).json()).length,5);
    assert.equal(new Set((await (await fetch(root+"/weekly")).json()).map(l=>l.photo_id)).size,5);
  } finally {
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    await sandbox.dispose();
  }
});
