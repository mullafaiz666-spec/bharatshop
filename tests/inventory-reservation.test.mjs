import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function evaluate(code, imports) {
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => name in imports ? imports[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
}
const sql = (parts, ...values) => ({ parts, values });
const eq = (column, value) => ({ column, value });
const tokenPlan = evaluate(compile("../src/lib/payments/token-plan.ts"), {});
const inventory = evaluate(compile("../src/lib/orders/inventory-reservation.ts"), {
  "@/lib/payments/token-plan": tokenPlan,
  "drizzle-orm": { sql },
});
const cancelCode = compile("../src/app/api/storefront/orders/cancel/route.ts");
const tables = Object.fromEntries(["storefrontOrders", "orders", "aiActivityLogs"].map(name => [name, { name, id: "id", orderRef: "orderRef" }]));
const responseApi = { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init?.headers } }) } };

function expectedRef(key) {
  return `BS-WEB-${createHash("sha256").update(key).digest("hex")}`;
}
function queryRows(rows, condition) {
  return rows.filter(row => row[condition.column] === condition.value);
}
function selectable(rows) {
  return {
    limit(count) {
      const limited = rows.slice(0, count);
      return {
        for: async () => limited,
        then: (resolve, reject) => Promise.resolve(limited).then(resolve, reject),
      };
    },
    for: async () => rows,
  };
}

function setup({ gatewayOrderId = "" } = {}) {
  const key = "checkout_cancel_key_12345";
  const orderRef = expectedRef(key);
  let stockCount = 3;
  const notes = tokenPlan.appendPaymentMeta("", {
    checkout_request_hash: "hash",
    inventory_reserved: true,
    inventory_reserved_qty: 2,
    inventory_released: false,
    ...(gatewayOrderId ? { razorpay_order_id: gatewayOrderId } : {}),
  });
  const state = {
    storefrontOrders: [{ id: 1, orderRef, productId: 9, quantity: 2, paymentStatus: "TOKEN_PENDING", fulfillmentStatus: "TOKEN_PAYMENT_PENDING", notes }],
    orders: [{ id: 1, orderNumber: orderRef, userId: 1, paymentStatus: "TOKEN_PENDING", fulfillmentStatus: "TOKEN_PAYMENT_PENDING", aiDecisionLog: "created" }],
    aiActivityLogs: [],
  };

  const db = { async transaction(fn) {
    const draft = structuredClone(state);
    let draftStock = stockCount;
    const tx = {
      async execute(query) {
        const statement = Array.isArray(query?.parts) ? query.parts.join("") : "";
        if (/UPDATE products/i.test(statement) && /stock_count\s*=\s*stock_count\s*\+/i.test(statement)) {
          draftStock += Number(query.values?.[0] || 0);
          return { rows: [{ stock_count: draftStock }] };
        }
        return { rows: [] };
      },
      select() {
        return { from(table) {
          return { where(condition) {
            const source = draft[table.name] || [];
            return selectable(queryRows(source, condition));
          } };
        } };
      },
      update(table) {
        return { set(values) {
          return { where(condition) {
            const rows = queryRows(draft[table.name], condition);
            for (const row of rows) Object.assign(row, values);
            return {
              returning: async () => rows,
              then: (resolve, reject) => Promise.resolve({ rowCount: rows.length }).then(resolve, reject),
            };
          } };
        } };
      },
      insert(table) {
        return { values(value) {
          draft[table.name].push({ id: draft[table.name].length + 1, ...value });
          return Promise.resolve();
        } };
      },
    };
    const result = await fn(tx);
    Object.assign(state, draft);
    stockCount = draftStock;
    return result;
  } };

  const { POST } = evaluate(cancelCode, {
    "@/db": { db },
    "@/db/schema": tables,
    "@/lib/orders/inventory-reservation": inventory,
    "@/lib/payments/token-plan": tokenPlan,
    "drizzle-orm": { eq, sql },
    "next/server": responseApi,
  });
  const request = (requestKey = key) => POST(new Request("http://localhost/api/storefront/orders/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
    body: JSON.stringify({ orderRef, reason: "checkout_group_prepare_failed" }),
  }));
  return { state, key, orderRef, request, stock: () => stockCount };
}

test("cancellation releases reserved inventory exactly once and synchronizes both order records", async () => {
  const app = setup();
  const first = await app.request();
  const firstBody = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstBody.cancelled, true);
  assert.equal(firstBody.inventoryReleased, true);
  assert.equal(app.stock(), 5);
  assert.equal(app.state.storefrontOrders[0].paymentStatus, "CANCELLED");
  assert.equal(app.state.storefrontOrders[0].fulfillmentStatus, "Cancelled");
  assert.equal(app.state.orders[0].paymentStatus, "CANCELLED");
  assert.equal(app.state.aiActivityLogs.length, 1);

  const second = await app.request();
  const secondBody = await second.json();
  assert.equal(second.status, 200);
  assert.equal(secondBody.inventoryReleased, false);
  assert.equal(app.stock(), 5);
  assert.equal(app.state.aiActivityLogs.length, 1);
});

test("cancellation key must match the opaque order reference before any inventory change", async () => {
  const app = setup();
  const response = await app.request("checkout_cancel_key_wrong_999");
  assert.equal(response.status, 403);
  assert.equal(app.stock(), 3);
  assert.equal(app.state.storefrontOrders[0].paymentStatus, "TOKEN_PENDING");
});

test("orders with an active gateway session do not release inventory without verified gateway state", async () => {
  const app = setup({ gatewayOrderId: "order_test_123" });
  const response = await app.request();
  assert.equal(response.status, 409);
  assert.equal(app.stock(), 3);
  assert.equal(app.state.storefrontOrders[0].paymentStatus, "TOKEN_PENDING");
});
