# Unified Jarvis workstation

This branch consolidates the existing DeepSeek bridge, automatic task routing, persistent Windows startup, developer toolkit and OSINT registry on the current BharatShop main source.

## Start locally

Use a separate checkout of this branch to test before replacing your working laptop checkout.

```powershell
npm ci
npm run test:integrations
npm run typecheck
npm run build
node scripts/jarvis/server.mjs
```

Open http://127.0.0.1:3002. Pair using the session key printed locally. Existing production gates remain active.

## Gateway chat

Configure OMNIROUTE_BASE_URL (normally http://127.0.0.1:20128/v1), OMNIROUTE_MODEL (your combo name), and OMNIROUTE_API_KEY locally. Never commit credentials. Restart Jarvis after configuration. Chat tries the gateway first; on failure it reports the fallback and tries the configured direct providers. Local selection favors PERSONAL_AI_MODEL (DeepSeek by default), then the coding model, then the fast model if necessary. The gateway determines free-first provider routing through its configured combo.

For persistent startup use scripts/jarvis/install-persistent.ps1 only after interactive verification. Persistent pairing and the automatic router are combined in the same server.

## Verification boundaries

CI checks source behavior with mocked providers, types, build and lint. It does not verify your laptop model, gateway configuration, store database, payments, ads, suppliers, or live customer workflows. Do not call those operational until real runtime checks pass. This branch adds a gateway client, not the separate desktop gateway application.
