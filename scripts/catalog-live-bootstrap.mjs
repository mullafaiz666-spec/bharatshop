import process from 'node:process';

const base = (process.env.BHARATSHOP_URL || process.env.BASE_URL || 'https://bharatshop-9w4a.onrender.com').replace(/\/$/, '');
const token = process.env.BHARATSHOP_AUTOMATION_TOKEN;
if (!token) throw new Error('BHARATSHOP_AUTOMATION_TOKEN is required');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeoutMs = Number(process.env.CATALOG_AUTOMATION_TIMEOUT_MS || 300_000);

async function post(path, body, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          'x-automation-token': token,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`${path} ${r.status}: ${text.slice(0, 1000)}`);
      return text;
    } catch (error) {
      lastError = error;
      console.error(`CATALOG_BOOTSTRAP retry=${attempt}/${attempts} error=${String(error).slice(0, 1000)}`);
      if (attempt < attempts) await sleep(attempt * 5000);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${path} failed after ${attempts} attempts: ${lastError?.message || lastError}`);
}

console.log(`Catalog bootstrap target: ${base}`);
console.log(`Catalog automation timeout: ${timeoutMs}ms`);
const result = await post('/api/automation/catalog-maintenance', { mode: 'maintenance', limit: 10, batchSize: 10 });
console.log(result);
const d = JSON.parse(result);
// A product legitimately blocked by the publication gate is not an application
// failure. Acceptance must inspect the blocked result and fail the overall gate
// if no publishable verified products exist. Only an API/application error fails
// this bootstrap step.
if (d.error) process.exit(1);
