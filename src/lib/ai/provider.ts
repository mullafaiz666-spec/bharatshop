export type AIMessage = { role: "system" | "user" | "assistant" | "tool"; content: any; tool_call_id?: string };

type ProviderOptions = { model?: string; temperature?: number; maxTokens?: number; tools?: any[]; toolChoice?: any };

const legacyBaseUrl = () => (process.env.AI_BASE_URL || process.env.LOCAL_AI_BASE_URL || "").replace(/\/$/, "");
const legacyApiKey = () => process.env.AI_API_KEY || process.env.LOCAL_AI_API_KEY || "";
const openAIKey = () => process.env.OPENAI_API_KEY || "";
const anthropicKey = () => process.env.ANTHROPIC_API_KEY || "";

export const aiProviderName = () => openAIKey() ? "openai" : (process.env.AI_PROVIDER || "local-openai-compatible");
export const visionProviderName = () => "anthropic";
export const aiConfigured = () => !!(openAIKey() || legacyBaseUrl());
export const visionConfigured = () => !!anthropicKey();
export const aiModels = () => ({
  text: process.env.OPENAI_MODEL || process.env.AI_TEXT_MODEL || process.env.LOCAL_AI_TEXT_MODEL || "gemma3:4b",
  vision: process.env.ANTHROPIC_VISION_MODEL || "claude-sonnet-4-6",
});

function openAIBaseUrl() { return (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""); }
function textBaseUrl() { return openAIKey() ? openAIBaseUrl() : legacyBaseUrl(); }
function textApiKey() { return openAIKey() || legacyApiKey(); }
function textHeaders() { const key = textApiKey(); return { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) }; }

async function requestText(path: string, body: unknown, timeoutMs = 30000) {
  const base = textBaseUrl();
  if (!base) throw new Error("No text AI provider is configured");
  const res = await fetch(`${base}${path}`, { method: "POST", headers: textHeaders(), body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let data: any = null; try { data = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(`${aiProviderName()} ${res.status}: ${String(data?.error?.message || data?.message || text).slice(0,1200)}`);
  return data;
}

export async function runAI(messages: AIMessage[], options: ProviderOptions = {}) {
  const models = aiModels();
  return requestText("/chat/completions", { model: options.model || models.text, messages, temperature: options.temperature ?? 0.2, max_tokens: options.maxTokens ?? 2048, ...(options.tools ? { tools: options.tools, tool_choice: options.toolChoice ?? "auto" } : {}) });
}

export async function runText(messages: AIMessage[], options: ProviderOptions = {}) {
  const data = await runAI(messages, options);
  const message = data?.choices?.[0]?.message;
  if (!message) throw new Error("AI provider returned no assistant message");
  return { content: String(message.content || ""), toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [], raw: message };
}

export async function runStructured<T>(system: string, user: string): Promise<T> {
  const result = await runText([{ role: "system", content: `${system}\nReturn ONLY valid JSON. No markdown fences.` }, { role: "user", content: user }], { temperature: 0, maxTokens: 4096 });
  const match = result.content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error("AI provider returned non-JSON output");
  return JSON.parse(match[0]) as T;
}

async function anthropicMessages(body: unknown, timeoutMs = 45000) {
  const key = anthropicKey();
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data: any = null; try { data = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${String(data?.error?.message || data?.message || text).slice(0,1200)}`);
  return data;
}

export async function verifyImagesWithAI(images: Array<{ url: string; data: string; mediaType: string }>, product: { title: string; brand: string; category: string }) {
  if (!images.length) return [];
  const content: any[] = [{ type: "text", text: `Product: ${product.title}\nBrand: ${product.brand}\nCategory: ${product.category}\nEvaluate every image for exact-product identity. Reject unrelated, generic stock, placeholder, collage and wrong-variant images. Return ONLY a JSON array [{"index":1,"matches":true,"confidence":0.9,"reason":"..."}].` }];
  images.forEach((image, i) => {
    content.push({ type: "text", text: `Image ${i + 1}` });
    content.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } });
  });
  const data = await anthropicMessages({ model: aiModels().vision, max_tokens: 3000, temperature: 0, messages: [{ role: "user", content }] });
  const text = Array.isArray(data?.content) ? data.content.filter((x:any) => x?.type === "text").map((x:any) => x.text).join("\n") : "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Anthropic vision returned non-JSON output");
  return JSON.parse(match[0]) as Array<{ index: number; matches: boolean; confidence: number; reason: string }>;
}

export async function checkAI(deep = false) {
  const base = textBaseUrl();
  if (!base) return { configured: false, ready: false, reason: "missing", provider: aiProviderName(), models: aiModels() };
  try {
    const res = await fetch(`${base}/models`, { headers: textHeaders(), cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { configured: true, ready: false, status: res.status, reason: "provider_rejected", provider: aiProviderName(), models: aiModels() };
    if (!deep) return { configured: true, ready: true, status: res.status, reason: "reachable", provider: aiProviderName(), models: aiModels() };
    const probe = await runText([{ role: "user", content: "Reply with exactly OK." }], { maxTokens: 16 });
    return { configured: true, ready: probe.content.trim().length > 0, status: res.status, reason: "model_ready", provider: aiProviderName(), models: aiModels() };
  } catch (e) { return { configured: true, ready: false, reason: "provider_unreachable", error: e instanceof Error ? e.message : String(e), provider: aiProviderName(), models: aiModels() }; }
}

export async function checkVisionProvider(deep = false) {
  if (!anthropicKey()) return { configured: false, ready: false, reason: "missing_anthropic_api_key", provider: "anthropic", model: aiModels().vision };
  if (!deep) return { configured: true, ready: true, exercised: false, provider: "anthropic", model: aiModels().vision };
  try {
    const data = await anthropicMessages({ model: aiModels().vision, max_tokens: 16, temperature: 0, messages: [{ role: "user", content: "Reply with exactly OK." }] }, 15000);
    const text = Array.isArray(data?.content) ? data.content.filter((x:any) => x?.type === "text").map((x:any) => x.text).join(" ").trim() : "";
    return { configured: true, ready: text.length > 0, exercised: true, provider: "anthropic", model: aiModels().vision };
  } catch (e) {
    return { configured: true, ready: false, exercised: true, reason: "anthropic_unreachable", provider: "anthropic", model: aiModels().vision, error: e instanceof Error ? e.message : String(e) };
  }
}
