import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const employees = readFileSync(new URL("../src/lib/agents/employees.ts", import.meta.url), "utf8");
const localRuntime = readFileSync(new URL("../src/lib/machine-ai/local-runtime.ts", import.meta.url), "utf8");
const agentApi = readFileSync(new URL("../src/app/api/agents/route.ts", import.meta.url), "utf8");
const machineApi = readFileSync(new URL("../src/app/api/machine-ai/agents/route.ts", import.meta.url), "utf8");
const studio = readFileSync(new URL("../src/app/agents/page.tsx", import.meta.url), "utf8");

test("operational agents have AI employee identity and reporting lines", () => {
  assert.ok(employees.includes('employeeType: "AI_EMPLOYEE"'));
  assert.ok(employees.includes('employmentStatus: "ACTIVE"'));
  assert.ok(employees.includes('reportsTo: contract.id === "ceo" ? "Human Owner" : "BharatShop CEO Agent"'));
  assert.ok(employees.includes('humanApprovalProtected: true'));
  assert.ok(employees.includes('legalStatus: "DIGITAL_WORKER_NOT_HUMAN_EMPLOYEE"'));
});

test("every discovered local specialist automatically becomes an AI employee", () => {
  assert.ok(localRuntime.includes("specialistAiEmployee"));
  assert.ok(localRuntime.includes("employee: specialistAiEmployee"));
  assert.ok(machineApi.includes('designation: "AI employees"'));
  assert.ok(machineApi.includes("employeeCount: agents.length"));
});

test("agent API and studio expose the workforce model", () => {
  assert.ok(agentApi.includes("aiEmployees: operationalAiEmployees()"));
  assert.ok(agentApi.includes("workforcePolicy: AI_WORKFORCE_POLICY"));
  assert.ok(studio.includes("BharatShop AI Employee Studio"));
  assert.ok(studio.includes("AI employees"));
  assert.ok(studio.includes("reports through AI CEO"));
});

test("consequential actions remain human protected", () => {
  for (const phrase of ["paid spend","supplier purchases","credential changes","destructive database actions","production cutover"]) {
    assert.ok(employees.includes(phrase));
  }
});
