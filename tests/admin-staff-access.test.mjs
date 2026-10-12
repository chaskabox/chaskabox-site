import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet, onRequestPost, onRequestPatch } from '../functions/api/admin/staff/index.js';

const id='00000000-0000-4000-8000-000000000001';
const second='00000000-0000-4000-8000-000000000002';
const existing='00000000-0000-4000-8000-000000000003';
const invited='00000000-0000-4000-8000-000000000004';
const session='00000000-0000-4000-8000-000000000010';
function ctx(method='GET',body,aal='aal2'){
  const token='fixture.'+Buffer.from(JSON.stringify({sub:id,aal,session_id:session})).toString('base64url')+'.verified-by-mock';
  return {
    env:{SUPABASE_URL:'https://db.example.invalid',SUPABASE_ANON_KEY:'anon-for-test',SUPABASE_SERVICE_ROLE_KEY:'service-for-test'},
    request:new Request('https://site.example.invalid/api/admin/staff',{
      method,headers:{Authorization:'Bearer '+token},
      ...(method!=='GET'?{body:JSON.stringify(body||{})}:{})
    })
  };
}
async function mock(role,run){
  const old=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,opts={})=>{
    const path=new URL(url).pathname,query=new URL(url).searchParams;
    calls.push({path,method:opts.method||'GET',body:opts.body?JSON.parse(opts.body):null});
    if(path==='/auth/v1/user')return Response.json({id});
    if(path==='/rest/v1/admin_roles'){
      return Response.json(query.has('user_id')?[{role}]:[
        {user_id:id,role:'owner',active:true,granted_at:'2026-10-12T00:00:00Z'},
        {user_id:second,role:'owner',active:true,granted_at:'2026-10-12T00:00:00Z'}
      ]);
    }
    if(path==='/rest/v1/rpc/admin_session_check')return Response.json(true);
    if(path==='/rest/v1/rpc/take_rate_limit_token')return Response.json([{allowed:true}]);
    if(path==='/auth/v1/admin/users/'+id)return Response.json({id,email:'first@example.test',last_sign_in_at:'2026-10-11T00:00:00Z'});
    if(path==='/auth/v1/admin/users/'+second)return Response.json({id:second,email:'second@example.test'});
    if(path==='/auth/v1/admin/users'){
      return Response.json({users:[{id:existing,email:'existing@example.test'}]});
    }
    if(path==='/auth/v1/invite')return Response.json({id:invited,email:'new@example.test'});
    if(path==='/rest/v1/rpc/admin_staff_assign')return Response.json({staff:{user_id:JSON.parse(opts.body).p_target}});
    if(path==='/rest/v1/rpc/admin_staff_update')return Response.json({staff:{user_id:JSON.parse(opts.body).p_target}});
    throw Error('Unexpected request: '+path);
  };
  try {await run(calls);} finally {globalThis.fetch=old;}
}
test('owner sees both staff emails, not just UUIDs or full Auth user data',async()=>{
  await mock('owner',async calls=>{
    const res=await onRequestGet(ctx());
    assert.equal(res.status,200);
    const data=await res.json();
    assert.deepEqual(data.staff.map(x=>x.email),['first@example.test','second@example.test']);
    assert.equal(data.staff[0].role,'owner');
    assert.equal(data.staff[1].active,true);
    assert.ok(!Object.hasOwn(data.staff[0],'password'));
    assert.equal(calls.filter(c=>c.path.startsWith('/auth/v1/admin/users/')).length,2);
  });
});
test('non-owner cannot access staff identity endpoint',async()=>{
  await mock('content',async calls=>{
    const res=await onRequestGet(ctx());
    assert.equal(res.status,403);
    assert.ok(!calls.some(c=>c.path.startsWith('/auth/v1/admin/')));
  });
});
test('owner can grant an existing account access without resending an invite',async()=>{
  await mock('owner',async calls=>{
    const res=await onRequestPost(ctx('POST',{email:' EXISTING@example.test ',role:'manager'}));
    assert.equal(res.status,200);
    const data=await res.json();
    assert.equal(data.invitation_requested,false);
    assert.equal(data.email,'existing@example.test');
    assert.ok(!calls.some(c=>c.path==='/auth/v1/invite'));
    const assign=calls.find(c=>c.path==='/rest/v1/rpc/admin_staff_assign');
    assert.equal(assign.body.p_target,existing);
    assert.equal(assign.body.p_role,'manager');
  });
});
test('new email requests invite, and AAL1 cannot grant staff access',async()=>{
  await mock('owner',async calls=>{
    const blocked=await onRequestPost(ctx('POST',{email:'new@example.test',role:'content'},'aal1'));
    assert.equal(blocked.status,403);
    assert.ok(!calls.some(c=>c.path==='/auth/v1/invite'));
    const allowed=await onRequestPost(ctx('POST',{email:'new@example.test',role:'content'}));
    assert.equal(allowed.status,201);
    assert.equal((await allowed.json()).invitation_requested,true);
    assert.ok(calls.some(c=>c.path==='/auth/v1/invite'));
  });
});
test('changes require AAL2 and reject invalid role or active type',async()=>{
  await mock('owner',async calls=>{
    const denied=await onRequestPatch(ctx('PATCH',{user_id:second,role:'manager'},'aal1'));
    assert.equal(denied.status,403);
    assert.equal((await onRequestPatch(ctx('PATCH',{user_id:second,active:'false'}))).status,400);
    assert.equal((await onRequestPatch(ctx('PATCH',{user_id:second,role:'admin'}))).status,400);
    assert.equal((await onRequestPatch(ctx('PATCH',{user_id:second,role:'content',active:false}))).status,200);
    assert.equal(calls.filter(c=>c.path==='/rest/v1/rpc/admin_staff_update').length,1);
  });
});
test('admin interface has visible logout controls and an owner email management panel',async()=>{
  const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
  const css=await readFile(new URL('../admin.css',import.meta.url),'utf8');
  const script=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
  for(const token of ['id="adminSignOut"','id="adminSidebarSignOut"','id="adminCurrentAccount"','Team &amp; Security'])assert.ok(html.includes(token),token);
  assert.match(css,/#adminSidebarSignOut\{display:block;color:var\(--navy\)/);
  assert.ok(script.includes("me.user?.email"));
  assert.ok(script.includes("await loadStaffAccess()"));
  assert.ok(script.includes("signOutAdmin('local')"));
});
