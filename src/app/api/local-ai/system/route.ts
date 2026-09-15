import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { discoverLocalAgents, localOnlyResponse, localWebRequestAllowed } from "@/lib/local-ai/runtime";

export const dynamic = "force-dynamic";

const MEMORY_TYPES = ["working", "episodic", "semantic", "personal"] as const;

function countJsonLines(path: string) {
  if (!existsSync(path)) return 0;
  try {
    return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).length;
  } catch {
    return 0;
  }
}

function countJsonFiles(path: string) {
  if (!existsSync(path)) return 0;
  try {
    return readdirSync(path).filter((name) => name.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

function readHeartbeat(path: string) {
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    return {
      state: String(value.state || "unknown"),
      updatedAt: String(value.updatedAt || ""),
      localModel: String(value.localModel || ""),
      ollama: String(value.ollama || ""),
      qwenShim: String(value.qwenShim || ""),
      agents: Number(value.agents || 0),
      pendingTasks: Number(value.pendingTasks || 0),
      completedTasks: Number(value.completedTasks || 0),
      detail: String(value.detail || ""),
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (!localWebRequestAllowed(request)) return localOnlyResponse();

  const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const machineHome = process.env.BHARATSHOP_MACHINE_AI_HOME || join(localAppData, "BharatShop", "MachineAI");
  const memoryHome = join(process.env.PERSONAL_AI_HOME || join(homedir(), ".bharatshop-ai"), "memory");
  const heartbeat = readHeartbeat(join(machineHome, "heartbeat.json"));
  const agents = discoverLocalAgents();
  const divisions = [...new Set(agents.map((agent) => agent.division))].sort();
  const memory = Object.fromEntries(
    MEMORY_TYPES.map((type) => [type, countJsonLines(join(memoryHome, `${type}.jsonl`))]),
  );

  return Response.json(
    {
      ok: true,
      machine: heartbeat
        ? {
            ...heartbeat,
            pendingTasks: heartbeat.pendingTasks || countJsonFiles(join(machineHome, "pending")),
            completedTasks: heartbeat.completedTasks || countJsonFiles(join(machineHome, "results")),
          }
        : {
            state: "UNKNOWN",
            updatedAt: "",
            localModel: "",
            ollama: "unknown",
            qwenShim: "unknown",
            agents: agents.length,
            pendingTasks: countJsonFiles(join(machineHome, "pending")),
            completedTasks: countJsonFiles(join(machineHome, "results")),
            detail: "Machine AI heartbeat has not been written yet.",
          },
      memory,
      agency: {
        agents: agents.length,
        divisions,
      },
      shortcuts: [
        { label: "BharatShop", href: "/" },
        { label: "BharatDrip", href: "/bharatdrip" },
        { label: "Agents", href: "/agents" },
        { label: "Command Centre", href: "/dashboard/command-centre" },
      ],
    },
    { headers: { "cache-control": "no-store" } },
  );
}
