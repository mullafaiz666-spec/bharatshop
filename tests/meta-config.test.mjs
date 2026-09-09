import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(path) {
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const compiledModule = { exports: {} };
  runInThisContext(`(function(require,module,exports){${code}\n})`)(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const { metaConfiguration } = load('src/lib/marketing/meta-config.ts');
const { sendMetaConversion } = load('src/lib/marketing/meta.ts');
const saved = { ...process.env };
function reset() {
  for (const key of Object.keys(process.env)) if (key.startsWith('META_') || key.startsWith('NEXT_PUBLIC_META_')) delete process.env[key];
}
test.after(() => { reset(); Object.assign(process.env, saved); });

test('missing setup stays unverified and never includes credentials', () => {
  reset();
  assert.equal(metaConfiguration().status, 'NOT_CONFIGURED');
  process.env.META_ACCESS_TOKEN = 'private-token-do-not-return';
  process.env.NEXT_PUBLIC_META_PIXEL_ID = '123';
  const config = metaConfiguration();
  assert.equal(config.status, 'NOT_VERIFIED');
  assert.equal(config.conversionsApiConfigured, true);
  assert.equal(config.spendEnabled, false);
  assert.ok(!JSON.stringify(config).includes(process.env.META_ACCESS_TOKEN));
});

test('invalid and mismatched IDs are reported and cannot dispatch events', async () => {
  reset();
  process.env.NEXT_PUBLIC_META_PIXEL_ID = '123';
  process.env.META_PIXEL_ID = '456';
  process.env.META_CONVERSIONS_API_TOKEN = 'private-token';
  assert.equal(metaConfiguration().status, 'INVALID');
  assert.equal(metaConfiguration().conversionsApiConfigured, false);
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Must not dispatch'); };
  try {
    assert.equal((await sendMetaConversion({ eventName: 'PageView', eventId: 'test' })).reason, 'meta_pixel_id_mismatch');
    process.env.META_PIXEL_ID = '123';
    process.env.META_GRAPH_API_VERSION = '../invalid';
    assert.equal((await sendMetaConversion({ eventName: 'PageView', eventId: 'test' })).reason, 'invalid_meta_graph_version');
  } finally { globalThis.fetch = original; }
});

test('CAPI requires acknowledged events and preserves deduplication ID', async () => {
  reset();
  process.env.META_PIXEL_ID = '123';
  process.env.META_CONVERSIONS_API_TOKEN = 'private-token';
  const original = globalThis.fetch;
  let accepted = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(JSON.parse(init.body).data[0].event_id, 'shared-event-id');
    assert.equal(init.headers.Authorization, 'Bearer private-token');
    assert.ok(!url.includes('private-token'));
    return Response.json({ events_received: accepted });
  };
  try {
    const event = { eventName: 'PageView', eventId: 'shared-event-id' };
    assert.equal((await sendMetaConversion(event)).sent, false);
    accepted = 1;
    assert.equal((await sendMetaConversion(event)).sent, true);
  } finally { globalThis.fetch = original; }
});
