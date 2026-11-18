import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FolderOpen, Plus, Search } from "lucide-react";
import API from "../../api/axios";

export default function CreatorProjects() {
  const [projects, setProjects] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    API.get("/creators/editor-projects", { signal: controller.signal })
      .then(({ data }) => {
        if (!Array.isArray(data?.data)) throw new Error("Invalid project list");
        if (!controller.signal.aborted) setProjects(data.data);
      })
      .catch(() => { if (!controller.signal.aborted) setError("We couldn't load your saved projects. Please try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  const filtered = projects.filter(project => String(project.title || "Untitled design").toLowerCase().includes(query.trim().toLowerCase()));
  return <main className="mx-auto max-w-6xl p-4 text-ink sm:p-4">
    <Link to="/creator/projects" className="mb-5 inline-block text-sm text-muted underline underline-offset-4">Back to My Projects</Link>
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">Fashion Editor projects</h1><p className="mt-2 text-sm text-muted">Designs saved to your account from Fashion Editor.</p></div>
      <Link to="/creator/fashion-editor" className="inline-flex items-center gap-2 rounded-md bg-action px-4 py-2.5 text-sm font-semibold text-on-action dark:bg-surface dark:text-ink"><Plus size={18} />New design</Link>
    </header>
    <label className="mb-6 flex max-w-md items-center gap-3 rounded-md border border-line bg-surface px-3 dark:bg-subtle"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Search projects" placeholder="Search your projects" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" /></label>
    {loading ? <p role="status">Loading your projects…</p> : error ? <div role="alert"><p>{error}</p><button className="mt-3 underline" onClick={() => { setError(""); setLoading(true); setAttempt(value => value + 1); }}>Try again</button></div> : filtered.length ?
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(project => <Link key={project.id} to={`/creator/fashion-editor/${encodeURIComponent(project.id)}`} className="group rounded-md border border-line bg-surface p-4 transition hover:border-line focus-visible:outline-2 focus-visible:outline-offset-4 dark:bg-subtle">
        <FolderOpen size={28} className="mb-5 text-muted" aria-hidden="true" />
        <h2 className="break-words font-semibold">{project.title || "Untitled design"}</h2>
        <p className="mt-2 text-xs text-muted">Saved {new Date(project.updated_at).toLocaleString()}</p>
        <span className="mt-5 inline-block text-sm font-medium underline underline-offset-4">Open design</span>
      </Link>)}</div> : <div className="rounded-md border border-dashed border-line p-4 text-center"><FolderOpen className="mx-auto mb-4 text-muted" size={32} /><h2 className="font-semibold">{query ? "No matching projects" : "Your designs will appear here"}</h2><p className="mt-2 text-sm text-muted">{query ? "Try another project name." : "Start a design in Fashion Editor. Your changes will save to your account automatically."}</p></div>}
  </main>;
}
