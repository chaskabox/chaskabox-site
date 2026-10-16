# ChaskaBox Notification Center — Consolidated Release & Self-Critique
Date: 2026-10-16
Scope: existing notification subsystem, one reviewed release package. **Not production authorization.**

## Critical review of my earlier proposal
1. **Calling it a new system was misleading.** Existing order triggers, the private ledger, a scheduled Cloudflare Worker, signed webhooks, safe retries and templates were already built. Replacing them would multiply senders, risk duplicate messages and cost more. This package extends the existing stack instead.
2. **A running cron is not proof of WhatsApp delivery.** Current production runs complete for the enabled `owner_email` target, whereas WAHA channels remain on hold. Only a signed delivery receipt confirms delivered.
3. **A single dashboard summary is insufficient.** Staff need a real event ledger with channel filters, delivered-vs-accepted distinctions, old/blocked review context and pagination. The read-only history endpoint and admin interface address this.
4. **Generic retry buttons are risky.** Current rules already reject historical replays, unknown WAHA outcomes and expired events. The new ledger adds **no direct send, bulk resend, force retry or enable-channel** control. Order-specific retries remain under existing safety rules.
5. **Free open-source WhatsApp is not the same as Meta-approved WhatsApp.** WAHA is not the official Meta API; hosting, session, account risk and delivery reliability remain. A provider abstraction should let ChaskaBox switch later without changing transactional producers.
6. **No sales does not justify sending fake production messages.** Synthetic staging fixtures and approved test recipients must be used; a real order is not required for QA.
7. **Front-end role gating alone is insufficient.** Server-side authenticated owner/manager RBAC applies to ledger reads. Owner requires fresh AAL2 plus live session check; read-only responses contain no phone, email, message body, token or provider request payload.
8. **A test run is not production acceptance.** Local Node fixtures prove contracts only. Provider identity, Meta template eligibility, WAHA session, signed receipts and real inbox delivery require separate approved E2E tests.

## Released as one *proposed* change set
- New: `GET /api/admin/notifications/history` (owner/manager; owner MFA) with bounded 20-row pagination and allowlisted filters for channel, pending, review, accepted and delivered; read-only; no-store; privacy allowlist.
- Updated: Admin Notifications view, delivery history with pagination/status/channel filters, disabled-channel hold labels, attempts, error codes and clear provider receipt distinctions.
- Updated: Wording no longer promises an unsafe retry action in the recent-failures section.
- Tests: allowed/invalid filters, private field filtering, roles, MFA and valid ledger access.
- No migration required; existing private `notification_deliveries`, `notification_dispatch_state`, receipt and template infrastructure retained.
- No production dispatch/settings/provider secrets/orders/payment/WhatsApp messages modified.

## Verified production baseline (2026-10-16; before this change)
- Notification Worker `* * * * *` cron active; DB last run reports no error, approved channel `owner_email`.
- One owner email has an accepted **and delivered** receipt.
- Four `customer_whatsapp` fulfilment updates pending on **inactive** channel.
- One customer and one owner WhatsApp event blocked with `event_expired_review_required`.
- Sixteen old customer notification rows and one old owner row are legacy audit records, not eligible work for this dispatcher.
- Production should **not** bulk replay or silently clear any of these rows.

## Remaining quality gates before owner-approved single deployment
1. CI: `npm run check`, `npm test`, `npm run build:functions`, `npm run build:notifications`; smoke test new history endpoint using valid owner AAL2 and manager sessions. Validate 401 / 403 / no-store / filtered counts.
2. Browser: desktop/mobile notification view, pagination, review/held labels, template editing unchanged, keyboard navigation/accessibility.
3. Database: confirm existing indexes `notification_deliveries_ready_idx`, `notification_deliveries_order_idx`; if history grows materially, profile sorted queries before changing indexes.
4. Provider: keep WhatsApp disabled until separate explicit approval; choose official Meta API for core business number where possible. If WAHA is retained, confirm ownership, session status, webhook signature verification and safe reconnect.
5. E2E: isolated synthetic test order, owner email, an approved WhatsApp test recipient only after authorization, no duplicate send, timeout/uncertain flow, provider accepted vs signed delivered receipt.
6. Recovery: backups and rollback ready; confirm no duplicate sender and no rollback to direct-send checkout code.
7. Operational policy: define customer consent, opt-out, template approval, retention and owner alert thresholds; never let an AI agent send or publish independently.
8. Old notification rows: require case-by-case owner-approved review/disposition, never blanket replay or mark delivered.

## Go / no-go
**No-go** if any test fails, owner MFA/authorization fails, protected-channel status changes unexpectedly, security permissions are bypassable, receipt verification fails, or a real customer would receive a surprise message. PR creation and passing CI do not grant production or WhatsApp activation consent.
