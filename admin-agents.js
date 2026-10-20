/* M05 owner-facing read-only agents control centre; no browser secrets. */
(()=>{
 'use strict';
 const root=document.getElementById('view-agents');
 if(!root)return;
 const find=id=>document.getElementById(id);
 const output=find('agentsM05Readiness'),signals=find('agentsM05Signals'),
       drafts=find('agentsM05Drafts'),message=find('agentsM05Message');
 const api=(path,opts)=>window.chaskaAdminApi(path,opts);
 const show=(node,text)=>{node.textContent=String(text??'');};
 const element=(tag,text,cls)=>{const n=document.createElement(tag);if(cls)n.className=cls;n.textContent=String(text??'');return n;};
 function block(node,title,rows){
  const article=element('article','', 'panel');article.append(element('h3',title));
  for(const [key,value] of rows){const p=element('p',key+': '+String(value));article.append(p);}
  node.append(article);
  return article;
 }
 function renderMarketing(items){
  drafts.replaceChildren();
  if(!Array.isArray(items)||!items.length){show(drafts,'No marketing drafts. Propose a product ID for review.');return;}
  for(const item of items){
   const card=element('article','', 'panel');
   card.append(element('h3',item.headline),element('p',item.draft_text),
    element('p',item.channel+' — '+item.decision));
   if(item.decision==='pending'){
    for(const decision of ['approved','rejected']){
     const btn=element('button',decision==='approved'?'Approve draft':'Reject draft','btn secondary');
     btn.type='button';
     btn.onclick=async()=>{
      if(!window.confirm('Record '+decision+' decision? This does NOT publish or send.'))return;
      const controls=[...card.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);
      try{
       await api('/api/admin/agents/marketing',{method:'POST',
        body:{operation:'decide',draft_id:item.id,decision}});
       show(message,'Decision saved. Nothing published or sent.');
       await refresh();
      }catch(e){show(message,e.message||'Approval unavailable');controls.forEach(b=>b.disabled=false);}
     };card.append(btn);
    }
   }
   drafts.append(card);
  }
 }
 let refreshSequence=0;
 async function refresh(){
  const sequence=++refreshSequence;
  show(message,'Loading owner-only agent diagnostics...');
  // Isolate each endpoint so a single monitoring outage cannot blank the
  // independently authorized activation evidence or masquerade as healthy.
  const keys=['status','preview','insights','marketing','operations'];
  const results=await Promise.allSettled(keys.map(key=>api('/api/admin/agents/'+key)));
  if(sequence!==refreshSequence)return; // Ignore a slower, stale refresh.
  output.replaceChildren();signals.replaceChildren();
  const values=results.map((r,i)=>{
   if(r.status!=='fulfilled')return null;
   const item=r.value;
   if(!item||typeof item!=='object')return null;
   if(i===0&&!Array.isArray(item.agents))return null;
   if((i===1||i===2)&&!Array.isArray(item.agents))return null;
   if(i===3&&!Array.isArray(item.drafts))return null;
   if(i===4&&!Array.isArray(item.observations))return null;
   return item;
  });
  const [state,monitor,insights,marketing,operations]=values;
  const failing=keys.filter((key,i)=>i<4&&!values[i]);
  const authDenied=results.some(r=>r.status==='rejected'&&(r.reason?.status===401||r.reason?.status===403));
  block(output,'Agent activation',[
   ['Mode','Read-only monitoring; outbound actions locked'],
   ['Pending jobs',state?.pending_jobs??'Unavailable'],
   ['Pending approvals',state?.pending_approvals??'Unavailable'],
   ['Configured agents',state?.agents.length??'Unknown — status endpoint unavailable'],
   ['Enabled agents',state?.agents.filter(x=>x.enabled===true).length??'Unknown — status endpoint unavailable']
  ]);
  const eight=['orders','inventory','security','backups','support','seo','marketing','analytics'];
  const observations=new Map([...(monitor?.agents||[]),...(insights?.agents||[])]
   .filter(x=>x&&typeof x.agent==='string').map(x=>[x.agent,x]));
  const receipts=new Map((operations?.observations||[])
   .filter(x=>x&&typeof x.agent==='string').map(x=>[x.agent,x]));
  const settings=new Map((state?.agents||[])
   .filter(x=>x&&typeof (x.key??x.agent_key)==='string')
   .map(x=>[x.key??x.agent_key,x])); // M01 health returns 'key', not 'agent_key'.
  for(const agentKey of eight){
   const current=settings.get(agentKey),reading=observations.get(agentKey);
   const receipt=window.chaskaAgentReceipt(receipts.get(agentKey));
   const status=reading?.state||reading?.status||(receipt.kind==='recent'?receipt.state:'No observation evidence');
   const data=[['Activation',!state?'Unknown — status unavailable':
       !current?'Not configured':current.enabled===true?'Enabled for read-only monitoring':'Disabled'],
     ['Agent mode',current?.mode||'Not reported'],
     ['Signals',status],
     ['Completed run',receipt.label],
     ['Data basis',reading&&(status==='ok'||status==='attention')?'Read-only validated aggregate':
        agentKey==='marketing'&&marketing?'Human review workflow (no scheduled delivery)':'No validated live signal']];
   if(reading?.signals&&typeof reading.signals==='object')for(const [key,value] of Object.entries(reading.signals))
    data.push([key,typeof value==='object'?'Not comparable':value]);
   const card=block(signals,agentKey.toUpperCase()+' · '+status,data);
   // Expose only normalized read-only flags to the companion workbench UI.
   card.dataset.agent=agentKey;
   card.dataset.activation=!state||!current?'unknown':current.enabled===true?'enabled':'disabled';
   card.dataset.evidence=reading&&(status==='ok'||status==='attention')?'observed':'missing';
   card.dataset.receipt=receipt.kind;
  }
  const submit=propose?.querySelector('button[type=submit]');
  if(submit)submit.disabled=!state||!marketing;
  if(marketing)renderMarketing(marketing.drafts);
  else show(drafts,'Marketing drafts unavailable. Retry diagnostics before creating or approving drafts.');
  if(failing.length)show(message,(authDenied?'Owner MFA/session needs verification. ':'Partial diagnostics; ') +
    failing.join(', ')+' unavailable. No live jobs started.');
  else show(message,'Read-only diagnostics updated. '+(!operations?'Saved receipts unavailable. ':'')+'No live jobs started.');
 }
 const propose=find('agentsM05Propose');
 propose?.addEventListener('submit',async e=>{
  e.preventDefault();const id=Number(find('agentsM05ProductId').value);
  const channel=find('agentsM05Channel').value;
  if(!Number.isSafeInteger(id)||id<=0){show(message,'A valid product ID is required.');return;}
  const btn=propose.querySelector('button[type=submit]');btn.disabled=true;
  try{
   await api('/api/admin/agents/marketing',{method:'POST',
    body:{operation:'propose',product_id:id,channel}});
   show(message,'Review-only draft created. Nothing published or sent.');
   await refresh();
  }catch(err){show(message,err.message||'Draft unavailable');}
  finally{btn.disabled=false;}
 });
 find('agentsM05Refresh')?.addEventListener('click',refresh);
 const nav=document.querySelector('.admin-nav-btn[data-view="agents"]');
 nav?.addEventListener('click',()=>{void refresh();});
})();

