import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('Cloudflare homepage does not install global DOM mutation polling',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/new MutationObserver\(rm\)/);
 assert.doesNotMatch(html,/setInterval\(rm,2000\)/);
 assert.match(html,/id="view-home"/);
});

test('initial product thumbnails use the same responsive assets as hydrated content',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const variants=JSON.parse(readFileSync(new URL('../image-variants.json',import.meta.url),'utf8'));
 let checked=0;
 for(const [,tag]of html.matchAll(/(<img\b[^>]*>)/g)){
  const src=/\bsrc="([^"]+)"/.exec(tag)?.[1];
  if(!src?.startsWith('/images/optimized-'))continue;
  assert.match(tag,/\bsrcset="/);
  assert.match(tag,/\bsizes="/);
  checked++;
 }
 assert.ok(checked>=40,'Static home must not download original catalogue images before hydration');
 for(const src of Object.keys(variants))assert.ok(!html.includes('src="/'+src+'"'),'Unresponsive original: '+src);
 assert.match(html,/<img class="cb-offer-art"[^>]*loading="lazy"/);
 const css=readFileSync(new URL('../final-homepage.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/\.cb-offer-box\{[^}]*url\(/);
 assert.ok(html.indexOf('/storefront-bundle.css')<html.indexOf('<title>'),'Critical stylesheet is discovered before copy-dependent metadata');
 assert.ok(html.indexOf('as="image" href="/images/chaskabox-approved-hero-01')<html.indexOf('<title>'),'LCP art is discovered before copy-dependent metadata');
});
