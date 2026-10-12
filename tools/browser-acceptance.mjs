// Actual local source + explicit synthetic API/Auth fixtures. No real orders or providers.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {cataloguePhoto,photoUnderReview} from '../functions/api/_lib/catalogue-photos.js';
import {onRequestGet as productPage} from '../functions/product/[[slug]].js';
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const root=path.resolve('.'),output=path.resolve(option('--output','test-results/browser'));await mkdir(output,{recursive:true});
const raw=JSON.parse(await readFile(option('--catalogue','tests/fixtures/browser-catalogue.json'),'utf8'));
const products=raw.filter(p=>p.active!==false).map(p=>{const db={...p,image_url:p.image_url??p.img};return {...p,img:cataloguePhoto(db),photoNote:photoUnderReview(db)?'Photo under review':'',stockState:p.stockState||p.stock_state||'sourced_after_order'};});
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const brandName=p=>p.brand||p.name.split('|')[0].trim();
const brands=[...new Set(products.map(brandName))].map((name,i)=>({id:i+1,name,slug:slug(name),productCount:products.filter(p=>brandName(p)===name).length}));
const settings={cod_enabled:true,jazzcash_enabled:true,bank_transfer_enabled:true,cod_delivery_fee_pkr:300,prepaid_delivery_fee_pkr:300,prepaid_free_delivery_threshold_pkr:5000,delivery_estimate:'4–7 days'};
const manifest={settings,theme:{},navigation:[{location:'header',label:'Shop Snacks',url:'/shop/',is_enabled:true,position:1}],categories:[...new Set(products.map(p=>p.category))].filter(Boolean).map(name=>({name,slug:slug(name.replace(/&/g,'and')),is_visible:true,show_on_homepage:true,product_ids:products.filter(p=>p.category===name).map(p=>p.id)})),sections:[]};
function fakeSdk(){
 window.supabase={createClient(){
  const role=(document.cookie.match(/qa_role=([^;]+)/)||[])[1],user={id:'00000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid'},session=role?{user,access_token:'synthetic-fixture-token'}:null;
  const chain=()=>{const q={};for(const name of ['select','eq','order','limit','upsert','insert','update','delete','maybeSingle'])q[name]=()=>q;q.then=(a,b)=>Promise.resolve({data:[],error:null}).then(a,b);return q;};
  return {auth:{getSession:async()=>({data:{session}}),refreshSession:async()=>({data:{session}}),onAuthStateChange(fn){window.qaAuthEvent=fn;return {data:{subscription:{unsubscribe(){}}}};},signOut:async()=>({error:null}),resetPasswordForEmail:async()=>({error:window.qaResetFailure?{message:'Synthetic reset outage'}:null}),updateUser:async()=>{window.qaPasswordUpdates=(window.qaPasswordUpdates||0)+1;return {error:window.qaPasswordFailure?{message:'Synthetic password outage'}:null};},mfa:{listFactors:async()=>({data:{all:[],totp:[]}}),getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal2',nextLevel:'aal2'}})}},from:chain,rpc:async()=>({data:0,error:null})};
 }};
}
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
 const u=new URL(typeof url==='string'?url:url.url);
 if(u.hostname==='fixture.example.invalid'){
  const id=Number(u.searchParams.get('id')?.replace('eq.','')),p=raw.find(p=>p.id===id&&products.some(q=>q.id===id));
  return Response.json(p?[{...p,image_url:p.image_url??p.img,description:p.desc,old_price:p.oldPrice,is_bundle:p.bundle,visibility:'visible',stock_state:p.stockState||p.stock_state||'sourced_after_order'}]:[]);
 }return originalFetch(url,init);
};
let attentionError=false;
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const shell=await readFile('index.html','utf8');
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1'),p=u.pathname,role=(req.headers.cookie?.match(/qa_role=([^;]+)/)||[])[1]||'owner';
 if(p==='/qa-sdk.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end('('+fakeSdk.toString()+')();');}
 if(p.startsWith('/api/')){
  if(p==='/api/products')return json(res,products);
  if(p==='/api/storefront-config')return json(res,manifest);
  if(p==='/api/public-config')return json(res,{supabaseUrl:'https://fixture.example.invalid',supabaseAnonKey:'synthetic-public-key-for-local-fixtures-only'});
  if(p==='/api/public-settings'||p==='/api/settings')return json(res,{settings});
  if(p==='/api/brands'){const brand=brands.find(b=>b.slug===u.searchParams.get('slug'));return json(res,u.searchParams.has('slug')?{brand}:{brands});}
  if(p==='/api/brand-products'){const brand=brands.find(b=>b.slug===u.searchParams.get('slug'));return json(res,{brand:brand?.name,products:products.filter(p=>brandName(p)===brand?.name)});}
  if(p==='/api/reviews')return json(res,{reviews:[],summary:{count:0,average:0},total:0});
  if(p==='/api/admin/me')return json(res,{role,user:{id:'00000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid'},mfa:{required:true,aal:'aal2'},capabilities:role==='owner'?['*']:[]});
  if(p==='/api/admin/products')return json(res,{products:products.map(p=>({...p,image_url:p.img,description:p.desc,visibility:'visible',stock_state:p.stockState})),page:1,total:products.length,total_pages:1});
  if(p==='/api/admin/orders')return json(res,{orders:[],total:0,total_pages:1,page:1});
  if(p==='/api/admin/boxes')return json(res,{boxes:[],total:0,total_pages:1,page:1});
  if(p==='/api/admin/categories')return json(res,{categories:[]});
  if(p==='/api/admin/metrics')return json(res,{recognized_sales_pkr:0});
  if(p==='/api/admin/attention')return json(res,{counts:{new_orders:0},needs_attention:[],needs_attention_total:0});
  if(p.startsWith('/api/admin/analytics/'))return attentionError&&p.endsWith('/attention')?json(res,{error:{message:'Synthetic attention outage'}},503):json(res,{ok:true,data:p.endsWith('/attention')?{items:[]}:p.endsWith('/overview')?{cards:{}}:{}});
  if(p==='/api/admin/settings')return json(res,{settings:Object.entries(settings).map(([key,value])=>({key,value}))});
  if(p==='/api/admin/theme')return json(res,{theme:{}});
  if(p==='/api/admin/navigation')return json(res,{menus:[]});
  if(p==='/api/admin/brands')return json(res,{brands});
  if(p==='/api/admin/ai-status')return json(res,{enabled:false,features:{},index:{remaining:1}});
  if(req.method!=='GET')return json(res,{error:{message:'Mutations disabled in browser fixture'}},503);
  return json(res,{});
 }
 if(/^\/product\/\d+\/$/.test(p)){
  const response=await productPage({params:{slug:p.split('/')[2]},request:new Request('http://127.0.0.1'+p),env:{SUPABASE_URL:'https://fixture.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',ASSETS:{fetch:async()=>new Response(shell)}}});
  res.writeHead(response.status,{'Content-Type':'text/html'});return res.end((await response.text()).replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+/g,'/qa-sdk.js'));
 }
 if(/\.\.|(^|\/)\./.test(p)){res.writeHead(403);return res.end('Forbidden');}
 const assetPath=p==='/admin/'?'/admin.html':/^\/brand\/[^/]+\/$/.test(p)?'/brand/index.html':p;
 let file=path.join(root,decodeURIComponent(assetPath));if((await stat(file).catch(()=>null))?.isDirectory())file=path.join(file,'index.html');
 if(!/\.(html|css|js|json|png|webp|svg|mp4)$/.test(file)){res.writeHead(404);return res.end('Not found');}
 let data=await readFile(file);if(file.endsWith('.html'))data=Buffer.from(data.toString().replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+/g,'/qa-sdk.js'));
 const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const executablePath=option('--browser-executable',process.env.QA_BROWSER_EXECUTABLE);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const results={method:'Actual local source with synthetic API/Auth fixtures; not managed acceptance',cases:[],interactions:[],errors:[]};
async function contextFor(width,role){const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});if(role)await context.addCookies([{name:'qa_role',value:role,url:base}]);await context.route('https://**/*',route=>route.fulfill({status:200,contentType:'text/plain',body:''}));const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.stack));page.on('dialog',d=>d.dismiss());return {context,page};}
async function inspect(page,route,width,role){
 const response=await page.goto(base+route,{waitUntil:'domcontentloaded'});
 if(route==='/admin/')await page.waitForFunction(()=>document.getElementById('adminBoot')?.style.display==='none');
 else if(route==='/account/')await page.waitForFunction(()=>!document.getElementById('acctbody')?.textContent.includes('Loading'));
 else if(route!=='/track-order.html')await page.waitForFunction(()=>typeof PRODUCTS==='undefined'||PRODUCTS.length>0);
 await page.waitForTimeout(180);
 const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,duplicatePromo:['.promo-desktop','.promo-mobile'].every(s=>{const e=document.querySelector(s);return !!e&&getComputedStyle(e).display!=='none';})}));
 const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 const violations=axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
 results.cases.push({route,width,role,status:response.status(),...layout,violations});console.log(JSON.stringify(results.cases.at(-1)));
}
try{
 const routes=args.includes('--quick')?['/','/shop/','/product/39/','/account/']:['/','/shop/','/bundles/','/brands/','/category/snacks-and-nimco/','/brand/mayfair/','/product/39/','/product/186/','/faq/','/track-order.html','/account/'];
 for(const width of args.includes('--quick')?[390]:[320,390,768,1440]){const {context,page}=await contextFor(width);for(const route of routes)await inspect(page,route,width);await context.close();}
 const {context,page}=await contextFor(390);await page.goto(base+'/account/');await page.locator('#acctForgot').click();await page.locator('#resetEmail').fill('synthetic@example.invalid');await page.locator('#resetSend').click();
 await page.waitForFunction(()=>document.getElementById('resetStatus')?.textContent.startsWith('If an account'));results.interactions.push({case:'generic reset message',pass:(await page.locator('#resetStatus').innerText()).startsWith('If an account')});await page.keyboard.press('Escape');results.interactions.push({case:'Escape closes account dialog',pass:!await page.locator('#acctmodal').evaluate(e=>e.classList.contains('open'))});
 await page.evaluate(()=>{window.qaResetFailure=true;});await page.locator('#acctForgot').click();await page.locator('#resetEmail').fill('synthetic@example.invalid');await page.locator('#resetSend').click();await page.waitForFunction(()=>document.getElementById('resetStatus')?.textContent.includes('Synthetic reset'));
 results.interactions.push({case:'reset outage retains input/retry',pass:await page.locator('#resetEmail').inputValue()==='synthetic@example.invalid'&&!await page.locator('#resetSend').isDisabled()});
 await page.goto(base+'/account/?qa_recovery=1#type=recovery');await page.locator('#retryReset').waitFor();results.interactions.push({case:'expired recovery offers new link',pass:true});
 await context.addCookies([{name:'qa_role',value:'customer',url:base}]);await page.reload();await page.locator('#recoveryPass').fill('Synthetic-Password-1');await page.locator('#recoveryConfirm').fill('different');await page.locator('#saveRecovery').click();const noInvalidUpdate=await page.evaluate(()=>!window.qaPasswordUpdates);
 await page.evaluate(()=>{window.qaPasswordFailure=true;});await page.locator('#recoveryConfirm').fill('Synthetic-Password-1');await page.locator('#saveRecovery').click();await page.waitForFunction(()=>document.getElementById('recoveryStatus')?.textContent.includes('Synthetic password'));
 results.interactions.push({case:'password validation and outage',pass:noInvalidUpdate&&await page.locator('#recoveryPass').inputValue()==='Synthetic-Password-1'&&!await page.locator('#saveRecovery').isDisabled()});await context.clearCookies();
 await page.goto(base+'/shop/?q=chocolate&brand=Mayfair');await page.reload();await page.waitForFunction(()=>document.querySelector('#fq')?.value==='chocolate');results.interactions.push({case:'search query survives refresh',pass:true});
 await page.emulateMedia({reducedMotion:'no-preference'});await page.goto(base+'/');await page.emulateMedia({reducedMotion:'reduce'});results.interactions.push({case:'runtime reduced motion reveals content',pass:await page.evaluate(()=>!document.documentElement.classList.contains('motion-reveals')&&[...document.querySelectorAll('.reveal')].every(e=>getComputedStyle(e).opacity==='1'))});
 await page.goto(base+'/product/39/');const zoom=page.locator('[data-zoom-src]');await zoom.waitFor();await zoom.focus();await page.keyboard.press('Enter');const open=await page.locator('#imgLightbox').evaluate(e=>e.classList.contains('open'));await page.keyboard.press('Escape');results.interactions.push({case:'keyboard zoom and focus return',pass:open&&await zoom.evaluate(e=>e===document.activeElement)});
 await page.goto(base+'/product/186/');results.interactions.push({case:'mismatched photo withheld',pass:(await page.locator('#pdetail').innerText()).includes('Photo under review')});
 const unavailable=products.find(p=>p.stockState==='unavailable');if(unavailable){await page.goto(base+'/product/'+unavailable.id+'/');await page.waitForFunction(()=>document.querySelector('#pdetail .pdbtn')?.textContent==='Currently unavailable');results.interactions.push({case:'unavailable stock cannot be added',pass:await page.locator('#pdetail .pdbtn').isDisabled()});}
 await context.close();
 if(!args.includes('--quick'))for(const role of ['owner','manager','fulfilment','content']){const {context,page}=await contextFor(1440,role);await inspect(page,'/admin/',1440,role);results.interactions.push({case:role+' bootstrap',pass:(await page.locator('#backendState').innerText()).includes(role)});if(role==='owner'){attentionError=true;await page.locator('[data-view="analytics"]').click();await page.waitForFunction(()=>document.getElementById('attnList')?.textContent.includes('unavailable'));results.interactions.push({case:'attention outage never says All clear',pass:true});attentionError=false;}await context.close();}
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));globalThis.fetch=originalFetch;await writeFile(path.join(output,'browser-results.json'),JSON.stringify(results,null,2));}
console.log(JSON.stringify({pages:results.cases.length,interactions:results.interactions,errors:results.errors}));
if(results.cases.some(c=>c.status!==200||c.overflow||c.duplicatePromo||c.violations.length)||results.interactions.some(c=>!c.pass)||results.errors.length)process.exitCode=1;
