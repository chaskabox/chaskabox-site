# ChaskaBox storefront + owner control audit
**Date:** 17 October 2026. **Scope:** research-backed product discovery, customer journey and Admin V4 design controls; no live business mutations.

## Evidence
- Code reviewed: `app.js`, `index.html`, `shop/index.html`, `styles.css`, `admin.html`, `admin-live.js`, `admin.js`, theme and homepage endpoints on `chaskabox/chaskabox-site`.
- Public UX guidance: [Baymard 2026 Ecommerce Search](https://baymard.com/research-articles/ecommerce-search-query-types), [Baymard 2025 Product Lists & Filtering](https://baymard.com/research-articles/current-state-product-list-and-filtering), [W3C WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/).
- CI uses actual Chromium on synthetic customer/admin fixture pages. These fixtures do not constitute real-owner authentication acceptance or measured customer conversion.

## Critical review: storefront

| Finding | Impact | Control/action |
| --- | --- | --- |
| Product search matched only name and pack even while autocomplete searched name, brand and category | A brand/category query can give misleading empty results | **Fixed**: match name, pack, category, brand and product description. Exact sales uplift not claimed |
| Users need direct visible access to snack categories on small screens | Users can otherwise rely solely on a drawer or sidebar to discover products | **Fixed**: horizontal swipeable category shortcuts driven by public, real catalogue categories; no invented category links or counts |
| Search query wasn't visible as an applied filter chip | Harder to understand why product count fell to zero | **Fixed**: removable search chip, aligned with existing brand/price/pack chips |
| Empty product results provided only generic text | No immediate route back to the catalogue | **Fixed**: clear search/filter and browse all snacks actions, including smart-search errors |
| Mobile menu and search have existing implementation | Replacing without deeper tested flows risks breakage | **Preserved**: existing mobile drawer, category links and search logic |
| Full query-type support (synonyms/typos/brand + feature phrasing) remains imperfect | Some legitimate searches may miss relevant products | **Pending separate backend/search relevance work** with ground-truth queries and metrics |
| Product images, stock messaging, hero readability, mobile LCP and category schema need real-device validation | Marketing and accessibility regressions may remain even if CI passes | **Pending owner/device acceptance**; no claim of measured conversion gain |

## Critical review: admin controls

| Existing working control | Gap found / delivered |
| --- | --- |
| Homepage Builder (section order, visibility, headings, drafts, section publish) | Initial HTML misleadingly contains disabled placeholder content. Real editor appears after authenticated load. **Do not duplicate CMS.** Review label accuracy and establish draft diff/rollback as future work |
| Header, footer and mobile navigation (add/edit/order/enable, existing secured API) | **Delivered** Storefront Control Center links directly to the authorized editor |
| Categories, products, media and merchandise visibility controls | **Delivered** unified shortcuts to existing authorized editors; no extra unaudited bulk actions |
| Theme Studio (palette, logo, font, announcement, save/reset) | Old 'Preview' colored **Admin chrome**, not the customer shop. **Fixed** to use isolated, unsaved responsive storefront iframe for CSS palette/font; actual logo/announcement previews are not yet guaranteed |
| Storefront Site Preview (desktop/tablet/mobile and public routes) | **Delivered** journey shortcuts for homepage, shop, brands, boxes, cart, track order and readable status |
| Six grouped admin navigation sections and 25 panels | **Preserved** with V4 sidebar improvements: favorites, focus mode, expand/collapse, keyboard/mobile focus |

## Future controls not falsely reported as built
1. **CMS revision history + safe restore:** per-section audit diffs, preview vs published comparison, rollback with owner approvals.
2. **Hero variant design controls:** multi-hero layout, CTA label and destination, background cropping, scheduled campaign visibility, all validated through a CMS schema and public renderer.
3. **Storefront product discovery settings:** synonyms dictionary, searchable brand/category aliases, query analytics without storing customer PII, zero-result QA list.
4. **Rich merchandising rules:** owner-approved curated products per section, mobile display density, fallbacks and product visibility validation.
5. **Publish workflow:** explicit draft → side-by-side device preview → approval → publish with rollback; protected APIs required.
6. **Real-world audit:** phone browser/assistive tech, production Core Web Vitals and order funnel metrics; no synthetic result can certify these.

## Security and deployment gates
- No production order/payment/shipping/coupon mutations, provider sends, WhatsApp activation or unaudited publishing.
- Storefront category links derive only from visible public catalogue; no private admin data.
- Preview uses synthetic staff fixtures or reads public storefront routes. Admin edit links defer to existing MFA-protected server endpoints.
- Require CI, visual approval and production smoke checks before merge/deploy. `PR #57` remains open until those checks pass.
