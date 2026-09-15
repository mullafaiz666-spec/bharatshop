import "server-only";

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

export type LocalAIMessage = {
  role: "user" | "assistant";
  content: string;
};

type Agent = {
  slug: string;
  name: string;
  description: string;
  division: string;
  content: string;
};

export const LOCAL_AI_MODEL =
  process.env.PERSONAL_AI_MODEL ||
  process.env.AGENCY_MODEL ||
  process.env.AI_TEXT_MODEL ||
  "qwen3.5:4b";

export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
export const LOCAL_AI_CONTEXT = Number(process.env.PERSONAL_AI_CONTEXT || "4096");

const AGENCY_HOME = process.env.AGENCY_HOME || join(homedir(), ".bharatshop-agency");
const CATALOG_DIR = join(AGENCY_HOME, "agency-agents");

function hostName(request: Request) {
  const raw = (request.headers.get("host") || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("[")) return raw.slice(1, raw.indexOf("]"));
  return raw.split(":")[0];
}

export function localWebRequestAllowed(request: Request) {
  const host = hostName(request);
  const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const productionOptIn = /^(1|true|yes)$/i.test(process.env.LOCAL_AI_WEB_ENABLED || "");
  return loopback && (process.env.NODE_ENV !== "production" || productionOptIn);
}

