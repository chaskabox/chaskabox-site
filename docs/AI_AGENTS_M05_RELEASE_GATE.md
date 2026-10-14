# M05 — Admin AI Agent Control Centre and consolidated release gate

Stacked on M04 PR #28, M03 #27, M02 #26, M01 #25. Source includes all preceding milestones.
- New owner-only `AI Agents` tab in existing admin. Uses verified `window.chaskaAdminApi` bearer auth; existing MFA and server owner guard are mandatory. Renders provider output only through `textContent`, not injected HTML. No browser service-role secrets.
- Shows 8 agent enabled flags (all initially disabled), outstanding jobs/approvals, deterministic M02/M03 read-only observations. Manual review-only marketing proposal and approval/rejection; **no auto-publish, WhatsApp/email sending, paid AI calls or payment changes**.
- `node tools/ai-agents-release-gate.mjs` validates source wiring. `--production` always returns blocked pending independently verified release gates.
- `tests/m05-consolidated-safety.test.mjs` replays all five migrations into an isolated synthetic PGlite database and asserts deny-by-default state and role permissions.
- The owner requested one Cloudflare production build after M0-M05 all pass. Do not merge to main or deploy until (a) staging isolated DB acceptance, (b) real owner MFA smoke checks, (c) fresh R2 restore and checksum proof, (d) GitHub main protection and preview/production deploy controls, (e) staging TEST_SETUP_TOKEN encrypted/rotated, (f) verified migration dry-run, (g) no extra paid Cloudflare products, (h) owner final approval.
- Expected remaining work after M05 PR CI green: live staging acceptance and rollout operator cutover. CI previews are NOT production deployment. Agents stay disabled until separate activation approval.
