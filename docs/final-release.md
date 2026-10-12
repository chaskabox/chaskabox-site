# Coordinated production release

Release combines the numbered improvement batch, crawlable SEO routes and the
backup incident corrections. The final acceptance changes were recovered from
the retained report and re-tested; the earlier local commit is not available.
The merged backup incident branch retains the stricter private-destination and
checksum-readback workflow from the improvement batch.

## Release order

1. Check the exact final commit: syntax, photo manifest, full unit/SQL suite,
   three mandatory native PostgreSQL recovery/concurrency/replay checks,
   48 browser layouts with synthetic API/Auth data, and secret scans.
2. Persist the source on the preview-excluded improvement branch. Require the
   complete CI run for that SHA, including browser and history scans.
3. Check production schema drift and outstanding managed migration history.
   Preserve and verify a private pre-upgrade backup before any database write.
   An application-only checkpoint must state its limited scope and must not be
   presented as the scheduled full database/R2 disaster-recovery archive.
4. Apply only the six outstanding incremental migrations, in manifest order.
   Never replay the nonempty-schema-rejecting baseline over production.
5. Publish the private media companion and bind Pages to it with transforms
   disabled. Preserve existing secret bindings. Notification dispatch, AI,
   media upload and analytics retention stay off until their external-service
   acceptance and account allowance prerequisites are satisfied.
6. Move the checked release to main once, causing one production Pages build.
   Verify the resulting deployment SHA, real page/API responses, crawlable
   SEO metadata/schema, stock/photo guards, and unauthenticated admin denial.

## Limits that remain visible

Browser acceptance uses synthetic data and mocked Auth; it does not certify
managed reset email, actual bank QR scanning, remote Storage convergence or
notification provider delivery. Owner MFA enrollment and supplier approval
cannot be fabricated. Fourteen missing photos and the mismatched product 186
photo remain visibly withheld. Rewards stay unavailable. R2 configuration and
fresh full backup verification are separate from a successful Pages release.

Google Search Console ownership/indexing and real-user Core Web Vitals are
external results. Technical SEO and live validation do not guarantee search
position or immediate indexing. Failed or unavailable checks must be reported
with evidence rather than described as complete.
