/* POST /api/funnel-log — public funnel event logging (no PII).
 * Body: { event: 'product_view'|'add_to_cart'|'cart_viewed'|'checkout_started'|'order_created', product_id?, session_id? }
 * Rate-limited, fire-and-forget from client.
 */
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

const EVENTS = new Set(['product_view', 'add_to_cart', 'cart_viewed', 'checkout_started', 'order_created']);

export async function onRequestPost(context) {
  const { request, env } = context;
  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const event = String(body.event || '');
  if (!EVENTS.has(event)) return json({ error: 'Invalid event' }, 400);
  const product_id = Number(body.product_id) || null;
  let session_id = String(body.session_id || '').slice(0, 64) || null;
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/funnel_events`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ event, product_id, session_id }),
    });
  } catch {}
  return json({ ok: true });
}
