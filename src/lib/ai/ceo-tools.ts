import { pool } from "@/db";
import { serpSearch } from "@/lib/ai/agent-tools";
import { resolveVerifiedProductMedia } from "@/lib/ai/media-resolver";
import { FASHION_COMMANDS, runFashionCommand } from "@/lib/ai/fashion-studio";

async function ensureApprovalTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS ceo_approvals (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    action_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    reason TEXT NOT NULL DEFAULT '',
    risk_level TEXT NOT NULL DEFAULT 'MEDIUM',
    status TEXT NOT NULL DEFAULT 'PENDING',
    requested_by TEXT NOT NULL DEFAULT 'BHARATSHOP AI CEO',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    decision_note TEXT NOT NULL DEFAULT ''
  )`);
}
export async function createApproval(input: { title: string; actionType: string; payload?: unknown; reason: string; riskLevel?: string }) {
  await ensureApprovalTable();
  const result = await pool.query(`INSERT INTO ceo_approvals (title, action_type, payload, reason, risk_level) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [input.title, input.actionType, JSON.stringify(input.payload ?? {}), input.reason, input.riskLevel ?? "MEDIUM"]);
  return result.rows[0];
}
export async function listPendingApprovals() {
  await ensureApprovalTable();
  const result = await pool.query(`SELECT id,title,action_type,payload,reason,risk_level,status,created_at FROM ceo_approvals WHERE status='PENDING' ORDER BY created_at DESC LIMIT 20`);
  return result.rows;
}
export async function rejectProduct(productId?: number, productName?: string, reason = "Product failed verification") {
  const selector = productId ? `p.id = $1` : `p.title ILIKE $1`;
  const value = productId ? productId : `%${String(productName || "").trim()}%`;
  const result = await pool.query(`SELECT p.id,p.title,p.sku,p.status FROM products p WHERE ${selector} ORDER BY p.id LIMIT 1`, [value]);
  if (!result.rows.length) return { success: false, error: "Product not found", productId, productName };
  const product = result.rows[0];
  await pool.query(`UPDATE products SET status='Rejected', updated_at=NOW() WHERE id=$1`, [product.id]);
  try { await pool.query(`INSERT INTO ai_activity_logs (user_id,agent_name,action_type,message,metadata_json,status) VALUES (1,'AI CEO','PRODUCT_REJECTED',$1,$2,'SUCCESS')`, [`Rejected ${product.title} (${product.sku}) so an unverified image cannot block the catalogue. Reason: ${reason}`, JSON.stringify({ productId: product.id, sku: product.sku, reason })]); } catch {}
  return { success: true, productId: product.id, title: product.title, sku: product.sku, previousStatus: product.status, status: "Rejected", reason };
}
export async function inspectLiveBusinessData() {
  const [products, orders, storefrontOrders, activity, refreshes, approvals] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status ILIKE 'Published')::int AS published, COUNT(*) FILTER (WHERE image_url IS NULL OR image_url='')::int AS missing_images, COUNT(*) FILTER (WHERE status ILIKE 'Rejected')::int AS rejected FROM products`),
    pool.query(`SELECT COUNT(*)::int AS total, COALESCE(SUM(customer_paid_inr),0)::numeric AS revenue, COALESCE(SUM(net_profit_inr),0)::numeric AS profit, COUNT(*) FILTER (WHERE fulfillment_status IN ('RECHECK_REQUIRED','Pending','Received'))::int AS pending FROM orders`),
    pool.query(`SELECT COUNT(*)::int AS total, COALESCE(SUM(total_amount_inr),0)::numeric AS revenue, COUNT(*) FILTER (WHERE fulfillment_status IN ('RECHECK_REQUIRED','Pending','Received'))::int AS pending FROM storefront_orders`),
    pool.query(`SELECT agent_name, action_type, message, status, profit_impact_inr, created_at FROM ai_activity_logs ORDER BY created_at DESC LIMIT 40`),
    pool.query(`SELECT run_at,total_products_updated,total_products_added,total_products_dropped,avg_ai_score,top_category,total_projected_profit_inr,status FROM product_refresh_logs ORDER BY run_at DESC LIMIT 5`),
    listPendingApprovals(),
  ]);
  return { products: products.rows[0], internalOrders: orders.rows[0], storefrontOrders: storefrontOrders.rows[0], recentActivity: activity.rows, refreshes: refreshes.rows, pendingApprovals: approvals, inspectedAt: new Date().toISOString() };
}
export async function researchWeb(query: string) {
  const data = await serpSearch(query);
  return { organic: Array.isArray(data.organic_results) ? data.organic_results.slice(0, 8).map((x: any) => ({ title: x.title, link: x.link, snippet: x.snippet })) : [], shopping: Array.isArray(data.shopping_results) ? data.shopping_results.slice(0, 8).map((x: any) => ({ title: x.title, link: x.link, price: x.price, source: x.source })) : [] };
}
export async function resolveProductImages(productId?: number, productName?: string) { return resolveVerifiedProductMedia(productId, productName); }
export async function fashionStudio(command: string, productId?: number, productName?: string, count?: number, extraPrompt?: string) {
  return runFashionCommand({ command, productId, productName, count, extraPrompt });
}
export function listFashionCommands() { return FASHION_COMMANDS; }
