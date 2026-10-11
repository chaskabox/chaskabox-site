import { notificationConfig, notificationHealth, privateRequest, buildNotificationPayload, sendNotification, equalSecret, activationMatches } from '../functions/api/_lib/notification-delivery.js';
import { handleNotificationReceipt } from '../functions/api/_lib/notification-receipts.js';

export async function runNotifications(env, fetcher = fetch) {
  const config = notificationConfig(env), counts = { claimed: 0, accepted: 0, retry: 0, blocked: 0, uncertain: 0, dead: 0 };
  if (!config.enabled) return { paused: true, counts };
  if (config.errors.length) throw new Error('notification_configuration_invalid');
  const rpc = (name, body = {}) => privateRequest(env, '/rest/v1/rpc/' + name, body, fetcher);
  const summary = await rpc('notification_summary');
  if (!summary.dispatch?.enabled || !activationMatches(summary.dispatch.activated_after,config.after)) throw new Error('notification_activation_not_confirmed');
  await rpc('notification_record_run', { p_targets: config.targets, p_counts: counts, p_started: true });
  try {
    await rpc('notification_reconcile_receipts');
    const started = Date.now();
    // Four jobs bound I/O to fewer than 50 external subrequests per invocation.
    for (let i = 0; i < 4 && Date.now() - started < 45000; i++) {
      const job = (await rpc('notification_claim', { p_after: config.after, p_targets: config.targets }))?.[0];
      if (!job) break;
      counts.claimed++;
      let payload = job.request_payload;
      if (!payload) {
        const order = (await privateRequest(env, '/rest/v1/orders?id=eq.' + encodeURIComponent(job.order_id) + '&select=id,order_number,customer_name,customer_phone,total,payment_method,payment_status&limit=1', undefined, fetcher))?.[0];
        if (!order) throw new Error('notification_order_missing');
        order.items = await privateRequest(env, '/rest/v1/order_items?order_id=eq.' + encodeURIComponent(job.order_id) + '&select=product_name,pack,quantity,unit_price&limit=100', undefined, fetcher);
        const templates = await privateRequest(env, '/rest/v1/notification_templates?name=in.(order_received_owner,order_received_owner_whatsapp,order_thankyou_customer,status_update)&select=name,channel,subject,body,is_active&limit=4', undefined, fetcher);
        try { payload = buildNotificationPayload(env, order, job, templates); }
        catch (error) {
          const saved = await rpc('notification_finish', { p_id: job.id, p_token: job.lease_token, p_status: 'blocked', p_error: error.message });
          if (!saved?.saved) throw new Error('notification_lease_lost'); counts[saved.status]++; continue;
        }
        payload = await rpc('notification_prepare', { p_id: job.id, p_token: job.lease_token, p_payload: payload });
        if (!payload) throw new Error('notification_lease_lost');
      }
      const begun = (await rpc('notification_begin', { p_id: job.id, p_token: job.lease_token, p_after: config.after }))?.[0];
      if (!begun) throw new Error('notification_begin_denied');
      const result = await sendNotification(env, { ...begun, request_payload: payload }, fetcher);
      const saved = await rpc('notification_finish', { p_id: job.id, p_token: job.lease_token, p_status: result.status,
        p_provider_id: result.provider_id || null, p_error: result.error || null, p_retry_seconds: result.retry_seconds || 0 });
      if (!saved?.saved) throw new Error('notification_result_not_persisted');
      counts[saved.status]++;
    }
    await rpc('notification_reconcile_receipts');
    await rpc('notification_record_run', { p_targets: config.targets, p_counts: counts });
    return { paused: false, counts };
  } catch (error) {
    await rpc('notification_record_run', { p_targets: config.targets, p_counts: counts, p_error: 'notification_run_failed' }).catch(() => {});
    throw error;
  }
}
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runNotifications(env).then(result => { console.log(JSON.stringify({ event: 'notification_run', ...result })); }));
  },
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/webhooks/resend' || path === '/webhooks/waha') return handleNotificationReceipt(request, env, path.endsWith('resend') ? 'email' : 'whatsapp');
    if (!['/health', '/run'].includes(path)) return json({ error: 'not_found' }, 404);
    if (!await equalSecret(request.headers.get('Authorization'), env.OUTBOX_RUN_SECRET && 'Bearer ' + env.OUTBOX_RUN_SECRET)) return json({ error: 'unauthorized' }, 401);
    if (request.method !== (path === '/run' ? 'POST' : 'GET')) return json({ error: 'method_not_allowed' }, 405);
    try {
      if (path === '/run') { const result = await runNotifications(env); return json(result, result.paused ? 503 : 200); }
      const summary = await privateRequest(env, '/rest/v1/rpc/notification_summary', {});
      const health = notificationHealth(notificationConfig(env), summary);
      return json(health, health.ok ? 200 : 503);
    } catch { return json({ ok: false, reasons: ['notification_health_or_run_unavailable'] }, 503); }
  },
};
