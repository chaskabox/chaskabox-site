# ChaskaBox final-day A–Z audit — source and acceptance matrix
Date: 15 October 2026 | Branch: `improve/final-az-audit-20261015` | **One production deployment only after green checks + owner approval**

## Verification levels
- **S0** existence/source routes: not proof of functionality.
- **S1** isolated unit/schema/negative security test.
- **S2** synthetic Chromium browser (viewport, labels, interactions, no real orders).
- **S3** read-only live provider/database/source check.
- **S4** signed-in owner + limited staff, real authorized action → audited response → saved readback → public effect, with rollback.
- **S5** independently confirmed external provider delivery/payment completion.

### What we can verify without mutating real customer data
- 804 tracked repository files (last base snapshot); JavaScript syntax and native PostgreSQL test workflows.
- Site-wide static HTML forms/local asset references, duplicate IDs, and local script URL inventory (run `node tools/a-z-surface-audit.mjs --json`).
- 25 admin navigation/panel IDs align (Dashboard + 24 other sections); **S0 only**. Browser CI has mocked workflows for selected panes, not 25 real S4 acceptances.
- Checkout authoritative API pricing and idempotency, Pakistan-only delivery, server/browser address and quantity validation.
- Protected admin role/owner AAL2 MFA, database migrations, recovery tests, 8 AI agent definitions.
- AI agents today are **not eight autonomous jobs**. Eight are configured, disabled, observe mode; dashboard shows read-only diagnostics and review-only marketing drafts. Don't call them enabled until owner gates and scheduler/quotas/provider acceptance exist.

## Admin panel owner acceptance (S4 required for each)
| Area | Required verified action | Current confidence |
|---|---|---|
| Orders | filter, details, fulfilment → persisted status, payment proof | S1/S2 only |
| Refunds & Issues | open/resolve, refund recorded != money sent | S1/S2 |
| Coupons | CRUD, expiration/max-use + authoritative quote | S1/S2 |
| Shipping | zone CRUD, city lookup + actual delivery fee | S1/S2 |
| Analytics | compare source orders vs dashboard windows/filters | S1/S2 |
| Backup | private archive, offline restore, checksum (no live restore) | S3 offline proof |
| Image Studio | media upload/permissions/limits and quota | S1/S2 |
| Products | editor, archive, tags, visibility, image evidence | S1/S2 |
| Categories | CRUD, assignments, SEO/page routing | S1/S2 |
| Brands | CRUD, image/logo, SEO/mobile | S1/S2 |
| Boxes | preview, publish, contents, quote and inventory | S1/S2 |
| Homepage | draft/save/publish/rollback + mobile | S1/S2 |
| Navigation | menu sort and header/mobile/footer parity | S1/S2 |
| Theme | preview, contrast, publish/readback | S1/S2 |
| Customers | least privilege, history, privacy | S1/S2 |
| Reviews | approve/reject and storefront reflection | S1/S2 |
| Media | upload/assign/cleanup and recovery | S1/S2 |
| Notifications | queue, templates, provider signed receipts; MUSE handles WhatsApp | Email S3, WAHA pending |
| AI Agents | inspect 8 states, signals, approval review, service role gates | S1/S2 only; all disabled |
| AI Assistant | owner mode, quotas, failure and fallback | S1/S2 |
| System Health | heartbeat, backup faults, degraded readback | S1/S2 |
| Site Preview | draft/published parity mobile and desktop | S1/S2 |
| Store Settings | fees, payments, security-secret masking/readback | S1/S2 |
| Team & Security | invite/roles, owner MFA, audit and revoke | S1/S2, real owner MFA S3 |

## Competitor / standards review
1. Naheed shipping shows delivery zones, fee and realistic timing by city; ChaskaBox must not invent overseas fees or ETA: https://www.naheed.pk/delivery-shipping
2. GrocerApp promotes delivery-slot selection; offer only after a courier schedule integration is verified: https://grocerapp.pk/mobile-app/
3. Al-Fatah publishes shipping/payment limits clearly; make country coverage explicit before payment: https://alfatah.pk/pages/shipping-exchange-policy
4. Baymard recommends guest checkout, clear errors, single-column address forms, phone-field explanation: https://baymard.com/research-articles/current-state-of-checkout-ux
5. OWASP mandates server-side validation for checkout, pricing, quantities and access: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html

## Single production release gate
1. Complete all synthetic checks, rerun browser/secret/native suites on exact SHA.
2. Preserve PR #35 login redesign and previous production DB migrations; no AI unapproved activation.
3. Owner chooses whether international shipping is future-only (default Pakistan), confirms rates, refund policy, genuine product imagery and acceptance sessions.
4. Read-only verify Cloudflare automatic production deployments disabled; test preview. No production build before final approval.
5. Merge one reviewed consolidation PR to protected main; invoke exactly ONE manual Pages deployment after green main checks.
6. Read-only verify canonical deployed SHA, no new real orders/notifications; owner performs approved S4 sign-off.

**Current limitation:** This inventory is structured evidence gathering, not a guarantee every page, form, JavaScript flow, provider or owner action is fully operational. Do not claim S4/S5 from mocked tests.
## AI owner controls: partial-failure hardening
- Client-side diagnostics now fetch four owner+MFA endpoints independently; a failure in optional monitoring, insight, or marketing reads never blanks valid activation data.
- A failed activation/status endpoint is reported as **Unknown**, never **0 enabled**.
- All eight cards remain visible with unavailable evidence plainly distinguished; failed marketing reads lock the local proposal form until a successful refresh.
- Synthetic Chromium acceptance tests cover partial diagnostic outage, status outage and recovery. No autonomous agent, provider send or scheduler was enabled. Independent staging schema parity and owner sign-off remain blockers.
