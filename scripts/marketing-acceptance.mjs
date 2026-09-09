#!/usr/bin/env node

const BASE = (process.env.BHARATSHOP_URL || process.env.BASE_URL || "https://bharatshop-9w4a.onrender.com").replace(/\/$/, "");

async function get(path) {
  const response = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(120000) });
  const body = await response.text();
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${body.slice(0, 500)}`);
  return { response, body };
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS  ${message}`);
}

async function main() {
  console.log(`Zero-budget marketing acceptance target: ${BASE}`);

  const statusRaw = await get("/api/marketing/status");
  const status = JSON.parse(statusRaw.body);
  expect(status.mode === "ZERO_PAID_API_DEFAULT", "zero-paid-API marketing mode is active");
  expect(status.paidAds?.enabled === false, "automatic paid ad spend is hard-disabled");
  expect(status.freeGrowth?.seo === true && status.freeGrowth?.structuredData === true, "SEO and structured data are enabled");

  const catalogRaw = await get("/api/storefront/products?limit=192");
  const catalog = JSON.parse(catalogRaw.body);
  const products = Array.isArray(catalog.products) ? catalog.products : [];
  expect(products.length >= 12, `storefront has ${products.length} publishable products for free discovery`);

  const sitemap = await get("/sitemap.xml");
  expect(/<urlset[\s>]/i.test(sitemap.body) && /\/store\/product\//i.test(sitemap.body), "sitemap exposes indexable product pages");

  const merchant = await get("/api/feeds/google-merchant");
  expect(/<rss[\s>]/i.test(merchant.body) && /<item>/i.test(merchant.body) && /<g:price>/i.test(merchant.body), "Google Merchant free-listing feed is live and non-empty");

  const meta = await get("/api/feeds/meta-catalog");
  const metaLines = meta.body.trim().split(/\r?\n/);
  expect(metaLines.length > 1 && metaLines[0].includes("image_link") && metaLines[0].includes("availability"), `Meta catalog feed is live with ${metaLines.length - 1} product rows`);

  const organicRaw = await get("/api/marketing/organic-pack");
  const organic = JSON.parse(organicRaw.body);
  expect(organic.mode === "ORGANIC_ZERO_BUDGET" && Number(organic.count) > 0, `organic social pack generated ${organic.count} posts without paid AI`);

  const first = products[0];
  const productPage = await get(`/store/product/${first.id}`);
  expect(productPage.body.includes(first.title) && productPage.body.includes("application/ld+json"), "product landing page contains product content and structured data");

  console.log("\nZERO-BUDGET MARKETING ACCEPTANCE: PASS");
}

main().catch(error => {
  console.error("\nZERO-BUDGET MARKETING ACCEPTANCE: FAIL");
  console.error(error);
  process.exit(1);
});
