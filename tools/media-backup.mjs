import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,readdir,lstat,rm} from 'node:fs/promises';
import path from 'node:path';
export const STORAGE_INVENTORY_SQL="select json_build_object('buckets',(select coalesce(json_agg(b order by b.id),'[]') from (select id,public from storage.buckets) b),'objects',(select coalesce(json_agg(o order by o.bucket_id,o.name),'[]') from (select bucket_id,name,version,metadata,updated_at from storage.objects) o));";
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const MAX_FILE=20*1024*1024,MAX_TOTAL=200*1024*1024;
function tar(args){try{return execFileSync('tar',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000,maxBuffer:4*1024*1024});}catch{throw Error('Media archive operation failed');}}
export async function createMediaArchive({directory,inventory,readInventory,imagesDirectory=new URL('../images/',import.meta.url),fetcher=fetch}){
 const payload=path.join(directory,'payload');await mkdir(payload,{mode:0o700});
 const entries=[];let total=0;
 async function add(bytes,source){if(!bytes.length||bytes.length>MAX_FILE||(total+=bytes.length)>MAX_TOTAL)throw Error('Media archive size limit');const file='payload/'+String(entries.length).padStart(6,'0')+'.blob';await writeFile(path.join(directory,file),bytes,{mode:0o600});entries.push({...source,file,bytes:bytes.length,sha256:hash(bytes)});}
 try{
  if(!Array.isArray(inventory.buckets)||!Array.isArray(inventory.objects)||inventory.objects.length>10000)throw Error('Invalid media inventory');
  for(const o of inventory.objects){
   if(!inventory.buckets.some(b=>b.id===o.bucket_id&&b.public===true))throw Error('Private Storage objects require a separately configured backup credential');
   if(typeof o.name!=='string'||!o.name||o.name.split('/').some(p=>!p||p==='.'||p==='..')||/[\\\x00-\x1f]/.test(o.name))throw Error('Unsafe Storage object path');
   const url='https://jtvswuvnasqqzrjysgfd.supabase.co/storage/v1/object/public/'+encodeURIComponent(o.bucket_id)+'/'+o.name.split('/').map(encodeURIComponent).join('/');
   const response=await fetcher(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});
   if(!response.ok||Number(response.headers.get('content-length'))>MAX_FILE)throw Error('Storage object download failed');
   const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>MAX_FILE)throw Error('Storage object size limit');chunks.push(chunk);}
   const bytes=Buffer.concat(chunks),expected=Number(o.metadata?.size);
   if(Number.isFinite(expected)&&expected>=0&&bytes.length!==expected)throw Error('Storage object length differs from metadata');
   await add(bytes,{kind:'storage',bucket:o.bucket_id,object_path:o.name,version:o.version});
  }
  for(const name of (await readdir(imagesDirectory)).sort()){
   if(!/\.(png|webp|jpe?g|svg|gif|avif)$/i.test(name))continue;
   const target=imagesDirectory instanceof URL?new URL(name,imagesDirectory):path.join(imagesDirectory,name);
   if(!(await lstat(target)).isFile())throw Error('Nonregular static media file');
   await add(await readFile(target),{kind:'git_image',path:'images/'+name});
  }
  if(JSON.stringify(await readInventory())!==JSON.stringify(inventory))throw Error('Storage inventory changed during database and media backup');
  const manifest={version:1,kind:'chaskabox_media_archive',storage_inventory_sha256:hash(JSON.stringify(inventory)),storage_inventory_unchanged:true,storage_objects:inventory.objects.length,static_images:entries.filter(e=>e.kind==='git_image').length,total_bytes:total,entries};
  await writeFile(path.join(directory,'media.json'),JSON.stringify(manifest)+'\n',{mode:0o600});tar(['-czf',path.join(directory,'media.tar.gz'),'-C',directory,'payload']);
  return manifest;
 }finally{await rm(payload,{recursive:true,force:true});}
}
export async function verifyMediaArchive(directory){
 const manifest=JSON.parse(await readFile(path.join(directory,'media.json'),'utf8'));
 if(manifest.kind!=='chaskabox_media_archive'||manifest.version!==1||!Array.isArray(manifest.entries)||manifest.entries.length>20000||manifest.total_bytes>MAX_TOTAL)throw Error('Invalid media manifest');
 const allowed=new Set(['payload/']);
 for(const [i,e]of manifest.entries.entries()){if(e.file!=='payload/'+String(i).padStart(6,'0')+'.blob'||!Number.isSafeInteger(e.bytes)||e.bytes<1||e.bytes>MAX_FILE||!/^[a-f0-9]{64}$/.test(e.sha256))throw Error('Unsafe media manifest entry');allowed.add(e.file);}
 const names=tar(['-tzf',path.join(directory,'media.tar.gz')]).trim().split('\n');
 if(names.length!==allowed.size||names.some(n=>!allowed.delete(n)))throw Error('Media archive contains unexpected paths');
 if(tar(['-tvzf',path.join(directory,'media.tar.gz')]).trim().split('\n').some(line=>!['-','d'].includes(line[0])))throw Error('Media archive contains nonregular entries');
 const target=path.join(directory,'media-recovery');await mkdir(target,{mode:0o700});
 try{
  tar(['-xzf',path.join(directory,'media.tar.gz'),'-C',target,'--no-same-owner','--no-same-permissions']);let total=0;
  for(const e of manifest.entries){const file=path.join(target,e.file);if(!(await lstat(file)).isFile())throw Error('Nonregular recovered media');const bytes=await readFile(file);if(bytes.length!==e.bytes||hash(bytes)!==e.sha256)throw Error('Recovered media checksum mismatch');total+=bytes.length;}
  if(total!==manifest.total_bytes)throw Error('Recovered media total mismatch');
  return {storage_objects:manifest.storage_objects,static_images:manifest.static_images,total_bytes:total,all_object_hashes_verified:true};
 }finally{await rm(target,{recursive:true,force:true});}
}
