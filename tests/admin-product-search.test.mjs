import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('admin product search covers brand, slug and tags and exposes an accessible label',async()=>{
 const js=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
 const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
 assert.match(js,/p\.brand,p\.slug,p\.category,p\.pack/);
 assert.match(js,/Array\.isArray\(p\.tags\)/);
 assert.match(html,/id="productSearch" type="search" aria-label=/);
 assert.match(html,/Search name, brand, tag or pack/);
});
