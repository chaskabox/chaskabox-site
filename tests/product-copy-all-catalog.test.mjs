import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const script=read('admin-product-copy-all-catalog-drafts.js');
function draft(data){
 const context={window:{}};
 runInNewContext(script,context);
 return context.window.ChaskaDraftFromCatalog(data);
}
const fixtures=[
 {id:1,name:'Testing | Pillow Wafer Strawberry',brand:'Testing',category:'Biscuits & Wafers',pack:'Pack of 24'},
 {id:2,name:'Testing | Double Chocolate Cake',brand:'Testing',category:'Bunties & Cakes',pack:'Pack of 12'},
 {id:3,name:'Testing | Original Bubble Gum',brand:'Testing',category:'Chews & Gums',pack:'Pack of 50'},
 {id:4,name:'Testing | Mango Jelly',brand:'Testing',category:'Jellies & Marshmallow',pack:'Pack of 18'},
 {id:5,name:'Testing | Pomegranate Fruit Bar',brand:'Testing',category:'Imli & Ice Lollies',pack:'Pack of 4'},
 {id:6,name:'Testing | Spicy Chicken Pops',brand:'Testing',category:'Snacks & Nimco',pack:'Pack of 12'},
 {id:7,name:'Testing | Pan Masala Pineapple',brand:'Testing',category:'Betel Nuts & Pan Masala',pack:'Pack of 1'},
 {id:8,name:'Testing | Caramel Chocolate',brand:'Testing',category:'Chocolates & Candies',pack:'Pack of 50'},
 {id:9,name:'Testing Snack Bundle',brand:'',category:'Bundles',pack:'Bundle Pack'},
 {id:10,name:'Testing Sweet Mix',brand:'Testing',category:'',pack:'Pack of 1'},
 {id:11,name:'Testing Family Pack',brand:'',category:'Bundles',pack:'Contents under review'},
 {id:12,name:'Testing | Mini Beans',brand:'Testing',category:'Bunties & Cakes',pack:'Pack of 4 (Rs. 75)'}
];
test('all catalogue families receive safe review-only structured draft and SEO without write side effects',()=>{
 const titles=new Set();
 for(const item of fixtures){
  const d=draft(item);
  assert.ok(d);
  assert.equal(d.name,item.name);
  assert.match(d.description,/^.+\n\nHighlights:\n- /);
  assert.match(d.description,/\n\nServing ideas:\n/);
  assert.ok(d.description.length<2000);
  assert.ok(d.seo_title.length<=60);
  assert.ok(d.seo_description.length<=155);
  assert.match(d.seo_title,/ChaskaBox$/);
  assert.match(d.seo_description,/\.$/);
  assert.equal(d.source_kind,'chaskabox_catalogue');
  assert.ok(d.source_note.includes('Not manufacturer-'));
  assert.ok(!d.source,'Unsourced catalogue claims must not link to a fabricated page');
  assert.doesNotMatch(d.description,/\b(?:allergen-free|organic|halal-certified|best before|expires on|made with real)\b/i);
  assert.ok(!titles.has(d.seo_title),'Distinct fixture product SEO titles');
  titles.add(d.seo_title);
 }
 const blocked=draft(fixtures[10]);
 assert.equal(blocked.review,'block-unverified-bundle');
 assert.match(blocked.description,/exact selection must be confirmed/);
 assert.doesNotMatch(draft(fixtures[11]).description,/Rs\.\s*75/,'embedded historic pack price must not be copied');
});

test('flavour stays in SEO title for long named variants',()=>{
 const a=draft({name:'Ap | Love Letter Double Stick Chocolate',brand:'Ap',category:'Biscuits & Wafers',pack:'Pack of 24'});
 const b=draft({name:'Ap | Love Letter Double Stick Strawberry',brand:'Ap',category:'Biscuits & Wafers',pack:'Pack of 24'});
 assert.notEqual(a.seo_title,b.seo_title);
 assert.match(a.seo_title,/Chocolate/);
 assert.match(b.seo_title,/Strawberry/);
});

test('all-source preview loads researched then safe catalog-based fallbacks without auto-saving',()=>{
 const html=read('admin.html');
 const paths=['admin-source-backed-product-copy.js','admin-source-backed-product-copy-batch2.js','admin-product-copy-all-catalog-drafts.js','admin-source-copy-controls.js'];
 let prev=0;for(const path of paths){const offset=html.indexOf('src="/'+path);assert.ok(offset>prev, 'ordered script '+path);prev=offset;}
 const controls=read('admin-source-copy-controls.js');
 assert.match(controls,/ChaskaDraftFromCatalog/);
 assert.match(controls,/sourceCopyReviewNote/);
 assert.match(controls,/window\.confirm/);
 assert.doesNotMatch(controls,/fetch\(|\/api\/admin\/products|cmsMutate/);
 assert.match(html,/loadSourceCopyBtn/);
});

test('hidden SKU names and full catalogue are not serialized into public generator source',()=>{
 assert.ok(script.length<18000);
 assert.doesNotMatch(script,/ChaskaBox Family Pack|Love Letter Pillow Wafer Strawberry|Nony Pops|Shahjahan Nimko/);
});
