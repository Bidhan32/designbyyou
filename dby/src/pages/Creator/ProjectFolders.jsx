import { ChevronRight, Folder } from "lucide-react";
import { Link } from "react-router-dom";

const folders = [
  { path: "editor", title: "Fashion Editor projects", description: "Reopen a cloud-saved design in Fashion Editor." },
  { path: "uploads", title: "Uploaded designs", description: "View public and private designs from Upload Your Creation." },
];

export default function ProjectFolders({ role = "creator" }) {
  const visibleFolders = role === "designer" ? folders.filter(folder => folder.path === "uploads") : folders;
  return (
    <main className="mx-auto max-w-6xl p-4 text-ink">
      <h1 className="mb-6 text-2xl font-semibold">My Projects</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {visibleFolders.map(({ path, title, description }) => (
          <Link key={path} to={path} className="flex items-center gap-4 rounded-md border border-line bg-surface p-5 hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-4">
            <Folder size={28} className="shrink-0 text-muted" aria-hidden="true" />
            <div className="flex-1">
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted">{description}</p>
            </div>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </main>
  );
}
