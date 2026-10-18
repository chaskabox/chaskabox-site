export async function mountPageEditor(view,{api,toast,canPublish}){
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const signature=value=>JSON.stringify(value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,signature(value[k])])):value);
 const list=await api('/api/admin/pages');let current=null,definition=null,sequence=0,selectedField=null;
 view.innerHTML=`<section class="panel"><div class="panel-head"><div><h2>Pages &amp; Text</h2><p>Save a draft, review the preview, then publish. Product facts, prices, navigation and delivery rules use their dedicated panels.</p></div></div><label>Page<select id="pageCopySelect">${list.pages.map(p=>`<option value="${esc(p.key)}">${esc(p.name)} · ${p.fields} text fields${p.has_draft?' · draft':''}</option>`).join('')}</select></label><div id="pageCopyEditor" aria-live="polite"></div></section>`;
 const host=view.querySelector('#pageCopyEditor'),select=view.querySelector('#pageCopySelect');
 const read=()=>{
  const value={fields:{}};
  for(const el of host.querySelectorAll('[data-copy-field]'))if(el.value!==definition.fields[el.dataset.copyField].text)value.fields[el.dataset.copyField]=el.value;
  for(const name of ['seo_title','seo_description']){const el=host.querySelector('[data-copy-meta="'+name+'"]');if(el?.value.trim())value[name]=el.value.trim();}
  return value;
 };
 function render(){
  const draft=current.draft||current.published||{fields:{}},fields=draft.fields||{};
  host.innerHTML=`<p class="safe-note">Revision ${current.revision} · ${current.draft?'Unpublished draft available':'Published copy'} · ${Object.keys(current.published?.fields||{}).length} published text overrides. ${definition.seo_editable?'SEO changes reach server HTML and social metadata.':'Catalogue SEO is edited on the product/brand; utility pages keep their noindex setting.'}</p>
   ${definition.seo_editable?`<div class="admin-grid two"><label>SEO title (blank uses default)<input data-copy-meta="seo_title" maxlength="70" value="${esc(draft.seo_title||'')}" placeholder="${esc(definition.title)}"></label><label>Meta description (blank uses default)<textarea data-copy-meta="seo_description" maxlength="170" rows="3" placeholder="${esc(definition.description)}">${esc(draft.seo_description||'')}</textarea></label></div>`:''}
   <div class="action-row"><button class="btn primary" id="pageCopySave">Save draft</button><button class="btn secondary" id="pageCopyPreview">Preview changes</button>${canPublish?`<button class="btn primary" id="pageCopyPublish" ${current.draft?'':'disabled'}>Publish saved draft</button>`:''}<button class="btn secondary" id="pageCopyReload">Reload</button></div>
   <p id="pageCopyStatus" role="status"></p><label>Find text<input id="pageCopySearch" type="search" placeholder="Search the original or edited text"></label>
   <div class="action-row"><button class="btn secondary" id="pageCopyAI">AI rewrite selected text</button><button class="btn secondary" id="pageCopyReset">Reset selected text to default</button></div><p class="safe-note">Select a text field below. AI suggestions stay in this editor until you save and publish. Header/footer links, contact details, fees and payment rules remain controlled by Navigation, Theme and Store Settings.</p>
   <div id="pageCopyFields">${Object.entries(definition.fields).map(([key,f],i)=>`<label data-copy-row><small>${i+1}. Default: ${esc(f.text.slice(0,160))}</small><textarea rows="${f.text.length>100?3:2}" maxlength="3000" data-copy-field="${key}">${esc(fields[key]??f.text)}</textarea></label>`).join('')}</div>
   <details><summary>Published version history (${current.versions?.length||0} recent)</summary>${(current.versions||[]).map(v=>`<div class="safe-note">Version ${v.id} · ${esc(new Date(v.created_at).toLocaleString())}${canPublish?` <button class="btn secondary compact" data-page-restore="${v.id}">Review restore</button>`:''}</div>`).join('')||'<p>No publications yet.</p>'}</details>`;
  host.querySelectorAll('[data-copy-field]').forEach(el=>el.addEventListener('focus',()=>{selectedField=el;}));
  host.querySelector('#pageCopySearch').oninput=e=>{const q=e.target.value.toLowerCase();for(const row of host.querySelectorAll('[data-copy-row]'))row.hidden=!row.textContent.toLowerCase().includes(q)&&!row.querySelector('textarea').value.toLowerCase().includes(q);};
  host.querySelector('#pageCopyReload').onclick=()=>load(select.value);
  host.querySelector('#pageCopySave').onclick=()=>mutate('draft',{content:read()});
  host.querySelector('#pageCopyPublish')?.addEventListener('click',()=>{
   if(signature(read())!==signature(current.draft))return toast('Save your latest edits as a draft before publishing.');
   preview(current.draft,()=>mutate('publish'));
  });
  host.querySelector('#pageCopyPreview').onclick=()=>preview(read());
  host.querySelector('#pageCopyReset').onclick=()=>{if(!selectedField?.isConnected)return toast('Select a text field first.');selectedField.value=definition.fields[selectedField.dataset.copyField].text;};
  host.querySelector('#pageCopyAI').onclick=async()=>{
   if(!selectedField?.isConnected)return toast('Select a text field first.');
   if(selectedField.value.length>1500)return toast('AI rewrite supports up to 1,500 characters. Edit this longer field manually.');
   const target=selectedField,button=host.querySelector('#pageCopyAI');button.disabled=true;
   try{const result=await api('/api/admin/ai',{method:'POST',body:{task:'page_rewrite',context:{text:target.value}}});
    const dialog=document.createElement('dialog');dialog.className='panel';dialog.innerHTML='<h3>Review AI suggestion</h3><textarea rows="8" maxlength="3000" aria-label="AI text suggestion"></textarea><div class="action-row"><button class="btn primary" data-use>Use in draft editor</button><button class="btn secondary" data-close>Close</button></div>';
    dialog.querySelector('textarea').value=result.draft;dialog.querySelector('[data-use]').onclick=()=>{target.value=dialog.querySelector('textarea').value;dialog.close();dialog.remove();toast('Suggestion added to editor. Save and preview before publishing.');};dialog.querySelector('[data-close]').onclick=()=>{dialog.close();dialog.remove();};view.append(dialog);dialog.showModal();
   }catch(e){toast(e.message);}finally{button.disabled=false;}
  };
  host.querySelectorAll('[data-page-restore]').forEach(button=>button.onclick=()=>{const version=current.versions.find(v=>v.id===Number(button.dataset.pageRestore));preview(version.before_content,()=>mutate('rollback',{version_id:version.id}));});
 }
 function preview(content,approve){
  const dialog=document.createElement('dialog');dialog.className='panel';dialog.style.cssText='width:min(850px,92vw);max-height:85vh;overflow:auto';
  dialog.innerHTML=`<h3>${approve?'Review publication':'Draft preview'}</h3><p>Only the listed overrides change. Default text is used for other fields.</p>${content.seo_title?'<p><b>SEO title:</b> '+esc(content.seo_title)+'</p>':''}${content.seo_description?'<p><b>Description:</b> '+esc(content.seo_description)+'</p>':''}${Object.entries(content.fields||{}).map(([key,value])=>'<article class="safe-note"><small>'+esc(definition.fields[key]?.text||key)+'</small><p>'+esc(value)+'</p></article>').join('')||'<p>No text overrides. Template defaults will be used.</p>'}<div class="action-row">${approve?'<button class="btn primary" data-approve>Confirm publish</button>':''}<button class="btn secondary" data-close>Close preview</button></div>`;
  dialog.querySelector('[data-close]').onclick=()=>{dialog.close();dialog.remove();};dialog.querySelector('[data-approve]')?.addEventListener('click',()=>{dialog.close();dialog.remove();approve();});view.append(dialog);dialog.showModal();
 }
 async function mutate(action,extra={}){
  const buttons=[...host.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  try{await api('/api/admin/pages',{method:'POST',body:{key:select.value,action,expected_revision:current.revision,...extra}});await load(select.value);toast(action==='draft'?'Draft saved and read back from database':action==='rollback'?'Previous copy restored and verified':'Page published and verified. Reload the public page to see it.');}
  catch(e){toast(e.message);buttons.forEach(b=>b.disabled=false);}
 }
 async function load(key){const id=++sequence;host.setAttribute('aria-busy','true');try{const result=await api('/api/admin/pages?key='+encodeURIComponent(key));if(id!==sequence)return;current=result.page;definition=result.definition;selectedField=null;render();}catch(e){toast(e.message);}finally{if(id===sequence)host.removeAttribute('aria-busy');}}
 select.onchange=()=>load(select.value);await load(select.value);
}
