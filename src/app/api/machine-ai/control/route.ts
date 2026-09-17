import { execFile } from "node:child_process";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  buildSystemPrompt,
  ollamaChatOnce,
  ollamaModels,
  queueTask,
  selectAgents,
  type MachineRoute,
} from "@/lib/machine-ai/local-runtime";
import {
  authorizeMachineControl,
  machineControlHeaders,
  machineControlOptions,
} from "@/lib/machine-ai/control-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = resolve(process.env.BHARATSHOP_ROOT || process.cwd());
const DEVELOPER = join(PROJECT_ROOT, "scripts", "machine-ai-developer.mjs");
const APPER_ACTION = join(PROJECT_ROOT, "scripts", "machine-ai-mcp-action.mjs");

function cleanTask(value: unknown) {
  const task = String(value || "").trim();
  if (!task) throw new Error("Task text is required.");
  if (task.length > 20_000) throw new Error("Task text is too large.");
  return task;
}

function redact(value: string) {
  return String(value || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|sbp_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})\b/g, "[REDACTED]");
}

async function runNode(script: string, task: string, timeout: number) {
  const { stdout, stderr } = await execFileAsync(process.execPath, [script, task], {
    cwd: PROJECT_ROOT,
    env: process.env,
    timeout,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (!String(stdout || "").trim() && String(stderr || "").trim()) {
    throw new Error(redact(String(stderr).trim()).slice(-2400));
  }
  return redact(String(stdout || "").trim());
}

export async function OPTIONS(request: Request) {
  return machineControlOptions(request);
}

export async function POST(request: Request) {
  const headers = machineControlHeaders(request);
  if (!authorizeMachineControl(request)) {
    return Response.json(
      { error: "Machine AI control is only authorized for localhost and the owned BharatShop Apper Control Center." },
      { status: 403, headers },
    );
  }

  try {
    const body = (await request.json()) as {
      action?: unknown;
      task?: unknown;
      route?: unknown;
    };
    const action = String(body.action || "chat").toLowerCase();
    const task = cleanTask(body.task);

    if (action === "queue") {
      const route = (String(body.route || "agency").toLowerCase() === "chat" ? "chat" : "agency") as MachineRoute;
      return Response.json({ ok: true, action, queued: queueTask(task, route) }, { status: 201, headers });
    }

    if (action === "chat") {
      const models = await ollamaModels();
      const system = buildSystemPrompt(models);
      const answer = await ollamaChatOnce(system, [{ role: "user", content: task }]);
      return Response.json({ ok: true, action, answer }, { headers });
    }

    if (action === "agency") {
      const selectedAgents = selectAgents(task, 3).map(({ slug, name, division }) => ({ slug, name, division }));
      const queued = queueTask(task, "agency");
      return Response.json(
        {
          ok: true,
          action,
          execution: "queued",
          selectedAgents,
          queued,
          message: "Agency task queued for the local 24x7 worker. Follow progress and results in Tasks.",
        },
        { status: 202, headers },
      );
    }

    if (action === "developer") {
      const answer = await runNode(DEVELOPER, task, 30 * 60_000);
      return Response.json({ ok: true, action, answer }, { headers });
    }

    if (action === "apper") {
      const answer = await runNode(APPER_ACTION, task, 20 * 60_000);
      return Response.json({ ok: true, action, answer }, { headers });
    }

    return Response.json(
      { error: "Unsupported control action. Use chat, agency, queue, developer, or apper." },
      { status: 400, headers },
    );
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error));
    return Response.json({ ok: false, error: message }, { status: 500, headers });
  }
}
