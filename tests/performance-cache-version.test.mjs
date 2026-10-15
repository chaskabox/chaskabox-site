import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const pages=['index.html','shop/index.html','bundles/index.html','brands/index.html'];
for(const slug of ['betel-nuts-and-pan-masala','biscuits-and-wafers','bunties-and-cakes','chews-and-gums','chocolates-and-candies','imli-and-ice-lollies','jellies-and-marshmallow','snacks-and-nimco'])pages.push('category/'+slug+'/index.html');
test('main storefront entries use versioned performance CSS and JS',()=>{for(const path of pages){const html=readFileSync(new URL(path,root),'utf8');const version=path==='index.html'?'header-promo-v1':'shopping-recheck';assert.match(html,new RegExp('/styles\\.css\\?v=20261015-'+version),path);assert.match(html,new RegExp('/app\\.js\\?v=20261015-'+version),path);assert.doesNotMatch(html,/\/(?:styles\.css|app\.js)\?v=20261012-release\?v=/,path);}});
