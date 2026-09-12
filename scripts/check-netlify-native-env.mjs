import { pathToFileURL } from "node:url";

// Configuration checks only. Database parity and real provider probes are separate
// gates. Never print environment values, credentials or connection strings.
export function nativeEnvironmentErrors(env) {
  const errors = [];
  const requireValue = (key, value = env[key]) => {
    if (!String(value || "").trim()) errors.push(`${key} is missing`);
  };
  const database = env.DATABASE_URL || env.SUPABASE_DB_URL;
  requireValue("SUPABASE_DB_URL (or DATABASE_URL)", database);
  if (database) {
    try {
      const url = new URL(database);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
          !/(?:^|\.)supabase\.(?:co|com)$/.test(url.hostname) ||
          !url.username || !url.password || url.pathname.length < 2) {
        errors.push("The active database must be a verified Supabase PostgreSQL connection");
      }
    } catch {
      errors.push("The active database connection is malformed");
    }
  }

  const deployContext = String(env.CONTEXT || '').trim().toLowerCase();
  const migrationVerified = String(env.BHARATSHOP_MIGRATION_VERIFIED || '').trim().toLowerCase() === 'true';
  const nativeWorkerEnabled = String(env.BHARATSHOP_NATIVE_WORKER_ENABLED || '').trim().toLowerCase() === 'true';
  if (deployContext === 'production' && !migrationVerified) {
    errors.push("BHARATSHOP_MIGRATION_VERIFIED must be true for native production deployment");
  }
  if (nativeWorkerEnabled && !migrationVerified) {
    errors.push("BHARATSHOP_NATIVE_WORKER_ENABLED cannot be true before database migration verification");
  }

  if (String(env.ADMIN_SESSION_SECRET || '').length < 32) errors.push("ADMIN_SESSION_SECRET must contain at least 32 characters");
  requireValue("BHARATSHOP_AUTOMATION_TOKEN", env.BHARATSHOP_AUTOMATION_TOKEN || env.AUTOMATION_TOKEN);
  if (env.AI_PROVIDER !== 'gemini') errors.push("AI_PROVIDER must be gemini for hosted production");
  requireValue("GEMINI_API_KEY", env.GEMINI_API_KEY || env.GOOGLE_AI_API_KEY);
  requireValue("GEMINI_MODEL");
  requireValue("RAZORPAY_KEY_ID");
  requireValue("RAZORPAY_KEY_SECRET");
  requireValue("RAZORPAY_WEBHOOK_SECRET");
  requireValue("CASHFREE_CLIENT_ID", env.CASHFREE_CLIENT_ID || env.CASHFREE_APP_ID);
  requireValue("CASHFREE_CLIENT_SECRET", env.CASHFREE_CLIENT_SECRET || env.CASHFREE_SECRET_KEY);
  requireValue("SUPABASE_SERVICE_ROLE_KEY");
  requireValue("SUPABASE_URL", env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
  requireValue("BHARATSHOP_PUBLIC_ORIGIN");
  for (const key of ['BHARATSHOP_PUBLIC_ORIGIN', 'BHARATSHOP_NATIVE_ORIGIN', 'SEARXNG_URL', 'AI_BASE_URL', 'LOCAL_AI_BASE_URL']) {
    if (!env[key]) continue;
    try {
      const url = new URL(env[key]);
      if (url.protocol !== 'https:' || /(?:^|\.)onrender\.com$/.test(url.hostname) ||
          /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)) {
        errors.push(`${key} must use hosted HTTPS without a Render or desktop dependency`);
      }
    } catch { errors.push(`${key} must be a valid HTTPS URL`); }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = nativeEnvironmentErrors(process.env);
  if (errors.length) {
    console.error('Native Netlify deployment blocked:\n' + errors.map(e => `- ${e}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Native environment inputs present. Database copy verification and live acceptance are still required.');
  }
}
