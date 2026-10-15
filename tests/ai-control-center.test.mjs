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
 assert.match(src,/state\.agents/);
 assert.doesNotMatch(src,/fetch\(['"]https:\/\/api\.(?:resend|waha)/i);
 assert.match(html,/missing observations are not counted as working/);
});
