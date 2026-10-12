/**
 * /api/admin/categories/:id
 * GET    — single category with products. Roles: owner, manager, content.
 * PATCH  — update category. Roles: owner, manager, content.
 * DELETE — delete category (safe: only if empty or force). Roles: owner, manager.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';
import { cmsMutate } from '../_lib/cms-mutate.js';

export const onRequestGet = withAdmin(['owner', 'manager', 'content'], async (context) => {
  const id = context.params.id;
  const rows = await sb(context, `/rest/v1/categories?id=eq.${encodeURIComponent(id)}&select=*`);
  const cat = rows?.[0];
  if (!cat) httpError('Category not found', 404, 'not_found');

  const assignments = await sb(context,
    `/rest/v1/category_products?category_id=eq.${encodeURIComponent(id)}&select=product_id,position&order=position.asc`);
  return json({ category: cat, products: assignments || [] });
});

export const onRequestPatch = withAdmin(['owner', 'manager', 'content'], async (context, { user, role }) => {
  const id = context.params.id;
  const body = await readJson(context.request);
  for(const key of ['is_visible','show_on_homepage','hide_if_empty','is_enabled','is_external','is_active'])if(body[key]!==undefined&&typeof body[key]!=='boolean')httpError(`${key} must be boolean`,400,'invalid_field');

  const patch = { updated_at: new Date().toISOString() };
  const fields = ['name', 'slug', 'description', 'image_url', 'mobile_image_url', 'icon',
    'seo_title', 'seo_description', 'box_style', 'link_destination', 'position',
    'is_visible', 'show_on_homepage', 'hide_if_empty', 'product_assignment', 'assignment_rule'];
  fields.forEach(f => { if (body[f] !== undefined) patch[f] = body[f]; });

  const operations=[{table:'categories',op:'update',id,data:patch}];
  if(body.product_ids!==undefined){
    if(!Array.isArray(body.product_ids)||body.product_ids.length>200||body.product_ids.some(v=>!Number.isSafeInteger(v)||v<1)||new Set(body.product_ids).size!==body.product_ids.length)httpError('Invalid product assignments',400,'invalid_assignments');
    patch.assignments_managed=true;
    operations.push({table:'category_products',op:'delete_assignments',id});
    body.product_ids.forEach((product_id,position)=>operations.push({table:'category_products',op:'insert',data:{category_id:id,product_id,position}}));
  }
  const saved=await cmsMutate(context,user,operations);
  const updated=saved[0];
  return json({ category: Array.isArray(updated) ? updated[0] : updated });
});

export const onRequestDelete = withAdmin(['owner', 'manager'], async (context, { user, role }) => {
  const id = context.params.id;
  const force=new URL(context.request.url).searchParams.get('force')==='true';
  await cmsMutate(context,user,[{table:'categories',op:'delete',id,force}]);
  return json({ deleted: true });
});
