/**
 * /api/admin/notifications
 * GET — notification center: outbox status, Resend/WAHA health, recent deliveries.
 * Roles: owner, manager.
 */
import { withAdmin, sb, json, env } from '../_lib/auth.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const e = env(context);

  // Exact database aggregates; an unavailable database must not appear healthy.
  const summary=await sb(context,'/rest/v1/rpc/analytics_notifications',{method:'POST',body:{}});
  const stats={pending:0,sent:0,failed:0,retry:0,...summary.owner_outbox};
  const custStats={pending:0,sent:0,failed:0,retry:0,...summary.customer_outbox};
  const failed=await sb(context,'/rest/v1/notification_outbox?status=eq.failed&select=order_id,last_error,updated_at&order=updated_at.desc&limit=10');

  return json({
    resend: {
      configured: !!(e.RESEND_API_KEY && e.OWNER_ORDER_EMAIL),
      has_api_key: !!e.RESEND_API_KEY,
      has_owner_email: !!e.OWNER_ORDER_EMAIL,
      from_email: e.RESEND_FROM_EMAIL || null,
    },
    waha: {
      // WAHA status from env/config — actual health check via separate endpoint
      configured: !!e.WAHA_API_URL,
      url_configured: !!e.WAHA_API_URL,
    },
    owner_outbox: stats,
    customer_outbox: custStats,
    recent_failures: failed || [],
  });
});
