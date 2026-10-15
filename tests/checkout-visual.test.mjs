import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
test('checkout is visibly restructured and uses a checkout-only style layer',async()=>{
 const page=await readFile(new URL('../checkout.html',import.meta.url),'utf8');
 const css=await readFile(new URL('../checkout-ui.css',import.meta.url),'utf8');
 for(const s of ['class="checkout-page"','checkout-intro','checkout-progress','checkout-guest-note','checkout-section-heading','checkout-summary-heading','checkout-coupon-row','checkout-totals','checkout-verification','checkout-ui.css?v=20261015-premium-v2'])assert.ok(page.includes(s),s);
 assert.match(css,/\.checkout-page \.checkout-coupon-row button/);
 assert.match(css,/#coMain\.co-wrap\{max-width:1216px/);
 assert.match(css,/@media\(max-width:400px\)/);
 assert.match(page,/id="f_city"/);
 assert.match(page,/id="placeBtn"/);
 assert.match(page,/id="f_reference"/);
 assert.match(page,/data-sitekey="0x4AAAAAAFSB7MA4c2HdDcdf"/);
 assert.match(page,/Overseas shipping is not yet available/);
});
test('real Turnstile stays server-verified while compact mode protects extra-small viewports',async()=>{
 const html=await readFile(new URL('../checkout.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../checkout.js',import.meta.url),'utf8');
 assert.match(html,/turnstile\/v0\/api\.js" defer/);
 assert.match(html,/data-size="flexible"/);
 assert.match(js,/max-width: 360px/);
 assert.match(js,/dataset\.size/);
 assert.doesNotMatch(js,/TURNSTILE_SECRET_KEY/);
 assert.match(html,/Edit shopping bag/);
 assert.match(html,/Estimated total/);
 assert.match(js,/Verified total/);
});
