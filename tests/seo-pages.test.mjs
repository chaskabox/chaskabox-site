import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = new URL('../', import.meta.url);
const cases = [
  'biscuits-and-wafers',
  'bunties-and-cakes',
  'chews-and-gums',
  'chocolates-and-candies',
  'imli-and-ice-lollies',
  'jellies-and-marshmallow',
  'snacks-and-nimco',
  'betel-nuts-and-pan-masala',
];
test('category pages have crawlable product links before JavaScript', () => {
  for (const slug of cases) {
    const content=readFileSync(new URL('category/'+slug+'/index.html',base),'utf8');
    assert.match(content,/<div id="view-shop">/);
    assert.match(content,/id="categorySeoIntro"/);
    assert.match(content,/<a class="pname" href="\/product\/[0-9]+\/">/);
    assert.match(content,/id="category-breadcrumb-schema"/);
    assert.match(content,new RegExp('rel="canonical" href="https://chaskabox.online/category/'+slug+'/'));
  }
});
test('shop and bundles have crawlable initial item lists', () => {
  for (const name of ['shop','bundles']) {
    const page=readFileSync(new URL(name+'/index.html',base),'utf8');
    assert.match(page,/<div id="view-shop">/);
    assert.match(page,/href="\/product\/\d+\/"/);
    assert.match(page,/id="categorySeoIntro"/);
  }
});
