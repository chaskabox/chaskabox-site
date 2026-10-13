/**
 * Assign one verified, active, owner-uploaded product-media image as a product's
 * primary image. Source URL is always derived on the server, not user supplied.
 * Product visibility/price/pack must not be changed by this operation.
 */
import {withAdmin,sb,json,readJson,httpError} from '../../_lib/auth.js';
import {mediaUrl} from '../../_lib/media.js';
import {cmsMutate} from '../../_lib/cms-mutate.js';

export function validateMediaAssignment({mediaId,productId}){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(mediaId||'')))
    httpError('Invalid media ID',400,'invalid_media');
  if(!Number.isSafeInteger(productId)||productId<=0)
    httpError('Valid product ID required',400,'invalid_product');
  return {mediaId,productId};
}
export const onRequestPost=withAdmin(['owner','manager','content'],async(context,{user})=>{
  const {mediaId,productId}=validateMediaAssignment({
    mediaId:context.params.id,productId:(await readJson(context.request,4*1024)).product_id
  });
  const [mediaRows,productRows]=await Promise.all([
    sb(context,'/rest/v1/media?id=eq.'+encodeURIComponent(mediaId)+'&select=id,bucket,object_path,state'),
    sb(context,'/rest/v1/products?id=eq.'+productId+'&select=id,image_url,updated_at,name,pack')
  ]);
  const asset=mediaRows?.[0],product=productRows?.[0];
  if(!asset||asset.state!=='active'||asset.bucket!=='product-media'||
    !/^[a-z]+\/\d{4}\/\d\d\/[0-9a-f-]{36}\.webp$/i.test(String(asset.object_path||'')))
    httpError('Select an active verified product image',409,'media_not_usable');
  if(!product)httpError('Product not found',404,'product_not_found');
  const url=mediaUrl(context,asset);
  if(product.image_url===url)return json({ok:true,changed:false,product_id:productId,image_url:url});
  const result=await cmsMutate(context,user,[{
    table:'products',op:'update',id:String(productId),
    data:{image_url:url,updated_by:user.id},expected_updated_at:product.updated_at
  }]);
  if(!Array.isArray(result)||!result[0])httpError('Image assignment could not be confirmed',502,'assignment_failed');
  return json({ok:true,changed:true,product_id:productId,image_url:url});
});