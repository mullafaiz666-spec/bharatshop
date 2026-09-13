type AgentMemoryRecallInput = {
  agentId: string;
  sessionId: string;
  query: string;
  limit?: number;
};

type AgentMemoryRememberInput = {
  agentId: string;
  sessionId: string;
  content: string;
};

function enabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.BHARATSHOP_AGENTMEMORY_ENABLED || "").trim()) && !!String(process.env.AGENTMEMORY_URL || "").trim();
}

function baseUrl() {
  return String(process.env.AGENTMEMORY_URL || "").trim().replace(/\/$/, "");
}

function headers() {
  const result: Record<string, string> = { "content-type": "application/json" };
  const secret = String(process.env.AGENTMEMORY_SECRET || "").trim();
  if (secret) result.authorization = `Bearer ${secret}`;
  return result;
}

function scrubSecrets(value: string) {
  return String(value || "")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+\/-]{12,}/gi, "$1 [REDACTED]")
    .replace(/\b(api[_-]?key|secret|token|password|authorization)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
}

async function postJson(path: string, body: Record<string, unknown>, timeoutMs = 2500) {
  if (!enabled()) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json().catch(() => ({}));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function resultText(item: unknown) {
  if (typeof item === "string") return item.trim();
  if (!item || typeof item !== "object") return "";
  const obj = item as Record<string, unknown>;
  for (const key of ["content", "text", "summary", "observation", "memory", "value"]) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function extractResults(payload: unknown) {
  if (!payload || typeof payload !== "object") return [] as string[];
  const obj = payload as Record<string, unknown>;
  const candidates = [obj.results, obj.memories, obj.observations, obj.matches, obj.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.map(resultText).filter(Boolean);
    if (candidate && typeof candidate === "object") {
      const nested = candidate as Record<string, unknown>;
      for (const key of ["results", "memories", "observations", "matches"]) {
        if (Array.isArray(nested[key])) return (nested[key] as unknown[]).map(resultText).filter(Boolean);
      }
    }
  }
  return [] as string[];
}

export async function recallAgentMemory(input: AgentMemoryRecallInput) {
  const query = scrubSecrets(String(input.query || "").trim()).slice(0, 1200);
  if (!query || !enabled()) return [] as string[];
  const payload = await postJson("/agentmemory/smart-search", {
    query: `bharatshop agent:${input.agentId} session:${input.sessionId} ${query}`,
    limit: Math.max(1, Math.min(8, Number(input.limit || 5))),
  });
  return extractResults(payload).slice(0, Math.max(1, Math.min(8, Number(input.limit || 5)))).map((text) => scrubSecrets(text).slice(0, 1600));
}

export async function rememberAgentMemory(input: AgentMemoryRememberInput) {
  if (!enabled()) return false;
  const safe = scrubSecrets(String(input.content || "").trim()).slice(0, 7000);
  if (!safe) return false;
  const payload = await postJson("/agentmemory/remember", {
    content: `[bharatshop][agent:${input.agentId}][session:${input.sessionId}] ${safe}`,
    concepts: ["bharatshop", `agent:${input.agentId}`, `session:${input.sessionId}`],
  }, 3500);
  return payload !== null;
}

export function agentMemoryConfigured() {
  return enabled();
}
