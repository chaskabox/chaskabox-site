import { notificationConfig, providerReadiness, privateRequest } from './notification-delivery.js';

const STATES = new Set(['ready', 'unavailable', 'unknown', 'disabled']);
const SESSIONS = new Set(['WORKING', 'STARTING', 'SCAN_QR_CODE', 'FAILED', 'STOPPED']);
const httpStatus = value => Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;

// Store only typed diagnostic fields, never provider responses, URLs or secrets.
export function providerHealthRecord(readiness, targets) {
  const email = readiness.email || {}, whatsapp = readiness.whatsapp || {};
  const emailEnabled = targets.includes('owner_email');
  const whatsappEnabled = targets.some(target => target.endsWith('whatsapp'));
  const emailStatus = !emailEnabled ? 'disabled'
    : email.domain_check_restricted === true ? 'unknown'
    : email.http_status === 200 && email.sender_domain_verified && email.owner_recipient_configured ? 'ready'
    : 'unavailable';
  const whatsappStatus = !whatsappEnabled ? 'disabled'
    : whatsapp.http_status === 200 && whatsapp.session_status === 'WORKING' && whatsapp.signed_receipts_configured ? 'ready'
    : 'unavailable';
  return {
    p_email_status: emailStatus,
    p_email_http_status: httpStatus(email.http_status),
    p_whatsapp_status: whatsappStatus,
    p_whatsapp_http_status: httpStatus(whatsapp.http_status),
    p_whatsapp_session_status: SESSIONS.has(whatsapp.session_status) ? whatsapp.session_status : 'unknown',
    p_whatsapp_receipts_configured: whatsapp.signed_receipts_configured === true,
  };
}

export async function checkNotificationProviders(env, fetcher = fetch) {
  const config = notificationConfig(env);
  // This check never claims jobs, changes channels or sends a message.
  const readiness = await providerReadiness(env, fetcher);
  const record = providerHealthRecord(readiness, config.targets);
  await privateRequest(env, '/rest/v1/rpc/notification_provider_health_record', record, fetcher);
  return { status: 'recorded', email: record.p_email_status, whatsapp: record.p_whatsapp_status };
}

export function providerHealthView(row, targets, now = Date.now()) {
  const checked = Date.parse(row?.checked_at || '');
  const fresh = Number.isFinite(checked) && now >= checked && now - checked <= 10 * 60000;
  const status = (enabled, value) => !enabled ? 'disabled' : !fresh || !STATES.has(value) || value === 'disabled' ? 'unknown' : value;
  return {
    checked_at: Number.isFinite(checked) ? new Date(checked).toISOString() : null,
    stale: !fresh,
    email: {
      status: status(targets.includes('owner_email'), row?.email_status),
      http_status: httpStatus(row?.email_http_status),
    },
    whatsapp: {
      status: status(targets.some(target => target.endsWith('whatsapp')), row?.whatsapp_status),
      http_status: httpStatus(row?.whatsapp_http_status),
      session_status: fresh && SESSIONS.has(row?.whatsapp_session_status) ? row.whatsapp_session_status : 'unknown',
      receipts_configured: fresh ? row?.whatsapp_receipts_configured === true : null,
    },
    delivery_confirmation: 'verified_webhooks_only',
  };
}
