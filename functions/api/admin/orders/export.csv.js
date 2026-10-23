/**
 * GET /api/admin/orders/export.csv
 * Download orders as CSV. Min role: manager (contract §3 — CSV contains customer PII).
 * Accepts the same filters as GET /api/admin/orders. Hard cap: 5,000 rows.
 * Audit action 'order.exported_csv' is a PROPOSED §5 addition (see CONTRACT_AMENDMENTS.md).
 */
import { withAdmin, sb, httpError, sanitizeSearch, audit } from '../_lib/auth.js';
import { parseRange } from '../analytics/_lib/helpers.js';
import { csvCell } from '../_lib/csv.js';

const COLS = [
  'order_number', 'created_at', 'customer_name', 'customer_phone',
  'customer_address', 'customer_city', 'payment_method', 'payment_status', 'fulfilment_status',
  'subtotal', 'delivery_fee', 'total', 'transaction_reference', 'is_test', 'owner_reviewed_at',
];

export const onRequestGet = withAdmin(['owner', 'manager'], async (context, { user, role }) => {
  const url = new URL(context.request.url);
  const sp = url.searchParams;
  const filters = [];
  const orderType = sp.get('order_type') || 'real';
  if (!['real','test','all'].includes(orderType)) httpError('Invalid order type',400,'invalid_order_type');
  if(orderType !== 'all') filters.push('is_test=eq.' + (orderType === 'test'));
  const q = sanitizeSearch(sp.get('q'));
  if (q) filters.push(`or=(order_number.ilike.*${q}*,customer_name.ilike.*${q}*,customer_phone.ilike.*${q}*)`);
  for (const [param, col] of [['payment_status', 'payment_status'], ['fulfilment_status', 'fulfilment_status'], ['method', 'payment_method']]) {
    const v = sp.get(param);
    if (v) filters.push(`${col}=eq.${encodeURIComponent(v)}`);
  }
  if(sp.has('date_from')||sp.has('date_to')){
    const dates=new URL('https://fixture.invalid');if(sp.get('date_from'))dates.searchParams.set('from',sp.get('date_from'));if(sp.get('date_to'))dates.searchParams.set('to',sp.get('date_to'));
    const {from,to}=parseRange(dates);filters.push('created_at=gte.'+encodeURIComponent(from.toISOString()),'created_at=lt.'+encodeURIComponent(to.toISOString()));
  }
  const cutoff=new Date().toISOString();filters.push('created_at=lte.'+encodeURIComponent(cutoff));
  const query=[`select=${COLS.join(',')}`,'order=created_at.desc,id.desc',...filters].join('&');
  const data=[];let expected=null;
  for(let offset=0;offset<5000;offset+=500){
    const result=await sb(context,'/rest/v1/orders?'+query,{headers:{Range:offset+'-'+(offset+499)},count:true});
    if(!Array.isArray(result.data)||!Number.isSafeInteger(result.total))httpError('Export count unavailable',503,'export_failed');
    if(expected===null)expected=result.total;
    if(expected>5000)httpError('More than 5,000 orders match. Narrow the date range before exporting.',413,'export_too_large');
    if(result.total!==expected)httpError('Orders changed during export. Retry.',409,'export_changed');
    data.push(...result.data);if(data.length===expected)break;
    if(result.data.length!==500)httpError('Incomplete export page. Retry.',503,'export_incomplete');
  }
  if(data.length!==expected)httpError('Incomplete export',503,'export_incomplete');

  const lines = [COLS.join(',')];
  for (const row of data) lines.push(COLS.map((c) => csvCell(row[c])).join(','));

  await audit(context, {
    actorId: user.id,
    actorRole: role,
    action: 'order.exported_csv', // PROPOSED §5 addition — see CONTRACT_AMENDMENTS.md
    entityType: 'order',
    entityId: 'bulk',
    before: null,
    after: { rows: data.length, cutoff, filters: Object.fromEntries(sp.entries()) },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response('\uFEFF' + lines.join('\r\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="chaskabox-orders-${stamp}.csv"`,
    },
  });
});
