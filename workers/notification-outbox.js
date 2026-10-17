import { notificationConfig, notificationHealth, privateRequest, buildNotificationPayload, sendNotification, equalSecret, activationMatches,providerReadiness, wahaAccessHeaders, chatId, wahaEndpoint, limitedText } from '../functions/api/_lib/notification-delivery.js';
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

// A single, explicitly approved owner test. The database claim consumes the
// attempt atomically before any WAHA I/O; an uncertain result is never retried.
export async function runOwnerWahaCanary(env, fetcher = fetch) {
  const id = 'chaskabox-owner-20261017b';
  if (env.WAHA_OWNER_CANARY_ENABLED !== 'true') return { status: 'disabled' };
  const claim = await privateRequest(env, '/rest/v1/rpc/waha_owner_canary_claim', { p_id: id }, fetcher);
  if (claim !== true) return { status: 'not_pending' };
  let outcome = 'blocked', code = 'configuration_invalid', providerId = null;
  try {
    const exactGateway = String(env.WAHA_API_URL || '').replace(/\/+$/, '');
    const auth = wahaAccessHeaders(env);
    const recipient = chatId(env.OWNER_WHATSAPP);
    if (exactGateway !== 'https://waha.chaskabox.online' ||
        !auth['CF-Access-Client-Id'] || !auth['CF-Access-Client-Secret'] ||
        !env.WAHA_API_KEY || env.WAHA_SESSION !== 'default' || !recipient) {
      code = 'gateway_or_owner_configuration_invalid';
    } else {
      const statusUrl = exactGateway + '/api/sessions/default';
      const statusResponse = await fetcher.call(globalThis, statusUrl, {
        method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10000),
        headers: { 'X-Api-Key': env.WAHA_API_KEY, ...auth, Accept: 'application/json' },
      });
      let data;
      try { data = JSON.parse(await limitedText(statusResponse, 8192)); }
      catch { data = null; }
      if (statusResponse.status !== 200 || data?.status !== 'WORKING') {
        code = 'waha_session_not_working_or_unreachable_' + statusResponse.status;
      } else {
        const request_payload = {
          endpoint: wahaEndpoint(env),
          body: {
            session: 'default', chatId: recipient,
            text: 'ChaskaBox WhatsApp integration test (owner only). No customer messages, orders or payments were created. Ref: CB-WAHA-20261017-B.',
            linkPreview: false,
          },
        };
        const result = await sendNotification(env, {
          target: 'owner_whatsapp',
          order_id: '3a9d41bf-f9d7-41a6-b2d4-d42deca3d302',
          request_payload,
        }, fetcher);
        outcome = result.status === 'accepted' ? 'accepted' : result.status === 'uncertain' ? 'uncertain' : 'blocked';
        code = result.error || null;
        providerId = result.provider_id || null;
      }
    }
  } catch {
    outcome = 'uncertain';
    code = 'gateway_network_or_response_error';
  } finally {
    await privateRequest(env, '/rest/v1/rpc/waha_owner_canary_finish', {
      p_id: id, p_status: outcome, p_provider_id: providerId, p_error_code: code,
    }, fetcher);
  }
  return { status: outcome, error_code: code, provider_acknowledged: !!providerId };
}


