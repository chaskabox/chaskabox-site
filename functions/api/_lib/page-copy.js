import {rpc} from './db.js';
import {pageKeyForPath,PAGE_COPY_DEFINITIONS} from '../../../page-copy-contract.js';
import {safeJson} from './storefront-html.js';
export async function publishedPageCopy(env,key){
 const rows=await rpc(env,'page_copy_read',{p_keys:['shared',key]});
 const fields={...(rows?.shared?.fields||{}),...(rows?.[key]?.fields||{})};
 const definitions={...PAGE_COPY_DEFINITIONS.shared.fields,...PAGE_COPY_DEFINITIONS[key]?.fields};
 return {...(rows?.[key]||{}),fields,originals:Object.fromEntries(Object.keys(fields).filter(k=>definitions[k]).map(k=>[k,definitions[k].text]))};
}
export async function applyPublishedCopy(context,response,content){
 const path=new URL(context.request.url).pathname,key=pageKeyForPath(path);
 if(!key||response.status!==200||!response.headers.get('content-type')?.includes('text/html'))return response;
 content=content||await publishedPageCopy(context.env,key);
 const fields=content.fields||{};
 const rewrite=new HTMLRewriter().on('[data-cb-copy]',{element(el){const value=fields[el.getAttribute('data-cb-copy')];if(typeof value==='string')el.setInnerContent(value);}})
 .on('[data-cb-placeholder]',{element(el){const value=fields[el.getAttribute('data-cb-placeholder')];if(typeof value==='string')el.setAttribute('placeholder',value);}})
 .on('head',{element(el){el.append('<script type="application/json" id="published-page-copy">'+safeJson(content)+'</script>',{html:true});}});
 if(content.seo_title)rewrite.on('title',{element(el){el.setInnerContent(content.seo_title);}}).on('meta[property="og:title"],meta[name="twitter:title"]',{element(el){el.setAttribute('content',content.seo_title);}});
 if(content.seo_description)rewrite.on('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]',{element(el){el.setAttribute('content',content.seo_description);}});
 const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('Cache-Control','no-store');
 return rewrite.transform(new Response(response.body,{status:response.status,headers}));
}
