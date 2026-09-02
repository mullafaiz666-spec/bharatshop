import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __bharatShopPostgresPool?: Pool;
};

const isTransientConnectionError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /connection terminated|connection reset|ECONNRESET|EPIPE|socket hang up|Connection terminated unexpectedly|Connection terminated/i.test(message);
};

const createPool = (): Pool => {
  const rawDatabaseUrl = process.env.DATABASE_URL;
  if (!rawDatabaseUrl) {
    throw new Error("DATABASE_URL is required at runtime");
  }

  const isLocalDatabase = /(?:localhost|127\.0\.0\.1|\.railway\.internal)(?::\d+)?(?:\/|$)/i.test(rawDatabaseUrl);

  let databaseUrl = rawDatabaseUrl;
  if (!isLocalDatabase) {
    try {
      const parsed = new URL(rawDatabaseUrl);
      // Keep credentials and host intact, but make the client-side SSL policy
      // explicit through the Pool `ssl` option below. This avoids conflicting
      // pg connection-string SSL options while preserving Render's hostname.
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
    ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false, minVersion: "TLSv1.2" },
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30_000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 15_000),
    maxUses: Number(process.env.DB_MAX_USES ?? 1000),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    allowExitOnIdle: false,
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
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }

  throw lastError;
}
