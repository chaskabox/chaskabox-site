# Content and AI controls — package 6

Candidate only. No model invocation, production migration, indexing or deployment was performed during implementation.

All inference calls live in functions/api/_lib/ai.js. AI_ENABLED must be exactly true AND database ai_enabled must be true. Text, image and embedding switches are independently enforced, including for cached responses. Defaults keep the global switch and image generation off.

A private SQL ledger serializes app budget admission by UTC day. It reserves conservative token/size estimates before a call, then records validated provider token metadata where available. Unknown or failed calls retain reservations. These figures are NOT Cloudflare account-wide measured neurons or guaranteed available free allocation. Check the account dashboard and other consumers before activation; no automatic provider or paid-model fallback exists.

Models are pinned/allowlisted. Embeddings use @cf/qwen/qwen3-embedding-0.6b and must contain 1024 finite values. Public content hashes, model IDs and optimistic timestamps prevent stale index writes/matches. Batches contain at most 12 products; status reports exact current/remaining eligible counts. A complete real production index remains an activation task.

Text results and public embeddings use an actor-scoped, hashed private cache. No raw prompt, IP, phone or address is persisted by the AI ledger/cache. Bounded hourly maintenance removes ledger metadata older than 30 days and expired caches; the existing scheduled maintenance switch remains off until deployment/activation. Browser contexts are allowlisted; customer/order/address objects and private identifiers are rejected. Business insights use full SQL aggregates, with no raw customer/order rows sent to inference.

All advertised brand/analytics tasks now use task + context and return draft + structured + model + budget. SEO/tags/featured IDs/FAQ outputs are schema validated. Invalid results preserve editor values. Product apply requires a true boolean and current preview timestamp. Product update, prior snapshot and audit commit atomically. Undo rejects stale timestamps, already reverted versions and intervening changes to AI-applied fields; tags restore as arrays and only owners can change/revert prices.

Search reads the complete public catalogue up to the documented 10,000-product bound. Roman Urdu/Urdu aliases, budget ranges, category evidence and availability constrain candidates before ranking. Mixed chocolate/candy categories do not qualify gummy products for a chocolate request. Semantic hints only augment relevant eligible catalogue rows; deterministic results remain available with AI disabled/out of budget. Shopping answers validate length, repetition and exact quoted prices. Payment, delivery, allergen and private-order questions use deterministic confirmed/redirect flows. Generated wording still requires factual review.

Image Studio creates decorative drafts via Flux only. Bounded stream/bytes/base64 output is checked for actual raster MIME, structural completeness, size and dimensions. An atomic rolling 10-per-hour image admission limit and checked burst limiter reject further calls. Reference editing and custom wide dimensions are not supported by the selected documented model, so those controls/promises were removed. Generated images cannot be applied to product listings. Real manufacturer/product photos remain required. No Pollinations fallback or prompt URL exists.

The sending path requires an active stored template, with no implicit hardcoded-copy fallback. A newly seeded owner WhatsApp template stays inactive until owner review/enable. Delivery estimate and support placeholders use current public settings and are frozen with the payload. Stored notification templates now have immutable private revisions and version metadata in frozen outbox payloads. Edits validate placeholders and expected timestamps atomically with audit. Unsaved text can be previewed against synthetic values without sending messages. Retries keep the prepared version/body from the outbox.

Primary documentation checked 2026-10-11:
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
- https://developers.cloudflare.com/workers-ai/models/qwen3-embedding-0.6b/

Local fixtures cover atomic apply/undo/audit failure, budget admission/kill switches, index staleness/dimensions, template revisions, constrained search, answer guards, image response formats, shared accounting/cache, complete catalogue paging and actual admin endpoint contracts. Native PostgreSQL concurrency, real provider responses, account quota/configuration and final staged browser acceptance remain explicit release gates.
