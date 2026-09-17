export default String.raw`import { useState } from "react";
import ControlCenterShell, { Panel, Status } from "@/components/control-center/ControlCenterShell";
import { useMcpConnectors } from "@/hooks/useMcpConnectors";

export const route = { path: "/integrations", layout: "owner", access: "authenticated" };
export const nav = { label: "MCP", order: 40 };

function stateTone(state) {
  return state === "VERIFIED" ? "good" : state === "AUTH_REQUIRED" ? "warn" : "neutral";
}

export default function Integrations() {
  const mcp = useMcpConnectors(60000);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);

  async function run(connector, command) {
    const key = connector + ":" + command;
    setBusy(key);
    try {
      const data = await mcp.command(connector, command);
      setResult(data);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy("");
    }
  }

  const verified = mcp.connectors.filter(item => item.state === "VERIFIED").length;

  return (
    <ControlCenterShell eyebrow="Model Context Protocol" title="MCP connectors" subtitle="Live connector discovery from the laptop MCP router. Test auth, inspect tools and keep operational actions visible instead of hiding them behind a showcase card.">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-black tracking-[-.035em] text-white">Connector mesh</h1><p className="mt-1 text-sm text-slate-500">{verified}/{mcp.connectors.length || 4} connectors currently verified</p></div>
          <button onClick={mcp.refresh} disabled={mcp.loading} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-bold text-slate-300 hover:bg-white/[0.05]">{mcp.loading ? "Checking…" : "Verify all"}</button>
        </div>

        {mcp.error ? <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">{mcp.error}</div> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(mcp.connectors.length ? mcp.connectors : [{name:"local",state:"CHECKING"},{name:"github",state:"CHECKING"},{name:"supabase",state:"CHECKING"},{name:"apper",state:"CHECKING"}]).map(item => (
            <div key={item.name} className="rounded-2xl border border-white/[0.07] bg-[#0d1119]/85 p-4 shadow-[0_20px_60px_rgba(0,0,0,.16)]">
              <div className="flex items-center justify-between"><div className="text-sm font-black capitalize text-white">{item.name}</div><Status tone={stateTone(item.state)}>{item.state}</Status></div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-black/20 p-3"><div className="text-xl font-black text-white">{item.tools ?? "—"}</div><div className="mt-1 text-[9px] uppercase tracking-[.12em] text-slate-600">tools</div></div>
                <div className="rounded-xl bg-black/20 p-3"><div className="text-xl font-black text-white">{item.blockedWriteTools ?? 0}</div><div className="mt-1 text-[9px] uppercase tracking-[.12em] text-slate-600">guarded</div></div>
              </div>
              <div className="mt-3 min-h-10 text-xs leading-5 text-slate-600">{item.error || (item.missing?.length ? "Missing: " + item.missing.join(", ") : item.readOnly ? "Discovery defaults read-only; approved action lanes remain separate." : "Operational connector ready.")}</div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => run(item.name, "test")} disabled={Boolean(busy)} className="flex-1 rounded-lg bg-white px-3 py-2 text-[11px] font-black text-black disabled:opacity-40">{busy === item.name + ":test" ? "Testing…" : "Test"}</button>
                <button onClick={() => run(item.name, "tools")} disabled={Boolean(busy)} className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] font-black text-slate-300 disabled:opacity-40">Tools</button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
          <Panel title="Connector output" description="Latest test/tools response from the MCP router.">
            <pre className="min-h-56 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-black/25 p-4 text-xs leading-6 text-slate-400">{result ? JSON.stringify(result, null, 2) : "Run Test or Tools on a connector to inspect live evidence."}</pre>
          </Panel>
          <Panel title="Command shortcuts">
            <div className="space-y-2 text-xs text-slate-500">
              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3"><code className="text-indigo-300">/mcp</code><div className="mt-1">Show all connector states in Chat.</div></div>
              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3"><code className="text-indigo-300">/mcp tools all</code><div className="mt-1">List verified tools.</div></div>
              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3"><code className="text-indigo-300">/mcp test apper</code><div className="mt-1">Re-run one connector probe.</div></div>
              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3"><code className="text-indigo-300">/audit</code><div className="mt-1">Runtime + MCP evidence in one response.</div></div>
            </div>
          </Panel>
        </div>
      </div>
    </ControlCenterShell>
  );
}
`;