// One-shot session webhook setup; no messages, restarts, or replays.
// SQL claim is consumed before HTTP I/O so a timed-out configuration is never
// blindly repeated. The existing WAHA configuration is preserved.
export async function configureWahaWebhookOnce(env, fetcher = fetch) {
  const id = 'chaskabox-waha-receipts-20261017';
  if (env.WAHA_WEBHOOK_SETUP_ENABLED !== 'true') return { status: 'disabled' };
  const claim = await privateRequest(env, '/rest/v1/rpc/waha_webhook_setup_claim', { p_id: id }, fetcher);
  if (claim !== true) return { status: 'not_pending' };
  let outcome='blocked', code='invalid_config', httpStatus=null, sessionStatus=null, present=false;
  const url='https://notify.chaskabox.online/webhooks/waha';
  try {
    const auth=wahaAccessHeaders(env);
    const base=String(env.WAHA_API_URL||'').replace(/\/+$/,'');
    if (base !== 'https://waha.chaskabox.online' ||
        env.WAHA_SESSION !== 'default' || !env.WAHA_API_KEY ||
        !auth['CF-Access-Client-Id'] || !auth['CF-Access-Client-Secret'] ||
        typeof env.WAHA_WEBHOOK_SECRET !== 'string' || env.WAHA_WEBHOOK_SECRET.length < 32) {
      code='missing_gateway_or_webhook_credential';
    } else {
      const endpoint=base+'/api/sessions/default';
      const headers={ 'X-Api-Key': env.WAHA_API_KEY, ...auth,
        'Content-Type': 'application/json', Accept:'application/json' };
      const get=async()=>{
        const r=await fetcher.call(globalThis,endpoint,{method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(10000)});
        const txt=await limitedText(r,32768);
        let data=null;try{data=JSON.parse(txt)}catch{}
        return {status:r.status,data};
      };
      const old=await get();httpStatus=old.status;
      const s=old.data;
      sessionStatus=typeof s?.status==='string' ? s.status.slice(0,30) : null;
      if (old.status !== 200 || sessionStatus !== 'WORKING') {
        code='waha_session_unavailable';
      } else if (!s.config || typeof s.config !== 'object' || Array.isArray(s.config) ||
                 (s.config.webhooks != null && !Array.isArray(s.config.webhooks))) {
        code='session_config_unexpected';
      } else {
        const existing=s.config.webhooks || [];
        const configured=existing.filter(h=>h?.url===url);
        if (existing.length>10 || configured.length>1 ||
            (configured.length===1 && (!configured[0].events?.includes('message.ack') ||
            configured[0].hmac?.key !== env.WAHA_WEBHOOK_SECRET))) {
          code='webhook_conflict_review';
        } else if (configured.length===1) {
          outcome='configured';code=null;present=true;
        } else {
          const engine=typeof s.engine==='string'?s.engine:s.engine?.engine;
          const config={...s.config,webhooks:[...existing,{url,events:['message.ack'],
            hmac:{key:env.WAHA_WEBHOOK_SECRET},
            retries:{policy:'linear',delaySeconds:2,attempts:4}}]};
          // WEBJS needs tag events for message.ack. Preserve other WEBJS options.
          if (engine==='WEBJS') config.webjs={...(config.webjs||{}),tagsEventsOn:true};
          const put=await fetcher.call(globalThis,endpoint,{
            method:'PUT',headers,redirect:'manual',signal:AbortSignal.timeout(12000),
            body:JSON.stringify({name:'default',config})
          });
          httpStatus=put.status;
          await put.body?.cancel();
          if (!put.ok) {
            code='webhook_update_rejected';
          } else {
            const check=await get();
            sessionStatus=typeof check.data?.status==='string'?check.data.status.slice(0,30):null;
            present=!!check.data?.config?.webhooks?.some(h=>h?.url===url &&
              h?.events?.includes('message.ack'));
            outcome=present && sessionStatus==='WORKING'?'configured':'unverified';
            code=outcome==='configured'?null:'post_update_verification_required';
          }
        }
      }
    }
  } catch {
    outcome='uncertain';code='webhook_update_or_check_unknown';
  } finally {
    await privateRequest(env,'/rest/v1/rpc/waha_webhook_setup_finish',{
      p_id:id,p_status:outcome,p_http_status:httpStatus,
      p_session_status:sessionStatus,p_webhook_present:present,p_error_code:code,
    },fetcher);
  }
  return {status:outcome,error_code:code,http_status:httpStatus,session_status:sessionStatus,webhook_present:present};
}

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
export default {
  async scheduled(_controller, env, ctx) {
    if (env.WAHA_WEBHOOK_SETUP_ENABLED === 'true') {
      ctx.waitUntil(configureWahaWebhookOnce(env).then(result => {
        console.log(JSON.stringify({event:'waha_webhook_setup',...result}));
      }).catch(() => console.log(JSON.stringify({event:'waha_webhook_setup',status:'diagnostic_error'}))));
    }
    if (env.WAHA_OWNER_CANARY_ENABLED === 'true') {
      ctx.waitUntil(runOwnerWahaCanary(env).then(result => {
        console.log(JSON.stringify({ event: 'waha_owner_canary', ...result }));
      }).catch(() => console.log(JSON.stringify({ event: 'waha_owner_canary', status: 'diagnostic_error' }))));
    }
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
