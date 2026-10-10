/**
 * GET /api/admin/analytics/search?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Search analytics: top queries, no-result searches, volume over time.
 * Roles: owner, manager.
 */
import { withAdmin, sb, json } from '../_lib/auth.js';
import { parseRange } from './_lib/helpers.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const { fromStr, toStr } = parseRange(new URL(context.request.url));
  const base = `/rest/v1/search_logs?created_at=gte.${fromStr}T00:00:00&created_at=lte.${toStr}T23:59:59&select=query,results_count,created_at`;

  const topQ = await sb(context, `${base}&order=created_at.desc&limit=1000`);
  const qmap = {};
  let noResult = 0, total = 0;
  for (const r of (Array.isArray(topQ) ? topQ : [])) {
    total++;
    const q = (r.query || '').toLowerCase().trim();
    if (!q) continue;
    qmap[q] = qmap[q] || { query: r.query, count: 0, noResult: 0 };
    qmap[q].count++;
    if (!r.results_count) { qmap[q].noResult++; noResult++; }
  }
  const top = Object.values(qmap).sort((a, b) => b.count - a.count).slice(0, 25);
  const noResultQueries = Object.values(qmap).filter(q => q.noResult > 0).sort((a, b) => b.noResult - a.noResult).slice(0, 25);

  return json({
    ok: true, available: true,
    data: {
      total_searches: total,
      no_result_searches: noResult,
      no_result_rate: total ? +(noResult / total).toFixed(3) : 0,
      top_queries: top,
      no_result_queries: noResultQueries,
    },
  });
});
