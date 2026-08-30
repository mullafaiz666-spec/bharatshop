import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, shopifySyncLogs, aiActivityLogs, storefrontOrders } from "@/db/schema";
import { ensureDemoDataSeeded } from "@/lib/seed";
import { desc } from "drizzle-orm";

// ─── SHOPIFY API HELPER — supports both Custom App tokens (shpat_) and Private App passwords ──
async function shopifyFetch(endpoint: string, method = "GET", body?: object) {
  const token = (process.env.SHOPIFY_ADMIN_TOKEN || "").trim();
  const shop  = (process.env.SHOPIFY_STORE_URL  || "").trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/\/$/, "");

  if (!token || !shop) {
    throw new Error("SHOPIFY_ADMIN_TOKEN and SHOPIFY_STORE_URL are not set in environment variables.");
  }

  const url = `https://${shop}/admin/api/2024-04${endpoint}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": token,
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();

  if (!res.ok) {
    let parsed: { errors?: string } = {};
    try { parsed = JSON.parse(text); } catch { /* ignore */ }
    throw new Error(parsed.errors || `Shopify API ${res.status}: ${text.slice(0, 300)}`);
  }
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// ─── DIAGNOSE TOKEN TYPE ──────────────────────────────────────────────────────
function diagnoseToken(token: string): string {
  const t = token.trim();
  if (!t) return "MISSING";
  if (t.startsWith("shpat_")) return "CUSTOM_APP_TOKEN"; // ✅ correct for Custom Apps
  if (t.startsWith("shpss_")) return "STOREFRONT_TOKEN"; // ❌ wrong — storefront only
  if (t.startsWith("shpca_")) return "COLLABORATOR_TOKEN";
  if (/^[0-9a-f]{32}$/.test(t)) return "PRIVATE_APP_PASSWORD"; // old format — needs API key too
  return "UNKNOWN_FORMAT";
}

// ─── GET — return sync logs + connection status ────────────────────────────────
export async function GET() {
  await ensureDemoDataSeeded();
  const logs = await db.select().from(shopifySyncLogs).orderBy(desc(shopifySyncLogs.syncedAt)).limit(20);

  const token     = (process.env.SHOPIFY_ADMIN_TOKEN || "").trim();
  const storeUrl  = (process.env.SHOPIFY_STORE_URL || "").trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/\/$/, "");
  const tokenType = diagnoseToken(token);
  const hasCredentials = !!(token && storeUrl);
  const isCorrectFormat = tokenType === "CUSTOM_APP_TOKEN";

  return NextResponse.json({
    syncLogs: logs,
    hasCredentials,
    isCorrectFormat,
    shopifyStoreUrl: storeUrl || null,
    tokenType,
    tokenPreview: token ? token.slice(0, 10) + "..." : null,
    diagnosis: buildDiagnosis(token, storeUrl, tokenType),
  });
}

function buildDiagnosis(token: string, storeUrl: string, tokenType: string) {
  const issues: string[] = [];
  const fixes: string[] = [];

  if (!token) {
    issues.push("SHOPIFY_ADMIN_TOKEN is not set in .env file.");
    fixes.push("Add: SHOPIFY_ADMIN_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxx to your .env");
  } else if (tokenType === "PRIVATE_APP_PASSWORD") {
    issues.push("Your token looks like an OLD Private App password (32-char hex). Shopify deprecated Private Apps in 2022.");
    fixes.push("Go to Shopify Admin → Settings → Apps → Develop apps → Create a new Custom App → API credentials → Admin API access token (starts with shpat_)");
  } else if (tokenType === "STOREFRONT_TOKEN") {
    issues.push("You provided a Storefront API token (shpss_...). This only works for storefront, NOT admin API.");
    fixes.push("Go to Shopify Admin → Settings → Apps → Develop apps → Your App → API credentials → get the Admin API access token (shpat_...)");
  } else if (tokenType !== "CUSTOM_APP_TOKEN") {
    issues.push(`Unknown token format: "${token.slice(0, 15)}...". Valid Admin API tokens start with shpat_`);
    fixes.push("Create a new Custom App in Shopify Admin and copy the Admin API access token.");
  }

  if (!storeUrl) {
    issues.push("SHOPIFY_STORE_URL is not set.");
    fixes.push("Add: SHOPIFY_STORE_URL=yourstore.myshopify.com to your .env");
  } else if (!storeUrl.includes("myshopify.com")) {
    issues.push("Store URL should be your .myshopify.com domain, not a custom domain.");
    fixes.push(`Change SHOPIFY_STORE_URL to your myshopify.com URL (e.g. veloraskart.myshopify.com)`);
  }

  return { issues, fixes, status: issues.length === 0 ? "READY" : "NEEDS_FIX" };
}

// ─── POST — run sync action ────────────────────────────────────────────────────
export async function POST(req: Request) {
  const demoUser = await ensureDemoDataSeeded();
  const userId = demoUser?.id ?? 1;
  const body = await req.json().catch(() => ({}));
  const { action = "TEST_CONNECTION", limit: syncLimit = 20 } = body;

  const token     = (process.env.SHOPIFY_ADMIN_TOKEN || "").trim();
  const storeUrl  = (process.env.SHOPIFY_STORE_URL || "").trim();
  const tokenType = diagnoseToken(token);

  // ── TEST CONNECTION ──
  if (action === "TEST_CONNECTION") {
    if (!token || !storeUrl) {
      return NextResponse.json({
        connected: false,
        error: "Missing credentials",
        diagnosis: buildDiagnosis(token, storeUrl, tokenType),
      });
    }

    try {
      const shopData = await shopifyFetch("/shop.json");
      await db.insert(shopifySyncLogs).values({
        syncType: "TEST_CONNECTION",
        status: "SUCCESS",
        itemsSynced: 0,
        shopifyStoreUrl: storeUrl,
        message: `✅ Connected to "${shopData.shop?.name}" (${shopData.shop?.myshopify_domain}). Plan: ${shopData.shop?.plan_display_name}`,
      });
      return NextResponse.json({
        connected: true,
        shopName: shopData.shop?.name,
        shopDomain: shopData.shop?.myshopify_domain,
        plan: shopData.shop?.plan_display_name,
        currency: shopData.shop?.currency,
        message: `Successfully connected to ${shopData.shop?.name}!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      await db.insert(shopifySyncLogs).values({
        syncType: "TEST_CONNECTION",
        status: "FAILED",
        itemsSynced: 0,
        shopifyStoreUrl: storeUrl,
        message: msg,
        errorDetail: msg,
      });
      return NextResponse.json({
        connected: false,
        error: msg,
        diagnosis: buildDiagnosis(token, storeUrl, tokenType),
      }, { status: 400 });
    }
  }

  // ── If not correct token type, block with detailed instructions ──
  if (tokenType !== "CUSTOM_APP_TOKEN") {
    const diag = buildDiagnosis(token, storeUrl, tokenType);
    await db.insert(shopifySyncLogs).values({
      syncType: action,
      status: "FAILED",
      itemsSynced: 0,
      shopifyStoreUrl: storeUrl || "not-set",
      message: `Token format error (${tokenType}): ${diag.issues[0] || "Invalid token"}`,
      errorDetail: diag.fixes.join(" | "),
    });
    return NextResponse.json({
      error: `Invalid token format: ${tokenType}`,
      diagnosis: diag,
      howToFix: diag.fixes,
    }, { status: 401 });
  }

  // ── PRODUCT_PUSH ──
  if (action === "PRODUCT_PUSH") {
    try {
      const allProducts = await db.select().from(products).orderBy(desc(products.aiScore)).limit(Number(syncLimit));
      const USD_RATE = 84;
      let pushed = 0; const errors: string[] = [];

      for (const p of allProducts) {
        const priceUsd       = (Number(p.sellingPriceInr) / USD_RATE).toFixed(2);
        const compareAtUsd   = (Number(p.mrpInr) / USD_RATE).toFixed(2);
        try {
          await shopifyFetch("/products.json", "POST", {
            product: {
              title:        p.title,
              body_html:    `<p>${p.aiMarketingCopy}</p><br><p><strong>Brand:</strong> ${p.brand} | <strong>SKU:</strong> ${p.sku} | <strong>Category:</strong> ${p.category} | <strong>HSN:</strong> ${p.hsnCode}</p><p><strong>Supplier City:</strong> ${p.supplierCity}</p>`,
              vendor:       p.brand,
              product_type: p.category,
              status:       "active",
              tags:         [p.category, p.brand, "bharatdrop", "dropship", `ai-score-${p.aiScore}`, `viral-${p.viralVelocityScore}`].join(","),
              variants: [{
                price:              priceUsd,
                compare_at_price:   compareAtUsd,
                sku:                p.sku,
                inventory_quantity: p.stockCount,
                inventory_management: "shopify",
                fulfillment_service: "manual",
                requires_shipping:  true,
              }],
              images: [{ src: p.imageUrl, alt: p.title }],
            },
          });
          pushed++;
        } catch (e: unknown) {
          errors.push(`${p.sku}: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }

      const msg = `Pushed ${pushed}/${allProducts.length} products to Shopify${errors.length ? ` (${errors.length} errors)` : ""}`;
      await db.insert(shopifySyncLogs).values({ syncType: "PRODUCT_PUSH", status: errors.length > 0 ? "PARTIAL" : "SUCCESS", itemsSynced: pushed, shopifyStoreUrl: storeUrl, message: msg, errorDetail: errors.slice(0, 5).join("; ") || undefined });
      await db.insert(aiActivityLogs).values({ userId, agentName: "Shopify-Agent // Product Push", actionType: "SHOPIFY_PRODUCT_PUSH", message: msg, profitImpactInr: "0.00", status: "SUCCESS" });
      return NextResponse.json({ success: true, action, pushed, errors: errors.slice(0, 5), message: msg });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Product push failed";
      await db.insert(shopifySyncLogs).values({ syncType: "PRODUCT_PUSH", status: "FAILED", itemsSynced: 0, shopifyStoreUrl: storeUrl, message: msg, errorDetail: msg });
      return NextResponse.json({ error: msg, diagnosis: buildDiagnosis(token, storeUrl, tokenType) }, { status: 500 });
    }
  }

  // ── PRICE_UPDATE ──
  if (action === "PRICE_UPDATE") {
    try {
      const shopifyProds = await shopifyFetch("/products.json?limit=50&fields=id,variants,title");
      const USD_RATE = 84;
      const localProds = await db.select().from(products).orderBy(desc(products.aiScore)).limit(50);
      const skuMap = new Map(localProds.map(p => [p.sku, p]));
      let updated = 0;

      for (const sp of shopifyProds.products || []) {
        for (const v of sp.variants || []) {
          const local = skuMap.get(v.sku);
          if (!local) continue;
          const newPrice = (Number(local.sellingPriceInr) / USD_RATE).toFixed(2);
          try {
            await shopifyFetch(`/variants/${v.id}.json`, "PUT", {
              variant: { id: v.id, price: newPrice, compare_at_price: (Number(local.mrpInr) / USD_RATE).toFixed(2) },
            });
            updated++;
          } catch { /* skip individual */ }
        }
      }

      const msg = `Updated ${updated} variant prices on Shopify (₹→$@84 rate)`;
      await db.insert(shopifySyncLogs).values({ syncType: "PRICE_UPDATE", status: "SUCCESS", itemsSynced: updated, shopifyStoreUrl: storeUrl, message: msg });
      return NextResponse.json({ success: true, action, updated, message: msg });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Price update failed";
      await db.insert(shopifySyncLogs).values({ syncType: "PRICE_UPDATE", status: "FAILED", itemsSynced: 0, shopifyStoreUrl: storeUrl, message: msg, errorDetail: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ── ORDER_PULL ──
  if (action === "ORDER_PULL") {
    try {
      const shopifyOrders = await shopifyFetch("/orders.json?status=open&limit=50");
      let pulled = 0;

      for (const so of shopifyOrders.orders || []) {
        const li = so.line_items?.[0];
        if (!li) continue;
        try {
          await db.insert(storefrontOrders).values({
            orderRef:         `SHF-${so.id}`,
            customerName:     `${so.customer?.first_name || ""} ${so.customer?.last_name || ""}`.trim() || "Shopify Customer",
            customerEmail:    so.email || so.customer?.email || "noreply@shopify.com",
            customerPhone:    so.shipping_address?.phone || "9999999999",
            customerAddress:  so.shipping_address?.address1 || "",
            customerCity:     so.shipping_address?.city || "Mumbai",
            customerState:    so.shipping_address?.province || "Maharashtra",
            customerPincode:  so.shipping_address?.zip || "400001",
            productTitle:     li.title,
            productImageUrl:  "https://images.unsplash.com/photo-1625948515291-69bc9a6f8c87?w=400&auto=format&fit=crop&q=70",
            quantity:         li.quantity,
            sellingPriceInr:  (Number(li.price) * 84).toFixed(2),
            totalAmountInr:   (Number(so.total_price) * 84).toFixed(2),
            paymentMode:      so.payment_gateway || "Online",
            source:           "shopify_sync",
            shopifyOrderId:   String(so.id),
          }).onConflictDoNothing();
          pulled++;
        } catch { /* skip existing */ }
      }

      const msg = `Pulled ${pulled} orders from Shopify → queued for Delhivery fulfillment`;
      await db.insert(shopifySyncLogs).values({ syncType: "ORDER_PULL", status: "SUCCESS", itemsSynced: pulled, shopifyStoreUrl: storeUrl, message: msg });
      return NextResponse.json({ success: true, action, pulled, message: msg });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Order pull failed";
      await db.insert(shopifySyncLogs).values({ syncType: "ORDER_PULL", status: "FAILED", itemsSynced: 0, shopifyStoreUrl: storeUrl, message: msg, errorDetail: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ── INVENTORY_SYNC ──
  if (action === "INVENTORY_SYNC") {
    try {
      const shopifyProds = await shopifyFetch("/products.json?limit=50&fields=id,variants,title");
      const localProds = await db.select().from(products).orderBy(desc(products.aiScore)).limit(50);
      const skuMap = new Map(localProds.map(p => [p.sku, p]));
      let synced = 0;

      for (const sp of shopifyProds.products || []) {
        for (const v of sp.variants || []) {
          const local = skuMap.get(v.sku);
          if (!local || !v.inventory_item_id) continue;
          try {
            // Get location first
            const locs = await shopifyFetch("/locations.json");
            const locId = locs.locations?.[0]?.id;
            if (!locId) continue;
            await shopifyFetch(`/inventory_levels/set.json`, "POST", {
              location_id: locId,
              inventory_item_id: v.inventory_item_id,
              available: local.stockCount,
            });
            synced++;
          } catch { /* skip */ }
        }
      }

      const msg = `Synced inventory for ${synced} variants on Shopify`;
      await db.insert(shopifySyncLogs).values({ syncType: "INVENTORY_SYNC", status: "SUCCESS", itemsSynced: synced, shopifyStoreUrl: storeUrl, message: msg });
      return NextResponse.json({ success: true, action, synced, message: msg });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Inventory sync failed";
      await db.insert(shopifySyncLogs).values({ syncType: "INVENTORY_SYNC", status: "FAILED", itemsSynced: 0, shopifyStoreUrl: storeUrl, message: msg, errorDetail: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

export const dynamic = "force-dynamic";
