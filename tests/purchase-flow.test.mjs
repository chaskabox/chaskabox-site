import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { csvCell } from '../functions/api/admin/_lib/csv.js';
import { validateOrderPayload } from '../functions/api/_lib/validate.js';
import { onRequestGet as loyaltyGet, onRequestPost as loyaltyPost } from '../functions/api/loyalty.js';

const checkout = await readFile(new URL('../checkout.js',import.meta.url),'utf8');
const storefront = await readFile(new URL('../app.js',import.meta.url),'utf8');
function browser(source, storage=new Map()) {
  const nodes=new Map(), scrolls=[];
  function element(){return {value:'',checked:false,hidden:false,disabled:false,textContent:'',innerHTML:'',style:{setProperty(){},removeProperty(){}},dataset:{},children:[],classList:{add(){},remove(){},toggle(){},contains(){return false;}},addEventListener(){},setAttribute(){},querySelector(){return null;},querySelectorAll(){return [];},appendChild(x){this.children.push(x);},scrollIntoView(){},focus(){},remove(){}};}
  const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const context={console,crypto:webcrypto,TextEncoder,URL,URLSearchParams,Response,Request,
    setTimeout(){return 0;},clearTimeout(){},setInterval(){return 0;},clearInterval(){},
    requestAnimationFrame(){return 0;},cancelAnimationFrame(){},
    matchMedia(){return {matches:true,addEventListener(){},removeEventListener(){}};},
    addEventListener(){},scrollTo(x){scrolls.push(x);},
    location:{pathname:'/cart/',origin:'https://fixture.invalid',search:'',hash:''},
    history:{pushState(){},replaceState(){}},navigator:{},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    document:{body:element(),documentElement:element(),addEventListener(){},createElement:element,getElementById:node,querySelector:s=>s.startsWith('#')?node(s.slice(1)):null,querySelectorAll:()=>[]}
  };
  context.window=context;vm.createContext(context);vm.runInContext(source,context);
  return {context,node,storage,scrolls,run:code=>vm.runInContext(code,context)};
}
const payload=()=>({items:[{product_id:1,qty:2}],customer:{name:'Ali Ahmed',phone:'03000000000',email:'a@mail.com',address:'Fixture Street 123',city:'Lahore',country:'Pakistan'},payment_method:'cod',transaction_reference:'',customer_note:'',turnstile_token:'first'});
function checkoutForm(b){
  const values={f_fname:'Ali',f_lname:'Ahmed',f_name:'Ali Ahmed',f_phone:'03000000000',f_ccode:'+92',f_email:'a@mail.com',f_addr:'Fixture Street 123',f_city:'Lahore',f_country:'Pakistan',f_reference:'',f_note:''};
  for(const [id,value] of Object.entries(values))b.node(id).value=value;
  b.run("PRODUCTS=[{id:1,name:'Fixture Snack',pack:'100g',price:200}];CART={1:2};");
}

test('cart with recommendations and an empty cart both render without an undefined helper',()=>{
  const b=browser(storefront);
  b.run("PRODUCTS=[{id:1,name:'Main snack',price:300,category:'Snacks & Nimco',active:true},{id:2,name:'Related snack',price:250,category:'Snacks & Nimco',active:true}];CART={1:2};renderCartPage();");
  assert.match(b.node('view-cart').innerHTML,/Related snack/);
  assert.match(b.node('view-cart').innerHTML,/Rs\. 600/);
  b.run('CART={};renderCartPage();');assert.match(b.node('view-cart').innerHTML,/bag is empty/);
});

test('lost-response retries, fresh bot tokens, item order and page reload retain one intent key',async()=>{
  const b=browser(checkout);const p=payload();b.context.intent=p;
  const first=await b.run('checkoutIdempotencyKey(intent)');
  p.turnstile_token='fresh';const second=await b.run('checkoutIdempotencyKey(intent)');assert.equal(second,first);
  const again=browser(checkout,b.storage);again.context.intent=p;assert.equal(await again.run('checkoutIdempotencyKey(intent)'),first);
  const stored=b.storage.get('chaskabox-checkout-intent-v1');
  for(const secret of ['Ali Ahmed','03000000000','a@mail.com','Fixture Street','Lahore'])assert.ok(!stored.includes(secret));
  p.items.push({product_id:2,qty:1});const multiple=await b.run('checkoutIdempotencyKey(intent)');
  p.items.reverse();assert.equal(await b.run('checkoutIdempotencyKey(intent)'),multiple);
});

test('meaningful changes rotate the intent and confirmed success clears it',async()=>{
  const b=browser(checkout);b.context.intent=payload();const first=await b.run('checkoutIdempotencyKey(intent)');
  b.context.intent.customer.address='Another Fixture Street';const second=await b.run('checkoutIdempotencyKey(intent)');assert.notEqual(second,first);
  b.context.intent.items[0].qty=3;const third=await b.run('checkoutIdempotencyKey(intent)');assert.notEqual(third,second);
  b.run('clearCheckoutIntent()');assert.equal(b.storage.has('chaskabox-checkout-intent-v1'),false);
  assert.notEqual(await b.run('checkoutIdempotencyKey(intent)'),third);
});

