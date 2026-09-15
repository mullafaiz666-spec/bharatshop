import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = readFileSync(new URL("../src/lib/local-ai/runtime.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/components/local-ai/LocalAIChat.tsx", import.meta.url), "utf8");
const chatRoute = readFileSync(new URL("../src/app/api/local-ai/chat/route.ts", import.meta.url), "utf8");
const agencyRoute = readFileSync(new URL("../src/app/api/local-ai/agency/route.ts", import.meta.url), "utf8");


test("local AI web runtime is loopback-only by default", () => {
  assert.match(runtime, /127\.0\.0\.1:11434/);
  assert.match(runtime, /host === "localhost"/);
  assert.match(runtime, /host === "127\.0\.0\.1"/);
  assert.match(runtime, /NODE_ENV !== "production" \|\| productionOptIn/);
});


test("local chat streams directly from Ollama with hidden thinking disabled", () => {
  assert.match(runtime, /stream: true/);
  assert.match(runtime, /think: false/);
  assert.match(chatRoute, /createChatStream/);
});


test("chat interface separates direct chat from explicit agency mode", () => {
  assert.match(page, /type Mode = "chat" \| "agency"/);
  assert.match(page, /\/api\/local-ai\/chat/);
  assert.match(page, /\/api\/local-ai\/agency/);
  assert.match(page, /localStorage\.setItem/);
  assert.match(agencyRoute, /runLocalAgency/);
});
