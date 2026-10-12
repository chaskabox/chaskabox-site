import {withAdmin,sb,json,pagination,env} from '../_lib/auth.js';
import {uploadMedia,mediaUrl} from '../_lib/media.js';
export const onRequestGet=withAdmin(['owner','manager','content'],async context=>{
  const {page,per,rangeHeader}=pagination(new URL(context.request.url),25,100);
  const {data,total}=await sb(context,'/rest/v1/media?state=neq.deleted&select=*&order=created_at.desc,id.desc',{headers:{Range:rangeHeader},count:true});
  const settings=await sb(context,'/rest/v1/site_settings?key=in.(media_upload_enabled,media_monthly_transform_limit)&select=key,value');
  const policy=Object.fromEntries((settings||[]).map(x=>[x.key,x.value]));
  return json({media:(data||[]).map(m=>({...m,url:m.state==='active'?mediaUrl(context,m):null})),page,per_page:per,total,total_pages:Math.ceil(total/per),processor_available:policy.media_upload_enabled===true&&env(context).MEDIA_TRANSFORM_ENABLED==='true'&&!!env(context).MEDIA_TRANSFORM?.fetch,monthly_app_limit:policy.media_monthly_transform_limit??1000});
});
export const onRequestPost=withAdmin(['owner','manager','content'],(context,{user})=>uploadMedia(context,user));
