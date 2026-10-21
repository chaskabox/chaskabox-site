// Authenticated read-only SEO overview; saving delegates to existing audited CMS endpoints.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const trim=v=>String(v??'').trim();
export function auditPublicProducts(rows=[]){
 const source=(Array.isArray(rows)?rows:[]).filter(p=>p&&p.visibility==='visible');
 const titles=new Map();
 for(const p of source){const title=trim(p.seo_title).toLocaleLowerCase();if(title)titles.set(title,(titles.get(title)||0)+1);}
 const entries=source.map(p=>{
  const flags=[],title=trim(p.seo_title),description=trim(p.seo_description);
  if(!title)flags.push('missing_title');
  if(!description)flags.push('missing_description');
  if(!trim(p.image_url))flags.push('missing_image');
  if(title.length>65)flags.push('long_title');
  if(description.length>160)flags.push('long_description');
  if(!trim(p.brand))flags.push('missing_brand');
  if(!trim(p.og_image))flags.push('social_fallback');
  if(title&&titles.get(title.toLocaleLowerCase())>1)flags.push('duplicate_title');
  return {id:Number(p.id),name:trim(p.name),title:title||trim(p.name),description:description||trim(p.description),category:trim(p.category),flags,updated:trim(p.updated_at)};
 });
 const count=name=>entries.filter(x=>x.flags.includes(name)).length;
 return {entries,visible:entries.length,missingTitle:count('missing_title'),missingDescription:count('missing_description'),longTitle:count('long_title'),missingImage:count('missing_image'),duplicateTitle:count('duplicate_title'),socialFallback:count('social_fallback')};
}
export function seoCsv(rows=[]){
 const cell=v=>{let s=String(v??'');if(/^\s*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 const data=[['id','name','title','description','category','flags','updated_at'],...rows.map(r=>[r.id,r.name,r.title,r.description,r.category,r.flags.join('; '),r.updated])];
 return '\uFEFF'+data.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';
}

/** Only four SEO fields can be changed in this editor; no price/stock/media mutations. */
export function validateSeoPatch(values){
 const title=trim(values?.seo_title),description=trim(values?.seo_description);
 const og=trim(values?.og_image),canonical=trim(values?.canonical_url);
 if(!title||title.length>60)throw Error('SEO title must be 1–60 characters.');
 if(!description||description.length>155)throw Error('Meta description must be 1–155 characters.');
 if(og.length>500||canonical.length>500)throw Error('Image/canonical URL must be no longer than 500 characters.');
 if(og&&!/^https:\/\/[^\s<>"']+$/i.test(og)&&!/^\/(?!\/)[^\s<>"']+$/.test(og))throw Error('OG image must be a secure HTTPS URL or a relative image path.');
 if(canonical){
  let u;try{u=new URL(canonical,'https://chaskabox.online');}catch{throw Error('Enter a valid canonical URL.');}
  if(u.protocol!=='https:'||u.hostname!=='chaskabox.online'||u.username||u.password||u.search||u.hash)
   throw Error('Canonical URL must be a clean chaskabox.online HTTPS URL.');
 }
 return {seo_title:title,seo_description:description,og_image:og,canonical_url:canonical};
}

/** A dedicated in-panel SEO editor: AI suggests text; saving is always a separate audited action. */
export async function mountSeoCenter(host,{api,toast,openPages,canPublish=false}){
 if(!host)throw Error('SEO panel missing');
 let audit=null,allProducts=[],filter='all',query='',activeEditor=null;
 const filters=[['all','All public products'],['missing_title','Missing title'],['missing_description','Missing description'],['missing_image','Missing image'],['long_title','Long title (>65)'],['long_description','Long description (>160)'],['duplicate_title','Duplicate title'],['social_fallback','OG photo fallback'],['missing_brand','Unspecified brand']];
 const nav='<div class="seo-actions"><button type="button" class="btn secondary" data-seo-action="reload">Refresh</button><button type="button" class="btn secondary" data-seo-action="export">Download CSV</button><button type="button" class="btn secondary" data-seo-action="pages">Pages: Save / Preview / History</button></div>';
 const filtered=()=>audit.entries.filter(p=>(filter==='all'||p.flags.includes(filter))&&(!query||[p.name,p.title,p.category,String(p.id)].join(' ').toLocaleLowerCase().includes(query)));
 function render(){
  const matched=filtered();
  const stats=[['Public products',audit.visible],['Missing titles',audit.missingTitle],['Missing descriptions',audit.missingDescription],['Long titles',audit.longTitle],['Duplicate titles',audit.duplicateTitle],['OG photo fallback',audit.socialFallback]];
  host.innerHTML='<p class="seo-note">Manage product SEO here without opening the Products editor. SEO titles, meta descriptions, OG image and canonical URL save through the existing audited admin API. AI generates a draft only; you decide whether to save. Page publishing and history live in Pages &amp; Text.</p>'+nav+
  '<div class="seo-metrics">'+stats.map(x=>'<div class="seo-metric"><strong>'+x[1]+'</strong>'+esc(x[0])+'</div>').join('')+'</div>'+
  '<div class="seo-toolbar"><label>Review filter<select id="seoCenterFilter">'+filters.map(x=>'<option value="'+x[0]+'"'+(filter===x[0]?' selected':'')+'>'+esc(x[1])+'</option>').join('')+'</select></label><label>Search public products<input id="seoCenterSearch" type="search" value="'+esc(query)+'" placeholder="Name, ID, category, title"></label></div>'+
  '<p role="status" aria-live="polite">Showing '+matched.length+' of '+audit.visible+' public products. '+(canPublish?'Page publishing permission: owner/manager.':'Page publishing requires owner/manager.')+'</p>'+
  '<div class="seo-table-wrap"><table><thead><tr><th>Product / Search Preview</th><th>SEO review</th><th>Actions</th></tr></thead><tbody>'+
  matched.map(p=>'<tr><td><b>'+esc(p.name)+'</b><div class="seo-preview"><strong>'+esc(p.title)+'</strong><span>chaskabox.online/product/'+p.id+'/</span><p>'+esc(p.description).slice(0,600)+'</p></div></td><td>'+esc(p.flags.filter(x=>x!=='social_fallback').join(', ')||'No critical flags')+(p.flags.includes('social_fallback')?'<small> · image fallback</small>':'')+'</td><td><div class="seo-actions"><button type="button" class="btn secondary compact" data-seo-edit="'+p.id+'">Edit SEO &amp; AI</button><a href="/product/'+p.id+'/" target="_blank" rel="noopener noreferrer">Open live page</a></div></td></tr>').join('')+
  '</tbody></table></div><p class="seo-note">Search Console and actual Core Web Vitals field performance are separate from these catalogue counts. <a href="https://search.google.com/search-console/" target="_blank" rel="noopener noreferrer">Search Console</a> · <a href="https://pagespeed.web.dev/" target="_blank" rel="noopener noreferrer">PageSpeed Insights</a>.</p>';
 }
 async function load(){
  const all=[];
  for(let page=1;page<=10;page++){
   const data=await api('/api/admin/products?per_page=1000&page='+page);
   if(!Array.isArray(data.products))throw Error('Protected SEO products response unavailable.');
   all.push(...data.products);
   if(page>=Number(data.total_pages||1)){allProducts=all;audit=auditPublicProducts(all);render();return;}
  }
  throw Error('Catalogue exceeds ten pages; full SEO report unavailable.');
 }
 function openEditor(id){
  const product=allProducts.find(p=>Number(p.id)===id);
  if(!product)throw Error('Product not found in this audit. Refresh and retry.');
  if(activeEditor){activeEditor.focus();return;}
  const modal=document.createElement('dialog');modal.className='chaska-seo-dialog';modal.id='chaskaSeoEditor';
  activeEditor=modal;
  const productUrl='https://chaskabox.online/product/'+id+'/';
  modal.innerHTML='<form id="chaskaSeoForm" novalidate><div class="seo-editor-header"><div><small>PRODUCT #'+id+' · SEO CENTER</small><h2>Edit SEO — '+esc(product.name)+'</h2><p>Only search metadata changes. Product prices, photos, inventory and description stay unchanged.</p></div><button type="button" class="btn secondary compact" data-seo-close aria-label="Close SEO editor">✕</button></div>'+
   '<div class="seo-editor-grid"><div class="seo-editor-fields">'+
   '<label>SEO title <small id="seoTitleLength"></small><input name="seo_title" id="seoEditTitle" required maxlength="60" value="'+esc(product.seo_title||'')+'" placeholder="Product name, pack and ChaskaBox"></label>'+
   '<label>Meta description <small id="seoDescriptionLength"></small><textarea name="seo_description" id="seoEditDescription" required maxlength="155" rows="4" placeholder="A useful, factual product summary for search">'+esc(product.seo_description||'')+'</textarea></label>'+
   '<details><summary>Advanced SEO options</summary><label>Social sharing image URL (optional)<input name="og_image" maxlength="500" value="'+esc(product.og_image||'')+'" placeholder="https://… or /images/…"></label><label>Canonical URL (optional)<input name="canonical_url" maxlength="500" value="'+esc(product.canonical_url||'')+'" placeholder="'+productUrl+'"></label></details>'+
   '<div class="seo-ai-tools"><div><b>✦ AI SEO assistant</b><p>Uses saved product facts only. The draft is never saved automatically.</p></div><button type="button" class="btn secondary" data-seo-ai disabled>Generate with AI</button><button type="button" class="btn secondary compact" data-seo-ai-check>Check AI</button><p data-seo-ai-status role="status" aria-live="polite">Checking AI availability…</p></div>'+
   '<div class="seo-editor-actions"><button type="button" class="btn secondary" data-seo-close>Cancel</button><button type="submit" class="btn primary" data-seo-save>Save SEO changes</button></div>'+
   '<p data-seo-save-status role="status" aria-live="polite"></p></div>'+
   '<div class="seo-editor-preview"><h3>Google-style preview</h3><div class="seo-preview"><span>'+esc(productUrl)+'</span><strong id="seoLiveTitle"></strong><p id="seoLiveDescription"></p></div><small>Preview is illustrative, not a guaranteed search result.</small><p id="seoDuplicateWarning" class="seo-editor-warning"></p><div class="seo-current-data">Source: saved ChaskaBox catalogue<br>Product: '+esc(product.name)+'<br>Category: '+esc(product.category||'Not specified')+'<br>Pack: '+esc(product.pack||'Not specified')+'</div></div></div></form>';
  document.body.append(modal);
  const form=modal.querySelector('form'),title=modal.querySelector('#seoEditTitle'),description=modal.querySelector('#seoEditDescription');
  const aiButton=modal.querySelector('[data-seo-ai]'),aiStatus=modal.querySelector('[data-seo-ai-status]'),saveStatus=modal.querySelector('[data-seo-save-status]');
  const saveButton=modal.querySelector('[data-seo-save]');
  let initialTitle=title.value,initialDescription=description.value,aiReady=false,saving=false;
  const fieldValue=()=>Object.fromEntries(['seo_title','seo_description','og_image','canonical_url'].map(key=>[key,form.elements.namedItem(key)?.value||'']));
  function updatePreview(){
   modal.querySelector('#seoTitleLength').textContent=title.value.trim().length+'/60';
   modal.querySelector('#seoDescriptionLength').textContent=description.value.trim().length+'/155';
   modal.querySelector('#seoLiveTitle').textContent=title.value.trim()||product.name;
   modal.querySelector('#seoLiveDescription').textContent=description.value.trim()||'Add a descriptive, accurate summary of this product.';
   const duplicate=allProducts.some(p=>Number(p.id)!==id&&p.visibility==='visible'&&trim(p.seo_title).toLocaleLowerCase()===title.value.trim().toLocaleLowerCase()&&title.value.trim());
   modal.querySelector('#seoDuplicateWarning').textContent=duplicate?'Another public product already uses this SEO title. Consider a unique title.':'';
  }
  async function checkAi(){
   aiReady=false;aiButton.disabled=true;aiStatus.textContent='Checking AI provider and store budget…';
   try{
    const status=await api('/api/admin/ai-status');
    if(!modal.isConnected)return;
    aiReady=status.enabled===true;aiButton.disabled=!aiReady;
    aiStatus.textContent=aiReady?'AI is ready. Click Generate with AI to draft metadata.':'AI currently unavailable: '+(Array.isArray(status.reasons)&&status.reasons.length?status.reasons.join('; '):'Check the server AI switch and remaining budget.')+'. Manual SEO editing remains available.';
   }catch(error){
    if(!modal.isConnected)return;
    aiStatus.textContent='Cannot check AI right now: '+error.message+'. Manual SEO saving remains available.';
   }
  }
  modal.addEventListener('close',()=>{modal.remove();if(activeEditor===modal)activeEditor=null;});
  modal.querySelectorAll('[data-seo-close]').forEach(button=>button.addEventListener('click',()=>{if(saving)return;modal.close();}));
  modal.querySelector('[data-seo-ai-check]').addEventListener('click',checkAi);
  form.addEventListener('input',updatePreview);
  aiButton.addEventListener('click',async()=>{
   if(!aiReady||saving)return;
   if((title.value!==initialTitle||description.value!==initialDescription)&&!confirm('Replace unsaved title and description with the new AI draft?'))return;
   aiButton.disabled=true;aiStatus.textContent='Generating a draft from saved catalogue facts…';
   try{
    const response=await api('/api/admin/ai',{method:'POST',body:{task:'seo_meta',context:{product_id:id}}});
    const draft=response.structured;
    if(!draft||typeof draft.seo_title!=='string'||typeof draft.seo_description!=='string')throw Error('AI returned no valid SEO fields.');
    const checked=validateSeoPatch({...fieldValue(),seo_title:draft.seo_title,seo_description:draft.seo_description});
    title.value=checked.seo_title;description.value=checked.seo_description;updatePreview();
    aiStatus.textContent='AI draft ready ('+(response.model||'Workers AI')+'). Review text and click Save SEO changes. Nothing has been saved yet.';
   }catch(error){aiStatus.textContent='AI draft failed: '+error.message+'. Your saved SEO data is unchanged.';}
   finally{if(modal.isConnected)aiButton.disabled=!aiReady;}
  });
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(saving)return;
   let patch;try{patch=validateSeoPatch(fieldValue());}catch(error){saveStatus.textContent=error.message;return;}
   saving=true;saveButton.disabled=true;aiButton.disabled=true;saveStatus.textContent='Saving metadata through the authenticated admin API…';
   try{
    await api('/api/admin/products/'+encodeURIComponent(id),{method:'PATCH',body:patch});
    await load();
    const readback=allProducts.find(p=>Number(p.id)===id);
    if(!readback||Object.entries(patch).some(([key,value])=>trim(readback[key])!==value))
     throw Error('Save response received, but metadata readback could not be verified. Refresh before retrying.');
    saveStatus.textContent='SEO saved and verified.';
    toast('SEO changes saved and verified for '+product.name);
    modal.close();
   }catch(error){saveStatus.textContent='SEO save not confirmed: '+error.message;}
   finally{saving=false;saveButton.disabled=false;aiButton.disabled=!aiReady;}
  });
  updatePreview();
  if(typeof modal.showModal==='function')modal.showModal();else modal.setAttribute('open','');
  title.focus();
  void checkAi();
 }
 host.onchange=e=>{if(e.target?.id==='seoCenterFilter'){filter=e.target.value;render();}};
 host.oninput=e=>{if(e.target?.id==='seoCenterSearch'){const pos=e.target.selectionStart;query=e.target.value.toLocaleLowerCase().trim();render();const input=host.querySelector('#seoCenterSearch');input?.focus();if(pos!=null)input?.setSelectionRange(pos,pos);}};
 host.onclick=async e=>{
  const edit=e.target.closest?.('[data-seo-edit]');
  if(edit){try{openEditor(Number(edit.dataset.seoEdit));}catch(err){toast(err.message);}return;}
  const button=e.target.closest?.('[data-seo-action]');
  if(!button)return;
  if(button.dataset.seoAction==='pages'){openPages();return;}
  if(button.dataset.seoAction==='export'){
   if(!audit){toast('Audit unavailable');return;}
   const blob=new Blob([seoCsv(filtered())],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='chaskabox-public-seo-audit.csv';document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);return;
  }
  if(button.dataset.seoAction==='reload'){button.disabled=true;try{await load();}catch(err){host.innerHTML='<p role="alert">'+esc(err.message)+'</p>'+nav;toast(err.message);}}
 };
 host.innerHTML='<p role="status">Loading protected public catalogue…</p>';
 try{await load();}catch(err){host.innerHTML='<p role="alert">'+esc(err.message)+'</p>'+nav;throw err;}
}
