// Actual local source + explicit synthetic API/Auth fixtures. No real orders or providers.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {cataloguePhoto,photoUnderReview} from '../functions/api/_lib/catalogue-photos.js';
import {renderCataloguePage,renderBrandPage} from '../functions/api/_lib/catalogue-page.js';
import {onRequestGet as occasionPage} from '../functions/snack-boxes/[[slug]].js';
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
  const dbRows=raw.filter(p=>products.some(q=>q.id===p.id)).map(p=>({...p,image_url:p.image_url??p.img,description:p.desc,old_price:p.oldPrice,is_bundle:p.bundle,visibility:'visible',stock_state:p.stockState||p.stock_state||'sourced_after_order'}));
  if(u.pathname.endsWith('/public_products'))return Response.json(dbRows);
  if(u.pathname.endsWith('/bundle_items'))return Response.json([]);
  if(u.pathname.endsWith('/rpc/storefront_manifest'))return Response.json(manifest);
  if(u.pathname.endsWith('/brands'))return Response.json(brands.filter(b=>'eq.'+b.slug===u.searchParams.get('slug')));
  const id=Number(u.searchParams.get('id')?.replace('eq.',''));return Response.json(dbRows.filter(p=>p.id===id));
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
 const parts=p.split('/').filter(Boolean);
 if(p==='/shop/'||p==='/bundles/'||parts[0]==='category'||parts[0]==='brand'&&parts.length===2||parts[0]==='snack-boxes'){
  const ctx={params:{slug:parts[0]==='snack-boxes'?parts.slice(1):parts[1]},request:new Request('http://127.0.0.1'+p),env:{SUPABASE_URL:'https://fixture.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',ASSETS:{fetch:async request=>{let filename=path.join(root,new URL(request.url).pathname,'index.html');return new Response(await readFile(filename).catch(()=>Buffer.from(shell)));}}}};
  const response=parts[0]==='snack-boxes'?await occasionPage(ctx):parts[0]==='brand'?await renderBrandPage(ctx,parts[1]):await renderCataloguePage(ctx,parts[0]==='category'?'category':parts[0],parts[1]);
  res.writeHead(response.status,{'Content-Type':'text/html'});return res.end((await response.text()).replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+/g,'/qa-sdk.js'));
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
async function contextFor(width,role){const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});if(role)await context.addCookies([{name:'qa_role',value:role,url:base}]);await context.route('https://**/*',async route=>route.request().url().includes('/@supabase/supabase-js@')
 ?route.fulfill({status:200,contentType:'text/javascript',body:'('+fakeSdk.toString()+')();'})
 :route.request().url().startsWith('https://chaskabox.online/images/')?(async()=>{const r=await originalFetch(base+new URL(route.request().url()).pathname);return route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:Buffer.from(await r.arrayBuffer())});})():route.fulfill({status:200,contentType:'text/plain',body:''}));const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.stack));page.on('dialog',d=>d.dismiss());return {context,page};}
