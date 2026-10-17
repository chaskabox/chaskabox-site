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
  if(p==='/api/checkout-quote'){
   let body='';for await(const chunk of req)body+=chunk;
   const order=JSON.parse(body),subtotal=order.items.reduce((sum,i)=>sum+products.find(p=>p.id===i.product_id).price*i.qty,0);
   const delivery_fee=order.payment_method==='cod'?settings.cod_delivery_fee_pkr:subtotal>=settings.prepaid_free_delivery_threshold_pkr?0:settings.prepaid_delivery_fee_pkr;
   return json(res,{quote:{subtotal,delivery_fee,discount:0,total:subtotal+delivery_fee}});
  }
  if(p==='/api/admin/me')return json(res,{role,user:{id:'00000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid'},mfa:{required:true,aal:'aal2'},capabilities:role==='owner'?['*']:[]});
  if(p==='/api/admin/products')return json(res,{products:products.map(p=>({...p,image_url:p.img,description:p.desc,visibility:'visible',stock_state:p.stockState})),page:1,total:products.length,total_pages:1});
  if(p==='/api/admin/orders')return json(res,{orders:[],total:0,total_pages:1,page:1});
  if(p==='/api/admin/couriers')return json(res,{couriers:[]});
  if(p==='/api/admin/couriers/ledger')return json(res,{ledger:[],unassigned:[]});
  if(p==='/api/admin/online-payments')return json(res,{accounts:[{method:'jazzcash',display_name:'JazzCash',account_label:null,settlement_days:null},{method:'bank_transfer',display_name:'Bank Transfer',account_label:null,settlement_days:null}],ledger:[],card_gateway_connected:false});
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
 const assetPath=p==='/cart/'?'/index.html':p==='/admin/'?'/admin.html':/^\/brand\/[^/]+\/$/.test(p)?'/brand/index.html':p;
 let file=path.join(root,decodeURIComponent(assetPath));if((await stat(file).catch(()=>null))?.isDirectory())file=path.join(file,'index.html');
 if(!/\.(html|css|js|json|png|webp|svg|mp4|woff2)$/.test(file)){res.writeHead(404);return res.end('Not found');}
 let data=await readFile(file);if(file.endsWith('.html'))data=Buffer.from(data.toString().replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+/g,'/qa-sdk.js'));
 const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const executablePath=option('--browser-executable',process.env.QA_BROWSER_EXECUTABLE);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const results={method:'Actual local source with synthetic API/Auth fixtures; not managed acceptance',cases:[],interactions:[],errors:[]};
async function contextFor(width,role){const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});if(role)await context.addCookies([{name:'qa_role',value:role,url:base}]);await context.route('https://**/*',async route=>route.request().url().includes('/@supabase/supabase-js@')
 ?route.fulfill({status:200,contentType:'text/javascript',body:'('+fakeSdk.toString()+')();'})
 :route.request().url().startsWith('https://chaskabox.online/images/')?(async()=>{const r=await originalFetch(base+new URL(route.request().url()).pathname);return route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:Buffer.from(await r.arrayBuffer())});})():route.fulfill({status:200,contentType:'text/plain',body:''}));const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.stack));page.on('dialog',d=>d.dismiss());return {context,page};}
