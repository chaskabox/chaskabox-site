/**
 * /api/admin/backup
 * GET ?format=json — export key tables as JSON download. Roles: owner only.
 * POST — import/restore from JSON (with confirmation). Roles: owner only.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';

const BACKUP_TABLES = [
  'products',
  'categories',
  'brands',
  'coupons',
  'shipping_zones',
  'notification_templates',
  'theme_settings',
  'navigation_menus',
  // Note: orders/customers NOT included in auto-backup (large + sensitive).
  // Use Supabase dashboard for full DB backup.
];

export const onRequestGet = withAdmin(['owner'], async (context) => {
  const url = new URL(context.request.url);
  const tables = (url.searchParams.get('tables') || '').split(',').filter(Boolean);
  const toBackup = tables.length ? tables.filter(t => BACKUP_TABLES.includes(t)) : BACKUP_TABLES;

  const backup = {
    version: 1,
    exported_at: new Date().toISOString(),
    tables: {},
  };

  for (const table of toBackup) {
    try {
      const rows = await sb(context, `/rest/v1/${table}?select=*&limit=5000`);
      backup.tables[table] = rows || [];
    } catch (e) {
      backup.tables[table] = { error: e.message };
    }
  }

  const filename = `chaskabox-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

export const onRequestPost = withAdmin(['owner'], async (context, { user }) => {
  const body = await readJson(context.request);
  if (body.confirm !== 'RESTORE') httpError('Confirmation required: send {confirm:"RESTORE"}', 400, 'confirm');
  if (!body.backup || body.backup.version !== 1) httpError('Invalid backup format', 400, 'invalid');

  const results = {};
  for (const [table, rows] of Object.entries(body.backup.tables || {})) {
    if (!BACKUP_TABLES.includes(table) || !Array.isArray(rows)) continue;
    if (!body.tables || body.tables.includes(table)) {
      try {
        // Upsert by id where possible
        const cleaned = rows.map(r => {
          const { created_at, updated_at, ...rest } = r;
          return rest;
        });
        await sb(context, `/rest/v1/${table}`, {
          method: 'POST',
          body: cleaned,
          headers: { 'Prefer': 'resolution=merge-duplicates' },
        });
        results[table] = `restored ${cleaned.length} rows`;
      } catch (e) {
        results[table] = `error: ${e.message}`;
      }
    }
  }

  await audit(context, user.id, 'backup.restored', { tables: Object.keys(results) });
  return json({ ok: true, results });
});
