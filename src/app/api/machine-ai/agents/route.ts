import {
  isLoopbackRequest,
  localOnlyError,
  machineAiBrowserHeaders,
  machineAiBrowserOptions,
  publicAgents,
} from "@/lib/machine-ai/local-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  if (!isLoopbackRequest(request)) return localOnlyError();
  return machineAiBrowserOptions(request);
}

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) return localOnlyError();

  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const agents = publicAgents(query);

  return Response.json(
    { count: agents.length, agents },
    { headers: machineAiBrowserHeaders(request) },
  );
}
