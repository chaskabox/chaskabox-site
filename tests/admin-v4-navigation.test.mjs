import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const load=path=>readFileSync(new URL(path,root),'utf8');

const expectedViews=[
 'dashboard','orders','couriers','resolutions','coupons','shipping','analytics','backup','studio','products',
 'categories','brands','boxes','pages','homepage','navigation','theme','customers','reviews','media',
 'notifications','agents','assistant','health','preview','settings','security'
];
test('V4 preserves all 27 admin view bindings exactly once in six accessible groups',()=>{
 const html=load('admin.html');
 const nav=html.match(/<nav class="admin-nav"[^>]*>[\s\S]*?<\/nav>/)?.[0];
 assert.ok(nav,'navigation exists');
 const bindings=[...nav.matchAll(/class="admin-nav-btn[^"]*"[^>]*data-view="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(bindings.slice().sort(),expectedViews.slice().sort());
 assert.equal(new Set(bindings).size,27);
 assert.equal((nav.match(/<details class="admin-nav-group"/g)||[]).length,6);
 assert.equal((nav.match(/<summary>/g)||[]).length,6);
 assert.match(html,/id="adminNavSearch"[^>]*aria-controls="adminNavGroups"/);
 assert.match(nav,/id="orderNavCount"/);
 assert.match(nav,/id="productNavCount"/);
});
test('V4 search and navigation never unhide forbidden role items',()=>{
 const js=load('admin.js');
 const live=load('admin-live.js');
 assert.match(js,/function filterAdminNavigation\(/);
 assert.match(js,/if\(match&&!btn\.hidden\)/);
 assert.match(js,/btn\.classList\.toggle\('nav-search-miss',!match\)/);
 assert.match(js,/function closeAdminSidebar\(/);
 assert.match(js,/setAttribute\('aria-expanded','false'\)/);
 assert.match(js,/setAttribute\('aria-current','page'\)/);
 assert.match(js,/activeNav\?\.closest\('\.admin-nav-group'\)/);
 assert.match(live,/function syncRoleNavigation\(/);
 assert.match(live,/button\.hidden=!allowed/);
 assert.match(live,/const allowed=canOpenAdminView\(button\.dataset\.view\)/);
});
test('V4 typography, responsive controls and owner auth remain intact',()=>{
 const html=load('admin.html'),css=load('admin.css');
 assert.match(html,/name="robots" content="noindex,nofollow"/);
 assert.match(html,/admin\.css\?v=20261016-admin-v4-shell1/);
 assert.match(html,/admin\.js\?v=20261016-admin-v4-shell1/);
 assert.match(html,/id="adminSidebarSignOut"/);
 assert.match(html,/id="adminSignOut"/);
 assert.match(html,/id="sidebarToggle"[^>]*aria-expanded="false"/);
 assert.match(html,/id="securityNotice"/);
 assert.match(html,/configured features; they are not live provider-health checks/i);
 assert.match(css,/Admin Console V4 \/ Phase 1/);
 assert.match(css,/\.admin-shell \.admin-nav-btn:focus-visible/);
 assert.match(css,/@media\(max-width:900px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/#adminSidebarSignOut:not\(\[hidden\]\)/);
 assert.match(css,/#adminSignOut:not\(\[hidden\]\)/);
});
