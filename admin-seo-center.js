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
export async function mountSeoCenter(host,{api,toast,openProduct,openPages,canPublish=false}){
 if(!host)throw Error('SEO panel missing');
 let audit=null,filter='all',query='';
 const filters=[['all','All public products'],['missing_title','Missing title'],['missing_description','Missing description'],['missing_image','Missing image'],['long_title','Long title (>65)'],['long_description','Long description (>160)'],['duplicate_title','Duplicate title'],['social_fallback','OG photo fallback'],['missing_brand','Unspecified brand']];
 const nav='<div class="seo-actions"><button type="button" class="btn secondary" data-seo-action="reload">Refresh</button><button type="button" class="btn secondary" data-seo-action="export">Download CSV</button><button type="button" class="btn secondary" data-seo-action="pages">Pages: Save / Preview / History</button></div>';
 const filtered=()=>audit.entries.filter(p=>(filter==='all'||p.flags.includes(filter))&&(!query||[p.name,p.title,p.category,String(p.id)].join(' ').toLocaleLowerCase().includes(query)));
 const render=()=>{
  const matched=filtered();
  const stats=[['Public products',audit.visible],['Missing titles',audit.missingTitle],['Missing descriptions',audit.missingDescription],['Long titles',audit.longTitle],['Duplicate titles',audit.duplicateTitle],['OG photo fallback',audit.socialFallback]];
  host.innerHTML='<p class="seo-note">Authorized read-only audit of current public products. A blank optional social image can fall back to the product photo; title length is an editorial cue, not a search rank. Products are saved using the audited product editor. Page drafts, preview, owner/manager publishing and version history are in Pages &amp; Text.</p>'+nav+
  '<div class="seo-metrics">'+stats.map(x=>'<div class="seo-metric"><strong>'+x[1]+'</strong>'+esc(x[0])+'</div>').join('')+'</div>'+
  '<div class="seo-toolbar"><label>Review filter<select id="seoCenterFilter">'+filters.map(x=>'<option value="'+x[0]+'"'+(filter===x[0]?' selected':'')+'>'+esc(x[1])+'</option>').join('')+'</select></label><label>Search public products<input id="seoCenterSearch" type="search" value="'+esc(query)+'" placeholder="Name, ID, category, title"></label></div>'+
  '<p role="status" aria-live="polite">Showing '+matched.length+' of '+audit.visible+' public products. '+(canPublish?'Page publishing permission: owner/manager.':'Page publishing requires owner/manager.')+'</p>'+
  '<div class="seo-table-wrap"><table><thead><tr><th>Product / Search Preview</th><th>SEO review</th><th>Actions</th></tr></thead><tbody>'+
  matched.map(p=>'<tr><td><b>'+esc(p.name)+'</b><div class="seo-preview"><strong>'+esc(p.title)+'</strong><span>chaskabox.online/product/'+p.id+'/</span><p>'+esc(p.description).slice(0,600)+'</p></div></td><td>'+esc(p.flags.filter(x=>x!=='social_fallback').join(', ')||'No critical flags')+(p.flags.includes('social_fallback')?'<small> · image fallback</small>':'')+'</td><td><div class="seo-actions"><button type="button" class="btn secondary compact" data-seo-edit="'+p.id+'">Edit product SEO</button><a href="/product/'+p.id+'/" target="_blank" rel="noopener noreferrer">Open live page</a></div></td></tr>').join('')+
  '</tbody></table></div><p class="seo-note">Search Console and actual Core Web Vitals field performance are not part of catalogue counts. <a href="https://search.google.com/search-console/" target="_blank" rel="noopener noreferrer">Search Console</a> · <a href="https://pagespeed.web.dev/" target="_blank" rel="noopener noreferrer">PageSpeed Insights</a>.</p>';
 };
 const load=async()=>{
  const all=[];
  for(let page=1;page<=10;page++){
   const data=await api('/api/admin/products?per_page=1000&page='+page);
   if(!Array.isArray(data.products))throw Error('Protected SEO products response unavailable');
   all.push(...data.products);
   if(page>=Number(data.total_pages||1)){audit=auditPublicProducts(all);render();return;}
  }
  throw Error('Catalogue exceeds ten pages; full report unavailable');
 };
 host.onchange=e=>{if(e.target?.id==='seoCenterFilter'){filter=e.target.value;render();}};
 host.oninput=e=>{if(e.target?.id==='seoCenterSearch'){const pos=e.target.selectionStart;query=e.target.value.toLocaleLowerCase().trim();render();const input=host.querySelector('#seoCenterSearch');input?.focus();if(pos!=null)input?.setSelectionRange(pos,pos);}};
 host.onclick=async e=>{
  const edit=e.target.closest?.('[data-seo-edit]');
  if(edit){try{await openProduct(Number(edit.dataset.seoEdit));}catch(err){toast(err.message);}return;}
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
