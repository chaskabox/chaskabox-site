# ChaskaBox Ranking Phase 3 — Product SEO audit and schema guard

Date: 2026-10-19. **Status: Phase 3 initiated in a separate review branch. No production Phase 3 release.**

## Read-only live catalogue baseline (Supabase products, visibility='visible')
| Check | Observed |
|---|---:|
| Public products | 105 |
| Missing custom SEO titles | 0 |
| Missing custom SEO descriptions | 0 |
| Missing ordinary descriptions | 0 |
| Missing image_url | 0 |
| Missing custom og_image | 105 |
| Missing brand | 4 (all curated ChaskaBox bundles: IDs 267, 270, 271, 272) |
| Missing pack | 0 |
| Invalid/null prices | 0 |
| Duplicate custom SEO title groups | 0 |
| Custom SEO titles longer than 65 characters | 11 |
| Custom SEO descriptions longer than 160 characters | 0 |
| Local images under images/ | 95 |
| HTTPS images | 10 |
| HTTP/data/javascript image URLs | 0 |
| Sourced after order | 105 |

Values are a point-in-time read-only snapshot, not search ranking/traffic metrics. The 105 missing *custom* OG images do **not** imply missing social-preview images: SSR falls back to the verified catalogue photo, then approved site logo. Verify actual remote image fetches before declaring previews working. The four bundles with empty brand are not falsely stamped with an invented brand.

## Source audit
- `functions/product/[[slug]].js` serves a canonical indexable product page for visible products only and suppresses unavailable IDs, with product-name-based escaped ALT, a product photo/fallback, BreadcrumbList and Product JSON-LD.
- `functions/api/_lib/seo.js` sets offers in PKR, identifies ChaskaBox as seller, and deliberately leaves availability out for `sourced_after_order`; **do not** map it to `InStock`, `BackOrder`, `PreOrder`, or fabricate delivery/returns.
- Added a schema-only guard: missing/null/blank/invalid prices must not produce a false free (`0`) Offer. No legitimate existing price was changed.
- Image/schema sources cannot be asserted Google-crawlable without live HTTP/image inspection. The 11 long titles require editorial review, not automatic truncation.
- Explicit `og_image` field being empty is not an SEO defect when the fallback image exists and is suitable, though custom crops may improve sharing; keep original product photos intact.

## Work after this review branch
1. Read-only sample 105 product images for HTTP 200, correct MIME, crawlability and dimensions; prioritize 10 external HTTPS sources and local fallback paths. Do not replace imagery with generated representations or change product records without separate approval.
2. Per-product Rich Results tests for Product name/image/Offer and rendered price equality; check actual stock policy, do not add unsupported ratings, GTIN, shipping fees or return terms.
3. Produce a short editorial QA list for 11 longer titles and 4 unbranded bundles; no mass rewrite. Require Google Search Console last-90-day export for CTR/position baseline.
4. Review organization-level ShippingService / MerchantReturnPolicy only against approved admin settings and published policy, with human verification of accuracy before schema changes.

Google sources:
- https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
- https://developers.google.com/search/docs/appearance/structured-data/product
- https://developers.google.com/search/docs/appearance/structured-data/shipping-policy
- https://developers.google.com/search/docs/appearance/structured-data/return-policy

## Safeguards
No product visibility change (including #269), price/stock/catalogue rewrite, checkout/payments/BOP, COD/JazzCash, WhatsApp/notifications, admin publishing, customer data or hero changes. Tests are pure and safe. Phase 3 remains review/staging only until separately approved for final release.
