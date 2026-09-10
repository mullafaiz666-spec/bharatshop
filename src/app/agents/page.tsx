"use client";

import { useMemo, useState } from "react";

const agents = [
  { id: "ceo", title: "AI CEO", subtitle: "Coordinates specialists, evidence, economics, risk and approvals" },
  { id: "source-discovery", title: "Source Discovery", subtitle: "Researches supplier and market options using current evidence" },
  { id: "source-verification", title: "Source Verification", subtitle: "Checks sources, economics and missing evidence before decisions" },
  { id: "seller-discovery", title: "Seller Discovery", subtitle: "Finds relevant independent brands, wholesalers and suppliers" },
  { id: "listing", title: "Listing & Creative", subtitle: "Builds verified customer-safe listings and media workflows" },
  { id: "marketing", title: "Marketing", subtitle: "Creates evidence-backed organic and campaign strategy" },
  { id: "advertising", title: "Advertising", subtitle: "Plans acquisition within contribution-margin and approval guardrails" },
  { id: "order-recheck", title: "Order Re-check", subtitle: "Reviews fulfillment readiness, availability and margin risk" },
  { id: "tracking", title: "Tracking", subtitle: "Reasons over order lifecycle and surfaces logistics exceptions" },
  { id: "learning", title: "Learning & Analytics", subtitle: "Turns recorded outcomes into operational recommendations" },
  { id: "automation", title: "Automation", subtitle: "Plans workflows and delegates bounded subtasks to specialists" },
  { id: "web-design", title: "Web Design", subtitle: "Improves mobile storefront UX using real catalog context" },
] as const;

type AgentId = (typeof agents)[number]["id"];
type Msg = { role: "user" | "assistant"; content: string };
type Trace = { step?: number; kind?: string; tool?: string; status?: string; durationMs?: number };

export default function AgentStudio() {
  const [agent, setAgent] = useState<AgentId>("ceo");
  const [objective, setObjective] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [trace, setTrace] = useState<Trace[]>([]);
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => agents.find((x) => x.id === agent) || agents[0], [agent]);

  function selectAgent(next: AgentId) {
    if (next === agent) return;
    setAgent(next);
    setMessages([]);
    setSessionId("");
    setTrace([]);
    setObjective("");
  }

  async function run() {
    const q = objective.trim();
    if (!q || busy) return;
    const nextMessages: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(nextMessages);
    setObjective("");
    setBusy(true);
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, objective: q, messages: nextMessages, sessionId: sessionId || undefined }),
      });
      const data = await response.json();
      if (data.sessionId) setSessionId(String(data.sessionId));
      if (Array.isArray(data.toolExecutions)) setTrace(data.toolExecutions);
      setMessages((current) => [...current, { role: "assistant", content: String(data.reply || data.error || "The agent did not return an answer.") }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", content: `Agent request failed: ${String(error)}` }]);
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto max-w-7xl p-4 sm:p-7 text-slate-100">
    <div className="mb-6">
      <h1 className="text-3xl sm:text-4xl font-black tracking-tight">BharatShop Agent Studio</h1>
      <p className="mt-2 text-sm text-slate-400">All operational agents now share one conversational plan → tool → observe → continue runtime with persistent session memory and audited tool use.</p>
    </div>

    <div className="grid gap-5 lg:grid-cols-[330px_1fr]">
      <aside className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 lg:max-h-[78vh] lg:overflow-y-auto">
        <div className="px-2 pb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Specialist agents</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
          {agents.map((item) => <button
            key={item.id}
            onClick={() => selectAgent(item.id)}
            className={`rounded-xl border p-3 text-left transition ${agent === item.id ? "border-orange-500/70 bg-orange-500/10" : "border-slate-800 bg-slate-900/50 hover:border-slate-700"}`}
          >
            <div className="font-bold">{item.title}</div>
            <div className="mt-1 text-xs leading-5 text-slate-400">{item.subtitle}</div>
          </button>)}
        </div>
      </aside>

      <section className="min-h-[70vh] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70 flex flex-col">
        <header className="border-b border-slate-800 p-4">
          <div className="font-black text-lg">{selected.title}</div>
          <div className="text-xs text-emerald-400 mt-1">Conversational agent • multi-step tools • PostgreSQL memory • human approval protected</div>
        </header>

        <div className="flex-1 min-h-[420px] p-4 space-y-3 overflow-y-auto">
          {messages.length === 0 && <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
            Tell {selected.title} what result you need. It can gather verified context, use its permitted tools, inspect results and continue instead of returning a one-shot template.
          </div>}
          {messages.map((message, index) => <div key={index} className={`max-w-[88%] rounded-2xl p-3 text-sm whitespace-pre-wrap ${message.role === "user" ? "ml-auto bg-orange-500 text-slate-950" : "mr-auto border border-slate-800 bg-slate-900"}`}>{message.content}</div>)}
          {busy && <div className="mr-auto rounded-2xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">{selected.title} is gathering evidence and working through the task…</div>}
        </div>

        {trace.length > 0 && <details className="border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
          <summary className="cursor-pointer font-bold text-slate-300">Verified workflow trace ({trace.filter((x) => x.kind === "tool" || x.kind === "handoff").length} actions)</summary>
          <div className="mt-2 flex flex-wrap gap-2">{trace.filter((x) => x.tool).map((item, index) => <span key={`${item.tool}-${index}`} className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1">{item.tool} • {item.status || "DONE"}{item.durationMs ? ` • ${item.durationMs}ms` : ""}</span>)}</div>
        </details>}

        <div className="border-t border-slate-800 p-4">
          <div className="flex gap-2">
            <textarea
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void run(); } }}
              placeholder={`Message ${selected.title}…`}
              rows={2}
              className="min-w-0 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-orange-500"
            />
            <button disabled={busy || !objective.trim()} onClick={() => void run()} className="rounded-xl bg-orange-500 px-5 font-black text-slate-950 disabled:opacity-40">Send</button>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">Tool receipts are audited. Spending, purchases, refunds/payouts, credential changes and destructive database operations remain approval-gated.</div>
        </div>
      </section>
    </div>
  </main>;
}
