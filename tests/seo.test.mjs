import test from 'node:test';
import assert from 'node:assert/strict';
import { productImage, stockAvailability, productSchema, breadcrumbSchema, CATEGORY_PATHS } from '../functions/api/_lib/seo.js';

test('product image URLs are absolute and local assets are verified', () => {
  const known = new Set(['images/p55.webp']);
  assert.equal(productImage('images/p55.webp', known), 'https://chaskabox.online/images/p55.webp');
  assert.equal(productImage('/images/p55.webp', known), 'https://chaskabox.online/images/p55.webp');
  assert.equal(productImage('images/missing.webp', known), '');
  assert.equal(productImage('http://example.com/a.jpg', known), '');
  assert.equal(productImage('javascript:alert(1)', known), '');
  assert.equal(productImage('https://example.com/a.jpg', known), 'https://example.com/a.jpg');
});

test('no invented inventory availability for products sourced after order', () => {
  assert.equal(stockAvailability('available'), 'https://schema.org/InStock');
  assert.equal(stockAvailability('limited'), 'https://schema.org/LimitedAvailability');
  assert.equal(stockAvailability('unavailable'), 'https://schema.org/OutOfStock');
  assert.equal(stockAvailability('sourced_after_order'), null);
  assert.equal(stockAvailability(undefined), null);
});

test('product JSON-LD uses real price, brand, image and id', () => {
  const p={id:55,name:'Sample Chocolate',price:499,brand:'Mayfair',category:'Chocolates & Candies',description:'Chocolate pack.',stock_state:'sourced_after_order'};
  const url='https://chaskabox.online/product/55/';
  const schema=productSchema(p,url,'https://chaskabox.online/images/p55.webp');
  assert.equal(schema['@type'],'Product');
  assert.equal(schema.offers.price,'499');
  assert.equal(schema.offers.priceCurrency,'PKR');
  assert.equal(schema.offers.availability,undefined);
  assert.equal(schema.brand.name,'Mayfair');
  assert.deepEqual(schema.image,['https://chaskabox.online/images/p55.webp']);
  assert.equal(schema.url,url);
  const crumb=breadcrumbSchema(p,url);
  assert.equal(crumb.itemListElement[1].item,'https://chaskabox.online'+CATEGORY_PATHS['Chocolates & Candies']);
  assert.equal(crumb.itemListElement[2].item,url);
});

test('invalid price does not generate an Offer', () => {
  assert.equal(productSchema({id:1,name:'Sample',price:'not-a-price'}, 'https://chaskabox.online/product/1/', '').offers,undefined);
});
