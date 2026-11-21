import { Component, Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Bounds, OrbitControls, useGLTF } from "@react-three/drei";
import { Link } from "react-router-dom";
import { Box, ImagePlus, ArrowLeft } from "lucide-react";
import "./CreatorUploadStudio.css";
import API from "../../api/axios";
import CreatorCreditBalance from "../../components/CreatorCreditBalance";
import ToolBookingAction from "../../components/ToolBookingAction";
import { useToolHandoff } from "../../components/toolHandoff";

const endpoint = "/creator-tools/image-to-3d/jobs";
const active = job => job && ["submitting", "processing", "saving"].includes(job.status);

class ViewerBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p className="p-4">The 3D preview could not open in this browser.</p> : this.props.children; }
}

function Model({ url, captureRef }) {
  const { scene: model } = useGLTF(url);
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    captureRef.current = () => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL("image/png");
    };
    return () => { captureRef.current = null; };
  }, [gl, scene, camera, captureRef]);
  return <primitive object={model} />;
}

function ModelStage({modelUrl,captureRef}) {
  return (
    <ViewerBoundary>
      <div className="model-canvas">
        <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [1, 0.7, 2.4] }} fallback={<p>3D preview requires WebGL.</p>}>
          <ambientLight intensity={1.8} /><directionalLight position={[3,5,4]} intensity={2.5} />
          <OrbitControls makeDefault />
          <Suspense fallback={null}><Bounds fit clip observe margin={1.25}><Model url={modelUrl} captureRef={captureRef} /></Bounds></Suspense>
        </Canvas>
      </div>
    </ViewerBoundary>
  );
}

function ModelResult({ job }) {
  const captureRef = useRef(null);
  const [image, setImage] = useState("");
  const [notice, setNotice] = useState("");
  const [localUrl, setLocalUrl] = useState("");
  const [retry, setRetry] = useState(0);
  const [fileError, setFileError] = useState(false);
  useEffect(() => {
    if (!job.file_path) return;
    const controller = new AbortController();
    let objectUrl;
    API.get(job.file_path, { responseType: "blob", signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(data);
      setLocalUrl(objectUrl);
    }).catch(() => { if (!controller.signal.aborted) setFileError(true); });
    return () => {
      controller.abort();
      if (objectUrl) { useGLTF.clear(objectUrl); URL.revokeObjectURL(objectUrl); }
    };
  }, [job.file_path, retry]);
  const modelUrl = localUrl || job.model_url;
  if (!modelUrl) return <p role="status">{fileError ? <>Could not load your saved model. <button className="underline" onClick={() => { setFileError(false); setRetry(n => n + 1); }}>Retry download</button></> : "Opening your saved model…"}</p>;
  return <section className="space-y-3">

    <ModelStage modelUrl={modelUrl} captureRef={captureRef}/>
    <p className="text-sm text-muted">Drag to rotate. Pinch or scroll to zoom.</p>
    <div className="flex flex-wrap gap-4">
      <button className="underline" onClick={() => {
        try {
          if (!captureRef.current) throw new Error();
          setImage(captureRef.current()); setNotice("");
        } catch { setNotice("Wait for the model to load before capturing a view."); }
      }}>Use this angle as an image</button>
      <a className="underline" href={localUrl || job.download_url} download="designbyyou-model.glb">Download GLB</a>
    </div>
    {notice && <p role="status">{notice}</p>}
    {image && <><img src={image} className="max-h-40" alt="Selected angle" /><ToolBookingAction tool="Image to 3D" src={image} /></>}
  </section>;
}

