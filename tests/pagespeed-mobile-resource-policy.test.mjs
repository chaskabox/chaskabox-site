import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const homepage = await readFile(new URL('index.html', root), 'utf8');
const headers = await readFile(new URL('_headers', root), 'utf8');
const categoryCSS = await readFile(new URL('approved-category-art.css', root), 'utf8');

test('homepage LCP image keeps high priority and is not lazy loaded', () => {
  const hero = homepage.match(/<img class="hero-scene"[^>]*>/)?.[0] || '';
  assert.match(hero, /fetchpriority="high"/);
  assert.doesNotMatch(hero, /loading="lazy"/);
  assert.match(homepage, /rel="preload" as="image" href="\/images\/chaskabox-approved-hero-01-20261018\.avif"/);
});

test('secondary images do not contend explicitly with the LCP image', () => {
  const logo = homepage.match(/<img[^>]*class="logo-img"[^>]*>/)?.[0] || '';
  const offer = homepage.match(/<img class="cb-offer-art"[^>]*>/)?.[0] || '';
  assert.doesNotMatch(logo, /fetchpriority="high"/);
  assert.match(offer, /loading="lazy"/);
  assert.match(offer, /fetchpriority="low"/);
  assert.match(offer, /data-src="\/images\/hero-approved-brand-polish-20261017\.webp"/);
  assert.doesNotMatch(offer, /\\ssrc="/);
  assert.match(homepage, /new IntersectionObserver/);
  assert.match(homepage, /rootMargin: '300px 0px'/);
  assert.match(homepage, /<noscript><img class="cb-offer-art" src="\/images\/hero-approved-brand-polish-20261017\.webp"/);
});

test('all three approved hero controls stay present', () => {
  for (const index of [0, 1, 2]) {
    assert.match(homepage, new RegExp('data-hero-dot="' + index + '"'));
  }
});

test('only non-product assets get new caching rules', () => {
  assert.match(headers, /\/category-art\/approved-category-sprite-hq-20261018\.webp\n  Cache-Control: public, max-age=604800/);
  assert.match(headers, /\/fonts\/\*\n  Cache-Control: public, max-age=2592000/);
  assert.match(headers, /\/images\/\*\n  Cache-Control: public, max-age=86400, immutable/);
  assert.match(headers, /\/checkout\.html\n  Cache-Control: no-store/);
});


test('inlined category artwork CSS matches approved file exactly', () => {
  const inline = homepage.match(/<style id="cb-category-art-critical">([\\s\\S]*?)<\\/style>/)?.[1].trim();
  assert.ok(inline, 'missing inlined category artwork CSS');
  assert.equal(inline, categoryCSS.trim());
  assert.doesNotMatch(homepage, /<link rel="stylesheet" href="\\/approved-category-art\\.css/);
});
