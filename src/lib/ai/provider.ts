export type AIMessage = { role: "system" | "user" | "assistant" | "tool"; content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>; tool_call_id?: string };

type ProviderOptions = { model?: string; temperature?: number; maxTokens?: number; tools?: any[]; toolChoice?: any; timeoutMs?: number };

type GeminiPart = { text?: string; functionCall?: { name?: string; args?: unknown } };

type ProviderProbe = {
  configured: boolean;
  ready: boolean;
  status?: number;
  reason: string;
  error?: string;
  route: "gemini" | "openai-compatible";
};

const baseUrl = () => (process.env.AI_BASE_URL || process.env.LOCAL_AI_BASE_URL || "").replace(/\/+$/, "");
const apiKey = () => process.env.AI_API_KEY || process.env.LOCAL_AI_API_KEY || "";
const geminiApiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "";
const configuredProvider = () => String(process.env.AI_PROVIDER || "").trim().toLowerCase();
const shouldUseGemini = () => configuredProvider() === "gemini" || (!configuredProvider() && !!geminiApiKey());
const localTextModel = () => process.env.AI_TEXT_MODEL || process.env.LOCAL_AI_TEXT_MODEL || "gemma3:270m-it-qat";
const geminiTextModel = () => process.env.GEMINI_MODEL || process.env.AI_TEXT_MODEL || "gemini-3.7-flash";
const hasOpenAICompatibleFallback = () => shouldUseGemini() && !!baseUrl();

export const aiProviderName = () => shouldUseGemini()
  ? (hasOpenAICompatibleFallback() ? "gemini+openai-compatible-fallback" : "gemini")
  : (process.env.AI_PROVIDER || "local-openai-compatible");
export const aiConfigured = () => shouldUseGemini() ? (!!geminiApiKey() || !!baseUrl()) : !!baseUrl();
export const aiModels = () => ({
  text: shouldUseGemini() ? geminiTextModel() : localTextModel(),
  fallbackText: hasOpenAICompatibleFallback() ? localTextModel() : undefined,
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

function effectiveTimeout(timeoutMs: number) {
  const floor = minimumTimeoutMs();
  return floor ? Math.max(timeoutMs, floor) : timeoutMs;
}

async function request(path: string, body: unknown, timeoutMs = 120000) {
  const effectiveTimeoutMs = effectiveTimeout(timeoutMs);
  const res = await fetch(providerUrl(path), { method: "POST", headers: headers(), body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(effectiveTimeoutMs) });
  const text = await res.text();
  let data: any = null; try { data = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(`AI provider ${res.status}: ${String(data?.error?.message || data?.message || text).slice(0,1200)}`);
  return data;
}

function messageText(content: AIMessage["content"]) {
  if (typeof content === "string") return content;
  return content.map((part) => part.type === "text" ? part.text : `[image reference: ${part.image_url.url}]`).join("\n");
}

function geminiTools(tools?: any[]) {
  const declarations = (tools || [])
    .filter((tool) => tool?.type === "function" && tool?.function?.name)
    .map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    }));
  return declarations.length ? [{ functionDeclarations: declarations }] : undefined;
}

function geminiToolConfig(toolChoice: any) {
  if (!toolChoice || toolChoice === "auto") return undefined;
  if (toolChoice === "none") return { functionCallingConfig: { mode: "NONE" } };
  if (toolChoice === "required") return { functionCallingConfig: { mode: "ANY" } };
  const name = toolChoice?.function?.name;
  return name ? { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [name] } } : undefined;
}

async function requestGemini(messages: AIMessage[], options: ProviderOptions = {}) {
  const key = geminiApiKey();
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  const model = options.model || geminiTextModel();
  const systemText = messages.filter((message) => message.role === "system").map((message) => messageText(message.content)).join("\n\n");
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.role === "tool" ? `Tool result${message.tool_call_id ? ` (${message.tool_call_id})` : ""}: ${messageText(message.content)}` : messageText(message.content) }],
    }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: options.maxTokens ?? 1024,
    },
  };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };
  const tools = geminiTools(options.tools);
  if (tools) body.tools = tools;
  const toolConfig = geminiToolConfig(options.toolChoice);
  if (toolConfig) body.toolConfig = toolConfig;

  const effectiveTimeoutMs = effectiveTimeout(options.timeoutMs ?? 120_000);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(effectiveTimeoutMs),
  });
  const text = await res.text();
  let data: any = null; try { data = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(`Gemini provider ${res.status}: ${String(data?.error?.message || data?.message || text).slice(0,1200)}`);

  const parts: GeminiPart[] = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
  const content = parts.map((part) => String(part?.text || "")).filter(Boolean).join("\n");
  const toolCalls = parts
    .filter((part) => part?.functionCall?.name)
    .map((part, index) => ({
      id: `gemini-call-${Date.now()}-${index}`,
      type: "function",
      function: {
        name: String(part.functionCall?.name || ""),
        arguments: JSON.stringify(part.functionCall?.args ?? {}),
      },
    }));

  return {
    id: data?.responseId || `gemini-${Date.now()}`,
    object: "chat.completion",
    model,
    choices: [{ index: 0, finish_reason: toolCalls.length ? "tool_calls" : "stop", message: { role: "assistant", content, tool_calls: toolCalls } }],
    usage: data?.usageMetadata,
    provider_raw: data,
  };
}

