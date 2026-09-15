import { localOnlyResponse, localWebRequestAllowed, runtimeStatus } from "@/lib/local-ai/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!localWebRequestAllowed(request)) return localOnlyResponse();

  const status = await runtimeStatus();
  return Response.json(status, {
    status: status.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
