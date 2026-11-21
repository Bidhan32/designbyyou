import { ArrowLeft, ArrowDown, Search } from "lucide-react";
import "./DesignGallery.css";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import API from "../../api/axios";
import ShowcaseDesignCard from "./ShowcaseDesignCard";
import ShowcaseThumbnail from "./ShowcaseThumbnail";
import { buildBookingUrl, getOwnerAvatar, getOwnerName, getDesignerRating, isDesignerOwned } from "./showcaseDesign";

const positions = new Map();

export default function DesignGallery({ audience }) {
  const location = useLocation();
  return <Gallery key={location.key} audience={audience} location={location} />;
}

function Gallery({ audience, location }) {
  const navigate = useNavigate();
  const [query, setQuery] = useSearchParams();
  const search = query.get("q") || "";
  const term = query.get("term") || "";
  const restore = useRef(positions.get(location.key) || positions.get(location.state?.restore));
  const [draft, setDraft] = useState(search);
  const [terms, setTerms] = useState({});
  const [items, setItems] = useState([]);
  const [target, setTarget] = useState(restore.current?.page || 1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const loaded = useRef(0);
  const path = "/" + audience + "/designs";
  useEffect(() => {
    const controller = new AbortController();
    API.get("/creator-showcase/discovery", { signal: controller.signal }).then(r => setTerms(r.data.data)).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        while (loaded.current < target) {
          const page = loaded.current + 1;
          const {data} = await API.get("/creator-showcase/pipeline", { signal: controller.signal, params: {page, limit:24, search, term} });
          if (controller.signal.aborted) return;
          loaded.current = page;
          setItems(prev => [...new Map([...prev, ...data.data].map(item => [item.slug,item])).values()]);
          setMore(Boolean(data.pagination?.hasMore));
          if (!data.pagination?.hasMore) break;
        }
      } catch { if (!controller.signal.aborted) setError("Could not load designs."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load(); return () => controller.abort();
  }, [target, term, search, retry]);
  useEffect(() => {
    if (loading || error || !restore.current) return;
    const frame = requestAnimationFrame(() => { window.scrollTo(0, restore.current.y); restore.current = null; });
    return () => cancelAnimationFrame(frame);
  }, [loading, error]);
  function filter(q,t) {
    const next = new URLSearchParams();
    if (q.trim()) next.set("q",q.trim());
    if (t) next.set("term",t);
    setQuery(next);
  }
  function open(slug) {
    if (positions.size >= 40) positions.delete(positions.keys().next().value);
    positions.set(location.key,{page:loaded.current,y:window.scrollY});
    navigate("/"+audience+"/showcase/"+encodeURIComponent(slug),{state:{gallery:path,query:location.search,restore:location.key}});
    window.scrollTo(0,0);
  }
  const featuredTerms = (terms.trending?.length ? terms.trending : terms.styles || []).filter(t=>t.slug).slice(0,6);
  return <main className="design-gallery">
    <Link className="gallery-back" to={audience==="creator"?"/creator/showcase":"/designer/explore"}><ArrowLeft size={15}/> Back to Discover</Link>
    <header className="gallery-head">
      <h1>Design <em>Gallery</em></h1>
      <form role="search" className="gallery-tools" onSubmit={e=>{e.preventDefault();filter(draft,term);}}>
        <label className="gallery-search"><Search size={17} aria-hidden="true"/><input aria-label="Search designs" type="search" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Title, style or designer"/></label>
        <select aria-label="Filter designs" value={term} onChange={e=>filter(draft,e.target.value)}>
          <option value="">All designs</option>
          {["styles","garments","occasions"].map(group=><optgroup key={group} label={group==="styles"?"Outfit types":group}>{terms[group]?.map(t=><option key={t.id} value={t.slug}>{t.name}</option>)}</optgroup>)}
        </select>
        <button className="gallery-submit">Search</button>
      </form>
    </header>
    {!!featuredTerms.length && <nav className="gallery-filters" aria-label="Popular design filters">
      <button aria-pressed={!term} onClick={()=>filter(draft,"")}>All designs</button>
      {featuredTerms.map(t=><button key={t.slug} aria-pressed={term===t.slug} onClick={()=>filter(draft,t.slug)}>{t.name}</button>)}
    </nav>}
    {error && <p role="alert">{error} <button className="underline" onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}
    <div className="gallery-grid">{items.map(item=><ShowcaseDesignCard key={item.slug} item={item}
      ownerName={getOwnerName(item)} ownerAvatar={getOwnerAvatar(item)} designerOwned={isDesignerOwned(item)} rating={getDesignerRating(item)}
      bookingUrl={audience==="creator"?buildBookingUrl(item):null} onOpen={open}><ShowcaseThumbnail item={item}/></ShowcaseDesignCard>)}</div>
    {loading ? <p role="status" className="gallery-feedback">Loading designs...</p> : !error && (more ? <button className="gallery-more" onClick={()=>setTarget(loaded.current+1)}>Load more designs <ArrowDown size={16}/></button> : !items.length && <div className="gallery-feedback"><p>{term || search?"No designs match these filters.":"No designs have been published yet."}</p>{(term || search) && <button className="underline" onClick={()=>filter("","")}>Clear filters</button>}</div>)}
  </main>;
}
