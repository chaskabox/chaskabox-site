// POST /api/filter-log - log filter/discovery usage (public, anonymous)
import { sbRequest } from './_lib/db.js';
import { ok, apiError } from './_lib/respond.js';
export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const { filter_type, filter_value, page, session_id } = body;
    if (!filter_type) return apiError('VALIDATION_ERROR', 'filter_type required', 400);
    await sbRequest(context.env, '/filter_events', {
      method: 'POST',
      body: { filter_type, filter_value: filter_value || null, page: page || null, session_id: session_id || null },
    }).catch(() => {});
    return ok({ logged: true });
  } catch (e) {
    return ok({ logged: false });
  }
}
