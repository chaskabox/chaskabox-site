/**
 * GET /api/admin/customers
 * Customer directory from the contract `customers` table (§2.5: id, user_id, name, phone).
 * Min role: manager (contract §3). fulfilment sees customer data only inside order
 * context (orders endpoints); content has NO customer access.
 * Enriched with order aggregates (count, lifetime spend, last order) from orders.
 * Query: q (name/phone search), page, per_page.
 */
import { withAdmin, sb, json, pagination, sanitizeSearch } from '../_lib/auth.js';

async function enrich(context, customers) {
  if (!customers.length) return customers;
  const conds = [];
  for (const c of customers) {
    if (c.user_id) conds.push(`user_id.eq.${encodeURIComponent(c.user_id)}`);
    else if (c.phone) conds.push(`customer_phone.eq.${encodeURIComponent(c.phone)}`);
  }
  let orders = [];
  if (conds.length) {
    orders = (await sb(
      context,
      `/rest/v1/orders?or=(${conds.join(',')})&select=user_id,customer_phone,total,payment_method,payment_status,fulfilment_status,created_at,order_number`
    )) || [];
  }
  const stats = new Map();
  for (const o of orders) {
    const key = o.user_id ? `u:${o.user_id}` : `p:${o.customer_phone || ''}`;
    let s = stats.get(key);
    if (!s) { s = { order_count: 0, lifetime_spend: 0, gross_order_value: 0, last_order_at: null, last_order_number: null }; stats.set(key, s); }
    s.order_count += 1;
    const total = Number(o.total) || 0;
    if (o.fulfilment_status !== 'cancelled') s.gross_order_value += total;
    const recognized = o.fulfilment_status !== 'cancelled' && o.payment_status !== 'refunded' && ((o.payment_method === 'cod' && o.fulfilment_status === 'delivered') || (o.payment_method !== 'cod' && o.payment_status === 'payment_verified'));
    if (recognized) s.lifetime_spend += total;
    if (!s.last_order_at || o.created_at > s.last_order_at) {
      s.last_order_at = o.created_at;
      s.last_order_number = o.order_number;
    }
  }
  return customers.map((c) => {
    const key = c.user_id ? `u:${c.user_id}` : `p:${c.phone || ''}`;
    const s = stats.get(key) || { order_count: 0, lifetime_spend: 0, gross_order_value: 0, last_order_at: null, last_order_number: null };
    return { ...c, ...s };
  });
}

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const url = new URL(context.request.url);
  const sp = url.searchParams;
  const { page, per, rangeHeader } = pagination(url, 25, 100);
  const q = sanitizeSearch(sp.get('q'));

  const filters = [];
  if (q) filters.push(`or=(name.ilike.*${q}*,phone.ilike.*${q}*)`);
  const query = ['select=id,user_id,name,phone,created_at', 'order=created_at.desc', ...filters].join('&');
  const { data, total } = await sb(context, `/rest/v1/customers?${query}`, {
    headers: { Range: rangeHeader },
    count: true,
  });

  let customers = data || [];

  // Fallback: if customers table is empty, aggregate from orders
  // (customers are identified by phone; orders always have customer info)
  if (!customers.length && !q && page === 1) {
    try {
      const orders = await sb(context, '/rest/v1/orders?select=customer_name,customer_phone,created_at&order=created_at.desc&limit=1000');
      const seen = new Map();
      (orders || []).forEach(o => {
        const phone = String(o.customer_phone || '').trim();
        if (!phone || seen.has(phone)) return;
        seen.set(phone, {
          id: `order-${phone}`,
          user_id: null,
          name: o.customer_name || 'Customer',
          phone,
          created_at: o.created_at,
        });
      });
      customers = [...seen.values()];
    } catch (e) { /* fallback failed, show empty */ }
  }

  return json({
    customers: await enrich(context, customers),
    page, per_page: per, total: total || customers.length, total_pages: Math.ceil((total || customers.length) / per),
  });
});
