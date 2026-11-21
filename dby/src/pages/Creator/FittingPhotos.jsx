import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ImagePlus, X } from "lucide-react";
import "./CreatorUploadStudio.css";
import API from "../../api/axios";
import CreatorCreditBalance from "../../components/CreatorCreditBalance";

const endpoint = "/creators/runway/photos";
async function saveCutout(image, photoId) {
  const form = new FormData();
  form.append("image", image, "cutout.png");
  form.append("photo_id", photoId);
  try {
    return await API.post(endpoint, form);
  } catch (error) {
    // Older API instances reject this request before storing the image.
    if (error.response?.status !== 400 ||
        error.response.data?.message !== "Choose a cutout and confirm private storage.") throw error;
    form.delete("photo_id");
    form.append("consent", "true"); // The creator explicitly clicked Save photos.
    return API.post(endpoint, form);
  }
}
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
  function choose(event) {
    const files = Array.from(event.target.files);
    event.target.value = "";
    if (!files.length) return;
    const slots = 4 - photos.length;
    const invalid = files.find(f => !["image/jpeg","image/png","image/webp"].includes(f.type) || !f.size || f.size > 12*1024*1024);
    if (files.length > slots || invalid) {
      setQueue([]);
      setError(files.length > slots ? `Choose up to ${slots} more fitting photos.` : `Choose a JPG, PNG or WebP under 12 MB for ${invalid.name}.`);
      return;
    }
    setError(""); setProgress("");
    setQueue(files.map(file => ({file, id:crypto.randomUUID(), image:null})));
  }
  async function save() {
    if (!queue.length || busy) return;
    setBusy(true); setError("");
    let completed = 0;
    try {
      for (const entry of queue) {
        if (!mounted.current) break;
        setProgress(`Saving ${completed+1} of ${queue.length}`);
        let image = entry.image;
        if (!image) {
          const form = new FormData();
          form.append("image",entry.file); form.append("request_key",entry.id);
          const response = await API.post("/creator-tools/background-remove",form,{timeout:110000});
          image = await (await fetch(response.data.data.image)).blob();
          setQueue(prev => prev.map(item => item.id === entry.id ? {...item,image} : item));
        }
        const {data} = await saveCutout(image,entry.id);
        completed++;
        if (mounted.current) {
          setPhotos(prev => [...prev.filter(p=>p.id!==data.id),data]);
          setQueue(prev => prev.filter(item=>item.id!==entry.id));
          onChange?.();
        }
      }
      if (mounted.current && photos.length+completed>=3) onSaved?.();
      setProgress(`Saved ${completed} fitting ${completed===1?"photo":"photos"}.`);
    } catch(err) {
      setProgress(completed ? `Saved ${completed} of ${queue.length}.` : "");
      setError(err.response?.data?.message || "Could not finish saving. Retry the remaining photos.");
    } finally {setBusy(false);}
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
      <p>Add three or four full-body photos to see yourself in the weekly collection.</p></header>
    <div className="photo-workspace">
      <figure className="pose-guide"><img src="/images/runway/navy-tee.webp" alt="Full-body example with head and shoes in frame"/>
        <figcaption>Keep your full figure in frame</figcaption></figure>
      <div className="studio-panel">
        <div className="studio-panel-head"><h3>Your photos</h3>{photos && <span>{photos.length} / 4 saved</span>}</div>
        {!photos && !error && <p role="status">Loading fitting photos…</p>}
        {!!photos?.length && <div className="saved-poses">{photos.map(p=><div key={p.id}>
          <img src={p.url} alt={"Fitting photo "+p.slot}/>
          <button type="button" aria-label={"Remove photo "+p.slot} disabled={busy} onClick={()=>remove(p.id)}><X size={16}/></button>
        </div>)}</div>}
        {photos && photos.length<4 && <fieldset disabled={busy} className="studio-form">
          <legend className="sr-only">Add fitting photos</legend>
          <label className="studio-picker"><ImagePlus size={26}/><strong>{queue.length?"Change selection":"Choose fitting photos"}</strong><small>JPG, PNG or WebP · up to 12 MB each</small>
            <input type="file" multiple accept="image/png,image/jpeg,image/webp" aria-label="Choose fitting photos" onChange={choose}/></label>
          {!!queue.length && <ul className="studio-files">{queue.map(item=><li key={item.id}>{item.file.name}</li>)}</ul>}
          <CreatorCreditBalance refreshKey={busy} costLabel="10 credits per photo for background removal"/>
          <button disabled={!queue.length || busy} className="studio-submit bg-action" onClick={save}>
            {busy ? "Saving..." : queue.length ? `Save ${queue.length} ${queue.length===1?"photo":"photos"} (${queue.filter(item=>!item.image).length*10} credits)` : "Save photos"}
          </button>
        </fieldset>}
        <p className="studio-note">Your runway automatically prepares each weekly outfit for 10 credits.</p>
        {error && <p role="alert">{error} {!photos && <button onClick={()=>{setError("");setAttempt(n=>n+1);}}>Retry</button>}</p>}
        {progress && <p role="status">{progress}</p>}
      </div>
    </div>
    {!onChange && <Link to="/creator/showcase" className="studio-back">Open My Runway</Link>}
  </Container>;
}
