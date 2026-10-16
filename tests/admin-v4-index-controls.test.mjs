import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Admin Orders quick views rely on authenticated existing GET filters, never dispatch',()=>{
 const html=read('admin.html'),js=read('admin-live.js');
 assert.match(html,/id="orderQuickViews"/);
 assert.match(html,/data-order-view="new"/);
 assert.match(html,/data-order-view="payment_submitted"/);
 assert.match(html,/data-order-view="dispatched"/);
 assert.match(html,/id="orderActiveView" role="status" aria-live="polite"/);
 assert.match(js,/function syncOrderQuickViews\(/);
 assert.match(js,/button\.dataset\.orderView==='payment_submitted'/);
 assert.match(js,/button\.dataset\.orderView==='dispatched'/);
 assert.match(js,/loadOrders\(1\)/);
 const endpoint=read('functions/api/admin/orders/index.js');
 assert.match(endpoint,/withAdmin\(\['owner', 'manager', 'fulfilment'\]/);
 assert.match(endpoint,/sp\.get\('payment_status'\)/);
 assert.match(endpoint,/sp\.get\('fulfilment_status'\)/);
});
test('Product quality & sort are page-scoped with truthfully labeled result counts',()=>{
 const html=read('admin.html'),js=read('admin-live.js');
 assert.match(html,/id="productQuality"/);
 assert.match(html,/value="missing_image"/);
 assert.match(html,/value="missing_seo"/);
 assert.match(html,/id="productSort"/);
 assert.match(html,/value="price_asc"/);
 assert.match(html,/id="productResultCount" role="status" aria-live="polite"/);
 assert.match(js,/if\(quality==='missing_image'/);
 assert.match(js,/if\(quality==='missing_seo'/);
 assert.match(js,/if\(sort==='price_asc'\)/);
 assert.match(js,/sort==='price_desc'/);
 assert.match(js,/productTotalPages>1\?' Filters and sorting apply only to this loaded page\./);
 assert.match(js,/if\(\$\('#productQuality'\)\)\$\('#productQuality'\)\.value=''/);
 const endpoint=read('functions/api/admin/products/index.js');
 assert.match(endpoint,/pagination\(url, 1000, 1000\)/);
 assert.match(endpoint,/withAdmin\(\['owner', 'manager', 'content'\]/);
});
test('Shortcuts never reveal role-hidden Admin panels',()=>{
 const ui=read('admin.js');
 assert.match(ui,/allowedNav\.hidden\|\|allowedNav\.style\.display==='none'/);
 assert.match(ui,/getAttribute\('aria-hidden'\)==='true'/);
});
test('Synthetic V4 preview demonstrates the same index controls without real API/PII',()=>{
 const html=read('admin-v4-demo.html'),js=read('admin-v4-demo.js');
 assert.match(html,/id="demoOrderQuickViews"/);
 assert.match(html,/data-demo-order-view="payment_submitted"/);
 assert.match(html,/id="demoProductQuality"/);
 assert.match(html,/id="demoProductSort"/);
 assert.match(html,/CB-EXAMPLE-001/);
 assert.match(html,/synthetic example orders/);
 assert.match(js,/const orderChoices=all\('\[data-demo-order-view\]'\)/);
 assert.match(js,/filter==='missing_image'/);
 assert.doesNotMatch(js,/\bfetch\(|\/api\/admin\/|access_token|signInWithPassword/);
});
