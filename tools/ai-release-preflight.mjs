#!/usr/bin/env node
/**
 * M00-M05 offline baseline schema compatibility preflight.
 * NO database connection, credentials, migration, network or production deploy.
 * Input is the JSON produced by tools/ai-release-inspect.sql.
 * A PASS means schema objects are present, not owner approval or release safety.
 */
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const REQUIRED_TABLES=Object.freeze([
 'api_rate_limits','customer_notification_outbox','notification_outbox',
 'order_status_events','product_versions','orders','products',
 'notification_deliveries','ai_usage','funnel_events','admin_roles','audit_log'
]);
export const REQUIRED_COLUMNS=Object.freeze({
 products:['id','name','visibility','stock_state','updated_at','seo_title','seo_description','image_url'],
 orders:['created_at','payment_method','payment_status','fulfilment_status','total'],
 notification_deliveries:['status','delivery_status'],
 ai_usage:['created_at','success'],
 funnel_events:['created_at','event'],
 admin_roles:['user_id','role','active'],
 audit_log:['actor_id','actor_role','action','entity_type','entity_id','before_data','after_data']
});
export const MIGRATION_ORDER=Object.freeze([
 '20261014170000_m0_internal_table_grants.sql',
 '20261014200000_m01_agent_infrastructure.sql',
 '20261014210000_m02_monitoring_snapshots.sql',
 '20261014220000_m03_insight_signals.sql',
 '20261014230000_m04_marketing_draft_approvals.sql'
]);
const plain=o=>o&&typeof o==='object'&&!Array.isArray(o);
export function inspectBaseline(snapshot){
 if(!plain(snapshot)||!Array.isArray(snapshot.tables)||!plain(snapshot.columns))
  return {compatible:false,error:'invalid_schema_snapshot',missingTables:[],missingColumns:[],migrationOrder:MIGRATION_ORDER,productionAuthorized:false};
 const tables=new Set(snapshot.tables.filter(x=>typeof x==='string'));
 const missingTables=REQUIRED_TABLES.filter(t=>!tables.has(t));
 const missingColumns=[];
 for(const [table,columns] of Object.entries(REQUIRED_COLUMNS)){
  if(!tables.has(table))continue;
  const found=new Set(Array.isArray(snapshot.columns[table])?snapshot.columns[table]:[]);
  for(const c of columns)if(!found.has(c))missingColumns.push(table+'.'+c);
 }
 return {compatible:missingTables.length===0&&missingColumns.length===0,
  missingTables,missingColumns,migrationOrder:MIGRATION_ORDER,
  productionAuthorized:false,
  message:'Baseline compatibility only. Production authorization also requires MFA, restore, branch protection, DB backup, security reviews and human approval.'};
}
async function main(){
 const args=process.argv.slice(2);const pos=args.indexOf('--input');
 if(pos<0||!args[pos+1]||!['staging','production'].includes(args[args.indexOf('--target')+1])){
  console.error('Usage: node tools/ai-release-preflight.mjs --input schema.json --target staging|production');
  process.exitCode=2;return;
 }
 let data;
 try{data=JSON.parse(await readFile(args[pos+1],'utf8'));}
 catch{console.error('Unable to read schema snapshot');process.exitCode=2;return;}
 const result=inspectBaseline(data);
 console.log(JSON.stringify({target:args[args.indexOf('--target')+1],...result},null,2));
 if(!result.compatible)process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 await main();
