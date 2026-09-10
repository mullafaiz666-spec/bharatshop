import Link from "next/link";
import { deepAgentReadiness } from "@/lib/agents/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type PublicAgent = { id: string; name: string; mission: string; ready: boolean; status: string };

async function loadStatus() {
  try {
    const readiness = await deepAgentReadiness();
    return {
      ok: readiness.summary.allReady === true,
      checkedAt: readiness.checkedAt,
      summary: readiness.summary,
      infrastructure: {
        database: readiness.infrastructure.database.ready,
        ai: readiness.infrastructure.ai.ready,
        search: readiness.infrastructure.search.ready,
        automation: readiness.infrastructure.automation.ready,
      },
      agents: readiness.agents.map((agent) => ({ id: agent.id, name: agent.name, mission: agent.mission, ready: agent.ready, status: agent.status })) as PublicAgent[],
      revision: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT_SHA || process.env.COMMIT_SHA || "unknown",
    };
  } catch {
    return {
      ok: false,
      checkedAt: new Date().toISOString(),
      summary: { total: 13, ready: 0, blocked: ["readiness-probe"], allReady: false },
      infrastructure: { database: false, ai: false, search: false, automation: false },
      agents: [] as PublicAgent[],
      revision: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT_SHA || process.env.COMMIT_SHA || "unknown",
    };
  }
}

function badge(ready: boolean) {
  return ready
    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
    : "border-rose-400/30 bg-rose-400/10 text-rose-300";
}

export default async function AgentStatusPage() {
  const state = await loadStatus();
  const infra = [
    ["PostgreSQL", state.infrastructure.database],
    ["Local AI", state.infrastructure.ai],
    ["Search", state.infrastructure.search],
    ["Automation", state.infrastructure.automation],
  ] as const;

  return (
    <main className="min-h-screen bg-[#060910] text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-2xl sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.22em] text-orange-300">BharatShop AI Company OS</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Live Agent Operations</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">This page runs the production dependency probe and shows whether each operational agent can access the shared PostgreSQL state, required AI/search services and its registered runtime tools.</p>
            </div>
            <span className={`inline-flex shrink-0 items-center rounded-full border px-4 py-2 text-sm font-black ${badge(state.ok)}`}>
              {state.ok ? "ALL OPERATIONAL" : "ATTENTION REQUIRED"}
            </span>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {infra.map(([name, ready]) => (
              <div key={name} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{name}</div>
                <div className={`mt-2 text-lg font-black ${ready ? "text-emerald-300" : "text-rose-300"}`}>{ready ? "READY" : "BLOCKED"}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <span className="rounded-xl bg-slate-900 px-3 py-2 text-slate-300">Agents: <b>{state.summary.ready}/{state.summary.total}</b></span>
            <span className="rounded-xl bg-slate-900 px-3 py-2 text-slate-300">Revision: <b className="font-mono">{state.revision.slice(0, 12)}</b></span>
            <span className="rounded-xl bg-slate-900 px-3 py-2 text-slate-300">Checked: <b>{new Date(state.checkedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</b></span>
          </div>
        </header>

        <section className="mt-6 grid gap-3 md:grid-cols-2">
          {state.agents.length ? state.agents.map((agent) => (
            <article key={agent.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-black">{agent.name}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{agent.mission}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${badge(agent.ready)}`}>{agent.status}</span>
              </div>
            </article>
          )) : (
            <div className="md:col-span-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5 text-rose-200">The live readiness probe could not return the agent matrix. Refresh after the service dependencies recover.</div>
          )}
        </section>

        <footer className="mt-8 flex flex-wrap gap-3">
          <Link href="/dashboard/command-centre" className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-slate-950">Open Command Centre</Link>
          <Link href="/store" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-black">Open Storefront</Link>
          <a href="/api/health/agents" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-black">View JSON Health</a>
        </footer>
      </div>
    </main>
  );
}
