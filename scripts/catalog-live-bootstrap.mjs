import process from 'node:process';
const base = (process.env.BHARATSHOP_URL || process.env.BASE_URL || '').replace(/\/$/, '');
const token = process.env.BHARATSHOP_AUTOMATION_TOKEN;
if (!base || !token) throw new Error('BHARATSHOP_URL/BASE_URL and BHARATSHOP_AUTOMATION_TOKEN are required');
async function post(path, body) {
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-automation-token': token }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} ${r.status}: ${text.slice(0, 1000)}`);
  return text;
}
const result = await post('/api/automation/catalog-maintenance', { mode: 'maintenance', limit: 10, batchSize: 10 });
console.log(result);
const d = JSON.parse(result);
// A product legitimately blocked by the publication gate is not an application
// failure. Acceptance must inspect the blocked result and fail the overall gate
// if no publishable verified products exist. Only an API/application error fails
// this bootstrap step.
if (d.error) process.exit(1);
