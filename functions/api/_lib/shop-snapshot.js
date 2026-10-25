import {rpc} from './db.js';
import {publicCatalogue} from './catalogue-search.js';
import {storefrontConfig} from './storefront-config.js';
import {cataloguePhoto,photoUnderReview} from './catalogue-photos.js';
import {bundleDetails} from './bundle-details.js';
import {readableTheme} from './theme-contract.js';
// One fresh Postgres snapshot replaces three network reads. Never cache prices,
// visibility, or hero publications. Older deployments can use the existing path.
export async function shopSnapshot(env){
 try{
  const data=await rpc(env,'shop_page_snapshot',{});
  if(!Array.isArray(data?.products)||!Array.isArray(data?.bundle_items)||!Array.isArray(data?.manifest?.categories)||data.products.length>10000)throw Error('Invalid shop snapshot');
  const rows=data.products.map(p=>({...p,image_url:cataloguePhoto(p),image_warning:photoUnderReview(p)?'Photo under review':''}));
  return [bundleDetails(rows,data.bundle_items),{...data.manifest,theme:readableTheme(data.manifest.theme)}];
 }catch{
  return Promise.all([publicCatalogue(env),storefrontConfig(env).catch(()=>null)]);
 }
}
