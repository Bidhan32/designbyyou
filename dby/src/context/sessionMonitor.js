// Only input events renew a session. Polling, rendering and autosave never do.
export function monitorSession({ api, storage, target = window, documentTarget = document, onDeadline }) {
  const token = storage.getItem("token");
  let stopped = false, busy = false, dirty = false, lastSent = 0;
  const current = () => !stopped && storage.getItem("token") === token;
  async function check() {
    if (!current() || busy) return;
    busy = true;
    const touch = dirty;
    dirty = false;
    try {
      const response = touch
        ? await api.post("/auth/session/activity", {}, { headers: { Authorization: `Bearer ${token}` } })
        : await api.get("/auth/session", { headers: { Authorization: `Bearer ${token}` } });
      if (current()) onDeadline(response.data.session.idle_expires_at);
    } catch {
      // The API interceptor handles confirmed expiry. An outage is not a logout.
      // Do not replay activity later: offline time must not extend a session.
    } finally { busy = false; }
  }
  function activity(event) {
    if (!event.isTrusted || documentTarget.visibilityState === "hidden" || !current()) return;
    dirty = true;
    if (Date.now() - lastSent >= 60000) {
      lastSent = Date.now();
      void check();
    }
  }
  function visible() { if (documentTarget.visibilityState !== "hidden") void check(); }
  const events = ["pointerdown", "keydown", "wheel", "touchstart"];
  events.forEach(name => target.addEventListener(name, activity, { passive: true }));
  documentTarget.addEventListener("visibilitychange", visible);
  target.addEventListener("online", visible);
  const timer = target.setInterval(() => { void check(); }, 30000);
  void check();
  return () => {
    stopped = true;
    target.clearInterval(timer);
    events.forEach(name => target.removeEventListener(name, activity));
    documentTarget.removeEventListener("visibilitychange", visible);
    target.removeEventListener("online", visible);
  };
}
