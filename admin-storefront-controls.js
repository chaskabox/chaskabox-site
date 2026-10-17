/* Storefront Control Center: navigation to existing protected editors and public-page previews.
   No API calls, writes, auto-publishing or message delivery. */
(()=>{
const setup=()=>{
  const center=document.querySelector('.storefront-control-center'),shell=document.querySelector('.admin-shell');
  if(!center||!shell)return;
  const status=center.querySelector('#storefrontControlStatus');
  const isDemo=shell.classList.contains('demo-admin-shell');
  const authorized=()=>isDemo||document.getElementById('securityNotice')?.classList.contains('live')===true;
  center.querySelectorAll('[data-storefront-editor]').forEach(button=>button.addEventListener('click',()=>{
    if(!authorized()){status.textContent='Sign in and complete staff verification to use the live editors.';return;}
    const name=button.dataset.storefrontEditor;
    const target=[...shell.querySelectorAll('.admin-nav-btn[data-view]')].find(el=>el.dataset.view===name);
    if(!target||target.hidden||target.style.display==='none'||target.getAttribute('aria-hidden')==='true'){
      status.textContent='This editor is not available to your current staff role.';return;
    }
    const group=target.closest('details.admin-nav-group');
    if(group)group.open=true;
    target.click();
    status.textContent='Opened '+button.querySelector('strong')?.textContent+'. Saving and publishing remain separate.';
  }));
  center.querySelectorAll('[data-storefront-route]').forEach(button=>button.addEventListener('click',()=>{
    if(!authorized()){status.textContent='Sign in to inspect storefront pages in the Admin preview.';return;}
    const path=button.dataset.storefrontRoute;
    if(!/^\/[a-z0-9/._-]*$/.test(path)){status.textContent='Invalid local preview route.';return;}
    const picker=document.getElementById('previewRoute');
    if(picker){
      if(![...picker.options].some(o=>o.value===path)){
        const option=document.createElement('option');option.value=path;option.textContent=button.textContent;picker.append(option);
      }
      picker.value=path;
      picker.dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('refreshPreview')?.click();
      status.textContent='Previewing '+button.textContent+'. This does not alter the storefront.';
    }else{
      const view=document.getElementById('view-preview');
      let frame=document.getElementById('demoStorefrontRouteFrame');
      if(!frame&&view){
        frame=document.createElement('iframe');frame.id='demoStorefrontRouteFrame';
        frame.title='Public customer journey page';frame.loading='lazy';
        frame.style.cssText='width:min(100%,850px);height:650px;border:1px solid #dce3ed;border-radius:12px;background:#fff;display:block;margin-top:16px';
        center.append(frame);
      }
      if(frame){frame.src=path;status.textContent='Previewing public route '+path+' in a read-only iframe.';}
    }
  }));
};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',setup):setup();
})();
