import http from "node:http";
import { generateText } from "ai";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

const PORT = Number(process.env.AI_GATEWAY_PORT || 8209);
const HOST = process.env.AI_GATEWAY_HOST || "127.0.0.1";
const TOKEN = String(process.env.AI_GATEWAY_TOKEN || "");

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
};

const authorized = (req) => {
  if (!TOKEN) return true;
  return req.headers.authorization === `Bearer ${TOKEN}`;
};

const readJson = async (req, limit = 1_000_000) => {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "";
const localBaseUrl = () => (process.env.AI_BASE_URL || process.env.LOCAL_AI_BASE_URL || "").replace(/\/+$/, "");
const localApiKey = () => process.env.AI_API_KEY || process.env.LOCAL_AI_API_KEY || "ollama";
const providerPreference = () => String(process.env.AI_PROVIDER || "").trim().toLowerCase();
const shouldUseGemini = () => providerPreference() === "gemini" || (!providerPreference() && Boolean(geminiKey()));

function resolveModel(requested) {
  if (shouldUseGemini()) {
    const modelName = requested || process.env.GEMINI_MODEL || "gemini-3.7-flash";
    const google = createGoogle({ apiKey: geminiKey() });
    return { model: google(modelName), provider: "gemini", modelName };
  }

  const baseURL = localBaseUrl();
  if (!baseURL) throw new Error("AI_BASE_URL_or_LOCAL_AI_BASE_URL_required");
  const modelName = requested || process.env.AI_TEXT_MODEL || process.env.LOCAL_AI_TEXT_MODEL || "functiongemma:270m";
  const openai = createOpenAI({ baseURL, apiKey: localApiKey() });
  return { model: openai(modelName), provider: "openai-compatible", modelName };
}

function normalizeMessages(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 100) {
    throw new Error("messages_must_be_a_non_empty_array_up_to_100_items");
  }
  const system = [];
  const messages = [];
  for (const raw of input) {
    const role = String(raw?.role || "");
    const content = typeof raw?.content === "string" ? raw.content : "";
    if (!content || content.length > 100_000) throw new Error("invalid_message_content");
    if (role === "system") system.push(content);
    else if (role === "user" || role === "assistant") messages.push({ role, content });
    else throw new Error("unsupported_message_role");
  }
  if (!messages.length) throw new Error("at_least_one_user_or_assistant_message_required");
  return { system: system.join("\n\n") || undefined, messages };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        service: "bharatshop-ai-sdk-gateway",
        provider: shouldUseGemini() ? "gemini" : "openai-compatible",
        configured: shouldUseGemini() ? Boolean(geminiKey()) : Boolean(localBaseUrl()),
      });
    }

    if (req.method !== "POST" || url.pathname !== "/generate") {
      return json(res, 404, { error: "not_found" });
    }
    if (!authorized(req)) return json(res, 401, { error: "unauthorized" });

    const body = await readJson(req);
    const { system, messages } = normalizeMessages(body.messages);
    const { model, provider, modelName } = resolveModel(body.model);
    const temperature = Number.isFinite(Number(body.temperature)) ? Math.max(0, Math.min(2, Number(body.temperature))) : 0.2;
    const maxOutputTokens = Number.isFinite(Number(body.maxOutputTokens))
      ? Math.max(1, Math.min(8192, Math.floor(Number(body.maxOutputTokens))))
      : 1024;

    const result = await generateText({
      model,
      system,
      messages,
      temperature,
      maxOutputTokens,
      abortSignal: AbortSignal.timeout(Math.max(5_000, Math.min(180_000, Number(body.timeoutMs || 120_000)))),
    });

    return json(res, 200, {
      text: result.text,
      provider,
      model: modelName,
      finishReason: result.finishReason,
      usage: result.usage,
      warnings: result.warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "request_too_large" ? 413 : 500;
    return json(res, status, { error: message.slice(0, 500) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`BharatShop AI SDK gateway listening on http://${HOST}:${PORT}`);
});
