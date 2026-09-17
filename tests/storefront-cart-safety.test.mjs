import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const legacyStore = readFileSync(new URL("../public/shop.html", import.meta.url), "utf8");
const canonicalStore = readFileSync(new URL("../src/app/store/page.tsx", import.meta.url), "utf8");
const orderGateway = readFileSync(new URL("../src/app/api/storefront/orders/route.ts", import.meta.url), "utf8");

test("legacy static storefront cannot run its old client-side cart or checkout", () => {
  assert.match(legacyStore, /location\.replace\(['"]\/store['"]\)/);
  assert.match(legacyStore, /rel=["']canonical["'][^>]+href=["']\/store["']/);
  assert.doesNotMatch(legacyStore, /bs_cart|submitOrder\s*\(|localStorage\.setItem\s*\(/);
});

test("canonical storefront uses the backend order gateway and verified payment flow", () => {
  assert.match(canonicalStore, /fetch\(["']\/api\/storefront\/orders["']/);
  assert.match(canonicalStore, /\/api\/payments\/razorpay\/verify/);
  assert.match(canonicalStore, /if\(!r\.ok\|\|!vd\.verified\)throw new Error/);
  assert.match(canonicalStore, /availability\.anyConfigured/);
});

test("storefront order totals are derived from the server-side product record", () => {
  assert.match(orderGateway, /const unitPrice=Number\(product\.sellingPriceInr\)/);
  assert.match(orderGateway, /total=Number\(\(unitPrice\*qty\)\.toFixed\(2\)\)/);
  assert.doesNotMatch(orderGateway, /sellingPriceInr\s*[,=}].*body/);
});
