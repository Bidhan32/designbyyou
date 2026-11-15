import { useEffect, useRef, useState } from "react";
import API from "../../api/axios";

export default function AdminVerification() {
  const dialog = useRef(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const open = () => {
      if (dialog.current.open) return;
      setCode("");
      setMessage("");
      dialog.current.showModal();
    };
    window.addEventListener("auth:admin-verification", open);
    return () => window.removeEventListener("auth:admin-verification", open);
  }, []);
  async function verify(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await API.post("/superadmin/verify-authenticator", { code });
      setCode("");
      dialog.current.close();
    } catch (error) {
      setMessage(error.response?.data?.message || "Verification failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return <dialog ref={dialog} aria-labelledby="admin-verification-title" className="m-auto w-80 max-w-full rounded-md border border-line bg-surface p-4 text-ink">
    <form onSubmit={verify} className="grid gap-3">
      <h2 id="admin-verification-title" className="font-semibold">Verify this action</h2>
      <p className="text-sm">Enter your authenticator code, then repeat the action to confirm it.</p>
      <label className="grid gap-1 text-sm">Authenticator code
        <input required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code"
          className="h-9 rounded-md border border-line bg-canvas px-2" value={code} onChange={e => setCode(e.target.value)} />
      </label>
      {message && <p role="alert">{message}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" disabled={busy} onClick={() => dialog.current.close()}>Cancel</button>
        <button disabled={busy} className="h-9 rounded-md bg-ink px-3 text-canvas">{busy ? "Verifying…" : "Verify"}</button>
      </div>
    </form>
  </dialog>;
}
