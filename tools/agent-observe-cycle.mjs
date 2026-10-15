/* Optional deterministic observation cycle. No model costs or external mutations.
   Writes private M01 receipts only after '--commit-observations' and DB enabled=true. */
import {spawnSync} from 'node:child_process';
export const AGENTS=['orders','inventory','security','backups','support','seo','marketing','analytics'];
const ACTION={orders:'scan',inventory:'scan',security:'scan',backups:'scan',support:'summarize',seo:'scan',marketing:'summarize',analytics:'summarize'};
export function cycleKey(agent,at=new Date()){
 if(!AGENTS.includes(agent)||!Number.isFinite(at.getTime()))throw Error('Invalid agent');
 return 'observe:'+agent+':'+at.toISOString().slice(0,10)+':'+String(Math.floor(at.getUTCHours()/6)*6).padStart(2,'0');
}
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
export function evaluateRun(run,maxHours,now=Date.now()){
 const age=Date.parse(run?.created_at||'');
 if(!Number.isFinite(age)||age>now||now-age>maxHours*3600000)return 'unknown';
 return run.conclusion==='success'?'ok':'attention';
}
export function assess(data={},github={}){
 const counts=(source,fields,warnings)=>{
  if(!source||fields.some(k=>source[k]===null||source[k]===undefined||!Number.isSafeInteger(Number(source[k]))||Number(source[k])<0))return 'unknown';
  return warnings.some(k=>Number(source[k])>0)?'attention':'ok';
 };
 return {
 orders:counts(data.orders,['stale_new_orders','payment_reviews','overdue_open_orders','notification_failures'],['stale_new_orders','payment_reviews','overdue_open_orders','notification_failures']),
 inventory:counts(data.inventory,['visible_unavailable','visible_sourced_after_order','visible_unknown_stock','visible_products'],['visible_unavailable','visible_unknown_stock']),
 support:counts(data.insights?.support,['ai_requests_7d','ai_failures_7d'],['ai_failures_7d']),
 seo:counts(data.insights?.seo,['visible_products','missing_seo_title','missing_seo_description','missing_product_image'],['missing_seo_title','missing_seo_description','missing_product_image']),
 analytics:counts(data.insights?.analytics,['orders_30d','recognized_sales_pkr_30d','checkout_started_30d','product_views_30d'],[]),
 marketing:counts(data,['pending_drafts'],['pending_drafts']),
 security:github.security||'unknown',backups:github.backups||'unknown'};
}
export function completionSql(agent,state,at=new Date()){
 if(!AGENTS.includes(agent)||!['ok','attention','unknown'].includes(state))throw Error('Invalid observation');
 const a=quote(agent),k=quote(cycleKey(agent,at)),act=quote(ACTION[agent]);
 const detail=quote(JSON.stringify({state,source:'github_actions',summary:'Read-only observations'}));
 return "BEGIN; DO $agent$ DECLARE j uuid; BEGIN "+
 "SELECT public.agent_m01_enqueue("+a+","+act+","+k+",'{\"source\":\"github_actions\",\"summary\":\"Read-only observation\"}'::jsonb) INTO j; "+
 "UPDATE chaskabox_agents.agent_jobs SET status='running',attempts=attempts+1,started_at=now(),lease_until=now()+interval '3 minutes',updated_at=now() WHERE id=j AND status IN ('pending','retry'); "+
 "IF NOT FOUND THEN RETURN; END IF; "+
 "INSERT INTO chaskabox_agents.agent_events(job_id,agent_key,event_type) VALUES(j,"+a+",'started'); "+
 "UPDATE chaskabox_agents.agent_jobs SET status='succeeded',finished_at=now(),lease_until=NULL,updated_at=now() WHERE id=j AND status='running'; "+
 "INSERT INTO chaskabox_agents.agent_events(job_id,agent_key,event_type,detail) VALUES(j,"+a+",'completed',"+detail+"::jsonb); "+
 "INSERT INTO chaskabox_agents.agent_run_metrics(agent_key,date_utc,runs,succeeded,failed) VALUES("+a+",(now() AT TIME ZONE 'UTC')::date,1,1,0) "+
 "ON CONFLICT(agent_key,date_utc) DO UPDATE SET runs=chaskabox_agents.agent_run_metrics.runs+1,succeeded=chaskabox_agents.agent_run_metrics.succeeded+1,updated_at=now(); "+
 "END $agent$; COMMIT;";
}
const snapshotSql="SELECT jsonb_build_object('settings',(SELECT coalesce(jsonb_agg(jsonb_build_object('key',agent_key,'enabled',enabled,'mode',mode)),'[]'::jsonb) FROM chaskabox_agents.agent_settings),'orders',public.agent_m02_order_signals(),'inventory',public.agent_m02_inventory_signals(),'insights',public.agent_m03_insight_signals(),'pending_drafts',(SELECT count(*) FROM chaskabox_agents.marketing_drafts WHERE decision='pending'))::text;";
function psql(sql){
 const secret=process.env.SUPABASE_DB_URL;
 if(!secret||!(secret.startsWith('postgres://')||secret.startsWith('postgresql://')))throw Error('Database secret unavailable');
 const result=spawnSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','--dbname',secret],{input:sql,encoding:'utf8',timeout:30000,maxBuffer:100000});
 if(result.error||result.status!==0)throw Error('Database operation failed (secrets suppressed)');
 return result.stdout.trim();
}
async function workflow(name,event){
 const url='https://api.github.com/repos/chaskabox/chaskabox-site/actions/workflows/'+name+'/runs?per_page=35';
 const res=await fetch(url,{signal:AbortSignal.timeout(8000),headers:{Accept:'application/vnd.github+json','User-Agent':'chaskabox-agent-observer',...(process.env.GITHUB_TOKEN?{Authorization:'Bearer '+process.env.GITHUB_TOKEN}:{})}});
 if(!res.ok)throw Error('GitHub unavailable');
 const data=await res.json();return data.workflow_runs?.find(x=>x.status==='completed'&&(!event||x.event===event))||null;
}
async function githubStates(){
 const x=await Promise.allSettled([workflow('quality-checks.yml','push'),workflow('chaskabox-nightly-backup.yml','schedule'),workflow('isolated-recovery.yml',null)]);
 const runs=x.map(r=>r.status==='fulfilled'?r.value:null);
 const a=evaluateRun(runs[1],48),b=evaluateRun(runs[2],192);
 return {security:evaluateRun(runs[0],168),backups:a==='attention'||b==='attention'?'attention':a==='ok'&&b==='ok'?'ok':'unknown'};
}
async function main(){
 const commit=process.argv.includes('--commit-observations');
 if(process.argv.some(x=>x.startsWith('--')&&x!=='--commit-observations'))throw Error('Unknown argument');
 const data=JSON.parse(psql(snapshotSql)),readings=assess(data,await githubStates());
 const enabled=AGENTS.filter(x=>data.settings?.some(s=>s.key===x&&s.enabled===true&&s.mode==='observe'));
 console.log('Readable signals:',Object.values(readings).filter(x=>x!=='unknown').length+'/8');
 console.log('Database-enabled agents:',enabled.length+'/8');
 if(!commit){console.log('Dry-run: zero writes');return;}
 for(const key of enabled){psql(completionSql(key,readings[key]));console.log('Observation receipt recorded:',key,readings[key]);}
 console.log('Only read-only monitoring completed; no notifications or commerce modifications.');
}
if(process.argv[1]?.endsWith('agent-observe-cycle.mjs'))main().catch(e=>{console.error(e.message);process.exitCode=1;});
