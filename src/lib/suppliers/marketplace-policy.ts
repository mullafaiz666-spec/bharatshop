export type SourceLane = "DIRECT_SUPPLIER" | "DIRECT_RETAILER" | "DROPSHIP_SUPPLIER" | "MARKETPLACE_INTELLIGENCE" | "UNKNOWN";

const MARKETPLACE_HOSTS = ["meesho.com", "shopsy.in", "flipkart.com", "amazon.in", "amazon.com"];
const DROPSHIP_HOSTS = ["deodap.in", "cjdropshipping.com"];
const DIRECT_RETAIL_HOSTS = ["croma.com", "reliancedigital.in", "vijaysales.com"];
const DIRECT_HINTS = ["wholesale", "manufacturer", "supplier", "distributor", "factory", "b2b"];

function hostOf(value: string) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

export function classifySource(url: string, name = "") {
  const host = hostOf(url);
  const text = `${host} ${name}`.toLowerCase();
  const marketplace = MARKETPLACE_HOSTS.some(h => host === h || host.endsWith(`.${h}`));
  const dropship = DROPSHIP_HOSTS.some(h => host === h || host.endsWith(`.${h}`));
  const directRetailer = DIRECT_RETAIL_HOSTS.some(h => host === h || host.endsWith(`.${h}`));
  const direct = DIRECT_HINTS.some(h => text.includes(h));
  const lane: SourceLane = marketplace ? "MARKETPLACE_INTELLIGENCE" : dropship ? "DROPSHIP_SUPPLIER" : directRetailer ? "DIRECT_RETAILER" : direct ? "DIRECT_SUPPLIER" : "UNKNOWN";
  const retailOverride = process.env.ALLOW_RETAIL_MARKETPLACE_FULFILLMENT === "true";
  const fulfillmentAllowed = !marketplace || retailOverride;
  const requiresHumanApproval = directRetailer || (marketplace && retailOverride);
  return {
    lane,
    host,
    benchmarkAllowed: Boolean(host),
    fulfillmentAllowed,
    requiresHumanApproval,
    reason: marketplace && !retailOverride
      ? "Retail marketplace is benchmark-only by default; find the underlying seller/direct supplier or explicitly enable the fulfillment override."
      : marketplace
        ? "Retail marketplace fulfillment override is enabled; final purchase still requires live evidence and human approval."
        : directRetailer
          ? "Known direct electronics retailer: live price, stock and shipping evidence are required and final purchase remains human-gated."
          : "Source can proceed to the normal live-evidence/economics gate.",
  };
}

export function marketplaceSearchQueries(productName: string) {
  const q = productName.trim();
  return [
    `${q} wholesale supplier manufacturer distributor India`,
    `${q} official store India`,
    `${q} site:croma.com`,
    `${q} site:reliancedigital.in`,
    `${q} site:vijaysales.com`,
    `${q} site:meesho.com`,
    `${q} site:shopsy.in`,
    `${q} site:flipkart.com`,
    `${q} site:amazon.in`,
  ];
}

export const marketplacePolicySummary = {
  benchmarkMarketplaces: ["Meesho", "Shopsy", "Flipkart", "Amazon"],
  directRetailers: ["Croma", "Reliance Digital", "Vijay Sales"],
  defaultRetailFulfillment: "benchmark-only",
  directRetailRule: "live evidence + economics + human-gated final purchase",
  overrideEnv: "ALLOW_RETAIL_MARKETPLACE_FULFILLMENT",
  selectionRule: "lowest verified SAFE landed cost after source-policy, stock, shipping and margin gates",
};
