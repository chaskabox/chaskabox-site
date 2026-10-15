import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
test('Admin role-aware create/edit/delete buttons align with protected backend permissions',async()=>{
 const ui=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
 const categories=await readFile(new URL('../functions/api/admin/categories/[id].js',import.meta.url),'utf8');
 const brands=await readFile(new URL('../functions/api/admin/brands/[id].js',import.meta.url),'utf8');
 assert.match(ui,/const mayDelete=Boolean\(c\)&&roleAllows\('owner','manager'\)/);
 assert.match(ui,/Only Owners or Managers can delete categories/);
 assert.match(ui,/roleAllows\('owner'\)\?\x60<button class="btn danger compact" data-del-brand=/);
 assert.match(ui,/Only Owners can delete brands/);
 assert.match(categories,/onRequestDelete = withAdmin\(\['owner', 'manager'\]/);
 assert.match(brands,/onRequestDelete = withAdmin\(\['owner'\]/);
});
test('Visibility toggles handle unavailable backend and do not falsely report success',async()=>{
 const ui=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
 assert.match(ui,/Category visibility was not changed/);
 assert.match(ui,/Brand visibility was not changed/);
 assert.match(ui,/Category delete failed:/);
 assert.match(ui,/Brand delete failed:/);
});
test('Notification and health refreshes are idempotent; no duplicate handlers accumulate',async()=>{
 const ui=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
 for(const id of ['refreshNotifStatus','refreshTemplates','refreshHealth'])assert.match(ui,new RegExp("\\\$\\\('#"+id+"'\\\)\\.onclick="));
 assert.doesNotMatch(ui,/refreshNotifStatus'\)\?\.addEventListener/);
 assert.doesNotMatch(ui,/refreshHealth'\)\?\.addEventListener/);
});
