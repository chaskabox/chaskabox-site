/**
 * Shared helpers for /api/admin/analytics/* endpoints.
 * - parseRange: validates ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: last 30 days,
 *   max 366 days). Returns Pakistan-midnight Date boundaries (to is exclusive).
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
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const last30=new Date(today+'T00:00:00Z');last30.setUTCDate(last30.getUTCDate()-29);
  const fromStr=sp.get('from')||isoDate(last30),toStr=sp.get('to')||today;
  if (!DATE_RE.test(fromStr) || !DATE_RE.test(toStr)) {
    httpError('Invalid date format. Use YYYY-MM-DD.', 400, 'invalid_date');
  }
  const from = new Date(fromStr + 'T00:00:00Z');
  const to = new Date(toStr + 'T00:00:00Z');
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    isoDate(from) !== fromStr ||
    isoDate(to) !== toStr
  ) {
    httpError('Invalid calendar date.', 400, 'invalid_date');
  }
  // UI sends `to` as an inclusive date (e.g. today). Make it exclusive by adding 1 day,
  // unless it was the default (which already adds 1 day above).
  if (true) {
    to.setUTCDate(to.getUTCDate() + 1);
  }
  if (from >= to) httpError('"from" must be before "to".', 400, 'invalid_range');
  if (to - from > 366 * 86400000) {
    httpError('Date range too large (max 366 days).', 400, 'range_too_large');
  }
  from.setTime(from.getTime()-5*3600000);to.setTime(to.getTime()-5*3600000);
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
