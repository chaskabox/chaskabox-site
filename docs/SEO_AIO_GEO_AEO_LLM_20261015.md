# ChaskaBox SEO / AIO / GEO / AEO / LLM activation — 2026-10-15

## Source changes in this branch (NOT deployed)
- Add `/faq/` to the canonical static sitemap. FAQ answers already have their own public page, but it was omitted from the static XML index.
- Add optional `/llms.txt` official-source directory. Do not claim it improves Google rankings; Google says this file is not required for AI Search.
- Repair semantic-only product discovery: previously vector-backed products were still filtered out unless exact lexical words matched. Semantic similarity must never bypass visibility, stock or price constraints.
- Add automatic regression checks for discovery routes and safe semantic eligibility.

## Live account checks completed (read-only, 2026-10-15)
- Cloudflare Pages production `chaskabox-site`, branch `main`; Workers AI binding **AI** exists under `deployment_configs.production.ai_bindings`.
- Cloudflare Pages production runtime variables list does **not** contain `AI_ENABLED`. The AI library requires `AI_ENABLED === 'true'`; this alone blocks model inference.
- Supabase production `public.site_settings.ai_enabled` is **false**; public assistant and semantic search flags are true, but the central database admission gate is OFF.
- The `ai_budget_state()` result has `enabled: false`, text/embedding features true, image feature false, zero accounted requests today.
- `ai_index_status('@cf/qwen/qwen3-embedding-0.6b')` reported 0 current / 105 eligible visible public products; complete semantic search is **not** live.
- Production code deployment at main `91a56145f0a195c43d5f7045a6b8e45d240bef32` reported successful. This branch is additional proposed work.

## Controlled one-deploy production activation (not performed)
1. Merge this branch alongside other approved release changes **only after** CI, independent recovery test, owner MFA + protected admin checks, and final combined release review. Do not deploy individual milestones.
2. Isolate a staging environment with compatible schema and *no production customer data*. The existing staging environment is behind production schema; do not bypass the staging gate. Use the exact same Cloudflare Workers AI model and budget admission policy for tests.
3. Confirm Workers AI quota/billing terms on the owner account. Define a bounded per-day allowance and expected requests. No automatic paid-model fallback.
4. Configure Cloudflare Pages server-side production environment variable `AI_ENABLED=true` for the final single deployment; leave the existing `AI` binding in place. Never expose credentials or inference settings in public JavaScript.
5. Confirm migrations and production settings before making any DB writes. Activate `site_settings.ai_enabled` with an audited, reversible owner action only when all gates pass.
6. In authenticated Admin > AI, use the existing /api/admin/ai-status endpoint to confirm binding + budget enabled. Run one synthetic non-PII question to /api/ai/assistant, require `mode: workers_ai` and valid anchored product names/prices. A `deterministic_fallback` response is **not** proof of LLM functionality.
7. Populate remaining semantic index using bounded admin /api/admin/ai-reindex batches with safe rate limits; stop on budget exhaustion. Repeat /api/admin/ai-status until remaining=0, rechecking staleness when products change.
8. Verify search matches queries with no lexical match, filters only public in-stock matches under budget, rejects personal identifiers, and validates responses; verify login, checkout and payment paths still work with AI disabled.
9. Recheck live sitemap, product canonicals and offer prices; use Search Console and Bing Webmaster Tools for indexing/AI citation reports, and Google Merchant Center data where appropriate. Search visibility is not guaranteed by schema, `llms.txt`, or IndexNow.
10. Restore `site_settings.ai_enabled=false` or remove `AI_ENABLED` upon quota trouble, wrong recommendations or customer-impact regressions. Do not automate public content publishing or any payment/security action.

## Measurement
Track indexed canonical products, Product/Offer structured data validity, crawl and CWV performance, AI citation references (where available), rate-limit responses, safe fallback ratio, model-backed replies and index freshness. Review against source metrics, never marketing claims of guaranteed rankings.
