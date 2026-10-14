# Chaskabox AI Agents — M02 monitoring collectors (not activated)

M02 is a **stacked change based on M01 PR #25**, NOT on Cloudflare production-linked `main`. Keep both PRs unmerged until the single approved M0–M05 release.

## Four read-only monitors
- **Orders**: safe counts of stale new orders (>30 min), pending payment verification, >5-day open fulfilment, and notification failures. No order/customer identifiers or details returned.
- **Inventory**: counts of visible unavailable, sourced-after-order, and unknown stock-state products. Chaskabox currently has no numeric stock ledger; low-stock quantities cannot be honestly inferred.
- **Security**: current main-branch GitHub Actions `secrets` job outcome. Only a completed success counts as a pass; failure is critical and missing/incomplete/unreachable GitHub returns UNKNOWN. This is not a complete code-review/security-audit substitute.
- **Backups**: latest completed scheduled nightly backup must succeed within 36 hours; isolated recovery must have a completed success within seven days. Skipped recovery is not a pass. GitHub status is not independent proof of each R2 object's cryptographic integrity.

## Access and integration
- New `agent_m02_order_signals()` and `agent_m02_inventory_signals()` RPCs use SECURITY INVOKER, with only service-role execution and aggregate output.
- `GET /api/admin/agents/preview` uses existing owner+live MFA wrapper and returns redacted read-only dry-run observations. It never writes agent alerts, enables agents, sends email/WhatsApp, pays/refunds orders, changes inventory, or calls billable AI.
- GitHub API calls use fixed public repository URLs with short timeouts and conservative UNKNOWN outcomes; do not interpret provider text as instructions.
- No scheduler or automatic alert dispatch is enabled; M05 will connect an explicit authorized runner and throttled dedupe after staging acceptance.

## Testing / rollout
- Unit tests cover data minimization, failed/skipped backups, failed secrets scans, quota/outage uncertainty and invalid input.
- Offline PGlite tests cover denied browser execution of snapshots, counts without PII, repeatable migration.
- No Supabase production database migration and no Cloudflare production deployment in M02. M0 branch protection, staging token remediation and restore acceptance are final release gates.
- Verify staging DB isolation, non-production endpoint MFA, real GitHub API availability and full M0–M05 integration before owner-approved single production cutover.
