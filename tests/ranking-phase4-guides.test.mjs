import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const pages=['guides/index.html','guides/bachpan-snacks-pakistan/index.html','guides/choosing-a-snack-box/index.html','guides/how-chaskabox-orders-work/index.html'];
test('Phase 4 guides have contextual, crawlable help without inventing rankings or inventory',()=>{
 for(const file of pages){
  const html=read(file);
  assert.match(html,/class="guide-decision-help"/,file);
  assert.match(html,/href="\/shipping-policy\/"/,file);
  assert.match(html,/href="\/faq\/"/,file);
  assert.match(html,/guide-navigation-schema/,file);
  assert.match(html,/rel="canonical"/,file);
  assert.doesNotMatch(html,/guaranteed (InStock|stock)|#1 ranked|AI Overview guaranteed/i,file);
 }
});
test('Phase 4 guide paths link to real user journeys, no generated product or checkout mutations',()=>{
 const dir=read(pages[0]),child=read(pages[1]),packs=read(pages[2]),order=read(pages[3]);
 assert.match(dir,/href="\/category\/snacks-and-nimco\/"/);
 assert.match(child,/href="\/guides\/choosing-a-snack-box\/"/);
 assert.match(packs,/href="\/bundles\/"/);
 assert.match(order,/href="\/track-order\.html"/);
 assert.match(order,/payment screenshot/i);
});
