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

// `db` must stay lazy too: drizzle(pool) touches pool properties immediately,
// which would trigger a real connection attempt at module-import time (i.e.
// during `next build`, before DATABASE_URL exists). Deferring behind a Proxy
// keeps import-time side effects at zero.
type DbInstance = ReturnType<typeof drizzle>;
let dbInstance: DbInstance | undefined;

const getDb = (): DbInstance => {
  if (!dbInstance) {
    dbInstance = drizzle(getPool());
  }
  return dbInstance;
};

export const db = new Proxy({} as DbInstance, {
  get(_target, property, receiver) {
    const value = Reflect.get(getDb() as object, property, receiver);
    return typeof value === "function" ? value.bind(getDb()) : value;
  },
}) as DbInstance;

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

      const stalePool = globalForDb.__bharatShopPostgresPool;
      globalForDb.__bharatShopPostgresPool = undefined;
      await stalePool?.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }

  throw lastError;
}
