import { spawnSync } from "node:child_process";

const raw = process.env.DATABASE_URL || "";
if (!raw) {
  console.error("DATABASE_URL is required for db:push");
  process.exit(1);
}

let host = "unknown";
try { host = new URL(raw).hostname; } catch {
  console.error("DATABASE_URL is invalid");
  process.exit(1);
}

const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
if (!local && process.env.ALLOW_REMOTE_DB_PUSH !== "YES") {
  console.error(`Refusing schema push to remote PostgreSQL host ${host}.`);
  console.error("Production data is source-of-truth and destructive/forced pushes are forbidden.");
  console.error("For an explicitly reviewed additive remote migration, set ALLOW_REMOTE_DB_PUSH=YES and run without --force.");
  process.exit(2);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["drizzle-kit", "push"], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
