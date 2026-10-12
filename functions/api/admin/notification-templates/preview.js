import {withAdmin,sb,json,httpError,readJson} from '../_lib/auth.js';
import {previewNotificationTemplate} from '../../_lib/notification-delivery.js';
export const onRequestPost=withAdmin(['owner','manager'],async(context)=>{
 const body=await readJson(context.request,12000),id=Number(body.id);
 if(!Number.isSafeInteger(id)||id<1)httpError('Template id required',400);
 const rows=await sb(context,'/rest/v1/notification_templates?id=eq.'+id+'&select=*&limit=1');if(!rows?.length)httpError('Template not found',404);
 const template={...rows[0]};
 for(const k of ['subject','body'])if(body[k]!==undefined){if(typeof body[k]!=='string'||body[k].length>(k==='subject'?200:7000))httpError('Invalid preview field',400);template[k]=body[k];}
 const policyRows=await sb(context,'/rest/v1/public_site_settings?key=in.(delivery_estimate,support_email,support_whatsapp)&select=key,value&limit=3');
 const policy=Object.fromEntries((policyRows||[]).map(r=>[r.key,r.value]));
 try{return json({preview:previewNotificationTemplate(template,policy),saved_version:rows[0].version});}catch{httpError('Invalid template placeholder or content',422,'invalid_template');}
});
