import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,base),'utf8');
const entryPages=["index.html","shop/index.html","brands/index.html","bundles/index.html","about/index.html","contact/index.html","category/betel-nuts-and-pan-masala/index.html","category/biscuits-and-wafers/index.html","category/bunties-and-cakes/index.html","category/chews-and-gums/index.html","category/chocolates-and-candies/index.html","category/imli-and-ice-lollies/index.html","category/jellies-and-marshmallow/index.html","category/snacks-and-nimco/index.html"];
test('header shell and approved hero/category use identical 1380px desktop max width',()=>{
 const css=read('header-one-line.css');
 const page=read('final-homepage.css');
 assert.match(css,/width:\s*calc\(100%\s*-\s*24px\)\s*!important/);
 assert.match(css,/max-width:\s*var\(--cb-width,\s*1380px\)\s*!important/);
 assert.doesNotMatch(css,/max-width:\s*1840px/);
 assert.match(page,/--cb-width:\s*1380px/);
 assert.match(page,/#view-home>\.hero\{[^}]*max-width:\s*var\(--cb-width\)/);
 assert.match(page,/#view-home>\.discover\{[^}]*max-width:\s*var\(--cb-width\)/);
});
test('all public storefront entry templates bust the shared header CSS cache',()=>{
 for(const path of entryPages){
  const s=read(path);
  if(s.includes('storefront-bundle.css'))assert.match(s,/storefront-bundle\.css\?v=20261020-close1/,path);
  else assert.match(s,/header-one-line\.css\?v=20261019-line8/,path);
  assert.doesNotMatch(s,/header-one-line\.css\?v=20261019-line7/,path);
 }
});
test('mobile header and banner assets remain unchanged by the gutter fix',()=>{
 const css=read('header-one-line.css');
 assert.match(css,/@media\s*\(max-width:\s*760px\)/);
 const home=read('index.html');
 assert.match(home,/data-hero-dot="0"/);
 assert.match(home,/data-hero-dot="1"/);
 assert.match(home,/data-hero-dot="2"/);
 assert.match(home,/approved-category-sprite-hq-20261018.webp/);
});
