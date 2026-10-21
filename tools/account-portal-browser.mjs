// Actual source with disposable, stateful Auth/Data API fixtures. No live accounts or providers.
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {PORTAL_DEFAULTS} from '../account-portal-contract.js';
const output=path.resolve('test-results/account-portal');await mkdir(output,{recursive:true});
const uid='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003',owner='00000000-0000-4000-8000-000000000001';
let tick=0;const timestamp=()=>new Date(Date.UTC(2026,9,21,1,0,tick++)).toISOString();
const data={profiles:[{id:uid,name:'Ayesha Khan',phone:'03001234567',updated_at:timestamp()},{id:other,name:'Bilal Ahmed',phone:'03007654321',updated_at:timestamp()}],addresses:[{id:crypto.randomUUID(),user_id:uid,label:'Home',address:'Synthetic street 10, Test area',city:'Karachi',is_default:true,updated_at:timestamp(),created_at:timestamp()},{id:crypto.randomUUID(),user_id:other,label:'Private B',address:'Other synthetic address',city:'Lahore',is_default:true,updated_at:timestamp(),created_at:timestamp()}],orders:[],order_items:[],products:[{id:5,name:'Classic snack pack',price:450,visibility:'visible',stock_state:'sourced_after_order'},{id:8,name:'Unavailable pack',price:650,visibility:'visible',stock_state:'unavailable'},{id:9,name:'Unlisted pack',price:500,visibility:'hidden',stock_state:'sourced_after_order'}],wishlists:[{user_id:uid,product_id:5}],reviews:[{id:1,user_id:uid,product_id:5,rating:5,review_text:'A lovely box of snacks.',moderation_status:'approved',created_at:timestamp()}]};
for(let i=0;i<12;i++){const id=crypto.randomUUID();data.orders.push({id,user_id:uid,order_number:'CB-TEST-'+String(12-i).padStart(3,'0'),total:2100,payment_method:'cod',payment_status:'cod_due',fulfilment_status:i===1?'delivered':i===2?'cancelled':'sourcing',created_at:new Date(Date.UTC(2026,9,20-i)).toISOString()});data.order_items.push({order_id:id,product_id:5,product_name:'Classic snack pack',quantity:2},{order_id:id,product_id:8,product_name:'Unavailable pack',quantity:1},{order_id:id,product_id:9,product_name:'Unlisted pack',quantity:1});}
let options={...PORTAL_DEFAULTS},optionsStamp=null,resetCount=0,passwordUpdates=0;
function fakeSdk(){
 const primary='00000000-0000-4000-8000-000000000002',second='00000000-0000-4000-8000-000000000003',owner='00000000-0000-4000-8000-000000000001';
 const who=()=>document.cookie.match(/qa_user=([^;]+)/)?.[1]||'';
 const user=()=>{const id=who();return id?{id,email:id===second?'bilal@example.invalid':id===owner?'staff@example.invalid':'ayesha@example.invalid',user_metadata:{}}:null;};
 const session=()=>{const u=user();return u?{user:u,access_token:'synthetic-fixture-token'}:null;};
 let listener=()=>{};
 const query=table=>{const q={table,op:'select',filters:[],orders:[]},chain={};
  chain.select=(columns,opts={})=>{q.columns=columns;q.count=opts.count;return chain;};
  for(const method of ['eq','in','not'])chain[method]=(...args)=>{q.filters.push({method,args});return chain;};
  chain.order=(column,opts={})=>{q.orders.push([column,opts.ascending!==false]);return chain;};
  chain.range=(from,to)=>{q.range=[from,to];return chain;};chain.limit=n=>{q.range=[0,n-1];return chain;};
  chain.maybeSingle=()=>{q.single=true;return chain;};
  for(const op of ['insert','update','upsert','delete'])chain[op]=(payload,opts)=>{q.op=op;q.payload=payload;q.options=opts;return chain;};
  chain.then=(a,b)=>(async()=>{if(window.qaFailure===table+':'+q.op)return {data:null,error:{message:'Synthetic '+table+' outage'}};const r=await fetch('/qa/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...q,delay:window.qaDelay?.[table]||0})});return r.json();})().then(a,b);
  return chain;
 };
 window.qaSwitchAccount=id=>{document.cookie='qa_user='+id+';path=/';listener('SIGNED_IN',session());};
 window.supabase={createClient:()=>({from:query,rpc:async(name,args)=>{const r=await fetch('/qa/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})});return r.json();},auth:{
 getSession:async()=>({data:{session:session()},error:null}),refreshSession:async()=>({data:{session:session()}}),onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){}}}};},
 async signOut(){if(window.qaSignoutFailure)return {error:{message:'Synthetic sign-out outage'}};document.cookie='qa_user=;path=/;max-age=0';listener('SIGNED_OUT',null);return {error:null};},
 async signInWithPassword(){if(window.qaSigninFailure)return {error:{message:'Synthetic sign-in outage'}};if(window.qaSigninUnconfirmed)return {error:{message:'Email not confirmed',code:'email_not_confirmed'}};document.cookie='qa_user='+primary+';path=/';listener('SIGNED_IN',session());return {data:{user:user(),session:session()},error:null};},
 async signUp(payload){window.qaSignupCalls=(window.qaSignupCalls||0)+1;window.qaLastSignup=payload;return {data:{user:null,session:null},error:null};},
 async resend(payload){window.qaResendCalls=(window.qaResendCalls||0)+1;window.qaLastResend=payload;return {error:window.qaResendFailure?{message:'Synthetic confirmation outage'}:null};},
 async resetPasswordForEmail(){const r=await fetch('/qa/auth-event',{method:'POST',body:'reset'});return {error:window.qaResetFailure?{message:'Synthetic reset outage'}:null};},
 async updateUser(){await fetch('/qa/auth-event',{method:'POST',body:'password'});return {error:window.qaPasswordFailure?{message:'Synthetic password outage'}:null};},
 mfa:{listFactors:async()=>({data:{all:[],totp:[]}}),getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal2',nextLevel:'aal2'}})}
 }})};
}
const json=(res,body,status=200,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(body));};
async function body(req){let text='';for await(const b of req)text+=b;return text?JSON.parse(text):{};}
function matches(row,filters){return filters.every(({method,args:[key,a,b]})=>method==='eq'?String(row[key])===String(a):method==='in'?a.includes(row[key]):!String(b).slice(1,-1).split(',').includes(row[key]));}
function query(q,user){
 let rows=(data[q.table]||[]).filter(row=>q.table==='products'?row.visibility==='visible':q.table==='profiles'?row.id===user:q.table==='order_items'?data.orders.some(o=>o.id===row.order_id&&o.user_id===user):row.user_id===user);
 rows=rows.filter(r=>matches(r,q.filters));
 if(q.op==='insert'||q.op==='upsert'){
  for(const raw of Array.isArray(q.payload)?q.payload:[q.payload]){
   const row={...raw};if((q.table==='profiles'?row.id:row.user_id)!==user)return {data:null,error:{message:'Row policy denied'}};
   let existing=q.op==='upsert'?(data[q.table]||[]).find(x=>q.table==='profiles'?x.id===row.id:x.user_id===row.user_id&&x.product_id===row.product_id):null;
   if(existing){Object.assign(existing,row);rows=[existing];}else{if(q.table==='addresses'){row.id=crypto.randomUUID();row.created_at=timestamp();row.updated_at=row.updated_at||timestamp();row.is_default=false;}data[q.table].push(row);rows=[row];}
  }
 }else if(q.op==='update'){rows.forEach(r=>Object.assign(r,q.payload));}
 else if(q.op==='delete'){data[q.table]=data[q.table].filter(r=>!rows.includes(r));}
 else for(const [key,asc] of [...q.orders].reverse())rows.sort((a,b)=>String(a[key]).localeCompare(String(b[key]))*(asc?1:-1));
 const count=rows.length;if(q.range)rows=rows.slice(q.range[0],q.range[1]+1);
 rows=rows.map(r=>q.table==='orders'?{...r,order_items:data.order_items.filter(i=>i.order_id===r.id)}:q.table==='reviews'?{...r,products:{name:data.products.find(p=>p.id===r.product_id)?.name}}:{...r});
 return {data:q.single?(rows[0]||null):rows,count,error:null};
}
const root=path.resolve('.');
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost'),p=u.pathname,user=req.headers.cookie?.match(/qa_user=([^;]+)/)?.[1]||'',admin=user===owner;
 if(p==='/qa-sdk.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end('('+fakeSdk.toString()+')();');}
 if(p==='/qa/query'){const q=await body(req),answer=query(q,user);if(q.delay)await new Promise(r=>setTimeout(r,q.delay));return json(res,answer);}
 if(p==='/qa/auth-event'){let text='';for await(const c of req)text+=c;if(text==='reset')resetCount++;else passwordUpdates++;return json(res,{});}
 if(p==='/qa/rpc'){const q=await body(req);if(q.name==='customer_address_default'){const a=data.addresses.find(a=>a.id===q.args.p_address&&a.user_id===user);if(!a)return json(res,{error:{message:'Address unavailable'}});data.addresses.filter(a=>a.user_id===user).forEach(x=>x.is_default=x===a);return json(res,{data:a,error:null});}return json(res,{data:{linked:0},error:null});}
 if(p==='/api/public-config')return json(res,{supabaseUrl:'https://synthetic.example.invalid',supabaseAnonKey:'synthetic-public-key-for-fixtures-only'});
 if(p==='/api/account-portal')return json(res,{portal:options,support_email:'support@example.invalid'});
 if(p==='/api/public-pages')return json(res,{pages:[]});
 if(p==='/api/admin/me')return json(res,{role:'owner',user:{id:owner,email:'staff@example.invalid'},mfa:{required:true,aal:'aal2'},capabilities:['*']});
 if(p==='/api/admin/customers')return json(res,{customers:[],page:1,total:0,total_pages:1});
 if(p==='/api/admin/account-portal'){if(req.method==='PATCH'){const b=await body(req);if(b.expected_updated_at!==optionsStamp)return json(res,{error:{message:'Options changed elsewhere'}},409);options=b.portal;optionsStamp=timestamp();}return json(res,{portal:options,updated_at:optionsStamp});}
 if(p==='/api/admin/customer-accounts')return json(res,{accounts:data.profiles.filter(p=>!u.searchParams.get('q')||(p.name+' ayesha@example.invalid').toLowerCase().includes(u.searchParams.get('q').toLowerCase())).map(p=>({...p,email:p.id===uid?'ayesha@example.invalid':'bilal@example.invalid',email_confirmed:true,created_at:timestamp()})),page:1,total:2,total_pages:1});
 if(p.startsWith('/api/admin/customer-accounts/')){
  const id=p.split('/').at(-1),profile=data.profiles.find(p=>p.id===id);
  if(req.method==='PATCH'){
   if(!admin)return json(res,{error:{message:'Owner only'}},403);const b=await body(req);
   if(b.action==='profile'){if(profile.updated_at!==b.expected_updated_at)return json(res,{error:{message:'Changed elsewhere'}},409);Object.assign(profile,b.data,{updated_at:timestamp()});}
   else if(b.action==='address_create')data.addresses.push({...b.data,id:crypto.randomUUID(),user_id:id,updated_at:timestamp(),is_default:false});
   else{const a=data.addresses.find(a=>a.user_id===id&&a.id===b.address_id);if(!a||a.updated_at!==b.expected_updated_at)return json(res,{error:{message:'Changed elsewhere'}},409);if(b.action==='address_update')Object.assign(a,b.data,{updated_at:timestamp()});else if(b.action==='address_delete')data.addresses=data.addresses.filter(x=>x!==a);else data.addresses.filter(x=>x.user_id===id).forEach(x=>x.is_default=x===a);}
  }
  return json(res,{account:{...profile,email:id===uid?'ayesha@example.invalid':'bilal@example.invalid',email_confirmed:true},addresses:data.addresses.filter(a=>a.user_id===id),orders:[],wishlist_count:1,reviews:[],review_count:1,page:1,total:0,total_pages:1});
 }
 if(p.startsWith('/api/admin/'))return json(res,p.endsWith('/settings')?{settings:[]}:p.endsWith('/ai-status')?{enabled:false,reasons:[],models:{text:'fixture'},budget:{accounted_neuron_estimate:0,effective_budget:1,features:{}},index:{current:0,visible:0,remaining:0}}:{});
 if(p.startsWith('/api/'))return json(res,{});
 let file=path.join(root,p==='/admin/'?'/admin.html':p);if((await stat(file).catch(()=>null))?.isDirectory())file=path.join(file,'index.html');
 if(!file.startsWith(root+path.sep)||p.includes('..'))throw Error('Bad path');
 let content=await readFile(file);if(file.endsWith('.html'))content=Buffer.from(content.toString().replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+/g,'/qa-sdk.js'));
 const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'Content-Type':type});res.end(content);
 }catch(e){json(res,{error:{message:e.message}},404);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const evidence={cases:[],layouts:[]},contexts=[];
const pass=name=>{evidence.cases.push({name,pass:true});console.log('PASS',name);};
async function context(width=1280,user=uid){
 const c=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});contexts.push(c);
 if(user)await c.addCookies([{name:'qa_user',value:user,url:base}]);
 await c.route('**/*',route=>new URL(route.request().url()).origin===base||route.request().url().startsWith('data:')?route.continue():route.abort());
 return {context:c,page:await c.newPage()};
}
async function section(page,name){await page.getByRole('navigation',{name:'Account sections'}).getByRole('button',{name,exact:true}).click();}
async function ready(page){await page.getByRole('navigation',{name:'Account sections'}).waitFor();}
try{
 for(const width of [320,390,760,1280,1440]){
  const {context:c,page}=await context(width);await page.goto(base+'/account/');await ready(page);await page.locator('#accountLatest h2').waitFor();
  for(const name of ['Overview','My orders','Profile & security','Addresses','Wishlist','My reviews']){
   await section(page,name);if(name==='My orders')await page.locator('.account-order').first().waitFor();if(name==='Addresses')await page.locator('.account-address').first().waitFor();if(name==='Wishlist')await page.locator('.account-wish').first().waitFor();if(name==='My reviews')await page.locator('.account-review').first().waitFor();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   if(overflow)console.log('PORTAL_OVERFLOW',JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().right>innerWidth+1).slice(0,15).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,80)})))));
   assert.equal(overflow,false,width+' '+name+' overflow');
  }
  await section(page,'Overview');const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[]);
  await page.screenshot({path:path.join(output,'overview-'+width+'.png'),fullPage:true});
  evidence.layouts.push({width,sections:6,overflow:false,seriousAccessibilityIssues:0});await c.close();
 }
 pass('six portal sections fit 320–1440px with no serious accessibility issues');
 const {context:c,page}=await context(1280);await page.goto(base+'/account/');await ready(page);await section(page,'My orders');await page.getByText('Page 1 of 2',{exact:false}).waitFor();await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByText('Page 2 of 2',{exact:false}).waitFor();await page.locator('#accountOrderFilter').selectOption('delivered');await page.locator('.account-order').first().waitFor();assert.equal(await page.locator('.account-order').count(),1);pass('order pagination and status filtering');
 const order=page.locator('.account-order').first();await order.getByRole('button',{name:'Order again'}).click();await order.getByText('2 pack(s) added',{exact:false}).waitFor();assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('chaskabox-cart'))),{'5':2});await order.getByRole('link',{name:'Review cart →'}).waitFor();pass('re-order uses current availability, skips unavailable/unlisted packs and offers cart review');
 await section(page,'Profile & security');await page.locator('#acctProfileName').fill('Ayesha Updated');await page.evaluate(()=>{window.qaFailure='profiles:update';});await page.locator('#acctSaveProfile').click();await page.getByText('Synthetic profiles outage').waitFor();assert.equal(await page.locator('#acctProfileName').inputValue(),'Ayesha Updated');await page.evaluate(()=>{window.qaFailure='';});await page.locator('#acctProfilePhone').press('Enter');await page.getByText('Profile saved.',{exact:true}).waitFor();await page.reload();await ready(page);assert.equal(await page.locator('#acctProfileName').inputValue(),'Ayesha Updated');pass('profile preserves failed input, submits with Enter and persists after reload');
 await section(page,'Addresses');await page.locator('#newAddrLabel').fill('Work');await page.locator('#newAddrCity').fill('Lahore');await page.locator('#newAddrText').fill('Synthetic office street 20');await page.evaluate(()=>{window.qaFailure='addresses:insert';});await page.locator('#addAddrBtn').click();await page.getByText('Synthetic addresses outage').waitFor();assert.equal(await page.locator('#newAddrCity').inputValue(),'Lahore');await page.evaluate(()=>{window.qaFailure='';});await page.locator('#addAddrBtn').click();await page.getByText('Address saved.',{exact:true}).waitFor();
 let address=page.locator('.account-address').filter({has:page.getByRole('heading',{name:'Work',exact:true})});await address.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#newAddrLabel').fill('Office');await page.locator('#addAddrBtn').click();await page.getByText('Address updated.',{exact:true}).waitFor();address=page.locator('.account-address').filter({has:page.getByRole('heading',{name:'Office',exact:true})});await address.getByRole('button',{name:'Set default'}).click();await page.getByText('Default address saved.',{exact:true}).waitFor();await page.reload();await ready(page);await page.locator('.account-address').filter({has:page.getByRole('heading',{name:'Office Default',exact:true})}).waitFor();address=page.locator('.account-address').filter({has:page.getByRole('heading',{name:'Office Default',exact:true})});await address.getByRole('button',{name:'Delete',exact:true}).click();await address.getByRole('button',{name:'Keep address'}).click();assert.equal(data.addresses.some(a=>a.label==='Office'),true);await address.getByRole('button',{name:'Delete',exact:true}).click();await address.getByRole('button',{name:'Confirm delete'}).click();await page.getByText('Address deleted.',{exact:true}).waitFor();assert.equal(data.addresses.some(a=>a.label==='Office'),false);pass('address create/edit/default/reload/delete and failure recovery');
 await section(page,'Wishlist');await page.locator('.account-wish').waitFor();await page.getByRole('button',{name:'Remove',exact:true}).click();await page.getByText('Snack removed from your wishlist.').waitFor();await page.reload();await ready(page);await page.getByRole('heading',{name:'Save a little chaska for later'}).waitFor();pass('wishlist removal persists across reload');
 await section(page,'My orders');await page.locator('#linkOrdersBtn').click();await page.getByText('No unlinked orders found',{exact:false}).waitFor();pass('guest linking gives a useful empty result');
 await section(page,'My reviews');await page.getByText('Published',{exact:true}).waitFor();pass('review publication status is readable');
 await page.evaluate(()=>{window.qaDelay={addresses:700};});await section(page,'Addresses');await page.evaluate(id=>window.qaSwitchAccount(id),other);await page.getByRole('heading',{name:'Hello, Bilal!'}).waitFor();await page.waitForTimeout(900);await section(page,'Addresses');await page.getByRole('heading',{name:'Private B Default'}).waitFor();assert.equal(await page.locator('#addrList').innerText().then(t=>t.includes('Synthetic street 10')),false);pass('in-flight reads cannot render the previous customer’s addresses after account switch');
 await page.evaluate(()=>{window.qaSignoutFailure=true;});await page.locator('#acctLogout').click();await page.getByText('Sign out failed. Please try again.').waitFor();await page.evaluate(()=>{window.qaSignoutFailure=false;});await page.locator('#acctLogout').click();await page.locator('#acctSignIn').waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('chaskabox-wishlist-owner')),null);pass('sign-out retry and local wishlist cleanup');
 await page.setViewportSize({width:390,height:844});await page.locator('#acctSignIn').click();await page.locator('#authSwitch').click();
 const signupFields={authName:'Synthetic Customer',authPhone:'03001234567',authEmail:'synthetic@example.invalid',authPass:'Synthetic-only-password'};
 for(const [id,value] of Object.entries(signupFields)){assert.equal(await page.locator('#'+id).getAttribute('required'),'');await page.locator('#'+id).fill(value);}
 for(const [id,value] of Object.entries(signupFields)){await page.locator('#'+id).fill('');await page.locator('#authSubmit').click();assert.equal(await page.locator('#'+id).evaluate(e=>e.validity.valueMissing),true);assert.equal(await page.evaluate(()=>window.qaSignupCalls||0),0);await page.locator('#'+id).fill(value);}
 await page.locator('#authPhone').fill('       ');await page.locator('#authSubmit').click();await page.getByText('Enter a valid phone number.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.qaSignupCalls||0),0);await page.locator('#authPhone').fill(signupFields.authPhone);
 await page.locator('#authPass').fill('        ');await page.locator('#authSubmit').click();await page.getByText('Enter a password with at least 8 characters.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.qaSignupCalls||0),0);await page.locator('#authPass').fill(signupFields.authPass);pass('signup blocks every missing required field and whitespace-only phone/password without requesting account creation');
 await page.clock.install();await page.locator('#authPass').press('Enter');await page.getByRole('heading',{name:'Check your email or sign in'}).waitFor();assert.equal(await page.evaluate(()=>window.qaSignupCalls),1);assert.equal(await page.locator('.auth-card .order-error').count(),0);assert.equal(await page.locator('#authResend').isDisabled(),true);await page.getByText('Already verified?',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(output,'account-confirmation-390.png'),fullPage:true});
 assert.deepEqual(await page.evaluate(()=>window.qaLastSignup),{email:signupFields.authEmail,password:signupFields.authPass,options:{data:{name:signupFields.authName,phone:signupFields.authPhone},emailRedirectTo:base+'/account/'}});
 await page.clock.fastForward(60000);await page.locator('#authResend').click();await page.getByText('If this address has an unconfirmed account',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.qaResendCalls),1);assert.equal(await page.locator('#authResend').isDisabled(),true);assert.deepEqual(await page.evaluate(()=>window.qaLastResend),{type:'signup',email:signupFields.authEmail,options:{emailRedirectTo:base+'/account/'}});
 await page.locator('#authContinueSignIn').click();assert.equal(await page.locator('#authEmail').inputValue(),signupFields.authEmail);assert.equal(await page.locator('#authPass').inputValue(),'');pass('signup confirmation uses informative feedback, throttles explicit resends and offers existing-account sign-in without retaining the password');
 await page.evaluate(()=>{window.qaSigninUnconfirmed=true;window.qaResendFailure=true;});await page.locator('#authPass').fill(signupFields.authPass);await page.locator('#authPass').press('Enter');await page.locator('#authResend').click();await page.getByText('Synthetic confirmation outage').waitFor();assert.equal(await page.locator('#authConfirmationStatus').getAttribute('data-error'),'true');await page.locator('#authResetPassword').click();assert.equal(await page.locator('#resetEmail').inputValue(),signupFields.authEmail);await page.keyboard.press('Escape');await page.evaluate(()=>{window.qaSigninUnconfirmed=false;window.qaResendFailure=false;});await page.clock.resume();pass('unconfirmed sign-in offers confirmation recovery, reports resend failure and prefills password reset');
 await page.locator('#acctSignIn').click();await page.evaluate(()=>{window.qaSigninFailure=true;});await page.locator('#authEmail').fill('ayesha@example.invalid');await page.locator('#authPass').fill('Synthetic-only-password');await page.locator('#authPass').press('Enter');await page.getByText('Synthetic sign-in outage').waitFor();assert.equal(await page.locator('#authEmail').inputValue(),'ayesha@example.invalid');await page.keyboard.press('Escape');assert.equal(await page.locator('#acctSignIn').evaluate(e=>e===document.activeElement),true);pass('sign-in error retains input, Enter submits, Escape restores focus');
 await page.locator('#acctForgot').click();await page.locator('#resetEmail').fill('ayesha@example.invalid');await page.locator('#resetEmail').press('Enter');await page.getByText('If an account uses this email',{exact:false}).waitFor();assert.equal(resetCount,1);await page.keyboard.press('Escape');pass('password reset form submits once and shows a generic confirmation');
 await page.goto(base+'/account/?qa_recovery=expired#type=recovery');await page.locator('#retryReset').waitFor();pass('expired recovery link offers a new link');
 await page.locator('#retryReset').click();await page.locator('#resetBack').click();await page.locator('#authEmail').fill('ayesha@example.invalid');await page.locator('#authPass').fill('Synthetic-only-password');await page.locator('#authPass').press('Enter');await ready(page);pass('normal sign-in cancels expired recovery mode and opens the account dashboard');
 await c.close();
 const {context:ac,page:adminPage}=await context(1280,owner);await adminPage.goto(base+'/admin/');await adminPage.locator('.admin-nav-btn[data-view="customers"]').click();await adminPage.locator('#customerAccountControls').click();await adminPage.getByRole('heading',{name:'Customer accounts & portal'}).waitFor();await adminPage.locator('#portalAccountQuery').fill('Ayesha');await adminPage.getByRole('button',{name:'Search accounts'}).click();await adminPage.getByRole('button',{name:'Ayesha Updated',exact:true}).click();await adminPage.locator('#portalProfileName').fill('Ayesha Admin Updated');await adminPage.locator('#portalSaveProfile').click();await adminPage.getByText('Customer details saved and reloaded.').waitFor();assert.equal(data.profiles.find(p=>p.id===uid).name,'Ayesha Admin Updated');
 await adminPage.locator('#portalNewAddress').click();await adminPage.locator('#portalAddressLabel').fill('Admin office');await adminPage.locator('#portalAddressCity').fill('Multan');await adminPage.locator('#portalAddressText').fill('Synthetic admin-managed address');await adminPage.locator('#portalSaveAddress').click();await adminPage.locator('#portalAdminAddress').waitFor({state:'detached'});await adminPage.getByText('Customer details saved and reloaded.').waitFor();assert.equal(data.addresses.some(a=>a.label==='Admin office'),true);await adminPage.locator('#portalAccountsBack').click();await adminPage.locator('#portal-show_reorder').uncheck();await adminPage.locator('#portalSaveOptions').click();await adminPage.getByText('Portal options saved and reloaded.',{exact:false}).waitFor();assert.equal(options.show_reorder,false);
 await adminPage.screenshot({path:path.join(output,'admin-controls-1280.png'),fullPage:true});pass('admin searches registered accounts, saves profile/address and verifies portal settings after reload');
 const {context:cc,page:customerPage}=await context(390);await customerPage.goto(base+'/account/');await ready(customerPage);await customerPage.getByRole('heading',{name:'Hello, Ayesha!'}).waitFor();await section(customerPage,'My orders');await customerPage.locator('.account-order').first().waitFor();assert.equal(await customerPage.getByRole('button',{name:'Order again'}).count(),0);await section(customerPage,'Addresses');await customerPage.getByRole('heading',{name:'Admin office',exact:true}).waitFor();pass('admin changes are visible to the customer and disabled shortcuts disappear');
 await cc.close();await ac.close();
 assert.equal(passwordUpdates,0,'no unintended password changes');
 await writeFile(path.join(output,'results.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({passed:evidence.cases.length,viewports:evidence.layouts.length,providerCalls:0}));
}catch(e){await writeFile(path.join(output,'failure.json'),JSON.stringify({error:e.stack,evidence},null,2));for(const [i,c] of contexts.entries())for(const p of c.pages())await p.screenshot({path:path.join(output,'failure-'+i+'.png'),fullPage:true}).catch(()=>{});throw e;}
finally{await browser.close();await new Promise(r=>server.close(r));}
