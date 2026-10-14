import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createMediaArchive,verifyMediaArchive} from '../tools/media-backup.mjs';
const inventory={buckets:[{id:'product-media',public:true}],objects:[{bucket_id:'product-media',name:'products/photo.webp',version:'fixture',metadata:{size:14}}]};
test('actual uploaded and static bytes are extracted and checked; corrupt archives never certify recovery',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'chaskabox-media-'));try{
  const images=path.join(root,'images'),directory=path.join(root,'archive');await mkdir(images);await mkdir(directory);await writeFile(path.join(images,'logo.png'),'fixture static image');
  let calls=0;const options={directory,imagesDirectory:images,inventory,readInventory:async()=>inventory,fetcher:async(url,opts)=>{calls++;assert.equal(url,'https://jtvswuvnasqqzrjysgfd.supabase.co/storage/v1/object/public/product-media/products/photo.webp');assert.equal(opts.redirect,'error');return new Response('uploaded bytes');}};
  const manifest=await createMediaArchive(options);assert.equal(calls,1);assert.equal(manifest.storage_objects,1);assert.equal(manifest.static_images,1);
  const result=await verifyMediaArchive(directory);assert.equal(result.all_object_hashes_verified,true);assert.equal(result.total_bytes,34);
  const json=JSON.parse(await readFile(path.join(directory,'media.json'),'utf8'));json.entries[0].sha256='0'.repeat(64);await writeFile(path.join(directory,'media.json'),JSON.stringify(json));await assert.rejects(verifyMediaArchive(directory),/checksum mismatch/);
  json.entries[0].file='../outside';await writeFile(path.join(directory,'media.json'),JSON.stringify(json));await assert.rejects(verifyMediaArchive(directory),/Unsafe media/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('changed inventory, missing files, private objects and traversal fail visibly without a usable media archive',async()=>{
 for(const mode of ['changed','missing','private','traversal','length']){
  const root=await mkdtemp(path.join(tmpdir(),'chaskabox-media-failure-'));try{
   const images=path.join(root,'images'),directory=path.join(root,'archive');await mkdir(images);await mkdir(directory);
   const current=structuredClone(inventory);if(mode==='private')current.buckets[0].public=false;if(mode==='traversal')current.objects[0].name='../outside';
   await assert.rejects(createMediaArchive({directory,imagesDirectory:images,inventory:current,readInventory:async()=>mode==='changed'?{...current,objects:[]}:current,fetcher:async()=>mode==='missing'?new Response('',{status:404}):new Response(mode==='length'?'wrong':'uploaded bytes')}));
   await assert.rejects(readFile(path.join(directory,'media.tar.gz')));
  }finally{await rm(root,{recursive:true,force:true});}
 }
});
