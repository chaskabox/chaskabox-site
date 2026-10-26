import { withAdmin, sb, json } from '../_lib/auth.js';
import { safeDeliveryRow } from './history.js';
import { providerHealthView } from '../../_lib/notification-provider-health.js';
export const onRequestGet = withAdmin(['owner', 'manager'], async context => {
  const summary = await sb(context, '/rest/v1/rpc/notification_summary', { method: 'POST', body: {} });
  const state = summary.dispatch || {};
  const recent = await sb(context, '/rest/v1/notification_deliveries?or=(status.in.(blocked,uncertain,dead),delivery_status.in.(failed,complained))&select=order_id,target,status,delivery_status,last_error,updated_at,orders!inner(order_number,is_test)&orders.is_test=eq.false&order=updated_at.desc&limit=10');
  // A failed probe read must not hide otherwise available queue evidence.
  let snapshot = null;
  try { snapshot = (await sb(context, '/rest/v1/notification_provider_health?select=checked_at,email_status,email_http_status,whatsapp_status,whatsapp_http_status,whatsapp_session_status,whatsapp_receipts_configured&limit=1'))?.[0]; } catch {}
  const providers = providerHealthView(snapshot, state.configured_targets || []);
  const stale = !state.last_completed_at || Date.now() - Date.parse(state.last_completed_at) > 5 * 60000;
  const providerUnavailable = [providers.email, providers.whatsapp].some(p => p.status === 'unavailable');
  const workerStatus = !state.enabled ? 'paused' : stale ? 'no_recent_heartbeat' : state.last_error || summary.review_required || summary.overdue || summary.inactive_channel_pending || providerUnavailable ? 'degraded' : 'active';
  return json({ ...summary, worker_status: workerStatus, providers, recent_failures: (recent || []).map(item => {const safe=safeDeliveryRow(item);return {...safe,last_error:safe.error_code};}),
    resend: { consumer_configured: (state.configured_targets || []).includes('owner_email'), provider_health: providers.email.status },
    waha: { consumer_configured: (state.configured_targets || []).some(t => t.endsWith('whatsapp')), provider_health: providers.whatsapp.status },
  }, 200, { 'Cache-Control': 'no-store' });
});
