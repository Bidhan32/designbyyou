"use strict";
const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const cloud = require("cloudinary").v2;

const { rateLimit } = require("express-rate-limit");
const db = require("../config/db");
const { signedResultUrls } = require("../services/FashnCreatorTryOnService");
const { protect, authorize, requireVerifiedEmail } = require("../middlewares/authMiddleware");
const router = express.Router();
router.use(protect, authorize("creator"), requireVerifiedEmail);
router.use((_req,res,next) => { res.set("Cache-Control","private, no-store"); next(); });
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const upload = multer({ limits: { fileSize: 16*1024*1024, fields:1, files:1, parts:3 } }).single("image");
const mutations = rateLimit({ windowMs:60000, limit:20, keyGenerator:req=>String(req.user.id) });
const asset = (owner,id) => "designbyyou_runway/"+owner+"/"+id;
const photoUrl = (owner,id) => cloud.utils.private_download_url(asset(owner,id),"webp",{
  resource_type:"image",type:"authenticated",expires_at:Math.floor(Date.now()/1000)+900
});
const frameRunwayCutout = require("../services/frameRunwayCutout");
const {removeRunwayBackground} = require("../services/FashnCreatorTryOnService");
const slots = [1,2,3,4,5];
const photoFields = "id, slot, thumbnail";
const photos = async owner => (await db.query("SELECT "+photoFields+" FROM creator_runway_photos WHERE creator_id=$1 ORDER BY slot",[owner])).rows;
const present = (owner,p) => ({id:p.id,slot:p.slot,url:p.thumbnail
  ? "data:image/webp;base64,"+p.thumbnail.toString("base64") : photoUrl(owner,p.id)});
router.get("/photos",async(req,res)=>res.json((await photos(req.user.id)).map(p=>present(req.user.id,p))));

async function fittingFile(owner,id) {
  const {rows:[row]} = await db.query("SELECT cutout FROM creator_runway_photos WHERE creator_id=$1 AND id=$2",[owner,id]);
  if (!row) return null;
  if (row.cutout) return row.cutout;
  const response = await fetch(photoUrl(owner,id),{signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error("Stored fitting photo unavailable");
  return Buffer.from(await response.arrayBuffer());
}

router.get("/photos/:id/file",async(req,res)=>{
  if (!uuid.test(req.params.id)) return res.sendStatus(404);
  const file = await fittingFile(req.user.id,req.params.id);
  if (!file) return res.sendStatus(404);
  res.type("image/webp").send(req.query.frame==="1" ? await frameRunwayCutout(file) : file);
});

const maxBytes = 12*1024*1024;
const fail = (httpStatus,message) => Object.assign(new Error(message),{httpStatus});
function readUpload(req,res,next) {
  upload(req,res,err => err ? res.status(400).json({message:err.code==="LIMIT_FILE_SIZE"
    ? "Choose a photo up to 12 MB." : "Choose one JPG, PNG or WebP photo per upload."}) : next());
}

async function preparePhoto(file, alreadyCutOut) {
  let input;
  try {
    const source = sharp(file.buffer,{limitInputPixels:32000000,failOn:"warning"});
    const metadata = await source.metadata();
    if (!["jpeg","png","webp"].includes(metadata.format) || (metadata.pages || 1)>1) throw new Error();
    input = await source.rotate().resize({width:1200,height:1600,fit:"inside",withoutEnlargement:true}).webp({quality:90}).toBuffer();
  } catch { throw fail(400,"Choose a readable, single-frame JPG, PNG or WebP under 32 megapixels."); }
  if (alreadyCutOut) return input;
  const {dataUri} = await removeRunwayBackground("data:image/webp;base64,"+input.toString("base64"));
  return sharp(Buffer.from(dataUri.slice(dataUri.indexOf(",")+1),"base64"),{limitInputPixels:32000000})
    .resize({width:1200,height:1600,fit:"inside",withoutEnlargement:true}).webp({quality:86}).toBuffer();
}

async function savePhoto(req,res) {
  const owner=req.user.id, id=req.body?.photo_id;
  if (!req.file || !uuid.test(id)) return res.status(400).json({message:"Choose a photo and try saving again."});
  const legacy=req.path==="/photos";
  try {
    const used=await photos(owner);
    const saved=used.find(p=>p.id===id);
    if (saved) return res.json(present(owner,saved));
    if (used.length>=slots.length) throw fail(409,"You have five fitting photos. Remove one to add another.");
    if (!legacy && req.file.size>maxBytes) throw fail(400,"Choose a photo up to 12 MB.");
    const cutout=await preparePhoto(req.file,legacy);
    const thumbnail=await sharp(cutout).resize({width:180,height:240,fit:"inside",withoutEnlargement:true}).webp({quality:75}).toBuffer();
    const client=await db.connect();
    let result, created=false;
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[owner]);
      const {rows}=await client.query("SELECT "+photoFields+" FROM creator_runway_photos WHERE creator_id=$1",[owner]);
      result=rows.find(p=>p.id===id);
      if (!result) {
        const slot=slots.find(n=>!rows.some(p=>p.slot===n));
        if (!slot) throw fail(409,"All five slots are full. Remove a photo and try again.");
        await client.query("INSERT INTO creator_runway_photos(id,creator_id,slot,cutout,thumbnail) VALUES($1,$2,$3,$4,$5)",[id,owner,slot,cutout,thumbnail]);
        await queueLineup(client,owner);
        result={id,slot,thumbnail};
        created=true;
      }
      await client.query("COMMIT");
    } catch(err) { await client.query("ROLLBACK"); throw err; }
    finally {client.release();}
    return res.status(created?201:200).json(present(owner,result));
  } catch(err) {
    if (err.httpStatus) return res.status(err.httpStatus).json({message:err.message});
    console.error("[Runway fitting] Save failed",err.code || err.name);
    return res.status(503).json({message:"We could not confirm that this photo was saved. Retry the same selection to check."});
  }
}
router.post(["/photos","/photos/prepare"],mutations,readUpload,savePhoto);

