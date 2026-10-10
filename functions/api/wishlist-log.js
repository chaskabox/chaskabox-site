import { sbRequest } from './_lib/db.js';
import { ok, apiError } from './_lib/respond.js';
export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const { product_id, action, session_id } = body;
    if (!product_id || !['add','remove','to_cart'].includes(action)) return apiError('VALIDATION_ERROR', 'product_id and action required', 400);
    await sbRequest(context.env, '/wishlist_events', {
      method: 'POST', body: { product_id, action, session_id: session_id || null },
    }).catch(() => {});
    return ok({ logged: true });
  } catch (e) { return ok({ logged: false }); }
}
