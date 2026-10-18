# Pages, AI and remaining acceptance

The Pages & Text panel adds public page copy and metadata controls for informational pages, policies, guides, shopping templates and occasions. Navigation/contact/commerce facts stay in their existing editors; hero slides stay in Homepage Builder. Registry text is plain text, not arbitrary HTML. Product names, prices and pack facts stay in Products.

Draft saves are private. Publishing and restoring require a manager/owner with live MFA; all mutations recheck the active database role, compare the expected revision and commit audit/version history atomically. Page content and SEO are rewritten in the first server HTML response, then retained across client navigation. Catalogue pages keep their existing Product/collection schemas and canonicals. Utility pages keep noindex.

AI Center now selects a saved product for product drafts, reads current budget/index/feature evidence, exposes owner feature controls and includes a protected real-provider connection check. Support drafts get allowlisted current delivery/COD facts. Generated content requires review before application/publication. Image Studio event wiring initializes once per session. Monitoring-agent autonomy, notification dispatch, card activation and payment decisions are separate controls.

The existing approved three-banner release is preserved. Seven CSS inputs are minified in their original cascade order into one checked bundle. Hero font discovery is earlier; hidden collage images have low priority. A post-deployment mobile lab run is required before claiming a new LCP value.

`/faq/` has a dedicated server-rendered page with current commerce settings and the published homepage FAQ list. The former copied SPA shell is removed. SSR/API responses receive security headers and all Pages preview hostnames receive noindex.

Validation includes isolated PostgreSQL/PGlite transaction/RLS tests, actual workerd HTMLRewriter escaping/metadata tests and CI browser acceptance for draft → preview → publish → restore and AI context selection. Synthetic acceptance is not a real owner login, bank receipt, customer delivery or managed staging acceptance.

Deploy the additive `20261018100000_page_copy_controls.sql` migration with matching code after required checks. No customer/order/price rows are changed by that migration. The private CMS schema has no browser grants or policies; RPC execution is service-role only.

External acceptance still needs evidence: the owner's browser MFA session; a real approved payment/delivery scenario; access to the separate staging Supabase project. Google decides indexing: URL Inspection and accepted sitemaps do not guarantee index inclusion. Leaked-password protection is a Supabase Pro feature; the connected production organization is Free and is not upgraded by this release.
