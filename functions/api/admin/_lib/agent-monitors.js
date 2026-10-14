/** M02 deterministic and read-only monitoring. Never include customer PII. */
const GH='https://api.github.com/repos/chaskabox/chaskabox-site';
const MAX=1000000000;
const COUNT_KEYS=Object.freeze({
 orders:['stale_new_orders','payment_reviews','overdue_open_orders','notification_failures'],
 inventory:['visible_unavailable','visible_sourced_after_order','visible_unknown_stock','visible_products']
});
const SEVERITY={stale_new_orders:'high',payment_reviews:'high',overdue_open_orders:'high',notification_failures:'high',visible_unavailable:'medium',visible_unknown_stock:'medium'};
const numeric=x=>Number.isSafeInteger(Number(x))&&Number(x)>=0;
export function unavailable(agent){return {agent,state:'unknown',signals:{},alerts:[]};}
function observeCounts(agent,snapshot,alertKeys){
 if(!snapshot||Array.isArray(snapshot)||typeof snapshot!=='object')return unavailable(agent);
 const keys=COUNT_KEYS[agent];
 if(keys.some(k=>!numeric(snapshot[k]))) return unavailable(agent);
 const signals=Object.fromEntries(keys.map(k=>[k,Math.min(Number(snapshot[k]),MAX)]));
 if(agent==='inventory')signals.quantity_tracking_available=false;
 const alerts=alertKeys.filter(k=>signals[k]>0).map(code=>({code,severity:SEVERITY[code],count:signals[code]}));
 return {agent,state:alerts.length?'attention':'ok',signals,alerts};
}
export function observeOrders(snapshot){return observeCounts('orders',snapshot,COUNT_KEYS.orders);}
export function observeInventory(snapshot){return observeCounts('inventory',snapshot,['visible_unavailable','visible_unknown_stock']);}
const completed=run=>run?.status==='completed';
const validRun=run=>Number.isSafeInteger(run?.id)&&run.id>0&&Number.isFinite(Date.parse(run.created_at||''));
const recent=(stamp,now,maxMs)=>{const t=Date.parse(stamp||'');return Number.isFinite(t)&&t<=now&&now-t<=maxMs;};
async function githubRead(fetcher,path){
 const r=await fetcher(GH+path,{headers:{Accept:'application/vnd.github+json','User-Agent':'chaskabox-m02-readonly'},signal:AbortSignal.timeout(6000)});
 if(!r.ok)throw new Error('github_unavailable');
 const v=await r.json();
 if(!v||typeof v!=='object')throw new Error('github_invalid');
 return v;
}
/** Fixed public GitHub read endpoints. No token, webhook or external mutations. */
export async function observeGitHub(fetcher=fetch,now=Date.now()){
 const day=86400000;
 const groups=await Promise.allSettled([
  githubRead(fetcher,'/actions/workflows/quality-checks.yml/runs?branch=main&per_page=3'),
  githubRead(fetcher,'/actions/workflows/chaskabox-nightly-backup.yml/runs?per_page=12'),
  githubRead(fetcher,'/actions/workflows/isolated-recovery.yml/runs?per_page=15')
 ]);
 let security=unavailable('security'),backups=unavailable('backups');
 if(groups[0].status==='fulfilled'){
  const runs=groups[0].value.workflow_runs;
  const latest=Array.isArray(runs)?runs.find(validRun):null;
  if(latest&&completed(latest)&&recent(latest.created_at,now,30*day)){
   try{
    const data=await githubRead(fetcher,'/actions/runs/'+latest.id+'/jobs?per_page=30');
    const secretJob=Array.isArray(data.jobs)?data.jobs.find(x=>x.name==='secrets'):null;
    if(completed(secretJob)&&secretJob.conclusion==='success')
     security={agent:'security',state:'ok',signals:{secrets_scan_passed:true},alerts:[]};
    else if(completed(secretJob)&&secretJob.conclusion==='failure')
     security={agent:'security',state:'attention',signals:{secrets_scan_passed:false},alerts:[{code:'secrets_scan_failed',severity:'critical'}]};
   }catch{security=unavailable('security');}
  }
 }
 if(groups[1].status==='fulfilled'&&groups[2].status==='fulfilled'){
  const br=groups[1].value.workflow_runs,rr=groups[2].value.workflow_runs;
  if(Array.isArray(br)&&Array.isArray(rr)){
   const scheduled=br.filter(r=>validRun(r)&&r.event==='schedule').sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];
   const restores=rr.filter(r=>validRun(r)&&completed(r)&&r.conclusion!=='skipped').sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
   const successfulRestore=restores.find(r=>r.conclusion==='success'&&recent(r.created_at,now,7*day));
   const isCurrent=!!scheduled&&recent(scheduled.created_at,now,36*3600000);
   const backupOK=isCurrent&&completed(scheduled)&&scheduled.conclusion==='success';
   const alerts=[];
   if(!isCurrent)alerts.push({code:'scheduled_backup_missing',severity:'critical'});
   else if(!backupOK)alerts.push({code:'scheduled_backup_not_successful',severity:'critical'});
   if(!successfulRestore)alerts.push({code:'recent_recovery_not_verified',severity:'high'});
   if(restores[0]?.conclusion==='failure'&&(!successfulRestore||Date.parse(restores[0].created_at)>Date.parse(successfulRestore.created_at)))
    alerts.push({code:'latest_recovery_failed',severity:'high'});
   backups={agent:'backups',state:alerts.length?'attention':'ok',
    signals:{latest_scheduled_backup_passed:backupOK,recent_isolated_recovery_passed:!!successfulRestore},alerts};
  }
 }
 return {security,backups};
}
