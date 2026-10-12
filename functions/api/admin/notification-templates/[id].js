import {withAdmin,json,httpError,readJson} from '../_lib/auth.js';
import {contentRpc} from '../_lib/content-rpc.js';
export const onRequestPatch=withAdmin(['owner','manager'],async(context,{user})=>{
 const id=Number(context.params.id),body=await readJson(context.request,12000),patch={};
 if(!Number.isSafeInteger(id)||id<1)httpError('Template id required',400);
 if(body.subject!==undefined){if(body.subject!==null&&(typeof body.subject!=='string'||body.subject.length>200))httpError('Invalid subject',400);patch.subject=body.subject;}
 if(body.body!==undefined){if(typeof body.body!=='string'||!body.body.trim()||body.body.length>7000)httpError('Invalid message body',400);patch.body=body.body;}
 if(body.is_active!==undefined){if(typeof body.is_active!=='boolean')httpError('is_active must be boolean',400);patch.is_active=body.is_active;}
 if(!Object.keys(patch).length||typeof body.expected_updated_at!=='string'||!Number.isFinite(Date.parse(body.expected_updated_at)))httpError('Reload the template before saving',400);
 const saved=await contentRpc(context,'admin_template_save',{p_actor:user.id,p_id:id,p_patch:patch,p_expected:body.expected_updated_at});
 return json({template:saved});
});
