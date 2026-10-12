import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('Cloudflare homepage does not install global DOM mutation polling',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/new MutationObserver\(rm\)/);
 assert.doesNotMatch(html,/setInterval\(rm,2000\)/);
 assert.match(html,/id="view-home"/);
});
