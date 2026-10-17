import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const content=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('final preview renders navigation and trust messaging without unsupported offers',()=>{
  const html=content('index.html');
  for(const token of ['class="cb-subnav"','class="cb-trust-rail"','cbBoxMedia','cbDealsMedia','final-homepage.css'])
    assert.ok(html.includes(token),token);
  assert.doesNotMatch(html,/Free Delivery on Orders Above Rs\. 2,500|Easy Returns|100% Guaranteed Savings/);
});
test('product images in category and editorial blocks come from the real catalogue',()=>{
  const js=content('app.js');
  assert.match(js,/featured\.img/);
  assert.match(js,/photoAttributes\(featured\.img/);
  assert.match(js,/photoAttributes\(p\.img,'150px'\)/);
  assert.match(js,/dealBanner\.hidden=!sale\.length/);
});
test('preview only preserves approved logo and payment integrations untouched',()=>{
  const html=content('index.html'),css=content('final-homepage.css');
  assert.match(html,/src="\/images\/logo-navy\.png"/);
  assert.doesNotMatch(html,/src="\/images\/new-approved-logo/);
  assert.doesNotMatch(css,/checkout|cod_advance|payment_gateway|whatsapp_api/i);
});
