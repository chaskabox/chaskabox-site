export const SITE='https://chaskabox.online';
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const safeJson=s=>JSON.stringify(s).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export function replaceMount(html,id,content){
 const match=new RegExp('<div\\b[^>]*\\bid="'+id+'"[^>]*>','i').exec(html);if(!match)throw Error('Route mount unavailable: '+id);
 const start=match.index+match[0].length;let depth=1,end=start;const tags=/<\/?div\b[^>]*>/gi;tags.lastIndex=start;
 for(let m;(m=tags.exec(html));){depth+=m[0].startsWith('</')?-1:1;if(!depth){end=m.index;return html.slice(0,start)+content+html.slice(end);}}
 throw Error('Unclosed route mount');
}
export function routeShell(html,active){
 // Non-home catalogue pages must not download the homepage-only hero image.
 if(active!=='home'){
  html=html.replace(/<link\b[^>]*\bdata-home-preload\b[^>]*>/gi,'');
  // Eager images can still download inside hidden route containers. Retain the
  // approved scene for client navigation, but don't compete with this route.
  html=html.replace(/<img\b[^>]*\bclass="[^"]*\bhero-scene\b[^"]*"[^>]*>/gi,tag=>tag.replace(/\s(?:loading|fetchpriority)="[^"]*"/gi,'').replace(/>$/,' loading="lazy" fetchpriority="low">'));
 }
 return html.replace(/<div\b[^>]*\bid="view-([^"]+)"[^>]*>/gi,(tag,id)=>{tag=tag.replace(/\s(?:style|hidden|inert|aria-hidden)(?:="[^"]*")?/g,'');return id===active?tag:tag.slice(0,-1)+' style="display:none" hidden inert aria-hidden="true">';});
}
export function organizationSchema(){return {'@context':'https://schema.org','@type':'OnlineStore','@id':SITE+'/#organization',name:'ChaskaBox',alternateName:'ChaskaBox Pakistan',url:SITE+'/',logo:SITE+'/images/logo-approved-20261017.png',description:'Pakistani packaged snacks and curated retail snack boxes sourced after order, with delivery across Pakistan.',slogan:'Bachpan Ka Zaiqa, Ab Ghar Baithe',telephone:'+92-332-0005381',email:'Chaskabox.mzg@gmail.com',currenciesAccepted:'PKR',paymentAccepted:'Cash on Delivery, JazzCash, Bank Transfer',address:{'@type':'PostalAddress',streetAddress:'Near Ahmad Drink Corner, Railway Road, Bhatti Hussainabad',addressLocality:'Muzaffargarh',addressRegion:'Punjab',addressCountry:'PK'},areaServed:{'@type':'Country',name:'Pakistan'},contactPoint:{'@type':'ContactPoint',contactType:'customer support',telephone:'+92-332-0005381',email:'Chaskabox.mzg@gmail.com',areaServed:'PK',availableLanguage:['English','Urdu']},hasMerchantReturnPolicy:{'@type':'MerchantReturnPolicy',merchantReturnLink:SITE+'/refund-policy/'}};}
export function withSeo(html,{title,description,path,noindex=false,type='website',image=SITE+'/images/logo-approved-20261017.png',schemas=[],seed=''}){
 html=html.replace(/<title>[\s\S]*?<\/title>/gi,'').replace(/<meta\b[^>]*(?:name|property)=["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi,'').replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi,'').replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,'');
 const url=SITE+path,head='<title>'+esc(title)+'</title><meta name="description" content="'+esc(description)+'"><meta name="robots" content="'+(noindex?'noindex,follow':'index,follow')+'"><link rel="canonical" href="'+esc(url)+'"><meta property="og:type" content="'+type+'"><meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(description)+'"><meta property="og:url" content="'+esc(url)+'"><meta property="og:image" content="'+esc(image)+'"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="'+esc(title)+'"><meta name="twitter:description" content="'+esc(description)+'"><meta name="twitter:image" content="'+esc(image)+'">'+schemas.map((s,i)=>'<script type="application/ld+json" id="'+(i===0?'store-schema':'collection-schema-'+i)+'">'+safeJson(s)+'</script>').join('')+seed;
 return html.replace('</head>',head+'</head>');
}
export function catalogueUnavailable(status=503){return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>Catalogue unavailable | ChaskaBox</title></head><body><main><h1>'+(status===404?'This collection is not available.':'The catalogue is temporarily unavailable.')+'</h1><p><a href="/shop/">Browse current snacks</a></p></main></body></html>',{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});}
