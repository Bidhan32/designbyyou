import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
  return <Container className="mx-auto max-w-3xl space-y-6 p-6 text-ink">
    {!onChange && <Link to="/creator/profile" className="underline">Back to profile</Link>}
    <h1 className="font-serif text-4xl">Private fitting photos</h1>
    <p>Add three or four full-body photos. Background removal costs 10 credits per photo. Opening your runway automatically prepares one outfit per weekly design at 10 credits each.</p>
    {error && <p role="alert">{error} {!photos && <button onClick={()=>{setError("");setAttempt(n=>n+1);}}>Retry</button>}</p>}
    {photos && <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{photos.map(p=><div key={p.id}>
      <img src={p.url} alt={"Fitting photo "+p.slot} className="aspect-[3/4] w-full rounded-md bg-subtle object-contain"/>
      <button disabled={busy} onClick={()=>remove(p.id)} className="underline">Remove photo {p.slot}</button>
    </div>)}</div>}
    {photos && photos.length<4 && <fieldset disabled={busy} className="space-y-4 rounded-md border border-line p-5">
      <legend>Add fitting photos</legend>
      <input type="file" multiple accept="image/png,image/jpeg,image/webp" aria-label="Choose fitting photos" onChange={choose}/>
      {queue.length>0 && <p>{queue.map(item=>item.file.name).join(", ")}</p>}
      <CreatorCreditBalance refreshKey={busy} costLabel="10 credits per background removal"/>
      <button disabled={!queue.length || busy} className="rounded-md bg-action px-4 py-2 text-on-action disabled:opacity-50" onClick={save}>
        {busy ? "Saving..." : queue.length ? `Save ${queue.length} ${queue.length===1?"photo":"photos"} (${queue.filter(item=>!item.image).length*10} credits)` : "Save photos"}
      </button>
    </fieldset>}
    {progress && <p role="status">{progress}</p>}
    {!onChange && <Link to="/creator/showcase" className="inline-block underline">Open My Runway</Link>}
  </Container>;
}
