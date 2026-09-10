import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 4;
const DEFAULT_MIN_BYTES = 4_000;
const DEFAULT_MAX_BYTES = 5_000_000;
const DEFAULT_MIN_DIMENSION = 320;

export type ImageEvidence = {
  ok: boolean;
  requestedUrl: string;
  finalUrl?: string;
  canonicalUrl?: string;
  httpStatus?: number;
  mediaType?: "image/jpeg" | "image/png" | "image/webp";
  reportedContentType?: string;
  byteSize?: number;
  width?: number;
  height?: number;
  sha256?: string;
  technicalQuality?: number;
  redirectCount?: number;
  semanticVisionPerformed: false;
  reason?: string;
};

function publicIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function publicIpv6(address: string) {
  const lower = address.toLowerCase().split("%")[0];
  if (lower === "::" || lower === "::1") return false;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return false;
  if (/^fe[89ab]/.test(lower)) return false;
  if (lower.startsWith("2001:db8:")) return false;
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? publicIpv4(mapped[1]) : true;
}

function publicAddress(address: string) {
  const family = isIP(address);
  return family === 4 ? publicIpv4(address) : family === 6 ? publicIpv6(address) : false;
}

async function assertSafeImageUrl(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("image URL must use HTTPS");
  if (parsed.username || parsed.password) throw new Error("credentials in image URL are not allowed");
  if (parsed.port && parsed.port !== "443") throw new Error("non-standard image URL port is not allowed");
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) throw new Error("private/local image host is not allowed");
  if (isIP(hostname)) {
    if (!publicAddress(hostname)) throw new Error("private/reserved image address is not allowed");
  } else {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => !publicAddress(entry.address))) throw new Error("image host resolves to a private/reserved address");
  }
  return parsed;
}

export function canonicalImageUrl(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.search = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString();
  } catch {
    return value;
  }
}

function sniffMediaType(bytes: Buffer): ImageEvidence["mediaType"] | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return undefined;
}

function jpegDimensions(bytes: Buffer) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 7) {
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(bytes: Buffer) {
  if (bytes.length < 30) return null;
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X" && bytes.length >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return { width, height };
  }
  if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
    return { width: 1 + b0 + ((b1 & 0x3f) << 8), height: 1 + (b1 >> 6) + (b2 << 2) + ((b3 & 0x0f) << 10) };
  }
  return null;
}

function imageDimensions(bytes: Buffer, mediaType: ImageEvidence["mediaType"]) {
  if (mediaType === "image/png" && bytes.length >= 24) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (mediaType === "image/jpeg") return jpegDimensions(bytes);
  if (mediaType === "image/webp") return webpDimensions(bytes);
  return null;
}

async function readBounded(response: Response, maxBytes: number) {
  const length = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(length) && length > maxBytes) throw new Error("image file exceeds maximum size");
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("image file exceeds maximum size");
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function fetchSafeImage(initialUrl: string, maxBytes: number) {
  let current = await assertSafeImageUrl(initialUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.2", "User-Agent": "BharatShop-Image-Evidence/2.0" },
    });
    if ([301,302,303,307,308].includes(response.status)) {
      if (hop === MAX_REDIRECTS) throw new Error("too many image redirects");
      const location = response.headers.get("location");
      if (!location) throw new Error("image redirect is missing a location");
      current = await assertSafeImageUrl(new URL(location, current).toString());
      continue;
    }
    return { response, finalUrl: current.toString(), redirectCount: hop, bytes: await readBounded(response, maxBytes) };
  }
  throw new Error("image redirect limit exceeded");
}

export async function validateImageCandidate(url: string, options: { minBytes?: number; maxBytes?: number; minDimension?: number } = {}): Promise<ImageEvidence> {
  const requestedUrl = String(url || "").trim();
  const minBytes = Math.max(1_000, Number(options.minBytes || DEFAULT_MIN_BYTES));
  const maxBytes = Math.max(minBytes + 1, Number(options.maxBytes || DEFAULT_MAX_BYTES));
  const minDimension = Math.max(120, Number(options.minDimension || process.env.IMAGE_MIN_DIMENSION || DEFAULT_MIN_DIMENSION));
  try {
    const { response, finalUrl, redirectCount, bytes } = await fetchSafeImage(requestedUrl, maxBytes);
    const reportedContentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!response.ok) return { ok: false, requestedUrl, finalUrl, httpStatus: response.status, reportedContentType, redirectCount, semanticVisionPerformed: false, reason: `image returned HTTP ${response.status}` };
    if (bytes.length < minBytes) return { ok: false, requestedUrl, finalUrl, httpStatus: response.status, reportedContentType, byteSize: bytes.length, redirectCount, semanticVisionPerformed: false, reason: "image file is too small" };
    const mediaType = sniffMediaType(bytes);
    if (!mediaType) return { ok: false, requestedUrl, finalUrl, httpStatus: response.status, reportedContentType, byteSize: bytes.length, redirectCount, semanticVisionPerformed: false, reason: "response bytes are not a supported JPEG, PNG or WebP raster image" };
    const dimensions = imageDimensions(bytes, mediaType);
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return { ok: false, requestedUrl, finalUrl, httpStatus: response.status, reportedContentType, mediaType, byteSize: bytes.length, redirectCount, semanticVisionPerformed: false, reason: "image dimensions could not be verified" };
    if (dimensions.width < minDimension || dimensions.height < minDimension) return { ok: false, requestedUrl, finalUrl, httpStatus: response.status, reportedContentType, mediaType, byteSize: bytes.length, width: dimensions.width, height: dimensions.height, redirectCount, semanticVisionPerformed: false, reason: `image dimensions below ${minDimension}px minimum` };
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const megapixels = dimensions.width * dimensions.height / 1_000_000;
    const resolutionScore = Math.min(1, megapixels / 1.2);
    const sizeScore = Math.min(1, bytes.length / 250_000);
    const technicalQuality = Number((0.75 * resolutionScore + 0.25 * sizeScore).toFixed(4));
    return {
      ok: true,
      requestedUrl,
      finalUrl,
      canonicalUrl: canonicalImageUrl(finalUrl),
      httpStatus: response.status,
      mediaType,
      reportedContentType,
      byteSize: bytes.length,
      width: dimensions.width,
      height: dimensions.height,
      sha256,
      technicalQuality,
      redirectCount,
      semanticVisionPerformed: false,
    };
  } catch (error) {
    return { ok: false, requestedUrl, semanticVisionPerformed: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export function dedupeImageEvidence<T extends { evidence: ImageEvidence }>(items: T[]) {
  const canonical = new Set<string>();
  const hashes = new Set<string>();
  const kept: T[] = [];
  const rejected: Array<{ item: T; reason: "DUPLICATE_URL" | "DUPLICATE_BYTES" }> = [];
  for (const item of items) {
    const urlKey = item.evidence.canonicalUrl || canonicalImageUrl(item.evidence.finalUrl || item.evidence.requestedUrl);
    const hash = item.evidence.sha256 || "";
    if (canonical.has(urlKey)) { rejected.push({ item, reason: "DUPLICATE_URL" }); continue; }
    if (hash && hashes.has(hash)) { rejected.push({ item, reason: "DUPLICATE_BYTES" }); continue; }
    canonical.add(urlKey);
    if (hash) hashes.add(hash);
    kept.push(item);
  }
  return { kept, rejected };
}
