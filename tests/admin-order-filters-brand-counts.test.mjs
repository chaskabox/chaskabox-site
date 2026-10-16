import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('owner Orders filter controls match all server-recognized search dimensions',async()=>{
 const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
 for(const name of ['orderSearch','orderStatusFilter','orderPaymentFilter','orderMethodFilter','orderDateFrom','orderDateTo','orderResetFilters','orderExportCsv','orderFilterFeedback'])assert.ok(html.includes('id="'+name+'"'),name);
 for(const queryName of ['fulfilment_status','payment_status','method','date_from','date_to'])assert.ok(js.includes("sp.set('"+queryName+"'"),queryName);
 assert.match(js,/addEventListener\('change',\(\)=>\{syncOrderQuickViews\(\);loadOrders\(1\);\}\)/);
 assert.match(js,/Number\.isSafeInteger\(page\)/);
 assert.match(js,/roleAllows\('owner','manager'\)/);
 assert.match(js,/orders\/export\.csv/);
 assert.match(js,/sequence!==orderRequestSequence/);
});
test('brand counts prefer explicit product brand and normalize name for matching',async()=>{
 const source=await readFile(new URL('../functions/api/admin/brands/index.js',import.meta.url),'utf8');
 assert.match(source,/select=name,brand&limit=2000/);
 assert.match(source,/String\(p\.brand\|\|''\)\.trim\(\)/);
 assert.match(source,/toLocaleLowerCase\('en-US'\)/);
});
