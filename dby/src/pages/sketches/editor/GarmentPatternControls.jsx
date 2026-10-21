import React, { useEffect, useState } from "react";
import {
  GARMENT_PATTERN_PRESETS, GARMENT_PATTERN_ALIGNMENT, GARMENT_PATTERN_LAYOUTS,
  normalizeGarmentPatternSettings, useGarmentPatternPreset,
} from "./GarmentPatternStudio";

const field = "w-full min-w-0 rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-100";
const button = "rounded-md border border-slate-600 bg-slate-800 px-2.5 py-2 text-xs text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40";
const sliders = [
  {key: "scale", label: "Repeat size", min: 0.1, max: 3, step: 0.05, unit: "×"},
  {key: "spacingX", label: "Horizontal gap", min: 0, max: 1.5, step: 0.05, unit: "%", factor: 100},
  {key: "spacingY", label: "Vertical gap", min: 0, max: 1.5, step: 0.05, unit: "%", factor: 100},
  {key: "rotation", label: "Rotation", min: -180, max: 180, step: 5, unit: "°"},
  {key: "offsetX", label: "Horizontal shift", min: -200, max: 200, step: 1, unit: ""},
  {key: "offsetY", label: "Vertical shift", min: -200, max: 200, step: 1, unit: ""},
  {key: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05, unit: "%", factor: 100},
];

/** Save only when Apply is pressed: one undoable edit rather than one per slider tick. */
export default function GarmentPatternControls({ entry, disabled = false, onSave,
  onSync = null, syncTargets = 0 }) {
  const [draft, setDraft] = useState(() => normalizeGarmentPatternSettings(entry));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setDraft(normalizeGarmentPatternSettings(entry));
    setMessage("");
  }, [entry?.id, entry?.source, entry?.scale, entry?.spacingX, entry?.spacingY,
      entry?.rotation, entry?.offsetX, entry?.offsetY, entry?.alignment, entry?.layout,
      entry?.fit, entry?.opacity]);

  if (!entry) return null;
  const update = (key, value) => { setDraft((old) => ({ ...old, [key]: value })); setMessage(""); };
  const apply = async () => {
    if (disabled || saving || typeof onSave !== "function") return;
    setSaving(true);
    setMessage("");
    try {
      const result = await onSave(normalizeGarmentPatternSettings(draft));
      setMessage(result === false ? "Unable to save this pattern." : "Pattern settings saved.");
    } catch (error) { setMessage(error?.message || "Unable to save pattern settings."); }
    finally { setSaving(false); }
  };
  const sync = async () => {
    if (disabled || saving || !onSync || syncTargets < 1) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await onSync();
      setMessage(result === false ? "Unable to apply to selected regions." : "Pattern copied to selected regions.");
    } catch (error) { setMessage(error?.message || "Unable to copy fabric pattern."); }
    finally { setSaving(false); }
  };
  return <section className="space-y-3 rounded-lg border border-emerald-800/60 bg-emerald-950/20 p-3" aria-label="Advanced garment pattern studio">
    <div><strong className="text-xs text-emerald-200">Phase 3.4 · Pattern Studio</strong>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Presets change repeat settings, not your uploaded artwork. Preview adjustments using Apply; use Undo to reverse.</p></div>
    <div className="grid grid-cols-2 gap-1.5">
      {GARMENT_PATTERN_PRESETS.map((preset) => <button type="button" key={preset.id}
        disabled={disabled || saving} className={button} onClick={() => setDraft((value) => useGarmentPatternPreset(value, preset.id))}>{preset.label}</button>)}
    </div>
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1 text-[10px] text-slate-300">Alignment
        <select className={field} value={draft.alignment} disabled={disabled || saving}
          onChange={(e) => update("alignment", e.target.value)}>
          {GARMENT_PATTERN_ALIGNMENT.map(({value,label}) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-[10px] text-slate-300">Repeat layout
        <select className={field} value={draft.layout} disabled={disabled || saving}
          onChange={(e) => update("layout", e.target.value)}>
          {GARMENT_PATTERN_LAYOUTS.map(({value,label}) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-[10px] text-slate-300 col-span-2">Motif fit
        <select className={field} value={draft.fit} disabled={disabled || saving}
          onChange={(e) => update("fit", e.target.value)}>
          <option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Stretch</option>
        </select>
      </label>
    </div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {sliders.map(({key,label,min,max,step,unit,factor=1}) => <label key={key} className="block space-y-1 text-[10px] text-slate-300">
        <span>{label}: <span className="font-semibold text-emerald-200">{(draft[key] * factor).toFixed(key === "scale" ? 2 : 0)}{unit}</span></span>
        <input type="range" min={min} max={max} step={step} disabled={disabled || saving}
          value={Math.min(max, Math.max(min, draft[key]))} className="w-full accent-emerald-500"
          onChange={(e) => update(key, Number(e.target.value))}/>
      </label>)}
    </div>
    <button type="button" className={`${button} w-full border-emerald-700 bg-emerald-800/40 font-semibold text-white`}
      disabled={disabled || saving || !onSave} onClick={() => void apply()}>{saving ? "Saving…" : "Apply pattern settings"}</button>
    {onSync && <button type="button" className={`${button} w-full border-cyan-700 bg-cyan-900/40`}
      disabled={disabled || saving || syncTargets === 0} onClick={() => void sync()}>
      Copy saved pattern to {syncTargets} selected region{syncTargets === 1 ? "" : "s"}
    </button>}
    {onSync && <p className="text-[10px] text-slate-500">Save changes first, then copy the current pattern. Existing logos/texts are preserved. Each target gets an independent pattern layer; this is not a live link.</p>}
    {message && <p role="status" className="text-[10px] text-emerald-200">{message}</p>}
  </section>;
}
