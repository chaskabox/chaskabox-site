import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {productSchema} from '../functions/api/_lib/seo.js';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
function drafts(js){
 const context={window:{}};
 runInNewContext(js,context);
 return context.window.ChaskaSourceBackedCopy;
}

test('source-backed editorial copy drafts are valid, distinct and never auto-published',async()=>{
 const first=await read('admin-source-backed-product-copy.js');
 const second=await read('admin-source-backed-product-copy-batch2.js');
 const items=Object.entries(drafts(first+'\n'+second));
 assert.equal(items.length,29);
 assert.equal(new Set(items.map(([id])=>id)).size,items.length);
 assert.equal(Object.keys(drafts(second)).length,19);
 assert.equal(new Set(items.map(([,d])=>d.name.toLowerCase())).size,29);
 assert.ok(items.every(([id,d])=>String(Number(id))===id && d.source.startsWith('https://')));
 assert.ok(items.every(([,d])=>d.review==='manual-label-check-required'));
 assert.ok(items.every(([,d])=>!d.source_note||!d.description.includes(d.source_note)));
 for(const [id,d] of items){
  assert.ok(d.name && d.brand && d.pack,id+' metadata');
  assert.ok(d.description.length>=240 && d.description.length<=2000,id+' description');
  assert.ok(d.description.includes('Highlights:') && d.description.includes(d.pack),id+' structured');
  assert.ok(d.seo_title.length>10 && d.seo_title.length<=60,id+' title');
  assert.ok(d.seo_description.length>40 && d.seo_description.length<=160,id+' meta');
  assert.doesNotMatch(d.description,/DRAFT TEXT:|\b(?:guaranteed|cures|heals|allergen-free)\b/i);
 }
 const titles=items.map(([,d])=>d.seo_title.toLowerCase());
 assert.equal(new Set(titles).size,titles.length);
 const controls=await read('admin-source-copy-controls.js');
 assert.doesNotMatch(controls,/fetch\(|\/api\/admin\/products|cmsMutate/);
 assert.match(controls,/window\.confirm/);
 assert.match(controls,/editDescription/);
 assert.match(controls,/editSeoTitle/);
 assert.match(controls,/editSeoDesc/);
 const admin=await read('admin.html');
 assert.ok(admin.indexOf('admin-source-backed-product-copy.js')<admin.indexOf('admin-source-backed-product-copy-batch2.js'));
 assert.ok(admin.indexOf('admin-source-backed-product-copy-batch2.js')<admin.indexOf('admin-source-copy-controls.js'));
 assert.match(controls,/sourceCopyReviewNote/);
 assert.match(admin,/sourceCopyReviewNote/);
});

test('Product structured data description is readable without editorial section tokens',()=>{
 const page=productSchema({id:16,name:'AP Love Letter Pillow Wafer Chocolate',description:'Chocolate pillow wafer. Pack of 24.\n\nHighlights:\n- Chocolate-flavoured wafer pillows',brand:'AP',stock_state:'sourced_after_order',price:399},'https://chaskabox.online/product/16/','');
 assert.equal(page.description,'Chocolate pillow wafer.');
 assert.doesNotMatch(page.description,/Highlights:/);
 assert.equal(page.brand.name,'AP');
 assert.equal(page.offers.availability,undefined);
 const legacy=productSchema({id:17,name:'Unnamed',description:'',seo_description:'Specific approved SEO description',price:399},'https://chaskabox.online/product/17/','');
 assert.equal(legacy.description,'Specific approved SEO description');
});

test('catalogue quality panel reports only staff-loaded data',async()=>{
 const admin=await read('admin.html'),controller=await read('admin-live.js');
 assert.match(admin,/id="productCopyCoverage"/);
 assert.match(controller,/loaded products/);
 assert.match(controller,/description_review/);
 assert.match(controller,/contentAudit\.review/);
 assert.match(controller,/contentAudit\.seo/);
});
