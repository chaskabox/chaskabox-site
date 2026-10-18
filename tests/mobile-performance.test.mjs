import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('initial storefront scripts download without blocking HTML parsing in document order',()=>{
 const scripts=[...index.matchAll(/<script\s+defer\s+src="([^"]+)"/g)].map(x=>x[1]);
 // Auth SDK is now loaded on demand: only small local dependencies block startup.
 assert.ok(!scripts.some(s=>s.includes('@supabase/supabase-js@')));
 assert.ok(scripts.some(s=>s.startsWith('/app.js?')));
 const config=scripts.findIndex(s=>s.startsWith('/supabase-config.js?'));
 const appIndex=scripts.findIndex(s=>s.startsWith('/app.js?'));
 assert.ok(config>=0 && config<appIndex);
 const cfg=readFileSync(new URL('../supabase-config.js',import.meta.url),'utf8');
 assert.match(cfg,/function loadSupabaseSdk\(\)/);
 assert.match(cfg,/script\.async=true/);
 assert.match(index,/<img src="\/images\/logo-approved-footer-20261017\.png"[^>]+loading="lazy"/);
});

test('homepage does not refetch CMS and render hero products twice per route',()=>{
 const start=app.indexOf('function renderHomeRoute()');
 const end=app.indexOf('function renderShopRoute()',start);
 assert.ok(start>0&&end>start);
 const route=app.slice(start,end);
 assert.equal((route.match(/renderHomeContent\(\)/g)||[]).length,1);
 assert.doesNotMatch(route,/loadStorefrontConfig\(\)/);
});

test('hero image priorities reserve square space and delay nonessential downloads',()=>{
 assert.match(app,/width="150" height="150"/);
 assert.match(app,/loading="lazy" fetchpriority="low"/);
 assert.doesNotMatch(app,/width="150" height="150" loading="\$\{i===0\?'eager'/);
});

test('homepage has a stable fallback order while explicit CMS ordering takes priority',()=>{
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 assert.match(css,/#view-home\s*>\s*\.hero\s*\{\s*order:-100\s*\}/);
 assert.match(app,/el\.style\.setProperty\('order',String\(row\.position\*10\),'important'\)/);
});
