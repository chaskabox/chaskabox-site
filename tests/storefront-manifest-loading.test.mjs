import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../site-runtime.js',import.meta.url),'utf8');
function runtime({seed=null,fetch}={}){
 const window={};
 const document={readyState:'loading',addEventListener(){},getElementById(id){return id==='current-storefront-config'&&seed!==null?{textContent:JSON.stringify(seed)}:null;}};
 vm.runInNewContext(source,{window,document,fetch,console});return window;
}
test('concurrent storefront consumers share one fetch and the same response',async()=>{
 let calls=0;const manifest={settings:{delivery_estimate:'4-7 days'},categories:[],sections:[]};
 const win=runtime({fetch:async()=>{calls++;await Promise.resolve();return {ok:true,json:async()=>manifest};}});
 const [app,runtimeData]=await Promise.all([win.loadStorefrontManifest(),win.loadStorefrontManifest()]);
 assert.equal(calls,1);assert.equal(app,manifest);assert.equal(runtimeData,app);
 assert.equal(await win.loadStorefrontManifest(),app);assert.equal(calls,1);
});
test('server-rendered public manifest avoids network reads',async()=>{
 let calls=0;const win=runtime({seed:{settings:{},categories:[],sections:[]},fetch:async()=>{calls++;throw Error('Unexpected network');}});
 const data=await win.loadStorefrontManifest();assert.equal(Array.isArray(data.categories),true);assert.equal(calls,0);
});
test('an outage is not retained and a later request can recover',async()=>{
 let calls=0;const win=runtime({fetch:async()=>{calls++;return calls===1?{ok:false}:{ok:true,json:async()=>({settings:{},categories:[]})};}});
 await assert.rejects(win.loadStorefrontManifest(),/Store settings unavailable/);
 await win.loadStorefrontManifest();assert.equal(calls,2);
});
