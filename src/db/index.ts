import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const rawDatabaseUrl = process.env.DATABASE_URL;

if (!rawDatabaseUrl) throw new Error("DATABASE_URL is required");

const globalForDb = globalThis as typeof globalThis & {
  __bharatShopPostgresPool?: Pool;
};

const isLocalDatabase = /(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(rawDatabaseUrl);

// Render's external PostgreSQL endpoint is outside Render's private network and
// requires TLS. Normalize the URL here so a copied Render External Database URL
// works even when its displayed value omits sslmode=require.
let databaseUrl = rawDatabaseUrl;
if (!isLocalDatabase) {
  try {
    const parsed = new URL(rawDatabaseUrl);
    if (!parsed.searchParams.has("sslmode")) parsed.searchParams.set("sslmode", "require");
    databaseUrl = parsed.toString();
  } catch {
    // Leave malformed URLs to pg so the resulting configuration error is explicit.
  }
}

// Vercel functions can be reused after the database restarts or a transient TCP
// reset. Keep the pool deliberately small and short-lived, but allow TCP keepalive
// and let pg discard failed clients. This avoids retaining dead Render sockets
// while still supporting multiple queries during one invocation.
const pool = globalForDb.__bharatShopPostgresPool ?? new Pool({
  connectionString: databaseUrl,
  ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false },
  max: Number(process.env.DB_POOL_MAX ?? 1),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 5_000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 15_000),
  maxUses: Number(process.env.DB_MAX_USES ?? 25),
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  allowExitOnIdle: true,
});

pool.on("error", (error) => {
  console.warn("Postgres pooled connection discarded:", error instanceof Error ? error.message : error);
});

globalForDb.__bharatShopPostgresPool = pool;

export { pool };
export const db = drizzle(pool);
