/**
 * /api/theme — public theme settings for storefront
 * Returns active design tokens. Cached.
 */
export async function onRequestGet(context) {
  const { env } = context;
  const url = `${env.SUPABASE_URL}/rest/v1/theme_settings?select=key,value`;
  try {
    const res = await fetch(url, {
      headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    const rows = await res.json();
    const theme = {};
    (rows || []).forEach(r => { theme[r.key] = r.value; });
    return new Response(JSON.stringify({ theme }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ theme: {} }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
