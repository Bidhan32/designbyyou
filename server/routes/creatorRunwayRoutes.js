"use strict";
const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const cloud = require("cloudinary").v2;
const { randomUUID } = require("node:crypto");
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
const photos = async owner => (await db.query("SELECT id, slot FROM creator_runway_photos WHERE creator_id=$1 ORDER BY slot",[owner])).rows;
router.get("/photos",async(req,res)=>res.json((await photos(req.user.id)).map(p=>({...p,url:photoUrl(req.user.id,p.id)}))));
router.get("/photos/:id/file",async(req,res)=>{
  if (!uuid.test(req.params.id) || !(await photos(req.user.id)).some(p=>p.id===req.params.id)) return res.sendStatus(404);
  const response = await fetch(photoUrl(req.user.id,req.params.id),{signal:AbortSignal.timeout(20000)});
  if (!response.ok) return res.sendStatus(502);
  res.type("image/webp").send(Buffer.from(await response.arrayBuffer()));
});
router.post("/photos",mutations,upload,async(req,res)=>{
  if (!req.file) return res.status(400).json({message:"Choose a fitting photo."});
  const owner=req.user.id, id=req.body.photo_id ?? randomUUID();
  if (!uuid.test(id)) return res.status(400).json({message:"Invalid photo ID."});
  const used=await photos(owner);
  const saved=used.find(photo=>photo.id===id);
  if (saved) return res.json({...saved,url:photoUrl(owner,id)});
  const slot=[1,2,3,4].find(n=>!used.some(p=>p.slot===n));
  if (!slot) return res.status(409).json({message:"Remove a fitting photo to make room."});
  let buffer;
  try {
    buffer=await sharp(req.file.buffer,{limitInputPixels:32000000}).rotate().resize({width:1200,height:1600,fit:"inside",withoutEnlargement:true}).webp({quality:86}).toBuffer();
  } catch { return res.status(400).json({message:"Choose a readable image."}); }
  await cloud.uploader.upload("data:image/webp;base64,"+buffer.toString("base64"),{
    public_id:asset(owner,id),type:"authenticated",resource_type:"image",overwrite:false
  });
  try {
    await db.query("INSERT INTO creator_runway_photos(id,creator_id,slot) VALUES($1,$2,$3)",[id,owner,slot]);
  } catch(err) {
    if(err.code==="23505"){
      const saved=(await photos(owner)).find(photo=>photo.id===id);
      if(saved) return res.json({...saved,url:photoUrl(owner,id)});
    }
    await cloud.uploader.destroy(asset(owner,id),{type:"authenticated"});
    if(err.code==="23505") return res.status(409).json({message:"Your photo slots changed. Refresh and try saving again."});
    throw err;
  }
  res.status(201).json({id,slot,url:photoUrl(owner,id)});
});
router.delete("/photos/:id",mutations,async(req,res)=>{
  const id=req.params.id,owner=req.user.id;
  if(!uuid.test(id) || !(await photos(owner)).some(p=>p.id===id)) return res.sendStatus(404);
  const result=await cloud.uploader.destroy(asset(owner,id),{type:"authenticated",invalidate:true});
  if(!["ok","not found"].includes(result.result)) return res.sendStatus(502);
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
) SELECT d.id,d.title,d.is_default,p.id AS photo_id,j.id AS job_id,j.status,j.output_public_id
  FROM collection d JOIN poses p ON p.total>=3 AND p.pos=1+mod(d.slot-1,p.total)
  LEFT JOIN creator_runway_looks l ON l.photo_id=p.id AND l.source='weekly' AND l.project_id=d.id::text AND l.version='1'
  LEFT JOIN creator_virtual_tryon_jobs j ON j.creator_id=$1 AND j.request_key=l.request_key`;
router.get("/weekly",async(req,res)=>{
  const {rows}=await db.query(weeklyPairs+" ORDER BY d.slot",[req.user.id,defaults.metadata]);
  res.json(rows.map(({output_public_id,...row})=>({...row,image_url:signedResultUrls(output_public_id).image_url})));
});
router.post("/weekly/:id",mutations,async(req,res)=>{
  if(!uuid.test(req.params.id)) return res.sendStatus(404);
  const owner=req.user.id;
  const {rows}=await db.query(weeklyPairs+" WHERE d.id=$3",[owner,defaults.metadata,req.params.id]);
  const pair=rows[0];
  if(!pair) return res.status(409).json({message:"The lineup changed. Refresh your runway."});
  const {rows:keys}=await db.query(`INSERT INTO creator_runway_looks AS l(photo_id,source,project_id,version)
    VALUES ($1,'weekly',$2,'1') ON CONFLICT(photo_id,source,project_id,version) DO UPDATE
    SET request_key=CASE WHEN $3::boolean AND EXISTS(SELECT 1 FROM creator_virtual_tryon_jobs WHERE creator_id=$4 AND request_key=l.request_key AND status='failed')
      THEN gen_random_uuid() ELSE l.request_key END RETURNING request_key`,[pair.photo_id,pair.id,req.body?.retry===true,owner]);
  const garment=pair.is_default ? await defaults.imageFor(pair.id) :
    (await db.query("SELECT image FROM runway_weekly_designs WHERE id=$1",[pair.id])).rows[0]?.image;
  if(!garment) return res.status(409).json({message:"The weekly collection changed."});
  const picture=await fetch(photoUrl(owner,pair.photo_id),{signal:AbortSignal.timeout(20000)});
  if(!picture.ok) return res.status(502).json({message:"Could not open the fitting photo."});
  req.files={person_image:[{buffer:Buffer.from(await picture.arrayBuffer()),mimetype:"image/webp"}],
    garment_image:[{buffer:garment,mimetype:"image/webp"}]};
  req.weeklyRunway=true;
  req.weeklyLineupSize=pair.is_default ? defaults.count : 6;
  req.body={action:"try_on",request_key:keys[0].request_key};
  return require("../controllers/creators/creatorVirtualTryOnController").start(req,res);
});
module.exports=router;
