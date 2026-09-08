import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { checkAI, checkVision } from '@/lib/ai/provider';
import { searxngImageSearch } from '@/lib/searxng';
import { getAdminUser } from '@/lib/admin-auth';
export const dynamic = 'force-dynamic';
async function checkPostgres() {
  try { await db.execute(sql`select 1`); return { ready: true }; }
  catch { return { ready: false, reason: 'database_unavailable' }; }
}
async function checkSearch(deep: boolean) {
  const configured = !!process.env.SEARXNG_URL;
  if (!configured || !deep) return { configured, ready: false, exercised: false, reason: configured ? 'search_not_tested' : 'missing' };
  try {
    const results = await searxngImageSearch('laptop product image', { limit: 1, timeoutMs: 12000 });
    return { configured, ready: results.some(r => /^https:\/\//.test(r.url)), exercised: true, resultCount: results.length };
  } catch { return { configured, ready: false, exercised: true, reason: 'image_search_failed' }; }
}
export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get('deep') === '1';
  if (deep) {
    const token = process.env.BHARATSHOP_AUTOMATION_TOKEN;
    if (!(token && req.headers.get('authorization') === `Bearer ${token}`) && !await getAdminUser()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const [postgres, ai, vision, searxng] = await Promise.all([checkPostgres(), checkAI(deep), checkVision(deep), checkSearch(deep)]);
  const ok = postgres.ready && ai.ready && vision.ready && searxng.ready;
  return Response.json({ ok, status: !postgres.ready ? 'unavailable' : ok ? 'healthy' : 'degraded', readiness: { postgres, ai, vision, searxng }, providers: { ai: ai.ready, vision: vision.ready, searxng: searxng.ready }, models: ai.models, provider: ai.provider, deep }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
