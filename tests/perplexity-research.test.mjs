import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/lib/ai/perplexity-research.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function loadModule() {
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(require, loaded, loaded.exports);
  return loaded.exports;
}

function envSnapshot() {
  return {
    key: process.env.PERPLEXITY_API_KEY,
    model: process.env.PERPLEXITY_MODEL,
    timeout: process.env.PERPLEXITY_TIMEOUT_MS,
    retry: process.env.PERPLEXITY_MAX_RETRY_DELAY_MS,
    fetch: globalThis.fetch,
  };
}

function restore(snapshot) {
  if (snapshot.key === undefined) delete process.env.PERPLEXITY_API_KEY; else process.env.PERPLEXITY_API_KEY = snapshot.key;
  if (snapshot.model === undefined) delete process.env.PERPLEXITY_MODEL; else process.env.PERPLEXITY_MODEL = snapshot.model;
  if (snapshot.timeout === undefined) delete process.env.PERPLEXITY_TIMEOUT_MS; else process.env.PERPLEXITY_TIMEOUT_MS = snapshot.timeout;
  if (snapshot.retry === undefined) delete process.env.PERPLEXITY_MAX_RETRY_DELAY_MS; else process.env.PERPLEXITY_MAX_RETRY_DELAY_MS = snapshot.retry;
  globalThis.fetch = snapshot.fetch;
}

function fallbackResult() {
  return {
    provider: "searxng",
    status: "OK",
    answer: "",
    citations: ["https://example.com/fallback"],
    organic: [{ title: "Fallback", link: "https://example.com/fallback", snippet: "fallback evidence" }],
    shopping: [],
    evidence: [],
  };
}

test("unconfigured Perplexity reports NOT_CONFIGURED and uses the existing fallback", async () => {
  const snapshot = envSnapshot();
  try {
    delete process.env.PERPLEXITY_API_KEY;
    let fetchCalls = 0;
    let fallbackCalls = 0;
    globalThis.fetch = async () => { fetchCalls += 1; throw new Error("unexpected network"); };
    const api = loadModule();
    assert.equal(api.perplexityReadiness().status, "NOT_CONFIGURED");
    const result = await api.researchWithOptionalPerplexity("latest India streetwear trends", async () => {
      fallbackCalls += 1;
      return fallbackResult();
    });
    assert.equal(fetchCalls, 0);
    assert.equal(fallbackCalls, 1);
    assert.equal(result.provider, "searxng");
    assert.deepEqual(result.providerRoute, {
      primary: "perplexity",
      primaryStatus: "NOT_CONFIGURED",
      active: "searxng",
      fallbackUsed: true,
    });
  } finally { restore(snapshot); }
});

