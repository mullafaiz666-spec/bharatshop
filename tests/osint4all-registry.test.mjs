import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const registry = fs.readFileSync(new URL("../src/lib/ai/osint4all-registry.ts", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("../src/lib/agents/runtime.ts", import.meta.url), "utf8");
const doc = fs.readFileSync(new URL("../docs/JARVIS_OSINT4ALL_INTEGRATION.md", import.meta.url), "utf8");

test("OSINT4ALL registry has source metadata and curated tools", () => {
  assert.match(registry, /publishedProfiles: 188/);
  assert.match(registry, /id:"shodan"/);
  assert.match(registry, /id:"sherlock"/);
  assert.match(registry, /id:"c2patool"/);
  assert.match(registry, /id:"wayback"/);
  assert.match(registry, /assertOsintAgentAccess/);
});

test("agent runtime exposes read-only OSINT routing tools", () => {
  assert.match(runtime, /osint_catalog:/);
  assert.match(runtime, /osint_plan:/);
  assert.match(runtime, /"osint_catalog", "osint_plan"/);
  assert.match(runtime, /Public\/authorized research only/);
  assert.match(runtime, /pricing = "free"/);
  assert.match(runtime, /assertOsintAgentAccess\(tool.id, agentId\)/);
  assert.doesNotMatch(runtime, /;\\n\\nconst TOOL_DEFINITIONS/);
});

test("integration documentation preserves the approval boundary", () => {
  assert.match(doc, /CEO → Agent → Tool → Evidence → Audit → Decision → Human Approval → Action → Verified Result/);
  assert.match(doc, /must not:/);
  assert.match(doc, /bypass authentication/);
});
