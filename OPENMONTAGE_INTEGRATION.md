# BharatShop × OpenMontage Integration

BharatShop integrates OpenMontage as an **isolated local creative engine** for product films, launch videos, social ads, reels, and campaign storyboards.

## Why the integration is isolated

OpenMontage is licensed under **AGPLv3**. BharatShop does not vendor or copy the OpenMontage source into the storefront. The adapter clones/runs the upstream repository in the ignored `.runtime/openmontage` workspace and exchanges production briefs through JSON/Markdown files.

Pinned upstream:

- Repository: `https://github.com/calesthio/OpenMontage.git`
- Reviewed revision: `08e2151fa02de28a5d6a312b3d575692bf147ad7`
- License: AGPL-3.0

This keeps the integration reversible and prevents a third-party video stack from replacing BharatShop's Next.js, PostgreSQL, agent, payment, or deployment architecture.

## Architecture

`Fashion Designer / Marketing Agent → BharatShop OpenMontage planning API → local OpenMontage job folder → OpenMontage agentic production → rendered media → normal BharatShop approval/publishing gate`

The production Netlify app is **plan-only**. It never spawns Python, FFmpeg, Git, or OpenMontage binaries on the server. Rendering runs only on an authorized local creative workstation.

## Local setup

Optional environment variables:

```text
BHARATSHOP_OPENMONTAGE_ENABLED=false
OPENMONTAGE_PATH=.runtime/openmontage
OPENMONTAGE_REPO_URL=https://github.com/calesthio/OpenMontage.git
OPENMONTAGE_REVISION=08e2151fa02de28a5d6a312b3d575692bf147ad7
```

Check readiness:

```bash
npm run openmontage:status
```

Preview the pinned bootstrap without changing the machine:

```bash
npm run openmontage:bootstrap
```

To actually clone the reviewed upstream on an authorized workstation:

```bash
BHARATSHOP_OPENMONTAGE_ENABLED=true npm run openmontage:bootstrap -- --execute
```

On Windows PowerShell:

```powershell
$env:BHARATSHOP_OPENMONTAGE_ENABLED="true"
npm run openmontage:bootstrap -- --execute
```

OpenMontage itself requires Python 3.10+, Node 18+, FFmpeg, and its own reviewed dependency installation. The adapter deliberately does not silently install Python/Node packages or enable billable media providers.

## Create a campaign handoff

```bash
npm run openmontage:plan -- --title "Afterdark Signal Tee" --brand BharatDrip --goal "15-second vertical launch film" --duration 15 --aspect 9:16
```

This writes a request to `.runtime/openmontage-jobs/<job-id>/` containing:

- `request.json` — structured production brief
- `PROMPT.md` — production prompt for the OpenMontage-capable local agent

No video generation or provider spending starts from the plan command.

## Admin API

`GET /api/admin/creative/openmontage` returns integration metadata for an authenticated administrator.

`POST /api/admin/creative/openmontage` with action `plan` returns a sanitized OpenMontage production brief. Requests to execute rendering through the Netlify API are rejected because execution belongs on the local workstation.

## Safety / publishing boundaries

- No production database writes are required.
- No payment or checkout code is changed.
- No external publishing is automatic.
- No paid model/provider usage is automatically authorized.
- Existing BharatShop CEO/listing approval remains the final publishing boundary.
- Generated campaigns must use original or properly licensed source material.
