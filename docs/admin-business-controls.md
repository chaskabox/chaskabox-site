# Admin and business controls

Changes are queued for the final release. Apply the canonical schema manifest
in order in an isolated database before using the final production migration
plan. Do not replay legacy SQL files.

## Storefront

The public manifest returns public settings, published homepage configuration,
visible categories with eligible product IDs, persistent navigation rows and
supported theme tokens. Draft configuration and staff/customer data are omitted.
Hidden sections stay hidden and explicitly empty curated lists remain empty.

Manual category assignments override legacy text membership after an explicit
assignment save, including an empty selection. Rule membership supports a
single tag or category. Hidden and empty categories respect their CMS flags.
New category routes use /shop/?category=<slug>.

Saved draft previews use the same storefront renderer in a same-origin iframe.
They do not publish or write. Heading/visibility changes are immediate; only
draft configuration waits for explicit publish.

Navigation defaults are seeded once as editable persistent rows. Empty or
disabled menus do not restore generated defaults. Theme values have fixed
supported keys, font choices, safe image URLs and contrast checks. Reset restores
default tokens. Public configuration caches for 30 seconds.

## Commerce

Atomic box save locks the live role, box and components; saves product,
composition and audit together; requires expected_updated_at when editing.
Content staff save drafts; owner/manager publish. Curated boxes require
eligible components. Existing component-free multipacks remain multipacks.

Quote and order use the same database pricing. Coupon validity, minimum amount
and use cap are checked under lock; usage is consumed only in the successful
order transaction. Idempotent replay does not consume another use. Prices
always come from the catalogue.

Exact city zones win over the configured all-city zone, ordered by position
then ID. Without a matching active zone, existing Pakistan-wide default fees
apply. COD is never free. Prepaid free thresholds use merchandise subtotal after
coupon discount. Countries outside Pakistan are rejected. No new commercial
discounts or destinations were invented.

## Records and reports

Directory identities use account IDs or normalized guest email, with a legacy
phone fallback only for email-less records. This does not claim guest ownership.
Directory/detail totals use SQL; order history is paginated. Account linking
updates the directory reference.

Exports fetch counted 500-row pages up to 5,000 matching records. More records
require a narrower date range; missing pages/count changes fail instead of
returning partial success. A creation cutoff excludes later orders; export is
not a frozen database backup. CSV formulas remain text escaped. Real spreadsheet
import remains an acceptance check.

Review averages/counts cover all approved rows. Verified purchase requires a
delivered, nonrefunded order containing the product and linked to the account.
Moderation/replies and their audit share the CMS transaction.

Reporting dates use Asia/Karachi. Recognized order revenue excludes refunded COD;
gross order value includes noncancelled placed orders. Category/brand counts use
distinct orders. Merchandise reports exclude delivery; gross merchandise does
not subtract coupons. Search clicks are separate from searches. Funnel order
counts come from committed orders. Database failures surface as errors.

Anonymous events have bounded schemas, distributed limits and duplicate
suppression. Clients cannot emit authoritative order-created counts. Common
email/phone patterns are redacted. Hourly retention deletes at most 1,000 expired
records per event table (30-day events; one-day expired rate buckets).
The schedule requires ANALYTICS_RETENTION_ENABLED, initially false. Activation
and proof of a successful run are final release gates.
