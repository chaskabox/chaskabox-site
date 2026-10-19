import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const pages=['index.html','shop/index.html','bundles/index.html','brands/index.html',
  'about/index.html','contact/index.html',
  ...['biscuits-and-wafers','bunties-and-cakes','chews-and-gums','chocolates-and-candies',
  'imli-and-ice-lollies','jellies-and-marshmallow','snacks-and-nimco','betel-nuts-and-pan-masala']
    .map(slug=>'category/'+slug+'/index.html')];

test('header cart uses consistent branded icon and keeps original actions and item counts',()=>{
  for(const path of pages){
    const html=readFileSync(new URL(path,root),'utf8');
    const carts=[...html.matchAll(/class="cb-bag-icon cb-bag-icon-v2"/g)];
    assert.equal(carts.length,1,path+' should contain exactly one new cart icon');
    assert.match(html,/class="cb-bag-icon cb-bag-icon-v2"[^>]*aria-hidden="true"/,path);
    assert.match(html,/aria-label="Open shopping bag"/,path);
    assert.match(html,/class="cartcount"[^>]*>0<\/span>/,path);
    if(path.startsWith('about/')||path.startsWith('contact/')){
      assert.match(html,/href="\/cart\/" class="hbtn solid"/,path);
    }else{
      assert.match(html,/onclick="openDrawer\(\)" aria-label="Open shopping bag"/,path);
    }
    assert.match(html,/header-discovery-preview\.css\?v=20261019-bag1/,path);
  }
  const css=readFileSync(new URL('../header-discovery-preview.css',import.meta.url),'utf8');
  assert.match(css,/header \.cb-bag-icon-v2/);
  assert.match(css,/width:31px!important/);
  assert.match(css,/prefers-reduced-motion|ChaskaBox brand bag v2/);
});
