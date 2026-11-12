"use strict";
/**
 * Phase 5.1A offline MOCK smoke test; NO database and NO Stripe network traffic.
 * Run from DesignByYou repository root: node Smoke_Test_Phase5_1A.cjs
 * Stubs only the dependencies of the P2PBookingController, then exercises it.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const CREATOR = "11111111-1111-4111-8111-111111111111";
const DESIGNER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const BOOKING = "44444444-4444-4444-8444-444444444444";
const EDITOR_PROJECT = "125";
const deadline = new Date(Date.now() + 30 * 86400000).toISOString();
const dbState = {
  project: {id: EDITOR_PROJECT, owner_id: CREATOR, title:"Private red T-shirt", version:3, schema_version:2,
    project_data: {schemaVersion:2, document:{name:"Private red T-shirt",width:1200}, layers:[],objects:{},extra:{color:"#ff0000"}}},
  booking: null,
  snapshot: null,
  paymentIntent: null,
  paymentCreated: 0,
};
const normalized = (s) => String(s).replace(/\s+/g," ").toLowerCase();
function rows(data){return {rows:data};}
async function query(sql, params=[]) {
  const q = normalized(sql);
  if (/^\s*(begin|commit|rollback)/.test(q)) return rows([]);
  if (q.includes("pg_advisory_xact_lock")) return rows([]);
  if (q.includes("from public.editor_projects") && q.includes("for share"))
    return rows(dbState.project?.id === params[0] && dbState.project?.owner_id === params[1] ? [dbState.project] : []);
  if (q.includes("from public.editor_projects"))
    return rows(dbState.project?.id === params[0] && dbState.project?.owner_id === params[1] ? [dbState.project] : []);
  if (q.includes("from public.booking_design_snapshots s") && q.includes("join public.bookings b"))
    return rows(dbState.snapshot && dbState.booking?.id === params[0] &&
      [CREATOR,DESIGNER].includes(params[1]) ? [dbState.snapshot] : []);
  if (q.includes("from public.booking_design_snapshots") && !q.includes("join"))
    return rows(dbState.snapshot && dbState.snapshot.booking_id === params[0] ? [dbState.snapshot] : []);
  if (q.includes("from bookings") && q.includes("client_request_id"))
    return rows(dbState.booking && dbState.booking.client_request_id === params[0] ? [dbState.booking] : []);
  if (q.includes("from bookings") && q.includes("designer_id") && q.includes("coalesce")) return rows([]);
  if (q.includes("from users") && q.includes("id = any"))
    return rows([{id:CREATOR,role:"creator",subscription_tier:null,subscription_status:null},
      {id:DESIGNER,role:"designer",approval_status:"approved",is_email_verified:true}]);
  if (q.includes("from users") && q.includes("id = $1")) return rows([{id:DESIGNER}]);
  if (q.includes("insert into bookings")) {
    dbState.booking = {id:params[0],creator_id:params[1], designer_id:params[2], design_id:params[3],
      brief_text:params[4],agreed_price:params[5],deadline:params[6],status:params[7],
      booking_type:params[8],scheduled_at:params[9],stripe_payment_intent_id:params[10],
      client_request_id:params[11], escrow_locked:false};
    return rows([dbState.booking]);
  }
  if (q.includes("insert into public.booking_design_snapshots")) {
    dbState.snapshot = {id:"55555555-5555-4555-8555-555555555555",booking_id:params[0],creator_id:params[1],
      source_editor_project_id:params[2],source_project_version:params[3],source_schema_version:params[4],
      design_title:params[5],snapshot_data:JSON.parse(params[6]),created_at:new Date().toISOString()};
    return rows([]);
  }
  if (q.includes("update users")) return rows([]);
  throw new Error("Unexpected SQL during offline smoke test: " + q.slice(0,160));
}
const db={query, connect:async()=>({query, release(){}})};
class FakeStripe {
  constructor() { this.paymentIntents={
    create:async (options)=> {
      dbState.paymentCreated++;
      dbState.paymentIntent={id:"pi_mock_private_booking",client_secret:"pi_mock_secret",status:"requires_payment_method",
        metadata:options.metadata, amount:options.amount,currency:"usd"};
      return dbState.paymentIntent;
    },
    retrieve:async ()=> dbState.paymentIntent,
    cancel:async ()=> {dbState.paymentIntent.status="canceled";return dbState.paymentIntent;},
  }; }
}
const originalLoad=Module._load;
let controller;
try {
  Module._load=function(request,parent,isMain){
    if(request==="stripe") return FakeStripe;
    if(request==="../config/db" && parent?.filename?.toLowerCase().includes("p2pbookingcontroller")) return db;
    return originalLoad.apply(this,arguments);
  };
  process.env.STRIPE_SECRET_KEY="mock-not-real";
  const files=fs.readdirSync(path.join(process.cwd(),"server","controllers"));
  const file=files.find(s=>s.toLowerCase()==="p2pbookingcontroller.js");
  assert.ok(file,"Expected P2PBookingController.js in server/controllers");
  controller=require(path.join(process.cwd(),"server","controllers",file));
} finally { Module._load=originalLoad; }

function response(){return {statusCode:200,headers:{},body:null,
 status(n){this.statusCode=n;return this;},json(data){this.body=data;return this;},
 set(k,v){this.headers[k]=v;return this;}};}
const createBody=(changes={})=>({client_request_id:BOOKING,receiver_id:DESIGNER,booking_type:"commission",
 editor_project_id:EDITOR_PROJECT,editor_project_version:3,
 brief_text:"Please refine this private T-shirt design and prepare a prototype.",agreed_price:100,
 deadline,...changes});
async function create(user,body){const res=response(); await controller.createP2PBooking({user,body},res);return res;}
async function get(user){const res=response();await controller.getBookingDesignSnapshot({user,params:{id:BOOKING}},res);return res;}
(async()=>{
  assert.equal(typeof controller.getBookingDesignSnapshot,"function");
  const creator={id:CREATOR,role:"creator"};
  const designer={id:DESIGNER,role:"designer"};
  const outsider={id:OTHER,role:"creator"};
  let r=await create(creator,createBody({editor_project_id:"999"}));
  assert.equal(r.statusCode,404,"Foreign/missing Editor project must be rejected");
  assert.equal(dbState.paymentCreated,0,"No Stripe commitment before source project validation");
  r=await create(creator,createBody({editor_project_version:2}));
  assert.equal(r.statusCode,409,"Stale project version must be rejected");
  assert.equal(dbState.paymentCreated,0);
  r=await create(creator,createBody());
  assert.equal(r.statusCode,201,JSON.stringify(r.body));
  assert.equal(dbState.paymentCreated,1);
  assert.equal(dbState.snapshot?.snapshot_data?.extra?.color,"#ff0000");
  assert.equal(dbState.booking.design_id,null,"Private project must not populate Showcase design_id");
  dbState.project.project_data.extra.color="#0000ff"; // editing after booking cannot mutate saved snapshot
  assert.equal(dbState.snapshot.snapshot_data.extra.color,"#ff0000");
  r=await create(creator,createBody());
  assert.equal(r.statusCode,200,"Same request should be idempotent");
  assert.equal(dbState.paymentCreated,1,"Retry must not create a second payment intent");
  r=await create(creator,createBody({editor_project_version:2}));
  assert.equal(r.statusCode,409,"Different Editor version must not reuse an existing booking");
  r=await create(creator,createBody({editor_project_id:"126"}));
  assert.equal(r.statusCode,409,"Different Editor ID must not reuse an existing booking");
  r=await create(creator,createBody({editor_project_id:undefined,editor_project_version:undefined}));
  assert.equal(r.statusCode,400,"Explicit undefined fields are malformed");
  r=await get(outsider);
  assert.equal(r.statusCode,404,"Unrelated user may not read private design");
  assert.match(r.headers["Cache-Control"],/no-store/);
  r=await get(designer);
  assert.equal(r.statusCode,200,"Assigned Designer must read saved snapshot");
  assert.equal(r.body.data.snapshot_data.extra.color,"#ff0000");
  r=await get(creator);
  assert.equal(r.statusCode,200,"Booking Creator must read saved snapshot");
  // A legacy commission booking WITHOUT an editor attachment must still work.
  dbState.booking = null;
  dbState.snapshot = null;
  const legacyBody = createBody({client_request_id:"66666666-6666-4666-8666-666666666666"});
  delete legacyBody.editor_project_id;
  delete legacyBody.editor_project_version;
  r=await create(creator,legacyBody);
  assert.equal(r.statusCode,201,"Legacy commission booking must remain available");
  assert.equal(dbState.snapshot,null,"Legacy booking must not create an Editor snapshot");
  console.log("PASS Phase 5.1A offline tests: ownership, stale version, creation, atomic snapshot, immutable copy, idempotency, designer/creator read, outsider denial, legacy commission booking.");
  console.log("NO real database or Stripe API was accessed.");
})().catch(e=>{console.error("FAIL:",e);process.exitCode=1;});
