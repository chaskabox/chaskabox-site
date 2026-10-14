# M03 — Read-only Support, SEO and Admin Analytics
Stack on M02 PR #26, no production merge until M0-M05 coordinated release.
- Support: all-AI request/failure counts only; NOT an invented support-success rate. Existing Chaska Help already uses safe redirection and deterministic fallback.
- SEO: missing public visible product title, description and image counts; draft suggestions only, no SEO autopublish.
- Analytics: 30d orders, recognized COD-delivered or verified prepaid sales, product views, checkout starts. Order PII and session IDs never leave database.
- Owner MFA protected `GET /api/admin/agents/insights`; service-only Postgres RPC, no agent activation, no model usage, no external sending.
- Test offline synthetic PGlite grants/recognition logic and private-data omission.
- Production migration applies only at consolidated final release with M0+M01+M02 and after staging validation.
