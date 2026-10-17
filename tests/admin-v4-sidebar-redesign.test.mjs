import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Redesigned sidebar exposes desktop focus mode, navigation group controls and mobile pin action in real shell and demo',()=>{
 for(const path of ['admin.html','admin-v4-demo.html']){
  const s=read(path);
  for(const id of ['adminSidebarCollapse','adminSidebarRestore','adminExpandGroups','adminCollapseGroups','adminPinnedLinks','adminPinnedCount','adminPinCurrent','adminPinFromSidebar','adminNavSearch','sidebarToggle','sidebarBackdrop'])
   assert.ok(s.includes('id="'+id+'"'),path+' missing '+id);
  assert.match(s,/admin-v4-sidebar\.js\?v=20261017-nav2/);
  assert.equal((s.match(/<details class="admin-nav-group"/g)||[]).length,6);
  assert.equal((s.match(/class="admin-nav-btn/g)||[]).length,25);
  assert.match(s,/id="adminNavGroups" aria-label="Admin sections"/);
 }
});
test('Pinned shortcuts are local-only and constrained to authenticated, visible panels',()=>{
 const js=read('admin-v4-sidebar.js');
 assert.match(js,/favoriteIds\.length<6/);
 assert.match(js,/const verified=\(\)=>demo\|\|document\.getElementById\('securityNotice'\)\?\.classList\.contains\('live'\)===true/);
 assert.match(js,/const allowed=b=>!!b&&!b\.hidden&&b\.style\.display!=='none'/);
 assert.match(js,/persist\(pinsKey,favoriteIds\)/);
 assert.match(js,/adminPinFromSidebar/);
 assert.match(js,/getAttribute\('aria-hidden'\)!=='true'/);
 assert.doesNotMatch(js,/\bfetch\s*\(|\/api\/admin\/|signInWithPassword|access_token|service_role|notification_replay/);
});
test('Navigation respects keyboard focus, native disclosure elements and mobile restores',()=>{
 const js=read('admin-v4-sidebar.js'),css=read('admin.css');
 assert.match(js,/event\.key!=='Tab'/);
 assert.match(js,/event\.shiftKey/);
 assert.match(js,/toggle\.focus\(\)/);
 assert.match(js,/document\.querySelector\('dialog\[open\]'\)/);
 assert.match(js,/groups\.forEach\(g=>g\.open=false\)/);
 assert.match(js,/groups\.forEach\(g=>g\.open=true\)/);
 assert.match(css,/admin-sidebar-minimized/);
 assert.match(css,/@media\(min-width:901px\)/);
 assert.match(css,/\.admin-pinned-links button:focus-visible/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
