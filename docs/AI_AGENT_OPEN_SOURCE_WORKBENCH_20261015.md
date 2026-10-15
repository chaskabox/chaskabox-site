# Chaskabox AI workbench — safe open-source hybrid plan (2026-10-15)

## Implemented in this candidate branch
- Retain the eight Chaskabox M01–M05 agents; **no external agent server, model, token, cron or paid binding was installed**.
- Present source-backed activation flags and read-only observations separately. Invalid/failed endpoints remain visibly unknown instead of being counted as successful.
- Search/filter by actual per-agent flags; export only normalized agent/activation/evidence flags, never raw customer/order data, provider tokens or unredacted errors.
- Provide independent open-source references in the owner-only admin view; nothing is connected by clicking a reference.
- No production deploy, branch merge, Supabase migration, data modification or WhatsApp adjustment in this work.

## Reference stack — select, do not combine blindly

| Project | Candidate value | Runtime/cost considerations | Initial decision |
| --- | --- | --- | --- |
| Existing Cloudflare Pages Functions + Supabase M01–M05 | Eight disabled-by-default monitors, owner/MFA access, deterministic SQL summaries, review-only draft decisions | Already used; verify schema and DB permissions before activation | **Keep as source of truth** |
| [Cloudflare Agents](https://github.com/cloudflare/agents) | Stateful tasks, scheduling, MCP and Durable Objects | Workers/Durable Objects usage subject to platform quotas and limits; not necessarily included in the current free build | Research only; do not add binding |
| [Mastra](https://github.com/mastra-ai/mastra) | TypeScript, human-in-the-loop agent workflow patterns | Standalone compute and models can incur costs | Patterns only |
| [OpenMuse](https://github.com/CopilotKit/openmuse) | Resumable work, action receipts, visible approval UI | Multiple hosting services and AI key required for real models | UI/task recovery patterns only |
| [Rakazo](https://github.com/elie222/rakazo) | Persistent named AI teammates and delegation | Requires long-running PostgreSQL/worker/sandbox; out of scope for static Cloudflare Pages | Optional later isolated server |
| [Stagehand](https://github.com/browserbase/stagehand) | AI browser QA against test pages | Browser and model resources required; never reuse admin cookies or production login | Isolated test harness only |

Open-source licensing does not imply zero inference/hosting cost. Avoid importing multiple frameworks just to recreate already-existing agent infrastructure.

## Eight-agent responsibilities and activation controls

1. Orders — read-only pending/stale order aggregates; human controls remain required for order mutation.
2. Inventory — stock/visibility snapshots, alert proposals only; do not auto-archive, alter stock or reorder.
3. Security — GitHub/build/status evidence; do not expose keys, rotate production secrets or bypass MFA.
4. Backups — monitor backup run receipts and checksum evidence, never label a database restorable without an isolated restore drill.
5. Support — summarize public-safe aggregates; no real customer replies without explicit permission and verified delivery receipts.
6. SEO — monitor metadata/indexing signals; no automatic publication to live product pages.
7. Marketing — review-only drafts through existing owner/MFA endpoints; approved does **not** mean published or delivered.
8. Analytics — read-only conversion/revenue summaries; verify source-of-truth reconciliation and timezone.

## Architecture and trust boundary

```text
Staff browser (MFA owner)
  -> Existing Cloudflare Pages Functions /api/admin/agents/{status,preview,insights,marketing}
      -> Supabase service-role RPCs (private server-side)
  -> Read-only UI evidence + explicit owner draft decisions

OPTIONAL FUTURE (not deployed):
  -> Narrow, signed, scope-limited adapter -> isolated test agent worker
      -> public read-only snapshots / disposable test URLs only
  -> owner-reviewed action proposal -> existing authenticated API
```

External agents **must not** receive Supabase service role credentials, browser admin cookies, customer PII, payment details or private environment variables. Every external result is untrusted input; validate schemas and require an audited, server-authorized action.

## Before any activation or production rollout
1. Confirm current Supabase M0–M05 migrations against a disposable database and repair missing grants/RLS; no staging data alteration without owner permission.
2. Confirm both owner MFA paths, RBAC, visible logout, access-grant audit, session revocation, and least-privileged staff denial.
3. Exercise each admin control through save -> API receipt -> persisted readback -> storefront observation, plus mobile keyboard/screen-reader smoke tests.
4. Prove encrypted/rotated staging token, protected main branch/deploy credentials, checkout and backup restore checks.
5. Run syntax/unit/Pages Functions/browser tests and Cloudflare free-plan quota checks on **one final candidate SHA**. Separate source lint from real deployment acceptance.
6. Get explicit owner approval for the single production deploy. Agent schedules and external connectors remain OFF until separately approved.

## UI test acceptance (this branch)
- Signed-out/non-owner requests still denied by the existing protected endpoints; no new public endpoint.
- When status API fails, UI does not infer that eight agents are healthy/disabled.
- Filters and export use only safe normalized attributes on existing rendered cards.
- Read-only refresh is not agent activation and creates no outgoing third-party requests.
- External references are documentation links only, with `noopener noreferrer`.
