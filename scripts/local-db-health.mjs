#!/usr/bin/env node

import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

function safeTarget(url) {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`Refusing database health check for non-local host "${host}". Local cockpit DB checks are loopback-only.`);
  }
  return {
    host,
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//, '') || '(default)',
  };
}

async function main() {
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!url) throw new Error('DATABASE_URL is not configured in this local runtime.');
  const target = safeTarget(url);
  const client = new Client({
    connectionString: url,
    ssl: false,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
    statement_timeout: 5000,
    application_name: 'bharatshop-local-db-health',
  });

  try {
    await client.connect();
    const ping = await client.query('select 1 as ok');
    const tableCheck = await client.query("select to_regclass('public.products') as products, to_regclass('public.orders') as orders");
    const counts = {};
    if (tableCheck.rows[0]?.products) {
      const r = await client.query('select count(*)::int as count from public.products');
      counts.products = r.rows[0]?.count ?? null;
    }
    if (tableCheck.rows[0]?.orders) {
      const r = await client.query('select count(*)::int as count from public.orders');
      counts.orders = r.rows[0]?.count ?? null;
    }
    console.log(JSON.stringify({
      ok: ping.rows[0]?.ok === 1,
      target,
      tables: {
        products: Boolean(tableCheck.rows[0]?.products),
        orders: Boolean(tableCheck.rows[0]?.orders),
      },
      counts,
      mode: 'READ_ONLY_HEALTH_CHECK',
    }, null, 2));
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
