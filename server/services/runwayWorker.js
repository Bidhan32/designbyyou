"use strict";
const db=require("../config/db");
const {startWeekly}=require("../routes/creatorRunwayRoutes");
const tryOn=require("../controllers/creators/creatorVirtualTryOnController");

// Use the same submission and result-saving paths as an interactive retry.
async function runStep(handler,request){
  let code=200;
  const response={status(value){code=value;return this;},json(body){return {code,body};}};
  return handler(request,response);
}

async function processNext(){
  const {rows:[look]}=await db.query(`WITH due AS (
    SELECT l.photo_id,l.project_id,p.creator_id,j.id AS job_id,j.status
    FROM creator_runway_looks l JOIN creator_runway_photos p ON p.id=l.photo_id
    LEFT JOIN creator_virtual_tryon_jobs j ON j.creator_id=p.creator_id AND j.request_key=l.request_key
    WHERE l.process_after<=now() AND l.source='weekly'
    ORDER BY (j.status IN ('submitting','processing','saving')) DESC NULLS LAST,l.process_after LIMIT 1 FOR UPDATE OF l SKIP LOCKED
  ) UPDATE creator_runway_looks l SET process_after=date_trunc('milliseconds',now())+interval '5 minutes'
    FROM due WHERE l.photo_id=due.photo_id AND l.project_id=due.project_id AND l.source='weekly' AND l.version='1'
    RETURNING due.*,l.process_after AS lease,l.request_key`);
  if(!look)return;
  const user={id:look.creator_id,role:"creator"};
  let delay=null,message=null;
  try{
    if(!["completed","failed"].includes(look.status)){
      const result=look.job_id
        ? await runStep(tryOn.status,{user,params:{jobId:look.job_id}})
        : await runStep(startWeekly,{user,params:{id:look.project_id},expectedPhoto:look.photo_id,body:{}});
      if(result.code>=400){
        if(result.code!==409){
          message=result.body.message;
          delay=result.code===429?900:120;
        }
      }else if(result.body.active_job_id){
        await runStep(tryOn.status,{user,params:{jobId:result.body.active_job_id}});
        delay=15;
      }else if(!["completed","failed"].includes(result.body.data?.status)){
        delay=4;
      }
    }
  }catch(err){
    console.error("[Runway worker]",err.code || err.name);
    delay=60;message="Fitting is temporarily delayed.";
  }
  await db.query(`UPDATE creator_runway_looks SET process_error=$1,process_after=now()+$2::int*interval '1 second'
    WHERE request_key=$3 AND process_after=$4`,[message,delay,look.request_key,look.lease]);
}
let timer,working;
function startRunwayWorker(){
  if(timer)return;
  timer=setInterval(()=>{
    if(!working)working=processNext().catch(err=>console.error("[Runway worker]",err.code || err.name)).finally(()=>{working=null;});
  },1500);
  timer.unref();
}
async function stopRunwayWorker(){clearInterval(timer);timer=null;await working;}
module.exports={startRunwayWorker,stopRunwayWorker,processNext};
