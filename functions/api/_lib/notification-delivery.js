/* Private transactional helpers. Only the scheduled Worker sends notifications. */
const encoder = new TextEncoder();
export const TARGETS = ['owner_email', 'owner_whatsapp', 'customer_whatsapp'];
function protectedWahaOrigin(env) {
  try {
    const url = new URL(String(env.WAHA_API_URL || ''));
    return url.protocol === 'https:' && url.hostname === 'waha.chaskabox.online';
  } catch { return false; }
}
// Never send Cloudflare Access credentials to temporary or unrelated gateways.
export function wahaAccessHeaders(env) {
  if (!protectedWahaOrigin(env)) return {};
  const id = String(env.WAHA_CF_ACCESS_CLIENT_ID || '').trim();
  const secret = String(env.WAHA_CF_ACCESS_CLIENT_SECRET || '').trim();
  return id && secret ? { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret } : {};
}

export function activationMatches(stored, expected) {
  const fraction=String(stored || '').match(/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/)?.[1] || '';
  return Number.isFinite(Date.parse(expected)) && Date.parse(stored)===Date.parse(expected) && !/[1-9]/.test(fraction.slice(3));
}
export function notificationConfig(env) {
  const targets = String(env.NOTIFICATION_CHANNELS || '').split(',').map(x => x.trim()).filter(Boolean), errors = [];
  if (!targets.length || new Set(targets).size !== targets.length || targets.some(x => !TARGETS.includes(x))) errors.push('notification_channels_invalid');
  const after = String(env.NOTIFICATION_DISPATCH_AFTER || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(after) || !Number.isFinite(Date.parse(after))) errors.push('activation_cutoff_invalid');
  else if (new Date(after).toISOString() !== (after.includes('.') ? after : after.replace('Z', '.000Z'))) errors.push('activation_cutoff_invalid');
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) errors.push('database_configuration_missing');
  if (targets.includes('owner_email') && (!env.RESEND_API_KEY || !env.OWNER_ORDER_EMAIL || !env.RESEND_FROM_EMAIL)) errors.push('resend_configuration_missing');
  if (targets.some(t => t.endsWith('whatsapp')) && (!env.WAHA_API_URL || !env.WAHA_API_KEY || !env.WAHA_SESSION)) errors.push('waha_configuration_missing');
  if (targets.some(t => t.endsWith('whatsapp')) && protectedWahaOrigin(env) && !Object.keys(wahaAccessHeaders(env)).length) errors.push('waha_access_configuration_missing');
  if (targets.includes('owner_whatsapp') && !chatId(env.OWNER_WHATSAPP)) errors.push('owner_whatsapp_invalid');
  for (const value of [env.SUPABASE_URL, targets.some(t => t.endsWith('whatsapp')) && env.WAHA_API_URL].filter(Boolean)) {
    try { const u = new URL(value); if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw new Error(); }
    catch { errors.push('private_endpoint_invalid'); }
  }
  return { enabled: env.NOTIFICATION_DISPATCH_ENABLED === 'true', after, targets, errors };
}
export async function equalSecret(actual, expected) {
  if (!actual || !expected) return false;
  const [a, b] = await Promise.all([actual, expected].map(s => crypto.subtle.digest('SHA-256', encoder.encode(s))));
  const aa = new Uint8Array(a), bb = new Uint8Array(b); let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
export async function limitedText(response, maxBytes = 32768) {
  if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('response_too_large'); }
  const reader = response.body?.getReader(); if (!reader) return '';
  const parts = []; let bytes = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.length;
      if (bytes > maxBytes) { await reader.cancel(); throw new Error('response_too_large'); } parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(bytes); let offset = 0;
  for (const part of parts) { data.set(part, offset); offset += part.length; }
  return new TextDecoder().decode(data);
}
export async function privateRequest(env, path, body, fetcher = fetch) {
  const baseURL=String(env.SUPABASE_URL||'').trim().replace(/\/+$/,''),key=String(env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  if(!baseURL||!key)throw new Error('queue_configuration_invalid');
  if(!/^[\x21-\x7e]+$/.test(key))throw new Error('queue_key_invalid');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetcher.call(globalThis,baseURL + path, {
      method: body === undefined ? 'GET' : 'POST', signal: controller.signal, redirect: 'manual',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('queue_api_' + response.status); }
    const text = await limitedText(response, 65536);try{return text?JSON.parse(text):null;}catch{throw new Error('queue_response_invalid');}
  } catch (error) {
    if (/^queue_(?:api_\d{3}|response_invalid)$/.test(error.message)) throw error;
    const failure=new Error(controller.signal.aborted?'queue_request_timeout':/Illegal invocation/i.test(error?.message||'')?'queue_fetch_invocation_invalid':'queue_request_failed');
    const m=String(error?.message||'');
    failure.request_failure_kind=/header|ByteString|character/i.test(m)?'invalid_header':/certificate|TLS|SSL/i.test(m)?'tls':/DNS|resolve|getaddrinfo/i.test(m)?'dns':/redirect/i.test(m)?'redirect':/not a function|not defined|receiver|invocation/i.test(m)?'runtime':'network_or_runtime';
    throw failure;
  }
  finally { clearTimeout(timer); }
}
export function chatId(value) {
  let digits = String(value || '').trim().replace(/^\+/, '');
  if (/^03\d{9}$/.test(digits)) digits = '92' + digits.slice(1);
  return /^\d{10,15}$/.test(digits) ? digits + '@c.us' : '';
}
export async function providerReadiness(env,fetcher=fetch){
 async function read(url,headers){const r=await fetcher.call(globalThis,url,{headers,redirect:'manual',signal:AbortSignal.timeout(10000)});const text=await limitedText(r,32768);try{return {http_status:r.status,response_kind:'json',data:JSON.parse(text)};}catch{return {http_status:r.status,response_kind:/^\s*</.test(text)?'html':'text',tunnel_unavailable:/no tunnel|tunnel.*not found|could not find.*tunnel|error\s*(1033|1016)/i.test(text)};}}
 const result={};
 try{const r=await read('https://api.resend.com/domains',{Authorization:'Bearer '+String(env.RESEND_API_KEY||'').trim()});const from=String(env.RESEND_FROM_EMAIL||''),domain=from.match(/@([^>\s]+)/)?.[1]?.toLowerCase(),available=r.http_status===200&&Array.isArray(r.data?.data);result.email={http_status:r.http_status,domain_check_available:available,sender_domain_verified:available?r.data.data.some(d=>d.name===domain&&d.status==='verified'):null,owner_recipient_configured:!!env.OWNER_ORDER_EMAIL};}catch{result.email={request_failed:true};}
 const gateway=String(env.WAHA_API_URL||'');let temporary=false,origin=null;try{const parsed=new URL(gateway);origin=parsed.origin;temporary=parsed.hostname.endsWith('.trycloudflare.com');}catch{temporary=true;}
 if(protectedWahaOrigin(env)&&!Object.keys(wahaAccessHeaders(env)).length){result.whatsapp={check_blocked:true,reason:'waha_access_configuration_missing',signed_receipts_configured:!!env.WAHA_WEBHOOK_SECRET};}
 else if(!origin||(temporary&&env.WAHA_APPROVED_GATEWAY_ORIGIN!==origin)){result.whatsapp={check_blocked:true,reason:'gateway_ownership_verification_required',signed_receipts_configured:!!env.WAHA_WEBHOOK_SECRET};}
 else try{const headers={'X-Api-Key':String(env.WAHA_API_KEY||'').trim(),...wahaAccessHeaders(env)},root=gateway.replace(/\/$/,'');const r=await read(root+'/api/sessions/'+encodeURIComponent(env.WAHA_SESSION||'default'),headers);result.whatsapp={http_status:r.http_status,response_kind:r.response_kind,tunnel_unavailable:!!r.tunnel_unavailable,session_status:['WORKING','STARTING','SCAN_QR_CODE','FAILED','STOPPED'].includes(r.data?.status)?r.data.status:'unknown',signed_receipts_configured:!!env.WAHA_WEBHOOK_SECRET};if(r.http_status===404&&r.response_kind==='json'){const sessions=await read(root+'/api/sessions?all=true',headers);result.whatsapp.session_list_http_status=sessions.http_status;if(sessions.http_status===200&&Array.isArray(sessions.data))result.whatsapp.available_sessions=sessions.data.filter(s=>typeof s.name==='string'&&s.name.length<=120).map(s=>({name:s.name,status:['WORKING','STARTING','SCAN_QR_CODE','FAILED','STOPPED'].includes(s.status)?s.status:'unknown'}));}}catch{result.whatsapp={request_failed:true,signed_receipts_configured:!!env.WAHA_WEBHOOK_SECRET};}
 return result;
}
function base(value) { return String(value || 'https://chaskabox.online').replace(/\/+$/, ''); }
export function wahaEndpoint(env) { const url = base(env.WAHA_API_URL); return url.endsWith('/api') ? url + '/sendText' : url + '/api/sendText'; }
function variables(env, order, job) {
  const statuses = { new: 'received', sourcing: 'being prepared', packed: 'packed', dispatched: 'on its way', delivered: 'delivered', cancelled: 'cancelled' };
  const status = job.event_data?.new_status || '';
  const paymentStatus = job.event_type === 'payment_status' ? status : job.event_data?.payment_status || order.payment_status;
  return {
    delivery_estimate: String(env.NOTIFICATION_PUBLIC_POLICY?.delivery_estimate || 'Check the current estimate at checkout'),
    support_email: String(env.NOTIFICATION_PUBLIC_POLICY?.support_email || 'Use official support'),
    support_whatsapp: String(env.NOTIFICATION_PUBLIC_POLICY?.support_whatsapp || 'Use official support'),
    order_number: String(order.order_number || ''), customer_name: String(order.customer_name || ''), customer_phone: String(order.customer_phone || ''), total: String(order.total ?? ''),
    payment_method: String(order.payment_method || ''), payment_status: String(paymentStatus || '').replaceAll('_', ' '),
    tracking_url: base(env.PUBLIC_BASE_URL) + '/track-order.html?order=' + encodeURIComponent(order.order_number || ''),
    admin_url: base(env.ADMIN_BASE_URL) + '/admin.html#order-' + encodeURIComponent(order.id),
    status_text: job.event_type === 'payment_status' ? 'payment ' + String(status).replaceAll('_', ' ') : statuses[status] || String(status).replaceAll('_', ' '),
  };
}
function interpolate(text, vars) {
  let invalid = false;
  const result = String(text || '').replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, key) => {
    if (!Object.hasOwn(vars, key)) { invalid = true; return ''; } return vars[key];
  });
  if (invalid || /\{\{|\}\}/.test(result) || !result.trim() || result.length > 8000) throw new Error('template_invalid');
  return result;
}
export function buildNotificationPayload(env, order, job, templates = []) {
  const vars = variables(env, order, job);
  const name = job.target === 'owner_email' ? 'order_received_owner' : job.target === 'owner_whatsapp' ? 'order_received_owner_whatsapp' : job.event_type === 'order_created' ? 'order_thankyou_customer' : 'status_update';
  const template = templates.find(t => t.name === name);
  if(!template)throw new Error('template_missing');
  const templateRevision = { name, version:Number(template.version || 1), source:'stored_template' };
  if (template && (!template.is_active || template.channel !== (job.target === 'owner_email' ? 'email' : 'whatsapp'))) throw new Error('template_disabled_or_wrong_channel');
  const text = interpolate(String(template.body || '').replaceAll('\\n', '\n'), vars);
  if (job.target === 'owner_email') return { template: templateRevision, endpoint: 'https://api.resend.com/emails', body: {
    from: env.RESEND_FROM_EMAIL, to: [env.OWNER_ORDER_EMAIL], subject: interpolate(template.subject, vars).replace(/[\r\n]/g, ' ').slice(0, 200), text,
  } };
  const recipient = chatId(job.target === 'owner_whatsapp' ? env.OWNER_WHATSAPP : order.customer_phone);
  if (!recipient) throw new Error('recipient_phone_invalid');
  return { template: templateRevision, endpoint: wahaEndpoint(env), body: { session: env.WAHA_SESSION, chatId: recipient, text, linkPreview: false } };
}
export function previewNotificationTemplate(template, policy = {}) {
  const names={order_received_owner:'owner_email',order_received_owner_whatsapp:'owner_whatsapp',order_thankyou_customer:'customer_whatsapp',status_update:'customer_whatsapp'};
  if(!Object.hasOwn(names,template.name))throw new Error('template_name_invalid');
  const env={RESEND_FROM_EMAIL:'preview@example.invalid',OWNER_ORDER_EMAIL:'preview@example.invalid',WAHA_API_URL:'https://preview.example.invalid',WAHA_SESSION:'preview',OWNER_WHATSAPP:'03000000000',NOTIFICATION_PUBLIC_POLICY:policy};
  const order={id:'00000000-0000-4000-8000-000000000001',order_number:'CB-PREVIEW',customer_name:'Preview customer',customer_phone:'03000000000',total:1500,payment_method:'cod',payment_status:'cod_due',items:[]};
  const job={target:names[template.name],event_type:template.name==='status_update'?'fulfilment_status':'order_created',event_data:{new_status:'dispatched'}};
  const payload=buildNotificationPayload(env,order,job,[{...template,is_active:true}]);
  return {template:payload.template,subject:payload.body.subject||null,text:payload.body.text};
}
export async function sendNotification(env, job, fetcher = fetch) {
  if (!TARGETS.includes(job.target) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(job.order_id || '')) return { status: 'blocked', error: 'notification_identity_invalid' };
  const email = job.target === 'owner_email', payload = job.request_payload;
  if(!email){try{const gateway=new URL(wahaEndpoint(env));if(gateway.hostname.endsWith('.trycloudflare.com')&&env.WAHA_APPROVED_GATEWAY_ORIGIN!==gateway.origin)return {status:'blocked',error:'gateway_ownership_verification_required'};}catch{return {status:'blocked',error:'provider_endpoint_invalid'};}}
  if (!email && protectedWahaOrigin(env) && !Object.keys(wahaAccessHeaders(env)).length) return { status: 'blocked', error: 'waha_access_configuration_missing' };
  if (!payload || payload.endpoint !== (email ? 'https://api.resend.com/emails' : wahaEndpoint(env))) return { status: 'blocked', error: 'provider_endpoint_changed' };
  if (!email && payload.body?.session !== env.WAHA_SESSION) return { status: 'blocked', error: 'provider_session_changed' };
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher.call(globalThis,payload.endpoint, { method: 'POST', redirect: 'manual', signal: controller.signal,
      headers: email ? { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'chaskabox-owner-order-' + job.order_id }
        : { 'X-Api-Key': env.WAHA_API_KEY, ...wahaAccessHeaders(env), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload.body),
    });
    let data = null; try { data = JSON.parse(await limitedText(response, 16384)); } catch { /* Never treat missing acknowledgement as success. */ }
    if (response.ok) {
      const id = data?.id;
      if (typeof id !== 'string' || !id.trim() || id.length > 240) return { status: email ? 'retry' : 'uncertain', error: 'provider_ack_id_missing' };
      return { status: 'accepted', provider_id: id, error: null };
    }
    const retryHeader = response.headers.get('retry-after');
    const retrySeconds = Math.min(86400, /^\d+$/.test(retryHeader || '') ? Number(retryHeader) : Math.max(0, Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000)) || 0);
    if (response.status === 429 || (email && (response.status >= 500 || response.status === 408 || (response.status === 409 && data?.name === 'concurrent_idempotent_requests')))) return { status: 'retry', error: (email ? 'resend_' : 'waha_') + response.status, retry_seconds: retrySeconds };
    if (email && response.status === 409 && data?.name === 'invalid_idempotent_request') return { status: 'dead', error: 'resend_idempotency_payload_conflict' };
    if (response.status >= 500 || response.status === 408 || response.status === 409) return { status: 'uncertain', error: (email ? 'resend_' : 'waha_') + response.status };
    return { status: 'dead', error: (email ? 'resend_' : 'waha_') + response.status };
  } catch { return { status: email ? 'retry' : 'uncertain', error: 'provider_request_outcome_unknown' }; }
  finally { clearTimeout(timer); }
}
export function notificationHealth(config, summary, now = Date.now()) {
  const state = summary.dispatch || {}, reasons = [...config.errors];
  if (!config.enabled || !state.enabled) reasons.push('dispatch_paused');
  if (!activationMatches(state.activated_after,config.after)) reasons.push('activation_cutoff_mismatch');
  if (!state.last_completed_at || now - Date.parse(state.last_completed_at) > 5 * 60000) reasons.push('consumer_heartbeat_missing_or_stale');
  if (state.last_error) reasons.push('consumer_last_run_failed');
  if (Number(summary.review_required)) reasons.push('jobs_require_review');
  if (Number(summary.inactive_channel_pending)) reasons.push('channels_paused_with_pending_jobs');
  if (Number(summary.overdue)) reasons.push('queue_backlog_overdue');
  return { ok: reasons.length === 0, reasons, dispatch: state, provider_results: summary.provider_results,
    eligible_due: summary.eligible_due, inactive_channel_pending: summary.inactive_channel_pending,
    excluded_before_cutoff: summary.excluded_before_cutoff, delivery_confirmation: 'verified_webhooks_only' };
}
