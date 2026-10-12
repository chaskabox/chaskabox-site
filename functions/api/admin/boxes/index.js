/**
 * /api/admin/boxes
 * GET  — list Chaska Boxes (products with is_bundle=true) + item counts. Roles: owner, manager, content.
 * POST — create a box: creates the bundle product (is_bundle=true, visibility='draft')
 *        and its bundle_items with a unit-price snapshot. Roles: owner, manager, content.
 * Body: { title, description?, selling_price (int PKR), image_url?, visibility?: draft|hidden,
 *         items: [{ product_id, quantity (1..99) }] (1..50 components) }
 * Retail value + savings are computed SERVER-SIDE from trusted product prices.
 */
import { withAdmin, sb, json, httpError, readJson, pagination, audit, uuid } from '../_lib/auth.js';
import { computeRetail, savingsSummary } from '../_lib/boxes.js';

function slugify(title) {
  return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || `box-${uuid().slice(0, 8)}`;
}

export const onRequestGet = withAdmin(['owner', 'manager', 'content'], async (context) => {
  const url = new URL(context.request.url);
  const { page, per, rangeHeader } = pagination(url, 25, 100);
  const { data, total } = await sb(
    context,
    '/rest/v1/products?is_bundle=eq.true&bundle_kind=eq.curated&select=id,slug,name,price,old_price,visibility,stock_state,image_url,updated_at&order=updated_at.desc',
    { headers: { Range: rangeHeader }, count: true }
  );
  const boxes = data || [];
  // Fetch item counts for each box
  if (boxes.length) {
    const ids = boxes.map(b => b.id).join(',');
    const items = await sb(context,
      `/rest/v1/bundle_items?bundle_product_id=in.(${ids})&select=bundle_product_id`).catch(() => []);
    const counts = {};
    (items || []).forEach(i => { counts[i.bundle_product_id] = (counts[i.bundle_product_id] || 0) + 1; });
    boxes.forEach(b => { b.item_count = counts[b.id] || 0; });
  }
  return json({ boxes, page, per_page: per, total, total_pages: Math.ceil(total / per) });
});

export const onRequestPost = withAdmin(['owner','manager','content'],async(context,{user})=>{
 const input=await readJson(context.request,32768);
 const box=await sb(context,'/rest/v1/rpc/admin_box_save',{method:'POST',body:{p_actor:user.id,p_id:null,p_input:input}});
 return json({box,...savingsSummary(box.old_price,box.price)},201);
});
