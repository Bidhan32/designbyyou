import test from "node:test";
import assert from "node:assert/strict";
import { monitorSession } from "../src/context/sessionMonitor.js";

const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const listeners = new Map(); let tick, token = "first", fail = false;
  const target = {
    visibilityState: "visible",
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name) { listeners.delete(name); },
    setInterval(fn) { tick = fn; return 1; }, clearInterval() { tick = null; },
  };
  const calls = [], deadlines = [];
  const api = Object.fromEntries(["get", "post"].map(method => [method, async route => {
    calls.push([method,route]); if (fail) throw Error("Offline");
    return { data: { session: { idle_expires_at: "deadline" } } };
  }]));
  const stop = monitorSession({api,storage:{getItem:()=>token},target,documentTarget:target,onDeadline:v=>deadlines.push(v)});
  return {calls,deadlines,stop,target, event:(name,trusted=true)=>listeners.get(name)?.({isTrusted:trusted}),
    tick:()=>tick?.(), replace:()=>{token="second";}, offline:()=>{fail=true;}, online:()=>{fail=false;}};
}
test("restoration and background polling never extend inactivity", async()=>{
  const f=fixture(); await flush(); f.tick(); await flush();
  assert.deepEqual(f.calls.map(c=>c[0]),["get","get"]); f.stop();
});
test("only trusted visible input renews; bursts are batched", async()=>{
  const f=fixture(); await flush(); f.event("keydown",false); await flush();
  assert.equal(f.calls.length,1);
  f.target.visibilityState="hidden"; f.event("pointerdown"); await flush(); assert.equal(f.calls.length,1);
  f.target.visibilityState="visible"; f.event("keydown"); await flush();
  assert.equal(f.calls.at(-1)[0],"post");
  f.event("wheel"); f.event("keydown"); assert.equal(f.calls.length,2);
  f.tick(); await flush(); assert.equal(f.calls.length,3); f.stop();
});
test("old monitors cannot touch a replacement session", async()=>{
  const f=fixture(); await flush(); f.replace(); f.event("keydown"); f.tick(); await flush();
  assert.equal(f.calls.length,1); f.stop();
});
test("offline activity is not retried as fresh activity on reconnect", async()=>{
  const f=fixture(); await flush(); f.offline(); f.event("keydown"); await flush();
  f.online(); f.event("online"); await flush(); assert.equal(f.calls.at(-1)[0],"get");
  f.stop(); f.tick(); f.event("keydown"); assert.equal(f.calls.length,3);
});
