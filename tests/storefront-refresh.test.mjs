import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('storefront UX scripts parse without syntax errors',()=>{
  assert.doesNotThrow(()=>new Script(read('app.js'),{filename:'app.js'}));
  assert.doesNotThrow(()=>new Script(read('home-hero-carousel.js'),{filename:'home-hero-carousel.js'}));
});

test('hero offers three accessible navigation dots with genuine catalogue photo wiring',()=>{
  const html=read('index.html'),app=read('app.js'),slider=read('home-hero-carousel.js');
  assert.match(html,/data-hero-dot="0"/);
  assert.match(html,/data-hero-dot="1"/);
  assert.match(html,/data-hero-dot="2"/);
  assert.match(html,/home-hero-carousel\.js/);
  assert.match(slider,/prefers-reduced-motion/);
  assert.match(slider,/document\.hidden/);
  assert.match(app,/CHASKABOX_HERO_MARKUP/);
  assert.match(app,/photoAttributes\(p\.img/);
});

test('CMS selections remain available and zero-product brands stay admin-only',()=>{
  const app=read('app.js');
  assert.match(app,/curatedProducts\('chaska_picks'/);
  assert.match(app,/\.filter\(b=>Number\(b\.productCount\)>0\)/);
  assert.match(app,/distinctBrandPicks/);
  assert.match(app,/chaskabox:home-config/);
});

test('no approved logo is referenced as a live header replacement',()=>{
  const html=read('index.html');
  assert.doesNotMatch(html,/Approved_Logo_Reference|ChaskaBox_Approved_Brand_Kit/);
});
