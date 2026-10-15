import {test} from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
test('owner brand create and publish use complete editor rather than prompt',async()=>{
 const html=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
 const backend=await readFile(new URL('../functions/api/admin/brands/index.js',import.meta.url),'utf8');
 assert.match(html,/openBrandEditor\(null,\[\]\)/);
 assert.doesNotMatch(html,/prompt\('Brand name:'\)/);
 assert.match(html,/creating\?'Add a brand'/);
 assert.match(html,/if\(creating\) await api\('\/api\/admin\/brands'/);
 for(const key of ['hero_image_url','short_description','long_description','seo_title','seo_description','og_image_url','featured_product_ids'])assert.ok(backend.includes(key),key);
});