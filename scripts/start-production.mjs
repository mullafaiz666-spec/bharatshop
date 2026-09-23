#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

// npm uses cmd.exe on Windows, which cannot expand ${PORT:-10000}.
// Launch Node directly so Windows and Unix use the same production entrypoint.
const require = createRequire(import.meta.url);
const port = process.env.PORT || "10000";
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.error("PORT must be an integer between 1 and 65535.");
  process.exit(1);
}
const child = spawn(process.execPath, [
  require.resolve("next/dist/bin/next"), "start", "-H", "0.0.0.0", "-p", port,
  ...process.argv.slice(2),
], { stdio: "inherit", env: process.env });

child.on("error", () => {
  console.error("Could not start the Next.js production server.");
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
});
