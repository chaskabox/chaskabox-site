import {SEO_CATEGORIES} from './catalogue-content.js';
import {esc} from './storefront-html.js';

// Build links from the SAME public catalogue and CMS category assignments as SSR.
// Never advertise an empty or hidden category based on stale static counts.
export function publicCollectionLinks(products=[],manifest=null){
 const rows=(Array.isArray(products)?products:[]).filter(p=>p&&(!p.visibility||p.visibility==='visible'));
 const configs=Array.isArray(manifest?.categories)?manifest.categories:[];
 const result=[];
 const used=new Set();
 const countFor=(name,slug)=>{
  const managed=configs.find(c=>c?.slug===slug||c?.name===name);
  if(managed){
   const ids=new Set((Array.isArray(managed.product_ids)?managed.product_ids:[]).map(Number));
   return rows.filter(p=>ids.has(Number(p.id))).length;
  }
  return rows.filter(p=>String(p.category||'').trim()===name).length;
 };
 for(const [slug,c] of Object.entries(SEO_CATEGORIES)){
  if(slug==='shop'||slug==='bundles')continue;
  const count=countFor(c.name,slug);
  if(count>0){result.push({name:c.name,path:'/category/'+slug+'/',count});used.add(slug);used.add(c.name.toLowerCase().trim());}
 }
 for(const c of configs){
  const slug=String(c?.slug||'').trim(),name=String(c?.name||'').trim();
  if(!/^[a-z0-9-]+$/.test(slug)||!name||used.has(slug)||used.has(name.toLowerCase()))continue;
  const ids=new Set((Array.isArray(c.product_ids)?c.product_ids:[]).map(Number));
  const count=rows.filter(p=>ids.has(Number(p.id))).length;
  if(count>0){result.push({name,path:'/category/'+slug+'/',count});used.add(slug);used.add(name.toLowerCase());}
 }
 const boxCount=rows.filter(p=>p.is_bundle).length;
 if(boxCount)result.push({name:'Chaska Boxes',path:'/bundles/',count:boxCount});
 return result;
}
export function catalogueNavigation(products,manifest,activePath='/shop/'){
 const links=[{name:'All snacks',path:'/shop/',count:null},...publicCollectionLinks(products,manifest)];
 return '<nav class="shop-category-rail" id="shopCategoryRail" aria-label="Browse available snack categories">'+links.map(link=>
  '<a href="'+esc(link.path)+'"'+(link.path===activePath?' class="active" aria-current="page"':'')+'>'+esc(link.name)+(link.count===null?'':' ('+link.count+')')+'</a>'
 ).join('')+'</nav>';
}
