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
   // Show every configured agent, including those with no current observation.
   // Never substitute a green "working" badge for missing or stale evidence.
   const eight=['orders','inventory','security','backups','support','seo','marketing','analytics'];
   const observations=new Map([...(monitor.agents||[]),...(insights.agents||[])]
    .filter(x=>x&&typeof x.agent==='string').map(x=>[x.agent,x]));
   const settings=new Map((state.agents||[]).map(x=>[x.agent_key,x]));
   for(const agentKey of eight){
    const current=settings.get(agentKey),reading=observations.get(agentKey);
    const status=reading?.state||reading?.status||
      (agentKey==='marketing'?'Review-only drafts':'No observation evidence');
    const data=[['Activation',current?.enabled?'Enabled (verify scheduler separately)':'Disabled'],
      ['Agent mode',current?.mode||'Not reported'],
      ['Signals',status],
      ['Data basis',reading?'Read-only runtime observation':agentKey==='marketing'?'Human review workflow':'No validated live signal']];
    if(reading?.signals&&typeof reading.signals==='object')for(const [key,value] of Object.entries(reading.signals))
     data.push([key,typeof value==='object'?'Not comparable':value]);
    block(signals,agentKey.toUpperCase()+' · '+status,data);
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
