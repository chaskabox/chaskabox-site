// POST /api/search-click - log product click from search
import { sbRequest } from './_lib/db.js';
import { ok } from './_lib/respond.js';
export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const { product_id, query, session_id } = body;
    if (!product_id) return ok({ logged: false });
    // Update the most recent search log for this session/query, or insert a click record
    await sbRequest(context.env, '/search_logs', {
      method: 'POST',
      body: { query: (query || '').slice(0, 200), results_count: 0, clicked_product_id: product_id, session_id: session_id || null },
    }).catch(() => {});
    return ok({ logged: true });
  } catch (e) { return ok({ logged: false }); }
}
