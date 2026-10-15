import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const load=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('agent workbench is linked to owner admin without changing agent API endpoints',async()=>{
 const html=await load('admin.html');
 assert.match(html,/id="view-agents"/);
 assert.match(html,/admin-agent-workbench\.css/);
 assert.match(html,/admin-agent-workbench\.js/);
 const original=await load('admin-agents.js');
 assert.match(original,/card\.dataset\.activation/);
 assert.match(original,/card\.dataset\.evidence/);
 assert.match(original,/chaskaAdminApi/);
});

test('workbench is non-privileged read-only with external links clearly marked reference-only',async()=>{
 const source=await load('admin-agent-workbench.js');
 assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|WAHA_API_KEY|RESEND_API_KEY/);
 assert.doesNotMatch(source,/\bfetch\s*\(|chaskaAdminApi\s*\(|\.post\s*\(/);
 assert.match(source,/none of these external runtimes is connected/);
 for(const repo of ['cloudflare\/agents','mastra-ai\/mastra','CopilotKit\/openmuse','elie222\/rakazo','browserbase\/stagehand'])
  assert.ok(source.includes(repo),'Missing reference '+repo);
 assert.match(source,/rel="noopener noreferrer"/);
 assert.match(source,/card\.dataset\.activation/);
 assert.match(source,/card\.dataset\.evidence/);
 assert.match(source,/observation_evidence/);
 assert.doesNotMatch(source,/raw_signals|customer_email|access_token/);
 // Compiles as a classic browser script without installing a framework.
 new Function(source);
});

test('unchanged M05 activation guard is respected by workbench code',async()=>{
 const original=await load('admin-agents.js');
 const source=await load('admin-agent-workbench.js');
 assert.match(original,/observation evidence/i);
 assert.match(source,/No agent launched/);
 assert.doesNotMatch(source,/\b(api|send|publish|activate|enableAgent)\s*\(/);
});
