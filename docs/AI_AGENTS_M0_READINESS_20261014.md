# AI Agents M0 — security and integration readiness (2026-10-14)

## Verified baseline (read-only)
- GitHub `main` at `28fcc7a7ed207ef9397f396cd99c038dbc0e0134`; default branch reported **not protected**. Configure protected branch/ruleset and require passing `verify`, `browser`, `secrets` checks before merge.
- Supabase project active and healthy. Five internal tables (`api_rate_limits`, `customer_notification_outbox`, `notification_outbox`, `order_status_events`, `product_versions`) have RLS and zero public policies. Some retained redundant client SQL grants, which this PR removes. Apply migration only after PR verification and a reviewed deployment gate.
- `is_owner`, `is_staff`, `staff_role`, and `link_guest_orders` are intentionally callable `SECURITY DEFINER` functions. The first three support staff RLS checks and the last links orders through verified account emails. Do **not** blanket-revoke them without replacing callers and testing RLS/customer-account behavior.
- Supabase leaked-password protection is disabled (Advisor WARN). Check plan availability; if available, enable via Auth settings; keep owner MFA mandatory.
- Cloudflare Pages production and staging have AI bindings configured. Staging configuration contains a `TEST_SETUP_TOKEN` marked `plain_text`. Migrate this to a secret-type variable, rotate the token after confirming its use, and remove when unneeded. **Never copy its value into logs, PRs, or AI tools.** Production has no matching variable.
- Production and staging currently use different `SUPABASE_URL` variables (compared for equality only). Confirm staging cannot write to live data. Do not execute acceptance tests against production without a signed-off isolation check.
- R2 bucket `chaskabox-db-backups` exists. Scheduled nightly workflow on Oct 13 completed successfully; isolated recovery GitHub workflow has successful runs on Oct 14, but live object retention/checksum and actual recoverability need independent verification before certifying backups.

## Scope of this PR
- Non-deployed SQL migration to remove redundant direct client grants from five internal-only tables, preserving `service_role` access and existing RLS.
- Offline PGlite regression test checks least-privilege grants and repeatable migration.
- No deployment, no Supabase writes, no token value reads, no owner-role/MFA changes.

## Rollout gate
1. CI `verify`, `browser`, `secrets` pass.
2. Confirm all five tables are server-only; search client/RPC direct uses and test staging notifications, order transitions, audit and product version rollback.
3. Owner approves migration; apply only through standard reviewed deployment process with rollback/grant diff documented.
4. Re-run Supabase Advisors, live user-role denial tests and notification acceptance tests.
5. Independent backup/object metadata and isolated restore checks pass.
6. Document outcomes and sign off on M1.

## Operational follow-ups
- Configure branch protection/rulesets (outside this PR).
- Migrate and rotate staging `TEST_SETUP_TOKEN` (outside GitHub; perform in Cloudflare console/secure API).
- Implement independent backup heartbeat monitoring, not just a success check on a workflow.
- Validate Workers AI limits and service binding on both environments without sending PII.
