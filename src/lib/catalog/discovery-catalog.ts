import { ProviderId } from "@/lib/suppliers/source-registry";

export const UNIVERSAL_CATALOGUE_CATEGORIES = [
  "Mobiles & Tablets", "Laptops & Computers", "Gaming", "TV & Home Entertainment",
  "Furniture", "Home & Kitchen", "Appliances", "Fashion", "Footwear", "Beauty & Personal Care",
  "Toys & Kids", "Sports & Fitness", "Automotive", "Tools & Hardware", "Pet Supplies",
  "Books & Stationery", "Grocery", "Jewellery & Accessories", "Travel", "Office & Business",
] as const;

export type DiscoveryPlan = { category: string; queries: string[]; providers: ProviderId[] };

const PROVIDERS: ProviderId[] = [
  "cj", "deodap", "dropdash", "indiamart", "meesho", "shopsy", "udaan", "qikink", "ondc",
  "amazon", "flipkart", "myntra", "ajio", "nykaa", "jiomart", "tatacliq", "snapdeal",
  "aliexpress", "temu", "other",
];

const FASHION_QUERIES=[
  "wholesale oversized t shirt India low MOQ under 100",
  "wholesale baggy t shirt India low price supplier",
  "oversized t shirt under 199 India",
  "crop top under 199 India wholesale",
  "Gen Z streetwear oversized graphic t shirt India",
  "front back print oversized t shirt India supplier",
  "anime inspired oversized t shirt India streetwear",
  "heavy gsm oversized t shirt India wholesale",
];

export function buildDiscoveryPlan(perCategory = 8): DiscoveryPlan[] {
  return UNIVERSAL_CATALOGUE_CATEGORIES.map(category => ({
    category,
    queries: (category==="Fashion"?FASHION_QUERIES:[
      `best selling ${category} India`,
      `trending ${category} India`,
      `cheap ${category} India`,
      `popular ${category} India`,
      `new ${category} India`,
      `best value ${category} India`,
      `online ${category} India`,
      `buy ${category} India`,
    ]).slice(0, Math.max(1, Math.min(8, perCategory))),
    providers: PROVIDERS,
  }));
}