test('failed request keeps cart/key and resets consumed bot verification; retry confirms one order',async()=>{
  const b=browser(checkout);checkoutForm(b);let resets=0;const requests=[];let attempt=0;
  b.context.turnstile={getResponse:()=>attempt?'fresh-token':'first-token',reset:()=>resets++};
  b.context.fetch=async(path,options)=>{
    assert.equal(path,'/api/orders');requests.push(JSON.parse(options.body));attempt++;
    if(attempt===1)throw new Error('Response lost after commit');
    return new Response(JSON.stringify({order_id:'fixture-order',order_number:'CB-FIXTURE',total:777,idempotent_replay:true}),{status:200});
  };
  await b.run('placeOrder()');assert.equal(resets,1);assert.equal(b.run('CART[1]'),2);assert.equal(b.node('placeBtn').disabled,false);
  b.context.chaskaTrack=()=>{throw new Error('Analytics offline');};
  await b.run('placeOrder()');
  assert.equal(requests[0].idempotency_key,requests[1].idempotency_key);
  assert.notEqual(requests[0].turnstile_token,requests[1].turnstile_token);
  assert.equal(b.node('doneNo').textContent,'CB-FIXTURE');assert.equal(b.node('doneTotal').textContent,'Rs. 777');
  assert.equal(b.node('coMain').style.display,'none');assert.equal(b.node('coDone').style.display,'');assert.equal(b.run('Object.keys(CART).length'),0);
  assert.equal(b.storage.has('chaskabox-checkout-intent-v1'),false);assert.ok(b.scrolls.length>0);
});

test('invalid success response and unavailable intent storage never clear or submit the bag',async()=>{
  const b=browser(checkout);checkoutForm(b);b.context.fetch=async()=>new Response('{}',{status:201});
  await b.run('placeOrder()');assert.equal(b.run('CART[1]'),2);assert.equal(b.node('coMain').style.display,undefined);
  const offline=browser(checkout);checkoutForm(offline);let calls=0;
  offline.context.localStorage.setItem=()=>{throw new Error('Storage unavailable');};offline.context.fetch=async()=>{calls++;};
  await offline.run('placeOrder()');await offline.run('placeOrder()');assert.equal(calls,0);assert.equal(offline.run('CART[1]'),2);
});

test('remote product photos, valid common email addresses and Pakistan region work consistently',()=>{
  const b=browser(checkout);
  assert.equal(b.run("checkoutAssetUrl('https://photos.invalid/snack.png')"),'https://photos.invalid/snack.png');
  assert.equal(b.run("checkoutAssetUrl('images/snack.webp')"),'/images/snack.webp');
  for(const email of ['a@mail.com','user123@gmail.com','example.person+snacks@outlook.com']){
    b.context.email=email;assert.equal(b.run('validEmail(email)'),true);
    const p={...payload(),idempotency_key:webcrypto.randomUUID()};p.customer.email=email;
    assert.equal(validateOrderPayload(p).ok,true);
  }
  const foreign={...payload(),idempotency_key:webcrypto.randomUUID()};foreign.customer.country='Canada';
  assert.ok(validateOrderPayload(foreign).errors.some(x=>x.field==='customer.country'));
  b.run('populateCountries();populateCountryCodes();');assert.equal(b.node('f_country').value,'Pakistan');assert.equal(b.node('f_ccode').value,'+92');
});

test('CSV formulas/control prefixes become text while normal cells and numeric values retain meaning',()=>{
  for(const text of ['=1+1','+SUM(A1)','-1+2','@SUM(A1)',' \t=1+1','\tHello','\r=1+1']){
    const cell=csvCell(text);const unquoted=cell.startsWith('"')?cell.slice(1,-1).replace(/""/g,'"'):cell;
    assert.equal(unquoted,"'"+text);
  }
  assert.equal(csvCell(-20),'-20');assert.equal(csvCell('Normal text'),'Normal text');assert.equal(csvCell('a,"b"'),'"a,""b"""');assert.equal(csvCell(null),'');
});

test('unsupported loyalty endpoints fail closed without database or notification calls',async()=>{
  for(const fn of [loyaltyGet,loyaltyPost]){const r=await fn({});assert.equal(r.status,503);assert.equal((await r.json()).error.code,'FEATURE_UNAVAILABLE');}
});

test('a single-name customer does not need an invented surname',()=>{
  const b=browser(checkout);checkoutForm(b);b.node('f_lname').value='';
  assert.equal(b.run('checkForm()'),true);assert.equal(b.node('f_name').value,'Ali');
  const p={...payload(),idempotency_key:webcrypto.randomUUID()};p.customer.name='Ali';
  assert.equal(validateOrderPayload(p).ok,true);
});
