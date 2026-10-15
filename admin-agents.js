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
 async function refresh(){
  show(message,'Loading owner-only agent diagnostics...');
  output.replaceChildren();signals.replaceChildren();
  try{
   const [state,monitor,insights,marketing]=await Promise.all([
    api('/api/admin/agents/status'),
    api('/api/admin/agents/preview'),
    api('/api/admin/agents/insights'),
    api('/api/admin/agents/marketing')
   ]);
   block(output,'Agent activation',[
    ['Mode','Observation / no automated execution'],
    ['Pending jobs',state.pending_jobs??0],
    ['Pending approvals',state.pending_approvals??0],
    ['Configured agents',(state.agents||[]).length],
    ['Enabled agents',(state.agents||[]).filter(x=>x.enabled).length]
   ]);
   for(const a of monitor.agents||[]){
    block(signals,a.agent+' — '+a.state,Object.entries(a.signals||{}));
   }
   for(const a of insights.agents||[]){
    block(signals,a.agent+' — '+a.status,Object.entries(a.signals||{}));
   }
   renderMarketing(marketing.drafts);
   show(message,'Read-only diagnostics updated. No live jobs started.');
  }catch(e){
   show(message,(e.status===403?'Owner MFA required. Complete authenticator login. ':
    'Agent diagnostics unavailable. ')+(e.message||'Please retry.'));
  }
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

/* Phase 1+2 operational controls are strictly owner/MFA backed.
   Marketing cannot be activated here; no customer/marketing sends are possible. */
(()=>{
 'use strict';
 const root=document.getElementById('view-agents');if(!root)return;
 const api=(path,options)=>window.chaskaAdminApi(path,options);
 const panel=document.createElement('section');panel.className='panel';
 const heading=document.createElement('h2');heading.textContent='Phase 1 + 2 — Agent Operations';
 const note=document.createElement('p');note.textContent='Monitoring runs every 6 hours after deployment and activation. Read-only observations, no messages, billing or marketing automation.';
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const refresh=document.createElement('button');refresh.type='button';refresh.className='btn secondary';refresh.textContent='Refresh saved alerts';
 const scan=document.createElement('button');scan.type='button';scan.className='btn secondary';scan.textContent='Run safe scan now';
 const grid=document.createElement('div');grid.className='agent-m05-grid';
 const make=(tag,str)=>{const e=document.createElement(tag);e.textContent=String(str||'');return e;};
 panel.append(heading,note,refresh,scan,status,grid);root.append(panel);
 async function load(){
  status.textContent='Loading saved agent observations...';grid.replaceChildren();
  try{
   const v=await api('/api/admin/agents/operations');
   const last=new Map((v.observations||[]).map(x=>[x.agent,x]));
   for(const a of v.activation||[]){
    const tile=make('div','');tile.className='panel';
    tile.append(make('h3',a.agent+' — '+(a.enabled?'ON':'OFF')));
    if(a.agent==='marketing'){
     tile.append(make('p','Phase 3 — activation locked'));grid.append(tile);continue;
    }
    const saved=last.get(a.agent);
    tile.append(make('p',saved?
     'Last scan: '+saved.state+' | '+new Date(saved.checked_at).toLocaleString():'Not yet scanned'));
    if(saved){for(const item of saved.alerts||[])tile.append(make('p',item.code));}
    const toggle=make('button',a.enabled?'Disable agent':'Enable safe observation');
    toggle.className='btn secondary';toggle.type='button';
    toggle.onclick=async()=>{
     toggle.disabled=true;
     try{
      await api('/api/admin/agents/operations',{method:'POST',
       body:{action:'activate',agent:a.agent,enabled:!a.enabled}});
      await load();
     }catch(e){status.textContent=e?.message||'Activation failed';toggle.disabled=false;}
    };
    tile.append(toggle);grid.append(tile);
   }
   const open=v.alerts||[];
   status.textContent=(open.length?open.length+' active saved alert(s). ':'No active saved alerts. ')+
    'Customer notification delivery disabled.';
   for(const a of open){
    const alert=make('p',a.agent+': '+a.title+' ('+a.severity+')');
    alert.setAttribute('role','alert');panel.append(alert);
    alert.className='agent-phase12-alert';
   }
  }catch(e){status.textContent=e?.message||'Operational status unavailable';}
 }
 function clearAlerts(){panel.querySelectorAll('.agent-phase12-alert').forEach(el=>el.remove());}
 refresh.onclick=()=>{clearAlerts();void load();};
 scan.onclick=async()=>{
  scan.disabled=true;status.textContent='Scanning safe aggregate signals...';
  try{await api('/api/admin/agents/operations',{method:'POST',body:{action:'scan'}});
   clearAlerts();await load();
  }catch(e){status.textContent=e?.message||'Scan unavailable';}
  finally{scan.disabled=false;}
 };
 const nav=document.querySelector('.admin-nav-btn[data-view="agents"]');
 nav?.addEventListener('click',()=>{clearAlerts();void load();});
})();
