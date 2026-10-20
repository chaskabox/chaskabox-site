/* Read-only receipt interpretation shared by owner diagnostics. */
(() => {
 'use strict';
 window.chaskaAgentReceipt=(observation,now=Date.now())=>{
  const time=Date.parse(observation?.checked_at||'');
  const state=observation?.state;
  if(!Number.isFinite(time)||!['ok','attention','unknown'].includes(state))
   return {kind:'missing',state:'unknown',label:'No valid completed observation receipt'};
  const age=now-time;
  if(age<0)return {kind:'missing',state:'unknown',label:'Future-dated receipt — execution not verified'};
  const recent=age<=8*60*60*1000;
  return {kind:recent?'recent':'stale',state,time,
   label:(recent?'Recent completed observation':'Stale completed observation')+' · '+state+' · '+new Date(time).toLocaleString()};
 };
})();
