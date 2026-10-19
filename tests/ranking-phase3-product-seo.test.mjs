import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {productSchema,stockAvailability,productImage,productPageTitle} from '../functions/api/_lib/seo.js';

const canonical='https://chaskabox.online/product/233/';
const knownPhoto='https://chaskabox.online/images/snacks/example.webp';
const product={id:233,name:'Example biscuit pack',brand:'Example',description:'Example packaged biscuit',price:250,pack:'Pack of 4',stock_state:'sourced_after_order'};

test('published Product Offer identifies valid known PKR price without claiming inventory',()=>{
 const schema=productSchema(product,canonical,knownPhoto);
 assert.equal(schema['@type'],'Product');
 assert.deepEqual(schema.image,[knownPhoto]);
 assert.equal(schema.offers['@type'],'Offer');
 assert.equal(schema.offers.url,canonical);
 assert.equal(schema.offers.price,'250');
 assert.equal(schema.offers.priceCurrency,'PKR');
 assert.equal(schema.offers.availability,undefined);
 assert.equal(schema.aggregateRating,undefined);
 assert.equal(schema.review,undefined);
});
test('stock state only emits verified availability signals',()=>{
 assert.equal(stockAvailability('sourced_after_order'),null);
 assert.equal(stockAvailability('available'),'https://schema.org/InStock');
 assert.equal(stockAvailability('limited'),'https://schema.org/LimitedAvailability');
 assert.equal(stockAvailability('unavailable'),'https://schema.org/OutOfStock');
});
test('missing, empty and invalid price never become a fabricated free Offer',()=>{
 for(const price of [null,undefined,'', '   ', 'invalid',-1]){
  const schema=productSchema({...product,price},canonical,knownPhoto);
  assert.equal(schema.offers,undefined,String(price));
 }
 assert.equal(productSchema({...product,price:0},canonical,knownPhoto).offers.price,'0','explicit zero is not altered');
});
test('unknown brand and unsafe image URLs are omitted instead of invented',()=>{
 const schema=productSchema({...product,brand:''},canonical,'');
 assert.equal(schema.brand,undefined);
 assert.equal(schema.image,undefined);
 assert.equal(productImage('javascript:alert(1)'), '');
 assert.equal(productImage('http://unsafe.example/stock.jpg'), '');
 assert.equal(productImage('data:image/png;base64,abc'), '');
 assert.equal(productImage('images/fake.jpg',new Set()), '');
});
test('presentation guards avoid duplicate pack/title suffix',()=>{
 assert.equal(productPageTitle({...product,name:'Example Pack of 4',pack:'Pack of 4'}),'Example Pack of 4 | ChaskaBox');
});
test('SSR product markup has escaped name alt and canonical structured data from public visible product',()=>{
 const src=readFileSync(new URL('../functions/product/[[slug]].js',import.meta.url),'utf8');
 assert.match(src,/visibility=eq\.visible/);
 assert.match(src,/alt=\\?"\$\{esc\(p\.name\)\}/);
 assert.match(src,/productSchema\(p,canonical,photo\)/);
 assert.match(src,/photoUnderReview\(p\)/);
});
