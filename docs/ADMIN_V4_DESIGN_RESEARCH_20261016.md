# ChaskaBox Admin Console V4 — Research-led controls (16 October 2026)

## Source review

This is a lightweight reference study for ChaskaBox's existing authenticated vanilla-JS admin console, **not** a recommendation to copy Shopify's product or install its React system.

| Public guidance | Grounded finding | ChaskaBox V4 decision |
|---|---|---|
| Shopify: [Navigation](https://shopify.dev/docs/apps/design/navigation) | Use few categories, descriptive page titles and clear actions; allow straightforward movement between related screens | Preserve 25 permitted panels in six groups; searchable navigation and accessible quick switch |
| Shopify: [Index table](https://shopify.dev/docs/api/app-home/v1.0/patterns/compositions/index-table) | Search, filters, sorting, bulk actions and pagination help large resource lists | Existing protected Orders/Products API filters and bulk confirmation remain; do not add unaudited destructive bulk actions |
| Baymard: [Product List Research](https://baymard.com/research/ecommerce-product-lists) | Relevant filters/sort help users navigate dense catalogues; findings are mostly customer-facing, not proof of admin impact | Prioritize safe operator navigation and discoverability; validate admin tables through separate owner testing |
| USWDS: [Table](https://designsystem.digital.gov/components/table/) | Right-align sortable numbers, design responsive tables, and provide visible sort states | Keep readable numerical cards, preserve existing Orders/Products table semantics; compact view adjusts spacing rather than font legibility |
| W3C: [WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) | Target minimum 24px with spacing exceptions, visible focus and unobscured keyboard navigation | 40px+ primary controls, visible focus rings, keyboard dismissable launcher, mobile drawer, reduced motion |
| NN/g: [Five visual-design principles](https://www.nngroup.com/articles/principles-visual-design/) | Hierarchy, balance, contrast, scale and grouping support visual clarity | Navy identity, grouped tasks, readable headings, clear tool contrast and one action panel |

## Implemented in V4 preview branch

- **Find panel launcher** (Ctrl/Command+K): lists only role-visible panel buttons after auth. Enter/click navigates via existing admin handlers, Escape closes. Search never sends or mutates data.
- **Compact/Comfortable density**: optional browser-local UI preference; preserves 40px interactive nav targets. No user account attributes or sensitive data stored.
- **Operations & review**: four navigation buttons to Orders, Products, Notifications and System Health, explicitly **not** reporting live alarms or numerical counts.
- **Dedicated synthetic preview**: mobile and desktop layout with 25 original panel entries, no Supabase client or credentials; real sign-in only on the canonical production site.
- Design change includes CI browser interactions for launcher, density persistence and mobile group navigation.

## Safety boundaries

Production data must never be copied to preview. Do not load production Supabase credentials into Cloudflare Pages preview. Server-side role/MFA and live API authorization remain mandatory. No new WhatsApp, email, checkout, payment, publishing, delete or bulk-write behavior is implied or introduced.

## Next review

Owner should compare the demo on 390px mobile and desktop (desktop keyboard Ctrl/Command+K, search, compact mode, navigation) before visual merge. Authenticated acceptance tests for real Orders/Products and pending notification provider delivery require explicit real-account access and appropriate approvals.

## What we did not infer

Public UX studies do not validate any claims about ChaskaBox's sales, products, warehouse inventory, current order counts, staffing or conversion improvements. Demo figures are synthetic, not external customer research.
