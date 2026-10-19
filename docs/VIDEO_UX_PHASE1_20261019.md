# Video UX implementation — Phase 1, 19 October 2026

The recorded preview used different aspect ratios for the cream and blue
homepage banners. At the audited width, the blue slide moved the categories
32px down. A separate controls band also consumed vertical space, and users
could not explicitly pause rotation.

## Resulting behavior

- All three approved scenes share one reserved desktop frame. A short desktop
  viewport uses a 352px frame; taller screens use a bounded responsive frame.
- Approved image files are unchanged. They scale proportionally; the original
  baked-in footer remains behind the shared DOM trust row.
- The mobile blue scene uses a product-only crop, keeping the baked-in
  numerical brand badge and footer outside the visible image at narrow widths.
- Controls are part of the text column from the initial homepage HTML, below
  the shopping links. No controls band is inserted after hydration. Client-side
  entry shells create the same controls in the same column.
- All six controls have a 44px minimum target. The smallest mobile layout uses
  an icon-only playback button with a complete accessible action label.
- Five-second rotation is preserved. Explicit Pause and manual selection remain
  paused across hover/focus changes, tab revisits and CMS copy updates. Play
  resumes automatic rotation after temporary hover/focus pauses end.
- Reduced motion disables autoplay while preserving manual slide navigation.
- The shared trust facts, two shopping destinations and CMS copy integration
  are retained. Shared CSS/script tags and the homepage preload hint use the
  same new asset version.

## Verification

- Existing carousel behavior test expanded for persistent manual selection,
  Pause/Play, tab visibility, CMS refresh and reduced-motion changes.
- Existing syntax, source, asset policy and approved-art regression checks.
- Dedicated branch-preview UI workflow verifies the deployed carousel source
  hash before running. It measures every slide at 320, 360, 390, 430, 768,
  1024, 1366 and 1440px, records screenshots, checks geometry/CTA destinations,
  and exercises real five-second playback intervals and reduced motion.
- Final CI outcomes and the verified preview are recorded on the pull request.
  This document does not substitute expected checks for actual results.

## Remaining phases

1. Owner review of Phase 1 staging evidence.
2. Reconcile the separately active header/Brands/paired-support work in PR #114;
   improve navigation readability and support-control overlap in that context.
3. Equal product-image frames and title/pack/price/button alignment.
4. Reduce buying-critical scroll reveals; review remaining interaction states.
5. Consolidate repeated trust copy and compact lower-page sections.
6. Combined mobile, keyboard, reduced-motion and performance acceptance before
   an owner-approved coordinated production release.

Phase 1 does not change checkout, payment/BOP state, WhatsApp or notification
integrations, prices, product records, hidden product #269 or hero image files.
No production merge/deploy is part of this phase.

Research basis: the owner's video audit; W3C carousel animation controls
(https://www.w3.org/WAI/tutorials/carousels/animations/); Google carousel layout
guidance (https://web.dev/articles/carousel-best-practices).
