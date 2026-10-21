import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parseDescription,descriptionSummary,renderProductContent} from '../functions/api/_lib/product-description.js';

const fixture={
  id:16,name:'Ap | Love Letter Pillow Wafer Chocolate',brand:'Ap',
  pack:'Pack of 24',category:'Biscuits & Wafers',
  description:'Ap Love Letter Pillow Wafer Chocolate is a chocolate pillow-wafer snack. The listed box is Pack of 24.\n\nHighlights:\n- Pillow-wafer format\n\nIngredients:\nSee original pack label',
};
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('old unstructured descriptions remain readable and product-specific',()=>{
  const parsed=parseDescription('A classic wafer snack for the listed pack. Serve at home.');
  assert.equal(parsed.overview,'A classic wafer snack for the listed pack. Serve at home.');
  assert.equal(descriptionSummary(parsed.overview),'A classic wafer snack for the listed pack.');
});

test('structured optional sections and summary use the single description field',()=>{
  const parsed=parseDescription(fixture.description);
  assert.equal(parsed.highlights,'- Pillow-wafer format');
  assert.equal(parsed.ingredients,'See original pack label');
  assert.equal(descriptionSummary(fixture.description),'Ap Love Letter Pillow Wafer Chocolate is a chocolate pillow-wafer snack.');
  const html=renderProductContent(fixture);
  assert.match(html,/<h2>About this snack<\/h2>/);
  assert.match(html,/<h3>Highlights<\/h3>/);
  assert.match(html,/<h3>Ingredients<\/h3>/);
  assert.match(html,/<dt>Pack \/ size<\/dt><dd>Pack of 24<\/dd>/);
  assert.match(html,/Formulations and dates can vary by batch/);
  assert.doesNotMatch(html,/Taste & texture<\/h3>/);
});

test('HTML escapes externally edited content; missing label facts are never fabricated',()=>{
  const html=renderProductContent({name:'Test',description:'Snack <img src=x onerror=alert(1)>',brand:'Brand & Co',pack:'Pack of 6'});
  assert.doesNotMatch(html,/<img/);
  assert.match(html,/&lt;img/);
  assert.match(html,/Brand &amp; Co/);
  assert.doesNotMatch(html,/<h3>Ingredients<\/h3>/);
});

test('browser copy helper has same normalized sections without extra data calls',async()=>{
  const js=await read('product-description-ui.js');
  const sandbox={window:{}};
  runInNewContext(js,sandbox);
  const api=sandbox.window.ChaskaProductCopy;
  assert.equal(api.summary(fixture.description),descriptionSummary(fixture.description));
  const rendered=api.content({desc:fixture.description,brand:fixture.brand,pack:fixture.pack,category:fixture.category});
  assert.match(rendered,/<h3>Highlights<\/h3>/);
  assert.match(rendered,/Pack of 24/);
  assert.doesNotMatch(rendered,/<h3>Best before<\/h3>/);
});

test('server-rendered and client-routed PDPs include the same factual copy system',async()=>{
  const [index,route,app,admin,dynamic,style]=await Promise.all([
    read('index.html'),read('functions/product/[[slug]].js'),read('app.js'),
    read('admin.html'),read('dynamic-product.js'),read('product-details-refresh.css')
  ]);
  assert.match(index,/product-description-ui\.js/);
  assert.ok(index.indexOf('product-description-ui.js')<index.indexOf('/app.js'));
  assert.match(route,/renderProductContent\(p\)/);
  assert.match(route,/descriptionSummary\(p\.description\)/);
  assert.match(app,/copy\.content\(p\)/);
  assert.match(dynamic,/copy\.content\(product\)/);
  assert.match(admin,/productStructureTemplate/);
  assert.match(admin,/description_review/);
  assert.match(style,/@media\(max-width:800px\)/);
  assert.match(style,/prefers-reduced-motion/);
});
