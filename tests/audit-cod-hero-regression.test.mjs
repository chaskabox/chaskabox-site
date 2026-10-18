import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routeShell} from '../functions/api/_lib/storefront-html.js';

const root=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../site-runtime.js',import.meta.url),'utf8');

test('mandatory COD advance is disclosed on all primary shopping explanations',()=>{
  assert.doesNotMatch(root,/Pay when it arrives/);
  assert.match(root,/Cash on Delivery available hai\?/);
  assert.ok((root.match(/data-cod-advance-note/g)||[]).length>=4);
  assert.match(root,/advance order ke baad aur dispatch se pehle verify hota hai/);
  assert.match(root,/Yeh order total mein adjust hota hai/);
});

test('public COD amount follows owner settings rather than hardcoded marketing values',()=>{
  assert.match(runtime,/s\.cod_advance_amount_pkr/);
  assert.match(runtime,/s\.cod_advance_enabled!==false/);
  assert.match(runtime,/data-cod-advance-amount/);
  assert.match(runtime,/data-cod-advance-note/);
});

test('three approved hero assets preserve their reference compositions and consistent trust disclosures',()=>{
  assert.match(readFileSync(new URL('../storefront-bundle.css',import.meta.url),'utf8'),/hero-editorial-20261018\.css/);
  assert.match(readFileSync(new URL('../storefront-bundle.css',import.meta.url),'utf8'),/hero-three-approved-20261018\.css/);
  assert.match(root,/<section class="hero hero-editorial hero-packing-preview hero-approved-three"/);
  assert.match(root,/<img class="hero-scene"[^>]*chaskabox-approved-hero-01-20261018\.avif"[^>]*fetchpriority="high"/);
  const slider=readFileSync(new URL('../home-hero-carousel.js',import.meta.url),'utf8');
  for(const i of ['01','02','03'])assert.ok(slider.includes('chaskabox-approved-hero-'+i+'-20261018.avif'));
  for(const title of ['Original Brands','Carefully Sourced','Nationwide Delivery','Cash on Delivery'])assert.match(root,new RegExp(title));
  assert.match(root,/Illustrative hero artwork/);
  const shop=routeShell(root,'shop');
  assert.match(shop,/id="view-shop"/);
});

test('non-home route shells keep approved hero art dormant until home is visited',()=>{
 for(const route of ['shop','brand','product','account']){
  const html=routeShell(root,route);
  assert.doesNotMatch(html,/<link\b[^>]*data-home-preload/);
  const scene=html.match(/<img\b[^>]*class="hero-scene"[^>]*>/)?.[0];
  assert.ok(scene,'Approved hero remains available for client navigation');
  assert.match(scene,/chaskabox-approved-hero-01-20261018\.avif/);
  assert.match(scene,/loading="lazy"/);
  assert.match(scene,/fetchpriority="low"/);
 }
 const home=routeShell(root,'home');
 assert.match(home,/<link\b[^>]*data-home-preload/);
 assert.match(home,/<img\b[^>]*class="hero-scene"[^>]*fetchpriority="high"/);
});
