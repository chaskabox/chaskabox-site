import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {packingVideoSource} from '../packing-video.js';
import {onRequestPost as submitReview} from '../functions/api/reviews.js';

const widget=await readFile(new URL('../reviews-widget.js',import.meta.url),'utf8');
function reviewsBrowser(fetch){
 const listeners={},msg={textContent:''},button={disabled:false},text={value:'My own experience'},rating={value:'3'};
 const form={querySelector:s=>s==='.rw-msg'?msg:s==='.rw-submit'?button:s.startsWith('input')?rating:text,addEventListener:(k,f)=>{listeners[k]=f;}};
 const retry={addEventListener:(k,f)=>{listeners.retry=f;}};
 const root={innerHTML:'',querySelector:s=>s==='[data-rw-form]'?form:s==='[data-rw-retry]'?retry:null};
 const ctx={window:{},document:{querySelector:()=>root},fetch,Date};
 vm.createContext(ctx);vm.runInContext(widget.replace('window.ReviewsWidget = { mount };','window.ReviewsWidget = { mount, submitReview };'),ctx);
 return {root,form,msg,button,text,rating,listeners,api:ctx.window.ReviewsWidget};
}
test('approved guest reviews do not receive a verified-purchase claim or an automatic five-star selection',async()=>{
 const b=reviewsBrowser(async()=>Response.json({count:2,avg_rating:3,reviews:[{rating:2,review_text:'<script>guest</script>',verified_purchase:false},{rating:4,review_text:'Delivered purchase',verified_purchase:true}]}));
 await b.api.mount(b.root,39);
 assert.match(b.root.innerHTML,/2 reviews/);assert.doesNotMatch(b.root.innerHTML,/verified reviews/);
 assert.equal((b.root.innerHTML.match(/class="rw-verified"/g)||[]).length,1);
 assert.doesNotMatch(b.root.innerHTML,/<script>guest/);assert.match(b.root.innerHTML,/&lt;script&gt;guest/);
 assert.doesNotMatch(b.root.innerHTML,/name="rating"[^>]*checked/);
 assert.match(b.root.innerHTML,/will be public if approved/);
});
test('review load failure offers a real retry instead of an invented empty state',async()=>{
 let attempts=0;const b=reviewsBrowser(async()=>++attempts===1?new Response('Outage',{status:503}):Response.json({count:0,reviews:[]}));
 await b.api.mount(b.root,39);assert.match(b.root.innerHTML,/temporarily unavailable/);assert.doesNotMatch(b.root.innerHTML,/No reviews yet/);
 await b.listeners.retry();assert.equal(attempts,2);assert.match(b.root.innerHTML,/No reviews yet/);
});
test('review submission keeps customer input on failure and requires their rating choice',async()=>{
 let requests=0;const b=reviewsBrowser(async()=>{requests++;return Response.json({error:{message:'Outage'}},{status:503});});
 b.rating.value='';await b.api.submitReview(b.form,39);assert.equal(requests,0);
 b.rating.value='2';await b.api.submitReview(b.form,39);assert.equal(requests,1);
 assert.equal(b.text.value,'My own experience');assert.equal(b.button.disabled,false);assert.match(b.msg.textContent,/Outage/);
});
test('packing video accepts one supported video and rejects credential, lookalike and executable URLs',()=>{
 assert.equal(packingVideoSource(''),null);
 assert.deepEqual(packingVideoSource('/videos/packing.mp4'),{type:'mp4',src:'/videos/packing.mp4'});
 for(const u of ['https://youtu.be/abcdefghijk','https://www.youtube.com/watch?v=abcdefghijk','https://www.youtube.com/shorts/abcdefghijk'])assert.deepEqual(packingVideoSource(u),{type:'youtube',src:'https://www.youtube-nocookie.com/embed/abcdefghijk'});
 assert.equal(packingVideoSource('https://chaskabox.online/videos/packing.mp4').type,'mp4');
 for(const u of ['javascript:alert(1)','https://youtube.com.evil.invalid/embed/abcdefghijk','https://www.youtube.com/@channel','https://user:secret@youtube.com/watch?v=abcdefghijk','//evil.invalid/a.mp4','/videos/../private.mp4','https://external.invalid/a.mp4',12])assert.throws(()=>packingVideoSource(u));
});
test('untrusted public review fields cannot approve a review or claim a verified purchase',async()=>{
 const original=globalThis.fetch;let inserted;
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url);
  if(u.pathname.endsWith('/rpc/take_rate_limit_token'))return Response.json([{allowed:true}]);
  if(u.pathname.endsWith('/products'))return Response.json([{id:39,visibility:'visible'}]);
  if(u.pathname.endsWith('/reviews')){inserted=JSON.parse(options.body);return Response.json([{id:1,rating:2,moderation_status:'pending'}]);}
  throw new Error('Unexpected fixture route');
 };
 try{
  const result=await submitReview({env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic'},request:new Request('https://fixture.invalid/api/reviews',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({product_id:39,rating:2,text:'Synthetic review',verified_purchase:true,moderation_status:'approved',order_id:'invented'})})});
  assert.equal(result.status,201);assert.equal(inserted.moderation_status,'pending');assert.equal(inserted.verified_purchase,false);assert.equal(inserted.order_id,null);
 }finally{globalThis.fetch=original;}
});
