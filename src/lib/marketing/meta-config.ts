// Configuration diagnostics return names and states only, never credentials.
export function metaConfiguration() {
  const value = (key: string) => process.env[key]?.trim() || "";
  const browser = value("NEXT_PUBLIC_META_PIXEL_ID");
  const legacyServerPixel = value("META_PIXEL_ID");
  const dataset = value("META_DATASET_ID") || legacyServerPixel || browser;
  const version = value("META_GRAPH_API_VERSION") || "v26.0";
  const issues: string[] = [];
  for (const key of ["NEXT_PUBLIC_META_PIXEL_ID", "META_PIXEL_ID", "META_DATASET_ID", "META_PAGE_ID", "META_INSTAGRAM_ACCOUNT_ID", "META_CATALOG_ID"]) {
    if (value(key) && !/^\d+$/.test(value(key))) issues.push(`${key} must contain digits only`);
  }
  if (value("META_AD_ACCOUNT_ID") && !/^(act_)?\d+$/.test(value("META_AD_ACCOUNT_ID"))) issues.push("META_AD_ACCOUNT_ID must be numeric, optionally prefixed with act_");
  if (!/^v\d+\.\d+$/.test(version)) issues.push("META_GRAPH_API_VERSION must use vNN.N format");
  if (!value("META_DATASET_ID") && browser && legacyServerPixel && browser !== legacyServerPixel) {
    issues.push("META_PIXEL_ID and NEXT_PUBLIC_META_PIXEL_ID must match unless META_DATASET_ID is explicitly configured");
  }
  const token = value("META_CONVERSIONS_API_TOKEN") || value("META_ACCESS_TOKEN");
  return {
    status: issues.length ? "INVALID" : browser || dataset || value("META_ACCESS_TOKEN") ? "NOT_VERIFIED" : "NOT_CONFIGURED",
    issues,
    browserPixelConfigured: /^\d+$/.test(browser),
    datasetConfigured: /^\d+$/.test(dataset),
    conversionsApiConfigured: /^\d+$/.test(dataset) && Boolean(token) && !issues.length,
    domainVerificationConfigured: Boolean(value("NEXT_PUBLIC_META_DOMAIN_VERIFICATION")),
    catalogConfigured: /^\d+$/.test(value("META_CATALOG_ID")),
    testMode: Boolean(value("META_TEST_EVENT_CODE")),
    graphApiVersion: /^v\d+\.\d+$/.test(version) ? version : null,
    requiredForBrowserTracking: ["NEXT_PUBLIC_META_PIXEL_ID"],
    requiredForServerTracking: ["META_DATASET_ID or META_PIXEL_ID or NEXT_PUBLIC_META_PIXEL_ID", "META_CONVERSIONS_API_TOKEN or META_ACCESS_TOKEN"],
    rebuildRequiredForPublicSettings: true,
    verificationEndpoint: "/api/marketing/connections",
    catalogFeed: "/api/feeds/meta-catalog",
    spendEnabled: false,
  };
}
