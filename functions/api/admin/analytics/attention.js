/**
 * GET /api/admin/analytics/attention
 * "Needs Attention" panel: real issues computed from live data —
 * notification failures, products missing images, orders stuck 5+ days,
 * Chaska Boxes with no items, 30-day non-sellers, dead queue entries.
 * An item appears only when its count > 0 (no fake urgency).
 * Roles: owner, manager.
 */
import { withAdmin, sb, json } from '../_lib/auth.js';
import { callRpc } from './_lib/helpers.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const data = await callRpc(context, sb, 'analytics_attention', {});
  return json({ ok: true, data });
});
