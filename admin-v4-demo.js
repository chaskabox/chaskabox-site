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
  const first = one('.admin-nav-btn.active');
  if (first) first.setAttribute('aria-current','page');
})();