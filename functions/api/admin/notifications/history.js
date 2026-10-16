/**
 * Authenticated, read-only delivery ledger for the ChaskaBox Notification Center.
 * No secrets, recipients, message bodies or provider payloads leave this route.
 * Sending, replaying and channel activation are intentionally NOT supported here.
 */
import { withAdmin, sb, json, httpError } from '../../_lib/auth.js';

const TARGETS = new Set(['all', 'owner_email', 'owner_whatsapp', 'customer_whatsapp']);
const VIEWS = new Set(['all', 'pending', 'review', 'accepted', 'delivered']);
const FIELDS = 'id,order_id,target,event_type,status,delivery_status,attempts,created_at,updated_at,next_attempt_at,delivered_at,last_error';

export function notificationHistoryQuery(url) {
  const params = new URL(url).searchParams;
  const target = params.get('target') || 'all';
  const view = params.get('view') || 'all';
  const pageRaw = params.get('page') || '1';
  if (!TARGETS.has(target) || !VIEWS.has(view) || !/^[1-9][0-9]{0,2}$/.test(pageRaw)) {
    httpError('Invalid notification history filter', 400, 'invalid_filter');
  }
  const page = Number(pageRaw);
  if (page > 100) httpError('Notification history is limited to 100 pages', 400, 'invalid_page');
  const query = new URLSearchParams({
    select: FIELDS,
    order: 'created_at.desc,id.desc',
    limit: '20',
    offset: String((page - 1) * 20),
  });
  if (target !== 'all') query.set('target', 'eq.' + target);
  if (view === 'pending') query.set('status', 'in.(pending,retry,processing)');
  if (view === 'review') query.set('or', '(status.in.(blocked,uncertain,dead),delivery_status.in.(failed,complained))');
  if (view === 'accepted') query.set('status', 'eq.accepted');
  if (view === 'delivered') query.set('delivery_status', 'eq.delivered');
  return { query: query.toString(), page, target, view };
}

export function safeDeliveryRow(row) {
  const error = typeof row.last_error === 'string' && /^[a-z0-9_]{1,80}$/.test(row.last_error)
    ? row.last_error : row.last_error ? 'review_required' : null;
  return {
    id: row.id, order_id: row.order_id, target: row.target, event_type: row.event_type,
    status: row.status, delivery_status: row.delivery_status, attempts: row.attempts,
    created_at: row.created_at, updated_at: row.updated_at, next_attempt_at: row.next_attempt_at,
    delivered_at: row.delivered_at, error_code: error,
  };
}

export const onRequestGet = withAdmin(['owner', 'manager'], async context => {
  const filters = notificationHistoryQuery(context.request.url);
  const { data, total } = await sb(context, '/rest/v1/notification_deliveries?' + filters.query, { count: true });
  if (!Array.isArray(data)) httpError('Notification ledger unavailable', 502, 'ledger_unavailable');
  return json({
    rows: data.map(safeDeliveryRow),
    total,
    page: filters.page,
    page_size: 20,
    pages: Math.ceil(total / 20),
    target: filters.target,
    view: filters.view,
    read_only: true,
  }, 200, { 'Cache-Control': 'no-store' });
});
