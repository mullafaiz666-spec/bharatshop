# BharatShop 24x7 Local Agency

BharatShop can keep its company-agent worker alive on a Windows machine while using the live Netlify storefront and local Ollama inference.

## Architecture

The live storefront remains hosted on Netlify. Its scheduled function creates the idempotent daily company plan, while long-running company work is deliberately deferred away from Netlify serverless execution. The Windows worker consumes the same PostgreSQL work bus only after the production database migration, live deployment revision and authentication gates are accepted.

The local path is:

`Netlify storefront -> shared PostgreSQL work bus -> Windows 24x7 Node supervisor -> guarded company worker -> local Qwen/Ollama -> persisted results`

Ollama is never exposed publicly. It listens on `127.0.0.1:11434`. BharatShop's local OpenAI-compatible Qwen shim listens on `127.0.0.1:11555`.

## What the supervisor does

- Starts or reuses Ollama on loopback only.
- Verifies the configured local model, defaulting to `qwen3.5:4b`.
- Starts the private Qwen compatibility shim on loopback only.
- Checks the live BharatShop health endpoint.
- Checks/queues the daily operating plan through the authenticated live endpoint.
- Runs a non-mutating local-worker preflight before claiming production work.
- Claims at most one shared company work item per worker pass.
- Repeats the guarded queue pass while Windows remains online.
- Records heartbeat/log state under `%LOCALAPPDATA%\BharatShop\Agency24x7`.
- Preserves existing approval gates for payments, paid advertising, supplier purchases, refunds/payouts, credentials, destructive database operations and other consequential actions.

Interrupted RUNNING work is moved to HOLD by the existing native worker rather than automatically replayed, preventing accidental duplicate side effects.

## Antivirus-friendly Windows startup

After a local antivirus product flagged the previous PowerShell Scheduled Task manager, the 24x7 startup path was replaced with a plain Node.js supervisor and a normal user Startup-folder `.cmd` entry.

The current installer:

- does not create a Windows Scheduled Task;
- does not request Administrator elevation;
- does not use `ExecutionPolicy Bypass`;
- does not install a pre-login service;
- starts only after the Windows user signs in;
- keeps the startup command visible and inspectable in the user's Startup folder.

This reduces suspicious persistence behavior while preserving automatic restart at normal user logon. The machine still must remain powered on and awake for the local agency to work continuously.

## Hard safety gates

The live local worker does **not** execute production work until all of these are true:

- `BHARATSHOP_MIGRATION_VERIFIED=true` after verified shared-database acceptance.
- A valid Supabase PostgreSQL connection is present locally.
- `BHARATSHOP_NATIVE_REVISION` exactly matches both the live accepted deployment and the local git revision.
- `BHARATSHOP_AUTOMATION_TOKEN` is present and paired with the live Netlify application.
- The live health endpoint reports Netlify hosting and production PostgreSQL readiness.
- The private local Qwen/Ollama runtime is healthy.

Never set the migration flag merely to make the worker start. Production database parity must be verified first.

## Commands

Pair the private automation token and live origin without marking the database migration as verified:

```powershell
npm.cmd run agency:24x7:pair-live
```

Validate the local worker without claiming a task:

```powershell
npm.cmd run agency:24x7:worker:check
```

Install/start/status/stop/uninstall the Windows supervisor:

```powershell
npm.cmd run agency:24x7:install
npm.cmd run agency:24x7:status
npm.cmd run agency:24x7:start
npm.cmd run agency:24x7:stop
npm.cmd run agency:24x7:uninstall
```

`agency:24x7:install` writes `BharatShop-Agency-24x7.cmd` to the current user's Windows Startup folder and starts the Node supervisor immediately. It requires no elevation.

## 24x7 machine requirements

The Windows machine must remain powered on, connected to the internet and prevented from sleeping while plugged in. The live storefront remains independently hosted if the local worker goes offline; queued company work waits until the worker is safely available again.

## Deployment note

Changing Netlify environment variables does not retroactively change the environment of an already-running deployment. After pairing the automation token, use the normal guarded production deployment path so the live application receives the new server-side token. Do not bypass migration/revision checks merely to activate the worker.