test("configured Perplexity normalizes answer, citations and source URLs without exposing the key", async () => {
  const snapshot = envSnapshot();
  try {
    process.env.PERPLEXITY_API_KEY = "test-key-value";
    let authorization = "";
    globalThis.fetch = async (url, options = {}) => {
      assert.equal(String(url), "https://api.perplexity.ai/v1/sonar");
      authorization = String(options.headers?.Authorization || "");
      return new Response(JSON.stringify({
        id: "research-1",
        choices: [{ message: { role: "assistant", content: "Current market signal with citations." } }],
        citations: ["https://example.com/report", "https://news.example.org/story"],
        search_results: [
          { title: "Market report", url: "https://example.com/report", snippet: "Public market evidence", source: "web", date: "2026-09-20" },
        ],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const api = loadModule();
    const result = await api.perplexityResearch("latest India ecommerce fashion market");
    assert.match(authorization, /^Bearer /);
    assert.equal(result.provider, "perplexity");
    assert.equal(result.status, "OK");
    assert.equal(result.citations.length, 2);
    assert.equal(result.organic.length, 2);
    assert.equal(result.evidence[0].source, "PERPLEXITY");
    assert.equal(result.evidence[0].sourceUrl, "https://example.com/report");
    assert.equal(JSON.stringify(result).includes("test-key-value"), false);
  } finally { restore(snapshot); }
});

test("Perplexity timeout is bounded and classified without leaking request data", async () => {
  const snapshot = envSnapshot();
  try {
    process.env.PERPLEXITY_API_KEY = "timeout-test-key";
    process.env.PERPLEXITY_TIMEOUT_MS = "2000";
    globalThis.fetch = async (_url, options = {}) => new Promise((_resolve, reject) => {
      const signal = options.signal;
      if (signal?.aborted) return reject(signal.reason);
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    const api = loadModule();
    const started = Date.now();
    await assert.rejects(
      api.perplexityResearch("latest public retail trend"),
      (error) => error?.code === "TIMEOUT" && !String(error?.message).includes("timeout-test-key"),
    );
    assert.ok(Date.now() - started < 3500);
  } finally { restore(snapshot); }
});

test("Perplexity rate limits retry once and then return RATE_LIMITED", async () => {
  const snapshot = envSnapshot();
  try {
    process.env.PERPLEXITY_API_KEY = "rate-test-key";
    process.env.PERPLEXITY_MAX_RETRY_DELAY_MS = "0";
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response("", { status: 429, headers: { "Retry-After": "0" } });
    };
    const api = loadModule();
    await assert.rejects(api.perplexityResearch("current public competitor pricing"), (error) => error?.code === "RATE_LIMITED");
    assert.equal(calls, 2);
  } finally { restore(snapshot); }
});

test("malformed successful responses are rejected rather than fabricated", async () => {
  const snapshot = envSnapshot();
  try {
    process.env.PERPLEXITY_API_KEY = "malformed-test-key";
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [], citations: [], search_results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const api = loadModule();
    await assert.rejects(api.perplexityResearch("latest public supplier landscape"), (error) => error?.code === "MALFORMED_RESPONSE");
  } finally { restore(snapshot); }
});

test("privacy filter blocks local URLs, credentials, customer data, database URLs and payment/order secrets before network or fallback", async () => {
  const snapshot = envSnapshot();
  try {
    process.env.PERPLEXITY_API_KEY = "privacy-test-key";
    let fetchCalls = 0;
    let fallbackCalls = 0;
    globalThis.fetch = async () => { fetchCalls += 1; throw new Error("unexpected network"); };
    const api = loadModule();
    const blocked = [
      "research http://127.0.0.1:3002/api/status",
      "compare postgres://user:password@db.internal:5432/shop",
      "find trends for customer email: buyer@example.com",
      "check phone 9876543210 against suppliers",
      "verify RAZORPAY_KEY_SECRET",
      "research order_ref: BS-WEB-private-order-123456",
      "use bearer private-token-value for research",
    ];
    for (const query of blocked) {
      await assert.rejects(
        api.researchWithOptionalPerplexity(query, async () => { fallbackCalls += 1; return fallbackResult(); }),
        (error) => error?.code === "PRIVACY_BLOCKED",
      );
    }
    assert.equal(fetchCalls, 0);
    assert.equal(fallbackCalls, 0);
  } finally { restore(snapshot); }
});

test("provider failure falls back to the existing search chain and records only a sanitized status", async () => {
  const snapshot = envSnapshot();
  try {
    process.env.PERPLEXITY_API_KEY = "fallback-test-key";
    process.env.PERPLEXITY_MAX_RETRY_DELAY_MS = "0";
    let fallbackCalls = 0;
    globalThis.fetch = async () => new Response("", { status: 429, headers: { "Retry-After": "0" } });
    const api = loadModule();
    const result = await api.researchWithOptionalPerplexity("latest India marketplace demand", async () => {
      fallbackCalls += 1;
      return fallbackResult();
    });
    assert.equal(fallbackCalls, 1);
    assert.equal(result.provider, "searxng");
    assert.equal(result.providerRoute.primaryStatus, "RATE_LIMITED");
    assert.equal(JSON.stringify(result).includes("fallback-test-key"), false);
  } finally { restore(snapshot); }
});

test("caller cancellation stops Perplexity work and does not fall through to another provider", async () => {
  const snapshot = envSnapshot();
  try {
    process.env.PERPLEXITY_API_KEY = "cancel-test-key";
    let fallbackCalls = 0;
    globalThis.fetch = async (_url, options = {}) => {
      if (options.signal?.aborted) throw options.signal.reason;
      return new Promise((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
    };
    const api = loadModule();
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      api.researchWithOptionalPerplexity("latest public demand trend", async () => { fallbackCalls += 1; return fallbackResult(); }, { signal: controller.signal }),
      (error) => error?.code === "CANCELLED",
    );
    assert.equal(fallbackCalls, 0);
  } finally { restore(snapshot); }
});
