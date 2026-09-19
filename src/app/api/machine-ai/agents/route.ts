import { isLoopbackRequest, localOnlyError, publicAgents } from "@/lib/machine-ai/local-runtime";
import { AI_WORKFORCE_POLICY } from "@/lib/agents/employees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) return localOnlyError();
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const agents = publicAgents(query);
  return Response.json({
    count: agents.length,
    employeeCount: agents.length,
    designation: "AI employees",
    workforcePolicy: AI_WORKFORCE_POLICY,
    agents,
  }, { headers: { "cache-control": "no-store" } });
}
