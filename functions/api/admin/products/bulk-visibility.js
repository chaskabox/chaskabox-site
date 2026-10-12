/**
 * POST /api/admin/products/bulk-visibility
 * Bulk show/hide for products. Min role: manager (contract §3).
 * Body: { "ids": [1,2,3...], "visibility": "visible" | "hidden" | "draft" }
 * ('archived' is excluded — archiving is a deliberate per-product action.)
 * Max 200 ids per call. Each product change is audit-logged (product.visibility_changed, §5).
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';
import { cmsMutate } from '../_lib/cms-mutate.js';

const ALLOWED = new Set(['visible', 'hidden', 'draft']);

export const onRequestPost = withAdmin(['owner', 'manager'], async (context, { user, role }) => {
  const body = await readJson(context.request);
  const ids = body.ids;
  const visibility = body.visibility;

  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) {
    httpError('ids must be a non-empty array (max 200)', 400, 'invalid_ids');
  }
  if (!ALLOWED.has(visibility)) httpError("visibility must be 'visible', 'hidden' or 'draft'", 400, 'invalid_visibility');

  const cleanIds = [...new Set(ids.map((v) => String(v)))].filter((v) => v.length > 0 && v.length < 40);
  if (cleanIds.length === 0) httpError('no valid ids', 400, 'invalid_ids');

  if(cleanIds.some(id=>!/^\d+$/.test(id)))httpError('Invalid product id',400,'invalid_ids');
  const updated=await cmsMutate(context,user,cleanIds.map(id=>({table:'products',op:'update',id,data:{visibility,updated_by:user.id}})));
  return json({ updated: (updated || []).length, visibility, ids: cleanIds });
});
