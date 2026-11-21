import { useEffect, useState } from "react";
import API from "../api/axios";
import ToolBookingAction from "./ToolBookingAction";
import CreatorCreditBalance from "./CreatorCreditBalance";

export default function ReferencePrompt({ file, onClear }) {
  const [src, setSrc] = useState("");
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => { setSrc(reader.result); setOutput(""); setError(""); };
    reader.onerror = () => setError("Could not read this image.");
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  async function submit(e) {
    e.preventDefault();
    if (busy || !prompt.trim() || !src) return;
    setBusy(true); setError("");
    try {
      const { data } = await API.post("/ai-fashion/render", { imageSource: src, creatorInstructions: prompt.trim() }, { timeout: 150000 });
      if (!data.data?.image?.url) throw new Error();
      setOutput(data.data.image.url);
    } catch (err) { setError(err.response?.data?.message || "Could not generate the image."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl space-y-4 p-6 text-ink">
    <h1 className="text-3xl">Text to Image</h1>
    <form className="space-y-3" onSubmit={submit}>
      <img src={src || undefined} alt="Reference for your prompt" className="max-h-64 rounded-md" />
      <button type="button" disabled={busy} onClick={onClear} className="underline">Remove reference and use text only</button>
      <label className="block">Describe your changes<textarea className="block w-full rounded-md border border-line bg-surface p-3" required maxLength={1000} value={prompt} onChange={e => setPrompt(e.target.value)} /></label>
      <CreatorCreditBalance refreshKey={output} costLabel="10 credits per new image" />
      <button disabled={busy || !src || !prompt.trim()} className="rounded-md bg-action p-3 text-on-action">{busy ? "Generating…" : "Generate with reference"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {output && <><img src={output} alt="Generated fashion design" className="max-h-96" /><ToolBookingAction tool="Text to Image" src={output} /></>}
  </main>;
}
