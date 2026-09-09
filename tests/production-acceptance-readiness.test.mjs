import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow=readFileSync(new URL("../.github/workflows/production-acceptance.yml",import.meta.url),"utf8");

test("production acceptance waits for dependent providers and real Gemma readiness",()=>{
  assert.match(workflow,/Wait for dependent providers and Gemma model/);
  assert.match(workflow,/api\/health\?deep=1/);
  assert.match(workflow,/modelReady/);
  assert.match(workflow,/r\.postgres\?\.ready/);
  assert.match(workflow,/r\.vision\?\.ready/);
  assert.match(workflow,/r\.searxng\?\.ready/);
  assert.match(workflow,/refusing to run a false-negative acceptance pass/);
});
