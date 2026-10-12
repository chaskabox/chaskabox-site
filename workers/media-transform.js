import {boundedBytes,validateImageMime,MAX_IMAGE_BYTES,MAX_NORMALIZED_BYTES} from '../functions/api/_lib/media-bytes.js';
const reply=(code,status)=>new Response(JSON.stringify({error:{code}}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export default {
  async fetch(request,env){
    if(env.MEDIA_TRANSFORM_ENABLED!=='true'||!env.IMAGES)return reply('MEDIA_TRANSFORM_DISABLED',503);
    const route=new URL(request.url).pathname,qr=route==='/normalize-qr';
    if(request.method!=='POST'||!['/normalize','/normalize-qr'].includes(route))return reply('NOT_FOUND',404);
    if(Number(request.headers.get('Content-Length'))>MAX_IMAGE_BYTES)return reply('IMAGE_TOO_LARGE',413);
    try{
      const bytes=await boundedBytes(request.body,MAX_IMAGE_BYTES);
      validateImageMime(bytes,request.headers.get('Content-Type')||'');
      const stream=()=>new Blob([bytes]).stream();
      const info=await env.IMAGES.info(stream());
      if(!Number.isInteger(info.width)||!Number.isInteger(info.height)||info.width<1||info.height<1||
        info.width>4096||info.height>4096||info.width*info.height>4000000)return reply('IMAGE_DIMENSIONS_TOO_LARGE',413);
      if(qr&&(info.width>1024||info.height>1024))return reply('QR_DIMENSIONS_TOO_LARGE',413);
      // Preserve the QR pixel grid with lossless PNG, stripping metadata.
      const result=await env.IMAGES.input(stream()).transform(qr?{}:{width:1024,height:1024,fit:'scale-down'})
        .output(qr?{format:'image/png',anim:false}:{format:'image/webp',quality:82,anim:false});
      const output=await boundedBytes(result.response().body,MAX_NORMALIZED_BYTES);
      if(validateImageMime(output,qr?'image/png':'image/webp')!==(qr?'image/png':'image/webp'))throw new Error('INVALID_IMAGE_OUTPUT');
      const normalized=await env.IMAGES.info(new Blob([output]).stream());
      if(normalized.width<1||normalized.height<1||normalized.width>1024||normalized.height>1024)throw new Error('INVALID_IMAGE_OUTPUT');
      return new Response(output,{headers:{'Content-Type':qr?'image/png':'image/webp','Cache-Control':'no-store',
        'X-Image-Width':String(normalized.width),'X-Image-Height':String(normalized.height)}});
    }catch(e){
      return reply(e?.message==='IMAGE_TOO_LARGE'?'IMAGE_TOO_LARGE':'INVALID_IMAGE',
        e?.message==='IMAGE_TOO_LARGE'?413:415);
    }
  }
};
