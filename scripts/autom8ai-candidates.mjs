#!/usr/bin/env node

import { config as loadDotEnv, parse as parseDotEnv } from "dotenv";
import pg from "pg";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const { Pool } = pg;
const envLocal = resolve(process.cwd(), ".env.local");
if (existsSync(envLocal)) loadDotEnv({ path: envLocal, override: false });

function existingHarnessDatabaseUrl() {
  const candidates = [
    resolve(process.cwd(), "..", "bharatshop-harness", ".env.local"),
    resolve(process.cwd(), "..", "bharatshop-harness", ".env"),
    resolve(homedir(), "bharatshop-harness", ".env.local"),
    resolve(homedir(), "bharatshop-harness", ".env"),
  ];

  for (const file of [...new Set(candidates)]) {
    if (!existsSync(file)) continue;
    try {
      const parsed = parseDotEnv(readFileSync(file));
      const value = String(parsed.DATABASE_URL || parsed.SUPABASE_DB_URL || "").trim();
      if (value) return { value, source: "existing-bharatshop-harness-env" };
    } catch {
      // Keep searching. Never print env file contents.
    }
  }
  return null;
}

const directDatabaseUrl = String(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim();
const inheritedDatabase = directDatabaseUrl
  ? { value: directDatabaseUrl, source: "repair-worktree-or-process-env" }
  : existingHarnessDatabaseUrl();

const rawDatabaseUrl = inheritedDatabase?.value || "";
if (!rawDatabaseUrl) {
  console.error(JSON.stringify({
    ok: false,
    mode: "AUTOM8AI_READ_ONLY_CANDIDATE_PREFLIGHT",
    error: "DATABASE_URL or SUPABASE_DB_URL was not found in the repair worktree or existing bharatshop-harness env files.",
    checkedSecretsSafely: true,
    secretValuesPrinted: false,
  }, null, 2));
  process.exit(1);
}

const isLocalDatabase = /(?:localhost|127\.0\.0\.1|\.railway\.internal)(?::\d+)?(?:\/|$)/i.test(rawDatabaseUrl);
let databaseUrl = rawDatabaseUrl;
if (!isLocalDatabase) {
  try {
    const parsed = new URL(rawDatabaseUrl);
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) parsed.searchParams.delete(key);
    databaseUrl = parsed.toString();
  } catch {}
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  max: 1,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: true,
});

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function summary(row) {
  return {
    id: Number(row.id),
    title: String(row.title || ""),
    brand: String(row.brand || ""),
    supplier: String(row.supplier_name || ""),
    status: String(row.status || ""),
    sellingPriceInr: safeNumber(row.selling_price_inr),
    netProfitInr: safeNumber(row.net_profit_inr),
    marginPct: safeNumber(row.custom_margin_pct),
    imagePresent: Boolean(String(row.image_url || "").trim()),
  };
}

try {
  await pool.query("BEGIN READ ONLY");

  const marketing = await pool.query(`
    SELECT id, title, brand, supplier_name, status, selling_price_inr,
           net_profit_inr, custom_margin_pct, image_url
      FROM products
     WHERE status = 'Published'
       AND net_profit_inr::numeric > 0
     ORDER BY net_profit_inr::numeric DESC, id DESC
     LIMIT 10
  `);

  const fashion = await pool.query(`
    SELECT p.id, p.title, p.brand, p.supplier_name, p.status, p.selling_price_inr,
           p.net_profit_inr, p.custom_margin_pct, p.image_url,
           COALESCE(pd.specifications_json ->> 'productionSupplier', '') AS production_supplier,
           COALESCE(pd.specifications_json ->> 'inventoryMode', '') AS inventory_mode,
           COALESCE(pd.specifications_json ->> 'ipPolicy', '') AS ip_policy
      FROM products p
      LEFT JOIN product_details pd ON pd.product_id = p.id
     WHERE LOWER(p.brand) IN ('bharatdrip', 'bharatshop studio')
       AND LOWER(p.supplier_name) = 'qikink'
       AND p.net_profit_inr::numeric > 0
       AND p.custom_margin_pct::numeric >= 18
       AND LOWER(COALESCE(pd.specifications_json ->> 'productionSupplier', '')) = 'qikink'
       AND UPPER(COALESCE(pd.specifications_json ->> 'inventoryMode', '')) = 'MADE_TO_ORDER'
       AND UPPER(COALESCE(pd.specifications_json ->> 'ipPolicy', '')) LIKE '%ORIGINAL%'
     ORDER BY p.net_profit_inr::numeric DESC, p.id DESC
     LIMIT 10
  `);

  await pool.query("ROLLBACK");

  console.log(JSON.stringify({
    ok: true,
    mode: "AUTOM8AI_READ_ONLY_CANDIDATE_PREFLIGHT",
    sendsAutom8Webhook: false,
    startsRenderer: false,
    consumesCredits: false,
    mutatesDatabase: false,
    databaseSource: inheritedDatabase?.source || "unknown",
    secretValuesPrinted: false,
    marketingVideoCandidates: marketing.rows.map(summary),
    fashionCreativeCandidates: fashion.rows.map(summary),
    next: fashion.rowCount
      ? `Use productId ${fashion.rows[0].id} for the first fashion-creative workflow test.`
      : marketing.rowCount
        ? `No strict fashion candidate found. ProductId ${marketing.rows[0].id} is available for a marketing-video workflow test.`
        : "No eligible Published profitable products were found.",
  }, null, 2));
} catch (error) {
  try { await pool.query("ROLLBACK"); } catch {}
  console.error(JSON.stringify({
    ok: false,
    mode: "AUTOM8AI_READ_ONLY_CANDIDATE_PREFLIGHT",
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => undefined);
}
