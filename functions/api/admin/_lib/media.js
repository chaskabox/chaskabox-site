import {sb,httpError,env,json} from './auth.js';
import {takeToken} from '../../_lib/rate-limit.js';
import {boundedBytes,validateImageMime,MAX_IMAGE_BYTES,MAX_NORMALIZED_BYTES} from '../../_lib/media-bytes.js';
export async function mediaRpc(context,name,params){
  try{return await sb(context,'/rest/v1/rpc/'+name,{method:'POST',body:params});}
  catch(e){
    let message='';if(e instanceof Response)try{message=(await e.clone().json())?.error?.message||'';}catch{}
    if(/MEDIA_REFERENCED|MEDIA_UNAVAILABLE|MEDIA_OPERATION_CONFLICT/.test(message))httpError('This image is in use or has a pending operation. Refresh media before trying again.',409,'media_conflict');
    if(/MEDIA_UPLOAD_DISABLED/.test(message))httpError('Image uploads are paused until the secure processor is enabled.',503,'media_upload_disabled');
    if(/MEDIA_MONTHLY_LIMIT/.test(message))httpError('The monthly image processing limit has been reached.',429,'media_limit');
    if(/Active.*staff required/.test(message))httpError('Your current staff role cannot perform this media action.',403,'forbidden');
    throw e;
  }
}
export async function readImageForm(request){
  const type=request.headers.get('Content-Type')||'';
  if(type.length>512||!/^multipart\/form-data;\s*boundary=/i.test(type))httpError('Use multipart/form-data with a file field',400,'bad_content_type');
  const max=MAX_IMAGE_BYTES+65536;
  if(Number(request.headers.get('Content-Length'))>max)httpError('Upload exceeds 5MB',413,'file_too_large');
  let bytes;try{bytes=await boundedBytes(request.body,max);}catch(e){httpError(e.message==='IMAGE_TOO_LARGE'?'Upload exceeds 5MB':'Empty upload',e.message==='IMAGE_TOO_LARGE'?413:400,'invalid_upload');}
  const form=await new Response(bytes,{headers:{'Content-Type':type}}).formData().catch(()=>null);
  const file=form?.get('file');if(!file||typeof file.arrayBuffer!=='function')httpError('No file uploaded',400,'missing_file');
  if(file.size<1||file.size>MAX_IMAGE_BYTES)httpError('File must be 1 byte to 5MB',413,'file_too_large');
  const image=new Uint8Array(await file.arrayBuffer());let mime;
  try{mime=validateImageMime(image,file.type||'');}catch{httpError('Upload a valid JPEG, PNG, WebP or AVIF image',415,'bad_mime');}
  return {form,image,mime};
}
export function mediaUrl(context,asset){return env(context).SUPABASE_URL+'/storage/v1/object/public/'+asset.bucket+'/'+asset.object_path;}
async function storage(context,operation,method,body){
  const e=env(context),base=e.SUPABASE_URL+'/storage/v1/object/'+operation.bucket;
  return fetch(method==='POST'?base+'/'+operation.object_path:base,{method,
    headers:{apikey:e.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+e.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type':method==='POST'?(operation.object_path.endsWith('.png')?'image/png':'image/webp'):'application/json','x-upsert':'false'},
    body:method==='POST'?body:JSON.stringify({prefixes:[operation.object_path]})});
}
export async function removeOwnedObject(context,operation){
  if(!['product-media','brand-assets'].includes(operation.bucket)||!/^[a-z]+\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.(?:png|jpg|jpeg|webp|avif)$/.test(operation.object_path))httpError('This legacy object requires owner review before deletion.',409,'legacy_media_review');
  const result=await storage(context,operation,'DELETE');return result.ok;
}
export async function uploadMedia(context,user,bucket='product-media',kind='products'){
  const e=env(context);
  if(e.MEDIA_TRANSFORM_ENABLED!=='true'||!e.MEDIA_TRANSFORM?.fetch)httpError('Image uploads are paused until the secure processor is enabled.',503,'media_upload_disabled');
  const rate=await takeToken('media:'+user.id,e,{capacity:10,perMinute:2});if(!rate.allowed)httpError('Please wait before uploading another image',429,'rate_limited');
  const {form,image,mime}=await readImageForm(context.request);
  if(bucket==='brand-assets'){kind=String(form.get('type')||'logo');if(!['logo','hero'].includes(kind))httpError('Choose a logo or hero image',400,'invalid_type');}
  const operation=await mediaRpc(context,'media_upload_reserve',{p_actor:user.id,p_id:crypto.randomUUID(),p_bucket:bucket,p_kind:kind});
  try{
    const normalized=await e.MEDIA_TRANSFORM.fetch(new Request('https://media.internal/'+(kind==='qr'?'normalize-qr':'normalize'),{method:'POST',headers:{'Content-Type':mime},body:image}));
    if(!normalized.ok)httpError(normalized.status===503?'Image processor is paused':'Image cannot be decoded or exceeds the pixel limit',normalized.status===503?503:normalized.status===413?413:415,'invalid_image');
    const output=await boundedBytes(normalized.body,MAX_NORMALIZED_BYTES);validateImageMime(output,kind==='qr'?'image/png':'image/webp');
    const width=Number(normalized.headers.get('X-Image-Width')),height=Number(normalized.headers.get('X-Image-Height'));
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1024||height>1024)httpError('Image processor returned invalid dimensions',502,'invalid_image_output');
    const stored=await storage(context,operation,'POST',output);if(!stored.ok)httpError('Image storage did not confirm the upload',502,'storage_error');
    const asset=await mediaRpc(context,'media_upload_register',{p_actor:user.id,p_id:operation.id,p_size:output.length,p_width:width,p_height:height});
    return json({ok:true,media:asset,url:mediaUrl(context,asset)},201);
  }catch(original){
    // A lost RPC response may conceal a committed registration. Never delete first.
    let abort;try{abort=await mediaRpc(context,'media_upload_abort',{p_actor:user.id,p_id:operation.id});}
    catch{httpError('Upload state could not be confirmed. Ask the owner to review media operation '+operation.id+' before retrying.',503,'media_state_unknown');}
    if(abort.media)return json({ok:true,media:abort.media,url:mediaUrl(context,abort.media),recovered:true},201);
    let cleaned=false;try{cleaned=await removeOwnedObject(context,operation);}catch{}
    try{await mediaRpc(context,'media_upload_cleanup_finish',{p_actor:user.id,p_id:operation.id,p_cleaned:cleaned});}catch{httpError('Upload cleanup needs review: '+operation.id,503,'media_cleanup_pending');}
    if(!cleaned)httpError('Upload cleanup needs review: '+operation.id,503,'media_cleanup_pending');
    throw original;
  }
}
export async function deleteMedia(context,user,id){
  const op=await mediaRpc(context,'media_delete_reserve',{p_actor:user.id,p_media:id});
  if(op.state==='deleted')return json({deleted:true,id});
  let removed=false;try{removed=await removeOwnedObject(context,op);}catch(e){throw e;}
  if(!removed)httpError('Deletion is pending. Retry this operation after checking storage.',503,'media_delete_pending');
  await mediaRpc(context,'media_delete_finish',{p_actor:user.id,p_id:op.id});
  return json({deleted:true,id});
}
