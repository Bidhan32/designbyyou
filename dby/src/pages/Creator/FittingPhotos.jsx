import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ImagePlus, X } from "lucide-react";
import PrivateImage from "./PrivateImage";
import "./CreatorUploadStudio.css";
import "./FittingPhotos.css";
import API from "../../api/axios";

const endpoint = "/creators/runway/photos";
const MAX = 5;
// crypto.randomUUID needs HTTPS and newer browsers, so fall back to a v4-shaped id.
const uid = () => globalThis.crypto?.randomUUID?.() ||
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 3 | 8)).toString(16);
  });

export default function FittingPhotos({ onChange, onSaved, onBusy, embedded }) {
  const isEmbedded = embedded ?? !!onChange;
  const [photos,setPhotos] = useState(null);
  const [queue,setQueue] = useState([]);
  const [progress,setProgress] = useState("");
  const [done,setDone] = useState(0);
  const [busy,setBusy] = useState(false);
  const [loadError,setLoadError] = useState("");
  const [formError,setFormError] = useState("");
  const [attempt,setAttempt] = useState(0);
  const [confirmId,setConfirmId] = useState(null);
  const [dragging,setDragging] = useState(false);
  const mounted = useRef(true);
  const saving = useRef(false);
  const queueRef = useRef([]);
  queueRef.current = queue;

  useEffect(()=>{
    mounted.current=true;
    return ()=>{mounted.current=false; queueRef.current.forEach(q=>URL.revokeObjectURL(q.url));};
  },[]);
  useEffect(()=>{ onBusy?.(busy); return ()=>onBusy?.(false); },[busy,onBusy]);
  useEffect(()=>{
    const controller = new AbortController();
    setLoadError("");
    API.get(endpoint,{signal:controller.signal}).then(r=>setPhotos(r.data)).catch(()=>{
      if(!controller.signal.aborted) setLoadError("Could not load fitting photos.");
    });
    return ()=>controller.abort();
  },[attempt]);

  const savedCount = photos?.length ?? 0;
  const full = savedCount + queue.length >= MAX;
  const locked = busy || !photos;

  function dropEntry(id) {
    setQueue(prev => { prev.filter(q=>q.id===id).forEach(q=>URL.revokeObjectURL(q.url)); return prev.filter(q=>q.id!==id); });
  }
  function ingest(files) {
    if (!files.length || locked) return;
    const room = MAX - savedCount - queue.length;
    const added = [], issues = [];
    for (const [index,file] of files.entries()) {
      const supported = ["image/jpeg","image/png","image/webp"].includes(file.type) ||
        (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name));
      if (!supported || !file.size || file.size > 12*1024*1024) {
        issues.push("Photo "+(index+1) + ": choose a JPG, PNG or WebP up to 12 MB.");
      } else if (added.length >= room) {
        issues.push("Photo "+(index+1) + ": all five slots are taken.");
      } else {
        added.push({file, id:uid(), url:URL.createObjectURL(file), state:"queued"});
      }
    }
    setQueue(prev => [...prev,...added]);
    setFormError(issues.join(" ")); setProgress(""); setDone(0);
  }
  function choose(event) {
    const files = Array.from(event.target.files);
    event.target.value = "";
    ingest(files);
  }
  function drop(event) {
    event.preventDefault(); setDragging(false);
    ingest(Array.from(event.dataTransfer.files));
  }
  async function save() {
    if (!queue.length || saving.current) return;
    saving.current = true;
    setBusy(true); setFormError(""); setDone(0);
    let completed = 0;
    const batch = queue;
    try {
      for (const [index,entry] of batch.entries()) {
        if (!mounted.current) break;
        setProgress("Preparing photo " + (index+1) + " of " + batch.length + "…");
        setQueue(prev => prev.map(item=>item.id===entry.id ? {...item,state:"saving",error:undefined} : item));
        const form = new FormData();
        form.append("image",entry.file); form.append("photo_id",entry.id);
        try {
          const {data} = await API.post(endpoint+"/prepare",form,{timeout:130000});
          if (!mounted.current) break;
          completed++; setDone(completed);
          setPhotos(prev => [...(prev || []).filter(p=>p.id!==data.id),data]);
          dropEntry(entry.id);
          onChange?.();
        } catch(err) {
          if (!mounted.current) break;
          const message = err.response?.data?.message || "Save could not be confirmed. Retry this selection.";
          setQueue(prev => prev.map(item=>item.id===entry.id ? {...item,state:"error",error:message} : item));
          if (![400,422].includes(err.response?.status)) break;
        }
      }
      if (mounted.current) {
        setProgress("Saved " + completed + " of " + batch.length + "."
          + (completed < batch.length ? " Remove or retry the remaining photos." : ""));
        if (completed === batch.length) onSaved?.(batch[0].id);
      }
    } finally {saving.current=false; if (mounted.current) setBusy(false);}
  }
  async function remove(id) {
    setConfirmId(null); setBusy(true); setFormError("");
    try {await API.delete(endpoint+"/"+id); setPhotos(prev=>prev.filter(p=>p.id!==id)); onChange?.();}
    catch {setFormError("Could not remove the photo.");} finally {setBusy(false);}
  }

  const cells = [...(photos||[]).map(p=>({kind:"saved",p})),...queue.map(q=>({kind:"queue",q}))];
  const failed = queue.filter(q=>q.error);
  const Container = isEmbedded ? "section" : "main";
  const Heading = isEmbedded ? "h2" : "h1";
  return <Container className="upload-studio photo-studio">
    {!isEmbedded && <Link to="/creator/profile" className="studio-back">Back to profile</Link>}
    <header className="studio-heading"><Heading>Private fitting <em>photos</em></Heading>
      <p>Choose a full-body photo with your head and shoes in frame. You can switch between saved photos in your fitting room.</p></header>
    <div className="photo-workspace">
      <figure className="pose-guide"><span className="pg-frame"><img src="/images/runway/navy-tee.webp" alt="Full-body example with head and shoes in frame"/>
        <i className="pg-line pg-head" aria-hidden="true"><b>Head</b></i><i className="pg-line pg-feet" aria-hidden="true"><b>Shoes</b></i></span>
        <figcaption>Keep your full figure in frame</figcaption></figure>
      <div className="studio-panel">
        <div className="studio-panel-head"><h3>Your photos</h3><span>{photos ? savedCount+" / "+MAX+" saved" : ""}</span></div>
        {!photos && !loadError && <p role="status">Loading fitting photos…</p>}
        {loadError && <p role="alert">{loadError} <button type="button" onClick={()=>setAttempt(n=>n+1)}>Retry</button></p>}
        <ol className="ps-slots" aria-label="Photo slots">{Array.from({length:MAX},(_,i)=>{
          const c = cells[i], style = {"--i":i};
          if (c?.kind==="saved") { const p=c.p; return <li key={p.id} className="ps-slot" data-kind="saved" style={style}>
            <PrivateImage path={endpoint+"/"+p.id+"/file"} fallback={p.url} alt={"Fitting photo "+p.slot}/>
            <span className="ps-badge"><Check size={12} aria-hidden="true"/> Saved</span>
            {confirmId===p.id
              ? <div className="ps-confirm" role="group" aria-label="Confirm removal"><span>Remove?</span>
                  <button type="button" disabled={busy} onClick={()=>remove(p.id)}>Yes</button>
                  <button type="button" onClick={()=>setConfirmId(null)}>No</button></div>
              : <button type="button" className="ps-x" aria-label={"Remove photo "+p.slot} disabled={busy} onClick={()=>setConfirmId(p.id)}><X size={16}/></button>}
          </li>; }
          if (c?.kind==="queue") { const q=c.q; return <li key={q.id} className="ps-slot" data-kind="queue" data-state={q.state} style={style}>
            <img src={q.url} alt={"Selected fitting photo "+(i+1)} draggable={false}/>
            <span className="ps-badge">{q.state==="saving"?"Preparing…":q.state==="error"?"Failed":"Ready"}</span>
            {q.state==="saving" && <span className="ps-scan" aria-hidden="true"/>}
            <button type="button" className="ps-x" aria-label={"Remove photo "+(i+1)+" from selection"} disabled={q.state==="saving"} onClick={()=>dropEntry(q.id)}><X size={16}/></button>
          </li>; }
          return <li key={"e"+i} className="ps-slot" data-kind="empty" style={style} aria-hidden="true"><span>{i+1}</span></li>;
        })}</ol>
        {savedCount<MAX && <fieldset disabled={locked} className="studio-form">
          <legend className="sr-only">Add fitting photos</legend>
          <label className="studio-picker ps-drop" data-drag={dragging} data-full={full}
            onDragOver={e=>{e.preventDefault(); if(!full)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={drop}>
            <ImagePlus size={28} aria-hidden="true"/>
            <strong>{full?"All five slots are taken":dragging?"Drop to add":queue.length?"Add more photos":"Choose or drop fitting photos"}</strong>
            <small>JPG, PNG or WebP, up to 12 MB each</small>
            <input type="file" disabled={full} multiple accept="image/png,image/jpeg,image/webp" aria-label="Choose fitting photos" onChange={choose}/></label>
          {busy && <div className="ps-progress" aria-hidden="true"><i style={{width:Math.max(8,done/Math.max(queue.length+done,1)*100)+"%"}}/></div>}
          <button type="button" disabled={!queue.length || busy} className="studio-submit ps-save" onClick={save}>
            {busy ? "Saving…" : failed.length ? "Retry "+queue.length+(queue.length===1?" photo":" photos") : queue.length ? `Save ${queue.length} ${queue.length===1?"photo":"photos"}` : "Save photos"}
          </button>
        </fieldset>}
        <p className="studio-note">Runway fitting is free. Choose an outfit from the rack to try it on with zero AI credits. Removing a photo also removes its runway lineup, but generated images stay in your private try-on history.</p>
        {formError && <p role="alert">{formError}</p>}
        {failed.map(q=><p role="alert" key={q.id}>Photo {savedCount+queue.indexOf(q)+1}: {q.error}</p>)}
        {progress && <p role="status">{progress}</p>}
      </div>
    </div>
    {!isEmbedded && <Link to="/creator/showcase" className="studio-back">Open My Runway</Link>}
  </Container>;
}
