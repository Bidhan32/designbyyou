const assert = require("node:assert/strict");
const { test } = require("node:test");
const { JSDOM } = require("jsdom");
const { build } = require("esbuild");

test("the selected view reaches each destination once, scoped to its creator", async () => {
  const dom = new JSDOM("<main></main>", { url: "https://example.test" });
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  let src;
  global.Image = class {
    naturalWidth = 800; naturalHeight = 600;
    async decode() { src = this.src; }
  };
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  dom.window.HTMLCanvasElement.prototype.toBlob = callback => callback(new Blob([src], {type:"image/webp"}));
  const React = require("react"), { act, createElement: h } = React;
  const { createRoot } = require("react-dom/client");
  const { MemoryRouter, Routes, Route, useLocation } = require("react-router-dom");
  const out = await build({ stdin: { contents: 'export * from "./src/components/toolHandoff"; export {default as Action} from "./src/components/ToolHandoffAction";', resolveDir: process.cwd() },
    format:"cjs", platform:"node", packages:"external", jsx:"automatic", bundle:true, write:false,
    plugins:[{ name:"auth", setup(build) {
      build.onResolve({filter:/AuthContext\.helpers\.js$/}, () => ({path:"auth", namespace:"stub"}));
      build.onLoad({filter:/.*/,namespace:"stub"}, () => ({contents:"export const useAuth = () => ({user:{id:globalThis.testOwner}})"}));
    } }],
  });
  const mod = { exports:{} };
  new Function("module","require",out.outputFiles[0].text)(mod,require);
  const { Action, destinations, toolPath, useToolHandoff } = mod.exports;
  for (const target of [...Object.keys(destinations), "wrong-owner"]) {
    const key = target === "wrong-owner" ? "image-to-3d" : target;
    global.testOwner = target === "wrong-owner" ? "other" : "creator";
    const received = [];
    function Receiver() {
      const location = useLocation();
      assert.equal(location.pathname, toolPath(key));
      useToolHandoff(file => received.push(file));
      return null;
    }
    const root = createRoot(document.querySelector("main"));
    await act(() => root.render(h(React.StrictMode,null,h(MemoryRouter,{initialEntries:["/start"]},h(Routes,null,
      h(Route,{path:"/start",element:h(Action,{ owner:"creator", options:[{label:"Front",src:"front"},{label:"Back",src:"back"}] })}),
      h(Route,{path:"*",element:h(Receiver)}))))));
    const [view, tool] = document.querySelectorAll("select");
    await act(() => {
      view.value = "Back"; view.dispatchEvent(new dom.window.Event("change",{bubbles:true}));
      tool.value = key; tool.dispatchEvent(new dom.window.Event("change",{bubbles:true}));
    });
    await act(async () => document.querySelector("button").click());
    if (target === "wrong-owner") assert.equal(received.length,0);
    else { assert.equal(received.length,1); assert.equal(await received[0].text(),"back"); }
    await act(() => root.unmount());
  }
  dom.window.close();
});