async function openAdminPanel(page,key){
 const button=page.locator('.admin-nav-btn[data-view="'+key+'"]');
 const toggle=page.locator('#sidebarToggle');
 if(await toggle.isVisible()&&!(await page.locator('#adminSidebar').evaluate(el=>el.classList.contains('open'))))
  await toggle.click();
 const disclosure=button.locator('xpath=ancestor::details[1]');
 if(await disclosure.count()&&!(await disclosure.evaluate(el=>el.open)))
  await disclosure.locator('summary').click();
 await button.click();
}
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
 if([390,1440].includes(width)&&['/','/shop/','/product/39/','/snack-boxes/bachpan/','/guides/choosing-a-snack-box/'].includes(route))await page.screenshot({path:path.join(output,route==='/'?'home-'+width+'.png':route.replace(/\//g,'_')+width+'.png'),fullPage:true});
 results.cases.push({route,width,role,status:response.status(),...layout,violations});console.log(JSON.stringify(results.cases.at(-1)));
}
try{
 // A generic responsive-media rule must not collapse the preview iframe to
 // the browser's 150px default. Exercise real layout and inner-page scrolling.
 for(const hostWidth of [1440,390]){
  const {context,page}=await contextFor(hostWidth,'owner');
  await page.goto(base+'/admin/');
  try{await page.waitForFunction(()=>document.getElementById('adminBoot')?.style.display==='none',undefined,{timeout:12000});}
  catch(error){
    console.error('V4_ADMIN_BOOT_DIAGNOSTIC',JSON.stringify(await page.evaluate(()=>({
      boot:document.getElementById('adminBoot')?.outerHTML?.slice(0,500),
      login:document.getElementById('liveAdminLogin')?.outerHTML?.slice(0,330),
      notice:document.getElementById('securityNotice')?.textContent?.slice(0,180),
      sdk:!!window.supabase,loaded:!!window.chaskaAdminBooted,
      scripts:[...document.scripts].filter(x=>x.src.includes('admin')).map(x=>({url:new URL(x.src).pathname,loaded:performance.getEntriesByName(x.src).length}))
    }))),JSON.stringify(results.errors.slice(-8)));
    throw error;
  }
  await openAdminPanel(page,'preview');
  await page.waitForTimeout(250);
  const previewDiagnostics=await page.evaluate(()=>{
    const button=document.querySelector('.admin-nav-btn[data-view="preview"]');
    const view=document.getElementById('view-preview'),frame=document.getElementById('sitePreview');
    return {buttonHidden:button?.hidden,buttonDisplay:button?.style.display,buttonAriaHidden:button?.getAttribute('aria-hidden'),buttonActive:button?.classList.contains('active'),viewClass:view?.className,viewDisplay:view?getComputedStyle(view).display:null,frameDisplay:frame?getComputedStyle(frame).display:null,navCurrent:[...document.querySelectorAll('.admin-nav-btn.active')].map(x=>x.dataset.view)};
  });
  console.log('V4_PREVIEW_DIAGNOSTIC',JSON.stringify(previewDiagnostics));
  await page.locator('#sitePreview').waitFor({state:'visible',timeout:6500});
  for(const [device,width] of [['Desktop',null],['Tablet',768],['Mobile',390]]){
   await page.locator('.viewport-switch').getByRole('button',{name:device,exact:true}).click();
   await page.waitForFunction(target=>{
    const wrap=document.getElementById('previewFrameWrap');
    const stage=wrap.parentElement,style=getComputedStyle(stage);
    const available=stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    return Math.abs(wrap.getBoundingClientRect().width-Math.min(target||available,available))<2;
   },width);
   const layout=await page.locator('#sitePreview').evaluate(frame=>({
    height:frame.getBoundingClientRect().height,
    width:frame.getBoundingClientRect().width,
    wrapWidth:frame.parentElement.getBoundingClientRect().width,
    overflow:document.documentElement.scrollWidth>innerWidth+1
   }));
   results.interactions.push({case:`site preview ${device.toLowerCase()} retains full-height viewport at ${hostWidth}px`,pass:layout.height>=600&&layout.width<=layout.wrapWidth+1&&!layout.overflow,...layout});
   if(hostWidth===1440)await page.screenshot({path:path.join(output,`admin-site-preview-${device.toLowerCase()}.png`),fullPage:false});
  }
  const preview=await (await page.locator('#sitePreview').elementHandle()).contentFrame();
  await preview.waitForFunction(()=>document.documentElement.scrollHeight>innerHeight);
  await preview.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await preview.waitForFunction(()=>scrollY>0);
  results.interactions.push({case:`site preview scrolls through the storefront at ${hostWidth}px`,pass:await preview.evaluate(()=>scrollY>0&&innerHeight>=600)});
  await page.locator('#refreshPreview').click();
  await page.waitForFunction(()=>document.getElementById('sitePreview').contentDocument?.readyState==='complete');
  results.interactions.push({case:`site preview refresh retains its viewport at ${hostWidth}px`,pass:await page.locator('#sitePreview').evaluate(frame=>frame.getBoundingClientRect().height>=600&&frame.src.includes('_adminpreview='))});
  await context.close();
 }
 // The bridge and application must share the public config request; SSR pages
 // must hydrate the supplied manifest rather than fetching it again.
 for(const [route,expected] of [['/',1],['/shop/',0]]){
  const {context,page}=await contextFor(390);let manifestRequests=0;const sdkRequests=[];
  page.on('request',request=>{if(new URL(request.url()).pathname==='/api/storefront-config')manifestRequests++;if(request.url().includes('/@supabase/supabase-js@'))sdkRequests.push(request.url());});
  await page.goto(base+route,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof PRODUCTS!=='undefined'&&PRODUCTS.length>0);
  await page.waitForTimeout(250);
  if(manifestRequests!==expected)throw Error('Unexpected manifest requests for '+route+': '+manifestRequests);
  results.interactions.push({case:route==='/'?'home application and runtime share one manifest request':'shop hydrates the server manifest without an extra config request',pass:true});
  if(route==='/'){
   await page.waitForTimeout(4000);
   results.interactions.push({case:'fresh guest home does not load Auth SDK while idle',pass:sdkRequests.length===0});
  }
  await context.close();
 }
 const routes=args.includes('--quick')?['/','/shop/','/product/39/','/account/']:['/','/shop/','/bundles/','/brands/','/category/snacks-and-nimco/','/brand/mayfair/','/product/39/','/product/186/','/faq/','/track-order.html','/account/','/snack-boxes/','/snack-boxes/bachpan/','/snack-boxes/movie-night/','/snack-boxes/office/','/guides/choosing-a-snack-box/','/guides/bachpan-snacks-pakistan/','/guides/how-chaskabox-orders-work/'];
 // Reference design acceptance: actual responsive UI, rather than a rendered mockup.
 for(const width of [320,390,768,1440]){
  const {context,page}=await contextFor(width);
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof PRODUCTS!=='undefined'&&PRODUCTS.length>0);
  await page.evaluate(()=>document.fonts.ready);
  const layout=await page.evaluate(()=>{
   const hero=document.querySelector('#view-home .hero'),box=hero.getBoundingClientRect();
   return {width:box.width,height:box.height,background:getComputedStyle(hero).backgroundImage,font:getComputedStyle(hero.querySelector('h1')).fontFamily};
  });
  if(layout.width<width-60||layout.width>width||layout.height>(width<=760?320:540))throw Error('Reference hero layout mismatch '+JSON.stringify({width,...layout}));
  if(!layout.background.includes('hero-reference-snackbox-20261017.webp')||!layout.font.includes('Kalam'))throw Error('Reference hero artwork or type is missing');
  if(width<=760&&!await page.locator('.cb-mobile-search').isVisible())throw Error('Mobile search missing');
  if(width>760&&!await page.locator('.header-search').isVisible())throw Error('Desktop search missing');
  await page.screenshot({path:path.join(output,'reference-home-'+width+'.png'),fullPage:true});
  if(width<=760){
   await page.locator('#cbMobileSearch').fill('gum');
   await page.locator('.cb-mobile-search button').click();
   await page.waitForURL(/\/shop\/\?q=gum/);
   if(!await page.locator('.cb-mobile-dock').isVisible())throw Error('Mobile dock disappeared on shop navigation');
   if(await page.locator('#fq').inputValue()!=='gum')throw Error('Mobile search did not reach the catalogue');
  }
  results.interactions.push({case:'reference hero, type and responsive shopping navigation / '+width,pass:true});
  await context.close();
 }
 for(const width of args.includes('--quick')?[390]:[320,390,768,1440]){const {context,page}=await contextFor(width);for(const route of routes)await inspect(page,route,width);await context.close();}
 // Signed-out staff sign-in visual and keyboard acceptance using local synthetic Auth only.
 for(const width of [320,390,1440]){
  const {context,page}=await contextFor(width);
  await page.goto(base+'/admin/',{waitUntil:'domcontentloaded'});
  await page.locator('#liveLoginForm').waitFor({state:'visible',timeout:12000});
  const form=page.locator('#liveLoginForm');
  if(await form.getAttribute('class')!=='live-login-card staff-login-card')throw Error('Staff sign-in card style missing');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Staff sign-in horizontal overflow '+width);
  const pwd=page.locator('#livePassword'),toggle=page.locator('#livePasswordToggle');
  if(await pwd.getAttribute('autocomplete')!=='current-password'||await page.locator('#liveEmail').getAttribute('autocomplete')!=='username')throw Error('Password-manager autofill disrupted');
  await page.locator('#liveEmail').fill('staff@example.invalid');
  await pwd.fill('fixture-password');
  await toggle.click();
  if(await pwd.getAttribute('type')!=='text'||await pwd.inputValue()!=='fixture-password')throw Error('Show password toggle failed');
  await toggle.click();
  if(await pwd.getAttribute('type')!=='password'||await toggle.getAttribute('aria-pressed')!=='false')throw Error('Hide password toggle failed');
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  const issues=axe.violations.filter(v=>['serious','critical'].includes(v.impact));
  if(issues.length)throw Error('Staff sign-in accessibility issue '+JSON.stringify(issues.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary})).slice(0,6)}))));
  results.interactions.push({case:'staff sign-in professional form and password toggle / '+width,pass:true});
  if(width===390)await page.screenshot({path:path.join(output,'staff-signin-390.png'),fullPage:true});
  await context.close();
 }
 // Real cart/checkout DOM, with synthetic catalogue and quote data only.
 for(const width of args.includes('--quick')?[390]:[320,390,768,1440]){
  const {context,page}=await contextFor(width);let orders=0;
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/orders')orders++;});
  await page.goto(base+'/shop/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof PRODUCTS!=='undefined'&&PRODUCTS.length>0);
  await page.evaluate(()=>{CART={39:98};saveCart();});
  await inspect(page,'/cart/',width);
  await page.getByRole('button',{name:'Increase',exact:true}).click();
  if(await page.getByRole('button',{name:'Increase',exact:true}).isEnabled())throw Error('Cart quantity exceeds checkout limit');
  if(await page.evaluate(()=>JSON.parse(localStorage.getItem('chaskabox-cart'))[39])!==99)throw Error('Cart limit changed stored quantity');
  await page.getByRole('button',{name:'Open shopping bag'}).click();
  if(await page.locator('#drawer button[aria-label^="Increase "]').isEnabled())throw Error('Drawer increment is not capped');
  await page.getByRole('button',{name:'Close shopping bag'}).click();
  results.interactions.push({case:'cart and drawer cap quantity at 99 / '+width,pass:true});
  await inspect(page,'/checkout.html',width);
  const checkoutSpacing=await page.evaluate(()=>{
    const promo=document.querySelector('.promo').getBoundingClientRect();
    const header=document.querySelector('header').getBoundingClientRect();
    const intro=document.querySelector('.checkout-intro').getBoundingClientRect();
    const field=document.querySelector('#checkoutDeliveryStep .field');
    const control=document.querySelector('#f_phone');
    const card=document.querySelector('#checkoutDeliveryStep');
    return {
      headerGap:Math.round(header.top-promo.bottom),
      introGap:Math.round(intro.top-header.bottom),
      fieldGap:parseFloat(getComputedStyle(field).marginBottom),
      inputHeight:Math.round(control.getBoundingClientRect().height),
      cardPadding:parseFloat(getComputedStyle(card).paddingTop),
      footerMargin:parseFloat(getComputedStyle(document.querySelector('footer')).marginTop)
    };
  });
  if(Math.abs(checkoutSpacing.headerGap)>2 || checkoutSpacing.introGap>26 ||
    checkoutSpacing.fieldGap>14 || checkoutSpacing.inputHeight<44 ||
    checkoutSpacing.cardPadding>24 || checkoutSpacing.footerMargin>1)
    throw Error('Checkout compact spacing regressed '+JSON.stringify({width,checkoutSpacing}));
  results.interactions.push({case:'compact checkout spacing, flush header and 44px+ mobile inputs / '+width,pass:true});
  // Visual regression: branded header, three-step progress and a non-default coupon CTA.
  const checkoutVisual=await page.evaluate(()=>{
   const intro=document.querySelector('.checkout-intro'),coupon=document.querySelector('#applyCoupon'),
    grid=document.querySelector('.co-grid'),total=document.querySelector('.checkout-totals .sumrow.total');
   const btn=getComputedStyle(coupon),summary=getComputedStyle(document.querySelector('.checkout-summary-heading'));
   return {intro:!!intro,progress:!!document.querySelector('.checkout-progress'),
    turnstileSize:document.querySelector('.cf-turnstile')?.dataset.size,
    couponStyled:btn.borderRadius!=='0px'&&btn.minHeight==='45px',
    summaryBranded:summary.backgroundColor!=='rgba(0, 0, 0, 0)'&&summary.backgroundColor!=='rgb(255, 255, 255)',
    total:!!total,columns:getComputedStyle(grid).gridTemplateColumns,overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  if(!checkoutVisual.intro||!checkoutVisual.progress||!checkoutVisual.couponStyled||!checkoutVisual.summaryBranded||!checkoutVisual.total||checkoutVisual.overflow
    ||checkoutVisual.turnstileSize!==(width<=360?'compact':'flexible'))throw Error('Checkout visual audit failed '+JSON.stringify({width,checkoutVisual}));
  results.interactions.push({case:'premium checkout visually styled / '+width,pass:true});
  if(width===390||width===1440)await page.screenshot({path:path.join(output,'premium-checkout-'+width+'.png'),fullPage:true});
  await page.locator('#f_province').selectOption('Punjab');
  await page.locator('#f_city').fill('Lahore');
  await page.waitForFunction(()=>document.getElementById('quoteStatus')?.textContent==='Total confirmed for Lahore.');
  const fmt=n=>'Rs. '+n.toLocaleString('en-PK');
  const subtotal=99*products.find(p=>p.id===39).price;
  if(await page.locator('#s_tot').innerText()!==fmt(subtotal+300))throw Error('COD quote total mismatch');
  // Consent must be visible next to contact details (not hidden under payment),
  // default unchecked, and retained as users navigate through review/back.
  const contactChoice=page.locator('#checkoutDeliveryStep #whatsappOrderOptIn');
  if(!await contactChoice.isVisible()||await page.locator('#f_whatsapp_optin').isChecked())
    throw Error('Optional WhatsApp consent hidden or preselected at '+width);
  const preferenceLayout=await page.evaluate(()=>{
    const box=document.querySelector('#whatsappOrderOptIn').getBoundingClientRect();
    const email=document.getElementById('f_email').getBoundingClientRect();
    return {visible:getComputedStyle(document.getElementById('whatsappOrderOptIn')).display!=='none',
      afterEmail:box.top>=email.top,withinScreen:box.left>=-1&&box.right<=innerWidth+1,
      tapHeight:box.height};
  });
  if(!preferenceLayout.visible||!preferenceLayout.afterEmail||!preferenceLayout.withinScreen||preferenceLayout.tapHeight<48)
    throw Error('WhatsApp consent placement or tap target failed '+JSON.stringify({width,preferenceLayout}));
  if(width===390){
    await page.locator('#toPaymentBtn').click();
    const fields=await page.evaluate(()=>Object.fromEntries(['f_phone','f_email','f_addr'].map(id=>{
      const node=document.getElementById(id);
      const described=(node.getAttribute('aria-describedby')||'').split(/\s+/);
      return [id,{invalid:node.getAttribute('aria-invalid')==='true',help:described.includes({f_phone:'f_phoneHelp',f_email:'emailHelp',f_addr:'addressHelp'}[id]),error:described.includes({f_phone:'e_phone',f_email:'e_email',f_addr:'e_addr'}[id])}];
    })));
    if(await page.locator('#checkoutPaymentStep').isVisible()||Object.values(fields).some(f=>!f.invalid||!f.help||!f.error))
      throw Error('Invalid delivery details bypassed validation or lost accessible help: '+JSON.stringify(fields));
    results.interactions.push({case:'invalid delivery details remain on step 1 and retain help/error descriptions',pass:true});
  }
  await page.locator('#f_whatsapp_optin').check();
  await page.locator('#f_fname').fill('Ali');
  await page.locator('#f_phone').fill('03000000000');
  await page.locator('#f_email').fill('ali@example.invalid');
  await page.locator('#f_addr').fill('Fixture Street 123, Lahore');
  await page.locator('#toPaymentBtn').click();
  if(!await page.locator('#checkoutPaymentStep').isVisible()||await page.locator('#checkoutDeliveryStep').isVisible())
    throw Error('Checkout failed to advance from delivery to payment');
  await page.locator('input[value="jazzcash"]').check();
  await page.waitForFunction(()=>document.getElementById('quoteStatus')?.textContent==='Total confirmed for Lahore.');
  if(await page.locator('#s_tot').innerText()!==fmt(subtotal))throw Error('Prepaid quote total mismatch');
  await page.locator('#f_reference').fill('QA-TRANSFER-1234');
  await page.locator('#toReviewBtn').click();
  await page.locator('#checkoutReviewStep').waitFor({state:'visible'});
  if(!await page.locator('#placeBtn').isVisible()||await page.locator('#checkoutPaymentStep').isVisible())
    throw Error('Checkout failed to reveal review and final order control');
  if(await page.locator('#reviewPayment').innerText()!=='JazzCash (Advance)')
    throw Error('Final review lost the chosen payment method');
  if(!await page.locator('#reviewWhatsapp').innerText().then(x=>x.includes('Yes — for this order only')))
    throw Error('Final review forgot explicitly selected WhatsApp order updates');
  await page.locator('#editDeliveryBtn').click();
  if(!await page.locator('#checkoutDeliveryStep').isVisible()||await page.locator('#f_addr').inputValue()!=='Fixture Street 123, Lahore')
    throw Error('Edit delivery lost the previous address');
  if(!await page.locator('#f_whatsapp_optin').isChecked())throw Error('Back navigation forgot explicit WhatsApp consent');
  await page.locator('#f_whatsapp_optin').uncheck();
  if(await page.locator('#f_whatsapp_optin').isChecked())throw Error('WhatsApp opt-out could not be selected');
  results.interactions.push({case:'WhatsApp consent visible and unchecked by default, survives review and remains reversible / '+width,pass:true});
  if(orders)throw Error('Browser check attempted an order');
  results.interactions.push({case:'checkout shows COD/prepaid totals without submitting / '+width,pass:true});
  await page.goto(base+'/shop/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof PRODUCTS!=='undefined'&&PRODUCTS.length>0);
  const motion=await page.evaluate(()=>({sheet:getComputedStyle(document.getElementById('filterSheet')).transitionDuration,badge:getComputedStyle(document.querySelector('.cartcount')).animationName}));
  if(motion.sheet!=='0s'||motion.badge!=='none')throw Error('Shopping controls ignored reduced motion');
  await page.getByRole('searchbox',{name:'Search products',exact:true}).fill('gum');
  if(await page.locator('#headerSearch').inputValue()!=='gum')throw Error('Header retained a stale search');
  results.interactions.push({case:'filter sheet and bag badge respect reduced motion / '+width,pass:true});
  await context.close();
 }
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
 await page.evaluate(()=>localStorage.setItem('chaskabox-cart',JSON.stringify(Object.fromEntries(Array.from({length:49},(_,i)=>[i+1,1])))));
 await page.locator('#addOccasion').click();await page.waitForFunction(()=>document.getElementById('occasionStatus')?.textContent.includes('50 different snacks'));
 results.interactions.push({case:'occasion distinct-item cap retains the original bag atomically',pass:await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('chaskabox-cart'))).length===49)});
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
  await openAdminPanel(page,'reviews');await page.getByRole('button',{name:'Unpublish',exact:true}).click();await page.locator('#view-reviews').getByText(/rejected/).waitFor();
  results.interactions.push({case:'owner can unpublish an approved review without deleting its record',pass:review.moderation_status==='rejected'&&await page.locator('#view-reviews [data-review-action="approve"]').count()===1});
  await openAdminPanel(page,'homepage');await page.locator('#homePackingVideo').waitFor();await page.locator('#homePackingVideo').fill('https://youtu.be/abcdefghijk');const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/admin/homepage'&&r.request().method()==='PATCH');await page.locator('#homeSave').click();await saved;await page.waitForFunction(()=>document.getElementById('homePackingVideo')?.value==='https://youtu.be/abcdefghijk');
  results.interactions.push({case:'admin packing-video draft retains other section configuration before publish',pass:section.draft_config?.packing_video_url==='https://youtu.be/abcdefghijk'&&section.draft_config?.button_text==='Preserved'&&!section.config.packing_video_url});
  const published=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/admin/homepage/publish');await page.locator('#homePublish').click();await published;
  results.interactions.push({case:'packing video becomes published only after an explicit owner action',pass:section.config.packing_video_url==='https://youtu.be/abcdefghijk'&&section.config.button_text==='Preserved'});
  await openAdminPanel(page,'media');await page.waitForFunction(()=>typeof document.getElementById('mediaUpload')?.onchange==='function');
  results.interactions.push({case:'media assignment and upload handlers initialize for original photos',pass:await page.locator('[data-assign-media]').evaluate(e=>typeof e.onclick==='function')&&await page.locator('[data-delete-media]').evaluate(e=>typeof e.onclick==='function')&&!await page.locator('#mediaUpload').isDisabled()});
  await context.close();
 }
 if(!args.includes('--quick'))for(const role of ['owner','manager','fulfilment','content']){
  const {context,page}=await contextFor(1440,role);await inspect(page,'/admin/',1440,role);
  results.interactions.push({case:role+' bootstrap',pass:(await page.locator('#backendState').innerText()).includes(role)});
  if(role==='owner'){
   // One synthetic navigation pass over every owner-facing panel; source wiring
   // only. This does not replace authenticated persistence/provider acceptance.
   const panelKeys=await page.locator('.admin-nav-btn[data-view]').evaluateAll(els=>els.map(e=>e.dataset.view));
   if(panelKeys.length!==26)throw Error('Expected Dashboard plus 25 owner panel targets, got '+panelKeys.length);
   for(const key of panelKeys){
    await openAdminPanel(page,key);
    const target=page.locator('#view-'+key);
    const visible=await target.isVisible();
    results.interactions.push({case:'owner opens admin panel: '+key,pass:visible});
    if(!visible)throw Error('Admin navigation does not open '+key);
   }
   attentionError=true;await openAdminPanel(page,'analytics');await page.waitForFunction(()=>document.getElementById('attnList')?.textContent.includes('unavailable'));results.interactions.push({case:'attention outage never says All clear',pass:true});attentionError=false;
  }
  else results.interactions.push({case:role+' cannot see owner AI agent controls',pass:!await page.locator('[data-view="agents"]').isVisible()});
  await context.close();
 }
 // Actual M05 controls, synthetic API only: never publish, send or enable agents.
 {
  const {context,page}=await contextFor(1440,'owner');page.removeAllListeners('dialog');page.on('dialog',d=>d.accept());
  let draft=null,failProposal=true,releaseDecision;const writes=[];const opsAgents=['orders','inventory','security','backups','support','seo','marketing','analytics'].map(agent=>({agent,enabled:false,mode:'observe'}));
  const decisionGate=new Promise(resolve=>releaseDecision=resolve);
  const ok=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  await context.route('**/api/admin/agents/**',async route=>{
   const request=route.request(),kind=new URL(request.url()).pathname.split('/').at(-1);
   if(request.method()==='POST'){
    const body=request.postDataJSON();writes.push(body);
    if(body.operation==='propose'){
     if(failProposal){failProposal=false;return ok(route,{error:{message:'Synthetic proposal outage'}},503);}
     draft={id:'00000000-0000-4000-8000-000000000071',headline:'Synthetic <img onerror=alert(1)> draft',draft_text:'Synthetic review text',channel:body.channel,decision:'pending'};
     return ok(route,{draft,published:false,sent:false});
    }
    if(body.operation==='decide'){await decisionGate;draft.decision=body.decision;return ok(route,{draft,published:false,sent:false});}
    if(kind==='operations'&&body.action==='activate'){
     const item=opsAgents.find(x=>x.agent===body.agent);if(!item||item.agent==='marketing')throw Error('Unsafe agent activation');
     item.enabled=body.enabled;return ok(route,{activation:{agent:item.agent,enabled:item.enabled,mode:'observe'},no_external_actions:true});
    }
    if(kind==='operations'&&body.action==='scan')return ok(route,{saved:false,notifications_sent:false,scan:{mode:'read_only_no_receipt',orders:{stale_new_orders:0},inventory:{visible_unavailable:0},insights:{seo:{missing_seo_title:0}}}});
    throw Error('Unexpected synthetic agent write');
   }
   if(kind==='status')return ok(route,{agents:['orders','inventory','security','backups','support','seo','marketing','analytics'].map(agent_key=>({agent_key,enabled:false})),pending_jobs:0,pending_approvals:0});
   if(kind==='preview'||kind==='insights')return ok(route,{agents:[]});
   if(kind==='marketing')return ok(route,{drafts:draft?[draft]:[]});
   if(kind==='operations')return ok(route,{activation:opsAgents,observations:[],alerts:[]});
   throw Error('Unexpected synthetic agent route');
  });
  await page.goto(base+'/admin/');await page.waitForFunction(()=>document.getElementById('adminBoot')?.style.display==='none');
  await openAdminPanel(page,'agents');await page.waitForFunction(()=>document.getElementById('agentsM05Message')?.textContent.includes('diagnostics updated'));
  results.interactions.push({case:'owner agent view shows eight configured and zero enabled agents',pass:(await page.locator('#agentsM05Readiness').innerText()).includes('Configured agents: 8')&&(await page.locator('#agentsM05Readiness').innerText()).includes('Enabled agents: 0')});
  await page.locator('#agentsM05ProductId').fill('5');await page.locator('#agentsM05Propose button[type="submit"]').click();
  await page.waitForFunction(()=>document.getElementById('agentsM05Message')?.textContent.includes('Synthetic proposal outage'));
  results.interactions.push({case:'agent draft failure retains product input and restores submit',pass:await page.locator('#agentsM05ProductId').inputValue()==='5'&&!await page.locator('#agentsM05Propose button[type="submit"]').isDisabled()});
  await page.locator('#agentsM05Propose button[type="submit"]').click();await page.getByRole('button',{name:'Approve draft',exact:true}).waitFor();
  results.interactions.push({case:'marketing draft is shown as literal text without injected HTML',pass:(await page.locator('#agentsM05Drafts').innerText()).includes('<img onerror=alert(1)>')&&await page.locator('#agentsM05Drafts img').count()===0});
  await page.getByRole('button',{name:'Approve draft',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('#agentsM05Drafts button')].every(b=>b.disabled));
  const pairedDisabled=await page.getByRole('button',{name:'Reject draft',exact:true}).isDisabled();releaseDecision();
  await page.waitForFunction(()=>document.getElementById('agentsM05Drafts')?.textContent.includes('approved'));
  results.interactions.push({case:'approval disables both decisions and records one review-only action',pass:pairedDisabled&&writes.filter(w=>w.operation==='decide').length===1&&draft.decision==='approved'});
  await page.waitForFunction(()=>document.getElementById('agentsPhase12Status')?.textContent.includes('No open saved alerts'));
  results.interactions.push({case:'owner operations panel has seven controlled toggles and locked marketing',pass:await page.locator('#agentsPhase12Operations button').count()===9&&await page.locator('#agentsPhase12Operations').innerText().then(x=>x.includes('MARKETING — OFF'))});
  await page.locator('#agentsPhase12Operations button').filter({hasText:'Enable safe monitoring'}).first().click();
  await page.waitForFunction(()=>document.getElementById('agentsPhase12Operations')?.textContent.includes('ORDERS — ON'));
  results.interactions.push({case:'owner operations controls update one read-only agent',pass:writes.filter(w=>w.action==='activate').length===1&&opsAgents.find(x=>x.agent==='orders').enabled===true&&opsAgents.find(x=>x.agent==='marketing').enabled===false});
  await page.locator('#agentsPhase12Operations button').filter({hasText:'Run read-only scan'}).click();
  await page.waitForFunction(()=>document.getElementById('agentsPhase12Status')?.textContent.includes('Read-only scan done'));
  results.interactions.push({case:'on-demand scan returns safe read-only aggregates without saved receipt',pass:writes.filter(w=>w.action==='scan').length===1});
  await context.close();
 }
 // Header/Footer/Mobile links must be creatable/editable by the owner without SQL.
 {
  const {context,page}=await contextFor(1440,'owner');
  const items=[{id:'00000000-0000-4000-8000-000000000081',location:'header',label:'Shop',url:'/shop/',position:1,is_enabled:true}];
  let posts=0,patches=0;
  const reply=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  await context.route('**/api/admin/navigation',route=>{
   const method=route.request().method();
   if(method==='POST'){const item={id:'00000000-0000-4000-8000-000000000082',...route.request().postDataJSON()};
    items.push(item);posts++;return reply(route,{item},201);}
   if(method==='PATCH'){for(const update of route.request().postDataJSON().items){const item=items.find(i=>i.id===update.id);if(item)Object.assign(item,update);}patches++;return reply(route,{ok:true,updated:1});}
   return reply(route,{navigation:{header:items.filter(i=>i.location==='header'),footer:items.filter(i=>i.location==='footer'),mobile:items.filter(i=>i.location==='mobile')}});
  });
  await page.goto(base+'/admin/');
  await page.waitForFunction(()=>document.getElementById('adminBoot')?.style.display==='none');
  await openAdminPanel(page,'navigation');
  await page.locator('#headerNavList [data-nav-edit]').first().waitFor();
  await page.locator('#addMobileNav').click();
  await page.locator('#navEditLabel').fill('My mobile offers');
  await page.locator('#navEditUrl').fill('javascript:alert(1)');
  await page.locator('#navEditSave').click();
  const rejected=await page.locator('#navEditError').isVisible()&&posts===0;
  await page.locator('#navEditUrl').fill('/shop/');
  await page.locator('#navEditSave').click();
  await page.locator('#mobileNavList [data-nav-edit]').first().waitFor();
  results.interactions.push({case:'owner can create mobile navigation item and unsafe URL is rejected',
    pass:rejected&&posts===1&&items[1].location==='mobile'&&items[1].label==='My mobile offers'});
  await page.locator('#mobileNavList [data-nav-edit]').first().click();
  await page.locator('#navEditLabel').fill('Daily snacks');
  await page.locator('#navEditSave').click();
  await page.locator('#mobileNavList').getByText('Daily snacks',{exact:true}).waitFor();
  results.interactions.push({case:'owner edits mobile navigation item via audited PATCH',pass:
    patches===1&&items[1].label==='Daily snacks'});
  await context.close();
 }
 // Owner/Manager/Content category and brand actions must match backend role gates.
 for(const role of ['owner','manager','content']){
  const {context,page}=await contextFor(1440,role);
  const category={id:'00000000-0000-4000-8000-000000000051',name:'Synthetic category',slug:'synthetic-category',is_visible:true,show_on_homepage:false,hide_if_empty:true};
  const brand={id:'00000000-0000-4000-8000-000000000052',name:'Synthetic brand',slug:'synthetic-brand',is_visible:true};
  const writes=[];
  const respond=(route,value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
  await context.route('**/api/admin/categories',route=>{
   if(route.request().method()==='POST'){
    const payload=route.request().postDataJSON();writes.push({method:'POST',payload});
    return respond(route,{category:{...category,...payload}},201);
   }
   return respond(route,{categories:[category]});
  });
  await context.route('**/api/admin/categories/*',route=>{
   writes.push({method:route.request().method()});
   return respond(route,{error:{message:'Synthetic storage unavailable'}},503);
  });
  await context.route('**/api/admin/brands',route=>respond(route,{brands:[brand]}));
  await page.goto(base+'/admin/');
  await page.waitForFunction(()=>document.getElementById('adminBoot')?.style.display==='none');
  await openAdminPanel(page,'categories');
  await page.locator('[data-edit-cat]').waitFor();
  await page.locator('[data-edit-cat]').click();
  const canCategoryDelete=await page.locator('#deleteCategoryBtn').isVisible();
  results.interactions.push({case:role+' category delete control respects server role policy',
   pass:canCategoryDelete===(role!=='content')});
  await page.locator('#categoryEditor .modal-head button[data-close-cat-modal]').click();
  // A content editor must still be allowed to create a draft category.
  if(role==='content'){
   await page.locator('#addCategoryBtn').click();
   await page.locator('#catName').fill('Synthetic new category');
   await page.locator('#categoryForm button[type=submit]').click();
   await page.waitForFunction(()=>!document.getElementById('categoryEditor').classList.contains('open'));
   results.interactions.push({case:'content category create safely reaches protected POST API',
    pass:writes.length===1&&writes[0].method==='POST'&&writes[0].payload.name==='Synthetic new category'});
  }
  if(role!=='content'){
   await openAdminPanel(page,'brands');
   await page.locator('[data-del-brand]').first().waitFor({state:role==='owner'?'visible':'hidden',timeout:8000}).catch(()=>{});
   const canBrandDelete=await page.locator('[data-del-brand]').count()>0;
   results.interactions.push({case:role+' brand delete control respects owner-only API policy',
    pass:canBrandDelete===(role==='owner')});
  }
  await context.close();
 }
 // Navigation reorder must roll back safely if the protected API rejects a save.
 {
  const {context,page}=await contextFor(1440,'owner');let failing=true,patches=0;
  const navItems=[{id:1,label:'Shop',url:'/shop/',is_enabled:true,position:1},{id:2,label:'About',url:'/about/',is_enabled:true,position:2}];
  await context.route('**/api/admin/navigation',route=>{
   if(route.request().method()==='PATCH'){
    patches++;
    if(failing)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Synthetic menu persistence outage'}})});
    for(const item of route.request().postDataJSON().items){const row=navItems.find(n=>String(n.id)===String(item.id));if(row)row.position=item.position;}
   }
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({navigation:{header:navItems,footer:[],mobile:[]}})});
  });
  await page.goto(base+'/admin/');
  await page.waitForFunction(()=>document.getElementById('adminBoot')?.style.display==='none');
  await openAdminPanel(page,'navigation');
  // allTextContents() does not wait for async panel load; capture only after rows exist.
  await page.locator('#headerNavList .nav-row').first().waitFor({state:'visible'});
  const original=await page.locator('#headerNavList .nav-row b').allTextContents();
  await page.locator('#headerNavList [data-nav-down="0"]').click();
  await page.waitForFunction(()=>document.getElementById('adminToast')?.textContent.includes('original menu restored'));
  const restoredOrder=await page.locator('#headerNavList .nav-row b').allTextContents();
  results.interactions.push({case:'admin menu reorder failure visibly reverts unsaved changes',pass:
   JSON.stringify(original)===JSON.stringify(restoredOrder)&&patches===1,
   evidence:{initialCount:original.length,restoredCount:restoredOrder.length,patches}});
  failing=false;
  await page.locator('#headerNavList [data-nav-down="0"]').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('#headerNavList .nav-row b')].map(e=>e.textContent).join(',')==='About,Shop');
  results.interactions.push({case:'admin menu reorder saves correctly after retry',pass:
   patches===2&&navItems[0].position===2&&navItems[1].position===1});
  await context.close();
 }
 // Partial-read outage must retain actual activation state and not invent healthy agent signals.
 {
  const {context,page}=await contextFor(1440,'owner');
  let down=true, statusDown=false;
  const respond=(route,payload,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
  await context.route('**/api/admin/agents/**',route=>{
   const key=new URL(route.request().url()).pathname.split('/').at(-1);
   if(route.request().method()!=='GET')throw Error('Unexpected agent mutation during outage drill');
   if(key==='status'&&statusDown)return respond(route,{error:{message:'Synthetic status outage'}},503);
   if(key==='status')return respond(route,{agents:['orders','inventory','security','backups','support','seo','marketing','analytics'].map(agent_key=>({agent_key,mode:'observe',enabled:false})),pending_jobs:0,pending_approvals:0});
   if(key==='preview')return respond(route,{agents:[{agent:'orders',state:'attention',signals:{stale_new_orders:2}}]});
   if(key==='insights'&&down)return respond(route,{error:{message:'Synthetic insight outage'}},503);
   if(key==='marketing'&&down)return respond(route,{error:{message:'Synthetic draft outage'}},503);
   if(key==='insights')return respond(route,{agents:[]});
   if(key==='marketing')return respond(route,{drafts:[]});
   if(key==='operations')return respond(route,{error:{message:'Synthetic operations outage'}},503);
   throw Error('Unexpected agent endpoint '+key);
  });
  await page.goto(base+'/admin/');
  await page.waitForFunction(()=>document.getElementById('adminBoot')?.style.display==='none');
  await openAdminPanel(page,'agents');
  await page.waitForFunction(()=>document.getElementById('agentsM05Message')?.textContent.includes('Partial diagnostics'));
  const stillVisible=(await page.locator('#agentsM05Readiness').innerText()).includes('Configured agents: 8')&&
   (await page.locator('#agentsM05Signals').innerText()).includes('ORDERS · attention')&&
   await page.locator('#agentsM05Signals article').count()===8;
  const locked=await page.locator('#agentsM05Propose button[type="submit"]').isDisabled();
  results.interactions.push({case:'partial AI outage shows all eight and keeps healthy claims bounded',pass:stillVisible&&locked});
  statusDown=true;await page.locator('#agentsM05Refresh').click();
  await page.waitForFunction(()=>document.getElementById('agentsM05Readiness')?.textContent.includes('Unknown — status endpoint unavailable'));
  results.interactions.push({case:'agent status outage cannot fabricate zero enabled or configured agents',pass:
   !(await page.locator('#agentsM05Readiness').innerText()).includes('Enabled agents: 0')&&
   await page.locator('#agentsM05Propose button[type="submit"]').isDisabled()});
  down=false;statusDown=false;await page.locator('#agentsM05Refresh').click();
  await page.waitForFunction(()=>document.getElementById('agentsM05Message')?.textContent.includes('diagnostics updated'));
  results.interactions.push({case:'AI diagnostics recover after endpoint outage without agent activation',pass:
   !await page.locator('#agentsM05Propose button[type="submit"]').isDisabled()&&
   (await page.locator('#agentsM05Readiness').innerText()).includes('Enabled agents: 0')});
  await context.close();
 }
 // New brand's full CMS editor must create with all values; no prompt or real writes.
 {
  const {context,page}=await contextFor(1440,'owner');
  let created=null;const requests=[];
  await context.route('**/api/admin/brands',route=>{
   const method=route.request().method();
   if(method==='POST'){
    const payload=route.request().postDataJSON();requests.push(payload);
    created={id:115,name:payload.name,slug:payload.slug||'synthetic-owner-brand',is_visible:payload.is_visible,description:payload.long_description};
    return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({brand:created})});
   }
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({brands:created?[created]:[]})});
  });
  await page.goto(base+'/admin/');await page.waitForFunction(()=>document.getElementById('adminBoot')?.style.display==='none');
  await openAdminPanel(page,'brands');
  await page.locator('#addBrandBtn').click();await page.locator('#beName').waitFor();
  await page.locator('#beName').fill('Synthetic owner brand');
  await page.locator('#beShort').fill('Small batch fixture');
  await page.locator('#beSeoTitle').fill('Synthetic brand SEO title');
  await page.locator('#beLong').fill('Synthetic owner-authored brand description');
  await page.locator('#beSave').click();
  await page.getByText('Synthetic owner brand',{exact:false}).first().waitFor();
  results.interactions.push({case:'brand create editor saves name, SEO and description via protected API',pass:requests.length===1&&requests[0].name==='Synthetic owner brand'&&requests[0].seo_title==='Synthetic brand SEO title'&&requests[0].short_description==='Small batch fixture'&&requests[0].long_description==='Synthetic owner-authored brand description'&&requests[0].is_visible===true});
  await context.close();
 }
 // Exercise operational UI writes only against intercepted, synthetic records.
 {
  const {context,page}=await contextFor(1440,'owner');page.removeAllListeners('dialog');page.on('dialog',d=>d.accept());
  const orderId='00000000-0000-4000-8000-000000000021',customerId='00000000-0000-4000-8000-000000000022';
  let order={id:orderId,order_number:'CB-SYNTHETIC-ACCEPTANCE',customer_name:'Synthetic acceptance customer',customer_phone:'03000000000',customer_address:'Synthetic address',customer_city:'Fixture city',payment_method:'jazzcash',payment_status:'payment_submitted',transaction_reference:'SYNTHETIC-REF',fulfilment_status:'new',total:600,subtotal:300,delivery_fee:300,created_at:'2026-10-14T00:00:00Z',updated_at:'2026-10-14T00:00:00Z'};
  let product={...products.find(p=>p.id===39),id:39,name:'Synthetic editor snack',description:'Synthetic pack description',price:300,old_price:null,visibility:'visible',stock_state:'sourced_after_order',tags:['fixture-tag-unique'],brand:'FixtureBrandOnly',slug:'fixture-slug-only'};
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
  await openAdminPanel(page,'orders');
  const requestedOrderUrls=[];
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/admin/orders')requestedOrderUrls.push(new URL(r.url()));});
  await page.locator('[data-order-view="payment_submitted"]').click();
  await page.waitForFunction(()=>document.getElementById('orderActiveView')?.textContent.includes('submitted payments'));
  const presetQuery=requestedOrderUrls.at(-1);
  results.interactions.push({case:'V4 payment review preset triggers existing protected order GET filter',pass:presetQuery?.searchParams.get('payment_status')==='payment_submitted'&&!presetQuery.searchParams.get('fulfilment_status')});
  await page.locator('[data-order-view="all"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-order-view="all"]')?.getAttribute('aria-pressed')==='true');
  await page.locator('#orderStatusFilter').selectOption('dispatched');
  await page.waitForFunction(()=>document.getElementById('orderStatusFilter')?.value==='dispatched');
  await page.waitForTimeout(300);
  const fulfilmentQuery=requestedOrderUrls.at(-1);
  results.interactions.push({case:'orders fulfilment filter requests first page not a DOM event',pass:fulfilmentQuery?.searchParams.get('page')==='1'&&fulfilmentQuery.searchParams.get('fulfilment_status')==='dispatched'});
  await page.locator('#orderPaymentFilter').selectOption('payment_submitted');
  await page.locator('#orderMethodFilter').selectOption('jazzcash');
  await page.locator('#orderDateFrom').fill('2026-10-01');await page.locator('#orderDateFrom').dispatchEvent('change');
  await page.locator('#orderDateTo').fill('2026-10-15');await page.locator('#orderDateTo').dispatchEvent('change');
  await page.waitForTimeout(300);
  const filteredQuery=requestedOrderUrls.at(-1);
  results.interactions.push({case:'orders payment method and date range reach authenticated API',pass:filteredQuery?.searchParams.get('payment_status')==='payment_submitted'&&filteredQuery?.searchParams.get('method')==='jazzcash'&&filteredQuery?.searchParams.get('date_from')==='2026-10-01'&&filteredQuery?.searchParams.get('date_to')==='2026-10-15'});
  await page.locator('#orderResetFilters').click();await page.waitForTimeout(300);
  results.interactions.push({case:'reset order filters restores first-page unfiltered view',pass:!requestedOrderUrls.at(-1)?.searchParams.get('payment_status')&&requestedOrderUrls.at(-1)?.searchParams.get('page')==='1'&&!await page.locator('#orderDateFrom').inputValue()});
  await page.getByRole('button',{name:'Manage',exact:true}).click();
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
  await openAdminPanel(page,'products');
  await page.locator('#productSort').selectOption('price_asc');
  await page.locator('#productQuality').selectOption('missing_seo');
  const qualityContext=await page.locator('#productResultCount').innerText();
  results.interactions.push({case:'V4 catalogue sort and quality filters explicitly label current page scope',pass:qualityContext.includes('loaded on page')&&await page.locator('#productSort').inputValue()==='price_asc'});
  await page.locator('#resetFiltersBtn').click();
  await page.waitForFunction(()=>document.getElementById('productQuality')?.value===''&&document.getElementById('productSort')?.value==='recent');
  for(const query of ['FixtureBrandOnly','fixture-tag-unique','fixture-slug-only']){
   await page.locator('#productSearch').fill(query);
   await page.locator('[data-live-edit="39"]').waitFor({state:'visible'});
   results.interactions.push({case:'admin product search covers '+query,pass:await page.locator('#productAdminGrid [data-product-id="39"]').isVisible()});
  }
  await page.locator('#productSearch').fill('');
  await page.locator('[data-live-edit="39"]').click();await page.locator('#editName').fill('Synthetic editor snack saved');const edited=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/admin/products/39');await page.locator('#productForm').evaluate(e=>e.requestSubmit());await edited;await page.waitForFunction(()=>!document.getElementById('productEditor')?.classList.contains('open'));
  results.interactions.push({case:'product edit opens, hydrates fields and saves to the protected endpoint',pass:productWrites.length===1&&product.name==='Synthetic editor snack saved'&&productWrites[0].description==='Synthetic pack description'});
  await page.locator('[data-live-select="39"]').check();await page.waitForFunction(()=>document.getElementById('bulkCount')?.textContent.startsWith('1 selected'));
  const bulkFailed=page.waitForResponse(r=>r.url().endsWith('/products/bulk'));await page.locator('#bulkBar [data-bulk="hide"]').click();await bulkFailed;await page.waitForFunction(()=>document.getElementById('bulkFeedback')?.textContent.includes('Not saved'));
  results.interactions.push({case:'bulk write failure retains selection and restores controls for retry',pass:product.visibility==='visible'&&await page.locator('[data-live-select="39"]').isChecked()&&!await page.locator('#bulkBar [data-bulk="hide"]').isDisabled()});
  failBulk=false;const bulkSaved=page.waitForResponse(r=>r.url().endsWith('/products/bulk'));await page.locator('#bulkBar [data-bulk="hide"]').click();await bulkSaved;await page.waitForFunction(()=>document.getElementById('bulkFeedback')?.textContent.includes('1 updated'));
  results.interactions.push({case:'bulk retry updates only selected products and clears selection on success',pass:product.visibility==='hidden'&&bulkWrites.length===2&&bulkWrites[1].ids.length===1&&bulkWrites[1].ids[0]===39&&!await page.locator('[data-live-select="39"]').isChecked()});
  await openAdminPanel(page,'customers');await page.getByRole('button',{name:'Synthetic acceptance customer',exact:true}).click();await page.getByRole('button',{name:'Back to customers',exact:true}).waitFor();
  const detail=(await page.locator('#view-customers').innerText()).includes('CB-SYNTHETIC-ACCEPTANCE');await page.getByRole('button',{name:'Back to customers',exact:true}).click();await page.locator('#customerSearch').waitFor();
  results.interactions.push({case:'customer detail and back navigation show matching synthetic order history',pass:detail&&await page.locator('[data-customer]').count()===1});
  await openAdminPanel(page,'boxes');await page.locator('#previewBoxBtn').click();await page.locator('[data-add-box="39"]').click();await page.locator('#boxPrice').fill('299');await page.locator('#previewBoxBtn').click();await page.locator('#boxDraftPreview').waitFor();
  results.interactions.push({case:'box preview handles the selected product list without saving a box',pass:(await page.locator('#boxDraftPreview').innerText()).includes('Synthetic editor snack')&&(await page.locator('#boxDraftPreview').innerText()).includes('Nothing has been saved or published')});
  await context.close();
 }

  // V4 controls use only synthetic fixtures and never write real data.
  {
    const {context,page}=await contextFor(1440,null);
    await page.goto(base+'/admin-v4-demo.html');
    await page.locator('#adminCommandOpen').click();
    await page.locator('#adminCommandDialog[open]').waitFor();
    await page.locator('#adminCommandSearch').fill('notifications');
    const matches=await page.locator('#adminCommandResults button').count();
    await page.locator('#adminCommandSearch').press('Enter');
    const navigated=await page.locator('#view-notifications').evaluate(el=>el.classList.contains('active'));
    results.interactions.push({case:'V4 command search navigates synthetic panels',pass:matches===1&&navigated});
    await page.locator('#adminDensityToggle').click();
    const compact=await page.locator('.demo-admin-shell').evaluate(el=>el.classList.contains('admin-density-compact'));
    await page.reload();
    const persisted=await page.locator('.demo-admin-shell').evaluate(el=>el.classList.contains('admin-density-compact'));
    results.interactions.push({case:'V4 density preference survives refresh locally',pass:compact&&persisted});
    await page.keyboard.press('Control+k');
    await page.locator('#adminCommandDialog[open]').waitFor();
    await page.keyboard.press('Escape');
    const closed=!(await page.locator('#adminCommandDialog').evaluate(el=>el.open));
    results.interactions.push({case:'V4 keyboard shortcut and Escape close launcher',pass:closed});
    await page.locator('[data-view="orders"]').click();
    await page.locator('[data-demo-order-view="payment_submitted"]').click();
    const visibleOrders=await page.locator('.demo-order-row:visible').count();
    await page.locator('[data-demo-order-view="all"]').click();
    results.interactions.push({case:'V4 synthetic quick order views filter and reset sample rows',pass:visibleOrders===1&&await page.locator('.demo-order-row:visible').count()===3});
    await page.locator('[data-view="products"]').click();
    await page.locator('#demoProductQuality').selectOption('missing_image');
    const onlyMissing=await page.locator('.demo-product-row:visible').count();
    await page.locator('#demoProductQuality').selectOption('');
    await page.locator('#demoProductSort').selectOption('price_desc');
    const firstSample=await page.locator('.demo-product-row:visible').first().getAttribute('data-demo-name');
    results.interactions.push({case:'V4 synthetic catalogue quality and price sorting operate locally',pass:onlyMissing===1&&firstSample==='Chaska Mix'});
    await context.close();
  }
  {
    const {context,page}=await contextFor(390,null);
    await page.goto(base+'/admin-v4-demo.html');
    await page.locator('#sidebarToggle').click();
    await page.locator('#adminSidebar.open').waitFor();
    await page.locator('#adminNavGroups details[data-group="storefront"] summary').click();
    await page.locator('[data-view="preview"]').click();
    const navigated=await page.locator('#view-preview').evaluate(el=>el.classList.contains('active'));
    const closed=!(await page.locator('#adminSidebar').evaluate(el=>el.classList.contains('open')));
    results.interactions.push({case:'V4 mobile demo drawer navigates and closes',pass:navigated&&closed});
    await context.close();
  }

  // Admin V4.2 sidebar: no network/data access in this synthetic design review.
  {
    const {context,page}=await contextFor(1440,null);
    await page.goto(base+'/admin-v4-demo.html');
    await page.locator('#adminSidebarCollapse').click();
    const minimized=await page.locator('.demo-admin-shell').evaluate(el=>el.classList.contains('admin-sidebar-minimized'));
    await page.locator('#adminSidebarRestore').click();
    const expanded=!(await page.locator('.demo-admin-shell').evaluate(el=>el.classList.contains('admin-sidebar-minimized')));
    results.interactions.push({case:'V4 desktop sidebar focus mode collapses and restores accessibly',pass:minimized&&expanded});
    await page.locator('#adminPinCurrent').click();
    const onePinned=await page.locator('.admin-pinned-item').count()===1;
    await page.locator('[data-view="orders"]').click();
    await page.locator('#adminPinCurrent').click();
    const twoPinned=await page.locator('.admin-pinned-item').count()===2;
    await page.locator('.admin-pinned-jump').first().click();
    const jumped=await page.locator('#view-dashboard').evaluate(el=>el.classList.contains('active'));
    results.interactions.push({case:'V4 pinned panel shortcuts navigate and persist inside one browser',pass:onePinned&&twoPinned&&jumped});
    await page.locator('#adminCollapseGroups').click();
    const closed=await page.locator('details.admin-nav-group[open]').count()===0;
    await page.locator('#adminExpandGroups').click();
    const opened=await page.locator('details.admin-nav-group[open]').count()===6;
    results.interactions.push({case:'V4 expand/collapse-all group controls operate native disclosures',pass:closed&&opened});
    await page.reload();
    const kept=await page.locator('.admin-pinned-item').count()===2;
    results.interactions.push({case:'V4 favorite panel shortcuts survive local browser reload',pass:kept});
    await context.close();
  }
  {
    const {context,page}=await contextFor(390,null);
    await page.goto(base+'/admin-v4-demo.html');
    await page.locator('#sidebarToggle').click();
    const opened=await page.locator('#adminSidebar').evaluate(el=>el.classList.contains('open'));
    const focusedSearch=await page.locator('#adminNavSearch').evaluate(el=>document.activeElement===el);
    await page.locator('#adminPinFromSidebar').click();
    const pinned=await page.locator('.admin-pinned-item').count()===1;
    await page.locator('#adminSidebarCollapse').click();
    const closed=!(await page.locator('#adminSidebar').evaluate(el=>el.classList.contains('open')));
    const focusReturned=await page.locator('#sidebarToggle').evaluate(el=>document.activeElement===el);
    results.interactions.push({case:'V4 mobile sidebar pins current panel and closes with focus returned',pass:opened&&focusedSearch&&pinned&&closed&&focusReturned});
    await context.close();
  }

  // Public discovery and owner storefront design controls, without live writes.
  {
    const {context,page}=await contextFor(390,null);
    await page.goto(base+'/shop/',{waitUntil:'domcontentloaded'});
    await page.locator('#shopCategoryRail a').first().waitFor({state:'visible'});
    const count=await page.locator('#shopCategoryRail a').count();
    const all=await page.locator('#shopCategoryRail a').first().getAttribute('href');
    results.interactions.push({case:'storefront mobile category rail displays catalogue links with a clear all-snacks route',pass:count>1&&all==='/shop/'});
    const firstCategory=page.locator('#shopCategoryRail a').nth(1);
    const route=await firstCategory.getAttribute('href');
    await firstCategory.click();
    await page.waitForURL(url=>url.pathname===route,{timeout:6000});
    results.interactions.push({case:'storefront category shortcuts navigate to genuine category routes',pass:page.url().includes(route)});
    await context.close();
  }
  {
    const {context,page}=await contextFor(1440,null);
    await page.goto(base+'/admin-v4-demo.html');
    await openAdminPanel(page,'preview');
    await page.locator('[data-storefront-editor="theme"]').click();
    const opened=await page.locator('#view-theme').evaluate(el=>el.classList.contains('active'));
    await openAdminPanel(page,'preview');
    await page.locator('[data-storefront-route="/shop/"]').click();
    await page.locator('#demoStorefrontRouteFrame').waitFor({state:'attached'});
    const publicRoute=await page.locator('#demoStorefrontRouteFrame').getAttribute('src');
    results.interactions.push({case:'V4 storefront design controls navigate to real editor and public route preview',pass:opened&&publicRoute==='/shop/'});
    await context.close();
  }

  {
    const {context,page}=await contextFor(1440,null);
    await page.goto(base+'/admin-v4-demo.html');
    await openAdminPanel(page,'theme');
    await page.locator('#demoThemeFrame').waitFor({state:'attached'});
    await page.waitForFunction(()=>document.getElementById('demoThemeFrame')?.contentDocument?.readyState==='complete',{timeout:12000});
    await page.locator('#demoThemePrimary').fill('#244a86');
    await page.locator('#demoThemeApply').click();
    const applied=await page.locator('#demoThemeFrame').evaluate(f=>f.contentDocument?.getElementById('chaskaboxDemoThemeStyle')?.textContent.includes('#244a86'));
    await page.locator('#demoThemeReset').click();
    const reset=await page.locator('#demoThemeFrame').evaluate(f=>f.contentDocument?.getElementById('chaskaboxDemoThemeStyle')?.textContent==='');
    results.interactions.push({case:'V4 theme sandbox applies and resets unsaved colors inside storefront iframe only',pass:applied&&reset});
    await context.close();
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));globalThis.fetch=originalFetch;await writeFile(path.join(output,'browser-results.json'),JSON.stringify(results,null,2));}
console.log(JSON.stringify({pages:results.cases.length,interactions:results.interactions,errors:results.errors}));
if(results.cases.some(c=>c.status!==200||c.overflow||c.duplicatePromo||c.violations.length)||results.interactions.some(c=>!c.pass)||results.errors.length)process.exitCode=1;
