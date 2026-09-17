import {
  attachmentContext,
  buildAgencyContext,
  buildSystemPrompt,
  isLoopbackRequest,
  localOnlyError,
  machineRuntimeInfo,
  ollamaModels,
  openOllamaStream,
  remember,
  runtimeStatus,
  type ChatMessage,
  type MachineRoute,
} from "@/lib/machine-ai/local-runtime";
import {
  formatAudit,
  formatMcpStatus,
  formatMcpTools,
  mcpControl,
  mcpTask,
} from "@/lib/machine-ai/mcp-command";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { role?: unknown; content?: unknown } => Boolean(item && typeof item === "object"))
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" as const : "user" as const,
      content: String(item.content || "").slice(0, 60_000),
    }))
    .filter((item) => item.content.trim())
    .slice(-16);
}

function eventLine(payload: Record<string, unknown>) {
  return `${JSON.stringify(payload)}\n`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function transientOllamaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /(ECONNRESET|ECONNREFUSED|socket hang up|fetch failed|UND_ERR_SOCKET)/i.test(message);
}

async function retryTransient<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (!transientOllamaError(error)) throw error;
    await delay(500);
    return work();
  }
}

function textStream(text: string, route: MachineRoute, kind: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(eventLine({ type: "meta", route, model: machineRuntimeInfo.model, local: true, control: kind })));
      controller.enqueue(encoder.encode(eventLine({ type: "delta", content: text })));
      controller.enqueue(encoder.encode(eventLine({ type: "done", content: text })));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

async function deterministicCommand(input: string, route: MachineRoute) {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  if (lower === "/audit") {
    const [runtimeState, mcpState] = await Promise.all([
      runtimeStatus(),
      mcpControl("status", "all"),
    ]);
    return textStream(formatAudit(runtimeState as unknown as Record<string, unknown>, mcpState), route, "audit");
  }

  if (lower === "/mcp" || lower === "/mcp status" || lower === "/mcp connectors") {
    const result = await mcpControl("status", "all");
    return textStream(formatMcpStatus(result), route, "mcp-status");
  }

  const tools = trimmed.match(/^\/mcp\s+tools(?:\s+(all|github|supabase|local))?$/i);
  if (tools) {
    const result = await mcpControl("tools", tools[1] || "all");
    return textStream(formatMcpTools(result), route, "mcp-tools");
  }

  const test = trimmed.match(/^\/mcp\s+test\s+(all|github|supabase|local)$/i);
  if (test) {
    const result = await mcpControl("test", test[1]);
    return textStream(formatMcpStatus(result), route, "mcp-test");
  }

  const task = trimmed.match(/^\/mcp\s+(.+)$/is);
  if (task) {
    const result = await retryTransient(() => mcpTask(task[1].trim()));
    return textStream(result, route, "mcp-task");
  }

  return null;
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) return localOnlyError();

  let body: { messages?: unknown; route?: unknown; attachmentIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messages = cleanMessages(body.messages);
  const lastUser = [...messages].reverse().find((message) => message.role === "user")?.content.trim() || "";
  if (!lastUser) return Response.json({ error: "A user message is required." }, { status: 400 });

  const route = (String(body.route || "chat").toLowerCase() === "agency" ? "agency" : "chat") as MachineRoute;
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.map((id) => String(id)).filter(Boolean).slice(0, 5)
    : [];

  try {
    const commandResponse = await deterministicCommand(lastUser, route);
    if (commandResponse) return commandResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return textStream(`CONTROL COMMAND FAILED\n${message}`, route, "control-error");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        let answer = "";
        try {
          controller.enqueue(encoder.encode(eventLine({
            type: "meta",
            route,
            model: machineRuntimeInfo.model,
            local: true,
          })));

          let installedModels = await ollamaModels();
          if (!installedModels.length) {
            await delay(400);
            installedModels = await ollamaModels();
          }
          if (!installedModels.length) throw new Error("Ollama is not responding on 127.0.0.1:11434. Start the local Machine AI supervisor or Ollama first.");
          if (!installedModels.includes(machineRuntimeInfo.model)) throw new Error(`Required local model ${machineRuntimeInfo.model} is not installed in Ollama.`);

          let upstream: Response;
          if (route === "agency") {
            const agency = await retryTransient(() => buildAgencyContext(lastUser));
            controller.enqueue(encoder.encode(eventLine({ type: "agents", agents: agency.selected })));
            upstream = await retryTransient(() => openOllamaStream(
              agency.synthesisPrompt,
              [{ role: "user", content: "Synthesize the specialist reports into the final answer now." }],
            ));
          } else {
            const systemPrompt = buildSystemPrompt(installedModels, attachmentContext(attachmentIds));
            upstream = await retryTransient(() => openOllamaStream(systemPrompt, messages));
          }

          const reader = upstream.body?.getReader();
          if (!reader) throw new Error("Ollama returned no response stream.");
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const packet = JSON.parse(line) as { message?: { content?: string }; error?: string; done?: boolean };
                if (packet.error) throw new Error(packet.error);
                const delta = String(packet.message?.content || "");
                if (!delta) continue;
                answer += delta;
                controller.enqueue(encoder.encode(eventLine({ type: "delta", content: delta })));
              } catch (error) {
                if (error instanceof SyntaxError) continue;
                throw error;
              }
            }
          }

          if (buffer.trim()) {
            try {
              const packet = JSON.parse(buffer) as { message?: { content?: string } };
              const delta = String(packet.message?.content || "");
              if (delta) {
                answer += delta;
                controller.enqueue(encoder.encode(eventLine({ type: "delta", content: delta })));
              }
            } catch {
              // Ignore a partial terminal NDJSON frame.
            }
          }

          remember("user", lastUser, route);
          if (answer.trim()) remember("assistant", answer, route);
          controller.enqueue(encoder.encode(eventLine({ type: "done", content: answer })));
        } catch (error) {
          const raw = error instanceof Error ? error.message : String(error);
          const message = transientOllamaError(error)
            ? `Ollama connection reset while processing the request. The local runtime may be restarting. Retry once after checking /audit. Details: ${raw}`
            : raw;
          controller.enqueue(encoder.encode(eventLine({ type: "error", error: message })));
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
