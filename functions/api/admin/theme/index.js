/**
 * /api/admin/theme
 * GET — all theme settings. PUT — update settings. Roles: owner, manager.
 * /api/theme (public) — returns active theme for storefront.
 */
import { withAdmin, sb, json, readJson, audit } from '../_lib/auth.js';

export const onRequestGet = withAdmin(['owner', 'manager', 'content'], async (context) => {
  const rows = await sb(context, '/rest/v1/theme_settings?select=*');
  const theme = {};
  (rows || []).forEach(r => { theme[r.key] = r.value; });
  return json({ theme });
});

export const onRequestPut = withAdmin(['owner', 'manager'], async (context, { user }) => {
  const body = await readJson(context.request);
  const settings = body.settings || body;
  if (typeof settings !== 'object') return json({ error: 'Invalid' }, 400);

  for (const [key, value] of Object.entries(settings)) {
    if (typeof value !== 'string') continue;
    await sb(context, '/rest/v1/theme_settings', {
      method: 'POST',
      body: { key, value, updated_at: new Date().toISOString() },
      headers: { 'Prefer': 'resolution=merge-duplicates' },
    });
  }
  await audit(context, user.id, 'theme.updated', { keys: Object.keys(settings) });
  return json({ ok: true });
});
