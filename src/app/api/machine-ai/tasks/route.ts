import {
  isLoopbackRequest,
  localOnlyError,
  machineAiBrowserHeaders,
  machineAiBrowserOptions,
  queueTask,
  taskSnapshot,
  type MachineRoute,
} from "@/lib/machine-ai/local-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  if (!isLoopbackRequest(request)) return localOnlyError();
  return machineAiBrowserOptions(request);
}

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) return localOnlyError();

  return Response.json(
    taskSnapshot(),
    { headers: machineAiBrowserHeaders(request) },
  );
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) return localOnlyError();

  try {
    const body = (await request.json()) as {
      task?: unknown;
      route?: unknown;
    };

    const task = String(body.task || "").trim();

    const route = (
      String(body.route || "chat").toLowerCase() === "agency"
        ? "agency"
        : "chat"
    ) as MachineRoute;

    const queued = queueTask(task, route);

    return Response.json(
      { ok: true, queued, snapshot: taskSnapshot() },
      {
        status: 201,
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    return Response.json(
      { error: message },
      {
        status: 400,
        headers: { "cache-control": "no-store" },
      },
    );
  }
}
