#!/usr/bin/env node
import { config as loadDotEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envFile = resolve(process.cwd(), ".env.local");
if (!existsSync(envFile)) {
  console.error("Missing .env.local. Run npm run db:migration:configure:windows first.");
  process.exit(1);
}

loadDotEnv({ path: envFile, override: false });

const source = String(process.env.SOURCE_DATABASE_URL || "").trim();
const target = String(process.env.SUPABASE_DB_URL || "").trim();

if (!source || !target) {
  console.error("SOURCE_DATABASE_URL and SUPABASE_DB_URL must both be configured.");
  process.exit(1);
}

console.log(JSON.stringify({
  mode: "READ_ONLY_DATABASE_MIGRATION_PREFLIGHT",
  sourceConfigured: true,
  targetConfigured: true,
  secretValuesPrinted: false,
  mutatesSource: false,
  mutatesTarget: false,
}, null, 2));

await import("./database-migration-preflight.mjs");
