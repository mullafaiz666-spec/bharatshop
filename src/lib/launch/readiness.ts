import { aiConfigured, aiModels, aiProviderName } from "@/lib/ai/provider";
import { configuredAgentReadiness, deepAgentReadiness } from "@/lib/agents/readiness";

function present(value: unknown) {
  return Boolean(String(value || "").trim());
}

function enabled(value: unknown) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function supabaseDatabaseConfigured() {
  const raw = String(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "").trim();
  if (!raw) return { ready: false, source: "missing", reason: "SUPABASE_DB_URL or DATABASE_URL is missing" };
  try {
    const url = new URL(raw);
    const supabase = /(?:^|\.)supabase\.(?:co|com)$/.test(url.hostname);
    return {
      ready: supabase && ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.username && url.password),
      source: process.env.SUPABASE_DB_URL ? "SUPABASE_DB_URL" : "DATABASE_URL",
      reason: supabase ? "Supabase PostgreSQL connection configured" : "Active PostgreSQL connection is not a Supabase host",
    };
  } catch {
    return { ready: false, source: process.env.SUPABASE_DB_URL ? "SUPABASE_DB_URL" : "DATABASE_URL", reason: "Active PostgreSQL connection is malformed" };
  }
}

function paymentConfiguration() {
  const razorpay = {
    keyId: present(process.env.RAZORPAY_KEY_ID),
    keySecret: present(process.env.RAZORPAY_KEY_SECRET),
    webhookSecret: present(process.env.RAZORPAY_WEBHOOK_SECRET),
  };
  const cashfree = {
    clientId: present(process.env.CASHFREE_CLIENT_ID || process.env.CASHFREE_APP_ID),
    clientSecret: present(process.env.CASHFREE_CLIENT_SECRET || process.env.CASHFREE_SECRET_KEY),
  };
  return {
    razorpay: { ready: razorpay.keyId && razorpay.keySecret && razorpay.webhookSecret, ...razorpay },
    cashfree: { ready: cashfree.clientId && cashfree.clientSecret, ...cashfree },
  };
}

export async function nativeLaunchReadiness(deep = false) {
  const agents = deep ? await deepAgentReadiness() : configuredAgentReadiness();
  const database = supabaseDatabaseConfigured();
  const payments = paymentConfiguration();
  const migrationVerified = enabled(process.env.BHARATSHOP_MIGRATION_VERIFIED);
  const nativeWorkerEnabled = enabled(process.env.BHARATSHOP_NATIVE_WORKER_ENABLED);
  const adminReady = present(process.env.ADMIN_SESSION_SECRET) && String(process.env.ADMIN_SESSION_SECRET || "").length >= 32 && present(process.env.ADMIN_EMAIL) && present(process.env.ADMIN_PASSWORD);
  const automationReady = present(process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN);
  const searchReady = present(process.env.SEARXNG_URL);
  const supabaseApiReady = present(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && present(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const storageReady = present(process.env.SUPABASE_DIGITAL_BUCKET);
  const aiReady = aiConfigured();

  const gates = {
    database,
    migration: {
      ready: migrationVerified,
      reason: migrationVerified ? "source-to-Supabase parity explicitly verified" : "BHARATSHOP_MIGRATION_VERIFIED is not true",
    },
    supabaseApi: {
      ready: supabaseApiReady,
      reason: supabaseApiReady ? "Supabase URL and server-only service key configured" : "Supabase URL or server-only service key missing",
    },
    storage: {
      ready: storageReady,
      reason: storageReady ? "Supabase digital bucket configured" : "SUPABASE_DIGITAL_BUCKET missing",
    },
    admin: {
      ready: adminReady,
      reason: adminReady ? "admin login and session secret configured" : "admin login or 32+ character session secret missing",
    },
    ai: {
      ready: aiReady,
      reason: aiReady ? `${aiProviderName()} configured` : "Gemini key or OpenAI-compatible/local AI endpoint missing",
      provider: aiProviderName(),
      models: aiModels(),
    },
    search: {
      ready: searchReady,
      reason: searchReady ? "search provider configured" : "SEARXNG_URL missing",
    },
    automation: {
      ready: automationReady,
      reason: automationReady ? "automation authorization token configured" : "BHARATSHOP_AUTOMATION_TOKEN missing",
    },
    agents: {
      ready: agents.summary.allReady,
      total: agents.summary.total,
      readyCount: agents.summary.ready,
      blocked: agents.summary.blocked,
      reason: agents.summary.allReady ? "all operational agents passed readiness" : "one or more operational agents are blocked",
    },
    payments: {
      ready: payments.razorpay.ready && payments.cashfree.ready,
      reason: payments.razorpay.ready && payments.cashfree.ready ? "Razorpay and Cashfree credentials configured" : "Razorpay and/or Cashfree production inputs are incomplete",
      providers: payments,
    },
  };

  const blockers = Object.entries(gates)
    .filter(([, gate]) => !gate.ready)
    .map(([gate, detail]) => ({ gate, reason: detail.reason }));
  const readyForCutover = blockers.length === 0;
  const fullyLive = readyForCutover && nativeWorkerEnabled;

  return {
    product: "BharatShop",
    mode: deep ? "DEEP_LIVE_DEPENDENCY_PROBE" : "CONFIGURATION_PROBE",
    status: fullyLive ? "LIVE_READY" : readyForCutover ? "CUTOVER_READY" : "BLOCKED",
    readyForCutover,
    fullyLive,
    nativeWorker: {
      enabled: nativeWorkerEnabled,
      safeToEnable: readyForCutover,
      reason: nativeWorkerEnabled ? "native company worker enabled" : readyForCutover ? "cutover is ready; native worker can be enabled after publishing" : "keep disabled until every cutover gate passes",
    },
    gates,
    blockers,
    agents,
    checkedAt: new Date().toISOString(),
    safety: "This probe never changes database state, credentials, payment state, campaign state, migration flags, or worker flags.",
  };
}
