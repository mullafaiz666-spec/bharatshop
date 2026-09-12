import { createHash } from 'node:crypto';

export const REQUIRED_TABLES = ['users', 'products', 'product_images', 'product_details', 'orders', 'admin_sessions'];

export function verificationTables(sourceTables, targetTables, requestedTables = []) {
  const source = new Set(sourceTables);
  const target = new Set(targetTables);
  const missingSource = REQUIRED_TABLES.filter(table => !source.has(table));
  if (missingSource.length) throw new Error(`Source is not a complete BharatShop database: ${missingSource.join(', ')}`);
  if (requestedTables.length && (requestedTables.length !== source.size ||
      new Set(requestedTables).size !== source.size || requestedTables.some(table => !source.has(table)))) {
    throw new Error('Partial table verification cannot authorize database cutover');
  }
  const missingTarget = [...source].filter(table => !target.has(table));
  if (missingTarget.length) throw new Error(`Supabase copy is missing required tables: ${missingTarget.join(', ')}`);
  return [...source].sort();
}

export function sameDefinition(source, target) {
  return JSON.stringify(source) === JSON.stringify(target);
}

export async function fingerprint(client, quotedTable) {
  const hash = createHash('sha256');
  let count = 0n;
  // Order canonical JSON using a fixed collation on both PostgreSQL versions.
  // A cursor bounds Node memory. Values remain private and are never logged.
  await client.query(`DECLARE copy_rows NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS value FROM ${quotedTable} t ORDER BY to_jsonb(t)::text COLLATE "C"`);
  try {
    for (;;) {
      const result = await client.query('FETCH FORWARD 500 FROM copy_rows');
      if (!result.rows.length) break;
      for (const row of result.rows) {
        const value = String(row.value);
        hash.update(`${Buffer.byteLength(value)}:`).update(value);
        count += 1n;
      }
    }
  } finally { await client.query('CLOSE copy_rows'); }
  return { count: count.toString(), digest: hash.digest('hex') };
}
