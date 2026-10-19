import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SEO_CATEGORIES} from '../functions/api/_lib/catalogue-content.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const homeTitle='Pakistani Snacks Online | ChaskaBox Pakistan';
const homeDesc='Explore Pakistani childhood snacks, biscuits, candies, nimco and Chaska Boxes. Compare brands, pack sizes and prices, with delivery across Pakistan.';
const shopTitle='Buy Pakistani Snacks Online | ChaskaBox Shop';
const shopDesc='Browse packaged Pakistani snacks by category and brand. Compare biscuits, candies, nimco, jellies and Chaska Boxes, with current pack sizes and prices.';
const brandDesc='Browse snack brands with public products at ChaskaBox, including Hilal, Mayfair, Candyland and Giggly. Compare listed packs and current prices.';

const meta=(html,selector)=>{if(selector==='title')return html.match(/<title>([^<]+)<\/title>/)?.[1];return html.match(new RegExp('<meta '+selector+' content="([^"]+)">'))?.[1];};

test('homepage canonical and metadata target distinct branded Pakistani-snacks intent',()=>{
 const home=read('index.html'),client=read('app.js');
 assert.equal(meta(home,'title'),homeTitle);
 assert.equal(meta(home,'name="description"'),homeDesc);
 assert.equal(meta(home,'property="og:description"'),homeDesc);
 assert.match(home,/<link rel="canonical" href="https:\/\/chaskabox.online\/"/);
 assert.match(client,/setPageMeta\('Pakistani Snacks Online \| ChaskaBox Pakistan','\/',false,/);
 assert.match(client,/Explore Pakistani childhood snacks, biscuits, candies, nimco and Chaska Boxes/);
 assert.match(home,/<h1>Bachpan Ka Zaiqa,/);
 assert.equal((home.match(/data-hero-dot/g)||[]).length,3,'approved carousel has three slide controls');
 assert.equal((home.match(/class="hero-scene"/g)||[]).length,1,'carousel lazy-loads other scenes; no duplicate eager hero images');
 assert.doesNotMatch(home.slice(0,2500),/4-7 day delivery/);
});

test('shop server, static and client titles/descriptions remain in lockstep',()=>{
 const shop=read('shop/index.html'),client=read('app.js');
 assert.equal(meta(shop,'title'),shopTitle);
 assert.equal(meta(shop,'name="description"'),shopDesc);
 assert.equal(meta(shop,'property="og:description"'),shopDesc);
 assert.equal(SEO_CATEGORIES.shop.title,shopTitle);
 assert.equal(SEO_CATEGORIES.shop.description,shopDesc);
 assert.ok(client.includes('"title":"'+shopTitle+'"'));
 assert.ok(client.includes('"description":"'+shopDesc+'"'));
 assert.notEqual(meta(shop,'title'),meta(read('index.html'),'title'));
 assert.match(shop,/<link rel="canonical" href="https:\/\/chaskabox.online\/shop\/"/);
});

test('public brand metadata cannot advertise Kolson or unconditional payment options',()=>{
 const brands=read('brands/index.html'),client=read('app.js');
 assert.equal(meta(brands,'name="description"'),brandDesc);
 assert.equal(meta(brands,'property="og:description"'),brandDesc);
 assert.ok(client.includes("setPageMeta('Pakistani Snack Brands | ChaskaBox','/brands/',false,'"+brandDesc+"')"));
 const head=brands.slice(0,1500);
 assert.doesNotMatch(head,/Kolson|COD across Pakistan/);
 assert.match(brands,/<link rel="canonical" href="https:\/\/chaskabox.online\/brands\/"/);
});

test('SEO edits preserve policy, shopping, brand and product boundary',()=>{
 const home=read('index.html'),shop=read('shop/index.html');
 assert.match(home,/href="\/faq\/"/);
 assert.match(home,/href="\/bundles\/"/);
 assert.match(shop,/href="\/product\/\d+\/"/);
 assert.match(shop,/id="shopGrid"/);
 assert.match(read('robots.txt'),/Sitemap: https:\/\/chaskabox.online\/api\/product-sitemap/);
 const page=read('functions/api/_lib/catalogue-page.js');
 assert.match(page,/noindex:rows.length===0/);
 assert.match(page,/publicCatalogue\(context.env\)/);
});
