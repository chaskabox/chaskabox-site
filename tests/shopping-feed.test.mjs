import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/shopping-feed.js';
const context = { env: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' } };
const IMG = 'https://jtvswuvnasqqzrjysgfd.supabase.co/storage/v1/object/public/product-media/products/2026/10/fixture.png';
const rows = [
  { id: 155, name: 'Winner | Dakar Chatni Balls - Pack Of 25', brand: 'Winner', pack: 'Pack of 25', price: 199, description: 'Tangy chatni balls in a pack of 25.', image_url: IMG, stock_state: 'sourced_after_order' },
  { id: 302, name: 'Hilal | Cupkake Double Chocolate', brand: 'Hilal', pack: 'Pack of 12', price: 655, description: 'Chocolate cake cups.', image_url: IMG, stock_state: 'unavailable' },
  { id: 300, name: 'Priceless Fixture', brand: 'Fixture', pack: 'Pack of 1', price: 0, description: 'No price.', image_url: IMG, stock_state: 'available' },
  { id: 301, name: 'Imageless Fixture', brand: 'Fixture', pack: 'Pack of 1', price: 100, description: 'No photo.', image_url: null, stock_state: 'available' },
];
test('shopping feed lists priced products with images and maps availability honestly', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json(rows);
  try {
    const r = await onRequestGet(context), xml = await r.text();
    assert.equal(r.status, 200);
    assert.equal((xml.match(/<item>/g) || []).length, 2);
    assert.match(xml, /<g:id>155<\/g:id>/);
    assert.match(xml, /<g:price>199\.00 PKR<\/g:price>/);
    assert.match(xml, /<g:availability>backorder<\/g:availability>/);
    assert.match(xml, /<g:id>302<\/g:id>/);
    assert.match(xml, /<g:availability>out_of_stock<\/g:availability>/);
    assert.doesNotMatch(xml, /<g:id>300<\/g:id>/);
    assert.doesNotMatch(xml, /<g:id>301<\/g:id>/);
    assert.match(xml, /<g:brand>Winner<\/g:brand>/);
    assert.match(xml, /xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0"/);
    assert.equal(r.headers.get('Cache-Control'), 'public,max-age=300');
  } finally { globalThis.fetch = original; }
});
test('shopping feed returns an unavailable feed without caching an empty success', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('Outage', { status: 503 });
  try {
    const r = await onRequestGet(context);
    assert.equal(r.status, 503);
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
  } finally { globalThis.fetch = original; }
});
