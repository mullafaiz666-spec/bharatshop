import { createChatStream, localOnlyResponse, localWebRequestAllowed, type LocalAIMessage } from "@/lib/local-ai/runtime";

export const dynamic = "force-dynamic";

function sanitizeMessages(value: unknown): LocalAIMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { role?: unknown; content?: unknown } => Boolean(item && typeof item === "object"))
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: String(item.content || "").slice(0, 12_000),
    }))
    .filter((item) => item.content.trim())
    .slice(-16);
}

export async function POST(request: Request) {
  if (!localWebRequestAllowed(request)) return localOnlyResponse();

  try {
    const body = (await request.json()) as { messages?: unknown };
    const messages = sanitizeMessages(body.messages);
    if (!messages.length) {
      return Response.json({ ok: false, error: "A chat message is required." }, { status: 400 });
    }

    const stream = await createChatStream(messages);
    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Local AI request failed." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
