import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __bharatShopPostgresPool?: Pool;
};

// Vercel functions can outlive the upstream Render/Postgres connection. Keep
// the pool deliberately small and short-lived so a stale socket is not reused
// after the hosted database terminates it.
const isLocalDatabase = /(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(databaseUrl);

const pool =
  globalForDb.__bharatShopPostgresPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false },
    max: Number(process.env.DB_POOL_MAX ?? 1),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 1_000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 10_000),
    maxUses: Number(process.env.DB_MAX_USES ?? 25),
    keepAlive: true,
    keepAliveInitialDelayMillis: 1_000,
  });

pool.on("error", (error) => {
  console.warn("Postgres pool connection reset:", error instanceof Error ? error.message : error);
});

globalForDb.__bharatShopPostgresPool = pool;

export { pool };
export const db = drizzle(pool);
