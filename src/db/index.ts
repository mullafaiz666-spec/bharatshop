import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __bharatShopPostgresPool?: Pool;
};

// Vercel serverless instances can survive longer than an upstream hosted
// PostgreSQL connection. Keep a small reusable pool, but do not aggressively
// retire connections after a single query; that pattern was causing stale
// sockets and "Connection terminated unexpectedly" in production.
const isLocalDatabase = /(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(databaseUrl);

const pool =
  globalForDb.__bharatShopPostgresPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false },
    max: Number(process.env.DB_POOL_MAX ?? 2),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30_000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 15_000),
    maxUses: Number(process.env.DB_MAX_USES ?? 500),
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,
  });

pool.on("error", (error) => {
  console.warn("Postgres pool connection reset:", error instanceof Error ? error.message : error);
});

globalForDb.__bharatShopPostgresPool = pool;

export { pool };
export const db = drizzle(pool);
