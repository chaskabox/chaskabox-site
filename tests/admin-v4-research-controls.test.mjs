import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('V4 action controls are identical in protected shell and isolated demo',()=>{
 const live=file('admin.html'),demo=file('admin-v4-demo.html');
 for(const s of [live,demo]){
  assert.match(s,/id="adminCommandOpen"[^>]*aria-haspopup="dialog"/);
  assert.match(s,/id="adminDensityToggle"[^>]*aria-pressed="false"/);
  assert.match(s,/admin-v4-tools\.js\?v=20261016-v4-actions1/);
  assert.equal((s.match(/class="admin-attention-actions"/g)||[]).length,1);
  for(const target of ['orders','products','notifications','health'])
   assert.match(s,new RegExp('data-jump="'+target+'"'));
  assert.match(s,/Operations &amp; review/);
 }
 assert.match(live,/id="securityNotice"/);
 assert.doesNotMatch(demo,/supabase-config\.js|admin-live\.js|type="password"/);
});
test('V4 palette navigates permitted panels only and never sends data',()=>{
 const source=file('admin-v4-tools.js'),css=file('admin.css');
 assert.match(source,/function|const isUnlocked/);
 assert.match(source,/document\.querySelector\('#securityNotice'\)\?\.classList\.contains\('live'\)/);
 assert.match(source,/!b\.hidden&&b\.style\.display!=='none'/);
 assert.match(source,/b\.getAttribute\('aria-hidden'\)!=='true'/);
 assert.match(source,/document\.createElement\('dialog'\)/);
 assert.match(source,/document\.createElement\('button'\)/);
 assert.match(source,/dialog\.showModal\(\)/);
 assert.match(source,/e\.ctrlKey\|\|e\.metaKey/);
 assert.match(source,/window\.localStorage\.setItem/);
 assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|sendMessage|signInWithPassword|\/api\/admin\/|service_role|access_token/);
 assert.match(css,/admin-command-dialog/);
 assert.match(css,/admin-density-compact/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
