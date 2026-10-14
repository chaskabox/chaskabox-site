# ChaskaBox AI Agents — M01 foundation (Part A)

Status: DEVELOPMENT ONLY. This change does not complete M01 or enable an agent.

## Added
- Server-only queue client contracts for enqueue, claim and finish.
- Public-reference-only payload fields: product_id, locale, context_hash and period_days.
- Opaque result references/status codes; no raw model responses in job metadata.
- Deterministic SHA-256 idempotency hash helper.
- AGENTS_ENABLED must be explicitly true. It is not set in this change.
- Node contract tests; no new dependencies or paid services.

## Not yet implemented
- Private Supabase agent queue schema and service-role-only RPCs.
- Isolated database migration rehearsal, atomic lease/retry tests, worker and admin control UI.
- Individual agent handlers, schedules, observability and production acceptance.

The client methods reference future RPCs but no HTTP endpoint, worker or cron calls them yet. Never turn on AGENTS_ENABLED until the queue migration and authorization tests are complete.

## Release rule
M0–M05 application release is ONE owner-approved Cloudflare production cutover. Keep this PR unmerged and do not apply migrations to the live database. Before final cutover: protect main, harden staging TEST_SETUP_TOKEN, verify isolated backup restore and review M0 grant migration.
