import {rpc} from './db.js';
import {pageKeyForPath,PAGE_COPY_DEFINITIONS} from '../../../page-copy-contract.js';
import {safeJson} from './storefront-html.js';
export async function publishedPageCopy(env,key){
 const rows=await rpc(env,'page_copy_read',{p_keys:['shared',key]});
 const fields={...(rows?.shared?.fields||{}),...(rows?.[key]?.fields||{})};
 const definitions={...PAGE_COPY_DEFINITIONS.shared.fields,...PAGE_COPY_DEFINITIONS[key]?.fields};
 return {...(rows?.[key]||{}),fields,originals:Object.fromEntries(Object.keys(fields).filter(k=>definitions[k]).map(k=>[k,definitions[k].text]))};
}
export function applyPublishedCopy(context,response,content){
 const path=new URL(context.request.url).pathname,key=pageKeyForPath(path);
 if(!key||response.status!==200||!response.headers.get('content-type')?.includes('text/html'))return response;
 // Stream early asset hints while the public copy lookup runs. Every edited
 // element still waits for the same snapshot before its bytes are emitted.
 const ready=Promise.resolve(content||publishedPageCopy(context.env,key)).then(copy=>copy||{fields:{}}).catch(()=>({fields:{}}));
 const rewrite=new HTMLRewriter().on('[data-cb-copy]',{async element(el){const copy=await ready,value=copy.fields?.[el.getAttribute('data-cb-copy')];if(typeof value==='string')el.setInnerContent(value);}})
 .on('[data-cb-placeholder]',{async element(el){const copy=await ready,value=copy.fields?.[el.getAttribute('data-cb-placeholder')];if(typeof value==='string')el.setAttribute('placeholder',value);}})
 .on('head',{element(el){el.onEndTag(async tag=>{const copy=await ready;tag.before('<script type="application/json" id="published-page-copy">'+safeJson(copy)+'</script>',{html:true});});}})
 .on('title',{async element(el){const copy=await ready;if(copy.seo_title)el.setInnerContent(copy.seo_title);}})
 .on('meta[property="og:title"],meta[name="twitter:title"]',{async element(el){const copy=await ready;if(copy.seo_title)el.setAttribute('content',copy.seo_title);}})
 .on('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]',{async element(el){const copy=await ready;if(copy.seo_description)el.setAttribute('content',copy.seo_description);}});
 const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('Cache-Control','no-store');
 return rewrite.transform(new Response(response.body,{status:response.status,headers}));
}
