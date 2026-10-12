/**
 * /api/admin/boxes/:id
 * GET   — box detail with components (incl. unit-price snapshots). Roles: owner, manager, content.
 * PATCH — update box: title/description/selling_price/image_url/visibility and/or
 *         full component replacement { items: [...] }. Recomputes retail + savings
 *         server-side. Roles: owner, manager, content.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';
import { computeRetail, savingsSummary } from '../_lib/boxes.js';

async function loadBox(context, id) {
  const rows = await sb(context, `/rest/v1/products?id=eq.${encodeURIComponent(id)}&is_bundle=eq.true&select=*`);
  const box = rows && rows[0];
  if (!box) httpError('Box not found', 404, 'not_found');
  return box;
}

async function loadItems(context, boxId) {
  const items = (await sb(
    context,
    `/rest/v1/bundle_items?bundle_product_id=eq.${encodeURIComponent(boxId)}&select=bundle_product_id,component_product_id,quantity`
  )) || [];
  if (items.length === 0) return items;
  const ids = [...new Set(items.map((i) => String(i.component_product_id)))];
  const prods = (await sb(
    context,
    `/rest/v1/products?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,name,price`
  )) || [];
  const byId = new Map(prods.map((p) => [String(p.id), p]));
  return items.map((i) => ({ ...i, product: byId.get(String(i.component_product_id)) || null }));
}

export const onRequestGet = withAdmin(['owner', 'manager', 'content'], async (context) => {
  const box = await loadBox(context, context.params.id);
  const items = await loadItems(context, box.id);
  return json({ box, items });
});

export const onRequestPatch = withAdmin(['owner','manager','content'],async(context,{user})=>{
 const input=await readJson(context.request,32768);
 const id=Number(context.params.id);if(!Number.isSafeInteger(id)||id<1)httpError('Invalid box id',400);
 const box=await sb(context,'/rest/v1/rpc/admin_box_save',{method:'POST',body:{p_actor:user.id,p_id:id,p_input:input}});
 return json({box,items:await loadItems(context,box.id),pricing:savingsSummary(box.old_price,box.price)});
});
