import { limitedText, privateRequest } from './notification-delivery.js';
const encoder = new TextEncoder();
function base64(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
async function verifyHmac(hash, keyBytes, signature, body) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(body));
}
export async function verifyResend(request, body, secret, now = Date.now()) {
  try {
    const id = request.headers.get('svix-id'), timestamp = request.headers.get('svix-timestamp'), signature = request.headers.get('svix-signature');
    if (!secret?.startsWith('whsec_') || !id || id.length > 240 || !/^\d{10}$/.test(timestamp || '') || Math.abs(now / 1000 - Number(timestamp)) > 300 || !signature || signature.length > 4096) return false;
    for (const part of signature.split(' ').slice(0, 8)) {
      if (!part.startsWith('v1,')) continue;
      if (await verifyHmac('SHA-256', base64(secret.slice(6)), base64(part.slice(3)), id + '.' + timestamp + '.' + body)) return true;
    }
  } catch { /* Invalid signatures fail closed. */ }
  return false;
}
export async function verifyWaha(request, body, secret) {
  try {
    const hex = request.headers.get('x-webhook-hmac');
    if (!secret || request.headers.get('x-webhook-hmac-algorithm') !== 'sha512' || !/^[a-fA-F0-9]{128}$/.test(hex || '')) return false;
    return await verifyHmac('SHA-512', encoder.encode(secret), Uint8Array.from(hex.match(/../g), x => parseInt(x, 16)), body);
  } catch { return false; }
}
function json(data, status) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
export async function handleNotificationReceipt(request, env, channel, fetcher = fetch) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const secret = channel === 'email' ? env.RESEND_WEBHOOK_SECRET : env.WAHA_WEBHOOK_SECRET;
  if (!secret || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'receipt_configuration_missing' }, 503);
  let body; try { body = await limitedText(request, 32768); } catch { return json({ error: 'body_too_large' }, 413); }
  const verified = channel === 'email' ? await verifyResend(request, body, secret) : await verifyWaha(request, body, secret);
  if (!verified) return json({ error: 'invalid_signature' }, 401);
  let data; try { data = JSON.parse(body); } catch { return json({ error: 'invalid_json' }, 400); }
  let id, event, status, occurred;
  if (channel === 'email') {
    status = { 'email.delivered': 'delivered', 'email.bounced': 'failed', 'email.complained': 'complained', 'email.failed': 'failed' }[data.type];
    if (!status) return json({ ignored: true }, 202);
    id = data.data?.email_id; event = request.headers.get('svix-id'); occurred = data.created_at;
  } else {
    if (data.event !== 'message.ack' || data.session !== env.WAHA_SESSION || data.payload?.fromMe !== true) return json({ ignored: true }, 202);
    status = [2, 3, 4].includes(data.payload.ack) ? 'delivered' : data.payload.ack === -1 ? 'failed' : null;
    if (!status) return json({ ignored: true }, 202);
    // WEBJS may emit a structured message ID; match the normalized send acknowledgment.
    id = typeof data.payload.id === 'string' ? data.payload.id : data.payload.id?._serialized;
    event = data.session + ':' + id + ':' + data.payload.ack;
    // WAHA's signed body may omit event time. Such receipts use arrival time;
    // delivered is terminal for WhatsApp, so an old ERROR replay cannot undo it.
    occurred = Number.isFinite(data.timestamp) ? new Date(data.timestamp).toISOString() : new Date().toISOString();
  }
  if (typeof id !== 'string' || !id || id.length > 240 || !event || event.length > 240 || !Number.isFinite(Date.parse(occurred))) return json({ error: 'invalid_receipt' }, 422);
  try {
    await privateRequest(env, '/rest/v1/rpc/notification_record_receipt', { p_channel: channel, p_event_key: event, p_provider_id: id, p_status: status, p_occurred_at: occurred }, fetcher);
    return json({ recorded: true }, 200);
  } catch { return json({ error: 'receipt_not_persisted' }, 503); }
}
