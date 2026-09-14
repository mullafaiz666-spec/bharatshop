export function localCompanyWorkerErrors(env) {
  const errors = [];
  if (env.BHARATSHOP_MIGRATION_VERIFIED !== 'true') {
    errors.push('BHARATSHOP_MIGRATION_VERIFIED must be true after the shared production database migration is accepted');
  }

  const database = env.SUPABASE_DB_URL || env.DATABASE_URL;
  try {
    const url = new URL(database);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/(?:^|\.)supabase\.(co|com)$/.test(url.hostname) || !url.username || !url.password || url.pathname.length < 2) throw new Error();
  } catch {
    errors.push('A verified Supabase PostgreSQL connection is required for the local company worker');
  }

  try {
    const url = new URL(env.BHARATSHOP_PUBLIC_ORIGIN || env.BHARATSHOP_AGENT_ORIGIN);
    if (url.protocol !== 'https:' || !/(?:^|\.)netlify\.app$/.test(url.hostname) || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) throw new Error();
  } catch {
    errors.push('BHARATSHOP_PUBLIC_ORIGIN/BHARATSHOP_AGENT_ORIGIN must be the production Netlify HTTPS origin');
  }

  if (!/^[a-f0-9]{40}$/.test(env.BHARATSHOP_NATIVE_REVISION || '')) {
    errors.push('BHARATSHOP_NATIVE_REVISION must identify the accepted live deployment');
  }
  if (!String(env.BHARATSHOP_AUTOMATION_TOKEN || '').trim()) {
    errors.push('BHARATSHOP_AUTOMATION_TOKEN is required');
  }

  const provider = String(env.AI_PROVIDER || '').trim().toLowerCase();
  if (provider !== 'local-openai-compatible') {
    errors.push('AI_PROVIDER must be local-openai-compatible for the local 24x7 worker');
  }
  const base = String(env.AI_BASE_URL || env.LOCAL_AI_BASE_URL || '').replace(/\/+$/, '');
  try {
    const url = new URL(base);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || (url.port && url.port !== '11434')) throw new Error();
  } catch {
    errors.push('AI_BASE_URL must point only to the private local Ollama endpoint on port 11434');
  }
  if (!String(env.AI_TEXT_MODEL || env.LOCAL_AI_TEXT_MODEL || '').trim()) {
    errors.push('AI_TEXT_MODEL is required');
  }
  if (String(env.AI_DISABLE_THINKING || '').toLowerCase() !== 'true') {
    errors.push('AI_DISABLE_THINKING must be true for the configured local Qwen runtime');
  }

  return errors;
}

export function localCompanyHealthErrors(health, revision) {
  const errors = [];
  if (health?.hosting?.netlify !== true) errors.push('The live app is not running natively on Netlify');
  if (health?.revision !== revision) errors.push('The live app revision does not match the accepted worker revision');
  if (health?.readiness?.postgres?.ready !== true) errors.push('The live production PostgreSQL database is unavailable');
  return errors;
}
