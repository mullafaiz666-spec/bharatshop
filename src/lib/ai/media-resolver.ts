// ─────────────────────────────────────────────────────────────────────────────
// MEDIA RESOLVER — single source of truth for product image resolution.
// Pipeline: SearXNG candidate search -> cheap text pre-filter (cost control
// only, not a decision-maker) -> Claude vision verification -> only images
// Claude actually confirms are saved. Never falls back to a random/generic
// stock photo. If fewer than MIN_IMAGES pass, the product is left untouched
// and marked NEEDS_IMAGES for a later retry instead of guessing.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/db";
import { productImages, products } from "@/db/schema";
import { asc, eq, ilike } from "drizzle-orm";
import { searxngImageSearch } from "@/lib/searxng";

const STOP = new Set([
  "the","with","and","for","from","pack","piece","pieces","new","best","online",
  "india","buy","sale","free","exact","product","official","image","images",
  "front","back","side","angle","box","packaging","contents","colour","colors",
  "color","variants",
]);
const BAD = /(unsplash|placeholder|placehold|picsum|loremflickr|placekitten|dummyimage|via\.placeholder)/i;
const FASHION = /(fashion|women|woman|men|man|saree|sari|kurti|kurta|dress|shirt|tshirt|t-shirt|jeans|trouser|petticoat|shapewear|lehenga|salwar|apparel|clothing|footwear|shoe|sandal|jewellery|jewelry)/i;

const ANTHROPIC_MODEL = process.env.ANTHROPIC_VISION_MODEL || "claude-sonnet-5";
const MIN_CONFIDENCE = Number(process.env.IMAGE_VERIFY_MIN_CONFIDENCE || 0.75);
const MIN_IMAGES = 4;
const MAX_IMAGES = 8;
const MAX_VISION_CANDIDATES = 10; // cap per product so one bad product can't burn unlimited vision calls

type ImageCandidate = { url: string; sourceUrl?: string; title?: string };
type Product = { id: number; title: string; brand: string; category: string };

function tokens(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((x) => x.length > 2 && !STOP.has(x));
}

// Cheap pre-filter only — decides what's worth spending a vision call on.
// Never used to decide VERIFIED/not-verified; that's Claude's job below.
function textScore(item: ImageCandidate, product: Product) {
  const ts = tokens(`${product.brand !== "Generic" ? product.brand : ""} ${product.title}`);
  const hay = `${item.title || ""} ${item.sourceUrl || item.url || ""}`.toLowerCase();
  const hits = ts.filter((t) => hay.includes(t)).length;
  return ts.length ? hits / ts.length : 0;
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 5_000_000) return null; // skip oversized images, keep the call cheap
    const data = Buffer.from(buf).toString("base64");
    return { data, mediaType: contentType.split(";")[0] };
  } catch {
    return null;
  }
}

interface VisionVerdict {
  url: string;
  matches: boolean;
  confidence: number;
  reason: string;
}

