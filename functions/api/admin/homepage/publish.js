/**
 * POST /api/admin/homepage/publish
 * Explicit publish: copies draft_config → config for the given section keys
 * (or all sections when keys omitted). Min role: manager (contract §3).
 * Body: { "keys": ["hero", "faq"] }  (optional)
 * Audit event: homepage.published (§5).
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';
import { cmsMutate } from '../_lib/cms-mutate.js';

export const onRequestPost = withAdmin(['owner', 'manager'], async (context, { user, role }) => {
  const body = await readJson(context.request);
  let filter = '';
  if (body.keys !== undefined) {
    if (!Array.isArray(body.keys) || body.keys.length === 0 || body.keys.length > 20) {
      httpError('keys must be a non-empty array (max 20)', 400, 'invalid_keys');
    }
    const keys = body.keys.map((k) => String(k));
    filter = `&section_key=in.(${keys.map(encodeURIComponent).join(',')})`;
  }

  const sections = await sb(context, `/rest/v1/homepage_sections?select=section_key,draft_config,config${filter}`);
  if (!sections || sections.length === 0) httpError('No matching sections', 404, 'not_found');

  const operations=sections.map(s=>({table:'homepage_sections',op:'publish',id:s.section_key}));
  const saved=await cmsMutate(context,user,operations);
  const published=saved.map(s=>s.section_key);
  return json({ published, count: published.length });
});
