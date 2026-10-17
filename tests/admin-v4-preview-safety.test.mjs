import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');

test('Admin V4 preview never accepts real staff credentials without staging',()=>{
 const live=read('admin-live.js');
 const expected=/^[a-z0-9-]+\.chaskabox-site\.pages\.dev$/i;
 assert.equal(expected.test('c7967b9d.chaskabox-site.pages.dev'),true);
 assert.equal(expected.test('ec596385.chaskabox-site.pages.dev'),true);
 assert.equal(expected.test('chaskabox.online'),false);
 assert.equal(expected.test('chaskabox-site.pages.dev'),false);
 assert.match(live,/function isDesignPreviewHost\(/);
 assert.match(live,/if\(isDesignPreviewHost\(\)\)\{showDesignPreviewGate\(\);return;\}/);
 assert.match(live,/Preview without signing in/);
 assert.match(live,/staff passwords and MFA are not accepted here/);
 const html=read('admin.html');
 assert.match(html,/admin-live\.js\?v=20261017-approvedbrand/);
 assert.match(html,/noindex,nofollow/);
});

test('Synthetic Admin demo shows original 25 V4 panels without auth or customer connections',()=>{
 const html=read('admin-v4-demo.html'),script=read('admin-v4-demo.js'),css=read('admin-v4-demo.css');
 const views=[...html.matchAll(/class="admin-nav-btn[^"]*"[^>]*data-view="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(views.length,25);
 assert.equal(new Set(views).size,25);
 assert.equal((html.match(/<details class="admin-nav-group"/g)||[]).length,6);
 assert.equal((html.match(/class="admin-view/g)||[]).length,25);
 assert.match(html,/SYNTHETIC DESIGN PREVIEW/);
 assert.match(html,/illustrative/);
 assert.match(html,/name="robots" content="noindex,nofollow"/);
 assert.match(html,/admin-v4-demo\.js\?v=1/);
 assert.doesNotMatch(html,/supabase-config\.js|admin-live\.js|<input[^>]+type="password"/);
 assert.doesNotMatch(script,/fetch\(|signInWithPassword|service_role|auth\.|\/api\/admin\//);
 assert.match(script,/function|const selectView/);
 assert.match(css,/demo-safe-notice/);
});
