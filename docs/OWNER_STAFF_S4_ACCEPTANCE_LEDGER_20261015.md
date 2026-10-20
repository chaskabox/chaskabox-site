# ChaskaBox Owner & Staff Real Acceptance Ledger
Historical matrix: 15 October 2026. Draft PR #40 only. **No live production actions are authorized by this document.**

> Reconciliation added 20 October 2026: this is the historical S4 matrix. Later production owner Pages/AI receipts are recorded in `ADMIN_PAGES_AI_RELEASE_20261018.md`; current gaps are in `reports/PENDING_WORK_STATUS.md`. The NOT TESTED rows below describe that earlier session, not an assertion that all later work remains untested. Synthetic browser acceptance does not certify real financial or delivery events.

## Instructions
This is the *only* remaining way to certify real owner/staff workflows. GitHub Chromium tests use synthetic fixtures and cannot prove production sessions/persisted readback. Owner must run checks from a trusted, private browser session; **never share passwords, authenticator codes, cookies, recovery phrases, service-role keys or customer PII in screenshots/issues**.

Use a disposable preview/demo database approved separately, or request read-only inspections against production; never create fake public reviews, real orders, payments, notifications, SMS, WhatsApp or emails. For each row, retain redacted evidence of:
1. Role (owner/manager/content/fulfilment) and completed authenticator AAL2
2. Allowed/denied action *with authorized synthetic fixture*
3. Visible success/failure message and audited server status
4. DB reload/readback after browser refresh and independent storefront result
5. Undo/rollback and data-cleanup evidence

Record **PASS**, **BLOCKED (reason)**, or **NOT TESTED**; do not mark a view PASS based only on navigation visibility. Current default: NOT TESTED.

| View | Safe S4 acceptance | Special safety rule | Result |
|---|---|---|---|
| Dashboard | Reconcile cards with read-only aggregate endpoints | No fake sales | NOT TESTED |
| Orders | Filter/query/read-only persisted order status | No new order, payment or settlement | NOT TESTED |
| Refunds & Issues | Read a synthetic case and role gating | No real refund | NOT TESTED |
| Coupons | Synthetic draft add/edit/disable/readback | Avoid any public promotion | NOT TESTED |
| Shipping | Synthetic inactive zone, reload, disable | No published courier cost change | NOT TESTED |
| Analytics | Range filters vs server counts | Redact customer data | NOT TESTED |
| Catalogue Snapshot | Download/redact snapshot and test file validity | Snapshot != full recovery | NOT TESTED |
| AI Image Studio | Confirm disabled/budget UI | No paid inference without approval | NOT TESTED |
| Products | Synthetic hidden product create/edit/visibility/readback | No real catalog pricing changes | NOT TESTED |
| Categories | Draft create/edit, Content deny delete, Owner/Manager delete | Only synthetic isolated category | NOT TESTED |
| Brands | Draft create/edit, Manager deny delete | Only synthetic isolated brand | NOT TESTED |
| Chaska Box Builder | Private draft edit, price validations | No real publish | NOT TESTED |
| Homepage | Save draft, readback, gated publication | Do not publish production layout | NOT TESTED |
| Navigation | Add/edit/hide/reorder synthetic item | No irreversible delete; avoid broken public routes | NOT TESTED |
| Theme | Preview and cancel draft | No global live theme apply | NOT TESTED |
| Customers | Verify role visibility and masked data | No customer export / contact | NOT TESTED |
| Reviews | Preview moderation in isolation | No invented testimonials | NOT TESTED |
| Media Library | Synthetic file preview/assignment/readback | Do not overwrite original photos | NOT TESTED |
| Notifications | Health/read-only outbox counts | No provider sends | NOT TESTED |
| AI Center | All 8 statuses visible and outage cases | Keep enabled=false | NOT TESTED |
| System Health | Verify real health vs configured/unknown | Configured != delivered | NOT TESTED |
| Site Preview | Compare preview against live routes | Do not claim preview is production | NOT TESTED |
| Store Settings | Draft preview/reload; owner-only enforcement | Keep secrets sealed | NOT TESTED |
| Team & Security | AAL2 owner access, staff role capability deny | Never collect OTPs, no unapproved invites | NOT TESTED |

## Release and evidence gates
- PR #40 exact SHA matches successful unit/Chromium/secrets CI.
- Issue #36 cannot be closed until authenticated readback is performed; issue #41 cannot be closed until safe isolated agent staging and Owner signoff.
- No new hosted Supabase project, chargeable Cloudflare request, production merge/deploy or WhatsApp mutation without explicit approval.
- If owner chooses to release without full acceptance, record which workflows remain untested and explicitly accept that risk; never claim all 24 business views fully certified.
