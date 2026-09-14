# BharatShop 24x7 Local Agency

This runtime keeps the BharatShop company-agent worker alive on a Windows machine using local Ollama inference.

## What it does

- Starts or reuses Ollama on `127.0.0.1:11434` only.
- Verifies the configured local model (default `qwen3.5:4b`).
- Runs the existing guarded BharatShop company-agent loop.
- Restarts the worker if it exits.
- Waits for the live storefront to return instead of replacing it when a remote origin is unavailable.
- Writes a local heartbeat and logs under `%LOCALAPPDATA%\BharatShop\Agency24x7`.
- Installs a Windows Scheduled Task for automatic startup/logon execution.
- Preserves all existing application approval gates. It does not bypass payment, publishing, database, advertising, or other high-impact approvals.

## Configuration

Put these values in the local `.env.local` file. Do not commit secrets.

```env
PERSONAL_AI_MODEL=qwen3.5:4b
BHARATSHOP_AGENT_ORIGIN=https://YOUR-LIVE-BHARATSHOP-URL
BHARATSHOP_AUTOMATION_TOKEN=YOUR-PRIVATE-AUTOMATION-TOKEN
```

`BHARATSHOP_AUTOMATION_TOKEN` must match the server-side automation token configured on the live BharatShop deployment. The token is never printed by the 24x7 supervisor.

If `BHARATSHOP_AGENT_ORIGIN` is omitted, the supervisor uses `http://127.0.0.1:3000` and the existing local app bootstrap behavior remains available.

## Commands

```powershell
npm.cmd run agency:24x7:install
npm.cmd run agency:24x7:status
npm.cmd run agency:24x7:start
npm.cmd run agency:24x7:stop
npm.cmd run agency:24x7:uninstall
```

The install command starts the task immediately. When PowerShell is elevated, it installs startup and logon triggers using the current Windows account. Without elevation it installs a logon trigger only.

## 24x7 requirements

The Windows machine must remain powered on and connected to the internet. For true unattended operation, disable sleep while plugged in and use the elevated install path so the task can start after reboot. The live storefront remains independently hosted; only the local agency pauses if the Windows machine is offline.

## Security

Never expose Ollama port `11434` to the public internet. The local worker makes outbound authenticated requests to BharatShop. Keep the automation token private and configure it only in local/deployment environment settings.
