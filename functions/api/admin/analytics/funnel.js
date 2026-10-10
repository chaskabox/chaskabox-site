/**
 * GET /api/admin/analytics/funnel?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Cart/checkout funnel: Product View → Add to Cart → Cart Viewed → Checkout Started → Order Created.
 * Roles: owner, manager.
 */
import { withAdmin, sb, json } from '../_lib/auth.js';
import { parseRange } from './_lib/helpers.js';

const STEPS = ['product_view', 'add_to_cart', 'cart_viewed', 'checkout_started', 'order_created'];
const LABELS = { product_view: 'Product View', add_to_cart: 'Add to Cart', cart_viewed: 'Cart Viewed', checkout_started: 'Checkout Started', order_created: 'Order Created' };

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const { from, to } = parseRange(context);
  const steps = [];
  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i];
    let count = 0;
    try {
      const res = await sb(context, `/rest/v1/funnel_events?event=eq.${s}&created_at=gte.${from}T00:00:00&created_at=lte.${to}T23:59:59&select=id`, { count: true });
      count = res?.total ?? 0;
    } catch { count = 0; }
    const prev = i === 0 ? count : steps[i - 1].count;
    steps.push({ step: s, label: LABELS[s], count, rate: prev > 0 ? +(count / prev).toFixed(3) : (i === 0 ? 1 : 0), dropoff: prev > 0 ? prev - count : 0 });
  }
  return json({ ok: true, available: true, data: { steps, note: 'Counts are event totals (not unique sessions). Drop-off shows absolute loss vs previous step.' } });
});
