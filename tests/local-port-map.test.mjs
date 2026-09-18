import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const storefront = readFileSync(new URL("../scripts/local-storefront-manager.mjs", import.meta.url), "utf8");
const machineManager = readFileSync(new URL("../scripts/machine-ai-web-manager.mjs", import.meta.url), "utf8");
const machineWeb = readFileSync(new URL("../scripts/machine-ai-web.mjs", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

test("local runtime keeps BharatShop on 3001 and Machine AI on 3002", () => {
  assert.ok(storefront.includes("BHARATSHOP_LOCAL_APP_PORT || '3001'"));
  assert.ok(machineManager.includes("BHARATSHOP_MACHINE_UI_PORT || '3002'"));
  assert.ok(machineWeb.includes("BHARATSHOP_MACHINE_UI_PORT || '3002'"));
  assert.ok(envExample.includes("BHARATSHOP_LOCAL_APP_PORT=3001"));
  assert.ok(envExample.includes("BHARATSHOP_MACHINE_UI_PORT=3002"));
});
