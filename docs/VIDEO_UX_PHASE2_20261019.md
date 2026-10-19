# Video UX implementation — Phase 2, 19 October 2026

Phase 2 combines the approved Phase 1 hero with the header, Brands dropdown and
paired support presentation merged in PR #114. Work continues in PR #116 for
one coordinated release after the requested phase reviews.

## Problems addressed

- The merged sticky stylesheet scaled the hero selector buttons themselves,
  reducing the approved 44px click area. It now leaves the hit area stable and
  lets the existing pseudo-element draw the smaller visual indicator.
- Primary desktop navigation used a viewport font calculation that remained
  near 11px on common laptops. Visible desktop navigation now uses 13px with
  restrained color feedback and no position change. The existing compact menu
  remains available below 1200px; normal 21px account-action icons are retained.
- The fixed Brands disclosure is appended to body to escape nav clipping.
  Its keyboard order now connects to the trigger and subsequent header link:
  Tab enters, Shift+Tab returns, the last link exits to the next header action,
  Escape restores focus, and leaving the disclosure closes it. CMS replacement
  of the trigger also closes the old disclosure. Brands activation still opens
  the disclosure; View all brands remains the deliberate directory destination.
- Brands height is limited by the actual available viewport. All Categories
  similarly uses the space above or below its trigger, with internal scrolling
  and Escape focus return.
- Standalone About and Contact pages now load the shared header presentation,
  retain native menu dismissal/focus return, and read the same public brand list.
  Their standalone WhatsApp control clears the mobile navigation when no AI
  launcher is present. Existing contact destinations and page content are retained.
- Support controls remain a compact WhatsApp icon beside a labelled Chaska AI
  action. Their alignment tracks control size, font readiness and viewport
  changes. Safe-area spacing is preserved; the duplicate mobile chat glyph,
  entrance animation and hover scaling are removed.
- The pair temporarily yields when it would cover buying text/actions, trust
  facts or footer links, and returns in clear space. A focused support control
  stays available. Open navigation, filter and modal overlays suppress the
  background pair; the AI panel retains its own close control and focus return.
  No AI question or WhatsApp message is sent as part of this verification.

## Validation

The read-only staging workflow verifies the exact deployed source hashes before
checking the combined interface at 320, 360, 390, 430, 768, 1024, 1200, 1280,
1366, 1440 and 1920px. It checks header overlap, visible navigation size, sticky
geometry, hero target sizes, both dropdowns, keyboard transitions, support
clearance over a real Add to Bag button, help open/close and reduced motion.
Non-read HTTP requests are blocked in these live UI checks. Existing hero
acceptance is then rerun on the combined interface. Actual results and review
screenshots are recorded on PR #116 after CI completes.

The existing full source, asset, browser/accessibility and build checks remain
required. Viewport tests do not claim physical-device or screen-reader testing,
nor do they establish numeric LCP, CLS or INP improvements.

## Remaining phases

1. Owner review of the combined Phase 2 preview.
2. Consistent product-image zones and title/pack/price/button alignment.
3. Buying-critical reveal behavior and remaining motion.
4. Repeated trust copy and long lower-page content.
5. Combined acceptance and one owner-approved production release.

All three hero image files and five-second rotation are preserved. This phase
does not modify product records, prices, hidden product #269, checkout or payment
behavior, BOP state, WhatsApp routing, notifications or AI answer generation.

Keyboard reference: W3C APG disclosure navigation pattern:
https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/
