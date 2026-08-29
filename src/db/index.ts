import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const rawDatabaseUrl = process.env.DATABASE_URL;

if (!rawDatabaseUrl) throw new Error("DATABASE_URL is required");

const globalForDb = globalThis as typeof globalThis & {
  __bharatShopPostgresPool?: Pool;
};

const isLocalDatabase = /(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(rawDatabaseUrl);

// Vercel connects to the Render database through Render's external endpoint.
// Always use TLS there and normalize missing/legacy sslmode settings.
let databaseUrl = rawDatabaseUrl;
if (!isLocalDatabase) {
  try {
    const parsed = new URL(rawDatabaseUrl);
    parsed.searchParams.set("sslmode", "require");
    databaseUrl = parsed.toString();
  } catch {
    // Let pg report malformed connection strings explicitly.
  }
}

// Production PostgreSQL can terminate idle/existing sockets during maintenance,
// failover, or outbound-network changes. In Vercel serverless functions, prefer a
// fresh verified socket for every query over retaining a connection that may have
// been reset upstream. This is intentionally conservative because production DB
// data is the source of truth and must never be recreated or repaired implicitly.
const pool = globalForDb.__bharatShopPostgresPool ?? new Pool({
  connectionString: databaseUrl,
  ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 1_000,
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 15_000),
  maxUses: 1,
  keepAlive: false,
  allowExitOnIdle: true,
});

pool.on("error", (error) => {
  console.warn(
    "Postgres pooled connection discarded:",
    error instanceof Error ? error.message : error,
  );
});

globalForDb.__bharatShopPostgresPool = pool;

export { pool };
export const db = drizzle(pool);
