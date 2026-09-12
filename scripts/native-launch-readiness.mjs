#!/usr/bin/env node

const supplied = process.argv[2] || process.env.BHARATSHOP_URL || process.env.BHARATSHOP_PUBLIC_ORIGIN || '';
if (!supplied) {
  console.error('Usage: npm run launch:check -- https://your-candidate.example.com');
  process.exit(2);
}

let origin;
try {
  origin = new URL(supplied);
} catch {
  console.error('Launch readiness URL is invalid.');
  process.exit(2);
}

if (!['https:', 'http:'].includes(origin.protocol)) {
  console.error('Launch readiness URL must use HTTP or HTTPS.');
  process.exit(2);
}

const endpoint = new URL('/api/health/launch?deep=1', origin);
let response;
try {
  response = await fetch(endpoint, {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': 'BharatShop-Launch-Certifier/1.0' },
    signal: AbortSignal.timeout(70_000),
  });
} catch (error) {
  console.error(`Launch readiness probe failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const payload = await response.json().catch(() => null);
if (!payload || typeof payload !== 'object') {
  console.error(`Launch readiness returned invalid JSON (HTTP ${response.status}).`);
  process.exit(1);
}

console.log(`BharatShop: ${payload.status || 'UNKNOWN'}`);
if (payload.gates?.agents) {
  console.log(`Agents: ${payload.gates.agents.readyCount ?? 0}/${payload.gates.agents.total ?? 0} ready`);
}
if (Array.isArray(payload.blockers) && payload.blockers.length) {
  console.log('Blockers:');
  for (const blocker of payload.blockers) {
    console.log(`- ${blocker.gate}: ${blocker.reason}`);
  }
}
if (payload.readyForCutover) {
  console.log(payload.fullyLive ? 'Native production is LIVE_READY.' : 'Native production is CUTOVER_READY; publish first, then enable the native worker.');
  process.exit(0);
}

process.exit(1);
