import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const file=p=>readFileSync(new URL(p,root));
const app=file('app.js').toString('utf8');
const photo='/category-art/betel-nuts-pan-masala-20261021.webp';
test('Betel Nuts & Pan Masala uses dedicated full-cover category photography',()=>{
  assert.match(app,/categoryPhoto=\{'Betel Nuts & Pan Masala':'\/category-art\/betel-nuts-pan-masala-20261021\.webp'\}/);
  assert.match(app,/const inner=photo\?/);
  assert.match(app,/background-size:cover;background-position:center/);
  assert.match(app,/photo\|\|artPos!==undefined\?' ci-approved-art'/);
  assert.ok(app.indexOf('const inner=photo?')<app.indexOf(': featured?'),'custom image must outrank product fallback');
  const picture=file(photo.slice(1));
  assert.equal(picture.toString('ascii',0,4),'RIFF');
  assert.equal(picture.toString('ascii',8,12),'WEBP');
  assert.ok(picture.length<20000,'category photo should be optimized for fast download');
});
test('Homepage entry routes use fresh version of common category renderer',()=>{
  const pages=["index.html","shop/index.html","brands/index.html","bundles/index.html","category/betel-nuts-and-pan-masala/index.html","category/biscuits-and-wafers/index.html","category/bunties-and-cakes/index.html","category/chews-and-gums/index.html","category/chocolates-and-candies/index.html","category/imli-and-ice-lollies/index.html","category/jellies-and-marshmallow/index.html","category/snacks-and-nimco/index.html"];
  for(const page of pages){
    const html=file(page).toString('utf8');
    assert.match(html,/\/app\.js\?v=20261021-pdp1/,page);
    assert.equal((html.match(/<link[^>]*rel="stylesheet"/g)||[]).length,1,page+' must retain one blocking stylesheet');
  }
});
