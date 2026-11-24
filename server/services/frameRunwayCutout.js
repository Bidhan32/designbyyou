"use strict";
const sharp = require("sharp");

// Frame the visible subject, ignoring nearly transparent background-removal noise.
module.exports = async function frameRunwayCutout(buffer) {
  const input = sharp(buffer, {limitInputPixels: 32000000});
  const {data,info} = await input.clone().ensureAlpha().extractChannel("alpha").raw().toBuffer({resolveWithObject:true});
  let left=info.width, right=-1, top=info.height, bottom=-1;
  for(let y=0; y<info.height; y++){
    for(let x=0; x<info.width; x++){
      if(data[y*info.width+x]<20) continue;
      left=Math.min(left,x); right=Math.max(right,x);
      top=Math.min(top,y); bottom=y;
    }
  }
  if(right<left) throw new Error("The fitting image contains no visible subject.");
  const pad=Math.ceil((bottom-top+1)*0.012);
  left=Math.max(0,left-pad); top=Math.max(0,top-pad);
  right=Math.min(info.width-1,right+pad); bottom=Math.min(info.height-1,bottom+pad);
  return input.extract({left,top,width:right-left+1,height:bottom-top+1})
    .resize({height:1400,withoutEnlargement:true}).webp({quality:90}).toBuffer();
};
