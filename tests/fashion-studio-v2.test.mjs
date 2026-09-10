import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const studio = readFileSync(new URL("../src/components/FashionDesignerStudio.tsx", import.meta.url), "utf8");
const media = readFileSync(new URL("../src/app/api/admin/fashion-studio/media/route.ts", import.meta.url), "utf8");
const photoStudio = readFileSync(new URL("../src/app/api/automation/fashion-photo-studio/route.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/app/api/admin/fashion-studio/route.ts", import.meta.url), "utf8");
const commandCentre = readFileSync(new URL("../src/app/api/admin/command-centre/route.ts", import.meta.url), "utf8");

test("Fashion Studio v2 exposes a real visual editing workspace", () => {
  assert.ok(studio.includes("Trend & inspiration board"));
  assert.ok(studio.includes("GarmentCanvas"));
  assert.ok(studio.includes("Artwork scale"));
  assert.ok(studio.includes("Qikink estimate"));
  assert.ok(studio.includes("Queue for CEO review"));
});

test("Fashion Studio accepts normal raster product photos", () => {
  assert.ok(studio.includes("Upload normal product photo"));
  assert.ok(studio.includes("/api/admin/fashion-studio/media"));
  assert.ok(media.includes("image/jpeg"));
  assert.ok(media.includes("image/png"));
  assert.ok(media.includes("image/webp"));
  assert.ok(media.includes("sniffMime"));
  assert.ok(media.includes("MAX_IMAGE_BYTES"));
  assert.ok(media.includes("MANUAL_STUDIO_UPLOAD"));
});

test("manual Fashion Studio photos cannot be overwritten by automatic generation", () => {
  assert.ok(photoStudio.includes('const MANUAL_PROVIDER = "manual-fashion-studio-upload"'));
  assert.ok(photoStudio.includes('status: "MANUAL_PHOTO_PRESERVED"'));
  assert.ok(photoStudio.includes("if (existingProvider === MANUAL_PROVIDER)"));
});

test("canvas placement and garment color are persisted into product specifications", () => {
  assert.ok(api.includes("artworkPlacement: placement"));
  assert.ok(api.includes("garmentColor"));
  assert.ok(api.includes('studioVersion: "fashion-studio-v2"'));
});

test("Fashion Studio command IDs are wired to real bounded production routes", () => {
  assert.ok(studio.includes('runCommand("fashion-trends")'));
  assert.ok(commandCentre.includes('"fashion-trends"'));
  assert.ok(commandCentre.includes('/api/automation/fashion-trend-intelligence'));
  assert.ok(commandCentre.includes('"fashion-capsule"'));
  assert.ok(commandCentre.includes('/api/fashion-designer'));
  assert.ok(commandCentre.includes('body: { count: 12 }'));
  assert.ok(commandCentre.includes('Fashion generation creates CEO-pending records only'));
});
