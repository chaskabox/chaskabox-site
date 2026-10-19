import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const readText=path=>readFileSync(new URL(path,root),'utf8');

test('header category dropdown uses the same HQ photography as homepage',()=>{
  const home=readText('approved-category-art.css');
  const dropdown=readText('header-discovery-preview.css');
  const index=readText('index.html');
  const asset='/category-art/approved-category-sprite-hq-20261018.webp';
  assert.ok(home.includes(asset),'Homepage HQ sprite reference missing');
  assert.ok(dropdown.includes(asset),'Dropdown must use identical HQ sprite');
  assert.doesNotMatch(dropdown,/approved-category-sprite-20261018\\.webp/,'Legacy low-resolution image must not be used');
  assert.ok(index.includes('header-discovery-preview.css?v=20261019-header4'),'Bust browser caches for updated images');
  const img=readFileSync(new URL('category-art/approved-category-sprite-hq-20261018.webp',root));
  assert.ok(img.length>30000,'Dropdown must not regress to tiny highly compressed image');
  assert.equal(img.toString('ascii',0,4),'RIFF');
  assert.equal(img.toString('ascii',8,12),'WEBP');
});
