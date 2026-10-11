import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { reviewPatch } from '../functions/api/admin/reviews/[id].js';

test('saving a reply preserves pending moderation until an explicit decision',()=>{
 const pending={moderation_status:'pending',admin_reply:null};
 assert.deepEqual({...pending,...reviewPatch({action:'reply',reply:' Thank you '}).patch},{moderation_status:'pending',admin_reply:'Thank you'});
 assert.equal(reviewPatch({action:'approve'}).patch.moderation_status,'approved');
 assert.equal(reviewPatch({action:'reject'}).patch.moderation_status,'rejected');
 assert.throws(()=>reviewPatch({action:'reply'}),e=>e.status===400);
});
test('legacy editor data comes from every protected page and keeps hidden categories/photos',async()=>{
 const source=await readFile(new URL('../admin.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('  async function loadAdminData()'),source.indexOf('  // Exposed for admin-live.js:'));
 const requests=[],state={products:[],categories:[],drafts:{products:{}}};
 const ctx={window:{chaskaAdminApi:async path=>{requests.push(path);return {products:path.endsWith('=1')?[{id:1,category:'Public',image_url:'https://fixture.invalid/a.png'}]:[{id:2,category:'Hidden-only category',visibility:'hidden',image_url:'https://fixture.invalid/new.png'}],total_pages:2};}},state,checkAdminSession:async()=>true,hydrateSelectors(){},renderDashboard(){},renderBoxProducts(){},$:()=>({innerHTML:''})};
 vm.createContext(ctx);vm.runInContext(fn+'\nresult=loadAdminData();',ctx);assert.equal(await ctx.result,true);
 assert.equal(requests.length,2);assert.ok(requests.every(p=>p.startsWith('/api/admin/products')));
 assert.equal(state.products.length,2);assert.equal(state.products[1].img,'https://fixture.invalid/new.png');assert.ok(state.categories.includes('Hidden-only category'));
 ctx.checkAdminSession=async()=>false;requests.length=0;vm.runInContext('result=loadAdminData();',ctx);assert.equal(await ctx.result,false);assert.equal(requests.length,0);
});
