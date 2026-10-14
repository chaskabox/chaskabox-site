import {test} from 'node:test';
import assert from 'node:assert/strict';
import {enqueueAgent,claimAgent} from '../functions/api/_lib/agent-jobs.js';
import {safeAgentResult,agentDedupeHash,finishAgent} from '../functions/api/_lib/agent-result.js';
test('M01 deterministic dedupe and safe result',async()=>{
 const a=await agentDedupeHash('catalogue_health',{product_id:42},'2026-10-14');
 assert.equal(a,await agentDedupeHash('catalogue_health',{product_id:42},'2026-10-14'));
 assert.deepEqual(safeAgentResult({summary_code:'draft_ready'}),{summary_code:'draft_ready'});
 assert.throws(()=>safeAgentResult({text:'freeform'}));
});
