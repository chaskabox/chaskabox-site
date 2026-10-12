import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const pages=['index.html','shop/index.html','bundles/index.html','brands/index.html'];
for(const slug of ['betel-nuts-and-pan-masala','biscuits-and-wafers','bunties-and-cakes','chews-and-gums','chocolates-and-candies','imli-and-ice-lollies','jellies-and-marshmallow','snacks-and-nimco'])pages.push('category/'+slug+'/index.html');
test('main storefront entries use versioned performance CSS and JS',()=>{for(const path of pages){const html=readFileSync(new URL(path,root),'utf8');assert.match(html,/\/styles\.css\?v=20261012-perf2/,path);assert.match(html,/\/app\.js\?v=20261012-perf2/,path);assert.doesNotMatch(html,/release\?v=/,path);}});
