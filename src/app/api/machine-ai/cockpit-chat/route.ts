import { POST as machineChatPost } from "../chat/route";
import {
  authorizeMachineControl,
  machineControlHeaders,
  machineControlOptions,
} from "@/lib/machine-ai/control-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return machineControlOptions(request);
}

export async function POST(request: Request) {
  const headers = machineControlHeaders(request);

  if (!authorizeMachineControl(request)) {
    return Response.json(
      { error: "Origin is not authorized for Machine AI chat." },
      { status: 403, headers },
    );
  }

  try {
    const body = await request.text();
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.delete("origin");
    forwardedHeaders.delete("access-control-request-private-network");

    const forwarded = new Request(request.url, {
      method: "POST",
      headers: forwardedHeaders,
      body,
    });

    const response = await machineChatPost(forwarded);
    const responseHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(headers)) {
      responseHeaders.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500, headers });
  }
}
