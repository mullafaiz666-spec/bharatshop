import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/app/bharatdrip/page.tsx", import.meta.url), "utf8");
const live = readFileSync(new URL("../src/lib/bharatdrip/live-products.ts", import.meta.url), "utf8");
const card = readFileSync(new URL("../src/components/bharatdrip/product-card.tsx", import.meta.url), "utf8");
const detailPage = readFileSync(new URL("../src/app/bharatdrip/products/[slug]/page.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../src/components/bharatdrip/product-detail.tsx", import.meta.url), "utf8");

test("BharatDrip storefront merges published database drops with the themed catalogue", () => {
  assert.ok(page.includes("getLiveBharatDripProducts"));
  assert.ok(page.includes("initialProducts={catalogue}"));
  assert.ok(live.includes('eq(productTable.status, "Published")'));
  assert.ok(live.includes('eq(productTable.brand, "BharatDrip")'));
  assert.ok(live.includes('origin !== "bharatdrip"'));
});

test("live BharatDrip drops use dedicated brand detail routes", () => {
  assert.ok(card.includes("/bharatdrip/products/"));
  assert.ok(detailPage.includes("getLiveBharatDripProduct"));
  assert.ok(detailPage.includes('slug.startsWith("live-")'));
});

test("new AI-created drops do not fabricate customer ratings or reviews", () => {
  assert.ok(live.includes("rating: 0"));
  assert.ok(live.includes("reviewCount: 0"));
  assert.ok(live.includes("reviews: []"));
  assert.ok(detail.includes("no customer reviews yet"));
  assert.ok(detail.includes("We do not generate or display invented buyer reviews."));
});
