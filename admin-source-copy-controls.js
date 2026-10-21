/* Admin-only, opt-in editorial review of source-backed product descriptions.
 * Does not call write APIs. The existing authenticated Save product button owns persistence.
 */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  function init(){
    const editor=$('productEditor'),apply=$('loadSourceCopyBtn');
    if(!editor||!apply)return;
    const catalog=window.ChaskaSourceBackedCopy||{};
    const normalize=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
    function currentDraft(){
      const id=String(Number($('editProductId')?.value||0));
      const draft=catalog[id];
      if(!draft || normalize(draft.name)!==normalize($('editName')?.value))return null;
      return draft;
    }
    function sync(){
      const match=currentDraft();
      apply.hidden=!match;
      const preview=$('sourceCopyPreview');
      if(preview)preview.hidden=!match;
      if(!match)return;
      $('sourceCopyText').textContent=match.description;
      const reviewNote=$('sourceCopyReviewNote');
      if(reviewNote){reviewNote.hidden=!match.source_note;reviewNote.textContent=match.source_note?'Source check: '+match.source_note:'';}
      const link=$('sourceCopyLink');
      if(/^https:\/\//.test(match.source)){
        link.href=match.source;
        link.textContent=match.source.includes('hilalfoods.com.pk')||match.source.includes('mayfair')?"View manufacturer product information ↗":"View retailer product information ↗";
      }else{link.removeAttribute('href');link.textContent='Source not available';}
    }
    apply.addEventListener('click',()=>{
      const draft=currentDraft();
      if(!draft)return;
      const message='Apply this researched DESCRIPTION and SEO draft to the editor? This replaces unsaved description and SEO fields. Review against the exact product pack before saving. Nothing is published until you press Save product.';
      if(!window.confirm(message))return;
      $('editDescription').value=draft.description;
      $('editSeoTitle').value=draft.seo_title;
      $('editSeoDesc').value=draft.seo_description;
      for(const name of ['editDescription','editSeoTitle','editSeoDesc']){
        $(name).dispatchEvent(new Event('input',{bubbles:true}));
      }
      apply.textContent='✦ Draft inserted (not saved)';
      apply.focus();
    });
    const obs=new MutationObserver(()=>{
      if(editor.classList.contains('open')){apply.textContent='✦ Review researched draft';sync();}
    });
    obs.observe(editor,{attributes:true,attributeFilter:['class']});
    $('editName')?.addEventListener('input',sync);
    sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
