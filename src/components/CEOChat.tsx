"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Send, X, ExternalLink, ShieldCheck, Check, XCircle, RefreshCw } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };
type Approval = { id:number; title:string; action_type:string; reason:string; risk_level:string; status:string; created_at:string; payload?:unknown };

export default function CEOChat() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [context, setContext] = useState<any>({});
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "I’m your BHARATSHOP AI CEO. Ask me anything about the catalogue, images, sourcing, margins, orders, suppliers, agents or growth. I can research current evidence and prepare actions. Consequential actions go into your approval queue—you remain the final authorizer." },
  ]);

  async function refreshApprovals() {
    const d = await fetch("/api/ceo-approvals", { cache: "no-store" }).then(r => r.json()).catch(() => ({}));
    setApprovals(Array.isArray(d.approvals) ? d.approvals.filter((x:Approval) => x.status === "PENDING") : []);
  }

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      fetch("/api/milestone").then(r => r.json()).catch(() => ({})),
      fetch("/api/orders/purchase-queue").then(r => r.json()).catch(() => ({})),
      fetch("/api/agents/tracking").then(r => r.json()).catch(() => ({})),
      fetch("/api/agents/advertising-status").then(r => r.json()).catch(() => ({})),
    ]).then(([milestone, queue, tracking, ads]) => setContext({ milestone, purchaseQueue: queue, tracking, advertising: ads }));
    queueMicrotask(() => void refreshApprovals());
  }, [open]);

  const storefrontUrl = useMemo(() => typeof window === "undefined" ? "/store" : `${window.location.origin}/store`, []);

  async function ask() {
    const q = question.trim();
    if (!q || busy) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next); setQuestion(""); setBusy(true);
    try {
      const r = await fetch("/api/ceo-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, messages: next, context }) });
      const d = await r.json();
      setMessages(v => [...v, { role: "assistant", content: d.reply || d.error || "AI CEO is unavailable." }]);
      void refreshApprovals();
    } catch {
      setMessages(v => [...v, { role: "assistant", content: "AI CEO is unavailable right now." }]);
    } finally { setBusy(false); }
  }

  async function decide(id:number, action:"approve"|"reject") {
    await fetch("/api/ceo-approvals", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id, action }) });
    void refreshApprovals();
  }

  return <>
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3">
      {open && <div className="w-[min(94vw,460px)] h-[min(78vh,700px)] rounded-2xl border border-orange-500/30 bg-slate-950/95 shadow-2xl backdrop-blur overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-xl">👔</div><div className="flex-1"><div className="font-bold">BHARATSHOP AI CEO</div><div className="text-[11px] text-emerald-400 flex items-center gap-1"><ShieldCheck size={12}/> Tools connected • human approval protected</div></div><button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white"><X size={18}/></button></div>
        {approvals.length > 0 && <div className="border-b border-orange-500/20 bg-orange-500/5 p-3 max-h-48 overflow-y-auto"><div className="flex items-center justify-between mb-2"><div className="text-xs font-bold text-orange-300">{approvals.length} ACTION{approvals.length === 1 ? "" : "S"} AWAITING APPROVAL</div><button onClick={() => void refreshApprovals()} className="text-slate-400"><RefreshCw size={13}/></button></div>{approvals.map(a => <div key={a.id} className="rounded-xl bg-slate-900 border border-slate-800 p-3 mb-2 last:mb-0"><div className="text-sm font-semibold">{a.title}</div><div className="text-[11px] text-slate-400 mt-1">{a.reason}</div><div className="flex items-center justify-between mt-2"><span className="text-[10px] uppercase text-orange-300">{a.risk_level} • {a.action_type}</span><div className="flex gap-1"><button onClick={() => void decide(a.id,"reject")} className="rounded-lg border border-slate-700 px-2 py-1 text-xs"><XCircle size={13}/></button><button onClick={() => void decide(a.id,"approve")} className="rounded-lg bg-emerald-500 text-slate-950 px-2 py-1 text-xs font-bold"><Check size={13}/></button></div></div></div>)}</div>}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">{messages.map((m,i) => <div key={i} className={`rounded-xl p-3 text-sm whitespace-pre-wrap ${m.role === "assistant" ? "bg-slate-900 border border-slate-800 mr-5" : "bg-orange-500 text-slate-950 ml-5"}`}>{m.content}</div>)}{busy && <div className="rounded-xl p-3 text-sm bg-slate-900 border border-slate-800 mr-5">CEO is reasoning and checking available evidence…</div>}</div>
        <div className="p-3 border-t border-slate-800"><div className="flex gap-2"><input value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void ask(); }} placeholder="Ask anything about BharatShop…" className="flex-1 min-w-0 rounded-xl bg-slate-900 border border-slate-700 px-3 py-3 text-sm outline-none focus:border-orange-500"/><button disabled={busy || !question.trim()} onClick={() => void ask()} className="rounded-xl bg-orange-500 text-slate-950 px-4 disabled:opacity-40"><Send size={17}/></button></div><div className="text-[10px] text-slate-500 mt-2">AI can research and prepare actions. Purchases, spending, risky publishing and other irreversible actions require your approval.</div></div>
      </div>}
      <div className="flex gap-2"><a href={storefrontUrl} target="_blank" rel="noreferrer" className="rounded-full bg-slate-800 border border-slate-700 px-4 py-3 text-xs font-bold flex items-center gap-2 shadow-xl"><ExternalLink size={15}/> Open Storefront</a><button onClick={() => setOpen(v => !v)} className="rounded-full bg-orange-500 text-slate-950 px-5 py-3 font-bold text-sm shadow-xl flex items-center gap-2"><MessageCircle size={18}/> {open ? "Close CEO" : "Ask CEO"}{approvals.length > 0 && <span className="rounded-full bg-slate-950 text-orange-300 px-1.5 text-[10px]">{approvals.length}</span>}</button></div>
    </div>
  </>;
}
