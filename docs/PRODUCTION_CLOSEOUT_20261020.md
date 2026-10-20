# Production acceptance reconciliation — 20 October 2026

## Work completed in this coordinated release

- Preserve exact current product #5/#8 uploaded originals by SHA-256 and add proportional 320/640px WebP derivatives. Only exact upload URLs are aliased; a later owner photo remains untouched. `PRODUCT_IMAGE_VARIANTS_20261020.json` records source URLs, hashes and sizes. The 320px files are 15,434/21,528 bytes instead of 79,136/94,030 bytes (about 77–80% smaller); higher-density screens can select the 640px versions. Original zoom bytes are retained. Product database rows, prices and visibility are unchanged.
- Version the browser image manifest across all 13 shared storefront entry shells; the first two isolated preview photos now match current production originals. The isolated preview catalogue still differs from production and its lab score is not a production score.
- Show actual completed observation receipts alongside activation and current signal health. Fresh, stale, missing and future-dated receipts are distinct. A completed run with `unknown`/`attention` health does not become healthy. Owner controls remain read-only monitoring and protected by MFA; marketing publishing/delivery remains locked.
- Run a fresh private database/media backup and offline restore drill on this same-owner release branch. The existing script checks the source/media inventory, archive checksum, restored application and offline Auth; containers have no network. No archive or customer data is attached as a public artifact. Successful run IDs belong in the release PR, not a claim based on workflow configuration.

## Actual monitoring receipt reconciliation

The GitHub scheduled observation cycle [39382519809](https://github.com/chaskabox/chaskabox-site/actions/runs/39382519809), at production commit `13f6690463bde6c25e83542d80bd57a5d5635120`, completed successfully on 20 October. Its log says 8/8 enabled, 7/8 readable signal groups, and eight recorded observations. Independent read-only database inspection matched each agent to a succeeded private job, matching `observe:<agent>:2026-10-20:06` key, `github_actions` source and completed event between 06:48:34–06:48:47 UTC (11:48 PKT). Each agent had 20 succeeded jobs at inspection.

Latest health was analytics/inventory/marketing/security/support `ok`, orders/SEO `attention`, backups `unknown`. This verifies scheduled monitoring execution, not autonomous business decisions, messages or publishing. Orders reported 26 notification failures in its aggregate, not overdue orders or payment reviews; no failure/replay records were altered. SEO reported two missing custom title/description pairs (#14/#67); product copy/SEO fields were not edited in this performance release. Successful public Lighthouse SEO is separate from those stored-field completeness signals.

## Owner/staff and security evidence

- Fresh secure owner password+MFA sign-in and 28 read-only admin panel loads were verified on 20 October; ledger: `OWNER_STAFF_S4_ACCEPTANCE_LEDGER_20261015.md`.
- `ADMIN_PAGES_AI_RELEASE_20261018.md` records actual owner private draft/readback, reviewed About publication and versioned restore; real AI provider self-test, grounded product draft and AI settings save/readback were accepted then. This release does not change those write handlers.
- Current source browser tests cover owner/manager/content/fulfilment capability gates and controlled synthetic writes. These are not actual sessions of every staff member. No new staff identities, credentials or privileges are created to manufacture acceptance.
- Supabase security advisor was reviewed read-only on 20 October. The private/no-client-write tables intentionally have RLS with no client policies; no public policies were added to suppress informational findings. Existing role helpers use an empty search path and active database-role lookup; guest-order linking requires authenticated, confirmed, non-anonymous email and only links exact confirmed-email guest orders. These intended authenticated functions were inspected rather than blindly revoking required application access. No schema/security configuration changed.
- Leaked-password protection remains a Free-plan limitation as documented in the 18 October report; no paid upgrade was made.

## Remaining external acceptance and measured limits

The final PR contains exact-head CI, staging, restore and deployed mobile results. LCP must be measured on production; no field CWV/ranking pass is promised from an isolated lab. Approved three hero assets, five-second rotation, accessibility and reduced-motion behavior remain unchanged.

Actual bank/advance receipts, courier acceptance and consented customer delivery require a real approved business event; tests cannot manufacture them. WhatsApp/Oracle PR #56 remains a separate host-recovery HOLD without an authenticated host path/session-backup evidence. No notification replay, outbound message, order/payment decision or public content publication is included. Google indexing remains paused.
