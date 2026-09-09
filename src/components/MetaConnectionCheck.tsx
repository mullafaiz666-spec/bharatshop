"use client";
import { useState } from "react";

type Result = { key: string; label: string; status: string; error?: string };
export default function MetaConnectionCheck() {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState("");
  async function verify() {
    setBusy(true); setError(""); setResults([]);
    try {
      const response = await fetch("/api/marketing/connections", { method: "POST", signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(response.status === 401 ? "Please sign in again." : "Connection check failed. Try again.");
      const data = await response.json();
      setResults(data.channels.filter((channel: Result) => channel.key !== "google"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connection check failed."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3" aria-live="polite">
    <button type="button" disabled={busy} onClick={verify} className="rounded-lg bg-blue-600 px-5 py-3 font-semibold disabled:opacity-50">{busy ? "Checking connections…" : "Verify connections"}</button>
    <p className="text-sm text-slate-400">Checks account access only. Confirm event delivery separately in Events Manager.</p>
    {error && <p role="alert" className="text-amber-300">{error}</p>}
    {results.map(result => <p key={result.key}>{result.label}: {result.status.replaceAll("_", " ")}{result.error ? ` — ${result.error}` : ""}</p>)}
  </section>;
}
