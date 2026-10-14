import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('offline recovery client uses the logout POST contract and checks revoked refresh tokens',()=>{
 const output=execFileSync(process.execPath,['--import',fileURLToPath(new URL('./fixtures/offline-auth-fetch.mjs',import.meta.url)),fileURLToPath(new URL('../tools/auth-recovery-acceptance.mjs',import.meta.url))],{env:{...process.env,ISOLATED_AUTH_RECOVERY:'true',GOTRUE_JWT_SECRET:'fixture-ephemeral-jwt-secret'},encoding:'utf8',timeout:10000});
 const result=JSON.parse(output);assert.equal(result.password_login,true);assert.equal(result.token_refresh,true);assert.equal(result.logout_revocation,true);assert.equal(result.external_provider_sends,false);
});
