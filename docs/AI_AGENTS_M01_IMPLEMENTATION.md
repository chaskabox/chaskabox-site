# ChaskaBox AI Agents — M01 development (NO PRODUCTION ACTIVATION)

Base: M0 PR #24 merged into main. M01 development must remain a draft PR / feature branch until the owner's single M0–M05 release approval.

## Infrastructure delivered for review
- Six **private-schema** Supabase tables: agent_settings, agent_jobs, agent_events, agent_alerts, agent_approvals, agent_run_metrics. Service-role only; RLS on; no frontend grants.
- Eight agent identities: orders, inventory, security, backups, support, seo, marketing, analytics.
- All eight are **disabled by default** and observation-only. M01 cannot enqueue publish, send, payment, refund, or deployment tasks.
- Service-only PostgREST RPCs agent_m01_health() and agent_m01_enqueue(...). Enqueue deduplicates using (agent_key, opaque event key), serializes per-agent quota checks and limits jobs over a rolling 24h period.
- Owner-only MFA-checked read-only /api/admin/agents/status endpoint.
- JS allow-list / PII-aware metadata validation (must be applied before any future worker enqueue), plus offline Postgres PGlite tests.

## Hard limits and release blockers
- NO cron or autonomous agent runner is installed; no existing notifications or customer data are read by M01.
- No production database schema write, no Cloudflare production deployment or admin-panel UI activation.
- Validate staging's database isolation before running SQL in staging.
- GitHub main branch protection, staging TEST_SETUP_TOKEN rotation/encryption, M0 grant migration and fresh isolated backup acceptance remain tracked as final production release security gates. User elected to defer them during non-production development.
- Before final approval: review endpoint permissions and MFA, apply migration in isolated staging, replay enqueue/idempotence with safe fixture data, audit RLS, require recovery acceptance, then create ONE consolidated M0–M05 deployment.

## Follow-up milestones
- M02: order/inventory/security/backup observation collectors with signed inputs, bounded reads, provider health and dedup.
- M03: customer support, SEO and analytics read-only agents.
- M04: marketing drafts + explicit owner approval workflow (no auto publishing).
- M05: full integrated admin control centre, free-tier safeguards, staging end-to-end and owner-approved ONE production release.
