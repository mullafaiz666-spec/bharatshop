import { isLoopbackRequest, localOnlyError } from "@/lib/machine-ai/local-runtime";
import { mcpControl } from "@/lib/machine-ai/mcp-command";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) return localOnlyError();
  const url = new URL(request.url);
  const command = (url.searchParams.get("command") || "status").toLowerCase();
  const connector = (url.searchParams.get("connector") || "all").toLowerCase();
  if (!["status", "tools", "test"].includes(command)) {
    return Response.json({ error: "Unsupported MCP command." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  try {
    const result = await mcpControl(command as "status" | "tools" | "test", connector);
    return Response.json({ command, connector, result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
