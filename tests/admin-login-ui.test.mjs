import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Staff login keeps password autofill and server-side MFA gateway',async()=>{
 const source=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
 const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
 assert.match(source,/class="live-login-card staff-login-card"/);
 assert.match(source,/id="liveEmail" name="email" type="email" autocomplete="username"/);
 assert.match(source,/id="livePassword" name="password" type="password" autocomplete="current-password"/);
 assert.match(source,/id="livePasswordToggle" type="button"/);
 assert.match(source,/passwordInput\.type=showing\?'text':'password'/);
 assert.match(source,/passwordToggle\.setAttribute\('aria-pressed'/);
 assert.match(source,/SB\.auth\.signInWithPassword/);
 assert.match(source,/const ready=await bootAuthenticated\(\)/);
 assert.match(source,/window\.chaskaAdminMfa\.gate\(SB/);
 assert.match(source,/id="forgotPwLink"/);
 assert.match(source,/SB\.auth\.resetPasswordForEmail/);
 assert.match(html,/<script src="\/admin-live\.js\?v=[a-zA-Z0-9-]+" defer><\/script>/);
});
test('Staff UI CSS is scoped and responsive',async()=>{
 const css=await readFile(new URL('../admin.css',import.meta.url),'utf8');
 assert.match(css,/\.live-admin-login:has\(\.staff-login-card\)/);
 assert.match(css,/\.staff-login-card #livePassword:focus-visible/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(css,/\.staff-login-submit:disabled/);
});
