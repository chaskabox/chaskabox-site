import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Storefront shop category rail only uses actual available catalogue categories',()=>{
 const source=read('app.js'),css=read('styles.css'),shop=read('shop/index.html'),home=read('index.html');
 for(const html of [home,shop])assert.match(html,/<nav class="shop-category-rail" id="shopCategoryRail" aria-label="Browse snack categories"/);
 assert.match(source,/function renderShopCategoryRail\(\)/);
 assert.match(source,/const products=publicProducts\(\)/);
 assert.match(source,/totals\.has\(c\)/);
 assert.match(source,/document\.createElement\('a'\)/);
 assert.match(source,/link\.href=categoryPath\(cat\)/);
 assert.match(source,/renderShopCategoryRail\(\);\s*const html=filterPanelHTML\(\)/);
 assert.match(css,/\.shop-category-rail a:focus-visible/);
 assert.match(css,/@media\(max-width:680px\)/);
});
test('Product search now covers brands and categories, and empty searches have recovery actions',()=>{
 const s=read('app.js');
 assert.match(s,/getBrand\(p\),p\.desc/);
 assert.match(s,/if\(shopState\.q\)h\+=/);
 assert.match(s,/Remove search filter/);
 assert.match(s,/Clear filters &amp; search/);
 assert.match(s,/Browse all snacks/);
 assert.match(s,/Search suggestions unavailable/);
});
test('Storefront admin controls open authorized real editors, never publish on shortcut',()=>{
 const live=read('admin.html'),demo=read('admin-v4-demo.html'),script=read('admin-storefront-controls.js');
 for(const html of [live,demo]){
  assert.match(html,/id="storefrontControlTitle"/);
  for(const key of ['homepage','navigation','theme','categories','products','media'])
    assert.match(html,new RegExp('data-storefront-editor="'+key+'"'));
  assert.match(html,/admin-storefront-controls\.js\?v=20261017-controls1/);
 }
 assert.match(live,/data-storefront-route="\/shop\/"/);
 assert.match(script,/if\(!authorized\(\)\)/);
 assert.match(script,/getAttribute\('aria-hidden'\)==='true'/);
 assert.match(script,/target\.click\(\)/);
 assert.match(script,/picker\.dispatchEvent\(new Event\('change'/);
 assert.doesNotMatch(script,/fetch\(|\/api\/admin\/|method:\s*['"]POST|publish\(|theme_settings/);
});
test('Theme visual preview stays isolated in an iframe and does not write to store',()=>{
 const js=read('admin-live.js'),styles=read('admin.css');
 const start=js.indexOf('  async function previewTheme(){'),end=js.indexOf('  /* ============ COUPONS',start);
 assert.ok(start>0&&end>start);
 const functionText=js.slice(start,end);
 assert.match(functionText,/validateTheme\(collectTheme\(\)\)/);
 assert.match(functionText,/frame\.contentDocument/);
 assert.match(functionText,/frame\.onload=apply/);
 assert.match(functionText,/frame\.src=src/);
 assert.match(functionText,/themePreviewSize/);
 assert.match(functionText,/Close unsaved preview/);
 assert.doesNotMatch(functionText,/method:\s*['"](?:PUT|POST|PATCH)|api\('/);
 assert.match(styles,/\.admin-theme-frame iframe/);
});
