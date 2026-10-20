import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const category=['betel-nuts-and-pan-masala','biscuits-and-wafers','bunties-and-cakes','chews-and-gums','chocolates-and-candies','imli-and-ice-lollies','jellies-and-marshmallow','snacks-and-nimco'];
const routes=['index.html','shop/index.html','bundles/index.html','brands/index.html','about/index.html','contact/index.html',...category.map(x=>'category/'+x+'/index.html')];
test('existing WhatsApp link is reused and search enhancements load on all storefronts',()=>{
 for(const path of routes){
  const s=read(path);
  assert.match(s,s.includes('storefront-bundle.css')?/storefront-bundle\.css\?v=20261020-close1/:/search-whatsapp-float\.css\?v=20261019-wa2/,path);
  assert.match(s,/search-whatsapp-float\.js\?v=20261019-wa1/,path);
  assert.match(s,/class="cb-contact" href="https:\/\/wa\.me\/923320005381"/,path);
 }
});
test('search styling stays legible, WA button floats clear of mobile dock, no payment or order changes',()=>{
 const css=read('search-whatsapp-float.css'),js=read('search-whatsapp-float.js');
 assert.match(css,/body\.reference-storefront > header \.header-search button/);
 assert.match(css,/width: 36px !important/);
 assert.match(css,/max-width: 258px !important/);
 assert.match(css,/height: 42px !important/);
 assert.match(css,/bottom: calc\(72px \+ env\(safe-area-inset-bottom, 0px\)\)/);
 assert.match(css,/min-height: 44px !important/);
 assert.match(css,/prefers-reduced-motion: reduce/);
 assert.match(js,/document\.body\.appendChild\(link\)/);
 assert.match(js,/link\.replaceChildren\(icon,text\)/);
 assert.doesNotMatch(js,/fetch\(|openDrawer\(|localStorage|supabase|checkout/);
});
