import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __bharatShopPostgresPool?: Pool;
};

// Render/Postgres connections can be TLS-backed. Keep TLS enabled for hosted
// Postgres while still allowing local development connections.
const isLocalDatabase = /(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(databaseUrl);

const pool =
  globalForDb.__bharatShopPostgresPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false },
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30_000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 10_000),
    maxUses: Number(process.env.DB_MAX_USES ?? 7500),
  });

// Reuse one pool across Next.js hot reloads and serverless/runtime module
// re-evaluation. This prevents connection storms and stale local globals.
globalForDb.__bharatShopPostgresPool = pool;

export { pool };
export const db = drizzle(pool);
