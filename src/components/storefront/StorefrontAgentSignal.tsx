"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, ShieldCheck, Sparkles } from "lucide-react";

type AgentHealth = {
  allOperational?: boolean;
  summary?: { total?: number; ready?: number };
  suite?: string;
};

export default function StorefrontAgentSignal() {
  const [health, setHealth] = useState<AgentHealth | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/health/agents", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (active) setHealth(body as AgentHealth);
      })
      .catch(() => active && setHealth(null));
    return () => { active = false; };
  }, []);

  const ready = Number(health?.summary?.ready || 0);
  const total = Number(health?.summary?.total || 0);
  const operational = health?.allOperational === true;

  return (
    <aside data-agent-driven-storefront="true" className="border-b border-black/10 bg-[#0d1117] text-white">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-3 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${operational ? "bg-emerald-400 text-slate-950" : "bg-white/10 text-orange-300"}`}>
            {operational ? <Activity size={17} /> : <Sparkles size={17} />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-orange-300">BharatShop Intelligence Desk</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${operational ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-white/15 bg-white/5 text-slate-300"}`}>
                {operational ? "LIVE" : "SAFE MODE"}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-300 sm:text-sm">
              {operational && total > 0
                ? `${ready}/${total} operational AI agents are researching, verifying and improving the catalogue.`
                : "AI-assisted curation is available while payments, supplier purchases and other consequential actions stay approval-gated."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs font-bold text-slate-300">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-emerald-300" /> customer-safe controls</span>
          <Link href="/status/agents" className="inline-flex items-center gap-1 text-white hover:text-orange-300">System status <ArrowUpRight size={13} /></Link>
        </div>
      </div>
    </aside>
  );
}
