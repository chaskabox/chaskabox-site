import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
test('Shop preconnects only to existing public media origin without changing product markup',()=>{
 const shop=readFileSync(new URL('shop/index.html',root),'utf8');
 const home=readFileSync(new URL('index.html',root),'utf8');
 const tag='<link rel="preconnect" href="https://jtvswuvnasqqzrjysgfd.supabase.co" crossorigin>';
 assert.equal(shop.split(tag).length-1,1,'shop should have one public media connection hint');
 assert.ok(shop.indexOf(tag)<shop.indexOf('/app.js?v='),'preconnect must precede hydrated product images');
 assert.ok(shop.includes('<div class="grid" id="shopGrid">'),'shop grid must remain');
 assert.match(home,/chaskabox-approved-hero-01-20261018\.avif/);
 assert.equal(home.includes(tag),false,'approved homepage intentionally unchanged');
});
