import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
test('checkout is visibly restructured and uses a checkout-only style layer',async()=>{
 const page=await readFile(new URL('../checkout.html',import.meta.url),'utf8');
 const css=await readFile(new URL('../checkout-ui.css',import.meta.url),'utf8');
 for(const s of ['class="checkout-page"','checkout-intro','checkout-progress','checkout-guest-note','checkout-section-heading','checkout-summary-heading','checkout-coupon-row','checkout-totals','checkout-verification','checkout-ui.css?v=20261015-premium-v1'])assert.ok(page.includes(s),s);
 assert.match(css,/\.checkout-page \.checkout-coupon-row button/);
 assert.match(css,/#coMain\.co-wrap\{max-width:1216px/);
 assert.match(css,/@media\(max-width:400px\)/);
 assert.match(page,/id="f_city"/);
 assert.match(page,/id="placeBtn"/);
 assert.match(page,/id="f_reference"/);
 assert.match(page,/data-sitekey="0x4AAAAAAFSB7MA4c2HdDcdf"/);
 assert.match(page,/Overseas shipping is not yet available/);
});