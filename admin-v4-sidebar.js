/* ChaskaBox Admin V4 sidebar: local UI only; never reads protected records or calls an API. */
(()=>{
  const ready=()=>{
    const shell=document.querySelector('.admin-shell');
    const sidebar=document.getElementById('adminSidebar');
    const nav=document.getElementById('adminNavGroups');
    const collapse=document.getElementById('adminSidebarCollapse');
    const restore=document.getElementById('adminSidebarRestore');
    const toggle=document.getElementById('sidebarToggle');
    const pin=document.getElementById('adminPinCurrent');
    const pins=document.getElementById('adminPinnedLinks');
    const count=document.getElementById('adminPinnedCount');
    if(!shell||!sidebar||!nav||!collapse||!restore||!toggle||!pin||!pins||!count)return;
    const demo=shell.classList.contains('demo-admin-shell');
    const verified=()=>demo||document.getElementById('securityNotice')?.classList.contains('live')===true;
    const mobile=()=>window.matchMedia('(max-width: 900px)').matches;
    const allowed=b=>!!b&&!b.hidden&&b.style.display!=='none'&&b.getAttribute('aria-hidden')!=='true';
    const select=view=>[...nav.querySelectorAll('.admin-nav-btn[data-view]')].find(b=>b.dataset.view===view);
    const prefKey='chaskabox-admin-v4-sidebar-focus';
    const pinsKey='chaskabox-admin-v4-pins-v1';
    const parse=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
    const persist=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
    let favoriteIds=parse(pinsKey,[]);
    if(!Array.isArray(favoriteIds))favoriteIds=[];
    favoriteIds=[...new Set(favoriteIds.filter(x=>typeof x==='string'))].slice(0,6);
    const active=()=>nav.querySelector('.admin-nav-btn[aria-current="page"]')||nav.querySelector('.admin-nav-btn.active');
    const current=()=>active()?.dataset.view;
    const buttonName=b=>b?b.textContent.replace(/\s*[—\d]+\s*$/,'').trim().replace(/\s+/g,' '):'';
    const updatePin=()=>{
      const id=current(),can=verified()&&allowed(select(id));
      const pinned=can&&favoriteIds.includes(id);
      pin.disabled=!can;
      pin.setAttribute('aria-pressed',String(Boolean(pinned)));
      pin.textContent=pinned?'★ Pinned':'☆ Pin panel';
      pin.setAttribute('aria-label',pinned?'Unpin current panel':'Pin current panel to quick access');
    };
    const renderPins=()=>{
      pins.replaceChildren();
      count.textContent=favoriteIds.length+' / 6';
      let rendered=0;
      if(verified())favoriteIds.forEach(id=>{
        const b=select(id);
        if(!allowed(b))return;
        const label=buttonName(b);
        const row=document.createElement('div');row.className='admin-pinned-item';
        const jump=document.createElement('button');jump.type='button';jump.className='admin-pinned-jump';
        jump.textContent=label;jump.title='Open '+label;
        if(b.classList.contains('active'))jump.setAttribute('aria-current','page');
        jump.addEventListener('click',()=>{if(verified()&&allowed(b)){b.closest('details').open=true;b.click();}});
        const remove=document.createElement('button');remove.type='button';remove.className='admin-pinned-remove';
        remove.textContent='×';remove.setAttribute('aria-label','Unpin '+label);
        remove.addEventListener('click',()=>{favoriteIds=favoriteIds.filter(x=>x!==id);persist(pinsKey,favoriteIds);renderPins();updatePin();});
        row.append(jump,remove);pins.append(row);rendered++;
      });
      if(!rendered){
        const empty=document.createElement('p');empty.className='admin-pinned-empty';
        empty.textContent=verified()?'Open a panel and select “Pin panel” to keep it here.':'Shortcuts available after verified sign-in.';
        pins.append(empty);
      }
      updatePin();
    };
    pin.addEventListener('click',()=>{
      const id=current();if(!verified()||!allowed(select(id)))return;
      if(favoriteIds.includes(id))favoriteIds=favoriteIds.filter(x=>x!==id);
      else if(favoriteIds.length<6)favoriteIds.push(id);
      else {count.textContent='Limit: 6 pinned panels';return;}
      persist(pinsKey,favoriteIds);renderPins();
    });
    const groups=[...nav.querySelectorAll('details.admin-nav-group')];
    document.getElementById('adminExpandGroups')?.addEventListener('click',()=>groups.forEach(g=>g.open=true));
    document.getElementById('adminCollapseGroups')?.addEventListener('click',()=>groups.forEach(g=>g.open=false));
    const setFocusMode=on=>{
      shell.classList.toggle('admin-sidebar-minimized',Boolean(on));
      collapse.setAttribute('aria-expanded',String(!on));
      restore.setAttribute('aria-expanded',String(!on));
      persist(prefKey,Boolean(on));
    };
    if(parse(prefKey,false)===true)setFocusMode(true);
    collapse.addEventListener('click',()=>{
      if(mobile()){
        sidebar.classList.remove('open');
        document.getElementById('sidebarBackdrop')?.classList.remove('show');
        toggle.setAttribute('aria-expanded','false');
        toggle.setAttribute('aria-label','Open admin navigation');
        toggle.focus();
      }else {setFocusMode(true);restore.focus();}
    });
    restore.addEventListener('click',()=>{setFocusMode(false);collapse.focus();});
    const focusables=()=>[...sidebar.querySelectorAll('button:not([disabled]):not([hidden]),input:not([disabled]),a[href],summary')]
      .filter(el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden');
    // Native disclosure keys remain native; only modal mobile drawer focus is contained.
    document.addEventListener('keydown',event=>{
      if(event.key!=='Tab'||!mobile()||!sidebar.classList.contains('open')||document.querySelector('dialog[open]'))return;
      const els=focusables();if(!els.length)return;
      const first=els[0],last=els.at(-1);
      if(event.shiftKey&&(document.activeElement===first||!sidebar.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!sidebar.contains(document.activeElement))){event.preventDefault();first.focus();}
    });
    toggle.addEventListener('click',()=>{
      if(!mobile())return;
      if(sidebar.classList.contains('open')){
        toggle.setAttribute('aria-label','Close admin navigation');
        const input=document.getElementById('adminNavSearch');
        if(input)input.focus();
      }else toggle.setAttribute('aria-label','Open admin navigation');
    });
    document.getElementById('sidebarBackdrop')?.addEventListener('click',()=>{
      if(mobile())toggle.focus();
      toggle.setAttribute('aria-label','Open admin navigation');
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&mobile()&&sidebar.classList.contains('open')){
        setTimeout(()=>{toggle.setAttribute('aria-label','Open admin navigation');toggle.focus();},0);
      }
    });
    nav.addEventListener('click',event=>{
      if(event.target.closest('.admin-nav-btn')){
        setTimeout(()=>{
          renderPins();
          if(mobile()&&!sidebar.classList.contains('open')){
            document.getElementById('viewTitle')?.setAttribute('tabindex','-1');
            document.getElementById('viewTitle')?.focus({preventScroll:true});
          }
        },0);
      }
    });
    const notice=document.getElementById('securityNotice');
    if(notice)new MutationObserver(()=>renderPins()).observe(notice,{attributes:true,attributeFilter:['class']});
    const timer=setInterval(()=>{if(verified()){renderPins();clearInterval(timer);}},500);
    setTimeout(()=>clearInterval(timer),12000);
    renderPins();
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',ready):ready();
})();
