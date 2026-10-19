import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routeShell} from '../functions/api/_lib/storefront-html.js';
const root=new URL('../',import.meta.url);
test('Shop server-rendered shell receives exactly one early public-media preconnect',()=>{
 const shell=readFileSync(new URL('index.html',root),'utf8');
 const hint='<link rel="preconnect" href="https://jtvswuvnasqqzrjysgfd.supabase.co" crossorigin>';
 const shop=routeShell(shell,'shop');
 const home=routeShell(shell,'home');
 const pdp=routeShell(shell,'product');
 assert.equal(shop.split(hint).length-1,1);
 assert.ok(shop.indexOf(hint)<shop.indexOf('/app.js?v='));
 assert.equal(home.includes(hint),false);
 assert.equal(pdp.includes(hint),false);
 assert.match(home,/chaskabox-approved-hero-01-20261018\.avif/);
});
