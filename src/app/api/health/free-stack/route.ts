import { NextResponse } from "next/server";
import { aiConfigured, aiModels, aiProviderName, checkAI } from "@/lib/ai/provider";
import { checkSupabaseApi, supabaseRuntimeStatus } from "@/lib/supabase/rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

function databaseSource() {
  if (process.env.DATABASE_URL) return "DATABASE_URL";
  if (process.env.SUPABASE_DB_URL) return "SUPABASE_DB_URL";
  return "missing";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = url.searchParams.get("deep") === "1";
  const supabase = deep ? await checkSupabaseApi() : { ...supabaseRuntimeStatus(), reachable: null, reason: "not_probed" };
  const ai = deep ? await checkAI(false) : {
    configured: aiConfigured(),
    provider: aiProviderName(),
    models: aiModels(),
    reason: "not_probed",
  };

  const netlifyDetected = Boolean(process.env.NETLIFY || process.env.DEPLOY_ID || process.env.SITE_ID);
  const dbSource = databaseSource();
  const readyForNetlifyDeploy = dbSource !== "missing" && Boolean(process.env.ADMIN_SESSION_SECRET);
  const readyForSupabaseCutover = Boolean(process.env.SUPABASE_DB_URL) && supabase.authConfigured && supabase.storageConfigured;

  return NextResponse.json({
    ok: readyForNetlifyDeploy,
    hosting: {
      netlifyDetected,
      deployContext: process.env.CONTEXT || null,
      commitRef: process.env.COMMIT_REF || process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || null,
    },
    database: {
      configured: dbSource !== "missing",
      source: dbSource,
      cutoverPolicy: "DATABASE_URL remains authoritative until the Supabase copy passes the read-only verification command and cutover is explicitly approved.",
    },
    supabase,
    ai,
    automation: {
      tokenConfigured: Boolean(process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN),
      scheduleMode: "queue-only",
    },
    readiness: {
      netlifyDeploy: readyForNetlifyDeploy,
      supabaseCutover: readyForSupabaseCutover,
      gemini: aiConfigured() && aiProviderName() === "gemini",
    },
  }, {
    status: readyForNetlifyDeploy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
