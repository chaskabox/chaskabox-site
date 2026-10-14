# ChaskaBox backup and recovery

Nightly backup is active at 21:20 UTC / 02:20 Pakistan time. The database-only archive was restored successfully on 14 October 2026 in run [38515516110](https://github.com/chaskabox/chaskabox-site/actions/runs/38515516110). R2 is configured privately; the older statement that R2 was disabled is obsolete.

## Exports and scope

The owner catalogue JSON is a paginated configuration export, not a complete database or media backup. It excludes customer/order/Auth data and actual photo bytes. JSON restore stays disabled; do not replay a partial configuration over production.

The nightly version-2 archive contains:

- PostgreSQL 17 custom-format database dump: accessible schema/data, sequences, functions, triggers, RLS, owners and grants.
- Global roles exported without role login passwords.
- Actual bytes for every current public Supabase Storage object and every image committed under images/.
- Media inventory, logical object paths, byte lengths and SHA-256 hashes, plus checksums for every archive file.

The Storage inventory is checked before the database dump and after all downloads. A change, missing object, size mismatch, unexpected archive path, corrupt byte, or private object without a dedicated backup credential fails visibly. A future private bucket must be integrated explicitly; it must never be silently omitted. Database and Storage reads span separate systems and are not one atomic snapshot. Provider settings, environment secrets, OAuth configuration and role login passwords remain outside the archive.

## Secure operation

Existing GitHub Actions secrets: SUPABASE_DB_URL (production direct/session connection, TLS, port 5432), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET, CLOUDFLARE_BACKUP_READ_TOKEN. No credentials belong in source or reports. No new paid service or public backup endpoint is required.

Destination privacy is checked before export and upload: r2.dev and custom-domain public access must both be disabled. Every archive file is uploaded to a unique dated private prefix, downloaded and checked again. Media bytes are extracted and checked as part of readback. SUCCESS.json is written only after these checks. Incomplete prefixes have no success marker and cannot be selected for recovery. Files are never exposed through GitHub artifacts. Private runner files and containers are cleaned on success or failure.

Version-1 database-only archives remain readable but cannot certify media recovery. Dated archives are retained without overwriting or automatic deletion; monitor storage use and agree a retention budget before making a deletion policy. Existing free allowance is not a guarantee of future unlimited storage.

## Isolated recovery

The recovery workflow permits manual execution or the exact trusted same-repository closeout branch. It first creates and reads back a fresh archive, then restores it into a disposable official Supabase PostgreSQL 17 container with network none and no published ports. Owners/grants are preserved. It checks product counts, references, RLS/policies, sequences and restored Storage metadata against the actual recovered media inventory.

The official GoTrue Auth service and a synthetic acceptance client share only that offline container network. The runtime uses fresh disposable role/JWT secrets, never production provider keys. One synthetic example.invalid user is created in the restored clone to exercise password login, token refresh, user lookup, logout and refresh-token revocation. Recovered user/identity/MFA/admin-role counts are recorded without exposing personal records. No production writes, emails or external OAuth requests occur. This verifies isolated Auth runtime recovery; it does not certify restored live SMTP/OAuth providers or a real owner's MFA sign-in.

A production disaster recovery procedure still requires secure restoration of provider configuration/secrets, review of managed Supabase internals, and actual authorized staff acceptance. Never point the disposable restore commands at production.

## Monitoring

Check the latest workflow conclusion and dated success marker daily, and after configuration changes. GitHub may delay scheduled jobs. Failed steps are visible in the run and step summary; separate external failure alerts are not configured. Readback verifies stored integrity, while the separate isolated drill verifies restoration. Neither should be mislabeled as real customer or staff acceptance.

## Primary references

- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase Storage downloads](https://supabase.com/docs/guides/storage/serving/downloads)
- [Official Supabase Auth container configuration](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)
- [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)
- [PostgreSQL 17 pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)
