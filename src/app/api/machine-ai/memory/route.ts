import { clearWorkingMemory, isLoopbackRequest, localOnlyError, recentMemory } from "@/lib/machine-ai/local-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) return localOnlyError();
  return Response.json({ entries: recentMemory(50) }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!isLoopbackRequest(request)) return localOnlyError();
  if (request.headers.get("x-confirm-clear") !== "clear-working-memory") {
    return Response.json({ error: "Explicit confirmation is required." }, { status: 409, headers: { "cache-control": "no-store" } });
  }
  const result = clearWorkingMemory();
  return Response.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
}
