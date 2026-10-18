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

test('nostalgic hero uses the approved snack-filled box visual without faking individual product listings',()=>{
  assert.match(root,/hero-editorial-20261018\.css/);
  assert.match(root,/<section class="hero hero-editorial hero-packing-preview"/);
  assert.match(root,/<img class="hero-scene"[^>]*hero-approved-brand-polish-20261017\.webp"[^>]*fetchpriority="high"/);
  assert.match(root,/Illustrative hero artwork/);
  assert.doesNotMatch(root,/data-home-preload/);
  const shop=routeShell(root,'shop');
  assert.match(shop,/id="view-shop"/);
  assert.match(shop,/id="view-home"/);
});
