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

async function preparePhoto(file) {
  let input;
  try {
    const source = sharp(file.buffer,{limitInputPixels:32000000,failOn:"warning"});
    const metadata = await source.metadata();
    if (!["jpeg","png","webp"].includes(metadata.format) || (metadata.pages || 1)>1) throw new Error();
    if (Math.min(metadata.width,metadata.height)<128) throw fail(400,"Choose a fitting photo at least 128 pixels on each side.");
    input = await source.rotate().resize({width:1200,height:1600,fit:"inside",withoutEnlargement:true}).webp({quality:90}).toBuffer();
  } catch(err) { if(err.httpStatus)throw err; throw fail(400,"Choose a readable, single-frame JPG, PNG or WebP under 32 megapixels."); }
  return input;
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
    const cutout=await preparePhoto(req.file);
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

const {createHash}=require("node:crypto");
const garmentUpload=multer({limits:{files:10,fileSize:8*1024*1024,fields:0}}).array("garments",10);
router.post("/garments",mutations,(req,res,next)=>garmentUpload(req,res,err=>err
  ? res.status(400).json({message:"Choose up to 10 garment images, each under 8 MB."}) : next()),async(req,res)=>{
  if(!req.files?.length)return res.status(400).json({message:"Choose at least one garment image."});
  const items=[];
  for(const file of req.files){
    try {
      const image=await preparePhoto(file);
      const thumbnail=await sharp(image).resize(220,280,{fit:"inside",withoutEnlargement:true}).webp().toBuffer();
      items.push({image,thumbnail,digest:createHash("sha256").update(file.buffer).digest("hex"),
        title:file.originalname.replace(/\.[^.]+$/,"").slice(0,100) || "Garment"});
    }catch(err){return res.status(400).json({message:file.originalname+" — "+err.message});}
  }
  const owner=req.user.id;
  const client=await db.connect();
  try{
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[owner]);
    const {rows}=await client.query("SELECT slot,digest FROM creator_runway_garments WHERE creator_id=$1",[owner]);
    const occupied=new Set(rows.map(row=>row.slot));
    const known=new Set(rows.map(row=>row.digest));
    for(const item of items){
      if(known.has(item.digest))continue;
      if(occupied.size===10)throw fail(409,"Your rack holds 10 garments. Remove a garment or choose fewer files.");
      let slot=1;
      while(occupied.has(slot))slot++;
      await client.query("INSERT INTO creator_runway_garments(creator_id,slot,digest,title,image,thumbnail) VALUES($1,$2,$3,$4,$5,$6)",
        [owner,slot,item.digest,item.title,item.image,item.thumbnail]);
      occupied.add(slot);known.add(item.digest);
    }
    await client.query("COMMIT");
    res.sendStatus(200);
  }catch(err){
    await client.query("ROLLBACK");
    if(err.httpStatus)return res.status(err.httpStatus).json({message:err.message});
    throw err;
  }finally{client.release();}
});
router.delete("/garments/:id",mutations,async(req,res)=>{
  if(!uuid.test(req.params.id))return res.sendStatus(404);
  const result=await db.query("DELETE FROM creator_runway_garments WHERE creator_id=$1 AND id=$2",[req.user.id,req.params.id]);
  res.sendStatus(result.rowCount?204:404);
});
const weeklyPairs = `WITH collection AS (
  SELECT id, title, slot FROM creator_runway_garments WHERE creator_id=$1
), poses AS (
  SELECT id
  FROM creator_runway_photos WHERE creator_id=$1 AND ($2::uuid IS NULL OR id=$2) ORDER BY slot LIMIT 1
) SELECT d.id,d.title,p.id AS photo_id,j.id AS job_id,j.status,j.output_public_id,
    CASE WHEN j.status='failed' AND j.error_message='Runway fitting is temporarily unavailable. No AI credits are required.'
      THEN j.error_message ELSE l.process_error END AS process_error
  FROM collection d LEFT JOIN poses p ON true
  LEFT JOIN creator_runway_looks l ON l.photo_id=p.id AND l.source='weekly' AND l.project_id=d.id::text AND l.version='1'
  LEFT JOIN creator_virtual_tryon_jobs j ON j.creator_id=$1 AND j.request_key=l.request_key`;
router.get("/weekly",async(req,res)=>{
  const photo=req.query.photo_id || null;
  if(photo && !uuid.test(photo))return res.sendStatus(400);
  const {rows}=await db.query(weeklyPairs+" ORDER BY d.slot",[req.user.id,photo]);
  res.json(rows.map(({output_public_id,...row})=>({...row,needs_framing:Boolean(output_public_id && !output_public_id.endsWith("_framed_cutout") && !output_public_id.endsWith("_fitting")),image_url:signedResultUrls(output_public_id).image_url})));
});
router.get("/garments/:id",async(req,res)=>{
  const id=req.params.id;
  if(!uuid.test(id))return res.sendStatus(404);
  const image=(await db.query("SELECT thumbnail FROM creator_runway_garments WHERE id=$1 AND creator_id=$2",[id,req.user.id])).rows[0]?.thumbnail;
  if(!image)return res.sendStatus(404);
  res.vary("Authorization").set("Cache-Control","private, max-age=86400").type("image/webp").send(image);
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
  if(req.body?.photo_id && !uuid.test(req.body.photo_id))return res.sendStatus(400);
  const owner=req.user.id;
  const {rows}=await db.query(weeklyPairs+" WHERE d.id=$3",[owner,req.body?.photo_id || null,req.params.id]);
  const pair=rows[0];
  if(!pair)return res.sendStatus(404);
  if(!pair?.photo_id) return res.status(409).json({message:"The lineup changed. Refresh your runway."});
  const {rows:keys}=await db.query(`INSERT INTO creator_runway_looks AS l(photo_id,source,project_id,version,process_after)
    VALUES ($1,'weekly',$2,'1',now()) ON CONFLICT(photo_id,source,project_id,version) DO UPDATE
    SET process_after=coalesce(l.process_after,now()),request_key=CASE WHEN $3::boolean AND EXISTS(SELECT 1 FROM creator_virtual_tryon_jobs WHERE creator_id=$4 AND request_key=l.request_key AND status='failed')
      THEN gen_random_uuid() ELSE l.request_key END RETURNING request_key`,[pair.photo_id,pair.id,req.body?.retry===true,owner]);
  const [garmentResult,picture]=await Promise.all([
    db.query("SELECT image FROM creator_runway_garments WHERE id=$1 AND creator_id=$2",[pair.id,owner]),
    fittingFile(owner,pair.photo_id)
  ]);
  const garment=garmentResult.rows[0]?.image;
  if(!garment) return res.status(409).json({message:"The weekly collection changed."});
  if(!picture) return res.status(502).json({message:"Could not open the fitting photo."});
  req.files={person_image:[{buffer:picture,mimetype:"image/webp"}],
    garment_image:[{buffer:garment,mimetype:"image/webp"}]};
  req.weeklyRunway=true;
  req.weeklyLineupSize=10;
  req.body={mode:"performance",action:"try_on",request_key:keys[0].request_key};
  return require("../controllers/creators/creatorVirtualTryOnController").start(req,res);
}
router.post("/weekly/:id",mutations,startWeekly);
module.exports=router;
module.exports.startWeekly=startWeekly;
