import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {onRequestGet} from '../functions/product/[[slug]].js';

test('a slow product lookup does not postpone the independent HTML shell read',async t=>{
 const shell=await readFile(new URL('../index.html',import.meta.url),'utf8');
 let releaseProduct,releaseShell,productStarted=false,shellStarted=false;
 const productWait=new Promise(resolve=>{releaseProduct=resolve;});
 const shellWait=new Promise(resolve=>{releaseShell=resolve;});
 t.mock.method(globalThis,'fetch',async url=>{productStarted=true;
  const selected=new URL(url).searchParams.get('select').split(',');
  assert.ok(selected.includes('price')&&selected.includes('stock_state')&&selected.includes('seo_description'));
  assert.ok(!selected.includes('*')&&!selected.some(field=>field.startsWith('ai_embedding')),'PDP must not transfer unused AI vectors');
  await productWait;return Response.json([{id:39,name:'Synthetic product',visibility:'visible',price:100,pack:'Pack of 1',image_url:'images/p39.webp'}]);});
 const pending=onRequestGet({params:{slug:'39'},request:new Request('https://example.invalid/product/39/'),env:{SUPABASE_URL:'https://fixture.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',ASSETS:{fetch:async()=>{shellStarted=true;await shellWait;return new Response(shell);}}}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(productStarted,true);
 assert.equal(shellStarted,true,'shell read must start before the database resolves');
 releaseShell();releaseProduct();
 const response=await pending;
 assert.equal(response.status,200);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.match(await response.text(),/<h1>Synthetic product<\/h1>/);
});
