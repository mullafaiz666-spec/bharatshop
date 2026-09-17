export default String.raw`import ControlCenterShell, { Status } from "@/components/control-center/ControlCenterShell";
import { useLocalMachine } from "@/hooks/useLocalMachine";

export const route = { path: "/tasks", layout: "owner", access: "authenticated" };
export const nav = { label: "Runs", order: 30 };

export default function Tasks() {
  const live = useLocalMachine("/api/machine-ai/tasks", 3500);
  const counts = live.data?.counts || {};
  const items = live.data?.items || [];

  return (
    <ControlCenterShell eyebrow="Execution timeline" title="Runs" subtitle="Real local queue state and completed outputs from the Machine AI worker.">
      <div className="mx-auto max-w-[1450px] px-4 py-5 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {[["Pending", counts.pending || 0], ["Running", counts.running || 0], ["Completed", counts.completed || 0]].map(item => (
            <div key={item[0]} className="rounded-2xl border border-white/[0.07] bg-[#0d1119]/80 p-4"><div className="text-[10px] font-black uppercase tracking-[.16em] text-slate-600">{item[0]}</div><div className="mt-2 text-3xl font-black tracking-[-.04em] text-white">{live.data ? item[1] : "—"}</div></div>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          {items.length ? items.slice(0, 30).map(item => (
            <article key={item.id || item.file} className="rounded-2xl border border-white/[0.07] bg-[#0d1119]/82 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="text-sm font-bold text-white">{item.task || item.id}</div><div className="mt-1 font-mono text-[10px] text-slate-600">{item.id || item.file}</div></div><Status tone={item.state === "completed" && item.ok !== false ? "good" : item.state === "running" ? "warn" : "neutral"}>{item.state || "unknown"}</Status></div>
              {item.output ? <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-black/25 p-3 text-xs leading-6 text-slate-400">{String(item.output).slice(0, 5000)}</pre> : null}
              {item.error ? <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">{item.error}</div> : null}
            </article>
          )) : <div className="rounded-2xl border border-dashed border-white/[0.08] p-12 text-center text-sm text-slate-600">{live.error ? "Local queue unavailable." : "No runs yet."}</div>}
        </div>
      </div>
    </ControlCenterShell>
  );
}
`;
