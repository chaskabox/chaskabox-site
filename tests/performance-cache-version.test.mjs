import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const pages=['index.html','shop/index.html','bundles/index.html','brands/index.html'];
for(const slug of ['betel-nuts-and-pan-masala','biscuits-and-wafers','bunties-and-cakes','chews-and-gums','chocolates-and-candies','imli-and-ice-lollies','jellies-and-marshmallow','snacks-and-nimco'])pages.push('category/'+slug+'/index.html');
test('all storefront entry routes load the same versioned UX application and carousel',()=>{
  for(const path of pages){
    const html=readFileSync(new URL(path,root),'utf8');
    assert.match(html,/\/styles\.css\?v=20261017-approvedbrand/,path);
    assert.match(html,/\/app\.js\?v=20261017-approvedbrand/,path);
    assert.match(html,/\/storefront-ux-refresh\.css\?v=20261017-p[12]/,path);
    assert.match(html,/\/home-hero-carousel\.css\?v=20261017-p2/,path);
    assert.match(html,/\/home-hero-carousel\.js\?v=20261017-reference/,path);
    assert.doesNotMatch(html,/\/(?:styles\.css|app\.js)\?v=20261012-release\?v=/,path);
  }
});
