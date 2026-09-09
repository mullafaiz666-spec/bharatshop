import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("agent suite v2 defines all production roles and approval constitution", () => {
  const src = read("src/lib/agents/contracts.ts");
  for (const id of ["ceo","source-discovery","source-verification","seller-discovery","listing","marketing","advertising","order-recheck","tracking","learning","automation","web-design"]) assert.match(src, new RegExp(`\\b${id.replace(/-/g,"[-]")}\\b`));
  assert.match(src, /Never reset, wipe, drop, destructively reseed/);
  assert.match(src, /Paid ad spend, refunds\/payouts, external supplier purchase submission/);
});

test("seller discovery is free and no longer requires SerpAPI", () => {
  const src = read("src/app/api/agents/seller-discovery/route.ts");
  assert.match(src, /serpSearch/);
  assert.match(src, /SearXNG/);
  assert.doesNotMatch(src, /SERPAPI_API_KEY/);
});

test("marketplace lanes benchmark Meesho Shopsy Flipkart Amazon without default retail fulfillment", () => {
  const src = read("src/lib/suppliers/marketplace-policy.ts");
  for (const host of ["meesho.com","shopsy.in","flipkart.com","amazon.in"]) assert.match(src, new RegExp(host.replace(".","\\.")));
  assert.match(src, /ALLOW_RETAIL_MARKETPLACE_FULFILLMENT/);
  assert.match(src, /benchmark-only/);
});

test("Meta Pixel and Conversions API use shared event ids and do not let analytics invalidate payment", () => {
  const pixel = read("src/components/MarketingPixels.tsx");
  const meta = read("src/lib/marketing/meta.ts");
  const razorpay = read("src/app/api/payments/razorpay/verify/route.ts");
  const cashfree = read("src/app/api/payments/cashfree/status/route.ts");
  assert.match(pixel, /eventID: id/);
  assert.match(pixel, /\/api\/marketing\/meta\/events/);
  assert.doesNotMatch(pixel, /fbq\('track', 'PageView'\)/);
  assert.match(meta, /META_CONVERSIONS_API_TOKEN/);
  assert.match(meta, /action_source: "website"/);
  assert.match(razorpay, /sendMetaConversion/);
  assert.match(cashfree, /cashfreeCredentials/);
  assert.match(cashfree, /sendMetaConversion/);
});
