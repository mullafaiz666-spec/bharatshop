import { fork } from 'node:child_process';
import { pool } from '@/db';
import { claimQueuedWork, type AgentWorkItem } from '@/lib/agents/company-state';
import { executeCompanyWorkItem } from '@/lib/agents/company-runtime';

// This entry runs only after the launcher has checked migration and provider gates.
// Child stdout/stderr are intentionally suppressed: public Actions logs must not
// receive customer records, task outputs, connection strings or provider payloads.
const EXECUTION_TIMEOUT_MS = 8 * 60 * 1000;

async function holdInterruptedWork(id: string) {
  await pool.query(`UPDATE agent_work_items
    SET status='HOLD',output=$2::jsonb,completed_at=NOW(),updated_at=NOW()
    WHERE id=$1 AND status='RUNNING'`, [id, JSON.stringify({
    reason: 'WORKER_INTERRUPTED',
    message: 'Execution was interrupted. Review persisted events and any side effects before explicitly requeuing; automatic replay is disabled.',
  })]);
}

async function executeChild(id: string) {
  const result = await pool.query<AgentWorkItem>(
    "SELECT * FROM agent_work_items WHERE id=$1 AND status='RUNNING'", [id]);
  if (!result.rows[0]) throw new Error('Claim no longer running');
  const completed = await executeCompanyWorkItem(result.rows[0], process.env.BHARATSHOP_PUBLIC_ORIGIN!);
  process.exitCode = completed.error || completed.item?.status === 'FAILED' ? 1 : 0;
}

async function supervise() {
  // Claim only one task. The next scheduled pass handles the next queued task.
  const [item] = await claimQueuedWork(1);
  if (!item) { console.log('Native company queue is empty.'); return; }
  const child = fork(__filename, ['--execute', item.id], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [] });
  let interrupted = false;
  const stop = () => { interrupted = true; child.kill('SIGKILL'); };
  const timer = setTimeout(stop, EXECUTION_TIMEOUT_MS);
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    if (code !== 0 || interrupted) {
      throw new Error('Native task failed or was interrupted');
    }
    console.log('One native company task finished; results are in the shared database.');
  } catch {
    await holdInterruptedWork(item.id);
    throw new Error('Native task requires review');
  } finally {
    clearTimeout(timer);
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
  }
}

async function main() {
  try {
    if (process.argv[2] === '--execute') await executeChild(process.argv[3]);
    else await supervise();
  } catch {
    // No error.message: database/provider errors can contain private content.
    console.error('Native worker did not finish successfully. Review private task records.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
void main();
