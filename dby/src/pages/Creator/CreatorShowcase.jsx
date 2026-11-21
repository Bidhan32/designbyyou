import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import API from "../../api/axios";
import garmentFile from "./garmentFile";
import { buildBookingUrl, getOwnerName } from "./showcaseDesign";
import "./ShowcaseCampaign.css";

const MyRunway = lazy(() => import("./MyRunway"));
const Fitting = lazy(() => import("./CreatorVirtualTryOn"));
const fabric = "/textures/Fabric080_2K-JPG_Color.jpg";

function mediaUrl(value) {
  if (!value) return "";
  if (value.startsWith("/") && !value.startsWith("//")) {
    return new URL(value, new URL(API.defaults.baseURL, window.location.origin)).href;
  }
  return value;
}

function useFeed(path) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    API.get(path, {signal:controller.signal}).then(r=>{
      if (!controller.signal.aborted) setData(r.data.data);
    }).catch(()=>{});
    return () => controller.abort();
  }, [path]);
  return data;
}

function useReducedMotion() {
  const [reduce,setReduce] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(()=>{
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduce(media.matches);
    media.addEventListener("change",change);
    return () => media.removeEventListener("change",change);
  },[]);
  return reduce;
}

function FittingPanel({ look, onClose }) {
  const [file,setFile] = useState(look.garment ? undefined : null);
  const panel = useRef(null);
  useEffect(()=>{
    panel.current?.focus({preventScroll:true});
    panel.current?.scrollIntoView({block:"nearest"});
    const controller = new AbortController();
    if (!look.garment) return;
    garmentFile(look.garment,controller.signal).then(value=>{if (!controller.signal.aborted) setFile(value);})
      .catch(()=>{if (!controller.signal.aborted) setFile(null);});
    return ()=>controller.abort();
  },[look.garment]);
  return <section id="campaign-fitting" aria-label="Your fitting room" tabIndex={-1} ref={panel} className="campaign-panel">
    <button className="campaign-close" onClick={onClose}><X size={16}/> Close fitting room</button>
    {look.garment && <h2 className="campaign-fitting-title">{look.title}</h2>}
    {look.garment && file===null && <p role="status">This garment image could not be loaded. Choose a garment photo below.</p>}
    {file===undefined ? <p role="status">Preparing the garment…</p> : <Suspense fallback={<p>Opening fitting room…</p>}><Fitting campaign embedded initialGarment={file} bookingUrl={look.item && buildBookingUrl(look.item)} /></Suspense>}
  </section>;
}

export default function CreatorShowcase({audience="creator"}) {
  if (audience === "creator") return <main><Suspense fallback={<p role="status">Opening your runway...</p>}><MyRunway/></Suspense></main>;
  return <ShowcaseCampaign audience={audience}/>;
}

