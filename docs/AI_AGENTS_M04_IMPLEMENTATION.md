# M04 — Human-approved marketing drafts, never automated sending

M04 is stacked on M03 (not on live `main`). No auto publication or paid marketing provider.
- Owner with live AAL2 MFA may propose a bounded message from **visible, available-to-order public product data**. The message explicitly says verify price and availability at checkout; no discount/delivery claims.
- Proposals are deduplicated by product/channel and stored in private RLS-enabled `chaskabox_agents.marketing_drafts`. Server-only SQL RPCs validate live owner roles and stamp audit rows atomically.
- Owner may APPROVE or REJECT exactly once while product unchanged; stale drafts cannot be approved. Approval only changes the draft's private review state. There is no send, publish, scheduler, WhatsApp/email provider connection, or external marketing side effect.
- `GET/POST /api/admin/agents/marketing` owner-only; mutations use existing distributed rate limit. Admin UI integration follows M05.
- PGlite tests exercise no client access, owner vs manager roles, duplicate proposals, stale products, audit and no-sends.
- Deployment and Supabase migrations are held until one approved M0-M05 coordinated release.
