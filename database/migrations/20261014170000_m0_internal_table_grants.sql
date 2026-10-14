-- M0: Defense in depth for internal-only tables.
-- Baseline check (2026-10-14): RLS enabled with no policies on these tables;
-- direct access from anon/authenticated is neither required nor appropriate.
-- Do not change RLS or privileged function grants here.
BEGIN;
REVOKE ALL PRIVILEGES ON TABLE
  public.api_rate_limits,
  public.customer_notification_outbox,
  public.notification_outbox,
  public.order_status_events,
  public.product_versions
FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE
  public.api_rate_limits,
  public.customer_notification_outbox,
  public.notification_outbox,
  public.order_status_events,
  public.product_versions
TO service_role;
COMMIT;
