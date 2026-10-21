import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');
const routes=[
  "index.html",
  "shop/index.html",
  "brands/index.html",
  "bundles/index.html",
  "category/betel-nuts-and-pan-masala/index.html",
  "category/biscuits-and-wafers/index.html",
  "category/bunties-and-cakes/index.html",
  "category/chews-and-gums/index.html",
  "category/chocolates-and-candies/index.html",
  "category/imli-and-ice-lollies/index.html",
  "category/jellies-and-marshmallow/index.html",
  "category/snacks-and-nimco/index.html"
];
test('Original sourced-after-order panel theme loads on all SPA storefront entry pages',()=>{
  for(const path of routes){
    const html=read(path);
    assert.ok(html.includes('<style id="cb-fresh-restore">\n'+read("fresh-promise-restoration.css")+'</style>'), path);
    assert.match(html, /storefront-bundle\.css/, path);
  }
});
test('Theme restores premium layout and accessible nonessential animation',()=>{
  const css=read('fresh-promise-restoration.css');
  for(const selector of ['#market-fresh .freshwrap','#market-fresh .freshhead','#market-fresh .freshlist li','#market-fresh .freshpick','#market-fresh .pickbadge']){
    assert.ok(css.includes(selector),selector);
  }
  assert.match(css,/grid-template-columns:minmax\(0,1\.05fr\) minmax\(0,\.95fr\)/);
  assert.match(css,/animation-timeline:view\(\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/\.pickinfo \.alink \{font-size:13px; color:#963610;\}/);
  assert.match(css,/@media \(max-width:768px\)/);
  const html=read('index.html');
  assert.match(html,/id="market-fresh"/);
  assert.match(html,/id="weeklyPick"/);
  assert.equal((html.match(/class="ficon"/g)||[]).length,4);
});
