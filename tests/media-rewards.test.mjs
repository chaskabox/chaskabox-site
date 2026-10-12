import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {replayPlan} from '../tools/schema-replay.mjs';
import {boundedBytes,validateImageMime} from '../functions/api/_lib/media-bytes.js';
import {readImageForm,uploadMedia} from '../functions/api/admin/_lib/media.js';
import mediaWorker from '../workers/media-transform.js';
import {onRequestGet as rewardsStatus} from '../functions/api/rewards-status.js';
import {onRequestPost as loyalty} from '../functions/api/loyalty.js';
import {cataloguePhoto,photoUnderReview,OPTIMIZED_PHOTOS} from '../functions/api/_lib/catalogue-photos.js';
const actor='00000000-0000-4000-8000-000000000001',content='00000000-0000-4000-8000-000000000003';
const webp=new Uint8Array([82,73,70,70,4,0,0,0,87,69,66,80]);
async function fixture(){
 const db=new PGlite({extensions:{vector,pgcrypto}});
 try{
  await db.exec(await readFile(new URL('fixtures/platform-schema.sql',import.meta.url),'utf8'));
  for(const f of (await replayPlan()).files)await db.exec(await readFile(f,'utf8'));
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,'synthetic@example.invalid'),($2,'content@example.invalid')",[actor,content]);
  await db.query("INSERT INTO admin_roles(user_id,role) VALUES($1,'owner'),($2,'content')",[actor,content]);
  await db.exec("SET ROLE service_role;UPDATE site_settings SET value='true' WHERE key='media_upload_enabled';");
  return db;
 }catch(e){await db.close();throw e;}
}
const formRequest=(bytes=webp,type='image/webp')=>{const f=new FormData();f.append('file',new Blob([bytes],{type}),'synthetic.webp');return new Request('https://fixture.example.invalid/api/admin/media',{method:'POST',body:f});};
test('bounded multipart and actual magic reject chunked overflow, empty files and declared MIME disguises',async()=>{
 let cancelled=false;
 const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(8));c.enqueue(new Uint8Array(8));},cancel(){cancelled=true;}});
 await assert.rejects(boundedBytes(stream,10),/IMAGE_TOO_LARGE/);assert.equal(cancelled,true);
 assert.throws(()=>validateImageMime(new TextEncoder().encode('<svg onclick="x"></svg>'),'image/png'),/INVALID_IMAGE_TYPE/);
 assert.throws(()=>validateImageMime(webp,'image/png'),/INVALID_IMAGE_TYPE/);
 await assert.rejects(readImageForm(formRequest(webp,'image/png')),e=>e instanceof Response&&e.status===415);
 assert.equal((await readImageForm(formRequest())).mime,'image/webp');
});
test('private image processor rejects corrupt/oversized input and fails closed without its binding',async()=>{
 const request=()=>new Request('https://media.internal/normalize',{method:'POST',headers:{'Content-Type':'image/webp'},body:webp});
 assert.equal((await mediaWorker.fetch(request(),{})).status,503);
 assert.equal((await mediaWorker.fetch(request(),{MEDIA_TRANSFORM_ENABLED:'true',IMAGES:{info(){throw new Error('decode failed');}}})).status,415);
 let inputCalls=0;
 assert.equal((await mediaWorker.fetch(request(),{MEDIA_TRANSFORM_ENABLED:'true',IMAGES:{info:async()=>({width:4096,height:4096}),input(){inputCalls++;}}})).status,413);
 assert.equal(inputCalls,0);
 let options;
 const pipeline={transform(o){assert.equal(o.fit,'scale-down');return this;},async output(o){options=o;return {response:()=>new Response(webp)};}};
 const env={MEDIA_TRANSFORM_ENABLED:'true',IMAGES:{info:async()=>({width:100,height:200}),input:()=>pipeline}};
 const normalized=await mediaWorker.fetch(request(),env);
 assert.equal(normalized.status,200);assert.equal(normalized.headers.get('Content-Type'),'image/webp');
 assert.deepEqual(options,{format:'image/webp',quality:82,anim:false});
});
test('media registration and audit roll back together; abort fences late registration and counts attempted transforms',async()=>{
 const db=await fixture();try{
  const id=crypto.randomUUID();
  const reserve=()=>db.query("SELECT media_upload_reserve($1,$2,'product-media','products') r",[actor,id]);
  await db.exec("UPDATE site_settings SET value='false' WHERE key='media_upload_enabled';");
  await assert.rejects(reserve(),/MEDIA_UPLOAD_DISABLED/);
  await db.exec("UPDATE site_settings SET value='true' WHERE key='media_upload_enabled';UPDATE site_settings SET value='1' WHERE key='media_monthly_transform_limit';");
  const op=(await reserve()).rows[0].r;assert.match(op.object_path,/products\/\d{4}\/\d{2}\/.*\.webp$/);
  await db.exec("RESET ROLE;CREATE FUNCTION fail_media_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='media.uploaded' THEN RAISE EXCEPTION 'synthetic audit outage';END IF;RETURN NEW;END $$;CREATE TRIGGER fail_media_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fail_media_audit();SET ROLE service_role;");
  await assert.rejects(db.query('SELECT media_upload_register($1,$2,120,10,20)',[actor,id]),/synthetic audit outage/);
  assert.equal((await db.query('SELECT count(*)::int n FROM media')).rows[0].n,0);
  assert.equal((await db.query('SELECT state FROM chaskabox_private.media_operations WHERE id=$1',[id])).rows[0].state,'reserved');
  await db.query('SELECT media_upload_abort($1,$2)',[actor,id]);
  await assert.rejects(db.query('SELECT media_upload_register($1,$2,120,10,20)',[actor,id]),/MEDIA_OPERATION_CONFLICT/);
  await db.query('SELECT media_upload_cleanup_finish($1,$2,true)',[actor,id]);
  await assert.rejects(db.query("SELECT media_upload_reserve($1,$2,'product-media','products')",[actor,crypto.randomUUID()]),/MEDIA_MONTHLY_LIMIT/);
  await assert.rejects(db.query("UPDATE site_settings SET value='1001' WHERE key='media_monthly_transform_limit'"),/1..1000/);
  await db.exec('RESET ROLE;SET ROLE anon;');await assert.rejects(db.query('SELECT media_upload_abort($1,$2)',[actor,id]),/permission denied/);
 }finally{await db.close();}
});
test('every CMS and undo reference blocks deletion; tombstones fence later assignments and pending deletion resumes',async()=>{
 const db=await fixture();try{
  const id=crypto.randomUUID(),op=(await db.query("SELECT media_upload_reserve($1,$2,'product-media','products') r",[actor,id])).rows[0].r;
  await db.query('SELECT media_upload_register($1,$2,120,10,20)',[actor,id]);
  const url='https://fixture.example.invalid/storage/v1/object/public/product-media/'+op.object_path;
  await db.query("INSERT INTO products(id,name,slug,category,pack,price,image_url,og_image) VALUES(1,'Synthetic','synthetic','Test','One',100,'', $1)",[url]);
  await assert.rejects(db.query('SELECT media_delete_reserve($1,$2)',[content,id]),/MEDIA_REFERENCED/);
  await db.exec("UPDATE products SET og_image='';");
  for(const [table,column,key,value] of [
   ['brands','logo_url','slug','synthetic-brand'],['categories','image_url','slug','synthetic-category']
  ]){
   await db.query('INSERT INTO '+table+'(name,'+key+','+column+') VALUES($1,$2,$3)',['Synthetic',value,url]);
   await assert.rejects(db.query('SELECT media_delete_reserve($1,$2)',[actor,id]),/MEDIA_REFERENCED/);
   await db.query('UPDATE '+table+' SET '+column+"=''");
  }
  await db.query("INSERT INTO product_versions(product_id,snapshot,changed_by) VALUES(1,$1,$2)",[{image_url:url},actor]);
  await assert.rejects(db.query('SELECT media_delete_reserve($1,$2)',[actor,id]),/MEDIA_REFERENCED/);
  await db.exec('DELETE FROM product_versions;');
  const deletion=(await db.query('SELECT media_delete_reserve($1,$2) r',[actor,id])).rows[0].r;
  assert.equal(deletion.state,'delete_pending');
  await assert.rejects(db.query('UPDATE products SET image_url=$1',[url]),/MEDIA_UNAVAILABLE/);
  assert.equal((await db.query('SELECT media_delete_reserve($1,$2) r',[actor,id])).rows[0].r.id,deletion.id);
  await db.query('SELECT media_delete_finish($1,$2)',[actor,deletion.id]);
  await assert.rejects(db.query('UPDATE brands SET logo_url=$1',[url]),/MEDIA_UNAVAILABLE/);
  assert.equal((await db.query('SELECT state FROM media WHERE id=$1',[id])).rows[0].state,'deleted');
  await db.exec("UPDATE admin_roles SET active=false WHERE user_id='"+actor+"'");
  await assert.rejects(db.query('SELECT media_delete_finish($1,$2)',[actor,deletion.id]),/Active media staff required/);
 }finally{await db.close();}
});
test('lost registration response returns the committed asset instead of deleting its storage object',async(t)=>{
 const db=await fixture(),old=globalThis.fetch;let storageDeletes=0;
 t.after(async()=>{globalThis.fetch=old;await db.close();});
 const env={SUPABASE_URL:'https://fixture.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',MEDIA_TRANSFORM_ENABLED:'true',
  MEDIA_TRANSFORM:{fetch:async()=>new Response(webp,{headers:{'Content-Type':'image/webp','X-Image-Width':'10','X-Image-Height':'20'}})}};
 globalThis.fetch=async(url,init={})=>{
  const path=new URL(url).pathname;
  if(path.endsWith('take_rate_limit_token'))return Response.json([{allowed:true}]);
  if(path.startsWith('/storage/')){if(init.method==='DELETE')storageDeletes++;return Response.json({ok:true});}
  const name=path.split('/').pop(),b=JSON.parse(init.body),keys=Object.keys(b);
  const result=(await db.query('SELECT '+name+'('+keys.map((k,i)=>k+'=> $'+(i+1)).join(',')+') r',keys.map(k=>b[k]))).rows[0].r;
  if(name==='media_upload_register')return Response.json({message:'synthetic response lost after commit'},{status:503});
  return Response.json(result);
 };
 const response=await uploadMedia({env,request:formRequest()}, {id:actor});
 assert.equal(response.status,201);assert.equal((await response.json()).recovered,true);assert.equal(storageDeletes,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM media')).rows[0].n,1);
});
test('failed registration cleans only the reserved object; an unknown abort state never triggers storage deletion',async(t)=>{
 const db=await fixture(),old=globalThis.fetch;let abortUnknown=false,deletes=0;
 t.after(async()=>{globalThis.fetch=old;await db.close();});
 const env={SUPABASE_URL:'https://fixture.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',MEDIA_TRANSFORM_ENABLED:'true',
 MEDIA_TRANSFORM:{fetch:async()=>new Response(webp,{headers:{'X-Image-Width':'10','X-Image-Height':'20'}})}};
 globalThis.fetch=async(url,init={})=>{
  const path=new URL(url).pathname;
  if(path.endsWith('take_rate_limit_token'))return Response.json([{allowed:true}]);
  if(path.startsWith('/storage/')){
   if(init.method==='DELETE'){deletes++;assert.equal(path,'/storage/v1/object/product-media');const body=JSON.parse(init.body);assert.equal(body.prefixes.length,1);assert.match(body.prefixes[0],/^products\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.webp$/);}
   return Response.json({ok:true});
  }
  const name=path.split('/').pop(),b=JSON.parse(init.body),keys=Object.keys(b);
  if(name==='media_upload_register'||abortUnknown&&name==='media_upload_abort')return Response.json({message:'synthetic backend unavailable'},{status:503});
  return Response.json((await db.query('SELECT '+name+'('+keys.map((k,i)=>k+'=> $'+(i+1)).join(',')+') r',keys.map(k=>b[k]))).rows[0].r);
 };
 await assert.rejects(uploadMedia({env,request:formRequest()},{id:actor}),e=>e instanceof Response&&e.status===502);
 assert.equal(deletes,1);assert.equal((await db.query("SELECT state FROM chaskabox_private.media_operations")).rows[0].state,'cleaned');
 abortUnknown=true;await assert.rejects(uploadMedia({env,request:formRequest()},{id:actor}),e=>e instanceof Response&&e.status===503);
 assert.equal(deletes,1);assert.equal((await db.query("SELECT count(*)::int n FROM chaskabox_private.media_operations WHERE state='reserved'")).rows[0].n,1);
});
test('optimized photos apply only to the inspected original URL and the observed 12/48 mismatch stays under review',()=>{
 const [source,target]=Object.entries(OPTIMIZED_PHOTOS)[0];assert.equal(cataloguePhoto({id:34,image_url:source}),target);
 assert.equal(cataloguePhoto({id:34,image_url:'https://fixture.example.invalid/new-photo.png'}),'https://fixture.example.invalid/new-photo.png');
 const source186='https://jtvswuvnasqqzrjysgfd.supabase.co/storage/v1/object/public/product-media/products/2026/10/7ad390ca-1b87-4ef2-8086-34576726c0d7.png';
 const p={id:186,pack:'Pack of 12',image_url:source186};
 assert.equal(photoUnderReview(p),true);assert.equal(cataloguePhoto(p),'');
 assert.equal(photoUnderReview({...p,image_url:'https://fixture.example.invalid/approved12.png'}),false);
});
test('unsupported rewards stay unavailable and legacy local attribution/DOB are removed without collecting replacements',async()=>{
 assert.equal((await loyalty({request:new Request('https://fixture.example.invalid/api/loyalty',{method:'POST'})})).status,503);
 const status=await (await rewardsStatus()).json();assert.equal(status.loyalty.available,false);assert.equal(status.push.available,false);
 const keys=['cb_birthday','cb_referral_code','cb_referred_by','cb_referrals','cb_device_id','cb_push_asked'],store=new Map(keys.map(k=>[k,'"synthetic"']));
 store.set('chaskabox-cart','{}');let replaced='',permissionCalls=0;
 const context={window:{addEventListener(){}},document:{readyState:'complete',getElementById:()=>null,addEventListener(){}},
 localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
 location:{href:'https://fixture.example.invalid/?ref=synthetic&category=snacks#shop'},history:{replaceState:(a,b,url)=>replaced=url},
 URL,Date,Notification:{requestPermission(){permissionCalls++;}},console};
 vm.runInNewContext(await readFile(new URL('../retention.js',import.meta.url),'utf8'),context);
 keys.forEach(k=>assert.equal(store.has(k),false));assert.equal(replaced,'/?category=snacks#shop');assert.equal(permissionCalls,0);
 assert.equal(context.window.enablePush(),false);
});
