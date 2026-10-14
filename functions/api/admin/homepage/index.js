/**
 * /api/admin/homepage
 * GET   — all homepage sections (draft + published). Min role: content (contract §3).
 * PATCH — save section visibility/headings immediately and draft_config for explicit publish. Min role: content.
 *         Body: { sections: [{ section_key, draft_config?: {...}, enabled?: bool,
 *                             position?: int, heading?: string, subheading?: string }] }
 * Publish via POST /api/admin/homepage/publish (draft_config → config).
 *
 * Contract §2.7 columns: section_key PK, enabled, position, heading, subheading,
 * config (published), draft_config (unpublished edits), updated_at.
 * Known keys: hero, categories, chaska_picks, boxes, chatpata_picks,
 *             new_items, how_it_works, faq, announcement_bar
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';
import { cmsMutate } from '../_lib/cms-mutate.js';
import { packingVideoSource } from '../../../../packing-video.js';

const KNOWN_KEYS = new Set([
  'hero', 'categories', 'chaska_picks', 'boxes', 'chatpata_picks',
  'new_items', 'how_it_works', 'faq', 'announcement_bar',
]);

const SELECT = 'section_key,enabled,position,heading,subheading,config,draft_config,updated_at';

export const onRequestGet = withAdmin(['owner', 'manager', 'content'], async (context) => {
  const sections = await sb(context, `/rest/v1/homepage_sections?select=${SELECT}&order=position.asc`);
  return json({ sections: sections || [] });
});

export const onRequestPatch = withAdmin(['owner', 'manager', 'content'], async (context, { user, role }) => {
  const body = await readJson(context.request);
  const sections = body.sections;
  if (!Array.isArray(sections) || sections.length === 0 || sections.length > 20) {
    httpError('sections must be a non-empty array (max 20)', 400, 'invalid_sections');
  }

  const operations=sections.map(s=>{
    const key=String(s?.section_key||'');
    if(!KNOWN_KEYS.has(key))httpError('Unknown section',400,'unknown_section');
    const data={updated_by:user.id,updated_at:new Date().toISOString()};
    if(s.draft_config!==undefined){
      if(!s.draft_config||typeof s.draft_config!=='object'||Array.isArray(s.draft_config))httpError('Draft must be an object',400,'invalid_draft');
      if(Object.hasOwn(s.draft_config,'packing_video_url')){
        if(key!=='how_it_works')httpError('Packing video belongs in How it works',400,'invalid_video_section');
        try{packingVideoSource(s.draft_config.packing_video_url);}catch(e){httpError(e.message,400,'invalid_video');}
      }
      data.draft_config=s.draft_config;
    }
    if(s.enabled!==undefined){if(typeof s.enabled!=='boolean')httpError('enabled must be boolean',400,'invalid');data.enabled=s.enabled;}
    if(s.position!==undefined){if(!Number.isInteger(s.position)||Math.abs(s.position)>100000)httpError('Invalid position',400,'invalid');data.position=s.position;}
    for(const f of ['heading','subheading'])if(s[f]!==undefined){if(typeof s[f]!=='string'||s[f].length>500)httpError('Invalid heading',400,'invalid');data[f]=s[f];}
    return {table:'homepage_sections',op:'update',id:key,data};
  });
  const results=await cmsMutate(context,user,operations);
  return json({ sections: results, note: 'Visibility/headings are saved immediately. draft_config becomes live only after POST /api/admin/homepage/publish.' });
});
