"use strict";
const path = require("node:path");
const fs = require("node:fs/promises");
const sharp = require("sharp");

const titles = [
  "Navy cotton tee",
  "Sage polo shirt",
  "Blue Oxford shirt",
  "Oatmeal cardigan",
  "Burgundy hoodie",
  "Indigo denim jacket",
  "Camel trench coat",
  "Forest midi dress",
  "Charcoal wide-leg trousers",
  "Rust pleated skirt"
];
// Slot identifiers are stable because saved looks refer to their original garment.
const designs = titles.map((title,index) => ({
  id: "db700000-0000-4000-8000-" + String(index+1).padStart(12,"0"),
  slot: index+1,
  title,
}));
const metadata = JSON.stringify(designs);
async function imageFor(id) {
  const design = designs.find(entry => entry.id === id);
  if (!design) throw new Error("Unknown default runway design");
  return fs.readFile(path.join(__dirname,"../assets/runway-defaults",design.slot+".webp"));
}
async function previews() {
  return Promise.all(designs.map(async design => {
    const thumbnail = await sharp(await imageFor(design.id)).resize(160,180,{fit:"inside"}).webp().toBuffer();
    return {...design,is_default:true,preview:"data:image/webp;base64," + thumbnail.toString("base64")};
  }));
}
module.exports = {has:id=>designs.some(d=>d.id===id),metadata,imageFor,previews,count:designs.length};
