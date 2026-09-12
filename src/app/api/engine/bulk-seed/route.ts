import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({
    error: "Synthetic catalogue seeding is unavailable. Use supplier import or the approved Fashion Designer product workflow.",
    code: "SYNTHETIC_SEED_DISABLED",
  }, { status: 410 });
}
