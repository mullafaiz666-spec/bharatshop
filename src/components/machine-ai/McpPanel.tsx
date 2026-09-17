"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

type ConnectorState = {
  name: string;
  state: string;
  readOnly?: boolean;
  tools?: number;
  blockedWriteTools?: number;
  missing?: string[];
  error?: string;
};

type ApiPayload = {
  result?: unknown;
  error?: string;
};

const card: CSSProperties = {
  border: "1px solid rgba(148,163,184,.22)",
  borderRadius: 16,
  padding: 18,
  background: "rgba(15,23,42,.72)",
  boxShadow: "0 18px 45px rgba(0,0,0,.16)",
};

function stateColor(state: string) {
  if (state === "VERIFIED") return "#22c55e";
  if (state === "FAILED" || state === "DISABLED") return "#ef4444";
  return "#f59e0b";
}

export default function McpPanel() {
  const [states, setStates] = useState<ConnectorState[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState("");

  const load = useCallback(async (command = "status", connector = "all") => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/machine-ai/mcp?command=${encodeURIComponent(command)}&connector=${encodeURIComponent(connector)}`, { cache: "no-store" });
      const payload = await response.json() as ApiPayload;
      if (!response.ok) throw new Error(payload.error || "MCP status unavailable");
      if (command === "status") setStates(Array.isArray(payload.result) ? payload.result as ConnectorState[] : []);
      setDetail(command === "status" ? "" : JSON.stringify(payload.result, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main style={{ minHeight: "100vh", background: "#020617", color: "#e2e8f0", padding: "32px 20px", fontFamily: "Inter, ui-sans-serif, system-ui" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".12em" }}>BharatShop Machine AI</div>
            <h1 style={{ margin: "6px 0 4px", fontSize: 30 }}>MCP Connectors</h1>
            <div style={{ color: "#94a3b8" }}>Read-only verification dashboard. No production writes are performed here.</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a href="/machine-ai" style={{ color: "#cbd5e1", textDecoration: "none", padding: "10px 14px", border: "1px solid #334155", borderRadius: 10 }}>Back to Machine AI</a>
            <button type="button" onClick={() => void load()} disabled={busy} style={{ padding: "10px 14px", borderRadius: 10, border: 0, cursor: "pointer" }}>{busy ? "Checking…" : "Refresh"}</button>
          </div>
        </div>

        {error ? <div style={{ ...card, borderColor: "rgba(239,68,68,.5)", color: "#fecaca", marginBottom: 18 }}>{error}</div> : null}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
          {["github", "supabase", "apper", "local"].map((name) => {
            const item: ConnectorState = states.find((entry) => entry.name === name) || { name, state: "NOT VERIFIED" };
            return (
              <article key={name} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <strong style={{ fontSize: 18, textTransform: "capitalize" }}>{name === "local" ? "Local Tools" : name}</strong>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: stateColor(item.state), boxShadow: `0 0 16px ${stateColor(item.state)}` }} />
                </div>
                <div style={{ marginTop: 14, fontWeight: 700, color: stateColor(item.state) }}>{item.state}</div>
                <div style={{ marginTop: 8, color: "#94a3b8", fontSize: 14 }}>Mode: {item.readOnly === false ? "write-capable" : "read-only"}</div>
                <div style={{ marginTop: 4, color: "#94a3b8", fontSize: 14 }}>Discovered read-only tools: {typeof item.tools === "number" ? item.tools : "not verified"}</div>
                {typeof item.blockedWriteTools === "number" && item.blockedWriteTools > 0 ? <div style={{ marginTop: 4, color: "#94a3b8", fontSize: 14 }}>Blocked write tools: {item.blockedWriteTools}</div> : null}
                {item.missing?.length ? <div style={{ marginTop: 8, color: "#fbbf24", fontSize: 13 }}>Missing local auth/config: {item.missing.join(", ")}</div> : null}
                {item.error ? <div style={{ marginTop: 8, color: "#fca5a5", fontSize: 13, wordBreak: "break-word" }}>{item.error}</div> : null}
                <button type="button" onClick={() => void load("test", name)} disabled={busy} style={{ marginTop: 16, padding: "8px 11px", borderRadius: 9, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", cursor: "pointer" }}>Run read-only test</button>
              </article>
            );
          })}
        </section>

        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <button type="button" onClick={() => void load("tools", "all")} disabled={busy} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", cursor: "pointer" }}>List verified read-only tools</button>
        </div>

        {detail ? <pre style={{ ...card, marginTop: 18, overflowX: "auto", whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.55 }}>{detail}</pre> : null}

        <p style={{ marginTop: 22, color: "#64748b", fontSize: 13 }}>
          A connector is only shown as VERIFIED after a real live MCP tool-discovery call succeeds. Apper OAuth is completed locally with npm.cmd run mcp:apper:connect; write-capable Apper tools stay blocked from this Machine AI path.
        </p>
      </div>
    </main>
  );
}
