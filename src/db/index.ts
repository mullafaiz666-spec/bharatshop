import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const rawDatabaseUrl = process.env.DATABASE_URL;

if (!rawDatabaseUrl) throw new Error("DATABASE_URL is required");

const globalForDb = globalThis as typeof globalThis & {
  __bharatShopPostgresPool?: Pool;
};

const isLocalDatabase = /(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(rawDatabaseUrl);

// Keep Render's external connection on TLS, but remove URL-level SSL options
// so node-postgres cannot let a connection-string option override the explicit
// TLS configuration below.
let databaseUrl = rawDatabaseUrl;
if (!isLocalDatabase) {
  try {
    const parsed = new URL(rawDatabaseUrl);
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("sslcert");
    parsed.searchParams.delete("sslkey");
    parsed.searchParams.delete("sslrootcert");
    databaseUrl = parsed.toString();
  } catch {
    // Let pg report malformed connection strings explicitly.
  }
}

const makePool = () =>
  new Pool({
    connectionString: databaseUrl,
    ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 1_000,
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 15_000),
    maxUses: 1,
    keepAlive: false,
    allowExitOnIdle: true,
  });

const pool = globalForDb.__bharatShopPostgresPool ?? makePool();

globalForDb.__bharatShopPostgresPool = pool;

pool.on("error", (error) => {
  console.warn(
    "Postgres pooled connection discarded:",
    error instanceof Error ? error.message : error,
  );
});

const isTransientConnectionError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /connection terminated|connection reset|ECONNRESET|EPIPE|socket hang up|Connection terminated unexpectedly/i.test(message);
};

// A terminated Render socket can survive inside a serverless pool long enough
// to make the next request fail too. The first retry therefore uses a brand-new
// Pool/socket, then closes that disposable pool. Production data is never
// mutated by this layer.
const originalQuery = pool.query.bind(pool);
pool.query = (async (...args: any[]) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (attempt === 0) {
        return await (originalQuery as (...queryArgs: any[]) => Promise<unknown>)(...args);
      }

      const freshPool = makePool();
      try {
        return await freshPool.query(...args);
      } finally {
        await freshPool.end().catch(() => undefined);
      }
    } catch (error) {
      lastError = error;
      if (!isTransientConnectionError(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw lastError;
}) as typeof pool.query;

export { pool };
export const db = drizzle(pool);
