import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
function loadRoute(path, dependencies) {
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  runInNewContext(source, { exports: compiledModule.exports, module: compiledModule, URL,
    require: name => { assert(name in dependencies, name); return dependencies[name]; },
  });
  return compiledModule.exports;
}
const notInRequest = () => { throw new Error('Long execution or task claim must not happen in a serverless request'); };
const dependencies = {
  '@/lib/agents/execution-mode': { deferCompanyExecution: () => true },
  'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
  '@/lib/admin-auth': { getAdminUser: async () => ({ id: 9, name: 'Operator' }) },
  '@/lib/agents/contracts': { AGENT_CONTRACTS: { listing: { name: 'Listing' } }, publicAgentContracts: () => [] },
  '@/lib/agents/company-state': {
    queueAgentWork: async item => ({ ...item, id: 'queued-1', status: 'QUEUED' }),
    companySnapshot: async () => ({}), startWorkItem: notInRequest, claimQueuedWork: notInRequest,
  },
  '@/lib/agents/company-runtime': { executeCompanyWorkItem: notInRequest, growthWorkCatalog: () => [] },
  '@/lib/ai/ceo-tools': { listPendingApprovals: async () => [] },
};
test('Netlify direct agent commands persist a queued task and return 202 without claiming it', async () => {
  const route = loadRoute('src/app/api/agents/company/route.ts', dependencies);
  const result = await route.POST(new Request('https://example.netlify.app/api/agents/company', {
    method: 'POST', body: JSON.stringify({ action: 'run_agent', agentId: 'listing', objective: 'Review a product' }),
  }));
  assert.equal(result.status, 202);
  assert.equal(result.body.work.id, 'queued-1');
  assert.equal(result.body.status, 'QUEUED');
});
test('Netlify run-queue action never claims long-running work', async () => {
  const route = loadRoute('src/app/api/agents/company/route.ts', dependencies);
  const result = await route.POST(new Request('https://example.netlify.app/api/agents/company', {
    method: 'POST', body: JSON.stringify({ action: 'run_queue' }),
  }));
  assert.equal(result.status, 202);
  assert.equal(result.body.claimed, 0);
});
