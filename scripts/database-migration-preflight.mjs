import pg from "pg";

const { Pool } = pg;

const SOURCE_URL = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL || "";
const TARGET_URL = process.env.SUPABASE_DB_URL || "";
const REQUIRED_SOURCE_TABLES = ["admin_sessions", "orders", "product_details", "product_images", "products", "users"];
const KNOWN_EMPTY_TARGET_TABLES = ["order_items", "orders", "products", "profiles"];

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

async function tableNames(client) {
  const result = await client.query(`
    select c.relname as table_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname
  `);
  return result.rows.map((row) => String(row.table_name));
}

async function rowCount(client, table) {
  if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error(`Unsafe table identifier: ${table}`);
  const result = await client.query(`select count(*)::bigint as count from public."${table}"`);
  return String(result.rows[0]?.count || "0");
}

async function databaseIdentity(client) {
  const result = await client.query(`
    select current_database() as database,
           current_user as user,
           current_setting('server_version') as version,
           inet_server_addr()::text as server_addr
  `);
  return result.rows[0] || {};
}

async function main() {
  required("SOURCE_DATABASE_URL (or DATABASE_URL)", SOURCE_URL);
  required("SUPABASE_DB_URL", TARGET_URL);
  if (SOURCE_URL === TARGET_URL) throw new Error("Source and target connection strings are identical");

  const source = poolFor(SOURCE_URL);
  const target = poolFor(TARGET_URL);
  let sourceClient;
  let targetClient;

  try {
    sourceClient = await source.connect();
    targetClient = await target.connect();
    for (const client of [sourceClient, targetClient]) {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = '60s'");
      await client.query("SET LOCAL timezone = 'UTC'");
      await client.query("SET LOCAL search_path = public, pg_catalog");
    }

    const [sourceIdentity, targetIdentity, sourceTables, targetTables] = await Promise.all([
      databaseIdentity(sourceClient),
      databaseIdentity(targetClient),
      tableNames(sourceClient),
      tableNames(targetClient),
    ]);

    const missingCore = REQUIRED_SOURCE_TABLES.filter((table) => !sourceTables.includes(table));
    if (missingCore.length) throw new Error(`Source is missing BharatShop core tables: ${missingCore.join(", ")}`);

    const targetCounts = {};
    for (const table of targetTables) targetCounts[table] = await rowCount(targetClient, table);

    const unexpectedTargetTables = targetTables.filter((table) => !KNOWN_EMPTY_TARGET_TABLES.includes(table));
    const missingStarterTables = KNOWN_EMPTY_TARGET_TABLES.filter((table) => !targetTables.includes(table));
    const nonEmptyTargetTables = targetTables.filter((table) => targetCounts[table] !== "0");
    const exactKnownStarterShape = unexpectedTargetTables.length === 0 &&
      missingStarterTables.length === 0 &&
      targetTables.length === KNOWN_EMPTY_TARGET_TABLES.length;

    const report = {
      status: "READ_ONLY_PREFLIGHT_COMPLETE",
      source: {
        database: sourceIdentity.database,
        user: sourceIdentity.user,
        version: sourceIdentity.version,
        serverAddress: sourceIdentity.server_addr,
        publicTableCount: sourceTables.length,
        publicTables: sourceTables,
      },
      target: {
        database: targetIdentity.database,
        user: targetIdentity.user,
        version: targetIdentity.version,
        serverAddress: targetIdentity.server_addr,
        publicTableCount: targetTables.length,
        publicTables: targetTables,
        rowCounts: targetCounts,
      },
      guards: {
        requiredSourceTablesPresent: true,
        targetMatchesKnownStarterSchema: exactKnownStarterShape,
        targetPublicTablesEmpty: nonEmptyTargetTables.length === 0,
        unexpectedTargetTables,
        missingStarterTables,
        nonEmptyTargetTables,
        safeForGuardedReplacement: exactKnownStarterShape && nonEmptyTargetTables.length === 0,
      },
    };

    console.log(JSON.stringify(report, null, 2));
    if (!report.guards.safeForGuardedReplacement) {
      console.error("Target is not the exact known empty starter schema. Refusing migration preparation.");
      process.exitCode = 3;
    }
  } finally {
    for (const client of [sourceClient, targetClient]) {
      if (client) {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
    }
    await Promise.allSettled([source.end(), target.end()]);
  }
}

main().catch((error) => {
  console.error(`Database migration preflight failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
