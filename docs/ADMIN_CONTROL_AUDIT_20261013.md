# ChaskaBox Admin Console — Functional Control Audit
Date: 2026-10-13 · Scope: `chaskabox/chaskabox-site` current main + proposed Phase 1 fixes

## Truthful status
The console has 24 navigation sections, not 24 proven end-to-end workflows. Existing database/API code is evidence of implementation, **not** evidence of a successful live owner action. Do not mark a section DONE without signed-in account acceptance, persistence/readback and storefront observation. Production integrations require external provider receipts, not just an HTTP 200.

## Verified structural findings
- Legacy `admin.js` and authenticated `admin-live.js` both bind parts of Products, Box Builder and navigation. Legacy bulk buttons showed disabled-mode toasts. Phase 1 adds an authenticated atomic batch API and interception for real operations.
- Protected product listing omitted `tags` even though Product Editor submitted `tags` on save. Saving a product could unintentionally clear existing tags. Phase 1 includes `tags` in the protected GET.
- `wireSensitiveField()` returned old `dataset.realValue` while its field was in editing/revealed mode. Phase 1 returns the current edited value and re-reads Settings after save.
- Box Preview was only a toast. Phase 1 creates a real unsaved item/quantity/price preview; this is not a storefront product-page preview.
- All staff previously saw nearly every navigation item even where backend role enforcement denied access. Phase 1 aligns visible navigation to known backend roles; APIs remain the security boundary.
- CMS transaction RPC supports audited atomic product updates with concurrency checks. Phase 1 uses it for at most 50 products per bulk action.
- Full backup restore UI is intentionally paused and MUST NOT be presented as available; never perform test recovery against the production database.
- MFA login has been deployed and owner-accepted as working.

## Functional acceptance matrix
| Panel | Existing backend workflow | Still to verify or improve |
|---|---|---|
| Dashboard | Metrics, recent orders, attention APIs | Live role-by-role KPI and data freshness |
| Orders | Search, details, fulfilment, payment review, notes | Real test transactions, authorization, receipts, refunds |
| Refunds & Issues | Resolution case API | Case creation → lifecycle → refund evidence |
| Coupons | Discount CRUD | Live checkout application, date limits, max uses |
| Shipping | Zone CRUD | City normalization and checkout fee agreement |
| Analytics | Revenue, segments, funnels, SEO checks | Compare totals to authoritative orders, timezone windows |
| Catalogue Snapshot | Protected export only | Recovery drill in isolated database, R2/media verification |
| Image Studio | Optional decorative Workers AI | Binding/quota validation; never create fake product photos |
| Products | Protected CRUD, media, archived states; Phase 1 atomic bulk | E2E publish/unpublish, tag retention, error handling |
| Categories | Category CRUD + featured assignments | Storefront routing, category visibility and assignment outcomes |
| Brands | Brand CRUD, logo upload, preview | Mobile layouts, SEO, URL and changes reflected in storefront |
| Chaska Boxes | Draft/save/publish; Phase 1 real unsaved preview | Real box edit, price, inventory compatibility, checkout |
| Homepage | Sections/heading/draft/publish | Hero text/image layout, ordering, staging and rollback |
| Navigation | Menu CRUD and reordering | Mobile/header/footer parity and rollback after failed move |
| Theme | Theme settings + preview | Persistence, responsive contrast and accessibility |
| Customers | Paginated detail/history | Identity rules, privacy and action permissions |
| Reviews | Moderate/reply | Verified reviews and moderation storefront propagation |
| Media Library | Upload, delete, operations | 14 missing photos, R2 recovery and reassignment workflows |
| Notifications | Outbox status/templates | WhatsApp/email provider accepted vs delivered test |
| AI Center | Controlled drafts/apply | Paused until free-quota verification, review workflow |
| System Health | Supabase/Turnstile/AI/notifications status | More explicit failed health/backup indicators |
| Site Preview | Route and viewport iframe | Draft vs published authenticity, browser fallback |
| Store Settings | Commerce/contact/payments/AI toggles | Secret masking/readback, live checkout tariff verification |
| Team & Security | Staff emails/roles, MFA, audit, sessions | Invite delivery, owner-to-owner access tests and recovery |

## Phase 1 changes prepared
1. Atomic audited bulk Show/Hide/Archive/Restore endpoint, max 50, no permanent deletion and no box changes.
2. Live product-selection controls, update confirmation, error reporting and refresh.
3. Correct archived item restore semantics (restore hidden before manually publishing).
4. Preserve existing product tags on edit and reset stale SEO/brand fields for new products.
5. Real unsaved Box Preview with selected items and price.
6. Settings edited-value save fix, correct defaults for masked fields and database readback.
7. Role-filtered navigation and visible retry/error messages; CSS and script cache keys refreshed.
8. Dedicated regression tests for access boundaries, atomicity, errors and controls.

## Phase 2 high-priority backlog
- Server-backed owner **Operations Center** with actionable notifications of failed backups, missing media, pending payments, stuck deliveries, and bad product metadata (real source counts only).
- Replace native prompt() CRUD for coupons/shipping/resolutions/brand operations with accessible validated forms.
- Add product-media association picker, placeholder/missing-image report, bulk upload mapping and product #186 pack correction from verified manufacturer evidence.
- Homepage ordered drag/touch reordering, hero asset edit, preview/publish history and rollback.
- Unified notification test panel: send to explicitly authorized owner numbers/emails, redact provider credentials, show signed provider delivery receipts.
- Provider/payment acceptance: COD, prepaid payment verification, refunds, idempotency and notification status.
- Owner role-management tests including invitation delivery; audit every change.
- Live Lighthouse, GSC indexing and CWV health linking (external read-only data sources).
- Full R2 backup + database/media isolated restore drill with RPO/RTO report.
- AI and rewards remain OFF until safe provider quotas and acceptance work is finished.

## Acceptance and release rules
- Run syntax, unit/integration, Pages Functions, notification worker, media worker and browser tests on the exact candidate SHA.
- One concrete acceptance test per pane: render → action → server response → persisted readback → storefront/customer effect, under Owner AND least-privileged staff role.
- Never use real customers or real payment instruments for unapproved destructive tests.
- Keep production deployment bundled to minimize free Cloudflare deployment usage.
- Keep environment secrets and 2FA recovery material out of all browser-editable Settings.
