# ChaskaBox M00–M05: production data-readiness and cutover (2026-10-15)

## Verified separation
- **Production Supabase:** `jtvswuvnasqqzrjysgfd`; **Cloudflare production project:** `chaskabox-site` on `main`.
- **Staging Supabase:** `weavjmkajykcnsomunjg`; separate Cloudflare project `chaskabox-staging`.
- Combined code PR #30 already merged to `main` (commit `d36bc6a5d7275c1403af4c0d0fb1313b7ae2cb27`), but production Pages auto-deploy disabled and last verified deployed code `228a03e1065778411411b96d4fcc284e9138da65`.
- Staging `TEST_SETUP_TOKEN` successfully changed to `secret_text`; changing type is **not proof of rotation**.
- On 2026-10-15, production showed the required business tables, but M00–M04 agent migrations had NOT been applied. Staging schema was older.

## Current confirmed staging mismatches
Missing: `public.product_versions`, `public.notification_deliveries`, `public.ai_usage`, `public.funnel_events`, `public.products.seo_title`, `public.products.seo_description`.
The stage baseline is not the same as production and cannot simply be assumed migration-ready. Do not create arbitrary placeholder tables, apply the prod baseline to an existing database, or overwrite staging data.
Relevant historic repository migrations exist (`023_product_seo.sql`, `029_ai_usage.sql`, and later notification pipeline migrations), but compatibility/impact and dependency ordering must be inspected first. Prefer an isolated copy rebuilt from the captured schema on an EMPTY database plus no customer data.
An attempted M01 staging migration was blocked by safety checks; no alternate tool/SQL workaround is authorized.

## Safe validation procedure (NO live mutation)
1. Run `tools/ai-release-inspect.sql` separately against staging and production using the connected, read-only SQL console. Export each one-row JSON object named `ai_release_schema_snapshot` without any customer records.
2. Feed JSON separately to `node tools/ai-release-preflight.mjs --input <file> --target staging` and `--target production`.
3. **Block** schema deployment while any missing table/column is returned. This preflight is baseline compatibility only, never production permission.
4. Confirm staging is truly separate by checking Supabase project ID *and* Cloudflare staging `SUPABASE_URL`/service-role binding. Use a non-production isolated database seeded with synthetic data for migration tests.
5. Confirm all 5 ordered migrations in the EXACT sequence below and verify service-only RPC access, eight agents disabled, admin owner AAL2 MFA, marketing approvals audit with NO send/publish.
6. Perform fresh database/media backup; verify private R2 object SHA256/readback and an actual isolated restore. `skipped` is NOT pass. Capture SHA256 proof and restore result.
7. Enable GitHub `main` protection (currently unprotected); control Cloudflare prod auto-deploy; verify Workers/Pages Free quota before any build.
8. Obtain owner approval for deployment window, database changes and rollback. Apply approved migrations **once** following backup, validate RPCs/RLS, then perform **one manual Pages production build** from reviewed commit only. Confirm custom domain, authenticated admin, checkout and existing notifications with real-world smoke tests. Roll back if degraded.

## Ordered SQL files for approved cutover (all currently in GitHub)
1. `database/migrations/20261014170000_m0_internal_table_grants.sql`
2. `database/migrations/20261014200000_m01_agent_infrastructure.sql`
3. `database/migrations/20261014210000_m02_monitoring_snapshots.sql`
4. `database/migrations/20261014220000_m03_insight_signals.sql` (corrected for confirmed prepaid payment methods)
5. `database/migrations/20261014230000_m04_marketing_draft_approvals.sql`

**No M05 database migration** (UI & acceptance checks only). Do NOT run them from this documentation or merge each milestone PR separately.

## Known remaining gates
- GitHub main protection; requires repo-owner administrative setting outside currently connected GitHub actions.
- True staging schema parity, migrations & owner MFA acceptance; a prior attempt to apply M01 to staging was blocked by safety checks.
- Fresh restore from R2 and checksum verification. Successful nightly backup alone is insufficient.
- Staging setup-token **rotation** (type encryption is done); determine if obsolete and safely revoke instead.
- Owner approval, reviewed backup + rollback plan and authorized single production deployment.

## Strict release invariants
No customer PII in preflight; no production secrets printed. All eight agent settings initially `enabled=false`, runtime observation only. Marketing approvals never send/publish. No unauthorized live DB mutations or scheduled agent activation. Free-plan only; stop before any paid upgrade.
