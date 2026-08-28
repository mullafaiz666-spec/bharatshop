import { db } from "@/db";
import { sql } from "drizzle-orm";

const BASE = "https://developers.cjdropshipping.com/api2.0/v1";

let accessToken: string | null = null;
let accessTokenExpiry = 0;

export type CjProduct = {
  id: string;
  nameEn: string;
  sku: string;
  bigImage: string;
  sellPrice: string;
  nowPrice: string;
  threeCategoryName?: string;
  supplierName?: string;
  warehouseInventoryNum?: number;
  totalVerifiedInventory?: number;
  verifiedWarehouse?: number;
  deliveryCycle?: string;
  description?: string;
  directMinOrderNum?: string;
};

function apiKey() {
  const key = process.env.CJ_API_KEY?.trim();
  if (!key) throw new Error("CJ_API_KEY is not configured.");
  return key;
}

async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiry - 60_000) return accessToken;
  const res = await fetch(`${BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: apiKey() }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.result || !data?.data?.accessToken) {
    throw new Error(data?.message || `CJ authentication failed (${res.status})`);
  }
  accessToken = data.data.accessToken;
  accessTokenExpiry = Date.parse(data.data.accessTokenExpiryDate || "") || Date.now() + 14 * 86400_000;
  return accessToken;
}

async function cjFetch(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("CJ-Access-Token", token);
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${BASE}${path}`, { ...init, headers, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.result === false || data?.success === false) {
    if (res.status === 401) {
      accessToken = null;
      accessTokenExpiry = 0;
    }
    throw new Error(data?.message || `CJ API ${res.status}`);
  }
  return data;
}

export async function ensureSupplierLinkTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS supplier_product_links (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      supplier_product_id TEXT NOT NULL,
      supplier_variant_id TEXT,
      supplier_sku TEXT,
      supplier_cost_usd NUMERIC(12,2),
      verified_inventory INTEGER NOT NULL DEFAULT 0,
      source_url TEXT,
      last_synced_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(provider, supplier_product_id, supplier_variant_id)
    )
  `);
}

export async function searchCjProducts(options: { keyword?: string; limit?: number; countryCode?: string }) {
  const size = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const qs = new URLSearchParams({
    page: "1",
    size: String(size),
    verifiedWarehouse: "1",
    sort: "desc",
    orderBy: "4",
    features: "enable_description,enable_category",
  });
  if (options.keyword) qs.set("keyWord", options.keyword);
  const country = (options.countryCode || process.env.CJ_COUNTRY_CODE || "IN").trim();
  if (country) qs.set("countryCode", country);
  const data = await cjFetch(`/product/listV2?${qs.toString()}`);
  const content = data?.data?.content || [];
  return content.flatMap((x: { productList?: CjProduct[] }) => x.productList || []) as CjProduct[];
}

export async function importCjProducts(args: { keyword?: string; limit?: number; userId: number }) {
  await ensureSupplierLinkTable();
  const products = await searchCjProducts(args);
  if (!products.length) return { imported: 0, products: [], message: "No verified CJ products matched the current filters." };

  const imported: Array<{ productId: number; supplierProductId: string; title: string }> = [];
  for (const p of products) {
    const costUsd = Number(p.nowPrice || p.sellPrice || 0);
    const fx = Number(process.env.USD_INR_RATE || 88);
    const costInr = costUsd * fx;
    const shippingInr = Number(process.env.DEFAULT_DROPSHIP_SHIPPING_INR || 120);
    const minMargin = Number(process.env.MIN_DROPSHIP_MARGIN_PCT || 35);
    const priceInr = Math.ceil((costInr + shippingInr) / (1 - minMargin / 100) / 10) * 10;
    const gst = 18;
    const profit = priceInr - costInr - shippingInr - costInr * gst / 100;
    if (profit <= 0 || Number(p.totalVerifiedInventory || p.warehouseInventoryNum || 0) <= 0) continue;

    const sku = `CJ-${p.sku || p.id}`;
    const [row] = await db.execute(sql`
      INSERT INTO products (
        user_id, sku, title, category, image_url, brand, supplier_name, supplier_city,
        supplier_cost_inr, shipping_cost_inr, gst_pct, selling_price_inr, mrp_inr,
        custom_margin_pct, net_profit_inr, ai_score, viral_velocity_score, stock_count,
        moq, auto_reprice_enabled, status, ai_marketing_copy, ai_target_audience, hsn_code,
        sales_count_24h, returns_count, created_at, updated_at
      ) VALUES (
        ${args.userId}, ${sku}, ${p.nameEn}, ${p.threeCategoryName || "General"}, ${p.bigImage || "https://placehold.co/600x600?text=Product"},
        "CJ Supplier", "CJ Dropshipping (API verified)", ${process.env.CJ_SUPPLIER_CITY || "Supplier network"},
        ${costInr.toFixed(2)}, ${shippingInr.toFixed(2)}, ${gst.toFixed(2)}, ${priceInr.toFixed(2)}, ${(priceInr * 1.35).toFixed(2)},
        ${minMargin.toFixed(2)}, ${profit.toFixed(2)}, 90, 85, ${Number(p.totalVerifiedInventory || p.warehouseInventoryNum || 0)},
        ${Math.max(Number(p.directMinOrderNum || 1), 1)}, true, "Published",
        ${p.description || `${p.nameEn} — supplier-verified catalogue item.`}, "Online shoppers in India", "99999999", 0, 0, NOW(), NOW()
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    const productId = Number((row as { id?: number } | undefined)?.id || 0);
    if (!productId) continue;
    await db.execute(sql`
      INSERT INTO supplier_product_links (product_id, provider, supplier_product_id, supplier_sku, supplier_cost_usd, verified_inventory, source_url)
      VALUES (${productId}, 'cj', ${p.id}, ${p.sku || null}, ${costUsd.toFixed(2)}, ${Number(p.totalVerifiedInventory || p.warehouseInventoryNum || 0)}, ${`https://cjdropshipping.com/product/${p.id}.html`})
      ON CONFLICT (provider, supplier_product_id, supplier_variant_id) DO UPDATE SET
        verified_inventory = EXCLUDED.verified_inventory,
        supplier_cost_usd = EXCLUDED.supplier_cost_usd,
        last_synced_at = NOW()
    `);
    imported.push({ productId, supplierProductId: p.id, title: p.nameEn });
  }
  return { imported: imported.length, products: imported, message: `Imported ${imported.length} supplier-verified CJ products.` };
}

export async function createCjOrder(args: {
  orderNumber: string;
  shippingName: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  countryCode?: string;
  productId: string;
  variantId?: string;
  quantity: number;
}) {
  const payload = {
    orderNumber: args.orderNumber,
    shippingCustomerName: args.shippingName,
    shippingPhone: args.phone,
    shippingAddress: args.address,
    shippingCity: args.city,
    shippingProvince: args.state,
    shippingZip: args.pincode,
    shippingCountryCode: args.countryCode || "IN",
    shippingCountry: "India",
    fromCountryCode: process.env.CJ_FROM_COUNTRY_CODE || "CN",
    productList: [{ productId: args.productId, variantId: args.variantId, quantity: args.quantity }],
    payType: Number(process.env.CJ_PAY_TYPE || 3),
  };
  return cjFetch("/shopping/order/createOrderV3", { method: "POST", body: JSON.stringify(payload) });
}
