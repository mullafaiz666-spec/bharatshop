# Jarvis is the BharatShop Machine AI UI

Install this additive integration into the existing BharatShop checkout. It connects the Jarvis site and the same locally served interface to `scripts/personal-ai.mjs`. It does not replace the store, change its Netlify deployment, edit credentials, install paid providers, or migrate the production database.

## Start on Windows

Extract the complete bundle. From that extracted directory:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-Jarvis.ps1 -ProjectRoot "C:\Users\faizm\bharatshop-harness"
```

On subsequent starts, in the existing project:

```powershell
node scripts/jarvis/server.mjs
```

Open http://127.0.0.1:3002 or https://jarvis-core-faiz.mullafaiz666.chatgpt.site on the same laptop. Paste the session key printed by the connector into the UI. Never share the key or send it in chat. It is regenerated at each connector start and is held in page memory only. Keep the console open. The installer refuses to overwrite a different existing Jarvis installation.

If the hosted page cannot connect because of browser local-network permissions, use the local address. No tunnel or public laptop endpoint is required. The hosted page cannot operate a different laptop or a powered-off laptop. Voice recognition may rely on the browser vendor's online speech service; typed commands work without speech recognition.

## Commands and truthful states

- `/chat …`: existing Ollama chat.
- `/build …`: existing local Ollama/DeepSeek coding harness with its guardrails and verification prompt. Edits the current checkout.
- `/browser …`: existing Browser Use worker, preserving its approval boundaries.
- `/agency …`: specialist advice; this does not claim to perform business actions.
- `/verify`: executes the current checkout's `npm run typecheck`, then `npm run build` only if typecheck succeeds.
- `/status`: existing capability check, which is not proof of successful tasks.
- `/company`: one company cycle after explicit UI confirmation; existing runtime gates still apply.
- `Jarvis stop task`: stops the current worker process tree; does not undo completed operations.

Automatic routing is a deterministic convenience, not a general autonomous planner. Select a task mode or use explicit commands when intent is ambiguous. Only one task runs at a time. A worker exit code of zero is shown as `worker_finished`, not as proof of functional completion. Review the output, resulting diff, and checks. Jobs are session-only, retained up to 50 entries with a 64 KB output tail each; restarting the connector clears them. A task times out after 30 minutes. An unavailable model or missing existing worker dependency is a visible failure, not a fake success. No automatic dependency installation occurs.

## Access

The server binds only to 127.0.0.1:3002, validates Host and Origin, authenticates every API with a random session key, and only accepts the local UI and exact Jarvis site origin. Commands use argument arrays with no shell interpolation. The connector does not grant Windows administrator privileges, disable protections, expose a general remote shell, or bypass existing production/payment/publishing approvals. Its authority is that of the Windows account running it. A compromised authenticated frontend has access to the configured worker routes: keep site ownership and the key private.

## Verification

```sh
node --test tests/jarvis-bridge.test.mjs
```

Tests use temporary fixture workers and real local HTTP/process execution; they do not connect to production or prove the user's Windows worker/model/browser installation works. To finish acceptance on the laptop: connect, run `/chat Say hello`, `/verify`, a small reversible `/build` task, inspect its diff, then run a browser task. Confirm actual worker evidence before enabling business operations. Windows process-tree cancellation and microphone behavior require laptop verification.

## V2 upgrades

- Authenticated live health: available RAM, CPU core count, connector uptime, and a fresh timestamp every ten seconds while connected. These do not imply all business integrations are healthy.
- Local model selection: choose an installed Ollama model per task; no automatic downloads or paid providers.
- Preview plan: inspect the route and stages without executing.
- Optional automatic typecheck and build after a successful coding worker. Checked by default in V2. A failed coding worker never advances to checks; a failed typecheck never advances to build. Passing these two checks is not full functional or production verification.
- English/Hindi speech selection, keyboard shortcuts, task filtering, reusable commands, copyable output and stage progress. Automatic Hindi routing covers common build/check/browser/company commands; select an explicit mode for ambiguous requests.
- Duplicate request IDs return the existing task; they cannot launch a second copy while that task remains in the session history.
- Backup-aware Windows upgrades replace only recognized V1 managed files. Custom edits block replacement. Backups go to LocalAppData/BharatShop/JarvisBackups. Stop the old connector before installing. The V2 hosted UI still supports core V1 commands, but disables V2-only controls until the connector is upgraded.

The Windows upgrade/rollback path and microphone recognition still require verification on the actual laptop. API and worker tests run using temporary fixture projects and an injected model catalog.
