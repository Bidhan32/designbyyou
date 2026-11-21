"use strict";
const router = require("express").Router();
const multer = require("multer");
const sharp = require("sharp");
const db = require("../config/db");
const upload = multer({ limits: { files: 6, fields: 0, fileSize: 8 * 1024 * 1024 } }).array("designs", 6);

async function collection(client) {
  const {rows} = await client.query("SELECT id, title, thumbnail FROM runway_weekly_designs ORDER BY slot");
  if (!rows.length) return require("../services/defaultRunway").previews();
  return rows.map(({thumbnail,...design}) => ({...design, preview:"data:image/webp;base64," + thumbnail.toString("base64")}));
}
router.get("/", async (_req,res) => res.json(await collection(db)));
router.put("/", (req,res,next) => upload(req,res,err => err
  ? res.status(400).json({message:"Choose four to six images, each under 8 MB."}) : next()), async (req,res) => {
  if (!req.files || req.files.length < 4) return res.status(400).json({message:"Choose four to six clothing designs."});
  const designs = [];
  for (const file of req.files) {
    try {
      const input = sharp(file.buffer,{limitInputPixels:32000000}).rotate();
      const {width,height,format} = await input.metadata();
      if (!["png","jpeg","webp"].includes(format) || Math.min(width,height)<128) throw new Error();
      const image = await input.resize(1280,1600,{fit:"inside",withoutEnlargement:true}).webp().toBuffer();
      const thumbnail = await sharp(image).resize(160,180,{fit:"inside"}).webp().toBuffer();
      designs.push({image,thumbnail,title:file.originalname.replace(/\.[^.]+$/,"").slice(0,100) || "Weekly design"});
    } catch { return res.status(400).json({message:"Use readable JPG, PNG or WebP garments at least 128 pixels wide and tall."}); }
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE runway_weekly_designs IN EXCLUSIVE MODE");
    await client.query("DELETE FROM runway_weekly_designs");
    for (const [index,d] of designs.entries()) {
      await client.query("INSERT INTO runway_weekly_designs(slot,title,image,thumbnail) VALUES($1,$2,$3,$4)",[index+1,d.title,d.image,d.thumbnail]);
    }
    const saved = await collection(client);
    await client.query("COMMIT");
    res.json(saved);
  } catch(err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
});
module.exports = router;