async function requestOpenAICompatible(messages: AIMessage[], options: ProviderOptions = {}) {
  return request("/chat/completions", {
    model: options.model || localTextModel(),
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 1024,
    stream: false,
    ...(options.tools ? { tools: options.tools, tool_choice: options.toolChoice ?? "auto" } : {}),
  }, options.timeoutMs ?? 120000);
}

function safeProviderError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 400);
}

export async function runAI(messages: AIMessage[], options: ProviderOptions = {}) {
  if (shouldUseGemini()) {
    try {
      return await requestGemini(messages, options);
    } catch (primaryError) {
      if (!baseUrl()) throw primaryError;
      const fallback = await requestOpenAICompatible(messages, { ...options, model: localTextModel() });
      return {
        ...fallback,
        provider_route: {
          primary: "gemini",
          active: "openai-compatible",
          fallbackUsed: true,
          primaryError: safeProviderError(primaryError),
        },
      };
    }
  }
  return requestOpenAICompatible(messages, options);
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
  throw new Error("Remote multimodal verification is disabled in the default free-stack policy; use the evidence verifier");
}

async function probeGeminiProvider(model: string): Promise<ProviderProbe> {
  const key = geminiApiKey();
  if (!key) return { configured: false, ready: false, reason: "missing_gemini_key", route: "gemini" };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, {
      headers: { "x-goog-api-key": key },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    return { configured: true, ready: res.ok, status: res.status, reason: res.ok ? "reachable" : "provider_rejected", route: "gemini" };
  } catch (error) {
    return { configured: true, ready: false, reason: "provider_unreachable", error: safeProviderError(error), route: "gemini" };
  }
}

async function probeOpenAICompatibleProvider(): Promise<ProviderProbe> {
  if (!baseUrl()) return { configured: false, ready: false, reason: "missing_openai_compatible_url", route: "openai-compatible" };
  try {
    const res = await fetch(providerUrl("/models"), { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(12_000) });
    return { configured: true, ready: res.ok, status: res.status, reason: res.ok ? "reachable" : "provider_rejected", route: "openai-compatible" };
  } catch (error) {
    return { configured: true, ready: false, reason: "provider_unreachable", error: safeProviderError(error), route: "openai-compatible" };
  }
}

export async function checkAI(deep = false) {
  const provider = aiProviderName();
  const models = aiModels();
  const geminiPrimary = shouldUseGemini();
  let activeProbe = geminiPrimary ? await probeGeminiProvider(geminiTextModel()) : await probeOpenAICompatibleProvider();
  let fallbackUsed = false;
  let primaryFailure: ProviderProbe | null = null;

  if (!activeProbe.ready && geminiPrimary && baseUrl()) {
    primaryFailure = activeProbe;
    const fallbackProbe = await probeOpenAICompatibleProvider();
    if (fallbackProbe.ready) {
      activeProbe = fallbackProbe;
      fallbackUsed = true;
    } else {
      return {
        configured: activeProbe.configured || fallbackProbe.configured,
        ready: false,
        reason: "primary_and_fallback_unavailable",
        provider,
        models,
        primary: primaryFailure,
        fallback: fallbackProbe,
      };
    }
  }

  if (!activeProbe.ready) {
    return { configured: activeProbe.configured, ready: false, status: activeProbe.status, reason: activeProbe.reason, error: activeProbe.error, provider, models };
  }

  if (!deep) {
    return {
      configured: true,
      ready: true,
      status: activeProbe.status,
      reason: fallbackUsed ? "fallback_reachable" : "reachable",
      provider,
      models,
      activeRoute: activeProbe.route,
      fallbackUsed,
      ...(primaryFailure ? { primaryFailure } : {}),
    };
  }

  const recentlyVerified = lastVerifiedModelReadyAt > 0 && Date.now() - lastVerifiedModelReadyAt < MODEL_READY_CACHE_TTL_MS;
  if (recentlyVerified) {
    return { configured: true, ready: true, modelReady: true, reason: "model_ready_recently_verified", verifiedAt: new Date(lastVerifiedModelReadyAt).toISOString(), provider, models, activeRoute: activeProbe.route, fallbackUsed };
  }

  try {
    const probe = await runText([{ role: "user", content: "Reply with exactly OK." }], { maxTokens: 8, timeoutMs: 15_000 });
    const modelReady = probe.content.trim().length > 0;
    if (modelReady) lastVerifiedModelReadyAt = Date.now();
    return { configured: true, ready: modelReady, modelReady, reason: modelReady ? "model_ready" : "model_empty_response", provider, models, activeRoute: activeProbe.route, fallbackUsed };
  } catch (error) {
    return { configured: true, ready: true, modelReady: false, degraded: true, reason: "provider_ready_model_probe_timed_out", error: safeProviderError(error), provider, models, activeRoute: activeProbe.route, fallbackUsed };
  }
}
