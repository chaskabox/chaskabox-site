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

test('LCP hero image is prioritized on home but never requested by catalogue SSR shells',()=>{
  assert.match(root,/<link rel="preload" as="image"[^>]+hero-approved-brand-polish-20261017\.webp"[^>]+data-home-preload/);
  const shop=routeShell(root,'shop');
  assert.doesNotMatch(shop,/data-home-preload/);
  assert.match(shop,/id="view-shop"/);
  assert.match(shop,/id="view-home"/);
});
