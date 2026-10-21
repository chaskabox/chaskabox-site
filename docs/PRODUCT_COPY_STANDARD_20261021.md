# ChaskaBox product description standard — 2026-10-21

## Live catalog facts (read-only audit)
253 total products; 109 currently visible. 248 descriptions are under 55 words, zero contain detail section headings, and product #14 includes DRAFT TEXT.
Prioritize Chocolates & Candies (42 visible), Jellies & Marshmallow (19), Snacks & Nimco (13), Bunties & Cakes (12), Biscuits & Wafers (10).

## Unified on-page layout
1. Original images, product name, price, listed pack, concise overview and existing purchase controls above the fold.
2. About this snack with the complete overview and any verified extra sections.
3. Product details: brand, pack/size, category, plus disclosure explaining the label-validation limit.
4. Ingredients, allergens, nutritional information, storage or dates only where actual package or supplier facts support them.

## Staff description format
An ordinary paragraph remains the Overview (old data is backward-compatible). Add optional lines as needed:

Highlights:
- [Confirmed product-specific features]

Taste & texture:
[From listed product facts or a verified package]

Serving ideas:
[Helpful use without unsupported health claims]

Ingredients:
[Exact verified label text]

Allergens:
[Exact verified package allergen advisory]

Storage:
[Exact storage advice shown on original pack]

Best before:
[Only if reliably batch-specific; do not invent]

Each empty section is hidden from storefront presentation. The admin insert-template button does not save unless staff presses Save.

## Editorial rollout after PR validation
1. Review product #14 DRAFT TEXT marker against the real pack and edit with authenticated admin version history.
2. For each of 109 visible records, verify name, flavour, stated format, and any ingredient/allergen claims against original label or supplier.
3. Publish product-specific copy in small reversible batches; do not modify price, checkout, payments, WhatsApp, notifications, inventory or photos.
4. The same layout automatically covers new and previously hidden products once visible.

## Evidence & references
- https://www.shopify.com/blog/product-page
- https://www.shopify.com/blog/expert-advice-improve-product-pages
- https://baymard.com/research-articles/collections/product-page
- https://developers.google.com/search/docs/appearance/structured-data/merchant-listing

## Release gate
Full node test suite, npm run check, Cloudflare Pages Functions build, browser/mobile accessibility, checkout/cart/wishlist/image zoom regressions, Cloudflare preview and user review before production merge.
