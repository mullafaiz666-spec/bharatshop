export type ImageStylePlan = {
  command: "/autoimage";
  productType: string;
  primaryStyle: string;
  styles: string[];
  prompt: string;
};

const rules: Array<{ type: string; re: RegExp; styles: string[]; scene: string }> = [
  { type: "fashion", re: /(fashion|saree|sari|kurti|kurta|lehenga|salwar|dress|shirt|tshirt|t-shirt|jeans|trouser|apparel|clothing|footwear|shoe|sandal|jewellery|jewelry|handbag|bag)/i, styles: ["realistic", "fashion", "studio lighting", "sharp focus", "soft natural shadows", "4k detail"], scene: "premium ecommerce fashion photography" },
  { type: "food", re: /(food|snack|chocolate|biscuit|cookie|cake|sweet|masala|spice|sauce|pickle|tea|coffee|drink|beverage)/i, styles: ["realistic", "food photo", "macro", "vibrant", "studio lighting", "sharp focus"], scene: "premium commercial food photography" },
  { type: "beauty", re: /(cosmetic|makeup|lipstick|serum|cream|shampoo|conditioner|perfume|fragrance|skincare|beauty|soap)/i, styles: ["realistic", "product photo", "studio lighting", "macro", "sharp focus", "bokeh"], scene: "luxury beauty product photography" },
  { type: "electronics", re: /(phone|mobile|laptop|computer|tablet|headphone|earbud|speaker|camera|charger|keyboard|mouse|electronic|smartwatch|watch)/i, styles: ["realistic", "product photo", "studio lighting", "sharp focus", "dramatic lighting", "4k detail"], scene: "premium consumer-electronics product photography" },
  { type: "home", re: /(furniture|sofa|chair|table|bed|mattress|lamp|light|decor|curtain|cushion|kitchen|appliance|home|interior|storage|organizer)/i, styles: ["realistic", "product photo", "interior", "studio lighting", "sharp focus", "natural shadows"], scene: "premium home and lifestyle product photography" },
  { type: "automotive", re: /(car|bike|motorcycle|scooter|automotive|helmet|tyre|tire|vehicle|auto)/i, styles: ["realistic", "cinematic", "sharp focus", "dramatic lighting", "bokeh", "4k detail"], scene: "premium automotive advertising photography" },
  { type: "outdoor", re: /(garden|camping|outdoor|travel|hiking|fitness|sports|cycle|bicycle|plant|nature)/i, styles: ["realistic", "nature", "golden hour", "sharp focus", "bokeh", "vibrant"], scene: "premium outdoor lifestyle photography" },
];

const baseStyles = ["realistic", "product photo", "studio lighting", "sharp focus", "clean commercial composition", "4k detail"];

export function planAutomaticImageStyle(input: { title: string; brand?: string; category?: string; purpose?: "catalog" | "ad" | "social" | "lifestyle" | "fashion" }) : ImageStylePlan {
  const text = `${input.title} ${input.brand || ""} ${input.category || ""}`;
  const rule = rules.find(r => r.re.test(text));
  const purpose = input.purpose || (rule?.type === "fashion" ? "fashion" : "catalog");
  let styles = rule?.styles || baseStyles;
  let scene = rule?.scene || "premium ecommerce product photography";

  if (purpose === "ad" || purpose === "social") {
    styles = [...styles.filter(x => x !== "studio lighting"), "cinematic", "dramatic lighting", "bokeh", "copy-safe negative space"];
    scene = `${scene} for a high-converting advertising creative`;
  } else if (purpose === "lifestyle") {
    styles = [...styles.filter(x => x !== "product photo"), "lifestyle photography", "natural lighting", "bokeh"];
    scene = `${scene} in a believable lifestyle setting`;
  }

  styles = [...new Set(styles)];
  const primaryStyle = styles[0];
  const prompt = [
    `Create ${scene}.`,
    `Use the supplied product reference as the source of truth for product identity.`,
    `Preserve the exact product shape, construction, materials, colors, patterns, labels, logos, proportions and distinctive details. Do not redesign, recolor or invent product features.`,
    `Apply these visual directions: ${styles.join(", ")}.`,
    purpose === "catalog" ? "Use a clean uncluttered background and center the product for ecommerce catalog use." : "Make the product the unmistakable hero and keep important details unobstructed.",
    "No fake text, invented specifications, extra products, duplicate objects, watermarks or fabricated logos."
  ].join(" ");

  return { command: "/autoimage", productType: rule?.type || "general", primaryStyle, styles, prompt };
}
