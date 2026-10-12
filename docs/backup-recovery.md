# ChaskaBox backup and recovery

## Current release policy

All remaining fixes accumulate on improve/remaining-batch. This exact branch is excluded from Cloudflare Pages preview builds. Keep it off main until the complete batch is ready; one final merge triggers the production deployment. Local checks and GitHub Actions do not create a Pages deployment.

## Two different exports

| Export | Included | Limits |
|---|---|---|
| Owner catalogue JSON | Products, brands, categories, category assignments, box components, homepage sections, coupons, shipping zones, templates, theme, navigation, current/legacy store settings and media records | No orders/customers/Auth/audit history, secrets or actual photo files. Pages are ordered by primary key and exact counts are checked. Reads are not one database transaction. JSON restore is paused. |
| Scheduled database archive | Accessible database schemas and table data, sequences, functions, triggers, RLS, owners/grants; global roles exported separately without login passwords | Actual Storage files, provider settings and environment secrets require separate recovery arrangements. Archive validation/readback does not prove successful recovery. Managed Supabase internals need a compatible, reviewed restore procedure. |

The catalogue file is version 2 and carries its scope, row counts, primary keys, timestamps and a SHA-256 checksum of its tables. Subset requests include their dependencies and are labelled as subsets. Unknown table names fail. Exports stop without returning a file if a query fails, counts change, pages repeat, keys are missing, or limits are exceeded. Limits: 500 requested rows per page, 25,000 rows per table, 20 MiB output, 40 table requests, 20-second export deadline; use the database archive for larger recovery needs.

## Secure configuration before activation

The last three scheduled runs failed. The latest failed on an empty database connection setting. R2 is currently disabled. Do not enable billing or assume a successful backup exists.

Configure these GitHub Actions secrets securely:

| Name | Purpose |
|---|---|
| SUPABASE_DB_URL | Production direct or session-pooler connection, port 5432, TLS; not transaction pooler 6543. Never put the password in source, chat or reports. |
| R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY | Backup-bucket object read/write only; read access is required for checksum readback. |
| R2_ENDPOINT | Account HTTPS S3 endpoint. |
| R2_BUCKET | Dedicated private backup bucket. |
| CLOUDFLARE_BACKUP_READ_TOKEN | Read-only permission to verify that the backup bucket's r2.dev and custom-domain public access are disabled. No deployment permission is needed. |

The workflow validates configuration and destination privacy before installing the client/exporting. It checks privacy again before uploading. A denied/unknown privacy check aborts. Custom Workers or other systems with bucket access must also be reviewed so they cannot expose these objects.

No secrets or credentials are printed. Plaintext files live only in a restricted runner temporary directory and are cleaned on success/failure. They are never added to Git or GitHub artifacts.

The PostgreSQL client major is 17, matching the inspected production server. Installation uses PostgreSQL's signed Ubuntu Noble repository. The archive preserves grants/owners; dropping these would undermine recovery of access restrictions. The separate roles file omits role login passwords.

Uploads use a unique dated prefix. Every object is downloaded again and checksummed before SUCCESS.json is written in that prefix. Failure leaves no successful marker; incomplete prefixes must not be selected for recovery. There is no blind overwrite of a latest backup and no automatic deletion of older copies.

## Verification and monitoring

1. After secure configuration and the final batch merge, run the workflow manually once.
2. Confirm every step succeeds, readback is verified, and the dated prefix has its success marker.
3. Confirm the next scheduled run also succeeds. Schedule is 21:20 UTC / 02:20 Pakistan time; GitHub may start later.
4. Check the last successful marker and workflow conclusion daily. GitHub's failed workflow/step summary is visible; external alerts have not been configured.
5. Establish a storage/retention budget before activation. The script retains dated copies and performs readback downloads; it does not certify that the storage account will stay within any free allowance.

## Recovery rehearsal

Only restore to a disposable, isolated target. Do not point recovery commands at production.

1. Select a completed prefix and download its files into a private directory.
2. Run verifyDatabaseArchive() from tools/database-backup.mjs. Stop on any missing/corrupt file.
3. Review the archive contents with PostgreSQL 17 pg_restore --list. Prepare compatible extensions and roles on the isolated target. The global roles SQL includes existing platform roles; review it rather than blindly replaying it over an existing managed instance.
4. On a compatible empty target use pg_restore --exit-on-error --single-transaction with the archive. A failed command must roll back the restore. Preserve the required owners/grants; do not silently strip them to make errors disappear.
5. Compare data counts/hashes, bundle/category references, sequences, functions/triggers, RLS/grants, Auth behaviour and application journeys with the source.
6. Recover actual Storage objects separately. Database media URLs/storage metadata do not contain the uploaded PNG/WebP bytes. Provider bindings, secrets and Auth settings also need separate secure recovery records.
7. Record archive identifier, target, checks, elapsed recovery time and any errors. Production recovery is not certified until this production-data rehearsal passes.

The automated native recovery fixture uses actual PostgreSQL 17 servers and clients with generated data. It creates a default custom-format COPY archive and restores it through native pg_restore. It checks complete data, links, sequences, functions, RLS and transactional failure. Supabase extensions, production roles and Storage files still require the separate compatible-target rehearsal. CI requires this test to run; local environments without PostgreSQL server tools or a non-root test user report it as skipped.

## References

- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase portable backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [PostgreSQL Ubuntu installation](https://www.postgresql.org/download/linux/ubuntu/)
- [PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)
- [PostgreSQL pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)
