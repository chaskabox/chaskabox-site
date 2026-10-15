import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = new URL('../', import.meta.url);
const css = readFileSync(new URL('styles.css', root), 'utf8');

test('rotating promo stays above the sticky header and never overlaps it', () => {
  assert.match(css, /:root\s*\{--sticky-promo-height:36px\}/);
  assert.match(css, /\.promo\s*\{[^}]*position:sticky;top:0;z-index:51;[^}]*height:var\(--sticky-promo-height\)/);
  assert.match(css, /\.promo:not\(\[hidden\]\)\s*\+\s*header\s*\{top:var\(--sticky-promo-height\)\}/);
  assert.match(css, /header\s*\{position:sticky;top:0;z-index:50/);
});

test('owner-disabled promo restores the header to the top and never takes space', () => {
  assert.match(css, /\.promo\[hidden\]\s*\{display:none!important\}/);
  const runtime = readFileSync(new URL('site-runtime.js', root), 'utf8');
  assert.match(runtime, /announcement_enabled==='false'\|\|section\?\.enabled===false/);
});

test('all main storefront entries keep the promo immediately before the header', () => {
  for (const file of ['index.html', 'shop/index.html', 'brands/index.html', 'bundles/index.html']) {
    const html = readFileSync(new URL(file, root), 'utf8');
    assert.match(html, /<div class="promo"[^>]*>[\s\S]*?<\/div>\s*<header>/, file);
  }
});

test('long mobile promo text is clipped and reduced motion stays respected', () => {
  assert.match(css, /\.promo-desktop,\.promo-mobile\s*\{[^}]*text-overflow:ellipsis;white-space:nowrap/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\s*\{\s*\.promo-desktop,\.promo-mobile\s*\{transition:none\}/);
});
