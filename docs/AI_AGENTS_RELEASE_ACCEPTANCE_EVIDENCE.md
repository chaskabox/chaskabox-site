# Chaskabox M00–M05 Final Owner Cutover Evidence

> Historical cutover plan, reconciled 20 October 2026. The disabled-agent and deployment holds below describe the earlier milestone, not current production. Current production has eight enabled **observe-only** agents with fresh completed scheduler receipts. See `PRODUCTION_CLOSEOUT_20261020.md` and the coordinated release PR for current deployment/acceptance evidence. Marketing outbound actions remain locked.


Read-only baseline SQL: tools/ai-release-inspect.sql. Production baseline PASSED on Oct 15; staging FAILED with 4 missing tables and 2 missing product SEO columns.

After verified staging migration apply, run tools/ai-release-postcheck.sql: all 8 agents must exist disabled; 7 private tables must have RLS; 8 RPC signatures must be service_role-only. Its output is not authorization for production.

## Mandatory ordered cutover
1. GitHub main protection and immutable reviewed commit.
2. Recent R2 archive checksum + manifest and actual isolated RESTORE acceptance.
3. Staging schema parity, owner MFA live test and zero-send approval test.
4. Production backup immediately before migration window, with restore plan.
5. Apply reviewed M0, M01, M02, M03, M04 SQL files ONLY after explicit approval and a separate staging acceptance.
6. Run postcheck; leave all agents disabled.
7. Perform ONE Cloudflare production Pages build from the reviewed commit; verify deployed SHA.
8. Smoke test owner MFA, AI dashboard, orders/checkout, product/SEO, existing notifications, and health. Roll back Pages if degraded.

Emergency response: stop any new agent execution, leave all agents disabled, roll back Pages deployment, and restore database only if independently verified. Never drop security/audit tables as first mitigation.

## Verified Free-plan reference limits
Cloudflare Pages Free: 500 builds/month, 1 concurrent build. Workers Free: 100,000 requests/day, 10ms CPU. Workers AI Free: 10,000 Neurons/day. Verify current account usage before cutover; no paid upgrade.

## Outstanding
Staging is older and earlier M01 migration apply was blocked by a safety check; no workaround. Owner must enable GitHub main protection. TEST_SETUP_TOKEN encrypted, not independently rotated. Recovery restore & owner AAL2 smoke tests remain. Combined PR #30 is already merged into main, auto-production deployments are OFF, and no new live build is authorized.
