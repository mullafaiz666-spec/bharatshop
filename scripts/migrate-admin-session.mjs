import pg from "pg";

const { Client } = pg;
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new Client({ connectionString: url, ssl: process.env.DATABASE_SSL === "disable" ? false : { rejectUnauthorized: false } });

await client.connect();
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS admin_sessions_token_hash_key
    ON admin_sessions (token_hash)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS research_findings (
      id SERIAL PRIMARY KEY,
      query TEXT NOT NULL,
      source TEXT NOT NULL,
      sources_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
      verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
      learning_summary TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS research_findings_query_idx
    ON research_findings (query)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS research_findings_created_at_idx
    ON research_findings (created_at)
  `);

  console.log("admin_sessions + research_findings migration applied (additive/idempotent; existing tables and rows untouched)");
} finally {
  await client.end();
}
