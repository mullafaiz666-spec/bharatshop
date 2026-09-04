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

const defs: SourceDefinition[] = [
  ["cj","CJ Dropshipping"],["deodap","DeoDap"],["dropdash","Dropdash"],["indiamart","IndiaMART"],
  ["meesho","Meesho"],["shopsy","Shopsy"],["udaan","Udaan"],["qikink","Qikink"],["ondc","ONDC"],
  ["amazon","Amazon"],["flipkart","Flipkart"],["myntra","Myntra"],["ajio","AJIO"],["nykaa","Nykaa"],
  ["jiomart","JioMart"],["tatacliq","Tata CLiQ"],["snapdeal","Snapdeal"],["aliexpress","AliExpress"],
  ["temu","Temu"],["other","Other"]
].map(([id,name]) => ({
  id: id as ProviderId, name,
  catalogue: true, livePrice: true, liveStock: true, serviceability: true,
  cod: true, upi: true, automatedFulfilment: false, customerOrderTriggered: false,
  requiresAuthorizedAdapter: true
}));

export const SOURCE_REGISTRY = Object.fromEntries(defs.map(d => [d.id, d])) as Record<ProviderId, SourceDefinition>;
export const getSourceDefinition = (id: ProviderId) => SOURCE_REGISTRY[id];
