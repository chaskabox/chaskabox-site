import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequest as createOrder} from '../functions/api/orders.js';
import {onRequest as trackOrder} from '../functions/api/track-order.js';

const fixtures=[
  {name:'order creation',path:'/api/orders',handler:createOrder,capacity:10,perMinute:30},
  {name:'guest order tracking',path:'/api/track-order',handler:trackOrder,capacity:20,perMinute:60},
];
const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'};
const makeRequest=path=>new Request('https://chaskabox.example.invalid'+path,{
  method:'POST',headers:{'cf-connecting-ip':'192.0.2.15','content-type':'application/json'},body:'{}',
});

test('public order endpoints enforce bounded, endpoint-specific rate limits and Retry-After',async()=>{
  const original=globalThis.fetch;
  const inputs=[];
  globalThis.fetch=async(url,options={})=>{
    assert.equal(new URL(url).pathname,'/rest/v1/rpc/take_rate_limit_token');
    inputs.push(JSON.parse(options.body));
    return Response.json([{allowed:false,retry_after_sec:17}]);
  };
  try{
    for(const fixture of fixtures){
      inputs.length=0;
      const response=await fixture.handler({request:makeRequest(fixture.path),env});
      assert.equal(response.status,429,fixture.name);
      assert.equal(response.headers.get('Retry-After'),'17',fixture.name);
      assert.equal(inputs.length,1,fixture.name);
      assert.equal(inputs[0].p_capacity,fixture.capacity,fixture.name);
      assert.equal(inputs[0].p_per_minute,fixture.perMinute,fixture.name);
      assert.match(inputs[0].p_key,/^[a-f0-9]{64}$/,fixture.name);
    }
  }finally{globalThis.fetch=original;}
});

test('order and tracking endpoints fail closed when rate limit storage is unavailable',async()=>{
  const original=globalThis.fetch;
  const oldLog=console.error;
  globalThis.fetch=async()=>{throw new Error('Synthetic limiter outage');};
  console.error=()=>{};
  try{
    for(const fixture of fixtures){
      const response=await fixture.handler({request:makeRequest(fixture.path),env});
      assert.equal(response.status,429,fixture.name);
      assert.equal(response.headers.get('Retry-After'),'60',fixture.name);
    }
  }finally{globalThis.fetch=original;console.error=oldLog;}
});
