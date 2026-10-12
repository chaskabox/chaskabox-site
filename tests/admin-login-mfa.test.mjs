import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { withAdmin, needsAdminMfa } from '../functions/api/admin/_lib/auth.js';

const id='00000000-0000-4000-8000-000000000001';
const session='00000000-0000-4000-8000-000000000010';
function ctx(method='GET',path='/api/admin/products',aal='aal1'){
  const token='fixture.'+Buffer.from(JSON.stringify({sub:id,aal,session_id:session})).toString('base64url')+'.verified-by-mock';
  return {env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'anon-test',SUPABASE_SERVICE_ROLE_KEY:'service-test'},
    request:new Request('https://shop.invalid'+path,{method,headers:{Authorization:'Bearer '+token},
      ...(method!=='GET'?{body:'{}'}:{})})};
}
async function withApiMock(run){
  const prior=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options={})=>{
    const path=new URL(url).pathname;calls.push(path);
    if(path==='/auth/v1/user')return Response.json({id});
    if(path==='/rest/v1/admin_roles')return Response.json([{role:'owner'}]);
    if(path==='/rest/v1/rpc/admin_session_check')return Response.json(true);
    if(path==='/rest/v1/rpc/take_rate_limit_token')return Response.json([{allowed:true}]);
    throw new Error('Unexpected request '+path);
  };
  try{await run(calls);}finally{globalThis.fetch=prior;}
}

test('owner GET data requires AAL2; /me remains reachable for enrolling without lockout', async()=>{
  assert.equal(needsAdminMfa(ctx().request,'owner'),true);
  assert.equal(needsAdminMfa(ctx('GET','/api/admin/me').request,'owner'),false);
  assert.equal(needsAdminMfa(ctx().request,'content'),false);
  const guarded=withAdmin(['owner'],()=>Response.json({ok:true}));
  await withApiMock(async calls=>{
    const denied=await guarded(ctx());
    assert.equal(denied.status,403);
    assert.equal((await denied.json()).error.code,'MFA_REQUIRED');
    assert.ok(!calls.includes('/rest/v1/rpc/admin_session_check'));
    const allowed=await guarded(ctx('GET','/api/admin/products','aal2'));
    assert.equal(allowed.status,200);
    assert.ok(calls.includes('/rest/v1/rpc/admin_session_check'));
    const me=await guarded(ctx('GET','/api/admin/me'));
    assert.equal(me.status,200);
  });
});

test('MFA script is loaded before admin application and dashboard loads only after gate',async()=>{
  const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
  const admin=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
  assert.ok(html.indexOf('/admin-login-mfa.js')<html.indexOf('/admin-live.js'));
  assert.match(admin,/const passed=await window\.chaskaAdminMfa\.gate\(SB/);
  assert.ok(admin.indexOf('if(!passed)return false;')<admin.indexOf('me=await getMe();'));
  assert.match(admin,/const ready=await bootAuthenticated\(\);if\(ready\)el\.hidden=true/);
});

function makeBrowser(){
  const listeners={};
  const select={value:'',appendChild(item){if(!this.value)this.value=item.value;}};
  const code={value:'',focus(){}};
  const error={textContent:'',hidden:true};
  const submit={disabled:false,textContent:''};
  const cancel={disabled:false,addEventListener(name,cb){listeners['cancel:'+name]=cb;}};
  const form={addEventListener(name,cb){listeners[name]=cb;}};
  const overlay={hidden:true,innerHTML:'',className:'',id:'',querySelector(sel){
    return {'#loginMfaFactor':select,'#loginMfaFactorLabel':{hidden:false},'#loginMfaCode':code,
      '#loginMfaForm':form,'#loginMfaError':error,'#loginMfaVerify':submit,'#loginMfaCancel':cancel}[sel];
  }};
  const items={
    liveAdminLogin:{hidden:false},livePassword:{value:'secret'},
    adminBoot:{style:{display:'grid'}}
  };
  const document={getElementById(name){return items[name]||null;},
    createElement(tag){
      if(tag==='div')return overlay;
      if(tag==='option')return {value:'',textContent:''};
      throw new Error('Unexpected element '+tag);
    },body:{appendChild(node){items[node.id]=node;}}};
  const window={};
  return {window,document,overlay,items,select,code,error,submit,cancel,listeners};
}
test('AAL1 verified-factor session cannot skip code, bad code stays blocked and verified code unlocks',async()=>{
  const source=await readFile(new URL('../admin-login-mfa.js',import.meta.url),'utf8');
  const b=makeBrowser();
  vm.runInNewContext(source,{window:b.window,document:b.document});
  let level='aal1',verified=false,opened=0,attempts=0;
  const supabase={auth:{mfa:{
    getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:level}}),
    listFactors:async()=>({data:{totp:[{id:'fixture-factor',status:'verified',friendly_name:'Owner authenticator'}]}}),
    challengeAndVerify:async({factorId,code})=>{
      attempts++;assert.equal(factorId,'fixture-factor');
      if(code!=='123456')return {error:new Error('Invalid code')};
      level='aal2';verified=true;return {error:null};
    }
  },signOut:async()=>({error:null})}};
  const gate=await b.window.chaskaAdminMfa.gate(supabase,async()=>{opened++;return verified;},async()=>{});
  assert.equal(gate,false);
  assert.equal(opened,0);
  assert.equal(b.items.liveAdminLogin.hidden,true);
  assert.equal(b.items.livePassword.value,'');
  assert.equal(b.overlay.hidden,false);
  assert.equal(b.select.value,'fixture-factor');
  b.code.value='000000';
  await b.listeners.submit({preventDefault(){}});
  assert.equal(opened,0);
  assert.equal(b.overlay.hidden,false);
  assert.equal(b.error.hidden,false);
  b.code.value='123456';
  await b.listeners.submit({preventDefault(){}});
  assert.equal(opened,1);
  assert.equal(attempts,2);
  assert.equal(b.overlay.hidden,true);
});
test('existing AAL2 sessions skip challenge; users without enrolled MFA can reach setup',async()=>{
  const source=await readFile(new URL('../admin-login-mfa.js',import.meta.url),'utf8');
  const b=makeBrowser();
  vm.runInNewContext(source,{window:b.window,document:b.document});
  const signedIn={auth:{mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal2'}}),
      listFactors:async()=>{throw new Error('Not called');}}}};
  assert.equal(await b.window.chaskaAdminMfa.gate(signedIn,async()=>true,async()=>{}),true);
  const newUser={auth:{mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1'}}),
    listFactors:async()=>({data:{totp:[],phone:[]}})}}};
  assert.equal(await b.window.chaskaAdminMfa.gate(newUser,async()=>true,async()=>{}),true);
  assert.equal(b.overlay.hidden,true);
});
