import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('homepage loads Supabase SDK only on account demand/idle',()=>{
 const index=read('index.html'),cfg=read('supabase-config.js'),app=read('app.js');
 assert.doesNotMatch(index,/<script[^>]+src="https:\/\/cdn.jsdelivr.net\/npm\/@supabase\/supabase-js/);
 assert.match(cfg,/function loadSupabaseSdk\(\)/);
 assert.match(cfg,/script\.async=true/);
 assert.match(cfg,/await loadSupabaseSdk\(\)/);
 assert.match(app,/requestIdleCallback\(authStart,\{timeout:3500\}\)/);
 assert.match(index,/supabase-config\.js\?v=20261012-perf3/);
});
test('account route remains eager, early account clicks restore session',()=>{
 const account=read('account.js');
 const accountPage=read('account/index.html');
 assert.match(account,/async function toggleAccount\(\)/);
 assert.match(account,/await initAccount\(\)/);
 assert.match(accountPage,/@supabase\/supabase-js@2\.57\.4/);
});
