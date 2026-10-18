import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('homepage hero is part of initial server HTML (not mounted after catalogue fetch)', () => {
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/<div id="view-home">\s*<section class="hero(?: hero-editorial)?(?: hero-packing-preview)?"[^>]*>/);
 assert.match(html,/<div id="view-home">[\s\S]*?<h1>Bachpan Ka Zaiqa,/);
 assert.doesNotMatch(html,/<template id="tpl-home">/);
 assert.match(html,/<div id="view-shop" style="display:none">/);
});
