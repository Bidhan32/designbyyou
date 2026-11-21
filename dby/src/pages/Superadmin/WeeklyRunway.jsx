import { useEffect, useState } from "react";
import API from "../../api/axios";

const endpoint="/superadmin/weekly-runway";
export default function WeeklyRunway(){
  const [collection,setCollection]=useState([]);
  const [files,setFiles]=useState([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    API.get(endpoint,{signal:controller.signal}).then(r=>setCollection(r.data)).catch(()=>{if(!controller.signal.aborted)setMessage("Could not load the weekly collection.");});
    return ()=>controller.abort();
  },[]);
  async function publish(event){
    event.preventDefault();
    const form=event.currentTarget;
    const payload=new FormData();
    files.forEach(file=>payload.append("designs",file));
    setBusy(true);setMessage("");
    try {
      const {data}=await API.put(endpoint,payload,{timeout:120000});
      setCollection(data);setFiles([]);form.reset();setMessage("Weekly collection published.");
    } catch(err){setMessage(err.response?.data?.message || "Could not publish this collection.");}
    finally{setBusy(false);}
  }
  return <main className="p-6 space-y-5 text-ink"><h1 className="font-serif text-3xl">Weekly runway</h1>
    <form className="space-y-4" onSubmit={publish}><label className="block">Choose four to six clothing designs to replace the current collection.
      <input className="block mt-3" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>setFiles(Array.from(e.target.files))}/></label>
      {!!files.length && <ol>{files.map((file,i)=><li key={i}>{i+1}. {file.name}</li>)}</ol>}
      <button className="rounded bg-action text-on-action px-4 py-2 disabled:opacity-50" disabled={busy || files.length<4 || files.length>6}>{busy?"Publishing...":"Publish collection"}</button>
    </form><p role="status">{message}</p><h2 className="text-xl">{collection[0]?.is_default ? "Default collection" : "Current collection"}</h2>
    <div className="flex gap-4 flex-wrap">{collection.map(d=><figure key={d.id}><img src={d.preview} alt="" width="140"/><figcaption>{d.title}</figcaption></figure>)}</div></main>;
}
