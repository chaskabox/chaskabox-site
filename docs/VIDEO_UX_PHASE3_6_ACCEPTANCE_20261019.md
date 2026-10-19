# Video audit implementation, Phases 3–6 — 19 October 2026

This follow-up builds on the approved production release `8d92d7c` and the
current SEO and product-image loading baseline. PR #116 was closed after that
coordinated release. The approved Cart/Bag SVG and its 21px scale are retained
in all 14 public entry shells. This work completes the original video-audit
recommendations that remained after the earlier release's partial card polish.

## Phase 3: consistent product comparison

All card photo anchors reserve a square before the photo downloads. Their
contained images cannot change the frame through intrinsic flex sizing.
The client renderer, static fallback and server-rendered catalogue share a pack
metadata wrapper. Cards reserve the same title, pack/details, price and 44px
button rows. Existing names, pack text, prices, discounts, availability and
shopping actions are preserved. At laptop widths the Home rail shows five
readable cards; wide screens show six, tablets four and mobile two plus a
scroll cue. Category label areas accommodate two readable lines. Rail View all
and arrows use 44px targets; original promotion links remain.

## Phase 4: immediate information and quiet motion

Shopping headings, prices, category links and supporting copy remain visible
without waiting for an intersection observer. This also holds with JavaScript
disabled. Per-pointer 3D card/hero tilt and the optional bundle image fan are
removed; static contained pack photos and restrained pointer hover feedback
remain. Removing the fan also avoids its extra decorative photo downloads.
The owner-editable announcement displays the complete configured text without
independent rotation. All three hero files, five-second timer, manual controls,
Pause/Play and reduced-motion behavior retain their existing implementation.

## Phase 5: shorter, more useful lower content

The single hero policy strip remains. The independently managed secondary
trust section becomes a compact link to the existing order guide. Its CMS
visibility/order control is preserved. The spotlight retains its catalogue
and guide links in a compact layout. The sourced-after-order explanation keeps
all four steps and the real-catalogue pick; published packing videos still
load on request. Why ChaskaBox keeps three supported reasons: clear original
pack details, useful bundles and human support. Delivery and payment facts
remain in the hero, FAQ and footer and still follow saved settings.
New/changed homepage text is registered in Pages & Text for existing protected
draft, preview and publish controls. There is no database content publication
as part of this code change. Existing owner overrides and their field IDs
remain authoritative. Footer link text is readable; Quick answers and All FAQs
have distinct destinations. Small trust illustrations share the site's SVG
line-icon family.

## Phase 6: release acceptance

Required checks are the full source/unit/build/secret and synthetic browser
suite, plus exact-source Cloudflare staging checks. Staging coverage includes
11 widths from 320 to 1920px, real Home/Shop/Bundle/Category/Brand cards, keyboard
menus and focus return, help open/close, no overlap, the three stable heroes,
reduced motion, JavaScript-disabled content and automated homepage accessibility.
The live UI checks block non-read HTTP requests. They submit no order, payment,
AI question, WhatsApp message or admin publish operation. Two Lighthouse mobile
samples per candidate Home/Shop route report actual lab LCP, CLS and TBT; these
are not field INP results or a guaranteed production performance uplift.

Chrome DevTools MCP is unavailable in this environment. The existing approved
GitHub Chromium/Lighthouse route supplies browser and lab evidence. Physical
phone and assistive-technology user sessions are not claimed.

Results, any fixes found during staging, and release status are appended after
verification. Checkout/payment behavior, BOP OFF state, WhatsApp/notification
backends, catalogue records, prices and hidden product #269 are unchanged.

References checked during the original audit and this implementation:
- https://www.nngroup.com/articles/scroll-animations/
- https://web.dev/articles/css-web-vitals
- https://web.dev/articles/optimize-lcp
- https://www.w3.org/WAI/WCAG22/Techniques/css/C39
