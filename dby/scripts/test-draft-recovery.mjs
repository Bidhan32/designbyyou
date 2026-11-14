import test from "node:test";
import assert from "node:assert/strict";
import { createDraftWriter } from "../src/pages/sketches/editor/localDrafts.js";
function memory() {
  const rows = new Map();
  return { rows, put: async row => rows.set(row.key,structuredClone(row)), remove: async key => rows.delete(key) };
}
const state = (revision, id = "doc") => ({ revision, persistence:{dirty:true}, document:{id,name:`Design ${revision}`},layers:[],objects:[],symmetry:{} });
test("latest dirty work survives failed cloud save and recreating the editor", async () => {
  const storage=memory(), writer=createDraftWriter({owner:"alice",instance:"one",storage});
  writer.capture(state(1)); writer.capture(state(2)); await writer.settled();
  assert.equal(storage.rows.size,1); assert.equal([...storage.rows.values()][0].revision,2);
  createDraftWriter({owner:"alice",instance:"two",storage});
  assert.equal(storage.rows.size,1);
});
test("acknowledging an older save preserves newer changes; current acknowledgement removes only its draft",async()=>{
  const storage=memory(), writer=createDraftWriter({owner:"alice",instance:"one",storage});
  await writer.capture(state(1)); await writer.capture(state(2)); await writer.saved("doc",1);
  assert.equal(storage.rows.size,1);
  await writer.saved("doc",2); assert.equal(storage.rows.size,0);
});
test("account, tab and document boundaries cannot delete another draft",async()=>{
  const storage=memory();
  const a=createDraftWriter({owner:"alice",instance:"one",storage});
  const b=createDraftWriter({owner:"bob",instance:"one",storage});
  const c=createDraftWriter({owner:"alice",instance:"two",storage});
  await a.capture(state(1)); await b.capture(state(1)); await c.capture(state(1)); await a.capture(state(1,"other"));
  await a.saved("doc",1); assert.equal(storage.rows.size,3);
  assert.equal([...storage.rows.values()].filter(row=>row.owner==="bob").length,1);
});
test("storage failures are reported and later writes can recover",async()=>{
  const storage=memory(); let fail=true, errors=0;
  const writer=createDraftWriter({owner:"alice",instance:"one",storage:{...storage,put:row=>{if(fail)throw Error("quota");return storage.put(row);}},onError:()=>errors++});
  await writer.capture(state(1)); assert.equal(errors,1);
  fail=false; await writer.capture(state(2)); assert.equal(storage.rows.size,1);
});
test("clean loads create no draft and a late write cannot resurrect an acknowledged draft",async()=>{
  const storage=memory(), writer=createDraftWriter({owner:"alice",instance:"one",storage});
  await writer.capture({...state(1),persistence:{dirty:false}}); assert.equal(storage.rows.size,0);
  writer.capture(state(1)); await writer.saved("doc",1); assert.equal(storage.rows.size,0);
});
