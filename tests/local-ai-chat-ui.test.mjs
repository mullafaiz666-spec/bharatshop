import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = readFileSync(new URL("../src/lib/local-ai/runtime.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/components/local-ai/LocalAIChat.tsx", import.meta.url), "utf8");
const routePage = readFileSync(new URL("../src/app/local-ai/page.tsx", import.meta.url), "utf8");
const dock = readFileSync(new URL("../src/components/local-ai/LocalAIToolDock.tsx", import.meta.url), "utf8");
const chatRoute = readFileSync(new URL("../src/app/api/local-ai/chat/route.ts", import.meta.url), "utf8");
const agencyRoute = readFileSync(new URL("../src/app/api/local-ai/agency/route.ts", import.meta.url), "utf8");
const systemRoute = readFileSync(new URL("../src/app/api/local-ai/system/route.ts", import.meta.url), "utf8");
const launcher = readFileSync(new URL("../scripts/start-local-ai-web.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("local AI web runtime is loopback-only by default", () => {
  assert.match(runtime, /127\.0\.0\.1:11434/);
  assert.match(runtime, /host === "localhost"/);
  assert.match(runtime, /host === "127\.0\.0\.1"/);
  assert.match(runtime, /NODE_ENV !== "production" \|\| productionOptIn/);
  assert.match(systemRoute, /localWebRequestAllowed/);
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

test("system dock exposes only read-only local status and safe workspace shortcuts", () => {
  assert.match(routePage, /LocalAIToolDock/);
  assert.match(dock, /\/api\/local-ai\/system/);
  assert.match(systemRoute, /heartbeat\.json/);
  assert.match(systemRoute, /memory/);
  assert.match(systemRoute, /pendingTasks/);
  assert.match(systemRoute, /Command Centre/);
  assert.doesNotMatch(systemRoute, /spawn\(|exec\(|writeFile|unlink|rmSync/);
});

test("local AI web launcher binds to loopback and has an npm command", () => {
  assert.match(launcher, /const host = "127\.0\.0\.1"/);
  assert.match(launcher, /LOCAL_AI_WEB_ENABLED: "1"/);
  assert.equal(packageJson.scripts["machine:web"], "node scripts/start-local-ai-web.mjs");
});
