import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ImagePlus, X } from "lucide-react";
import "./CreatorUploadStudio.css";
import API from "../../api/axios";

const endpoint = "/creators/runway/photos";
export default function FittingPhotos({ onChange, onSaved }) {
  const [photos,setPhotos] = useState(null);
  const [queue,setQueue] = useState([]);
  const [progress,setProgress] = useState("");
  const mounted = useRef(true);
  useEffect(()=>{
    mounted.current=true;
    return ()=>{mounted.current=false;};
  },[]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [attempt,setAttempt] = useState(0);
  useEffect(()=>{
    const controller = new AbortController();
    API.get(endpoint,{signal:controller.signal}).then(r=>setPhotos(r.data)).catch(()=>{
      if(!controller.signal.aborted) setError("Could not load fitting photos.");
    });
    return ()=>controller.abort();
  },[attempt]);
  const saving = useRef(false);
  function choose(event) {
    const files = Array.from(event.target.files);
    event.target.value = "";
    if (!files.length) return;
    const room = 5 - photos.length - queue.length;
    const added = [], issues = [];
    for (const file of files) {
      const supported = ["image/jpeg","image/png","image/webp"].includes(file.type) ||
        (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name));
      if (!supported || !file.size || file.size > 12*1024*1024) {
        issues.push(file.name + ": choose a JPG, PNG or WebP up to 12 MB.");
      } else if (added.length >= room) {
        issues.push(file.name + ": all five slots are selected.");
      } else {
        added.push({file, id:crypto.randomUUID()});
      }
    }
    setQueue(prev => [...prev,...added]);
    setError(issues.join(" ")); setProgress("");
  }
  async function save() {
    if (!queue.length || saving.current) return;
    saving.current = true;
    setBusy(true); setError("");
    let completed = 0;
    try {
      for (const [index,entry] of queue.entries()) {
        if (!mounted.current) break;
        setProgress("Preparing photo " + (index+1) + " of " + queue.length + "…");
        const form = new FormData();
        form.append("image",entry.file); form.append("photo_id",entry.id);
        try {
          const {data} = await API.post(endpoint+"/prepare",form,{timeout:130000});
          if (!mounted.current) break;
          completed++;
          setPhotos(prev => [...prev.filter(p=>p.id!==data.id),data]);
          setQueue(prev => prev.filter(item=>item.id!==entry.id));
          onChange?.();
        } catch(err) {
          if (!mounted.current) break;
          const message = err.response?.data?.message || "Save could not be confirmed. Retry this selection.";
          setQueue(prev => prev.map(item=>item.id===entry.id ? {...item,error:message} : item));
          if (![400,422].includes(err.response?.status)) break;
        }
      }
      if (mounted.current) {
        setProgress("Saved " + completed + " of " + queue.length + "."
          + (completed < queue.length ? " Remove or retry the remaining photos." : ""));
        if (completed === queue.length) onSaved?.();
      }
    } finally {saving.current=false; if (mounted.current) setBusy(false);}
  }
  async function remove(id) {
    if (!window.confirm("Remove this fitting photo and its runway lineup? Generated images remain in your private try-on history.")) return;
    setBusy(true); setError("");
    try {await API.delete(endpoint+"/"+id); setPhotos(prev=>prev.filter(p=>p.id!==id)); onChange?.();}
    catch {setError("Could not remove the photo.");} finally {setBusy(false);}
  }
  const Container = onChange ? "section" : "main";
  const Heading=onChange ? "h2" : "h1";
  return <Container className="upload-studio photo-studio">
    {!onChange && <Link to="/creator/profile" className="studio-back">Back to profile</Link>}
    <header className="studio-heading"><Heading>Private fitting <em>photos</em></Heading>
      <p>Start with one full-body photo. Add up to five to show the weekly outfits in different poses.</p></header>
    <div className="photo-workspace">
      <figure className="pose-guide"><img src="/images/runway/navy-tee.webp" alt="Full-body example with head and shoes in frame"/>
        <figcaption>Keep your full figure in frame</figcaption></figure>
      <div className="studio-panel">
        <div className="studio-panel-head"><h3>Your photos</h3>{photos && <span>{photos.length} / 5 saved</span>}</div>
        {!photos && !error && <p role="status">Loading fitting photos…</p>}
        {!!photos?.length && <div className="saved-poses">{photos.map(p=><div key={p.id}>
          <img src={p.url} alt={"Fitting photo "+p.slot}/>
          <button type="button" aria-label={"Remove photo "+p.slot} disabled={busy} onClick={()=>remove(p.id)}><X size={16}/></button>
        </div>)}</div>}
        {photos && photos.length<5 && <fieldset disabled={busy} className="studio-form">
          <legend className="sr-only">Add fitting photos</legend>
          <label className="studio-picker"><ImagePlus size={26}/><strong>{photos.length+queue.length>=5?"All five slots selected":queue.length?"Add more photos":"Choose fitting photos"}</strong><small>JPG, PNG or WebP, up to 12 MB each</small>
            <input type="file" disabled={photos.length+queue.length>=5} multiple accept="image/png,image/jpeg,image/webp" aria-label="Choose fitting photos" onChange={choose}/></label>
          {!!queue.length && <ul className="studio-files">{queue.map(item=><li key={item.id}>{item.file.name} <button type="button" aria-label={"Remove "+item.file.name+" from selection"} onClick={()=>setQueue(prev=>prev.filter(p=>p.id!==item.id))}>Remove</button>{item.error && <p role="alert">{item.error}</p>}</li>)}</ul>}
          <button disabled={!queue.length || busy} className="studio-submit bg-action" onClick={save}>
            {busy ? "Saving..." : queue.length ? `Save ${queue.length} ${queue.length===1?"photo":"photos"}` : "Save photos"}
          </button>
        </fieldset>}
        <p className="studio-note">Runway fitting is free. Uploads, background removal, and weekly outfit try-ons use zero AI credits.</p>
        {error && <p role="alert">{error} {!photos && <button onClick={()=>{setError("");setAttempt(n=>n+1);}}>Retry</button>}</p>}
        {progress && <p role="status">{progress}</p>}
      </div>
    </div>
    {!onChange && <Link to="/creator/showcase" className="studio-back">Open My Runway</Link>}
  </Container>;
}
