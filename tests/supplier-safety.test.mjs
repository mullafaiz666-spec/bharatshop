import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routeSource = readFileSync(new URL("../src/app/api/suppliers/cj/route.ts", import.meta.url), "utf8");
const supplierSource = readFileSync(new URL("../src/lib/suppliers/cj.ts", import.meta.url), "utf8");
const routeCode = ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadRoute(calls) {
  const mod = { exports: {} };
  const imports = {
    "@/db": { db: { select: () => { throw new Error("database should not be touched by guarded tests"); } } },
    "@/db/schema": { users: { id: "id" } },
    "drizzle-orm": { desc: x => x },
    "@/lib/admin-auth": { getAdminUser: async () => null },
    "@/lib/suppliers/cj": {
      searchCjProducts: async () => { calls.search += 1; return [{ id: "cj-1", nameEn: "Sample" }]; },
      importCjProducts: async () => { calls.import += 1; return { imported: 1 }; },
      ensureSupplierLinkTable: async () => { calls.ensure += 1; },
      createCjOrder: async () => { calls.order += 1; return { id: "supplier-order" }; },
    },
    "next/server": {
      NextResponse: {
        json: (body, init) => new Response(JSON.stringify(body), {
          ...init,
          headers: { "Content-Type": "application/json", ...init?.headers },
        }),
      },
    },
  };
  new Function("require", "module", "exports", routeCode)(
    name => name in imports ? imports[name] : require(name),
    mod,
    mod.exports,
  );
  return mod.exports;
}

function snapshotEnv() {
  return {
    token: process.env.BHARATSHOP_AUTOMATION_TOKEN,
    cj: process.env.CJ_API_KEY,
    importEnabled: process.env.CJ_PRODUCT_IMPORT_ENABLED,
    fulfillEnabled: process.env.CJ_LIVE_FULFILLMENT_ENABLED,
  };
}
function restoreEnv(env) {
  for (const [key, value] of Object.entries({
    BHARATSHOP_AUTOMATION_TOKEN: env.token,
    CJ_API_KEY: env.cj,
    CJ_PRODUCT_IMPORT_ENABLED: env.importEnabled,
    CJ_LIVE_FULFILLMENT_ENABLED: env.fulfillEnabled,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("CJ mutation actions require backend authorization", async () => {
  const env = snapshotEnv();
  try {
    delete process.env.BHARATSHOP_AUTOMATION_TOKEN;
    delete process.env.CJ_PRODUCT_IMPORT_ENABLED;
    delete process.env.CJ_LIVE_FULFILLMENT_ENABLED;
    const calls = { search: 0, import: 0, ensure: 0, order: 0 };
    const { POST } = loadRoute(calls);
    for (const action of ["IMPORT", "ENSURE_TABLE", "CREATE_ORDER"]) {
      const response = await POST(new Request("http://localhost/api/suppliers/cj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }));
      assert.equal(response.status, 401, action);
    }
    assert.deepEqual(calls, { search: 0, import: 0, ensure: 0, order: 0 });
  } finally { restoreEnv(env); }
});

test("authorized CJ import and live fulfilment stay blocked unless their explicit gates are enabled", async () => {
  const env = snapshotEnv();
  try {
    process.env.BHARATSHOP_AUTOMATION_TOKEN = "test-automation-token";
    process.env.CJ_PRODUCT_IMPORT_ENABLED = "false";
    process.env.CJ_LIVE_FULFILLMENT_ENABLED = "false";
    const calls = { search: 0, import: 0, ensure: 0, order: 0 };
    const { POST } = loadRoute(calls);
    for (const action of ["IMPORT", "CREATE_ORDER"]) {
      const response = await POST(new Request("http://localhost/api/suppliers/cj", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-automation-token",
        },
        body: JSON.stringify({ action }),
      }));
      assert.equal(response.status, 409, action);
    }
    assert.equal(calls.import, 0);
    assert.equal(calls.order, 0);
  } finally { restoreEnv(env); }
});

test("CJ DRY_RUN is non-mutating and bounded", async () => {
  const env = snapshotEnv();
  try {
    process.env.CJ_API_KEY = "test-only-key";
    const calls = { search: 0, import: 0, ensure: 0, order: 0 };
    const { POST } = loadRoute(calls);
    const response = await POST(new Request("http://localhost/api/suppliers/cj", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "DRY_RUN", keyword: "fashion", limit: 500 }),
    }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.dryRun, true);
    assert.equal(body.provider, "cj");
    assert.equal(calls.search, 1);
    assert.equal(calls.import, 0);
    assert.equal(calls.ensure, 0);
    assert.equal(calls.order, 0);
  } finally { restoreEnv(env); }
});

test("CJ imported catalogue records are staged rather than auto-published", () => {
  assert.match(supplierSource, /"STAGED"/);
  assert.doesNotMatch(supplierSource, /auto_reprice_enabled,status[^\n]+?"Published"/);
});
