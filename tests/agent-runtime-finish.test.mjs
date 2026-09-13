import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const worker = fs.readFileSync(new URL("../scripts/run-company-autopilot.ps1", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("../src/lib/agents/runtime.ts", import.meta.url), "utf8");
const agentMemory = fs.readFileSync(new URL("../src/lib/agents/agentmemory.ts", import.meta.url), "utf8");

test("company autopilot can drain queued work and exit cleanly", () => {
  assert.match(packageJson.scripts["agents:finish"], /-Mode Drain/);
  assert.match(worker, /ValidateSet\("Status", "Once", "Drain", "Loop"\)/);
  assert.match(worker, /QUEUE DRAINED/);
  assert.match(worker, /if \(\[int\]\$result\.claimed -eq 0\)/);
});

test("AgentMemory is used by the operational agent runtime when enabled", () => {
  assert.match(runtime, /recallAgentMemory/);
  assert.match(runtime, /rememberAgentMemory/);
  assert.match(runtime, /Long-term AgentMemory recall/);
  assert.match(runtime, /agentmemory\+postgres\+request/);
  assert.match(agentMemory, /BHARATSHOP_AGENTMEMORY_ENABLED/);
  assert.match(agentMemory, /AGENTMEMORY_URL/);
  assert.match(agentMemory, /AGENTMEMORY_SECRET/);
  assert.match(agentMemory, /\/agentmemory\/smart-search/);
  assert.match(agentMemory, /\/agentmemory\/remember/);
  assert.match(agentMemory, /\[REDACTED\]/);
});

test("AgentMemory can be started and checked from the shell without adding a project dependency", () => {
  assert.match(packageJson.scripts["agentmemory:start"], /@agentmemory\/agentmemory@latest/);
  assert.match(packageJson.scripts["agentmemory:status"], /@agentmemory\/agentmemory@latest status/);
  assert.equal(packageJson.dependencies?.["@agentmemory/agentmemory"], undefined);
});
