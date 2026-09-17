import {
  isLoopbackRequest,
  localOnlyError,
  machineAiBrowserHeaders,
  machineAiBrowserOptions,
  runtimeStatus,
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
    await runtimeStatus(),
    { headers: machineAiBrowserHeaders(request) },
  );
}
