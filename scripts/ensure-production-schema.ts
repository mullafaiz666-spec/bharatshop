import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

// Apply the committed Drizzle schema to the production database before the app starts.
// `push` is intentionally used here because this deployment currently has no generated
// migration history on the Render database. It is idempotent for the existing schema.
execSync("npx drizzle-kit push --force", {
  stdio: "inherit",
  env: process.env,
});
