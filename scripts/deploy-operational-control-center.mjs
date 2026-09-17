#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BRIDGE = join(ROOT, 'scripts', 'apper-mcp-client.mjs');
const PROJECT_ID = process.env.BHARATSHOP_CONTROL_APP_ID || '8dc5ed7850c64fdd99e8a147b5e2a458';
const MODEL = process.env.PERSONAL_AI_MODEL || 'qwen3.5:4b';
const metadata = { provider: 'ChatGPT', model: MODEL, modelThinkingLevel: 'high' };

async function run(tool, args = {}, timeout = 420_000) {
  const { stdout, stderr } = await execFileAsync(process.execPath, [BRIDGE, 'call', tool, JSON.stringify(args)], {
    cwd: ROOT,
    env: process.env,
    timeout,
    windowsHide: true,
    maxBuffer: 12 * 1024 * 1024,
  });
  if (!String(stdout || '').trim()) throw new Error(String(stderr || `Empty Apper response for ${tool}`).trim());
  const outer = JSON.parse(stdout);
  const text = outer?.content?.find?.(item => item.type === 'text')?.text;
  if (!text) return outer;
  try { return JSON.parse(text); } catch { return text; }
}

const controlHook = String.raw`import { useCallback, useEffect, useState } from "react";

const BASE = "http://127.0.0.1:3001";
const TOKEN_KEY = "bharatshop-control-token";

export function useMachineControl() {
  const [token, setTokenState] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }, [token]);

  const setToken = useCallback(value => {
    setTokenState(String(value || "").trim());
  }, []);

  const run = useCallback(async ({ action, task, route }) => {
    if (!token) throw new Error("Pair this cockpit with the laptop first.");
    setRunning(true);
    setError("");
    try {
      const response = await fetch(BASE + "/api/machine-ai/control", {
        method: "POST",
        mode: "cors",
        cache: "no-store",
        credentials: "omit",
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
          "x-bharatshop-control-token": token,
        },
        body: JSON.stringify({ action, task, route }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Machine AI control request failed.");
      return payload;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setRunning(false);
    }
  }, [token]);

  return { token, setToken, running, error, run };
}
`;

