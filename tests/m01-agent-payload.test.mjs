import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validAgent,validHash,publicJobPayload} from '../functions/api/_lib/agent-jobs.js';
test('M01 agent identifiers and public payload',()=>{
 assert.equal(validAgent('catalogue_health'),true);
 assert.equal(validAgent('../admin'),false);
 assert.equal(validHash('a'.repeat(64)),true);
 assert.deepEqual(publicJobPayload({product_id:42,locale:'roman-ur'}),{product_id:42,locale:'roman-ur'});
 assert.throws(()=>publicJobPayload({unexpected:'x'}));
 assert.throws(()=>publicJobPayload({product_id:0}));
});
