import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {renderShopHero,renderShopHeroHead} from '../shop-hero-render.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Shop can paint its reference fonts, style and matching image previews without external hero resources',()=>{
 const head=renderShopHeroHead({}),body=renderShopHero({});
 assert.match(head,/<style id="cb-shop-hero-style">/);
 assert.equal((head.match(/data:font\/woff;base64,/g)||[]).length,2);
 assert.equal((head.match(/data:image\/webp;base64,/g)||[]).length,2);
 assert.doesNotMatch(head,/<link[^>]+(?:as="font"|rel="stylesheet")/);
 assert.ok(head.indexOf('as="image"')<head.indexOf('<style'));
 assert.match(body,/cb-original-desktop/);assert.match(body,/cb-original-mobile/);
 const custom=renderShopHero({artwork:{desktopUrl:'/images/custom.webp',mobileUrl:'/images/custom-mobile.webp'}});
 assert.doesNotMatch(custom,/cb-original-desktop|cb-original-mobile/,'Custom artwork must never show the reference poster');
});
test('the first Shop entry uses an SSR document; mounted Shop routes and filters keep SPA navigation',()=>{
 const app=read('app.js'),normalize=app.slice(app.indexOf('function normalizePath('),app.indexOf('function navigate('));
 const navigate=app.slice(app.indexOf('function navigate('),app.indexOf('function goHome('));
 let mounted=false,assigned=[],historyCalls=[],routed=0;
 const scope={URL,document:{getElementById:()=>mounted?{}:null},location:{origin:'https://chaskabox.online',pathname:'/',search:'',hash:'',assign:p=>assigned.push(p)},history:{pushState:(_,__,p)=>historyCalls.push(p)},route:()=>routed++};vm.createContext(scope);vm.runInContext(normalize+navigate,scope);
 scope.navigate('/shop/?q=toffee');assert.deepEqual(assigned,['/shop/?q=toffee']);assert.equal(routed,0);assert.equal(historyCalls.length,0);
 mounted=true;scope.navigate('/shop/');assert.equal(historyCalls[0],'/shop/');assert.equal(routed,1);
 mounted=false;scope.location.pathname='/shop/';scope.navigate('/shop/?sort=new');assert.equal(assigned.length,1);assert.equal(routed,2,'Disabled-hero Shop filters must not trigger full reloads');
});
test('legacy Shop bookmarks redirect before the old homepage can paint and preserve filters',()=>{
 const source=read('index.html').match(/<script id="cb-shop-entry">([\s\S]*?)<\/script>/)?.[1];assert.ok(source);
 for(const hash of ['#/shop','#/shop/','#/shop?sort=new']){
  let target;const document={documentElement:{style:{}}};
  vm.runInNewContext(source,{URL,document,location:{hash,origin:'https://chaskabox.online',search:'?brand=Hilal',replace:path=>target=path}});
  assert.equal(document.documentElement.style.visibility,'hidden');assert.equal(target,hash.includes('sort=')?'/shop/?sort=new':'/shop/?brand=Hilal');
 }
 for(const hash of ['#access_token=private','#type=recovery','#faq','#/product/39']){
  let replaced=false;vm.runInNewContext(source,{URL,document:{documentElement:{style:{}}},location:{hash,origin:'https://chaskabox.online',replace:()=>replaced=true}});assert.equal(replaced,false);
 }
});
