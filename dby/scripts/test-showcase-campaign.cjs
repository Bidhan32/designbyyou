const assert = require("node:assert/strict");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const React = require("react");
const { MemoryRouter } = require("react-router-dom");
const { createRoot } = require("react-dom/client");
const esbuild = require("esbuild");

async function run() {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual:true });
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const images = ["https://images.example/silk.jpg", "https://images.example/coat.jpg"];
  const hero = { is_enabled: true, mode: "slideshow", slideshow_images: images,
    campaign_looks: [{ media: images[0], title: "Silk dress", garment: images[1] }] };
  let personalLooks=[];
  const reads=[];
  global.campaignApi = { defaults: { baseURL: "/api" }, async get(url) {
    reads.push(url);
    if (url.endsWith("/runway/photos")) return {data: [{id:"pose",slot:1,url:"https://images.example/pose.webp"}]};
    if (url.endsWith("/runway/weekly")) return {data:personalLooks};
    return { data: { data: url === "/showcase-hero" ? hero : [] } };
  }};
  const bundle = await esbuild.build({
    entryPoints: [path.resolve(__dirname, "../src/pages/Creator/CreatorShowcase.jsx")],
    jsx: "automatic", bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
    loader: { ".css": "empty" },
    plugins: [{name: "campaign-fixtures", setup(build) {
      build.onResolve({filter: /api\/axios$|\.\/CreatorVirtualTryOn$|\.\/garmentFile$/}, args => ({path: args.path, namespace: "fixture"}));
      build.onLoad({filter: /.*/, namespace: "fixture"}, args => ({
        contents: args.path.endsWith("axios") ? "export default globalThis.campaignApi" :
          args.path.endsWith("garmentFile") ? "export default async url => ({name: url})" :
          "export default function Fitting({initialGarment}) { return initialGarment.name }"
      }));
    }}],
  });
  const m = {exports: {}};
  new Function("require","module","exports",bundle.outputFiles[0].text)(require,m,m.exports);
  const root = createRoot(document.getElementById("root"));
  const render = audience => React.act(async () => root.render(React.createElement(MemoryRouter,null,
    React.createElement(m.exports.default,{audience}))));
  await render("creator");
  assert.equal(document.querySelector("h1").textContent,"My Runway");
  assert.ok(document.querySelector('a[href="/creator/designs"]'));
  assert.ok(document.querySelector('a[href="/creator/fashion-editor"]'));
  assert.ok(document.querySelector('a[href="/creator/wallet#subscription"]'));
  assert.equal(document.querySelector(".campaign-cover"),null);
  assert.equal(document.querySelectorAll(".runway-pose img").length,4);
  assert.ok([...document.querySelectorAll(".runway-pose img")].every(img=>img.src.includes("/images/runway/")));
  assert.equal(reads.filter(url=>url.endsWith("/runway/photos")).length,0);
  personalLooks=[{id:"coat",title:"Coat",job_id:"saved",status:"completed",image_url:images[1]}];
  await React.act(async()=>document.dispatchEvent(new dom.window.Event("visibilitychange")));
  assert.equal(document.querySelector(".runway-pose img").alt,"You wearing Coat");
  assert.equal(document.querySelectorAll(".runway-pose").length,1);
  const backgrounds = [];
  let saves = 0;
  global.campaignApi.post = async (url,form) => {
    if (url.endsWith("/background-remove")) {
      backgrounds.push(form.get("request_key"));
      return {data:{data:{image:"data:image/png;base64,AAAA"}}};
    }
    saves++;
    if (saves === 1) throw Object.assign(Error("legacy API"), {response:{status:400,data:{message:"Choose a cutout and confirm private storage."}}});
    if (saves === 2) {
      assert.equal(form.get("consent"), "true");
      assert.equal(form.has("photo_id"), false);
      return {data:{id:"legacy-photo",slot:2,url:images[0]}};
    }
    if (saves === 3) throw Error("storage unavailable");
    return {data:{id:form.get("photo_id"),slot:saves,url:images[0]}};
  };
  await React.act(async()=>document.querySelector('.runway-toolbar button').click());
  const picker = document.querySelector('input[type=file]');
  assert.ok(picker.multiple);
  Object.defineProperty(picker,"files",{value:["one","two"].map(n=>new File(["image"],n+".png",{type:"image/png"}))});
  await React.act(async()=>picker.dispatchEvent(new dom.window.Event("change",{bubbles:true})));
  const save = document.querySelector(".my-runway fieldset button:last-of-type.bg-action");
  assert.match(save.textContent,/Save 2 photos \(20 credits\)/);
  await React.act(async()=>save.click());
  assert.match(save.textContent,/Save 1 photo \(0 credits\)/);
  await React.act(async()=>save.click());
  assert.equal(backgrounds.length,2,"Retrying storage reuses the processed image");
  assert.equal(saves,4);
  await render("designer");
  assert.ok(document.querySelector('a[href="/designer/designs"]'));
  assert.equal(document.querySelector(".campaign-actions button"), null);
  await React.act(async () => root.unmount());
  dom.window.close();
  console.log("PASS creator runway, gallery navigation, photo upload retry and designer campaign");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
