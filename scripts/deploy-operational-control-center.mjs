#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import shell from './control-center/shell.mjs';
import mcpHook from './control-center/mcpHook.mjs';
import home from './control-center/home.mjs';
import integrations from './control-center/integrations.mjs';
import tasks from './control-center/tasks.mjs';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BRIDGE = join(ROOT, 'scripts', 'apper-mcp-client.mjs');
const PROJECT_ID = process.env.BHARATSHOP_CONTROL_APP_ID || '8dc5ed7850c64fdd99e8a147b5e2a458';
const MODEL = process.env.PERSONAL_AI_MODEL || 'qwen3.5:4b';
const metadata = { provider: 'ChatGPT', model: MODEL, modelThinkingLevel: 'high' };

async function run(tool, args = {}, timeout = 420_000) {
  const rawArgs = JSON.stringify(args);
  let bridgeArg = rawArgs;
  let tempRoot = '';

  // Windows has a small process command-line limit. Large Apper write_files
  // payloads (the Copilot UI source) must travel through a temporary JSON file
  // rather than argv or execFile fails with ENAMETOOLONG.
  if (rawArgs.length > 6_000) {
    tempRoot = await mkdtemp(join(tmpdir(), 'bharatshop-apper-args-'));
    const argsFile = join(tempRoot, 'args.json');
    await writeFile(argsFile, rawArgs, 'utf8');
    bridgeArg = `@${argsFile}`;
  }

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [BRIDGE, 'call', tool, bridgeArg], {
      cwd: ROOT,
      env: process.env,
      timeout,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (!String(stdout || '').trim()) throw new Error(String(stderr || ('Empty Apper response for ' + tool)).trim());
    const outer = JSON.parse(stdout);
    const text = outer?.content?.find?.(item => item.type === 'text')?.text;
    if (!text) return outer;
    try { return JSON.parse(text); } catch { return text; }
  } finally {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  }
}

const controlHook = String.raw`import { useCallback, useState } from "react";

const BASE = "http://127.0.0.1:3001";

export function useMachineControl() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async ({ action, task, route }) => {
    setRunning(true);
    setError("");
    try {
      const response = await fetch(BASE + "/api/machine-ai/control", {
        method: "POST",
        mode: "cors",
        cache: "no-store",
        credentials: "omit",
        headers: { "content-type": "application/json", accept: "application/json" },
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
  }, []);

  return { running, error, run };
}
`;

const homePage = home
  .replace(
    'route: action === "queue" ? "agency" : "chat"',
    'route: action === "queue" || action === "agency" ? "agency" : "chat"',
  )
  .replace(
    'routeMode === "developer" || routeMode === "apper" || routeMode === "queue"',
    'routeMode === "developer" || routeMode === "apper" || routeMode === "queue" || routeMode === "agency"',
  );

async function main() {
  await run('get_edit_app_instructions', { metadata });
  await run('get_design_directives', { metadata });
  await run('get_project_tree', { projectId: PROJECT_ID, metadata });
  await run('read_files', {
    projectId: PROJECT_ID,
    paths: [
      'src/components/control-center/ControlCenterShell.jsx',
      'src/pages/Home.jsx',
      'src/pages/Integrations.jsx',
      'src/pages/Tasks.jsx',
      'src/hooks/useLocalMachine.js',
      'src/hooks/useMachineControl.js',
    ],
    metadata,
  });

  const write = await run('write_files', {
    projectId: PROJECT_ID,
    commitMessage: 'Upgrade BharatShop Control Center into a real copilot workspace: restore ChatGPT-style persistent streaming chat, add live MCP connector mesh and tool tests, modernize the shell, and surface real run evidence.',
    shouldBuild: true,
    files: [
      { path: 'src/components/control-center/ControlCenterShell.jsx', content: shell },
      { path: 'src/hooks/useMachineControl.js', content: controlHook },
      { path: 'src/hooks/useMcpConnectors.js', content: mcpHook },
      { path: 'src/pages/Home.jsx', content: homePage },
      { path: 'src/pages/Integrations.jsx', content: integrations },
      { path: 'src/pages/Tasks.jsx', content: tasks },
    ],
    metadata,
  });

  console.log('COPILOT DEPLOY SUBMISSION');
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

  if (status.includes('FAILED')) throw new Error('Apper build failed: ' + JSON.stringify(build));
  if (status !== 'COMPLETED') throw new Error('Apper build not complete: ' + JSON.stringify(build));

  const preview = await run('preview_app', { projectId: PROJECT_ID, metadata });
  console.log('BHARATSHOP COPILOT READY');
  console.log(JSON.stringify(preview, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
