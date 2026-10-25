# Approved reference hero on Shop

The requested placement is `/shop/`, above breadcrumbs, collection filters and the product grid. The existing site header remains the header. Homepage banners and catalogue/checkout/notification data are unchanged.

The cream/navy/orange composition, reference-derived navy phrase font, brush flavour font, mobile sprite placement and gentle motion come from the owner's private preview source at `ab2574e312ba7f2b88c6d91afb51ecb02a698e67`. These are custom fixed-phrase font outlines, not an identified commercial typeface. The reference's packet artwork is decorative illustration; actual purchasable products remain the real catalogue grid below.

The Shop server response includes the hero, its scoped stylesheet, font preloads and one screen-appropriate image preload. Other collections retain their existing first-product preload. Client navigation into Shop mounts the same component; navigation to Home, bundles and categories hides it and stops its timer. The primary CTA scrolls to and focuses the catalogue heading; the secondary CTA uses the existing bundles route. Reduced motion, pause/play, visibility and viewport state stop unnecessary animation.

Only Shop loads the component and its assets. Styles are scoped under `#cb-shop-hero`; public entry templates invalidate the changed app script URL. The existing collection H1, filters, product rendering, canonicals and metadata remain intact.

Local validation: 462 native tests, 459 passed, 3 environment-dependent skips, zero failures. The final targeted catalogue/cache suite passed 13 tests without skips. JavaScript syntax, photo manifests and existing CSS bundle checks passed. Pages Functions compilation passed. Local browser QA used the existing read-only catalogue fixture (27 products), inspected desktop and 320/390/430px layouts, confirmed heading fit, tested slide selection/pause, catalogue focus and Shop-to-bundles-to-Shop visibility. It did not write to production data.

Adobe was selected during this work. Its installed status was verified and its Fonts skill read, but Adobe font-search/editing tools were not exposed in the session. No Adobe font search, identification or edit is claimed.

Production remains subject to the existing owner approval in `MUSE_FINAL_DEPLOYMENT_TASKS.md`. This branch is prepared for staging review first.
