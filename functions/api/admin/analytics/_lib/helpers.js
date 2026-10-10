/**
 * Shared helpers for /api/admin/analytics/* endpoints.
 * - parseRange: validates ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: last 30 days,
 *   max 366 days). Returns UTC-midnight Date boundaries (to is exclusive).
 * - callRpc: POSTs to a Supabase RPC via the service-role REST client and
 *   converts a "function does not exist" DB error into a clear 503 telling
 *   the owner to apply database/migrations/031_analytics_rpc.sql.
 */
import { httpError } from '../../_lib/auth.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function parseRange(url) {
  const sp = url.searchParams;
  const toDefault = new Date();
  toDefault.setUTCHours(0, 0, 0, 0);
  toDefault.setUTCDate(toDefault.getUTCDate() + 1); // exclusive upper bound
  const fromDefault = new Date(toDefault);
  fromDefault.setUTCDate(fromDefault.getUTCDate() - 30);

  const fromStr = sp.get('from') || isoDate(fromDefault);
  const toStr = sp.get('to') || isoDate(toDefault);

  if (!DATE_RE.test(fromStr) || !DATE_RE.test(toStr)) {
    httpError('Invalid date format. Use YYYY-MM-DD.', 400, 'invalid_date');
  }
  const from = new Date(fromStr + 'T00:00:00Z');
  const to = new Date(toStr + 'T00:00:00Z');
  // UI sends `to` as an inclusive date (e.g. today). Make it exclusive by adding 1 day,
  // unless it was the default (which already adds 1 day above).
  if (sp.get('to')) {
    to.setUTCDate(to.getUTCDate() + 1);
  }
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    isoDate(from) !== fromStr ||
    isoDate(to) !== toStr
  ) {
    httpError('Invalid calendar date.', 400, 'invalid_date');
  }
  if (from >= to) httpError('"from" must be before "to".', 400, 'invalid_range');
  if (to - from > 366 * 86400000) {
    httpError('Date range too large (max 366 days).', 400, 'range_too_large');
  }
  return { from, to, fromStr, toStr };
}

export async function callRpc(context, sb, fn, body) {
  try {
    return await sb(context, `/rest/v1/rpc/${fn}`, { method: 'POST', body });
  } catch (e) {
    let msg = '';
    try {
      msg = e instanceof Response ? await e.text() : String((e && e.message) || e);
    } catch {
      msg = '';
    }
    if (/analytics_/i.test(msg) && /does not exist|not exist|could not find/i.test(msg)) {
      httpError(
        'Analytics database functions are not installed. Apply database/migrations/031_analytics_rpc.sql in the Supabase SQL Editor, then retry.',
        503,
        'analytics_not_installed'
      );
    }
    throw e;
  }
}
