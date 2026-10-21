import {sbRequest} from './_lib/db.js';
import {portalConfig} from '../../account-portal-contract.js';

// Explicit public allowlist: never return arbitrary site settings or account data.
export async function onRequestGet({env}){
 try{
  const rows=await sbRequest(env,'/site_settings',{query:'?key=in.(account_portal,support_email)&select=key,value'});
  const values=Object.fromEntries((rows||[]).map(row=>[row.key,row.value]));
  return Response.json({portal:portalConfig(values.account_portal||{}),support_email:typeof values.support_email==='string'?values.support_email:''},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:{code:'PORTAL_UNAVAILABLE',message:'Portal options unavailable'}},{status:503,headers:{'Cache-Control':'no-store'}});}
}
