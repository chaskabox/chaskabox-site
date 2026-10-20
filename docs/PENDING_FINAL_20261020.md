# Pending closeout — 20 October 2026

## Implemented changes

- Start the independent product database and HTML shell reads together. Product visibility, authoritative pricing, escaping, responsive image preload and no-store policy remain in force. The concurrency test holds the database read open and verifies that the shell read has already started.
- Warm only the next approved hero artwork at low priority after the visible artwork loads. Keep the original three AVIF assets, framing, five-second timer, pause controls, reduced motion and all existing margins. Update the carousel URL consistently across shared storefront shells.
- `tools/closeout-seo-metadata.sql` fills only the two reviewed empty title/description pairs for public products #14 and #67. It locks both records, refuses changed source data, records before/after maintenance snapshots in `product_versions`, preserves other fields, and supports an idempotent rerun. No staff identity is impersonated. Isolated Postgres tests verify field preservation, snapshots and complete rollback on a concurrent owner edit.
- The branch-specific preview workflow verifies the exact carousel source, approved hero/navigation/header geometry, and paired production/candidate Lighthouse measurements. The private recovery workflow includes this branch and creates a fresh private backup before the offline restore drill.

## Notification reconciliation, read-only

The database check at 15:49 UTC found 26 blocked WhatsApp ledger records:

| Reason | Customer | Owner | Decision |
| --- | ---: | ---: | --- |
| `event_expired_review_required` | 18 | 5 | Retain original blocked history; do not resend expired events. |
| `whatsapp_before_activation` | 1 | 1 | Retain activation fence; do not replay pre-activation events. |
| `customer_whatsapp_opt_in_missing` | 1 | 0 | Retain consent block; no customer send. |

All 26 records were older than 24 hours and had zero delivery attempts. The separate legacy queues contain 16 customer and one owner pending records. They are not consumed by the current dispatcher and may overlap the same historic business events: do not add these counts to claim 43 distinct failed orders.

Current dispatcher heartbeat was successful, with zero claimed/retry/dead/uncertain counts and no last error. Existing receipts show seven owner emails and one owner WhatsApp delivered. Configuration currently includes all three channels; this release does not change channel flags, sessions, queue status, receipts or dispatch code. Old records are not relabelled delivered or silently removed to clear the Orders attention signal.

## Acceptance boundaries

Production monitoring already has eight enabled observe-mode agents, each with 21 succeeded receipts. Orders attention is the historical notification ledger; SEO attention is the two reviewed custom-field gaps. Marketing publishing remains locked.

Owner sign-in/MFA and 28 read-only panels were accepted on 20 October. Earlier Pages draft/publish/restore and provider self-test evidence remains in the existing ledger. Synthetic role and persistence tests plus an isolated schema/recovery drill do not certify real bank/advance/courier/customer events or an independently hosted staging database. No production staff identities, financial events or messages are created to manufacture evidence.

Oracle recovery draft PR #56 needs an authenticated host path and verified session backup. GSC Wizard currently refuses every call with `payment_required`; public HTTP/canonical/sitemap validation does not establish Google's current indexed state. These external holds must stay explicit until actual access/receipts exist. No paid project/subscription or host reinstall is included.

Exact-head CI, preview, backup/restore, deployed commit, SEO readback and mobile results are recorded in the release PR.
