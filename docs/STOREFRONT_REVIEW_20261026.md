# ChaskaBox storefront review — 26 October 2026

The approved Shop hero remains the visual reference: cream, navy and orange, its original lettering, six products and three-second rotation. This release corrects the surrounding experience rather than replacing that composition.

## Critique and corrections

| Priority | Observed problem | Result in this release |
| --- | --- | --- |
| High | Shop responsive preloads were inserted before the viewport meta; the mobile lab downloaded both the 110KB desktop scene and the mobile scene. | Set the viewport before responsive preloads, preserving the exact same art and layout. |
| High | The product layout stylesheet arrived only after JavaScript hydration; the mobile PDP image resized during loading. | Include the existing final PDP stylesheet in the server response before first paint. |
| High | Brands initially shows the footer while its content waits for the catalogue and then a separate brand request. | A fresh server-rendered directory includes public counts and hydration data. The first client render reuses those data. |
| High | Brand detail overwrites the already rendered title with “Loading…”, fetches the brand and products sequentially, and re-fetches related brands. | The initial detail reuses server metadata and product IDs. SPA metadata/products load concurrently; the public brand read is shared and retryable. |
| High | Cart temporarily has no main content; an empty checkout shows an editable delivery form and zero totals while waiting for remote configuration and products. | Saved-list server shells keep a useful loading panel. Locally known empty Cart/Wishlist render immediately. Empty Checkout returns before any catalogue/settings fetch. |
| Medium | Brand cards show generic tag emoji or empty logo slots, and the A–Z filter is hidden on desktop. Search resets the selected letter. | Real supplied logos are retained with an intentional initials fallback. Two-column mobile cards, visible alphabet controls, selected states and combined search/letter filtering replace those gaps. |
| Medium | Brand detail reserves a blank 230px filter sidebar and its mobile filter button calls a missing handler. Desktop sort is hidden. | Remove the empty column and inactive control; expose the working sort on all screen sizes. |
| Medium | Collection headings touch the screen edge while the header and hero use a different frame. | Shared headings, breadcrumbs and collection grids use the established 1380px frame and 12px gutters, with compact mobile headings. |
| Medium | Initial navigation says “All Products” in a different order before owner settings change it to “Shop”. The identical manifest rebuilds navigation twice. | Initial public navigation follows the current published labels/order. Identical settings application no longer destroys/rebuilds those links or reassigns the same logo source. Owner editing is retained. |
| Medium | Category and Bundle documents use multiple backend reads despite the fresh Shop snapshot already being available. | These collection routes use the same fresh snapshot and existing fallback. No price or visibility cache is introduced. |

## Wider design assessment

Home has a good product-led top section, but the repeated Chaska Boxes and promotional sections make the full page feel longer and less selective. These are owner-managed sections: this release keeps their content and order. Product photography is more useful than decorative imagery on category pages. About and Contact already have a readable content width; they share the navigation correction. Checkout should stay focused on delivery and order details, without extra promotional blocks.

The original brand logos that were supplied remain unchanged. Initials are a fallback, not a claim to be a brand's official logo. The existing large product catalogue and original Shop hero assets are retained.

## References used

- Baymard, [Applied Filters Overview](https://baymard.com/research-articles/how-to-design-applied-filters): preserve visible selected filters and make clearing them straightforward.
- Baymard, [Product List and Filtering](https://baymard.com/research-articles/current-state-product-list-and-filtering): give product discovery, filtering and sorting clear priority.
- web.dev, [Optimize LCP](https://web.dev/articles/optimize-lcp): remove unnecessary discovery/request chains before critical content.
- web.dev, [Optimize CLS](https://web.dev/articles/optimize-cls): avoid replacing stable content and inserting large sections after initial paint.

## Verification and limits

Live desktop review covered Home, Shop, Brands, a category, product 39, Hilal brand detail, Cart, About, Contact and Checkout entry. The cloud browser then stopped responding; later verification uses the existing source acceptance suite and a dedicated GET-only production/preview audit. Do not describe those fixture checks as authenticated production saves or completed real orders.

The source acceptance matrix now covers public shopping, About/Contact, legal pages, guides, saved lists and Checkout at 320, 390, 768 and 1440px. New regressions exercise combined brand filtering and an empty Checkout with remote APIs blocked. The public audit checks advertised products, brands, categories and the main static pages, plus hidden product 269, and measures six page types in the same mobile Lighthouse job. Staging has its own catalogue; its before/after comparison uses the prior staging deployment, while production measurements are reported separately.

Lighthouse is lab evidence, not real-user INP or a guaranteed score. Backend response timings also vary by location and network. The release does not change products, order records, payment rules or notification providers.
