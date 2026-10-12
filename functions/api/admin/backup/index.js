/** Owner-only catalogue/configuration export. Database recovery is separate. */
import { withAdmin, json, httpError, distributedRateLimit } from '../_lib/auth.js';
import { catalogueSnapshot, selectSnapshotTables } from '../_lib/catalogue-snapshot.js';

export const onRequestGet = withAdmin(['owner'], async (context, { user }) => {
  const url = new URL(context.request.url);
  if (url.searchParams.has('format') && url.searchParams.get('format') !== 'json') {
    httpError('Only JSON catalogue snapshots are supported.', 400, 'invalid_format');
  }
  const tables = selectSnapshotTables(url.searchParams.get('tables'));
  const limit = await distributedRateLimit(context, `catalogue-export:${user.id}`, 2, 1);
  if (!limit.allowed) return json({ error: { code: 'RATE_LIMITED', message: 'Wait before downloading another snapshot.' } }, 429, {
    'Retry-After': String(limit.retryAfterSec), 'Cache-Control': 'no-store',
  });

  try {
    const snapshot = await catalogueSnapshot(context, tables);
    const filename = `chaskabox-catalogue-${snapshot.exported_at.slice(0, 10)}.json`;
    return new Response(JSON.stringify(snapshot, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    return json({ error: { code: 'SNAPSHOT_FAILED', message: 'The snapshot could not be completed. Try again when catalogue editing has stopped.' } }, 503, { 'Cache-Control': 'no-store' });
  }
});

export const onRequestPost = withAdmin(['owner'], async () => json({
  error: { code: 'RESTORE_UNAVAILABLE', message: 'JSON restore is paused. Use a verified database backup and an isolated recovery target.' },
}, 503, { 'Cache-Control': 'no-store' }));
