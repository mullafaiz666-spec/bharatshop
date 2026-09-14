import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { localCompanyWorkerErrors, localCompanyHealthErrors } from './local-company-worker-config.mjs';

dotenv.config({ path: '.env.local', override: false });

const origin = String(process.env.BHARATSHOP_PUBLIC_ORIGIN || process.env.BHARATSHOP_AGENT_ORIGIN || '').replace(/\/+$/, '');
process.env.BHARATSHOP_PUBLIC_ORIGIN = origin;
process.env.BHARATSHOP_AGENT_ORIGIN = origin;
process.env.AI_PROVIDER = process.env.AI_PROVIDER || 'local-openai-compatible';
process.env.AI_BASE_URL = process.env.AI_BASE_URL || process.env.LOCAL_AI_BASE_URL || 'http://127.0.0.1:11555';
process.env.AI_TEXT_MODEL = process.env.AI_TEXT_MODEL || process.env.LOCAL_AI_TEXT_MODEL || process.env.PERSONAL_AI_MODEL || 'qwen3.5:4b';
process.env.AI_MIN_TIMEOUT_MS = process.env.AI_MIN_TIMEOUT_MS || '120000';

function gitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

async function localAIReady() {
  try {
    const base = String(process.env.AI_BASE_URL || '').replace(/\/+$/, '');
    const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(8000) });
    if (!health.ok) return false;
    const status = await health.json();
    const wanted = String(process.env.AI_TEXT_MODEL || '');
    if (!Array.isArray(status?.models) || !status.models.includes(wanted)) return false;
    const modelsResponse = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(8000) });
    return modelsResponse.ok;
  } catch {
    return false;
  }
}

const errors = localCompanyWorkerErrors(process.env);
const head = gitHead();
if (!head) errors.push('Local git revision could not be determined');
if (head && process.env.BHARATSHOP_NATIVE_REVISION && head !== process.env.BHARATSHOP_NATIVE_REVISION) {
  errors.push('Local repository revision does not match BHARATSHOP_NATIVE_REVISION');
}
if (!(await localAIReady())) errors.push('Private local Ollama/Qwen shim is not ready');

if (errors.length) {
  console.error('Local company worker blocked:\n' + errors.map((error) => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  const directory = '.local-company-worker';
  try {
    await mkdir(directory, { recursive: true });
    await build({
      entryPoints: ['scripts/workers/native-company-worker.ts'],
      outfile: `${directory}/worker.cjs`,
      bundle: true,
      platform: 'node',
      target: 'node24',
      format: 'cjs',
      packages: 'external',
      logLevel: 'silent',
    });

    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(20000), redirect: 'error' });
    const health = await response.json();
    const failures = localCompanyHealthErrors(health, process.env.BHARATSHOP_NATIVE_REVISION);
    if (failures.length) {
      console.error('Local company worker health gate blocked:\n' + failures.map((error) => `- ${error}`).join('\n'));
      process.exitCode = 1;
    } else if (process.argv.includes('--check')) {
      console.log(`Local company worker ready: ${process.env.AI_TEXT_MODEL} via private Ollama/Qwen shim; live revision accepted.`);
    } else {
      const child = spawn(process.execPath, [`${directory}/worker.cjs`], {
        stdio: 'inherit',
        env: {
          ...process.env,
          PGOPTIONS: '-c statement_timeout=15000 -c lock_timeout=5000',
        },
      });
      const forward = () => child.kill('SIGTERM');
      process.once('SIGTERM', forward);
      process.once('SIGINT', forward);
      try {
        process.exitCode = await new Promise((resolve, reject) => {
          child.once('error', reject);
          child.once('exit', (code) => resolve(code ?? 1));
        });
      } finally {
        process.removeListener('SIGTERM', forward);
        process.removeListener('SIGINT', forward);
      }
    }
  } catch {
    console.error('Local company worker could not start. Inspect the guarded configuration and live migration status.');
    process.exitCode = 1;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
