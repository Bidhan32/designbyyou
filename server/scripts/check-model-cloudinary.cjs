// Run from server/. This process only uploads its own synthetic fixture.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
require("dotenv").config({ quiet: true });
require("../middlewares/upload");
const cloud = require("cloudinary").v2;
const { storeModel } = require("../services/ai/modelStorage");

function triangle() {
  const vertices = Buffer.from(new Float32Array([0,0,0, 1,0,0, 0,1,0]).buffer);
  const json = Buffer.from(JSON.stringify({
    asset: {version:"2.0"}, scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0}}]}], buffers:[{byteLength:vertices.length}],
    bufferViews:[{buffer:0,byteLength:vertices.length,target:34962}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:"VEC3",min:[0,0,0],max:[1,1,0]}],
  }));
  const length = Math.ceil(json.length / 4) * 4;
  const glb = Buffer.alloc(28 + length + vertices.length, 32);
  glb.write("glTF"); glb.writeUInt32LE(2,4); glb.writeUInt32LE(glb.length,8);
  glb.writeUInt32LE(length,12); glb.write("JSON",16); json.copy(glb,20);
  glb.writeUInt32LE(vertices.length,20+length); glb.write("BIN\0",24+length); vertices.copy(glb,28+length);
  return glb;
}

async function main() {
  process.env.NODE_ENV = "production";
  const file = triangle();
  const asset = "designbyyou_ai/models/storage-check/" + randomUUID() + ".glb";
  await storeModel("data:model/gltf-binary;base64," + file.toString("base64"),asset);
  console.log("PASS authenticated raw upload", asset);
  try {
    const origin = "https://dby.studio";
    const url = cloud.utils.private_download_url(asset,"",{resource_type:"raw",type:"authenticated",expires_at:Math.floor(Date.now()/1000)+300});
    const response = await fetch(url,{headers:{Origin:origin},signal:AbortSignal.timeout(45000)});
    assert.equal(response.status,200,"Signed download returned HTTP " + response.status);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),file);
    console.log("PASS reopened GLB matches original bytes");
    assert.ok(["*",origin].includes(response.headers.get("access-control-allow-origin")), "Viewer origin missing from download response");
    console.log("PASS viewer origin allowed");
  } finally {
    const cfg = cloud.config();
    const params = { public_id:asset,type:"authenticated",timestamp:String(Math.floor(Date.now()/1000)) };
    const body = new URLSearchParams({...params,api_key:cfg.api_key,signature:cloud.utils.api_sign_request(params,cfg.api_secret)});
    const deleted = await fetch(cloud.utils.api_url("destroy",{resource_type:"raw"}),{method:"POST",body,redirect:"error",signal:AbortSignal.timeout(45000)});
    const result = await deleted.json();
    assert.equal(result.result,"ok","Check cleanup for " + asset);
    console.log("PASS removed sample");
  }
}
main().catch(err => { console.error("FAIL",err.code || err.error?.http_code || "", String(err.message || err.error?.message || "Cloudinary request failed").replace(/https?:\S+/g,"[URL]")); process.exitCode=1; });
