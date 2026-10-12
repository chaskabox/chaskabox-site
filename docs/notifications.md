# Transactional notifications — final batch release

Item 3 prepares a single private `notification_deliveries` ledger and one scheduled
Worker. This document is a release procedure, not evidence of a live deployment.
The checked-in Worker and database dispatch switches both start disabled.

## Producer and queue contract

- The order transaction enqueues owner email, owner WhatsApp and customer
  acknowledgement jobs. Timeline updates enqueue one customer job per event ID.
- Checkout and admin status/payment handlers perform no provider sends. A no-op
  status change creates no new event. Recurring statuses have different event IDs.
- Notification enqueue failure rolls back the order/status transaction. Credentials,
  provider outages and disabled templates never prevent the database transaction;
  those failures are handled later by the consumer.
- Customer jobs for one order cannot overtake an earlier pending, processing,
  retrying, blocked or uncertain customer job after the activation cutoff.
  This orders provider requests; it does not guarantee device arrival order.
- `notification_outbox` and `customer_notification_outbox` are retained read-only
  for historical review. The new consumer never selects, resets or copies them.
- Jobs before `activated_after` are excluded. Events older than 24 hours are
  blocked for review, not silently sent after a long outage.

## Claims, requests and provider outcomes

Claims use `FOR UPDATE SKIP LOCKED`, a random lease token, and a two-minute lease.
Prepare/begin/finish require the current unexpired token. Begin can run only once
per claim and persists the exact request before provider I/O. Every actual request
increments the attempt count, up to six; delay uses exponential backoff and respects
`Retry-After` up to the event's 24-hour lifetime.

Resend uses the existing `chaskabox-owner-order-<order UUID>` key, an immutable
payload, and a retry window below 23 hours from the first attempt. Resend documents
a 24-hour key lifetime; an old or exhausted ambiguous request is parked uncertain.
Definite validation/authentication errors are dead; 429 and transient errors retry.
Payload-conflict 409 is dead; concurrent-request 409 retries.

WAHA sends are serialized through the ledger. A timeout, missing acknowledgement,
5xx or expired post-send lease is uncertain and is not automatically resent. A
definite 429 can retry. A pre-send expired lease can be reclaimed. We do not assume
WAHA has an idempotency facility for `sendText`.

Only a successful response containing a provider message ID becomes `accepted`.
Order `email_sent`/`whatsapp_sent` fields are compatibility acceptance flags; each
channel updates only its own fields and never writes another channel's flag false.
They do not prove recipient delivery.

## Delivery receipts and truthful health

Worker endpoints:

| Endpoint | Access / behavior |
| --- | --- |
| `POST /run` | `OUTBOX_RUN_SECRET` bearer token; bounded run; paused returns 503 |
| `GET /health` | Same token; 503 for paused, invalid config/cutoff, stale heartbeat, backlog or review-required jobs |
| `POST /webhooks/resend` | Verify raw body using Svix HMAC SHA-256 and a five-minute signing timestamp tolerance |
| `POST /webhooks/waha` | Verify raw body using WAHA HMAC SHA-512; only the configured session's outgoing `message.ack` is handled |

Resend `email.delivered`, `email.bounced`, `email.failed`, and `email.complained` are
recorded separately. WAHA SERVER/PENDING is not recipient delivery; DEVICE/READ/
PLAYED is confirmed delivery, and ERROR is failure. A replayed ERROR cannot undo
a WhatsApp delivered status. Verified event keys deduplicate receipts. Receipts
arriving before an acknowledgement is saved are retained and reconciled after
the send and on subsequent consumer ticks, including the send/save race window.

Accepted, confirmed delivered, failure receipts, complaints and unconfirmed counts
come from exact database aggregates. Receipt counts can overlap: an email delivered
and then complained about retains both facts. Only current failed/complained
receipt status requires review. A provider send result alone does not add a delivery
confirmation. WAHA event bodies lacking an event timestamp use receipt arrival time.

The admin Notifications and system Health views display consumer heartbeat and
configuration recorded by the Worker. They do not treat Pages credentials or a
successful database query as provider availability. Failed queue reads are errors,
not zero counts or a congratulatory healthy state. No provider availability probes
or real test notifications are performed by these screens.

Four jobs per tick, a 45-second loop budget, 10-second database timeouts, 15-second
provider timeouts and bounded response bodies keep requests finite. Scheduled
promises use `ctx.waitUntil`. The cron is every minute. Logs contain run counts and
generic failure codes, not customer contents, phone numbers or credentials.

## Templates and retry controls

