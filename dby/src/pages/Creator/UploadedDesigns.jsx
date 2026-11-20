import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ToolBookingAction from "../../components/ToolBookingAction";
import API from "../../api/axios";

function imageUrl(path) {
  const origin = new URL(API.defaults.baseURL, window.location.origin).origin;
  return new URL(path, origin).href;
}

function UploadCard({ design, role }) {
  const images = design.images || [];
  const cover = design.preview_url || design.watermarked_preview_url || images[0]?.image_url;
  return (
    <article className="overflow-hidden rounded-md border border-line bg-surface">
      {cover && <img src={imageUrl(cover)} alt={design.title || "Uploaded design"} loading="lazy" className="aspect-video w-full bg-subtle object-contain" />}
      <div className="p-4">
        <p className="text-xs text-muted">{design.is_public ? "Public" : "Private"}</p>
        <h2 className="mt-1 break-words font-semibold">{design.title || "Untitled design"}</h2>
        {role === "creator" && cover && <ToolBookingAction tool="Uploaded design" src={imageUrl(cover)} />}
        {design.description && <p className="mt-2 break-words text-sm">{design.description}</p>}
        {images.length > 1 && <details className="mt-3">
          <summary className="cursor-pointer text-sm">Gallery ({images.length})</summary>
          {images.map((image, index) => <img key={image.id || index} src={imageUrl(image.image_url)} alt={`Gallery image ${index + 1}`} loading="lazy" className="mt-2 w-full rounded" />)}
        </details>}
        {design.is_public && design.is_published && design.slug && <Link to={`/${role}/showcase/${encodeURIComponent(design.slug)}`} className="mt-3 inline-block text-sm underline">View in Showcase</Link>}
      </div>
    </article>
  );
}

const PAGE_SIZE = 12;

export default function UploadedDesigns({ role = "creator" }) {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState(false);
  const designer = role === "designer";
  // The designer inventory endpoint returns the owner's entire inventory in one request.
  const requestPage = designer ? 1 : page;

  useEffect(() => {
    const controller = new AbortController();
    API.get(designer ? "/designer/my-inventory" : "/creators/studio/assets", {
      signal: controller.signal,
      params: designer ? undefined : { source: "upload", visibility: "all", page: requestPage, limit: PAGE_SIZE },
    }).then(({ data }) => {
      if (!Array.isArray(data?.data)) throw new Error("Invalid upload list");
      if (controller.signal.aborted) return;
      if (designer) {
        const uploads = data.data.filter(item => (item.source_type || "upload") === "upload" && !item.editor_project_id);
        setResult({ data: uploads });
      } else {
        setResult(data);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [designer, requestPage, attempt]);

  const designs = designer ? result?.data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : result?.data;
  const hasMore = designer ? page * PAGE_SIZE < result?.data.length : result?.pagination?.has_more;

  function changePage(next) {
    if (!designer) setResult(null);
    setPage(next);
  }

  return (
    <main className="mx-auto max-w-6xl p-4 text-ink">
      <Link to={`/${role}/projects`} className="text-sm text-muted underline underline-offset-4">Back to My Projects</Link>
      <header className="my-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Uploaded designs</h1>
        <Link to={`/${role}/upload`} className="rounded-md border border-line px-4 py-2 text-sm font-semibold">Upload Your Creation</Link>
      </header>
      {failed ? <div role="alert">Your uploads could not be loaded. <button className="underline" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Try again</button></div>
        : !result ? <p role="status">Loading your uploads…</p>
        : designs.length ? <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">{designs.map(design => <UploadCard key={design.id} design={design} role={role} />)}</div>
        : <p className="text-muted">No uploaded designs on this page.</p>}
      {result && (page > 1 || hasMore) && (
        <nav aria-label="Upload pages" className="mt-6 flex items-center gap-4 text-sm">
          <button disabled={page === 1} onClick={() => changePage(page - 1)} className="underline disabled:opacity-40">Previous</button>
          <span>Page {page}</span>
          <button disabled={!hasMore} onClick={() => changePage(page + 1)} className="underline disabled:opacity-40">Next</button>
        </nav>
      )}
    </main>
  );
}
