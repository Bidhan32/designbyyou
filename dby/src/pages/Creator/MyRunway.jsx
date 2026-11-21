import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Images } from "lucide-react";
import API from "../../api/axios";
import FittingPhotos from "./FittingPhotos";
import "./MyRunway.css";

const root = "/creators/runway";
const statusUrl = "/creators/ai/virtual-try-on/";
export default function MyRunway() {
  const [revision,refresh]=useState(0);
  const [count,setCount]=useState(null);
  const [looks,setLooks]=useState([]);
  const [manage,setManage]=useState(false);
  const [error,setError]=useState("");
  const [index,setIndex]=useState(0);
  const retry=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();
    const config={signal:controller.signal,timeout:120000};
    let timer;
    async function sync() {
      try {
        const [{data:photos},{data:lineup}]=await Promise.all([API.get(root+"/photos",config),API.get(root+"/weekly",config)]);
        if(controller.signal.aborted) return;
        setCount(photos.length);setLooks(lineup);setError("");
        let delay=60000;
        if(!manage && photos.length>=3){
          const pending=lineup.find(l=>l.job_id && !["completed","failed"].includes(l.status));
          const next=lineup.find(l=>!l.job_id) || lineup.find(l=>l.status==="failed");
          if(pending){
            await API.get(statusUrl+pending.job_id,config);
            delay=3500;
          } else if(next){
            if(next.status==="failed" && !retry.current) throw new Error("An outfit could not be prepared.");
            const retryFailed=retry.current;
            retry.current=false;
            const {data}=await API.post(root+"/weekly/"+next.id,{retry:retryFailed},config);
            if(data.active_job_id) await API.get(statusUrl+data.active_job_id,config);
            delay=2500;
          }
        }
        if(!controller.signal.aborted) timer=setTimeout(sync,delay);
      } catch(err){
        if(!controller.signal.aborted) setError(err.response?.data?.message || err.message || "Could not load your runway.");
      }
    }
    sync();
    return ()=>{controller.abort();clearTimeout(timer);};
  },[revision,manage]);
  const ready=looks.filter(l=>l.image_url);
  useEffect(()=>{
    if(manage || ready.length<2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer=setInterval(()=>setIndex(n=>n+1),4500);
    return ()=>clearInterval(timer);
  },[manage,ready.length]);
  const total=ready.length;
  const active=total ? ((index%total)+total)%total : 0;
  const current=ready[active];
  return <section className="my-runway" aria-label="Weekly runway">
    <div className="runway-layout">
      <header className="runway-intro">
        <div>
        <span className="runway-label">Designs of the week</span>
        <h1>My <em>Runway</em></h1>
        </div>
        <nav aria-label="Showcase actions">
          <Link className="runway-primary" to="/creator/fashion-editor">Create your own <ArrowUpRight size={17}/></Link>
          <Link to="/creator/designs">Explore designs</Link>
          <Link to="/creator/wallet#subscription">View subscription</Link>
        </nav>
      </header>
      <div className="runway-theatre">
        <div className="runway-toolbar">
          <button type="button" aria-expanded={manage} onClick={()=>setManage(!manage)}><Images size={16}/>{manage?"Close photos":"Manage photos"}</button>
        </div>
        {manage ? <FittingPhotos onSaved={()=>setManage(false)} onChange={()=>refresh(n=>n+1)}/> : <>
          <div className="runway-orbit" role="group" aria-label="Rotating outfit collection">
            {ready.map((look,i)=>{
              const position=i-index;
              const slot=((position%total)+total)%total;
              const front=Math.min(2,Math.floor((total-1)/2));
              let angle;
              if(slot<=front) angle=30*slot;
              else if(slot>=total-front) angle=360-30*(total-slot);
              else angle=30*front+(slot-front)*(360-60*front)/(total-2*front);
              if(total===2 && slot===1) angle=65;
              const phase=angle+360*Math.floor(position/total);
              return <div className="runway-pose" key={look.id} aria-hidden={i!==active}
                style={{"--runway-angle":phase+"deg"}}>
                <img src={look.image_url} alt={i===active?"You wearing "+look.title:""} draggable={false}/>
              </div>;
            })}
            {!current && <div className="runway-empty">
              {count!==null && count<3 ? <><h2>Your first look starts here.</h2><p>Add three or four full-body photos to see yourself on the runway.</p>
                <button className="runway-primary" onClick={()=>setManage(true)}>Add fitting photos <ArrowUpRight size={16}/></button></>
                : <p role="status">{error?"Your runway is waiting.":count===null?"Opening your runway...":looks.length?"Preparing your first look...":"Waiting for the weekly collection."}</p>}
            </div>}
          </div>
          {!current && looks.length>total && !error && <p className="runway-status" role="status">{total} of {looks.length} outfits ready</p>}
        </>}
        {error && (!current || manage) && <p className="runway-status" role="alert">{error} <button onClick={()=>{retry.current=true;refresh(n=>n+1);}}>Retry</button></p>}
      </div>
    </div>
  </section>;
}