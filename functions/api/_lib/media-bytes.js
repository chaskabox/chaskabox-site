// Shared input limits; decoding and re-encoding happen in the private Images Worker.
export const MAX_IMAGE_BYTES=5*1024*1024;
export const MAX_NORMALIZED_BYTES=2*1024*1024;
export async function boundedBytes(stream,max){
  if(!stream)throw new Error('EMPTY_IMAGE');
  const reader=stream.getReader(),chunks=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;
    size+=value.byteLength;if(size>max){await reader.cancel();throw new Error('IMAGE_TOO_LARGE');}chunks.push(value);
  }}finally{reader.releaseLock();}
  if(!size)throw new Error('EMPTY_IMAGE');
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
export function imageMime(b){
  if(b.length<12)return null;
  if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
  if([137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return 'image/png';
  const s=(start,end)=>String.fromCharCode(...b.slice(start,end));
  if(s(0,4)==='RIFF'&&s(8,12)==='WEBP')return 'image/webp';
  if(s(4,8)==='ftyp'&&['avif','avis'].includes(s(8,12)))return 'image/avif';
  return null;
}
export function validateImageMime(bytes,declared){
  const mime=imageMime(bytes);if(!mime||declared&&declared.toLowerCase()!==mime)throw new Error('INVALID_IMAGE_TYPE');return mime;
}
