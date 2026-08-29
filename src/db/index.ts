import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("DATABASE_URL is required");

const globalForDb = globalThis as typeof globalThis & { __bharatShopPostgresPool?: Pool };
const isLocalDatabase = /(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(databaseUrl);

// Production PostgreSQL may be restarted or sleep outside Vercel. Never keep a
// serverless function holding the same socket long enough for the upstream to
// terminate it. maxUses=1 forces pg to discard a connection after each query,
// while the short idle timeout prevents stale sockets surviving between calls.
// This deliberately favors a fresh verified connection over connection reuse.
const pool = globalForDb.__bharatShopPostgresPool ?? new Pool({
  connectionString: databaseUrl,
  ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false },
  max: Number(process.env.DB_POOL_MAX ?? 2),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 1_000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 15_000),
  maxUses: Number(process.env.DB_MAX_USES ?? 1),
  keepAlive: false,
});

pool.on("error", (error) => {
  console.warn("Postgres pooled connection discarded:", error instanceof Error ? error.message : error);
});

globalForDb.__bharatShopPostgresPool = pool;

export { pool };
export const db = drizzle(pool);
