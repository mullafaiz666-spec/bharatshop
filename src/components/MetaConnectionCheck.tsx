"use client";
import { useCallback, useEffect, useState } from "react";

type Result = { key: string; label: string; status: string; missing?: string[]; error?: string };
export default function MetaConnectionCheck() {
  const [busy, setBusy] = useState(true);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState("");
  const verify = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/marketing/connections", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(response.status === 401 ? "Please sign in again." : "Connection check failed. Try again.");
      const data = await response.json();
      setResults((Array.isArray(data.channels) ? data.channels : []).filter((channel: Result) => channel.key !== "google"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connection check failed."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void verify(); }, [verify]);
  return <section className="space-y-3" aria-live="polite">
    <button type="button" disabled={busy} onClick={() => void verify()} className="rounded-lg bg-blue-600 px-5 py-3 font-semibold disabled:opacity-50">{busy ? "Checking connections…" : "Re-check connections"}</button>
    <p className="text-sm text-slate-400">This page checks account access automatically. Confirm live event delivery separately in Events Manager.</p>
    {error && <p role="alert" className="text-amber-300">{error}</p>}
    {results.map(result => <div key={result.key} className="rounded-lg border border-slate-700 p-3">
      <p>{result.label}: <strong>{result.status.replaceAll("_", " ")}</strong>{result.error ? ` — ${result.error}` : ""}</p>
      {Array.isArray(result.missing) && result.missing.length > 0 && <p className="mt-1 break-words text-sm text-amber-300">Missing Render settings: {result.missing.join(", ")}</p>}
    </div>)}
  </section>;
}
