import {sbRequest} from './_lib/db.js';
import {readableTheme} from './_lib/theme-contract.js';
export async function onRequestGet({env}){
 try{const rows=await sbRequest(env,'/theme_settings',{query:'?select=key,value'});const theme=readableTheme(Object.fromEntries(rows.map(r=>[r.key,r.value])));return new Response(JSON.stringify({theme}),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=30'}});}
 catch(e){return new Response(JSON.stringify({error:{code:'THEME_UNAVAILABLE',message:'Theme unavailable'}}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
}
