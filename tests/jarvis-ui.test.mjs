import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Controller smoke test with a minimal DOM and simulated API. This is not browser/microphone QA.
test('UI pairs, previews, submits model and verification settings, and supports V1 fallback', async () => {
  class Element {
    constructor() { this.value = ''; this.checked = false; this.options = []; this.children = []; this.classList = { toggle() {}, add() {}, remove() {} }; }
    addEventListener() {} focus() {} append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; this.options = children; }
  }
  const html = readFileSync(new URL('../scripts/jarvis/ui/index.html', import.meta.url), 'utf8');
  const elements = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m => [m[1], new Element()]));
  elements.mode.value = 'auto'; elements['verify-after'].checked = true;
  let version = '2.0.0'; const requests = []; let jobs = [];
  const context = vm.createContext({
    document: { getElementById: id => { assert.ok(elements[id], `missing HTML element ${id}`); return elements[id]; }, createElement: () => new Element(), createTextNode: text => ({ textContent: text }), querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {}, confirm: () => true },
    Option: class extends Element { constructor(label, value) { super(); this.textContent = label; this.value = value; } },
    navigator: { clipboard: { writeText: async () => {} } }, crypto: { randomUUID }, AbortSignal, Date, setInterval: () => 1, clearInterval() {},
    fetch: async (url, options) => {
      assert.match(options.headers.Authorization, /^Bearer /);
      if (url.endsWith('/api/health')) return { ok: true, json: async () => ({ service: 'jarvis-machine-ai', protocol: 1, version, root: 'test-project', model: 'local', models: version ? ['local'] : undefined, workerPresent: true, modelInstalled: true, checkedAt: new Date().toISOString(), machine: version ? { freeMemoryGB: 4, totalMemoryGB: 8, cpuCores: 4, connectorUptimeSeconds: 120 } : undefined }) };
      if (options.method === 'POST') {
        const data = JSON.parse(options.body); requests.push({ url, data });
        if (url.endsWith('/api/preview')) return { ok: true, json: async () => ({ stages: ['build', 'typecheck', 'build-check'], executed: false }) };
        jobs = [{ id: 'test-job', route: 'build', task: data.text, model: data.model, status: 'worker_finished', createdAt: new Date().toISOString(), output: 'fixture output', exitCode: 0, stages: [] }];
        return { ok: true, json: async () => jobs[0] };
      }
      return { ok: true, json: async () => ({ jobs }) };
    },
  });
  vm.runInContext(readFileSync(new URL('../scripts/jarvis/ui/app.js', import.meta.url), 'utf8'), context);
  elements.key.value = 'fixture-key'; await elements.connect.onclick();
  assert.equal(elements.connection.textContent, 'Laptop connected');
  elements.task.value = 'Jarvis fix cart'; elements.brain.value = 'local';
  await elements.preview.onclick(); assert.match(elements.plan.textContent, /nothing executed/);
  assert.equal(requests.length, 1);
  await vm.runInContext('submit()', context);
  assert.equal(requests[1].data.text, 'fix cart'); assert.equal(requests[1].data.model, 'local');
  assert.equal(requests[1].data.verifyAfter, true); assert.ok(requests[1].data.requestId);
  assert.match(elements.notice.textContent, /accepted/);
  elements.disconnect.onclick(); version = undefined; elements.key.value = 'fixture-key'; await elements.connect.onclick();
  assert.equal(elements.preview.disabled, true); assert.equal(elements['verify-after'].disabled, true);
  elements.task.value = 'hello'; await vm.runInContext('submit()', context);
  assert.equal(requests.at(-1).data.verifyAfter, false);
  elements.disconnect.onclick();
});
