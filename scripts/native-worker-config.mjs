export function nativeWorkerErrors(env) {
  const errors = [];
  if (env.BHARATSHOP_NATIVE_WORKER_ENABLED !== 'true') errors.push('BHARATSHOP_NATIVE_WORKER_ENABLED must be true');
  if (env.BHARATSHOP_MIGRATION_VERIFIED !== 'true') errors.push('BHARATSHOP_MIGRATION_VERIFIED must be true after database acceptance');
  const database = env.DATABASE_URL || env.SUPABASE_DB_URL;
  try {
    const url = new URL(database);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/(?:^|\.)supabase\.(co|com)$/.test(url.hostname) || !url.username || !url.password || url.pathname.length < 2) throw new Error();
  } catch { errors.push('A Supabase PostgreSQL connection is required'); }
  try {
    const url = new URL(env.BHARATSHOP_PUBLIC_ORIGIN);
    if (url.protocol !== 'https:' || !/(?:^|\.)netlify\.app$/.test(url.hostname) || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) throw new Error();
  } catch { errors.push('BHARATSHOP_PUBLIC_ORIGIN must be the native Netlify HTTPS origin'); }
  if (!/^[a-f0-9]{40}$/.test(env.BHARATSHOP_NATIVE_REVISION || '')) errors.push('BHARATSHOP_NATIVE_REVISION must identify the accepted native deployment');
  if (env.SEARXNG_URL) {
    try {
      const url = new URL(env.SEARXNG_URL);
      if (url.protocol !== 'https:' || /(?:^|\.)onrender\.com$/.test(url.hostname) || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname) || url.username || url.password) throw new Error();
    } catch { errors.push('SEARXNG_URL must be hosted HTTPS without Render or desktop dependencies'); }
  }
  if (env.AI_PROVIDER !== 'gemini') errors.push('AI_PROVIDER must be gemini');
  if (!String(env.GEMINI_API_KEY || '').trim()) errors.push('GEMINI_API_KEY is required');
  if (!String(env.GEMINI_MODEL || '').trim()) errors.push('GEMINI_MODEL is required');
  if (!String(env.BHARATSHOP_AUTOMATION_TOKEN || '').trim()) errors.push('BHARATSHOP_AUTOMATION_TOKEN is required');
  if (env.AI_BASE_URL || env.LOCAL_AI_BASE_URL) errors.push('Alternative AI endpoints must be unset for the native worker');
  return errors;
}

export function nativeHealthErrors(health, revision) {
  const errors = [];
  if (health?.hosting?.netlify !== true) errors.push('The app is not running natively on Netlify');
  if (health?.revision !== revision) errors.push('The app revision does not match the accepted deployment');
  if (health?.readiness?.postgres?.ready !== true) errors.push('The native app database is unavailable');
  if (health?.readiness?.ai?.ready !== true || health?.provider !== 'gemini') errors.push('The native app Gemini provider is unavailable');
  return errors;
}
