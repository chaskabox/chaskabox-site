/**
 * POST /api/admin/products/bulk
 * Atomic, audited visibility actions. The browser cannot submit CMS operations.
 * Never bulk-delete product data or change prices in this endpoint.
 */
import { withAdmin, sb, json, readJson, httpError } from '../_lib/auth.js';
import { cmsMutate } from '../_lib/cms-mutate.js';

const TARGETS={show:'visible',hide:'hidden',archive:'archived',restore:'hidden'};
const MAX_PRODUCTS=50;
export function parseBulkRequest(body){
  if(!body || typeof body!=='object' || Array.isArray(body))httpError('Invalid bulk action',400,'invalid_bulk');
  const action=body.action;
  if(!Object.hasOwn(TARGETS,action))httpError('Unsupported bulk action',400,'invalid_action');
  const ids=body.ids;
  if(!Array.isArray(ids)||ids.length===0||ids.length>MAX_PRODUCTS||
    ids.some(id=>!Number.isSafeInteger(id)||id<1))httpError('Select 1 to 50 valid product IDs',400,'invalid_ids');
  const unique=[...new Set(ids)];
  if(unique.length!==ids.length)httpError('Duplicate product IDs',400,'duplicate_ids');
  return {action,ids:unique,target:TARGETS[action]};
}

export const onRequestPost=withAdmin(['owner','manager','content'],async(context,{user})=>{
  const {action,ids,target}=parseBulkRequest(await readJson(context.request,16*1024));
  const rows=await sb(context,
    '/rest/v1/products?select=id,visibility,updated_at,is_bundle&id=in.('+ids.join(',')+')');
  if(!Array.isArray(rows)||rows.length!==ids.length)httpError('A selected product is missing. Refresh the catalogue.',409,'stale_selection');
  const products=new Map(rows.map(p=>[Number(p.id),p]));
  const operations=[];
  for(const id of ids){
    const product=products.get(id);
    if(!product)httpError('A selected product is missing. Refresh the catalogue.',409,'stale_selection');
    if(product.is_bundle)httpError('Manage Chaska Boxes using the Box Builder, not product bulk actions.',409,'bundle_protected');
    if(action==='restore'&&product.visibility!=='archived')httpError('Restore accepts archived products only',409,'invalid_state');
    if(action!=='restore' && product.visibility==='archived')httpError('Restore archived products before editing their visibility',409,'invalid_state');
    if(product.visibility===target)continue;
    operations.push({
      table:'products',op:'update',id:String(id),
      data:{visibility:target,updated_by:user.id},
      expected_updated_at:product.updated_at,
    });
  }
  if(!operations.length)return json({ok:true,changed:0,skipped:ids.length,action});
  const updated=await cmsMutate(context,user,operations);
  return json({ok:true,changed:updated.length,skipped:ids.length-updated.length,action});
});