// One Claude call per product, all candidate images sent together, so the
// model can compare them against each other as well as against the spec.
async function verifyImagesWithClaude(candidates: ImageCandidate[], product: Product): Promise<VisionVerdict[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const downloaded = await Promise.all(
    candidates.map(async (c) => ({ candidate: c, image: await fetchImageAsBase64(c.url) }))
  );
  const usable = downloaded.filter((d) => d.image);
  if (!usable.length) return [];

  const content: any[] = [
    {
      type: "text",
      text:
        `Product: "${product.title}" | Brand: ${product.brand} | Category: ${product.category}\n\n` +
        `Below are ${usable.length} candidate images, labeled Image 1 through Image ${usable.length}. ` +
        `For EACH image, decide whether it genuinely depicts this exact product: correct product type, ` +
        `correct brand marks if visible, correct form factor, and correct stated color/variant if the title ` +
        `specifies one. Reject generic stock photos, lifestyle shots that don't clearly show the product, ` +
        `wrong-color or wrong-variant images, and unrelated collages.\n\n` +
        `Respond with ONLY a JSON array, one object per image, in order, no other text: ` +
        `[{"index":1,"matches":true,"confidence":0.9,"reason":"..."}]`,
    },
  ];
  usable.forEach((d, i) => {
    content.push({ type: "text", text: `Image ${i + 1}:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: d.image!.mediaType, data: d.image!.data },
    });
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`Claude vision call returned ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).map((b: any) => b.text || "").join("");

  let parsed: any[];
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    throw new Error("Claude vision returned non-JSON output");
  }

  return parsed
    .map((v: any) => {
      const idx = Number(v.index) - 1;
      const c = usable[idx]?.candidate;
      return {
        url: c?.url || "",
        matches: !!v.matches,
        confidence: Number(v.confidence) || 0,
        reason: String(v.reason || ""),
      };
    })
    .filter((v) => v.url);
}

export async function resolveVerifiedProductMedia(productId?: number, productName?: string) {
  let product: any = null;
  if (productId) product = (await db.select().from(products).where(eq(products.id, productId)).limit(1))[0];
  if (!product && productName)
    product = (
      await db.select().from(products).where(ilike(products.title, `%${productName}%`)).orderBy(asc(products.id)).limit(1)
    )[0];
  if (!product) return { status: "NOT_FOUND", reason: "Product was not found in the catalogue" };

  const fashion = FASHION.test(`${product.category} ${product.title}`);
  const base = `${product.title} ${product.brand !== "Generic" ? product.brand : ""}`.trim();
  const queries = fashion
    ? [`${base} product photo`, `${base} front back side photo`, `${base} colour variant`, `${base} packaging`]
    : [
        `${base} product photo`,
        `${base} official product image`,
        `${base} packaging accessories`,
        `${base} front back side product images`,
      ];

  const found: ImageCandidate[] = [];
  const searchErrors: string[] = [];
  for (const q of queries) {
    try {
      const results = await searxngImageSearch(q, { limit: 8, timeoutMs: 15000 });
      found.push(...results.map((r) => ({ url: r.url, sourceUrl: r.sourceUrl, title: r.title })));
    } catch (e) {
      searchErrors.push(e instanceof Error ? e.message : "SearXNG search failed");
    }
  }

  const seen = new Set<string>();
  const preFiltered = found
    .filter((x) => x.url && /^https?:\/\//i.test(x.url) && !BAD.test(x.url))
    .filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true)))
    .map((x) => ({ ...x, textScore: textScore(x, product) }))
    .filter((x) => x.textScore > 0)
    .sort((a, b) => b.textScore - a.textScore)
    .slice(0, MAX_VISION_CANDIDATES);

  if (!preFiltered.length) {
    return {
      status: "NEEDS_IMAGES",
      productId: product.id,
      product: product.title,
      imageCount: 0,
      searched: queries,
      searchErrors,
      message: "No plausible candidate images found. Listing left unchanged.",
    };
  }

  let verdicts: VisionVerdict[];
  try {
    verdicts = await verifyImagesWithClaude(preFiltered, product);
  } catch (e) {
    return {
      status: "VERIFICATION_FAILED",
      productId: product.id,
      product: product.title,
      error: e instanceof Error ? e.message : "Claude vision verification failed",
      message: "Vision verification could not run. Listing left unchanged rather than guessing.",
    };
  }

  const accepted = verdicts
    .filter((v) => v.matches && v.confidence >= MIN_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_IMAGES);

  if (accepted.length < MIN_IMAGES) {
    return {
      status: "NEEDS_IMAGES",
      productId: product.id,
      product: product.title,
      imageCount: accepted.length,
      verdicts,
      searched: queries,
      message: `Only ${accepted.length} image(s) passed vision verification (need ${MIN_IMAGES}). Listing left unchanged.`,
    };
  }

  const meta = accepted.map((v) => preFiltered.find((d) => d.url === v.url));

  await db.delete(productImages).where(eq(productImages.productId, product.id));
  await db.insert(productImages).values(
    accepted.map((v, index) => ({
      productId: product.id,
      imageUrl: v.url,
      sourceUrl: meta[index]?.sourceUrl || v.url,
      sortOrder: index,
      altText: meta[index]?.title || `${product.title} view ${index + 1}`,
      verificationStatus: "AI_VISION_VERIFIED",
    }))
  );
  await db.update(products).set({ imageUrl: accepted[0].url, updatedAt: new Date() }).where(eq(products.id, product.id));

  return {
    status: "COMPLETE_MEDIA_RESOLVED",
    provider: "searxng+claude-vision",
    productId: product.id,
    product: product.title,
    imageCount: accepted.length,
    images: accepted.map((v) => ({ url: v.url, confidence: v.confidence, reason: v.reason })),
    message: `${accepted.length} images passed Claude vision verification and were saved.`,
  };
}

export async function resolveVerifiedMediaForProducts(productList: Array<{ id: number }>, maxBatch = 25) {
  const batch = productList.slice(0, maxBatch);
  const out: any[] = [];
  for (const p of batch) {
    try {
      out.push(await resolveVerifiedProductMedia(p.id));
    } catch (e) {
      out.push({ status: "ERROR", productId: p.id, error: e instanceof Error ? e.message : "resolve failed" });
    }
  }
  return out;
}
