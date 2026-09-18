import { isLoopbackRequest, localOnlyError, publicAgents } from "@/lib/machine-ai/local-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) return localOnlyError();
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const agents = publicAgents(query);
  return Response.json({ count: agents.length, agents }, { headers: { "cache-control": "no-store" } });
}
