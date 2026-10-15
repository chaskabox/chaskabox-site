# AI Agents — disposable staging rehearsal plan (no execution)
Date: 15 Oct 2026. **PLAN ONLY; no database/project changes authorized.**

## Tools and model transparency
- Custom AI monitoring workers use deterministic JavaScript rules + Supabase read-only snapshots. **Eight agents are not eight paid LLMs.**
- Existing repo's optional `functions/api/_lib/ai.js` names the Cloudflare Workers AI models: `@cf/meta/llama-3.2-3b-instruct` (text), `@cf/qwen/qwen3-embedding-0.6b` (embeddings), `@cf/black-forest-labs/flux-1-schnell` (decorative draft images).
- These require explicit `AI_ENABLED=true`, per-feature database flags and usage budget reservations. Configured code is not evidence of deployed/working AI inference; provider quota/fees require account-level verification.
- WAHA/WhatsApp integration belongs to MUSE AI and will **not** be modified or invoked by this plan.
- PR #33 stays draft/unmerged and is not a shortcut for agent activation.

## Existing read-only environment facts
- Production has eight agent configuration records, all `enabled=false`, in observe mode; corresponding `agent_m0*` functions are executable by `service_role` only, not anonymous/ordinary authenticated users.
- Existing staging is NOT disposable: four Auth users, 25 public tables and no agent schema; `products.seo_title` and `seo_description` absent, and no schema migrations recorded.
- **Do not wipe or migrate the existing staging project.** It may contain valuable identity/data. Supabase Free can limit active project count; do not assume a third hosted project is free or available.

## Rehearsal options and prerequisites
1. Owner explicitly approves a **new isolated staging environment**, with name and spend cap. Prefer **local Supabase CLI + Docker on a disposable machine/CI** when environment and project migration dependencies support it; otherwise request separate hosted sandbox approval only after project-quota/cost review.
2. Create an empty isolated database/Auth/storage with synthetic accounts, **never a copy of customer/owner secrets, MFA, orders or notifications**. No production service-role key or live WAHA/Resend credentials in the sandbox.
3. Independently snapshot/restore-check the **disposable** environment and separately preserve untouched original staging before any future changes.
4. Inspect and replay schema + required prerequisite migration files in dependency order. Test explicitly: M0 `20261014170000_m0_internal_table_grants.sql`; M01 `20261014200000_m01_agent_infrastructure.sql`; M02 `20261014210000_m02_monitoring_snapshots.sql`; M03 `20261014220000_m03_insight_signals.sql`; M04 `20261014230000_m04_marketing_draft_approvals.sql`. Apply earlier base schema/permissions first; never assume migration count is identical to production.
5. Run `tools/ai-agents-release-gate.mjs`, `tools/ai-release-preflight.mjs`, `tools/ai-release-inspect.sql`, and `tools/ai-release-postcheck.sql` against **sandbox-only** endpoints with redacted fixtures; verify RLS/function `EXECUTE` grants (anon, authenticated denied; service role allowed).
6. Validate eight agents one-by-one for snapshots, stale/unavailable data, rate limits, idempotency, retries, error handling, owner-only MFA endpoints and restricted model budgets. Keep `enabled=false`, no sends/publishing/fulfilment/payments.
7. Before scheduling observation-only work, document actual Cloudflare Free requests/CPU limits and Supabase plan usage, per-agent cadence, alert deduplication, data retention and rollback. Do not create paid subscriptions automatically.
8. Owner signs off individual S4 tests; separate permission required for **any** real messages, automated publication or external side effects. This phase creates a checklist/evidence, not eight autonomous live services.

## Stop conditions
- Any action targets the original staging project or production; fails to isolate secrets; proposes external WAHA messages; triggers bills without budget approval; cannot prove rollback; no green GitHub quality/security checks; or agent state unexpectedly becomes enabled.

## Single-release policy
Keep combined code on draft PR #40; PR #33 and WhatsApp untouched. After owner approves separately tested changes, confirm exact `main` SHA and one approved Cloudflare deployment. Never claim real owner/provider acceptance from synthetic tests.

## Verified current Cloudflare Workers AI plan limits (documentation checked 2026-10-15)
- Official pricing docs: https://developers.cloudflare.com/workers-ai/platform/pricing/ — Workers Free includes **10,000 neurons/day** shared across models, reset at 00:00 UTC; beyond the allocation on Free inference fails until reset/upgrade.
- ChaskaBox's current application-level cap in `functions/api/_lib/ai.js` is **8,000 neurons/day** (plus per-feature and actor rate-limits), protecting against the Workers Free allowance, assuming the estimate covers actual model billing. It is not proof of available capacity.
- Workers AI model availability and costs must be checked in this Cloudflare account before enabling, and no plan upgrade is authorized.
- Supabase CLI docs: https://supabase.com/docs/guides/local-development/cli/getting-started; local disposable DB with fake users is favored over creating any additional hosted project.
- New in-memory PGlite integrated test `tests/ai-combined-isolated-migrations.test.mjs` replays M00–M04, checks 8 disabled agents and 8 service-only RPC grants. This is a synthetic isolated rehearsal, **not** hosted staging parity or live acceptance.
