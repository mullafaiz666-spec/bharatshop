import pg from "pg";

const { Pool } = pg;

const SOURCE_URL = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL || "";
const TARGET_URL = process.env.SUPABASE_DB_URL || "";
const DEFAULT_TABLES = [
  "users",
  "products",
  "product_images",
  "product_details",
  "orders",
  "storefront_orders",
  "marketing_campaigns",
  "ai_activity_logs",
  "company_goals",
  "company_work_items",
  "company_events",
  "admin_sessions",
];

function required(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function poolFor(url) {
  return new Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/i.test(url) ? undefined : { rejectUnauthorized: false, minVersion: "TLSv1.2" },
    max: 1,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 5_000,
  });
}

async function tableNames(pool) {
  const result = await pool.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `);
  return new Set(result.rows.map((row) => row.table_name));
}

async function countRows(pool, table) {
  if (!/^[a-zA-Z0-9_]+$/.test(table)) throw new Error(`Unsafe table identifier: ${table}`);
  const result = await pool.query(`select count(*)::bigint as count from public."${table}"`);
  return BigInt(result.rows[0]?.count || 0);
}

async function main() {
  required("SOURCE_DATABASE_URL (or DATABASE_URL)", SOURCE_URL);
  required("SUPABASE_DB_URL", TARGET_URL);
  if (SOURCE_URL === TARGET_URL) throw new Error("Source and Supabase URLs are identical; refusing meaningless verification");

  const source = poolFor(SOURCE_URL);
  const target = poolFor(TARGET_URL);
  try {
    const [sourceTables, targetTables] = await Promise.all([tableNames(source), tableNames(target)]);
    const requestedTables = String(process.env.MIGRATION_VERIFY_TABLES || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const tables = requestedTables.length ? requestedTables : DEFAULT_TABLES.filter((table) => sourceTables.has(table));

    const missing = tables.filter((table) => !targetTables.has(table));
    if (missing.length) {
      console.error("Supabase copy is missing required tables:", missing.join(", "));
      process.exitCode = 2;
      return;
    }

    const rows = [];
    let mismatch = false;
    for (const table of tables) {
      const [sourceCount, targetCount] = await Promise.all([countRows(source, table), countRows(target, table)]);
      const matches = sourceCount === targetCount;
      mismatch ||= !matches;
      rows.push({ table, source: sourceCount.toString(), supabase: targetCount.toString(), matches });
    }

    console.table(rows);
    if (mismatch) {
      console.error("Supabase migration verification failed: one or more row counts differ. No cutover should occur.");
      process.exitCode = 3;
      return;
    }

    console.log(`Supabase migration verification passed for ${rows.length} table(s). This script is read-only and performed no writes.`);
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

main().catch((error) => {
  console.error("Supabase migration verification failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
