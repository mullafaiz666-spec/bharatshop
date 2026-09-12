# BharatShop + PixVerse Creative Studio

PixVerse is an **optional creative worker** for BharatShop. It is useful for product/lifestyle images, image-to-video product reels, campaign videos and other Fashion Designer / Marketing creative work, but it is **not** part of the critical storefront, checkout, database, payment or agent-control path.

## Why it is optional

The official PixVerse CLI uses the same account credit system as PixVerse and currently requires a subscribed account for generation. BharatShop remains free-first, so PixVerse is disabled by default and no production request automatically invokes it.

The CLI also uses OAuth device login and stores its session locally. That makes it a better fit for an authorized laptop/creative worker than a short-lived Netlify function. Do not copy a local PixVerse session into public source code or browser variables.

## Safety gates

Billable generation requires all three conditions:

1. `PIXVERSE_ENABLED=true` on the authorized creative worker.
2. `PIXVERSE_ALLOW_CREDIT_SPEND=true` on that worker.
3. The command includes `--execute`.

Without `--execute`, the adapter prints the exact planned PixVerse command as JSON and does not generate anything.

No database changes, product publishing or ad spend are performed by this adapter. Generated assets must still enter BharatShop through the existing Fashion Studio/media review path before they become product media.

## Setup on an authorized creative workstation

Requirements: Node.js 22.12 or newer and a PixVerse subscription/account.

```bash
npm install -g pixverse
pixverse auth login
npm run pixverse:status
```

Enable the integration only on the workstation that is allowed to spend PixVerse credits:

```bash
export PIXVERSE_ENABLED=true
export PIXVERSE_ALLOW_CREDIT_SPEND=true
```

Do not put account tokens in `.env.example`, GitHub source, browser code, or `NEXT_PUBLIC_*` variables.

## Inspect live capabilities

```bash
npm run pixverse:capabilities
```

This asks the installed CLI for its current create-model capability bundle instead of hard-coding model availability into BharatShop.

## Plan an image without spending credits

```bash
npm run pixverse:create -- \
  --type image \
  --prompt "Premium studio product photograph of a BharatDrip oversized black t-shirt, front view, ecommerce lighting" \
  --aspect-ratio 4:5
```

The output is a JSON plan only.

## Generate an image

```bash
npm run pixverse:create -- \
  --type image \
  --prompt "Premium studio product photograph of a BharatDrip oversized black t-shirt, front view, ecommerce lighting" \
  --aspect-ratio 4:5 \
  --execute
```

## Generate a short product video

```bash
npm run pixverse:create -- \
  --type video \
  --prompt "Slow premium turntable reveal of the garment, realistic fabric movement, clean studio background" \
  --image ./approved-product-image.png \
  --aspect-ratio 9:16 \
  --duration 8 \
  --execute
```

Use a model explicitly only after `npm run pixverse:capabilities` confirms that model supports the selected operation and parameters.

## Download a generated asset

After PixVerse returns an asset ID:

```bash
npm run pixverse:download -- --id <asset-id> --type image --dest .pixverse
```

or:

```bash
npm run pixverse:download -- --id <asset-id> --type video --dest .pixverse
```

`.pixverse/` is ignored by Git so generated media is not accidentally committed.

## BharatShop workflow

Recommended flow:

`Fashion Designer idea -> approved prompt/reference -> PixVerse plan -> explicit credit approval -> PixVerse generation -> operator review -> existing Fashion Studio media upload -> product/listing review -> publish`

This preserves BharatShop's existing approval and evidence rules while adding a stronger optional media generator.

## Production rule

Netlify production must remain fully functional when PixVerse is disabled or unavailable. PixVerse failure must never block storefront browsing, checkout, payments, database access, CEO/agent controls or the native migration worker.
