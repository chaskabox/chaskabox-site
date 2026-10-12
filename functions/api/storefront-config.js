import {rpc} from './_lib/db.js';
import {readableTheme} from './_lib/theme-contract.js';
export async function onRequestGet({env}){
 try{const data=await rpc(env,'storefront_manifest',{});data.theme=readableTheme(data.theme);return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=30,stale-while-revalidate=120'}});}
 catch(e){return new Response(JSON.stringify({error:{code:'CONFIG_UNAVAILABLE',message:'Store settings unavailable'}}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
}
