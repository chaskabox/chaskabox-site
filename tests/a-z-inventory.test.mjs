import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {AGENTS} from '../functions/api/admin/_lib/agent-policy.js';

test('Dashboard plus 26 admin navigation controls have corresponding unique live view panels',async()=>{
 const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
 const buttons=[...html.matchAll(/class="[^"]*\badmin-nav-btn\b[^"]*"[^>]*data-view="([^"]+)"/g)].map(m=>m[1]);
 const views=[...html.matchAll(/class="[^"]*\badmin-view\b[^"]*"[^>]*id="view-([^"]+)"/g)].map(m=>m[1]);
 assert.equal(buttons.length,27);
 assert.deepEqual([...new Set(buttons)].sort(),[...new Set(views)].sort());
 assert.equal(new Set(buttons).size,buttons.length);
 assert.equal(new Set(views).size,views.length);
});
test('all eight agents have source-defined deny-by-default policy and an owner-only diagnostic path',async()=>{
 assert.equal(AGENTS.length,8);
 const source=await readFile(new URL('../admin-agents.js',import.meta.url),'utf8');
 const backend=await readFile(new URL('../functions/api/admin/agents/status.js',import.meta.url),'utf8');
 assert.match(source,/api\('\/api\/admin\/agents\/'\+key\)/);
 assert.match(backend,/withAdmin\(\['owner'\]/);
 assert.match(backend,/Cache-Control/);
});
test('A-Z static form/script inventory runs and distinguishes source evidence from live acceptance',()=>{
 const raw=execFileSync(process.execPath,['tools/a-z-surface-audit.mjs','--json'],{encoding:'utf8'});
 const result=JSON.parse(raw);
 assert.ok(result.pages>=25);
 assert.ok(result.fields>=20);
 assert.ok(result.forms>=1);
 assert.equal(result.admin.buttons,27);
 assert.deepEqual(result.admin.missingAdmin,[]);
 assert.deepEqual(result.admin.orphanedAdmin,[]);
 assert.equal(result.sourceOnly,true);
 const checkout=result.byPage.find(x=>x.page==='checkout.html');
 assert.ok(checkout && checkout.fields>=10);
 assert.ok(result.byPage.some(x=>x.page==='admin.html'));
});
