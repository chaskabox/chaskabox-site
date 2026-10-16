/* V4 progressive controls: local-only density + authenticated navigation launcher.
 * No API calls, order access, delivery writes or permission bypass. */
(() => {
  const setup = () => {
    const shell=document.querySelector('.admin-shell');
    const trigger=document.getElementById('adminCommandOpen');
    const density=document.getElementById('adminDensityToggle');
    if(!shell||!trigger||!density)return;
    const demo=shell.classList.contains('demo-admin-shell');
    const isUnlocked=()=>demo||document.querySelector('#securityNotice')?.classList.contains('live')===true;
    const allowed=()=>[...shell.querySelectorAll('.admin-nav-btn[data-view]')].filter(b=>
      !b.hidden&&b.style.display!=='none'&&b.getAttribute('aria-hidden')!=='true');
    const storageKey='chaskabox-admin-v4-density';
    let compact=false;
    try{compact=window.localStorage.getItem(storageKey)==='compact';}catch{}
    const showDensity=()=>{
      shell.classList.toggle('admin-density-compact',compact);
      density.setAttribute('aria-pressed',String(compact));
      density.setAttribute('aria-label',compact?'Compact layout on. Switch to comfortable layout':'Compact layout off. Switch to compact layout');
      density.textContent=compact?'☰ Compact: On':'☰ Compact: Off';
    };
    showDensity();
    density.addEventListener('click',()=>{
      if(!isUnlocked())return;
      compact=!compact;showDensity();
      try{window.localStorage.setItem(storageKey,compact?'compact':'comfortable');}catch{}
    });

    const dialog=document.createElement('dialog');
    dialog.id='adminCommandDialog';
    dialog.className='admin-command-dialog';
    dialog.setAttribute('aria-labelledby','adminCommandTitle');
    const layout=document.createElement('div');layout.className='admin-command-inner';
    const title=document.createElement('h2');title.id='adminCommandTitle';title.textContent='Go to an admin panel';
    const hint=document.createElement('p');hint.textContent='Search the panels you are permitted to open. No actions are executed by searching.';
    const label=document.createElement('label');label.setAttribute('for','adminCommandSearch');label.textContent='Search panels';
    const input=document.createElement('input');
    input.id='adminCommandSearch';input.type='search';input.autocomplete='off';input.placeholder='Try Orders, Products, System Health…';
    const list=document.createElement('div');list.id='adminCommandResults';list.className='admin-command-results';
    list.setAttribute('role','group');list.setAttribute('aria-label','Matching admin panels');
    const status=document.createElement('p');status.id='adminCommandStatus';status.className='admin-command-status';
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const close=document.createElement('button');close.type='button';close.className='admin-command-close';close.textContent='Close  Esc';
    close.addEventListener('click',()=>dialog.close());
    layout.append(title,hint,label,input,list,status,close);dialog.append(layout);
    document.body.append(dialog);

    const groupName=b=>b.closest('.admin-nav-group')?.querySelector('summary span')?.textContent?.trim()||'Admin';
    const render=()=>{
      const query=input.value.trim().toLocaleLowerCase();
      list.replaceChildren();
      const matching=allowed().filter(b=>{
        const words=(b.textContent+' '+groupName(b)+' '+b.dataset.view).toLocaleLowerCase();
        return !query||words.includes(query);
      });
      matching.forEach(b=>{
        const action=document.createElement('button');
        action.type='button';action.className='admin-command-result';
        const name=document.createElement('strong');name.textContent=b.textContent.trim().replace(/\s+/g,' ');
        const group=document.createElement('small');group.textContent=groupName(b);
        action.append(name,group);
        action.addEventListener('click',()=>{dialog.close();b.closest('.admin-nav-group').open=true;b.click();});
        list.append(action);
      });
      status.textContent=matching.length?matching.length+' matching panels':'No matching accessible panels';
      return matching.length;
    };
    const open=()=>{
      if(!isUnlocked()||typeof dialog.showModal!=='function')return;
      input.value='';render();dialog.showModal();input.focus();
    };
    trigger.addEventListener('click',open);
    input.addEventListener('input',render);
    input.addEventListener('keydown',e=>{
      if(e.key==='ArrowDown'){e.preventDefault();list.querySelector('button')?.focus();}
      if(e.key==='Enter'){const first=list.querySelector('button');if(first){e.preventDefault();first.click();}}
    });
    list.addEventListener('keydown',e=>{
      if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
      e.preventDefault();
      const buttons=[...list.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);
      const next=e.key==='ArrowDown'?Math.min(buttons.length-1,i+1):i<=0?-1:i-1;
      if(next<0)input.focus();else buttons[next]?.focus();
    });
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
    dialog.addEventListener('close',()=>{if(isUnlocked())trigger.focus();});
    document.addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLocaleLowerCase()==='k'){
        if(!isUnlocked())return;
        e.preventDefault();if(!dialog.open)open();else input.focus();
      }
    });
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',setup):setup();
})();
