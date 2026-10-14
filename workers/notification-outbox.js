import { notificationConfig, notificationHealth, privateRequest, buildNotificationPayload, sendNotification, equalSecret, activationMatches,providerReadiness } from '../functions/api/_lib/notification-delivery.js';
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
        const templates = await privateRequest(env, '/rest/v1/notification_templates?name=in.(order_received_owner,order_received_owner_whatsapp,order_thankyou_customer,status_update)&select=name,channel,subject,body,is_active,version&limit=4', undefined, fetcher);
        const policyRows=await privateRequest(env,'/rest/v1/public_site_settings?key=in.(delivery_estimate,support_email,support_whatsapp)&select=key,value&limit=3',undefined,fetcher);
        const policy=Object.fromEntries((policyRows||[]).map(r=>[r.key,r.value]));
        try { payload = buildNotificationPayload({...env,NOTIFICATION_PUBLIC_POLICY:policy}, order, job, templates); }
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
    if(String(env.ANALYTICS_RETENTION_ENABLED)==='true'&&new Date(_controller.scheduledTime).getUTCMinutes()===0){
      ctx.waitUntil(privateRequest(env,'/rest/v1/rpc/analytics_retention_run',{}).then(async result=>{console.log(JSON.stringify({event:'analytics_retention',...result}));const ai=await privateRequest(env,'/rest/v1/rpc/ai_maintenance_run',{});console.log(JSON.stringify({event:'ai_retention',...ai}));}));
    }
    ctx.waitUntil(runNotifications(env).then(result => { console.log(JSON.stringify({ event: 'notification_run', ...result })); }));
  },
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/webhooks/resend' || path === '/webhooks/waha') return handleNotificationReceipt(request, env, path.endsWith('resend') ? 'email' : 'whatsapp');
    if (!['/health', '/run','/acceptance-email'].includes(path)) return json({ error: 'not_found' }, 404);
    if (!await equalSecret(request.headers.get('Authorization'), env.OUTBOX_RUN_SECRET && 'Bearer ' + env.OUTBOX_RUN_SECRET)) return json({ error: 'unauthorized' }, 401);
    if (request.method !== (path === '/health' ? 'GET' : 'POST')) return json({ error: 'method_not_allowed' }, 405);
    try {
      if(path==='/acceptance-email'){
        if(env.OWNER_EMAIL_ACCEPTANCE_ENABLED!=='true')return json({error:'owner_email_acceptance_requires_approval'},409);
        const body=await request.text();if(body.length>512)return json({error:'invalid_test_request'},400);
        let data;try{data=JSON.parse(body);}catch{return json({error:'invalid_test_request'},400);}
        if(!data||Object.keys(data).join(',')!=='test_id'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(data.test_id||''))return json({error:'invalid_test_request'},400);
        if(!env.RESEND_API_KEY||!env.OWNER_ORDER_EMAIL||!env.RESEND_FROM_EMAIL)return json({error:'email_configuration_missing'},503);
        const outcome=await sendNotification(env,{target:'owner_email',order_id:data.test_id,request_payload:{endpoint:'https://api.resend.com/emails',body:{from:env.RESEND_FROM_EMAIL,to:[env.OWNER_ORDER_EMAIL],subject:'ChaskaBox owner email integration test',text:'This is the authorized ChaskaBox owner email connectivity test. No customer order, payment or refund was created. Test reference: '+data.test_id+'.'}}});
        return json({test_id:data.test_id,...outcome,delivery_confirmation:'verify_provider_receipt'},outcome.status==='accepted'?202:503);
      }
      if (path === '/run') { const result = await runNotifications(env); return json(result, result.paused ? 503 : 200); }
      const summary = await privateRequest(env, '/rest/v1/rpc/notification_summary', {});
      const health = notificationHealth(notificationConfig(env), summary);
      if(new URL(request.url).searchParams.get('providers')==='1')health.providers=await providerReadiness(env);
      return json(health, health.ok ? 200 : 503);
    } catch (error) {
      const reason=/^queue_(?:api_\d{3}|configuration_invalid|key_invalid|response_invalid|request_timeout|request_failed|fetch_invocation_invalid)$/.test(error?.message)?error.message:'notification_health_or_run_unavailable';
      return json({ ok: false, reasons: [reason],...(error.request_failure_kind?{request_failure_kind:error.request_failure_kind}:{}) }, 503);
    }
  },
};