async function inspect(page,route,width,role){
 const response=await page.goto(base+route,{waitUntil:'domcontentloaded'});
 if(route==='/admin/'){
  try{await page.waitForFunction(()=>document.getElementById('adminBoot')?.style.display==='none',undefined,{timeout:12000});}
  catch(error){console.error('ADMIN_BOOT_DIAGNOSTIC',JSON.stringify({role,width,dom:await page.evaluate(async()=>({
    boot:document.getElementById('adminBoot')?.outerHTML.slice(0,650),
    login:document.getElementById('liveAdminLogin')?.outerHTML.slice(0,350),
    mfa:document.getElementById('liveAdminMfa')?.outerHTML.slice(0,350),
    backend:document.getElementById('backendState')?.textContent,
    booted:window.chaskaAdminBooted,
    sdk:Boolean(window.supabase),qaBootError:window.__qaAdminBootError,
    scripts:[...document.scripts].filter(s=>s.src.includes('/admin')).map(s=>({src:s.src,loaded:performance.getEntriesByName(s.src).length})),
    candidateFetch:await Promise.all(['/admin.js?v=20261013-admin-controls-1','/admin-login-mfa.js?v=20261012-mfa-gate-1','/admin-live.js?v=20261013-admin-controls-1'].map(async url=>({url,status:(await fetch(url,{cache:'no-store'})).status}))),

  })),errors:results.errors.slice(-6)}));throw error;}
 }
 else if(route==='/account/')await page.waitForFunction(()=>!document.getElementById('acctbody')?.textContent.includes('Loading'));
 else if(route!=='/track-order.html')await page.waitForFunction(()=>typeof PRODUCTS==='undefined'||PRODUCTS.length>0);
 await page.waitForTimeout(180);
 const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,duplicatePromo:['.promo-desktop','.promo-mobile'].every(s=>{const e=document.querySelector(s);return !!e&&getComputedStyle(e).display!=='none';})}));
 if(layout.overflow)console.error('OVERFLOW_DETAILS',JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().right>innerWidth+1).slice(0,20).map(e=>({tag:e.tagName,id:e.id,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,70)})))));
 const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 const violations=axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
 if(width===390&&['/','/shop/','/product/39/','/snack-boxes/bachpan/','/guides/choosing-a-snack-box/'].includes(route))await page.screenshot({path:path.join(output,route==='/'?'home-390.png':route.replace(/\//g,'_')+'390.png'),fullPage:true});
 results.cases.push({route,width,role,status:response.status(),...layout,violations});console.log(JSON.stringify(results.cases.at(-1)));
}
try{
 const routes=args.includes('--quick')?['/','/shop/','/product/39/','/account/']:['/','/shop/','/bundles/','/brands/','/category/snacks-and-nimco/','/brand/mayfair/','/product/39/','/product/186/','/faq/','/track-order.html','/account/','/snack-boxes/','/snack-boxes/bachpan/','/snack-boxes/movie-night/','/snack-boxes/office/','/guides/choosing-a-snack-box/','/guides/bachpan-snacks-pakistan/','/guides/how-chaskabox-orders-work/'];
 for(const width of args.includes('--quick')?[390]:[320,390,768,1440]){const {context,page}=await contextFor(width);for(const route of routes)await inspect(page,route,width);await context.close();}
 // Reproduce the live legacy logo setting and prove branding survives errors.
 {
  const {context,page}=await contextFor(390);
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.applyStorefrontManifest==='function');
  const loadedLogo=expected=>page.waitForFunction(src=>{const img=document.querySelector('.logo img');return img?.getAttribute('src')===src&&img.complete&&img.naturalWidth>0&&getComputedStyle(img).display!=='none';},expected);
  await loadedLogo('/images/logo-navy.png');
  await page.evaluate(()=>window.applyStorefrontManifest({theme:{logo_url:'/logo.png'}}));
  await loadedLogo('/images/logo-navy.png');
  results.interactions.push({case:'missing CMS logo restores the bundled original',pass:true});
  await page.evaluate(()=>window.applyStorefrontManifest({theme:{logo_url:'/images/logo-white.png'}}));
  await loadedLogo('/images/logo-white.png');
  if(!await page.locator('.logo img').evaluate(img=>new URL(img.currentSrc).pathname==='/images/logo-white.png'))throw Error('Custom CMS logo was overridden by default responsive sources');
  results.interactions.push({case:'valid custom logo still loads after a failed logo',pass:true});
  await page.evaluate(()=>window.applyStorefrontManifest({theme:{logo_url:'/missing-site-logo.png'}}));
  await loadedLogo('/images/logo-navy.png');
  await page.evaluate(()=>window.applyStorefrontManifest({theme:{logo_url:''}}));
  await loadedLogo('/images/logo-navy.png');
  results.interactions.push({case:'repeat logo errors and theme reset preserve branding',pass:true});
  await context.close();
 }
 // A first-time guest should be able to sign in even before idle Auth loads.
 {
  const {context,page}=await contextFor(390);
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>toggleAccount());
  await page.locator('#acctmodal.open #authEmail').waitFor({timeout:15000});
  results.interactions.push({case:'on-demand Auth SDK opens sign-in for a guest',pass:true});
  await context.close();
 }
 // An existing session must not be mistaken for a guest on an early account click.
 {
  const {context,page}=await contextFor(390,'customer');
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>toggleAccount());
  await page.waitForURL('**/account/',{timeout:15000});
  results.interactions.push({case:'on-demand Auth SDK restores existing session on first click',pass:true});
  await context.close();
 }
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
 await page.getByRole('link',{name:'Find your snack moment',exact:false}).click();await page.waitForURL('**/snack-boxes/');
 results.interactions.push({case:'home occasion link uses the actual content page',pass:(await page.locator('main').innerText()).includes('Movie night')});
 await page.goto(base+'/');await page.getByRole('link',{name:'Snack and order guides',exact:true}).first().click();await page.waitForURL('**/guides/');
 results.interactions.push({case:'home guide link is not intercepted by the store router',pass:(await page.locator('main').innerText()).includes('How')});
 await page.goto(base+'/product/39/');const zoom=page.locator('[data-zoom-src]');await zoom.waitFor();await zoom.focus();await page.keyboard.press('Enter');const open=await page.locator('#imgLightbox').evaluate(e=>e.classList.contains('open'));await page.keyboard.press('Escape');results.interactions.push({case:'keyboard zoom and focus return',pass:open&&await zoom.evaluate(e=>e===document.activeElement)});
 await page.goto(base+'/product/186/');results.interactions.push({case:'mismatched photo withheld',pass:(await page.locator('#pdetail').innerText()).includes('Photo under review')});
 const unavailable=products.find(p=>p.stockState==='unavailable');if(unavailable){await page.goto(base+'/product/'+unavailable.id+'/');await page.waitForFunction(()=>document.querySelector('#pdetail .pdbtn')?.textContent==='Currently unavailable');results.interactions.push({case:'unavailable stock cannot be added',pass:await page.locator('#pdetail .pdbtn').isDisabled()});}
 await page.goto(base+'/snack-boxes/bachpan/');await page.locator('#addOccasion').click();await page.waitForFunction(()=>document.getElementById('occasionStatus')?.textContent.includes('Packs added'));
 results.interactions.push({case:'occasion adds one of each current pack atomically',pass:await page.evaluate(()=>{const bag=JSON.parse(localStorage.getItem('chaskabox-cart'));return [69,76,156].every(id=>bag[id]===1);})});
 await page.evaluate(()=>localStorage.setItem('chaskabox-cart',JSON.stringify({69:99})));await page.locator('#addOccasion').click();await page.waitForFunction(()=>document.getElementById('occasionStatus')?.textContent.includes('Reduce the quantity'));
 results.interactions.push({case:'occasion quantity cap retains the original bag',pass:await page.evaluate(()=>localStorage.getItem('chaskabox-cart')===JSON.stringify({69:99}))});
 await context.close();
 // Credibility controls use local synthetic fixtures, never real reviews or media.
 {
  const {context,page}=await contextFor(390);let failReviews=true,videoRequests=0;
  await context.route('**/api/reviews?*',route=>route.fulfill({status:failReviews?503:200,contentType:'application/json',body:JSON.stringify({count:2,avg_rating:3,reviews:[{id:1,rating:2,review_text:'Synthetic guest review',verified_purchase:false},{id:2,rating:4,review_text:'Synthetic delivered purchase',verified_purchase:true}]})}));
  await page.goto(base+'/product/39/');await page.getByRole('button',{name:'Retry reviews',exact:true}).waitFor();failReviews=false;await page.getByRole('button',{name:'Retry reviews',exact:true}).click();await page.locator('.rw-summary').waitFor();
  results.interactions.push({case:'review retry restores honest guest and verified-purchase labels',pass:(await page.locator('.rw-summary').innerText()).includes('2 reviews')&&await page.locator('.rw-verified').count()===1&&await page.locator('.rw-rate input:checked').count()===0});
  await context.route('**/api/storefront-config',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...manifest,sections:[{section_key:'how_it_works',enabled:true,config:{packing_video_url:'https://youtu.be/abcdefghijk'}}]})}));
  await context.route('https://www.youtube-nocookie.com/**',route=>{videoRequests++;return route.fulfill({status:200,contentType:'text/html',body:'<p>Synthetic player</p>'});});
  await page.goto(base+'/');await page.locator('[data-load-packing-video]').waitFor();
  const deferred=videoRequests===0&&await page.locator('#packingVideoBox iframe').count()===0;
  await page.locator('[data-load-packing-video]').click();await page.locator('#packingVideoBox iframe').waitFor();
  results.interactions.push({case:'packing video waits for visitor choice and uses the restricted player',pass:deferred&&await page.locator('#packingVideoBox iframe').getAttribute('src')==='https://www.youtube-nocookie.com/embed/abcdefghijk'});
  await context.close();
 }
 {
  const {context,page}=await contextFor(1440,'owner');let review={id:1,product_id:39,rating:3,review_text:'Synthetic approved review',moderation_status:'approved',verified_purchase:false,created_at:'2026-10-14T00:00:00Z'};
  await context.route('**/api/admin/reviews?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({reviews:[review],page:1,total:1,total_pages:1})}));
  await context.route('**/api/admin/reviews/1',route=>{review={...review,moderation_status:route.request().postDataJSON().action==='reject'?'rejected':'approved'};return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({review})});});
  const section={section_key:'how_it_works',enabled:true,position:6,heading:'How it works',config:{button_text:'Preserved'},draft_config:null};
  await context.route('**/api/admin/homepage',route=>{if(route.request().method()==='PATCH')section.draft_config=route.request().postDataJSON().sections[0].draft_config;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sections:[section]})});});
  await context.route('**/api/admin/homepage/publish',route=>{section.config={...section.draft_config};return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sections:[section]})});});
  await context.route('**/api/admin/media?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({processor_available:true,monthly_app_limit:1000,media:[{id:'00000000-0000-4000-8000-000000000010',url:'/images/logo-navy.png',bucket:'product-media',object_path:'synthetic.webp',state:'active',size_bytes:100}],page:1,total:1,total_pages:1})}));
  await page.goto(base+'/admin/');await page.waitForFunction(()=>document.getElementById('adminBoot')?.style.display==='none');
  await page.locator('[data-view="reviews"]').click();await page.getByRole('button',{name:'Unpublish',exact:true}).click();await page.locator('#view-reviews').getByText(/rejected/).waitFor();
  results.interactions.push({case:'owner can unpublish an approved review without deleting its record',pass:review.moderation_status==='rejected'&&await page.locator('#view-reviews [data-review-action="approve"]').count()===1});
  await page.locator('[data-view="homepage"]').click();await page.locator('#homePackingVideo').waitFor();await page.locator('#homePackingVideo').fill('https://youtu.be/abcdefghijk');const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/admin/homepage'&&r.request().method()==='PATCH');await page.locator('#homeSave').click();await saved;await page.waitForFunction(()=>document.getElementById('homePackingVideo')?.value==='https://youtu.be/abcdefghijk');
  results.interactions.push({case:'admin packing-video draft retains other section configuration before publish',pass:section.draft_config?.packing_video_url==='https://youtu.be/abcdefghijk'&&section.draft_config?.button_text==='Preserved'&&!section.config.packing_video_url});
  const published=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/admin/homepage/publish');await page.locator('#homePublish').click();await published;
  results.interactions.push({case:'packing video becomes published only after an explicit owner action',pass:section.config.packing_video_url==='https://youtu.be/abcdefghijk'&&section.config.button_text==='Preserved'});
  await page.locator('[data-view="media"]').click();await page.waitForFunction(()=>typeof document.getElementById('mediaUpload')?.onchange==='function');
  results.interactions.push({case:'media assignment and upload handlers initialize for original photos',pass:await page.locator('[data-assign-media]').evaluate(e=>typeof e.onclick==='function')&&await page.locator('[data-delete-media]').evaluate(e=>typeof e.onclick==='function')&&!await page.locator('#mediaUpload').isDisabled()});
  await context.close();
 }
 if(!args.includes('--quick'))for(const role of ['owner','manager','fulfilment','content']){const {context,page}=await contextFor(1440,role);await inspect(page,'/admin/',1440,role);results.interactions.push({case:role+' bootstrap',pass:(await page.locator('#backendState').innerText()).includes(role)});if(role==='owner'){attentionError=true;await page.locator('[data-view="analytics"]').click();await page.waitForFunction(()=>document.getElementById('attnList')?.textContent.includes('unavailable'));results.interactions.push({case:'attention outage never says All clear',pass:true});attentionError=false;}await context.close();}
 // Exercise operational UI writes only against intercepted, synthetic records.
 {
  const {context,page}=await contextFor(1440,'owner');page.removeAllListeners('dialog');page.on('dialog',d=>d.accept());
  const orderId='00000000-0000-4000-8000-000000000021',customerId='00000000-0000-4000-8000-000000000022';
  let order={id:orderId,order_number:'CB-SYNTHETIC-ACCEPTANCE',customer_name:'Synthetic acceptance customer',customer_phone:'03000000000',customer_address:'Synthetic address',customer_city:'Fixture city',payment_method:'jazzcash',payment_status:'payment_submitted',transaction_reference:'SYNTHETIC-REF',fulfilment_status:'new',total:600,subtotal:300,delivery_fee:300,created_at:'2026-10-14T00:00:00Z',updated_at:'2026-10-14T00:00:00Z'};
  let product={...products.find(p=>p.id===39),id:39,name:'Synthetic editor snack',description:'Synthetic pack description',price:300,old_price:null,visibility:'visible',stock_state:'sourced_after_order',tags:[]};
  let failPayment=true,failBulk=true;const statusWrites=[],paymentWrites=[],bulkWrites=[],productWrites=[];
  const ok=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  await context.route('**/api/admin/orders?*',r=>ok(r,{orders:[order],page:1,total:1,total_pages:1}));
  await context.route('**/api/admin/orders/'+orderId,r=>ok(r,{order,items:[{product_name:'Synthetic editor snack',pack:'Fixture pack',quantity:1,line_total:300}],history:[]}));
  await context.route('**/api/admin/orders/'+orderId+'/status',r=>{const body=r.request().postDataJSON();statusWrites.push(body);order={...order,fulfilment_status:body.fulfilment_status,updated_at:'2026-10-14T00:01:00Z'};return ok(r,{order});});
  await context.route('**/api/admin/orders/'+orderId+'/payment/verify',r=>{const body=r.request().postDataJSON();paymentWrites.push(body);if(failPayment)return ok(r,{error:{message:'Synthetic payment outage'}},503);order={...order,payment_status:'payment_verified',updated_at:'2026-10-14T00:02:00Z'};return ok(r,{order});});
  await context.route('**/api/admin/products?*',r=>ok(r,{products:[{...product,image_url:product.img}],page:1,total:1,total_pages:1}));
  await context.route('**/api/admin/products/39',r=>{const body=r.request().postDataJSON();productWrites.push(body);product={...product,...body};return ok(r,{product});});
  await context.route('**/api/admin/products/bulk',r=>{const body=r.request().postDataJSON();bulkWrites.push(body);if(failBulk)return ok(r,{error:{message:'Synthetic bulk outage'}},503);product={...product,visibility:'hidden'};return ok(r,{changed:1,skipped:0});});
  const customer={id:customerId,name:'Synthetic acceptance customer',phone:'03000000000',email:'synthetic@example.invalid',order_count:1,lifetime_spend:600};
  await context.route('**/api/admin/customers?*',r=>ok(r,{customers:[customer],page:1,total:1,total_pages:1}));
  await context.route('**/api/admin/customers/'+customerId+'?*',r=>ok(r,{customer,orders:[order],page:1,total:1,total_pages:1}));
  await page.goto(base+'/admin/');await page.waitForFunction(()=>document.getElementById('adminBoot')?.style.display==='none');
  await page.locator('[data-view="orders"]').click();await page.getByRole('button',{name:'Manage',exact:true}).click();
  const changed=page.waitForResponse(r=>r.url().endsWith('/status'));await page.locator('#liveOrderModal [data-status="sourcing"]').click();await changed;await page.waitForFunction(()=>!document.getElementById('liveOrderModal')?.classList.contains('open'));
  results.interactions.push({case:'order status control submits the current version and refreshes after success',pass:order.fulfilment_status==='sourcing'&&statusWrites.length===1&&statusWrites[0].expected_updated_at==='2026-10-14T00:00:00Z'});
  await page.getByRole('button',{name:'Manage',exact:true}).click();await page.locator('#liveOrderModal [data-status="cancelled"]').click();await page.locator('.order-decision-dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  results.interactions.push({case:'cancel decision dismissed by staff leaves the order unchanged',pass:statusWrites.length===1&&order.fulfilment_status==='sourcing'});
  await page.locator('#liveOrderModal [data-pay="verified"]').click();await page.locator('.order-decision-dialog').getByRole('button',{name:'Confirm',exact:true}).click();
  results.interactions.push({case:'payment review requires evidence before making a request',pass:paymentWrites.length===0&&await page.locator('.order-decision-dialog textarea').evaluate(e=>!e.validity.valid)});
  await page.locator('.order-decision-dialog textarea').fill('Synthetic receiving-account evidence');const failed=page.waitForResponse(r=>r.url().endsWith('/payment/verify'));await page.locator('.order-decision-dialog').getByRole('button',{name:'Confirm',exact:true}).click();await failed;await page.waitForFunction(()=>document.getElementById('adminToast')?.textContent.includes('Synthetic payment outage'));
  await page.locator('#liveOrderModal [data-pay="verified"]').waitFor();
  results.interactions.push({case:'payment save outage retains pending status and offers a usable retry',pass:order.payment_status==='payment_submitted'&&!await page.locator('#liveOrderModal [data-pay="verified"]').isDisabled()});
  failPayment=false;await page.locator('#liveOrderModal [data-pay="verified"]').click();await page.locator('.order-decision-dialog textarea').fill('Synthetic receiving-account evidence');const approved=page.waitForResponse(r=>r.url().endsWith('/payment/verify'));await page.locator('.order-decision-dialog').getByRole('button',{name:'Confirm',exact:true}).click();await approved;await page.waitForFunction(()=>!document.getElementById('liveOrderModal')?.classList.contains('open'));
  results.interactions.push({case:'payment retry records an explicit decision with evidence and current version',pass:order.payment_status==='payment_verified'&&paymentWrites.length===2&&paymentWrites[1].note==='Synthetic receiving-account evidence'&&paymentWrites[1].expected_updated_at==='2026-10-14T00:01:00Z'});
  await page.locator('[data-view="products"]').click();await page.locator('[data-live-edit="39"]').click();await page.locator('#editName').fill('Synthetic editor snack saved');const edited=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/admin/products/39');await page.locator('#productForm').evaluate(e=>e.requestSubmit());await edited;await page.waitForFunction(()=>!document.getElementById('productEditor')?.classList.contains('open'));
  results.interactions.push({case:'product edit opens, hydrates fields and saves to the protected endpoint',pass:productWrites.length===1&&product.name==='Synthetic editor snack saved'&&productWrites[0].description==='Synthetic pack description'});
  await page.locator('[data-live-select="39"]').check();await page.waitForFunction(()=>document.getElementById('bulkCount')?.textContent.startsWith('1 selected'));
  const bulkFailed=page.waitForResponse(r=>r.url().endsWith('/products/bulk'));await page.locator('#bulkBar [data-bulk="hide"]').click();await bulkFailed;await page.waitForFunction(()=>document.getElementById('bulkFeedback')?.textContent.includes('Not saved'));
  results.interactions.push({case:'bulk write failure retains selection and restores controls for retry',pass:product.visibility==='visible'&&await page.locator('[data-live-select="39"]').isChecked()&&!await page.locator('#bulkBar [data-bulk="hide"]').isDisabled()});
  failBulk=false;const bulkSaved=page.waitForResponse(r=>r.url().endsWith('/products/bulk'));await page.locator('#bulkBar [data-bulk="hide"]').click();await bulkSaved;await page.waitForFunction(()=>document.getElementById('bulkFeedback')?.textContent.includes('1 updated'));
  results.interactions.push({case:'bulk retry updates only selected products and clears selection on success',pass:product.visibility==='hidden'&&bulkWrites.length===2&&bulkWrites[1].ids.length===1&&bulkWrites[1].ids[0]===39&&!await page.locator('[data-live-select="39"]').isChecked()});
  await page.locator('[data-view="customers"]').click();await page.getByRole('button',{name:'Synthetic acceptance customer',exact:true}).click();await page.getByRole('button',{name:'Back to customers',exact:true}).waitFor();
  const detail=(await page.locator('#view-customers').innerText()).includes('CB-SYNTHETIC-ACCEPTANCE');await page.getByRole('button',{name:'Back to customers',exact:true}).click();await page.locator('#customerSearch').waitFor();
  results.interactions.push({case:'customer detail and back navigation show matching synthetic order history',pass:detail&&await page.locator('[data-customer]').count()===1});
  await page.locator('[data-view="boxes"]').click();await page.locator('#previewBoxBtn').click();await page.locator('[data-add-box="39"]').click();await page.locator('#boxPrice').fill('299');await page.locator('#previewBoxBtn').click();await page.locator('#boxDraftPreview').waitFor();
  results.interactions.push({case:'box preview handles the selected product list without saving a box',pass:(await page.locator('#boxDraftPreview').innerText()).includes('Synthetic editor snack')&&(await page.locator('#boxDraftPreview').innerText()).includes('Nothing has been saved or published')});
  await context.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));globalThis.fetch=originalFetch;await writeFile(path.join(output,'browser-results.json'),JSON.stringify(results,null,2));}
console.log(JSON.stringify({pages:results.cases.length,interactions:results.interactions,errors:results.errors}));
if(results.cases.some(c=>c.status!==200||c.overflow||c.duplicatePromo||c.violations.length)||results.interactions.some(c=>!c.pass)||results.errors.length)process.exitCode=1;
