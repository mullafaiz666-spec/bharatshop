import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __bharatShopPostgresPool?: Pool;
};

const isTransientConnectionError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /connection terminated|connection reset|ECONNRESET|EPIPE|socket hang up|Connection terminated unexpectedly/i.test(message);
};

const createPool = (): Pool => {
  const rawDatabaseUrl = process.env.DATABASE_URL;
  if (!rawDatabaseUrl) {
    throw new Error("DATABASE_URL is required at runtime");
  }

  const isLocalDatabase = /(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(rawDatabaseUrl);

  // Keep Render's external connection on TLS, but remove URL-level SSL options
  // so node-postgres cannot let a connection-string option override explicit TLS.
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
      // Let pg report malformed connection strings explicitly at runtime.
    }
  }

  const pool = new Pool({
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

  return pool;
};

const getPool = (): Pool => {
  if (!globalForDb.__bharatShopPostgresPool) {
    globalForDb.__bharatShopPostgresPool = createPool();
  }
  return globalForDb.__bharatShopPostgresPool;
};

// The module itself is safe to import during `next build`: DATABASE_URL is
// deliberately read only when the first database operation actually occurs.
// A Proxy preserves the existing `pool.query(...)` call sites while deferring
// creation of the real pg Pool until runtime.
export const pool = new Proxy({} as Pool, {
  get(_target, property, receiver) {
    const value = Reflect.get(getPool() as object, property, receiver);
    return typeof value === "function" ? value.bind(getPool()) : value;
  },
  set(_target, property, value) {
    Reflect.set(getPool() as object, property, value);
    return true;
  },
});

export const db = drizzle(pool);

// Executes a query with recovery from stale/reset serverless sockets.
// This is intentionally separate from module initialization so builds never
// require a live database connection.
export async function queryWithRetry<T>(
  query: (pool: Pool) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await query(getPool());
    } catch (error) {
      lastError = error;
      if (!isTransientConnectionError(error) || attempt === 2) throw error;

      // Drop the stale global pool before the next attempt so a fresh socket is used.
      const stalePool = globalForDb.__bharatShopPostgresPool;
      globalForDb.__bharatShopPostgresPool = undefined;
      await stalePool?.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }

  throw lastError;
}
