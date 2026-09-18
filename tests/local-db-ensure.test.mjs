import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../scripts/local-db-ensure.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("local DB ensure targets only the preserved existing container", () => {
  assert.ok(source.includes('const CONTAINER = "bharatshop-dev-db"'));
  assert.ok(source.includes('const PORT = 55432'));
  assert.ok(source.includes('runDocker(["inspect"'));
  assert.ok(source.includes('runDocker(["start", CONTAINER])'));
  assert.ok(source.includes('"Docker Desktop.exe"'));
  assert.ok(source.includes('runDocker(["info", "--format", "{{.ServerVersion}}"])'));
  assert.doesNotMatch(source, /runDocker\(\["(?:run|rm|create|volume|exec)"/i);
});

test("local DB ensure declares all destructive operations disabled", () => {
  assert.ok(source.includes("createdContainer: false"));
  assert.ok(source.includes("resetDatabase: false"));
  assert.ok(source.includes("removedContainer: false"));
  assert.ok(source.includes("reseededDatabase: false"));
  assert.ok(source.includes("mutatedApplicationData: false"));
});

test("package exposes safe local DB ensure command", () => {
  assert.equal(pkg.scripts["db:local:ensure"], "node scripts/local-db-ensure.mjs");
});
