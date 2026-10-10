/**
 * GET /api/admin/analytics/search
 * Search analytics (queries, no-result searches, click-through).
 *
 * NOT AVAILABLE: no search-query logging table exists in the schema
 * (checked database/migrations). We do NOT fabricate search metrics.
 *
 * Roles: owner, manager.
 */
import { withAdmin, json } from '../_lib/auth.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async () => {
  return json({
    ok: true,
    available: false,
    reason:
      'Search query logging is not implemented: no search_queries / search_log table exists ' +
      'in the database schema. To enable this, instrument the storefront search to log ' +
      '{query, results_count, clicked_product_id} server-side with privacy safeguards, ' +
      'then this endpoint can aggregate it.',
  });
});
