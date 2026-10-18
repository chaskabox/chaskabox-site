import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validLastmod,sitemapPublicBrands} from '../functions/api/_lib/sitemap-helpers.js';
import {productSchema,stockAvailability} from '../functions/api/_lib/seo.js';

const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('sitemap lastmod only uses actual calendar-valid modified dates',()=>{
 assert.equal(validLastmod('2026-10-16T05:03:22+00:00'),'2026-10-16');
 assert.equal(validLastmod('2026-02-29T10:00:00Z'),'');
 assert.equal(validLastmod('2024-02-29T10:00:00Z'),'2024-02-29');
 assert.equal(validLastmod('2026-13-01'),'');
 assert.equal(validLastmod('not-a-date'),'');
 assert.equal(validLastmod(''),'');
});

test('sitemap only includes distinct, public brands with a public product',()=>{
 const products=[{id:1,brand:'  HILAL  '},{id:2,brand:'Candyland'},{id:3,brand:''}];
 const brands=[{name:'Hilal',slug:'hilal'},{name:'Candyland',slug:'candyland'},{name:'Kolson',slug:'kolson'},{name:'Hilal',slug:'hilal'},{name:'Broken',slug:'javascript:bad'}];
 assert.deepEqual(sitemapPublicBrands(products,brands).map(x=>x.slug),['hilal','candyland']);
});

test('sourced_after_order never becomes InStock, missing brand never receives invented brand',()=>{
 assert.equal(stockAvailability('sourced_after_order'),null);
 assert.equal(stockAvailability('available'),'https://schema.org/InStock');
 const s=productSchema({id:233,name:'Top Pops',price:750,brand:'',stock_state:'sourced_after_order'},'https://chaskabox.online/product/233/','');
 assert.equal(s.brand,undefined);
 assert.equal(s.offers.availability,undefined);
 assert.equal(s.offers.price,'750');
});

test('shared static pages do not ship obsolete keywords or advertise unlisted Kolson stock',()=>{
 const paths=['index.html','shop/index.html','brands/index.html','brand/index.html','bundles/index.html',
 'category/betel-nuts-and-pan-masala/index.html','category/biscuits-and-wafers/index.html',
 'category/bunties-and-cakes/index.html','category/chews-and-gums/index.html',
 'category/chocolates-and-candies/index.html','category/imli-and-ice-lollies/index.html',
 'category/jellies-and-marshmallow/index.html','category/snacks-and-nimco/index.html'];
 for(const p of paths)assert.doesNotMatch(file(p),/<meta name="keywords"/i,p);
 assert.doesNotMatch(file('index.html'),/<meta name="description"[^>]*Kolson/i);
 const robots=file('robots.txt');
 assert.match(robots,/Sitemap: https:\/\/chaskabox.online\/sitemap.xml/);
 assert.match(robots,/Sitemap: https:\/\/chaskabox.online\/api\/product-sitemap/);
 assert.match(file('sitemap.xml'),/https:\/\/chaskabox.online\/brands\//);
});

test('client-side product schema avoids brand guesses',()=>{
 const js=file('app.js');
 assert.doesNotMatch(js,/name:p\.brand\|\|'ChaskaBox'/);
 assert.match(js,/Not specified/);
});
