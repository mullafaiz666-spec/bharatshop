import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const migrationVerified = String(process.env.BHARATSHOP_MIGRATION_VERIFIED || "").toLowerCase() === "true";
  return NextResponse.json({
    ok: true,
    host: "netlify",
    mode: migrationVerified ? "native" : "hybrid",
    revision:
      process.env.BHARATSHOP_BUILD_REVISION ||
      process.env.COMMIT_REF ||
      process.env.GITHUB_SHA ||
      "unknown",
    migrationVerified,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
