#!/usr/bin/env node

import { config as loadDotEnv, parse as parseDotEnv } from "dotenv";
import pg from "pg";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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

function createPool(connectionString, local) {
  return new Pool({
    connectionString,
    ssl: local ? undefined : { rejectUnauthorized: false, minVersion: "TLSv1.2" },
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
}

function exactLocalContainerTarget(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return ["127.0.0.1", "localhost"].includes(parsed.hostname.toLowerCase())
      && String(parsed.port || "5432") === "55432";
  } catch {
    return false;
  }
}

function existingContainerDatabaseUrl() {
  if (!exactLocalContainerTarget(rawDatabaseUrl)) return null;

  const inspect = spawnSync(
    "docker",
    ["inspect", "-f", "{{json .Config.Env}}", "bharatshop-dev-db"],
    { encoding: "utf8", windowsHide: true, shell: false },
  );
  if (inspect.status !== 0) return null;

  try {
    const envList = JSON.parse(String(inspect.stdout || "").trim());
    if (!Array.isArray(envList)) return null;

    const env = Object.fromEntries(
      envList
        .map((entry) => String(entry))
        .map((entry) => {
          const index = entry.indexOf("=");
          return index > 0 ? [entry.slice(0, index), entry.slice(index + 1)] : null;
        })
        .filter(Boolean),
    );

    const user = String(env.POSTGRES_USER || "").trim();
    const password = String(env.POSTGRES_PASSWORD || "");
    const database = String(env.POSTGRES_DB || user || "").trim();
    if (!user || !password || !database) return null;

    return {
      value: `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:55432/${encodeURIComponent(database)}`,
      source: "existing-bharatshop-dev-db-container-env",
    };
  } catch {
    return null;
  }
}

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

function normalized(value) {
  return String(value || "").trim();
}

function evaluateMarketing(row) {
  const failures = [];
  if (normalized(row.status) !== "Published") failures.push("NOT_PUBLISHED");
  if (!(safeNumber(row.net_profit_inr) > 0)) failures.push("NON_POSITIVE_PROFIT");
  return failures;
}

function evaluateFashion(row) {
  const failures = [];
  const brand = normalized(row.brand).toLowerCase();
  const supplier = normalized(row.supplier_name).toLowerCase();
  const productionSupplier = normalized(row.production_supplier).toLowerCase();
  const inventoryMode = normalized(row.inventory_mode).toUpperCase();
  const ipPolicy = normalized(row.ip_policy).toUpperCase();

  if (!["bharatdrip", "bharatshop studio"].includes(brand)) failures.push("WRONG_BRAND");
  if (supplier !== "qikink") failures.push("WRONG_SUPPLIER");
  if (!(safeNumber(row.net_profit_inr) > 0)) failures.push("NON_POSITIVE_PROFIT");
  if (!(safeNumber(row.custom_margin_pct) >= 18)) failures.push("MARGIN_BELOW_18");
  if (productionSupplier !== "qikink") failures.push("PRODUCTION_SUPPLIER_NOT_QIKINK");
  if (inventoryMode !== "MADE_TO_ORDER") failures.push("NOT_MADE_TO_ORDER");
  if (!ipPolicy.includes("ORIGINAL")) failures.push("ORIGINAL_ART_POLICY_MISSING");
  return failures;
}

function buildDiagnostics(rows) {
  const unique = [...new Map(rows.map((row) => [Number(row.id), row])).values()];
  const marketingReasons = {};
  const fashionReasons = {};

  const marketingNearMatches = unique
    .map((row) => {
      const failures = evaluateMarketing(row);
      for (const reason of failures) marketingReasons[reason] = (marketingReasons[reason] || 0) + 1;
      return { ...summary(row), failedGates: failures };
    })
    .filter((row) => row.failedGates.length > 0)
    .sort((a, b) => a.failedGates.length - b.failedGates.length || (b.netProfitInr || 0) - (a.netProfitInr || 0))
    .slice(0, 10);

  const fashionNearMatches = unique
    .map((row) => {
      const failures = evaluateFashion(row);
      for (const reason of failures) fashionReasons[reason] = (fashionReasons[reason] || 0) + 1;
      return { ...summary(row), failedGates: failures };
    })
    .filter((row) => row.failedGates.length > 0)
    .sort((a, b) => a.failedGates.length - b.failedGates.length || (b.netProfitInr || 0) - (a.netProfitInr || 0))
    .slice(0, 10);

  return {
    totalProducts: unique.length,
    publishedProducts: unique.filter((row) => normalized(row.status) === "Published").length,
    positiveProfitProducts: unique.filter((row) => safeNumber(row.net_profit_inr) > 0).length,
    publishedPositiveProfitProducts: unique.filter((row) =>
      normalized(row.status) === "Published" && safeNumber(row.net_profit_inr) > 0
    ).length,
    marketingFailureCounts: marketingReasons,
    fashionFailureCounts: fashionReasons,
    marketingNearMatches,
    fashionNearMatches,
  };
}

async function queryCandidates(connectionString, local) {
  const pool = createPool(connectionString, local);
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

    const diagnostics = await pool.query(`
      SELECT p.id, p.title, p.brand, p.supplier_name, p.status, p.selling_price_inr,
             p.net_profit_inr, p.custom_margin_pct, p.image_url,
             COALESCE(pd.specifications_json ->> 'productionSupplier', '') AS production_supplier,
             COALESCE(pd.specifications_json ->> 'inventoryMode', '') AS inventory_mode,
             COALESCE(pd.specifications_json ->> 'ipPolicy', '') AS ip_policy
        FROM products p
        LEFT JOIN product_details pd ON pd.product_id = p.id
       ORDER BY p.id DESC
    `);

    await pool.query("ROLLBACK");
    return { marketing, fashion, diagnostics };
  } catch (error) {
    try { await pool.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function run() {
  let selectedDatabase = { value: databaseUrl, source: inheritedDatabase?.source || "unknown" };
  let result;

  try {
    result = await queryCandidates(selectedDatabase.value, isLocalDatabase);
  } catch (error) {
    const authFailure = String(error instanceof Error ? error.message : error).toLowerCase().includes("password authentication failed")
      || String(error?.code || "") === "28P01";

    if (!authFailure || !exactLocalContainerTarget(rawDatabaseUrl)) throw error;

    const containerDatabase = existingContainerDatabaseUrl();
    if (!containerDatabase) throw error;

    selectedDatabase = containerDatabase;
    result = await queryCandidates(selectedDatabase.value, true);
  }

  const { marketing, fashion, diagnostics } = result;
  const eligibilityDiagnostics = buildDiagnostics(diagnostics.rows);
  console.log(JSON.stringify({
    ok: true,
    mode: "AUTOM8AI_READ_ONLY_CANDIDATE_PREFLIGHT",
    sendsAutom8Webhook: false,
    startsRenderer: false,
    consumesCredits: false,
    mutatesDatabase: false,
    databaseSource: selectedDatabase.source,
    secretValuesPrinted: false,
    persistedSecretChanges: false,
    changedDatabasePassword: false,
    marketingVideoCandidates: marketing.rows.map(summary),
    fashionCreativeCandidates: fashion.rows.map(summary),
    eligibilityDiagnostics,
    next: fashion.rowCount
      ? `Use productId ${fashion.rows[0].id} for the first fashion-creative workflow test.`
      : marketing.rowCount
        ? `No strict fashion candidate found. ProductId ${marketing.rows[0].id} is available for a marketing-video workflow test.`
        : "No eligible Published profitable products were found.",
  }, null, 2));
}

run().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    mode: "AUTOM8AI_READ_ONLY_CANDIDATE_PREFLIGHT",
    error: error instanceof Error ? error.message : String(error),
    secretValuesPrinted: false,
    persistedSecretChanges: false,
    changedDatabasePassword: false,
  }, null, 2));
  process.exitCode = 1;
});
