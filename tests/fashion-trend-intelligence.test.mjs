import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const trend = readFileSync(new URL('../src/lib/fashion/trend-intelligence.ts', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/fashion-trend-intelligence.yml', import.meta.url), 'utf8');

test('fashion trend intelligence is inspiration-only and strips licensed references', () => {
  assert.ok(trend.includes('TREND_ONLY_NO_COPY_NO_LICENSED_IP'));
  assert.ok(trend.includes('SIGNAL_ONLY_NEVER_IMPORT_AS_ARTWORK'));
  assert.ok(trend.includes('licensed-reference-removed'));
  assert.ok(trend.includes('Etsy anime streetwear oversized t shirt'));
  assert.ok(trend.includes('oversized/baggy'));
});

test('fashion trend scan is bounded and rotates the full query pool for free search runtime', () => {
  assert.ok(trend.includes('TREND_QUERY_BATCH_SIZE=2'));
  assert.ok(trend.includes('TREND_ROTATION_MS=4*60*60*1000'));
  assert.ok(trend.includes('const queries=trendQueryBatch()'));
  assert.ok(trend.includes('queryPoolSize:TREND_QUERIES.length'));
  assert.ok(trend.includes('rotationHours:4'));
  assert.ok(!trend.includes('for(const query of TREND_QUERIES)'));
});

test('fashion trend scan runs automatically without paid ad or purchase actions', () => {
  assert.ok(workflow.includes('fashion-trend-intelligence'));
  assert.ok(workflow.includes('cron: "35 */4 * * *"'));
  assert.ok(!/razorpay|cashfree|campaign|ad spend|purchase/i.test(workflow));
});
