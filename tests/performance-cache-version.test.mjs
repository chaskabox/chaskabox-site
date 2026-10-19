import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {utilityPage} from '../functions/api/_lib/utility-page.js';
const root=new URL('../',import.meta.url);
const pages=['index.html','shop/index.html','bundles/index.html','brands/index.html'];
for(const slug of ['betel-nuts-and-pan-masala','biscuits-and-wafers','bunties-and-cakes','chews-and-gums','chocolates-and-candies','imli-and-ice-lollies','jellies-and-marshmallow','snacks-and-nimco'])pages.push('category/'+slug+'/index.html');
test('all storefront entry routes load the same versioned UX application and carousel',()=>{
  for(const path of pages){
    const html=readFileSync(new URL(path,root),'utf8');
    assert.match(html,/\/storefront-bundle\.css\?v=20261019-ui37/,path);
    assert.match(html,/\/app\.js\?v=20261019-ui37/,path);
    assert.match(html,/\/home-hero-carousel\.js\?v=20261019-hero2/,path);
    assert.doesNotMatch(html,/\/(?:styles\.css|app\.js)\?v=20261012-release\?v=/,path);
  }
});
test('admin content modules are revalidated after a release and avoid long-lived browser caching',()=>{
 const live=readFileSync(new URL('admin-live.js',root),'utf8');
 const headers=readFileSync(new URL('_headers',root),'utf8');
 for(const module of ['admin-pages','admin-ai-center']){
  assert.ok(live.includes('./'+module+'.js?v=20261018-content2'),module);
  assert.ok(headers.includes('/'+module+'.js\n  Cache-Control: no-store'),module);
 }
});
test('rendered utility pages inherit the current storefront script version from the shared shell',async()=>{
 const shell=readFileSync(new URL('index.html',root),'utf8');
 const response=await utilityPage({request:new Request('https://chaskabox.online/account/'),env:{ASSETS:{fetch:async()=>new Response(shell)}}},'account','/account/','My Account','Your account');
 const html=await response.text(),application=/<script\b[^>]*src="([^\"]*\/app\.js\?v=[^\"]+)"/;
 assert.equal(response.status,200);
 assert.equal(html.match(application)?.[1],shell.match(application)?.[1]);
 assert.doesNotMatch(html,/data-home-preload/);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
});
