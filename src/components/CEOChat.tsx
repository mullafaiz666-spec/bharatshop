"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Send, X, ExternalLink, ShieldCheck } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

export default function CEOChat() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "I’m your BHARATSHOP CEO decision agent. Ask me about orders, sourcing, margins, supplier risk, marketing or whether an action is ready. I will make the AI recommendation before you take the final human action." },
  ]);
  const [context, setContext] = useState<any>({});

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      fetch("/api/milestone").then(r => r.json()).catch(() => ({})),
      fetch("/api/orders/purchase-queue").then(r => r.json()).catch(() => ({})),
      fetch("/api/agents/tracking").then(r => r.json()).catch(() => ({})),
      fetch("/api/agents/advertising-status").then(r => r.json()).catch(() => ({})),
    ]).then(([milestone, queue, tracking, ads]) => setContext({ milestone, purchaseQueue: queue, tracking, advertising: ads }));
  }, [open]);

  const storefrontUrl = useMemo(() => {
    if (typeof window === "undefined") return "/store";
    return `${window.location.origin}/store`;
  }, []);

  async function ask() {
    const q = question.trim();
    if (!q || busy) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next); setQuestion(""); setBusy(true);
    try {
      const r = await fetch("/api/ceo-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, messages: next, context }) });
      const d = await r.json();
      setMessages(v => [...v, { role: "assistant", content: d.reply || d.error || "CEO decision unavailable." }]);
    } catch {
      setMessages(v => [...v, { role: "assistant", content: "CEO decision service is unavailable. Do not make a consequential supplier purchase without a successful re-check." }]);
    } finally { setBusy(false); }
  }

  return <>
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3">
      {open && <div className="w-[min(92vw,420px)] h-[min(72vh,620px)] rounded-2xl border border-orange-500/30 bg-slate-950/95 shadow-2xl backdrop-blur overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-xl">👔</div>
          <div className="flex-1"><div className="font-bold">BHARATSHOP CEO</div><div className="text-[11px] text-emerald-400 flex items-center gap-1"><ShieldCheck size={12}/> Evidence-driven decision layer</div></div>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.map((m,i) => <div key={i} className={`rounded-xl p-3 text-sm whitespace-pre-wrap ${m.role === "assistant" ? "bg-slate-900 border border-slate-800 mr-5" : "bg-orange-500 text-slate-950 ml-5"}`}>{m.content}</div>)}
          {busy && <div className="rounded-xl p-3 text-sm bg-slate-900 border border-slate-800 mr-5">CEO is reviewing the operating evidence…</div>}
        </div>
        <div className="p-3 border-t border-slate-800">
          <div className="flex gap-2"><input value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void ask(); }} placeholder="Ask the CEO what we should do…" className="flex-1 min-w-0 rounded-xl bg-slate-900 border border-slate-700 px-3 py-3 text-sm outline-none focus:border-orange-500"/><button disabled={busy || !question.trim()} onClick={() => void ask()} className="rounded-xl bg-orange-500 text-slate-950 px-4 disabled:opacity-40"><Send size={17}/></button></div>
          <div className="text-[10px] text-slate-500 mt-2">AI recommends; you remain the final authorizer of real supplier purchases and other irreversible actions.</div>
        </div>
      </div>}
      <div className="flex gap-2">
        <a href={storefrontUrl} target="_blank" rel="noreferrer" className="rounded-full bg-slate-800 border border-slate-700 px-4 py-3 text-xs font-bold flex items-center gap-2 shadow-xl"><ExternalLink size={15}/> Open Storefront</a>
        <button onClick={() => setOpen(v => !v)} className="rounded-full bg-orange-500 text-slate-950 px-5 py-3 font-bold text-sm shadow-xl flex items-center gap-2"><MessageCircle size={18}/> {open ? "Close CEO" : "Ask CEO"}</button>
      </div>
    </div>
  </>;
}
