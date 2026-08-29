export type QikinkRate = {
  code: string;
  name: string;
  baseInr: number;
  gstPct: number;
};

export const QIKINK_PRODUCTS: QikinkRate[] = [
  { code: "UC21", name: "Unisex Classic Crew T-Shirt", baseInr: 190, gstPct: 5 },
  { code: "US21", name: "Unisex Standard Crew T-Shirt", baseInr: 170, gstPct: 5 },
  { code: "UV34", name: "V-Neck T-Shirt", baseInr: 200, gstPct: 5 },
  { code: "UA31", name: "AOP T-Shirt", baseInr: 330, gstPct: 5 },
  { code: "UA52", name: "AOP Sports Shorts", baseInr: 350, gstPct: 5 },
  { code: "UC22", name: "Oversized Classic T-Shirt", baseInr: 265, gstPct: 5 },
  { code: "US22", name: "Oversized Standard T-Shirt", baseInr: 225, gstPct: 5 },
  { code: "UT27", name: "Terry Oversized Tee", baseInr: 300, gstPct: 5 },
  { code: "UJ31", name: "Varsity Jacket", baseInr: 775, gstPct: 5 },
];

export const QIKINK_PRINTING = {
  dtf: { minInr: 80, perSqInInr: 0.75, gstPct: 5 },
  dtgWhite: { minInr: 50, perSqInInr: 0.5, gstPct: 5 },
  dtgColor: { minInr: 100, perSqInInr: 0.75, gstPct: 5 },
  embroidery: { minInr: 100, gstPct: 5 },
};

export const QIKINK_SHIPPING = {
  surfaceInr: 42.37,
  airInr: 54,
  codInr: 34,
  gstPct: 18,
};

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function mapQikinkProduct(garment: string): QikinkRate {
  const g = normalized(garment);
  if (g.includes("oversized") && g.includes("classic")) return QIKINK_PRODUCTS.find(p => p.code === "UC22")!;
  if (g.includes("oversized")) return QIKINK_PRODUCTS.find(p => p.code === "US22")!;
  if (g.includes("v neck") || g.includes("v-neck")) return QIKINK_PRODUCTS.find(p => p.code === "UV34")!;
  if (g.includes("aop") || g.includes("all over")) return QIKINK_PRODUCTS.find(p => p.code === "UA31")!;
  if (g.includes("varsity") || g.includes("jacket")) return QIKINK_PRODUCTS.find(p => p.code === "UJ31")!;
  if (g.includes("terry")) return QIKINK_PRODUCTS.find(p => p.code === "UT27")!;
  if (g.includes("standard")) return QIKINK_PRODUCTS.find(p => p.code === "US21")!;
  return QIKINK_PRODUCTS.find(p => p.code === "UC21")!;
}

export function mapQikinkPrint(printMethod: string) {
  const p = normalized(printMethod);
  if (p.includes("dtg") && p.includes("white")) return QIKINK_PRINTING.dtgWhite;
  if (p.includes("dtg")) return QIKINK_PRINTING.dtgColor;
  if (p.includes("embroider")) return QIKINK_PRINTING.embroidery;
  return QIKINK_PRINTING.dtf;
}

export function qikinkCostForDesign(garment: string, printMethod: string) {
  const product = mapQikinkProduct(garment);
  const printing = mapQikinkPrint(printMethod);
  const shipping = QIKINK_SHIPPING.surfaceInr;
  const preGst = product.baseInr + printing.minInr + shipping;
  const gst = product.baseInr * (product.gstPct / 100) + printing.minInr * (printing.gstPct / 100) + shipping * (QIKINK_SHIPPING.gstPct / 100);
  return {
    supplier: "Qikink",
    productCode: product.code,
    productName: product.name,
    productBaseInr: product.baseInr,
    printingInr: printing.minInr,
    shippingInr: shipping,
    gstInr: Number(gst.toFixed(2)),
    landedCostInr: Number((preGst + gst).toFixed(2)),
    rateSource: "Qikink public pricing 2026",
  };
}
