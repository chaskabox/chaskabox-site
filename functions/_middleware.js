import {pageKeyForPath} from '../page-copy-contract.js';
import {applyPublishedCopy,publishedPageCopy} from './api/_lib/page-copy.js';
const HEADERS={
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
 'X-Frame-Options':'SAMEORIGIN','Strict-Transport-Security':'max-age=31536000',
 'Permissions-Policy':'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
 'Content-Security-Policy':"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://challenges.cloudflare.com https://www.clarity.ms https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com https://*.clarity.ms https://c.bing.com https://cloudflareinsights.com; frame-src 'self' https://challenges.cloudflare.com https://www.youtube-nocookie.com; form-action 'self'; upgrade-insecure-requests"
};
export async function onRequest(context){
 const url=new URL(context.request.url),key=pageKeyForPath(url.pathname);
 const copy=key&&context.request.method==='GET'?publishedPageCopy(context.env,key).catch(()=>null):null;
 let response=await context.next();
 if(copy)response=applyPublishedCopy(context,response,copy);
 const headers=new Headers(response.headers);for(const [k,v]of Object.entries(HEADERS))headers.set(k,v);
 if(url.pathname==='/'&&context.request.method==='GET'&&response.status===200)headers.append('Link','</storefront-bundle.css?v=20261020-close1>; rel=preload; as=style, </images/chaskabox-approved-hero-01-20261018.avif>; rel=preload; as=image; fetchpriority=high');
 if(url.pathname.startsWith('/api/admin/')){headers.set('Cache-Control','no-store');headers.set('X-Robots-Tag','noindex, nofollow');}
 if(context.env.RUNTIME_ENV==='staging'||url.hostname.endsWith('.pages.dev'))headers.set('X-Robots-Tag','noindex, nofollow');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
