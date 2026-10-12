# Admin MFA and recovery

Every admin mutation, order CSV export and catalogue backup download requires
an Auth-verified AAL2 access token and a still-existing, matching auth session
with a still-verified factor. Role membership is fetched fresh per request; CMS
transactions also lock and recheck it. Revoked staff cannot use a cached role.
Read-only `/api/admin/me` and Security remain reachable at AAL1 so every staff
role can enroll or verify an authenticator without changing production access.

Use Security to enroll and verify the primary authenticator, then verify a
second authenticator on a separate device. Choose the appropriate factor when
verifying a new session. The UI prevents removing the last verified factor;
Supabase's own factor API remains authoritative, so this UI guard is not a
platform-wide last-factor policy. Backend protected actions still deny a missing
or invalid factor/session. Secret QR contents must not be logged or shared.

Owners must perform enrollment on their own devices. Verify each active owner
and independent recovery access before enabling the final production release.
Deployment-specific account coverage belongs in the private release checklist,
not public source documentation.

## Lost device

Use the independently verified backup factor first. If all factors are lost,
contact another active owner through an established channel. Verify identity
outside this application and revoke the affected staff access if compromise is
suspected. A project administrator may then follow Supabase's documented admin
factor-management procedure, record the recovery decision, and require fresh
enrollment before reactivating staff. No public recovery bypass or MFA reset
endpoint is added. Resetting the password alone does not bypass MFA.

Owner staff controls can change role/active state. Database transactions protect
the last active owner and audit changes. Invitations have two separate external
steps: Auth may send the invitation before the staff/audit transaction finishes.
An assignment failure must be reviewed; it cannot retract an already sent email.
No real invitation was sent during testing.

## CMS audit behavior

Products, categories/assignments, brands, navigation, homepage draft/publish,
settings, theme and transactional template edits use one private, allowlisted
CMS RPC. Batch operations and audit rows commit together; invalid later rows or
audit failure roll back earlier writes. Request bytes and batch sizes are bounded.
Product edits use an expected version to reject stale saves. If a product-version
table exists, its update snapshot is inserted in the same transaction; this item
does not create the absent production version table or implement AI undo.

Other external/legacy actions using the shared audit helper now report an audit
failure rather than silently claim success. A file/provider side effect may have
already occurred; inspect its current state before retrying. Box-builder atomic
component changes and AI apply/undo remain in their subsequent numbered items.

References: [Auth sessions and post-sign-out validation](https://supabase.com/docs/guides/auth/sessions),
[TOTP MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp),
[Auth admin factor API](https://supabase.com/docs/reference/javascript/auth-admin-deletefactor).