router.delete("/photos/:id",mutations,async(req,res)=>{
  const id=req.params.id,owner=req.user.id;
  const photo=uuid.test(id) && (await photos(owner)).find(p=>p.id===id);
  if(!photo) return res.sendStatus(404);
  if (!photo.thumbnail) {
    const result=await cloud.uploader.destroy(asset(owner,id),{type:"authenticated",invalidate:true});
  if(!["ok","not found"].includes(result.result)) return res.sendStatus(502);
  }
  await db.query("DELETE FROM creator_runway_photos WHERE id=$1 AND creator_id=$2",[id,owner]);
  res.sendStatus(204);
});

const defaults = require("../services/defaultRunway");
const weeklyPairs = `WITH collection AS (
  SELECT id, title, slot, false AS is_default FROM runway_weekly_designs
  UNION ALL
  SELECT id, title, slot, true FROM jsonb_to_recordset($2::jsonb) AS fallback(id uuid,title text,slot smallint)
  WHERE NOT EXISTS (SELECT 1 FROM runway_weekly_designs)
), poses AS (
  SELECT id, row_number() OVER (ORDER BY slot) AS pos, count(*) OVER () AS total
  FROM creator_runway_photos WHERE creator_id=$1
) SELECT d.id,d.title,d.is_default,p.id AS photo_id,j.id AS job_id,j.status,j.output_public_id,
    CASE WHEN j.status='failed' AND j.error_message='Runway fitting is temporarily unavailable. No AI credits are required.'
      THEN j.error_message ELSE l.process_error END AS process_error
  FROM collection d JOIN poses p ON p.pos=1+mod(d.slot-1,p.total)
  LEFT JOIN creator_runway_looks l ON l.photo_id=p.id AND l.source='weekly' AND l.project_id=d.id::text AND l.version='1'
  LEFT JOIN creator_virtual_tryon_jobs j ON j.creator_id=$1 AND j.request_key=l.request_key`;
