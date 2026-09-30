# Jarvis local dashboard

Jarvis runs the existing `scripts/personal-ai.mjs` worker from this checkout. It binds to `127.0.0.1:3002`; no laptop endpoint is exposed publicly.

```powershell
Set-Location 'C:\Users\faizm\bharatshop-harness'
npm.cmd run jarvis:start
```

Keep that terminal open. Open `http://127.0.0.1:3002` or the hosted Jarvis site on the same laptop and paste the current pairing key into the dashboard. Do not paste the key into a chat or commit it. If port 3002 is already listening, use that connector instead of starting a duplicate.

DeepSeek Coder V2 16B is the default model when no `PERSONAL_AI_MODEL` or `AGENCY_MODEL` override is set. The dashboard selects the installed DeepSeek model for each task even when a legacy environment still defaults to Qwen. Install it with `ollama pull deepseek-coder-v2:16b` if needed; no model download occurs during Jarvis tasks.

The dashboard passes up to three completed chat turns into the next chat request in the same connector session. Earlier model output is labeled unverified. Chat does not inspect the repository by itself. Use `/build` for coding, `/verify` for typecheck and build, and review task output and diffs before treating a result as complete. Existing production, payment, publishing, and database gates remain active. A `worker_finished` status means only that the worker process exited successfully.

Run `npm.cmd run jarvis:test` to test connector routing, authentication, task lifecycle, and dashboard behavior with temporary fixture workers. These tests do not verify a laptop's installed worker dependencies or production services.
