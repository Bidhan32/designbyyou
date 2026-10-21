/*
 * DesignByYou V3 · Phase 3.3 shared 2D/3D typography controls.
 * Uses an explicit Save so typing or changing fonts never creates dozens of
 * snapshots or redraws textures on every keypress.
 */
import React, { useEffect, useState } from "react";
import {
  DEFAULT_GARMENT_TEXT_STYLE, GARMENT_TEXT_FONTS,
  normalizeGarmentTextStyle, sanitizeGarmentText,
} from "./GarmentTextArtwork";

const FIELD = "w-full min-w-0 rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-xs text-slate-100";
const LABEL = "block space-y-1 text-[10px] text-slate-300";

export function GarmentTextStyleFields({ value = DEFAULT_GARMENT_TEXT_STYLE, onChange, disabled = false }) {
  const style = normalizeGarmentTextStyle(value);
  const change = (key, next) => onChange?.({ ...style, [key]: next });
  return <div className="grid grid-cols-2 gap-2" aria-label="Garment typography settings">
    <label className={LABEL}>Font
      <select className={FIELD} value={style.fontFamily} disabled={disabled} onChange={(event) => change("fontFamily", event.target.value)}>
        {GARMENT_TEXT_FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
      </select>
    </label>
    <label className={LABEL}>Size
      <input className={FIELD} type="number" min="40" max="240" step="2" value={style.fontSize}
        disabled={disabled} onChange={(event) => change("fontSize", Number(event.target.value))}/>
    </label>
    <label className={LABEL}>Weight
      <select className={FIELD} value={style.fontWeight} disabled={disabled} onChange={(event) => change("fontWeight", Number(event.target.value))}>
        {[400, 500, 600, 700, 800, 900].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
      </select>
    </label>
    <label className={LABEL}>Style
      <select className={FIELD} value={style.fontStyle} disabled={disabled} onChange={(event) => change("fontStyle", event.target.value)}>
        <option value="normal">Normal</option><option value="italic">Italic</option>
      </select>
    </label>
    <label className={LABEL}>Alignment
      <select className={FIELD} value={style.align} disabled={disabled} onChange={(event) => change("align", event.target.value)}>
        <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
      </select>
    </label>
    <label className={LABEL}>Letter spacing
      <input className={FIELD} type="number" min="-8" max="24" step="1" value={style.letterSpacing}
        disabled={disabled} onChange={(event) => change("letterSpacing", Number(event.target.value))}/>
    </label>
    <label className={`${LABEL} col-span-2 flex items-center gap-3`}>Text color
      <input aria-label="Garment text color" type="color" value={style.color} disabled={disabled}
        onChange={(event) => change("color", event.target.value)} className="h-9 w-12 rounded border border-slate-600"/>
      <span className="font-mono">{style.color}</span>
    </label>
  </div>;
}

export default function GarmentTextControls({ entry, disabled = false, onSave }) {
  const [text, setText] = useState(() => String(entry?.text || ""));
  const [style, setStyle] = useState(() => normalizeGarmentTextStyle(entry?.textStyle));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Reset the form after changing layers, regions, garments, or completing a save.
  useEffect(() => {
    setText(String(entry?.text || ""));
    setStyle(normalizeGarmentTextStyle(entry?.textStyle));
    setError("");
  }, [entry?.id, entry?.source]);

  const cleaned = sanitizeGarmentText(text);
  const blocked = disabled || saving || !cleaned || typeof onSave !== "function";
  const save = async () => {
    if (blocked) return;
    setSaving(true);
    setError("");
    try {
      const result = await onSave({ text: cleaned, textStyle: normalizeGarmentTextStyle(style) });
      if (result === false) setError("Text could not be saved. Try again.");
    } catch (e) {
      setError(e?.message || "Unable to update the text layer.");
    } finally {
      setSaving(false);
    }
  };
  return <div className="space-y-3 rounded-lg border border-cyan-700/60 bg-cyan-950/20 p-3" aria-label="Edit existing garment text">
    <strong className="block text-xs text-cyan-200">Phase 3.3 · Edit existing text</strong>
    <p className="text-[10px] text-slate-400">Edit this layer without deleting it. Position, scale and rotation stay unchanged; Save creates one Undo step.</p>
    <label className={LABEL}>Text content
      <input className={FIELD} type="text" maxLength={60} value={text}
        disabled={disabled || saving} onChange={(event) => setText(event.target.value)}/>
    </label>
    <GarmentTextStyleFields value={style} onChange={setStyle} disabled={disabled || saving}/>
    {entry?.text && !entry?.textStyle && <p className="text-[10px] text-amber-200">This older text layer has no saved font settings. Saving will regenerate its image using the settings shown above.</p>}
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    <button type="button" className="min-h-10 w-full rounded-lg border border-cyan-600 bg-cyan-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
      disabled={blocked} onClick={() => void save()}>{saving ? "Saving text…" : "Save text changes"}</button>
  </div>;
}
