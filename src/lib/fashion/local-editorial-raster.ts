import { deflateSync } from "node:zlib";

type RGB = [number, number, number];
type Point = [number, number];

function seedOf(value: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function random01(seed: number) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function parseHex(value: unknown, fallback: RGB): RGB {
  const raw = String(value || "").trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(raw)) return fallback;
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
}

function mix(a: RGB, b: RGB, amount: number): RGB {
  const t = Math.max(0, Math.min(1, amount));
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function crc32(input: Buffer) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.allocUnsafe(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(width: number, height: number, rgba: Buffer) {
  const scanlines = Buffer.allocUnsafe(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const target = y * (1 + width * 4);
    scanlines[target] = 0;
    rgba.copy(scanlines, target + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines, { level: 7 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function insidePolygon(x: number, y: number, points: Point[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-6) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function generateLocalEditorialRaster(input: {
  productId: number;
  title: string;
  view: number;
  palette?: unknown[];
  width?: number;
  height?: number;
}) {
  const width = Math.max(320, Math.min(768, Math.round(input.width || 480)));
  const height = Math.max(400, Math.min(1024, Math.round(input.height || 600)));
  const seed = seedOf(`${input.productId}:${input.title}:${input.view}:street-editorial-v2`);
  const rand = random01(seed);
  const palette = Array.isArray(input.palette) ? input.palette : [];
  const dark = parseHex(palette[0], [13, 17, 27]);
  const accent = parseHex(palette[1], [236, 72, 153]);
  const light = parseHex(palette[2], [241, 245, 249]);
  const rgba = Buffer.allocUnsafe(width * height * 4);

  const put = (x: number, y: number, color: RGB, alpha = 1) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    const a = Math.max(0, Math.min(1, alpha));
    rgba[i] = Math.round(rgba[i] * (1 - a) + color[0] * a);
    rgba[i + 1] = Math.round(rgba[i + 1] * (1 - a) + color[1] * a);
    rgba[i + 2] = Math.round(rgba[i + 2] * (1 - a) + color[2] * a);
    rgba[i + 3] = 255;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, color: RGB, alpha = 1) => {
    const left = Math.max(0, Math.floor(Math.min(x0, x1))), right = Math.min(width, Math.ceil(Math.max(x0, x1)));
    const top = Math.max(0, Math.floor(Math.min(y0, y1))), bottom = Math.min(height, Math.ceil(Math.max(y0, y1)));
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) put(x, y, color, alpha);
  };
  const ellipse = (cx: number, cy: number, rx: number, ry: number, color: RGB, alpha = 1) => {
    const left = Math.max(0, Math.floor(cx - rx)), right = Math.min(width - 1, Math.ceil(cx + rx));
    const top = Math.max(0, Math.floor(cy - ry)), bottom = Math.min(height - 1, Math.ceil(cy + ry));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) put(x, y, color, alpha);
    }
  };
  const polygon = (points: Point[], color: RGB, alpha = 1) => {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const left = Math.max(0, Math.floor(Math.min(...xs))), right = Math.min(width - 1, Math.ceil(Math.max(...xs)));
    const top = Math.max(0, Math.floor(Math.min(...ys))), bottom = Math.min(height - 1, Math.ceil(Math.max(...ys)));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) if (insidePolygon(x + 0.5, y + 0.5, points)) put(x, y, color, alpha);
  };

  for (let y = 0; y < height; y++) {
    const t = y / Math.max(1, height - 1);
    const base = mix(mix(dark, accent, 0.12), [5, 8, 18], t * 0.72);
    for (let x = 0; x < width; x++) {
      const grain = Math.floor((rand() - 0.5) * 18);
      const i = (y * width + x) * 4;
      rgba[i] = Math.max(0, Math.min(255, base[0] + grain));
      rgba[i + 1] = Math.max(0, Math.min(255, base[1] + grain));
      rgba[i + 2] = Math.max(0, Math.min(255, base[2] + grain));
      rgba[i + 3] = 255;
    }
  }

  const horizon = Math.round(height * 0.64);
  rect(0, horizon, width, height, mix(dark, [2, 3, 8], 0.72), 0.94);
  for (let i = 0; i < 9; i++) {
    const bw = Math.round(width * (0.09 + rand() * 0.12));
    const bx = Math.round(rand() * (width - bw));
    const bh = Math.round(height * (0.2 + rand() * 0.32));
    const by = horizon - bh;
    rect(bx, by, bx + bw, horizon, mix(dark, accent, 0.05 + rand() * 0.16), 0.9);
    for (let wy = by + 14; wy < horizon - 14; wy += 28) for (let wx = bx + 10; wx < bx + bw - 8; wx += 22) {
      if (rand() > 0.52) rect(wx, wy, wx + 7, wy + 10, mix(accent, light, 0.42), 0.42);
    }
  }
  for (let i = 0; i < 7; i++) {
    const px = Math.round(rand() * width * 0.92), py = Math.round(height * (0.19 + rand() * 0.38));
    const pw = Math.round(width * (0.04 + rand() * 0.08)), ph = Math.round(height * (0.05 + rand() * 0.11));
    rect(px, py, px + pw, py + ph, i % 2 ? accent : light, 0.15 + rand() * 0.22);
  }
  for (let i = 0; i < 5; i++) rect(0, horizon + i * 18, width, horizon + i * 18 + 2, mix(light, accent, 0.5), 0.11);

  const back = input.view === 2;
  const cx = Math.round(width * (back ? 0.53 : 0.49));
  const headY = Math.round(height * 0.22), skin: RGB = [157 + Math.round(rand() * 34), 102 + Math.round(rand() * 36), 78 + Math.round(rand() * 28)];
  const hair = mix(dark, [0, 0, 0], 0.72);
  ellipse(cx, headY, width * 0.055, height * 0.052, skin);
  ellipse(cx - width * 0.006, headY - height * 0.032, width * 0.062, height * 0.032, hair);
  rect(cx - width * 0.022, headY + height * 0.042, cx + width * 0.022, headY + height * 0.082, skin);

  const shoulderY = height * 0.31, hemY = height * 0.57, teeHalf = width * 0.16, waistHalf = width * 0.115;
  const teeColor = mix(dark, palette.length ? parseHex(palette[0], dark) : dark, 0.68);
  const tee: Point[] = [
    [cx - teeHalf, shoulderY], [cx - teeHalf * 0.72, shoulderY - height * 0.025], [cx - waistHalf, hemY],
    [cx + waistHalf, hemY], [cx + teeHalf * 0.72, shoulderY - height * 0.025], [cx + teeHalf, shoulderY],
    [cx + teeHalf * 0.77, shoulderY + height * 0.105], [cx + waistHalf * 1.08, shoulderY + height * 0.09],
    [cx - waistHalf * 1.08, shoulderY + height * 0.09], [cx - teeHalf * 0.77, shoulderY + height * 0.105],
  ];
  polygon(tee, teeColor);
  polygon([[cx - teeHalf, shoulderY + 3],[cx - teeHalf * 0.77, shoulderY + height * 0.105],[cx - width * 0.13, height * 0.49],[cx - width * 0.17, height * 0.485]], skin);
  polygon([[cx + teeHalf, shoulderY + 3],[cx + teeHalf * 0.77, shoulderY + height * 0.105],[cx + width * 0.135, height * 0.49],[cx + width * 0.17, height * 0.48]], skin);

  const graphicTop = back ? shoulderY + height * 0.06 : shoulderY + height * 0.105;
  const graphicBottom = back ? hemY - height * 0.045 : hemY - height * 0.12;
  const graphicHalf = back ? width * 0.095 : width * 0.065;
  rect(cx - graphicHalf, graphicTop, cx + graphicHalf, graphicBottom, accent, 0.82);
  rect(cx - graphicHalf * 0.72, graphicTop + height * 0.018, cx + graphicHalf * 0.55, graphicTop + height * 0.042, light, 0.72);
  ellipse(cx + graphicHalf * 0.13, (graphicTop + graphicBottom) / 2, graphicHalf * 0.52, (graphicBottom - graphicTop) * 0.22, mix(light, accent, 0.26), 0.88);
  for (let i = 0; i < 8; i++) {
    const yy = graphicTop + (graphicBottom - graphicTop) * (0.12 + i * 0.1);
    polygon([[cx - graphicHalf * 1.1, yy],[cx + graphicHalf * 0.9, yy - height * 0.018],[cx + graphicHalf, yy - height * 0.01],[cx - graphicHalf, yy + height * 0.008]], i % 2 ? light : accent, 0.34);
  }
  for (let i = 0; i < 5; i++) {
    const dx = (i - 2) * graphicHalf * 0.35;
    rect(cx + dx, graphicBottom - 2, cx + dx + Math.max(2, width * 0.009), graphicBottom + height * (0.018 + rand() * 0.035), accent, 0.68);
  }

  const pants: RGB = back ? [34, 40, 49] : [52, 59, 68];
  polygon([[cx - waistHalf, hemY - 3],[cx - 4, hemY],[cx - width * 0.035, height * 0.86],[cx - width * 0.13, height * 0.86],[cx - width * 0.12, height * 0.61]], pants);
  polygon([[cx + waistHalf, hemY - 3],[cx + 4, hemY],[cx + width * 0.055, height * 0.86],[cx + width * 0.145, height * 0.86],[cx + width * 0.12, height * 0.61]], mix(pants, accent, 0.06));
  ellipse(cx - width * 0.09, height * 0.885, width * 0.092, height * 0.025, light, 0.88);
  ellipse(cx + width * 0.105, height * 0.885, width * 0.098, height * 0.026, light, 0.88);
  ellipse(cx, headY + height * 0.18, width * 0.29, height * 0.32, mix(light, accent, 0.35), 0.035);
  for (let i = 0; i < Math.round(width * height * 0.008); i++) {
    const x = Math.floor(rand() * width), y = Math.floor(rand() * height);
    put(x, y, rand() > 0.5 ? light : accent, 0.18 + rand() * 0.22);
  }

  const bytes = encodePng(width, height, rgba);
  return {
    bytes,
    mimeType: "image/png" as const,
    provider: "bharatshop-local-raster" as const,
    sourceUrl: "local://bharatshop/street-editorial-v2",
    width,
    height,
    seed,
  };
}
