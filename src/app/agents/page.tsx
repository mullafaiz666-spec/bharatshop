"use client";

import { useState } from "react";

const agents = [
  { id: "marketing", title: "Marketing Agent", subtitle: "Pomelli-style brand DNA → campaigns → copy → creative briefs" },
  { id: "web-design", title: "Web Design Agent", subtitle: "Stitch-style intent → design system → screens → implementation" },
  { id: "automation", title: "Automation Agent", subtitle: "Opal-style objective → workflow → approvals → execution" },
] as const;

export default function AgentStudio() {
  const [agent, setAgent] = useState<(typeof agents)[number]["id"]>("marketing");
  const [objective, setObjective] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [approve, setApprove] = useState(false);

  async function run() {
    setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent, objective, approveActions: approve }) });
      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (error) { setResult(JSON.stringify({ error: String(error) }, null, 2)); }
    finally { setBusy(false); }
  }

  return <main style={{ maxWidth: 1100, margin: "0 auto", padding: 32, fontFamily: "system-ui" }}>
    <h1 style={{ fontSize: 36, marginBottom: 8 }}>BharatShop Agent Studio</h1>
    <p style={{ opacity: .7, marginBottom: 28 }}>Three purpose-built agents sharing one BharatShop context and tool contract.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
      {agents.map((item) => <button key={item.id} onClick={() => setAgent(item.id)} style={{ textAlign: "left", padding: 18, borderRadius: 14, border: agent === item.id ? "2px solid #111" : "1px solid #ddd", background: "white" }}><strong>{item.title}</strong><div style={{ marginTop: 8, fontSize: 13, opacity: .65 }}>{item.subtitle}</div></button>)}
    </div>
    <textarea value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Tell the agent what you want to accomplish…" rows={6} style={{ width: "100%", padding: 16, borderRadius: 14, border: "1px solid #ddd", fontSize: 16, boxSizing: "border-box" }} />
    {agent === "automation" && <label style={{ display: "block", margin: "14px 0" }}><input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} /> Allow approved mutating actions to execute</label>}
    <button disabled={busy || !objective.trim()} onClick={run} style={{ marginTop: 14, padding: "12px 20px", borderRadius: 10, border: 0, background: "#111", color: "white" }}>{busy ? "Running…" : "Run agent"}</button>
    {result !== null && <pre style={{ marginTop: 24, padding: 18, borderRadius: 14, background: "#f6f6f6", overflow: "auto", whiteSpace: "pre-wrap" }}>{result}</pre>}
  </main>;
}
