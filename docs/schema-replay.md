# Application schema and isolated replay

Item 4 captures application DDL, not production data or a disaster recovery
backup. `database/schema-manifest.json` records the capture, baseline checksum,
managed migration versions observed and the explicit replay order.

The baseline has 34 public tables, 36 public functions, 4 security-invoker views,
59 policies and 18 sequences. Functions absent from the legacy SQL are included.
It contains no customer/order/staff rows, sequence current values, secrets, Auth
user/session records or media bytes. PostgreSQL 17 with pgvector is required.
Supabase-managed auth/storage infrastructure is not recreated by this baseline.

## Which files to apply

For a new isolated database, replay the captured baseline and the manifest's
listed final-batch migrations, in order. Do not replay all `001..039`, combined
and split historical SQL on top: they overlap and can restore old grants or
function contracts. Existing historical files are retained as references.

The baseline rejects a nonempty public schema. It is never a production upgrade
migration. An existing production database receives only reviewed, outstanding
incremental migrations during the coordinated final release after a verified
backup. No migration-history repair or remote schema write was done in item 4.
Managed history versions differ from repository timestamps; the manifest maps
related scopes without falsely asserting byte identity or rewriting that history.

`node tools/schema-replay.mjs` verifies the checksum and prints the plan. Its
`--apply` mode uses `SCHEMA_TEST_DATABASE_URL` and permits loopback hosts only.
It loads the synthetic test platform contract, then the plan. Use only an empty,
disposable local PostgreSQL database. A failed stage reports failure; recreate
that disposable database before retrying. Never put production credentials in it.

The platform fixture models only the auth objects these functions depend on.
It does not reproduce Supabase Auth, Storage, email, payment or Cloudflare.
CI also starts disposable native PostgreSQL 17 and executes the same baseline
and incremental migrations. Native tests are mandatory in CI, not silent skips.

## Permissions and remaining advisor findings

Item 4 gives the three previously mutable trigger functions fixed search paths,
revokes browser execution from internal trigger functions, removes browser view
writes, and preserves public filtered reads and service-only mutation boundaries.
Category assignment product references are enforced and existing rows validated;
if an orphan appears before release, the migration fails without deleting rows.

Role lookup helpers and confirmed-email guest-order linking intentionally retain
their narrow authenticated SECURITY DEFINER contracts because of RLS/private auth
lookups. They should not be blanket-revoked just to remove an advisor warning.
Private operational tables with RLS and no browser policies intentionally deny
browser access; service access is explicit. The leaked-password-protection advisor
finding is an Auth configuration issue; no plan or setting was changed here.

Current code/schema fixtures are isolated and reproducible. A managed staging
site with real Auth/browser/provider integration still requires final acceptance.
Environment-specific inventory and access status belong in a private checklist.

## Final release prerequisites

Complete the numbered batch and backup/recovery prerequisites. Review the
outstanding migration order and grants. Apply item 3, then item 4; publish Pages
once with the matching API code. Keep notification dispatch disabled until its
separate acceptance checks pass. Re-run Supabase advisors and role/action checks
after release. Baseline tests are not evidence that production migrations ran.

References: [Supabase database functions](https://supabase.com/docs/guides/database/functions),
[Data API access](https://supabase.com/docs/guides/api/securing-your-api),
[PostgreSQL 17.11 changes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
