import {routeShell,withSeo,replaceMount,esc} from './storefront-html.js';
export async function utilityPage(context,view,path,title,description){
  try {
    const response=await context.env.ASSETS.fetch(new Request(new URL('/',context.request.url)));
    if(!response.ok)throw new Error('Store shell unavailable');
    let html=routeShell(await response.text(),view);
    if(['cart','wishlist'].includes(view))html=replaceMount(html,'view-'+view,'<section class="section route-loading" role="status"><h1>'+esc(view==='cart'?'Your snack bag':'Your wishlist')+'</h1><p>Loading your saved snacks…</p><a href="/shop/">Browse all snacks →</a></section>');
    html=withSeo(html,{title,description,path,noindex:true,schemas:[]});
    return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, follow','X-Content-Type-Options':'nosniff'}});
  }catch{return new Response('Storefront temporarily unavailable',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, follow'}});}
}
