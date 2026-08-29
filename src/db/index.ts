import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const rawDatabaseUrl = process.env.DATABASE_URL;

if (!rawDatabaseUrl) throw new Error("DATABASE_URL is required");

const globalForDb = globalThis as typeof globalThis & {
  __bharatShopPostgresPool?: Pool;
};

const isLocalDatabase = /(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(rawDatabaseUrl);

// Vercel connects to the Render database through Render's external endpoint.
// Always use TLS there and normalize the connection-string SSL mode.
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

// Render can terminate an active external TCP socket during maintenance,
// failover, or outbound-network changes. Keep each connection disposable and
// retry only the transient connection failures. Production data remains strictly
// read/write through the existing application code; this layer never mutates data.
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

const originalQuery = pool.query.bind(pool);
const isTransientConnectionError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /connection terminated|connection reset|ECONNRESET|EPIPE|socket hang up|Connection terminated unexpectedly/i.test(message);
};

pool.query = (async (...args: any[]) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await originalQuery(...args);
    } catch (error) {
      lastError = error;
      if (!isTransientConnectionError(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw lastError;
}) as typeof pool.query;

globalForDb.__bharatShopPostgresPool = pool;

export { pool };
export const db = drizzle(pool);