Stored transactional templates are used by the consumer. Inactive templates,
unknown placeholders, empty bodies or wrong channels block a job visibly. The
first prepared request is frozen, so editing a template/order cannot change a
Resend retry payload. The original seeded acknowledgement's false confirmation
wording is corrected only when it exactly matches the old seed; custom copy is
preserved. Default copy acknowledges receipt, not payment verification.

The order retry button atomically audits and queues only eligible unsent blocked/
retry jobs. It does not reset accepted, processing, uncertain, dead, expired or
historical work, clear attempt limits, or send directly. It reports zero when no
safe retry exists. Unknown outcomes and expired jobs require an operator to review
provider history and decide whether to close the event or prepare a new explicit
notification; there is deliberately no bulk historical replay button.

Marketing/abandoned-cart, loyalty/birthday/referral, browser push and customer
email campaigns are not dispatched by this consumer.

## Configuration and final release order

Config: `cloudflare/wrangler.notification-outbox.jsonc`. Do not deploy this Worker
or merge the batch to `main` during numbered fixes. Keep all source changes on
`improve/remaining-batch`, the excluded Pages preview branch.

Private Worker secrets:

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
`RESEND_FROM_EMAIL`, `OWNER_ORDER_EMAIL`, `WAHA_API_URL`, `WAHA_API_KEY`,
`OWNER_WHATSAPP`, `OUTBOX_RUN_SECRET`, `RESEND_WEBHOOK_SECRET`,
`WAHA_WEBHOOK_SECRET`.

Non-secret controls:

`NOTIFICATION_DISPATCH_ENABLED`, `NOTIFICATION_DISPATCH_AFTER`,
`NOTIFICATION_CHANNELS`, `WAHA_SESSION`, `PUBLIC_BASE_URL`, `ADMIN_BASE_URL`.

1. Complete the final batch checks and the database backup/recovery preconditions
   recorded in item 2. Take a verified backup before applying the final migrations.
2. During that coordinated release, apply
   `20261011142641_notification_delivery_pipeline.sql` transactionally. It creates
   private RLS-protected tables and service-only invoker RPCs, changes the producer
   triggers, preserves legacy rows, and leaves database dispatch disabled.
3. Publish the final Pages batch once. Deploy the separate scheduled Worker with
   dispatch disabled and configure its secrets. Pages variables do not automatically
   reach a separate Worker. Confirm the release and let old request handlers finish.
4. Verify the Resend sender/domain and WAHA engine/session/message-ID contract.
   Configure delivery webhooks with signing secrets. Run controlled fixtures using
   deliberately selected test recipients during final acceptance, not customer data.
5. Choose an explicit UTC ISO cutoff with seconds or exactly three millisecond
   digits. Use the SAME timestamp in `NOTIFICATION_DISPATCH_AFTER` and
   `notification_dispatch_state.activated_after`; do not mix an SQL microsecond
   `now()` value with a rounded JavaScript timestamp. Review all jobs before this
   cutoff without replaying them.
6. Select the intended channels. Missing selected-channel secrets halt sending.
   Jobs on unselected channels remain visible; they do not become accepted.
7. Enable both database and Worker dispatch only after the final checks. Confirm
   heartbeat, exact queue counts, provider acceptance IDs and signed receipt counts.
   Stop with either dispatch switch if acceptance fails. Keep the durable ledger;
   rolling back Pages to a direct-sending release can introduce competing senders.

No secret values belong in source, arguments, reports, screenshots or logs. Provider
account/session/recipient changes require reviewing in-flight frozen requests; a
changed WAHA endpoint/session blocks a frozen request instead of sending it elsewhere.

## Verification

`npm run check`, `npm test`, `npm run build:functions`, and
`npm run build:notifications`. The last command is a local dry run and does not
publish. CI requires native PostgreSQL 17: two independent psql sessions prove
concurrent skip-locked claims and stale-token rejection. Local root-only runtimes
explicitly skip native tests; PGlite tests do not certify PostgreSQL 17 concurrency.

Local/CI provider and webhook tests use synthetic fixtures and mocks exclusively.
They prove code contracts, not inbox delivery, WAHA uptime, SPF/DKIM/DMARC status,
Cloudflare production execution or managed Supabase end-to-end compatibility.

## Primary references checked

- [Resend idempotency and its 24-hour window](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend raw-body webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests)
- [Svix signature format](https://www.svix.com/guides/receiving/receive-webhooks-with-svix-cli/)
- [WAHA sendText](https://waha.devlike.pro/docs/how-to/send-messages/)
- [WAHA acknowledgements and HMAC headers](https://waha.devlike.pro/docs/how-to/events/)
- [Supabase database functions and permissions](https://supabase.com/docs/guides/database/functions)
- [Supabase changelog](https://supabase.com/changelog)
- [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