export function localOnlyResponse() {
  return Response.json(
    {
      ok: false,
      error: "BharatShop Local AI web access is restricted to the laptop loopback interface.",
    },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
}

export async function listOllamaModels() {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Ollama status failed with HTTP ${response.status}`);
  const data = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
  return Array.isArray(data.models)
    ? data.models.map((item) => item.name || item.model || "").filter(Boolean)
    : [];
}

function parseFrontmatter(markdown: string) {
  if (!markdown.startsWith("---")) return {} as Record<string, string>;
  const end = markdown.indexOf("\n---", 3);
  if (end < 0) return {} as Record<string, string>;
  const result: Record<string, string> = {};
  for (const line of markdown.slice(3, end).trim().split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    result[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
  return result;
}

export function discoverLocalAgents(): Agent[] {
  const divisionsPath = join(CATALOG_DIR, "divisions.json");
  if (!existsSync(divisionsPath)) return [];

  try {
    const parsed = JSON.parse(readFileSync(divisionsPath, "utf8")) as {
      divisions?: Record<string, unknown>;
    };
    const divisions = Object.keys(parsed.divisions || {});
    const agents: Agent[] = [];

    for (const division of divisions) {
      const directory = join(CATALOG_DIR, division);
      if (!existsSync(directory)) continue;
      for (const file of readdirSync(directory)) {
        if (!file.endsWith(".md")) continue;
        const content = readFileSync(join(directory, file), "utf8");
        const meta = parseFrontmatter(content);
        const slug = basename(file, ".md");
        agents.push({
          slug,
          name: meta.name || slug.replace(/-/g, " "),
          description: meta.description || "",
          division,
          content,
        });
      }
    }

    return agents.sort((a, b) => a.slug.localeCompare(b.slug));
  } catch {
    return [];
  }
}

export async function runtimeStatus() {
  const agents = discoverLocalAgents();
  try {
    const models = await listOllamaModels();
    return {
      ok: true,
      ollamaReady: true,
      endpoint: OLLAMA_BASE_URL,
      model: LOCAL_AI_MODEL,
      modelInstalled: models.includes(LOCAL_AI_MODEL),
      models,
      agents: agents.length,
      inference: "local-loopback",
    };
  } catch (error) {
    return {
      ok: false,
      ollamaReady: false,
      endpoint: OLLAMA_BASE_URL,
      model: LOCAL_AI_MODEL,
      modelInstalled: false,
      models: [] as string[],
      agents: agents.length,
      inference: "local-loopback",
      error: error instanceof Error ? error.message : "Ollama unavailable",
    };
  }
}

function systemPrompt(models: string[]) {
  return `You are the user's private BharatShop laptop AI running locally through Ollama. Your exact active model is ${LOCAL_AI_MODEL}. Ollama endpoint is ${OLLAMA_BASE_URL}. The currently installed Ollama model names, which you must reproduce exactly if referenced, are: ${models.join(", ") || LOCAL_AI_MODEL}. The active local model is ${LOCAL_AI_MODEL}; a model name ending in :cloud is only listed by Ollama and is not active unless explicitly selected. This web chat provides direct local chat and an explicit Agency mode. The broader BharatShop laptop stack has separate approval-gated browser, coding, company and external-provider tools, so never claim those capabilities do not exist. Never claim an external action was completed unless the relevant tool actually ran. Do not request or expose secrets. Local Qwen inference uses loopback; separately invoked external connectors may transmit data. Be practical, concise and accurate.`;
}

export async function ollamaChat(messages: LocalAIMessage[], customSystem?: string) {
  const models = await listOllamaModels();
  if (!models.includes(LOCAL_AI_MODEL)) {
    throw new Error(`Required local model ${LOCAL_AI_MODEL} is not installed.`);
  }

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: LOCAL_AI_MODEL,
      stream: false,
      think: false,
      messages: [
        { role: "system", content: customSystem || systemPrompt(models) },
        ...messages,
      ],
      options: { num_ctx: LOCAL_AI_CONTEXT },
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama chat failed with HTTP ${response.status}: ${text.slice(0, 240)}`);
  }

  const data = (await response.json()) as { message?: { content?: string } };
  return String(data.message?.content || "").trim();
}

export async function createChatStream(messages: LocalAIMessage[]) {
  const models = await listOllamaModels();
  if (!models.includes(LOCAL_AI_MODEL)) {
    throw new Error(`Required local model ${LOCAL_AI_MODEL} is not installed.`);
  }

  const upstream = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: LOCAL_AI_MODEL,
      stream: true,
      think: false,
      messages: [{ role: "system", content: systemPrompt(models) }, ...messages],
      options: { num_ctx: LOCAL_AI_CONTEXT },
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    throw new Error(`Ollama stream failed with HTTP ${upstream.status}: ${text.slice(0, 240)}`);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed) as { message?: { content?: string } };
              const content = event.message?.content || "";
              if (content) controller.enqueue(encoder.encode(content));
            } catch {
              // Ignore incomplete/non-JSON event lines from the local Ollama stream.
            }
          }
        }
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer) as { message?: { content?: string } };
            const content = event.message?.content || "";
            if (content) controller.enqueue(encoder.encode(content));
          } catch {
            // No-op: an incomplete trailing event must not corrupt the chat response.
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
}

function scoreAgent(agent: Agent, task: string) {
  const tokens = [...new Set(task.toLowerCase().match(/[a-z0-9]{4,}/g) || [])];
  const haystack = `${agent.slug} ${agent.name} ${agent.description} ${agent.division}`.toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

export async function runLocalAgency(task: string) {
  const agents = discoverLocalAgents();
  if (!agents.length) {
    throw new Error("Agency catalog is not installed. Run npm.cmd run agency:setup first.");
  }

  let selected = agents
    .map((agent) => ({ agent, score: scoreAgent(agent, task) }))
    .sort((a, b) => b.score - a.score || a.agent.slug.localeCompare(b.agent.slug))
    .filter((item) => item.score > 0)
    .slice(0, 3)
    .map((item) => item.agent);
  if (!selected.length) selected = agents.slice(0, 3);

  const reports: Array<{ name: string; answer: string }> = [];
  for (const agent of selected) {
    const answer = await ollamaChat(
      [{ role: "user", content: task }],
      `${agent.content}\n\nLOCAL MACHINE MODE\nYou are a BharatShop specialist running only through local Ollama model ${LOCAL_AI_MODEL}. Do not claim external actions were performed. Do not request secrets. Production changes, browser actions, publishing, payments and destructive actions are approval-gated.`,
    );
    reports.push({ name: agent.name, answer });
  }

  const answer = await ollamaChat(
    [
      {
        role: "user",
        content: `TASK:\n${task}\n\nREPORTS:\n${reports
          .map((item) => `## ${item.name}\n${item.answer}`)
          .join("\n\n")}`,
      },
    ],
    `You are the BharatShop local Agency Manager running through Ollama model ${LOCAL_AI_MODEL}. Synthesize the specialist reports into one practical answer. Do not invent completed external actions.`,
  );

  return { team: selected.map((agent) => agent.name), answer };
}
