export type EvidenceClaimType =
  | "PRICE"
  | "AVAILABILITY"
  | "SHIPPING"
  | "PRODUCT_URL"
  | "SUPPLIER"
  | "PRODUCT_EXISTENCE"
  | "BRAND"
  | "SKU";

export type EvidenceFreshness = {
  claimType: EvidenceClaimType;
  verifiedAt: string;
  expiresAt: string;
  ttlSec: number;
  ageSec: number;
  current: boolean;
  freshnessRatio: number;
  rationale: string;
};

export const EVIDENCE_EXPIRATION_POLICIES: Record<EvidenceClaimType, { ttlSec: number; rationale: string }> = {
  PRICE: { ttlSec: 6 * 60 * 60, rationale: "Commerce prices can change intraday; re-verify within 6 hours." },
  AVAILABILITY: { ttlSec: 6 * 60 * 60, rationale: "Stock can change quickly; re-verify within 6 hours." },
  SHIPPING: { ttlSec: 24 * 60 * 60, rationale: "Shipping fees and eligibility can change by route or service state; re-verify daily." },
  PRODUCT_URL: { ttlSec: 24 * 60 * 60, rationale: "Listings can move or delist; re-check daily." },
  SUPPLIER: { ttlSec: 7 * 24 * 60 * 60, rationale: "Supplier attribution is semi-stable; re-verify weekly." },
  PRODUCT_EXISTENCE: { ttlSec: 7 * 24 * 60 * 60, rationale: "Product existence is semi-stable; re-verify weekly." },
  BRAND: { ttlSec: 30 * 24 * 60 * 60, rationale: "Brand attribution is relatively stable; re-verify monthly." },
  SKU: { ttlSec: 30 * 24 * 60 * 60, rationale: "SKU mapping is relatively stable; re-verify monthly." },
};

export function evidenceFreshness(claimType: EvidenceClaimType, verifiedAtInput: string | Date, nowInput: string | Date = new Date()): EvidenceFreshness {
  const verifiedAt = new Date(verifiedAtInput);
  const now = new Date(nowInput);
  const policy = EVIDENCE_EXPIRATION_POLICIES[claimType];
  const verifiedMs = verifiedAt.getTime();
  const nowMs = now.getTime();
  const safeVerifiedMs = Number.isFinite(verifiedMs) ? verifiedMs : nowMs;
  const ageSec = Math.max(0, Math.floor((nowMs - safeVerifiedMs) / 1000));
  const expiresAt = new Date(safeVerifiedMs + policy.ttlSec * 1000);
  const current = ageSec <= policy.ttlSec;
  const freshnessRatio = current ? Math.max(0, 1 - ageSec / policy.ttlSec) : 0;
  return {
    claimType,
    verifiedAt: new Date(safeVerifiedMs).toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttlSec: policy.ttlSec,
    ageSec,
    current,
    freshnessRatio: Number(freshnessRatio.toFixed(4)),
    rationale: policy.rationale,
  };
}

export function commerceFreshnessBundle(verifiedAt: string | Date, now: string | Date = new Date()) {
  return {
    price: evidenceFreshness("PRICE", verifiedAt, now),
    availability: evidenceFreshness("AVAILABILITY", verifiedAt, now),
    shipping: evidenceFreshness("SHIPPING", verifiedAt, now),
    productUrl: evidenceFreshness("PRODUCT_URL", verifiedAt, now),
  };
}
