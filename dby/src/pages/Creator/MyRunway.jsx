import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Images } from "lucide-react";
import API from "../../api/axios";
import FittingPhotos from "./FittingPhotos";
import "./MyRunway.css";

const previewLooks = [
  ["navy-tee", "a navy tee and sand trousers"],
  ["denim-jacket", "an indigo denim jacket"],
  ["green-dress", "a forest green midi dress"],
  ["camel-coat", "a camel trench coat"],
].map(([id,title]) => ({id,title,image_url:"/images/runway/"+id+".webp"}));

const root = "/creators/runway";
const featuredTools = [
  { name: "Sketch to Image", slug: "sketch-to-image", image: "sketch-to-image", action: "Bring a sketch to life" },
  { name: "Virtual Try-On", slug: "virtual-try-on", image: "virtual-tryon", action: "Try an outfit" },
];
const statusUrl = "/creators/ai/virtual-try-on/";
export default function MyRunway() {
  const [revision,refresh]=useState(0);
  const signedImages=useRef(new Map());
  const [looks,setLooks]=useState([]);
  const [manage,setManage]=useState(false);
  const [error,setError]=useState("");
  const [index,setIndex]=useState(0);
  const [holdUntil,setHoldUntil]=useState(0);
  const touchStart=useRef(null);
  const suppressTap=useRef(false);
  const retry=useRef(false);
  useEffect(()=>{
    if(manage) return;
    const controller=new AbortController();
    const config={signal:controller.signal,timeout:120000};
    let timer;
    let busy=false;
    async function sync() {
      if(document.visibilityState==="hidden" || busy) return;
      clearTimeout(timer);
      busy=true;
      try {
        const {data:lineup}=await API.get(root+"/weekly",config);
        if(controller.signal.aborted) return;
        // Signed links last 15 minutes. Reuse them across polls to avoid downloading the same image again.
        const now=Date.now();
        const fresh=new Map();
        setLooks(lineup.map(look=>{
          if(!look.image_url) return look;
          const previous=signedImages.current.get(look.job_id);
          const entry=previous && previous.refreshAfter>now ? previous : {url:look.image_url,refreshAfter:now+600000};
          fresh.set(look.job_id,entry);
          return {...look,image_url:entry.url};
        }));
        signedImages.current=fresh;
        setError("");
        let delay=60000;
        if(lineup.length){
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
      } finally { busy=false; }
    }
    document.addEventListener("visibilitychange",sync);
    sync();
    return ()=>{controller.abort();clearTimeout(timer);document.removeEventListener("visibilitychange",sync);};
  },[revision,manage]);
  const personal=looks.filter(l=>l.image_url);
  const preview=personal.length===0;
  const ready=preview ? previewLooks : personal;
  useEffect(()=>{
    if(manage || ready.length<2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer=setTimeout(()=>{
      setHoldUntil(0);
      if(document.visibilityState!=="hidden") setIndex(n=>n+1);
    },Math.max(4500,holdUntil-Date.now()));
    const resume=()=>{if(document.visibilityState==="visible") setHoldUntil(Date.now()+4500);};
    document.addEventListener("visibilitychange",resume);
    return ()=>{clearTimeout(timer);document.removeEventListener("visibilitychange",resume);};
  },[manage,ready.length,index,holdUntil]);
  const total=ready.length;
  const active=total ? ((index%total)+total)%total : 0;
  function rotateBy(steps) {
    if(total<2) return;
    setIndex(current=>current+steps);
    setHoldUntil(Date.now()+8500);
  }
  function finishSwipe(event) {
    const start=touchStart.current;
    touchStart.current=null;
    const end=event.changedTouches[0];
    if(!start || !end || start.identifier!==end.identifier) return;
    const dx=end.clientX-start.clientX;
    const dy=end.clientY-start.clientY;
    if(Math.abs(dx)<36 || Math.abs(dx)<1.4*Math.abs(dy)) return;
    suppressTap.current=true;
    rotateBy(dx<0 ? 1 : -1);
  }

  return <section className="my-runway" aria-label="Weekly runway">
    <div className="runway-layout">
      <header className="runway-intro">
        <div>
        <span className="runway-label">{preview?"Runway preview":"Designs of the week"}</span>
        <h1>My <em>Runway</em></h1>
        </div>
        <nav aria-label="Showcase actions">
          <Link className="runway-primary" to="/creator/fashion-editor">Create your own <ArrowUpRight size={17}/></Link>
          <Link to="/creator/designs">Explore designs</Link>
          <Link to="/creator/tools">AI tools</Link>
          <Link to="/creator/wallet#subscription">View subscription</Link>
        </nav>
      </header>
      <div className="runway-theatre">
        <div className="runway-toolbar">
          <button type="button" aria-expanded={manage} onClick={()=>setManage(!manage)}><Images size={16}/>{manage?"Close photos":"Manage photos"}</button>
        </div>
        {manage ? <FittingPhotos onSaved={()=>setManage(false)} onChange={()=>refresh(n=>n+1)}/> : <>
          <div className="runway-orbit" role="group" aria-label={preview?"Sample model wearing four outfits":"Your rotating outfit collection"}
            onTouchStart={event=>{
              suppressTap.current=false;
              touchStart.current=event.touches.length===1 ? event.touches[0] : null;
            }}
            onTouchCancel={()=>{touchStart.current=null;}}
            onTouchEnd={finishSwipe}>
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
              const visible=angle<100 || angle>260;
              return <button type="button" className="runway-pose" key={look.id}
                disabled={!visible || total===1} aria-hidden={!visible} aria-pressed={i===active}
                aria-label={`View ${look.title}`}
                onClick={event=>{
                  if(event.detail && suppressTap.current){suppressTap.current=false;return;}
                  rotateBy(slot>total/2 ? slot-total : slot);
                }}
                style={{"--runway-angle":phase+"deg"}}>
                <img src={look.image_url} decoding="async" alt={i===active?(preview?"Runway model wearing ":"You wearing ")+look.title:""} draggable={false}/>
              </button>;
            })}
          </div>
          {preview && looks.length>0 && !error && <p className="runway-status" role="status">Preparing your first personal outfit...</p>}
        </>}
        {error && (preview || manage) && <p className="runway-status" role="alert">{error} <button onClick={()=>{retry.current=true;refresh(n=>n+1);}}>Retry</button></p>}
      </div>
      {!manage && <section className="runway-tools" aria-labelledby="runway-tools-title">
        <h2 id="runway-tools-title">Make it <em>yours</em></h2>
        <div className="runway-tool-grid">
          {featuredTools.map(tool => (
            <Link key={tool.slug} className="runway-tool" to={`/creator/tools/${tool.slug}`}>
              <img src={`/images/creator-tools/mobile/${tool.image}.webp`} loading="lazy" decoding="async" alt="" />
              <div>
                <h3>{tool.name}</h3>
                <span>{tool.action} <ArrowUpRight size={16} aria-hidden="true" /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>}
    </div>
  </section>;
}
