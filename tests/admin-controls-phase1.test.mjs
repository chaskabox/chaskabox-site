import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseBulkRequest,onRequestPost} from '../functions/api/admin/products/bulk.js';

const owner='00000000-0000-4000-8000-000000000001';
const session='00000000-0000-4000-8000-000000000010';
function ctx(ids,action,aal='aal2'){
  const jwt='fixture.'+Buffer.from(JSON.stringify({sub:owner,aal,session_id:session})).toString('base64url')+'.signature';
  return {
    env:{SUPABASE_URL:'https://db.example.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'},
    request:new Request('https://shop.example.invalid/api/admin/products/bulk',{
      method:'POST',headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json'},
      body:JSON.stringify({ids,action}),
    }),
  };
}
async function withMock({role='owner',products=[{id:3,is_bundle:false,visibility:'visible',updated_at:'2026-10-13T00:00:00Z'},{id:4,is_bundle:false,visibility:'hidden',updated_at:'2026-10-13T00:00:00Z'}],live=true}={},run){
  const prior=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,opt={})=>{
    const u=new URL(url),path=u.pathname;
    const body=opt.body?JSON.parse(opt.body):null;
    calls.push({path,body});
    if(path==='/auth/v1/user')return Response.json({id:owner});
    if(path==='/rest/v1/admin_roles')return Response.json(role?[{role}]:[]);
    if(path==='/rest/v1/rpc/admin_session_check')return Response.json(live);
    if(path==='/rest/v1/rpc/take_rate_limit_token')return Response.json([{allowed:true}]);
    if(path==='/rest/v1/products')return Response.json(products.filter(p=>u.searchParams.get('id')?.includes(String(p.id))));
    if(path==='/rest/v1/rpc/admin_cms_transaction')return Response.json(body.p_operations.map(x=>({id:Number(x.id),visibility:x.data.visibility})));
    throw Error('Unexpected I/O: '+path);
  };
  try{await run(calls);}finally{globalThis.fetch=prior;}
}
test('bulk validation limits size, action and repeated/invalid IDs',()=>{
  assert.deepEqual(parseBulkRequest({ids:[3,4],action:'hide'}),{action:'hide',ids:[3,4],target:'hidden'});
  for(const payload of [{ids:[],action:'show'},{ids:[1,1],action:'hide'},{ids:[1.5],action:'show'},{ids:[-1],action:'show'},{ids:[1],action:'delete'},{ids:Array.from({length:51},(_,i)=>i+1),action:'archive'}])
    assert.throws(()=>parseBulkRequest(payload),x=>x instanceof Response&&x.status===400);
});
test('bulk hide creates a single atomic audited CMS transaction, skipping no-op',async()=>{
  await withMock({},async calls=>{
    const response=await onRequestPost(ctx([3,4],'hide'));
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true,changed:1,skipped:1,action:'hide'});
    const rpc=calls.filter(x=>x.path==='/rest/v1/rpc/admin_cms_transaction');
    assert.equal(rpc.length,1);
    assert.deepEqual(rpc[0].body.p_operations.map(x=>x.id),['3']);
    assert.equal(rpc[0].body.p_operations[0].data.visibility,'hidden');
    assert.ok(rpc[0].body.p_operations[0].expected_updated_at);
  });
});
test('bulk archive refuses bundles or stale selections before any writes',async()=>{
  await withMock({products:[{id:3,is_bundle:true,visibility:'visible',updated_at:'2026-10-13T00:00:00Z'}]},async calls=>{
    const r=await onRequestPost(ctx([3],'archive'));
    assert.equal(r.status,409);
    assert.equal(calls.filter(x=>x.path==='/rest/v1/rpc/admin_cms_transaction').length,0);
  });
  await withMock({},async calls=>{
    assert.equal((await onRequestPost(ctx([3,55],'hide'))).status,409);
    assert.equal(calls.filter(x=>x.path==='/rest/v1/rpc/admin_cms_transaction').length,0);
  });
});
test('bulk restore is hidden-first and rejects public show on archived',async()=>{
  const products=[{id:3,is_bundle:false,visibility:'archived',updated_at:'2026-10-13T00:00:00Z'}];
  await withMock({products},async calls=>{
    assert.equal((await onRequestPost(ctx([3],'show'))).status,409);
    const r=await onRequestPost(ctx([3],'restore'));
    assert.equal(r.status,200);
    assert.equal(calls.filter(x=>x.path==='/rest/v1/rpc/admin_cms_transaction').length,1);
    assert.equal(calls.find(x=>x.path==='/rest/v1/rpc/admin_cms_transaction').body.p_operations[0].data.visibility,'hidden');
  });
});
test('bulk writes require active allowed role and live MFA, including managers/content',async()=>{
  for(const role of [null,'fulfilment']){
    await withMock({role},async calls=>{
      assert.equal((await onRequestPost(ctx([3],'hide'))).status,403);
      assert.equal(calls.some(x=>x.path==='/rest/v1/rpc/admin_cms_transaction'),false);
    });
  }
  await withMock({},async calls=>{
    assert.equal((await onRequestPost(ctx([3],'hide','aal1'))).status,403);
    assert.equal(calls.some(x=>x.path==='/rest/v1/rpc/admin_cms_transaction'),false);
  });
  for(const role of ['manager','content']){
    await withMock({role},async()=>{
      assert.equal((await onRequestPost(ctx([3],'hide'))).status,200);
    });
  }
});
test('admin controls expose usable bulk workflow, preview, settings save and role feedback',async()=>{
  const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
  const live=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
  const legacy=await readFile(new URL('../admin.js',import.meta.url),'utf8');
  const productRoute=await readFile(new URL('../functions/api/admin/products/index.js',import.meta.url),'utf8');
  for(const token of ['data-bulk="archive"','data-bulk="restore"','id="bulkFeedback"'])assert.ok(html.includes(token),token);
  assert.match(live,/api\('\/api\/admin\/products\/bulk'/);
  assert.match(live,/addEventListener\('click',async event=>\{/);
  assert.match(live,/event\.stopImmediatePropagation\(\)/);
  assert.match(live,/function wireBoxPreview\(\)/);
  assert.match(live,/function syncRoleNavigation\(\)/);
  assert.match(live,/input\.getRealValue=\(\)=>revealed\?input\.value:input\.dataset\.realValue/);
  assert.match(live,/Settings saved and verified by reloading from database/);
  assert.match(productRoute,/'stock_state', 'tags'/);
  assert.match(legacy,/if\(!id\)\{for\(const field of \['editBrand'/);
  assert.ok(html.includes('Save writes a private draft to the database'));
});