const home = String.raw`import { useState } from "react";
import ControlCenterShell, { Panel, Status } from "@/components/control-center/ControlCenterShell";
import { useLocalMachine } from "@/hooks/useLocalMachine";
import { useMachineControl } from "@/hooks/useMachineControl";

export const route = { path: "/", layout: "owner", access: "authenticated" };
export const nav = { label: "Operate", order: 10 };

const MODES = [
  { value: "chat", label: "Qwen Chat", description: "Ask the local Qwen model directly." },
  { value: "agency", label: "Run Agent Team", description: "Select specialist agents and synthesize their work." },
  { value: "queue", label: "Queue Background Task", description: "Send an agency task to the 24×7 local queue." },
  { value: "developer", label: "Developer / Self-Upgrade", description: "Edit, test, build, commit and push BharatShop source on the development branch." },
  { value: "apper", label: "Apper Builder", description: "Create/edit/build/deploy the private Apper development app." },
];

export default function Home() {
  const runtime = useLocalMachine("/api/machine-ai/status", 4000);
  const tasks = useLocalMachine("/api/machine-ai/tasks", 4000);
  const control = useMachineControl();
  const [mode, setMode] = useState("agency");
  const [task, setTask] = useState("");
  const [output, setOutput] = useState("");
  const [agents, setAgents] = useState([]);

  async function execute() {
    if (!task.trim()) return;
    setOutput("");
    setAgents([]);
    try {
      const result = await control.run({ action: mode, task, route: "agency" });
      if (Array.isArray(result.selectedAgents)) setAgents(result.selectedAgents);
      setOutput(result.answer || (result.queued ? JSON.stringify(result.queued, null, 2) : JSON.stringify(result, null, 2)));
    } catch (err) {
      setOutput(err instanceof Error ? err.message : String(err));
    }
  }

  const machineReady = runtime.data?.ollamaReady && runtime.data?.modelInstalled;

  return (
    <ControlCenterShell
      eyebrow="Operational command center"
      title="BharatShop Machine AI"
      subtitle="This page sends real commands to the paired laptop runtime. Developer mode can modify, test, build, commit and push the development branch."
    >
      <div className="grid gap-4 lg:grid-cols-[1.45fr_.75fr]">
        <Panel title="Command">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">Pairing token</label>
              <input
                type="password"
                value={control.token}
                onChange={event => control.setToken(event.target.value)}
                placeholder="Paste token from your laptop — it stays only in this browser"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
              />
              <p className="mt-2 text-xs leading-5 text-slate-500">
                On the laptop: Get-Content "$env:LOCALAPPDATA\BharatShop\MachineAI\control-token.txt". Do not send this token in chat.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {MODES.map(item => (
                <button
                  key={item.value}
                  onClick={() => setMode(item.value)}
                  className={
                    "rounded-xl border p-3 text-left transition " +
                    (mode === item.value
                      ? "border-indigo-500 bg-indigo-500/10 text-white"
                      : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700")
                  }
                >
                  <div className="text-sm font-semibold">{item.label}</div>
                  <div className="mt-1 text-xs leading-5 opacity-70">{item.description}</div>
                </button>
              ))}
            </div>

            <textarea
              value={task}
              onChange={event => setTask(event.target.value)}
              rows={8}
              placeholder={
                mode === "developer"
                  ? "Example: audit the Machine AI control flow, fix the highest-impact bug, run tests and build, then commit and push the development branch."
                  : mode === "apper"
                  ? "Example: improve the Control Center operations page, build it and deploy the preview."
                  : "Describe the real task to execute..."
              }
              className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm leading-6 text-white outline-none"
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={execute}
                disabled={control.running || !task.trim() || !control.token}
                className="rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {control.running ? "Working…" : mode === "developer" ? "Run Developer" : mode === "apper" ? "Run Builder" : "Execute"}
              </button>

              <Status tone={machineReady ? "good" : "warn"}>
                {machineReady ? "Laptop online · " + runtime.data.model : "Laptop runtime unavailable"}
              </Status>

              <Status tone={control.token ? "good" : "warn"}>
                {control.token ? "Paired token saved" : "Pairing required"}
              </Status>
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Runtime">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4"><span className="text-slate-400">Model</span><strong>{runtime.data?.model || "—"}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-slate-400">Supervisor</span><strong>{runtime.data?.supervisor?.state || "—"}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-slate-400">Specialists</span><strong>{runtime.data?.agents ?? "—"}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-slate-400">Pending</span><strong>{tasks.data?.counts?.pending ?? "—"}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-slate-400">Running</span><strong>{tasks.data?.counts?.running ?? "—"}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-slate-400">Completed</span><strong>{tasks.data?.counts?.completed ?? "—"}</strong></div>
            </div>
          </Panel>

          <Panel title="Autonomy boundary">
            <div className="space-y-2 text-sm text-slate-400">
              <div>✓ Source edit / delete</div>
              <div>✓ Install dependencies</div>
              <div>✓ Tests / typecheck / build</div>
              <div>✓ Commit + non-force dev push</div>
              <div>✓ Apper build + preview deploy</div>
              <div className="pt-2 text-amber-300">Exact approval remains required for production DB mutation, stored-secret deletion, payments and merging to main.</div>
            </div>
          </Panel>
        </div>
      </div>

      {(agents.length > 0 || output) && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[.65fr_1.35fr]">
          <Panel title="Selected agents">
            <div className="space-y-2">
              {agents.length ? agents.map(agent => (
                <div key={agent.slug || agent.name} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className="text-sm font-semibold text-white">{agent.name}</div>
                  <div className="mt-1 text-xs uppercase tracking-wider text-indigo-300">{agent.division}</div>
                </div>
              )) : <div className="text-sm text-slate-500">No specialist-selection event for this mode.</div>}
            </div>
          </Panel>

          <Panel title="Real execution result">
            <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-black/20 p-4 text-sm leading-6 text-slate-300">{output}</pre>
          </Panel>
        </div>
      )}
    </ControlCenterShell>
  );
}
`;

async function main() {
  await run('get_edit_app_instructions', { metadata });
  await run('get_design_directives', { metadata });
  await run('get_project_tree', { projectId: PROJECT_ID, metadata });
  await run('read_files', {
    projectId: PROJECT_ID,
    paths: ['src/pages/Home.jsx', 'src/components/control-center/ControlCenterShell.jsx'],
    metadata,
  });

  const write = await run('write_files', {
    projectId: PROJECT_ID,
    commitMessage: 'Make the BharatShop Control Center operational: add paired POST control hook and real chat, agency, queue, developer/self-upgrade and Apper builder execution controls on the home page.',
    shouldBuild: true,
    files: [
      { path: 'src/hooks/useMachineControl.js', content: controlHook },
      { path: 'src/pages/Home.jsx', content: home },
    ],
    metadata,
  });
  console.log('DEPLOY SUBMISSION');
  console.log(JSON.stringify(write, null, 2));

  let build = await run('get_build_status', { projectId: PROJECT_ID, metadata });
  console.log('BUILD STATUS');
  console.log(JSON.stringify(build, null, 2));
  let status = String(build?.status || build?.buildStatus || build?.state || '').toUpperCase();

  if (status && status !== 'COMPLETED' && !status.includes('FAILED')) {
    build = await run('get_build_status', { projectId: PROJECT_ID, metadata });
    console.log('BUILD STATUS 2');
    console.log(JSON.stringify(build, null, 2));
    status = String(build?.status || build?.buildStatus || build?.state || '').toUpperCase();
  }

  if (status.includes('FAILED')) throw new Error(`Apper build failed: ${JSON.stringify(build)}`);
  if (status !== 'COMPLETED') throw new Error(`Apper build not complete: ${JSON.stringify(build)}`);

  const preview = await run('preview_app', { projectId: PROJECT_ID, metadata });
  console.log('OPERATIONAL CONTROL CENTER READY');
  console.log(JSON.stringify(preview, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
