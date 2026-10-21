# Customer account portal

The portal separates overview, orders, profile/security, addresses, wishlist and reviews. Order statuses use customer-facing language. Orders and reviews are paginated; forms retain failed input and show inline feedback. Re-order checks current product visibility/availability and quantity limits before changing the cart. Checkout remains the source of current prices.

In **Admin → Customers → Customer accounts & portal**, owner/manager can search registered accounts, including accounts with no purchases, and open account order history. Owners can edit profile and address details, choose a default address and control portal copy/shortcuts. Order management and review moderation use the existing admin workflows. Sign-in email, credentials and placed-order snapshots are preserved.

Portal display controls do not change customer permissions or delete records. Owner writes require a verified staff session and MFA through the existing middleware. Three new service-only RPCs recheck active staff roles; mutations check revision timestamps and save audit evidence in the same transaction. Customer data keeps its existing own-row RLS.

Apply only the additive `account_portal_admin_controls` migration before releasing the new admin endpoints. It creates no customer records, sends no notifications, changes no existing rows and grants no new browser access. It is included in the canonical schema replay manifest.

## References and application

- [Baymard: Accounts & self-service](https://baymard.com/research-articles/current-state-accounts-selfservice): prioritise order information and clear access to tracking.
- [W3C: Form notifications](https://www.w3.org/WAI/tutorials/forms/notifications/): actionable inline feedback, retained input and announced status messages.
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): retain customer ownership checks and restrict privileged functions to the server.

## Verification

- `npm run check`, `npm test`, `npm run build:functions`
- `node tools/account-portal-browser.mjs`: actual source, disposable stateful fixtures, 320–1440px layouts, accessibility, profile/address persistence, errors/retries, order filtering/pagination, current-availability re-order, wishlist, reviews, account switching and admin/customer readback. No live accounts or providers.
- The complete-schema database tests exercise RLS, owner/MFA enforcement, foreign-address rejection, stale edits, unique defaults and transaction rollback when audit insertion fails.

No live customer accounts are changed for acceptance testing. Auth delivery and customer sign-in still depend on the configured Supabase service and email provider.
