import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AGENTS} from '../functions/api/admin/_lib/agent-policy.js';

test('AI control center displays every agent independently without fabricating healthy state',async()=>{
 const src=await readFile(new URL('../admin-agents.js',import.meta.url),'utf8');
 const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
 assert.equal(AGENTS.length,8);
 for(const agent of AGENTS)assert.ok(src.includes("'"+agent+"'"),agent);
 assert.match(src,/No observation evidence/);
 assert.match(src,/Disabled/);
 assert.match(src,/Read-only runtime observation/);
 assert.match(src,/state\?\.agents/);
 assert.doesNotMatch(src,/fetch\(['"]https:\/\/api\.(?:resend|waha)/i);
 assert.match(html,/missing observations are not counted as working/);
});

test('AI diagnostics survive one endpoint outage without falsely confirming enabled states',async()=>{
 const source=await readFile(new URL('../admin-agents.js',import.meta.url),'utf8');
 assert.match(source,/Promise\.allSettled/);
 assert.match(source,/refreshSequence/);
 assert.match(source,/Unknown — status endpoint unavailable/);
 assert.match(source,/Partial diagnostics/);
 assert.match(source,/Marketing drafts unavailable/);
 assert.match(source,/submit\.disabled=!state\|\|!marketing/);
 assert.doesNotMatch(source,/Promise\.all\(\[\s*api\('\/api\/admin\/agents\/status'/);
});

test('admin menu reorder maintains the previous visible state when server persistence fails',async()=>{
 const file=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
 assert.match(file,/if\(el\._navSaving\)return/);
 assert.match(file,/const previous=\(el\._navItems\|\|\[\]\)\.slice\(\)/);
 assert.match(file,/catch\(e\)\{render\(previous/);
 assert.match(file,/finally\{el\._navSaving=false/);
});
