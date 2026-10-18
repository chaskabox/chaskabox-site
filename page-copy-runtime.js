/* Published public copy only. Numeric quotes and private account/order output are excluded. */
(() => {
 'use strict';
 let config={fields:{}},activePath=location.pathname,sequence=0;
 const originals=new WeakMap();let hasApplied=false;
 try{config=JSON.parse(document.getElementById('published-page-copy')?.textContent||'null')||config;}catch{}
 const key=text=>{let n=2166136261;for(const c of String(text).replace(/\s+/g,' ').trim())n=Math.imul(n^c.codePointAt(0),16777619)>>>0;return 't_'+n.toString(16).padStart(8,'0');};
 function apply(root=document){
  if(!Object.keys(config.fields||{}).length&&!hasApplied)return;
  hasApplied=true;
  const nodes=root.matches?.('[data-cb-copy]')?[root]:[];
  nodes.push(...(root.querySelectorAll?.('[data-cb-copy]')||[]));
  for(const element of nodes){if(!originals.has(element))originals.set(element,config.originals?.[element.dataset.cbCopy]??element.textContent);const value=config.fields[element.dataset.cbCopy]??originals.get(element);if(element.textContent!==value)element.textContent=value;}
  for(const el of root.querySelectorAll?.('[data-cb-placeholder]')||[]){if(!originals.has(el))originals.set(el,config.originals?.[el.dataset.cbPlaceholder]??el.placeholder);el.placeholder=config.fields[el.dataset.cbPlaceholder]??originals.get(el);}
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode())){
   if(node.parentElement?.closest('script,style,textarea,pre,code,svg,[data-cb-copy],[data-private],#view-account,#trackResult,[data-cod-fee-copy],[data-cod-advance-note],[data-prepaid-shipping-copy]'))continue;
   const original=originals.get(node)??node.data,text=original.trim(),value=config.fields[key(text)];
   if(typeof value==='string'&&text){originals.set(node,original);node.data=original.replace(text,value);}else if(originals.has(node))node.data=original;
  }
 }
 function metadata(){
  if(config.seo_title){document.title=config.seo_title;for(const el of document.querySelectorAll('meta[property="og:title"],meta[name="twitter:title"]'))el.content=config.seo_title;}
  if(config.seo_description)for(const el of document.querySelectorAll('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]'))el.content=config.seo_description;
 }
 async function navigate(path){
  const id=++sequence;
  if(path!==activePath){config={fields:{}};apply();try{const response=await fetch('/api/page-copy?path='+encodeURIComponent(path),{cache:'no-store'});if(!response.ok)return;const next=await response.json();if(id!==sequence)return;config=next;activePath=path;}catch{return;}}
  apply();metadata();observe();
 }
 window.ChaskaPageCopy={apply,navigate,text:(text)=>config.fields?.[key(text)]??text};
 // Hydrated components reuse the same registry. Only new subtrees are scanned;
 // text edits do not retrigger this observer and prices are never hash matched.
 let observer=null;
 function observe(){if(Object.keys(config.fields||{}).length&&!observer){observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)apply(node);});observer.observe(document.body,{childList:true,subtree:true});}}
 observe();
 apply();
})();
