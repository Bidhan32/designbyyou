import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import API from "../../api/axios";

const control = "h-9 rounded-md border border-line bg-surface px-2 text-sm";
const roles = ["creator", "designer", "admin"];

export default function UserManagement() {
  const [users, setUsers] = useState(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    API.get("/superadmin/users", { signal: controller.signal }).then(({ data }) => {
      if (!Array.isArray(data)) throw new Error("Invalid directory");
      if (!controller.signal.aborted) setUsers(data);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Unable to load the directory.");
    });
    return () => controller.abort();
  }, [revision]);

  async function update(user, field, value, action) {
    if (!window.confirm(`${action} for ${user.full_name} (${user.email})?`)) return;
    setBusy(user.id);
    setMessage("");
    try {
      const response = await API.patch(`/superadmin/update-${field}/${user.id}`, { [field]: value });
      const saved = response.data.data;
      setUsers(rows => rows.map(row => row.id === saved.id ? { ...row, ...saved } : row));
      setMessage(`${user.full_name} updated.`);
    } catch (err) {
      setMessage(err.response?.data?.message || "Unable to save the change.");
    } finally {
      setBusy(null);
    }
  }

  const term = query.trim().toLowerCase();
  const filtered = users?.filter(user => (!role || user.role === role) &&
    [user.email, user.full_name].some(value => value?.toLowerCase().includes(term)));

  return <section className="mx-auto max-w-5xl space-y-3 text-ink">
    <h1 className="text-xl font-semibold">User directory</h1>
    <div className="flex flex-wrap gap-2">
      <input type="search" aria-label="Search users by name or email" placeholder="Search name or email" value={query} onChange={e => setQuery(e.target.value)} className={control + " min-w-0 flex-1"} />
      <select aria-label="Filter by role" value={role} onChange={e => setRole(e.target.value)} className={control}>
        <option value="">All roles</option>{[...roles,"superadmin"].map(r => <option key={r}>{r}</option>)}
      </select>
    </div>
    <p role="status" className="text-sm">{message}</p>
    {error ? <div role="alert">{error} <button className={control} onClick={() => { setError(""); setRevision(n => n+1); }}>Retry</button></div>
      : !users ? <p>Loading accounts…</p>
      : !filtered.length ? <p>No matching accounts.</p>
      : <ul className="divide-y divide-line rounded-md border border-line bg-surface">{filtered.map(user => {
        const suspended = user.status === "suspended";
        return <li key={user.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
          <div className="min-w-0 flex-auto"><p className="font-semibold">{user.full_name}</p><p className="break-all text-muted">{user.email}</p>
            <details className="mt-1 text-muted"><summary className="cursor-pointer">Account details</summary>
              <p>{user.is_email_verified ? "Email verified" : "Email unverified"} · Joined {new Date(user.created_at).toLocaleDateString()}</p>
              <p className="break-all font-mono">{user.id}</p>
            </details>
          </div>
          <span className="font-mono text-xs">{user.status}</span>
          {user.role === "superadmin" ? <span>Superadmin</span> : <div className="flex flex-wrap items-center gap-2">
            <select aria-label={`Role for ${user.email}`} className={control} value={user.role} disabled={busy !== null}
              onChange={e => update(user,"role",e.target.value,`Set role to ${e.target.value}`)}>{roles.map(r => <option key={r}>{r}</option>)}</select>
            <button className={control} disabled={busy !== null} onClick={() => update(user,"status",suspended ? "restore" : "suspended",suspended ? "Restore account" : "Suspend account")}>
              {suspended ? "Restore account" : "Suspend account"}
            </button>
            {user.role === "designer" && user.status === "pending" && <Link className="underline" to="/superadmin/designer-approvals">Review applications</Link>}
          </div>}
        </li>;
      })}</ul>}
  </section>;
}
