import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {PAGE_COPY_DEFINITIONS,validatePageCopy,pageKeyForPath,copyKey} from '../page-copy-contract.js';
import {onRequestGet,onRequestPost} from '../functions/api/admin/pages/index.js';
import {onRequest as middleware} from '../functions/_middleware.js';
import {storeFaqs} from '../functions/api/_lib/faq-content.js';
const owner='00000000-0000-4000-8000-000000000001',content='00000000-0000-4000-8000-000000000002',session='00000000-0000-4000-8000-000000000010';
const field=Object.keys(PAGE_COPY_DEFINITIONS.about.fields)[0];
async function fixture(){
 const db=new PGlite();try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE TABLE admin_roles(user_id uuid PRIMARY KEY,role text,active boolean);CREATE TABLE audit_log(actor_id uuid,actor_role text,action text,entity_type text,entity_id text,before_data jsonb,after_data jsonb);GRANT SELECT,UPDATE ON admin_roles TO service_role;GRANT INSERT ON audit_log TO service_role;");
 await db.exec(await readFile(new URL('../database/migrations/20261018100000_page_copy_controls.sql',import.meta.url),'utf8'));
 await db.query('INSERT INTO admin_roles VALUES($1,$2,true),($3,$4,true)',[owner,'owner',content,'content']);await db.exec('SET ROLE service_role');return db;
 }catch(e){await db.close();throw e;}
}
const mutate=async(db,actor,action,revision,copy=null,version=null)=>(await db.query('SELECT admin_page_copy_mutate($1,$2,$3,$4,$5,$6) result',[actor,'about',action,revision,copy,version])).rows[0].result;
test('page drafts stay private until manager/owner publication; stale saves cannot overwrite; rollback is versioned',async()=>{
 const db=await fixture();try{
  const draft=await mutate(db,content,'draft',0,{fields:{[field]:'Reviewed page copy'},seo_title:'Reviewed title'});assert.equal(draft.revision,1);assert.deepEqual(draft.published,{fields:{}});
  assert.deepEqual((await db.query("SELECT page_copy_read(ARRAY['about']) result")).rows[0].result.about,{fields:{}});
  await assert.rejects(mutate(db,content,'publish',1),/Manager\/owner/);
  const published=await mutate(db,owner,'publish',1);assert.equal(published.revision,2);assert.equal(published.published.fields[field],'Reviewed page copy');assert.equal(published.draft,null);assert.equal(published.versions.length,1);
  await assert.rejects(mutate(db,owner,'draft',1,{fields:{[field]:'Stale clobber'}}),/STALE_PAGE/);
  const restored=await mutate(db,owner,'rollback',2,null,published.versions[0].id);assert.deepEqual(restored.published,{fields:{}});assert.equal(restored.versions.length,2);assert.equal(restored.revision,3);
  await db.exec('RESET ROLE');assert.equal((await db.query('SELECT count(*)::int n FROM audit_log')).rows[0].n,3);
 }finally{await db.close();}
});
test('failed page audit rolls back content, revision and version history together',async()=>{
 const db=await fixture();try{
  await mutate(db,owner,'draft',0,{fields:{[field]:'Draft'}});
  await db.exec("RESET ROLE;CREATE FUNCTION fail_copy_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='page_copy.publish' THEN RAISE EXCEPTION 'synthetic audit failure';END IF;RETURN NEW;END $$;CREATE TRIGGER fail_copy_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fail_copy_audit();SET ROLE service_role;");
  await assert.rejects(mutate(db,owner,'publish',1),/synthetic audit failure/);
  const row=(await db.query("SELECT admin_page_copy_get('about') result")).rows[0].result;assert.equal(row.revision,1);assert.deepEqual(row.published,{fields:{}});assert.equal(row.draft.fields[field],'Draft');assert.equal(row.versions.length,0);
 }finally{await db.close();}
});
test('browser roles cannot read drafts/history or call copy RPCs; revoked staff cannot save through service RPC',async()=>{
 const db=await fixture();try{
  for(const role of ['anon','authenticated']){
   await db.exec('RESET ROLE;SET ROLE '+role);
   for(const query of ["SELECT page_copy_read(ARRAY['about'])","SELECT admin_page_copy_get('about')",'SELECT * FROM chaskabox_content.pages','SELECT * FROM chaskabox_content.page_versions'])await assert.rejects(db.query(query),/permission denied/);
  }
  await db.exec('RESET ROLE');await db.query('UPDATE admin_roles SET active=false WHERE user_id=$1',[content]);await db.exec('SET ROLE service_role');await assert.rejects(mutate(db,content,'draft',0,{fields:{}}),/Content staff required/);
 }finally{await db.close();}
});
test('copy contracts reject HTML, unknown fields/metadata, oversized text and catalogue SEO overrides',()=>{
 for(const value of [{fields:{[field]:'<script>alert(1)</script>'}},{fields:{unknown:'Text'}},{fields:{[field]:'x'.repeat(3001)}},{html:'arbitrary markup'},{seo_title:'x'.repeat(71)}])assert.throws(()=>validatePageCopy('about',value));
 assert.throws(()=>validatePageCopy('product',{seo_title:'One title for every product'}));
 assert.deepEqual(validatePageCopy('about',{fields:{[field]:PAGE_COPY_DEFINITIONS.about.fields[field].text}}),{fields:{}});
 assert.equal(pageKeyForPath('/guides/choosing-a-snack-box/'),'guides__choosing-a-snack-box');assert.equal(pageKeyForPath('/product/5/'),'product');assert.equal(pageKeyForPath('/brand/hilal/'),'brand');assert.equal(pageKeyForPath('/bag/'),'cart');assert.equal(pageKeyForPath('/not-a-real-page/'),null);
 assert.equal(copyKey('Add to Bag'),'t_8011cbdf');
});
test('all public text markers resolve to a page or shared registry entry and all public HTML loads the copy runtime',async()=>{
 for(const [key,definition]of Object.entries(PAGE_COPY_DEFINITIONS)){
  const p=definition.path;if(p==='*'||p==='/cart/'||p==='/wishlist/'||key.startsWith('snack-boxes__'))continue;
  const file=p==='/'?'index.html':p.endsWith('/')?p.slice(1)+'index.html':p.slice(1);const html=await readFile(new URL('../'+file,import.meta.url),'utf8');assert.match(html,/page-copy-runtime\.js\?v=/,file);
  for(const m of html.matchAll(/data-cb-(?:copy|placeholder)="([^"]+)"/g))assert.ok(definition.fields[m[1]]||PAGE_COPY_DEFINITIONS.shared.fields[m[1]],file+' '+m[1]);
 }
});
function ctx(body,aal='aal2',authorized=true){const token='fixture.'+Buffer.from(JSON.stringify({sub:owner,session_id:session,aal})).toString('base64url')+'.signature';return {request:new Request('https://chaskabox.online/api/admin/pages',{method:body?'POST':'GET',headers:{...(authorized?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'public-fixture',SUPABASE_SERVICE_ROLE_KEY:'private-fixture'}};}
test('page endpoints enforce owner live MFA, role and validation before any mutation RPC',async()=>{
 const original=globalThis.fetch;let calls=[];globalThis.fetch=async(url,init)=>{const p=new URL(url).pathname;calls.push(p);if(p==='/auth/v1/user')return Response.json({id:owner});if(p.endsWith('/admin_roles'))return Response.json([{role:'owner'}]);if(p.endsWith('/admin_session_check'))return Response.json(true);if(p.endsWith('/rpc/take_rate_limit_token'))return Response.json({allowed:true});if(p.endsWith('/admin_page_copy_mutate'))return Response.json({revision:1});if(p.endsWith('/admin_page_copy_list'))return Response.json([]);throw Error(p);};
 try{
  const body={key:'about',action:'draft',expected_revision:0,content:{fields:{[field]:'Draft'}}};
  assert.equal((await onRequestGet(ctx(null,'aal2',false))).status,401);assert.equal((await onRequestPost(ctx(body,'aal1'))).status,403);assert.equal(calls.some(x=>x.endsWith('/admin_page_copy_mutate')),false);
  const invalid=await onRequestPost(ctx({...body,content:{fields:{[field]:'<b>HTML</b>'}}}));assert.equal(invalid.status,422);assert.equal(calls.some(x=>x.endsWith('/admin_page_copy_mutate')),false);
  const saved=await onRequestPost(ctx(body));assert.equal(saved.status,200);assert.equal((await saved.json()).page.revision,1);assert.equal(calls.some(x=>x.endsWith('/admin_page_copy_mutate')),true);
 }finally{globalThis.fetch=original;}
});
test('native Cloudflare HTMLRewriter applies SEO/text/placeholders before JavaScript, escapes text and preserves price/schema/canonical',async()=>{
 const files=['tests/fixtures/page-copy-worker.js','functions/api/_lib/page-copy.js','functions/api/_lib/db.js','functions/api/_lib/storefront-html.js','page-copy-contract.js','page-copy-defaults.js'];
 const mf=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',workers:[{modules:files.map(p=>({type:'ESModule',path:path.resolve(p)})),modulesRoot:path.resolve('.'),compatibilityDate:'2026-10-04'}]}));
 try{const response=await mf.dispatchFetch('https://chaskabox.online/about/'),html=await response.text();assert.equal(response.status,200);assert.match(html,/<title>Owner SEO title<\/title>/);assert.match(html,/Reviewed copy &lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.match(html,/placeholder="Find your snacks"/);assert.match(html,/class="price">Rs\. 499/);assert.match(html,/"price":499/);assert.match(html,/rel="canonical" href="https:\/\/chaskabox.online\/about\/"/);assert.match(html,/id="published-page-copy"/);assert.equal(response.headers.get('etag'),null);assert.equal(response.headers.get('cache-control'),'no-store');}
 finally{await mf.dispose();}
});
test('function responses and Pages previews get security/noindex headers; admin APIs never cache',async()=>{
 const ctx={request:new Request('https://release.chaskabox-site.pages.dev/api/admin/pages'),env:{},next:async()=>Response.json({error:'Authentication required'},{status:401})};
 const r=await middleware(ctx);assert.equal(r.status,401);assert.equal(r.headers.get('X-Robots-Tag'),'noindex, nofollow');assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(r.headers.get('X-Frame-Options'),'SAMEORIGIN');
});
test('dedicated FAQ uses current commerce switches without stale free-delivery or COD claims',()=>{
 const rows=storeFaqs({cod_enabled:false,prepaid_free_delivery_enabled:false,prepaid_delivery_fee_pkr:450,delivery_estimate:'5–8 days'});assert.match(rows[1].a,/paused/);assert.doesNotMatch(rows[2].a,/qualify for free/);assert.match(rows[2].a,/450/);assert.match(rows[3].a,/5–8 days/);
});
