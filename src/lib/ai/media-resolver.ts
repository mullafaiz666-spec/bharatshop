import { db } from "@/db";
import { productImages, products } from "@/db/schema";
import { asc, eq, ilike } from "drizzle-orm";
import { searxngImageSearch, SearXNGRateLimitError } from "@/lib/searxng";
import { dedupeImageEvidence, validateImageCandidate, type ImageEvidence } from "@/lib/ai/image-evidence";

const STOP = new Set(["the","with","and","for","from","pack","piece","pieces","new","best","online","india","buy","sale","free","exact","product","official","image","images","front","back","side","angle","box","packaging","contents","colour","colors","color","variants"]);
const BAD = /(unsplash|placeholder|placehold|picsum|loremflickr|placekitten|dummyimage|via\.placeholder)/i;
const FASHION = /(fashion|women|woman|men|man|saree|sari|kurti|kurta|dress|shirt|tshirt|t-shirt|jeans|trouser|petticoat|shapewear|lehenga|salwar|apparel|clothing|footwear|shoe|sandal|jewellery|jewelry)/i;
const MTO_FASHION_BRANDS = new Set(["bharatshop studio", "bharatdrip"]);
const MIN_CONFIDENCE = Number(process.env.IMAGE_VERIFY_MIN_CONFIDENCE || 0.75);
const MIN_STANDARD_IMAGES = Math.max(1, Number(process.env.MIN_STANDARD_PRODUCT_IMAGES || 1));
const MIN_FASHION_IMAGES = Math.max(4, Number(process.env.MIN_FASHION_PRODUCT_IMAGES || 4));
const MAX_IMAGES = 8;
const MAX_CANDIDATES = 12;
const SEARCH_LIMIT = 10;
const FAILURE_CACHE_MS = 10 * 60 * 1000;
const VERIFIER_PROVIDER = "local-evidence";
const VERIFIER_MODEL = "local-evidence-v2-byte-validated";
const inFlight = new Map<number, Promise<any>>();
const recentFailures = new Map<number, { expiresAt: number; result: any }>();

type Candidate = { url: string; sourceUrl?: string; title?: string; textScore?: number };
type Product = { id: number; title: string; brand: string; category: string; sellingPriceInr?: unknown; mrpInr?: unknown; stockCount?: unknown; status?: string };
type Usable = { candidate: Candidate; evidence: ImageEvidence };

function tokens(s: string) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(x => x.length > 2 && !STOP.has(x));
}

function textScore(item: Candidate, product: Product) {
  const expected = tokens(`${product.brand !== "Generic" ? product.brand : ""} ${product.title}`);
  const hay = `${item.title || ""} ${item.sourceUrl || ""} ${item.url || ""}`.toLowerCase();
  const hits = expected.filter(t => hay.includes(t)).length;
  return expected.length ? hits / expected.length : 0;
}

function isFashionLike(product: Product) {
  return FASHION.test(`${product.category} ${product.title}`);
}

function usesStrictDesignerMediaGate(product: Product) {
  return MTO_FASHION_BRANDS.has(String(product.brand || "").trim().toLowerCase());
}

function minimumImages(product: Product) {
  return usesStrictDesignerMediaGate(product) ? MIN_FASHION_IMAGES : MIN_STANDARD_IMAGES;
}

function candidateDataReady(product: Product) {
  const selling = Number(product.sellingPriceInr);
  const mrp = Number(product.mrpInr);
  const stock = Number(product.stockCount);
  return selling > 0 && mrp >= selling && stock > 0;
}

function nextMediaStatus(product: Product, dataReady: boolean) {
  const current = String(product.status || "");
  if (["Published", "CEO_APPROVED", "BLOCKED"].includes(current)) return current;
  return dataReady ? "CEO_PENDING" : current || "STAGED";
}

function cacheFailure(id: number, result: any) {
  recentFailures.set(id, { expiresAt: Date.now() + FAILURE_CACHE_MS, result });
}

