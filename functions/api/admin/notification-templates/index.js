/**
 * /api/admin/notification-templates
 * GET — list all templates. Roles: owner, manager.
 */
import { withAdmin, sb, json } from '../_lib/auth.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const templates = await sb(context, '/rest/v1/notification_templates?select=*&order=channel.asc,name.asc');
  return json({ templates: templates || [] });
});
