import "server-only";

import { db } from "@/db";
import { productDetails, productImages, products as productTable } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Product, ProductCategory } from "@/lib/bharatdrip/products";

type Specs = Record<string, unknown>;

const LOCAL_HOST = /^(?:0\.0\.0\.0|127(?:\.\d{1,3}){3}|localhost|\[::1\])$/i;
const FASHION_IMAGE_STATUS = new Set(["AI_GENERATED_ORIGINAL", "AI_GENERATED_EDITORIAL"]);

function specsOf(value: unknown): Specs {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Specs : {};
}

function cleanText(value: unknown, fallback = "") {
  return String(value || fallback).replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "drop";
}

function categoryFor(title: string, specs: Specs): Exclude<ProductCategory, "All"> {
  const text = [
    title,
    specs.qikinkProductName,
    specs.printMethod,
    specs.collection,
  ].map(value => cleanText(value)).join(" ").toLowerCase();

  if (/hood/.test(text)) return "Hoodies";
  if (/varsity|jacket|outerwear|shell|overshirt/.test(text)) return "Outerwear";
  if (/pant|trouser|denim|jean|short|bottom/.test(text)) return "Bottoms";
  if (/cap|hat|bag|tote|accessor/.test(text)) return "Accessories";
  return "Tops";
}

function publicImage(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return "";
  if (raw.startsWith("/api/fashion-art/") || raw.startsWith("/api/fashion-photo/")) return raw;
  try {
    const url = new URL(raw);
    if (LOCAL_HOST.test(url.hostname) && (url.pathname.startsWith("/api/fashion-art/") || url.pathname.startsWith("/api/fashion-photo/"))) {
      return `${url.pathname}${url.search}`;
    }
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function hexPalette(specs: Specs) {
  const palette = Array.isArray(specs.palette) ? specs.palette.map(String).filter(v => /^#[0-9a-f]{6}$/i.test(v)).slice(0, 4) : [];
  const garment = cleanText(specs.garmentColor);
  if (/^#[0-9a-f]{6}$/i.test(garment) && !palette.includes(garment)) palette.unshift(garment);
  return palette.length ? palette : ["#171717"];
}

function detailLines(specs: Specs, material: string) {
  return [
    cleanText(specs.qikinkProductName) && `Made to order on ${cleanText(specs.qikinkProductName)}`,
    cleanText(specs.printMethod) && `Print method: ${cleanText(specs.printMethod)}`,
    material && `Material: ${material}`,
    "Original BharatDrip artwork",
    "Made to order after purchase",
  ].filter(Boolean) as string[];
}

export async function getLiveBharatDripProducts(): Promise<Product[]> {
  const bharatDrip = await db.select().from(productTable)
    .where(and(eq(productTable.status, "Published"), eq(productTable.brand, "BharatDrip")))
    .orderBy(desc(productTable.updatedAt));

  if (!bharatDrip.length) return [];

  const ids = bharatDrip.map(row => row.id);
  const [details, images] = await Promise.all([
    db.select().from(productDetails).where(inArray(productDetails.productId, ids)),
    db.select().from(productImages).where(inArray(productImages.productId, ids)),
  ]);

  const detailMap = new Map(details.map(row => [row.productId, row]));
  const imageMap = new Map<number, string[]>();

  for (const image of images) {
    if (!image.verifiedAt || !FASHION_IMAGE_STATUS.has(String(image.verificationStatus))) continue;
    const src = publicImage(image.imageUrl);
    if (!src) continue;
    const current = imageMap.get(image.productId) || [];
    if (!current.includes(src)) current.push(src);
    imageMap.set(image.productId, current);
  }

  return bharatDrip.flatMap((row): Product[] => {
    const detail = detailMap.get(row.id);
    const specs = specsOf(detail?.specificationsJson);
    const origin = cleanText(specs.designOrigin || row.brand).toLowerCase();
    if (origin !== "bharatdrip") return [];

    const gallery = imageMap.get(row.id) || [];
    const primary = publicImage(row.imageUrl);
    const images = Array.from(new Set([primary, ...gallery].filter(Boolean))).slice(0, 8);
    if (!images.length) return [];

    const title = cleanText(row.title, `BharatDrip Drop ${row.id}`);
    const sizes = Array.isArray(specs.sizes) ? specs.sizes.map(value => cleanText(value)).filter(Boolean) : [];
    const palette = hexPalette(specs);
    const description = cleanText(detail?.description || row.aiMarketingCopy, "Original BharatDrip made-to-order streetwear.");
    const material = cleanText(detail?.material);
    const selling = Number(row.sellingPriceInr || 0);
    const mrp = Number(row.mrpInr || 0);
    if (!Number.isFinite(selling) || selling <= 0) return [];

    return [{
      id: `live-${row.id}`,
      liveProductId: row.id,
      slug: `live-${row.id}-${slugify(title)}`,
      name: title,
      tagline: cleanText(specs.trendName || specs.collection, "Made-to-order BharatDrip"),
      category: categoryFor(title, specs),
      price: selling,
      compareAt: mrp > selling ? mrp : undefined,
      color: cleanText(detail?.colorOptions, "Designer palette"),
      colors: palette,
      sizes: sizes.length ? sizes : ["S", "M", "L", "XL"],
      images,
      badge: "New drop",
      rating: 0,
      reviewCount: 0,
      description,
      details: detailLines(specs, material),
      fit: "Made to order. Choose your usual size from the available garment sizes.",
      reviews: [],
      madeToOrder: true,
      dynamic: true,
    }];
  });
}

export async function getLiveBharatDripProduct(slug: string): Promise<Product | undefined> {
  const match = /^live-(\d+)-/.exec(slug);
  if (!match) return undefined;
  const id = Number(match[1]);
  if (!Number.isInteger(id) || id <= 0) return undefined;
  const products = await getLiveBharatDripProducts();
  return products.find(product => product.liveProductId === id);
}
