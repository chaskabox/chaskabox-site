import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {relatedCategoryLinks,catalogueDiscoveryNav} from '../functions/api/_lib/catalogue-discovery.js';
const rows=[
 {id:1,category:'Biscuits & Wafers',name:'Fixture biscuit',is_bundle:false},
 {id:2,category:'Snacks & Nimco',name:'Fixture nimco',is_bundle:false},
 {id:3,category:'Chocolates & Candies',name:'Fixture sweet',is_bundle:false},
 {id:4,category:'Biscuits & Wafers',name:'Fixture biscuit box',is_bundle:true}
];
test('related categories list only nonempty public categories and omit current category',()=>{
 const links=relatedCategoryLinks(rows,'biscuits-and-wafers');
 assert.ok(links.every(x=>x.slug!=='biscuits-and-wafers'));
 assert.ok(links.some(x=>x.slug==='snacks-and-nimco'));
 assert.ok(!links.some(x=>x.slug==='betel-nuts-and-pan-masala'));
 assert.ok(links.every(x=>x.count===1));
});
test('crawlable nav uses named category paths and no fabricated product claims',()=>{
 const html=catalogueDiscoveryNav(rows);
 assert.match(html,/aria-label="Browse other snack categories"/);
 assert.match(html,/<a href="\/category\/biscuits-and-wafers\/">Biscuits &amp; Wafers<\/a>/);
 assert.match(html,/href="\/brands\/"/);
 assert.doesNotMatch(html,/InStock|guaranteed|best seller/i);
 assert.equal(catalogueDiscoveryNav([]),'');
});
test('homepage approved hero and existing category-discovery navigation remain intact',()=>{
 const s=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.equal((s.match(/data-hero-dot="\\d+"/g)||[]).length,3);
 assert.match(s,/id="catTiles"/);
 for(const link of ['/shop/','/category/biscuits-and-wafers/','/category/chocolates-and-candies/','/category/snacks-and-nimco/','/bundles/'])assert.ok(s.includes('href="'+link+'"'),link);
 assert.doesNotMatch(s,/pakistani-snacks-guide/);
});
test('SSR collection injects links without injecting on empty collections',()=>{
 const s=readFileSync(new URL('../functions/api/_lib/catalogue-page.js',import.meta.url),'utf8');
 assert.match(s,/if\(rows\.length>0\)/);
 assert.match(s,/catalogueDiscoveryNav\(all,kind==='category'\?slug:''\)/);
 assert.match(s,/noindex:rows\.length===0/);
});
