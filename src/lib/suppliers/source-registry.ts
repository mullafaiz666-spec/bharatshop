export type ProviderId =
  | "cj" | "deodap" | "dropdash" | "indiamart" | "meesho" | "shopsy" | "udaan"
  | "qikink" | "ondc" | "amazon" | "flipkart" | "myntra" | "ajio" | "nykaa"
  | "jiomart" | "tatacliq" | "snapdeal" | "aliexpress" | "temu" | "other";

export type CustomerPaymentMode = "cod" | "upi" | "prepaid";

export type SourceCapabilities = {
  catalogue: boolean;
  livePrice: boolean;
  liveStock: boolean;
  serviceability: boolean;
  cod: boolean;
  upi: boolean;
  automatedFulfilment: boolean;
  customerOrderTriggered: boolean;
};

export type SourceDefinition = SourceCapabilities & {
  id: ProviderId;
  name: string;
  requiresAuthorizedAdapter: boolean;
};

const defs: Array<[ProviderId, string]> = [
  ["cj", "CJ Dropshipping"], ["deodap", "DeoDap"], ["dropdash", "Dropdash"], ["indiamart", "IndiaMART"],
  ["meesho", "Meesho"], ["shopsy", "Shopsy"], ["udaan", "Udaan"], ["qikink", "Qikink"], ["ondc", "ONDC"],
  ["amazon", "Amazon"], ["flipkart", "Flipkart"], ["myntra", "Myntra"], ["ajio", "AJIO"], ["nykaa", "Nykaa"],
  ["jiomart", "JioMart"], ["tatacliq", "Tata CLiQ"], ["snapdeal", "Snapdeal"], ["aliexpress", "AliExpress"],
  ["temu", "Temu"], ["other", "Other"],
];

// Capabilities are deliberately false until an authorized adapter/feed is configured.
// A provider being listed here does NOT mean BharatShop is authorized to order from it.
const configured = (id: ProviderId, capability: string) =>
  process.env[`SOURCE_${id.toUpperCase()}_${capability.toUpperCase()}_ENABLED`] === "true";

export const SOURCE_REGISTRY = Object.fromEntries(
  defs.map(([id, name]) => [id, {
    id, name,
    catalogue: configured(id, "catalogue"),
    livePrice: configured(id, "live_price"),
    liveStock: configured(id, "live_stock"),
    serviceability: configured(id, "serviceability"),
    cod: configured(id, "cod"),
    upi: configured(id, "upi"),
    automatedFulfilment: configured(id, "automated_fulfilment"),
    customerOrderTriggered: configured(id, "customer_order_triggered"),
    requiresAuthorizedAdapter: true,
  } satisfies SourceDefinition])
) as Record<ProviderId, SourceDefinition>;

export const getSourceDefinition = (id: ProviderId) => SOURCE_REGISTRY[id];
