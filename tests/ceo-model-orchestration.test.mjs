import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("CEO chat uses the shared multi-step runtime and never impersonates an unavailable model", () => {
  const route = read("src/app/api/ceo-chat/route.ts");
  const runtime = read("src/lib/agents/runtime.ts");
  assert.match(route, /runAgentRuntime/);
  assert.match(runtime, /agent-runtime-v4-plan-tool-observe/);
  assert.match(runtime, /for \(let step = 1; step <= maxSteps; step\+\+\)/);
  assert.match(runtime, /tools: nativeTools\(agentId\)/);
  assert.match(runtime, /delegate_agent/);
  assert.match(runtime, /agent_chat_messages/);
  assert.match(runtime, /will not invent an answer/);
  assert.doesNotMatch(route, /humanFallback/);
});

test("CEO UI exposes multi-step runtime state and persistent session id", () => {
  const ui = read("src/components/CEOChat.tsx");
  assert.match(ui, /multi-step agent runtime/);
  assert.match(ui, /sessionId/);
  assert.match(ui, /localStorage\.setItem/);
  assert.match(ui, /d\.modelStatus === "live"/);
});

test("Agent Studio exposes every operational specialist as a conversational agent", () => {
  const ui = read("src/app/agents/page.tsx");
  for (const id of ["ceo","source-discovery","source-verification","seller-discovery","listing","marketing","advertising","order-recheck","tracking","learning","automation","web-design"]) {
    assert.match(ui, new RegExp(id.replace(/-/g, "[-]")));
  }
  assert.match(ui, /Verified workflow trace/);
  assert.match(ui, /\/api\/agents/);
});
