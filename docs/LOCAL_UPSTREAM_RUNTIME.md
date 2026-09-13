# BharatShop local upstream runtime

The Windows workstation can now run the safe upstream integrations as one coordinated local runtime.

## One command

```powershell
npm run dev:full
```

That command runs `scripts/bootstrap-upstreams.ps1` and then starts BharatShop with Webpack.

The bootstrap does the following without modifying the production database:

- syncs the pinned Marketing Skills commit into `.agents/skills`;
- installs and starts the isolated BharatShop Remotion service on `127.0.0.1:8201`;
- when Docker Desktop is available, starts OpenHands Agent Canvas on `127.0.0.1:8202` with only the BharatShop project mounted at `/projects/bharatshop`;
- when Docker Desktop is available, downloads the pinned MuMuAINovel source commit, builds it as a separate GPL service, starts its own PostgreSQL container, and exposes it on `127.0.0.1:8203`;
- connects MuMuAINovel to the workstation Ollama OpenAI-compatible endpoint through `host.docker.internal:11434/v1`;
- writes only local service endpoints and feature gates to `.env.local`;
- keeps generated service credentials under `.runtime/upstreams`, which is gitignored;
- keeps PersonaLive disabled because commercial/model rights are not cleared;
- runs the BharatShop TypeScript check before returning success.

## Commands

```powershell
npm run upstreams:bootstrap
npm run upstreams:status
npm run upstreams:stop
npm run dev:full
```

## Cockpit

Open `/dashboard/command-centre`. The upstream runtime appears before the legacy command centre and performs authenticated live probes.

When ready:

- **Remotion** can render a real MP4 test product ad from the cockpit.
- **OpenHands** opens Agent Canvas.
- **MuMuAINovel** opens the isolated creative studio.
- **Marketing Skills** reports the verified local file count.
- **PersonaLive** remains blocked.

## Docker boundary

OpenHands is deliberately not launched directly on Windows because its own documentation warns that the non-sandboxed launcher has full filesystem access. The bootstrap uses the Docker image and mounts only the BharatShop project directory.

MuMuAINovel is GPL-3.0 and therefore remains a separate containerized application rather than being copied into the BharatShop application bundle.

## Data safety

This runtime does not run BharatShop database migrations, reset production data, or change `DATABASE_URL`. MuMuAINovel uses its own PostgreSQL container and volume.
