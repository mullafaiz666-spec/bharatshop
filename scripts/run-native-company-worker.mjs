import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { nativeWorkerErrors, nativeHealthErrors } from './native-worker-config.mjs';

const errors = nativeWorkerErrors(process.env);
if (errors.length) {
  console.error('Native worker blocked:\n' + errors.map(error => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  const directory = '.native-worker';
  try {
    await mkdir(directory, { recursive: true });
    await build({ entryPoints: ['scripts/workers/native-company-worker.ts'], outfile: `${directory}/worker.cjs`, bundle: true, platform: 'node', target: 'node24', format: 'cjs', packages: 'external', logLevel: 'silent' });
    if (process.argv.includes('--check')) {
      console.log('Native worker bundle passed. No connection or task execution attempted.');
    } else {
      const response = await fetch(`${process.env.BHARATSHOP_PUBLIC_ORIGIN}/api/health`, { signal: AbortSignal.timeout(20000), redirect: 'error' });
      const health = await response.json();
      const failures = nativeHealthErrors(health, process.env.BHARATSHOP_NATIVE_REVISION);
      if (failures.length) throw new Error('Native deployment is not accepted');
      const child = spawn(process.execPath, [`${directory}/worker.cjs`], { stdio: 'inherit', env: { ...process.env, PGOPTIONS: '-c statement_timeout=15000 -c lock_timeout=5000' } });
      const forward = () => child.kill('SIGTERM');
      process.once('SIGTERM', forward);
      process.once('SIGINT', forward);
      try {
        process.exitCode = await new Promise((resolve, reject) => {
          child.once('error', reject);
          child.once('exit', code => resolve(code ?? 1));
        });
      } finally {
        process.removeListener('SIGTERM', forward);
        process.removeListener('SIGINT', forward);
      }
    }
  } catch {
    console.error('Native worker could not start. Inspect configuration and local build checks.');
    process.exitCode = 1;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
