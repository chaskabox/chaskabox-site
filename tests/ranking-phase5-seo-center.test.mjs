import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditPublicProducts,seoCsv} from '../admin-seo-center.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('SEO Center audit only counts visible products and does not misclassify OG fallback as critical',()=>{
 const report=auditPublicProducts([{id:1,visibility:'visible',name:'A',seo_title:'Repeat',seo_description:'Good',image_url:'images/a.webp',og_image:null},{id:2,visibility:'visible',name:'B',seo_title:'repeat',seo_description:'',image_url:''},{id:3,visibility:'hidden',name:'Hidden'}]);
 assert.equal(report.visible,2);assert.equal(report.duplicateTitle,2);assert.equal(report.missingDescription,1);assert.equal(report.missingImage,1);assert.equal(report.socialFallback,2);
 assert.ok(report.entries.every(e=>e.id!==3));
});
test('Export escapes spreadsheet formulas',()=>{
 const csv=seoCsv([{id:1,name:'=CMD',title:'+SUM(1,2)',description:'Safe',category:'Biscuits',flags:[],updated:'today'}]);
 assert.match(csv,/"'=CMD"/);assert.match(csv,/"'\+SUM/);assert.match(csv,/\r\n/);
});
test('SEO Center uses role gated existing authenticated editors not a new mutation endpoint',()=>{
 const admin=read('admin.html'),live=read('admin-live.js'),center=read('admin-seo-center.js');
 assert.match(admin,/data-view="seo"/);assert.match(admin,/id="view-seo"/);
 assert.match(live,/seo:\['owner','manager','content'\]/);assert.match(live,/if\(name==='seo'\)/);
 assert.match(live,/openLiveProduct\(id\)/);assert.match(center,/\/api\/admin\/products\?per_page=1000&page=/);
 assert.doesNotMatch(center,/method:\s*['"](?:POST|PUT|PATCH|DELETE)/);
});
