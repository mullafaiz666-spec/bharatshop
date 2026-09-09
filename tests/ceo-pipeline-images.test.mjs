import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("CEO pending KPI counts only products actually waiting for CEO review", () => {
  const src = read("src/app/api/overview/route.ts");
  assert.match(src, /const ceoPendingCount=statusCounts\.CEO_PENDING\|\|0/);
  assert.match(src, /ceoApprovedProductsCount:ceoApprovedCount/);
  assert.match(src, /marketResearchPendingProductsCount:marketResearchPendingCount/);
  assert.doesNotMatch(src, /CEO_PENDING\|\|0\)\+\(statusCounts\.CEO_APPROVED/);
});

test("CEO cycle retries previously approved products and isolates market benchmark blockers", () => {
  const src = read("src/app/api/automation/ceo-cycle/route.ts");
  assert.match(src, /CEO_PENDING","CEO_APPROVED","MARKET_RESEARCH_PENDING/);
  assert.match(src, /MARKET_RESEARCH_PENDING/);
  assert.match(src, /marketRetryMs/);
  assert.match(src, /market price could not be verified/i);
});

test("storefront has a client-side broken-image recovery guard", () => {
  const src = read("src/components/StorefrontPolish.tsx");
  assert.match(src, /document\.addEventListener\("error", recoverImage, true\)/);
  assert.match(src, /api\/fashion-art/);
  assert.match(src, /icons\/icon-512\.png/);
});
