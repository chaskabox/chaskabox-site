import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {replayPlan} from '../tools/schema-replay.mjs';
import {productDraft,draftContext,structuredDraft,TASKS,SENSITIVE_TASKS} from '../functions/api/admin/_lib/ai-contract.js';
import {runTextAI,runEmbeddings,runImageAI,imageOutput,IMAGE_MODEL,DEFAULT_EMBEDDING_MODEL} from '../functions/api/_lib/ai.js';
import {priceBounds,rankProducts,publicCatalogue} from '../functions/api/_lib/catalogue-search.js';
import {validAssistantAnswer,groundedAnswer} from '../functions/api/ai/assistant.js';
import {embeddingText} from '../functions/api/admin/ai-reindex.js';
import {buildNotificationPayload,previewNotificationTemplate} from '../functions/api/_lib/notification-delivery.js';
import {onRequestPost as imageEndpoint} from '../functions/api/admin/ai-image.js';
import {onRequestPost as draftEndpoint} from '../functions/api/admin/ai.js';
const actor='00000000-0000-4000-8000-000000000001';
async function fixture(){
 const db=new PGlite({extensions:{vector,pgcrypto}});
 try{
  await db.exec(await readFile(new URL('fixtures/platform-schema.sql',import.meta.url),'utf8'));
  for(const f of (await replayPlan()).files)await db.exec(await readFile(f,'utf8'));
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,'synthetic@example.invalid');",[actor]);
  await db.query("INSERT INTO admin_roles(user_id,role) VALUES($1,'owner')",[actor]);
  await db.exec("INSERT INTO products(id,name,slug,price,category,pack,description,visibility) VALUES(1,'Synthetic chocolate','synthetic-chocolate',1000,'Test','One','Original description','visible');SET ROLE service_role;");
  return db;
 }catch(e){await db.close();throw e;}
}
test('draft contracts reject coercive confirmations/prices/tags, private context and invalid structured replies',()=>{
 const valid={product_id:1,field:'description',value:'Public draft'};
 assert.throws(()=>productDraft({...valid,confirm:'false'},'owner'),e=>e instanceof Response&&e.status===400);
 assert.deepEqual(productDraft({...valid,field:'tags',value:['chocolate','chocolate']},'content'),{tags:['chocolate']});
 assert.throws(()=>productDraft({...valid,field:'tags',value:'chocolate'},'owner'));
 assert.throws(()=>productDraft({...valid,field:'price',value:'1000'},'owner'));
 assert.throws(()=>productDraft({...valid,field:'price',value:1000},'manager'),e=>e.status===403);
 assert.throws(()=>draftContext({customer_phone:'03000000000'}));
 assert.throws(()=>draftContext({instructions:'Contact synthetic@example.invalid'}));
 for(const task of ['brand_description','brand_seo','brand_featured','brand_faq','analytics_insight'])assert.ok(TASKS.has(task));
 for(const task of ['customer_insight','order_insight','analytics_insight'])assert.ok(SENSITIVE_TASKS.has(task));
 assert.deepEqual(structuredDraft('brand_seo','{"seo_title":"Synthetic","seo_description":"Public catalogue"}'),{seo_title:'Synthetic',seo_description:'Public catalogue'});
 assert.throws(()=>structuredDraft('brand_seo','not json'));
 assert.throws(()=>structuredDraft('brand_featured','{"featured_ids":[99]}',[1]));
 assert.deepEqual(structuredDraft('brand_featured','{"featured_ids":[1]}',[1]),{featured_ids:[1]});
});
test('AI apply and undo preserve versions and audit atomically; stale or conflicting undo cannot clobber content',async()=>{
 const db=await fixture();try{
  const stamp=async()=>(await db.query('SELECT updated_at FROM products WHERE id=1')).rows[0].updated_at;
  const apply=async(patch,expected)=>(await db.query('SELECT admin_product_draft_apply($1,1,$2,$3,true) r',[actor,patch,expected])).rows[0].r;
  const original=await stamp(),saved=await apply({description:'AI draft',tags:['test']},original);
  assert.ok(saved.version_id);assert.equal((await db.query('SELECT count(*)::int n FROM product_versions')).rows[0].n,1);
  await assert.rejects(apply({description:'stale overwrite'},original),/STALE_PRODUCT/);
  await db.query("SELECT admin_cms_transaction($1,$2)",[actor,[{table:'products',op:'update',id:'1',data:{description:'Manual correction'}}]]);
  await assert.rejects(db.query('SELECT admin_product_revert($1,1,$2,$3,true)',[actor,saved.version_id,await stamp()]),/UNDO_CONFLICT/);
  assert.equal((await db.query('SELECT description FROM products')).rows[0].description,'Manual correction');
  const next=await apply({description:'Second AI draft'},await stamp());
  await db.query('SELECT admin_product_revert($1,1,$2,$3,true)',[actor,next.version_id,await stamp()]);
  assert.equal((await db.query('SELECT description FROM products')).rows[0].description,'Manual correction');
  assert.ok((await db.query('SELECT reverted_at FROM product_versions WHERE id=$1',[next.version_id])).rows[0].reverted_at);
  const before=(await db.query('SELECT count(*)::int n FROM product_versions')).rows[0].n;
  await db.exec("RESET ROLE;CREATE FUNCTION fail_ai_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ai.applied' THEN RAISE EXCEPTION 'synthetic audit outage';END IF;RETURN NEW;END $$;CREATE TRIGGER fail_ai_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fail_ai_audit();SET ROLE service_role;");
  await assert.rejects(apply({description:'Cannot commit'},await stamp()),/synthetic audit outage/);
  assert.equal((await db.query('SELECT count(*)::int n FROM product_versions')).rows[0].n,before);
  assert.equal((await db.query('SELECT description FROM products')).rows[0].description,'Manual correction');
 }finally{await db.close();}
});
test('shared quota keeps unknown charges, rejects a last over-budget request and obeys DB kill switches',async()=>{
 const db=await fixture();try{
  const reserve=(id,units)=>db.query('SELECT ai_budget_reserve($1,$2,$3,$4,$5,20) r',[id,actor,'text','@cf/meta/llama-3.2-3b-instruct',units]);
  assert.equal((await reserve(crypto.randomUUID(),12)).rows[0].r.reason,'disabled');
  await db.exec("UPDATE site_settings SET value='true' WHERE key='ai_enabled';");
  const id=crypto.randomUUID();assert.equal((await reserve(id,12)).rows[0].r.allowed,true);
  assert.equal((await reserve(crypto.randomUUID(),12)).rows[0].r.reason,'budget_exhausted');
  const finished=(await db.query("SELECT ai_budget_finish($1,false,'{}',1) r",[id])).rows[0].r;
  assert.equal(finished.accounted_neuron_estimate,12);
  assert.equal((await db.query("SELECT ai_budget_finish($1,true,'{}',1) r",[id])).rows[0].r.accounted_neuron_estimate,12);
  await db.exec("UPDATE site_settings SET value='false' WHERE key='ai_text_enabled';");
  assert.equal((await reserve(crypto.randomUUID(),1)).rows[0].r.reason,'disabled');
  await assert.rejects(db.exec("UPDATE site_settings SET value='\"true\"' WHERE key='ai_enabled'"),/boolean/);
  await assert.rejects(db.exec("UPDATE site_settings SET value='9000' WHERE key='ai_daily_budget_neurons'"),/1..8000/);
  await db.exec("UPDATE site_settings SET value='true' WHERE key='ai_images_enabled';");
  for(let i=0;i<10;i++)assert.equal((await db.query('SELECT ai_budget_reserve($1,$2,$3,$4,1,8000) r',[crypto.randomUUID(),actor,'image',IMAGE_MODEL])).rows[0].r.allowed,true);
  assert.equal((await db.query('SELECT ai_budget_reserve($1,$2,$3,$4,1,8000) r',[crypto.randomUUID(),actor,'image',IMAGE_MODEL])).rows[0].r.reason,'image_rate_limited');
  await db.exec("INSERT INTO chaskabox_private.ai_days(day) VALUES((now() AT TIME ZONE 'UTC')::date-31);INSERT INTO chaskabox_private.ai_requests(id,day,feature,model,reserved,accounted,created_at) VALUES(gen_random_uuid(),(now() AT TIME ZONE 'UTC')::date-31,'text','synthetic',1,1,now()-interval '31 days');INSERT INTO chaskabox_private.ai_cache(key,result,expires_at) VALUES(repeat('a',64),'{}',now()-interval '1 second');");
  const maintenance=(await db.query('SELECT ai_maintenance_run() r')).rows[0].r;
  assert.deepEqual(maintenance,{requests_deleted:1,days_deleted:1,expired_cache_deleted:1,retention_days:30});
  await db.exec('RESET ROLE;SET ROLE anon;');
  await assert.rejects(db.query('SELECT ai_budget_state()'),/permission denied/);
  await assert.rejects(db.query('SELECT * FROM product_versions'),/permission denied/);
 }finally{await db.close();}
});
test('index counts all visible eligible products and ignores stale content/model/dimension writes',async()=>{
 const db=await fixture();try{
  const p=(await db.query('SELECT * FROM products WHERE id=1')).rows[0],text=embeddingText(p),embedding='['+[1,...Array(1023).fill(0)].join(',')+']';
  const payload={id:1,model:DEFAULT_EMBEDDING_MODEL,text,expected_updated_at:p.updated_at,embedding};
  assert.equal((await db.query('SELECT set_product_ai_embeddings($1) n',[[payload]])).rows[0].n,1);
  assert.equal((await db.query('SELECT ai_index_status($1) r',[DEFAULT_EMBEDDING_MODEL])).rows[0].r.remaining,0);
  await db.exec("UPDATE products SET description='Edited after index' WHERE id=1;");
  assert.equal((await db.query('SELECT set_product_ai_embeddings($1) n',[[payload]])).rows[0].n,0);
  assert.equal((await db.query('SELECT ai_index_status($1) r',[DEFAULT_EMBEDDING_MODEL])).rows[0].r.remaining,1);
  assert.equal((await db.query('SELECT * FROM match_indexed_products($1,$2,8,.4)',[DEFAULT_EMBEDDING_MODEL,embedding])).rows.length,0);
  const current=(await db.query('SELECT * FROM products WHERE id=1')).rows[0];
  await assert.rejects(db.query('SELECT set_product_ai_embeddings($1)',[[{...payload,text:embeddingText(current),expected_updated_at:current.updated_at,embedding:'[1,2]'}]]),/dimension/);
 }finally{await db.close();}
});
test('notification template versions, placeholder validation, preview and immutable payload selection agree',async()=>{
 const db=await fixture();try{
  await db.exec("RESET ROLE;INSERT INTO notification_templates(name,channel,subject,body,is_active) VALUES('order_received_owner','email','Order {{order_number}}','Hi {{customer_name}} — {{total}}',true);SET ROLE service_role;");
  const t=(await db.query("SELECT * FROM notification_templates WHERE name='order_received_owner'")).rows[0];
  const updated=(await db.query('SELECT admin_template_save($1,$2,$3,$4) r',[actor,t.id,{body:'Changed {{order_number}}'},t.updated_at])).rows[0].r;
  assert.equal(updated.version,2);assert.equal((await db.query('SELECT count(*)::int n FROM chaskabox_private.notification_template_versions WHERE template_id=$1',[t.id])).rows[0].n,2);
  await assert.rejects(db.query('SELECT admin_template_save($1,$2,$3,$4)',[actor,t.id,{body:'Stale'},t.updated_at]),/STALE_TEMPLATE/);
  await assert.rejects(db.query('SELECT admin_template_save($1,$2,$3,$4)',[actor,t.id,{body:'{{unknown}}'},updated.updated_at]),/Unknown notification placeholder/);
  assert.equal((await db.query('SELECT version FROM notification_templates WHERE name=\'order_received_owner\'')).rows[0].version,2);
  assert.match(previewNotificationTemplate(updated).text,/CB-PREVIEW/);
  const order={id:actor,order_number:'CB-SYNTHETIC',customer_phone:'03000000000',total:1000,items:[]},job={target:'owner_email',event_type:'order_created'};
  const payload=buildNotificationPayload({RESEND_FROM_EMAIL:'fixture@example.invalid',OWNER_ORDER_EMAIL:'fixture@example.invalid'},order,job,[updated]);
  assert.equal(payload.template.version,2);assert.ok(!Object.hasOwn(payload.body,'template'));
 }finally{await db.close();}
});
test('Roman Urdu budgets and essential category/stock constraints precede ranking and semantic hints',()=>{
 const rows=Array.from({length:12},(_,i)=>({id:i+1,name:'Chocolate '+i,price:1500,category:'Chocolates & Candies',stock_state:'available'}));
 rows.push({id:50,name:'Affordable chocolate',price:450,category:'Chocolates & Candies',stock_state:'available'},{id:51,name:'Gummy candy',price:200,category:'Chocolates & Candies',stock_state:'available'},{id:52,name:'Unavailable chocolate',price:100,stock_state:'unavailable'});
 for(const q of ['chocolate 1000 rupey ke andar','mujy chocolate 1000 k ander chahiye','chocolate under PKR 1000','چاکلیٹ under 1000'])assert.deepEqual(rankProducts(rows,q,[{id:51,similarity:.99}]).map(p=>p.id),[50]);
 assert.deepEqual(priceBounds('between 500 and 1000'),{min:500,max:1000});
 assert.equal(rankProducts(rows,'unrelated laptop').length,0);
});
test('assistant rejects wrong/swapped prices, repeated paragraphs and unconfirmed guarantees',()=>{
 const products=[{name:'Synthetic A',price:100},{name:'Synthetic B',price:200}];
 assert.ok(validAssistantAnswer('Synthetic A — PKR 100; Synthetic B — PKR 200.',products));
 assert.equal(validAssistantAnswer('Synthetic A — PKR 200; Synthetic B — PKR 100.',products),false);
 assert.equal(validAssistantAnswer('Synthetic A — PKR 999.',products),false);
 assert.equal(validAssistantAnswer('Guaranteed organic and free delivery.',products),false);
 assert.equal(validAssistantAnswer('This paragraph repeats the same wording! This paragraph repeats the same wording!',products),false);
 assert.match(groundedAnswer('allergens?',products,{}),/confirmed detail/);
});
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1kAAAAASUVORK5CYII=','base64'));
test('image adapter consumes stream/bytes/base64 and rejects empty, oversized, SVG or mismatched MIME',async()=>{
 for(const input of [png,png.buffer,new ReadableStream({start(c){c.enqueue(png.slice(0,12));c.enqueue(png.slice(12));c.close();}}),{image:Buffer.from(png).toString('base64')}]) {
  const out=await imageOutput(input);assert.equal(out.mime,'image/png');assert.equal(out.width,1);assert.ok(out.image_url.length>50);
 }
 for(const input of [new Uint8Array(),png.slice(0,24),new Uint8Array(5*1024*1024+1),{image:btoa('<svg/>')},{image:'data:image/jpeg;base64,'+Buffer.from(png).toString('base64')}])await assert.rejects(imageOutput(input),/image|Image/);
});
test('text, embeddings and images share admission/cache/usage and never call inference after denial or off switch',async(t)=>{
 const old=globalThis.fetch;let allowed=true,enabled=true,calls=0;const rpcCalls=[],cache=new Map();
 const env={SUPABASE_URL:'https://fixture.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',AI_ENABLED:'true',AI:{async run(model){calls++;return model===IMAGE_MODEL?{image:Buffer.from(png).toString('base64')}:model===DEFAULT_EMBEDDING_MODEL?{data:[Array(1024).fill(.1)]}:{response:'Public draft',usage:{prompt_tokens:100,completion_tokens:20}};}}};
 globalThis.fetch=async(url,init)=>{const name=new URL(url).pathname.split('/').pop(),b=JSON.parse(init.body||'{}');rpcCalls.push([name,b]);let value;
  if(name==='ai_budget_state')value={enabled,features:{text:true,image:true,embedding:true},accounted_neuron_estimate:1};
  else if(name==='ai_cache_get')value=cache.get(b.p_key)||null;
  else if(name==='ai_cache_put'){cache.set(b.p_key,b.p_result);value=null;}
  else if(name==='ai_budget_reserve')value={allowed,reason:'budget_exhausted'};
  else if(name==='ai_budget_finish')value={accounted_neuron_estimate:20};
  else throw new Error('Unexpected endpoint '+name);
  return Response.json(value);
 };t.after(()=>{globalThis.fetch=old;});
 const context={env},textArgs={system:'Draft public copy',user:'Synthetic product'};
 await runTextAI(context,textArgs);await runTextAI(context,textArgs);assert.equal(calls,1);
 await runEmbeddings(context,['Synthetic product']);await runImageAI(context,{prompt:'Decorative abstract shapes'});assert.equal(calls,3);
 const admissions=rpcCalls.filter(([n])=>n==='ai_budget_reserve');assert.deepEqual(admissions.map(([,b])=>b.p_feature),['text','embedding','image']);
 assert.ok(rpcCalls.find(([n,b])=>n==='ai_budget_finish'&&b.p_usage.prompt_tokens===100&&b.p_estimate>0));
 allowed=false;await assert.rejects(runTextAI(context,{...textArgs,user:'New draft'}),/budget/);assert.equal(calls,3);
 enabled=false;await assert.rejects(runTextAI(context,textArgs),/paused/);assert.equal(calls,3); // Cached result also obeys off switch.
 env.AI_ENABLED='false';await assert.rejects(runImageAI(context,{prompt:'Another decorative draft'}));assert.equal(calls,3);
});
test('public catalogue reads every page instead of silently capping results at 400/1000',async(t)=>{
 const old=globalThis.fetch,offsets=[];
 globalThis.fetch=async(url)=>{const offset=Number(new URL(url).searchParams.get('offset'));offsets.push(offset);return Response.json(Array.from({length:offset===1000?2:500},(_,i)=>({id:offset+i+1})));};
 t.after(()=>{globalThis.fetch=old;});
 assert.equal((await publicCatalogue({SUPABASE_URL:'https://fixture.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'})).length,1002);
 assert.deepEqual(offsets,[0,500,1000]);
});
test('actual admin endpoints honor denied image limits and every previously unsupported UI task contract',async(t)=>{
 const old=globalThis.fetch;let imageDenied=true,modelCalls=0,currentTask='',role='owner';
 const outputs={brand_description:'Public brand description',brand_seo:'{"seo_title":"Synthetic","seo_description":"Public products"}',brand_featured:'{"featured_ids":[1]}',brand_faq:'{"faqs":[{"q":"Products?","a":"See the public catalogue."}]}',analytics_insight:'Complete aggregate insight'};
 const env={SUPABASE_URL:'https://fixture.example.invalid',SUPABASE_ANON_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture',AI_ENABLED:'true',AI:{async run(){modelCalls++;return {response:outputs[currentTask]};}}};
 globalThis.fetch=async(url,init={})=>{
  const path=new URL(url).pathname,b=JSON.parse(init.body||'{}');let out;
  if(path==='/auth/v1/user')out={id:actor};
  else if(path==='/rest/v1/admin_roles')out=[{role}];
  else if(path.endsWith('admin_session_check'))out=true;
  else if(path.endsWith('take_rate_limit_token'))out=[{allowed:!(imageDenied&&b.p_capacity===10),retry_after_sec:60}];
  else if(path.endsWith('ai_budget_state'))out={enabled:true,features:{text:true,image:true,embedding:true}};
  else if(path.endsWith('ai_cache_get'))out=null;
  else if(path.endsWith('ai_budget_reserve'))out={allowed:true};
  else if(path.endsWith('ai_budget_finish'))out={accounted_neuron_estimate:10};
  else if(path.endsWith('ai_cache_put')||path.endsWith('/audit_log'))out=null;
  else if(path.endsWith('/public_products'))out=[{id:1,name:'Synthetic',brand:'Synthetic',price:100,stock_state:'available'}];
  else if(path.endsWith('analytics_revenue'))out={recognized_revenue:100};
  else if(path.endsWith('analytics_overview'))out={cards:{orders:1}};
  else throw new Error('Unexpected I/O '+path);
  return Response.json(out);
 };t.after(()=>{globalThis.fetch=old;});
 const context=(path,body)=>({env,request:new Request('https://site.example.invalid'+path,{method:'POST',headers:{Authorization:'Bearer fixture.'+Buffer.from(JSON.stringify({sub:actor,aal:'aal2',session_id:'00000000-0000-4000-8000-000000000010'})).toString('base64url')+'.verified'},body:JSON.stringify(body)})});
 assert.equal((await imageEndpoint(context('/api/admin/ai-image',{prompt:'Decorative abstract shapes',type:'banner'}))).status,429);
 assert.equal(modelCalls,0);
 assert.equal((await imageEndpoint(context('/api/admin/ai-image',{prompt:'Decorative abstract shapes',type:'product'}))).status,422);
 assert.equal(modelCalls,0);imageDenied=false;
 for(const task of Object.keys(outputs)){
  currentTask=task;
  const result=await draftEndpoint(context('/api/admin/ai',{task,context:task==='analytics_insight'?{question:'Summarize current revenue',range:{from:'2026-10-01',to:'2026-10-11'}}:{brand:'Synthetic'}}));
  assert.equal(result.status,200,await result.clone().text());
  const body=await result.json();assert.equal(body.task,task);assert.equal(body.draft,outputs[task]);assert.ok(Object.hasOwn(body,'structured'));assert.ok(body.budget);
 }
 role='content';currentTask='analytics_insight';
 assert.equal((await draftEndpoint(context('/api/admin/ai',{task:'analytics_insight',context:{question:'Summary'}}))).status,403);
 assert.equal(modelCalls,5);
});
