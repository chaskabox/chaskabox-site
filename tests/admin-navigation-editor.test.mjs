import{test}from'node:test';import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{safeNavTarget,navLabel,navLocation}from'../functions/api/admin/navigation/index.js';
test('navigation URLs reject script schemes and protocol-relative injection',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,<script>','//evil.example','http://insecure.example','/\\evil','/a b',''])assert.throws(()=>safeNavTarget(url),x=>x instanceof Response&&x.status===400,url);
 for(const url of ['/','/shop/','/products?id=3','https://example.org/page','#section','mailto:help@example.org','tel:+923001234567'])assert.equal(safeNavTarget(url),url,url);
 assert.equal(navLabel(' Shop '),'Shop');
 assert.equal(navLocation('mobile'),'mobile');
 assert.throws(()=>navLocation('unknown'),x=>x instanceof Response&&x.status===400);
});
test('navigation backend permits audited create and limited edit with expected controls',async()=>{
 const backend=await readFile(new URL('../functions/api/admin/navigation/index.js',import.meta.url),'utf8');
 const ui=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
 const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
 assert.match(backend,/onRequestPost = withAdmin\\(\\['owner', 'manager', 'content'\\]/);
 assert.match(backend,/data\\.url=safeNavTarget\\(it\\.url\\)/);
 assert.match(ui,/id="navEditForm"/);
 assert.match(ui,/navEditSave/);
 assert.match(ui,/data-nav-edit/);
 assert.match(html,/id="mobileNavList"/);
 assert.match(html,/id="addMobileNav"/);
 assert.doesNotMatch(backend,/onRequestDelete/);
});