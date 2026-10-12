import {sb,httpError} from './auth.js';
export async function contentRpc(context,name,params) {
  try{return await sb(context,'/rest/v1/rpc/'+name,{method:'POST',body:params});}
  catch(e){
    let message='';if(e instanceof Response)try{message=(await e.clone().json())?.error?.message||'';}catch{}
    if(/STALE_PRODUCT|STALE_TEMPLATE|UNDO_CONFLICT/.test(message))httpError('This content changed. Reload it and review the new values before saving or reverting.',409,'content_conflict');
    throw e;
  }
}
