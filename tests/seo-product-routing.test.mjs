import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);

test('live product routes have one authoritative server-rendered source', () => {
  const files = readdirSync(new URL('product/', root));
  assert.deepEqual(files.filter(x => /^\d+$/.test(x)), [], 'pre-generated product HTML must not shadow DB-backed Function');
  const fn = readFileSync(new URL('functions/product/[[slug]].js', root), 'utf8');
  assert.match(fn, /productSchema\(p,canonical,photo\)/);
  assert.match(fn, /breadcrumbSchema\(p,canonical\)/);
  assert.match(fn, /visibility=eq.visible/);
});

test('robots sitemap and admin SEO health use one dynamic product source', () => {
  const robots = readFileSync(new URL('robots.txt', root), 'utf8');
  assert.match(robots, /Sitemap: https:\/\/chaskabox.online\/api\/product-sitemap/);
  assert.doesNotMatch(robots, /sitemap-products.xml/);
  const admin = readFileSync(new URL('admin-live.js', root), 'utf8');
  assert.match(admin, /Product sitemap \(dynamic\)/);
  assert.doesNotMatch(admin, /Product sitemap \(static\)/);
});
