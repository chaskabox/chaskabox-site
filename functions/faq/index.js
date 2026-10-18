import {storefrontConfig} from '../api/_lib/storefront-config.js';
import {storeFaqs} from '../api/_lib/faq-content.js';
import {SITE,esc,withSeo,organizationSchema,catalogueUnavailable} from '../api/_lib/storefront-html.js';
import {copyKey} from '../../page-copy-contract.js';
export async function onRequestGet(context){
 try{
  const manifest=await storefrontConfig(context.env),section=manifest.sections?.find(s=>s.section_key==='faq');
  const items=section?.config?.items;
  const faqs=Array.isArray(items)&&items.length?items:storeFaqs(manifest.settings);
  const req=new Request(new URL('/about/',context.request.url)),response=context.next?await context.next(req):await context.env.ASSETS.fetch(req);if(!response.ok)throw Error('FAQ shell unavailable');
  let html=await response.text();const heading=section?.heading||'Frequently asked questions',intro=section?.subheading||'ChaskaBox answers your snack and order questions.';
  const text=s=>'<cb-copy data-cb-copy="'+copyKey(s)+'" style="display:contents">'+esc(s)+'</cb-copy>';
  html=html.replace(/<main\b[^>]*>[\s\S]*?<\/main>/i,'<main class="info-page"><nav class="crumb"><a href="/">Home</a> / FAQs</nav><section class="info-hero"><span class="eyebrow">'+text('Before you order')+'</span><h1>'+text(heading).replace(copyKey(heading),'t_e466bfa9')+'</h1><p>'+text(intro).replace(copyKey(intro),'t_4ced04a5')+'</p></section><article class="info-content">'+faqs.map(f=>'<details><summary>'+esc(f.q)+'</summary><p>'+esc(f.a)+'</p></details>').join('')+'<p><a href="/contact/">Contact support</a> · <a href="/shipping-policy/">Shipping policy</a> · <a href="/refund-policy/">Refund &amp; Resolution</a></p></article></main>');
  html=withSeo(html,{title:'ChaskaBox FAQs — Orders, Payment & Delivery',description:'Answers about ChaskaBox orders, COD advance, prepaid delivery, sourcing and customer support in Pakistan.',path:'/faq/',schemas:[organizationSchema(),{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:SITE+'/'},{'@type':'ListItem',position:2,name:'FAQs',item:SITE+'/faq/'}]}]});
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
 }catch{return catalogueUnavailable();}
}