function verifyWithLocalEvidence(usable: Usable[], product: Product) {
  const brandTokens = product.brand && product.brand !== "Generic" ? tokens(product.brand) : [];
  return usable.map((entry, index) => {
    const hay = `${entry.candidate.title || ""} ${entry.candidate.sourceUrl || ""} ${entry.candidate.url}`.toLowerCase();
    const score = Number(entry.candidate.textScore || 0);
    const brandOk = brandTokens.length === 0 || brandTokens.some(t => hay.includes(t));
    const exactTitleTokens = tokens(product.title);
    const titleHits = exactTitleTokens.filter(t => hay.includes(t)).length;
    const titleCoverage = exactTitleTokens.length ? titleHits / exactTitleTokens.length : 0;
    const evidenceScore = Math.max(score, titleCoverage);
    const technicalQuality = Number(entry.evidence.technicalQuality || 0);
    const confidence = Math.min(0.99, Number((0.45 + 0.35 * evidenceScore + 0.20 * technicalQuality).toFixed(3)));
    const matches = Boolean(entry.evidence.ok && brandOk && evidenceScore >= 0.50 && Number(entry.evidence.byteSize || 0) >= 4_000);
    return {
      index: index + 1,
      matches,
      confidence,
      reason: `technical/source evidence: tokenCoverage=${evidenceScore.toFixed(2)}, brandMatch=${brandOk}, raster=${entry.evidence.mediaType || "unknown"}, dimensions=${entry.evidence.width || 0}x${entry.evidence.height || 0}, bytes=${entry.evidence.byteSize || 0}, quality=${technicalQuality.toFixed(2)}, semanticVision=false`,
    };
  });
}