function ShowcaseCampaign({audience}) {
  const hero = useFeed("/showcase-hero");
  const items = useFeed("/creator-showcase/pipeline?page=1&limit=12");
  const taxonomy = useFeed("/creator-showcase/discovery");
  const creator = audience === "creator";
  const designers = useFeed(creator ? "/creator-showcase/top-designers" : null);
  const gallery = "/"+audience+"/designs";
  const community = (items || []).filter(item=>item.slug && item.watermarked_preview_url).slice(0,3);
  const media = hero?.is_enabled ? (hero.mode === "video" ? [hero.video_url] : hero.slideshow_images || []).filter(Boolean) : [];
  const looks = media.map(source=>{
    const meta = hero.campaign_looks?.find(entry=>entry.media===source);
    const video = hero.mode === "video";
    return {key:source, photo:mediaUrl(video ? hero.video_poster_url : source),video:video ? mediaUrl(source) : "",
      title:meta?.title || "Design showcase",slug:meta?.slug,garment:mediaUrl(meta?.garment)};
  });
  const published = community.map(item=>({key:item.slug,title:item.title || "Untitled design",photo:mediaUrl(item.watermarked_preview_url),
    garment:mediaUrl(item.watermarked_preview_url),slug:item.slug,item}));
  const covers = looks.length ? looks : published.length ? published : [{key:"studio",title:"Design showcase",photo:fabric}];
  const [index,setIndex] = useState(0);
  const [paused,setPaused] = useState(false);
  const [fitting,setFitting] = useState(null);
  const [failed,setFailed] = useState("");
  const opener = useRef(null);
  const start = useRef(null);
  const reduce = useReducedMotion();
  const i = index % covers.length;
  const cover = covers[i];
  const [linked,setLinked] = useState(null);
  const slug = cover.slug;
  const needsDetail = Boolean(slug && !cover.item);
  useEffect(()=>{
    if (!needsDetail) return;
    const controller = new AbortController();
    API.get("/creator-showcase/item/"+encodeURIComponent(slug),{signal:controller.signal}).then(r=>{
      if(!controller.signal.aborted) setLinked({slug,item:r.data.data});
    }).catch(()=>{});
    return ()=>controller.abort();
  },[needsDetail,slug]);
  const item = cover.item || (linked?.slug===slug ? linked?.item : null);
  const rotating = covers.length>1 && !paused && !fitting && !reduce;
  useEffect(()=>{
    if (!rotating) return;
    const timer=setInterval(()=>setIndex(n=>(n+1)%covers.length),(hero?.rotation_seconds || 6)*1000);
    return ()=>clearInterval(timer);
  },[rotating,covers.length,hero?.rotation_seconds]);
  function select(n) { setPaused(true); setIndex((n+covers.length)%covers.length); }
  function open(look,event) { opener.current=event.currentTarget; setPaused(true); setFitting(look); }
  function close() { setFitting(null); opener.current?.focus({preventScroll:true}); }
  const styles=taxonomy?.trending?.length ? taxonomy.trending : taxonomy?.styles;
  return <main className="campaign">
    <section aria-label="Featured fashion looks" className="campaign-cover">
      <div className="campaign-art" onTouchStart={e=>{start.current=[e.touches[0].clientX,e.touches[0].clientY];}}
        onTouchEnd={e=>{if (!start.current) return; const dx=e.changedTouches[0].clientX-start.current[0],dy=e.changedTouches[0].clientY-start.current[1]; start.current=null;if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)) select(i+(dx<0?1:-1));}}>
        {cover.video && !reduce && failed!==cover.video ? <CampaignVideo key={cover.video} src={cover.video} poster={cover.photo} paused={paused || !!fitting} onError={()=>setFailed(cover.video)}/> :
        <img className="campaign-frame" key={cover.key} src={failed===cover.photo || !cover.photo ? fabric : cover.photo} onError={()=>setFailed(cover.photo)} alt={item?.title || ""} />}
      </div>
      <div className="campaign-copy" onFocusCapture={()=>setPaused(true)} key={cover.key}>
        <span className="campaign-kicker">DesignByYou / Lookbook</span>
        <h1>{cover.title}</h1>
        {item && <Link className="campaign-credit" to={"/"+audience+"/showcase/"+encodeURIComponent(item.slug)}>By {getOwnerName(item)} <ArrowUpRight size={15}/></Link>}
        <div className="campaign-actions">
          {creator && <button aria-expanded={!!fitting} onClick={e=>open({...cover,item,garment:cover.garment || mediaUrl(item?.watermarked_preview_url) || (looks.length && !cover.video ? cover.photo : "")},e)}>{cover.garment || item || (looks.length && !cover.video) ? "Try this look" : "Open fitting room"} <ArrowRight size={16}/></button>}
          <Link to={gallery}>Explore designs <ArrowUpRight size={16}/></Link>
        </div>
      </div>
      {covers.length>1 && <div className="campaign-thumbs" aria-label="Choose a featured look">{covers.map((look,n)=><button key={look.key} aria-label={"Show "+look.title+", look "+(n+1)} aria-pressed={n===i} onClick={()=>select(n)}><img src={look.photo || fabric} alt=""/></button>)}</div>}
      <div className="campaign-controls">
        {covers.length>1 && <><button aria-label="Previous look" onClick={()=>select(i-1)}><ChevronLeft/></button><span>{i+1} / {covers.length}</span><button aria-label="Next look" onClick={()=>select(i+1)}><ChevronRight/></button></>}
        {!reduce && (covers.length>1 || cover.video) && <button aria-label={paused?"Play campaign":"Pause campaign"} onClick={()=>setPaused(!paused)}>{paused?<Play size={16}/>:<Pause size={16}/>}</button>}
      </div>
    </section>
    {fitting && <FittingPanel key={JSON.stringify([fitting.key, fitting.garment])} look={fitting} onClose={close}/>}
    <div className="campaign-body">
      {!!published.length && <section><header><h2>The lookbook</h2><Link to={gallery}>Design Gallery <ArrowUpRight size={15}/></Link></header>
        <div className="campaign-looks">{published.map(look=><article key={look.key}>
          <Link to={"/"+audience+"/showcase/"+encodeURIComponent(look.slug)}><div className="campaign-print"><img loading="lazy" src={look.photo} alt={look.title}/></div>
          <h3>{look.title}</h3></Link><p>{getOwnerName(look.item)}</p>
          {creator && <button className="campaign-text-action" onClick={e=>open(look,e)}>Try this look <ArrowRight size={14}/></button>}
        </article>)}</div></section>}
      {!!styles?.length && <section><h2>Explore by style</h2><div className="campaign-styles">{styles.slice(0,8).map(s=><Link key={s.slug} to={gallery+"?term="+encodeURIComponent(s.slug)}>{s.name} <ArrowUpRight size={14}/></Link>)}</div></section>}
      {creator && !!designers?.length && <section><header><h2>Featured designers</h2><Link to="/creator/directory">Designer directory <ArrowUpRight size={14}/></Link></header><div className="campaign-styles">{designers.slice(0,5).map(d=><div key={d.designer_id} className="campaign-designer"><Link to={"/creator/studio/"+encodeURIComponent(d.designer_id)}>{d.designer_name} <ArrowUpRight size={14}/></Link><Link aria-label={"Book "+d.designer_name} to={"/creator/bookings/new?designer_id="+encodeURIComponent(d.designer_id)}>Book designer</Link></div>)}</div></section>}
      <footer><Link to={creator?"/creator/tools":"/designer/upload"}>{creator?"Create your own":"Share your design"} <ArrowRight size={15}/></Link>{creator && <Link to="/creator/wallet#subscription">View subscription <ArrowUpRight size={15}/></Link>}</footer>
    </div>
  </main>;
}
function CampaignVideo({src,poster,paused,onError}) {
  const ref=useRef(null);
  useEffect(()=>{ if(paused) ref.current?.pause(); else ref.current?.play().catch(()=>{}); },[paused]);
  return <video ref={ref} src={src} poster={poster} onError={onError} muted loop playsInline preload="metadata"/>;
}
