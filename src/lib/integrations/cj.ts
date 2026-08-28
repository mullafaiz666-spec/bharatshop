const BASE = "https://developers.cjdropshipping.com/api2.0/v1";

export type CJProduct = { pid: string; name: string; sku: string; imageUrl: string; priceUsd: number; stock: number; raw: unknown };

function token() {
  const t = process.env.CJ_ACCESS_TOKEN;
  if (!t) throw new Error("CJ_ACCESS_TOKEN is not configured");
  return t;
}

async function cj<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...(init?.headers || {}), "CJ-Access-Token": token(), "Content-Type": "application/json" }, cache: "no-store" });
  const json = await res.json();
  if (!res.ok || (json.code !== undefined && json.code !== 200 && json.code !== 0)) throw new Error(`CJ API error ${res.status}: ${json.message || "request failed"}`);
  return json as T;
}

export async function listProducts(keyword = "", page = 1, size = 20) {
  const qs = new URLSearchParams({ page: String(page), size: String(Math.min(size, 100)) });
  if (keyword) qs.set("keyWord", keyword);
  const response = await cj<any>(`/product/listV2?${qs.toString()}`);
  const data = response.data?.list || response.data?.content || response.data || [];
  return (Array.isArray(data) ? data : []).map((p: any): CJProduct => ({
    pid: String(p.pid || p.productId || ""),
    name: String(p.productNameEn || p.productName || "Untitled CJ Product"),
    sku: String(p.productSku || p.sku || p.pid || ""),
    imageUrl: String(p.productImage || p.imageUrl || p.productImageUrl || ""),
    priceUsd: Number(p.sellPrice ?? p.productPrice ?? p.price ?? 0),
    stock: Number(p.stock ?? p.totalInventory ?? 0),
    raw: p,
  }));
}

export async function productDetails(pid: string) {
  return cj<any>(`/product/query?pid=${encodeURIComponent(pid)}&features=enable_combine`);
}

export async function inventory(vid: string) {
  return cj<any>(`/product/stock/queryByVid?vid=${encodeURIComponent(vid)}`);
}

export async function health() {
  try { await listProducts("", 1, 1); return { connected: true, provider: "CJ Dropshipping" }; }
  catch (e) { return { connected: false, provider: "CJ Dropshipping", error: e instanceof Error ? e.message : "connection failed" }; }
}

export async function createOrder(payload: unknown) {
  return cj<any>("/shopping/order/createOrder", { method: "POST", body: JSON.stringify(payload) });
}

export async function orders(orderIds?: string[]) {
  const qs = new URLSearchParams({ pageNum: "1", pageSize: "20" });
  for (const id of orderIds || []) qs.append("orderIds", id);
  return cj<any>(`/shopping/order/list?${qs.toString()}`);
}