/* Phase 1+2: owner-only operational controls. All rendering is text-only. */
(()=>{
 'use strict';
 const root=document.getElementById('view-agents');
 if(!root)return;
 const api=(path,options)=>window.chaskaAdminApi(path,options);
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(cls)n.className=cls;n.textContent=String(text??'');return n;};
 const section=el('section','','panel');
 section.id='agentsPhase12Operations';
 section.append(el('h2','Phase 1 + 2 — Agent Operations'));
 section.append(el('p','Six-hour scheduled read-only observations. Manual scans do not save receipts or send messages. Marketing publishing remains locked.'));
 const status=el('p','Open AI Agents to load operations.');status.id='agentsPhase12Status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const actions=el('div','','panel-actions');
 const refresh=el('button','Refresh saved observations','btn secondary'),scan=el('button','Run read-only scan','btn secondary');
 refresh.type='button';scan.type='button';actions.append(refresh,scan);
 const alerts=el('div','','agent-phase12-alerts'),grid=el('div','','agent-m05-grid');
 section.append(actions,status,alerts,grid);root.append(section);
 let refreshSeq=0;
 const agents=new Set(['orders','inventory','security','backups','support','seo','analytics']);
 async function load(){
  const seq=++refreshSeq;status.textContent='Loading owner-only monitoring status...';
  grid.replaceChildren();alerts.replaceChildren();
  try{
   const data=await api('/api/admin/agents/operations');
   if(seq!==refreshSeq)return;
   if(!Array.isArray(data?.activation)||!Array.isArray(data?.observations)||!Array.isArray(data?.alerts))throw Error('Invalid operations response');
   const latest=new Map(data.observations.filter(x=>x&&typeof x.agent==='string').map(x=>[x.agent,x]));
   for(const a of data.activation){
    if(typeof a.agent!=='string')continue;
    const card=el('article','','panel');const isMarketing=a.agent==='marketing',enabled=a.enabled===true;
    card.append(el('h3',a.agent.toUpperCase()+' — '+(enabled?'ON':'OFF')));
    card.append(el('p',isMarketing?'Observe-only; marketing activation controls locked.':'Scheduled read-only observation: '+(enabled?'Enabled':'Disabled')));
    const observation=latest.get(a.agent);
    const receipt=window.chaskaAgentReceipt(observation);
    card.append(el('p',receipt.label));
    if(isMarketing)card.append(el('p','Phase 3 HOLD: this panel does not authorize marketing activation, publishing, or delivery.'));
    if(!isMarketing&&agents.has(a.agent)){
     const button=el('button',enabled?'Disable monitoring':'Enable safe monitoring','btn secondary');button.type='button';
     button.onclick=async()=>{
      if(!window.confirm((enabled?'Disable':'Enable')+' '+a.agent+' read-only monitoring? No external notifications or publishing.'))return;
      button.disabled=true;
      try{const response=await api('/api/admin/agents/operations',{method:'POST',body:{action:'activate',agent:a.agent,enabled:!enabled}});
       if(response?.activation?.agent!==a.agent)throw Error('Activation response not verified');
       await load();
      }catch(err){status.textContent=err?.message||'Activation failed; no state claimed.';button.disabled=false;}
     };
     card.append(button);
    }
    grid.append(card);
   }
   status.textContent=(data.alerts.length?data.alerts.length+' open saved alert(s). ':'No open saved alerts. ')+
    'Only owner/MFA monitoring controls are available. No outbound actions.';
   for(const a of data.alerts.slice(0,30)){
    if(!a||typeof a.agent!=='string')continue;
    const notice=el('p',a.agent+': '+String(a.title||'Alert')+' ('+String(a.severity||'unknown')+')');
    notice.setAttribute('role','alert');alerts.append(notice);
   }
  }catch(err){if(seq===refreshSeq)status.textContent=err?.message||'Operations unavailable; no change made.';}
 }
 refresh.addEventListener('click',()=>{void load();});
 scan.addEventListener('click',async()=>{
  scan.disabled=true;status.textContent='Checking current safe aggregate signals...';
  try{
   const result=await api('/api/admin/agents/operations',{method:'POST',body:{action:'scan'}});
   if(result?.saved!==false||result?.scan?.mode!=='read_only_no_receipt')throw Error('Read-only scan not verified');
   const x=result.scan;
   const stock=x.inventory||{},orders=x.orders||{},seo=x.insights?.seo||{};
   status.textContent='Read-only scan done (not saved). Open order signals: '+
    Number(orders.stale_new_orders||0)+', unavailable visible products: '+
    Number(stock.visible_unavailable||0)+', SEO titles missing: '+Number(seo.missing_seo_title||0)+'. No notifications sent.';
  }catch(err){status.textContent=err?.message||'Read-only scan unavailable';}
  finally{scan.disabled=false;}
 });
 const nav=document.querySelector('.admin-nav-btn[data-view="agents"]');
 nav?.addEventListener('click',()=>{void load();});
})();
