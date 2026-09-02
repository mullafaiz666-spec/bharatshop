export type AIMessage = { role: "system" | "user" | "assistant"; content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> };

type ProviderOptions = { model?: string; temperature?: number; maxTokens?: number; tools?: any[]; toolChoice?: any };

const baseUrl = () => (process.env.AI_BASE_URL || process.env.LOCAL_AI_BASE_URL || "").replace(/\/$/, "");
const apiKey = () => process.env.AI_API_KEY || process.env.LOCAL_AI_API_KEY || "";
export const aiProviderName = () => process.env.AI_PROVIDER || "local-openai-compatible";
export const aiConfigured = () => !!baseUrl();
export const aiModels = () => ({ text: process.env.AI_TEXT_MODEL || process.env.LOCAL_AI_TEXT_MODEL || "gemma-3-4b-it", vision: process.env.AI_VISION_MODEL || process.env.LOCAL_AI_VISION_MODEL || "gemma-3-4b-it" });

function headers() { const key = apiKey(); return { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) }; }

async function request(path: string, body: unknown, timeoutMs = 30000) {
  const base = baseUrl();
  if (!base) throw new Error("AI_BASE_URL is not configured");
  const res = await fetch(`${base}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let data: any = null; try { data = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(`AI provider ${res.status}: ${String(data?.error?.message || data?.message || text).slice(0,1200)}`);
  return data;
}

export async function runAI(messages: AIMessage[], options: ProviderOptions = {}) {
  const models = aiModels();
  const data = await request("/chat/completions", { model: options.model || models.text, messages, temperature: options.temperature ?? 0.2, max_tokens: options.maxTokens ?? 2048, ...(options.tools ? { tools: options.tools, tool_choice: options.toolChoice ?? "auto" } : {}) });
  return data;
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

export async function verifyImagesWithAI(images: Array<{ url: string; data: string; mediaType: string }>, product: { title: string; brand: string; category: string }) {
  const content: any[] = [{ type: "text", text: `Product: ${product.title}\nBrand: ${product.brand}\nCategory: ${product.category}\nEvaluate each image for exact-product identity. Reject unrelated, generic stock, placeholder, collage and wrong-variant images. Return ONLY JSON array [{"index":1,"matches":true,"confidence":0.9,"reason":"..."}].` }];
  images.forEach((image, i) => { content.push({ type: "text", text: `Image ${i + 1}` }); content.push({ type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.data}` } }); });
  const data = await runAI([{ role: "user", content }], { model: aiModels().vision, temperature: 0, maxTokens: 3000 });
  const text = String(data?.choices?.[0]?.message?.content || "");
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("AI vision provider returned non-JSON output");
  return JSON.parse(match[0]) as Array<{ index: number; matches: boolean; confidence: number; reason: string }>;
}

export async function checkAI(deep = false) {
  const base = baseUrl();
  if (!base) return { configured: false, ready: false, reason: "missing", provider: aiProviderName(), models: aiModels() };
  try {
    const res = await fetch(`${base}/models`, { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { configured: true, ready: false, status: res.status, reason: "provider_rejected", provider: aiProviderName(), models: aiModels() };
    if (!deep) return { configured: true, ready: true, status: res.status, reason: "reachable", provider: aiProviderName(), models: aiModels() };
    const probe = await runText([{ role: "user", content: "Reply with exactly OK." }], { maxTokens: 16 });
    return { configured: true, ready: probe.content.trim().length > 0, status: res.status, reason: "model_ready", provider: aiProviderName(), models: aiModels() };
  } catch (e) { return { configured: true, ready: false, reason: "provider_unreachable", error: e instanceof Error ? e.message : String(e), provider: aiProviderName(), models: aiModels() }; }
}
