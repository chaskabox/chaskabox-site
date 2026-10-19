import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicCollectionLinks,catalogueNavigation} from '../functions/api/_lib/catalogue-discovery.js';
import {SEO_CATEGORIES} from '../functions/api/_lib/catalogue-content.js';

const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const products=[
 {id:1,category:'Biscuits & Wafers',is_bundle:false},
 {id:2,category:'Snacks & Nimco',is_bundle:false},
 {id:3,category:'Snacks & Nimco',is_bundle:true},
 {id:4,category:'Seasonal Snack Boxes',is_bundle:false},
 {id:5,category:'Betel Nuts & Pan Masala',visibility:'hidden'},
];
const manifest={categories:[
 {name:'Biscuits & Wafers',slug:'biscuits-and-wafers',product_ids:[1]},
 {name:'Snacks & Nimco',slug:'snacks-and-nimco',product_ids:[2,3]},
 {name:'Seasonal Snack Boxes',slug:'seasonal-snacks',product_ids:[4]},
 {name:'Empty category',slug:'no-stock',product_ids:[]},
 {name:'Unsafe path',slug:'../admin',product_ids:[1]}
]};

test('SSR discovery uses public product lists, excludes empty/hidden and invalid CMS slugs',()=>{
 const links=publicCollectionLinks(products,manifest);
 assert.deepEqual(links.map(v=>v.path),[
  '/category/biscuits-and-wafers/',
  '/category/snacks-and-nimco/',
  '/category/seasonal-snacks/',
  '/bundles/'
 ]);
 assert.deepEqual(links.map(v=>v.count),[1,2,1,1]);
 assert.ok(!links.some(v=>/betel|no-stock|\.\.|admin/.test(v.path)));
});

test('SSR category navigation is crawlable with one active canonical link',()=>{
 const html=catalogueNavigation(products,manifest,'/category/snacks-and-nimco/');
 assert.match(html,/id="shopCategoryRail"/);
 assert.match(html,/<a href="\/category\/snacks-and-nimco\/" class="active" aria-current="page">Snacks &amp; Nimco \(2\)<\/a>/);
 assert.match(html,/<a href="\/shop\/">All snacks<\/a>/);
 assert.match(html,/<a href="\/bundles\/">Chaska Boxes \(1\)<\/a>/);
 assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
 assert.doesNotMatch(html,/no-stock|betel-nuts|\.\.\/admin/);
 const shop=catalogueNavigation(products,null,'/shop/');
 assert.match(shop,/<a href="\/shop\/" class="active" aria-current="page">All snacks<\/a>/);
});

test('SSR category shell really contains its visible introduction mount, retained hero and source-driven navigation',()=>{
 const home=file('index.html');
 assert.match(home,/<div id="view-home">[\s\S]*?<section class="hero hero-editorial hero-packing-preview hero-approved-three"/);
 assert.match(home,/<h1>Bachpan Ka Zaiqa,/);
 assert.equal((home.match(/data-hero-dot/g)||[]).length,3);
 const shell=home.slice(home.indexOf('<div id="view-shop"'));
 assert.match(shell,/id="categorySeoIntro"/);
 assert.match(shell,/id="shopCategoryRail"/);
 assert.match(shell,/id="shopHelpPathways"/);
 assert.match(file('functions/api/_lib/catalogue-page.js'),/catalogueNavigation\(all,manifest,path\)/);
 assert.match(file('functions/api/_lib/catalogue-page.js'),/esc\(copy.intro\)/);
 assert.match(home,/<a href="\/guides\/choosing-a-snack-box\/">Choosing a snack pack<\/a>/);
 assert.match(home,/<section aria-labelledby="homeShopDiscovery" style="order:50;width:calc\(100% - 32px\);/);
 assert.match(file('app.js'),/const hasPublicProducts=publicProducts\(\)\.some/);
 assert.match(file('app.js'),/categoryPath\(catName\),!hasPublicProducts/);
});

test('SEO copy matches across server, client, CMS defaults and static fallbacks',()=>{
 const copy='Explore the ChaskaBox catalogue of Pakistani sweets and savory snacks. Browse by category and brand, and compare the displayed pack sizes and prices before ordering.';
 assert.equal(SEO_CATEGORIES.shop.intro,copy);
 for(const p of ['index.html','shop/index.html','app.js','page-copy-defaults.js'])assert.ok(file(p).includes(copy),p);
 assert.doesNotMatch(file('index.html'),/id="categorySeoIntro"[^>]*>[^<]*Filter by category, pack size and price/);
});

test('new navigation cannot include unauthenticated customer, payment or order routes',()=>{
 const nav=catalogueNavigation(products,manifest,'/shop/');
 assert.doesNotMatch(nav,/checkout|admin|order|payment|wa\.me|account/);
});
