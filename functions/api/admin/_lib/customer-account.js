import {sb,httpError} from './auth.js';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function accountId(value){if(!UUID.test(String(value||'')))httpError('Invalid account id',400);return String(value);}
export async function accountRpc(c,name,body){
 try{return await sb(c,'/rest/v1/rpc/'+name,{method:'POST',body});}
 catch(e){if(e instanceof Response){let message='';try{message=(await e.clone().json())?.error?.message||'';}catch{}
  if(message.includes('STALE_ACCOUNT'))httpError('These details changed elsewhere. Reload and review before saving.',409,'account_conflict');
  if(message.includes('Account not found')||message.includes('Address not found'))httpError('Account or address not found',404);
 }throw e;}
}
