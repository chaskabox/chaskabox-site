import {routeShell,withSeo} from './storefront-html.js';
export async function utilityPage(context,view,path,title,description){
  try {
    const response=await context.env.ASSETS.fetch(new Request(new URL('/',context.request.url)));
    if(!response.ok)throw new Error('Store shell unavailable');
    const html=withSeo(routeShell(await response.text(),view),{title,description,path,noindex:true,schemas:[]}).replace(/\/app\.js\?v=[^"']+/g,'/app.js?v=20261018-perf2');
    return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, follow','X-Content-Type-Options':'nosniff'}});
  }catch{return new Response('Storefront temporarily unavailable',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, follow'}});}
}
