import {copyKey} from '../../page-copy-contract.js';
import {publicCatalogue} from '../api/_lib/catalogue-search.js';
import {catalogueCard} from '../api/_lib/catalogue-page.js';
import {SITE,esc,safeJson,withSeo,organizationSchema,catalogueUnavailable} from '../api/_lib/storefront-html.js';
export const OCCASIONS={
 'bachpan':{name:'Bachpan snacks',title:'Bachpan Snacks Online in Pakistan | ChaskaBox',description:'Rediscover familiar Pakistani snacks. Compare sealed retail packs, prices and sourcing details, then build your own bag.',ids:[69,76,156],intro:'Familiar fruity sweets and jellies for a small nostalgia break. Start with these listed packs, then add or remove items in your bag.'},
 'movie-night':{name:'Movie night snacks',title:'Movie Night Snacks in Pakistan | ChaskaBox',description:'Build a movie night snack selection from Pakistani savory snacks and biscuits. Exact packs and current prices at ChaskaBox.',ids:[233,235,11],intro:'A savory and sweet selection for the sofa. Compare the pack quantities and adjust your bag for the number of people joining you.'},
 'office':{name:'Office snack break',title:'Office Snack Packs in Pakistan | ChaskaBox',description:'Explore biscuits, sweets and savory packs for office snack breaks. Compare listed pack counts and current ChaskaBox prices.',ids:[11,55,183],intro:'Biscuits, sweets and a savory pack for a shared break. Check the original labels and ask about allergens before ordering for a group.'}
};
export async function onRequestGet(context){
 const parts=Array.isArray(context.params.slug)?context.params.slug:[context.params.slug],slug=parts[0],copy=OCCASIONS[slug];
 // Pages optional catch-all routes also receive the collection index request.
 if(!parts.length||parts.length===1&&!slug)return context.next?context.next():context.env.ASSETS.fetch(context.request);
 if(parts.length!==1||!copy)return catalogueUnavailable(404);
 try{
  const all=await publicCatalogue(context.env),rows=copy.ids.map(id=>all.find(p=>Number(p.id)===id&&p.stock_state!=='unavailable')).filter(Boolean),complete=rows.length===copy.ids.length;
  const subtotal=rows.reduce((n,p)=>n+Number(p.price),0),path='/snack-boxes/'+slug+'/';
  const shellRequest=new Request(new URL('/about/',context.request.url));const response=context.next?await context.next(shellRequest):await context.env.ASSETS.fetch(shellRequest);if(!response.ok)throw Error('Occasion shell unavailable');
  let html=await response.text();const main='<main class="section"><div class="crumbs"><a href="/">Home</a> › <a href="/snack-boxes/">Snack occasions</a></div><span class="eyebrow">BUILD YOUR OWN CHASKA</span><h1 data-cb-copy="'+copyKey(copy.name)+'">'+esc(copy.name)+'</h1><p data-cb-copy="'+copyKey(copy.intro)+'">'+esc(copy.intro)+'</p><div class="occasion-note">These are individually priced retail packs. You can edit the selection in your bag. No special gift packaging or additional bundle discount is promised. Delivery and charges are confirmed at checkout.</div><div class="occasion-products">'+rows.map(catalogueCard).join('')+'</div><p><b>Current selected pack subtotal: Rs. '+subtotal.toLocaleString('en-PK')+'</b></p>'+(!complete?'<p>Some suggested packs are not available right now. Browse the available packs above or choose your own snacks.</p>':'')+'<button class="cta" type="button" id="addOccasion" '+(!complete?'disabled':'')+'>Add these '+rows.length+' packs to Bag</button><p id="occasionStatus" role="status" aria-live="polite"></p><p><a href="/shop/">Choose more snacks</a> · <a href="/guides/choosing-a-snack-box/">How to compare packs</a> · <a href="/shipping-policy/">Delivery details</a></p></main>';
  html=html.replace(/<main\b[^>]*>[\s\S]*?<\/main>/i,main);
  const schema={'@context':'https://schema.org','@type':'CollectionPage',name:copy.name,url:SITE+path,mainEntity:{'@type':'ItemList',numberOfItems:rows.length,itemListElement:rows.map((p,i)=>({'@type':'ListItem',position:i+1,url:SITE+'/product/'+p.id+'/',name:p.name}))}};
  html=withSeo(html,{title:copy.title,description:copy.description,path,noindex:rows.length===0,schemas:[organizationSchema(),schema],seed:'<script type="application/json" id="occasion-selection">'+safeJson({ids:copy.ids})+'</script>'});
  html=html.replace('</body>','<script src="/occasion-runtime.js?v=20261015-shopping-recheck" defer></script></body>');
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
 }catch{return catalogueUnavailable();}
}
