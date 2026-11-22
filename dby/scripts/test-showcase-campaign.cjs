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
  assert.equal(document.querySelector('nav[aria-label="Showcase actions"] a[href="/creator/tools"]').textContent, "AI tools");
  assert.ok(document.querySelector('a[href="/creator/fashion-editor"]'));
  assert.ok(document.querySelector('a[href="/creator/wallet#subscription"]'));
  assert.equal(document.querySelector(".campaign-cover"),null);
  assert.equal(document.querySelectorAll(".runway-pose img").length,4);
  assert.ok([...document.querySelectorAll(".runway-pose img")].every(img=>img.src.includes("/images/runway/")));
  const poses = document.querySelectorAll("button.runway-pose");
  const orbit = document.querySelector(".runway-orbit");
  await React.act(async () => poses[1].click());
  assert.equal(poses[1].getAttribute("aria-pressed"), "true");
  async function swipe(x, y) {
    const start = { identifier: 1, clientX: 100, clientY: 100 };
    await React.act(async () => {
      orbit.dispatchEvent(new window.TouchEvent("touchstart", { bubbles: true, touches: [start] }));
      orbit.dispatchEvent(new window.TouchEvent("touchend", { bubbles: true, changedTouches: [{ ...start, clientX: x, clientY: y }] }));
    });
  }
  await swipe(105, 30);
  assert.equal(poses[1].getAttribute("aria-pressed"), "true");
  await swipe(40, 101);
  assert.equal(poses[2].getAttribute("aria-pressed"), "true");
  await swipe(160, 101);
  assert.equal(poses[1].getAttribute("aria-pressed"), "true");
  assert.equal(reads.filter(url=>url.endsWith("/runway/photos")).length,0);
  personalLooks=[{id:"coat",title:"Coat",job_id:"saved",status:"completed",image_url:images[1]}];
  await React.act(async()=>document.dispatchEvent(new dom.window.Event("visibilitychange")));
  assert.equal(document.querySelector(".runway-pose img").alt,"You wearing Coat");
  assert.equal(document.querySelectorAll(".runway-pose").length,1);
  const requests = [];
  global.campaignApi.post = async (url,form) => {
    assert.equal(url,"/creators/runway/photos/prepare");
    assert.ok(form.get("image").size);
    const id = form.get("photo_id");
    requests.push(id);
    if (requests.length === 2) throw Error("storage unavailable");
    return {data:{id,slot:requests.length+1,url:images[0]}};
  };
  await React.act(async()=>document.querySelector('.runway-toolbar button').click());
  const picker = document.querySelector('input[type=file]');
  assert.ok(picker.multiple);
  Object.defineProperty(picker,"files",{value:["one","two"].map(n=>new File(["image"],n+".png",{type:"image/png"}))});
  await React.act(async()=>picker.dispatchEvent(new dom.window.Event("change",{bubbles:true})));
  const save = document.querySelector(".my-runway fieldset button:last-of-type.bg-action");
  assert.match(save.textContent,/Save 2 photos \(20 credits\)/);
  await React.act(async()=>save.click());
  assert.match(save.textContent,/Save 1 photo \(10 credits\)/);
  await React.act(async()=>save.click());
  assert.equal(requests.length,3);
  assert.notEqual(requests[0],requests[1]);
  assert.equal(requests[1],requests[2],"A retry uses the same photo ID to prevent a duplicate charge");
  await render("designer");
  assert.ok(document.querySelector('a[href="/designer/designs"]'));
  assert.equal(document.querySelector(".campaign-actions button"), null);
  await React.act(async () => root.unmount());
  dom.window.close();
  console.log("PASS creator runway, gallery navigation, photo upload retry and designer campaign");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
