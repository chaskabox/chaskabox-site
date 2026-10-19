import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const categories=['betel-nuts-and-pan-masala','biscuits-and-wafers','bunties-and-cakes',
 'chews-and-gums','chocolates-and-candies','imli-and-ice-lollies','jellies-and-marshmallow','snacks-and-nimco'];
const pages=['index.html','shop/index.html','bundles/index.html','brands/index.html',
 ...categories.map(slug=>'category/'+slug+'/index.html'),'about/index.html','contact/index.html'];
test('all 14 public HTML entries use the same sticky header stylesheet',()=>{
 for(const path of pages){
  const html=read(path);
  assert.match(html,/sticky-motion-polish\.css\?v=20261019-sticky1/,path);
  assert.match(html,/<header(?:\s|>)/,path);
 }
});
test('sticky header remains below modal overlay and motion effects respect preferences',()=>{
 const css=read('sticky-motion-polish.css');
 assert.match(css,/body\.reference-storefront > header\s*\{[^}]*position:\s*sticky\s*!important/s);
 assert.match(css,/top:\s*0\s*!important/);
 assert.match(css,/z-index:\s*85\s*!important/);
 assert.match(css,/prefers-reduced-motion:\s*reduce/);
 assert.match(css,/hover:\s*none/);
 assert.match(css,/hero-slider-controls button\[data-hero-dot\]/);
 assert.doesNotMatch(css,/@keyframes|setInterval|backdrop-filter/);
});
