import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const window={};
runInNewContext(readFileSync(new URL('../admin-agent-evidence.js',import.meta.url),'utf8'),{window});
const receipt=window.chaskaAgentReceipt,now=Date.parse('2026-10-20T07:00:00Z');
test('completed execution receipts stay separate from agent signal health',()=>{
 for(const state of ['ok','attention','unknown']){
  const x=receipt({checked_at:'2026-10-20T06:48:00Z',state},now);
  assert.equal(x.kind,'recent');assert.equal(x.state,state);
 }
 assert.equal(receipt({checked_at:'2026-10-19T06:48:00Z',state:'ok'},now).kind,'stale');
});
test('missing, malformed and future receipts cannot establish execution',()=>{
 for(const value of [null,{}, {checked_at:'bad',state:'ok'}, {checked_at:'2026-10-20T07:01:00Z',state:'ok'}, {checked_at:'2026-10-20T06:48:00Z',state:'success'}])
  assert.equal(receipt(value,now).kind,'missing');
});
