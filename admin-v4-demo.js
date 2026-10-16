/* Client-only synthetic design preview; deliberately no fetch, credentials or writes. */
(() => {
  const root = document.querySelector('.demo-admin-shell');
  if (!root) return;
  const one = selector => root.querySelector(selector);
  const all = selector => [...root.querySelectorAll(selector)];
  const sidebar = one('#adminSidebar'), backdrop = one('#sidebarBackdrop');
  const toggle = one('#sidebarToggle'), search = one('#adminNavSearch');
  const closeDrawer = () => {
    sidebar?.classList.remove('open'); backdrop?.classList.remove('show');
    toggle?.setAttribute('aria-expanded','false');
  };
  const selectView = name => {
    if (!one('#view-'+name)) return;
    if (search?.value) { search.value = ''; filterNav(); }
    all('.admin-view').forEach(v => v.classList.toggle('active',v.id==='view-'+name));
    all('.admin-nav-btn').forEach(b => {
      const active = b.dataset.view===name;
      b.classList.toggle('active',active);
      if (active) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
    });
    const activeButton = all('.admin-nav-btn').find(b=>b.dataset.view===name);
    const group = activeButton?.closest('.admin-nav-group');
    if (group) group.open = true;
    const panel = one('#view-'+name);
    one('#viewTitle').textContent = panel.dataset.title || name;
    one('#viewSubtitle').textContent = panel.dataset.subtitle || '';
    closeDrawer();
    window.scrollTo({top:0,behavior:'instant'});
  };
  const filterNav = () => {
    const query = (search?.value||'').trim().toLocaleLowerCase();
    let found = 0;
    all('.admin-nav-group').forEach(group => {
      let matched = 0;
      all('.admin-nav-btn',group).forEach(b => {
        const display = !query || b.textContent.toLocaleLowerCase().includes(query);
        b.classList.toggle('nav-search-miss',!display);
        if (display) {found++;matched++;}
      });
      group.classList.toggle('nav-no-results',!!query&&!matched);
      if (query&&matched) group.open = true;
    });
    const empty = one('#adminNavEmpty');
    if (empty) empty.hidden = !query || found>0;
  };
  all('.admin-nav-btn').forEach(b=>b.addEventListener('click',()=>selectView(b.dataset.view)));
  all('[data-jump]').forEach(b=>b.addEventListener('click',()=>selectView(b.dataset.jump)));
  search?.addEventListener('input',filterNav);
  toggle?.addEventListener('click',()=>{
    const open=sidebar?.classList.toggle('open');
    backdrop?.classList.toggle('show',!!open);
    toggle?.setAttribute('aria-expanded',String(!!open));
  });
  backdrop?.addEventListener('click',closeDrawer);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && sidebar?.classList.contains('open'))closeDrawer();
  });
  // Purely synthetic demos of protected-list controls. No provider requests.
  const orderChoices=all('[data-demo-order-view]'),orderRows=all('.demo-order-row');
  orderChoices.forEach(b=>b.addEventListener('click',()=>{
    const preset=b.dataset.demoOrderView;
    orderChoices.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    let count=0;
    orderRows.forEach(row=>{
      const show=preset==='all'||(preset==='payment_submitted'?row.dataset.demoPayment==='payment_submitted':row.dataset.demoFulfilment===preset);
      row.hidden=!show;if(show)count++;
    });
    const status=one('#demoOrderResult');
    if(status)status.textContent=count+' matching synthetic example '+(count===1?'order':'orders');
  }));
  const sampleCards=all('.demo-product-row'),sampleList=one('#demoProductsList'),quality=one('#demoProductQuality'),sort=one('#demoProductSort');
  const updateSampleProducts=()=>{
    if(!sampleList)return;
    const filter=quality?.value||'',order=sort?.value||'name_asc';
    const rows=sampleCards.filter(row=>{
      return filter==='missing_image'?row.dataset.demoImage==='no':filter==='missing_seo'?row.dataset.demoSeo==='no':true;
    });
    const name=(a,b)=>a.dataset.demoName.localeCompare(b.dataset.demoName,'en',{sensitivity:'base'});
    const price=(a,b)=>Number(a.dataset.demoPrice)-Number(b.dataset.demoPrice);
    rows.sort((a,b)=>order==='name_desc'?name(b,a):order==='price_asc'?price(a,b):order==='price_desc'?price(b,a):name(a,b));
    sampleCards.forEach(row=>{row.hidden=!rows.includes(row)});
    rows.forEach(row=>sampleList.append(row));
    const status=one('#demoProductResult');if(status)status.textContent=rows.length+' of '+sampleCards.length+' synthetic products displayed';
  };
  quality?.addEventListener('change',updateSampleProducts);
  sort?.addEventListener('change',updateSampleProducts);
  one('#demoProductReset')?.addEventListener('click',()=>{
    if(quality)quality.value='';if(sort)sort.value='name_asc';updateSampleProducts();
  });
  updateSampleProducts();
  const first = one('.admin-nav-btn.active');
  if (first) first.setAttribute('aria-current','page');
})();