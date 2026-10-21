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
      const researched=catalog[id];
      if(researched && normalize(researched.name)===normalize($('editName')?.value))return researched;
      return typeof window.ChaskaDraftFromCatalog==='function' ? window.ChaskaDraftFromCatalog({
        id:Number(id),name:$('editName')?.value,brand:$('editBrand')?.value,pack:$('editPack')?.value,category:$('editCategory')?.value
      }) : null;
    }
    function sync(){
      const match=currentDraft();
      apply.hidden=!match;
      apply.disabled=Boolean(match&&match.review==='block-unverified-bundle');
      if(apply.disabled)apply.textContent='Bundle content verification required';
      const preview=$('sourceCopyPreview');
      if(preview)preview.hidden=!match;
      if(!match)return;
      $('sourceCopyText').textContent=match.description;
      const reviewNote=$('sourceCopyReviewNote');
      if(reviewNote){reviewNote.hidden=!match.source_note;reviewNote.textContent=match.source_note?'Source check: '+match.source_note:'';}
      const link=$('sourceCopyLink');
      if(/^https:\/\//.test(match.source)){
        link.hidden=false;
        link.href=match.source;
        link.textContent=/^https:\/\/(?:www\.)?(?:hilalfoods\.com\.pk|mayfairfood\.com|mayfair\.com\.pk|winnerfoods\.com\.pk|shahi\.pk)\//.test(match.source)?"View manufacturer product information ↗":"View retailer product information ↗";
      }else{link.hidden=true;link.removeAttribute('href');link.textContent='Based on internal catalogue fields';}
    }
    apply.addEventListener('click',()=>{
      const draft=currentDraft();
      if(!draft||draft.review==='block-unverified-bundle')return;
      const message='Insert this UNSAVED product DESCRIPTION and SEO draft? Existing unsaved description and SEO fields will be replaced. Confirm the actual product packaging and its details first. Nothing is published until you explicitly press Save product.';
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
    for(const field of ['editName','editBrand','editPack','editCategory'])$(field)?.addEventListener('input',sync);
    sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
