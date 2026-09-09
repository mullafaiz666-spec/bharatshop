import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("CEO chat is model-led and never impersonates Gemma with a canned fallback", () => {
  const route = read("src/app/api/ceo-chat/route.ts");
  assert.match(route, /planWithGemma/);
  assert.match(route, /gemma-compact-plan-act/);
  assert.match(route, /Gemma selected a tool outside the agent permission set/);
  assert.match(route, /no canned CEO answer was substituted/i);
  assert.match(route, /modelStatus: "live"/);
  assert.doesNotMatch(route, /function humanFallback/);
  assert.doesNotMatch(route, /modelStatus:\s*["']human-fallback["']/);
});

test("CEO UI exposes the real Gemma runtime state", () => {
  const ui = read("src/components/CEOChat.tsx");
  assert.match(ui, /model-driven CEO/);
  assert.match(ui, /Local Gemma unavailable • no canned fallback/);
  assert.match(ui, /d\.modelStatus === "live"/);
});
