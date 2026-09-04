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

export function buildDiscoveryPlan(perCategory = 8): DiscoveryPlan[] {
  return UNIVERSAL_CATALOGUE_CATEGORIES.map(category => ({
    category,
    queries: [
      `best selling ${category} India`,
      `trending ${category} India`,
      `cheap ${category} India`,
      `popular ${category} India`,
      `new ${category} India`,
      `best value ${category} India`,
      `online ${category} India`,
      `buy ${category} India`,
    ].slice(0, Math.max(1, Math.min(8, perCategory))),
    providers: PROVIDERS,
  }));
}
