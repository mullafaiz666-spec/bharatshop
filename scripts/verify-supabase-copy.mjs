import pg from "pg";
import { verificationTables, sameDefinition, fingerprint } from './migration-copy-checks.mjs';

const { Pool } = pg;

const SOURCE_URL = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL || "";
const TARGET_URL = process.env.SUPABASE_DB_URL || "";

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
    select c.relname as table_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname
  `);
  return new Set(result.rows.map((row) => row.table_name));
}

async function countRows(pool, table) {
  if (!/^[a-zA-Z0-9_]+$/.test(table)) throw new Error(`Unsafe table identifier: ${table}`);
  const result = await pool.query(`select count(*)::bigint as count from public."${table}"`);
  return BigInt(result.rows[0]?.count || 0);
}

async function definition(client, table) {
  const relation = `public."${table}"`;
  const columns = await client.query(`
    select a.attnum as ordinal_position,
           a.attname,
           format_type(a.atttypid,a.atttypmod) as type,
           a.attnotnull,
           a.attidentity,
           a.attgenerated,
           pg_get_expr(d.adbin,d.adrelid) as default_expression
    from pg_attribute a
    left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=to_regclass($1) and a.attnum>0 and not a.attisdropped
    order by a.attnum`, [relation]);
  const constraints = await client.query(`
    select conname, contype, pg_get_constraintdef(oid, true) as definition
    from pg_constraint where conrelid=to_regclass($1)
    order by conname, contype, pg_get_constraintdef(oid, true)`, [relation]);
  const indexes = await client.query(`
    select indexname, indexdef
    from pg_indexes
    where schemaname='public' and tablename=$1
    order by indexname`, [table]);
  const triggers = await client.query(`
    select t.tgname as trigger_name, pg_get_triggerdef(t.oid, true) as definition
    from pg_trigger t
    where t.tgrelid=to_regclass($1) and not t.tgisinternal
    order by t.tgname`, [relation]);
  return { columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows, triggers: triggers.rows };
}

async function sequenceState(client) {
  const result = await client.query(`
    select sequencename,
           data_type,
           start_value::text,
           min_value::text,
           max_value::text,
           increment_by::text,
           cycle,
           cache_size::text,
           last_value::text
    from pg_sequences
    where schemaname='public'
    order by sequencename
  `);
  return result.rows;
}

async function main() {
  required("SOURCE_DATABASE_URL (or DATABASE_URL)", SOURCE_URL);
  required("SUPABASE_DB_URL", TARGET_URL);
  if (SOURCE_URL === TARGET_URL) throw new Error("Source and Supabase URLs are identical; refusing meaningless verification");

  const source = poolFor(SOURCE_URL);
  const target = poolFor(TARGET_URL);
  let sourceClient;
  let targetClient;
  try {
    sourceClient = await source.connect();
    targetClient = await target.connect();
    for (const client of [sourceClient, targetClient]) {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout = '120s'");
      await client.query("SET LOCAL row_security = off");
      await client.query("SET LOCAL timezone = 'UTC'");
      await client.query("SET LOCAL DateStyle = 'ISO, YMD'");
      await client.query("SET LOCAL search_path = public, pg_catalog");
    }
    const [sourceTables, targetTables] = await Promise.all([tableNames(sourceClient), tableNames(targetClient)]);
    const requestedTables = String(process.env.MIGRATION_VERIFY_TABLES || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const tables = verificationTables(sourceTables, targetTables, requestedTables);

    const rows = [];
    let mismatch = false;
    for (const table of tables) {
      if (!/^[a-zA-Z0-9_]+$/.test(table)) throw new Error('Unsupported table identifier');
      const [sourceDefinition, targetDefinition] = await Promise.all([definition(sourceClient, table), definition(targetClient, table)]);
      const schemaMatches = sameDefinition(sourceDefinition, targetDefinition);
      const [sourceCount, targetCount] = await Promise.all([countRows(sourceClient, table), countRows(targetClient, table)]);
      let contentMatches = false;
      if (schemaMatches && sourceCount === targetCount) {
        const [a, b] = await Promise.all([fingerprint(sourceClient, `public."${table}"`), fingerprint(targetClient, `public."${table}"`)]);
        contentMatches = a.count === b.count && a.digest === b.digest;
      }
      const matches = schemaMatches && sourceCount === targetCount && contentMatches;
      mismatch ||= !matches;
      rows.push({ table, source: sourceCount.toString(), supabase: targetCount.toString(), schemaMatches, contentMatches, matches });
    }

    const [sourceSequences, targetSequences] = await Promise.all([sequenceState(sourceClient), sequenceState(targetClient)]);
    const sequencesMatch = sameDefinition(sourceSequences, targetSequences);
    mismatch ||= !sequencesMatch;

    console.table(rows);
    console.log(JSON.stringify({
      sequencesMatch,
      sourceSequences: sourceSequences.map((sequence) => sequence.sequencename),
      supabaseSequences: targetSequences.map((sequence) => sequence.sequencename),
    }, null, 2));

    if (mismatch) {
      console.error("Supabase migration verification failed: schema/indexes/triggers, row counts/content, or sequence state differ. No cutover should occur.");
      process.exitCode = 3;
      return;
    }

    console.log(`Supabase migration verification passed for ${rows.length} table(s) and ${sourceSequences.length} public sequence(s). This script is read-only and performed no writes.`);
    console.log('Before cutover: keep source writes paused and independently validate RLS/Data API exposure, storage, sessions, payments and application acceptance. This is not automatic cutover authorization.');
  } finally {
    for (const client of [sourceClient, targetClient]) {
      if (client) { await client.query('ROLLBACK').catch(() => undefined); client.release(); }
    }
    await Promise.allSettled([source.end(), target.end()]);
  }
}

main().catch(() => {
  console.error("Supabase migration verification failed. Check connectivity and schema parity using private diagnostics. No cutover should occur.");
  process.exitCode = 1;
});