async function resolveOne(productId?: number, productName?: string) {
  let product: Product | undefined;
  if (productId) product = (await db.select().from(products).where(eq(products.id, productId)).limit(1))[0] as Product | undefined;
  if (!product && productName) product = (await db.select().from(products).where(ilike(products.title, `%${productName}%`)).orderBy(asc(products.id)).limit(1))[0] as Product | undefined;
  if (!product) return { status: "NOT_FOUND", reason: "Product was not found in the catalogue" };

  const minImages = minimumImages(product);
  const cachedFailure = recentFailures.get(product.id);
  if (cachedFailure && cachedFailure.expiresAt > Date.now()) return { ...cachedFailure.result, cachedFailure: true };
  if (cachedFailure) recentFailures.delete(product.id);

  const existing = await db.select().from(productImages).where(eq(productImages.productId, product.id));
  const approved = existing
    .filter(x => ["LOCAL_EVIDENCE_VERIFIED", "AI_VISION_VERIFIED"].includes(String(x.verificationStatus)))
    .filter(x => !BAD.test(x.imageUrl) && /^https:\/\//i.test(x.imageUrl) && Number(x.verificationConfidence) >= MIN_CONFIDENCE && !!x.verifiedAt)
    .filter(x => ["local-evidence", "local-ai"].includes(String(x.verificationProvider)))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (approved.length >= minImages) {
    const dataReady = candidateDataReady(product);
    const nextStatus = nextMediaStatus(product, dataReady);
    if (dataReady && nextStatus !== product.status) {
      await db.update(products).set({ status: nextStatus, imageUrl: approved[0].imageUrl, updatedAt: new Date() }).where(eq(products.id, product.id));
    }
    return {
      status: "COMPLETE_MEDIA_RESOLVED",
      provider: "postgres-cache",
      model: approved[0]?.verificationModel || VERIFIER_MODEL,
      productId: product.id,
      product: product.title,
      imageCount: Math.min(approved.length, MAX_IMAGES),
      requiredImageCount: minImages,
      images: approved.slice(0, MAX_IMAGES).map(x => ({ url: x.imageUrl, confidence: Number(x.verificationConfidence), reason: String((x.verificationMetadata as any)?.reason || "Previously verified") })),
      cached: true,
      publicationGate: dataReady ? "PASS" : "BLOCK",
      productStatus: nextStatus,
      nextStage: dataReady && nextStatus === "CEO_PENDING" ? "CEO_REVIEW" : nextStatus,
    };
  }

  const base = `${product.title} ${product.brand !== "Generic" ? product.brand : ""}`.trim();
  const queries = isFashionLike(product)
    ? [`${base} product photo`, `${base} front back colour variant`]
    : [`${base} official product image`, `${base} packaging product image`];

  const found: Candidate[] = [];
  for (const q of queries) {
    try {
      const results = await searxngImageSearch(q, { limit: SEARCH_LIMIT, timeoutMs: 15000 });
      found.push(...results.map(r => ({ url: r.url, sourceUrl: r.sourceUrl, title: r.title })));
    } catch (e) {
      const result = {
        status: "SEARCH_ERROR",
        productId: product.id,
        product: product.title,
        error: e instanceof Error ? e.message : "SearXNG image search failed",
        retryAfterMs: e instanceof SearXNGRateLimitError ? e.retryAfterMs : undefined,
        publicationGate: "BLOCK",
        message: "Image search is rate-limited or unavailable. Product remains staged.",
      };
      cacheFailure(product.id, result);
      return result;
    }
  }

  const seen = new Set<string>();
  const candidates = found
    .filter(x => x.url && /^https:\/\//i.test(x.url) && !BAD.test(x.url))
    .filter(x => seen.has(x.url) ? false : (seen.add(x.url), true))
    .map(x => ({ ...x, textScore: textScore(x, product) }))
    .sort((a, b) => Number(b.textScore) - Number(a.textScore))
    .slice(0, MAX_CANDIDATES);

  if (!candidates.length) {
    const result = { status: "NEEDS_IMAGES", productId: product.id, product: product.title, imageCount: 0, requiredImageCount: minImages, searched: queries, publicationGate: "BLOCK", message: "No HTTPS image candidates returned by SearXNG. Product remains staged." };
    cacheFailure(product.id, result);
    return result;
  }

  const checked = await Promise.all(candidates.map(async candidate => ({ candidate, evidence: await validateImageCandidate(candidate.url) })));
  const technicallyValid = checked.filter(x => x.evidence.ok) as Usable[];
  const deduped = dedupeImageEvidence(technicallyValid);
  const usable = deduped.kept;

  if (!usable.length) {
    const result = {
      status: "NEEDS_IMAGES",
      productId: product.id,
      product: product.title,
      imageCount: 0,
      requiredImageCount: minImages,
      searched: queries,
      technicalRejects: checked.filter(x => !x.evidence.ok).map(x => ({ url: x.candidate.url, reason: x.evidence.reason })),
      duplicateRejects: deduped.rejected.map(x => ({ url: x.item.candidate.url, reason: x.reason })),
      publicationGate: "BLOCK",
      message: "No candidate passed byte-level raster validation and duplicate removal. Product remains staged.",
    };
    cacheFailure(product.id, result);
    return result;
  }

  const verdicts = verifyWithLocalEvidence(usable, product);
  const accepted = verdicts
    .map(v => ({ ...v, item: usable[v.index - 1] }))
    .filter(v => v.item && v.matches && Number(v.confidence) >= MIN_CONFIDENCE && /^https:\/\//i.test(v.item.candidate.url) && !BAD.test(v.item.candidate.url))
    .sort((a, b) => b.confidence - a.confidence || Number(b.item.evidence.technicalQuality || 0) - Number(a.item.evidence.technicalQuality || 0))
    .slice(0, MAX_IMAGES);

  if (accepted.length < minImages) {
    const result = {
      status: "NEEDS_IMAGES",
      productId: product.id,
      product: product.title,
      imageCount: accepted.length,
      requiredImageCount: minImages,
      verdicts,
      technicalRejects: checked.filter(x => !x.evidence.ok).map(x => ({ url: x.candidate.url, reason: x.evidence.reason })),
      duplicateRejects: deduped.rejected.map(x => ({ url: x.item.candidate.url, reason: x.reason })),
      searched: queries,
      publicationGate: "BLOCK",
      provider: VERIFIER_PROVIDER,
      model: VERIFIER_MODEL,
      semanticVisionPerformed: false,
      message: `Only ${accepted.length} image(s) passed technical/source evidence verification (need ${minImages}). No placeholder or fabricated vision result was substituted.`,
    };
    cacheFailure(product.id, result);
    return result;
  }

  const dataReady = candidateDataReady(product);
  const nextStatus = nextMediaStatus(product, dataReady);
  const verifiedAt = new Date();
  await db.transaction(async tx => {
    await tx.delete(productImages).where(eq(productImages.productId, product.id));
    await tx.insert(productImages).values(accepted.map((v, index) => ({
      productId: product.id,
      imageUrl: v.item.evidence.finalUrl || v.item.candidate.url,
      sourceUrl: v.item.candidate.sourceUrl || v.item.candidate.url,
      sortOrder: index,
      altText: v.item.candidate.title || `${product.title} view ${index + 1}`,
      verificationStatus: "LOCAL_EVIDENCE_VERIFIED",
      verificationConfidence: Number(v.confidence).toFixed(3),
      verificationModel: VERIFIER_MODEL,
      verificationProvider: VERIFIER_PROVIDER,
      verificationMetadata: {
        reason: v.reason,
        matches: v.matches,
        sourceTitle: v.item.candidate.title || "",
        verifiedAt: verifiedAt.toISOString(),
        semanticVisionPerformed: false,
        technicalValidation: {
          mediaType: v.item.evidence.mediaType,
          byteSize: v.item.evidence.byteSize,
          width: v.item.evidence.width,
          height: v.item.evidence.height,
          sha256: v.item.evidence.sha256,
          technicalQuality: v.item.evidence.technicalQuality,
          redirectCount: v.item.evidence.redirectCount,
        },
      },
      verifiedAt,
    })));
    await tx.update(products).set({ imageUrl: accepted[0].item.evidence.finalUrl || accepted[0].item.candidate.url, status: nextStatus, updatedAt: new Date() }).where(eq(products.id, product.id));
  });

  return {
    status: "COMPLETE_MEDIA_RESOLVED",
    provider: "searxng+local-evidence",
    model: VERIFIER_MODEL,
    productId: product.id,
    product: product.title,
    imageCount: accepted.length,
    requiredImageCount: minImages,
    images: accepted.map(v => ({
      url: v.item.evidence.finalUrl || v.item.candidate.url,
      confidence: v.confidence,
      reason: v.reason,
      width: v.item.evidence.width,
      height: v.item.evidence.height,
      byteSize: v.item.evidence.byteSize,
      technicalQuality: v.item.evidence.technicalQuality,
    })),
    technicalRejectCount: checked.filter(x => !x.evidence.ok).length,
    duplicateRejectCount: deduped.rejected.length,
    cached: false,
    semanticVisionPerformed: false,
    publicationGate: dataReady ? "PASS" : "BLOCK",
    productStatus: nextStatus,
    nextStage: dataReady && nextStatus === "CEO_PENDING" ? "CEO_REVIEW" : nextStatus,
    message: dataReady ? `${accepted.length} technically and source-verified image(s) passed. Product is queued for CEO review; semantic AI vision was not claimed.` : `${accepted.length} image(s) passed verification, but basic pricing/stock data is incomplete; product remains non-published.`,
  };
}

export async function resolveVerifiedProductMedia(productId?: number, productName?: string) {
  if (!productId) return resolveOne(productId, productName);
  const existing = inFlight.get(productId);
  if (existing) return existing;
  const work = resolveOne(productId, productName).finally(() => inFlight.delete(productId));
  inFlight.set(productId, work);
  return work;
}

export async function resolveVerifiedMediaForProducts(productList: Array<{ id: number }>, maxBatch = 25) {
  const out: any[] = [];
  for (const p of productList.slice(0, maxBatch)) {
    try { out.push(await resolveVerifiedProductMedia(p.id)); }
    catch (e) { out.push({ status: "ERROR", productId: p.id, error: e instanceof Error ? e.message : "resolve failed", publicationGate: "BLOCK" }); }
  }
  return out;
}
