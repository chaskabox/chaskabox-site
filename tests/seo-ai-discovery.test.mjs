import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rankProducts } from '../functions/api/_lib/catalogue-search.js';

test('semantic-only matches are reachable but still obey price, inventory and visibility gates', () => {
  const rows = [
    { id: 1, name: 'Sweet Pack', brand: 'Fixture', category: 'Snacks & Nimco', price: 350, stock_state: 'available', visibility: 'visible', tags: [] },
    { id: 2, name: 'Crispy Pack', brand: 'Fixture', category: 'Snacks & Nimco', price: 250, stock_state: 'unavailable', visibility: 'visible', tags: [] },
    { id: 3, name: 'Crunch Pack', brand: 'Fixture', category: 'Snacks & Nimco', price: 700, stock_state: 'available', visibility: 'visible', tags: [] },
    { id: 4, name: 'Hidden Pack', brand: 'Fixture', category: 'Snacks & Nimco', price: 200, stock_state: 'available', visibility: 'hidden', tags: [] },
  ];
  const q = 'movie marathon picks under 500';
  assert.deepEqual(rankProducts(rows, q).map(p => p.id), []);
  assert.deepEqual(rankProducts(rows, q, [
    { id: 1, similarity: .88 }, { id: 2, similarity: .96 },
    { id: 3, similarity: .95 }, { id: 4, similarity: .99 },
  ]).map(p => p.id), [1]);
  assert.deepEqual(rankProducts(rows, q, [{ id: 1, similarity: .39 }]).map(p => p.id), []);
});

test('static sitemap includes actual FAQ answer page and public AI directory links', async () => {
  const sitemap = await readFile(new URL('../sitemap.xml', import.meta.url), 'utf8');
  const directory = await readFile(new URL('../llms.txt', import.meta.url), 'utf8');
  assert.match(sitemap, /<loc>https:\/\/chaskabox\.online\/faq\/<\/loc>/);
  for (const route of ['/shop/', '/faq/', '/shipping-policy/', '/refund-policy/', '/guides/']) {
    assert.ok(directory.includes('https://chaskabox.online' + route), route);
  }
  assert.doesNotMatch(directory, /guaranteed|instant delivery|always in stock/i);
});
