# ChaskaBox — Ranking Improvement Phase 1 (2026-10-19)

**State:** branch-only proposal, pending automated preview and owner phase gate. No changes to products, prices, checkout, COD/BOP, WhatsApp/notifications, customer data, banners, or admin publishing.

## Scope and evidence
- GitHub production baseline commit **4f4b822ae0338ddcbe50ae4497cccb46b3671ae2**; all edits must be reviewed relative to this base.
- Read-only Supabase `public.public_products` brand summary: Giggly 25, Hilal 19, Mayfair 19, Candyland 14 and ChaskaBox 6 public records; **Kolson 0**. An empty brand is not necessarily an invalid brand record; it must not be represented as a currently purchasable category.
- Static homepage title and SPA homepage metadata differed in purchase/payment claims; the old Open Graph description promoted fixed 4–7-day delivery and both COD/prepaid methods, even though checkout settings may change. Proposed metadata avoids those unsupported permanent guarantees.
- Main canonical sitemap `/sitemap.xml` contains the homepage, shop, brands, FAQ, policies, guides, and category routes. Dynamic `/api/product-sitemap` publishes visible product and nonempty brand URLs. Robots allow crawling; retain both sitemaps.
- Product SSR, truthful brand/product schema, stock-state limitations, and FAQ crawlable links already exist; **do not duplicate the work**.
- **Google Search Console live keyword performance is unavailable:** GSC Wizard MCP integration reports subscription-required and cannot fetch query/click/impressions/position data. User's direct GSC export (Performance → Search results, last 3 months, queries and pages) is required to calculate a real baseline. Do not invent rankings, traffic or search volumes.
- Google official guidance: <https://developers.google.com/search/docs/specialty/ecommerce/help-google-understand-your-ecommerce-site-structure>, <https://developers.google.com/search/docs/appearance/title-link>, <https://developers.google.com/search/docs/specialty/ecommerce/share-your-product-data-with-google>.

## Keyword-to-URL hypothesis (must validate against real Search Console data)

| Main intent | Preferred canonical | Notes |
|---|---|---|
| Brand + Pakistani snacks online | `/` | Distinct branded homepage, not a "No. 1" claim |
| Buy Pakistani snacks / browse snacks in Pakistan | `/shop/` | Transactional browsing; no duplicate homepage title |
| Snack boxes / curated snack packs | `/bundles/` | Bundle facts only from published bundle records |
| Pakistani snack brands | `/brands/` | Do not advertise Kolson without public products |
| Biscuits and wafers online | `/category/biscuits-and-wafers/` | Product counts/availability must be real |
| Nimco and savory snacks | `/category/snacks-and-nimco/` | Link directly to actual products |
| Chocolates and candies | `/category/chocolates-and-candies/` | Use descriptive editorial text |
| Childhood snacks | `/guides/bachpan-snacks-pakistan/` | Informational, not a duplicate shop page |
| Delivery / COD questions | `/faq/` | Values reflect current settings and checkout |
| Exact branded product and pack | `/product/{id}/` | Product SSR, canonical, no invented availability |

**Avoid:** keyword stuffing, stale brand lists, fabricated rankings/reviews/ingredients/stock, mass-generated thin pages, promises of AI Overview inclusion.

## Phase-1 code fixes on this branch
1. Homepage `title`, description, Open Graph and client-side route metadata point to one accurate branded/national-snacks intent. The three approved hero assets and visible slogan are not edited.
2. Shop `title` and description target product browsing/buying rather than duplicating homepage text. Update static shell, server `SEO_CATEGORIES.shop`, and SPA `SEO_CATEGORY_DATA.shop` together.
3. Brands metadata removes a specific non-public brand mention and unconditional COD phrasing; server/static and SPA SEO agree.
4. Add static and server/SPA contract regression tests, followed by Cloudflare branch-preview browser QA. Production must remain unchanged until explicit approval.

## Remaining phases (future, do not start production deployment in Phase 1)
- **Phase 2 (P0/P1):** homepage/shop category UX SEO intro and SSR crosslinks; category inventory-aware copy, retain responsive hero.
- **Phase 3 (P1):** per-product public SEO gap report, accurate image ALT/source, Product Offer/merchant listing readiness; *no product record edits without approval*.
- **Phase 4 (P1/P2):** useful sourcing/ordering and nostalgic snack guides with cited first-party facts; AIO/GEO/AEO. No fake awards, reviews or AI snippets.
- **Phase 5 (P1/P2):** proposal and tested implementation of Admin SEO Center with save, preview, audit/history permissions, SEO checks and Core Web Vitals; optional read-only Search Console connection.
- **Phase 6:** coordinated staging regression, owner release approval, *one* production deploy, post-release live audit and Search Console index/CTR monitoring.

## Measurement plan
- Capture baseline **last 90 days** in GSC: clicks, impressions, CTR, and average position by query/page, and index states; separately capture 28-day view for post-release trend (avoid comparing incomplete days).
- Track mobile Core Web Vitals from real-user 75th-percentile field data, not synthetic PageSpeed-only estimates: LCP <=2.5s, INP <=200ms, CLS <=0.1.
- Weekly review of non-branded discovery, branded query CTR, indexable product pages, Google Merchant Center diagnostics (only after account setup and validated feed).
- **No promise of #1 rankings, indexing dates or conversion gains.** Report both improvements and regressions against baseline.
