import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const category=['betel-nuts-and-pan-masala','biscuits-and-wafers','bunties-and-cakes','chews-and-gums','chocolates-and-candies','imli-and-ice-lollies','jellies-and-marshmallow','snacks-and-nimco'];
const pages=['index.html','shop/index.html','bundles/index.html','brands/index.html','about/index.html','contact/index.html',...category.map(x=>'category/'+x+'/index.html')];
test('Brand dropdown and WhatsApp beside Chaska AI load on all 14 routes',()=>{
 for(const path of pages){
  const html=read(path);
  assert.match(html,/brands-header-dropdown\.css\?v=20261019-brand1/,path);
  assert.match(html,/brands-header-dropdown\.js\?v=20261019-brand2/,path);
 }
});
test('Brand list uses live product availability and existing brand detail routes',()=>{
 const js=read('brands-header-dropdown.js'),css=read('brands-header-dropdown.css');
 assert.match(js,/typeof fetchBrands==='function'/);
 assert.match(js,/Number\(b\.productCount\)>0/);
 assert.match(js,/encodeURIComponent\(brand\.slug\)/);
 assert.match(js,/View all brands/);
 assert.match(js,/e\.key==='Escape'/);
 assert.match(js,/popup\.hidden=true/);
 assert.match(js,/document\.body\.append\(popup\)/);
 assert.match(css,/#?cbx-brands-popover|\.cbx-brands-popover/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\.cbx-brands-popover\[hidden\]/);
});
test('WhatsApp only shows icon beside AI while retaining original configurable link',()=>{
 const js=read('brands-header-dropdown.js'),css=read('brands-header-dropdown.css');
 assert.match(js,/\.cbx-whatsapp-float/);
 assert.match(js,/\#helpFab/);
 assert.match(js,/--cb-wa-right/);
 assert.match(js,/--cb-wa-bottom/);
 assert.match(css,/\.cbx-wa-caption\{display:none!important\}/);
 assert.match(css,/width:46px!important/);
 assert.doesNotMatch(js,/fetch\('|fetch\("|openDrawer|checkout|supabase|localStorage/);
});
