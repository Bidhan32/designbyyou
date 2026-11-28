import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check, Images } from "lucide-react";
import API from "../../api/axios";
import FittingPhotos from "./FittingPhotos";
import PrivateImage from "./PrivateImage";
import "./MyRunway.css";

const root = "/creators/runway";
const featuredTools = [
  { name: "Sketch to Image", slug: "sketch-to-image", image: "sketch-to-image", action: "Bring a sketch to life" },
  { name: "Virtual Try-On", slug: "virtual-try-on", image: "virtual-tryon", action: "Try an outfit" },
];

export default function MyRunway() {
  const [photos,setPhotos]=useState([]);
  const [photoId,setPhotoId]=useState("");
  const [looks,setLooks]=useState([]);
  const [selected,setSelected]=useState(null);
  const [result,setResult]=useState(null);
  const [original,setOriginal]=useState(false);
  const [manage,setManage]=useState(false);
  const [revision,refresh]=useState(0);
  const [error,setError]=useState("");
  const [waiting,setWaiting]=useState(false);
  const [attempt,retry]=useState(0);
  const [loaded,setLoaded]=useState(false);
  const [photoLoadError,setPhotoLoadError]=useState("");
  const [rackLoadError,setRackLoadError]=useState("");
  const [editingRack,setEditingRack]=useState(false);
  const [savingRack,setSavingRack]=useState(false);
  const [rackError,setRackError]=useState("");
  const [photoBusy,setPhotoBusy]=useState(false);
  async function uploadGarments(event){
    const files=Array.from(event.target.files);
    event.target.value="";
    if(!files.length)return;
    setRackError("");
    if(files.length>10-looks.length || files.some(file=>file.size>8*1024*1024)){
      setRackError(`Your rack has ${10-looks.length} available slots. Choose images up to 8 MB each.`);
      return;
    }
    const form=new FormData();
    files.forEach(file=>form.append("garments",file));
    setSavingRack(true);
    try{
      await API.post(root+"/garments",form,{timeout:120000});
      refresh(n=>n+1);
    }catch(err){setRackError(err.response?.data?.message || "Could not save your garments. Try uploading again.");}
    finally{setSavingRack(false);}
  }
  async function removeGarment(id){
    setSavingRack(true);setRackError("");
    try{
      await API.delete(root+"/garments/"+id);
      if(looks.length===1)setEditingRack(false);
      setLooks(items=>items.filter(item=>item.id!==id));
      setResult(null);
    }catch{setRackError("Could not remove this garment. Try again.");}
    finally{setSavingRack(false);}
  }
  const photo=photos.find(p=>p.id===photoId);
  useEffect(()=>{
    if(manage)return;
    const controller=new AbortController();
    setPhotoLoadError("");
    API.get(root+"/photos",{signal:controller.signal}).then(({data})=>{
      if(controller.signal.aborted)return;
      setPhotos(data);
      setPhotoId(id=>data.some(item=>item.id===id)?id:data[0]?.id || "");
    }).catch(()=>{if(!controller.signal.aborted)setPhotoLoadError("Could not load your saved photos.");});
    return ()=>controller.abort();
  },[revision,manage]);
  useEffect(()=>{
    if(manage)return;
    const controller=new AbortController();
    setLoaded(false);setRackLoadError("");
    API.get(root+"/weekly",{signal:controller.signal,params:{photo_id:photoId || undefined}}).then(({data})=>{
      if(controller.signal.aborted)return;
      setLooks(data.map(look=>({...look,receivedAt:Date.now()})));
      setLoaded(true);
    }).catch(()=>{if(!controller.signal.aborted)setRackLoadError("Could not load your saved garments.");});
    return ()=>controller.abort();
  },[photoId,revision,manage]);

  useEffect(()=>{
    if(!selected || !photoId || !loaded || manage)return;
    const look=looks.find(l=>l.id===selected && l.photo_id===photoId);
    if(!look)return;
    const controller=new AbortController();
    const options={signal:controller.signal,timeout:90000};
    let timer;
    function reveal(url){
      if(controller.signal.aborted)return;
      setResult({url,photoId});
      setWaiting(false);
    }
    if(look.image_url && Date.now()-look.receivedAt<600000){reveal(look.image_url);return;}
    setWaiting(true);
    async function run(jobId,blocked=false){
      if(controller.signal.aborted)return;
      try {
        const {data:reply}=jobId
          ? await API.get("/creators/ai/virtual-try-on/"+jobId,options)
          : await API.post(root+"/weekly/"+look.id,{photo_id:photoId,retry:look.status==="failed" || attempt>0},options);
        if(controller.signal.aborted)return;
        if(reply.active_job_id){
          timer=setTimeout(()=>run(reply.active_job_id,true),1800);
          return;
        }
        const job=reply.data;
        if(blocked && ["completed","failed"].includes(job.status)){
          timer=setTimeout(()=>run(null),0);
        }else if(job.status==="completed"){
          reveal(job.image_url);
          setLooks(items=>items.map(item=>item.id===look.id ? {...item,status:"completed",job_id:job.id,image_url:job.image_url,receivedAt:Date.now()} : item));
        }else if(job.status==="failed"){
          throw new Error(job.error_message || "Could not prepare this fitting.");
        }else{
          timer=setTimeout(()=>run(job.id,blocked),1400);
        }
      }catch(err){
        if(controller.signal.aborted)return;
        setError(err.response?.data?.message || err.message || "Could not prepare this fitting.");
        setWaiting(false);
      }
    }
    const existing=look.job_id && look.status!=="failed" ? look.job_id : null;
    if(existing) run(existing);
    else timer=setTimeout(()=>run(null),220);
    return ()=>{controller.abort();clearTimeout(timer);};
  },[selected,photoId,looks,manage,loaded,attempt]);
  function selectLook(id){
    if(id===selected && !waiting)retry(n=>n+1);
    setSelected(id);setError("");setOriginal(false);
    if(!photo)setManage(true);
  }
  const current=result?.photoId===photoId ? result : null;
  const showing=!!current && !original;
  const stepsDone=[!!photo,looks.length>0,!!current];
  const activeStep=stepsDone.indexOf(false);
  return <section className="my-runway" aria-label="Private fitting room">
    <span className="runway-aurora" aria-hidden="true"/>
    <div className="runway-layout">
      <header className="runway-intro">
        <div>
        <h1>My <em>Runway</em></h1>
        </div>
        <nav aria-label="Showcase actions">
          <Link className="runway-primary" to="/creator/fashion-editor">Create your own <ArrowUpRight size={17}/></Link>
          <Link to="/creator/designs">Explore designs</Link>
          <Link to="/creator/tools">AI tools</Link>
          <Link to="/creator/wallet#subscription">View subscription</Link>
        </nav>
      </header>
      {!manage && <ol className="runway-steps" aria-label="How it works">{["Add your photo","Fill your rack","Try it on"].map((label,i)=>
        <li key={label} data-done={stepsDone[i]} data-active={i===activeStep}><span className="step-dot">{stepsDone[i]?<Check size={13} aria-hidden="true"/>:i+1}</span>{label}</li>)}</ol>}
      <div className="fitting-room">
        {manage ? <><button className="room-action" disabled={photoBusy} onClick={()=>setManage(false)}>{photoBusy?"Saving photos…":"Back to fitting room"}</button>
          <FittingPhotos embedded onBusy={setPhotoBusy} onSaved={id=>{setPhotoId(id);setManage(false);}} onChange={()=>refresh(n=>n+1)}/></> :
          <div className="fitting-layout">
            <div className="fitting-mirror" data-waiting={waiting} data-showing={showing}>
              <span className="mirror-spot" aria-hidden="true"/>
              <PrivateImage path={photo ? root+"/photos/"+photo.id+"/file" : null} fallback={photo?.url || "/images/runway/navy-tee.webp"} alt={photo?"Original fitting photo":"Sample runway model"}/>
              {showing && <img key={current.url} className="fitting-reveal" src={current.url} alt="Your photo wearing the selected garment"/>}
              {showing && <span key={"sparkle-"+current.url} className="sparkles" aria-hidden="true">{Array.from({length:10},(_,i)=><i key={i} style={{"--a":i}}/>)}</span>}
              {waiting && <span className="mirror-scan" aria-hidden="true"/>}
              <span className="mirror-floor" aria-hidden="true"/>
              <div className="mirror-actions">
                <button className={photo?"":"nudge"} onClick={()=>{setSelected(null);setWaiting(false);setError("");setManage(true);}}><Images size={15}/>{photo?"Manage photos":"Add your photo"}</button>
                {current && <button onClick={()=>setOriginal(!original)}>{original?"Show fitting":"Show original"}</button>}
              </div>
            </div>
            <div className="garment-selection">
              <h2>Your clothing <em>rack</em></h2>
              <p>{looks.length?"Tap a garment to try it on.":"Upload clothing images to fill your private rack."} For a cleaner fit, use garment photos with the background removed.</p>
              <div className="rack-controls">
                <label className="room-action">Add garments
                  <input type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Upload garments" disabled={savingRack || (loaded && looks.length>=10)} onChange={uploadGarments}/>
                </label>
                <span className="rack-count">{savingRack?"Saving…":looks.length+" / 10"}</span>
                <span className="rack-meter" aria-hidden="true"><i style={{width:looks.length*10+"%"}}/></span>
                {!!looks.length && <button type="button" disabled={savingRack} onClick={()=>{setEditingRack(!editingRack);setSelected(null);setWaiting(false);}}>{editingRack?"Done":"Edit rack"}</button>}
              </div>
              {rackLoadError && <p role="alert">{rackLoadError} <button onClick={()=>refresh(n=>n+1)}>Reload rack</button></p>}
              {rackError && <p role="alert">{rackError}</p>}
              {photos.length>1 && <label>Fitting photo <select value={photoId} onChange={e=>{setSelected(null);setWaiting(false);setPhotoId(e.target.value);}}>{photos.map(p=><option key={p.id} value={p.id}>Photo {p.slot}</option>)}</select></label>}
              <div className="garment-rail" data-editing={editingRack} aria-label="Your uploaded garments">{looks.map((l,i)=>
                <button key={l.id} type="button" style={{"--i":i}} disabled={editingRack && savingRack} data-fitting={waiting && selected===l.id} aria-label={(editingRack?"Remove garment ":"Try on garment ")+(i+1)} aria-pressed={selected===l.id} onClick={()=>editingRack?removeGarment(l.id):selectLook(l.id)}>
                  <span className="rack-hanger" aria-hidden="true">
                    <span className="hanger-hook"/><span className="hanger-wood"/>
                    <span className="rack-image"><PrivateImage path={root+"/garments/"+l.id} alt=""/></span>
                  </span>
                  {editingRack && <span className="rack-name">Remove</span>}
                </button>)}</div>
              <p role="status" className="rack-status" data-busy={waiting}>{waiting ? "Preparing your fitting…" : !loaded && !rackLoadError ? "Loading the rack…" : current && !original ? "Your fitting is ready." : ""}</p>
            </div>
          </div>}
        {photoLoadError && !manage && <p role="alert">{photoLoadError} <button onClick={()=>refresh(n=>n+1)}>Reload photos</button></p>}
        {error && <p role="alert">{error} <button onClick={()=>{setError("");retry(n=>n+1);refresh(n=>n+1);}}>Retry</button></p>}
      </div>
      {!manage && <section className="runway-tools" aria-labelledby="runway-tools-title">
        <h2 id="runway-tools-title">Make it <em>yours</em></h2>
        <div className="runway-tool-grid">
          {featuredTools.map(tool => (
            <Link key={tool.slug} className="runway-tool" to={`/creator/tools/${tool.slug}`}>
              <span className="tool-image"><img src={`/images/creator-tools/mobile/${tool.image}.webp`} loading="lazy" decoding="async" alt="" /></span>
              <div>
                <h3>{tool.name}</h3>
                <span className="tool-action">{tool.action} <ArrowUpRight size={16} aria-hidden="true" /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>}
    </div>
  </section>;
}
