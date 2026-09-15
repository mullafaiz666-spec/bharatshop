import { localOnlyResponse, localWebRequestAllowed, runLocalAgency } from "@/lib/local-ai/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!localWebRequestAllowed(request)) return localOnlyResponse();

  try {
    const body = (await request.json()) as { task?: unknown };
    const task = String(body.task || "").trim().slice(0, 12_000);
    if (!task) {
      return Response.json({ ok: false, error: "An agency task is required." }, { status: 400 });
    }

    const result = await runLocalAgency(task);
    return Response.json(
      { ok: true, ...result },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Local Agency request failed." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