export default function CreatorImageTo3D() {
  const exampleCapture=useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [jobs, setJobs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const key = useRef(null);
  const sending = useRef(false);
  function choose(candidate) {
    if (!candidate) return;
    if (candidate.size > 8 * 1024 * 1024) { setError("Choose an image under 8 MB."); return; }
    key.current = null; setFile(candidate); setError("");
  }
  useToolHandoff(choose);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    let live = true;
    API.get(endpoint).then(({ data }) => {
      if (live) { setJobs(data); setReady(true); setError(""); }
    }).catch(() => { if (live) setError("Could not load your models."); });
    return () => { live = false; };
  }, [reload]);
  const running = jobs.find(active)?.id;
  useEffect(() => {
    if (!running) return;
    let live = true;
    let timer;
    async function poll() {
      try {
        const { data } = await API.get(endpoint + "/" + running, { timeout: 110000 });
        if (!live) return;
        setJobs(rows => rows.map(row => row.id === running ? data : row));
        setError("");
        if (!active(data)) return;
      } catch { if (live) setError("Model status temporarily unavailable. Retrying…"); }
      if (live) timer = setTimeout(poll, 5000);
    }
    timer = setTimeout(poll, 2000);
    return () => { live = false; clearTimeout(timer); };
  }, [running]);
  async function submit(e) {
    e.preventDefault();
    if (!file || !ready || sending.current || running) return;
    sending.current = true; setBusy(true); setError("");
    key.current ||= crypto.randomUUID();
    const body = new FormData();
    body.append("image", file); body.append("request_key", key.current);
    try {
      const { data } = await API.post(endpoint, body, { timeout: 60000 });
      setJobs(rows => [data, ...rows.filter(row => row.id !== data.id)]);
      setSelectedId(data.id);
      key.current = null;
    } catch (err) {
      setError(err.response?.data?.message || "Could not confirm submission. Refresh model history.");
      if (err.response?.status === 502) key.current = null;
    } finally { sending.current = false; setBusy(false); }
  }
  const selected = jobs.find(job => job.id === selectedId) || jobs[0];
  return <main className="upload-studio model-studio">
    <Link to="/creator/tools" className="studio-back"><ArrowLeft size={16}/> Creator tools</Link>
    <header className="studio-heading"><h1>Image to <em>3D</em></h1>
      <p>Build a rotatable model from one clear photo of a garment or object.</p></header>
    <div className="model-workspace">
      <form onSubmit={submit} className="studio-panel studio-form">
        <div className="studio-panel-head"><h2>Source image</h2><ImagePlus size={19}/></div>
        <label className="studio-picker">{preview ? <img className="source-preview" src={preview} alt="Selected source"/> : <ImagePlus size={28}/>}
          <strong>{preview?"Change image":"Choose an image"}</strong><small>JPG, PNG, WebP or AVIF · up to 8 MB</small>
          <input type="file" aria-label="Source image" disabled={busy} accept=".jpg,.jpeg,.png,.webp,.avif" onChange={e => choose(e.target.files?.[0])}/></label>
        {file && <p className="studio-note">{file.name}</p>}
        <p className="studio-note">Use a clear, unobstructed view. The model estimates surfaces hidden in the photo.</p>
        <CreatorCreditBalance refreshKey={jobs[0]?.status} costLabel="10 credits per model · 4 submissions per 24 hours"/>
        <button disabled={!ready || !file || busy || Boolean(running)} className="studio-submit"><Box size={17}/>{busy?"Submitting…":"Generate 3D model"}</button>
        {error && <p role="alert">{error} <button type="button" className="underline" onClick={()=>setReload(n=>n+1)}>Refresh model history</button></p>}
      </form>
      <section className="studio-panel model-display">
        <div className="studio-panel-head"><h2>{selected?"Model preview":"Example model"}</h2>
          {jobs.length>0 && <select aria-label="Your models" value={selected.id} onChange={e=>setSelectedId(e.target.value)}>
            {jobs.map(job=><option key={job.id} value={job.id}>{new Date(job.created_at).toLocaleString()} · {job.status}</option>)}</select>}</div>
        {selected?.status==="completed" && <ModelResult key={selected.id} job={selected}/>}
        {!selected && ready && <><ModelStage modelUrl="/models/garments/DBY_ButtonUpShirt_11Regions_BETA.glb" captureRef={exampleCapture}/><p className="studio-note">Sample shirt · Drag to rotate. Pinch or scroll to zoom.</p></>}
        {!ready && !error && <p role="status">Loading your models…</p>}
        {active(selected) && <div className="model-state" role="status"><Box size={36}/>Your model is {selected.status}. You can return here to check progress.</div>}
        {selected?.status==="failed" && <p role="status">Model generation failed. The reserved credits were released.</p>}
      </section>
    </div>
  </main>;
}
