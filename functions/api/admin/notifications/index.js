import { withAdmin, sb, json } from '../_lib/auth.js';
import { safeDeliveryRow } from './history.js';
export const onRequestGet = withAdmin(['owner', 'manager'], async context => {
  const summary = await sb(context, '/rest/v1/rpc/notification_summary', { method: 'POST', body: {} });
  const state = summary.dispatch || {};
  const recent = await sb(context, '/rest/v1/notification_deliveries?or=(status.in.(blocked,uncertain,dead),delivery_status.in.(failed,complained))&select=order_id,target,status,delivery_status,last_error,updated_at&order=updated_at.desc&limit=10');
  const stale = !state.last_completed_at || Date.now() - Date.parse(state.last_completed_at) > 5 * 60000;
  const workerStatus = !state.enabled ? 'paused' : stale ? 'no_recent_heartbeat' : state.last_error || summary.review_required || summary.overdue || summary.inactive_channel_pending ? 'degraded' : 'active';
  return json({ ...summary, worker_status: workerStatus, recent_failures: (recent || []).map(item => ({...item, last_error: safeDeliveryRow(item).error_code})),
    resend: { consumer_configured: (state.configured_targets || []).includes('owner_email'), provider_health: 'not_probed' },
    waha: { consumer_configured: (state.configured_targets || []).some(t => t.endsWith('whatsapp')), provider_health: 'not_probed' },
  }, 200, { 'Cache-Control': 'no-store' });
});
