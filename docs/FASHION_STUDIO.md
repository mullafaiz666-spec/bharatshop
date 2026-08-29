# BharatShop AI Fashion Studio

BharatShop now exposes 20 executable fashion-visual commands through `/api/fashion-studio` and the AI CEO chat.

## Commands

/productmodel — realistic model photography
/catalogmodel — clean catalog visuals
/outfitpreview — clothing on different models
/studiomodel — premium studio photoshoot
/outfitstyling — complete styled outfit
/colorway — color variations
/lookbook — collection lookbook
/seasoncollection — seasonal campaign
/windowdisplay — retail window display
/mannequininstore — in-store mannequin presentation
/storefront — storefront design
/storeinterior — store interior
/fashioncampaign — high-impact campaign visual
/collectionlaunch — collection launch creative
/fashionposter — promotional fashion poster
/salecreative — sale advertising creative
/bridalwear — bridal fashion visual
/occasionwear — party/event visual
/fashioneditorial — high-end editorial visual
/fashionbillboard — billboard creative

## CEO integration

The AI CEO can execute these through the `fashion_studio` tool. A direct slash command in CEO chat is also supported, for example `/catalogmodel`, when the selected product context contains `productId` or `productName`.

The execution path is:

CEO chat → Fashion Studio command registry → OpenAI Images (`gpt-image-1` by default) → `product_images` → `products.image_url` → storefront.

Each generated visual is recorded in `ai_activity_logs` as `Image & Media` activity. Generation is evidence-safe: a failed provider call is returned as a failure and is never reported as completed.

## Environment

Required for actual image generation:

- `OPENAI_API_KEY`
- Optional `OPENAI_IMAGE_MODEL` (default `gpt-image-1`)
- Optional `OPENAI_IMAGE_SIZE` (default `1024x1024`)
- Optional `OPENAI_IMAGE_QUALITY` (default `medium`)

The existing `BHARATSHOP_AUTOMATION_TOKEN` protects the Fashion Studio API when configured and is used by the approved agent execution gateway.
