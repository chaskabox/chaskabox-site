import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('function hasStoredAccountSession(){'),source.indexOf("document.addEventListener('DOMContentLoaded',async()=>{"));
function stored(storage){return vm.runInNewContext(helper+'\nhasStoredAccountSession();',{localStorage:storage});}
test('a fresh guest and unrelated storage do not trigger Auth restoration',()=>{assert.equal(stored({length:0}),false);assert.equal(stored({length:2,key:i=>['chaskabox-cart','cb_orders'][i]}),false);});
test('existing Supabase session is detected without reading its credentials',()=>{assert.equal(stored({length:1,key:()=> 'sb-jtvswuvnasqqzrjysgfd-auth-token',getItem(){throw Error('Token contents must not be read');}}),true);});
test('unavailable browser storage leaves demand-based sign-in usable',()=>{assert.equal(stored({get length(){throw Error('Storage unavailable');}}),false);});
