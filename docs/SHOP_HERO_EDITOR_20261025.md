# Shop Hero editor and load improvements

Open **Admin → Storefront & media → Shop Hero**. Content staff can save drafts. Owners/managers can publish. Preview widths are 360, 390, 430, 768 and 1340 pixels. Drafts do not change the public banner; **Publish hero** publishes only this banner. Concurrent edits are rejected with a reload message.

Controls cover all copy, up to five rotating phrases, both button labels/links/visibility, original or rounded/brush/body lettering, curved headings, desktop/mobile type scale, colors, eyebrow badge, hero dimensions/spacing, each of the six product images/visibility/positions/width/rotation, small decorations, background shapes, dots, pause and animation durations. Images can be selected from the existing protected Media Library or uploaded through its existing image processor. If uploads are paused, the existing media service reports that status; URLs and Media Library selection remain available.

The original desktop image is a flattened composition, so the default **Original reference artwork** preserves it. Selecting **Separate product layers**, or changing a desktop product, reveals independent product slots over the cream/ring background. A custom desktop background can also be supplied. The mobile slots are individually adjustable. **Restore reference in draft** restores the approved defaults without publishing. The default remains the original reference lettering and a three-second phrase interval. Original lettering is a custom phrase ligature, not a recovered general-purpose typeface; arbitrary heading text uses DynaPuff.

## Performance

- Desktop 1800px artwork: 164,978-byte WebP → 109,569-byte AVIF (34% smaller); 900px AVIF is 40,593 bytes.
- Mobile atlas: 122,830-byte WebP → 77,845-byte AVIF (37% smaller).
- Responsive preload and image selection match; hero hints precede copy-dependent metadata.
- Versioned hero images/fonts use immutable caching. Mutable product images retain their existing cache policy.
- The browser hero module is bundled, avoiding dependent module request waterfalls.
- Shop reads products, bundle components and published CMS settings through one fresh `shop_page_snapshot()` RPC instead of three network requests. No prices, visibility or hero publications are cached by this change. The existing read path remains available for old database deployments.
- Static shell access uses the Pages ASSETS binding directly when available.

## Storage and security

Migration `20261025125136_shop_hero_cms_and_snapshot.sql` adds only the `shop_hero` CMS row and a service-role-only SECURITY INVOKER read function. The CLI-generated migration was aligned with the applied database history version. Existing CMS draft/publish operations provide atomic changes and audit logging. The public manifest contains published config only. Admin writes retain verified roles, live MFA, rate limiting, validation and optimistic concurrency. Product #269 remains hidden. Orders, notifications, payments and catalogue content are outside this change.

## Validation

Unit tests cover malicious URLs/CSS, literal escaping, product controls, fresh snapshot reads, private drafts, publish authorization, MFA, stale edits, migration replay and public RPC denial. The source browser acceptance suite includes a stateful synthetic editor save/preview/publish test and mobile overflow check. Local browser QA uses an isolated synthetic editor; it never sends changes to live storage.
