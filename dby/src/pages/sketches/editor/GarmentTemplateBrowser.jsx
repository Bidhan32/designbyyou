"use strict";

/**
 * DesignByYou — Garment Library Browser (Phase 4.3)
 * Presentation-only UI. Garment templates, paths, artwork and saved IDs
 * remain owned by ClothingTemplates.js / GarmentTemplateRegistry.js.
 *
 * Choosing a card only selects a catalog entry. The existing Fashion Editor
 * placement pipeline is called solely from a deliberate "Place on canvas"
 * action, preserving the current queue + click-canvas behavior.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Box,
  Check,
  Heart,
  Image as ImageIcon,
  Layers3,
  Search,
  X,
} from "lucide-react";
import {
  GARMENT_CATEGORIES,
  filterGarmentTemplates,
} from "../templates/GarmentTemplateRegistry.js";
import {
  createClothingTemplatePreview,
  getClothingTemplateColourRegions,
} from "../templates/ClothingTemplates";

const FAVORITES_KEY = "dby.garment-library.favorites.v1";
const RECENT_KEY = "dby.garment-library.recent.v1";
const MAX_RECENT = 8;

function readIds(key) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const stored = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(stored)
      ? [...new Set(stored.filter((value) => typeof value === "string"))].slice(0, 40)
      : [];
  } catch {
    return [];
  }
}

function saveIds(key, ids) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(ids));
    }
  } catch {
    // Browsing still works when browser storage is blocked.
  }
}

function GarmentTile({ template, preview, selected, favorite, onSelect, onFavorite, expanded = false }) {
  const count = template.colourRegions?.length || getClothingTemplateColourRegions(template).length;
  return (
    <div
      className={`group relative min-w-0 overflow-hidden rounded-xl border bg-slate-900/70 transition-colors ${
        selected
          ? "border-violet-400 bg-violet-500/10 ring-1 ring-violet-400/60"
          : "border-slate-700/90 hover:border-slate-500 hover:bg-slate-800"
      }`}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Select ${template.label}, ${count} editing regions, ${template.has3D ? "2D and 3D" : "2D"}`}
        onClick={() => onSelect(template.id)}
        className="block w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400"
      >
        <div className={`relative overflow-hidden bg-slate-100 ${expanded ? "aspect-[7/5]" : "aspect-[5/4]"}`}>
          {preview ? (
            <img
              src={preview}
              alt={`${template.label} front and back fashion flat`}
              draggable={false}
              loading="lazy"
              decoding="async"
              className="h-full w-full select-none object-contain p-1.5 transition-transform duration-200 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-400">
              <ImageIcon size={26} aria-hidden="true" />
            </div>
          )}
          {selected && (
            <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-violet-600 text-white shadow-md" aria-hidden="true">
              <Check size={15} strokeWidth={3} />
            </span>
          )}
          <span className="absolute bottom-2 left-2 rounded-md bg-slate-950/85 px-1.5 py-1 text-[9px] font-bold tracking-wide text-white">
            {template.has3D ? "2D + 3D" : "2D"}
          </span>
        </div>
        <div className="min-w-0 px-2.5 pb-2.5 pt-2">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-100" title={template.label}>
              {template.label}
            </span>
            {selected && <Check size={13} className="shrink-0 text-violet-300" aria-hidden="true" />}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
            <Layers3 size={11} aria-hidden="true" />
            <span>{count} editable regions</span>
          </div>
        </div>
      </button>
      <button
        type="button"
        aria-label={`${favorite ? "Remove" : "Add"} ${template.label} ${favorite ? "from" : "to"} favorites`}
        aria-pressed={favorite}
        title={favorite ? "Remove favorite" : "Add favorite"}
        onClick={() => onFavorite(template.id)}
        className={`absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full border bg-white/95 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
          favorite ? "border-rose-200 text-rose-600" : "border-slate-200 text-slate-600 hover:text-rose-600"
        }`}
      >
        <Heart size={16} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
      </button>
    </div>
  );
}

const MemoGarmentTile = memo(GarmentTile);

export default function GarmentTemplateBrowser({
  open = false,
  onClose,
  templates = [],
  currentTemplateId = null,
  importing = false,
  canInsert = true,
  onChoose,
}) {
  const [selectedId, setSelectedId] = useState(() => currentTemplateId || "");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [filter, setFilter] = useState("all");
  const [mode, setMode] = useState("all");
  const [busy, setBusy] = useState(false);
  const [favorites, setFavorites] = useState(() => readIds(FAVORITES_KEY));
  const [recent, setRecent] = useState(() => readIds(RECENT_KEY));
  const previouslyFocusedRef = useRef(null);
  const dialogRef = useRef(null);
  const searchRef = useRef(null);

  const catalog = useMemo(() => (Array.isArray(templates) ? templates : []), [templates]);
  const previewById = useMemo(() => {
    const previews = new Map();
    for (const template of catalog) {
      previews.set(template.id, createClothingTemplatePreview(template));
    }
    return previews;
  }, [catalog]);
  const byId = useMemo(() => new Map(catalog.map((t) => [t.id, t])), [catalog]);
  const selected = byId.get(selectedId) || null;
  const has3DCount = catalog.filter((t) => t.has3D).length;
  // When the creator selects an existing garment on the canvas, show that
  // garment in the library without mutating its saved metadata or artwork.
  useEffect(() => {
    if (currentTemplateId && byId.has(currentTemplateId)) setSelectedId(currentTemplateId);
  }, [currentTemplateId, byId]);

  const availableCategories = useMemo(() => {
    const ids = new Set(catalog.map((t) => t.category || "other"));
    return GARMENT_CATEGORIES.filter((cat) => ids.has(cat.id));
  }, [catalog]);

  const visible = useMemo(() => {
    const filtered = filterGarmentTemplates(catalog, { query, category, mode });
    const secondary = filtered.filter((t) =>
      filter === "favorites" ? favorites.includes(t.id) :
      filter === "recent" ? recent.includes(t.id) : true,
    );
    if (filter === "recent") return secondary.sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id));
    return secondary;
  }, [catalog, query, category, mode, filter, favorites, recent]);

  // Prevent a garment hidden by a filter from remaining an accidental
  // placement target in the modal's selection details.
  useEffect(() => {
    if (selectedId && !visible.some((item) => item.id === selectedId)) {
      setSelectedId("");
    }
  }, [selectedId, visible]);

  const toggleFavorite = useCallback((id) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((key) => key !== id) : [...prev, id];
      saveIds(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const requestClose = useCallback(() => {
    if (!busy && typeof onClose === "function") onClose();
  }, [onClose, busy]);

  // The Clothing tool owns opening/closing; body scrolling is locked only
  // while this read-only catalog is visible. Restore focus to the tool button.
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    previouslyFocusedRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    searchRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      const previous = previouslyFocusedRef.current;
      if (previous?.isConnected && typeof previous.focus === "function") {
        previous.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
      if (event.key === "Tab") {
        const candidates = dialogRef.current?.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        );
        if (!candidates?.length) return;
        const first = candidates[0];
        const last = candidates[candidates.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose]);

  const placeSelected = useCallback(async () => {
    if (!selected || !canInsert || importing || busy || typeof onChoose !== "function") return;
    setBusy(true);
    try {
      const success = await onChoose(selected);
      if (success !== false) {
        setRecent((prev) => {
          const next = [selected.id, ...prev.filter((id) => id !== selected.id)].slice(0, MAX_RECENT);
          saveIds(RECENT_KEY, next);
          return next;
        });
        if (typeof onClose === "function") onClose();
      }
    } finally {
      setBusy(false);
    }
  }, [selected, canInsert, importing, busy, onChoose, onClose]);

  const renderControls = (inDialog = false) => (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
        <input
          ref={inDialog ? searchRef : undefined}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search garments, styles..."
          aria-label="Search garment templates"
          className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
        />
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Garment categories">
        {[{ id: "all", label: "All" }, ...availableCategories].map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={category === item.id}
            onClick={() => setCategory(item.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
              category === item.id
                ? "border-violet-400 bg-violet-500/20 text-violet-100"
                : "border-slate-700 bg-slate-900 text-slate-400 hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Garment collections">
          {[
            ["all", "Browse"],
            ["favorites", "Favorites"],
            ["recent", "Recent"],
          ].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
              className={`rounded-lg px-2 py-1.5 text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${filter === value ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value)}
          aria-label="Filter 2D and 3D templates"
          className="max-w-[104px] rounded-lg border border-slate-700 bg-slate-900 px-1.5 py-1.5 text-[10px] text-slate-200 focus:border-violet-400 focus:outline-none"
        >
          <option value="all">All modes</option>
          <option value="3d">3D ready</option>
          <option value="2d">Front + Back</option>
        </select>
      </div>
    </div>
  );

  const renderGrid = (inDialog = false) => (
    <>
      <div className="mb-2 flex items-center justify-between text-[10px] text-slate-500">
        <span role="status" aria-live="polite">{visible.length} of {catalog.length} garments</span>
        <span>{has3DCount} with 3D</span>
      </div>
      {visible.length ? (
        <div className={`grid gap-2.5 ${inDialog ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4" : "grid-cols-2"}`}>
          {visible.map((template) => (
            <MemoGarmentTile
              key={template.id}
              template={template}
              preview={previewById.get(template.id)}
              selected={selected?.id === template.id}
              favorite={favorites.includes(template.id)}
              onSelect={setSelectedId}
              onFavorite={toggleFavorite}
              expanded={inDialog}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-8 text-center">
          <Search size={22} className="mx-auto text-slate-600" aria-hidden="true" />
          <p className="mt-2 text-xs font-semibold text-slate-300">No garments found</p>
          <p className="mt-1 text-[10px] text-slate-500">Change your search or filters.</p>
          <button type="button" onClick={() => { setQuery(""); setCategory("all"); setFilter("all"); setMode("all"); }}
            className="mt-3 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">Clear filters</button>
        </div>
      )}
    </>
  );

  const renderSelected = (inDialog = false) => (
    <div className="rounded-xl border border-violet-500/30 bg-gradient-to-b from-violet-500/10 to-slate-900/90 p-3">
      {selected ? (
        <>
          <div className="flex items-start gap-2.5">
            <div className="flex h-[80px] w-[100px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1.5">
              {previewById.get(selected.id) ? (
                <img src={previewById.get(selected.id)} alt={`${selected.label} selected fashion flat`} className="h-full w-full object-contain" draggable={false} />
              ) : <ImageIcon size={24} className="text-slate-400" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-wider text-violet-300">Selected template</p>
              <p className="mt-0.5 text-sm font-bold leading-5 text-white">{selected.label}</p>
              <p className="mt-1 text-[10px] text-slate-400">{getClothingTemplateColourRegions(selected).length} editable regions · Front + Back</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-200">2D flat</span>
                {selected.has3D && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-200"><Box size={10} className="mr-0.5 inline" />3D model</span>}
              </div>
            </div>
          </div>
          {inDialog && selected.description && (
            <p className="mt-2.5 text-xs leading-relaxed text-slate-400">{selected.description}</p>
          )}
          <button
            type="button"
            disabled={!canInsert || importing || busy}
            onClick={() => void placeSelected()}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-violet-500 px-3 text-xs font-bold text-white transition hover:bg-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing || busy ? "Preparing template..." : "Place on canvas"}
            {!importing && !busy && <ArrowRight size={15} aria-hidden="true" />}
          </button>
          {!canInsert && (
            <p className="mt-2 text-center text-[10px] text-amber-300">Unlock and show the active layer to place a garment.</p>
          )}
          <p className="mt-2 text-center text-[10px] leading-4 text-slate-500">
            After preparing, click once on the canvas to place the editable garment board.
          </p>
        </>
      ) : <p className="text-xs text-slate-400">No garment templates available.</p>}
    </div>
  );

  if (!open || typeof document === "undefined") return null;

  return createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/85 p-2 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="DesignByYou garment catalog"
            className="flex h-[min(94dvh,930px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-white shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300">DesignByYou Studio</p>
                <h2 className="text-lg font-bold">Explore garments</h2>
              </div>
              <button type="button" onClick={requestClose} aria-label="Close garment catalog"
                className="grid h-10 w-10 place-items-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-violet-400">
                <X size={19} />
              </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-1">
              <div className="min-h-0 overflow-y-auto p-3 sm:p-5">
                {renderControls(true)}
                <div className="mt-4">{renderGrid(true)}</div>
              </div>
              <aside className="max-h-[250px] overflow-y-auto border-t border-slate-800 p-3 lg:max-h-none lg:border-l lg:border-t-0 lg:p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Your selection</p>
                {renderSelected(true)}
                <div className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-500">
                  <ImageIcon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <p>Browse by garment category and select a reference. This does not replace or delete designs already on your canvas.</p>
                </div>
              </aside>
            </div>
          </div>
        </div>,
    document.body,
  );
}
