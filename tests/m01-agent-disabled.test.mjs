import {test} from 'node:test';
import assert from 'node:assert/strict';
import {enqueueAgent,claimAgent} from '../functions/api/_lib/agent-jobs.js';
import {finishAgent} from '../functions/api/_lib/agent-result.js';
test('M01 rejects all work without explicit enablement',async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 await assert.rejects(()=>enqueueAgent({env:{}},{agent:'catalogue_health',dedupeHash:'a'.repeat(64)}));
 await assert.rejects(()=>claimAgent({env:{}},{agent:'catalogue_health',workerId:id}));
 await assert.rejects(()=>finishAgent({env:{}},{jobId:id,leaseToken:id,success:true}));
});
