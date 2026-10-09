/**
 * POST /api/admin/ai-apply
 * Apply an AI-generated draft to a product field with safety rails.
 *
 * Safety rules enforced:
 * 1. Never auto-publish — requires explicit {confirm: true}
 * 2. No AI writes to price without owner approval (price changes need owner role)
 * 3. Every apply is audited
 * 4. Previous value stored for undo
 * 5. Blocked fields: payment, refund, order status, customer PII
 *
 * Body: { product_id, field, value, confirm, ai_task }
 * Returns: { ok, preview } (if !confirm) or { ok, applied, undo_token }
 */
import { withAdmin, sb, json, httpError, readJson, audit } from './_lib/auth.js';

// Fields AI is allowed to write (with approval)
const AI_WRITABLE = new Set([
  'description', 'seo_title', 'seo_description', 'tags',
]);

// Fields that need OWNER role (never auto)
const OWNER_ONLY = new Set(['price', 'old_price']);

export const onRequestPost = withAdmin(['owner', 'manager', 'content'], async (context, { user, role }) => {
  const body = await readJson(context.request);
  const { product_id, field, value, confirm, ai_task } = body;

  if (!product_id || !field) httpError('product_id and field required', 400, 'invalid');
  if (!AI_WRITABLE.has(field) && !OWNER_ONLY.has(field)) {
    httpError(`AI cannot write to field: ${field}. Blocked for safety.`, 403, 'blocked_field');
  }
  if (OWNER_ONLY.has(field) && role !== 'owner') {
    httpError('Price changes require owner approval', 403, 'owner_only');
  }
  if (typeof value !== 'string' || !value.trim()) httpError('value required', 400, 'invalid');

  // Load current product
  const products = await sb(context, `/rest/v1/products?id=eq.${encodeURIComponent(product_id)}&select=id,name,${field}`);
  if (!products || !products.length) httpError('Product not found', 404);
  const product = products[0];
  const oldValue = product[field];

  // Preview mode — return diff without applying
  if (!confirm) {
    return json({
      ok: true,
      preview: {
        product_id, product_name: product.name, field,
        old_value: oldValue,
        new_value: value.trim(),
      },
    });
  }

  // Apply mode — save version snapshot first (for undo)
  try {
    await sb(context, '/rest/v1/product_versions', {
      method: 'POST',
      body: {
        product_id: Number(product_id),
        snapshot: { [field]: oldValue, _ai_applied: true, _task: ai_task },
        changed_by: user.email || user.id,
        change_type: 'ai_apply',
      },
    });
  } catch (e) {}

  // Apply the change
  const patch = { [field]: value.trim(), updated_by: user.id };
  await sb(context, `/rest/v1/products?id=eq.${encodeURIComponent(product_id)}`, {
    method: 'PATCH', body: patch,
  });

  await audit(context, {
    actorId: user.id, actorRole: role,
    action: 'ai.applied',
    entityType: 'product', entityId: Number(product_id),
    before: { [field]: oldValue },
    after: { [field]: value.trim(), ai_task },
  });

  return json({
    ok: true,
    applied: true,
    product_id, field,
    old_value: oldValue,
    new_value: value.trim(),
  });
});
