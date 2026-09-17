import {
  authorizeMachineControl,
  machineControlHeaders,
  machineControlOptions,
} from "@/lib/machine-ai/control-auth";
import { mcpControl } from "@/lib/machine-ai/mcp-command";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONNECTORS = new Set(["all", "github", "supabase", "apper", "local"]);
const COMMANDS = new Set(["status", "tools", "test"]);

function normalizeConnector(value: unknown) {
  const connector = String(value || "all").toLowerCase();
  return CONNECTORS.has(connector) ? connector : "all";
}

export async function OPTIONS(request: Request) {
  return machineControlOptions(request);
}

export async function GET(request: Request) {
  const headers = machineControlHeaders(request);
  if (!authorizeMachineControl(request)) {
    return Response.json({ error: "Origin is not authorized for MCP status." }, { status: 403, headers });
  }

  try {
    const connectors = await mcpControl("status", "all");
    return Response.json({ ok: true, connectors }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message, connectors: [] }, { status: 500, headers });
  }
}

export async function POST(request: Request) {
  const headers = machineControlHeaders(request);
  if (!authorizeMachineControl(request)) {
    return Response.json({ error: "Origin is not authorized for MCP control." }, { status: 403, headers });
  }

  try {
    const body = await request.json().catch(() => ({})) as { command?: unknown; connector?: unknown };
    const command = String(body.command || "status").toLowerCase();
    if (!COMMANDS.has(command)) {
      return Response.json({ error: "Unsupported MCP command." }, { status: 400, headers });
    }

    const connector = normalizeConnector(body.connector);
    const result = await mcpControl(command as "status" | "tools" | "test", connector);
    return Response.json({ ok: true, command, connector, result }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500, headers });
  }
}
