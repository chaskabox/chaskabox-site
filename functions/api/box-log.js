import { sbRequest } from './_lib/db.js';
import { ok, apiError } from './_lib/respond.js';
export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const { box_id, box_name, action, session_id } = body;
    if (!['view','add_to_cart'].includes(action)) return apiError('VALIDATION_ERROR', 'action required', 400);
    await sbRequest(context.env, '/box_events', {
      method: 'POST', body: { box_id: box_id || null, box_name: box_name || null, action, session_id: session_id || null },
    }).catch(() => {});
    return ok({ logged: true });
  } catch (e) { return ok({ logged: false }); }
}
