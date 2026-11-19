import { useEffect, useState } from "react";
import API from "../api/axios";

export default function CreatorCreditBalance({ refreshKey, costLabel }) {
  const [amount, setAmount] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    API.get("/creators/ai/credits", { signal: controller.signal }).then(({ data }) => {
      if (!Number.isInteger(data?.available)) throw new Error("Invalid credit balance");
      if (!controller.signal.aborted) { setFailed(false); setAmount(data.available); }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [attempt, refreshKey]);

  return <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink" role="status">
    <span className="font-semibold">Available AI credits</span>
    <span>{failed ? "Unavailable" : amount?.toLocaleString() ?? "Loading…"}</span>
    {costLabel && <span className="text-muted">{costLabel}</span>}
    {failed && <button type="button" className="underline" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Retry</button>}
  </div>;
}
