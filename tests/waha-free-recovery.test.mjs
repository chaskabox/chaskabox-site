import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
test('free WAHA host recovery protects sessions, scopes credentials and rolls back its own connector',()=>{
 const result=execFileSync('python3',['-B','-m','unittest','discover','-s','tests','-p','waha_recovery_test.py','-v'],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
 assert.equal(typeof result,'string');
});