async function queueLineup(client,owner){
  await client.query(`INSERT INTO creator_runway_looks AS l(photo_id,source,project_id,version,process_after)
    SELECT photo_id,'weekly',id::text,'1',now() FROM (${weeklyPairs}) pairs
    WHERE status IS NULL OR status IN ('submitting','processing','saving')
    ON CONFLICT(photo_id,source,project_id,version) DO UPDATE SET process_after=now()
    WHERE l.process_after IS NULL`,[owner,defaults.metadata]);
}
router.get("/weekly",async(req,res)=>{
  const {rows}=await db.query(weeklyPairs+" ORDER BY d.slot",[req.user.id,defaults.metadata]);
  if(rows.some(row=>!row.job_id || !["completed","failed"].includes(row.status)))await queueLineup(db,req.user.id);
  res.json(rows.map(({output_public_id,...row})=>({...row,needs_framing:Boolean(output_public_id && !output_public_id.endsWith("_framed_cutout")),image_url:signedResultUrls(output_public_id).image_url})));
});
// Existing outfits can be reframed without sending another generation to the AI provider.
router.get("/weekly/:id/preview",async(req,res)=>{
  if(!uuid.test(req.params.id)) return res.sendStatus(404);
  const {rows:[job]}=await db.query("SELECT output_public_id FROM creator_virtual_tryon_jobs WHERE id=$1 AND creator_id=$2 AND weekly_runway AND status='completed'",[req.params.id,req.user.id]);
  if(!job?.output_public_id) return res.sendStatus(404);
  const response=await fetch(signedResultUrls(job.output_public_id).image_url,{signal:AbortSignal.timeout(20000)});
  if(!response.ok) return res.sendStatus(502);
  const image=await frameRunwayCutout(Buffer.from(await response.arrayBuffer()));
  res.vary("Authorization").set("Cache-Control","private, max-age=86400").type("webp").send(image);
});
async function startWeekly(req,res){
  if(!uuid.test(req.params.id)) return res.sendStatus(404);
  const owner=req.user.id;
  const {rows}=await db.query(weeklyPairs+" WHERE d.id=$3",[owner,defaults.metadata,req.params.id]);
  const pair=rows[0];
  if(!pair || (req.expectedPhoto && req.expectedPhoto!==pair.photo_id)) return res.status(409).json({message:"The lineup changed. Refresh your runway."});
  const {rows:keys}=await db.query(`INSERT INTO creator_runway_looks AS l(photo_id,source,project_id,version)
    VALUES ($1,'weekly',$2,'1') ON CONFLICT(photo_id,source,project_id,version) DO UPDATE
    SET process_after=coalesce(l.process_after,now()),request_key=CASE WHEN $3::boolean AND EXISTS(SELECT 1 FROM creator_virtual_tryon_jobs WHERE creator_id=$4 AND request_key=l.request_key AND status='failed')
      THEN gen_random_uuid() ELSE l.request_key END RETURNING request_key`,[pair.photo_id,pair.id,req.body?.retry===true,owner]);
  const garment=pair.is_default ? await defaults.imageFor(pair.id) :
    (await db.query("SELECT image FROM runway_weekly_designs WHERE id=$1",[pair.id])).rows[0]?.image;
  if(!garment) return res.status(409).json({message:"The weekly collection changed."});
  const picture=await fittingFile(owner,pair.photo_id);
  if(!picture) return res.status(502).json({message:"Could not open the fitting photo."});
  req.files={person_image:[{buffer:await sharp(await frameRunwayCutout(picture)).resize(768,1024,{fit:"contain",background:{r:255,g:255,b:255,alpha:0}}).webp().toBuffer(),mimetype:"image/webp"}],
    garment_image:[{buffer:garment,mimetype:"image/webp"}]};
  req.weeklyRunway=true;
  req.weeklyLineupSize=pair.is_default ? defaults.count : 6;
  req.body={action:"try_on",request_key:keys[0].request_key};
  return require("../controllers/creators/creatorVirtualTryOnController").start(req,res);
}
router.post("/weekly/:id",mutations,startWeekly);
module.exports=router;
module.exports.startWeekly=startWeekly;
