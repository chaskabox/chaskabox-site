import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
test('checkout is visibly restructured and uses a checkout-only style layer',async()=>{
 const page=await readFile(new URL('../checkout.html',import.meta.url),'utf8');
 const css=await readFile(new URL('../checkout-ui.css',import.meta.url),'utf8');
 for(const s of ['class="checkout-page"','checkout-intro','checkout-progress','checkout-guest-note','checkout-section-heading','checkout-summary-heading','checkout-coupon-row','checkout-totals','checkout-verification','checkout-ui.css?v=20261017-checkout-compact-v3'])assert.ok(page.includes(s),s);
 assert.match(css,/\.checkout-page \.checkout-coupon-row button/);
 assert.match(css,/#coMain\.co-wrap\{max-width:1216px/);
 assert.match(css,/@media\(max-width:400px\)/);
 assert.match(page,/id="f_city"/);
 assert.match(page,/id="placeBtn"/);
 assert.match(page,/id="f_reference"/);
 assert.match(page,/data-sitekey="0x4AAAAAAFSB7MA4c2HdDcdf"/);
 assert.match(page,/Overseas shipping is not yet available/);
 const phoneInput=page.match(/<input\b[^>]*\bid="f_phone"[^>]*>/)?.[0];
 assert.ok(phoneInput,'Checkout must expose a phone field');
 assert.match(phoneInput,/placeholder="03XXXXXXXXX"/,'Use a neutral Pakistani mobile placeholder');
 assert.doesNotMatch(phoneInput,/\bvalue="/,'Never publish a personal phone in the default form');
 assert.match(phoneInput,/autocomplete="tel-national"/,'Preserve browser phone autofill');
});
test('real Turnstile stays server-verified while compact mode protects extra-small viewports',async()=>{
 const html=await readFile(new URL('../checkout.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../checkout.js',import.meta.url),'utf8');
 assert.match(html,/turnstile\/v0\/api\.js\?render=explicit&amp;onload=checkoutTurnstileReady" defer/);
 assert.match(html,/data-size="flexible"/);
 assert.match(js,/renderCheckoutBotCheck/);
 assert.match(js,/turnstile\.render\(widget/);
 assert.match(js,/getResponse\(checkoutTurnstileWidgetId/);
 assert.match(js,/max-width: 360px/);
 assert.match(js,/dataset\.size/);
 assert.doesNotMatch(js,/TURNSTILE_SECRET_KEY/);
 assert.match(html,/Edit shopping bag/);
 assert.match(html,/Estimated total/);
 assert.match(js,/Verified total/);
  assert.match(js,/FREE_PREPAID_ENABLED/);
});

test('guided checkout has accessible separate delivery, payment and review stages',async()=>{
 const html=await readFile(new URL('../checkout.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../checkout.js',import.meta.url),'utf8');
 const css=await readFile(new URL('../checkout-ui.css',import.meta.url),'utf8');
 for(const id of ['checkoutDeliveryStep','checkoutPaymentStep','checkoutPackingOption','checkoutReviewStep','toPaymentBtn','toReviewBtn','editDeliveryBtn','editPaymentBtn','backDeliveryBtn','backPaymentBtn','checkoutVerification','checkoutStepAnnounce']){
   assert.match(html,new RegExp('id="'+id+'"'),id);
 }
 assert.match(html,/id="checkoutPaymentStep" hidden/);
 assert.match(html,/id="f_whatsapp_optin" name="whatsapp_opt_in" value="true"/);
 assert.ok(html.indexOf('id="f_whatsapp_optin"')<html.indexOf('id="checkoutPaymentStep"'),'Consent should appear before payment');
 assert.doesNotMatch(html,/id="checkoutExtrasStep"/);
 assert.match(html,/id="checkoutReviewStep" hidden/);
 assert.match(html,/id="placeBtn" type="button" hidden disabled/);
 assert.match(html,/checkout\.js\?v=20261018-audit1/);
 assert.match(css,/\.checkout-page \[hidden\]\{display:none!important\}/);
 assert.match(js,/function checkForm\(scope = 'all'\)/);
 assert.match(js,/await refreshQuote\(\);\s*showCheckoutStep\(3\)/);
 assert.match(js,/\.textContent=value/);
 assert.match(js,/if\(step===3\)\{updateCheckoutReview\(\);renderCheckoutBotCheck\(\);\}/);
});

test('Pakistan region selector precedes city and preserves manual locality fallback',async()=>{
 const html=await readFile(new URL('../checkout.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../checkout.js',import.meta.url),'utf8');
 const dataset=await readFile(new URL('../pakistan-locations.js',import.meta.url),'utf8');
 assert.ok(html.indexOf('id="f_province"')<html.indexOf('id="f_city"'));
 for(const region of ['Punjab','Sindh','Balochistan','Islamabad','Azad Kashmir','Gilgit Baltistan','Khyber Pakhtunkhwa'])
  assert.match(html,new RegExp('value="'+region+'"'));
 assert.match(html,/id="f_city"[^>]*list="pkCities"[^>]*disabled/);
 assert.match(html,/Not listed\? Type your city or town|id="cityHelp"/);
 assert.match(html,/pakistan-locations\.js\?v=20261017-pk-regions-v1/);
 assert.match(js,/function renderCheckoutCitySuggestions/);
 assert.match(js,/Province \/ Region: /);
 assert.match(dataset,/CC BY 4\.0/);
 assert.doesNotMatch(dataset,/https?:\/\/[^'"]+\.js/);
});
