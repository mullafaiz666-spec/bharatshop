export type AIMessage = { role: "system" | "user" | "assistant" | "tool"; content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>; tool_call_id?: string };

type ProviderOptions = { model?: string; temperature?: number; maxTokens?: number; tools?: any[]; toolChoice?: any; timeoutMs?: number };

const baseUrl = () => (process.env.AI_BASE_URL || process.env.LOCAL_AI_BASE_URL || "").replace(/\/+$/, "");
const apiKey = () => process.env.AI_API_KEY || process.env.LOCAL_AI_API_KEY || "";
export const aiProviderName = () => process.env.AI_PROVIDER || "local-openai-compatible";
export const aiConfigured = () => !!baseUrl();
export const aiModels = () => ({
  text: process.env.AI_TEXT_MODEL || process.env.LOCAL_AI_TEXT_MODEL || "gemma3:270m-it-qat",
  vision: process.env.AI_VISION_MODEL || process.env.LOCAL_AI_VISION_MODEL || "local-evidence-v1",
});

const MODEL_READY_CACHE_TTL_MS = 120_000;
let lastVerifiedModelReadyAt = 0;

function headers() { const key = apiKey(); return { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) }; }

function providerUrl(path: string) {
  const base = baseUrl();
  if (!base) throw new Error("AI_BASE_URL is not configured");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const relative = normalized.startsWith("/v1/") ? normalized.slice(3) : normalized;
  return base.endsWith("/v1") ? `${base}${relative}` : `${base}/v1${relative}`;
}

function minimumTimeoutMs() {
  const configured = Number(process.env.AI_MIN_TIMEOUT_MS || 0);
  if (!Number.isFinite(configured) || configured <= 0) return 0;
  return Math.min(180_000, Math.max(1_000, Math.floor(configured)));
}

async function request(path: string, body: unknown, timeoutMs = 120000) {
  const floor = minimumTimeoutMs();
  const effectiveTimeoutMs = floor ? Math.max(timeoutMs, floor) : timeoutMs;
  const res = await fetch(providerUrl(path), { method: "POST", headers: headers(), body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(effectiveTimeoutMs) });
  const text = await res.text();
  let data: any = null; try { data = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(`AI provider ${res.status}: ${String(data?.error?.message || data?.message || text).slice(0,1200)}`);
  return data;
}

export async function runAI(messages: AIMessage[], options: ProviderOptions = {}) {
  const models = aiModels();
  return request("/chat/completions", {
    model: options.model || models.text,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 1024,
    stream: false,
    ...(options.tools ? { tools: options.tools, tool_choice: options.toolChoice ?? "auto" } : {}),
  }, options.timeoutMs ?? 120000);
}

export async function runText(messages: AIMessage[], options: ProviderOptions = {}) {
  const data = await runAI(messages, options);
  const message = data?.choices?.[0]?.message;
  if (!message) throw new Error("AI provider returned no assistant message");
  return { content: String(message.content || ""), toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [], raw: message };
}

export async function runStructured<T>(system: string, user: string, options: Pick<ProviderOptions, "timeoutMs" | "maxTokens"> = {}): Promise<T> {
  const result = await runText([{ role: "system", content: `${system}\nReturn ONLY valid JSON. No markdown fences.` }, { role: "user", content: user }], { temperature: 0, maxTokens: options.maxTokens ?? 2048, timeoutMs: options.timeoutMs });
  const match = result.content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error("AI provider returned non-JSON output");
  return JSON.parse(match[0]) as T;
}

export async function verifyImagesWithAI() {
  throw new Error("Multimodal Gemma is disabled on the 512 MB free tier; use the local evidence verifier");
}

export async function checkAI(deep = false) {
  const base = baseUrl();
  if (!base) return { configured: false, ready: false, reason: "missing", provider: aiProviderName(), models: aiModels() };
  try {
    const res = await fetch(providerUrl("/models"), { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return { configured: true, ready: false, status: res.status, reason: "provider_rejected", provider: aiProviderName(), models: aiModels() };
    if (!deep) return { configured: true, ready: true, status: res.status, reason: "reachable", provider: aiProviderName(), models: aiModels() };

    const recentlyVerified = lastVerifiedModelReadyAt > 0 && Date.now() - lastVerifiedModelReadyAt < MODEL_READY_CACHE_TTL_MS;
    if (recentlyVerified) {
      return {
        configured: true,
        ready: true,
        modelReady: true,
        status: res.status,
        reason: "model_ready_recently_verified",
        verifiedAt: new Date(lastVerifiedModelReadyAt).toISOString(),
        provider: aiProviderName(),
        models: aiModels(),
      };
    }

    try {
      const probe = await runText([{ role: "user", content: "Reply with exactly OK." }], { maxTokens: 4, timeoutMs: 15_000 });
      const modelReady = probe.content.trim().length > 0;
      if (modelReady) lastVerifiedModelReadyAt = Date.now();
      return { configured: true, ready: modelReady, modelReady, status: res.status, reason: modelReady ? "model_ready" : "model_empty_response", provider: aiProviderName(), models: aiModels() };
    } catch (error) {
      return { configured: true, ready: true, modelReady: false, degraded: true, status: res.status, reason: "provider_ready_model_probe_timed_out", error: error instanceof Error ? error.message : String(error), provider: aiProviderName(), models: aiModels() };
    }
  } catch (e) { return { configured: true, ready: false, reason: "provider_unreachable", error: e instanceof Error ? e.message : String(e), provider: aiProviderName(), models: aiModels() }; }
}
