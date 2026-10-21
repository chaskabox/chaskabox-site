import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

test('Admin sidebar: live and synthetic views retain navigation with less clutter',()=>{
  for(const path of ['admin.html','admin-v4-demo.html']){
    const html=read(path);
    for(const id of ['adminNavSearch','adminNavGroups','adminPinnedLinks','adminPinnedCount','adminExpandGroups','adminCollapseGroups','adminPinFromSidebar','adminPinCurrent']){
      assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,path+': '+id+' must occur exactly once');
    }
    assert.match(html,/<details class="admin-nav-preferences">[\s\S]*?<summary aria-label="Navigation options">/);
    assert.match(html,/<strong id="adminPinnedTitle">★ Quick access<\/strong>/);
    assert.match(html,/admin\.css\?v=20261021-simplified-sidebar1/);
    assert.match(html,/admin-v4-sidebar\.js\?v=20261021-simplified-sidebar1/);
    assert.doesNotMatch(html,/★ Pinned panels/);
    assert.equal((html.match(/<details class="admin-nav-group"/g)||[]).length,6);
    const views=[...html.matchAll(/class="admin-nav-btn[^"]*"[^>]*data-view="([^"]+)"/g)].map(match=>match[1]);
    assert.ok(views.length>=25);
    assert.equal(new Set(views).size,views.length,'panel navigation must remain unique');
  }
});

test('Admin sidebar: quick access keeps security checks and working pin controls',()=>{
  const js=read('admin-v4-sidebar.js');
  const css=read('admin.css');
  assert.match(js,/const verified=\(\)=>demo\|\|document\.getElementById\('securityNotice'\)/);
  assert.match(js,/if\(!allowed\(b\)\)return/);
  assert.match(js,/if\(verified\(\)\&\&allowed\(b\)\)/);
  assert.match(js,/persist\(pinsKey,favoriteIds\)/);
  assert.match(js,/preferences\.open=false/);
  assert.match(js,/const maxed=!pinned&&favoriteIds\.length>=6/);
  assert.doesNotMatch(js,/admin-pinned-remove/);
  assert.match(css,/Admin sidebar simplification \(2026-10-21\)/);
  assert.match(css,/\.admin-pinned-links\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.admin-shell \.admin-nav\{overflow-y:auto;overflow-x:hidden/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
