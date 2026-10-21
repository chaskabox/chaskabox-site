# ChaskaBox — one-release product descriptions and SEO rollout

Date: 2026-10-21
Status: **STAGING / NOT PUBLISHED**. Release owner approval and original-product verification required.

## Single-release requirement

- User explicitly requires all catalogue descriptions and metadata to be reviewed together and deployed **once**, not in incremental live edits.
- At latest read-only Supabase audit: **262 catalog rows (118 visible, 144 hidden)**. Live counts may change; recount before release and include new SKUs.
- Research-backed drafts: **52 visible product listings**, with per-SKU source URLs and caveats in [PRODUCT_COPY_REFERENCES_20261021.md](PRODUCT_COPY_REFERENCES_20261021.md).
- Other **210 listings**: authenticated admin-only draft generator based on catalogue-confirmed names, brands, categories and packs. These are **not** manufacturer-verified, not a substitute for source verification, and not finalized just because text renders.
- Public GitHub repository must **never serialize full hidden catalogue names/details** into manifest files. Generator loads hidden items only through the authenticated admin UI.
- The common PDP layout applies to old and new products, but the rollout of DB content must wait for the coordinated release.

## Editorial completion gate

1. For each of the 262+ current records, confirm product name, variety/flavour wording, pack format and either a reference to the exact original label/manufacturer/retailer or an explicitly approved catalogue-only factual description.
2. Fix duplicate catalogue product pages or agree canonicalization without changing visibility. Known likely duplicate: Tutty Fruity Jelly IDs **171, 275** (same advertised name/pack); do not hide either without approval. Review truncated long title collisions (e.g. Cherry Balls flavours).
3. Never invent ingredients, allergens, nutrition, manufacturing origin, expiry date, health effects, certifications or bundle contents.
4. **Product 269 (ChaskaBox Family Pack)** must remain hidden and blocked from release while its contents remain under review. No changing product visibility, price, WhatsApp, notifications, checkout, refunds or stock fields.
5. Review SEO titles, meta descriptions and mobile scannability for every visible product. Google may generate search snippets independently.
6. Resolve manufacturer uncertainty notes and packaging mismatches before approving a copy update. Do not publish mass boilerplate merely to reach a word count.

## Release sequence (single coordinated change window)

1. Freeze and export exact live `products(id,name,description,seo_title,seo_description,visibility,updated_at)` to a private rollback archive; never commit hidden product data to public GitHub.
2. Produce final **reviewed** per-product content manifest in private admin-controlled storage, count its current IDs, and validate no duplicates/missing IDs and 2,000-character field constraints.
3. Publish code changes from PR #139 only after green full tests (including browser/mobile/a11y and SEO), preview and review sign-off. Keep content activation behind a release gate until one atomic content transaction is ready.
4. Apply the reviewed description + SEO triplets to `products` in **one protected, auditable database transaction** with count and version preconditions. Roll back the whole batch if any row or field fails, including a product added during the freeze. Never silently skip or partially apply rows.
5. Validate representative product pages, product JSON-LD, correct visibility, titles, robots/sitemap, search, mobile; smoke-test Add to Bag, wishlist, zoom, payments/checkout. If validation fails, restore the private archive as one coordinated rollback.

**Important:** This document is a release plan, not a deployed migration or permission to bypass staff authentication. Admin editor's “Review researched draft” button only changes unsaved fields; there is no automatic mass publish.

## Reference rules

- [Google: People-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google: AI-generated content and scaled content abuse](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
- [Google: Snippet control and meta descriptions](https://developers.google.com/search/docs/appearance/snippet)
- [Google: Product merchant listing structured data](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing)
- [Google Merchant Center product data specification](https://support.google.com/merchants/answer/7052112)
- [Baymard: Product Page UX](https://baymard.com/research/product-page)
- [Product-specific ledger for 29 researched listings](PRODUCT_COPY_REFERENCES_20261021.md)
