/**
 * GET /api/admin/analytics/funnel
 * Cart/checkout funnel (Product View → Add to Cart → Cart Viewed →
 * Checkout Started → Order Created).
 *
 * NOT AVAILABLE: no cart_events / session tracking tables exist in the
 * schema (checked database/migrations). We do NOT fabricate funnel
 * numbers. The order fulfilment funnel (placed → delivered) IS available
 * via /api/admin/analytics/overview.
 *
 * Roles: owner, manager.
 */
import { withAdmin, json } from '../_lib/auth.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async () => {
  return json({
    ok: true,
    available: false,
    reason:
      'Cart/checkout event tracking is not implemented: no cart_events, page_views or session tables exist ' +
      'in the database schema. Funnel metrics would require client-side instrumentation first. ' +
      'The order fulfilment funnel (new → sourcing → packed → dispatched → delivered → cancelled) ' +
      'is available at /api/admin/analytics/overview.',
  });
});
