import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectBaseline,REQUIRED_TABLES,REQUIRED_COLUMNS,MIGRATION_ORDER} from '../tools/ai-release-preflight.mjs';
function full(){
 return {tables:[...REQUIRED_TABLES],columns:Object.fromEntries(
  Object.entries(REQUIRED_COLUMNS).map(([table,cols])=>[table,[...cols]]))};
}
test('M00-M05 baseline compatibility passes with complete safe schema only',()=>{
 const report=inspectBaseline(full());
 assert.equal(report.compatible,true);
 assert.equal(report.productionAuthorized,false);
 assert.equal(report.missingTables.length,0);
 assert.equal(report.migrationOrder.length,5);
});
test('M00-M05 existing older staging is blocked with exact missing-table/column explanations',()=>{
 const v=full();
 for(const t of ['product_versions','ai_usage','funnel_events','notification_deliveries'])v.tables=v.tables.filter(x=>x!==t);
 v.columns.products=v.columns.products.filter(x=>!['seo_title','seo_description'].includes(x));
 const r=inspectBaseline(v);
 assert.equal(r.compatible,false);
 assert.deepEqual(r.missingTables,['product_versions','notification_deliveries','ai_usage','funnel_events']);
 assert.deepEqual(r.missingColumns,['products.seo_title','products.seo_description']);
 assert.equal(r.productionAuthorized,false);
});
test('M00-M05 invalid snapshot fails closed and cannot authorize production',()=>{
 assert.equal(inspectBaseline({tables:[],columns:{}}).compatible,false);
 assert.equal(inspectBaseline({tables:'hello',columns:{}}).compatible,false);
 assert.equal(inspectBaseline({}).productionAuthorized,false);
});
test('M00-M05 migration order is explicit and inspector SQL is read-only',async()=>{
 assert.equal(MIGRATION_ORDER[0].includes('m0_internal_table_grants'),true);
 assert.equal(MIGRATION_ORDER[4].includes('m04_marketing_draft_approvals'),true);
 const query=await readFile(new URL('../tools/ai-release-inspect.sql',import.meta.url),'utf8');
 assert.match(query,/information_schema\.tables/);
 assert.match(query,/information_schema\.columns/);
 const queryWithoutComments=query.split('\n').filter(s=>!s.trim().startsWith('--')).join('\n');
 assert.doesNotMatch(queryWithoutComments,/\b(ALTER|CREATE|DROP|DELETE|INSERT|UPDATE|TRUNCATE|CALL)\b/i);
});
