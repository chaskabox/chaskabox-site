import {withAdmin,json,httpError,readJson} from '../_lib/auth.js';
import {mediaRpc,removeOwnedObject,deleteMedia} from '../_lib/media.js';
export const onRequestGet=withAdmin(['owner','manager'],async(context,{user})=>
 json(await mediaRpc(context,'media_operation_review',{p_actor:user.id,p_page:Number(new URL(context.request.url).searchParams.get('page')||1)})));
export const onRequestPost=withAdmin(['owner','manager'],async(context,{user})=>{
 const body=await readJson(context.request,2048),id=String(body.operation_id||'');
 if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)||body.confirm!==true)httpError('Choose an operation and confirm recovery',400,'invalid_operation');
 // Read the operation by UUID through the protected RPC, never accept a caller-supplied path.
 const operation=await mediaRpc(context,'media_operation_get',{p_actor:user.id,p_id:id});
 if(operation.kind==='delete')return deleteMedia(context,user,operation.media_id);
 const abort=await mediaRpc(context,'media_upload_abort',{p_actor:user.id,p_id:id,p_recovery:true});
 if(abort.media)return json({registered:true,media:abort.media});
 let cleaned=false;try{cleaned=await removeOwnedObject(context,abort);}catch{}
 await mediaRpc(context,'media_upload_cleanup_finish',{p_actor:user.id,p_id:id,p_cleaned:cleaned});
 if(!cleaned)httpError('Storage cleanup is still pending. Review this operation before retrying an upload.',503,'media_cleanup_pending');
 return json({cleaned:true,operation_id:id});
});
