import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('M00–M05 post-migration acceptance SQL is read-only and cannot authorize production',async()=>{
 const file=await readFile(new URL('../tools/ai-release-postcheck.sql',import.meta.url),'utf8');
 const body=file.split('\n').filter(x=>!x.trim().startsWith('--')).join('\n');
 assert.match(body,/chaskabox_agents\.agent_settings/);
 for(const role of ['anon','authenticated','service_role'])assert.match(body,new RegExp("has_function_privilege\\('"+role+"'"));
 assert.match(body,/agents_enabled/);
 assert.match(body,/production_release_authorized',false/);
 assert.doesNotMatch(body,/\b(ALTER|CREATE|DROP|DELETE|INSERT|UPDATE|TRUNCATE|GRANT|REVOKE|CALL)\b/i);
});
