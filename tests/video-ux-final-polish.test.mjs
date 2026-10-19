import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const pages=JSON.parse(read('docs/video-ux-bag-paths.json'));
test('Same branded bag SVG appears once per storefront route with original action and live badge',()=>{
 for(const file of pages){const s=read(file);assert.equal((s.match(/cb-bag-icon-v2/g)||[]).length,1,file);assert.match(s,/aria-label="Open shopping bag"/);assert.match(s,/class="cartcount"/);assert.match(s,/(onclick="openDrawer\(\)"|href="\/cart\/")/);}
});
test('Product polish preserves fixed image/name/button geometry and reduced motion',()=>{
 const s=read('header-discovery-preview.css');
 for(const needle of ['.pimg img','.pname','.ppack','.prow','.addcart','prefers-reduced-motion:reduce','.card.reveal:not(.in)'])assert.ok(s.includes(needle),needle);
 assert.match(read('index.html'),/hero-slider-controls/);
});
