import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("DATABASE_URL is required");

const globalForDb = globalThis as typeof globalThis & { __bharatShopPostgresPool?: Pool };
const isLocalDatabase = /(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(databaseUrl);

// The production database is hosted outside Vercel. Keep serverless pools
// deliberately short-lived so a sleeping/restarted upstream PostgreSQL server
// cannot leave Vercel holding a dead socket between invocations.
const pool = globalForDb.__bharatShopPostgresPool ?? new Pool({
  connectionString: databaseUrl,
  ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false },
  max: Number(process.env.DB_POOL_MAX ?? 2),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 5_000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 15_000),
  maxUses: Number(process.env.DB_MAX_USES ?? 25),
  keepAlive: true,
  keepAliveInitialDelayMillis: 1_000,
});

pool.on("error", (error) => {
  console.warn("Postgres pooled connection discarded:", error instanceof Error ? error.message : error);
});

globalForDb.__bharatShopPostgresPool = pool;

export { pool };
export const db = drizzle(pool);
