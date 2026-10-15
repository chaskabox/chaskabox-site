/* Owner-only presentation layer. No agent execution, secrets, or external API calls. */
(()=>{
 'use strict';
 const root=document.getElementById('view-agents');
 const cards=document.getElementById('agentsM05Signals');
 if(!root||!cards)return;
 const toolbar=document.createElement('section');
 toolbar.className='agent-workbench-toolbar panel';
 toolbar.setAttribute('aria-label','AI agent diagnostics filters');
 toolbar.innerHTML=`<div class="agent-workbench-heading"><div><span class="agent-workbench-eyebrow">AI OPERATIONS · OBSERVE ONLY</span><h2>Agent workbench</h2><p>Filter verified backend observations. A monitor is not an activated or autonomous AI agent.</p></div><span class="agent-workbench-lock">Owner + MFA protected</span></div>
 <div class="agent-workbench-tools"><label for="agentWorkbenchSearch">Find an agent<input type="search" id="agentWorkbenchSearch" placeholder="Orders, SEO, security…" autocomplete="off"></label><label for="agentWorkbenchFilter">Show<select id="agentWorkbenchFilter"><option value="all">All eight agents</option><option value="disabled">Disabled</option><option value="enabled">Enabled (verify scheduler)</option><option value="missing">Missing signal evidence</option><option value="unknown">Activation unknown</option></select></label><button class="btn secondary" type="button" id="agentWorkbenchExport">Export safe summary</button></div>
 <div id="agentWorkbenchSummary" class="agent-workbench-summary" role="status" aria-live="polite">Waiting for authenticated diagnostics…</div>`;
 cards.before(toolbar);
 const integration=document.createElement('section');
 integration.className='panel agent-workbench-integrations';
 integration.innerHTML=`<div class="agent-workbench-heading"><div><span class="agent-workbench-eyebrow">RESEARCHED OPEN-SOURCE OPTIONS</span><h2>Free-agent integration candidates</h2><p>References for future isolated pilots — none of these external runtimes is connected, installed, or authorized to control Chaskabox.</p></div><span class="agent-workbench-lock">No integrations active</span></div>
 <div class="agent-workbench-integrations-grid">
 <article><h3><a href="https://github.com/cloudflare/agents" target="_blank" rel="noopener noreferrer">Cloudflare Agents ↗</a></h3><p>State, scheduling and MCP on Durable Objects. Evaluate limits before choosing paid bindings.</p><span>Cloudflare-native candidate</span></article>
 <article><h3><a href="https://github.com/mastra-ai/mastra" target="_blank" rel="noopener noreferrer">Mastra ↗</a></h3><p>Human-approved TypeScript workflows. Evaluate only as a separate optional backend.</p><span>Workflow reference</span></article>
 <article><h3><a href="https://github.com/CopilotKit/openmuse" target="_blank" rel="noopener noreferrer">OpenMuse ↗</a></h3><p>Progress, approvals and resumable tasks. Full platform requires its own workers and hosting.</p><span>Interface reference</span></article>
 <article><h3><a href="https://github.com/elie222/rakazo" target="_blank" rel="noopener noreferrer">Rakazo ↗</a></h3><p>Persistent multi-bot teams, memory and desktop computers. Requires separate server resources.</p><span>Multi-agent reference</span></article>
 <article><h3><a href="https://github.com/browserbase/stagehand" target="_blank" rel="noopener noreferrer">Stagehand ↗</a></h3><p>Browser QA automation in a disposable isolated environment, not in production admin sessions.</p><span>Optional QA candidate</span></article>
 </div><p class="agent-workbench-disclaimer">Open-source licensing does not guarantee free model inference, browser compute, hosting or third-party connectors. No additional packages or secret keys have been added.</p>`;
 cards.after(integration);
 const search=toolbar.querySelector('#agentWorkbenchSearch');
 const filter=toolbar.querySelector('#agentWorkbenchFilter');
 const summary=toolbar.querySelector('#agentWorkbenchSummary');
 const exportButton=toolbar.querySelector('#agentWorkbenchExport');
 let observed=false;
 function snapshots(){
  return [...cards.children].filter(node=>node.matches('article[data-agent]'));
 }
 function update(){
  const all=snapshots();
  const needle=search.value.trim().toLocaleLowerCase();
  const f=filter.value;
  let displayed=0;
  for(const card of all){
   const matchesText=card.dataset.agent.toLocaleLowerCase().includes(needle);
   const matchesFilter=f==='all'||(f==='missing'?
     card.dataset.evidence!=='observed':card.dataset.activation===f);
   card.hidden=!(matchesText&&matchesFilter);
   if(!card.hidden)displayed++;
   if(!card.dataset.workbenchEnhanced){
    card.dataset.workbenchEnhanced='true';
    card.classList.add('agent-workbench-card');
    const heading=card.querySelector('h3');
    if(heading){
     const tag=document.createElement('span');
     tag.className='agent-workbench-tag';
     tag.textContent=card.dataset.activation==='enabled'?'Enabled · unverified':
      card.dataset.activation==='disabled'?'Off':'Activation unknown';
     heading.append(tag);
    }
   }
  }
  observed=all.length>0;
  exportButton.disabled=!observed;
  if(!observed){
   summary.textContent='Awaiting authenticated status. No agent is being started.';
   return;
  }
  const disabled=all.filter(x=>x.dataset.activation==='disabled').length;
  const enabled=all.filter(x=>x.dataset.activation==='enabled').length;
  const unknown=all.filter(x=>x.dataset.activation==='unknown').length;
  const evidence=all.filter(x=>x.dataset.evidence==='observed').length;
  summary.textContent=`Showing ${displayed} of ${all.length} · ${disabled} disabled · ${enabled} enabled (execution not verified) · ${unknown} unknown · ${evidence} with observation evidence. No agent launched.`;
 }
 const observer=new MutationObserver(update);
 observer.observe(cards,{childList:true});
 search.addEventListener('input',update);
 filter.addEventListener('change',update);
 exportButton.disabled=true;
 exportButton.addEventListener('click',()=>{
  if(!observed)return;
  // Export only non-sensitive flags. Never export the backend signal payload,
  // staff identity, customer/order detail, access tokens or raw error messages.
  const rows=snapshots().map(card=>({
   agent:card.dataset.agent,
   activation:card.dataset.activation,
   observation_evidence:card.dataset.evidence
  }));
  const report={generated_at:new Date().toISOString(),kind:'read_only_ui_snapshot',
   caution:'Observation is not evidence of a running autonomous agent.',
   agents:rows};
  const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download='chaskabox-agent-readiness.json';anchor.click();
  URL.revokeObjectURL(url);
 });
 update();
})();
