import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("agent suite v4 exposes Image and Media as a first-class operational agent", () => {
  const contracts = read("src/lib/agents/contracts.ts");
  const runtime = read("src/lib/agents/runtime.ts");
  const company = read("src/lib/agents/company-runtime.ts");
  assert.match(contracts, /\| "image-media"/);
  assert.match(contracts, /name: "Image & Media Agent"/);
  assert.match(contracts, /endpoint: "\/api\/agents\/image-media"/);
  assert.match(runtime, /"image & media": "image-media"/);
  assert.match(runtime, /"image-media": \["catalog_query", "research_web", "resolve_product_images"\]/);
  assert.match(company, /agentId: "image-media"/);
  assert.match(company, /Repair truthful product media/);
});

test("image evidence validator performs safe byte-level verification and exact duplicate removal", () => {
  const evidence = read("src/lib/ai/image-evidence.ts");
  const resolver = read("src/lib/ai/media-resolver.ts");
  assert.match(evidence, /redirect: "manual"/);
  assert.match(evidence, /lookup\(hostname/);
  assert.match(evidence, /private\/reserved image address/);
  assert.match(evidence, /sniffMediaType/);
  assert.match(evidence, /jpegDimensions/);
  assert.match(evidence, /webpDimensions/);
  assert.match(evidence, /createHash\("sha256"\)/);
  assert.match(evidence, /DUPLICATE_BYTES/);
  assert.match(evidence, /semanticVisionPerformed: false/);
  assert.match(resolver, /validateImageCandidate/);
  assert.match(resolver, /dedupeImageEvidence/);
  assert.match(resolver, /technicalValidation/);
  assert.match(resolver, /semanticVisionPerformed: false/);
  assert.doesNotMatch(resolver, /async function downloadImage/);
});

test("commerce source evidence has explicit expiry policies and listing blocks stale evidence", () => {
  const freshness = read("src/lib/evidence/freshness.ts");
  const source = read("src/lib/source-evidence.ts");
  const verify = read("src/app/api/agents/source-verify/route.ts");
  const listing = read("src/app/api/agents/listing/route.ts");
  assert.match(freshness, /PRICE: \{ ttlSec: 6 \* 60 \* 60/);
  assert.match(freshness, /AVAILABILITY: \{ ttlSec: 6 \* 60 \* 60/);
  assert.match(freshness, /SHIPPING: \{ ttlSec: 24 \* 60 \* 60/);
  assert.match(freshness, /SUPPLIER: \{ ttlSec: 7 \* 24 \* 60 \* 60/);
  assert.match(source, /commerceFreshnessBundle\(checkedAt\)/);
  assert.match(verify, /freshnessCurrent/);
  assert.match(verify, /sourceVerification:\{verifiedAt:now\.toISOString\(\),checkedAt:/);
  assert.match(listing, /sourceFreshness\.current/);
  assert.match(listing, /Persisted source evidence has expired and must be re-verified/);
});

test("deep health probes live dependencies and evaluates every agent runtime mapping", () => {
  const readiness = read("src/lib/agents/readiness.ts");
  const health = read("src/app/api/agents/health/route.ts");
  assert.match(readiness, /checkAI\(true\)/);
  assert.match(readiness, /probeDatabase/);
  assert.match(readiness, /probeSearch/);
  assert.match(readiness, /to_regclass\('public\.agent_work_items'\)/);
  assert.match(readiness, /agentRuntimeCatalog\(\)/);
  assert.match(readiness, /case "image-media"/);
  assert.match(readiness, /summary: \{ total: agents\.length, ready: agents\.length - blocked\.length, blocked, allReady:/);
  assert.match(health, /deepAgentReadiness/);
  assert.match(health, /DEEP_LIVE_DEPENDENCY_PROBE/);
  assert.match(health, /Agent Suite v4/);
});

test("Image and Media API is authenticated and never labels technical evidence as semantic vision", () => {
  const route = read("src/app/api/agents/image-media/route.ts");
  assert.match(route, /getAdminUser/);
  assert.match(route, /BHARATSHOP_AUTOMATION_TOKEN/);
  assert.match(route, /Unauthorized/);
  assert.match(route, /byte_level_content_sniffing/);
  assert.match(route, /sha256_duplicate_removal/);
  assert.match(route, /Technical\/source evidence is explicitly distinct from semantic AI vision/);
});
